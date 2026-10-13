---
name: 小说剧本转分镜
description: 小说、网文片段与剧本转分镜导演系统。深度解析源文本并改编为结构化专业影视分镜脚本，精准规划景别、运镜、灯光与音效。
metadata:
  version: "1.0.0"
  author: 智影
  owner: yingce-system
  skillId: "zy-aq-storyboard"
  tag: drama
  sortWeight: 840
  source: 3
---

# 小说/网文剧本转分镜导演总控系统

将小说原著、网文连载片段或文字大纲深度解析并改编为可视化、可生成影视画面的工业级分镜。
支持 16:9 横屏中长精品剧与 9:16 竖屏快节奏系列短剧两大制式，在智影画布上实现从文本提炼、人设立绘、原生结构化分镜故事板（`script` 节点）到 AI 视频生成的全流程闭环。

---

## 核心制式与交付去向

解析源文本后，由总导演协同确认两大决策：
1. **制作制式**：
   - **16:9 横屏精品剧**：适合史诗、悬疑、科幻与深度剧情，按幕/场戏剧单元组织，注重呼吸感与视听纵深。
   - **9:16 竖屏短剧**：每集 90-120 秒（105 秒中值），前 3 秒黄金钩子，高频反转与强烈情绪悬念。
2. **交付去向**：
   - **原生结构化分镜板（推荐）**：调用 `canvas_create_storyboard` 构建包含精确秒数、机位、运镜与提示词的完整分镜节点。
   - **AI 导演接力大纲**：在 `markdown` 节点输出场次级视觉大纲与节拍表，供后续逐步细化。

---

## 工业化执行标准 (双模执行管线)

### 模式一：画布 Agent 执行管线 (Canvas Agent Automation)
1. **画布感知与文本体检 (`canvas_get_state` + `canvas_inspect_image`)**：
   - 调用 `canvas_get_state` 读取画布已有节点、连线与 `snapshotHash`。
   - 识别画布上的原著文本节点或用户输入内容，进行体检：
     - 提取角色称呼映射表（姓名、代号、职称、绰号）；
     - 梳理情节节点账本与因果链路；
     - 若已有角色或场景参考图片，调用 `canvas_inspect_image(nodeId)` 查看其真实外观。

2. **剧本大纲与视觉资产卡落位 (`canvas_apply_ops`)**：
   - **创建剧作解析与节拍大纲节点**：
     - 调用 `canvas_apply_ops` 创建 `markdown` 节点（`nodeType: "markdown"`, `title: "剧作解析与场次大纲"`）。
     - 正文记录：有效字数、核心冲突、人物小传、分场节拍、每场核心爽点/反转点。
   - **创建角色与关键场景资产卡**：
     - 调用 `canvas_apply_ops` 为核心人物与标志性场景创建 `image` 草稿节点（`nodeType: "image"`, `title: "角色资产-主角"`、`"场景资产-议事大厅"` 等）。
     - 在 `canvas_apply_ops` 中使用 `connect_nodes` 建立从大纲节点至各资产卡节点的连线。
     - 确认需要出图时，调用 `model_list(mode="image")` 与 `generate_media` 渲染资产卡。

3. **原生结构化分镜故事板构建 (`canvas_create_storyboard`)**：
   - **严禁使用普通 Markdown 文本表格敷衍分镜！** 必须调用 `canvas_create_storyboard` 创建真实 `script` 节点：
     - `nodeId`: 分镜节点唯一 ID（如 `script-story-ep01`）
     - `title`: `EP01 结构化分镜故事板`
     - `snapshotHash`: 最新的快照哈希
     - `rows`: 结构化镜头列表，每行定义：`shotNumber`, `durationSeconds`, `plotDescription`, `dialogue`, `videoMotionPrompt`, `imageGenerationPrompt`, `camera`, `motion`, `shotSize`, `lightingAndAtmosphere`, `audioEffects`。
   - 在 `canvas_apply_ops` 中使用 `connect_nodes`，将角色 `image` 资产节点连线至 `script` 分镜节点，声明素材输入。

4. **分镜审查与精准微调 (`canvas_read_storyboard` + `canvas_edit_storyboard`)**：
   - 用户对某镜有增删改需求时，调用 `canvas_read_storyboard(nodeId, offset)` 读取该分镜节点的当前镜头行与 `rowId`。
   - 调用 `canvas_edit_storyboard`：
     - `action`: `"update"`（修改） | `"append"`（追加） | `"remove"`（删除）
     - `rowId`: 对应行 ID
     - `patch`: 需更新的镜头字段（`durationSeconds`, `videoMotionPrompt`, `dialogue` 等）。

5. **媒体生成与排版 (`model_list` + `generate_media` + `canvas_arrange_nodes`)**：
   - 确认分镜无误后，调用 `model_list(mode="video", referenceNodeIds=[...])` 查询当前生效的视频生成模型。
   - 经授权后，调用 `generate_media` 逐镜发起视频生成任务：
     - 在提示词中针对引用的角色卡使用 `@图片1`、`@图片2` 精确锚定外观；
     - `size`: 竖屏短剧为 `"9:16"`，横屏剧为 `"16:9"`；
     - 时长与分镜行的 `durationSeconds` 严格对齐。
   - 通过 `task_get` 核验生成结果。
   - 调用 `canvas_arrange_nodes(mode="flow")` 完成画布自左向右流水线美学排版。

### 模式二：生图/生视频工作台直达态 (Workbench Direct Mode)
- **开箱即用提示词卡片**：直接提取结构化镜头动作与首尾帧提示词；
- **参数预设**：短剧单镜头通常 3-6 秒，支持长运镜 15s/30s，画幅默认竖屏 `9:16`；
- **推荐模型**：生图推荐 `gpt-image-2.5` 4K；生视频推荐 `seedance-2.5` / `minimax-h3`。

---

## 剧本转分镜核心法则

### 1. 时长计算与声画对齐铁律
- 中文日常对白语速：约为每秒 3.5-4 字。
- 计算公式：`镜头最小所需秒数 = (台词总字数 ÷ 3.8) + 1.2秒（含起止气口）`。
- 严禁出现时长与台词严重失调（如 3 秒镜头塞入 30 字台词）。台词过长时必须拆为正反打双镜或过肩反应镜头。

### 2. 心理叙事转化为可见物理事实
- 小说中常见的心理描写（如“他心中翻江倒海，暗暗发誓要报仇”），必须转译为可见摄影语言与动作：
  `特写镜头，主角紧握的拳头指节发白微颤，眼神从震惊迅速收束为冷冽杀意，侧逆光勾勒坚毅下颌`。

### 3. 单镜头单核心动作链
- AI 视频模型单次生成聚焦于单一动力链：`【初始状态】 → 【动作发生与交互】 → 【终点定格】`。
- 切镜必有信息增量，严禁同景别同角度无意义切镜；双人对白严格遵守 180 度轴线，防止越轴导致视线翻转。

### 4. 零本地命令行与全画布闭环红线
- 严禁调用本地 Python 分析脚本；
- 严禁将数据写入本地磁盘临时文件，所有大纲、资产卡与分镜故事板统一持久化于智影画布节点中。
