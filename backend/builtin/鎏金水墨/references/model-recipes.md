# 双模型提示词配方

## 输出骨架

    ### 画面设计
    <不超过 4 行中文>

    ### ImageGen Prompt
    <一段中文自然语言提示词>

    ### Midjourney 8.2 Prompt
    <一行英文提示词，最后必须是 --v 8.2>

    ### 可调选项
    - <最多 3 项>

## 通用编译顺序

不论主体是什么，都按以下优先级组织：

1. 主体及不可改动状态。
2. 主体典型轮廓和关键部件。
3. 人物分支的发型结构、饰件连接、服装内外层和动作适配；非人物跳过。
4. 主鎏金机制与其准确附着位置。
5. 辅助材料与环境。
6. 前景、中景、远景和负空间。
7. 单一镜头与单一主光。
8. 冷暖调色和局部高光。
9. 当前主体最可能失败的约束。

材质和光线放在提示词前半段，但不能先于主体形态锁。环境世界观排在主体与材料之后，避免设定吞没画面。

## ImageGen 配方

ImageGen 使用完整中文句子，明确空间和材料关系：

1. 任务句：图像类型、比例、主风格分支。
2. 主体句：数量、物种/类型、姿态、表情或状态、关键部件。
3. 人物造型句：发型及运动方向、发饰种类及固定点、服装内外层、织物厚薄和金色工艺落点；非人物省略。
4. 材料句：主材料的透明度、厚度、附着位置和覆盖范围；辅助材料与主材料分开写。
5. 构图句：前中远景、主体位置、主形状、辅助弧线和负空间。
6. 光色句：唯一主光源、冷青补光、香槟金高光与局部 bloom。
7. 成像句：摄影写实、实拍 CGI、雕塑水墨、树脂微缩或概念艺术；只选一个主成像语气。
8. 禁止句：只写与当前主体有关的 6–12 项，不复制完整负面词库。

优先写可见关系，不堆砌“8K、16K、超高清、细节拉满”。用户要求高分辨率时可写高精细和适合后期放大，但不要保证模型原生输出某个像素尺寸。

## Midjourney 8.2 配方

英文正文压缩为一条：

    exact subject and state, canonical silhouette and key parts, primary gilded material with location and transparency, secondary ink/resin/filigree material, composition and negative space, one camera view, one key light, restrained palette, image-making language, coherence constraints, parameters --v 8.2

规则：

- 第一分句直接写主体、数量和动作，防止风格词把主体改写。
- 第二分句写典型轮廓或关键部件，尤其适用于动物、神兽、建筑和器物。
- 人物分支在材质前写 hairstyle structure + motion、ornament type + anchored attachment、opaque inner layer + main textile + optional translucent outer layer；不得只写 ornate headdress 或 flowing robes。
- 使用 transparent refractive amber-gold liquid、attached broken gold leaf、solid openwork gold filigree 等完整材料短语，不只写 gold。
- 将 gold is reflected, not self-emissive 或 local champagne-gold reflections 用于需要克制发光的场景。
- 构图只选一种镜头：extreme close-up、portrait、full-body、wide establishing shot、top-down diorama、low-angle 或 symmetrical frontal。
- 默认不使用 --raw。形态严格复刻或用户主动要求低风格化时才添加。
- 所有参数放在最后，版本后缀必须是最后内容。

## 参数建议

| 任务 | 建议起点 |
|---|---|
| 环境叙事、山水、建筑 | --ar 16:9 --s 350 --c 5 --v 8.2 |
| 人物、动物、神兽单体 | --ar 3:4 --s 400 --c 5 --v 8.2 |
| 竖屏海报或全身巨物 | --ar 9:16 --s 400 --c 5 --v 8.2 |
| 正面对称器物或图标式构图 | --ar 1:1 --s 325 --c 3 --v 8.2 |
| 严格主体形态、较少风格漂移 | --ar <比例> --raw --s 250 --c 3 --v 8.2 |

用户明确比例、参数或版本时优先遵守。不要发明图片 URL、--sref、--oref、--seed、--profile 或个性化参数。

## 材料词映射

| 中文意图 | ImageGen 写法 | Midjourney 写法 |
|---|---|---|
| 透明金液 | 透明、折射、带厚度的琥珀金液体薄膜/弧流，能看见其后的主体 | transparent refractive amber-gold liquid membrane or arc, background visible through it |
| 花丝金属 | 不透明、硬边、精细镂空的实心金属花丝 | solid openwork gold filigree with crisp relief and hard edges |
| 碎金箔 | 扁平破碎、紧贴纹理表面的旧金箔，由掠光显现 | attached broken antique-gold leaf revealed by warm grazing light |
| 湿墨/黑漆 | 深青黑湿墨或黑色大漆，有真实厚度与局部镜面 | deep blue-black wet ink or lacquer with restrained specular reflections |
| 白色树脂云 | 象牙白半透明树脂或柔雾云团 | translucent ivory resin or soft sculptural mist |
| 矿物青绿 | 分区清楚、低饱和的青绿矿物颜料 | restrained teal mineral pigments in separated color fields |

## 完整示例：人物主体与具体造型

用户输入：月下女子在水中轻舞

### 画面设计

梦幻透明鎏金分支。女子睁眼仰望月光，在浅水中轻舞；半束湿黑长发向右后方展开，右侧鬓后固定一枚抽象云羽纹旧金花丝发梳，两束短珍珠金链随动作垂落。深青丝绸不透明内层承托身体，象牙白丝绸中层与香槟金半透明外纱形成长水袖；金线只沿领缘、袖口和裙摆出现，空间金液与衣料严格分离。

### ImageGen Prompt

生成一幅 16:9 横向的月夜东方幻想画面：一名成年女子睁着眼睛，在平静浅水中单足点水轻舞，身体舒展，左臂向月光抬起、右臂向外延伸，手指和双脚完整可读，满月位于画面左上方，女子位于中央偏右。她的湿黑长发采用半束半披结构，髻座稳固，长发和少量贴面碎发随旋转统一向右后方展开；一枚小到中等尺寸、硬边镂空的旧金花丝发梳固定在右侧鬓后发束中，纹样是抽象卷云与羽片，不形成真实鸟雕像，两束短珍珠与细金链从发梳下缘垂落，避开眼睛、嘴唇和颈部。服装采用三层结构：贴身而不透明的深青蓝丝绸内衣和长裙提供完整覆盖，象牙白柔光丝绸作为主体中层，最外层是能透出内层与背景的香槟金半透明薄纱长袍，宽大的长水袖沿双臂受力方向舒展；细旧金线与少量贴附碎金箔只落在衣领、袖口、腰封和裙摆褶皱上。两条透明、折射、带厚度的琥珀金液体弧流由水面被舞姿带起，在人物上方和脚边形成 S 曲线，能看见其后的夜空与山影，明确是独立空间水流，不与薄纱、水袖或头发融合。前景是少量飞溅水珠，中景人物清晰，远景为蓝黑群山、青灰薄雾与月面反光，右侧保留深色负空间。唯一主光来自左上方冷白月光，正面补光极弱；旧金只在发梳、衣缘和水弧形成稀疏暖色反射，局部轻微 bloom，整体低调蓝黑阴影、暖象牙肤色与克制香槟金高光，写实电影质感与东方幻想 CGI 结合。不要闭眼，不要巨型头冠，不要真实凤凰雕像，不要漂浮发簪，不要让流苏穿过面部，不要透明走光，不要金属衣服，不要把衣袖熔成金液，不要多余手指或脚趾，不要多个月亮，不要全屏金黄、文字、标志或水印。

### Midjourney 8.2 Prompt

one adult woman with open eyes dancing lightly on one foot in shallow moonlit water, left arm raised toward the full moon and right arm extended, complete readable hands and bare feet, placed center-right beneath a moon in the upper-left, wet black hair in a secure half-up half-down arrangement with the long hair and a few loose facial strands sweeping consistently toward the right rear, one small-to-medium solid openwork antique-gold hair comb anchored behind her right temple with abstract cloud-scroll and feather motifs, not a literal bird, two short pearl-and-fine-gold tassels suspended from the lower edge of the comb and kept clear of her eyes, lips and neck, a fully opaque fitted deep-teal silk inner bodice and long skirt, an ivory silk middle robe, a translucent champagne-gold gauze outer robe with long water sleeves stretched along the force of both arms, fine antique-gold embroidery and sparse attached broken gold leaf confined to the collar, cuffs, sash and hem folds, two transparent refractive amber-gold water arcs rising independently from the water into an S-curve above and below her, background visible through them, never fused with hair, gauze or sleeves, foreground droplets, crisp dancer in the midground, blue-black mountains and cool gray mist in the distance, deep negative space on the right, single cool-white moon key from upper-left with very low frontal fill, restrained warm reflections only on the comb, garment edges and liquid arcs, low-key blue-black shadows, warm ivory skin, champagne-gold highlights, localized bloom, tactile live-action Eastern fantasy CGI, no closed eyes, no giant crown, no literal phoenix statue, no floating hairpin, no face-crossing tassels, no exposed body through gauze, no metallic robe, no liquid sleeves, no extra fingers or toes, no extra moon, no all-gold wash, no text, no logo, no watermark --ar 16:9 --s 350 --c 5 --v 8.2

### 可调选项

- 发饰可降为单枚细金发簪与一颗珍珠，更轻盈写实。
- 仪式感版本可升级为有边界的云羽花丝小冠，但仍不得遮脸或妨碍舞姿。
- 把半透明香槟金外纱改为雨雪分支的厚实赭金锦缎披风。

## 完整示例：非人物主体

用户输入：黑豹穿过雨夜竹林

### 画面设计

雨雪湿光分支。一只睁眼黑豹低身奔跑，完整保留豹的四肢、长尾和湿毛轮廓；少量碎金沿湿毛边缘闪现，一条透明琥珀金弧流穿过斜雨但不遮住头部。16:9 低机位横向追随，蓝黑竹林留出大面积冷暗空间，暖色掠光只点亮眼睛、肩背和雨滴。

### ImageGen Prompt

生成一幅 16:9 横向电影感雨夜画面：一只睁着眼睛的成年黑豹正低伏身体快速穿过密集竹林，四肢、肩背、长尾和猫科动物头部比例自然完整，动作方向从左向右，神情警觉而有力量。黑豹的湿黑毛发保持真实柔软，只在肩背、耳缘和尾部少量附着破碎旧金箔，金箔紧贴毛流并由侧后方暖色掠光短暂照亮；一条透明、折射、带厚度的琥珀金液体弧流穿过斜雨和前景竹叶，仍能透过它看见竹林与黑豹，不覆盖眼睛、口鼻或四肢。前景雨滴和竹叶轻微虚化，中景黑豹清晰，远景是层叠蓝黑竹影和青灰雾气，右侧保留冷暗负空间。低机位横向追随视角，浅中等景深，暖金高光与极弱冷青环境反射分离，局部 bloom，写实摄影与克制东方幻想 CGI 结合。不要出现人物、神女、闭眼、金冠、月亮、凤凰、全身金属化、额外肢体、畸形爪子、不透明金管、岩浆、火焰、闪电、霓虹、文字、标志或水印。

### Midjourney 8.2 Prompt

one alert adult black panther with open eyes sprinting low through a rain-soaked bamboo forest from left to right, anatomically correct feline head, four complete legs, powerful shoulders and one long tail, realistic wet black fur with sparse attached broken antique-gold leaf following the fur grain along the shoulders, ears and tail, a single transparent refractive amber-gold liquid arc crossing the slanting rain without covering the eyes, muzzle or limbs, foreground bamboo leaves and droplets softly out of focus, sharply readable panther in the midground, layered blue-black bamboo and cool gray mist receding into the background, cinematic low tracking viewpoint, warm grazing rim light revealing only a few champagne-gold highlights, very weak cyan ambient reflection, deep cool negative space, localized bloom, tactile live-action fantasy CGI, no woman, no goddess, no closed eyes, no crown, no moon, no phoenix, no full-body metal, no extra limbs, no opaque gold tubes, no lava, no fire, no lightning, no neon, no text, no logo, no watermark --ar 16:9 --s 350 --c 5 --v 8.2

### 可调选项

- 把透明金液改为只沿雨水形成的稀疏金色水痕。
- 改为 3:4 正面跃出竹雾的单体构图。
- 减少金箔，强化冷青雨夜的真实摄影感。

## 模型差异

| 项目 | ImageGen | Midjourney 8.2 |
|---|---|---|
| 语言 | 默认中文自然语言 | 英文压缩描述 |
| 主体锁 | 用完整句子说明数量、动作和不可遮挡部件 | 放在最前两分句并重复关键数量 |
| 材料 | 说明透明度、位置、覆盖范围和相互关系 | 使用稳定材料短语和局部约束 |
| 负面项 | 完整禁止句 | no 短语与 --no 参数均可；避免过长 |
| 画幅 | 正文明确 | 使用 --ar |
| 版本 | 不添加模型参数 | 严格以 --v 8.2 结束 |
