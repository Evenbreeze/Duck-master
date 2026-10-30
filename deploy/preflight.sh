#!/usr/bin/env bash
# 安装前自检。通过则打印 preflight OK
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ROOT = 含 Dockerfile 的源码树；DEPLOY = 用于检查的 deploy 目录（优先 DUCK_SRC/deploy）
if [[ -n "${DUCK_SRC:-}" ]]; then
  ROOT="${DUCK_SRC}"
  DEPLOY="${DUCK_SRC}/deploy"
else
  ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
  DEPLOY="${SCRIPT_DIR}"
fi
if [[ ! -f "${DEPLOY}/install.sh" ]]; then
  DEPLOY="${SCRIPT_DIR}"
fi
if [[ ! -f "${ROOT}/Dockerfile" && -f /opt/duck/source/Dockerfile ]]; then
  ROOT=/opt/duck/source
  [[ -f "${ROOT}/deploy/install.sh" ]] && DEPLOY="${ROOT}/deploy"
fi

red() { echo -e "\033[31m$*\033[0m" >&2; }
green() { echo -e "\033[32m$*\033[0m"; }
fail() { red "preflight 失败: $*"; exit 1; }

check_grep() { grep -q "$2" "$1" || fail "$1 缺少: $2"; }
check_not() {
  if grep -q "$2" "$1"; then fail "$1 仍含: $2"; fi
}

[[ -f "${DEPLOY}/install.sh" ]] || fail "找不到 deploy/install.sh"
[[ -f "${ROOT}/Dockerfile" ]] || fail "找不到 Dockerfile（可设 DUCK_SRC=含 Dockerfile 的目录）"

check_grep "${DEPLOY}/install.sh" '2026-10-30'
check_grep "${ROOT}/requirements.txt" 'APScheduler==3.10'
check_grep "${ROOT}/Dockerfile" "VITE_BASE_API=/api/"
check_grep "${ROOT}/Dockerfile" "import apscheduler; print('Duck image deps OK')"
check_not "${ROOT}/Dockerfile" 'import pkg_resources'
check_grep "${ROOT}/app/dashboard/__init__.py" '_normalize_dashboard_static_files'
check_grep "${DEPLOY}/env.template" 'sqlite:////var/lib/marzban'
[[ -f "${DEPLOY}/lib/repo-sync.sh" ]] || fail "缺少 deploy/lib/repo-sync.sh"

green "preflight OK"
