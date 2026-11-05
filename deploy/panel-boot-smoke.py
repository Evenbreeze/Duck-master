#!/usr/bin/env python3
"""Import chain smoke test — same failure mode as docker-entrypoint (alembic → app)."""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _materialize_xray_json() -> Path:
    template = ROOT / "deploy" / "xray_config.template.json"
    if not template.is_file():
        raise SystemExit(f"missing {template}")
    text = template.read_text(encoding="utf-8")
    repl = {
        "__DOMAIN__": "smoke.local",
        "__PORT_VLESS__": "443",
        "__PORT_VMESS__": "8080",
        "__PORT_TROJAN__": "2053",
        "__PORT_SS__": "1080",
    }
    for k, v in repl.items():
        text = text.replace(k, v)
    json.loads(text)
    out = Path(tempfile.gettempdir()) / "duck-panel-boot-smoke-xray.json"
    out.write_text(text, encoding="utf-8")
    return out


def main() -> None:
    xray_path = _materialize_xray_json()
    os.environ.setdefault("XRAY_JSON", str(xray_path))
    os.environ.setdefault("SQLALCHEMY_DATABASE_URL", "sqlite:////tmp/duck-panel-boot-smoke.db")
    os.environ.setdefault("TELEGRAM_API_TOKEN", "")
    os.environ.setdefault("TELEGRAM_PROXY_URL", "")

    import app  # noqa: F401
    from app.subscription import (  # noqa: F401
        ClashConfiguration,
        ClashMetaConfiguration,
        OutlineConfiguration,
        SingBoxConfiguration,
        V2rayJsonConfig,
        V2rayShareLink,
    )

    print("panel boot smoke OK")


if __name__ == "__main__":
    main()
