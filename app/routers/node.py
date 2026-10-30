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
    node_needs_duck_provision,
    parse_proxy_ports,
    reload_panel_xray_config,
    remove_node_inbounds_from_config,
    serialize_proxy_ports,
    sync_node_hosts,
)
from app.models.admin import Admin
from app.models.node import (
    DuckProxyPorts,
    NodeCreate,
    NodeModify,
    NodeResponse,
    NodeSettings,
    NodeStatus,
    NodesUsageResponse,
)
from app.node_expiry import NODE_EXPIRED_MESSAGE, node_is_expired, sync_node_expire_state
from app.utils import responses

router = APIRouter(
    tags=["Node"], prefix="/api", responses={401: responses._401, 403: responses._403}
)


class MigrateDuckNodesResponse(BaseModel):
    upgraded: int
    skipped: int
    node_ids: List[int]


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
    tags_csv, final_ports = apply_duck_node_provision(new_node.name, ports=provided)
    dbnode.inbound_tags = tags_csv
    dbnode.proxy_ports = serialize_proxy_ports(final_ports)
    dbnode.proxy_port = final_ports.get("ss")
    db.commit()
    db.refresh(dbnode)
    reload_panel_xray_config()


def _reprovision_node(dbnode, node_name: str, ports: dict | None) -> None:
    tags_csv, final_ports = apply_duck_node_provision(node_name, ports=ports)
    dbnode.inbound_tags = tags_csv
    dbnode.proxy_ports = serialize_proxy_ports(final_ports)
    dbnode.proxy_port = final_ports.get("ss")
    reload_panel_xray_config()


def _sync_hosts_for_node(dbnode) -> None:
    with GetDB() as db:
        row = crud.get_node_by_id(db, dbnode.id)
        if row:
            sync_node_hosts(db, row)


@router.get("/node/settings", response_model=NodeSettings)
def get_node_settings(
    db: Session = Depends(get_db), admin: Admin = Depends(Admin.check_sudo_admin)
):
    """Retrieve the current node settings, including TLS certificate."""
    tls = crud.get_tls_certificate(db)
    return NodeSettings(certificate=tls.certificate)


@router.post("/node", response_model=NodeResponse, responses={409: responses._409})
def add_node(
    new_node: NodeCreate,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    _: Admin = Depends(Admin.check_sudo_admin),
):
    """Add a new node to the database and optionally add it as a host."""
    try:
        dbnode = crud.create_node(db, new_node)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail=f'Node "{new_node.name}" already exists'
        )

    try:
        _apply_duck_node_inbound(new_node, dbnode, db)
    except Exception as e:
        if new_node.duck_dedicated_inbounds:
            try:
                remove_node_inbounds_from_config(new_node.name)
                reload_panel_xray_config()
            except Exception:
                pass
        crud.remove_node(db, dbnode)
        raise HTTPException(status_code=400, detail=str(e)) from e

    if new_node.duck_dedicated_inbounds:
        _sync_hosts_for_node(dbnode)
    elif new_node.add_as_new_host:
        from app.models.proxy import ProxyHost

        host = ProxyHost(
            remark=f"{new_node.name} ({{USERNAME}}) [{{PROTOCOL}} - {{TRANSPORT}}]",
            address=new_node.address,
        )
        for inbound_tag in xray.config.inbounds_by_tag:
            crud.add_host(db, inbound_tag, host)
        xray.hosts.update()

    sync_node_expire_state(db, dbnode)
    if dbnode.status != NodeStatus.disabled:
        bg.add_task(xray.operations.connect_node, node_id=dbnode.id)

    logger.info(f'New node "{dbnode.name}" added')
    return dbnode


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
    old_name = dbnode.name
    new_name = modify.name if modify.name is not None else dbnode.name
    name_changed = modify.name is not None and modify.name != old_name
    try:
        need_reprovision = (
            modify.regenerate_proxy_ports
            or modify.proxy_ports is not None
            or (name_changed and inbound_tags_list(dbnode))
        )
        if need_reprovision:
            if name_changed:
                remove_node_inbounds_from_config(old_name)
            if modify.regenerate_proxy_ports:
                ports = None
            elif modify.proxy_ports is not None:
                ports = modify.proxy_ports.model_dump()
            else:
                ports = parse_proxy_ports(dbnode)
            _reprovision_node(dbnode, new_name, ports=ports)
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

    if dbnode.status != NodeStatus.disabled and not node_is_expired(dbnode):
        bg.add_task(xray.operations.connect_node, node_id=dbnode.id)

    return dbnode


@router.post("/node/{node_id}/regenerate-proxy-ports", response_model=NodeResponse)
def regenerate_proxy_ports(
    bg: BackgroundTasks,
    dbnode=Depends(get_dbnode),
    db: Session = Depends(get_db),
    _: Admin = Depends(Admin.check_sudo_admin),
):
    """重新随机该节点四协议端口并下发。"""
    try:
        _reprovision_node(dbnode, dbnode.name, ports=None)
        db.commit()
        db.refresh(dbnode)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    _sync_hosts_for_node(dbnode)
    bg.add_task(xray.operations.connect_node, node_id=dbnode.id)
    return dbnode


@router.post("/nodes/migrate-duck-inbounds", response_model=MigrateDuckNodesResponse)
def migrate_duck_inbounds(
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    _: Admin = Depends(Admin.check_sudo_admin),
):
    """将未配置四协议端口的旧节点批量升级为 Duck 独立入站。"""
    upgraded: List[int] = []
    skipped = 0
    for dbnode in crud.get_nodes(db):
        if not node_needs_duck_provision(dbnode):
            skipped += 1
            continue
        try:
            _reprovision_node(dbnode, dbnode.name, ports=None)
            db.commit()
            db.refresh(dbnode)
            sync_node_hosts(db, dbnode)
            upgraded.append(dbnode.id)
            bg.add_task(xray.operations.connect_node, node_id=dbnode.id)
        except Exception as e:
            logger.error(f'migrate duck node "{dbnode.name}": {e}')
            db.rollback()
            skipped += 1

    if upgraded:
        reload_panel_xray_config()
    return MigrateDuckNodesResponse(
        upgraded=len(upgraded), skipped=skipped, node_ids=upgraded
    )


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
