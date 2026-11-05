import asyncio
import time
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, WebSocket
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from starlette.websockets import WebSocketDisconnect

from app import logger, xray
from app.db import GetDB, Session, crud, get_db
from app.dependencies import get_dbnode, validate_dates
from app.duck_node import (
    apply_duck_node_provision,
    duck_host_remark_prefix,
    inbound_tags_list,
    normalize_protocol_list,
    parse_proxy_ports,
    parse_reality_meta,
    protocol_from_tag,
    reload_panel_xray_config,
    remove_node_inbounds_from_config,
    resolve_node_ports_and_protocols,
    serialize_proxy_ports,
    sync_node_hosts,
)
from app.models.admin import Admin
from app.models.node import (
    DuckProxyPorts,
    NodeCreate,
    NodeModify,
    NodeResponse,
    NodeStatus,
    NodesUsageResponse,
)
from app.node_expiry import NODE_EXPIRED_MESSAGE, node_is_expired, sync_node_expire_state
from app.utils import responses

router = APIRouter(
    tags=["Node"], prefix="/api", responses={401: responses._401, 403: responses._403}
)


def _ports_dict_from_model(ports: DuckProxyPorts | None) -> dict | None:
    if not ports:
        return None
    return ports.model_dump()


def _apply_duck_node_inbound(new_node: NodeCreate, dbnode, db: Session) -> None:
    if not new_node.duck_dedicated_inbounds:
        return
    provided = _ports_dict_from_model(new_node.proxy_ports)
    if new_node.proxy_port and not provided:
        provided = {"ss": new_node.proxy_port}
    if not provided:
        raise ValueError("请提供各协议端口（主控不再自动随机）")
    tags_csv, final_ports, reality_json = apply_duck_node_provision(
        new_node.name, ports=provided, protocols=list(provided.keys())
    )
    dbnode.inbound_tags = tags_csv
    dbnode.proxy_ports = serialize_proxy_ports(final_ports)
    if reality_json:
        dbnode.reality_meta = reality_json
    dbnode.proxy_port = final_ports.get("ss")
    db.commit()
    db.refresh(dbnode)
    reload_panel_xray_config()


def _protocols_for_dbnode(dbnode) -> list[str]:
    tags = inbound_tags_list(dbnode) or []
    protos = [protocol_from_tag(t) for t in tags if protocol_from_tag(t)]
    if protos:
        return normalize_protocol_list(protos)
    existing = parse_proxy_ports(dbnode)
    if existing:
        return normalize_protocol_list(list(existing.keys()))
    return normalize_protocol_list(None)


def _reprovision_node(
    dbnode,
    node_name: str,
    protocols: list[str],
    ports: dict,
    reality_sni: str | None = None,
) -> None:
    existing = parse_reality_meta(dbnode)
    tags_csv, final_ports, reality_json = apply_duck_node_provision(
        node_name,
        ports=ports,
        protocols=protocols,
        existing_reality=existing,
        reality_sni=reality_sni,
    )
    dbnode.inbound_tags = tags_csv
    dbnode.reality_meta = reality_json
    dbnode.proxy_ports = serialize_proxy_ports(final_ports)
    dbnode.proxy_port = final_ports.get("ss")
    reload_panel_xray_config()


def _sync_hosts_for_node(dbnode) -> None:
    with GetDB() as db:
        row = crud.get_node_by_id(db, dbnode.id)
        if row:
            sync_node_hosts(db, row)


def _provision_fields_changed(dbnode, modify: NodeModify) -> bool:
    """面板每次 PUT 都会带上 protocols/ports；仅在内容变化时才 reprovision。"""
    if modify.protocols is not None:
        if normalize_protocol_list(modify.protocols) != _protocols_for_dbnode(dbnode):
            return True
    if modify.proxy_ports is not None:
        current = parse_proxy_ports(dbnode) or {}
        for key, val in modify.proxy_ports.model_dump().items():
            if val is None:
                continue
            if int(current.get(key, -1)) != int(val):
                return True
    if modify.reality_sni is not None:
        meta = parse_reality_meta(dbnode) or {}
        new_sni = (modify.reality_sni or "").strip()
        old_sni = (meta.get("sni") or "").strip()
        if new_sni != old_sni:
            return True
    return False


@router.post("/node", responses={400: responses._400})
def add_node_deprecated(_: Admin = Depends(Admin.check_sudo_admin)):
    """请用面板一键安装或 POST /api/node/enroll。"""
    raise HTTPException(
        status_code=400,
        detail="请使用面板「一键生成节点安装命令」或 POST /api/node/enroll",
    )


@router.get("/node/{node_id}", response_model=NodeResponse)
def get_node(
    dbnode: NodeResponse = Depends(get_dbnode),
    _: Admin = Depends(Admin.check_sudo_admin),
):
    """Retrieve details of a specific node by its ID."""
    return dbnode


@router.websocket("/node/{node_id}/logs")
async def node_logs(node_id: int, websocket: WebSocket, db: Session = Depends(get_db)):
    token = websocket.query_params.get("token") or websocket.headers.get(
        "Authorization", ""
    ).removeprefix("Bearer ")
    admin = Admin.get_admin(token, db)
    if not admin:
        return await websocket.close(reason="Unauthorized", code=4401)

    if not admin.is_sudo:
        return await websocket.close(reason="You're not allowed", code=4403)

    if not xray.nodes.get(node_id):
        return await websocket.close(reason="Node not found", code=4404)

    if not xray.nodes[node_id].connected:
        return await websocket.close(reason="Node is not connected", code=4400)

    interval = websocket.query_params.get("interval")
    if interval:
        try:
            interval = float(interval)
        except ValueError:
            return await websocket.close(reason="Invalid interval value", code=4400)
        if interval > 10:
            return await websocket.close(
                reason="Interval must be more than 0 and at most 10 seconds", code=4400
            )

    await websocket.accept()

    cache = ""
    last_sent_ts = 0
    with xray.nodes[node_id].get_logs() as logs:
        while True:
            if interval and time.time() - last_sent_ts >= interval and cache:
                try:
                    await websocket.send_text(cache)
                except (WebSocketDisconnect, RuntimeError):
                    break
                cache = ""
                last_sent_ts = time.time()

            if not logs:
                try:
                    await asyncio.wait_for(websocket.receive(), timeout=0.2)
                    continue
                except asyncio.TimeoutError:
                    continue
                except (WebSocketDisconnect, RuntimeError):
                    break

            log = logs.popleft()

            if interval:
                cache += f"{log}\n"
                continue

            try:
                await websocket.send_text(log)
            except (WebSocketDisconnect, RuntimeError):
                break


@router.get("/nodes", response_model=List[NodeResponse])
def get_nodes(
    db: Session = Depends(get_db), admin: Admin = Depends(Admin.check_sudo_admin)
):
    """Retrieve a list of all nodes."""
    return crud.get_nodes(db)


@router.put("/node/{node_id}", response_model=NodeResponse)
def modify_node(
    modify: NodeModify,
    bg: BackgroundTasks,
    dbnode=Depends(get_dbnode),
    db: Session = Depends(get_db),
    _: Admin = Depends(Admin.check_sudo_admin),
):
    """Modify an existing node's configuration."""
    reprovisioned = False
    was_disabled = dbnode.status == NodeStatus.disabled
    old_name = dbnode.name
    new_name = modify.name if modify.name is not None else dbnode.name
    name_changed = modify.name is not None and modify.name != old_name
    try:
        need_reprovision = (name_changed and inbound_tags_list(dbnode)) or _provision_fields_changed(
            dbnode, modify
        )
        if need_reprovision:
            if name_changed:
                remove_node_inbounds_from_config(old_name)
            port_updates = (
                modify.proxy_ports.model_dump() if modify.proxy_ports else None
            )
            protocols, ports = resolve_node_ports_and_protocols(
                db, dbnode, modify.protocols, port_updates
            )
            sni = modify.reality_sni
            if sni is None and parse_reality_meta(dbnode):
                sni = parse_reality_meta(dbnode).get("sni")
            _reprovision_node(
                dbnode, new_name, protocols, ports, reality_sni=sni
            )
            db.commit()
            db.refresh(dbnode)
            reprovisioned = True
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    dbnode = crud.update_node(db, dbnode, modify)
    sync_node_expire_state(db, dbnode)
    db.refresh(dbnode)

    if name_changed:
        with GetDB() as db_clean:
            crud.remove_hosts_by_remark_prefix(
                db_clean, duck_host_remark_prefix(old_name)
            )

    if reprovisioned or modify.address is not None or name_changed:
        _sync_hosts_for_node(dbnode)

    if modify.status is NodeStatus.disabled:
        bg.add_task(xray.operations.remove_node, node_id=dbnode.id)
        return dbnode

    need_agent = reprovisioned or any(
        getattr(modify, field) is not None
        for field in ("address", "port", "api_port")
    )
    if (
        need_agent
        and dbnode.status != NodeStatus.disabled
        and not node_is_expired(dbnode)
    ):
        if reprovisioned:
            try:
                if xray.nodes[dbnode.id].connected:
                    bg.add_task(xray.operations.restart_node, node_id=dbnode.id)
                else:
                    bg.add_task(xray.operations.connect_node, node_id=dbnode.id)
            except KeyError:
                bg.add_task(xray.operations.connect_node, node_id=dbnode.id)
        else:
            bg.add_task(xray.operations.connect_node, node_id=dbnode.id)
    elif (
        was_disabled
        and modify.status is not None
        and modify.status is not NodeStatus.disabled
        and not node_is_expired(dbnode)
    ):
        bg.add_task(xray.operations.connect_node, node_id=dbnode.id)

    return dbnode


@router.delete("/node/{node_id}")
def remove_node(
    dbnode=Depends(get_dbnode),
    db: Session = Depends(get_db),
    _: Admin = Depends(Admin.check_sudo_admin),
):
    """Remove a node from the database."""
    if inbound_tags_list(dbnode):
        try:
            remove_node_inbounds_from_config(dbnode.name)
            reload_panel_xray_config()
        except Exception as e:
            logger.warning(f"remove node inbounds from xray json: {e}")
    xray.operations.remove_node(dbnode.id)
    crud.remove_node(db, dbnode)
    return {}


@router.post("/node/{node_id}/reconnect")
def reconnect_node(
    bg: BackgroundTasks,
    dbnode=Depends(get_dbnode),
    _: Admin = Depends(Admin.check_sudo_admin),
):
    """Trigger a reconnection attempt for the specified node."""
    if node_is_expired(dbnode):
        raise HTTPException(status_code=400, detail=NODE_EXPIRED_MESSAGE)
    bg.add_task(xray.operations.connect_node, node_id=dbnode.id)
    return {}


@router.get("/nodes/usage", response_model=NodesUsageResponse)
def get_nodes_usage(
    start: str = "",
    end: str = "",
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Retrieve usage statistics for all nodes within a specified date range."""
    start, end = validate_dates(start, end)
    usages = crud.get_nodes_usage(db, start, end)
    return NodesUsageResponse(usages=usages)
