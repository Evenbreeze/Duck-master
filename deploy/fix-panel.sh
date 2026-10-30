#!/usr/bin/env bash
# 面板 Restarting / 8000 无监听 — 同步源码、preflight、无缓存重建
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DEPLOY_DIR="${DUCK_DEPLOY:-/opt/duck/deploy}"
if [[ ! -f "${DEPLOY_DIR}/lib/panel-image-test.sh" && -f "${SCRIPT_DIR}/lib/panel-image-test.sh" ]]; then
  DEPLOY_DIR="${SCRIPT_DIR}"
fi
COMPOSE_FILE="${COMPOSE_FILE:-/opt/marzban/docker-compose.yml}"

red() { echo -e "\033[31m$*\033[0m" >&2; }
green() { echo -e "\033[32m$*\033[0m"; }

need_root() {
  [[ "$(id -u)" -eq 0 ]] || { red "请 root 或 sudo 运行"; exit 1; }
}

load_repo_sync() {
  local f
  for f in "${SCRIPT_DIR}/lib/repo-sync.sh" /opt/duck/deploy/lib/repo-sync.sh /opt/duck/source/deploy/lib/repo-sync.sh; do
    if [[ -f "$f" ]]; then
      # shellcheck source=lib/repo-sync.sh
      source "$f"
      return 0
    fi
  done
  red "缺少 deploy/lib/repo-sync.sh，请 git pull 后从 ~/Duck-master/deploy 运行"
  exit 1
}

sync_source_if_repo() {
  local repo deploy_src
  repo="$(duck_pick_repo_root "${SCRIPT_DIR}")" || {
    red "找不到 Duck 源码（先 git clone 到 ~/Duck-master 或 install.sh）"
    exit 1
  }
  deploy_src="${repo}/deploy"
  [[ -f "${deploy_src}/install.sh" ]] || deploy_src="${SCRIPT_DIR}"

  if [[ "$(readlink -f "${repo}" 2>/dev/null || echo "${repo}")" != "$(readlink -f /opt/duck/source 2>/dev/null || echo /opt/duck/source)" ]]; then
    green "同步 ${repo} -> /opt/duck/source ..."
    duck_rsync_repo_to_opt_source "${repo}"
  fi
  duck_install_opt_deploy_files "${deploy_src}"
  export DUCK_SRC="/opt/duck/source"
}

need_root
load_repo_sync
sync_source_if_repo

PREFLIGHT="${SCRIPT_DIR}/preflight.sh"
[[ -f "$PREFLIGHT" ]] || PREFLIGHT="/opt/duck/source/deploy/preflight.sh"
DUCK_SRC="/opt/duck/source" bash "$PREFLIGHT"

[[ -f "$COMPOSE_FILE" ]] || { red "缺少 $COMPOSE_FILE，请先 install.sh"; exit 1; }

if grep -q 'import pkg_resources' /opt/duck/source/Dockerfile 2>/dev/null; then
  red "/opt/duck/source/Dockerfile 仍是旧版，请 Push 后 git pull / reinstall"
  exit 1
fi

cp -f /opt/duck/deploy/docker-compose.yml "$COMPOSE_FILE"

green "=== 无缓存重建 duck-panel（约 5～15 分钟）==="
docker compose -f "$COMPOSE_FILE" build --no-cache panel
docker compose -f "$COMPOSE_FILE" up -d --force-recreate panel

green "=== 检查镜像内 Python 依赖 ==="
docker run --rm --entrypoint python duck-panel:latest -c \
  "import apscheduler; print('panel-image-test OK')"

green "=== 等待面板监听 8000（最多 3 分钟）==="
for i in $(seq 1 36); do
  st="$(docker inspect -f '{{.State.Status}}' duck-panel 2>/dev/null || true)"
  if [[ "$st" == "exited" || "$st" == "dead" ]]; then
    red "duck-panel 已退出（${st}）。日志："
    docker logs duck-panel --tail 50
    exit 1
  fi
  if [[ "$st" == "restarting" ]] && (( i >= 3 )); then
    red "duck-panel 反复重启。日志："
    docker logs duck-panel --tail 40
    exit 1
  fi
  if [[ "$st" == "running" ]] && ss -tlnp 2>/dev/null | grep -q ':8000 '; then
    green "面板已就绪。"
    echo "  后台: https://<你的域名>:8000/dashboard/"
    echo "  若未创建管理员: duck cli admin create --sudo"
    exit 0
  fi
  sleep 5
done

red "面板仍未就绪。最近日志："
docker logs duck-panel --tail 40
exit 1
