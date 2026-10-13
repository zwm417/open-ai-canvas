# 双模型编译配方

## Midjourney 情绪版协同版

正文按以下注意力顺序压缩为一段英文：

`16:9景别与人物位置 -> 身体/头部/目光 -> 主衣袖、披帛、花枝或道具的空间路径 -> 发髻与附着饰件 -> 面部成像 -> 织锦/刺绣/欧根纱分层 -> 主光与补光 -> 色彩角色 -> 局部bloom -> 当前错误族 -> 参数`

以 170–210 个英文词为目标。只有手部、道具与环境关系同时复杂时可接近 230 词，绝不超过 230；情绪版已经承担宽泛审美，不需要重复列举宫室小物、所有花种或多个同义质量词。

默认参数尾：

```text
--ar 16:9 --s 100 --c 0 --no flat-white-studio bleached-fabric matte-illustration sepia olive-cast UI text watermark --v 8.2
```

只保留与当前画面有关的 `--no` 词。例如有横笛时增加 `duplicate-flute extra-instrument`；闭目时增加 `open-eyes`。不要自动加入通用人体缺陷目录。

### 未提供情绪版代码

- 不在提示词中出现 `--p`。
- “情绪版状态”写：`协同模式；代码未提供，请在 Midjourney 中保持已验证情绪版开启。`
- “验证边界”写：`风格组合已由同一情绪版与同类提示词样本验证；本次新构图尚未生成验证。`

### 提供固定版本代码

- 将用户给出的完整代码原样放在 `--c 0` 之后、`--no` 之前或 `--v 8.2` 之前。
- “情绪版状态”写：`固定版本模式；使用用户提供的固定版本代码。`
- 不声称代码公开、永久有效或属于本 Skill。

### 提供 Moodboard ID

- 将用户给出的 `--p mID` 原样放入参数区。
- “情绪版状态”写：`最新版模式；该 ID 会调用情绪版当前版本，更新情绪版可能改变结果。`

## Midjourney 无情绪版降级版

当用户明确要求纯文字时：

- 保留完整的视觉激活句；
- 更明确写人物气质、发髻结构、冠饰固定、材料分层、光线地图、颜色角色与层级景深；
- 参数仍从 `--s 100 --c 0` 起步，不通过盲目提高 `--s` 模拟情绪版；
- “验证边界”必须写：`纯文本近似重建；现有九张成果不能证明此路线等效。`

## ImageGen 中文重建版

ImageGen 不能调用 Midjourney 情绪版。用中文自然语言独立编译：

1. 明确 `16:9` 或用户比例、景别和人物位置；
2. 写身体方向、头部回转、目光、嘴唇、手和道具；
3. 写最大衣袖/披帛/花枝的起点、终点和运动路径；
4. 写黑发体量、冠饰固定点与垂挂关系；
5. 分别写主织锦、凸起刺绣、透明欧根纱、珍珠/水晶；
6. 写主光方向、柔度、补光、阴影与最亮点；
7. 写皮肤、主衣、背景、辅色与 bloom 的区域分配；
8. 结尾写 5–10 个最相关的禁止项。

开头使用：

```text
生成一幅16:9横向的新中式珠光华服人物画面，以清楚的空间构图、材料分层和方向光重建“簪花女郎”视觉机制；这是文本近似重建，不依赖Midjourney情绪版。
```

不要把 Midjourney 英文逐句翻译，也不要出现 `--ar`、`--s`、`--p`、`--no` 或 `--v`。

## 输出骨架

```markdown
### 画面设计
<2–4行中文>

### 情绪版状态
<协同模式 / 固定版本 / 最新版 / 无情绪版>

### Midjourney 8.2 Prompt
<一段英文，严格以 --v 8.2 结束>

### Midjourney 使用方式
<仅在需要时出现>

### ImageGen 中文重建提示词
<一段中文自然语言>

### 验证边界
<一句诚实的验证说明>

### 可调选项
- <最多3项>
```

## 一条已验证组合的写法示例

以下示例的视觉证据属于“用户情绪版 + 提示词 08”，不是纯文本验证。示例中不含未知 `--p` 代码：

```text
A wide 16:9 mid-length frontal portrait with the woman positioned slightly right of center and shown from the full crown to below the waist. Her face sits near the upper-right intersection, one arm lifts out toward the left edge, and a monumental mist-aqua embroidered sleeve begins at lower-left and travels across the bottom two-thirds toward the torso, displaying one oversized pale-gold peony as the dominant foreground motif. The open left third and far-right edge are framed by softly blurred cream blossoms, creating a horizontal floral aperture without covering the eyes. A steady direct gaze, softly closed coral lips, a small red forehead ornament, glossy black high updo with pearl-and-gold botanical pins and long pearl tassels. Volumetric digital portrait rendering with continuous facial gradients, coherent reflections, crisp embroidery and lens-like depth. Ivory inner silk and blue outer brocade carry raised champagne-gold, pale-coral and muted-teal details beneath transparent organza. Warm sunlight from upper frame-left casts selective foliage shadows across forehead, cheek and neck; moderate neutral fill preserves the face and huge sleeve against a smoky khaki field. Bloom remains local to the giant peony thread, pearls and sleeve ridges --ar 16:9 --s 100 --c 0 --no flat-white-studio bleached-fabric matte-illustration sepia olive-cast UI text watermark --v 8.2
```

## 最终自检

- 开头先保护横版构图，不以“beautiful woman”或风格标签开头。
- 每个道具、流苏、披帛都能回答“从哪里来、到哪里去、与谁接触”。
- 人物目光和嘴唇状态没有被情绪词模糊。
- 光线和滤镜不是泛泛形容词，而有方向、填充、中间调和 bloom 边界。
- `--p` 只来自用户；所有含 `--v` 的行都以 `--v 8.2` 结束。
- ImageGen 版本清楚标记为近似重建，未借用 Midjourney 参数。
