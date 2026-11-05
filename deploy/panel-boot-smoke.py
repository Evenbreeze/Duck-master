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


def _ensure_smoke_tls_certs(domain: str = "smoke.local") -> None:
    """XRayConfig 启动时会读 tls 证书路径，smoke 容器里需有占位文件。"""
    cert_dir = Path("/var/lib/duck/certs")
    cert_dir.mkdir(parents=True, exist_ok=True)
    cer = cert_dir / f"{domain}.cer"
    key = cert_dir / f"{domain}.cer.key"
    if cer.is_file() and key.is_file():
        return
    from datetime import datetime, timedelta

    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name(
        [x509.NameAttribute(NameOID.COMMON_NAME, domain)]
    )
    certificate = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.utcnow())
        .not_valid_after(datetime.utcnow() + timedelta(days=1))
        .sign(private_key, hashes.SHA256())
    )
    cer.write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
    key.write_bytes(
        private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )


def main() -> None:
    xray_path = _materialize_xray_json()
    _ensure_smoke_tls_certs("smoke.local")
    os.environ.setdefault("XRAY_JSON", str(xray_path))
    os.environ.setdefault("SQLALCHEMY_DATABASE_URL", "sqlite:////tmp/duck-panel-boot-smoke.db")
    os.environ.setdefault("TELEGRAM_API_TOKEN", "")
    os.environ.setdefault("TELEGRAM_PROXY_URL", "")

    try:
        import app  # noqa: F401
    except Exception as e:
        raise SystemExit(f"panel boot smoke failed (import app): {e}") from e
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
