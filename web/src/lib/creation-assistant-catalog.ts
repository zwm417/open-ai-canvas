export type CreationAssistantScriptType =
    | "smart"
    // 电商与商业转化类
    | "promotional_conversion"
    | "livestream_pitch"
    | "qianchuan"
    | "pain_point"
    | "selling_hook"
    | "lifestyle"
    | "object_pov"
    // 本地生活探店类
    | "store_discovery"
    | "store_visit"
    | "signature_experience"
    | "group_buying"
    // 剧情短剧类
    | "story"
    | "dialogue_skit"
    | "twist_skit"
    | "suspense_skit"
    | "emotional_clip"
    | "product_placement";

export type CreationAssistantShootingStyle = "smart" | "unboxing_tabletop" | "talking_head" | "one_take" | "follow_shot" | "brand_awareness" | "street_interview";
export type CreationAssistantPlatform = "douyin" | "kuaishou" | "xiaohongshu" | "channels" | "tiktok_shop" | "instagram_reels" | "youtube_shorts";

export type CreationAssistantOption<T extends string> = {
    id: T;
    label: string;
    rule: string;
    desc?: string;
    badge?: string;
};

export const CREATION_ASSISTANT_SCRIPT_TYPES: readonly CreationAssistantOption<CreationAssistantScriptType>[] = [
    {
        id: "smart",
        label: "智能匹配",
        desc: "大模型综合素材形态、人物关系与卖点评分自动选择最优叙事",
        badge: "推荐",
        rule: "根据素材内容、商业洞察、业务场景、平台和目标时长选择最合适的叙事结构，不单独返回匹配标签。当上传文件有人物资产时必须优先围绕人物结合商品洞察进行剧情故事脚本设计；当上传多个人物资产时必须优先围绕人物关系再结合商品洞察进行剧情故事脚本设计。",
    },
    // 电商与带货转化
    {
        id: "promotional_conversion",
        label: "促销转化",
        desc: "放大优惠力度与限时特惠，直观对比推动立即下单/核销",
        badge: "爆款转化",
        rule: "放大优惠，推动立即下单/核销。结构要求：优惠揭示 → 价值锚定 → 限时/限量 → 立即行动。突出原价与优惠对比，行动指令简单直接。",
    },
    {
        id: "livestream_pitch",
        label: "口播带货",
        desc: "真人对镜真诚自用推荐，强化人设真实感与购买理由",
        rule: "真人推荐，建立购买信任。结构要求：人设建立 → 核心卖点 → 信任证据 → 自然行动。眼神直视镜头，用自用回购口吻建立信任。",
    },
    {
        id: "qianchuan",
        label: "千川带货",
        desc: "多维客观数据对比评测，建立理性选购判断与决策依据",
        rule: "强化开场留存、核心卖点密度、购买理由和合规行动引导，不虚构价格、优惠或效果。结构要求：提出问题 → 多方对比 → 数据/效果说话 → 推荐最优。",
    },
    {
        id: "pain_point",
        label: "痛点种草",
        desc: "精准直击现实困扰痛点，自然引入商品/服务消除焦虑",
        rule: "具体痛点场景 → 对象自然进入场景 → 体验或证据 → 价值确认与自然收束。痛点场景足够具象，产品在痛点最强时作为解决过程自然进入。",
    },
    {
        id: "selling_hook",
        label: "卖点钩子",
        desc: "立反常识 flag 制造悬念，意外反转打脸突出核心卖点",
        rule: "立 flag / 制造预期 → 加固预期 → 反转打脸 → 商品成为反转原因 → 自然认可。前3秒立观众会信的flag，反转与核心卖点深度绑定。",
    },
    {
        id: "lifestyle",
        label: "生活实拍",
        desc: "高代入感生活工作日常纪实，自然呈现使用或到店体验",
        rule: "真实生活、工作或到店场景 → 自然使用或体验 → 价值变化 → 分享或行动。vlog式的真实叙述，好东西忍不住分享的自然口吻。",
    },
    {
        id: "object_pov",
        label: "物品拟人",
        desc: "商品第一人称拟人自述，反差萌自嘲吸睛亮出独家绝活",
        rule: "让商品或关键物品以第一人称承担叙事视角，通过自述、动作和与环境的互动表达对象价值，保持物品身份、外观和核心特征稳定。",
    },
    // 本地生活探店专属
    {
        id: "store_discovery",
        label: "门店发现",
        desc: "聚焦门头设计、空间氛围与环境特色，制造打卡理由",
        badge: "探店必选",
        rule: "特色捕捉 → 空间/环境展示 → 价值提炼 → 自然行动。聚焦门头设计、空间氛围、环境动线、独家体验；用镜头带观众逛游一遍。",
    },
    {
        id: "store_visit",
        label: "到店实录",
        desc: "沉浸式探店全过程，还原偶发细节建立真实消费信任",
        rule: "真实体验全过程，建立消费信任。到店动作 → 完整体验流 → 真实反应 → 自然分享。减少摆拍痕迹，用偶发细节建立信任。",
    },
    {
        id: "signature_experience",
        label: "招牌体验",
        desc: "深度特写招牌菜品或核心王牌服务，证明绝对核心价值",
        rule: "聚焦招牌产品/特色服务，证明核心价值。聚焦招牌 → 深度展示 → 体验高潮 → 价值确认。招牌产品或服务占画面70%以上。",
    },
    {
        id: "group_buying",
        label: "同城团购",
        desc: "套餐性价比直观对比，打消消费顾虑指引到店核销",
        badge: "团购引流",
        rule: "突出优惠力度，推动到店核销。优惠展示 → 价值对比 → 信任建立 → 核销指引。团购套餐清晰展示，直观对比原价与团购价。",
    },
    // 剧情短剧通用与细分
    {
        id: "story",
        label: "剧情故事",
        desc: "经典戏剧冲突与人际张力，由 AI 自主轮换剧情子剧种",
        rule: "人物或场所设定 → 需求或冲突 → 对象成为解决关键 → 结果与行动。角色关系自带冲突张力，剧情有爽感反转。",
    },
    {
        id: "dialogue_skit",
        label: "对话短剧",
        desc: "双人或多人生动对话驱动剧情，在日常互动中带出卖点",
        rule: "人物对话驱动剧情，展现关系与冲突。同事/室友/朋友对话引出生活困扰或去哪吃玩，被安利后决定前往或使用。",
    },
    {
        id: "twist_skit",
        label: "反转短剧",
        desc: "强烈预期与意料之外的转折打脸，形成高记忆点爽感",
        badge: "高完播率",
        rule: "建立预期 → 关键反转 → 记忆点。A质疑B的选择/判断，B用产品/服务让A当场改观或颠覆认知。",
    },
    {
        id: "suspense_skit",
        label: "悬念短剧",
        desc: "从开头设下好奇悬念谜团，抽丝剥茧最终揭晓真相答案",
        rule: "设钩子 → 铺垫 → 揭晓谜底。以为什么每天在状态或凭什么这么火设疑问，产品或招牌服务就是答案。",
    },
    {
        id: "emotional_clip",
        label: "情绪短片",
        desc: "感官治愈与温情共鸣，抚平低落情绪触动深层心智",
        rule: "情绪共鸣，真实情感打动观众。疲惫低气压被感官体验、环境氛围或一口食物抚平治愈，产生温暖向往。",
    },
    {
        id: "product_placement",
        label: "产品植入",
        desc: "自然推进的生活短剧中，产品或服务作为关键道具出镜",
        rule: "产品作为道具自然推进剧情。生活场景或到店体验过程中自然顺带出现，不经意间体现便捷与惊喜功效。",
    },
];

export type ScriptTypeGroup = {
    key: string;
    title: string;
    description?: string;
    items: CreationAssistantOption<CreationAssistantScriptType>[];
};

export function getCreationAssistantScriptTypeGroups(scenario: "ecommerce" | "local_life"): ScriptTypeGroup[] {
    const dramaKeys: CreationAssistantScriptType[] = [
        "story",
        "dialogue_skit",
        "twist_skit",
        "suspense_skit",
        "emotional_clip",
        "product_placement",
    ];
    const dramaItems = dramaKeys.map(findCreationAssistantScriptType);

    if (scenario === "ecommerce") {
        const conversionKeys: CreationAssistantScriptType[] = [
            "promotional_conversion",
            "livestream_pitch",
            "qianchuan",
            "pain_point",
            "selling_hook",
            "lifestyle",
            "object_pov",
        ];
        return [
            {
                key: "conversion",
                title: "电商带货与商业转化",
                description: "聚焦实物卖点、达人口播、价格大促与理性评测",
                items: conversionKeys.map(findCreationAssistantScriptType),
            },
            {
                key: "drama",
                title: "创意短剧与叙事",
                description: "借助人物冲突、剧情反转与情绪共鸣实现自然种草",
                items: dramaItems,
            },
        ];
    } else {
        const storeKeys: CreationAssistantScriptType[] = [
            "store_discovery",
            "store_visit",
            "signature_experience",
            "group_buying",
        ];
        const conversionKeys: CreationAssistantScriptType[] = [
            "promotional_conversion",
            "pain_point",
            "lifestyle",
            "selling_hook",
            "livestream_pitch",
        ];
        return [
            {
                key: "store",
                title: "门店探店与特色",
                description: "聚焦实体店空间动线、招牌菜品/服务与沉浸式体验",
                items: storeKeys.map(findCreationAssistantScriptType),
            },
            {
                key: "conversion",
                title: "同城转化与生活实拍",
                description: "同城团购大促、周末去哪痛点解决与日常打卡",
                items: conversionKeys.map(findCreationAssistantScriptType),
            },
            {
                key: "drama",
                title: "创意短剧与叙事",
                description: "同城社交、情侣/搭子探店反转与戏剧剧情",
                items: dramaItems,
            },
        ];
    }
}

export function isScriptTypeValidForScenario(scriptType: CreationAssistantScriptType, scenario: "ecommerce" | "local_life"): boolean {
    if (scriptType === "smart") return true;
    const groups = getCreationAssistantScriptTypeGroups(scenario);
    return groups.some((group) => group.items.some((item) => item.id === scriptType));
}

export const CREATION_ASSISTANT_SHOOTING_STYLES: readonly CreationAssistantOption<CreationAssistantShootingStyle>[] = [
    { id: "smart", label: "智能匹配", rule: "根据素材、脚本类型、业务场景、平台和模型能力选择最合适的拍摄组织方式。" },
    { id: "unboxing_tabletop", label: "开箱桌拍", rule: "以桌面、开箱、细节、操作和对象特写组织画面，保持材质、包装和文字稳定。" },
    { id: "talking_head", label: "达人口播", rule: "以人物正面对镜讲解为主，穿插对象细节和证据镜头；人物外观、声音和出镜边界服从用户配置。" },
    { id: "one_take", label: "一镜到底", rule: "优先保持连续镜头，动作、焦点和空间衔接清楚，避免无依据的跳切和场景突变。" },
    { id: "follow_shot", label: "运动跟拍", rule: "镜头平稳跟随人物、对象或使用过程移动，保持主体清晰并让场景关系连续。" },
    { id: "brand_awareness", label: "品牌认知", rule: "强调品牌、商品、服务或场所的识别特征、定位、信任依据和一致的视觉记忆。" },
    { id: "street_interview", label: "街头采访", rule: "以主持人与用户或路人的问答建立现场感，反馈必须来自素材、用户资料或明确的创作设定。" },
];

export const CREATION_ASSISTANT_DURATION_PRESETS = [15, 30, 60, 90, 120, 180] as const;

export const CREATION_ASSISTANT_PLATFORMS: readonly CreationAssistantOption<CreationAssistantPlatform>[] = [
    { id: "douyin", label: "抖音", rule: "快速建立观看理由，前 3 秒用视觉、问题、反差或场景钩子截停观看；中段持续提供画面或信息变化，结尾使用有依据的评论、收藏、点击或购买引导。" },
    { id: "kuaishou", label: "快手", rule: "从真实日常进入，使用接地气且可信的表达，重点讲清实际使用、体验和性价比；突出自用、回购和信任感，不虚构低价、赠品或限时条件。" },
    { id: "xiaohongshu", label: "小红书", rule: "强调真实分享、审美细节、教程感和可收藏信息；突出体验过程、对比依据和使用方法，减少生硬的价格逼单。" },
    { id: "channels", label: "视频号", rule: "强调信任、实用价值和真实表达，开头说明内容与用户的关系；照顾家庭、熟人和中长内容观看场景，提供适合转发给朋友、家人或同事的价值。" },
    { id: "tiktok_shop", label: "TikTok Shop", rule: "使用目标市场的自然语言，保持短时钩子、连续利益点、清晰商品信息和明确 CTA；只有在素材或用户资料支持时使用 Review、Before/After、Unboxing 或 How-to，功效、价格、折扣和评价不得虚构。" },
    { id: "instagram_reels", label: "Instagram Reels", rule: "以前段视觉吸引、短时叙事、循环观看和分享保存为重点；画面保持竖屏安全区域，文字避开界面遮挡，设计自然回环结尾，音乐只使用有授权或用户提供的素材。" },
    { id: "youtube_shorts", label: "YouTube Shorts", rule: "突出前段留存、主题关键词、连续观看和订阅互动；标题、画面和旁白自然包含核心主题词，结尾可引导订阅或评论但不虚构平台表现。" },
];

export function findCreationAssistantScriptType(id: CreationAssistantScriptType) {
    return CREATION_ASSISTANT_SCRIPT_TYPES.find((item) => item.id === id)!;
}

export function findCreationAssistantShootingStyle(id: CreationAssistantShootingStyle) {
    return CREATION_ASSISTANT_SHOOTING_STYLES.find((item) => item.id === id)!;
}

export function findCreationAssistantPlatform(id: CreationAssistantPlatform) {
    return CREATION_ASSISTANT_PLATFORMS.find((item) => item.id === id)!;
}
