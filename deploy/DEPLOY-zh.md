# Duck 部署（简版）

## 1. Windows Push 整个仓库到 GitHub

## 2. 服务器

```bash
cd ~/Duck-master && git fetch origin && git reset --hard origin/main
cd deploy && bash preflight.sh
sudo env DOMAIN=域名 EMAIL=邮箱 ADMIN_USER=用户 ADMIN_PASSWORD='密码' bash reinstall.sh
```

已装过、只重建面板：`cd ~/Duck-master/deploy && sudo bash fix-panel.sh`

## 常见问题

| 现象 | 原因 | 处理 |
|------|------|------|
| 白屏 / JS 404 | 静态路径 `/assets/` vs `/statics/` | Push 后 `sudo bash fix-panel.sh`，Ctrl+F5 |
| 登录 **Not Found**，请求 `/admin` 404 | 镜像构建未写入 `VITE_BASE_API=/api/` | 同上 rebuild（Dockerfile 已固定，构建失败会直接报错） |

## 成功

- `preflight OK`
- 构建日志无 `dashboard build` 失败；容器日志 `[entrypoint] apscheduler OK`
- 登录时 Network 应为 **`/api/admin/token`**（不是 `/admin/token`）
- `https://域名:8000/dashboard/`
