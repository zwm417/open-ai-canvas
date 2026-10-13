---
name: 人物感创作
description: 人物感与电影级视听创作导演系统。整合高保真人物肖像、穿搭商业大片、情感微表情与影视级视频生成，输出细腻真实的人像动态大片。
metadata:
  version: "1.0.0"
  author: 智影
  owner: yingce-system
  skillId: "zy-character-portrait"
  tag: drama
  sortWeight: 820
  source: 3
---

# 人物感视听与肖像创作导演系统 (Image & Video)

本技能是面向智影画布 Agent 的高质感人物肖像与视听镜头创作导演系统。
从静态高质感人物肖像、时尚商业大片，到动态影视短剧、分镜镜头拆解与 AI 视频生成，提供全流程画布协同工法。

---

## 核心职责与产出分流

本导演系统包含两大核心创作支线，在画布上按需协同流转：

1. **静态人像与视觉大片专精（Image Stream）**：
   - 商业大片、高级感肖像、时尚 Lookbook、人物三视图、多图一致性人物设计；
   - 深度指导参数配置、五槽模板（Scene / Subject / Details / Use Case / Constraints）、光影材质（伦勃朗光、蝴蝶光、丝绒、真皮反光）与色彩分层；
   - 知识库参考：[`image/references/`](image/references/)（含 [`characters.md`](image/references/characters.md)、[`creative-direction.md`](image/references/creative-direction.md)、[`golden-rules.md`](image/references/golden-rules.md)、[`patterns/`](image/references/patterns/)）。

2. **动态影视与镜头导演专精（Video Stream）**：
   - 分镜拆解、机位运镜（推拉摇移升降）、动作因果链（起点→过程→结果）、情绪节拍与视听语言；
   - 深度适配 Seedance 2.5/2.0、Kling（可灵）与主流视频生成规范；
   - 知识库参考：[`video/references/`](video/references/)（含 [`dramaturgy.md`](video/references/dramaturgy.md)、[`universal-rules.md`](video/references/universal-rules.md)、[`seedance-25.md`](video/references/seedance-25.md)、[`kling.md`](video/references/kling.md)）。

---

## 工业化执行标准 (双模执行管线)

### 模式一：画布 Agent 执行管线 (Canvas Agent Automation)
1. **画布感知与多模态审图 (`canvas_get_state` + `canvas_inspect_image`)**：
   - 启动时调用 `canvas_get_state` 读取画布全量节点、连线与 `snapshotHash`。
   - 若画布上已有用户上传的人物照片、模特图或场景参考图节点，**必须调用 `canvas_inspect_image(nodeId)` 观察真实画面**：
     - **面部五官与神态**：三庭五眼比例、眼眸焦点、微表情（拒绝塑料感/假面感，保留真实毛孔皮肤纹理与睫毛细节）；
     - **服装与材质细节**：面料类别（丝绸、粗纺羊毛、漆皮、亚麻）、剪裁版型、精细色彩（提取 HEX 颜色代码）；
     - **光线与拍摄环境**：主光源方向与色温（冷调天光/暖色轮廓光）、反光板补光比、背景景深与虚化程度。
   - 提取到的真实视觉事实直接作为后续提示词的锁定参数。

2. **方案与视觉资产卡落位 (`canvas_apply_ops`)**：
   - **视听策划/人设大纲节点**：
     - 调用 `canvas_apply_ops` 创建 `markdown` 节点（`nodeType: "markdown"`, `title: "人物设定与视听策划方案"`）。
     - 正文记录：人物背景、外貌指纹、情绪曲线、视觉母题、双版本提示词（中文 ImageGen + 英文 Midjourney/通用视频提示词）。
   - **人物视觉资产卡**：
     - 为主角与关键配角创建 `image` 草稿卡（`nodeType: "image"`, `title: "角色资产-主角立绘"`）。
     - 若用户有参考图，在 `canvas_apply_ops` 中使用 `connect_nodes` 建立从源参考图至新资产节点的连线。

3. **原生分镜故事板构建 (`canvas_create_storyboard` + `canvas_edit_storyboard`)**：
   - 当创作涉及多镜头视听、短片叙事或动态演示时，**严禁使用普通 Markdown 表格假装分镜**，必须调用 `canvas_create_storyboard` 创建可交互、可独立生成的原生 `script` 节点：
     - `nodeId`: 分镜节点唯一 ID（如 `script-character-01`）
     - `title`: `人物视听分镜故事板`
     - `snapshotHash`: 最新的快照哈希
     - `rows`: 结构化镜头列表，每行定义：`shotNumber`, `durationSeconds`, `plotDescription`, `dialogue`, `videoMotionPrompt`, `imageGenerationPrompt`, `camera`, `motion`, `shotSize`, `lightingAndAtmosphere`, `audioEffects`。
   - 若用户需要微调单镜，使用 `canvas_read_storyboard` 读取真实行 ID，再调用 `canvas_edit_storyboard` 无损修改。

4. **模型协商与原生媒体生成 (`model_list` + `generate_media`)**：
   - 用户确认方案后，查询可用模型：
     - 图像生成：`model_list(mode="image", referenceNodeIds=[...])`
     - 视频生成：`model_list(mode="video", referenceNodeIds=[...])`
   - 经用户授权确认后，调用 `generate_media` 发起生成任务：
     - 引用画布参考图时，在提示词对应位置使用 `@图片1`、`@图片2` 显式锚定；
     - 严格匹配画幅比例（横屏 `16:9`，竖屏 `9:16`，人像肖像 `3:4`）；
     - 通过 `task_get` 核验任务状态并将结果回写画布节点。

5. **画布流式排版 (`canvas_arrange_nodes`)**：
   - 节点创建与生成提交后，调用 `canvas_arrange_nodes(mode="flow")`，按从左向右的逻辑流水线清晰对齐：
     `【输入参考图】 → 【人物设定与方案】 → 【角色资产卡】 → 【原生分镜故事板】 → 【生成媒体矩阵】`。

### 模式二：生图/生视频工作台直达态 (Workbench Direct Mode)
- **开箱即用提示词卡片**：直接提取下方经过精细调优的 Midjourney V8.2 与 ImageGen / GPT-Image-2.5 提示词；
- **参数预设**：画幅比例默认 `16:9`（或肖像 `3:4`，竖屏短剧 `9:16`），视频单镜建议 3-6 秒（支持扩展至 15s / 30s）；
- **推荐模型**：生图推荐 `gpt-image-2.5` 4K / `midjourney-v8.2`；生视频推荐 `seedance-2.5` / `minimax-h3`。

---

## 人物感与视听导演核心法则

### 1. 人物真实感与抗塑料皮法则
- **拒绝磨皮蜡像**：提示词中必须写明微观物理质感：`pores on skin`、`fine stray hairs`、`subsurface scattering (次表面散射)`、`natural skin imperfections`、`catchlight in pupils (瞳孔眼神光)`。
- **神态与动作耦合**：眼神必须有具体的视线落点与情绪意图，避免双目空洞直勾勾凝视镜头；微动作（如指节微屈、咬唇、侧颈倾听）赋予人物生命力。

### 2. 视频镜头单一动作链铁律
- 一个分镜行只承载一个核心动作过程：`【起始站姿】 → 【转身迈步拉开门】 → 【停在门槛前目光凝视】`。
- 视频提示词结构：`[景别机位] + [主体外观与身份] + [明确动作过程] + [环境交互与物理反应] + [光影氛围与质感]`。

### 3. 零本地命令与环境安全红线
- 严禁调用本地 Python/Node.js 命令行脚本；
- 严禁索要用户 API Key 或要求配置环境变量；
- 所有生成、模型查询与数据维护必须 100% 走画布 Agent 原生工具。
