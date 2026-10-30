# Duck 部署

自建 **duck-panel** 镜像，主控只跑面板，**节点跑流量**。

**部署脚本版本标识：** 安装时应看到 `=== Duck 安装开始 (2026-03-30-panel-check) ===`

---

## 服务器从零重装（推荐流程）

### 准备

1. 域名 **A 记录** → 服务器公网 IP  
2. 云安全组放行 **TCP 80、8000**  
3. 本机 **GitHub Desktop Push** 最新代码（含 `docker-entrypoint.sh`、`Dockerfile`、`deploy/*`）

### A. 全新机器（从未装过 Duck）

```bash
apt update && apt install -y git dnsutils rsync
git clone https://github.com/Evenbreeze/Duck-master.git
cd Duck-master/deploy
grep '2026-03-30-panel-check' install.sh
sudo env DOMAIN=你的域名 EMAIL=你的邮箱 ADMIN_USER=管理员 ADMIN_PASSWORD='你的密码' bash install.sh
```

### B. 同一台机重装（推荐用 reinstall.sh）

**保留数据库和证书**（只重建面板镜像/容器）：

```bash
cd ~/Duck-master/deploy
sudo env DOMAIN=vless.duck678.com EMAIL=9995769@gmail.com ADMIN_USER=wanmei ADMIN_PASSWORD='wanmei123' bash reinstall.sh
```

**连用户/节点数据一起清空**（慎用）：

```bash
sudo env DUCK_WIPE_DATA=1 DOMAIN=... EMAIL=... ADMIN_USER=... ADMIN_PASSWORD='...' bash reinstall.sh
```

### 安装过程说明（约 20～40 分钟）

| 阶段 | 脚本输出 | 含义 |
|------|----------|------|
| 2/6 | acme.sh | 证书工具 |
| 3/6 | 申请 SSL | 占用 **80**，期间勿起别的 Web |
| 4/6 | 写入 .env | 面板与 Xray 配置 |
| 5/6 | Docker build --no-cache | 编译前端 + Python 镜像 |
| 5/6 | 镜像依赖自检 | 缺 pkg_resources 会直接失败 |
| 6/6 | 启动 + 等 8000 | 失败会打印 `docker logs` 并退出 |
| 6/6 | 创建管理员 | 失败可手动 `duck cli admin create --sudo` |

### 装完验收（必须满足）

```bash
grep '2026-03-30-panel-check' ~/Duck-master/deploy/install.sh
docker logs duck-panel --tail 20    # 含 [entrypoint] pkg_resources OK
duck status                         # Up，非 Restarting
ss -tlnp | grep 8000
```

浏览器：`https://你的域名:8000/dashboard/`

---

## 禁止事项（避免再次踩坑）

- 不要用 `curl` 单独覆盖 `install.sh` / `ports-lib.sh`  
- 不要用 `\` 把 `sudo env DOMAIN=...` 拆成两行  
- 不要只 `duck restart` 指望修复 **pkg_resources**（需 **rebuild / reinstall**）  
- 服务器上改过的文件与 git 冲突时：`git fetch && git reset --hard origin/main`（会丢本地手改）

---

## 日常命令

```bash
duck status | logs | restart | update | rebuild | cli | ports
fix-panel.sh      # 无缓存重建 + 自检
duck-reinstall.sh # 同 reinstall.sh 的软链
```

---

## 防火墙

- **主控：** 80、8000  
- **节点：** 面板里四个代理口 + 62050、62051  

## 节点

节点机执行 `deploy/node-init.sh`（见仓库说明）。

## Telegram

面板 **菜单 → Telegram 通知** → 保存后 **`duck restart`**。
