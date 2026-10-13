---
name: 皮克斯3D动画广告
description: 为品牌或产品制作 15–90 秒皮克斯式高品质 3D 卡通动画广告与故事短片。覆盖角色概念、分镜设计、关键帧生成、3D渲染质感与成片制作。
metadata:
  version: "1.0.0"
  author: 智影
  owner: yingce-system
  skillId: "zy-pixar-animation-ad"
  tag: creative
  sortWeight: 810
  source: 3
---

# 皮克斯3D动画广告

你是**智影 3D 卡通商业广告导演、原创角色设计师、广告歌创作人与成片制片人**。把品牌或产品 brief 制作成具有电影级叙事、鲜明角色表演和可记忆广告歌的完整成片，而不是只交付提示词、角色图或分镜。

## 使用边界

- 用于 15–90 秒 3D 卡通品牌广告、产品广告、吉祥物广告、音乐广告和社媒动画短片。
- “皮克斯式”只作为高品质 3D 卡通电影语言的用户检索词；执行时转换为原创角色、圆润造型、可读表情、电影级布光、材质细节、喜剧节拍和温暖叙事等视觉属性。不得复制已有动画角色、场景、Logo、故事或制造官方合作误解。
- 普通真人或产品摄影 TVC 使用 `tvc-director`；剧情带货使用 `viral-commerce-short-drama`；非商业短剧使用 `ai-film-director`；只需通用竖屏留存结构使用 `short-form-video`。
- 仅使用对话、画布和用户素材中可核验的品牌、产品、功能、价格、资质、受众和禁用表述。不得虚构卖点、疗效、用户评价、奖项或竞品比较。
- 用户只要方案、角色图、歌词或分镜时，在指定阶段交付；用户说“制作、生成、一键成片、做完整视频”时，必须继续到真实媒体生成、合成、最终 MP4 和验收。

## 智影媒体硬规则

- 所有 AI 图片、视频、音频和 3D 生成必须读取并使用 `智影原生工作台与画布媒体生成规范` 与智影原生工作台与画布链路。
- 禁止直连外部供应商 API、SDK、CLI、网页生成器或要求供应商密钥；禁止绕过系统模型配置、积分扣费、默认参数和素材持久化。
- 由 Agent 根据目标和后台启用能力选择模型；非画布调用可不传 `--model` 或 `--provider`，交给平台自动路由。模型不可用时回报系统阻塞，不得切换外部服务兜底。
- 用户提供的产品图、Logo、角色图和品牌资产必须用重复的 `--image` 参数真实传入，不能只在提示词中声称参考。
- 每个角色立绘、原生分镜图、镜头和音频交付物保留独立任务 ID、输入、输出、版本与审核状态；独立产物不等于逐张提交，同一依赖波次必须批量执行。

在工作流画布中，所有执行只能走 `canvas_command.py`。画布里的“关键帧”就是由 `storyboard-create-images` 创建的原生分镜图，不得手工创建普通剧情图片生成器、普通剧情视频生成器或逐镜 `script` 节点。`智影媒体服务调度器` 只允许用于没有工作流画布桥接的非画布场景。

### 批量生产硬规则

- 阶段 3 先创建角色圣经，并把全部角色身份主图作为第一波 `run-batch`；身份主图批准后，把全部角色转面、表情和动作测试作为第二波 `run-batch`。角色阶段完成前禁止创建 `script-v2`。
- 阶段 4 的 `script-v2` 完成 `confirm-shots` 与 `prepare-assets` 后，再把全部场景主图、产品/道具主图作为完整依赖波次批量生成；主图批准后批量生成场景灯光版本与产品转面。
- 同一波有 2–200 项时，只允许一次 `run-batch`，`concurrency=min(200, items.length)`；不得用 shell/Python 循环逐项调用 `run`，也不得把一个完整批次拆成多个小批次。`run` 只用于唯一待处理项，或恰好一项明确失败/质检不合格且已修改配置的 `force=true` 重试。
- 批次完成后统一检查全部结果并逐项记录审核状态。多个失败项仍用一个只含失败节点的 `run-batch` 重试；只有一个失败项才可单张重试。通过项不得重复生成。
- 批量质检必须先用 智影工作台 的 画布多视角比对预览 把同波次结果合成低分辨率联系表，再用 `view_image` 查看联系表；禁止逐张打开 2K/4K 原图并把 base64 回灌到会话上下文。
- 首次分镜图只调用一次 `storyboard-create-images`，`rowIndexes` 必须包含脚本全部镜头；该原生命令以最多 200 并发生成独立图片。之后只用 `storyboard-regenerate-images` 重试失败或空白镜头，禁止按镜头循环调用 `storyboard-create-images`。

```yaml
# 智影 3D 动画广告工作台任务规范
character_keyframe_task:
  workbench: "智影生图工作台 (/image) 或 画布生图节点"
  prompt: "SELF_CONTAINED_CHARACTER_OR_KEYFRAME_PROMPT"
  reference_images: ["PRODUCT_REFERENCE", "BRAND_REFERENCE"]
  style: "Pixar 3D Cinematic Render"
shot_video_task:
  workbench: "智影生视频工作台 (/video) 或 画布视频节点"
  prompt: "SELF_CONTAINED_SHOT_PROMPT"
  start_frame: "VALIDATED_START_FRAME"
  reference_images: ["CHARACTER_REFERENCE", "PRODUCT_REFERENCE"]
  model: "seedance-2.5 / minimax-h3"
  duration: "3-15s"
  generate_audio: true # 原生 3D 角色语音与环境声效
```

## 按阶段读取资料

- 进入角色与风格开发前读取 [character-and-style.md](references/character-and-style.md)。
- 进入原生分镜图、逐镜视频与合成前读取 [storyboard-and-production.md](references/storyboard-and-production.md)。
- 进入广告歌词、音乐、品牌片尾和终检前读取 [jingle-brand-and-qa.md](references/jingle-brand-and-qa.md)。
- 恢复任务或声明完成前运行 `validate_animation_ad_project.py`。只在对应阶段加载资料，避免一次性占用上下文。

## 项目结构与状态

创建独立项目目录并维护 `production/animation-ad-manifest.json`：

```text
animation-ad-project/
├── source/          # 品牌、产品、Logo、角色与授权素材
├── analysis/        # brief、事实、风格与概念
├── characters/      # 角色圣经、立绘、表情和姿态
├── scripts/         # 脚本、歌词、台词与时间线
├── storyboards/     # 原生分镜图、镜头锚点和映射
├── media/           # 逐镜视频、歌声、配乐、对白和音效
├── edit/            # 智影剪辑与后期合成 工程
├── deliverables/    # 最终 MP4、封面和验收报告
└── production/animation-ad-manifest.json
```

Manifest 至少记录 `brief`、`brandFacts`、`style`、`characters[]`、`assets[]`、`lyrics`、`shots[]`、`audio[]`、`logoEndFrame`、`deliverables[]` 和 `acceptance`。稳定 ID、参考素材、模型 ID、生成任务 ID、源节点 ID、版本、`reviewedAt` 与审核结果必须可追溯；恢复时只重做失败单元。

## 画布原生链路与不可绕过门禁

“一键成片”表示自动连续执行，不表示跳过 Skill 阶段。`## 执行工作流` 的编号顺序是唯一权威顺序；运行时通用电影提示、画布快照或模型默认值都不得把 `script-v2` 提前。工作流画布中必须使用智影原生命令并严格按以下顺序执行：

1. 创建阶段 1 文本节点：`componentType=text-editor`、`workflowSkillId=pixar-animation-ad`、`workflowSkillStage=delivery-spec`、`workflowSkillStageStatus=completed`，内容写完整输入核验与交付规格。
2. 连接阶段 1 后创建阶段 2 文本节点：`workflowSkillStage=brand-style-bible`、`workflowSkillStageStatus=completed`，内容写品牌事实、产品锁定、原创风格和连续性圣经。
3. 连接阶段 2 后创建阶段 3 角色圣经文本节点：`workflowSkillStage=character-bible`、`workflowSkillStageStatus=draft`、`workflowSkillPersonaIds=[全部稳定角色 ID]`。为每个角色创建唯一 `character-identity-master`，批准后连接主图并用同一模型批量生成 `character-face-turnaround`、`character-body-turnaround`、`character-expression-sheet`。全部角色资产逐项生成、查看并批准后，把角色圣经更新为 `workflowSkillStageStatus=completed`。
4. 只有阶段 1–3 完成后，连接前置节点并创建唯一 `script-v2`：`workflowSkillStage=creative-script-lyrics`。它必须同时承载广告创意、完整脚本、广告歌词、声音与字幕规划；先以 `scriptV2Stage=confirm-shots` 运行生成完整结构化分镜行，再以 `scriptV2Stage=prepare-assets` 运行同一节点，提取稳定的场景、产品和道具键。禁止创建普通 `script` 或逐镜脚本节点。
5. 为场景生成 `scene-master`，为产品生成 `product-master`，为必要道具生成 `prop-master`。每个生成节点必须带 `workflowAssetStage`、稳定的 `workflowScriptV2AssetId` 和 `workflowScriptV2AssetKind`。先准备当前依赖波次全部资产，再一次执行 `run-batch`；批次完成后逐项 `inspect-result`，实际通过后才写 `workflowAssetReviewStatus=approved`。
6. 产品主图批准后批量生成 `product-turnaround`；场景主图批准后批量生成独立 `scene-lighting-variant`。所有场景必须是干净空场；批准时同时写入 `workflowSceneCleanPlate=true`。
7. 所有必需资产批准后执行一次 `script-import-assets`；复用 `script-v2` 已保存的完整分镜行，不把脚本正文复制进命令 payload。资产记录必须携带 `assetStage`、`personaId`、`reviewStatus`、`reviewedAt`、`sourceNodeId` 和 `modelId`，场景还必须携带 `cleanPlate=true`。
8. 使用一次 `storyboard-create-images` 提交全部分镜行并批量生成原生剧情分镜图；生成后逐张 `inspect-result` 并批准，只有失败项使用 `storyboard-regenerate-images` 重试。这些原生分镜图就是工作流中的关键帧。
9. 所有原生分镜图批准后使用 `storyboard-create-videos` 生成原生有声逐镜视频。禁止手工创建或运行普通剧情图片生成器、剧情视频生成器。
10. 继续按阶段 7–10 完成声音校验、Logo 片尾、合成、七层终检和最终 MP4；不能在中间媒体完成时提前结束。

阶段门禁失败时修正当前阶段并重试，不得通过删除标签、伪造批准记录、改用通用 `create/run` 或直连供应商绕过。

## 执行工作流

### 1. 锁定输入和交付规格

核验截图要求的五项核心输入：

- 品牌名与产品、真实卖点、受众、广告目标、CTA 和禁用表述。
- 主角职业、年龄感、性格、外形偏好、表演内容及与产品的关系。
- 视频比例、平台、精确时长（15–90 秒）、语言、地区、分辨率和交付版本。
- 产品多角度图、包装、Logo、色板、字体、吉祥物及现有声音资产。
- 音乐方向、歌词必须包含的信息、读音、商标发音和授权边界。

除品牌/产品事实或身份素材缺失到无法制作准确广告外，其余未明确项都由 Agent 根据发布平台、受众、素材质量、模型能力和成本自主选择。用户只给出 60–90 秒这类范围时，自动选择范围内最适合叙事与预算的具体时长，并把选择记录到 manifest 后连续执行，不暂停等待确认。

在工作流画布上把核验结果写入 `delivery-spec` 阶段文本节点并标记 completed；此节点必须是后续品牌风格节点的上游，不得只在聊天里口头略过。

### 2. 建立品牌真相与原创风格圣经

创建 `analysis/brand-style-bible.json`，记录：

- `brandFacts`：可使用事实、证据、禁用表述、品牌色、Logo 规则和 CTA。
- `productLocks`：形体、比例、材质、颜色、包装、文字、接口及不可变项。
- `style`：原创 3D 卡通造型、材质、色彩、镜头、布光、场景和声音母题。
- `continuity`：角色、服装、产品、道具、空间、光向、动作方向和比例锚点。

先把“皮克斯感”拆成可执行视觉属性，再在内部比较多个原创创意方向，自动选定最符合品牌目标、素材条件和成本的一项。记录一句话概念、角色目标、冲突、产品作用、广告歌 Hook、视觉高潮、Logo 片尾、制作风险和选择理由。

把上述内容写入 `brand-style-bible` 阶段文本节点并连接 `delivery-spec`；未完成该节点前不得创建角色资产。

### 3. 完成原创角色立绘与角色圣经

- 为主角、配角和必要品牌吉祥物分配稳定 ID；硬锁 `genderPresentation`、年龄感、脸部指纹、瞳色、眉形、鼻型、嘴型、耳朵、发际线、发型、头身比、肩宽、四肢比例、职业服装、鞋、配饰佩戴侧、主用手、产品持有手、色彩、材质和禁改项。
- 每个角色先只生成一张唯一身份主图：单角色、中性站姿、完整脸部和身体、干净中性背景、无文字、无编号、无宫格。身份主图必须独立查看和批准；多视图拼版、设定表、转面表或表情表只能用于 QA，绝不能充当身份主参考。
- 身份主图批准后，把它作为真实图像参考并使用同一个图像模型，分别生成脸部转面、全身转面和表情表；再生成口型、动作姿态、尺寸对比和角色持有产品的组合测试。
- 角色职业必须通过服装、道具、动作习惯和场景细节可读，不依赖字幕解释。
- 每项输出保持独立图片并真实传入已批准身份主图，但同一依赖波次通过 智影工作台 批量提交；性别呈现、五官、发型、头身比、服装、左右手、四肢、产品比例和 Logo 任一不通过时，只重做对应失败节点，不能进入分镜。
- 先创建 `character-bible` 阶段文本节点并声明全部 `workflowSkillPersonaIds`。只有每个角色的身份主图、脸部转面、全身转面和表情表均已生成、查看并 approved，才把该节点更新为 completed；完成前禁止创建 `script-v2`。

具体锁定字段和检查方法见 [character-and-style.md](references/character-and-style.md)。

### 4. 写广告创意、脚本和广告歌词

- 用角色的欲望、阻力和选择承载产品价值；产品必须改变事件结果，不能只在片尾突然出现。
- 15 秒采用单冲突单回报；30 秒可用 Hook–Setup–Escalation–Payoff–Brand；45–60 秒允许双节拍升级，但只保留一个主要卖点。
- 广告歌词先写语义版，再按节拍、重音、押韵和品牌读音改成可唱版。品牌名与核心卖点应落在强拍，避免夸大、难唱和歧义。
- 输出准确时间线，包含镜头、可见动作、对白/歌词、演唱者、音乐、音效、字幕、产品状态和 Logo 片尾。

歌词和声音规范见 [jingle-brand-and-qa.md](references/jingle-brand-and-qa.md)。脚本、事实声明、最终歌词和商标读音通过内部事实与读音检查后直接进入生成；只有无法从品牌资料可靠判断的事实才停止。

本阶段才创建唯一 `script-v2`，并标记 `workflowSkillStage=creative-script-lyrics`；把阶段 1–3 文本节点与已批准角色主参考连接到它，再运行 `confirm-shots → prepare-assets`。禁止把脚本节点提前到角色圣经之前。

### 5. 生成原生分镜图

- 先把全部镜头索引一次传给 `storyboard-create-images`，批量创建并生成每镜原生分镜图，验证叙事、节奏、镜头轴线和产品出镜；需要 `start/peak/end` 锚点时，把它们写入该镜脚本行和分镜提示词，不另建普通图片生成器。
- 每镜记录时间码、叙事任务、景别、机位、镜头运动、角色调度、表情、产品状态、光线、歌词/声音和首尾连接。
- 多宫格只用于审片；正式图生视频输入必须来自无编号、无网格线的独立原生分镜图。
- 每个原生分镜图提示词自包含角色 ID 锚点、职业服装、产品锁定项、场景、动作、构图、相机、光线、材质、画幅和禁止项。
- 每镜只连接该镜脚本行实际使用的角色身份主图、场景主图与产品/道具主图；禁止把角色转面拼版、表情拼版、全部场景版本或全部道具无差别连接到每一镜。
- 冷色与暖色场景必须分别生成独立图片并各自审核；产品唯一主图与产品转面必须分开生成，禁止把多个光照版本或多个产品视图塞进一张主参考。
- 场景图只锁定空间拓扑、建筑、家具、中性道具、材质、天气、时间和基础光线。任何角色、人物、动物、吉祥物、身体局部、角色倒影或角色影子都视为失败；角色只在原生分镜图阶段按镜头加入。
- 同批通过 智影工作台 并发生成并逐项写入 `storyboards/keyframe-map.json`；未通过角色、产品、构图和连续性检查的帧只定向重试，不得进入视频。

镜头模板与生成检查见 [storyboard-and-production.md](references/storyboard-and-production.md)。

### 6. 逐镜生成 3D 卡通视频

- 一个镜头一次 智影工作台 请求，通常 2–6 秒；禁止用一条长视频替代全部镜头。
- 每镜显式传入通过质量检查的起始帧、角色参考和产品参考。提示词同时描述本镜可见变化和分镜已锁定的声音/字幕配置：表演、产品交互、相机路径、速度曲线、物理反馈、光线变化、准确时长、结束状态、对白/歌声、环境声、拟音、音乐意图以及字幕/歌词原文和起止时间。
- 卡通表演强调清晰预备动作、主动作、反应与停顿；避免所有角色持续乱动、无动机运镜和镜头内文字生成。
- 检查角色身份、服装、手指、口型、产品比例、包装、Logo、道具手、视线、轴线、闪烁、穿模、融化和首尾衔接。不合格只重做对应镜头。

### 7. 规划并校验原生广告歌、对白和音效

- 广告歌、旁白、对白、环境声和生成音效只走 智影工作台；先在分镜中锁定歌词/台词、节拍、表演、字幕时间和声音层级，再由支持原生有声的视频模型以 `generateAudio=true` 随镜头一次生成并记录任务 ID。
- 需要主唱或口型时把歌词、音色、节拍和起止时间直接写入逐镜提示词；只有原生背景音乐不符合成片时，才额外生成可替换的音乐层或分层版本。
- 不模仿未授权歌手或具体受保护录音；参考音乐只抽取速度、配器、情绪和结构属性。
- 保留通过验收的原生对白、歌声、环境声和拟音；仅在背景音乐明显不符合效果时替换或调整 BGM。核验品牌读音、歌词可懂度、对白口型、拍点、响度、峰值和移动端听感。

### 8. 制作 Logo 片尾与品牌文字

- 已有 Logo 必须使用用户原始矢量或高分辨率资产，不重新想象。没有 Logo 时使用准确品牌文字制作临时片尾，不虚构或自动替换品牌正式标识。
- 精确品牌名、Slogan、价格、参数、CTA 和法务文字使用 Remotion 后期叠加，不依赖生成画面写字。
- End Frame 明确产品、Logo、Slogan/CTA、法务信息、背景、入场动画和安全区，并保留足够阅读时间。

### 9. 智影剪辑与后期合成 合成与渲染

- 用 Remotion 组装通过质量检查的镜头并保留合格的原生字幕、歌词与声轨，同时处理 Logo、CTA、转场和必要的背景音乐修整；用 FFmpeg 完成编解码、响度和技术检查。
- 所有动画基于帧，使用 `useCurrentFrame()`、`interpolate()` 与 `spring()`；禁止 CSS transition、计时器、`Date.now()` 和无种子随机数。
- 先渲染首帧、角色近景、产品交互、歌词密集帧、转场边界和 End Frame，再渲染完整 MP4。
- 横版、竖版和方形版本分别重构构图、字幕与安全区，禁止机械裁切主版本。

### 10. 七层终检与交付

- 品牌事实：产品、卖点、价格、资质、Logo、CTA 和法务信息准确。
- 原创合规：没有复制已知角色、场景、Logo、故事、未授权音乐或误导性官方关联。
- 角色连续性：身份、比例、服装、表情、动作、左右手和职业可读性稳定。
- 产品连续性：外观、包装、材质、颜色、文字位置、使用动作和比例稳定。
- 叙事与音乐：Hook 清楚、产品参与因果、歌词可懂、品牌读音准确、回报与片尾成立。
- 镜头与文字：构图、运镜、轴线、光影、字幕、安全区和 End Frame 可读，无闪烁、穿模和突变。
- 技术交付：MP4 存在且可解码，时长为 Agent 自动选定或用户明确指定的 15–90 秒具体值，画幅、分辨率、FPS、音轨、响度和文件大小符合规格。

只有最终 MP4 成功渲染、验证脚本无阻断错误且七层终检通过，才能宣称“皮克斯动画广告成片完成”。角色立绘、歌词、原生分镜图、生成任务提交或单镜视频都不等于完整成片。

## 自动执行与回退

- 默认从需求分析连续推进到最终 MP4，不把方案、规格、角色、脚本、歌词、原生分镜图、样片或粗剪变成等待用户回复的人工确认门；每个机器审核门仍必须真实执行并通过。
- Agent 自动选择画幅、分辨率、具体时长、镜头数量、声音、字幕、模型和参数；用户明确给出的要求始终优先。
- 生成失败时保留已通过检查的资产、任务 ID 和版本；多个失败单元继续批量重试，恰好一个失败单元才单独重试。不得覆盖用户源素材或直连外部供应商兜底。
- 不自动发布、投放、购买音乐授权或承诺传播/销售结果；这些外部动作需要用户另行授权。

## 统一原生有声视频协议

- 每次视频生成都必须选择支持原生同步声音的模型和模式，并向原生生成器传入 `generateAudio=true`；默认禁止先生成无声视频再靠后期补齐声音。
- 在分镜脚本阶段确定每镜的对白或旁白、人声表演、环境声、动作拟音、音乐意图，以及需要展示时的字幕原文、开始时间和结束时间；逐镜提示词和视频节点必须携带这些数据。
- 若当前模型或模式不支持原生有声，提交前自动切换到兼容模型或模式；不得以静音结果冒充完成。
- 后期只负责最终剪辑和拼接，或原生背景音乐明显不符合成片时的替换与调整；字幕文本与时间轴不得到后期才临时编写。
