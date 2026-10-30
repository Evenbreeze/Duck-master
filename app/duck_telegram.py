"""Telegram Bot 配置：面板保存到数据目录，优先于 .env。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, List, Optional

from config import XRAY_JSON


def settings_path() -> Path:
    return Path(XRAY_JSON).resolve().parent / "duck_telegram.json"


def load_raw() -> dict[str, Any]:
    path = settings_path()
    if not path.is_file():
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def save_raw(data: dict[str, Any]) -> None:
    path = settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def merge_into_config() -> None:
    import config as cfg

    data = load_raw()
    if not data:
        return
    if data.get("api_token"):
        cfg.TELEGRAM_API_TOKEN = str(data["api_token"])
    if "admin_ids" in data and data["admin_ids"] is not None:
        cfg.TELEGRAM_ADMIN_ID = [int(i) for i in data["admin_ids"]]
    if "logger_channel_id" in data:
        cfg.TELEGRAM_LOGGER_CHANNEL_ID = int(data["logger_channel_id"] or 0)
    if "proxy_url" in data:
        cfg.TELEGRAM_PROXY_URL = str(data["proxy_url"] or "")


def public_view() -> dict[str, Any]:
    from config import (
        TELEGRAM_ADMIN_ID,
        TELEGRAM_API_TOKEN,
        TELEGRAM_LOGGER_CHANNEL_ID,
        TELEGRAM_PROXY_URL,
    )

    raw = load_raw()
    token = raw.get("api_token") or TELEGRAM_API_TOKEN
    admin_ids = raw.get("admin_ids")
    if admin_ids is None:
        admin_ids = list(TELEGRAM_ADMIN_ID)
    logger_id = raw.get("logger_channel_id")
    if logger_id is None:
        logger_id = TELEGRAM_LOGGER_CHANNEL_ID
    proxy = raw.get("proxy_url")
    if proxy is None:
        proxy = TELEGRAM_PROXY_URL

    return {
        "token_configured": bool(token),
        "admin_ids": admin_ids,
        "logger_channel_id": logger_id or 0,
        "proxy_url": proxy or "",
    }


def apply_update(
    *,
    api_token: Optional[str],
    admin_ids: List[int],
    logger_channel_id: int,
    proxy_url: str,
    keep_token_if_empty: bool = True,
) -> None:
    data = load_raw()
    if api_token:
        data["api_token"] = api_token.strip()
    elif not keep_token_if_empty:
        data.pop("api_token", None)
    data["admin_ids"] = admin_ids
    data["logger_channel_id"] = logger_channel_id
    data["proxy_url"] = proxy_url.strip()
    save_raw(data)
    merge_into_config()
