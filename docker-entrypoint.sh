#!/usr/bin/env bash
# 容器启动：APScheduler 3.9 在 import 时硬依赖 pkg_resources（setuptools 提供）。
# 多阶段 COPY site-packages 在旧缓存镜像里可能缺 setuptools，此处兜底，避免 Restarting 循环。
set -euo pipefail

if ! python -c "import pkg_resources" >/dev/null 2>&1; then
  echo "[entrypoint] 安装 setuptools（提供 pkg_resources）..."
  python -m pip install --no-cache-dir 'setuptools>=69.0.0'
fi

alembic upgrade head
exec python main.py
