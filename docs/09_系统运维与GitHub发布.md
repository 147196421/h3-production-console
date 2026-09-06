# 系统运维与GitHub发布

## 1. 部署边界

- 网页与API运行在`h3-console`容器，默认端口8926。
- 项目目录的`data/`挂载为容器`/data`，保存数据库、视频、首尾帧和运行参考图。
- GitHub保存代码、文档、任务种子和固定参考图，不保存`data/`运行数据，也不保存密码、代理或API密钥。
- 后台“运行状态”只显示当前版本和FFmpeg状态，不访问GitHub、不检测版本、不执行更新。

## 2. 标准发布流程

由具备服务器和GitHub权限的AI或管理员在服务器项目目录执行：

```bash
git status --short
git fetch origin main
git merge --ff-only origin/main
docker compose build h3-console
docker compose up -d --force-recreate h3-console
docker compose ps
curl http://127.0.0.1:8926/api/health
```

发布前必须检查本地改动。不得用`git reset --hard`覆盖服务器上不明来源的修改。`data/`不得删除、移动或加入Git。

## 3. 从V1.10移除旧在线更新组件

升级到V1.11后执行一次：

```bash
sudo bash scripts/remove-online-update.sh
```

脚本只删除旧cron任务、宿主机更新代理、代理凭据和旧更新状态文件，不删除SQLite数据库、视频、首尾帧或固定参考图。

## 4. 发布验收

1. `/api/health`返回`ok:true`、目标版本号和`media_tools.ready:true`。
2. 后台顶部版本号与`package.json`一致。
3. “运行状态”中只出现当前版本和FFmpeg状态。
4. “项目文档”能读取全部Markdown文件。
5. 随机打开一个镜头，参考图、提示词和已保存状态仍存在。
6. 上传测试视频能产生首帧和尾帧。

## 5. 故障排查

```bash
docker compose logs --tail=150 h3-console
docker compose ps
df -h
```

FFmpeg缺失时重建镜像：

```bash
docker compose build --no-cache h3-console
docker compose up -d --force-recreate h3-console
```

