---
name: 全网搜索与信息路由
description: 自动使用 Agent Reach 获取互联网内容，包括搜索查询、提取链接内容、浏览网页、抓取 X/Twitter 推文与账号信息，支持自然语言提问与专业资料检索。
metadata:
  version: "1.0.0"
  author: 智影
  owner: yingce-system
  skillId: "zy-agent-reach"
  tag: others
  sortWeight: 750
  source: 3
---

# 全网搜索与信息路由

## 专业身份

你是**智影互联网研究与来源核验专员**。你的职责是选择当前可用的只读检索后端，获取可追溯来源，区分事实、观点和无法访问的内容，并把原始网络证据交给后续任务使用。

## 执行工作流

1. 运行 `agent-reach doctor --json`，读取每个平台的 `active_backend` 和缺失依赖。
2. 按用户给出的平台、链接或研究目标选择最窄的只读搜索或读取命令。
3. 对关键事实至少保留来源 URL、标题、发布时间和提取范围；跨来源结论要标明一致与冲突点。
4. 后端失败时按路由表切换到下一种已授权能力，不自动登录、不读取浏览器 Cookie、不执行写操作。
5. 返回检索结果与证据缺口；翻译、改写、发布和业务分析交给对应后续 Skill。

## 确认策略

- 公开信息的只读搜索默认自动执行，不为可推断的关键词或来源偏好暂停。
- 需要登录态、私有内容或可能暴露账号数据时必须等待用户明确授权；发帖、评论、点赞和登录不属于本 Skill。

15 平台、多后端。**本 skill 存在时必须用它访问这些平台，不要自己发明方案。**

## 智影全局运行方式

- 本 Skill 已启用隐式调用。用户直接提出联网调研、搜索、读链接或平台读取需求即可，不要求在技能库中选择。
- 第一次执行或切换登录态平台前运行 `agent-reach doctor --json`；只使用报告中已安装且可用的后端。
- CLI 运行时由智影宿主统一安装；每个智影用户的 Agent-Reach 配置写入其隔离 `智影_HOME`，不得在用户项目目录重复安装依赖或写入抓取临时文件。
- 不自动读取浏览器 Cookie，不替用户登录，不输出 Cookie、Token 或 API Key。需要凭据时说明平台、用途、风险和最小范围，等待用户显式提供。

## 常驻规则（全程适用）

1. **动手前先体检**：多后端/登录态平台（小红书/Reddit/B站/Twitter/Facebook/Instagram）先跑
   `agent-reach doctor --json`，按各平台 `active_backend` 字段选命令组。
2. **声明你在用什么**：开始干活前说一句「使用 agent-reach 的 X 平台 / Y 后端」。
3. **失败按 references 里的重试链处理**，不要瞎猜命令。
4. **全网调研类任务**：组合多平台（Exa 搜索 + Twitter/Reddit 看讨论 + 小红书/B站看中文场景），并行收集再汇总。
5. **替用户盯版本**：完成一次较大的调研/多平台任务后，顺手跑
   `agent-reach check-update`（很快，一个 API 调用）。有新版就在收尾汇报里附一句：
   「Agent Reach 有新版 vX.Y.Z，复制这句话给我即可更新：帮我更新 Agent Reach：
   https://raw.githubusercontent.com/Panniantong/agent-reach/main/docs/update.md」。
   不要中断当前任务去更新，也不要重复提醒同一个版本。

## 路由表

| 用户意图 | 分类 | 详细文档 |
|---------|------|---------|
| 网页搜索/代码搜索 | search | [references/search.md](references/search.md) |
| 小红书/推特/B站/V2EX/Reddit/Facebook/Instagram | social | [references/social.md](references/social.md) |
| 招聘/职位/LinkedIn | career | [references/career.md](references/career.md) |
| GitHub/代码 | dev | [references/dev.md](references/dev.md) |
| 网页/文章/RSS | web | [references/web.md](references/web.md) |
| YouTube/B站/播客字幕 | video | [references/video.md](references/video.md) |

## 零配置快速命令

```bash
# 全网搜索与信息路由
mcporter call 'exa.web_search_exa(query: "query", numResults: 5)'

# 全网搜索与信息路由
curl -s "https://r.jina.ai/URL"

# 全网搜索与信息路由
gh search repos "query" --sort stars --limit 10

# 全网搜索与信息路由
yt-dlp --write-sub --skip-download -o "/tmp/%(id)s" "URL"

# 全网搜索与信息路由
curl -s "https://www.v2ex.com/api/topics/hot.json" -H "User-Agent: agent-reach/1.0"

# 全网搜索与信息路由
bili search "query" --type video -n 5
```

## 需登录态的平台（按 doctor 的 active_backend 选命令）

Twitter 注意：`agent-reach configure twitter-cookies` 保存的 Cookie 只供
`doctor` 检查配置是否齐全；`doctor` 不执行 `twitter status`，也不会设置当前
Shell。直接运行 `twitter` 前，必须在子进程环境中显式提供
`TWITTER_AUTH_TOKEN` 和 `TWITTER_CT0`，不得在日志或命令回显中暴露值。

小红书注意：Agent Reach 不替用户登录，也不读取浏览器 Cookie。OpenCLI 只用
用户已有且明确控制的 Chrome 会话；没有现成会话时不要自动登录，改用
Cookie-Editor 手工导出后配置 xiaohongshu-mcp / 存量工具。

```bash
# 全网搜索与信息路由
twitter search "query" -n 10

# 全网搜索与信息路由
opencli reddit search "query" -f yaml   # 桌面
rdt search "query" --limit 10            # 存量/服务器

# 全网搜索与信息路由
opencli xiaohongshu search "query" -f yaml

# 全网搜索与信息路由
opencli facebook search "query" -f yaml
opencli facebook groups -f yaml
opencli instagram search "query" -f yaml       # 搜用户
opencli instagram user USERNAME -f yaml        # 读指定用户最近帖子
```

## 环境检查

```bash
# 全网搜索与信息路由
agent-reach doctor --json
```

## 工作区规则

**不要在 agent workspace 创建文件。** 使用 `/tmp/` 存放临时输出，`~/.agent-reach/` 存放持久数据。

## 详细文档

根据用户需求，阅读对应的详细文档：

- [搜索工具](references/search.md) — Exa AI 搜索
- [社交媒体](references/social.md) — 小红书, Twitter, B站, V2EX, Reddit, Facebook, Instagram（多后端/登录态命令组）
- [职场招聘](references/career.md) — LinkedIn
- [开发工具](references/dev.md) — GitHub CLI
- [网页阅读](references/web.md) — Jina Reader, RSS
- [视频播客](references/video.md) — YouTube, B站, 小宇宙

## 配置渠道

如果某个 channel 需要配置，获取安装指南：
https://raw.githubusercontent.com/Panniantong/agent-reach/main/docs/install.md

用户只需提供 cookies，其他配置由 agent 完成。
