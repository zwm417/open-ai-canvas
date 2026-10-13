# 双模型提示词配方

## 输出骨架

```markdown
### 画面设计
<不超过4行中文>

### ImageGen Prompt
<一段自然语言提示词>

### Midjourney 8.2 Prompt
<一行英文提示词，最后必须是 --v 8.2>

### 可调选项
- <最多3项>
```

## ImageGen 配方

ImageGen 更适合完整自然语言和明确空间关系。按以下顺序组织：

1. **任务句**：生成什么类型的图、画幅、总体风格。
2. **不可改动事实**：人物数量、动作、位置、关键物件。
3. **空间层次**：前景、中景、远景分别是什么。
4. **尺度关系**：人物约占画面多少，哪一个元素负责表现巨物感。
5. **建筑与材质**：柱梁枋、斗拱、台基、白玉、朱木、古金、大漆等。
6. **光线与色彩**：唯一主光源、冷暖关系、雾与体积光。
7. **成像语气**：电影级环境概念图、写实材质、克制细节、清晰透视。
8. **禁止项**：只写与本场景有关的 5–10 项，使用完整句子。

不要堆砌互相重复的“8K、16K、超高清、细节拉满”。优先描述可见内容和关系。

## Midjourney 8.2 配方

正文使用英文，按以下顺序压缩成一条：

`subject and action, environment, monumental scale device, Chinese architectural grammar, foreground/midground/background composition, camera and lens feeling, lighting, restrained palette, material detail, atmosphere, coherence constraints, parameters --v 8.2`

规则：

- 第一分句直接写人物和动作，防止被环境词淹没。
- 使用 `monumental`, `colossal`, `vast`, `human-scale anchor` 等尺度词，但必须指出谁与谁形成比例。
- 写清 `foreground / midground / background` 或等价空间关系。
- 默认使用 `cinematic establishing shot`、`low-angle wide shot` 或 `symmetrical axial composition`，不要一次叠加多个相互冲突的机位。
- 用具体材质代替空泛的 `Chinese style`。
- 参数放在最后，最后四个字符必须属于 `8.2` 版本后缀。

## 模型差异

| 项目 | ImageGen | Midjourney 8.2 |
|---|---|---|
| 语言 | 默认中文自然语言 | 英文压缩描述 |
| 空间关系 | 用完整句子明确位置 | 用分句和构图术语压缩 |
| 约束 | 可写完整禁止句 | 以 `--no` 或短约束表达 |
| 画幅 | 在正文中明确 | 使用 `--ar` |
| 版本 | 不添加模型参数 | 严格以 `--v 8.2` 结束 |

## 完整示例

用户输入：`宫殿内有一群女子在坐着喝茶`

### 画面设计

白玉金阙分支。5–7位女子在中景围坐饮茶，人物大小足以看清斟茶和举盏；巨柱、藻井与月门建立天宫尺度，月门外是云海和远方宫阙。晨光从侧后方进入，形成朱红、象牙白、古金与雾蓝的冷暖层次。

### ImageGen Prompt

生成一幅16:9横向电影级东方神话环境画面：在一座位于云海之上的巨型中式天宫内厅，六位原创古装女子围坐在低矮的白玉茶案旁从容饮茶，其中一人执壶斟茶，两人举盏，其余人自然交谈或聆听，所有人物保持坐姿，人物约占画面高度的10%至14%，动作和茶具清楚可辨。前景以深色木构和局部白玉栏杆形成框景，中景是人物、茶案和克制的黑色大漆倒影，远景是一扇尺度惊人的圆形月门，门外展开翻涌云海、远山和垂落云瀑。宫殿采用朱砂木柱、严谨柱网、层叠斗拱藻井、白玉台基、古金构件和细腻云水纹，结构完整且具有可信的承托关系。清晨低角度金光从月门侧后方斜入，受光面温暖，阴影保持雾蓝和青灰，气氛宁静、神圣、辽阔而有人情味。写实材质，电影级环境概念艺术，清晰纵深，细节克制。不要出现站立观景主角，不要让云雾遮住人物和茶桌，不要复制人物或茶具，不要西式柱廊、现代家具、霓虹灯、文字、标志、水印、畸形手部或融化建筑。

### Midjourney 8.2 Prompt

six original women in flowing classical Chinese robes seated around a low white-jade tea table inside a colossal celestial palace, one woman pouring tea, two lifting cups, the others conversing and listening, all figures clearly readable in the midground, monumental vermilion timber columns and a structurally coherent dougong coffered ceiling rising far above them, a gigantic circular moon gate framing a boundless sea of clouds, distant sacred peaks and vertical cloud waterfalls, dark lacquer and ivory-jade floor with restrained reflections, foreground architectural framing, intimate human ritual within overwhelming heavenly scale, cinematic wide establishing shot, gentle low morning sunlight from behind the moon gate, warm antique gold highlights against misty blue-gray shadows, Tang-Song-inspired silhouette with traditional Chinese palace spatial order, refined realistic materials, serene sacred atmosphere, no standing spectators, no western architecture, no modern furniture, no duplicated people, no malformed hands, no text, no logo, no watermark --ar 16:9 --raw --s 200 --c 5 --v 8.2
