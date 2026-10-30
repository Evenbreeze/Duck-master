"""Duck: 每个节点只跑自己的入站/端口（四协议可各不同端口）。"""
from __future__ import annotations

import json
import random
import re
from copy import deepcopy
from typing import Dict, List, Optional, TYPE_CHECKING

from app.xray.config import XRayConfig
from config import XRAY_JSON

if TYPE_CHECKING:
    from app.db.models import Node as DBNode

DUCK_PROTOCOLS = ("vless", "vmess", "trojan", "ss")

# 主控 xray_config.json 里模板入站 tag（install 生成）
TEMPLATE_INBOUND_TAGS = {
    "vless": "VLESS TCP TLS",
    "vmess": "VMess TCP",
    "trojan": "Trojan TCP",
    "ss": "Shadowsocks TCP",
}

TAG_PREFIX = {
    "vless": "VLESS",
    "vmess": "VMess",
    "trojan": "Trojan",
    "ss": "SS",
}

RESERVED_PORTS = {80, 443, 8000, 8080, 1080, 2053, 62050, 62051}


def _safe_node_name(name: str) -> str:
    return re.sub(r"[,]", "", name.strip())[:40] or "node"


def node_inbound_tags(node_name: str) -> Dict[str, str]:
    safe = _safe_node_name(node_name)
    return {p: f"{TAG_PREFIX[p]} {safe}" for p in DUCK_PROTOCOLS}


def protocol_from_tag(tag: str) -> Optional[str]:
    for proto, prefix in TAG_PREFIX.items():
        if tag.startswith(f"{prefix} "):
            return proto
    return None


def inbound_tags_list(dbnode: "DBNode") -> Optional[List[str]]:
    raw = getattr(dbnode, "inbound_tags", None)
    if not raw:
        return None
    tags = [t.strip() for t in raw.split(",") if t.strip()]
    return tags or None


def parse_proxy_ports(dbnode: "DBNode") -> Optional[Dict[str, int]]:
    raw = getattr(dbnode, "proxy_ports", None)
    if raw:
        try:
            data = json.loads(raw) if isinstance(raw, str) else raw
            return {k: int(v) for k, v in data.items() if k in DUCK_PROTOCOLS}
        except (TypeError, ValueError, json.JSONDecodeError):
            pass
    legacy = getattr(dbnode, "proxy_port", None)
    if legacy:
        return {"ss": int(legacy)}
    return None


def serialize_proxy_ports(ports: Dict[str, int]) -> str:
    ordered = {k: int(ports[k]) for k in DUCK_PROTOCOLS if k in ports}
    return json.dumps(ordered, separators=(",", ":"))


def _load_xray_file() -> dict:
    with open(XRAY_JSON, encoding="utf-8") as f:
        return json.load(f)


def _save_xray_file(cfg: dict) -> None:
    with open(XRAY_JSON, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
        f.write("\n")


def collect_used_ports(cfg: Optional[dict] = None) -> set[int]:
    cfg = cfg or _load_xray_file()
    used = set(RESERVED_PORTS)
    for ib in cfg.get("inbounds", []):
        p = ib.get("port")
        if isinstance(p, int):
            used.add(p)
    return used


def collect_used_ports_from_db(db) -> set[int]:
    from app.db.models import Node as DBNode

    used: set[int] = set()
    for row in db.query(DBNode).all():
        parsed = parse_proxy_ports(row)
        if parsed:
            used.update(parsed.values())
        elif getattr(row, "proxy_port", None):
            used.add(int(row.proxy_port))
    return used


def collect_all_used_ports(db=None) -> set[int]:
    used = collect_used_ports()
    if db is not None:
        used |= collect_used_ports_from_db(db)
    else:
        from app.db import GetDB

        with GetDB() as session:
            used |= collect_used_ports_from_db(session)
    return used


def random_proxy_port(avoid: Optional[set[int]] = None) -> int:
    avoid = avoid or set()
    for _ in range(300):
        p = random.randint(10000, 65535)
        if p not in avoid:
            return p
    return random.randint(20000, 65000)


def generate_random_proxy_ports(extra_avoid: Optional[set[int]] = None) -> Dict[str, int]:
    used = collect_all_used_ports()
    if extra_avoid:
        used |= extra_avoid
    ports: Dict[str, int] = {}
    for proto in DUCK_PROTOCOLS:
        p = random_proxy_port(used)
        used.add(p)
        ports[proto] = p
    return ports


def merge_proxy_ports(
    provided: Optional[Dict[str, int]], extra_avoid: Optional[set[int]] = None
) -> Dict[str, int]:
    used = collect_all_used_ports()
    if extra_avoid:
        used |= extra_avoid
    out: Dict[str, int] = {}
    provided = provided or {}
    for proto in DUCK_PROTOCOLS:
        if proto in provided and provided[proto]:
            p = int(provided[proto])
            if p in used:
                raise ValueError(f"端口 {p} ({proto}) 已被占用")
            used.add(p)
            out[proto] = p
        else:
            p = random_proxy_port(used)
            used.add(p)
            out[proto] = p
    return out


def tag_port_map(dbnode: "DBNode") -> Dict[str, int]:
    ports = parse_proxy_ports(dbnode)
    if not ports:
        return {}
    mapping: Dict[str, int] = {}
    tags = inbound_tags_list(dbnode)
    if tags:
        for tag in tags:
            proto = protocol_from_tag(tag)
            if proto and proto in ports:
                mapping[tag] = ports[proto]
        return mapping
    for proto, tag in node_inbound_tags(dbnode.name).items():
        if proto in ports:
            mapping[tag] = ports[proto]
    return mapping


def node_runtime_config(dbnode: "DBNode", config: XRayConfig) -> XRayConfig:
    tags = inbound_tags_list(dbnode)
    if tags is None:
        return config
    cfg = config.copy()
    allowed = set(tags) | {"API_INBOUND"}
    cfg["inbounds"] = [
        ib for ib in cfg.get("inbounds", [])
        if ib.get("tag") in allowed
    ]
    if not any(ib.get("tag") in tags for ib in cfg["inbounds"]):
        raise ValueError(f'节点 "{dbnode.name}" 的入站 {tags} 在 Xray 配置中不存在')
    per_tag = tag_port_map(dbnode)
    legacy_single = getattr(dbnode, "proxy_port", None)
    for ib in cfg["inbounds"]:
        tag = ib.get("tag")
        if tag in per_tag:
            ib["port"] = per_tag[tag]
        elif legacy_single and tag in tags and len(tags) == 1:
            ib["port"] = int(legacy_single)
    return cfg


def _template_inbound(cfg: dict, template_tag: str) -> dict:
    for ib in cfg.get("inbounds", []):
        if ib.get("tag") == template_tag:
            return deepcopy(ib)
    raise ValueError(f"Xray 配置缺少模板入站 {template_tag}")


def provision_node_inbounds(node_name: str, ports: Dict[str, int]) -> List[str]:
    """为主控 xray_config 增加该节点四协议入站，返回 tag 列表。"""
    cfg = _load_xray_file()
    tags_map = node_inbound_tags(node_name)
    created: List[str] = []

    for proto in DUCK_PROTOCOLS:
        tag = tags_map[proto]
        port = int(ports[proto])
        found = False
        for ib in cfg.get("inbounds", []):
            if ib.get("tag") == tag:
                ib["port"] = port
                found = True
                break
        if not found:
            ib = _template_inbound(cfg, TEMPLATE_INBOUND_TAGS[proto])
            ib["tag"] = tag
            ib["port"] = port
            if ib.get("protocol") == "shadowsocks":
                settings = ib.setdefault("settings", {})
                settings.setdefault("method", "chacha20-poly1305")
            cfg.setdefault("inbounds", []).append(ib)
        created.append(tag)

    _save_xray_file(cfg)
    return created


def apply_duck_node_provision(
    node_name: str,
    ports: Optional[Dict[str, int]] = None,
) -> tuple[str, Dict[str, int]]:
    if ports:
        final = merge_proxy_ports(ports)
    else:
        final = generate_random_proxy_ports()
    tags = provision_node_inbounds(node_name, final)
    return ",".join(tags), final


def remove_node_inbounds_from_config(node_name: str) -> None:
    tags = set(node_inbound_tags(node_name).values())
    cfg = _load_xray_file()
    before = len(cfg.get("inbounds", []))
    cfg["inbounds"] = [
        ib for ib in cfg.get("inbounds", [])
        if ib.get("tag") not in tags
    ]
    if len(cfg.get("inbounds", [])) != before:
        _save_xray_file(cfg)


def duck_host_remark_prefix(node_name: str) -> str:
    return f"Duck {node_name} "


def sync_node_hosts(db, dbnode: "DBNode") -> None:
    from app import xray
    from app.db import crud
    from config import get_panel_domain

    tags = inbound_tags_list(dbnode)
    if not tags:
        return
    sni = get_panel_domain() or None
    prefix = duck_host_remark_prefix(dbnode.name)
    ports_by_tag = tag_port_map(dbnode)
    for inbound_tag in tags:
        meta = xray.config.inbounds_by_tag.get(inbound_tag, {})
        port = ports_by_tag.get(inbound_tag) or meta.get("port")
        crud.upsert_duck_node_host(
            db,
            inbound_tag,
            remark_prefix=prefix,
            address=dbnode.address,
            port=port,
            sni=sni,
        )
    xray.hosts.update()


def reload_panel_xray_config() -> None:
    from app import xray

    api_port = xray.config.api_port
    xray.config = XRayConfig(XRAY_JSON, api_port=api_port)
    xray.hosts.update()


def node_needs_duck_provision(dbnode: "DBNode") -> bool:
    ports = parse_proxy_ports(dbnode)
    tags = inbound_tags_list(dbnode) or []
    if not ports or len(ports) < len(DUCK_PROTOCOLS):
        return True
    if len(tags) < len(DUCK_PROTOCOLS):
        return True
    return False
