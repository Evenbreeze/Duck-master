"""节点到期：断开连接并从订阅中移除（禁用 Host）。"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from app.duck_node import duck_host_remark_prefix
from app.models.node import NodeStatus

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.db.models import Node as DBNode

NODE_EXPIRED_MESSAGE = "节点已到期"


def expire_at_from_unix(ts: Optional[int]) -> Optional[datetime]:
    if ts is None:
        return None
    return datetime.fromtimestamp(int(ts), tz=timezone.utc)


def expire_at_to_unix(dt: Optional[datetime]) -> Optional[int]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def node_is_expired(dbnode: "DBNode", now: Optional[datetime] = None) -> bool:
    exp = getattr(dbnode, "expire_at", None)
    if exp is None:
        return False
    now = now or datetime.now(timezone.utc)
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return now >= exp


def enforce_node_expired(db: "Session", dbnode: "DBNode") -> bool:
    """到期处理：禁用 Host、标记节点 disabled、断开 Xray 节点连接。"""
    from app import xray
    from app.db import crud

    if not node_is_expired(dbnode):
        return False
    if (
        dbnode.status == NodeStatus.disabled
        and dbnode.message == NODE_EXPIRED_MESSAGE
    ):
        return False

    prefix = duck_host_remark_prefix(dbnode.name)
    crud.set_hosts_disabled_by_remark_prefix(db, prefix, True)
    crud.update_node_status(db, dbnode, NodeStatus.disabled, message=NODE_EXPIRED_MESSAGE)
    xray.operations.remove_node(dbnode.id)
    xray.hosts.update()
    return True


def sync_node_expire_state(db: "Session", dbnode: "DBNode") -> None:
    """创建/修改节点后，按到期时间同步 Host 与连接状态。"""
    from app import xray
    from app.db import crud

    prefix = duck_host_remark_prefix(dbnode.name)
    if node_is_expired(dbnode):
        enforce_node_expired(db, dbnode)
        return

    crud.set_hosts_disabled_by_remark_prefix(db, prefix, False)
    if dbnode.status == NodeStatus.disabled and dbnode.message == NODE_EXPIRED_MESSAGE:
        crud.update_node_status(db, dbnode, NodeStatus.connecting)
    elif dbnode.message == NODE_EXPIRED_MESSAGE:
        dbnode.message = None
        db.commit()
        db.refresh(dbnode)
    xray.hosts.update()


def check_all_node_expiries() -> None:
    from app.db import GetDB, crud

    with GetDB() as db:
        for dbnode in crud.get_nodes(db):
            if node_is_expired(dbnode):
                enforce_node_expired(db, dbnode)
