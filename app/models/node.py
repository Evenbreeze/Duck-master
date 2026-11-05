import json
from datetime import datetime, timezone
from enum import Enum
from typing import List, Literal, Optional

from pydantic import ConfigDict, BaseModel, Field, field_validator, model_validator

DuckProtocol = Literal["vless", "vmess", "trojan", "ss"]


class NodeStatus(str, Enum):
    connected = "connected"
    connecting = "connecting"
    error = "error"
    disabled = "disabled"


class NodeSettings(BaseModel):
    min_node_version: str = "v0.2.0"
    certificate: str


class DuckProxyPorts(BaseModel):
    vless: Optional[int] = Field(None, ge=1, le=65535)
    vmess: Optional[int] = Field(None, ge=1, le=65535)
    trojan: Optional[int] = Field(None, ge=1, le=65535)
    ss: Optional[int] = Field(None, ge=1, le=65535)


class Node(BaseModel):
    name: str
    address: str
    port: int = 62050
    api_port: int = 62051
    usage_coefficient: float = Field(gt=0, default=1.0)
    proxy_port: Optional[int] = Field(None, ge=1, le=65535)
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
    name: Optional[str] = None
    address: Optional[str] = None
    port: Optional[int] = Field(None, ge=1, le=65535)
    api_port: Optional[int] = Field(None, ge=1, le=65535)
    status: Optional[NodeStatus] = None
    usage_coefficient: Optional[float] = Field(None, gt=0)
    expire_at: Optional[int] = None
    regenerate_proxy_ports: bool = False
    protocols: Optional[List[DuckProtocol]] = None
    proxy_ports: Optional[DuckProxyPorts] = None
    reality_sni: Optional[str] = Field(None, max_length=253)
    model_config = ConfigDict(extra="ignore")


class NodeResponse(Node):
    id: int
    xray_version: Optional[str] = None
    status: NodeStatus
    message: Optional[str] = None
    protocols: List[DuckProtocol] = Field(default_factory=list)
    reality_sni: Optional[str] = None
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
        elif isinstance(v, dict):
            data = v
        else:
            return v
        if isinstance(data, dict) and data.get("_pending"):
            inner = data.get("ports")
            if isinstance(inner, dict) and inner:
                return DuckProxyPorts.model_validate(inner)
            return None
        return DuckProxyPorts.model_validate(data)

    @model_validator(mode="before")
    @classmethod
    def _duck_node_extras(cls, data):
        from app.duck_node import (
            inbound_tags_list,
            parse_proxy_ports,
            protocol_from_tag,
            normalize_protocol_list,
        )

        if not isinstance(data, dict):
            raw_meta = getattr(data, "reality_meta", None)
            sni = None
            if raw_meta:
                try:
                    sni = json.loads(raw_meta).get("sni")
                except json.JSONDecodeError:
                    sni = None
            tags = inbound_tags_list(data) or []
            protos = [
                protocol_from_tag(t) for t in tags if protocol_from_tag(t)
            ]
            ports = parse_proxy_ports(data)
            if not protos and ports:
                protos = list(ports.keys())
            protos = normalize_protocol_list(protos) if protos else []
            if isinstance(data, dict):
                base = data
            else:
                base = {
                    k: getattr(data, k)
                    for k in (
                        "id",
                        "name",
                        "address",
                        "port",
                        "api_port",
                        "usage_coefficient",
                        "proxy_port",
                        "proxy_ports",
                        "inbound_tags",
                        "expire_at",
                        "xray_version",
                        "status",
                        "message",
                    )
                    if hasattr(data, k)
                }
            base["protocols"] = protos
            base["reality_sni"] = sni
            return base
        return data


class NodeUsageResponse(BaseModel):
    node_id: Optional[int] = None
    node_name: str
    uplink: int
    downlink: int


class NodesUsageResponse(BaseModel):
    usages: List[NodeUsageResponse]
