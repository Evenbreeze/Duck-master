# Duck

仓库：[Evenbreeze/Duck-master](https://github.com/Evenbreeze/Duck-master)

主控管用户、订阅、Telegram、节点；节点 VPS 只跑 Agent + Xray，安装脚本从**你的主控域名**下载。

## 主控：三条命令记牢

**1. 首次安装**（Ubuntu，域名已解析到本机）

```bash
git clone https://github.com/Evenbreeze/Duck-master.git /root/Duck-master
sudo bash /root/Duck-master/deploy/duck.sh install
```

按提示填域名、邮箱、管理员即可。

**2. 日常更新**（你 push 代码到 GitHub 之后，SSH 上主控执行）

```bash
sudo duck upgrade
```

若还没装过 `duck` 命令，用：

```bash
sudo bash /root/Duck-master/deploy/duck.sh upgrade
```

**3. 没 clone 也能更新**（从 GitHub 拉脚本并升级，会 clone 到 `/root/Duck-master`）

```bash
curl -fsSL https://raw.githubusercontent.com/Evenbreeze/Duck-master/master/deploy/duck.sh | sudo bash -s upgrade
```

默认分支是 `main` 时，把 URL 里的 `master` 改成 `main`。

面板：`https://你的域名:8000/dashboard/` · 运维：`duck restart` · `duck logs` · `duck cli`

## 加节点

面板 → 节点 → 勾选协议 → 复制安装命令 → 在新 VPS 执行（只连主控，不连 GitHub）。

## 其它

- 订阅：v2rayN 建议链接带 **`/v2ray`**
- Telegram：面板菜单配置后 `duck restart`
- 数据目录 `/var/lib/marzban` 仅为历史路径名，与外部产品无关
