from fastapi import APIRouter
from . import (
    admin,
    core,
    home,
    node,
    node_enroll,
    subscription,
    system,
    telegram_settings,
    user,
)

api_router = APIRouter()

routers = [
    admin.router,
    core.router,
    node_enroll.router,  # 须在 node 前：/node/bootstrap.sh 勿被 /node/{node_id} 吃掉
    node.router,
    subscription.router,
    system.router,
    user.router,
    home.router,
    telegram_settings.router,
]

for router in routers:
    api_router.include_router(router)

__all__ = ["api_router"]
