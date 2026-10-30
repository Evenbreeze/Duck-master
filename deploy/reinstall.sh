#!/usr/bin/env bash
# 主控干净重装：停旧容器 →（可选）清空数据 → 拉最新代码 → 走 install.sh
#
# 保留数据库与证书（默认，仅重建面板）：
#   sudo env DOMAIN=... EMAIL=... ADMIN_USER=... ADMIN_PASSWORD='...' bash reinstall.sh
#
# 完全清空 /var/lib/marzban（慎用，用户/节点数据会没）：
#   sudo env DUCK_WIPE_DATA=1 DOMAIN=... ... bash reinstall.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="/opt/marzban/docker-compose.yml"

red() { echo -e "\033[31m$*\033[0m" >&2; }
green() { echo -e "\033[32m$*\033[0m"; }
yellow() { echo -e "\033[33m$*\033[0m"; }

[[ "$(id -u)" -eq 0 ]] || { red "请 sudo 运行"; exit 1; }

for v in DOMAIN EMAIL ADMIN_USER ADMIN_PASSWORD; do
  if [[ -z "${!v:-}" ]]; then
    red "缺少环境变量 ${v}。例: sudo env DOMAIN=... EMAIL=... ADMIN_USER=... ADMIN_PASSWORD='...' bash reinstall.sh"
    exit 1
  fi
done

green "=== Duck 干净重装 ==="

if [[ -d "${REPO_ROOT}/.git" ]]; then
  green "更新仓库..."
  git -C "${REPO_ROOT}" pull --ff-only
fi

if ! grep -q '2026-03-30-panel-check' "${SCRIPT_DIR}/install.sh"; then
  red "install.sh 版本过旧，请先 git pull"
  exit 1
fi

green "停止旧面板..."
docker rm -f duck-panel 2>/dev/null || true
if [[ -f "$COMPOSE_FILE" ]]; then
  docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true
fi

if [[ "${DUCK_WIPE_DATA:-0}" == "1" ]]; then
  yellow "清空 /var/lib/marzban ..."
  rm -rf /var/lib/marzban/*
fi

export DUCK_FRESH_INSTALL=1
export DUCK_SRC="${REPO_ROOT}"
cd "${SCRIPT_DIR}"
exec env DOMAIN="$DOMAIN" EMAIL="$EMAIL" ADMIN_USER="$ADMIN_USER" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  ${DUCK_SKIP_DNS_CHECK:+DUCK_SKIP_DNS_CHECK=$DUCK_SKIP_DNS_CHECK} \
  ${DUCK_PORT_RANDOM:+DUCK_PORT_RANDOM=$DUCK_PORT_RANDOM} \
  bash install.sh
