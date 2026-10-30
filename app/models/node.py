import json
from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional

from pydantic import ConfigDict, BaseModel, Field, field_validator


class NodeStatus(str, Enum):
    connected = "connected"
    connecting = "connecting"
    error = "error"
    disabled = "disabled"


class NodeSettings(BaseModel):
    min_node_version: str = "v0.2.0"
    certificate: str


class DuckProxyPorts(BaseModel):
    vless: int = Field(ge=1024, le=65535)
    vmess: int = Field(ge=1024, le=65535)
    trojan: int = Field(ge=1024, le=65535)
    ss: int = Field(ge=1024, le=65535)


class Node(BaseModel):
    name: str
    address: str
    port: int = 62050
    api_port: int = 62051
    usage_coefficient: float = Field(gt=0, default=1.0)
    proxy_port: Optional[int] = Field(None, ge=1024, le=65535)
    proxy_ports: Optional[DuckProxyPorts] = None
    inbound_tags: Optional[str] = Field(None, max_length=1024)
    expire_at: Optional[int] = Field(
        None, description="到期时间 Unix 秒（UTC），空表示永不到期"
    )


class NodeCreate(Node):
    add_as_new_host: bool = True
    duck_dedicated_inbounds: bool = True
    model_config = ConfigDict(json_schema_extra={
        "example": {
            "name": "DE node",
            "address": "192.168.1.1",
            "port": 62050,
            "api_port": 62051,
            "add_as_new_host": True,
            "duck_dedicated_inbounds": True,
            "usage_coefficient": 1
        }
    })


class NodeModify(BaseModel):
    """部分更新；端口/inbound 仅通过 reprovision 接口变更，不在此写入。"""
    name: Optional[str] = None
    address: Optional[str] = None
    port: Optional[int] = Field(None, ge=1, le=65535)
    api_port: Optional[int] = Field(None, ge=1, le=65535)
    status: Optional[NodeStatus] = None
    usage_coefficient: Optional[float] = Field(None, gt=0)
    expire_at: Optional[int] = None
    regenerate_proxy_ports: bool = False
    proxy_ports: Optional[DuckProxyPorts] = None
    model_config = ConfigDict(extra="ignore")


class NodeResponse(Node):
    id: int
    xray_version: Optional[str] = None
    status: NodeStatus
    message: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

    @field_validator("expire_at", mode="before")
    @classmethod
    def _expire_at_to_unix(cls, v):
        if v is None or v == "":
            return None
        if isinstance(v, datetime):
            if v.tzinfo is None:
                v = v.replace(tzinfo=timezone.utc)
            return int(v.timestamp())
        if isinstance(v, (int, float)):
            return int(v)
        return v

    @field_validator("proxy_ports", mode="before")
    @classmethod
    def _parse_proxy_ports(cls, v):
        if v is None or v == "":
            return None
        if isinstance(v, str):
            try:
                data = json.loads(v)
            except json.JSONDecodeError:
                return None
            return DuckProxyPorts.model_validate(data)
        if isinstance(v, dict):
            return DuckProxyPorts.model_validate(v)
        return v


class NodeUsageResponse(BaseModel):
    node_id: Optional[int] = None
    node_name: str
    uplink: int
    downlink: int


class NodesUsageResponse(BaseModel):
    usages: List[NodeUsageResponse]
