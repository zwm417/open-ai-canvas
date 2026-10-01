# DMC MiniMax H3

DMC MiniMax H3 异步视频生成协议插件（支持 768P、1-15秒、首尾帧/多模态参考）。

## Provider

| Provider | 能力 | 端点 |
|---|---|---|
| dmc-h3 | video | POST /v2/video_generation（创建任务）<br>GET /v2/query/video_generation/{taskId}（查询任务） |

## 配置说明

- **Base URL**：`https://dmc.cc`
- **鉴权方式**：`Authorization: Bearer <DMC_API_KEY>`
- **模型 ID**：`MiniMax-H3`

## 契约特性与技术规范

- **输出规格**：固定输出 `768P`，支持整数 `1–15` 秒名义时长。
- **画幅比例**：支持 `16:9`、`9:16`、`1:1`、`4:3`、`3:4`、`21:9`，首尾帧模式可使用 `adaptive`。
- **输入支持**：
  - 恰好 1 个文本项（最长 7000 Unicode 字符）；
  - 0–12 个媒体项（图片 ≤ 9 张、参考视频 ≤ 3 段、参考音频 ≤ 3 段）；
  - 角色（role）：首帧 `first_frame`、尾帧 `last_frame`、参考图 `reference_image`、参考视频 `reference_video`、参考音频 `reference_audio`。
- **严格校验**：上游实行严格字段校验，不发送任何未公开的扩展字段以防触发 HTTP 400。
- **计费模式**：按秒阶梯计费（`per_second`），基准单价 ¥0.06/秒（60,000 微积分/秒）。
