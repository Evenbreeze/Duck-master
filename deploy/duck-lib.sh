# shellcheck shell=bash
# Duck 部署库：源码同步、端口、安装前检查

DUCK_GITHUB_REPO="${DUCK_GITHUB_REPO:-Evenbreeze/Duck-master}"
DUCK_GITHUB_URL="${DUCK_GITHUB_URL:-https://github.com/${DUCK_GITHUB_REPO}.git}"
DUCK_DEFAULT_CLONE_DIR="${DUCK_DEFAULT_CLONE_DIR:-/root/Duck-master}"

DUCK_DEFAULT_PORT_VLESS=443
DUCK_DEFAULT_PORT_VMESS=8080
DUCK_DEFAULT_PORT_TROJAN=2053
DUCK_DEFAULT_PORT_SS=1080

duck_pick_repo_root() {
  local script_dir="$1"
  [[ -n "${DUCK_SRC:-}" && -f "${DUCK_SRC}/Dockerfile" ]] && { echo "$DUCK_SRC"; return 0; }
  [[ -f "${script_dir}/../Dockerfile" ]] && { (cd "${script_dir}/.." && pwd); return 0; }
  [[ -f "${DUCK_DEFAULT_CLONE_DIR}/Dockerfile" ]] && { echo "$DUCK_DEFAULT_CLONE_DIR"; return 0; }
  for d in /home/*/Duck-master; do
    [[ -f "${d}/Dockerfile" ]] && { echo "$d"; return 0; }
  done
  [[ -f /opt/duck/source/Dockerfile ]] && { echo /opt/duck/source; return 0; }
  return 1
}

duck_pull_latest() {
  local repo="$1"
  [[ -d "${repo}/.git" ]] || { echo "不是 git 仓库: ${repo}" >&2; return 1; }
  git -C "$repo" fetch origin
  if git -C "$repo" show-ref -q refs/remotes/origin/main; then
    git -C "$repo" reset --hard origin/main
  elif git -C "$repo" show-ref -q refs/remotes/origin/master; then
    git -C "$repo" reset --hard origin/master
  else
    git -C "$repo" reset --hard FETCH_HEAD
  fi
}

duck_ensure_github_clone() {
  local repo="${1:-${DUCK_DEFAULT_CLONE_DIR}}"
  if [[ -d "${repo}/.git" && -f "${repo}/Dockerfile" ]]; then
    echo "$repo"
    return 0
  fi
  local picked
  picked="$(duck_pick_repo_root "${SCRIPT_DIR:-.}" 2>/dev/null || true)"
  if [[ -n "$picked" && -d "${picked}/.git" ]]; then
    echo "$picked"
    return 0
  fi
  install -d "$(dirname "$repo")"
  if [[ ! -d "${repo}/.git" ]]; then
    echo "[upgrade] 克隆 ${DUCK_GITHUB_URL} -> ${repo}" >&2
    git clone "${DUCK_GITHUB_URL}" "$repo"
  fi
  echo "$repo"
}

duck_rsync_repo_to_opt_source() {
  local repo="$1"
  install -d /opt/duck/source
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude '.git' --exclude 'node_modules' --exclude 'venv' \
      --exclude 'db.sqlite3' \
      "${repo}/" /opt/duck/source/
  else
    rm -rf /opt/duck/source
    cp -a "${repo}" /opt/duck/source
  fi
}

duck_install_opt_deploy_files() {
  local d="$1"
  install -d /opt/duck/deploy /opt/duck
  cp "$d/docker-compose.yml" /opt/duck/docker-compose.yml
  cp "$d/duck.sh" "$d/duck-lib.sh" "$d/duck-node-bootstrap.sh" \
    "$d/env.template" "$d/xray_config.template.json" \
    "$d/docker-compose.yml" /opt/duck/deploy/
  chmod +x /opt/duck/deploy/*.sh
  for legacy in install fix-panel reinstall preflight acme-install-cert; do
    ln -sf /opt/duck/deploy/duck.sh "/opt/duck/deploy/${legacy}.sh"
  done
  install -m 755 /opt/duck/deploy/duck.sh /usr/local/bin/duck
  ln -sf /opt/duck/deploy/duck.sh /usr/local/bin/fix-panel.sh
}

random_proxy_port() {
  local avoid_csv="${1:-}"
  local p
  for _ in $(seq 1 200); do
    p=$((10000 + RANDOM % 55001))
    [[ ",${avoid_csv}," == *",${p},"* ]] && continue
    [[ "$p" -eq 80 || "$p" -eq 8000 || "$p" -eq 62050 || "$p" -eq 62051 ]] && continue
    echo "$p"
    return 0
  done
  echo "24567"
}

validate_proxy_port() {
  local name="$1" p="$2"
  [[ "$p" =~ ^[0-9]+$ ]] && (( p >= 1 && p <= 65535 )) || {
    echo "错误: ${name} 端口无效: ${p}" >&2
    return 1
  }
}

normalize_port_input() {
  local label="$1" default="$2" avoid_csv="$3" raw="$4"
  raw="${raw:-$default}"
  if [[ "${raw,,}" == "random" || "${raw,,}" == "r" ]]; then
    raw="$(random_proxy_port "$avoid_csv")"
    echo "  ${label} -> ${raw}" >&2
  fi
  validate_proxy_port "$label" "$raw" || return 1
  echo "$raw"
}

duck_ports_used_csv() {
  echo "${DUCK_PORT_VLESS:-},${DUCK_PORT_VMESS:-},${DUCK_PORT_TROJAN:-},${DUCK_PORT_SS:-}"
}

duck_assert_unique_ports() {
  local -a p=("$DUCK_PORT_VLESS" "$DUCK_PORT_VMESS" "$DUCK_PORT_TROJAN" "$DUCK_PORT_SS")
  local i j
  for i in "${!p[@]}"; do
    validate_proxy_port "port" "${p[$i]}" || return 1
    for j in "${!p[@]}"; do
      [[ "$i" -lt "$j" && "${p[$i]}" == "${p[$j]}" ]] && {
        echo "错误: 端口不能重复" >&2
        return 1
      }
    done
  done
}

duck_randomize_all_proxy_ports() {
  local used=""
  DUCK_PORT_VLESS="$(random_proxy_port "$used")"; used+=",$DUCK_PORT_VLESS"
  DUCK_PORT_VMESS="$(random_proxy_port "$used")"; used+=",$DUCK_PORT_VMESS"
  DUCK_PORT_TROJAN="$(random_proxy_port "$used")"; used+=",$DUCK_PORT_TROJAN"
  DUCK_PORT_SS="$(random_proxy_port "$used")"
  export DUCK_PORT_VLESS DUCK_PORT_VMESS DUCK_PORT_TROJAN DUCK_PORT_SS
}

duck_apply_default_proxy_ports() {
  DUCK_PORT_VLESS=$DUCK_DEFAULT_PORT_VLESS
  DUCK_PORT_VMESS=$DUCK_DEFAULT_PORT_VMESS
  DUCK_PORT_TROJAN=$DUCK_DEFAULT_PORT_TROJAN
  DUCK_PORT_SS="$(random_proxy_port "${DUCK_DEFAULT_PORT_VLESS},${DUCK_DEFAULT_PORT_VMESS},${DUCK_DEFAULT_PORT_TROJAN}")"
  export DUCK_PORT_VLESS DUCK_PORT_VMESS DUCK_PORT_TROJAN DUCK_PORT_SS
}

duck_apply_proxy_ports() {
  local xray_json="$1" ports_env="$2"
  duck_assert_unique_ports || return 1
  export DUCK_PORT_VLESS DUCK_PORT_VMESS DUCK_PORT_TROJAN DUCK_PORT_SS
  python3 - "$xray_json" <<'PY'
import json, os, sys
path = sys.argv[1]
m = {
    "VLESS TCP TLS": int(os.environ["DUCK_PORT_VLESS"]),
    "VMess TCP": int(os.environ["DUCK_PORT_VMESS"]),
    "Trojan TCP": int(os.environ["DUCK_PORT_TROJAN"]),
    "Shadowsocks TCP": int(os.environ["DUCK_PORT_SS"]),
}
with open(path, encoding="utf-8") as f:
    cfg = json.load(f)
for ib in cfg.get("inbounds", []):
    if ib.get("tag") in m:
        ib["port"] = m[ib["tag"]]
with open(path, "w", encoding="utf-8") as f:
    json.dump(cfg, f, indent=2, ensure_ascii=False)
    f.write("\n")
PY
  cat > "$ports_env" <<EOF
DUCK_INBOUND_PORT_VLESS=${DUCK_PORT_VLESS}
DUCK_INBOUND_PORT_VMESS=${DUCK_PORT_VMESS}
DUCK_INBOUND_PORT_TROJAN=${DUCK_PORT_TROJAN}
DUCK_INBOUND_PORT_SS=${DUCK_PORT_SS}
DUCK_AGENT_PORT=62050
DUCK_XRAY_API_PORT=62051
EOF
  chmod 644 "$ports_env"
}

duck_log_proxy_ports() {
  echo "代理端口: VLESS=${DUCK_PORT_VLESS} VMess=${DUCK_PORT_VMESS} Trojan=${DUCK_PORT_TROJAN} SS=${DUCK_PORT_SS}"
}

duck_resolve_proxy_ports() {
  local interactive="${1:-1}"
  if [[ -n "${DUCK_PORT_RANDOM:-}" && "${DUCK_PORT_RANDOM}" != "0" ]]; then
    duck_randomize_all_proxy_ports
    duck_assert_unique_ports || return 1
    duck_log_proxy_ports
    return 0
  fi
  if [[ -n "${DUCK_PORT_VLESS:-}${DUCK_PORT_VMESS:-}${DUCK_PORT_TROJAN:-}${DUCK_PORT_SS:-}" ]]; then
    : "${DUCK_PORT_VLESS:=$DUCK_DEFAULT_PORT_VLESS}"
    : "${DUCK_PORT_VMESS:=$DUCK_DEFAULT_PORT_VMESS}"
    : "${DUCK_PORT_TROJAN:=$DUCK_DEFAULT_PORT_TROJAN}"
    : "${DUCK_PORT_SS:=$DUCK_DEFAULT_PORT_SS}"
    export DUCK_PORT_VLESS DUCK_PORT_VMESS DUCK_PORT_TROJAN DUCK_PORT_SS
    duck_assert_unique_ports || return 1
    duck_log_proxy_ports
    return 0
  fi
  if [[ "$interactive" == "1" && -t 0 ]]; then
    echo ""
    echo "代理端口（所有节点相同）"
    echo "  1) 推荐：VLESS/VMess/Trojan 常用口，SS 随机高端口"
    echo "  2) 四个都随机"
    echo "  3) 全部手动（SS 可填 random）"
    read -rp "选择 [1]: " _m
    case "${_m:-1}" in
      2) duck_randomize_all_proxy_ports ;;
      3)
        read -rp "  VLESS [443]: " _v
        DUCK_PORT_VLESS="$(normalize_port_input VLESS 443 "" "$_v")" || return 1
        read -rp "  VMess [8080]: " _a
        DUCK_PORT_VMESS="$(normalize_port_input VMess 8080 "$DUCK_PORT_VLESS" "$_a")" || return 1
        read -rp "  Trojan [2053]: " _t
        DUCK_PORT_TROJAN="$(normalize_port_input Trojan 2053 "$(duck_ports_used_csv)" "$_t")" || return 1
        read -rp "  SS [random]: " _s
        DUCK_PORT_SS="$(normalize_port_input SS 1080 "$(duck_ports_used_csv)" "$_s")" || return 1
        export DUCK_PORT_VLESS DUCK_PORT_VMESS DUCK_PORT_TROJAN DUCK_PORT_SS
        ;;
      *) duck_apply_default_proxy_ports ;;
    esac
    duck_assert_unique_ports || return 1
    duck_log_proxy_ports
    return 0
  fi
  duck_apply_default_proxy_ports
  duck_assert_unique_ports || return 1
  duck_log_proxy_ports
}

duck_preflight() {
  local script_dir="$1"
  local ROOT DEPLOY
  if [[ -n "${DUCK_SRC:-}" ]]; then
    ROOT="${DUCK_SRC}"
    DEPLOY="${DUCK_SRC}/deploy"
  else
    ROOT="$(cd "${script_dir}/.." && pwd)"
    DEPLOY="${script_dir}"
  fi
  [[ -f "${DEPLOY}/duck.sh" ]] || DEPLOY="${script_dir}"
  if [[ ! -f "${ROOT}/Dockerfile" && -f /opt/duck/source/Dockerfile ]]; then
    ROOT=/opt/duck/source
    [[ -f "${ROOT}/deploy/duck.sh" ]] && DEPLOY="${ROOT}/deploy"
  fi

  local red green fail check_grep check_not
  red() { echo -e "\033[31m$*\033[0m" >&2; }
  green() { echo -e "\033[32m$*\033[0m"; }
  fail() { red "preflight 失败: $*"; exit 1; }
  check_grep() { grep -q "$2" "$1" || fail "$1 缺少: $2"; }
  check_not() { grep -q "$2" "$1" && fail "$1 仍含: $2"; }

  [[ -f "${DEPLOY}/duck.sh" ]] || fail "找不到 deploy/duck.sh"
  [[ -f "${ROOT}/Dockerfile" ]] || fail "找不到 Dockerfile（可设 DUCK_SRC=）"
  check_grep "${DEPLOY}/duck.sh" '2026-11-06'
  check_grep "${ROOT}/requirements.txt" 'APScheduler==3.10'
  check_grep "${ROOT}/Dockerfile" "VITE_BASE_API=/api/"
  check_grep "${ROOT}/Dockerfile" "import apscheduler; print('Duck image deps OK')"
  check_not "${ROOT}/Dockerfile" 'import pkg_resources'
  check_grep "${ROOT}/app/dashboard/__init__.py" '_normalize_dashboard_static_files'
  check_grep "${DEPLOY}/env.template" 'sqlite:////var/lib/duck'
  [[ -f "${DEPLOY}/duck-lib.sh" ]] || fail "缺少 deploy/duck-lib.sh"
  green "preflight OK"
}
