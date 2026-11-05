#!/usr/bin/env bash
# Duck 主控：安装 / 更新 / 运维（唯一入口脚本）
#   bash duck.sh preflight
#   sudo bash duck.sh install
#   sudo env DOMAIN=... EMAIL=... ADMIN_USER=... ADMIN_PASSWORD='...' bash duck.sh reinstall
#   sudo duck upgrade          # 日常：GitHub 拉代码 + 重建（推荐）
#   sudo bash duck.sh fix      # 不拉 git，只用本地目录
#   duck status | restart | logs | cli ...
set -Eeuo pipefail

DUCK_DEPLOY_SCRIPT_REV="2026-11-07"
DUCK_DIR="/opt/duck"
DATA_DIR="/var/lib/duck"
CERT_DIR="${DATA_DIR}/certs"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/duck/docker-compose.yml}"
SERVICE="${DUCK_SERVICE:-panel}"

# shellcheck source=duck-lib.sh
source "${SCRIPT_DIR}/duck-lib.sh"

red() { echo -e "\033[31m$*\033[0m" >&2; }
green() { echo -e "\033[32m$*\033[0m"; }
yellow() { echo -e "\033[33m$*\033[0m"; }

dc() { docker compose -f "$COMPOSE_FILE" "$@"; }

duck_install_err() {
  local ec=${2:-1} line=${1:-?}
  red "安装失败 (exit ${ec}, 约第 ${line} 行): ${BASH_COMMAND}"
  exit "$ec"
}

install_step() {
  echo "[install] $*"
}

need_root() {
  [[ "$(id -u)" -eq 0 ]] || { red "请 sudo 运行"; exit 1; }
}

public_ip() {
  curl -s -4 --max-time 8 https://ifconfig.me/ip 2>/dev/null \
    || curl -s -4 --max-time 8 https://api.ip.sb/ip 2>/dev/null || true
}

domain_ip() {
  local d="$1" ip=""
  ip="$(dig +short A "$d" 2>/dev/null | grep -E '^[0-9.]+$' | tail -1 || true)"
  [[ -n "$ip" ]] || ip="$(getent ahostsv4 "$d" 2>/dev/null | awk '{print $1; exit}' || true)"
  echo "$ip"
}

duck_resolve_paths() {
  DUCK_SRC="${DUCK_SRC:-$(duck_pick_repo_root "${SCRIPT_DIR}" 2>/dev/null || true)}"
  DUCK_SRC="${DUCK_SRC:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
  DEPLOY_DIR="${DUCK_SRC}/deploy"
  if [[ ! -f "${DEPLOY_DIR}/duck.sh" ]]; then
    DEPLOY_DIR="${SCRIPT_DIR}"
  fi
}

cmd_preflight() {
  duck_preflight "${SCRIPT_DIR}"
}

cmd_acme_cert() {
  local domain="${1:-}"
  [[ -n "$domain" ]] || { echo "用法: duck acme-cert <domain>" >&2; exit 1; }
  local src="${HOME}/.acme.sh/${domain}_ecc"
  [[ -d "$src" ]] || src="${HOME}/.acme.sh/${domain}"
  install -d "$CERT_DIR"
  cp "${src}/${domain}.cer" "${CERT_DIR}/${domain}.cer"
  cp "${src}/${domain}.key" "${CERT_DIR}/${domain}.cer.key"
  chmod 644 "${CERT_DIR}/${domain}.cer" "${CERT_DIR}/${domain}.cer.key"
  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx duck-panel; then
    if command -v duck >/dev/null 2>&1; then
      duck restart || true
    elif [[ -f /opt/duck/docker-compose.yml ]]; then
      docker compose -f /opt/duck/docker-compose.yml restart panel || true
    fi
  fi
  echo "[acme] 证书已安装: ${domain}"
}

cmd_compose() {
  case "${1:-}" in
    up|start)   dc up -d --build --force-recreate "$SERVICE" ;;
    restart)    dc up -d --force-recreate "$SERVICE" ;;
    stop|down)  dc down ;;
    logs)       shift; dc logs -f "$SERVICE" "$@" ;;
    status)     dc ps ;;
    cli)        shift; dc exec -T "$SERVICE" duck-cli "$@" ;;
    rebuild) dc build --no-cache "$SERVICE"; dc up -d --force-recreate "$SERVICE" ;;
    ports)      cat /var/lib/duck/duck-ports.env 2>/dev/null || cat /var/lib/duck/xray_config.json ;;
    "")         dc ps ;;
    *)
      echo "duck: up | restart | logs | status | cli | rebuild | ports | upgrade" >&2
      exit 1
      ;;
  esac
}

confirm_or_exit() {
  yellow "$1"
  [[ -z "${DUCK_NONINTERACTIVE:-}" ]] || { red "非交互安装无法暂停，请修正 DNS 后重试"; exit 1; }
  read -rp "仍继续? [y/N]: " ok
  [[ "${ok,,}" == "y" ]] || exit 1
}

validate_domain() {
  DOMAIN="${DOMAIN// /}"
  DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN#http://}"
  DOMAIN="${DOMAIN%%/*}"; DOMAIN="${DOMAIN%%:*}"
  local sip dip
  sip="$(public_ip)"
  dip="$(domain_ip "$DOMAIN" || true)"
  if [[ -n "$sip" && -n "$dip" && "$sip" != "$dip" ]]; then
    if [[ "${DUCK_SKIP_DNS_CHECK:-}" == "1" ]]; then
      yellow "DNS 警告已跳过"
      return 0
    fi
    confirm_or_exit "域名 ${DOMAIN} -> ${dip}，本机 ${sip}"
  fi
}

prompt_vars() {
  if [[ -z "${DOMAIN:-}" ]]; then
    green "=== Duck 主控安装 ==="
    read -rp "面板域名: " DOMAIN
  fi
  if [[ -z "${EMAIL:-}" ]]; then
    read -rp "Let's Encrypt 邮箱: " EMAIL
  fi
  if [[ -z "${ADMIN_USER:-}" ]]; then
    read -rp "管理员用户名 [admin]: " ADMIN_USER
    ADMIN_USER="${ADMIN_USER:-admin}"
  fi
  if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
    read -rsp "管理员密码: " ADMIN_PASSWORD
    echo ""
    [[ -n "$ADMIN_PASSWORD" ]] || { red "密码不能为空"; exit 1; }
  fi
  local port_interactive=1
  if [[ -n "${DOMAIN:-}${EMAIL:-}${ADMIN_USER:-}${ADMIN_PASSWORD:-}" ]]; then
    port_interactive=0
    export DUCK_NONINTERACTIVE=1
  fi
  if ! duck_resolve_proxy_ports "$port_interactive"; then
    red "代理端口配置失败"
    exit 1
  fi
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    return 0
  fi
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker 2>/dev/null || true
}

ensure_host_deps() {
  if ! command -v apt-get >/dev/null 2>&1; then
    red "主控 install 目前仅支持 Debian/Ubuntu（需 apt-get）"
    exit 1
  fi
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq git curl ca-certificates python3 dnsutils rsync
  install_docker
  if ! command -v docker >/dev/null 2>&1; then
    red "Docker 未安装成功，请检查 get.docker.com 输出后重试"
    exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    red "缺少 docker compose 插件，请重装 Docker 后重试"
    exit 1
  fi
}

ensure_duck_dirs() { install -d "$DUCK_DIR" "$DATA_DIR" "$CERT_DIR"; }

sync_duck_source() {
  duck_resolve_paths
  [[ -f "${DUCK_SRC}/Dockerfile" ]] || { red "找不到源码，设置 DUCK_SRC"; exit 1; }
  echo "[5/6] 同步源码 -> /opt/duck/source ..."
  install -d "$DUCK_DIR"
  duck_rsync_repo_to_opt_source "${DUCK_SRC}"
  duck_install_opt_deploy_files "${DEPLOY_DIR}"
}

build_duck_image() {
  echo "[5/6] 构建镜像（首次较慢）..."
  install_docker
  sync_duck_source
  if grep -q 'import pkg_resources' /opt/duck/source/Dockerfile 2>/dev/null; then
    red "Dockerfile 过旧，请 Push 后 git pull"; exit 1
  fi
  docker compose -f "${DUCK_DIR}/docker-compose.yml" build --no-cache panel
  duck_panel_image_smoke duck-panel:latest
}

install_acme() {
  if [[ ! -x "${HOME}/.acme.sh/acme.sh" ]]; then
    curl -fsSL https://get.acme.sh | sh -s "email=${EMAIL}"
  fi
  export PATH="${HOME}/.acme.sh:${PATH}"
  [[ -x "${HOME}/.acme.sh/acme.sh" ]] || { red "acme.sh 安装失败"; exit 1; }
}

acme_reloadcmd() {
  echo "bash /opt/duck/deploy/duck.sh acme-cert ${DOMAIN}"
}

issue_cert() {
  ensure_duck_dirs
  duck_resolve_paths
  duck_install_opt_deploy_files "${DEPLOY_DIR}"
  if [[ -s "${CERT_DIR}/${DOMAIN}.cer" && -s "${CERT_DIR}/${DOMAIN}.cer.key" ]]; then
    green "[3/6] 证书已存在，跳过"
    "${HOME}/.acme.sh/acme.sh" --install-cert -d "$DOMAIN" \
      --reloadcmd "$(acme_reloadcmd)" 2>/dev/null || true
    return 0
  fi
  echo "[3/6] 申请证书..."
  if ss -tlnp 2>/dev/null | grep -q ':80 '; then
    red "80 端口被占用"; exit 1
  fi
  "${HOME}/.acme.sh/acme.sh" --issue -d "$DOMAIN" --standalone --httpport 80 --force
  "${HOME}/.acme.sh/acme.sh" --install-cert -d "$DOMAIN" --reloadcmd "$(acme_reloadcmd)"
  bash /opt/duck/deploy/duck.sh acme-cert "$DOMAIN"
}

write_config() {
  echo "[4/6] 写入配置..."
  ensure_duck_dirs
  duck_resolve_paths
  sed "s|__DOMAIN__|${DOMAIN}|g" "${DEPLOY_DIR}/env.template" \
    | sed "s|__PORT_VLESS__|${DUCK_PORT_VLESS}|g" \
    | sed "s|__PORT_VMESS__|${DUCK_PORT_VMESS}|g" \
    | sed "s|__PORT_TROJAN__|${DUCK_PORT_TROJAN}|g" \
    | sed "s|__PORT_SS__|${DUCK_PORT_SS}|g" \
    > "${DUCK_DIR}/.env"
  sed "s|__DOMAIN__|${DOMAIN}|g" "${DEPLOY_DIR}/xray_config.template.json" \
    | sed "s|__PORT_VLESS__|${DUCK_PORT_VLESS}|g" \
    | sed "s|__PORT_VMESS__|${DUCK_PORT_VMESS}|g" \
    | sed "s|__PORT_TROJAN__|${DUCK_PORT_TROJAN}|g" \
    | sed "s|__PORT_SS__|${DUCK_PORT_SS}|g" \
    > "${DATA_DIR}/xray_config.json"
  if ! duck_apply_proxy_ports "${DATA_DIR}/xray_config.json" "${DATA_DIR}/duck-ports.env"; then
    red "写入代理端口失败"
    exit 1
  fi
}

verify_panel_ssl_files() {
  local cert="${CERT_DIR}/${DOMAIN}.cer" key="${CERT_DIR}/${DOMAIN}.cer.key"
  if [[ ! -s "$cert" || ! -s "$key" ]]; then
    red "缺少 TLS 证书: ${cert} 或 ${key}"
    red "请确认域名 ${DOMAIN} 已解析到本机且 80 空闲，然后重跑: bash deploy/duck.sh install"
    exit 1
  fi
}

wait_for_panel_port() {
  local i st restarts
  for i in $(seq 1 40); do
    st="$(docker inspect -f '{{.State.Status}}' duck-panel 2>/dev/null || true)"
    restarts="$(docker inspect -f '{{.RestartCount}}' duck-panel 2>/dev/null || echo 0)"
    if [[ "$st" == "exited" || "$st" == "dead" ]]; then
      red "duck-panel 已退出"
      docker logs duck-panel --tail 60
      exit 1
    fi
    if [[ "$st" == "restarting" ]] || [[ "${restarts:-0}" -ge 3 ]]; then
      red "duck-panel 反复重启 (status=${st}, restarts=${restarts})"
      docker logs duck-panel --tail 60
      exit 1
    fi
    if [[ "$st" == "running" ]] && ss -tlnp 2>/dev/null | grep -q ':8000 '; then
      return 0
    fi
    sleep 3
  done
  red "超时: 8000 未监听"
  docker logs duck-panel --tail 60
  exit 1
}

start_panel() {
  echo "[6/6] 启动面板..."
  verify_panel_ssl_files
  docker compose -f "${DUCK_DIR}/docker-compose.yml" up -d --force-recreate panel
  wait_for_panel_port
  green "面板已在 8000 监听"
}

create_admin() {
  local c
  c="$(docker ps --format '{{.Names}}' | grep -x duck-panel || true)"
  if [[ -z "$c" ]]; then
    yellow "未找到 duck-panel 容器，跳过创建管理员"
    return 0
  fi
  if docker exec "$c" duck-cli admin list 2>/dev/null | grep -qw "${ADMIN_USER}"; then
    return 0
  fi
  docker exec -e DUCK_ADMIN_PASSWORD="${ADMIN_PASSWORD}" "$c" \
    duck-cli admin create --username "${ADMIN_USER}" --sudo --telegram-id 0 --discord-webhook "" \
    2>/dev/null || yellow "请手动: duck cli admin create --sudo"
}

prepare_fresh_install() {
  if [[ "${DUCK_FRESH_INSTALL:-}" != "1" ]]; then
    return 0
  fi
  docker rm -f duck-panel 2>/dev/null || true
  docker compose -f "${DUCK_DIR}/docker-compose.yml" down 2>/dev/null || true
}

cmd_install() {
  trap 'duck_install_err ${LINENO} $?' ERR
  trap 'trap - ERR' RETURN
  green "=== Duck 安装 (${DUCK_DEPLOY_SCRIPT_REV}) ==="
  need_root
  install_step "1/6 系统依赖与 Docker"
  ensure_host_deps
  install_step "检查 deploy 与源码"
  duck_preflight "${SCRIPT_DIR}"
  prepare_fresh_install
  install_step "2/6 安装参数与代理端口"
  prompt_vars
  validate_domain
  install_step "3/6 acme.sh"
  install_acme
  issue_cert
  install_step "4/6 写入配置"
  write_config
  ensure_duck_dirs
  install_step "5/6 构建镜像"
  build_duck_image
  install_step "6/6 启动面板"
  start_panel
  create_admin
  green "
完成: https://${DOMAIN}:8000/dashboard/
用户: ${ADMIN_USER}
"
}

cmd_reinstall() {
  need_root
  local repo_root
  repo_root="$(cd "${SCRIPT_DIR}/.." && pwd)"
  for v in DOMAIN EMAIL ADMIN_USER ADMIN_PASSWORD; do
    [[ -n "${!v:-}" ]] || { echo "缺少 $v" >&2; exit 1; }
  done
  if [[ -d "${repo_root}/.git" ]]; then
    git -C "${repo_root}" fetch origin
    if git -C "${repo_root}" show-ref -q refs/remotes/origin/main; then
      git -C "${repo_root}" reset --hard origin/main
    elif git -C "${repo_root}" show-ref -q refs/remotes/origin/master; then
      git -C "${repo_root}" reset --hard origin/master
    else
      git -C "${repo_root}" reset --hard FETCH_HEAD
    fi
  fi
  DUCK_SRC="${repo_root}" duck_preflight "${SCRIPT_DIR}"
  docker rm -f duck-panel 2>/dev/null || true
  docker compose -f /opt/duck/docker-compose.yml down 2>/dev/null || true
  if [[ "${DUCK_WIPE_DATA:-0}" == "1" ]]; then
    rm -rf /var/lib/duck/*
  fi
  DUCK_SRC="${repo_root}" DUCK_FRESH_INSTALL=1 \
    DOMAIN="$DOMAIN" EMAIL="$EMAIL" ADMIN_USER="$ADMIN_USER" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    ${DUCK_SKIP_DNS_CHECK:+DUCK_SKIP_DNS_CHECK=$DUCK_SKIP_DNS_CHECK} \
    bash "${SCRIPT_DIR}/duck.sh" install
}

cmd_fix() {
  need_root
  local repo
  repo="$(duck_pick_repo_root "${SCRIPT_DIR}")" || { echo "找不到 Duck 源码" >&2; exit 1; }
  duck_rsync_repo_to_opt_source "${repo}"
  duck_install_opt_deploy_files "${repo}/deploy"
  DUCK_SRC="${repo}" duck_preflight "${repo}/deploy"
  docker compose -f "$COMPOSE_FILE" build --no-cache panel
  duck_panel_image_smoke duck-panel:latest
  docker compose -f "$COMPOSE_FILE" up -d --force-recreate panel
  for _ in $(seq 1 36); do
    if docker inspect -f '{{.State.Status}}' duck-panel 2>/dev/null | grep -qx running \
      && ss -tlnp | grep -q ':8000 '; then
      green "面板已就绪"
      exit 0
    fi
    sleep 5
  done
  docker logs duck-panel --tail 40
  exit 1
}

cmd_upgrade() {
  need_root
  green "=== Duck 升级 (${DUCK_GITHUB_REPO}) ==="
  local repo
  repo="$(duck_ensure_github_clone "${DUCK_REPO_DIR:-}")"
  duck_pull_latest "$repo"
  export DUCK_SRC="$repo"
  bash "${repo}/deploy/duck.sh" fix
}

case "${1:-}" in
  preflight) shift; cmd_preflight "$@" ;;
  acme-cert) shift; cmd_acme_cert "$@" ;;
  install) shift; cmd_install "$@" ;;
  reinstall) shift; cmd_reinstall "$@" ;;
  upgrade|update|pull) shift; cmd_upgrade "$@" ;;
  fix|fix-panel) shift; cmd_fix "$@" ;;
  up|start|restart|stop|down|logs|status|cli|rebuild|ports)
    cmd_compose "$@"
    ;;
  help|-h|--help)
    cat <<EOF
用法: bash duck.sh <命令>   仓库: https://github.com/${DUCK_GITHUB_REPO}

  upgrade     一键：git 拉最新 + 检查 + 重建面板（日常用这个）
  install     首次装主控（可交互）
  reinstall   重装（需 DOMAIN EMAIL ADMIN_USER ADMIN_PASSWORD）
  fix         不拉 git，用本机已有源码重建
  preflight   仅检查
  restart|logs|status|cli|rebuild|ports  运维

一键（任意目录）:
  curl -fsSL https://raw.githubusercontent.com/${DUCK_GITHUB_REPO}/main/deploy/duck.sh | sudo bash -s upgrade
EOF
    ;;
  *)
    if [[ -z "${1:-}" ]]; then
      cmd_compose status
    else
      echo "未知命令: $1（bash duck.sh help）" >&2
      exit 1
    fi
    ;;
esac
