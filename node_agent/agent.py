#!/usr/bin/env python3
"""Duck 节点 Agent — 主控通过 HTTP + Bearer 下发 Xray 配置。"""
from __future__ import annotations

import json
import os
import secrets
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

XRAY_BIN = os.environ.get("DUCK_XRAY_BIN", "/usr/local/bin/xray")
SECRET = os.environ.get("DUCK_NODE_SECRET", "")
SERVICE_PORT = int(os.environ.get("DUCK_SERVICE_PORT", "62050"))

app = FastAPI(title="Duck Node Agent", docs_url=None, redoc_url=None)
_session_id: Optional[str] = None
_started = False
_xray_proc: Optional[subprocess.Popen] = None
_config_path = Path("/var/lib/duck-node/xray.json")


def _auth(authorization: Optional[str]) -> None:
    if not SECRET:
        raise HTTPException(503, "DUCK_NODE_SECRET not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing Bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    if token != SECRET:
        raise HTTPException(403, "Invalid token")


class SessionBody(BaseModel):
    session_id: Optional[str] = None
    config: Optional[dict[str, Any]] = None


@app.get("/")
def root():
    ver = ""
    try:
        ver = subprocess.check_output([XRAY_BIN, "version"], text=True, timeout=5).split()[1]
    except Exception:
        pass
    return {"started": _started, "core_version": ver}


@app.post("/connect")
def connect(body: SessionBody, authorization: Optional[str] = Header(None)):
    _auth(authorization)
    global _session_id
    _session_id = secrets.token_hex(16)
    return {"session_id": _session_id}


@app.post("/disconnect")
def disconnect(body: SessionBody, authorization: Optional[str] = Header(None)):
    _auth(authorization)
    global _session_id
    _session_id = None
    return {}


@app.post("/ping")
def ping(body: SessionBody, authorization: Optional[str] = Header(None)):
    _auth(authorization)
    if body.session_id != _session_id:
        raise HTTPException(401, "Invalid session")
    return {}


def _stop_xray() -> None:
    global _xray_proc, _started
    if _xray_proc and _xray_proc.poll() is None:
        _xray_proc.terminate()
        try:
            _xray_proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            _xray_proc.kill()
    _xray_proc = None
    _started = False


def _start_xray(config: dict) -> None:
    global _xray_proc, _started
    _stop_xray()
    _config_path.parent.mkdir(parents=True, exist_ok=True)
    _config_path.write_text(json.dumps(config, indent=2), encoding="utf-8")
    _xray_proc = subprocess.Popen(
        [XRAY_BIN, "run", "-c", str(_config_path)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    _started = True


def _apply(body: SessionBody, authorization: Optional[str]) -> dict:
    _auth(authorization)
    if body.session_id != _session_id:
        raise HTTPException(401, "Invalid session")
    if not body.config:
        raise HTTPException(400, "config required")
    _start_xray(body.config)
    return {}


@app.post("/start")
def start(body: SessionBody, authorization: Optional[str] = Header(None)):
    if _started:
        raise HTTPException(400, detail="Xray is started already")
    return _apply(body, authorization)


@app.post("/restart")
def restart(body: SessionBody, authorization: Optional[str] = Header(None)):
    return _apply(body, authorization)


@app.post("/stop")
def stop(body: SessionBody, authorization: Optional[str] = Header(None)):
    _auth(authorization)
    if body.session_id != _session_id:
        raise HTTPException(401, "Invalid session")
    _stop_xray()
    return {}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=SERVICE_PORT, log_level="info")
