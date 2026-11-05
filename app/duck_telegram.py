"""Telegram Bot 配置：面板保存到数据目录，优先于 .env。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, List

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
    token = raw.get("api_token") if "api_token" in raw else TELEGRAM_API_TOKEN
    admin_ids: List[int] = raw.get("admin_ids") if "admin_ids" in raw else list(TELEGRAM_ADMIN_ID)
    logger_id = (
        raw.get("logger_channel_id")
        if "logger_channel_id" in raw
        else TELEGRAM_LOGGER_CHANNEL_ID
    )
    proxy = raw.get("proxy_url") if "proxy_url" in raw else TELEGRAM_PROXY_URL
    return {
        "api_token": token or "",
        "admin_ids": admin_ids or [],
        "logger_channel_id": int(logger_id or 0),
        "proxy_url": proxy or "",
    }


def apply_update(
    *,
    api_token: str | None = None,
    admin_ids: List[int] | None = None,
    logger_channel_id: int | None = None,
    proxy_url: str | None = None,
) -> None:
    data = load_raw()
    if api_token is not None:
        data["api_token"] = api_token
    if admin_ids is not None:
        data["admin_ids"] = admin_ids
    if logger_channel_id is not None:
        data["logger_channel_id"] = logger_channel_id
    if proxy_url is not None:
        data["proxy_url"] = proxy_url
    save_raw(data)
    merge_into_config()
    from app.telegram import apply_apihelper_proxy

    apply_apihelper_proxy()
