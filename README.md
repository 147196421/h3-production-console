# H3 漫剧制作台

用于管理H3短剧镜头任务、上传生成视频，并从视频开头和结尾附近的多个候选画面中自动挑选清晰、非黑屏的首帧和尾帧。

## 已有功能

- 手机和电脑自适应界面
- 项目、集数和镜头任务管理
- 按秒拆分的H3专业提示词、参考素材、对白与连续性记录
- 每个镜头自动显示人物参考图、中文姓名和相册文件名
- 支持查看大图、下载原图；尾帧续拍镜头自动显示上一镜尾帧
- 针对单提示词框：`@文件名` 就地出现在对应时间段，并自动合并3D风格与首尾衔接要求
- 手机端显示参考图缩略图和醒目的 `@文件名`，页头版本号用于确认升级是否成功
- 第一集专业资产包：固定土屋、收包袱双人构图、母女儿童近景、三人对峙、收音机三视图、维修蒙太奇参考板和一家三口同框首帧
- MP4、MOV、WEBM、MKV上传
- 自动从多个时间点挑选推荐首帧、尾帧
- 自动命名与按集归档
- 标记完成或需要重做
- JSON任务包导入
- 登录密码保护
- 登录后可直接打开“项目文档”，在线阅读和复制全剧大纲、生产规范与AI交接资料
- 后台按“制作台 / 项目文档 / 系统管理”分区，手机端使用底部导航
- 自动检查GitHub版本；发现新版本时显示红色“新”标记
- Docker部署可安装宿主机更新代理，在系统管理中确认后一键更新并保留`data/`数据
- SQLite持久保存，无需额外数据库

首次启动会载入《重回1998》第一集的10个H3生产任务作为示例。

## 全剧创作与AI交接资料

- [项目交接总览](docs/00_项目交接总览.md)
- [项目圣经与全剧总纲](docs/01_项目圣经与全剧总纲.md)
- [人物档案与人物弧](docs/02_人物档案与人物弧.md)
- [第一季60集分集大纲](docs/03_全剧60集分集大纲.md)
- [视觉声音与年代规范](docs/04_视觉声音与年代规范.md)
- [H3生产与首尾帧规范](docs/05_H3生产与首尾帧规范.md)
- [AI接手说明](docs/06_AI接手说明.md)
- [资产索引与备份清单](docs/07_资产索引与备份清单.md)

其他AI接手时应先阅读`docs/00_项目交接总览.md`，再按其中的权威顺序读取其余文件。

## 服务器部署

要求：Ubuntu服务器、Docker Engine、Docker Compose插件，安全组放行TCP 8926。

```bash
cp .env.example .env
nano .env
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:8926/api/health
```

然后访问：`http://服务器IP:8926`

务必把`.env`里的网页登录密码和会话密钥换成全新随机值，不要复用SSH密码。

### 启用后台一键更新

首次部署V1.8后，在服务器项目目录执行一次：

```bash
sudo bash scripts/install-update-agent.sh "$PWD"
```

此脚本只在宿主机安装一个每分钟检查一次的更新代理。网页容器不挂载Docker控制接口；管理员在“系统管理”确认更新后，应用只会在`data/`写入更新请求，由宿主机代理执行`git merge --ff-only`和Docker重新构建。失败状态会显示在系统管理页面，不会清空数据库、视频或首尾帧。

## 数据位置

所有持久数据都在项目目录的`data/`：

- `h3-console.sqlite`：任务和制作进度
- `videos/EPxx/`：H3视频
- `frames/EPxx/`：推荐首尾帧
- `references/`：预留参考图目录

备份时直接备份整个`data/`目录。升级代码不会覆盖该目录。

## 项目JSON格式

```json
{
  "id": "project-id",
  "title": "项目名称",
  "tasks": [
    {
      "id": "EP01-C01",
      "episode": 1,
      "clip": 1,
      "title": "镜头名称",
      "duration": 10,
      "shot_type": "标准人物图",
      "reference_hint": "需要上传的参考图",
      "prompt": "H3提示词",
      "dialogue": "后期对白",
      "continuity": "首尾衔接要求"
    }
  ]
}
```

`shot_type`推荐使用：`标准人物图`、`新首帧`、`尾帧续拍`。

## 更新与排错

```bash
docker compose logs --tail=100 h3-console
docker compose restart h3-console
```

上传失败时先确认视频没有超过300MB、磁盘空间充足，并检查FFmpeg处理日志。健康接口里的`media_tools.ready`必须为`true`。

如果提示服务器缺少`ffprobe`，Docker部署请重新构建镜像：

```bash
docker compose build --no-cache h3-console
docker compose up -d --force-recreate h3-console
```

如果直接在Ubuntu宿主机运行Node，请先安装组件后重启服务：

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
ffprobe -version
```
