# shellcheck shell=bash
# 安装时：四协议端口（全节点相同）。非交互可用 DUCK_PORT_* / DUCK_PORT_RANDOM=1

DUCK_DEFAULT_PORT_VLESS=443
DUCK_DEFAULT_PORT_VMESS=8080
DUCK_DEFAULT_PORT_TROJAN=2053
DUCK_DEFAULT_PORT_SS=1080

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
  local name="$1"
  local p="$2"
  if [[ ! "$p" =~ ^[0-9]+$ ]] || (( p < 1 || p > 65535 )); then
    echo "错误: ${name} 端口无效: ${p}" >&2
    return 1
  fi
  return 0
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
      [[ "$i" -lt "$j" && "${p[$i]}" == "${p[$j]}" ]] && { echo "错误: 端口不能重复" >&2; return 1; }
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
MARZBAN_NODE_PORT=62050
MARZBAN_NODE_API_PORT=62051
EOF
  chmod 644 "$ports_env"
}

duck_resolve_proxy_ports() {
  local interactive="${1:-1}"

  if [[ -n "${DUCK_PORT_RANDOM:-}" && "${DUCK_PORT_RANDOM}" != "0" ]]; then
    duck_randomize_all_proxy_ports
    duck_assert_unique_ports || return 1
    return 0
  fi

  if [[ -n "${DUCK_PORT_VLESS:-}${DUCK_PORT_VMESS:-}${DUCK_PORT_TROJAN:-}${DUCK_PORT_SS:-}" ]]; then
    : "${DUCK_PORT_VLESS:=$DUCK_DEFAULT_PORT_VLESS}"
    : "${DUCK_PORT_VMESS:=$DUCK_DEFAULT_PORT_VMESS}"
    : "${DUCK_PORT_TROJAN:=$DUCK_DEFAULT_PORT_TROJAN}"
    : "${DUCK_PORT_SS:=$DUCK_DEFAULT_PORT_SS}"
    export DUCK_PORT_VLESS DUCK_PORT_VMESS DUCK_PORT_TROJAN DUCK_PORT_SS
    duck_assert_unique_ports || return 1
    return 0
  fi

  if [[ "$interactive" == "1" && -t 0 ]]; then
    echo ""
    echo "代理端口（所有节点相同）"
    echo "  1) 推荐：VLESS/VMess/Trojan 常用口，SS 随机高端口"
    echo "  2) 四个都随机"
    echo "  3) 全部手动（SS 可填 58425 或 random）"
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
    return 0
  fi

  duck_apply_default_proxy_ports
  duck_assert_unique_ports || return 1
}
