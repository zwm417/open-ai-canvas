# 变量与风格推断

## 变量

| 变量 | 来源 |
|---|---|
| `{brand_name_en}` | 用户提供或基于品牌名生成的英文名 |
| `{brand_name_display}` | 品牌本地语言名称 |
| `{industry}` | 行业/品类 |
| `{target_audience}` | 目标受众 |
| `{primary_color}` | 已确认主色 |
| `{secondary_color}` | 已确认辅色 |
| `{accent_color}` | 强调色 |
| `{neutral_dark}` / `{neutral_light}` | 中性色 |
| `{design_style}` | 已确认视觉方向 |
| `{font_style}` | 与视觉方向匹配的字体气质，不冒充已授权字体名称 |
| `{motif_style}` | 辅助图形语言 |
| `{slogan}` | 用户提供或明确标记为设计提案的 Slogan |
| `{character_base_object}` | 与品牌/行业相关的 IP 基础对象 |
| `{logo_shape_description}` | Logo 图形结构 |
| `{logo_core_symbol}` | Logo 核心符号 |
| `{product_mockup_1}` / `{product_mockup_2}` | 行业关键应用 |
| `{packaging_item}` | 代表性包装 |
| `{icon_1}` / `{icon_2}` / `{icon_3}` | 辅助图标 |
| `{motif_1}` / `{motif_2}` / `{motif_3}` | 辅助图形元素 |
| `{atmosphere_keywords}` | 空间和生活方式氛围 |
| `{hero_visual_description}` | 宣传海报主视觉 |
| `{lifestyle_scene_description}` | 生活方式场景 |

## 缺省风格推断

只在用户没有给出品牌规范时作为起点，不把它当行业定论。

| 行业 | 建议起点 | 色彩倾向 | 图形语言 |
|---|---|---|---|
| 茶饮 / 咖啡 | 新瑞士、年轻大胆 | 高对比主辅色 | 状态条、图标、模块网格 |
| 护肤 / 美妆 | 克制轻奢 | 柔和主色与金属/中性色 | 有机曲线、留白 |
| 街头 / 时尚 | 街头先锋 | 黑色与高亮强调色 | 涂鸦、像素、粗排版 |
| 食品 / 烘焙 | 温暖手作 | 暖棕、奶油白 | 手绘图形、纸张纹理 |
| 科技 / 互联网 | 未来简约 | 冷色与白色 | 几何线条、数据模块 |
| 儿童 / 母婴 | 柔和趣味 | 低饱和多色 | 圆角卡通、柔软形状 |

## 推断规则

- 没有风格：结合品牌名语义、行业、受众和信任目标提出一个主方向。
- 没有色彩：选择主色、辅色和中性色，并检查行业禁忌与可访问对比。
- 没有 Logo 概念：从品牌名含义和行业触点提炼一个核心符号，不复制知名品牌。
- 没有 Slogan：生成一条短提案并明确其为待确认文案。
- 没有 IP 概念：让 IP 继承 Logo 核心符号，避免凭空创建无关吉祥物。
