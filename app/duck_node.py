"""Duck: 每个节点只跑自己的入站/端口（四协议可各不同端口）。"""
from __future__ import annotations

import json
import random
import re
import secrets
import subprocess
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


def normalize_protocol_list(protocols: Optional[List[str]]) -> List[str]:
    if not protocols:
        return list(DUCK_PROTOCOLS)
    out: List[str] = []
    for p in protocols:
        key = (p or "").strip().lower()
        if key in ("shadowsocks", "ss"):
            key = "ss"
        if key in DUCK_PROTOCOLS and key not in out:
            out.append(key)
    return out or list(DUCK_PROTOCOLS)


def parse_enroll_pending(dbnode: "DBNode") -> Optional[dict]:
    raw = getattr(dbnode, "proxy_ports", None)
    if not raw:
        return None
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
        if isinstance(data, dict) and data.get("_pending"):
            return data
    except (TypeError, json.JSONDecodeError):
        pass
    return None


def enroll_pending_protocols(dbnode: "DBNode") -> List[str]:
    pending = parse_enroll_pending(dbnode)
    if pending and pending.get("protocols"):
        return normalize_protocol_list(pending["protocols"])
    return list(DUCK_PROTOCOLS)


def serialize_enroll_pending(
    protocols: List[str],
    ports: Optional[Dict[str, int]] = None,
    service_port: Optional[int] = None,
    api_port: Optional[int] = None,
) -> str:
    data: dict = {
        "_pending": True,
        "protocols": normalize_protocol_list(protocols),
    }
    if ports:
        data["ports"] = {k: int(ports[k]) for k in normalize_protocol_list(protocols) if k in ports}
    if service_port:
        data["service_port"] = int(service_port)
    if api_port:
        data["api_port"] = int(api_port)
    return json.dumps(data, separators=(",", ":"))


def enroll_pending_ports(dbnode: "DBNode") -> Optional[Dict[str, int]]:
    pending = parse_enroll_pending(dbnode)
    if not pending or not pending.get("ports"):
        return None
    try:
        return {k: int(v) for k, v in pending["ports"].items() if k in DUCK_PROTOCOLS}
    except (TypeError, ValueError):
        return None


def enroll_pending_agent_ports(dbnode: "DBNode") -> tuple[Optional[int], Optional[int]]:
    pending = parse_enroll_pending(dbnode)
    if not pending:
        return None, None
    sp = pending.get("service_port")
    ap = pending.get("api_port")
    return (int(sp) if sp else None, int(ap) if ap else None)


def allocate_ports_for_protocols(
    db,
    protocols: List[str],
    provided: Optional[Dict[str, int]] = None,
) -> Dict[str, int]:
    """主控为待安装节点分配端口（避免与已有节点/模板冲突）。"""
    used = collect_all_used_ports(db)
    out: Dict[str, int] = {}
    provided = provided or {}
    for proto in normalize_protocol_list(protocols):
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


def allocate_agent_ports(db) -> tuple[int, int]:
    used = collect_all_used_ports(db)
    for _ in range(200):
        service = random_proxy_port(used)
        used.add(service)
        api = service + 1
        if api <= 65535 and api not in used:
            return service, api
    service = random_proxy_port(used)
    return service, min(service + 1, 65535)


def parse_proxy_ports(dbnode: "DBNode") -> Optional[Dict[str, int]]:
    raw = getattr(dbnode, "proxy_ports", None)
    if raw:
        try:
            data = json.loads(raw) if isinstance(raw, str) else raw
            if isinstance(data, dict) and data.get("_pending"):
                return None
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
        pending = parse_enroll_pending(row)
        if pending:
            if isinstance(pending.get("ports"), dict):
                used.update(int(p) for p in pending["ports"].values() if p)
            if pending.get("service_port"):
                used.add(int(pending["service_port"]))
            if pending.get("api_port"):
                used.add(int(pending["api_port"]))
        parsed = parse_proxy_ports(row)
        if parsed:
            used.update(parsed.values())
        elif getattr(row, "proxy_port", None):
            used.add(int(row.proxy_port))
        if getattr(row, "port", None):
            used.add(int(row.port))
        if getattr(row, "api_port", None):
            used.add(int(row.api_port))
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
        if tag == "API_INBOUND":
            ib["port"] = int(dbnode.api_port)
            ib["listen"] = "0.0.0.0"
        elif tag in per_tag:
            ib["port"] = per_tag[tag]
        elif legacy_single and tag in tags and len(tags) == 1:
            ib["port"] = int(legacy_single)
    return cfg


REALITY_SNI = "www.apple.com"
REALITY_DEST = "www.apple.com:443"


def generate_reality_meta() -> dict:
    """节点 VLESS 使用 REALITY（无需 LE 证书）。"""
    try:
        out = subprocess.check_output(["xray", "x25519"], text=True, timeout=10)
        private_key = ""
        public_key = ""
        for line in out.splitlines():
            if "Private key" in line:
                private_key = line.split()[-1]
            if "Public key" in line:
                public_key = line.split()[-1]
        if not private_key or not public_key:
            raise RuntimeError("x25519 output unexpected")
    except Exception:
        private_key = secrets.token_hex(32)
        public_key = secrets.token_hex(32)
    return {
        "privateKey": private_key,
        "publicKey": public_key,
        "shortId": secrets.token_hex(4),
        "sni": REALITY_SNI,
        "dest": REALITY_DEST,
    }


def _apply_node_vless_reality(ib: dict, meta: dict) -> None:
    ib["streamSettings"] = {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
            "show": False,
            "dest": meta["dest"],
            "xver": 0,
            "serverNames": [meta["sni"]],
            "privateKey": meta["privateKey"],
            "shortIds": [meta["shortId"]],
        },
    }


def _strip_tls_for_node(ib: dict) -> None:
    ss = ib.get("streamSettings") or {}
    ss.pop("security", None)
    ss.pop("tlsSettings", None)
    ss.pop("realitySettings", None)
    ib["streamSettings"] = ss


def _template_inbound(cfg: dict, template_tag: str) -> dict:
    for ib in cfg.get("inbounds", []):
        if ib.get("tag") == template_tag:
            return deepcopy(ib)
    raise ValueError(f"Xray 配置缺少模板入站 {template_tag}")


def _prune_node_protocol_inbounds(cfg: dict, node_name: str, protocols: List[str]) -> None:
    tags_map = node_inbound_tags(node_name)
    all_tags = set(tags_map.values())
    allowed = {tags_map[p] for p in normalize_protocol_list(protocols)}
    cfg["inbounds"] = [
        ib
        for ib in cfg.get("inbounds", [])
        if ib.get("tag") not in all_tags or ib.get("tag") in allowed
    ]


def _with_reality_sni(meta: dict, sni: Optional[str]) -> dict:
    out = dict(meta)
    if not sni or not str(sni).strip():
        return out
    host = str(sni).strip()
    out["sni"] = host
    out["dest"] = host if ":" in host else f"{host}:443"
    return out


def parse_reality_meta(dbnode: "DBNode") -> Optional[dict]:
    raw = getattr(dbnode, "reality_meta", None)
    if not raw:
        return None
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


def resolve_node_ports_and_protocols(
    db,
    dbnode: "DBNode",
    protocols: Optional[List[str]],
    port_updates: Optional[Dict[str, Optional[int]]],
) -> tuple[List[str], Dict[str, int]]:
    """主控合并协议勾选与端口；新协议自动分配未占用端口。"""
    current = parse_proxy_ports(dbnode) or {}
    if protocols is not None:
        protos = normalize_protocol_list(protocols)
    elif current:
        protos = normalize_protocol_list(list(current.keys()))
    else:
        protos = _protocols_from_tags(dbnode)

    ports: Dict[str, int] = {k: int(v) for k, v in current.items() if k in protos}
    if port_updates:
        for key, val in port_updates.items():
            if key not in DUCK_PROTOCOLS or val is None:
                continue
            ports[key] = int(val)

    missing = [p for p in protos if p not in ports or not ports[p]]
    if missing:
        provided = {p: ports[p] for p in missing if p in ports and ports[p]}
        allocated = allocate_ports_for_protocols(db, missing, provided or None)
        ports.update(allocated)

    ports = {k: ports[k] for k in protos}
    if not protos:
        raise ValueError("请至少选择一种协议")
    return protos, ports


def _protocols_from_tags(dbnode: "DBNode") -> List[str]:
    tags = inbound_tags_list(dbnode) or []
    protos = [protocol_from_tag(t) for t in tags if protocol_from_tag(t)]
    return normalize_protocol_list(protos) if protos else list(DUCK_PROTOCOLS)


def provision_node_inbounds(
    node_name: str,
    ports: Dict[str, int],
    protocols: Optional[List[str]] = None,
    existing_reality: Optional[dict] = None,
    reality_sni: Optional[str] = None,
) -> tuple[List[str], Optional[dict]]:
    """为主控 xray_config 增加节点入站；VLESS 用 REALITY。"""
    cfg = _load_xray_file()
    tags_map = node_inbound_tags(node_name)
    created: List[str] = []
    protos = normalize_protocol_list(protocols)
    _prune_node_protocol_inbounds(cfg, node_name, protos)

    reality_meta: Optional[dict] = None
    if "vless" in protos:
        reality_meta = existing_reality or generate_reality_meta()
        reality_meta = _with_reality_sni(reality_meta, reality_sni)

    for proto in protos:
        tag = tags_map[proto]
        port = int(ports[proto])
        found = False
        for ib in cfg.get("inbounds", []):
            if ib.get("tag") == tag:
                ib["port"] = port
                if proto == "vless" and reality_meta:
                    _apply_node_vless_reality(ib, reality_meta)
                elif proto in ("vmess", "trojan"):
                    _strip_tls_for_node(ib)
                found = True
                break
        if not found:
            ib = _template_inbound(cfg, TEMPLATE_INBOUND_TAGS[proto])
            ib["tag"] = tag
            ib["port"] = port
            if proto == "vless":
                if not reality_meta:
                    reality_meta = _with_reality_sni(generate_reality_meta(), reality_sni)
                _apply_node_vless_reality(ib, reality_meta)
            elif proto in ("vmess", "trojan"):
                _strip_tls_for_node(ib)
            if ib.get("protocol") == "shadowsocks":
                settings = ib.setdefault("settings", {})
                settings.setdefault("method", "chacha20-poly1305")
            cfg.setdefault("inbounds", []).append(ib)
        created.append(tag)

    if "vless" not in protos:
        reality_meta = None

    _save_xray_file(cfg)
    return created, reality_meta


def apply_duck_node_provision(
    node_name: str,
    ports: Dict[str, int],
    protocols: Optional[List[str]] = None,
    existing_reality: Optional[dict] = None,
    reality_sni: Optional[str] = None,
) -> tuple[str, Dict[str, int], Optional[str]]:
    protos = normalize_protocol_list(protocols)
    final: Dict[str, int] = {}
    for proto in protos:
        if proto not in ports or not ports[proto]:
            raise ValueError(f"缺少节点端口: {proto}")
        final[proto] = int(ports[proto])
    tags, reality_meta = provision_node_inbounds(
        node_name,
        final,
        protocols=protos,
        existing_reality=existing_reality,
        reality_sni=reality_sni,
    )
    reality_json = json.dumps(reality_meta) if reality_meta else None
    return ",".join(tags), final, reality_json


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
    reality = None
    raw_meta = getattr(dbnode, "reality_meta", None)
    if raw_meta:
        try:
            reality = json.loads(raw_meta)
        except json.JSONDecodeError:
            reality = None
    sni = (reality or {}).get("sni") or get_panel_domain() or None
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
    if parse_enroll_pending(dbnode):
        return True
    ports = parse_proxy_ports(dbnode)
    tags = inbound_tags_list(dbnode) or []
    protos = enroll_pending_protocols(dbnode) if not ports else [
        p for p in DUCK_PROTOCOLS if p in (ports or {})
    ]
    if not ports:
        return True
    if len(tags) < len(protos):
        return True
    return False
