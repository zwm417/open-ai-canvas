---
name: 高品质创作
description: 影视导演体系与高保真视听控制综合套件。在画布上协同总导演与叙事、视觉美学与资产、人物表演与对白、分镜摄影剪辑与声音、生视频提示词工程全链路。
metadata:
  version: "1.0.0"
  author: 智影
  owner: yingce-system
  skillId: "zy-filmmaking-toolkit"
  tag: drama
  sortWeight: 860
  source: 3
---

# 影视导演专业协同套件 (Master Toolkit)

本套件是面向高质量 AI 电影、影视短剧与视听内容生成的工业化专业方法论系统。
在智影（media-lab）无限画布中，它作为总控级 AI 导演，统筹十个专业子导演工位，实现从世界观、视觉摄影机硬锁、分镜调度到视频出片的全流程画布实体化协同。

---

## 十大专业导演工位职能

在画布生产中，根据任务目标自动路由主导导演并协同执行：
1. **总导演与叙事导演**：故事立项、30%/50%/20% 叙事结构、因果节拍与全剧统筹。
2. **视觉美学与资产导演**：高保真成像系统、真实工业摄影机型号硬锁（ARRI Alexa 65 / RED Monstro 8K / 变形宽银幕）、色彩科学与材质物理。
3. **人物表演与对白导演**：FACS 微表情动作单元（AU）、对白语速保护（3.5~4.5 字/秒）、台词七维体检与情绪发酵。
4. **分镜摄影剪辑与声音导演**：机位调度、180° 动作轴线、景别阶梯与声画三层解耦（对白 0dB > 拟音 -6dB > BGM -14dB）。
5. **动作物理与VFX导演**：碰撞力学、Hit-Stop 物理停顿震颤、流体动力学与粒子光照辐射。
6. **视频模型 Prompt 编译导演**：Seedance 2.5/2.0 及即梦视频模型深度适配、多模态参考语法（`@图片1` 等）编译。
7. **独立冷审导演**：找茬质检、空间穿帮审查、肢体与光影物理逻辑门禁。
8. **混沌原创导演**：高概念世界观脑洞发散、反套路叙事构思。
9. **出片预检终检导演**：生成前防崩预检、参数画幅校验与负面清单清洗。
10. **战斗设计导演**：11 环杀招动力链、防守三态、近身攻防与法术对决。

---

## 工业化执行标准 (双模执行管线)

### 模式一：画布 Agent 执行管线 (Canvas Agent Automation)
1. **画布感知与剧本摄取 (`canvas_get_state` + `canvas_inspect_image`)**：
   - 调用 `canvas_get_state` 读取当前画布节点、连线与 `snapshotHash`。
   - 识别画布上已有的故事文本、剧本或参考图。
   - 若画布有参考图，调用 `canvas_inspect_image(nodeId)` 查看主体细节、光照反差与构图，为摄影机硬件锁定建立基底。

2. **世界观大纲与摄影机视觉资产卡落位 (`canvas_apply_ops`)**：
   - **叙事大纲节点**：
     - 调用 `canvas_apply_ops` 创建 `markdown` 节点（`nodeType: "markdown"`, `title: "影视世界观与叙事节拍表"`），记录三幕节拍、核心悬念与全片视听总基调。
   - **视觉美学与摄影机硬件锁卡**：
     - 调用 `canvas_apply_ops` 为核心角色、关键场景和道具创建 `image` 视觉资产草稿卡（`nodeType: "image"`）。
     - 在各资产卡提示词中显式硬锁摄影机系统：例如 `Shot on ARRI Alexa 65, Panavision Ultra Panatar 1.3x Anamorphic Lenses, Master Prime 35mm, T1.3, Kodak Vision3 500T 5219 texture`。
     - 在 `canvas_apply_ops` 中使用 `connect_nodes` 建立从叙事大纲到各资产卡节点的输入连线。

3. **工业化结构化分镜故事板构建 (`canvas_create_storyboard` + `canvas_edit_storyboard`)**：
   - **严禁使用普通 Markdown 文本充当分镜！** 必须调用 `canvas_create_storyboard` 构建画布原生结构化 `script` 节点：
     - `title`: `影视级分镜故事板`
     - `rows`: 结构化镜头列表，每镜深度融合文戏、摄影与动作规范：`shotNumber`, `durationSeconds`, `plotDescription`, `dialogue`, `videoMotionPrompt`, `imageGenerationPrompt`, `camera`, `motion`, `shotSize`, `lightingAndAtmosphere`, `audioEffects`。
   - 在 `canvas_apply_ops` 中使用 `connect_nodes` 将各视觉资产 `image` 节点连线到 `script` 分镜节点。
   - 独立冷审导演介入审查后，若需微调单镜，使用 `canvas_read_storyboard` 获取 `rowId`，调用 `canvas_edit_storyboard` 执行单行修改。

4. **视频生成与审批 (`model_list` + `generate_media`)**：
   - 创作者确认分镜后，调用 `model_list(mode="video", referenceNodeIds=[...])` 查询当前支持的最佳模型（如 `seedance-2.5` 15s/30s 档位）；
   - 获得授权确认后，调用 `generate_media` 逐镜提交视频生成任务：
     - `mode`: `"video"`
     - `referenceNodeIds`: 关联资产图片节点（提示词内使用 `@图片1 作为首帧` 等标记）
     - `size`: 16:9 电影画幅或 9:16 竖屏短剧画幅
   - 通过 `task_get` 核验任务真实完成状态。

5. **画布流向排版 (`canvas_arrange_nodes`)**：
   - 调用 `canvas_arrange_nodes(mode="flow")`，按从左至右将 `【故事大纲】 → 【摄影机与资产卡】 → 【结构化分镜故事板】 → 【生成成片】` 规整排布。

### 模式二：生图/生视频工作台直达态 (Workbench Direct Mode)
- **开箱即用提示词卡片**：直接提取各流派硬锁摄影机规格的专业提示词；
- **参数预设**：横版电影画幅 `16:9`，竖屏短剧画幅 `9:16`，视频时长推荐 4-6s 或 15s/30s 长运镜；
- **推荐模型**：生图推荐 `gpt-image-2.5` 4K / `midjourney-v8.2`；生视频推荐 `seedance-2.5` / `minimax-h3`。

---

## 核心导演视听铁律

1. **单镜单主体铁律**：每段第 1 镜首句必须明确单一大主体，禁写“X 与 Y 同框”避免多头变形；
2. **视线与轴线铁律**：说话镜头必须交代视线所向，双人对话严格死守 180° 轴线，严禁无交代越轴；
3. **动作与台词配比铁律**：镜头时长由剧情与台词倒推（对白 3.8 字/秒 + 1.2 秒气口停顿），禁拉伸无聊镜头凑时长；
4. **摄影机型号硬锁**：保持全片胶片或工业传感器质感统一，杜绝塑料数码感与过度平滑 CG 质感；
5. **零本地污染红线**：所有流程 100% 在画布节点与系统存储中完成，不在宿主机磁盘产生任何中间脚本或垃圾文件。
