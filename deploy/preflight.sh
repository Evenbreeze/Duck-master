#!/usr/bin/env bash
# 安装前一次性自检。失败 exit 1；通过打印 preflight OK
# 可从 git clone 的 deploy/ 或 /opt/duck/deploy 运行（后者需已 sync 过源码到 /opt/duck/source）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

red() { echo -e "\033[31m$*\033[0m" >&2; }
green() { echo -e "\033[32m$*\033[0m"; }
yellow() { echo -e "\033[33m$*\033[0m"; }

fail() { red "preflight 失败: $*"; exit 1; }

check_file() {
  [[ -f "$1" ]] || fail "缺少文件 $1"
}

check_grep() {
  grep -q "$2" "$1" || fail "$1 中未找到: $2"
}

check_not_grep() {
  grep -q "$2" "$1" && fail "$1 仍含旧内容: $2"
}

# 仓库根（含 Dockerfile）与 deploy 目录
resolve_paths() {
  if [[ -n "${DUCK_SRC:-}" && -f "${DUCK_SRC}/Dockerfile" && -f "${DUCK_SRC}/deploy/install.sh" ]]; then
    ROOT="${DUCK_SRC}"
    DEPLOY="${DUCK_SRC}/deploy"
    return 0
  fi
  if [[ -f "${SCRIPT_DIR}/install.sh" && -f "${SCRIPT_DIR}/../Dockerfile" ]]; then
    DEPLOY="${SCRIPT_DIR}"
    ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
    return 0
  fi
  if [[ -f /opt/duck/source/Dockerfile && -f /opt/duck/source/deploy/install.sh ]]; then
    ROOT="/opt/duck/source"
    DEPLOY="/opt/duck/source/deploy"
    return 0
  fi
  if [[ -f /opt/duck/deploy/install.sh && -f /opt/duck/source/Dockerfile ]]; then
    ROOT="/opt/duck/source"
    DEPLOY="/opt/duck/deploy"
    return 0
  fi
  if [[ -f /opt/duck/source/Dockerfile ]]; then
    ROOT="/opt/duck/source"
    DEPLOY="${SCRIPT_DIR}"
    return 0
  fi
  fail "无法定位 Duck 源码（设置 DUCK_SRC=仓库根，或在 clone 的 deploy/ 下运行）"
}

resolve_paths

green "preflight: 仓库 ${ROOT}  deploy ${DEPLOY}"

green "preflight: 检查 deploy 脚本..."
check_grep "${DEPLOY}/install.sh" '2026-10-30-full-audit'
check_grep "${DEPLOY}/env.template" 'sqlite:////var/lib/marzban/db.sqlite3'
check_grep "${DEPLOY}/ports-lib.sh" 'return 0'
check_grep "${DEPLOY}/docker-compose.yml" 'entrypoint:'
check_file "${DEPLOY}/reinstall.sh"
check_file "${DEPLOY}/preflight.sh"
check_file "${DEPLOY}/lib/repo-sync.sh"
check_file "${DEPLOY}/acme-install-cert.sh"

green "preflight: 检查应用与镜像..."
check_file "${ROOT}/docker-entrypoint.sh"
check_grep "${ROOT}/requirements.txt" 'APScheduler==3.10'
check_grep "${ROOT}/requirements.txt" 'setuptools>='
check_grep "${ROOT}/Dockerfile" "import apscheduler; print('Duck image deps OK')"
check_not_grep "${ROOT}/Dockerfile" 'import pkg_resources'
check_grep "${ROOT}/Dockerfile" 'PYTHON_LIB_PATH=/usr/local/lib/python3.12/site-packages'
check_grep "${ROOT}/docker-entrypoint.sh" 'import apscheduler'

PANEL_TEST="${DEPLOY}/lib/panel-image-test.sh"
[[ -f "$PANEL_TEST" ]] || PANEL_TEST="${SCRIPT_DIR}/lib/panel-image-test.sh"
check_file "$PANEL_TEST"
check_not_grep "$PANEL_TEST" 'pkg_resources'

if [[ -f /opt/duck/source/Dockerfile && "${ROOT}/Dockerfile" != /opt/duck/source/Dockerfile ]]; then
  if grep -q 'import pkg_resources' /opt/duck/source/Dockerfile 2>/dev/null; then
    yellow "preflight: /opt/duck/source 仍是旧 Dockerfile；install/fix-panel 会 rsync 覆盖"
  fi
fi

green "preflight OK — 可以运行 install.sh / reinstall.sh"
