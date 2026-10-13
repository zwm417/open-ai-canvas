---
name: H3视频提示词创作
description: 编写 MiniMax H3 视频生成提示词，支持 T2VA（文生视频）、I2VA（首帧生视频）、FL2VA（首尾帧）、L2VA（尾帧）以及 Ref2VA（多模态全参考复刻）。用于将多模态创作诉求重写为 H3 专属六段式结构，精准对齐关键帧与音画标签。
metadata:
  version: "1.0.0"
  author: 智影
  owner: yingce-system
  skillId: "zy-h3-prompt-writing"
  tag: creative
  sortWeight: 800
  source: 3
---

# MiniMax H3 视频提示词编写指南 (H3 Prompt Writing)

## 工作流 (Workflow)

1. **识别输入模式**：判定当前是 T2VA（纯文本）、I2VA（首帧）、FL2VA（首尾两帧）、L2VA（尾帧）还是全参考 Ref2VA。
2. **基础文本与关键帧模式**：查阅 `references/base-en.txt`，严格遵循其最终提示词结构。
3. **全参考复刻模式 (Ref2VA)**：查阅 `references/ref-en.txt`，严格遵循其六段式重写规范。
4. **格式铁律**：严格保留字段名称、段落次序、标签命名以及时间戳记法。

---

## 基础生成模式 (Base Modes)

- **T2VA (文生音画视频)**：从文本构建完整的视听时间线。
- **I2VA (首帧生视频)**：以首帧为基准锚点，沿时间线正向展开后续动作与运镜。
- **FL2VA (首尾帧生视频)**：精准描述首帧与尾帧之间的连续演变路径（通常推荐单镜头平滑过渡）。
- **L2VA (尾帧生视频)**：推演合理的前置开场状态，并最终平滑汇聚收拢到提供的尾帧画面。

### 核心三段式字段顺序
```text
integrated_multimodal_description: [Shot 1] ...

overall_soundscape: ...

non_diegetic_music: ...
```

- **integrated_multimodal_description**：沿时间线描述画面构图、主体外貌、动作发展、分镜切换、角色对白/台词及同声同步音效。
- **overall_soundscape**：概括全片的自然环境声、物理交互声及非语言人声（如呼吸、叹气、欢呼）。
- **non_diegetic_music**：描述角色听不到、仅观众可听闻的画外背景音乐（BGM 风格、乐器、情绪与节奏）。

---

## 全参考复刻模式 (Ref2VA / Full-Reference Mode)

Ref2VA 采用标准的六段式结构，顺序必须完全一致：
1. `subject_definitions`：主体与素材定义（`<Picture 1>`、`<Video 1>`、`<Audio 1>`）
2. `summary`：全片情节与视觉梗概
3. `retention_analysis`：参考素材的继承与留存要点分析（外貌、动作、运镜、光影、声音）
4. `detailed_description`：分镜头详细描述（镜头景别、运镜速度、对白台词、出现时间）
5. `overall_soundscape`：整体环境声与动作音效
6. `non_diegetic_music`：画外背景音乐

所有段落中的素材标签（如 `<Picture 1>`、`<Video 1>`、`<Audio 1>`）必须保持全局统一。具体格式请查阅 `references/ref-en.txt`。

---

## 输出规范 (Output Rules)

1. **语言规则**：描述正文必须使用**英文**撰写；对白（dialogue）、歌词（lyrics）及画面可见文字（visible scene text）保留原始语言（如中文台词原样输出）。
2. **分镜四要素**：每个分镜必须详述构图、主体、环境、动作、镜头运动（类型+幅度+速度）、声音，以及引用素材出现的精准时间点。
3. **严禁抽象空话**：杜绝空洞的纯剧情梗概或无意义形容词（如 "cinematic"、"beautiful"），必须提供可被模型直接渲染的具象视听细节。
4. **时长严格闭环**：描述的时间总长必须精确匹配请求的视频秒数（4～15 秒），时间戳格式化为两位小数（如 `0.00`、`00:03.500`）。
