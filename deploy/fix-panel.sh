#!/usr/bin/env bash
# 重建面板镜像（白屏/Restarting 时用）。前提：~/Duck-master 已 git pull
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/repo-sync.sh
source "${SCRIPT_DIR}/lib/repo-sync.sh"
COMPOSE="${COMPOSE_FILE:-/opt/marzban/docker-compose.yml}"

[[ "$(id -u)" -eq 0 ]] || { echo "请 sudo 运行" >&2; exit 1; }

repo="$(duck_pick_repo_root "${SCRIPT_DIR}")" || { echo "找不到 Duck 源码" >&2; exit 1; }
duck_rsync_repo_to_opt_source "${repo}"
duck_install_opt_deploy_files "${repo}/deploy"

DUCK_SRC="${repo}" bash "${SCRIPT_DIR}/preflight.sh"
docker compose -f "$COMPOSE" build --no-cache panel
docker run --rm --entrypoint python duck-panel:latest -c "import apscheduler; print('OK')"
docker compose -f "$COMPOSE" up -d --force-recreate panel

for _ in $(seq 1 36); do
  docker inspect -f '{{.State.Status}}' duck-panel 2>/dev/null | grep -qx running \
    && ss -tlnp | grep -q ':8000 ' && { echo "面板已就绪"; exit 0; }
  sleep 5
done
docker logs duck-panel --tail 40
exit 1
