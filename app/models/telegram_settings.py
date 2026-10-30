from typing import List, Optional

from pydantic import BaseModel, Field


class TelegramSettingsPublic(BaseModel):
    token_configured: bool
    admin_ids: List[int] = Field(default_factory=list)
    logger_channel_id: int = 0
    proxy_url: str = ""


class TelegramSettingsUpdate(BaseModel):
    api_token: Optional[str] = None
    admin_ids: List[int] = Field(default_factory=list)
    logger_channel_id: int = 0
    proxy_url: str = ""
