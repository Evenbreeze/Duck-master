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
  app/templates/clash/default.yml
  app/templates/singbox/default.json
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

echo "check-repo OK"
