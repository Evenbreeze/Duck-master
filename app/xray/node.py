"""Duck 节点客户端 — 仅连接 Duck Node Agent。"""
from app.xray.duck_node_client import DuckXRayNode as XRayNode
from app.xray.errors import NodeAPIError

__all__ = ["XRayNode", "NodeAPIError"]
