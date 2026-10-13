---
name: 短剧漫剧创作
description: 短剧与漫剧工业化视听导演系统。在画布上贯通长文解析、单集剧本改编、统一视觉风格设定、角色与场景资产卡生成、制作版分镜与视频生成调度。
metadata:
  version: "1.0.0"
  author: 智影
  owner: yingce-system
  skillId: "zy-short-drama-master"
  tag: drama
  sortWeight: 850
  source: 3
---

# 短剧/漫剧全流程视听导演总控

本技能是面向智影画布 Agent 的短剧、漫剧工业化视听导演超级系统。
它将剧作解析、视觉资产锁定、分镜故事板拆解与 AI 视频/图片生成整合为画布原生操作流，实现全自动与可交互的高效制片。

---

## 核心职责与产出物

总导演在画布上负责构建完整的制片流水线：
1. **剧作大纲与单集剧本**：承载于 `markdown` 节点，包含三幕节拍、黄金 3 秒钩子、爽点反转与对白。
2. **人物与场景视觉资产卡**：承载于 `image` 节点，锁定角色长相、服饰、道具与场景基调。
3. **结构化分镜故事板**：承载于原生 `script` 节点，通过 `canvas_create_storyboard` 精确构建包含机位、运镜、动作、对白、时长的镜头表。
4. **媒体生成与排版**：调用 `generate_media` 提交镜头生成，并使用 `canvas_arrange_nodes` 自动流式排版。

---

## 工业化执行标准 (双模执行管线)

### 模式一：画布 Agent 执行管线 (Canvas Agent Automation)
1. **画布感知与剧本摄取 (`canvas_get_state` + `canvas_inspect_image`)**：
   - 启动时先调用 `canvas_get_state` 读取当前画布节点、连线与 `snapshotHash`。
   - 识别画布上已有的剧情文本或剧本草稿。若用户上传了人物、场景或服装参考图，调用 `canvas_inspect_image(nodeId)` 细致观察角色五官、发型、体态与色彩。
   - 若画布为空，主动引导用户提供故事创意、大纲或参考素材。

2. **剧作大纲与视觉资产卡落位 (`canvas_apply_ops`)**：
   - **创建剧本大纲节点**：
     - 调用 `canvas_apply_ops` 添加 `markdown` 节点（`nodeType: "markdown"`, `title: "剧本与节拍大纲"`）。
     - 正文包含：核心戏剧冲突、分场目录、黄金 3 秒钩子（Hook）、主副线推进与每场情绪高潮。
   - **创建角色/场景资产卡**：
     - 调用 `canvas_apply_ops` 为主角、重要配角及关键场景分别创建 `image` 草稿节点（`nodeType: "image"`, `title: "角色资产-主角"`、`"场景资产-主场景"` 等）。
     - 在提示词中写入该资产的外观锁定描述（五官、发型、服装 HEX 颜色、摄影风格）。
     - 在 `canvas_apply_ops` 中使用 `connect_nodes` 将剧本节点连线至各资产卡节点，声明依赖关系。
     - 若用户需要即刻生成资产图，查询 `model_list(mode="image")` 并调用 `generate_media` 渲染资产卡。

### 第三步：构建结构化分镜脚本 (`canvas_create_storyboard`)
**严禁使用普通文本或 Markdown 伪造分镜！** 必须使用原生结构化 `script` 节点，确保镜头可逐镜审查、编辑与生成。
1. 调用 `canvas_create_storyboard` 创建 `script` 节点：
   - `nodeId`: 新分镜节点唯一 ID（如 `script-ep01`）
   - `title`: `EP01 分镜故事板`
   - `snapshotHash`: 最新的 `snapshotHash`
   - `rows`: 结构化镜头列表，每镜对象属性规范：
     - `shotNumber`: 镜头序号（如 1, 2, 3...）
     - `durationSeconds`: 镜头真实秒数（必填数值 >0，短剧单镜通常为 3 到 6 秒，不能超出模型原生上限）
     - `plotDescription`: 本镜叙事与人物可见动作（`起点状态 → 核心动作 → 终点状态`）
     - `dialogue`: 角色台词或画外音（VO），台词时长严格按 3.5 字/秒计算，留足起止气口
     - `videoMotionPrompt`: 工业级视频运动提示词（主体特征、动作细节、物理碰撞、运镜轨迹）
     - `imageGenerationPrompt`: 对应首帧/分镜关键帧提示词（含环境、光影、主体构图）
     - `camera`: 运镜方式（例如：`特写缓缓向前推近`、`过肩跟随移镜`、`低角度仰拍快速摇升`）
     - `motion`: 动态幅度（`微动/呼吸感`、`中度自然动作`、`剧烈打斗/奔跑`）
     - `shotSize`: 景别（`大特写 ECU`、`特写 CU`、`中景 MS`、`全景 FS`、`远景 WS`）
     - `lightingAndAtmosphere`: 光影色温与戏剧氛围（如 `伦勃朗侧逆光，冷暖交织悬疑光感`）
     - `audioEffects`: 拟音与环境声（如 `心跳重低音音效，雨夜雷鸣，酒杯碎裂刺耳声`）
  - 在 `canvas_apply_ops` 中使用 `connect_nodes`，将相关角色的 `image` 资产节点连线至 `script` 分镜节点，作为镜头的媒体参考输入。

4. **分镜审查与精准微调 (`canvas_read_storyboard` + `canvas_edit_storyboard`)**：
   - 当用户要求修改、插入或删除某个分镜行时，先调用 `canvas_read_storyboard(nodeId, offset)` 读取该分镜节点的最新数据，获取每行的真实 `rowId` 与当前 `snapshotHash`。
   - 调用 `canvas_edit_storyboard`：
     - `action`: `"update"`（修改）、`"append"`（追加）或 `"remove"`（删除）
     - `rowId`: 更新或删除时传入真实 `rowId`
     - `patch`: 包含 `durationSeconds`、`plotDescription`、`videoMotionPrompt`、`dialogue` 等需更新的字段。

5. **逐镜生成与画布工整排布 (`model_list` + `generate_media` + `canvas_arrange_nodes`)**：
   - 创作者确认分镜后，调用 `model_list(mode="video", referenceNodeIds=[...])` 查询当前支持的视频模型。
   - 获得授权后，调用 `generate_media`：
     - `mode`: `"video"`
     - `nodeId`: 目标分镜或视频节点 ID
     - `referenceNodeIds`: 对应的角色/场景图片节点 ID 数组
     - `prompt`: 编译后的可执行视频提示词（若有参考图，在对应描述中准确标注 `@图片1`、`@图片2`）
     - `size`: 短剧默认竖屏 `"9:16"`（横屏漫剧用 `"16:9"`）
     - `durationSeconds`: 严格与该镜 `durationSeconds` 一致
   - 通过 `task_get` 核验任务状态。
   - 调用 `canvas_arrange_nodes(mode="flow")`，按从左至右的工业流向清晰排布：
     `【剧本大纲节点】 → 【角色/场景资产卡】 → 【结构化分镜表】 → 【生成视频矩阵】`。

### 模式二：生图/生视频工作台直达态 (Workbench Direct Mode)
- **开箱即用提示词卡片**：直接提取短剧高悬念、快节奏的结构化镜头动作与首尾帧提示词；
- **参数预设**：短剧单镜头通常 3-6 秒，支持长运镜 15s/30s，画幅默认竖屏 `9:16`（漫剧默认横屏 `16:9`）；
- **推荐模型**：生图推荐 `gpt-image-2.5` 4K；生视频推荐 `seedance-2.5` / `minimax-h3`。

---

## 短剧视听导演核心法则

### 1. 黄金 3 秒抓手原则 (Hook Engine)
- 第 1-2 镜必须在 3 秒内释放核心冲突或悬念（当众受辱、身份反转、生死倒计时、惊悚悬疑点）。
- 绝不在开篇浪费超过 2 秒用于无关紧要的空镜头或环境风景。

### 2. 对白与镜头时长平衡铁律
- 汉字语速标准：日常说话约为每秒 3.5-4 字。
- 计算公式：`镜头最小所需时长 = (台词总字数 ÷ 3.8) + 1.2秒（起始前摇0.5s + 反应余波0.7s）`。
- 严禁出现“5 秒镜头塞进 35 字台词”的失真排布。若台词过长，必须拆解为多镜正反打或切过肩反应镜。

### 3. 镜头切换动力与空间轴线
- 切镜必须带来信息、权力、情绪或空间视角的实质变化，严禁同景别同角度无意义切镜。
- 双人对话严格遵守 180 度轴线法则，保持视线相对，杜绝越轴跳切导致人物方向错乱。

### 4. 视频提示词精细化工程 (Seedance / 即梦标准)
- **单镜头单动作**：一个分镜行只描述一个核心动作链（`起点姿态 → 动作过程与接触 → 终点定格`）。
- **多模态精准锚定**：
  - 首帧控制：`@图片1 作为镜头起始首帧`；
  - 角色一致性：`@图片2 锁定主角面部特征与发型，微表情自然变化`；
  - 运动轨迹：摄影机运动与主体动作分离描述，避免视角与人物运动相互打架。

---

## 输出与交互规范

1. **阶段清晰汇报**：每次操作后，清晰告知用户当前已落位的画布节点及下一制作阶段。
2. **确认门禁**：大纲与分镜表生成后，主动询问用户：“分镜已写入画布，是否需要微调镜头时长或运镜细节？确认无误即可开启视频出片。”
3. **零污染保证**：所有数据全在画布节点内存与系统数据库流转，不生成本地垃圾文件。
