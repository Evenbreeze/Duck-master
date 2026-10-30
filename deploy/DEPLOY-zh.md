# Duck 部署（简版）

## 1. Windows Push 整个仓库到 GitHub

## 2. 服务器

```bash
cd ~/Duck-master && git fetch origin && git reset --hard origin/main
cd deploy && bash preflight.sh
sudo env DOMAIN=域名 EMAIL=邮箱 ADMIN_USER=用户 ADMIN_PASSWORD='密码' bash reinstall.sh
```

已装过、只重建面板：`cd ~/Duck-master/deploy && sudo bash fix-panel.sh`

## 白屏说明

前端路径在 **`app/dashboard/__init__.py`** 启动时自动把 `/assets/` 改成 `/statics/`，**必须 Push 含该文件的代码并 rebuild 一次**。

## 成功

- `preflight OK`
- 日志 `[entrypoint] apscheduler OK`
- 浏览器 `https://域名:8000/dashboard/` 强刷 Ctrl+F5
