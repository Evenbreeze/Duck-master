import importlib.util
from os.path import dirname
from threading import Thread

from config import TELEGRAM_API_TOKEN, TELEGRAM_PROXY_URL
from app import app
from telebot import TeleBot, apihelper


def apply_apihelper_proxy() -> None:
    url = (TELEGRAM_PROXY_URL or "").strip()
    if url:
        apihelper.proxy = {"http": url, "https": url}
    else:
        apihelper.proxy = None


bot = None
if TELEGRAM_API_TOKEN:
    apply_apihelper_proxy()
    bot = TeleBot(TELEGRAM_API_TOKEN)

handler_names = ["admin", "report", "user"]


@app.on_event("startup")
def start_bot():
    if bot:
        handler_dir = dirname(__file__) + "/handlers/"
        for name in handler_names:
            spec = importlib.util.spec_from_file_location(name, f"{handler_dir}{name}.py")
            spec.loader.exec_module(importlib.util.module_from_spec(spec))

        from app.telegram import utils  # setup custom handlers

        utils.setup()

        thread = Thread(target=bot.infinity_polling, daemon=True)
        thread.start()


from .handlers.report import (  # noqa
    report,
    report_new_user,
    report_user_modification,
    report_user_deletion,
    report_status_change,
    report_user_usage_reset,
    report_user_data_reset_by_next,
    report_user_subscription_revoked,
    report_login,
)

__all__ = [
    "bot",
    "apply_apihelper_proxy",
    "report",
    "report_new_user",
    "report_user_modification",
    "report_user_deletion",
    "report_status_change",
    "report_user_usage_reset",
    "report_user_data_reset_by_next",
    "report_user_subscription_revoked",
    "report_login",
]
