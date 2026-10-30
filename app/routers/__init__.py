from fastapi import APIRouter
from . import (
    admin,
    core,
    home,
    node,
    subscription,
    system,
    telegram_settings,
    user,
    user_template,
)

api_router = APIRouter()

routers = [
    admin.router,
    core.router,
    node.router,
    subscription.router,
    system.router,
    user_template.router,
    user.router,
    home.router,
    telegram_settings.router,
]

for router in routers:
    api_router.include_router(router)

__all__ = ["api_router"]