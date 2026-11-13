# standalone-ss

单机 **Shadowsocks（Xray）** 一键脚本，**不接入 Duck 主控**。装完用输出的 `ss://` 链接即可。

## 一键安装（VPS 上 root）

```bash
bash <(curl -Ls https://raw.githubusercontent.com/Evenbreeze/Duck-master/main/standalone-ss/ss.sh)
```

## 可选参数（环境变量）

| 变量 | 说明 |
|------|------|
| `SS_PORT` | 端口（默认随机 10000–65000） |
| `SS_PASSWORD` | 密码（默认随机） |
| `SS_METHOD` | 加密（默认 `chacha20-ietf-poly1305`） |

示例：

```bash
sudo env SS_PORT=42510 SS_PASSWORD='你的密码' bash <(curl -Ls https://raw.githubusercontent.com/Evenbreeze/Duck-master/main/standalone-ss/ss.sh)
```

## 其它命令

```bash
# 本机已有脚本时
sudo bash ss.sh status
sudo bash ss.sh uninstall
```

安装后信息保存在 `/etc/xray/ss-info.txt`。

## 与 Duck 节点区别

| | **standalone-ss** | **Duck 节点** |
|---|-------------------|---------------|
| 主控 | 无 | 需要面板 |
| 服务名 | `xray.service` | `duck-node.service` |
| 配置 | `/etc/xray/config.json` | 主控下发 |

**不要**在同一台机器上同时跑 Duck 节点与本脚本的 `xray.service`（端口/进程会冲突）。若已装 Duck 节点，请用面板管理 SS，勿再跑本脚本。
