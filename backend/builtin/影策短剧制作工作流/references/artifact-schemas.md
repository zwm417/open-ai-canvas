# 画布产物与资产包结构

## 命名

```text
SRC-01 小说原文
EVT-001 事件
BIB-01 故事圣经
SKL-01 故事骨架
EP-01 分集
SC-01 场次
CH-01 角色
VO-CH-01 角色声音
LOC-01 环境
PROP-01 武器或道具
SH-001 镜头
```

## 小说原文节点

记录 `sourceId`、原文内容、来源、是否用户提供、改编范围、版本和状态。Agent 自己生成的故事只能标记为 `SOURCE_DRAFT`，用户确认后才能标记为 `SOURCE_APPROVED`。

## 故事圣经

```json
{
  "bibleId": "BIB-01",
  "version": 1,
  "characters": [],
  "world": {},
  "relationships": [],
  "tone": {},
  "taboos": [],
  "continuityRules": [],
  "visualRules": [],
  "openQuestions": [],
  "status": "DRAFT"
}
```

## 角色资产背板

使用 `FRAME-CHAR-<id>`，至少包含：

```text
CH-01-character-card（角色卡节点，核心角色必需）
CH-01-character-bible.md
CH-01-turnaround.png
CH-01-portrait.png
VO-CH-01-voice-profile.md
VO-CH-01-reference.wav（用户需要且平台支持时）
```

可选：表情表、姿态表、服装变体、伤势变体。

角色卡由 `canvas_create_character` 创建，台账记录角色卡节点 ID、角色资产 ID 和版本号；分镜行的 `characterAssetIds` 写作 `CH-01@角色卡v1`，生成时引用角色卡节点。

## 环境资产背板

使用 `FRAME-LOC-<id>`，至少包含：

```text
LOC-01-environment-bible.md
LOC-01-master.png
LOC-01-lighting-variants.png
LOC-01-continuity.md
```

## 武器/道具资产背板

使用 `FRAME-PROP-<id>`，至少包含：

```text
PROP-01-spec.md
PROP-01-front-side-detail.png
PROP-01-use-state.png（需要时）
```

## 分镜行（领域概念模型与真实画布工具映射）

### 1. 领域概念结构（用于分析推演与上下文账本）

```json
{
  "shotId": "SH-001",
  "sceneId": "SC-01",
  "durationSeconds": 8,
  "sourceVersion": "SRC-01@v1",
  "bibleVersion": "BIB-01@v1",
  "characterAssetIds": ["CH-01@角色卡v1"],
  "locationAssetId": "LOC-01@v1",
  "propAssetIds": ["PROP-01@v1"],
  "startState": {},
  "action": "",
  "endState": {},
  "dialogue": "",
  "audio": "",
  "imagePrompt": "",
  "videoPrompt": "",
  "continuityIn": "",
  "continuityOut": "",
  "status": "DRAFT"
}
```

### 2. 真实画布工具物理参数映射规范（`canvas_create_storyboard` / `canvas_edit_storyboard`）

调用画布分镜工具写入分镜行时，**严禁直接传递未在工具 Schema 中声明的字段**（如 `shotId`, `sceneId`, `action`, `imagePrompt` 等，否则将触发 `BadAuthRequest` 拒绝写入）。必须按照下表严格映射为物理字段：

| 领域概念字段 | 画布分镜物理字段（16 文本字段白名单 + 数值/引用） | 类型 | 规范说明与填写指导 |
| :--- | :--- | :--- | :--- |
| `durationSeconds` | `durationSeconds` | number | 镜头物理预估时长（单位：秒，必须 > 0） |
| `action` (动作剧情) | `plotDescription` | string | 核心动作演化与剧情描述（起承转合） |
| `dialogue` (台词对白) | `dialogue` | string | 角色台词或画外音旁白（附带语调提示） |
| `imagePrompt` (首帧图) | `imageGenerationPrompt` | string | 首帧生图英文/中文提示词，必须明确机位与主体 |
| `videoPrompt` (动效运镜) | `videoMotionPrompt` | string | 视频镜头运动、时序微动作与物理反馈描述 |
| `audio` (音效设计) | `audioEffects` | string | 现场环境音、拟音（Foley）与音乐情绪节拍 |
| `continuityOut` (出点) | `continuityOut` | string | 镜头出点时空姿态连续性标记，指引下镜衔接 |
| `shotSize` (景别) | `shotSize` | string | 特写/近景/中景/全景/远景 |
| `camera` (机位运动) | `camera` | string | 平视/俯拍/仰拍/推拉摇移/跟拍/环绕 |
| `motion` (主体动态) | `motion` | string | 人物肢体动态、交互动势与环境物理位移 |
| `emotion` (情绪眼神) | `emotion` | string | 角色内心状态、微表情与眼神聚焦轨迹 |
| `lightingAndAtmosphere` | `lightingAndAtmosphere` | string | 影调风格、主光源方向、色温与环境光效 |
| `viewerPOV` (观察视点) | `viewerPOV` | string | 客观观察者 / 主观第一人称 / 偷窥视角 |
| `performanceBlocking` | `performanceBlocking` | string | 调度站位、视线交互与场景纵深走位 |
| `timeBeats` (时间节拍) | `timeBeats` | string | 秒级时间切片，如 `0.0s 跨坐 -> 1.2s 皱眉 -> 2.0s 抬手` |
| `narrativeIntent` (叙事意图) | `narrativeIntent` | string | 该镜头在整场戏中的叙事功能与戏剧任务 |
| `negativePrompt` | `negativePrompt` | string | 画面负向提示词过滤 |
| 关联资产 ID | `referenceNodeIds` | string[] | 画布上被此镜头引用的真实资产/角色卡节点 ID 数组 |

普通 Markdown 不能替代结构化分镜；一张电影剧照不能替代角色三视图、环境母版或武器结构图。