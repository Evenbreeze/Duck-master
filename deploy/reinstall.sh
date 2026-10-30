#!/usr/bin/env bash
# 拉最新代码 → install.sh
# sudo env DOMAIN=... EMAIL=... ADMIN_USER=... ADMIN_PASSWORD='...' bash reinstall.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

[[ "$(id -u)" -eq 0 ]] || { echo "请 sudo 运行" >&2; exit 1; }
for v in DOMAIN EMAIL ADMIN_USER ADMIN_PASSWORD; do
  [[ -n "${!v:-}" ]] || { echo "缺少 $v" >&2; exit 1; }
done

if [[ -d "${REPO_ROOT}/.git" ]]; then
  git -C "${REPO_ROOT}" fetch origin
  git -C "${REPO_ROOT}" show-ref -q refs/remotes/origin/main && \
    git -C "${REPO_ROOT}" reset --hard origin/main || \
    git -C "${REPO_ROOT}" reset --hard origin/master 2>/dev/null || \
    git -C "${REPO_ROOT}" reset --hard FETCH_HEAD
fi

DUCK_SRC="${REPO_ROOT}" bash "${SCRIPT_DIR}/preflight.sh"
docker rm -f duck-panel 2>/dev/null || true
docker compose -f /opt/marzban/docker-compose.yml down 2>/dev/null || true
[[ "${DUCK_WIPE_DATA:-0}" == "1" ]] && rm -rf /var/lib/marzban/*

cd "${SCRIPT_DIR}"
exec env DUCK_SRC="${REPO_ROOT}" DUCK_FRESH_INSTALL=1 \
  DOMAIN="$DOMAIN" EMAIL="$EMAIL" ADMIN_USER="$ADMIN_USER" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  ${DUCK_SKIP_DNS_CHECK:+DUCK_SKIP_DNS_CHECK=$DUCK_SKIP_DNS_CHECK} \
  bash install.sh
