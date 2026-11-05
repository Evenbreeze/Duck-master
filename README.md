# Duck

仓库：[Evenbreeze/Duck-master](https://github.com/Evenbreeze/Duck-master)

主控 + 节点 Agent：用户、订阅、Telegram、节点协议/端口；节点 VPS 执行面板生成的安装命令。

## 主控

```bash
git clone https://github.com/Evenbreeze/Duck-master.git /root/Duck-master
sudo env DOMAIN='你的域名' EMAIL='你的邮箱' ADMIN_USER='admin' ADMIN_PASSWORD='你的密码' \
  DUCK_SKIP_DNS_CHECK=1 bash /root/Duck-master/deploy/duck.sh install
```

日常更新 / 修面板：`sudo duck upgrade`（拉 GitHub 最新 + 检查 + 重建；代码 push 后 VPS 只跑这一条）

```bash
cd /root/Duck-master && git pull && sudo duck upgrade
```

远程一键：`curl -fsSL https://raw.githubusercontent.com/Evenbreeze/Duck-master/main/deploy/duck.sh | sudo bash -s upgrade`

面板 `https://域名:8000/dashboard/` · 运维 `duck restart` / `duck logs` / `duck cli`

数据 `/var/lib/duck` · 配置 `/opt/duck`

## deploy（仅此目录，无其它 install/fix 脚本）

| 文件 | 用途 |
|------|------|
| `duck.sh` | **唯一入口**：install / upgrade / restart / logs / cli |
| `duck-lib.sh` | 库（勿单独执行） |
| `duck-node-bootstrap.sh` | 节点安装（面板 API 下发） |
| `docker-compose.yml` | 面板容器 |
| `env.template` / `xray_config.template.json` | 配置模板 |
| `check-repo.sh` / `panel-boot-smoke.py` | CI 与构建自检 |

装好后 `duck` → 符号链接 `/opt/duck/deploy/duck.sh`（勿复制到 `/usr/local/bin`）。
