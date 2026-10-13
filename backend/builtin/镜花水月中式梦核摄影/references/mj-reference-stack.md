# MJ 双版本与参考设置

核对日期：2026-09-06。以下是当日官方文档边界；平台改版或实际报错时重新核对官方文档，不把这些规则说成永远不变。

## 双版本契约

| 项目 | 有情绪版 | 无情绪版 |
| --- | --- | --- |
| 情绪版 | 选择用户已有的镜花水月情绪版；有真实 ID/代码才写参数 | 关闭 Moodboard，并关闭网页自动 Personalization |
| Attach to prompt | 沿用用户选定的参考及用途 | 默认相同，不因去掉情绪版而删除 |
| Style reference | 沿用用户选定的风格参考 | 默认相同，风格关键词仍需补充分层 |
| 文字承担 | 镜头、动作、关系、异常，以及最小色光材质骨架 | 同一画面；更完整写出色彩面积、光线、材质、景深和异常逻辑 |

“无情绪版”不是“纯文本”；只有用户明确不要所有参考，或确实没有可用图时，才另行注明纯文本状态。两版都没有参考图也可以写，但须说清有情绪版版本需要用户在网页实际选板；不能说已经启用。

Attach 和 Style 可用同一张图，也可分别选择，不默认后台已上传或自动锁定。原项目没有完整槽位记录，不能伪造“图 03 当时就是 Attach”。可根据实际看图提出当前建议，标成建议而非历史事实。

## 当前参数规则

- 已提供真实情绪版 ID/代码：按原样写 `--p 实际值`，放在最终 `--v 8.2` 之前。ID 指向更新后的板，历史代码可以指向之前状态；记录用户给的是哪一种。
- 未提供代码：可复制提示词内不塞占位代码，不自动加裸 `--p`；代码块后写“在网页开启 Personalization 并选择你已有的镜花水月情绪版”。裸 `--p` 会调用默认选择，不保证就是本系列。
- 无情绪版提示词不带 `--p`/`--profile`，并明确关闭自动 Personalization，避免网页重新加回。
- Moodboard 与 Style reference 可结合，但 Moodboard 不兼容 `--sw`、`--sv`。不要在有板版里添加它们；两版初始均可省略以减少变量。
- `--s 125` 仅为此 Skill 的试验起点，并非原作参数或最佳值。带板时 stylize 调整板的影响，不带板时不能解释成同一种板权重。用户参数优先；需要调整时一次改变一个因素。
- 当前 **Attach to prompt 是 Edit Model Reference**，不是 Image Prompt。网页版使用用户熟悉的这个槽；CLI 只有真实已提供的可访问 URL 才写 `--edit URL`。
- Image Prompt 是另一个明确的角色；只有实际选择这个角色才考虑 `--iw`。不可把 Attach 自动转成 URL 前缀或 `--iw`。
- Style reference 的 CLI 是 `--sref` 加真实图片 URL 或用户提供的代码；没有 URL 时写网页设置备注，不造 URL/数码。
- V8.2 Edit Model 可与情绪版及两种其他参考组合；显式 `--ar` 防止它沿用首张参考的比例。不要自动加入旧版 `--oref`/`--cref`。
- 不为凑完整性添加 seed、raw、chaos、奇异权重或大量未经验证的参数。

## 每条 MJ 提示词后都给备注

有板示例备注：

> 使用前开启 Personalization，选择你已有的镜花水月情绪版。保留你选定的 Attach to prompt 与 Style reference 参考；此处尚未获得板代码和图片 URL，因此提示词没有伪造相应参数。网页设置需你实际完成。

无板示例备注：

> 使用前关闭 Moodboard 和自动 Personalization；Attach to prompt 与 Style reference 仍使用与上版相同的参考图。此版不是纯文本测试。

未来新用户若没有图或板，按真实可用情况改写备注；不要让示例备注变成“已存在你的镜花水月情绪版”的无依据断言。仍交付双版文字，标明有板版的使用前提，不要求为了写词先付费或生成情绪版。

## 官方来源

- [Moodboards](https://docs.midjourney.com/hc/en-us/articles/39193335040013-Moodboards)：个性化板、ID/代码、默认开关、stylize、与 sw/sv 的限制。
- [Style Reference](https://docs.midjourney.com/hc/en-us/articles/32180011136653-Style-Reference)：风格而非人物复制、sref 与参考组合。
- [Image Prompts](https://docs.midjourney.com/hc/en-us/articles/32040250122381-Image-Prompts)：独立角色、内容构图参考、iw。
- [Edit Model](https://docs.midjourney.com/hc/en-us/articles/48495453462797-Edit-Model)：Attach to prompt、V8.1/V8.2、edit、参考组合与显式比例。
