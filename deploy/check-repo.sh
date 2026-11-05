#!/usr/bin/env bash
# 仓库完整性（缺文件会在 CI / preflight 前拦住，避免装完容器才崩）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required=(
  app/subscription/singbox.py
  app/subscription/clash.py
  app/subscription/outline.py
  app/subscription/v2ray.py
  app/subscription/share.py
  app/xray/errors.py
  app/templates/clash/default.yml
  app/templates/clash/settings.yml
  app/templates/singbox/default.json
  app/templates/singbox/settings.json
  deploy/duck.sh
  deploy/duck-lib.sh
  deploy/env.template
  deploy/xray_config.template.json
  Dockerfile
  docker-entrypoint.sh
  requirements.txt
)

missing=0
for f in "${required[@]}"; do
  if [[ ! -f "$ROOT/$f" ]]; then
    echo "缺少: $f" >&2
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  exit 1
fi

# 曾导致 CI 红：循环 import、Dockerfile 构建阶段跑 smoke
if grep -q 'from app.xray.node import NodeAPIError' "$ROOT/app/xray/duck_node_client.py"; then
  echo "duck_node_client 必须从 app.xray.errors 导入 NodeAPIError（勿从 node）" >&2
  exit 1
fi
if grep -E 'RUN .*panel-boot-smoke\.py' "$ROOT/Dockerfile"; then
  echo "Dockerfile 不得在镜像 RUN 里执行 panel-boot-smoke（见 ci.yml 单独步骤）" >&2
  exit 1
fi

echo "check-repo OK"
