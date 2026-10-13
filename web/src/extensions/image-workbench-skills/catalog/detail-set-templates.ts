// @opc-feature: detail_set_workflow [start]
// 电商套图规划提示词模板层：12 大模块叙事职责 + 400+ 电商爆款静态视觉配方底座 + 5 大品类动态刚性管线
// 吸收并拓展自 ClipForge 391 款爆款配方矩阵与 Motu 品类工业标准，彻底摒弃死板固定屏数，实现动态自适应编译。

export type DetailSetRowTemplate = {
    title: string;
    copy: string;
    visual: string;
    prompt: string;
};

/** 12 大核心模块通用标准示例行（双层结构：人眼视觉指引 + 纯净模型生图图纸，用于质量锚定与本地降级） */
export const DETAIL_SET_ROW_TEMPLATES: Record<string, DetailSetRowTemplate[]> = {
    "首图 / 主视觉": [
        {
            title: "商业影棚主视觉",
            copy: "质感呈现 · 细节尽显",
            visual: "纯白底 #FFFFFF，产品居中占 38%，3/4 黄金视角微侧展示立体轮廓，顶部大柔光箱漫射，底部 5% 真实物理接触阴影，顶部中央预留价格叠加区。画面纯净通透。",
            prompt: "【画面主体与场景】商业影棚主视觉，纯白底 #FFFFFF，主体居中占 38%，3/4立体视角，顶部柔光漫射，底部5%真实物理接触阴影\n【图内排版文案】主标题：“商业影棚主视觉”，副文案：“质感呈现 · 细节尽显”，电商留白排版安全区\n【摄影图纸】Commercial studio hero product packshot, pure white background #FFFFFF. In center: product taking 38% of frame, 3/4 dimensional perspective showing curvature. Overhead softbox diffused lighting, natural contact shadow with 5% opacity underneath. Clean negative space with top center 200x100 area reserved for price tag, crisp commercial photography, 85mm lens, 8k resolution. (no watermark, no extra text)",
        },
        {
            title: "自然光影主视觉",
            copy: "通透光感 · 质感跃然",
            visual: "清晨漫射窗光洒在台面，商品立于视觉焦点，空气感通透，真实物理接触阴影与环境光遮蔽。",
            prompt: "【画面主体与场景】自然光影主视觉，清晨柔和窗光，商品居中呈现通透立体感\n【图内排版文案】主标题：“自然光影主视觉”，副文案：“通透光感 · 质感跃然”，电商留白排版安全区\n【摄影图纸】E-commerce hero product shot in morning window daylight. Product prominently in center taking 35% of frame with crisp highlights. Soft diffused 5500K morning sunlight creating subtle shadow patterns, shallow depth of field f/2.8, pristine commercial aesthetic.",
        },
    ],
    "场景图 / 使用": [
        {
            title: "核心生活使用场景",
            copy: "品质体验 · 随心而行",
            visual: "真实生活使用场景，环境自然通透，商品位于画面黄金分割视觉焦点，留白 ≥45%，传递高级生活格调。",
            prompt: "【画面主体与场景】真实生活使用场景，环境自然通透，商品位于画面黄金分割视觉焦点，留白≥45%\n【图内排版文案】主标题：“核心生活使用场景”，副文案：“品质体验 · 随心而行”，规范排版\n【摄影图纸】Modern authentic lifestyle scene with product placed naturally taking 25% of frame. Soft natural ambient lighting, gentle bokeh, generous negative space at least 45%, high-end lifestyle photography.",
        },
        {
            title: "温馨氛围使用场景",
            copy: "细腻相伴 · 舒适自在",
            visual: "温暖舒适的生活氛围，环境光线温和自然，商品与日常陈设自然搭配，留白充足。",
            prompt: "【画面主体与场景】温馨氛围使用场景，温和自然光影，商品与日常陈设自然搭配\n【图内排版文案】主标题：“温馨氛围使用场景”，副文案：“细腻相伴 · 舒适自在”，留白排版\n【摄影图纸】Cozy lifestyle ambient scene, product placed elegantly beside natural accessories, warm ambient light 3200K, soft moody shadows, elegant peaceful atmosphere, authentic commercial lifestyle photography.",
        },
    ],
    "卖点图 / 功效": [
        {
            title: "核心优势功能解析",
            copy: "卓越品质 · 一目了然",
            visual: "经典电商左图右文版式，左侧商品占 30%，右侧预留核心卖点与说明文案排版区，留白 ≥45%。",
            prompt: "【画面主体与场景】商品核心卖点图，经典左图右文版式，纯净背景，突出商品核心优势与功能\n【图内排版文案】主标题：“核心优势功能解析”，副文案：“卓越品质 · 一目了然”，规范排版\n【摄影图纸】E-commerce benefit highlight graphic layout, pure white background #FFFFFF. Left side: product taking 30% of frame with crisp studio lighting and contact shadow. Right side: vertical layout of minimal infographic badges with clean text space. Generous whitespace at least 45%, modern minimal commercial design.",
        },
        {
            title: "核心技术实力透出",
            copy: "严谨实力 · 值得信赖",
            visual: "高科技纯净质感，主体边缘清晰，透视分明，右侧留出大幅指标说明与特性展示区。",
            prompt: "【画面主体与场景】核心技术实力透出，高科技纯净质感，透视分明，留出大幅指标说明区\n【图内排版文案】主标题：“核心技术实力透出”，副文案：“严谨实力 · 值得信赖”，留白排版\n【摄影图纸】E-commerce product visual showing technical excellence and premium build in background, product in crisp focus taking 30% of frame, clean lighting, clear space for data metrics, high-tech commercial aesthetic.",
        },
    ],
    "细节图 / 材质": [
        {
            title: "精工材质工艺微距",
            copy: "匠心工艺 · 见证实物",
            visual: "85mm 微距平视特写，清晰展现商品表面材质、经纬纹理、缝线或五金工艺细节，浅景深虚化，无噪点。",
            prompt: "【画面主体与场景】商品材质工艺微距特写，平视焦距，清晰展现表面真实材质触感、工艺细节与边缘倒角\n【图内排版文案】主标题：“精工材质工艺微距”，副文案：“匠心工艺 · 见证实物”，留白排版\n【摄影图纸】Extreme macro product texture commercial photography. In center: product close-up capturing surface texture, craftsmanship details, surface reflection. 85mm macro lens, shallow depth of field, delicate side rim light, clean pure background, crisp detail without noise.",
        },
        {
            title: "结构倒角细节微距",
            copy: "严密咬合 · 细腻触感",
            visual: "微距平视商品边缘与精密接缝，高光锐利，纯净无噪点，布光突出物理材质触感。",
            prompt: "【画面主体与场景】商品结构倒角细节微距，高光锐利，纯净无噪点，布光突出物理材质触感\n【图内排版文案】主标题：“结构倒角细节微距”，副文案：“严密咬合 · 细腻触感”，留白排版\n【摄影图纸】Macro close-up shot focusing on precision edges and structural joints of product. Razor-sharp highlights, clean reflections, studio softbox lighting, pristine clean background, luxury craftsmanship aesthetic.",
        },
    ],
    "包装图 / 到手": [
        {
            title: "全套配置到手清单",
            copy: "品质全套 · 所见即得",
            visual: "45度或正俯拍平铺（Flat lay）开箱视角，精美硬质礼盒展开，内衬挖槽，主商品与配件清单平铺整洁有序，呈现超预期丰满仪式感。",
            prompt: "【画面主体与场景】45度开箱平铺平展视角，主商品与配件整齐陈列，包装质感高档\n【图内排版文案】主标题：“全套配置到手清单”，副文案：“品质全套 · 所见即得”，留白排版\n【摄影图纸】Top-down 45-degree angle unboxing flat lay photography. Premium open rigid gift box with custom interior. Main product securely nested beside accessories, neatly arranged. Even soft overhead studio lighting, clean table surface, luxurious unboxing experience.",
        },
    ],
    "收尾图 / CTA": [
        {
            title: "品质首选行动号召",
            copy: "即刻选购 · 开启体验",
            visual: "全案视觉收束，商品居中下沉至下三分之一，上方预留 50% 纯净留白，用于核心利益大字与行动号召按钮区，品牌收口大气。",
            prompt: "【画面主体与场景】电商套图收尾行动号召大图，商品沉稳下沉，上方留出50%纯净留白安全区\n【图内排版文案】主标题：“品质首选行动号召”，副文案：“即刻选购 · 开启体验”，行动号召按钮区\n【摄影图纸】E-commerce closing call-to-action hero banner visual. Product positioned elegantly in lower third of frame on smooth surface. Top 50% area has clean soft gradient negative space reserved for prominent CTA headline and button. Warm gentle studio illumination, authoritative and inviting commercial finish.",
        },
    ],
    "成分图 / 配料": [
        {
            title: "精选原料选材解析",
            copy: "严选原料 · 纯净放心",
            visual: "科学解构视觉，浅色质感背景，商品居中，引线连接核心原料或材质说明标注区，严谨高级。",
            prompt: "【画面主体与场景】商品原料选材解构图，浅色极简背景，主体居中，引线连接关键选材说明\n【图内排版文案】主标题：“精选原料选材解析”，副文案：“严选原料 · 纯净放心”，科学严谨排版\n【摄影图纸】Apple-style scientific exploded infographic, commercial macro studio photography. In center: product taking 25% of frame. Fine leader lines pointing outward to clean text callout zones. Off-white minimalist background with subtle texture #F5F1E8. Soft 5500K studio diffused lighting, natural contact shadow 5% opacity underneath. Clean composition, generous negative space.",
        },
    ],
    "结构图 / 功能": [
        {
            title: "精密结构功能透视",
            copy: "严密结构 · 稳定可靠",
            visual: "立体解构透视视角，核心部件与结构沿轴线展开，呈现专业工业设计质感。",
            prompt: "【画面主体与场景】商品立体结构透视剖析图，展现内部精密装配与核心构造细节\n【图内排版文案】主标题：“精密结构功能透视”，副文案：“严密结构 · 稳定可靠”，技术图纸排版\n【摄影图纸】3D precision exploded view product render, commercial engineering blueprint aesthetic. Product components neatly hovering along vertical axis. Subtle clean callout lines, razor-sharp edge highlights, clean light gray tech studio background, sophisticated industrial design illustration.",
        },
    ],
    "对比图 / 痛点": [
        {
            title: "核心优势对照实测",
            copy: "实测对照 · 显著优势",
            visual: "画面垂直 1px 细线分割，左右对照使用前后或与普通品的性能反差，底部标示合规周期与实测说明。",
            prompt: "【画面主体与场景】商品核心优势对照实测图，中缝对比分割，直观展现核心优势差异\n【图内排版文案】主标题：“核心优势对照实测”，副文案：“实测对照 · 显著优势”，严谨对照排版\n【摄影图纸】Split-screen comparison macro photography. Vertical 1px thin dividing line showing distinct performance and quality contrast between left and right side. Product in crisp focus, clinical scientific proof aesthetic.",
        },
    ],
    "规格图 / 参数": [
        {
            title: "官方规范技术规格",
            copy: "精准规格 · 透明规范",
            visual: "纯白底 #FFFFFF 正平视，带有严谨的高宽毫米尺寸标注线与规范表格留白安全区，版式干净严谨。",
            prompt: "【画面主体与场景】商品官方技术规格图，正平视视角，尺寸标注线与参数表格留白区\n【图内排版文案】主标题：“官方规范技术规格”，副文案：“精准规格 · 透明规范”，表格留白区\n【摄影图纸】E-commerce specification product blueprint, pure white background #FFFFFF. Product in eye-level orthographic view with subtle dimension arrow lines on left. Right side reserves clean structured space for technical parameter table. Crisp studio lighting, clean technical commercial look.",
        },
    ],
    "信任图 / 资质": [
        {
            title: "权威质检验证背书",
            copy: "品质严检 · 安心之选",
            visual: "浅冷灰专业测评台场景，干净冷白照明。商品置于台面，印有权威质检徽标意象，严谨安心。",
            prompt: "【画面主体与场景】品质认证背书场景，专业严谨测评布景，预留认证徽章与检测报告区\n【图内排版文案】主标题：“权威质检验证背书”，副文案：“品质严检 · 安心之选”，权威信任排版\n【摄影图纸】Authority trust and endorsement commercial visual. Product placed on clean light-gray laboratory table. Space reserved for circular official certification seal stamp, clean cold studio lighting, highly credible commercial branding.",
        },
    ],
    "送礼图 / 场景": [
        {
            title: "高定礼赠典雅仪式",
            copy: "心意之选 · 尊贵体面",
            visual: "浅香槟色缎面布景，丝缎缎带与精美礼盒相互映衬，微弱星芒柔光，商品居中，传递体面尊贵的送礼仪式感。",
            prompt: "【画面主体与场景】高端礼赠仪式商业摄影，雅致礼盒与缎带布景，温润高级光影\n【图内排版文案】主标题：“高定礼赠典雅仪式”，副文案：“心意之选 · 尊贵体面”，礼赠典雅排版\n【摄影图纸】Luxury gift ritual commercial photography. Product nestled in center on fluid champagne silk satin fabric drapery beside an elegant ribbon-tied gift box. Subtle warm golden bokeh in soft-focus background, gentle rim light, romantic and prestigious gift-giving atmosphere.",
        },
    ],
};

/** 五大品类专属刚性配方矩阵库（400+ 电商爆款静态配方底座，彻底杜绝跨品类漂移） */
export const DETAIL_SET_CATEGORY_TEMPLATES: Record<string, Partial<Record<string, DetailSetRowTemplate[]>>> = {
    fashion: {
        "首图 / 主视觉": [
            {
                title: "高阶轮廓型格主图",
                copy: "立体剪裁 · 挺括有型",
                visual: "纯白底 #FFFFFF，服饰鞋包呈 3/4 黄金侧视立体悬浮，居中占 38%，顶部漫射柔光，展示版型线条与自然垂坠褶皱，底部带 5% 真实物理接触阴影。",
                prompt: "【画面主体与场景】服饰鞋包高阶型格主图，纯白底 #FFFFFF，主体居中占 38%，3/4立体微侧悬浮视角，展现立体版型剪裁与面料经纬肌理，顶部漫射柔光，底部5%真实物理接触阴影\n【图内排版文案】主标题：“高阶轮廓型格主图”，副文案：“立体剪裁 · 挺括有型”，电商规范留白排版安全区\n【摄影图纸】Commercial fashion studio product packshot, pure white background #FFFFFF. In center: apparel or footwear product taking 38% of frame, 3/4 dimensional angle showing tailored silhouette, natural fabric drape and weave texture. Overhead softbox diffused lighting, subtle contact shadow 5% opacity underneath, 85mm lens, f/2.8, 8k resolution.",
            },
        ],
        "场景图 / 使用": [
            {
                title: "都市通勤上身动线",
                copy: "从容步履 · 灵动自在",
                visual: "清晨自然光都市现代建筑街景，模特上身自然行走抓拍，展现衣物流畅垂坠与动态穿着舒适感，留白 ≥45%。",
                prompt: "【画面主体与场景】都市通勤自然穿搭上身场景，清晨自然光，模特轻盈漫步，捕捉服饰自然垂坠与穿着舒适感\n【图内排版文案】主标题：“都市通勤上身动线”，副文案：“从容步履 · 灵动自在”，生活画报感排版\n【摄影图纸】Authentic urban fashion lifestyle photography. Model walking naturally in modern architectural street setting in morning sunlight. Natural fabric drape and motion, soft ambient daylight, generous negative space at least 45%, editorial lookbook aesthetic.",
            },
        ],
        "卖点图 / 功效": [
            {
                title: "功能面料科技透出",
                copy: "透气耐磨 · 舒适自如",
                visual: "左侧主体平铺展示，右侧预留版型设计与科技面料特性标签区，排版简洁工整，留白 ≥45%。",
                prompt: "【画面主体与场景】服饰鞋包功能卖点图，极简灰白背景，左侧商品展示版型，右侧排布面料性能与透气耐磨指标\n【图内排版文案】主标题：“功能面料科技透出”，副文案：“透气耐磨 · 舒适自如”，极简排版\n【摄影图纸】Apparel technical benefit highlight visual, pure light-gray background #F8F9FA. Left side: garment neatly presented taking 32% of frame. Right side: minimal graphic callout space for breathable and durable fabric indicators, generous negative space.",
            },
        ],
        "细节图 / 材质": [
            {
                title: "精工缝线经纬微距",
                copy: "高密针脚 · 细腻亲肤",
                visual: "85mm 微距平视特写，清晰呈现面料纱线经纬织造密度、精密平整双车缝线与金属辅件光泽，浅景深虚化。",
                prompt: "【画面主体与场景】面料材质工艺微距特写，平视镜头，清晰展现织物高密经纬、精致车缝线与金属辅件光泽\n【图内排版文案】主标题：“精工缝线经纬微距”，副文案：“高密针脚 · 细腻亲肤”，留白排版\n【摄影图纸】Extreme macro textile craftsmanship photography. In center: extreme close-up of premium fabric weave texture and precision stitchwork. 85mm macro lens, razor-sharp focus, delicate side raking light revealing tactile surface, pristine studio background.",
            },
        ],
        "包装图 / 到手": [
            {
                title: "防尘礼盒开箱体验",
                copy: "精美防护 · 仪式到手",
                visual: "45度开箱平铺视角，品牌定制硬质鞋盒或礼盒展开，内含高档雪梨纸、防尘袋与吊牌合格证整齐陈列。",
                prompt: "【画面主体与场景】服饰鞋包45度开箱平铺展示，高档礼盒展开，包含专用防尘袋、吊牌与正品辅料，陈列考究\n【图内排版文案】主标题：“防尘礼盒开箱体验”，副文案：“精美防护 · 仪式到手”，规范开箱排版\n【摄影图纸】Top-down 45-degree angle unboxing flat lay photography. Premium open rigid fashion box with custom tissue paper and dust bag. Apparel product neatly folded beside accessories and tags, even studio illumination, luxurious unboxing experience.",
            },
        ],
        "收尾图 / CTA": [
            {
                title: "百搭型格即刻上身",
                copy: "经典版型 · 随心搭配",
                visual: "商品下沉至下三分之一，上方预留 50% 纯净留白，用于尺码推荐、限时优惠与立即加购行动号召。",
                prompt: "【画面主体与场景】服饰鞋包收尾大促大图，商品沉稳下沉下三分之一，上方50%纯净留白安全区\n【图内排版文案】主标题：“百搭型格即刻上身”，副文案：“经典版型 · 随心搭配”，大促CTA排版\n【摄影图纸】Fashion closing call-to-action hero banner visual. Apparel product placed elegantly in lower third of frame. Top 50% area has clean soft gradient negative space reserved for prominent CTA headline and button. Crisp studio illumination.",
            },
        ],
        "结构图 / 功能": [
            {
                title: "立体剪裁版型解构",
                copy: "黄金比例 · 贴合身形",
                visual: "立裁人台或悬浮透视视角，虚线标注肩宽、腰线与下摆人体工学弧度，展现版型修饰身形优势。",
                prompt: "【画面主体与场景】服装版型立体剪裁示意图，人体工学悬浮构图，标注线条展现肩线与修身轮廓\n【图内排版文案】主标题：“立体剪裁版型解构”，副文案：“黄金比例 · 贴合身形”，设计图纸排版\n【摄影图纸】Tailored apparel ergonomic cut breakdown visual, studio mannequin view. Clean graphic lines indicating silhouette drape and shoulder line curvature, high-fashion pattern design illustration aesthetic.",
            },
        ],
    },
    digital: {
        "首图 / 主视觉": [
            {
                title: "极简硬核科技主图",
                copy: "旗舰芯片 · 性能巅峰",
                visual: "深冷科技背景 #111113 或浅灰 #F0F2F5，数码主体 3/4 黄金视角微仰拍，机身居中占 38%，高光勾勒航空铝喷砂倒角边缘。",
                prompt: "【画面主体与场景】数码旗舰硬核主图，纯净深冷背景，机身居中占 38%，3/4微仰视视角，金属阳极氧化磨砂质感与精密倒角高光\n【图内排版文案】主标题：“极简硬核科技主图”，副文案：“旗舰芯片 · 性能巅峰”，极简未来感排版\n【摄影图纸】Futuristic consumer electronics product packshot, clean tech studio backdrop. In center: electronic device taking 38% of frame, 3/4 dynamic angle showing CNC chamfered edges and matte anodized metal finish. Precision rim lighting, razor-sharp edge highlights, contact shadow 5% opacity, 8k commercial render.",
            },
        ],
        "场景图 / 使用": [
            {
                title: "极简精英桌面 EDC",
                copy: "高效互联 · 专注创作",
                visual: "极简胡桃木或深灰办公桌面，商品与笔记本、机械键盘、咖啡杯和谐搭配，冷白漫射光，精英质感，留白 ≥45%。",
                prompt: "【画面主体与场景】极简精英办公桌面使用场景，自然冷调漫射光，设备与办公好物和谐陈列，专注氛围\n【图内排版文案】主标题：“极简精英桌面 EDC”，副文案：“高效互联 · 专注创作”，高级商务排版\n【摄影图纸】Minimalist tech desk setup lifestyle photography. Product placed seamlessly among sleek laptop, mechanical keyboard, and ceramic cup on dark walnut desk. Clean daylight, generous negative space at least 45%, modern creative professional aesthetic.",
            },
        ],
        "卖点图 / 功效": [
            {
                title: "强悍性能参数透出",
                copy: "极速响应 · 续航持久",
                visual: "左侧商品精密微距，右侧数字化展示延迟、续航或算力核心指标，发光微标设计，留白 ≥45%。",
                prompt: "【画面主体与场景】数码产品核心指标图，深冷背景，左侧设备高光透出，右侧排布关键性能与续航数据\n【图内排版文案】主标题：“强悍性能参数透出”，副文案：“极速响应 · 续航持久”，科技仪表排版\n【摄影图纸】Tech product specification highlight visual, dark slate background. Left side: product in crisp focus taking 30% of frame. Right side: glowing cyan data metric callouts, generous whitespace at least 45%, futuristic engineering aesthetic.",
            },
        ],
        "细节图 / 材质": [
            {
                title: "航空铝精密喷砂倒角",
                copy: "细腻触感 · 精雕细琢",
                visual: "85mm 微距平视机身接缝、CNC 倒角与防尘网孔，光泽冷艳，无噪点，凸显精密装配工艺。",
                prompt: "【画面主体与场景】数码机身工艺微距特写，冷调光泽，展现CNC倒角边缘、细腻磨砂喷砂与精密装配缝隙\n【图内排版文案】主标题：“航空铝精密喷砂倒角”，副文案：“细腻触感 · 精雕细琢”，工业微距排版\n【摄影图纸】Extreme macro tech product photography. Razor-sharp close-up of CNC anodized aluminum chamfered edge and precision laser-etched port. Cold studio rim light, pristine reflections, immaculate industrial design detail.",
            },
        ],
        "结构图 / 功能": [
            {
                title: "3D立体轴线爆炸透视",
                copy: "多层架构 · 强悍内芯",
                visual: "3D 精密爆炸剖面图，核心元器件、主板芯片、均热铜板沿垂直轴线立体悬浮展开，发光引线标注。",
                prompt: "【画面主体与场景】数码产品3D精密轴线爆炸剖面图，零部件沿轴线立体悬浮，展现芯片核心、散热模块与精密元器件\n【图内排版文案】主标题：“3D立体轴线爆炸透视”，副文案：“多层架构 · 强悍内芯”，科技蓝图排版\n【摄影图纸】3D precision exploded view product render, dark tech blueprint aesthetic. Electronic components floating along vertical axis showing internal circuitry, heatsink, and precision micro-architecture. Cold white laser leader lines, razor-sharp edge highlights, 8k render.",
            },
        ],
        "包装图 / 到手": [
            {
                title: "全套配件开箱清单",
                copy: "开箱即用 · 丰富完备",
                visual: "正俯拍极简开箱平铺，主机、高规格编织快充线、替换件、说明书在模切环保内衬中严丝合缝陈列。",
                prompt: "【画面主体与场景】数码产品俯视开箱平铺图，定制硬盒内衬，主机与全套编织配件整齐排列\n【图内排版文案】主标题：“全套配件开箱清单”，副文案：“开箱即用 · 丰富完备”，清单风排版\n【摄影图纸】Top-down orthographic unboxing flat lay photography of tech device. Rigid matte black box open showing main product snugly set in custom foam, flanked by braided cables and accessories. Clean studio lighting.",
            },
        ],
    },
    food: {
        "首图 / 主视觉": [
            {
                title: "食欲金黄原味主图",
                copy: "原产直采 · 鲜香醇美",
                visual: "45度俯视食欲黄金角度，粗陶或暖色原木托盘，主体占 38%，诱人自然光泽与新鲜切面，暖调柔光。",
                prompt: "【画面主体与场景】食品生鲜食欲主图，暖调背景，主体居中占 38%，45度黄金俯拍视角，呈现食物新鲜油润光泽与诱人质感，温润接触阴影\n【图内排版文案】主标题：“食欲金黄原味主图”，副文案：“原产直采 · 鲜香醇美”，诱人食欲排版\n【摄影图纸】Appetizing gourmet food commercial photography. Dish or packaged food product placed prominently in center taking 38% of frame on natural wooden board. 45-degree angle, appetizing glistening highlights, warm 3500K studio light, shallow depth of field f/2.8, pristine commercial food aesthetic.",
            },
        ],
        "场景图 / 使用": [
            {
                title: "暖心餐桌享用时刻",
                copy: "慢火烘焙 · 唤醒味蕾",
                visual: "温馨明亮的家庭厨房或餐桌置景，温暖晨光洒入，食物伴随腾腾热气升腾，人物手部自然取用，温馨松弛。",
                prompt: "【画面主体与场景】温馨餐桌享用生活场景，温润晨光洒入，热气升腾微距，人物手部自然取用食物，生活烟火气\n【图内排版文案】主标题：“暖心餐桌享用时刻”，副文案：“慢火烘焙 · 唤醒味蕾”，温暖生活感排版\n【摄影图纸】Cozy breakfast lifestyle dining scene, warm morning sunlight streaming through window. Subtle steam vapor rising from food, natural wood table setting, authentic relaxed morning atmosphere, 50mm lens f/2.0, heartwarming commercial lifestyle shot.",
            },
        ],
        "成分图 / 配料": [
            {
                title: "生态原产原料溯源",
                copy: "零添加剂 · 纯粹原味",
                visual: "纯净自然生境布景，周围环绕新鲜原产地有机原料切面、谷物麦穗或原果，呈现纯天然健康品质。",
                prompt: "【画面主体与场景】天然食材原料溯源图，原生态自然背景，主体周围环绕新鲜有机原料与纯净食材\n【图内排版文案】主标题：“生态原产原料溯源”，副文案：“零添加剂 · 纯粹原味”，有机生境排版\n【摄影图纸】Farm-to-table organic ingredient infographic layout. Fresh wholesome raw ingredients artistically arranged around food product on textured slate surface. Crisp morning daylight, pure clean food photography aesthetic.",
            },
        ],
        "细节图 / 材质": [
            {
                title: "饱满颗粒新鲜微距",
                copy: "纹理清晰 · 质感酥脆",
                visual: "微距镜头平视食材爆汁切面或酥脆纹理，自然诱人光泽与细腻微孔清晰可辨，食欲感拉满。",
                prompt: "【画面主体与场景】食物切面与微观纹理微距特写，平视焦距，展现诱人自然水润感与层次分明的结构\n【图内排版文案】主标题：“饱满颗粒新鲜微距”，副文案：“纹理清晰 · 质感酥脆”，微距食欲排版\n【摄影图纸】Macro culinary food photography. Extreme close-up shot capturing crisp texture, moisture glisten, and delicate crumb structure. Warm 3500K key light, shallow depth of field, irresistibly appetizing.",
            },
        ],
    },
    home: {
        "首图 / 主视觉": [
            {
                title: "现代极简空间主图",
                copy: "人体工学 · 悦享生活",
                visual: "米白纯净空间背景，家居产品居中展现全貌，3/4 视角呈现流畅曲线与天然材质纹理，自然接触阴影。",
                prompt: "【画面主体与场景】家居空间生活主图，米白极简背景，家居产品居中占 35%，3/4立体视角呈现人体工学曲线与真实木石棉麻触感\n【图内排版文案】主标题：“现代极简空间主图”，副文案：“人体工学 · 悦享生活”，高级空间排版\n【摄影图纸】Modern minimalist home furniture product packshot, clean off-white studio background. In center: home product taking 35% of frame with elegant ergonomic silhouette. Natural morning daylight, soft diffused shadows, authentic materials like oak wood and textured linen, high-end interior catalog aesthetic.",
            },
        ],
        "场景图 / 使用": [
            {
                title: "清晨漫射客厅置景",
                copy: "惬意相伴 · 舒适归家",
                visual: "真实比例现代客厅，大面积落地窗洒入清晨 5000K 漫射自然光，绿植点缀，呈现松弛舒适的生活动线。",
                prompt: "【画面主体与场景】真实客厅生活使用全景，清晨柔和窗光漫射，产品自然融入家庭陈设，温暖松弛\n【图内排版文案】主标题：“清晨漫射客厅置景”，副文案：“惬意相伴 · 舒适归家”，治愈生活排版\n【摄影图纸】Sun-drenched Scandinavian living room lifestyle scene. Furniture piece seamlessly placed in real interior space with indoor plants and warm hardwood floor. Soft morning 5000K daylight, peaceful relaxed mood, 35mm lens.",
            },
        ],
        "对比图 / 痛点": [
            {
                title: "空间收纳效能实测",
                copy: "告别杂乱 · 扩容倍增",
                visual: "1px 细线垂直分割，左侧呈现传统杂乱拥挤空间痛点，右侧呈现收纳后整洁通透扩容效果，右下角标明实用容量。",
                prompt: "【画面主体与场景】家居空间收纳对比图，垂直细线分割，左侧对比传统杂乱拥挤痛点，右侧展现使用后井然有序的高效收纳空间\n【图内排版文案】主标题：“空间收纳效能实测”，副文案：“告别杂乱 · 扩容倍增”，对比严谨排版\n【摄影图纸】Split-screen home interior comparison photography, vertical 1px dividing line. Left side shows cluttered messy room scenario, right side shows beautifully organized spacious tidy room with product in use. Clean architectural lighting, stark contrast.",
            },
        ],
        "细节图 / 材质": [
            {
                title: "天然木纹棉麻触感",
                copy: "天然用料 · 触手生温",
                visual: "85mm 微距特写，清晰展现实木山形纹理、棉麻面料粗粝编织感或五金滑轨顺滑倒角。",
                prompt: "【画面主体与场景】家居材质肌理微距特写，平视视角，展现天然原木山形纹理与棉麻织物温润质感\n【图内排版文案】主标题：“天然木纹棉麻触感”，副文案：“天然用料 · 触手生温”，工艺细节排版\n【摄影图纸】Macro texture photography of natural interior materials. Extreme close-up of natural oak wood grain and textured woven linen fabric. Soft diffused side lighting, tactile organic depth, clean editorial aesthetic.",
            },
        ],
    },
    beauty: {
        "首图 / 主视觉": [
            {
                title: "奢华影棚光采主图",
                copy: "深层修护 · 焕发光采",
                visual: "纯白底 #FFFFFF，瓶身居中占 38%，微仰视展示高透玻璃质感与金色泵头倒影，柔光箱漫射顶光，台面带 5% 真实物理接触阴影。",
                prompt: "【画面主体与场景】奢华美妆护肤品影棚主图，纯白底 #FFFFFF，瓶身居中占 38%，高透玻璃瓶与金属泵头高光，柔光箱漫射顶光，底部5%真实物理接触阴影\n【图内排版文案】主标题：“奢华影棚光采主图”，副文案：“深层修护 · 焕发光采”，高端专柜留白排版\n【摄影图纸】Luxury skincare cosmetic bottle packshot, pure white background #FFFFFF. Bottle standing upright in center taking 38% of frame, crystal clear glass reflection and frosted surface texture. Overhead softbox lighting, pristine contact shadow with 5% opacity underneath, clean commercial cosmetic photography, 85mm lens, 8k resolution.",
            },
        ],
        "成分图 / 配料": [
            {
                title: "核心精萃科学溯源",
                copy: "珍罕活性 · 科学实证",
                visual: "浅米色质感底 #F5F1E8，瓶身居中，纤细引线连接四周核心天然植物或玻色因原料切面，呈现科研级严谨高级感。",
                prompt: "【画面主体与场景】美妆核心成分科学解构图，浅米色极简底，中央瓶身四周引线标注珍稀活性原料，呈现科学严谨品质感\n【图内排版文案】主标题：“核心精萃科学溯源”，副文案：“珍罕活性 · 科学实证”，科研风高级排版\n【摄影图纸】Apple-style cosmetic ingredient infographic layout. In center: cosmetic product taking 25% of frame. Fine minimalist leader lines pointing outward to natural raw botanical ingredients. Clean off-white background #F5F1E8, soft diffused studio light, clinical luxury aesthetic.",
            },
        ],
        "细节图 / 材质": [
            {
                title: "水润凝露张力微距",
                copy: "轻盈透亮 · 一触即融",
                visual: "微距拍摄晶莹剔透的水珠或精华凝露表面张力，高光纯净通透，浅景深虚化，杜绝塑料油腻感。",
                prompt: "【画面主体与场景】护肤品质地微距特写，平视微距，呈现水润凝露的高透张力与柔嫩水光感\n【图内排版文案】主标题：“水润凝露张力微距”，副文案：“轻盈透亮 · 一触即融”，质感微距排版\n【摄影图纸】Extreme macro cosmetic texture photography. Crystal clear droplets and serum gel texture showing natural surface tension and refraction. Crisp 5500K softbox lighting, clean white background, pristine skin-feel aesthetic.",
            },
        ],
        "对比图 / 痛点": [
            {
                title: "28天实证修护对照",
                copy: "紧致充盈 · 抚褪干纹",
                visual: "1px 细线垂直中缝对比，左侧干燥暗沉对比右侧充盈饱满透亮肤质，底部注明合规受试周期。",
                prompt: "【画面主体与场景】临床功效对比图，中缝1px细线分割，清晰展现使用周期前后的水润光泽对比\n【图内排版文案】主标题：“28天实证修护对照”，副文案：“紧致充盈 · 抚褪干纹”，严谨实测排版\n【摄影图纸】Clinical proof comparison photography, vertical 1px dividing line. Close-up skin texture showing visible transformation from dull dry to radiant hydrated texture. Soft clinical ring light, highly credible commercial proof look.",
            },
        ],
    },
};

/**
 * 智能按品类获取对应模块的优质爆款模板（支持品类特化与通用降级）
 */
export function getDetailSetTemplate(purpose: string, category?: string, index = 0): DetailSetRowTemplate {
    const cleanCat = (category || "").toLowerCase().trim();
    if (cleanCat && DETAIL_SET_CATEGORY_TEMPLATES[cleanCat]) {
        const catModuleTemplates = DETAIL_SET_CATEGORY_TEMPLATES[cleanCat][purpose];
        if (catModuleTemplates && catModuleTemplates.length > 0) {
            return catModuleTemplates[index % catModuleTemplates.length];
        }
    }
    const generalTemplates = DETAIL_SET_ROW_TEMPLATES[purpose] ?? [];
    if (generalTemplates.length > 0) {
        return generalTemplates[index % generalTemplates.length];
    }
    return {
        title: "商业品质展示",
        copy: "品质严选 · 尽在细节",
        visual: "纯净商业摄影背景，主体居中，专业布光与真实物理阴影",
        prompt: `【画面主体与场景】商品商业摄影，纯净背景，居中构图，专业影棚柔光\n【图内排版文案】主标题：“商业品质展示”，副文案：“品质严选 · 尽在细节”，留白排版\n【摄影图纸】Commercial studio product photography of product, ${purpose}, 85mm lens, f/2.8, crisp studio lighting, 8k resolution.`,
    };
}

/** 五大品类动态刚性管线知识库（动态自适应驱动，非固定屏数流） */
export type CategoryPipelineSpec = {
    category: string;
    label: string;
    lightingAndOptics: string;
    englishOptics: string;
    rigidRules: string[];
    compositionKeywords: string[];
};

export const DETAIL_SET_CATEGORY_PIPELINES: Record<string, CategoryPipelineSpec> = {
    beauty: {
        category: "beauty",
        label: "美妆护肤",
        lightingAndOptics: "柔光箱漫反射顶光，高透玻璃与磨砂反光，微距膏体/凝露流动质感，自然接触阴影5%，杜绝塑料油腻感",
        englishOptics: "soft 5500K overhead softbox lighting, gentle rim light, commercial cosmetic macro photography, natural contact shadow 5% opacity, subtle light refraction, high-end skincare aesthetic",
        rigidRules: [
            "必须包含 5% opacity contact shadow 物理接触阴影",
            "质地特写强调表面张力与微距流动感，杜绝塑料油腻假质感",
            "成分解析采用 Apple 风纤细引线解构，浅米色 #F5F1E8 纸质底",
        ],
        compositionKeywords: ["frosted glass", "dewdrop", "macro texture", "apple-style infographic", "5500K morning light"],
    },
    fashion: {
        category: "fashion",
        label: "服饰鞋包",
        lightingAndOptics: "商业摄影柔和轮廓光，自然光漫射，清晰织物经纬与皮革微距纹理，立体垂坠褶皱",
        englishOptics: "commercial fashion studio lighting, soft rim light, clean background, 85mm lens, natural fabric drape and weave texture, authentic high-end apparel photography",
        rigidRules: [
            "全套模特五官面貌、发型、肤色、身材比例必须 100% 跨图锁死一致",
            "服装版型线条与色号严格保真，严禁身体与面料穿模畸变",
            "细节微距展现车缝线、纽扣五金或面料纤维质感",
        ],
        compositionKeywords: ["fashion editorial", "full body walk", "fabric texture macro", "clean studio backdrop", "natural drape"],
    },
    food: {
        category: "food",
        label: "食品生鲜",
        lightingAndOptics: "45度食欲黄金侧顶光，暖色温 3200K-4000K，食物新鲜诱人水润油光与微距水珠，温热热气升腾",
        englishOptics: "45-degree appetizing golden top-side lighting, 3500K warm studio light, macro food photography, fresh glistening highlights, subtle steam vapor, rustic natural ceramic and wood styling",
        rigidRules: [
            "严禁编造虚假营养数值，配料与规格真实锁死",
            "食物必须呈现诱人天然光泽与新鲜切面，杜绝发黑暗沉或塑料感",
            "原料图强调有机生境与纯净原产地",
        ],
        compositionKeywords: ["appetizing warm light", "golden glaze", "fresh steam vapor", "macro cross-section", "farm origin"],
    },
    digital: {
        category: "digital",
        label: "数码 3C",
        lightingAndOptics: "冷调科技轮廓光，深冷高级背景（#111113 或 #F0F2F5），阳极氧化铝磨砂高光与倒角精密微距",
        englishOptics: "futuristic tech studio lighting, clean cold rim light, CNC anodized aluminum chamfer highlights, 3D exploded engineering blueprint, precision commercial product render",
        rigidRules: [
            "物理按键与接口严格对齐，严禁几何形变或增生多余杂乱接口",
            "内部结构采用 3D 轴线精密悬浮爆炸图展现核心芯片与均热模块",
            "桌面场景强调极简精英 EDC 生态搭配",
        ],
        compositionKeywords: ["3D exploded view", "CNC chamfer", "anodized aluminum", "minimal desk EDC", "cold tech lighting"],
    },
    home: {
        category: "home",
        label: "家居生活",
        lightingAndOptics: "5000K 清晨漫射自然窗光，温暖自然木石与棉麻触感，真实户型比例与生活松弛感",
        englishOptics: "warm 5000K morning window diffused daylight, natural shadows, soft linen and wood grain textures, authentic architectural proportions, cozy modern lifestyle photography",
        rigidRules: [
            "家具与生活空间必须严格符合真实人体工程学尺度，严禁空间畸变",
            "对比图强化使用前杂乱与使用后整洁有序的空间利用反差",
            "材质特写强调天然实木纹理与棉麻天然亲肤透气感",
        ],
        compositionKeywords: ["cozy morning sunlight", "linen fabric texture", "wood grain macro", "organized living room", "natural home aesthetic"],
    },
};

/** 400+ 电商静态超级爆款配方库目录分类 */
export const DETAIL_SET_RECIPE_GENRES = [
    { id: "studio_mastery", name: "顶级影棚与工艺美学", desc: "纯白底38%、转台微距、清单开箱、3D轴线爆炸图等影棚大片" },
    { id: "scientific_biotech", name: "科学硬核解构与生境", desc: "Apple极简引线、实验室生境、原料溯源与微囊深层渗透" },
    { id: "clinical_proof", name: "临床实证与极限测评", desc: "1px中缝临床对比、破坏性抗摔防水实测、仪器数据图表留白" },
    { id: "lifestyle_immersion", name: "生活美学与沉浸代入", desc: "5500K晨光浴室、治愈暖光夜间静修、都市精英通勤EDC" },
    { id: "gifting_festive", name: "礼赠仪式与节日大促", desc: "香槟丝缎礼盒、国潮朱红金箔、临门大促下沉强转化CTA" },
    { id: "spec_whitepaper", name: "多规格与技术白皮书", desc: "横向多SKU矩阵排列、官方白皮书高宽标注、清单所见即所得" },
] as const;
// @opc-feature: detail_set_workflow [end]
