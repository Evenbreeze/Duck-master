#!/usr/bin/env bash
# Duck 主控一键安装：Marzban + 域名 SSL + 自动续期 +（可选）创建管理员
#
# 交互安装（推荐）：
#   bash install.sh
#
# 非交互：
#   DOMAIN=vless.example.com EMAIL=you@mail.com ADMIN_USER=admin ADMIN_PASSWORD='secret' bash install.sh
#
# 四协议端口 VMess/VLESS/Trojan/SS（所有节点相同）：
#   DUCK_PORT_RANDOM=1
#   DUCK_PORT_VLESS=443 DUCK_PORT_VMESS=8080 DUCK_PORT_TROJAN=2053 DUCK_PORT_SS=1080
#
# 安装前：域名 A 记录已指向本机；主控安全组放行 80、8000（代理端口在节点上开放）。
#
# Ubuntu 服务器非交互（整行复制，不要换行）：
#   git clone https://github.com/Evenbreeze/Duck-master.git
#   cd Duck-master/deploy && sudo env DOMAIN=... EMAIL=... ADMIN_USER=... ADMIN_PASSWORD='...' bash install.sh

set -euo pipefail

DUCK_DEPLOY_SCRIPT_REV="2026-03-30-panel-check"

MARZBAN_DIR="/opt/marzban"
DATA_DIR="/var/lib/marzban"
CERT_DIR="${DATA_DIR}/certs"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ports-lib.sh
source "${SCRIPT_DIR}/ports-lib.sh"

red() { echo -e "\033[31m$*\033[0m" >&2; }
green() { echo -e "\033[32m$*\033[0m"; }
yellow() { echo -e "\033[33m$*\033[0m"; }

on_err() {
  red "安装失败（第 ${BASH_LINENO[0]} 行）: ${BASH_COMMAND}"
  exit 1
}
trap on_err ERR

need_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    red "请使用 root 运行（或 sudo bash install.sh）"
    exit 1
  fi
}

public_ip() {
  curl -s -4 --max-time 8 https://ifconfig.me/ip 2>/dev/null \
    || curl -s -4 --max-time 8 https://api.ip.sb/ip 2>/dev/null \
    || true
}

domain_ip() {
  local d="$1" ip=""
  ip="$(dig +short A "$d" 2>/dev/null | grep -E '^[0-9.]+$' | tail -1 || true)"
  if [[ -z "$ip" ]]; then
    ip="$(getent ahostsv4 "$d" 2>/dev/null | awk '{print $1; exit}' || true)"
  fi
  echo "$ip"
}

prompt_vars() {
  if [[ -z "${DOMAIN:-}" ]]; then
    echo ""
    green "=== Duck 主控安装 ==="
    echo "请先把域名 A 记录指到本机公网 IP。"
    local sip
    sip="$(public_ip)"
    [[ -n "$sip" ]] && echo "检测到本机公网 IP: ${sip}"
    echo ""
    read -rp "面板域名 (例 vless.example.com): " DOMAIN
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
    if [[ -z "$ADMIN_PASSWORD" ]]; then
      red "密码不能为空"
      exit 1
    fi
  fi
  local port_interactive=1
  if [[ -n "${DOMAIN:-}" && -n "${EMAIL:-}" && -n "${ADMIN_USER:-}" && -n "${ADMIN_PASSWORD:-}" ]]; then
    port_interactive=0
    export DUCK_NONINTERACTIVE=1
  fi
  duck_resolve_proxy_ports "$port_interactive" || exit 1
}

verify_deploy_scripts() {
  local root="${SCRIPT_DIR}/.."
  if ! grep -q 'return 0' "${SCRIPT_DIR}/ports-lib.sh" || \
     ! grep -q 'duck_assert_unique_ports' "${SCRIPT_DIR}/ports-lib.sh"; then
    red "deploy/ports-lib.sh 版本过旧。请在仓库目录执行: git pull"
    exit 1
  fi
  if ! grep -q '2026-03-30-panel-check' "${SCRIPT_DIR}/install.sh"; then
    red "install.sh 不是最新部署脚本。请 git pull 后重试。"
    exit 1
  fi
  if ! grep -q 'entrypoint:' "${SCRIPT_DIR}/docker-compose.yml"; then
    red "docker-compose.yml 缺少 entrypoint。请 git pull"
    exit 1
  fi
  if [[ ! -f "${root}/docker-entrypoint.sh" ]]; then
    red "缺少 docker-entrypoint.sh。请 git pull"
    exit 1
  fi
  if ! grep -q 'APScheduler==3.10' "${root}/requirements.txt"; then
    red "requirements.txt 未升级 APScheduler 3.10。请 git pull"
    exit 1
  fi
  if ! grep -q 'Duck image deps OK' "${root}/Dockerfile"; then
    red "Dockerfile 缺少构建期依赖自检。请 git pull"
    exit 1
  fi
  if [[ ! -f "${SCRIPT_DIR}/reinstall.sh" ]]; then
    red "缺少 deploy/reinstall.sh。请 git pull"
    exit 1
  fi
}

confirm_or_exit() {
  local prompt="$1"
  yellow "$prompt"
  if [[ -n "${DUCK_NONINTERACTIVE:-}" ]]; then
    red "非交互安装无法在此暂停。请修正 DNS 后重试，或交互运行: bash install.sh"
    exit 1
  fi
  read -rp "仍继续? [y/N]: " ok
  if [[ "${ok,,}" != "y" ]]; then
    red "已取消。"
    exit 1
  fi
}

validate_domain() {
  DOMAIN="${DOMAIN// /}"
  DOMAIN="${DOMAIN#https://}"
  DOMAIN="${DOMAIN#http://}"
  DOMAIN="${DOMAIN%%/*}"
  DOMAIN="${DOMAIN%%:*}"

  if [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ ]]; then
    red "域名格式无效: $DOMAIN"
    exit 1
  fi

  local sip dip
  sip="$(public_ip)"
  dip="$(domain_ip "$DOMAIN" || true)"
  if [[ -n "$sip" && -n "$dip" && "$sip" != "$dip" ]]; then
    if [[ "${DUCK_SKIP_DNS_CHECK:-}" == "1" ]]; then
      yellow "警告: ${DOMAIN} -> ${dip}，本机公网 ${sip}（已 DUCK_SKIP_DNS_CHECK=1）"
    else
      confirm_or_exit "警告: ${DOMAIN} 解析为 ${dip}，本机公网为 ${sip}，证书可能失败。"
    fi
  elif [[ -n "$dip" ]]; then
    green "域名 ${DOMAIN} -> ${dip} OK"
  else
    confirm_or_exit "未能解析 ${DOMAIN}。请 apt install -y dnsutils 并确认 DNS 生效。"
  fi
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    return
  fi
  echo "安装 Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker 2>/dev/null || true
}

sync_duck_source() {
  DUCK_SRC="${DUCK_SRC:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
  if [[ ! -f "${DUCK_SRC}/Dockerfile" ]]; then
    red "未找到 Duck 源码（Dockerfile），请在本仓库根目录执行，或: export DUCK_SRC=/path/to/Marzban-master"
    exit 1
  fi
  echo "[5/6] 同步 Duck 源码 -> /opt/duck/source ..."
  install -d /opt/duck/source "$MARZBAN_DIR"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude '.git' --exclude 'node_modules' --exclude 'venv' --exclude '.venv' \
      --exclude 'db.sqlite3' --exclude 'db.sqlite3-journal' \
      "${DUCK_SRC}/" /opt/duck/source/
  else
    rm -rf /opt/duck/source
    cp -a "${DUCK_SRC}" /opt/duck/source
  fi
  cp "${SCRIPT_DIR}/docker-compose.yml" "${MARZBAN_DIR}/docker-compose.yml"
  install -d /opt/duck/deploy/lib
  cp "${SCRIPT_DIR}/docker-compose.yml" /opt/duck/deploy/
  cp "${SCRIPT_DIR}/fix-panel.sh" "${SCRIPT_DIR}/reinstall.sh" "${SCRIPT_DIR}/duck-ctl.sh" /opt/duck/deploy/
  chmod +x /opt/duck/deploy/fix-panel.sh /opt/duck/deploy/reinstall.sh
  if [[ -f "${SCRIPT_DIR}/lib/panel-image-test.sh" ]]; then
    cp "${SCRIPT_DIR}/lib/panel-image-test.sh" /opt/duck/deploy/lib/
  fi
  install -m 755 /opt/duck/deploy/duck-ctl.sh /usr/local/bin/duck
  ln -sf /opt/duck/deploy/fix-panel.sh /usr/local/bin/fix-panel.sh
  ln -sf /opt/duck/deploy/reinstall.sh /usr/local/bin/duck-reinstall.sh
  ln -sf /usr/local/bin/duck /usr/local/bin/marzban
}

verify_panel_image() {
  if docker run --rm --entrypoint python duck-panel:latest -c \
    "import pkg_resources; import apscheduler; print('panel-image-test OK')"; then
    green "镜像依赖自检通过"
    return 0
  fi
  red "镜像缺少 pkg_resources / apscheduler，构建应已在 Dockerfile RUN 中失败；请检查 build 日志"
  exit 1
}

build_duck_image() {
  echo "[5/6] 构建 Duck 镜像（首次较慢，含前端编译）..."
  install_docker
  sync_duck_source
  docker compose -f "${MARZBAN_DIR}/docker-compose.yml" build --no-cache panel
  verify_panel_image
}

install_marzban() {
  ensure_marzban_dirs
  build_duck_image
}

install_acme() {
  if [[ ! -x "${HOME}/.acme.sh/acme.sh" ]]; then
    echo "[2/6] 安装 acme.sh..."
    curl -s https://get.acme.sh | sh -s "email=${EMAIL}"
  else
    echo "[2/6] acme.sh 已存在"
  fi
  export PATH="${HOME}/.acme.sh:${PATH}"
}

issue_cert() {
  echo "[3/6] 申请 SSL 证书 (${DOMAIN})..."
  if ss -tlnp 2>/dev/null | grep -q ':80 '; then
    red "80 端口被占用，无法 HTTP 验证。请停止占用 80 的服务，或改用 DNS 验证。"
    echo "  例: acme.sh --issue -d ${DOMAIN} --dns dns_cf"
    exit 1
  fi
  "${HOME}/.acme.sh/acme.sh" --issue -d "$DOMAIN" --standalone --httpport 80 --force

  HOOK="${SCRIPT_DIR}/acme-install-cert.sh"
  chmod +x "$HOOK"
  "${HOME}/.acme.sh/acme.sh" --install-cert -d "$DOMAIN" \
    --reloadcmd "bash ${HOOK} ${DOMAIN}"
  bash "$HOOK" "$DOMAIN"
}

ensure_marzban_dirs() {
  install -d "$MARZBAN_DIR" "$DATA_DIR" "$CERT_DIR"
}

write_config() {
  echo "[4/6] 写入 .env 与 Xray 配置..."
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
  local i
  for i in $(seq 1 40); do
    if docker inspect -f '{{.State.Status}}' duck-panel 2>/dev/null | grep -qx running; then
      if ss -tlnp 2>/dev/null | grep -q ':8000 '; then
        return 0
      fi
    fi
    sleep 3
  done
  red "面板未在 8000 监听。日志："
  docker logs duck-panel --tail 50 >&2 || true
  exit 1
}

restart_marzban() {
  echo "[6/6] 启动 Duck 面板..."
  docker compose -f "${MARZBAN_DIR}/docker-compose.yml" up -d --force-recreate panel
  wait_for_panel_port
  green "面板已在 8000 监听"
}

marzban_container() {
  docker ps --format '{{.Names}}' 2>/dev/null | grep -E 'duck-panel' | head -1 || true
}

create_admin() {
  echo "[6/6] 创建管理员 ${ADMIN_USER}..."
  local c
  c="$(marzban_container)"
  if [[ -z "$c" ]]; then
    yellow "未找到 Marzban 容器，请稍后手动执行: marzban cli admin create --sudo"
    return
  fi
  if docker exec "$c" marzban-cli admin list 2>/dev/null | grep -qw "${ADMIN_USER}"; then
    yellow "管理员 ${ADMIN_USER} 已存在，跳过"
    return
  fi
  docker exec -e MARZBAN_ADMIN_PASSWORD="${ADMIN_PASSWORD}" "$c" \
    marzban-cli admin create \
    --username "${ADMIN_USER}" \
    --sudo \
    --telegram-id 0 \
    --discord-webhook "" 2>/dev/null \
    || yellow "创建失败时请手动: marzban cli admin create --sudo"
}

prepare_fresh_install() {
  [[ "${DUCK_FRESH_INSTALL:-}" == "1" ]] || return 0
  yellow "DUCK_FRESH_INSTALL=1：移除旧 duck-panel 容器..."
  docker rm -f duck-panel 2>/dev/null || true
  docker compose -f "${MARZBAN_DIR}/docker-compose.yml" down 2>/dev/null || true
}

main() {
  green "=== Duck 安装开始 (${DUCK_DEPLOY_SCRIPT_REV}) ==="
  verify_deploy_scripts
  need_root
  prepare_fresh_install
  prompt_vars
  validate_domain
  install_acme
  issue_cert
  write_config
  install_marzban
  restart_marzban
  create_admin

  green "
安装完成
  后台:  https://${DOMAIN}:8000/dashboard/
  用户:  ${ADMIN_USER}
  证书:  ${CERT_DIR}/${DOMAIN}.cer
  续期:  acme.sh 自动 cron + ${SCRIPT_DIR}/acme-install-cert.sh

请确认主控云防火墙已放行 TCP: 80, 8000
各节点放行 TCP: ${DUCK_PORT_VLESS}, ${DUCK_PORT_VMESS}, ${DUCK_PORT_TROJAN}, ${DUCK_PORT_SS}, 62050, 62051
端口清单: ${DATA_DIR}/duck-ports.env  （命令: duck ports）
Telegram: 登录面板 → 菜单 → Telegram 通知 → 保存后 duck restart
浏览器打开上述地址即可登录。
"
}

main "$@"
