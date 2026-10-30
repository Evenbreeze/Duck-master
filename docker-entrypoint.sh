#!/usr/bin/env bash
# alembic → app/__init__ → APScheduler 需要 pkg_resources；启动时强制补齐 setuptools。
set -euo pipefail

echo "[entrypoint] 确保 setuptools ..."
python -m pip install --no-cache-dir 'setuptools>=69.0.0'
python -c "import apscheduler; print('[entrypoint] apscheduler OK')"

alembic upgrade head
exec python main.py
