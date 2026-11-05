# Duck

仓库：[Evenbreeze/Duck-master](https://github.com/Evenbreeze/Duck-master)

主控 + 节点 Agent：用户、订阅、Telegram、节点协议/端口；节点 VPS 执行面板生成的安装命令。

## 主控

```bash
git clone https://github.com/Evenbreeze/Duck-master.git /root/Duck-master
sudo bash /root/Duck-master/deploy/duck.sh install
```

日常更新：`sudo duck upgrade`（或 `sudo bash /root/Duck-master/deploy/duck.sh upgrade`）

远程一键：`curl -fsSL https://raw.githubusercontent.com/Evenbreeze/Duck-master/main/deploy/duck.sh | sudo bash -s upgrade`

面板 `https://域名:8000/dashboard/` · 运维 `duck restart` / `duck logs` / `duck cli`

数据 `/var/lib/duck` · 配置 `/opt/duck`

## deploy

| 文件 | 用途 |
|------|------|
| `duck.sh` | install / upgrade / 运维 |
| `duck-lib.sh` | 库 |
| `duck-node-bootstrap.sh` | 节点安装（API 下发） |
| `docker-compose.yml` | 面板容器 |
| `env.template` | `.env` 模板 |
| `xray_config.template.json` | 主控 Xray 模板 |
