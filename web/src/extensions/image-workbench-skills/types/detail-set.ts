// @opc-feature: detail_set_workflow [start]
// 电商套图工作流卡片 —— 类型与常量层
// 设计来源：docs/detail-set-workflow-card-plan.md（da-ai 模块交互 × motu 手机预览 × clipforge 风格配方/商品一致性）

/** 12 大模块（模块枚举即提示词规划的 module_purpose 契约，顺序即详情页叙事顺序） */
export const DETAIL_SET_MODULES = [
    { purpose: "首图 / 主视觉", short: "首图", desc: "详情页第一屏主视觉，决定点击与停留" },
    { purpose: "场景图 / 使用", short: "场景图", desc: "真实使用环境与人群代入" },
    { purpose: "卖点图 / 功效", short: "卖点图", desc: "核心卖点可视化，信息层级清晰" },
    { purpose: "细节图 / 材质", short: "细节图", desc: "微距质感与做工细节特写" },
    { purpose: "包装图 / 到手", short: "包装图", desc: "外包装、配件清单与开箱到手感" },
    { purpose: "收尾图 / CTA", short: "收尾图", desc: "品牌收口与行动号召氛围" },
    { purpose: "成分图 / 配料", short: "成分图", desc: "成分原料实物与品质感呈现" },
    { purpose: "结构图 / 功能", short: "结构图", desc: "剖面/分层功能结构示意" },
    { purpose: "对比图 / 痛点", short: "对比图", desc: "痛点场景与使用后改善对比" },
    { purpose: "规格图 / 参数", short: "规格图", desc: "规格参数信息图" },
    { purpose: "信任图 / 资质", short: "信任图", desc: "资质认证与品牌信任背书" },
    { purpose: "送礼图 / 场景", short: "送礼图", desc: "礼赠场景与仪式感" },
] as const;

export type DetailSetModulePurpose = (typeof DETAIL_SET_MODULES)[number]["purpose"];

export const DETAIL_SET_MODULE_SHORT: Record<string, string> = Object.fromEntries(
    DETAIL_SET_MODULES.map((m) => [m.purpose, m.short]),
);

export const detailSetModuleShort = (purpose: string): string => DETAIL_SET_MODULE_SHORT[purpose] ?? purpose;

/** 单模块数量上限与单批总张数上限（与生图工作台 generationCount 上限 15 对齐） */
export const MAX_IMAGE_WORKBENCH_BATCH_COUNT = 15;
export const DETAIL_SET_MODULE_MAX_COUNT = 6;
export const DETAIL_SET_TOTAL_MAX_COUNT = 15;

/** 默认模块选择（对齐 da-ai：首图×2、场景×2、卖点×1、细节×1） */
export const DETAIL_SET_DEFAULT_SELECTIONS: Record<string, number> = {
    "首图 / 主视觉": 2,
    "场景图 / 使用": 2,
    "卖点图 / 功效": 1,
    "细节图 / 材质": 1,
};

/** 画幅比例 → 像素分辨率（后端 size 字段直用） */
export const DETAIL_SET_RATIO_RESOLUTION: Record<string, string> = {
    "1:1": "1024x1024",
    "3:4": "1024x1360",
    "4:5": "1024x1280",
    "9:16": "1024x1824",
    "16:9": "1824x1024",
    "4:3": "1360x1024",
};

export const DETAIL_SET_RATIO_OPTIONS = ["4:5", "1:1", "3:4", "16:9", "4:3", "9:16"] as const;

/** 图片语言（output_language 契约：none=无文案，add_text=false 时后端语义为 unrestricted） */
export const DETAIL_SET_LANGUAGE_OPTIONS = [
    { value: "zh", label: "中文" },
    { value: "en", label: "英文" },
    { value: "ja", label: "日本" },
    { value: "ko", label: "韩国" },
    { value: "de", label: "德国" },
    { value: "fr", label: "法国" },
    { value: "es", label: "西班牙" },
    { value: "ru", label: "俄罗斯" },
    { value: "it", label: "意大利" },
    { value: "th", label: "泰国" },
    { value: "vi", label: "越南" },
    { value: "id", label: "印尼" },
    { value: "ms", label: "马来西亚" },
    { value: "pt-BR", label: "巴西" },
    { value: "ar", label: "阿拉伯" },
    { value: "unrestricted", label: "不限" },
] as const;

export const DETAIL_SET_LANGUAGE_LABEL: Record<string, string> = {
    zh: "中文",
    en: "英文",
    ja: "日本",
    ko: "韩国",
    de: "德国",
    fr: "法国",
    es: "西班牙",
    ru: "俄罗斯",
    it: "意大利",
    th: "泰国",
    vi: "越南",
    id: "印尼",
    ms: "马来西亚",
    "pt-BR": "巴西",
    ar: "阿拉伯",
    unrestricted: "不限",
};

/** 套图风格（da-ai 配方 × motu 内置风格 × clipforge 分组三方合并，极简命名） */
export type DetailSetStylePreset = {
    id: string;
    emoji: string;
    name: string;
    look: string;
    moduleHints: Partial<Record<string, string>>;
    goodFor: string[];
};

export const DETAIL_SET_STYLE_PRESETS: DetailSetStylePreset[] = [
    { id: "studio_premium", emoji: "💎", name: "高级影棚", look: "高级影棚布光，柔和顶光与轮廓光，米色大理石台面，浅景深商业摄影质感", moduleHints: { "首图 / 主视觉": "商品居中悬浮构图，背景留出主标题安全区", "细节图 / 材质": "微距视角，光泽与纹理锐利" }, goodFor: ["beauty", "digital", "home"] },
    { id: "fresh_lifestyle", emoji: "🌿", name: "清新生活", look: "清晨自然光，居家窗边场景，白色与原木色调，空气感通透", moduleHints: { "场景图 / 使用": "真实生活动线，人物手部出镜自然" }, goodFor: ["home", "beauty", "food"] },
    { id: "minimal_nordic", emoji: "⬜", name: "极简北欧", look: "极简构图，大面积留白，高级灰与纯白背景，冷调均匀光", moduleHints: {}, goodFor: ["digital", "home"] },
    { id: "chinese_heritage", emoji: "🏮", name: "国潮传承", look: "国潮插画质感，朱红与鎏金配色，祥云纹样背景，商品保持实拍质感", moduleHints: {}, goodFor: ["food", "beauty"] },
    { id: "food_health", emoji: "🍜", name: "食品食养", look: "暖调侧逆光，热气与油光质感，食材新鲜切面微距，食欲感拉满", moduleHints: { "卖点图 / 功效": "食材原料环绕商品构图" }, goodFor: ["food"] },
    { id: "data_review", emoji: "📊", name: "数据测评", look: "实验室测评台场景，冷白光，量杯仪器道具辅助，干净理性", moduleHints: { "对比图 / 痛点": "左右分栏对比构图，标注箭头", "卖点图 / 功效": "数据指标视觉化，数字醒目" }, goodFor: ["beauty", "digital", "home"] },
    { id: "unbox_warm", emoji: "🎁", name: "开箱到手", look: "开箱俯拍视角，丝带礼盒质感，暖调室内光，仪式感构图", moduleHints: { "包装图 / 到手": "全套配件平铺清单式构图" }, goodFor: ["beauty", "food", "fashion"] },
    { id: "festival_promo", emoji: "🧨", name: "节日大促", look: "红金促销氛围，礼盒彩带与光斑，热闹但不杂乱，主体突出", moduleHints: {}, goodFor: ["food", "beauty", "fashion"] },
    { id: "outdoor_sport", emoji: "🏔️", name: "户外运动", look: "户外自然场景，清晨或黄昏动感光，功能使用环境呈现", moduleHints: {}, goodFor: ["digital", "fashion"] },
    { id: "kids_warm", emoji: "🧸", name: "童趣暖调", look: "奶油色调，毛绒道具与积木点缀，柔和顶光，安全温馨氛围", moduleHints: {}, goodFor: ["home", "food"] },
    { id: "generic_clean", emoji: "▢", name: "通用简洁", look: "干净通用电商视觉，白底浅灰背景，均匀柔光，主体突出", moduleHints: {}, goodFor: ["beauty", "food", "home", "digital", "fashion"] },
    { id: "conversion_focus", emoji: "🎯", name: "转化导向", look: "强对比高饱和商业视觉，卖点标签醒目，促销氛围克制不打架", moduleHints: { "卖点图 / 功效": "卖点大字排版位醒目", "收尾图 / CTA": "行动号召按钮区预留" }, goodFor: ["beauty", "food", "home", "digital", "fashion"] },
    { id: "tech_style", emoji: "⚡", name: "未来科技", look: "深色科技背景，蓝紫冷调光效，金属质感与光线条，未来感构图", moduleHints: { "结构图 / 功能": "透视剖面与发光标注线" }, goodFor: ["digital"] },
    { id: "luxury_style", emoji: "👑", name: "奢华高端", look: "深色丝绒与金属质感，戏剧性聚光，珠宝级布光，克制的高级感", moduleHints: {}, goodFor: ["beauty", "fashion"] },
];

/** 模块缩略图（本地资产 public/images/skills/detail-set/，AGENTS.md 4.4 本地优先） */
export const DETAIL_SET_MODULE_THUMBNAILS: Record<string, string> = {
    "首图 / 主视觉": "/images/skills/detail-set/primary-visual.jpg",
    "场景图 / 使用": "/images/skills/detail-set/usage-scene.jpg",
    "卖点图 / 功效": "/images/skills/detail-set/benefit-highlight.jpg",
    "细节图 / 材质": "/images/skills/detail-set/material-detail.jpg",
    "包装图 / 到手": "/images/skills/detail-set/package-unboxing.jpg",
    "收尾图 / CTA": "/images/skills/detail-set/closing-cta.jpg",
    "成分图 / 配料": "/images/skills/detail-set/ingredient-formula.jpg",
    "结构图 / 功能": "/images/skills/detail-set/functional-structure.jpg",
    "对比图 / 痛点": "/images/skills/detail-set/pain-point-comparison.jpg",
    "规格图 / 参数": "/images/skills/detail-set/spec.svg",
    "信任图 / 资质": "/images/skills/detail-set/trust.svg",
    "送礼图 / 场景": "/images/skills/detail-set/gift.svg",
};

/** 5 大核心品类动态管线定义与自适应标签 */
export const DETAIL_SET_CATEGORIES = [
    { id: "auto", name: "智能识别", desc: "基于上传图片与素材标签智能辨析真实品类" },
    { id: "fashion", name: "服饰鞋包", desc: "男女装/运动跑鞋/箱包/内衣/配饰穿搭" },
    { id: "digital", name: "数码3C", desc: "耳机/手机配件/数码/智能穿戴/办公EDC" },
    { id: "food", name: "食品生鲜", desc: "茶叶/零食/新鲜水果/滋补/冲饮冲泡" },
    { id: "home", name: "家居生活", desc: "家纺/日用厨具/收纳/灯饰/小家电" },
    { id: "beauty", name: "美妆个护", desc: "护肤/彩妆/洗发护发/香氛身体" },
] as const;

export type DetailSetCategory = (typeof DETAIL_SET_CATEGORIES)[number]["id"];

/** 商品分析结果（阶段 1 vision 输出，供手机预览与规划上下文复用） */
export type DetailSetProductAnalysis = {
    productName?: string;
    category?: string;
    sellingPoints?: string[];
    targetAudience?: string;
    usageScenarios?: string[];
    painPoints?: string[];
};

/** 规划行（一行 = 一张图，finalPrompt 为逐行可编辑的最终生图提示词） */
export type DetailSetRowStatus = "planned" | "pending" | "success" | "failed";

export type DetailSetRow = {
    seq: number;
    modulePurpose: string;
    title?: string;
    copy?: string;
    visualDescription?: string;
    finalPrompt: string;
    aspectRatio: string;
    status: DetailSetRowStatus;
    imageUrl?: string;
    storageKey?: string;
    taskId?: string;
    error?: string;
    isEdited?: boolean;
    canRecoverMedia?: boolean;
};

/** 套图规划快照（随 GenerationLog.detailSet 持久化，刷新/跨路由可恢复） */
export type DetailSetPlanSnapshot = {
    planId: string;
    createdAt: number;
    productName: string;
    category?: string;
    price: string;
    stylePresetId?: string;
    extraInstruction: string;
    config: {
        addText: boolean;
        outputLanguage: string;
        aspectRatio: string;
        resolution: string;
        outputFormat: string;
        productSafe: boolean;
    };
    analysis?: DetailSetProductAnalysis;
    rows: DetailSetRow[];
};

/** 创作表单草稿（模块选择/风格/补充说明等，工作流卡片内态） */
export type DetailSetDraft = {
    selections: Record<string, number>;
    productSafe: boolean;
    stylePresetId: string | null;
    outputLanguage: string;
    extraInstruction: string;
    productName?: string;
    productNameSource?: "auto" | "manual";
    category?: string;
    keySellingPoints?: string;
};

export const detailSetTotalCount = (selections: Record<string, number>): number =>
    Object.values(selections).reduce((acc, n) => acc + (n > 0 ? n : 0), 0);
// @opc-feature: detail_set_workflow [end]
