# Personal IP Generator Skill

一个用于 智影 的个人 IP 生成 skill。它以逐问逐答的向导形式，帮助用户从真人照片或角色设定出发，选择画风、锁定特征与配色，并交付统一的头像和表情包。

## 功能

- 支持两种模式：`人物 IP` 与 `代表形象 IP`。
- 内置五个可选画风：彩绘风、线条风、3D 风、插画风、手办风；也支持用户上传临时的自定义风格参考图。
- 固定生成流程：IP 类型 → 风格 → 强化特征 → 配色 → 提示词确认 → 单张 3×2 六款编号预览 → 选择方案 → 正式头像与表情包。
- 最终交付为一张 4×3 成品板：左侧正式头像，右侧九宫格中文标注表情包。
- 可选导出九张透明背景表情贴纸；默认只交付成品板。
- 仅提取抽象视觉特征，不复制参考图中的人物、文字、商标、构图或具体角色。

## 安装

将本仓库克隆到 智影 skills 目录：

```bash
git clone https://github.com/Gayaya999/personal-ip-generator.git \
  ~/.智影/skills/personal-ip-generator
```

随后在 智影 中使用 `$personal-ip-generator`，或直接请求创建个人 IP、头像或表情包。

## 预设画风

| ID | 名称 | 主要特征 |
| --- | --- | --- |
| `caihui-feng` | 彩绘风 | 温暖纸张感、圆润角色、柔和表情 |
| `xian-tiao-feng` | 线条风 | 黑白线稿、极简五官、留白构图 |
| `3d-feng` | 3D 风 | 潮流 3D、柔和材质、立体光影 |
| `illustration-feng` | 插画风 | 平面色块、人物插画、利落轮廓 |
| `figure-feng` | 手办风 | 收藏手办质感、立体造型、产品级陈列 |

完整的风格约束和参考素材请见 [references/style-presets.md](references/style-presets.md)。

## 工作流

```text
IP 类型 → 风格 → 强化特征 → 配色 → 提示词确认
       → 一张 3×2、带 1–6 编号的六款预览
       → 用户选择编号 → 正式头像 + 九宫格表情包成品板
       → （可选）透明底表情贴纸
```

编号和中文批注由宿主在合成时叠加，不要求图像模型生成文字，以减少乱码和错位。详细流程参见 [references/plan-mode-wizard.md](references/plan-mode-wizard.md)。

## 目录

```text
.
├── SKILL.md                     # 智影 skill 主说明
├── agents/openai.yaml           # 在 智影 中的展示元数据
├── assets/style-presets/        # 预设缩略图与风格参考素材
└── references/                  # 向导、提示词、预设及质量规范
```

## 使用与素材授权

- 仅使用用户提供或用户有权使用的肖像与风格参考素材。
- 不将用户肖像写入本 skill；自定义风格默认仅在当前任务中使用。
- 开源使用者在添加、替换或再发布任何参考图时，应自行确认其拥有相应权利。

## License

本项目采用 [MIT License](LICENSE)。
