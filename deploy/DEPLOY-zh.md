# Duck 部署

自建 **duck-panel** 镜像，主控只跑面板，**节点跑流量**。

## 安装

```bash
cd deploy && bash install.sh
```

主控防火墙：**80、8000**。节点：安装 `node-init.sh`，放行 **该节点四个代理口**（面板节点详情可见）+ **62050、62051**。

## 日常

```bash
duck status | logs | restart | update | cli
```

## 你要记住的三件事

1. **协议**：模板已含 VMess / VLESS / Trojan / SS（TCP+TLS，不用 REALITY）。建用户时勾选协议即可。
2. **Host**：入站里 **地址填节点公网 IP**（不要填主控 IP）。TLS 的 SNI 用面板域名（安装时已配）。
3. **端口（Duck）**：添加节点时默认 **随机四个端口**（VLESS / VMess / Trojan / SS 各一个，互不相同）。该节点 **只监听自己的四条入站**，不会开别的节点的口。用户勾选对应入站 tag（如 `VLESS 节点名`、`VMess 节点名` …）。旧节点用节点弹窗 **升级全部旧节点**，或单节点 **重新随机四协议端口**。

## 稳定、少踩坑（比堆脚本重要）

- 用户连 **节点 IP**，主控只做管理和订阅。
- 优先 **TLS**；你网络 REALITY 不稳就不要上 REALITY。
- 订阅前缀必须带 **:8000**（安装脚本已写进 `.env`）。
- 节点面板里地址用 **IP**，不要用域名指到主控。

## Telegram

面板 **菜单 → Telegram 通知**：填 Bot Token、管理员 Telegram ID（逗号分隔），保存后 **`duck restart`**。配置在 `/var/lib/marzban/duck_telegram.json`。

## 非交互

```bash
DOMAIN=... EMAIL=... ADMIN_USER=... ADMIN_PASSWORD=... bash install.sh
# 可选: DUCK_PORT_SS=58425 或 DUCK_PORT_RANDOM=1
```
