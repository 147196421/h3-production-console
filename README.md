# 多模型漫剧制作台

用于管理H3、Grok等视频模型的短剧镜头任务。可按模型切换专用提示词、分别上传成片，并从每个模型视频的开头和结尾附近自动挑选清晰、非黑屏的首帧和尾帧。

## 已有功能

- 手机和电脑自适应界面
- 项目、集数和镜头任务管理
- H3/Grok模型切换：同一剧情自动显示对应模型的执行与质量提示
- EP01逐镜双运镜包：10个镜头均有独立H3稳定分段策略与Grok电影运动策略
- 模型分轨存储：任务状态、成片、首帧、尾帧互不覆盖
- 按秒拆分的专业提示词、参考素材、对白与连续性记录
- 每个镜头自动显示人物参考图、中文姓名和相册文件名
- 支持查看大图、下载原图；尾帧续拍镜头自动显示上一镜尾帧
- 针对单提示词框：`@文件名` 就地出现在对应时间段，并自动合并3D风格与首尾衔接要求
- 手机端显示参考图缩略图和醒目的 `@文件名`，页头版本号用于确认升级是否成功
- 第一集专业资产包：固定土屋、收包袱双人构图、母女儿童近景、三人对峙、收音机三视图、维修蒙太奇参考板和一家三口同框首帧
- V1.9第一集连续性提示词包：逐镜校验人物入场、动作因果、道具来源、空间站位、声音桥与首尾帧关系
- MP4、MOV、WEBM、MKV上传
- 自动从多个时间点挑选推荐首帧、尾帧；尾帧续拍只继承当前模型分轨
- 自动命名与按集归档
- 标记完成或需要重做
- JSON任务包导入
- 登录密码保护
- 登录后可直接打开“项目文档”，在线阅读和复制全剧大纲、生产规范与AI交接资料
- 后台按“制作台 / 项目文档 / 运行状态”分区，手机端使用底部导航
- 运行状态只显示当前版本和FFmpeg组件，不连接GitHub、不保存代理、不执行在线更新
- SQLite持久保存，无需额外数据库

首次启动会载入《重回1998》第一集的10个H3生产任务作为示例。

## 全剧创作与AI交接资料

- [项目交接总览](docs/00_项目交接总览.md)
- [项目圣经与全剧总纲](docs/01_项目圣经与全剧总纲.md)
- [人物档案与人物弧](docs/02_人物档案与人物弧.md)
- [第一季60集分集大纲](docs/03_全剧60集分集大纲.md)
- [视觉声音与年代规范](docs/04_视觉声音与年代规范.md)
- [H3生产与首尾帧规范](docs/05_H3生产与首尾帧规范.md)
- [多模型提示词与成片分轨规范](docs/11_多模型提示词与成片分轨规范.md)
- [AI接手说明](docs/06_AI接手说明.md)
- [资产索引与备份清单](docs/07_资产索引与备份清单.md)
- [第一集镜头连续性与生产交接](docs/08_EP01镜头连续性与生产交接.md)
- [系统运维与GitHub发布](docs/09_系统运维与GitHub发布.md)
- [新AI接管与第二集启动](docs/10_新AI接管与第二集启动.md)

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

### 从GitHub发布新版本

后台不检查或安装更新。由具有服务器权限的AI或管理员在项目目录执行：

```bash
git fetch origin main
git merge --ff-only origin/main
docker compose build h3-console
docker compose up -d --force-recreate h3-console
```

从V1.10升级后，可执行一次`sudo bash scripts/remove-online-update.sh`，清除旧定时更新代理、旧代理凭据和遗留状态文件；不会删除数据库、视频或首尾帧。

## 数据位置

所有持久数据都在项目目录的`data/`：

- `h3-console.sqlite`：任务和制作进度
- `videos/h3/EPxx/`、`videos/grok/EPxx/`：各模型成片
- `frames/h3/EPxx/`、`frames/grok/EPxx/`：各模型推荐首尾帧
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
