from typing import List

from pydantic import BaseModel, Field


class TelegramSettingsPublic(BaseModel):
    api_token: str = ""
    admin_ids: List[int] = Field(default_factory=list)
    logger_channel_id: int = 0
    proxy_url: str = ""


class TelegramSettingsUpdate(BaseModel):
    api_token: str = ""
    admin_ids: List[int] = Field(default_factory=list)
    logger_channel_id: int = 0
    proxy_url: str = ""
