#!/usr/bin/env bash
# 本地改代码后，同步到服务器并重建 Duck 镜像
# 用法: DUCK_SRC=/path/to/repo bash update.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DUCK_SRC="${DUCK_SRC:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
MARZBAN_DIR="/opt/marzban"

[[ "$(id -u)" -eq 0 ]] || { echo "请 root 运行"; exit 1; }

rsync -a --delete \
  --exclude '.git' --exclude 'node_modules' --exclude 'venv' --exclude '.venv' \
  --exclude 'db.sqlite3' \
  "${DUCK_SRC}/" /opt/duck/source/

duck update
echo "Duck 已更新并重启"
