# Duck

Duck 是**自研**主控 + 节点体系，不是第三方面板的套壳。

- **主控**：用户、订阅、Host、Telegram、节点策略与 Xray 模板  
- **节点**：只装 Agent + Xray；**安装脚本与 Agent 均从主控 API 下载**（`/api/node/bootstrap.sh`、`/api/node/agent.py`），不向其它项目仓库拉节点组件  

## 谁做什么

| 主控 | 节点 VPS |
|------|-----------|
| 用户 / 流量 / 到期 | 无 Web 面板 |
| 订阅（Clash / v2ray / Singbox…） | 不生成订阅 |
| Host、备注、SNI | 按主控下发的 Xray 监听 |
| 生成安装命令（协议 + 端口） | 执行面板给的一条命令 |
| 改端口 / 重连 / 禁用 | 接收主控推送 |

## 部署

| 文件 | 说明 |
|------|------|
| `deploy/duck.sh` | 主控安装 / 更新 |
| `deploy/duck-node-bootstrap.sh` | 节点脚本模板（实际由主控 API 下发） |
| `node_agent/agent.py` | 节点 Agent 源码（主控 API 下发） |

```bash
cd deploy && bash duck.sh preflight
sudo env DOMAIN=... EMAIL=... ADMIN_USER=... ADMIN_PASSWORD='...' bash duck.sh reinstall
```

**加节点**：面板 → 节点设置 → 勾选协议 → 复制安装命令 → 新 VPS 执行（全程只连你的主控域名）。

**订阅**：Clash / Singbox 等按 UA 或 URL 后缀；v2rayN 建议 **`/v2ray`**，`USE_CUSTOM_JSON_DEFAULT=false`。  
**Telegram**：菜单 → Telegram 通知 → 保存 → `duck restart`。  
**CLI**：容器内 `duck cli`。

说明：容器数据目录路径为 `/var/lib/marzban`（历史命名，仅磁盘路径，与任何外部产品无关）。
