#!/usr/bin/env bash
# Duck 主控：安装 / 更新 / 运维（唯一入口脚本）
#   bash duck.sh preflight
#   sudo bash duck.sh install
#   sudo env DOMAIN=... EMAIL=... ADMIN_USER=... ADMIN_PASSWORD='...' bash duck.sh reinstall
#   sudo bash duck.sh fix
#   duck status | restart | logs | cli ...
set -euo pipefail

DUCK_DEPLOY_SCRIPT_REV="2026-10-30"
MARZBAN_DIR="/opt/marzban"
DATA_DIR="/var/lib/marzban"
CERT_DIR="${DATA_DIR}/certs"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/marzban/docker-compose.yml}"
SERVICE="${DUCK_SERVICE:-panel}"

# shellcheck source=duck-lib.sh
source "${SCRIPT_DIR}/duck-lib.sh"

case "$(basename "$0")" in
  fix-panel.sh|fix-panel) set -- fix "$@";;
  install.sh) set -- install "$@";;
  reinstall.sh) set -- reinstall "$@";;
  preflight.sh) set -- preflight "$@";;
  acme-install-cert.sh) set -- acme-cert "$@";;
esac

red() { echo -e "\033[31m$*\033[0m" >&2; }
green() { echo -e "\033[32m$*\033[0m"; }
yellow() { echo -e "\033[33m$*\033[0m"; }

dc() { docker compose -f "$COMPOSE_FILE" "$@"; }

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
  [[ -f "${DEPLOY_DIR}/duck.sh" ]] || DEPLOY_DIR="${SCRIPT_DIR}"
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
    elif [[ -f /opt/marzban/docker-compose.yml ]]; then
      docker compose -f /opt/marzban/docker-compose.yml restart panel || true
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
    update|rebuild) dc build --no-cache "$SERVICE"; dc up -d --force-recreate "$SERVICE" ;;
    ports)      cat /var/lib/marzban/duck-ports.env 2>/dev/null || cat /var/lib/marzban/xray_config.json ;;
    "")         dc ps ;;
    *)
      echo "duck: up | restart | logs | status | cli | update | ports" >&2
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
    [[ "${DUCK_SKIP_DNS_CHECK:-}" == "1" ]] && yellow "DNS 警告已跳过" && return 0
    confirm_or_exit "域名 ${DOMAIN} -> ${dip}，本机 ${sip}"
  fi
}

prompt_vars() {
  if [[ -z "${DOMAIN:-}" ]]; then
    green "=== Duck 主控安装 ==="
    read -rp "面板域名: " DOMAIN
  fi
  [[ -z "${EMAIL:-}" ]] && read -rp "Let's Encrypt 邮箱: " EMAIL
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
  duck_resolve_proxy_ports "$port_interactive" || exit 1
}

install_docker() {
  command -v docker >/dev/null 2>&1 && return
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker 2>/dev/null || true
}

ensure_marzban_dirs() { install -d "$MARZBAN_DIR" "$DATA_DIR" "$CERT_DIR"; }

sync_duck_source() {
  duck_resolve_paths
  [[ -f "${DUCK_SRC}/Dockerfile" ]] || { red "找不到源码，设置 DUCK_SRC"; exit 1; }
  echo "[5/6] 同步源码 -> /opt/duck/source ..."
  install -d "$MARZBAN_DIR"
  duck_rsync_repo_to_opt_source "${DUCK_SRC}"
  duck_install_opt_deploy_files "${DEPLOY_DIR}"
}

build_duck_image() {
  echo "[5/6] 构建镜像（首次较慢）..."
  install_docker
  sync_duck_source
  grep -q 'import pkg_resources' /opt/duck/source/Dockerfile 2>/dev/null && {
    red "Dockerfile 过旧，请 Push 后 git pull"; exit 1
  }
  docker compose -f "${MARZBAN_DIR}/docker-compose.yml" build --no-cache panel
  docker run --rm --entrypoint python duck-panel:latest -c "import apscheduler; print('OK')"
}

install_acme() {
  [[ -x "${HOME}/.acme.sh/acme.sh" ]] || curl -s https://get.acme.sh | sh -s "email=${EMAIL}"
  export PATH="${HOME}/.acme.sh:${PATH}"
}

acme_reloadcmd() {
  echo "bash /opt/duck/deploy/duck.sh acme-cert ${DOMAIN}"
}

issue_cert() {
  ensure_marzban_dirs
  duck_resolve_paths
  duck_install_opt_deploy_files "${DEPLOY_DIR}"
  if [[ -s "${CERT_DIR}/${DOMAIN}.cer" && -s "${CERT_DIR}/${DOMAIN}.cer.key" ]]; then
    green "[3/6] 证书已存在，跳过"
    "${HOME}/.acme.sh/acme.sh" --install-cert -d "$DOMAIN" \
      --reloadcmd "$(acme_reloadcmd)" 2>/dev/null || true
    return 0
  fi
  echo "[3/6] 申请证书..."
  ss -tlnp 2>/dev/null | grep -q ':80 ' && { red "80 端口被占用"; exit 1; }
  "${HOME}/.acme.sh/acme.sh" --issue -d "$DOMAIN" --standalone --httpport 80 --force
  "${HOME}/.acme.sh/acme.sh" --install-cert -d "$DOMAIN" --reloadcmd "$(acme_reloadcmd)"
  bash /opt/duck/deploy/duck.sh acme-cert "$DOMAIN"
}

write_config() {
  echo "[4/6] 写入配置..."
  ensure_marzban_dirs
  duck_resolve_paths
  sed "s|__DOMAIN__|${DOMAIN}|g" "${DEPLOY_DIR}/env.template" \
    | sed "s|__PORT_VLESS__|${DUCK_PORT_VLESS}|g" \
    | sed "s|__PORT_VMESS__|${DUCK_PORT_VMESS}|g" \
    | sed "s|__PORT_TROJAN__|${DUCK_PORT_TROJAN}|g" \
    | sed "s|__PORT_SS__|${DUCK_PORT_SS}|g" \
    > "${MARZBAN_DIR}/.env"
  sed "s|__DOMAIN__|${DOMAIN}|g" "${DEPLOY_DIR}/xray_config.template.json" \
    | sed "s|__PORT_VLESS__|${DUCK_PORT_VLESS}|g" \
    | sed "s|__PORT_VMESS__|${DUCK_PORT_VMESS}|g" \
    | sed "s|__PORT_TROJAN__|${DUCK_PORT_TROJAN}|g" \
    | sed "s|__PORT_SS__|${DUCK_PORT_SS}|g" \
    > "${DATA_DIR}/xray_config.json"
  duck_apply_proxy_ports "${DATA_DIR}/xray_config.json" "${DATA_DIR}/duck-ports.env"
}

wait_for_panel_port() {
  local i st
  for i in $(seq 1 40); do
    st="$(docker inspect -f '{{.State.Status}}' duck-panel 2>/dev/null || true)"
    [[ "$st" == "exited" || "$st" == "dead" ]] && { docker logs duck-panel --tail 40; exit 1; }
    [[ "$st" == "running" ]] && ss -tlnp 2>/dev/null | grep -q ':8000 ' && return 0
    sleep 3
  done
  docker logs duck-panel --tail 50
  exit 1
}

restart_marzban() {
  echo "[6/6] 启动面板..."
  docker compose -f "${MARZBAN_DIR}/docker-compose.yml" up -d --force-recreate panel
  wait_for_panel_port
  green "面板已在 8000 监听"
}

create_admin() {
  local c
  c="$(docker ps --format '{{.Names}}' | grep -x duck-panel || true)"
  [[ -n "$c" ]] || return 0
  docker exec "$c" duck-cli admin list 2>/dev/null | grep -qw "${ADMIN_USER}" && return 0
  docker exec -e DUCK_ADMIN_PASSWORD="${ADMIN_PASSWORD}" "$c" \
    duck-cli admin create --username "${ADMIN_USER}" --sudo --telegram-id 0 --discord-webhook "" \
    2>/dev/null || yellow "请手动: duck cli admin create --sudo"
}

prepare_fresh_install() {
  [[ "${DUCK_FRESH_INSTALL:-}" == "1" ]] || return 0
  docker rm -f duck-panel 2>/dev/null || true
  docker compose -f "${MARZBAN_DIR}/docker-compose.yml" down 2>/dev/null || true
}

cmd_install() {
  green "=== Duck 安装 (${DUCK_DEPLOY_SCRIPT_REV}) ==="
  duck_preflight "${SCRIPT_DIR}"
  need_root
  prepare_fresh_install
  prompt_vars
  validate_domain
  install_acme
  issue_cert
  write_config
  ensure_marzban_dirs
  build_duck_image
  restart_marzban
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
    git -C "${repo_root}" show-ref -q refs/remotes/origin/main && \
      git -C "${repo_root}" reset --hard origin/main || \
      git -C "${repo_root}" reset --hard origin/master 2>/dev/null || \
      git -C "${repo_root}" reset --hard FETCH_HEAD
  fi
  DUCK_SRC="${repo_root}" duck_preflight "${SCRIPT_DIR}"
  docker rm -f duck-panel 2>/dev/null || true
  docker compose -f /opt/marzban/docker-compose.yml down 2>/dev/null || true
  [[ "${DUCK_WIPE_DATA:-0}" == "1" ]] && rm -rf /var/lib/marzban/*
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
  DUCK_SRC="${repo}" duck_preflight "${SCRIPT_DIR}"
  docker compose -f "$COMPOSE_FILE" build --no-cache panel
  docker run --rm --entrypoint python duck-panel:latest -c "import apscheduler; print('OK')"
  docker compose -f "$COMPOSE_FILE" up -d --force-recreate panel
  for _ in $(seq 1 36); do
    docker inspect -f '{{.State.Status}}' duck-panel 2>/dev/null | grep -qx running \
      && ss -tlnp | grep -q ':8000 ' && { echo "面板已就绪"; exit 0; }
    sleep 5
  done
  docker logs duck-panel --tail 40
  exit 1
}

case "${1:-}" in
  preflight) shift; cmd_preflight "$@" ;;
  acme-cert) shift; cmd_acme_cert "$@" ;;
  install) shift; cmd_install "$@" ;;
  reinstall) shift; cmd_reinstall "$@" ;;
  fix|fix-panel) shift; cmd_fix "$@" ;;
  up|start|restart|stop|down|logs|status|cli|update|rebuild|ports)
    cmd_compose "$@"
    ;;
  help|-h|--help)
    cat <<EOF
用法: bash duck.sh <命令>
  preflight   安装前检查
  install     主控安装（可交互）
  reinstall   git pull + 重装（需 DOMAIN EMAIL ADMIN_USER ADMIN_PASSWORD）
  fix         拉源码并重建面板
  acme-cert   证书续期钩子（acme.sh 调用）
  up|restart|logs|status|cli|update|ports  等同 duck 命令
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
