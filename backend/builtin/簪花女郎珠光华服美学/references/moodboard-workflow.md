# Midjourney 情绪版协同工作流

本文件记录本 Skill 的生产规则，不替代 Midjourney 官方文档。行为基于 2026-09-06 查验的官方说明；功能变化时应重新核对。

官方来源：

- Moodboards: https://docs.midjourney.com/hc/en-us/articles/39193335040013-Moodboards
- Personalization: https://docs.midjourney.com/hc/en-us/articles/32433330574221-Personalization
- Image Prompts: https://docs.midjourney.com/hc/en-us/articles/32040250122381-Image-Prompts
- Parameter List: https://docs.midjourney.com/hc/en-us/articles/32859204029709-Parameter-List

## 可复现性分层

| 模式 | 用户提供 | 提示词参数 | 可复现性说明 |
| --- | --- | --- | --- |
| 协同模式 | 已在网页/Discord设置中选中情绪版 | 不主动添加 `--p` | 依赖用户当前默认设置；容易因切换默认配置而变化 |
| 固定版本 | 成功任务中的具体 `--p code` | 原样添加 `--p code` | 推荐；锁住当时的情绪版版本 |
| 最新版 | Moodboard ID | 原样添加 `--p mID` | 总是调用该 Moodboard 的最新内容，后续增删图片会改变结果 |
| 无情绪版 | 无 | 不添加 `--p` | 文本近似重建，不能声称与验证图等效 |

Midjourney 会把 Moodboard ID 转换为当次使用的版本代码；情绪版内容变化时会生成新代码。固定成果应记录成功任务中的最终代码，而不是只记住情绪版名称。

## 代码处理

- 接受用户从任务详情复制的 `--p code`、Moodboard ID，或明确说明已在界面启用默认情绪版。
- 不根据截图、情绪版名称、文件名或成图猜代码。
- 不把 `--p MOODBOARD_CODE` 之类占位符放进可直接粘贴的主提示词。
- 用户没有代码时，主提示词保持干净，在“Midjourney 使用方式”中写：`生成前请确认已选择你的簪花女郎情绪版。`
- 代码可能属于用户个人工作流。除非用户明确要求写入私人 Skill 配置，否则只在当次输出中使用。

## 强度策略

Midjourney 官方说明：使用情绪版时，`--s` 控制情绪版风格施加程度，范围 0–1000，默认 100；数值越低，情绪版风格越受限，越高则介入越强。

本系列的实际成功样本使用 `--s 100 --c 0`，因此：

- 基准：`--s 100 --c 0`。
- 当构图、手势或道具被情绪版吞掉：先把文本关系写得更具体；仍失控时才试 `--s 50`，一次只改一个变量。
- 当用户明确希望更强烈地追随情绪版：可把 `--s` 提到 150 做一次对照；这属于未验证调参，不自动写入默认提示词。
- 不把高 `--s` 当作“画质更高”。
- 默认保持 `--c 0`，避免在已经复杂的冠饰、衣袖和花团上增加无控制变化。

## 情绪版与文本的分工

即使已启用情绪版，正文仍需要一段可见风格激活语句，例如：

`volumetric digital portrait rendering with continuous facial gradients, coherent reflections, crisp jeweled detail and lens-like depth`

但不要堆叠互相冲突的风格标签。情绪版存在时，文字重点放在：

- 人物在画面中的比例和位置；
- 目光、嘴唇、手、道具与衣袖关系；
- 主体织物与透明披帛分离；
- 主光方向、补光和阴影保留；
- 哪些高光允许 bloom，哪些区域必须保留中间调；
- 针对当前场景的短负面约束。

## 与 Image Prompt 的配合

情绪版给出宽泛审美，不承担具体构图锁。用户要求复刻某张构图时：

1. 使用原始画面而不是失败生成图作为 Image Prompt。
2. 如果来源是手机截图，先裁除或忽略状态栏、进度条、播放器控件、字幕和水印；不要以截图外框计算比例。
3. 在文字开头重新声明景别、人物位置、身体/头部方向、负空间和主衣袖/道具路径。
4. 用户没有提供实际图片 URL 时，只说明上传方式，不发明 URL 或 `--iw`。
5. 图像参考指导新生成，不保证像素级复制。

Moodboard 可与其他参考方式组合，但当前官方说明不允许 Moodboard 与 Style Reference Version (`--sv`) 或 Style Weight (`--sw`) 一起使用。本 Skill 因此不在情绪版主路线中输出 `--sv` 或 `--sw`。
