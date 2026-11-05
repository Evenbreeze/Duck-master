"""节点 enroll / register / 安装脚本下发。"""
from __future__ import annotations

import secrets
import shlex
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import logger, xray
from app.db import crud, get_db
from app.duck_node import (
    allocate_agent_ports,
    allocate_ports_for_protocols,
    apply_duck_node_provision,
    enroll_pending_agent_ports,
    enroll_pending_ports,
    enroll_pending_protocols,
    normalize_protocol_list,
    reload_panel_xray_config,
    remove_node_inbounds_from_config,
    serialize_enroll_pending,
    serialize_proxy_ports,
    sync_node_hosts,
)
from app.models.admin import Admin
from app.models.node import NodeStatus
from app.utils import responses
from config import UVICORN_SSL_CA_TYPE, XRAY_SUBSCRIPTION_URL_PREFIX

from fastapi.responses import FileResponse, PlainTextResponse

router = APIRouter(tags=["Node Enroll"], prefix="/api")

_AGENT = Path(__file__).resolve().parents[2] / "node_agent" / "agent.py"
_BOOTSTRAP = Path(__file__).resolve().parents[2] / "deploy" / "duck-node-bootstrap.sh"

DuckProtocol = Literal["vless", "vmess", "trojan", "ss"]

_PORT_ENV = {
    "vless": "DUCK_PORT_VLESS",
    "vmess": "DUCK_PORT_VMESS",
    "trojan": "DUCK_PORT_TROJAN",
    "ss": "DUCK_PORT_SS",
}


class NodeEnrollCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    protocols: List[DuckProtocol] = Field(default_factory=lambda: ["vless"])
    proxy_ports: Optional[dict[str, int]] = Field(
        None,
        description="主控指定端口；留空则由主控自动分配",
    )


class NodeEnrollResponse(BaseModel):
    node_id: int
    enroll_token: str
    expires_at: int
    install_command: str
    protocols: List[str]
    proxy_ports: dict[str, int]
    service_port: int
    api_port: int


class NodeRegisterRequest(BaseModel):
    token: str
    address: str = Field(min_length=3, max_length=256)
    protocols: Optional[List[DuckProtocol]] = None
    proxy_ports: Optional[dict[str, int]] = None
    service_port: Optional[int] = Field(None, ge=1024, le=65535)
    api_port: Optional[int] = Field(None, ge=1024, le=65535)


class NodeRegisterResponse(BaseModel):
    node_id: int
    name: str
    api_secret: str
    service_port: int
    api_port: int
    proxy_ports: dict[str, int] | None = None
    protocols: List[str]
    message: str


def _panel_base_url() -> str:
    raw = (XRAY_SUBSCRIPTION_URL_PREFIX or "").strip().rstrip("/")
    if not raw:
        return "https://127.0.0.1:8000"
    if "://" not in raw:
        raw = f"https://{raw}"
    return raw.split("/sub")[0].rstrip("/")


def _build_install_command(
    base: str,
    token: str,
    protocols: List[str],
    ports: dict[str, int],
    service_port: int,
    api_port: int,
) -> str:
    proto_csv = ",".join(normalize_protocol_list(protocols))
    env = ["DUCK_PORT_RANDOM=0"]
    for proto in normalize_protocol_list(protocols):
        key = _PORT_ENV.get(proto)
        if key and proto in ports:
            env.append(f"{key}={ports[proto]}")
    env.append(f"DUCK_SERVICE_PORT={service_port}")
    env.append(f"DUCK_API_PORT={api_port}")
    if (UVICORN_SSL_CA_TYPE or "public").lower() == "private":
        env.append("DUCK_INSECURE_MASTER_SSL=1")
    env_str = " ".join(env)
    curl_url = f"{base}/api/node/bootstrap.sh"
    curl_bin = "curl -fsSLk" if (UVICORN_SSL_CA_TYPE or "public").lower() == "private" else "curl -fsSL"
    inner = (
        "export DEBIAN_FRONTEND=noninteractive; "
        "if command -v apt-get >/dev/null; then "
        "apt-get update -qq && apt-get install -y -qq ca-certificates curl jq >/dev/null; "
        "fi; "
        f"{curl_bin} {shlex.quote(curl_url)} | "
        f"bash -s -- {shlex.quote(token)} {shlex.quote(base)} {shlex.quote(proto_csv)}"
    )
    # 整段须 root（systemctl / 写 /opt）；sudo env 注入端口变量
    return f"sudo env {env_str} bash -c {shlex.quote(inner)}"


@router.get("/node/bootstrap.sh")
def download_bootstrap_script():
    if not _BOOTSTRAP.is_file():
        raise HTTPException(404, "bootstrap script missing")
    return FileResponse(_BOOTSTRAP, media_type="text/x-shellscript", filename="bootstrap.sh")


@router.get("/node/agent.py")
def download_agent_py():
    if not _AGENT.is_file():
        raise HTTPException(404, "agent missing")
    return PlainTextResponse(_AGENT.read_text(encoding="utf-8"), media_type="text/plain")


@router.post("/node/enroll", response_model=NodeEnrollResponse, responses={403: responses._403})
def create_node_enroll(
    body: NodeEnrollCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(Admin.check_sudo_admin),
):
    """创建待安装节点：协议与端口由主控决定，节点脚本只执行。"""
    if crud.get_node(db, body.name):
        raise HTTPException(409, f'节点 "{body.name}" 已存在')

    protocols = normalize_protocol_list(body.protocols)
    try:
        ports = allocate_ports_for_protocols(db, protocols, body.proxy_ports)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    service_port, api_port = allocate_agent_ports(db)

    token = secrets.token_urlsafe(32)
    secret = secrets.token_urlsafe(48)
    expires = datetime.utcnow() + timedelta(hours=2)

    from app.db.models import Node

    dbnode = Node(
        name=body.name,
        address="0.0.0.0",
        port=service_port,
        api_port=api_port,
        status=NodeStatus.connecting,
        api_secret=secret,
        enroll_token=token,
        enroll_expires_at=expires,
        proxy_ports=serialize_enroll_pending(
            protocols, ports=ports, service_port=service_port, api_port=api_port
        ),
    )
    db.add(dbnode)
    db.commit()
    db.refresh(dbnode)

    base = _panel_base_url()
    cmd = _build_install_command(base, token, protocols, ports, service_port, api_port)
    return NodeEnrollResponse(
        node_id=dbnode.id,
        enroll_token=token,
        expires_at=int(expires.timestamp()),
        install_command=cmd,
        protocols=protocols,
        proxy_ports=ports,
        service_port=service_port,
        api_port=api_port,
    )


@router.post("/node/register", response_model=NodeRegisterResponse)
def register_node(body: NodeRegisterRequest, db: Session = Depends(get_db)):
    """节点安装脚本：上报 IP，端口以主控 enroll 为准。"""
    dbnode = crud.get_node_by_enroll_token(db, body.token)
    if not dbnode:
        raise HTTPException(404, "无效或已过期的安装令牌")
    if dbnode.enroll_expires_at and dbnode.enroll_expires_at < datetime.utcnow():
        raise HTTPException(410, "安装令牌已过期，请在主控重新生成")

    protocols = normalize_protocol_list(
        body.protocols or enroll_pending_protocols(dbnode)
    )
    master_ports = enroll_pending_ports(dbnode)
    if not master_ports:
        raise HTTPException(400, "主控缺少待安装端口，请重新生成安装命令")

    ports_in = dict(master_ports)
    if body.proxy_ports:
        for proto in protocols:
            if proto in body.proxy_ports and int(body.proxy_ports[proto]) != ports_in.get(proto):
                raise HTTPException(
                    400,
                    f"节点上报端口与主控不一致 ({proto})，请使用面板生成的安装命令",
                )

    sp, ap = enroll_pending_agent_ports(dbnode)
    service_port = int(body.service_port or sp or dbnode.port)
    api_port = int(body.api_port or ap or dbnode.api_port)

    remove_node_inbounds_from_config(dbnode.name)

    try:
        tags_csv, final_ports, reality_json = apply_duck_node_provision(
            dbnode.name, ports=ports_in, protocols=protocols
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    dbnode.address = body.address.strip()
    dbnode.inbound_tags = tags_csv
    dbnode.proxy_ports = serialize_proxy_ports(final_ports)
    dbnode.reality_meta = reality_json
    dbnode.proxy_port = final_ports.get("ss")
    dbnode.port = service_port
    dbnode.api_port = api_port
    dbnode.enroll_token = None
    dbnode.enroll_expires_at = None
    db.commit()
    db.refresh(dbnode)

    reload_panel_xray_config()
    sync_node_hosts(db, dbnode)
    xray.hosts.update()

    from app.xray import operations

    operations.connect_node(dbnode.id)
    logger.info(
        'Duck node "%s" registered from %s ports=%s protocols=%s',
        dbnode.name,
        dbnode.address,
        final_ports,
        protocols,
    )

    return NodeRegisterResponse(
        node_id=dbnode.id,
        name=dbnode.name,
        api_secret=dbnode.api_secret or "",
        service_port=dbnode.port,
        api_port=dbnode.api_port,
        proxy_ports=final_ports,
        protocols=protocols,
        message="已连接主控，请在面板确认状态为 connected",
    )
