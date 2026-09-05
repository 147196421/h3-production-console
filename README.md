# H3 漫剧制作台

用于管理H3短剧镜头任务、上传生成视频，并从视频开头和结尾附近的多个候选画面中自动挑选清晰、非黑屏的首帧和尾帧。

## 已有功能

- 手机和电脑自适应界面
- 项目、集数和镜头任务管理
- 按秒拆分的H3专业提示词、参考素材、对白与连续性记录
- 每个镜头自动显示人物参考图、中文姓名和相册文件名
- 支持查看大图、下载原图；尾帧续拍镜头自动显示上一镜尾帧
- 针对好漫剧单提示词框：`@文件名` 就地出现在对应时间段，并自动合并3D风格与首尾衔接要求
- 手机端显示参考图缩略图和醒目的 `@文件名`，页头版本号用于确认升级是否成功
- MP4、MOV、WEBM、MKV上传
- 自动从多个时间点挑选推荐首帧、尾帧
- 自动命名与按集归档
- 标记完成或需要重做
- JSON任务包导入
- 登录密码保护
- SQLite持久保存，无需额外数据库

首次启动会载入《重回1998》第一集的10个H3生产任务作为示例。

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

上传失败时先确认视频没有超过300MB、磁盘空间充足，并检查FFmpeg处理日志。
