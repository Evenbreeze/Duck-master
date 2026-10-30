# Duck 主控部署（定稿）

**版本标识：** `2026-10-30-full-audit`  
**安装前自检：** `bash deploy/preflight.sh` → 必须看到 `preflight OK`

---

## 你只需记住这一条龙

### Windows（每次改完代码）

GitHub Desktop → **Commit + Push**（确认含 `deploy/preflight.sh`、`Dockerfile`、`deploy/lib/`）

### 全新 Ubuntu 服务器

```bash
apt update && apt install -y git dnsutils rsync
git clone https://github.com/Evenbreeze/Duck-master.git ~/Duck-master
cd ~/Duck-master/deploy && bash preflight.sh
sudo env DOMAIN=你的域名 EMAIL=邮箱 ADMIN_USER=用户 ADMIN_PASSWORD='密码' bash reinstall.sh
```

### 已有 clone 的服务器（重装）

```bash
cd ~/Duck-master/deploy
sudo env DOMAIN=... EMAIL=... ADMIN_USER=... ADMIN_PASSWORD='...' bash reinstall.sh
```

`reinstall.sh` 会自动：`git fetch` + 对齐 `origin/main`（或 `master`）→ `preflight` → 完整 `install.sh`

---

## 禁止

- 不要用 `curl` 覆盖单个脚本  
- 不要 `sudo env ... \` 换行  
- 不要在 preflight 失败时继续 `docker build`  

---

## 装完验收（四条）

```bash
docker logs duck-panel --tail 10    # [entrypoint] apscheduler OK
duck status                         # Up
ss -tlnp | grep 8000
curl -sk -o /dev/null -w '%{http_code}\n' https://127.0.0.1:8000/api/admin
```

浏览器：`https://域名:8000/dashboard/`

---

## 日常

`duck status | logs | rebuild | cli`  
异常：`bash preflight.sh` → `fix-panel.sh`
