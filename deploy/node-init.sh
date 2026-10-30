#!/usr/bin/env bash
# Duck 节点安装（Marzban-Node）
#
# 用户代理端口不在本脚本里固定：由主控面板为每个节点分配四个随机口
# （VLESS / VMess / Trojan / SS），在面板「节点」详情中查看后放行防火墙。
#
# 用法:
#   bash node-init.sh
#   MARZBAN_NODE_PORT=62050 MARZBAN_NODE_API_PORT=62051 bash node-init.sh
#
set -euo pipefail

green() { echo -e "\033[32m$*\033[0m"; }

MARZBAN_NODE_PORT="${MARZBAN_NODE_PORT:-62050}"
MARZBAN_NODE_API_PORT="${MARZBAN_NODE_API_PORT:-62051}"

echo ""
green "=== 安装 Duck 节点 (Marzban-Node) ==="
echo "防火墙请放行 TCP:"
echo "  节点通信: ${MARZBAN_NODE_PORT}, ${MARZBAN_NODE_API_PORT}"
echo "  用户代理: 主控面板 → 节点 → 展开该节点，复制四个端口后再放行"
echo "面板添加节点时，地址填本机公网 IP，端口 ${MARZBAN_NODE_PORT} / API ${MARZBAN_NODE_API_PORT}。"
echo ""

bash -c "$(curl -sL https://github.com/Gozargah/Marzban-scripts/raw/master/marzban-node.sh)" @ install

green "节点安装完成。回到主控面板添加节点并确认状态为已连接。"
