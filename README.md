# Duck

仓库：[Evenbreeze/Duck-master](https://github.com/Evenbreeze/Duck-master)

自研 **主控 + 节点 Agent**：用户、订阅（Clash / v2ray / Singbox）、Telegram、节点协议与端口均由主控控制；节点 VPS 只执行面板下发的一条安装命令。

## 主控三条命令

**首次安装**（Ubuntu，域名已 A 记录到本机）

```bash
git clone https://github.com/Evenbreeze/Duck-master.git /root/Duck-master
sudo bash /root/Duck-master/deploy/duck.sh install
```

**日常更新**（push 代码后 SSH 主控）

```bash
sudo duck upgrade
```

未安装 `duck` 命令时：`sudo bash /root/Duck-master/deploy/duck.sh upgrade`

**无 clone 一键升级**（会 clone 到 `/root/Duck-master`）

```bash
curl -fsSL https://raw.githubusercontent.com/Evenbreeze/Duck-master/master/deploy/duck.sh | sudo bash -s upgrade
```

默认分支为 `main` 时，URL 里 `master` 改成 `main`。

面板：`https://你的域名:8000/dashboard/`  
侧栏：**用户 · 节点 · Host · Telegram · 系统**  
运维：`duck restart` · `duck logs` · `duck cli`

## 加节点

面板 **节点** → 名称 + 协议 → **生成安装命令** → 新 VPS 执行（只连主控域名，不连 GitHub）。

## deploy 目录（仅 6 个文件）

| 文件 | 用途 |
|------|------|
| `duck.sh` | 唯一入口：install / upgrade / fix / duck 运维 |
| `duck-lib.sh` | 库函数 |
| `duck-node-bootstrap.sh` | 节点安装模板（API 下发） |
| `docker-compose.yml` | 面板容器 |
| `env.template` | 安装时生成 `.env` |
| `xray_config.template.json` | 主控 Xray 模板 |

数据与证书：`/var/lib/duck` · 配置与 compose：`/opt/duck`
