# Duck 部署

自建 **duck-panel** 镜像，主控只跑面板，**节点跑流量**。

## Ubuntu 服务器安装（标准流程）

**前提：** 域名 A 记录指向服务器公网 IP；安全组放行 **80、8000**。

```bash
apt update && apt install -y git dnsutils
git clone https://github.com/Evenbreeze/Duck-master.git
cd Duck-master/deploy
sudo env DOMAIN=你的域名 EMAIL=你的邮箱 ADMIN_USER=管理员名 ADMIN_PASSWORD='你的密码' bash install.sh
```

- 必须 **`sudo env`**，变量和 `bash install.sh` 写在**同一行**（不要用 `\` 换行）。
- 成功时第一屏会出现 **`=== Duck 安装开始 (2026-03-30) ===`**，然后 **`[1/6]`**；首次构建 Docker 可能要 **20～40 分钟**。
- 完成后：`https://你的域名:8000/dashboard/`

**更新代码后重装 / 修复脚本：**

```bash
cd ~/Duck-master && git pull
cd deploy && sudo env DOMAIN=... EMAIL=... ADMIN_USER=... ADMIN_PASSWORD='...' bash install.sh
```

不要用 `curl` 单独覆盖 `install.sh` / `ports-lib.sh`，除非确认 GitHub 上已 push 最新提交。

**可选环境变量：**

| 变量 | 含义 |
|------|------|
| `DUCK_PORT_RANDOM=1` | 四个代理口全随机（一般不必，非交互默认推荐端口） |
| `DUCK_SKIP_DNS_CHECK=1` | 域名解析与公网 IP 不一致时仍继续（证书可能失败） |

## 交互安装（本机或 SSH）

```bash
cd deploy && sudo bash install.sh
```

## 主控 / 节点防火墙

- **主控：** 80、8000
- **节点：** 面板里该节点的四个代理口 + **62050、62051**（`node-init.sh`）

## 日常

```bash
duck status | logs | restart | update | rebuild | cli
```

**面板 Restarting、`pkg_resources`、浏览器 `ERR_CONNECTION_CLOSED`：**

```bash
cd ~/Duck-master && git pull
rsync -a --exclude '.git' ~/Duck-master/ /opt/duck/source/
sudo bash ~/Duck-master/deploy/fix-panel.sh
```

（会 **无缓存重建** 镜像，不是改 hosts 或反复重启能解决的。）

## 你要记住的三件事

1. **协议**：模板已含 VMess / VLESS / Trojan / SS（TCP+TLS）。建用户时勾选协议即可。
2. **Host**：入站里 **地址填节点公网 IP**（不要填主控 IP）。TLS 的 SNI 用面板域名。
3. **端口（Duck）**：添加节点时默认 **随机四个端口**。用户勾选对应入站 tag。

## Telegram

面板 **菜单 → Telegram 通知** → 保存后 **`duck restart`**。
