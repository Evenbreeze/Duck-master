#!/usr/bin/env bash
# 安装前自检。通过则打印 preflight OK
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${DUCK_SRC:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
DEPLOY="${ROOT}/deploy"
[[ -f "${SCRIPT_DIR}/install.sh" ]] && DEPLOY="${SCRIPT_DIR}" && ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

red() { echo -e "\033[31m$*\033[0m" >&2; }
green() { echo -e "\033[32m$*\033[0m"; }
fail() { red "preflight 失败: $*"; exit 1; }

check_grep() { grep -q "$2" "$1" || fail "$1 缺少: $2"; }
check_not() {
  if grep -q "$2" "$1"; then fail "$1 仍含: $2"; fi
}

[[ -f "${DEPLOY}/install.sh" ]] || fail "找不到 deploy/install.sh"
[[ -f "${ROOT}/Dockerfile" ]] || fail "找不到 Dockerfile"

check_grep "${DEPLOY}/install.sh" '2026-10-30'
check_grep "${ROOT}/requirements.txt" 'APScheduler==3.10'
check_grep "${ROOT}/Dockerfile" "import apscheduler; print('Duck image deps OK')"
check_not "${ROOT}/Dockerfile" 'import pkg_resources'
check_grep "${ROOT}/app/dashboard/__init__.py" '_normalize_dashboard_static_files'
[[ -f "${DEPLOY}/lib/repo-sync.sh" ]] || fail "缺少 deploy/lib/repo-sync.sh"

green "preflight OK"
