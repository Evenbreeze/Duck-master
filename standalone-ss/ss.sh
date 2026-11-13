#!/usr/bin/env bash
# 单机 Shadowsocks（Xray）— 不连 Duck 主控，装完即用
#
#   bash <(curl -Ls https://raw.githubusercontent.com/Evenbreeze/Duck-master/main/standalone-ss/ss.sh)
#
# 可选环境变量: SS_PORT  SS_PASSWORD  SS_METHOD
set -euo pipefail

XRAY_VER="${XRAY_VER:-v25.8.3}"
XRAY_BIN="/usr/local/bin/xray"
XRAY_ASSETS="/usr/local/share/xray"
CONF_DIR="/etc/xray"
CONF_FILE="${CONF_DIR}/config.json"
INFO_FILE="${CONF_DIR}/ss-info.txt"
SS_METHOD="${SS_METHOD:-chacha20-ietf-poly1305}"

need_root() {
  [[ "${EUID:-0}" -eq 0 ]] || {
    echo "请使用 root: sudo bash ss.sh" >&2
    exit 1
  }
}

rand_port() {
  if [[ -n "${SS_PORT:-}" ]]; then
    echo "$SS_PORT"
    return
  fi
  echo $((10000 + RANDOM % 55001))
}

rand_password() {
  if [[ -n "${SS_PASSWORD:-}" ]]; then
    echo "$SS_PASSWORD"
    return
  fi
  openssl rand -base64 24 | tr -d '/+=' | head -c 22
}

public_ip() {
  curl -fsS -4 --max-time 10 https://ifconfig.me/ip \
    || curl -fsS -4 --max-time 10 https://api.ip.sb/ip
}

install_xray() {
  if command -v xray >/dev/null && [[ -f "${XRAY_ASSETS}/geoip.dat" ]]; then
    return 0
  fi
  export DEBIAN_FRONTEND=noninteractive
  if command -v apt-get >/dev/null; then
    apt-get update -qq
    apt-get install -y -qq curl unzip openssl ca-certificates >/dev/null
  fi
  case "$(uname -m)" in
    x86_64 | amd64) pkg="Xray-linux-64.zip" ;;
    aarch64 | arm64) pkg="Xray-linux-arm64-v8a.zip" ;;
    *)
      echo "不支持的架构: $(uname -m)" >&2
      exit 1
      ;;
  esac
  local tmp
  tmp="$(mktemp -d)"
  curl -fsSL "https://github.com/XTLS/Xray-core/releases/download/${XRAY_VER}/${pkg}" -o "$tmp/x.zip"
  unzip -oq "$tmp/x.zip" -d "$tmp"
  install -m 755 "$tmp/xray" "$XRAY_BIN"
  install -d "$XRAY_ASSETS"
  cp "$tmp/geoip.dat" "$tmp/geosite.dat" "$XRAY_ASSETS/"
  rm -rf "$tmp"
}

write_config() {
  local port="$1" pass="$2" method="$3"
  install -d "$CONF_DIR"
  cat >"$CONF_FILE" <<EOF
{
  "log": { "loglevel": "warning" },
  "inbounds": [
    {
      "tag": "ss-in",
      "listen": "0.0.0.0",
      "port": ${port},
      "protocol": "shadowsocks",
      "settings": {
        "clients": [
          {
            "method": "${method}",
            "password": "${pass}"
          }
        ],
        "network": "tcp,udp"
      },
      "sniffing": {
        "enabled": true,
        "destOverride": ["http", "tls", "quic"]
      }
    }
  ],
  "outbounds": [
    { "protocol": "freedom", "tag": "direct" }
  ]
}
EOF
}

install_systemd() {
  cat >/etc/systemd/system/xray.service <<EOF
[Unit]
Description=Xray (standalone Shadowsocks)
After=network-online.target
Wants=network-online.target

[Service]
Environment=XRAY_LOCATION_ASSET=${XRAY_ASSETS}
ExecStart=${XRAY_BIN} run -c ${CONF_FILE}
Restart=on-failure
RestartSec=3
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now xray
}

ss_uri() {
  local method="$1" pass="$2" host="$3" port="$4"
  local userinfo
  userinfo="$(printf '%s:%s' "$method" "$pass" | base64 -w0 2>/dev/null || printf '%s:%s' "$method" "$pass" | base64)"
  printf 'ss://%s@%s:%s#%s' "$userinfo" "$host" "$port" "SS"
}

cmd_install() {
  need_root
  local port pass ip uri
  port="$(rand_port)"
  pass="$(rand_password)"
  install_xray
  write_config "$port" "$pass" "$SS_METHOD"
  install_systemd
  if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -qi "Status: active"; then
    ufw allow "${port}/tcp" >/dev/null 2>&1 || true
    ufw allow "${port}/udp" >/dev/null 2>&1 || true
  fi
  ip="$(public_ip)"
  uri="$(ss_uri "$SS_METHOD" "$pass" "$ip" "$port")"
  cat >"$INFO_FILE" <<EOF
服务器: ${ip}
端口: ${port}
加密: ${SS_METHOD}
密码: ${pass}
订阅/分享链接:
${uri}
EOF
  chmod 600 "$INFO_FILE"
  echo "=============================================="
  echo "[ss] 安装完成"
  echo "服务器: ${ip}"
  echo "端口:   ${port}"
  echo "加密:   ${SS_METHOD}"
  echo "密码:   ${pass}"
  echo "链接:   ${uri}"
  echo "已保存: ${INFO_FILE}"
  echo "=============================================="
  echo "请在安全组/防火墙放行 TCP+UDP ${port}"
  systemctl --no-pager status xray || true
}

cmd_uninstall() {
  need_root
  systemctl stop xray 2>/dev/null || true
  systemctl disable xray 2>/dev/null || true
  rm -f /etc/systemd/system/xray.service
  systemctl daemon-reload
  rm -rf "$CONF_DIR"
  echo "[ss] 已卸载 xray 服务与 ${CONF_DIR}"
}

cmd_status() {
  systemctl status xray --no-pager || true
  [[ -f "$INFO_FILE" ]] && cat "$INFO_FILE" || echo "未找到 ${INFO_FILE}"
}

case "${1:-install}" in
  install | "") cmd_install ;;
  uninstall | remove) cmd_uninstall ;;
  status) cmd_status ;;
  *)
    echo "用法: ss.sh [install|uninstall|status]" >&2
    exit 1
    ;;
esac
