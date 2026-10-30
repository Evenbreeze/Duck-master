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

# 先拉代码（不依赖 repo-sync.sh，避免旧服务器上 source 失败）
if [[ -d "${REPO_ROOT}/.git" ]]; then
  green "同步仓库到 origin（丢弃服务器上对仓库的手改）..."
  git -C "${REPO_ROOT}" fetch origin
  if git -C "${REPO_ROOT}" show-ref -q refs/remotes/origin/main; then
    git -C "${REPO_ROOT}" reset --hard origin/main
  elif git -C "${REPO_ROOT}" show-ref -q refs/remotes/origin/master; then
    git -C "${REPO_ROOT}" reset --hard origin/master
  else
    yellow "未找到 origin/main 或 origin/master，使用 FETCH_HEAD"
    git -C "${REPO_ROOT}" reset --hard FETCH_HEAD
  fi
fi

if [[ ! -f "${SCRIPT_DIR}/lib/repo-sync.sh" ]]; then
  red "缺少 ${SCRIPT_DIR}/lib/repo-sync.sh — 请确认 GitHub 已 Push 最新 deploy/lib/"
  exit 1
fi
# shellcheck source=lib/repo-sync.sh
source "${SCRIPT_DIR}/lib/repo-sync.sh"

if ! DUCK_SRC="${REPO_ROOT}" bash "${SCRIPT_DIR}/preflight.sh"; then
  red "preflight 未通过，reinstall 已中止。请修正上方红色报错后重试。"
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

cd "${SCRIPT_DIR}"
exec env \
  DUCK_SRC="${REPO_ROOT}" \
  DUCK_FRESH_INSTALL=1 \
  DOMAIN="$DOMAIN" \
  EMAIL="$EMAIL" \
  ADMIN_USER="$ADMIN_USER" \
  ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  ${DUCK_SKIP_DNS_CHECK:+DUCK_SKIP_DNS_CHECK=$DUCK_SKIP_DNS_CHECK} \
  ${DUCK_PORT_RANDOM:+DUCK_PORT_RANDOM=$DUCK_PORT_RANDOM} \
  bash install.sh
