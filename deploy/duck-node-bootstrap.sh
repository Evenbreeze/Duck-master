#!/usr/bin/env bash
# Duck 节点轻量安装 — 协议/端口由主控写入安装命令（sudo env DUCK_PORT_* ...）
#
# 用法:
#   curl -fsSL https://主控/api/node/bootstrap.sh | sudo -E bash -s -- <token> <主控URL> [protocols]
#
# 一般不要手改：复制面板生成的整行命令即可。
set -euo pipefail

TOKEN="${1:-}"
MASTER="${2:-}"
PROTO_CSV="${3:-vless}"

[[ -n "$TOKEN" && -n "$MASTER" ]] || {
  echo "用法: bash -s -- <enroll_token> <panel_base_url> [vless,vmess,...]" >&2
  exit 1
}

MASTER="${MASTER%/}"
DUCK_PORT_RANDOM="${DUCK_PORT_RANDOM:-1}"

pick_port() {
  local env_name="$1"
  local default_port="$2"
  local val="${!env_name:-}"
  if [[ -z "$val" ]]; then
    if [[ "$DUCK_PORT_RANDOM" == "1" ]]; then
      echo $((10000 + RANDOM % 55001))
      return
    fi
    echo "$default_port"
    return
  fi
  if [[ "${val,,}" == "random" || "${val,,}" == "r" ]]; then
    echo $((10000 + RANDOM % 55001))
    return
  fi
  echo "$val"
}

NODE_IP="$(curl -fsS -4 --max-time 10 https://ifconfig.me/ip 2>/dev/null || curl -fsS -4 --max-time 10 https://api.ip.sb/ip || true)"
[[ -n "$NODE_IP" ]] || { echo "无法获取本机公网 IP" >&2; exit 1; }

declare -A PORTS=()
IFS=',' read -ra PROTOS <<< "$PROTO_CSV"
for p in "${PROTOS[@]}"; do
  key="${p,,}"
  key="${key// /}"
  [[ -z "$key" ]] && continue
  case "$key" in
    shadowsocks) key="ss" ;;
  esac
  case "$key" in
    vless) PORTS[vless]="$(pick_port DUCK_PORT_VLESS 443)" ;;
    vmess) PORTS[vmess]="$(pick_port DUCK_PORT_VMESS 8080)" ;;
    trojan) PORTS[trojan]="$(pick_port DUCK_PORT_TROJAN 2053)" ;;
    ss) PORTS[ss]="$(pick_port DUCK_PORT_SS 1080)" ;;
    *) echo "未知协议: $key" >&2; exit 1 ;;
  esac
done

[[ ${#PORTS[@]} -gt 0 ]] || { echo "至少选择一种协议" >&2; exit 1; }

SERVICE_PORT="${DUCK_SERVICE_PORT:-}"
[[ -n "$SERVICE_PORT" ]] || SERVICE_PORT=$((51000 + RANDOM % 8000))
API_PORT="${DUCK_API_PORT:-$((SERVICE_PORT + 1))}"

PORTS_JSON="{"
first=1
for k in vless vmess trojan ss; do
  [[ -n "${PORTS[$k]:-}" ]] || continue
  [[ $first -eq 1 ]] || PORTS_JSON+=","
  PORTS_JSON+="\"${k}\":${PORTS[$k]}"
  first=0
done
PORTS_JSON+="}"

PROTO_JSON="["
first=1
for k in vless vmess trojan ss; do
  [[ -n "${PORTS[$k]:-}" ]] || continue
  [[ $first -eq 1 ]] || PROTO_JSON+=","
  PROTO_JSON+="\"${k}\""
  first=0
done
PROTO_JSON+="]"

echo "[duck-node] 协议: ${PROTO_CSV}  端口: ${PORTS_JSON}"
echo "[duck-node] 注册到主控 ${MASTER} ..."

REG="$(curl -fsS -X POST "${MASTER}/api/node/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"token\":\"${TOKEN}\",
    \"address\":\"${NODE_IP}\",
    \"protocols\":${PROTO_JSON},
    \"proxy_ports\":${PORTS_JSON},
    \"service_port\":${SERVICE_PORT},
    \"api_port\":${API_PORT}
  }")"

API_SECRET="$(echo "$REG" | jq -r '.api_secret')"
SERVICE_PORT="$(echo "$REG" | jq -r '.service_port')"
API_PORT="$(echo "$REG" | jq -r '.api_port')"
NODE_NAME="$(echo "$REG" | jq -r '.name')"

[[ -n "$API_SECRET" && "$API_SECRET" != "null" ]] || {
  echo "注册失败: $REG" >&2
  exit 1
}

export DEBIAN_FRONTEND=noninteractive
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq curl jq python3 python3-pip unzip >/dev/null
fi

XRAY_VER="v25.8.3"
if ! command -v xray >/dev/null; then
  case "$(uname -m)" in
    x86_64|amd64) xray_pkg="Xray-linux-64.zip" ;;
    aarch64|arm64) xray_pkg="Xray-linux-arm64-v8a.zip" ;;
    *)
      echo "不支持的 CPU 架构: $(uname -m)" >&2
      exit 1
      ;;
  esac
  tmp="$(mktemp -d)"
  curl -fsSL "https://github.com/XTLS/Xray-core/releases/download/${XRAY_VER}/${xray_pkg}" -o "$tmp/x.zip"
  unzip -oq "$tmp/x.zip" -d "$tmp"
  install -m 755 "$tmp/xray" /usr/local/bin/xray
  rm -rf "$tmp"
fi

install -d /opt/duck-node /var/lib/duck-node /etc/duck-node
curl -fsSL "${MASTER}/api/node/agent.py" -o /opt/duck-node/agent.py
python3 -m pip install -q fastapi "uvicorn[standard]" 2>/dev/null || true

cat >/etc/duck-node/env <<EOF
DUCK_NODE_SECRET=${API_SECRET}
DUCK_SERVICE_PORT=${SERVICE_PORT}
DUCK_XRAY_API_PORT=${API_PORT}
DUCK_XRAY_BIN=/usr/local/bin/xray
EOF

cat >/etc/systemd/system/duck-node.service <<'UNIT'
[Unit]
Description=Duck Node Agent
After=network-online.target
Wants=network-online.target

[Service]
EnvironmentFile=/etc/duck-node/env
ExecStart=/usr/bin/python3 /opt/duck-node/agent.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now duck-node

if command -v ufw >/dev/null; then
  ufw allow "${SERVICE_PORT}/tcp" >/dev/null 2>&1 || true
  ufw allow "${API_PORT}/tcp" >/dev/null 2>&1 || true
  for k in vless vmess trojan ss; do
    [[ -n "${PORTS[$k]:-}" ]] && ufw allow "${PORTS[$k]}/tcp" >/dev/null 2>&1 || true
  done
fi

echo "[duck-node] 节点「${NODE_NAME}」已安装 IP=${NODE_IP}"
echo "[duck-node] Agent ${SERVICE_PORT}  API ${API_PORT}"
echo "请到主控面板确认 connected。"
