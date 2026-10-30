from fastapi import APIRouter, Depends

from app.duck_telegram import apply_update, public_view
from app.models.admin import Admin
from app.models.telegram_settings import TelegramSettingsPublic, TelegramSettingsUpdate

router = APIRouter(tags=["Telegram"], prefix="/api")


@router.get("/telegram/settings", response_model=TelegramSettingsPublic)
def get_telegram_settings(_: Admin = Depends(Admin.check_sudo_admin)):
    return TelegramSettingsPublic(**public_view())


@router.put("/telegram/settings", response_model=TelegramSettingsPublic)
def put_telegram_settings(
    body: TelegramSettingsUpdate,
    _: Admin = Depends(Admin.check_sudo_admin),
):
    apply_update(
        api_token=body.api_token,
        admin_ids=body.admin_ids,
        logger_channel_id=body.logger_channel_id,
        proxy_url=body.proxy_url,
        keep_token_if_empty=True,
    )
    return TelegramSettingsPublic(**public_view())
