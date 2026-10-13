---
name: 短剧制作
description: 网文小说改编短剧工业化制作体系。在画布上实现原著小说片段摄入、剧本改编、角色与场景锁脸锁装、逐镜分镜与视频生成流水线。
metadata:
  version: "1.0.0"
  author: 智影
  owner: yingce-system
  skillId: "zy-novel-to-short-drama"
  tag: drama
  sortWeight: 830
  source: 3
---

# 网文小说转短剧制作体系

本技能是面向智影画布 Agent 的小说 IP 改编短剧工业化管线。
它专注于将长篇网络文学、小说精选章节或网文故事，在画布上全流程转化为符合商业爆款标准的影视短剧，完成从大纲、人设卡、结构化分镜到视频出片的无缝衔接。

---

## 核心价值与改编原则

将网文转化为影视短剧的核心是将“文字阅读快感”转化为“视听感官冲击”：
1. **抽核与去芜存菁**：剔除冗长的旁白与解释性世界观，锁定核心冲突与打脸逆袭主线。
2. **心理描写具象外化**：将角色的内心独白转化为可被摄影机捕捉的微表情、肢体动作、呼吸节奏与环境互动。
3. **高密度爽点节拍**：单集 60-90 秒内必须包含：开篇钩子（0-5s）→ 冲突升级与压迫（5-35s）→ 危机爆发（35-55s）→ 反转打脸/爽点释放（55-75s）→ 悬念钩子卡点（75-90s）。

---

## 工业化执行标准 (双模执行管线)

### 模式一：画布 Agent 执行管线 (Canvas Agent Automation)
1. **小说摄取与改编大纲节点 (`canvas_get_state` + `canvas_apply_ops`)**：
   - 调用 `canvas_get_state` 检索画布，读取已有的原著小说文本节点与 `snapshotHash`。若画布暂无文本，提示用户粘贴小说片段或核心故事。
   - 调用 `canvas_apply_ops` 创建《改编大纲与爽点节奏表》节点（`nodeType: "markdown"`, `title: "小说改编大纲与爽点谱"`）：
     - 明确短剧改编幅度（忠实抽核 / 强反转重构）；
     - 列出本集爽点时间轴、悬念卡点与情绪曲线；
     - 提取角色分档清单（主角组 ≤ 2人、关键配角 ≤ 3人，合并次要功能角色）。

2. **人设拆解与视觉资产卡创建 (`canvas_apply_ops` + `model_list` + `generate_media`)**：
   - 为小说中的核心角色创建独立的视觉形象卡：
     - 调用 `canvas_apply_ops` 批量添加 `image` 草稿节点（`nodeType: "image"`, `title: "角色资产-主角"`、`"角色资产-反派"` 等）。
     - 在各节点的提示词中写入严格的人物外观锁定信息（面容五官、体态、服饰质感、核心道具及专属配色 HEX 码）。
     - 在 `canvas_apply_ops` 中使用 `connect_nodes` 建立从原著小说节点至《改编大纲》，再至各《角色资产卡》节点的连线。
   - 若用户需要先确认角色立绘，调用 `model_list(mode="image")` 查询模型并调用 `generate_media` 渲染角色卡。

3. **工业化结构化分镜表生成 (`canvas_create_storyboard`)**：
   - **坚决禁止使用普通 Markdown 文本充当分镜！** 必须创建画布原生结构化 `script` 节点。
   - 调用 `canvas_create_storyboard` 创建 `script` 节点：
     - `nodeId`: 新分镜唯一 ID（如 `script-novel-ep01`）
     - `title`: `小说改编-EP01 精细分镜故事板`
     - `snapshotHash`: 最新的 `snapshotHash`
     - `rows`: 结构化镜头列表，每镜规范：`shotNumber`, `durationSeconds`, `plotDescription`, `dialogue`, `videoMotionPrompt`, `imageGenerationPrompt`, `camera`, `motion`, `shotSize`, `lightingAndAtmosphere`, `audioEffects`。
   - 在 `canvas_apply_ops` 中使用 `connect_nodes`，将角色资产 `image` 节点连线到 `script` 分镜节点，建立素材引用纽带。

4. **分镜审查与动态微调 (`canvas_read_storyboard` + `canvas_edit_storyboard`)**：
   - 当创作者对改编镜头提出修改意见时，先调用 `canvas_read_storyboard` 读取分镜最新状态与真实 `rowId`。
   - 调用 `canvas_edit_storyboard` 针对特定镜头行执行 `update` 或 `append`，精准调整镜头时长与动作描述。

5. **逐镜生成与生产流水线排布 (`model_list` + `generate_media` + `canvas_arrange_nodes`)**：
   - 分镜确认后，查询 `model_list(mode="video")`；
   - 调用 `generate_media` 逐镜发起视频生成（`mode: "video"`，`referenceNodeIds` 填入绑定的角色资产图，画幅默认 `"9:16"` 竖屏短剧）；
   - 通过 `task_get` 核验任务状态；
   - 调用 `canvas_arrange_nodes(mode="flow")`，将画布整理为清晰流畅的四级递进流水线：
     `【原著小说文本】 → 【改编大纲与爽点表】 → 【核心角色资产矩阵】 → 【结构化分镜故事板】 → 【生成视频成片】`。

### 模式二：生图/生视频工作台直达态 (Workbench Direct Mode)
- **开箱即用提示词卡片**：直接提取短剧高爽点、快节奏的结构化镜头动作与首尾帧提示词；
- **参数预设**：短剧单镜头通常 3-6 秒，支持长运镜 15s/30s，画幅默认竖屏 `9:16`；
- **推荐模型**：生图推荐 `gpt-image-2.5` 4K；生视频推荐 `seedance-2.5` / `minimax-h3`。

---

## 小说转短剧改编核心铁律

1. **心理活动外化铁律**：
   - 严禁在视频提示词中出现“主角感到十分愤怒”、“反派心生毒计”等内心词汇；
   - 必须外化为：“主角双拳猛然攥紧，指节泛白，眼神骤然冰冷，额角青筋微颤”；“反派嘴角扬起一抹阴鸷冷笑，指尖在茶杯边沿轻叩两下”。
2. **台词删繁就简铁律**：
   - 原著中大段的长篇大论，必须压缩成具有爆发力、字字诛心的短促金句；
   - 保证观众在 2 秒内看清听懂，绝不拖泥带水。
3. **爽点打脸视觉强化**：
   - 反转打脸镜头必须配合视听重音与机位突变（例如：由反派得意的中景，骤然推到主角冷冽的大特写，背景音瞬间静止，随后爆发重音）。
4. **零本地污染红线**：
   - 所有文本、分镜、资产卡与生成视频完全落位于系统画布节点，严禁在磁盘上生成任何临时垃圾文件。
