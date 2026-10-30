#!/usr/bin/env bash
# 面板 Restarting / pkg_resources / 8000 无监听 — 一次性重建并自检
set -euo pipefail

DEPLOY_DIR="${DUCK_DEPLOY:-/opt/duck/deploy}"
if [[ ! -f "${DEPLOY_DIR}/lib/panel-image-test.sh" ]]; then
  DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
COMPOSE_FILE="${COMPOSE_FILE:-/opt/marzban/docker-compose.yml}"
SRC="${DUCK_SRC:-/opt/duck/source}"

red() { echo -e "\033[31m$*\033[0m" >&2; }
green() { echo -e "\033[32m$*\033[0m"; }
yellow() { echo -e "\033[33m$*\033[0m"; }

need_root() {
  [[ "$(id -u)" -eq 0 ]] || { red "请 root 或 sudo 运行"; exit 1; }
}

need_root

[[ -f "$COMPOSE_FILE" ]] || { red "缺少 $COMPOSE_FILE，请先 install.sh"; exit 1; }
[[ -f "$SRC/requirements.txt" ]] || { red "缺少 $SRC/requirements.txt"; exit 1; }

grep -q '^setuptools' "$SRC/requirements.txt" || echo 'setuptools>=69.0.0' >> "$SRC/requirements.txt"

if ! grep -q 'Duck image deps OK' "$SRC/Dockerfile" 2>/dev/null; then
  yellow "源码过旧：请先在 ~/Duck-master 上 git pull，再 rsync 到 /opt/duck/source"
fi

cp -f "${DEPLOY_DIR}/docker-compose.yml" "$COMPOSE_FILE"
green "=== 无缓存重建 duck-panel（约 5～15 分钟）==="
docker compose -f "$COMPOSE_FILE" build --no-cache panel
docker compose -f "$COMPOSE_FILE" up -d --force-recreate panel
# 旧镜像无 entrypoint 时，启动脚本会在容器内 pip install setuptools

# shellcheck source=lib/panel-image-test.sh
source "${DEPLOY_DIR}/lib/panel-image-test.sh"
green "=== 检查镜像内 Python 依赖 ==="
panel_image_test_imports duck-panel:latest

green "=== 等待面板监听 8000（最多 3 分钟）==="
for _ in $(seq 1 36); do
  if docker inspect -f '{{.State.Status}}' duck-panel 2>/dev/null | grep -qx running; then
    if ss -tlnp 2>/dev/null | grep -q ':8000 '; then
      green "面板已就绪。"
      echo "  后台: https://<你的域名>:8000/dashboard/"
      echo "  若未创建管理员: duck cli admin create --sudo"
      exit 0
    fi
  fi
  sleep 5
done

red "面板仍未就绪。最近日志："
docker logs duck-panel --tail 40
exit 1
