#!/usr/bin/env bash
# Duck 主控一键安装 — 交互: bash install.sh
# 非交互: cd deploy && sudo env DOMAIN=... EMAIL=... ADMIN_USER=... ADMIN_PASSWORD='...' bash reinstall.sh
set -euo pipefail

DUCK_DEPLOY_SCRIPT_REV="2026-10-30"

MARZBAN_DIR="/opt/marzban"
DATA_DIR="/var/lib/marzban"
CERT_DIR="${DATA_DIR}/certs"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ports-lib.sh
source "${SCRIPT_DIR}/ports-lib.sh"
# shellcheck source=lib/repo-sync.sh
source "${SCRIPT_DIR}/lib/repo-sync.sh"

red() { echo -e "\033[31m$*\033[0m" >&2; }
green() { echo -e "\033[32m$*\033[0m"; }
yellow() { echo -e "\033[33m$*\033[0m"; }

on_err() {
  red "安装失败（第 ${BASH_LINENO[0]} 行）: ${BASH_COMMAND}"
  exit 1
}
trap on_err ERR

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

verify_deploy_scripts() {
  DUCK_SRC="${DUCK_SRC:-$(cd "${SCRIPT_DIR}/.." && pwd)}" bash "${SCRIPT_DIR}/preflight.sh"
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

install_docker() {
  command -v docker >/dev/null 2>&1 && return
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker 2>/dev/null || true
}

sync_duck_source() {
  DUCK_SRC="${DUCK_SRC:-$(duck_pick_repo_root "${SCRIPT_DIR}" 2>/dev/null || true)}"
  DUCK_SRC="${DUCK_SRC:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
  [[ -f "${DUCK_SRC}/Dockerfile" ]] || { red "找不到源码，设置 DUCK_SRC"; exit 1; }
  echo "[5/6] 同步源码 -> /opt/duck/source ..."
  install -d "$MARZBAN_DIR"
  duck_rsync_repo_to_opt_source "${DUCK_SRC}"
  duck_install_opt_deploy_files "${SCRIPT_DIR}"
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

install_acme_hook_script() {
  install -d /opt/duck/deploy
  cp "${SCRIPT_DIR}/acme-install-cert.sh" /opt/duck/deploy/acme-install-cert.sh
  chmod +x /opt/duck/deploy/acme-install-cert.sh
}

issue_cert() {
  ensure_marzban_dirs
  install_acme_hook_script
  if [[ -s "${CERT_DIR}/${DOMAIN}.cer" && -s "${CERT_DIR}/${DOMAIN}.cer.key" ]]; then
    green "[3/6] 证书已存在，跳过"
    "${HOME}/.acme.sh/acme.sh" --install-cert -d "$DOMAIN" \
      --reloadcmd "bash /opt/duck/deploy/acme-install-cert.sh ${DOMAIN}" 2>/dev/null || true
    return 0
  fi
  echo "[3/6] 申请证书..."
  ss -tlnp 2>/dev/null | grep -q ':80 ' && { red "80 端口被占用"; exit 1; }
  "${HOME}/.acme.sh/acme.sh" --issue -d "$DOMAIN" --standalone --httpport 80 --force
  "${HOME}/.acme.sh/acme.sh" --install-cert -d "$DOMAIN" \
    --reloadcmd "bash /opt/duck/deploy/acme-install-cert.sh ${DOMAIN}"
  bash /opt/duck/deploy/acme-install-cert.sh "$DOMAIN"
}

ensure_marzban_dirs() { install -d "$MARZBAN_DIR" "$DATA_DIR" "$CERT_DIR"; }

write_config() {
  echo "[4/6] 写入配置..."
  ensure_marzban_dirs
  sed "s|__DOMAIN__|${DOMAIN}|g" "${SCRIPT_DIR}/env.template" \
    | sed "s|__PORT_VLESS__|${DUCK_PORT_VLESS}|g" \
    | sed "s|__PORT_VMESS__|${DUCK_PORT_VMESS}|g" \
    | sed "s|__PORT_TROJAN__|${DUCK_PORT_TROJAN}|g" \
    | sed "s|__PORT_SS__|${DUCK_PORT_SS}|g" \
    > "${MARZBAN_DIR}/.env"
  sed "s|__DOMAIN__|${DOMAIN}|g" "${SCRIPT_DIR}/xray_config.template.json" \
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
  docker exec "$c" marzban-cli admin list 2>/dev/null | grep -qw "${ADMIN_USER}" && return 0
  docker exec -e MARZBAN_ADMIN_PASSWORD="${ADMIN_PASSWORD}" "$c" \
    marzban-cli admin create --username "${ADMIN_USER}" --sudo --telegram-id 0 --discord-webhook "" \
    2>/dev/null || yellow "请手动: duck cli admin create --sudo"
}

prepare_fresh_install() {
  [[ "${DUCK_FRESH_INSTALL:-}" == "1" ]] || return 0
  docker rm -f duck-panel 2>/dev/null || true
  docker compose -f "${MARZBAN_DIR}/docker-compose.yml" down 2>/dev/null || true
}

main() {
  green "=== Duck 安装 (${DUCK_DEPLOY_SCRIPT_REV}) ==="
  verify_deploy_scripts
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

main "$@"
