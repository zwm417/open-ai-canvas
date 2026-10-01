export type VideoSkillDirection = {
    id: string;
    name: string;
    commercialProblem: string;
    audienceRelation: string;
    coreDrive: string;
    commercialPositioning: string;
    creativeTaboo: string;
};

export const VIDEO_SKILL_DIRECTIONS: Record<string, VideoSkillDirection> = {
    "livestream-pitch": {
        id: "livestream-pitch",
        name: "口播带货",
        commercialProblem: "如何打消观众对“付费商单推销”的天然戒备，建立真实可信的自用信任？",
        audienceRelation: "熟人或朋友间的真诚自用分享，平视交流，零距离感，不搞居高临下的说教。",
        coreDrive: "生活化的真实微表情、自然真挚的自用细节与直视镜头的眼神可信度。",
        commercialPositioning: "出镜人物在生活/工作中真实自用、确实改善了体验的常备好物。",
        creativeTaboo: "切忌照本宣科念产品说明书，切忌夸张失真的表演感与浮夸假笑。",
    },
    "promotional-conversion": {
        id: "promotional-conversion",
        name: "促销转化",
        commercialProblem: "为什么观众必须今天现在做决定，而不是“改天再看”？",
        audienceRelation: "替观众精打细算、生怕大家错过重磅福利的省钱情报官。",
        coreDrive: "日常原价与限时机制的鲜明反差，以及时机稍纵即逝的真实紧迫感。",
        commercialPositioning: "高价值但价格机制被彻底打穿的超值机会，作为最终行动答案压轴出现。",
        creativeTaboo: "切忌空喊口号而无清晰利益对比，切忌信息模糊让观众算不明白账。",
    },
    "scene-seeding": {
        id: "scene-seeding",
        name: "场景种草",
        commercialProblem: "这个商品究竟在什么具体生活瞬间，能让观众过得更轻松、更有质感？",
        audienceRelation: "懂生活情调的同行者，引领观众共鸣某种具象的生活切片。",
        coreDrive: "极度贴近真实日常的生活切片、可感知的感官体验与场景爽感。",
        commercialPositioning: "自然融入特定生活时段（如早起、通勤、独处、夜间）的体验升华道具。",
        creativeTaboo: "切忌脱离普通人生活常识悬浮摆拍，切忌把生活场景拍成冷冰冰的商品展台。",
    },
    "pain-point-solve": {
        id: "pain-point-solve",
        name: "痛点解决",
        commercialProblem: "日常中这个让人糟心烦躁的小难题，到底有没有不用费事就能彻底搞定的办法？",
        audienceRelation: "懂你委屈与无奈的过来人，递上立竿见影的解脱方案。",
        coreDrive: "被现实烦恼扎心的共鸣瞬间，与问题被轻松化解后的强烈舒爽反差。",
        commercialPositioning: "在烦恼情绪达到顶峰时，作为合理、自然的化解方案切入。",
        creativeTaboo: "切忌痛点不痛、隔靴搔痒，切忌商品登场突兀且夸大不可思议的奇效。",
    },
    "feature-demo": {
        id: "feature-demo",
        name: "功能演示",
        commercialProblem: "口说无凭，这件商品的核心硬实力到底能不能经受住肉眼可见的检验？",
        audienceRelation: "客观求真的硬核体验官，带观众近距离验看事实。",
        coreDrive: "肉眼可见的直观对比测试、微距工艺特写与不言自明的物理事实呈现。",
        commercialPositioning: "经受住严苛检验的硬核主角，用细节与事实为自己代言。",
        creativeTaboo: "切忌用抽象形容词代替视觉事实，切忌镜头跳跃让人对真实性产生怀疑。",
    },
    "selling-hook": {
        id: "selling-hook",
        name: "卖点钩子",
        commercialProblem: "大众习以为常的某个常识或做法，到底错在哪里？",
        audienceRelation: "打破行业信息差的逆向揭秘者，引发强烈的探索好奇。",
        coreDrive: "先立下观众深信不疑的常规认知，随后用新事实出其不意打脸反转。",
        commercialPositioning: "证明旧认知失效、提供更优解法的颠覆性新方案。",
        creativeTaboo: "切忌立的观点无关痛痒没人关心，切忌反转打脸与核心卖点脱节两张皮。",
    },
    "object-pov": {
        id: "object-pov",
        name: "物品拟人",
        commercialProblem: "如果这个默默无闻的小物件能开口，它眼里的主人和日常会是怎样的？",
        audienceRelation: "带有鲜明个性（如毒舌、傲娇或忠诚）的贴身物件伙伴。",
        coreDrive: "第一人称主观视角的反差萌吐槽，趣味生动的视角转换。",
        commercialPositioning: "自述的主角，在日常吐槽与互动中自然展现其无可替代的硬本领。",
        creativeTaboo: "切忌拟人性格模糊变成普通画外音，切忌视角混乱失去主观镜头的沉浸感。",
    },
    "store-visit": {
        id: "store-visit",
        name: "到店实录",
        commercialProblem: "这家店真实体验究竟如何，普通人去会不会踩雷、排长队或体验打折？",
        audienceRelation: "替大家肉身探路的同城好友，第一视角真实还原体验全流程。",
        coreDrive: "未修饰的行进动线、偶发的人间烟火细节与最真实的即兴反应。",
        commercialPositioning: "整个探店动线中的核心目的地与真实体验标的。",
        creativeTaboo: "切忌拍成官方死板宣传片，切忌只有广告解说而无真实环境与顾客细节。",
    },
    "group-buying": {
        id: "group-buying",
        name: "同城团购",
        commercialProblem: "同城聚餐/放松，怎么吃、怎么选性价比最高，既划算又不失排面？",
        audienceRelation: "精通本地吃喝玩乐省钱经的向导，帮大家盘清每一笔实惠。",
        coreDrive: "满桌丰盛出品的视觉满足感，与超高性价比之间的强烈反差。",
        commercialPositioning: "消除消费顾虑、让人毫不犹豫想要核销的同城质价比方案。",
        creativeTaboo: "切忌权益份量含糊不清，切忌把实惠拍出廉价低劣感。",
    },
    "store-discovery": {
        id: "store-discovery",
        name: "门店发现",
        commercialProblem: "同城店铺那么多，这家店有什么独一无二的审美空间与打卡亮点值得专程来一趟？",
        audienceRelation: "城市美好空间策展人，带观众解锁小众出片的宝藏角落。",
        coreDrive: "赏心悦目的空间设计美学、特色门头光影与出片的打卡机位。",
        commercialPositioning: "提供愉悦社交货币与舒适放松氛围的实体美学空间。",
        creativeTaboo: "切忌忽略空间设计只拍商品，切忌镜头凌乱缺乏出片构图美感。",
    },
    "signature-experience": {
        id: "signature-experience",
        name: "招牌体验",
        commercialProblem: "这家店立足的绝对看家本领或必点王牌究竟是什么？为什么大家都奔着它来？",
        audienceRelation: "专注极致细节的美食品鉴家或手艺传承见证者。",
        coreDrive: "招牌瞬间的极度感官诱惑（视觉色泽、动态细节、声音质感）。",
        commercialPositioning: "代表门店最高水准的镇店王牌，到店必试的核心理由。",
        creativeTaboo: "切忌镜头分散带偏焦点，切忌画面灰暗无法调动食欲或感官冲动。",
    },
    "weekend-discovery": {
        id: "weekend-discovery",
        name: "周末去哪",
        commercialProblem: "周末想逃离内卷与喧嚣，同城哪里能让人彻底放空、治愈身心？",
        audienceRelation: "懂享受生活的私藏密友，随性分享自己的周末充电地图。",
        coreDrive: "悠闲舒缓的时间流淌感，逃离都市疲惫的松弛治愈氛围。",
        commercialPositioning: "安放疲惫心灵、提供高品质慢生活的理想去处。",
        creativeTaboo: "切忌拍成赶场式的急躁打卡，切忌商业气息过浓破坏周末度假感。",
    },
    "street-interview": {
        id: "street-interview",
        name: "街头实测",
        commercialProblem: "普通路人和顾客的无滤镜真实评价到底是什么？真有那么好还是商家王婆卖瓜？",
        audienceRelation: "手持话筒的街头探寻者，记录未彩排的即兴碰撞。",
        coreDrive: "突发的现场感、受访者从迟疑到惊叹的生动真实表情。",
        commercialPositioning: "经受住随机公众实测检验并赢得由衷好评的口碑证明。",
        creativeTaboo: "切忌路人回答背台词痕迹明显，切忌提问充满预设立场的生硬推销感。",
    },
    "brand-advocacy": {
        id: "brand-advocacy",
        name: "品牌主张",
        commercialProblem: "在嘈杂同质化的世界里，这个品牌究竟坚守何种态度与生活信仰？",
        audienceRelation: "时代情绪的共鸣者与人文精神的同行者，克制而坚定。",
        coreDrive: "考究的电影级视觉质感、直击人心的人文洞察与深沉有力的思想表达。",
        commercialPositioning: "品牌价值观的精神具象，让受众在认同态度中完成心智共鸣。",
        creativeTaboo: "切忌居高临下的道德说教，切忌空洞宏大口号缺乏具体生活印记。",
    },
    "brand-story": {
        id: "brand-story",
        name: "品牌故事",
        commercialProblem: "在这件作品或这家企业背后，藏着怎样不为人知的执着与岁月坚守？",
        audienceRelation: "温和专注的倾听者与故事记录者，娓娓道来动人历程。",
        coreDrive: "经历挫折仍不妥协的真实人物弧光，对工艺或细节近乎偏执的坚守。",
        commercialPositioning: "时光沉淀与匠心凝聚的结晶，是品牌信任最深厚的根基。",
        creativeTaboo: "切忌编造失真的神话伟光正形象，切忌流水账罗列荣誉年表。",
    },
    "lifestyle-brand": {
        id: "lifestyle-brand",
        name: "生活方式",
        commercialProblem: "融入这种生活美学，我的日常能拥有怎样从容、雅致的呼吸感？",
        audienceRelation: "美好日常的审美品味分享者，一同感受生活本真的诗意。",
        coreDrive: "留白舒适的自然光影、人与器物在日常相伴中的温润流动。",
        commercialPositioning: "自然融入理想生活切片的美学符号，提升日常幸福感的生活道具。",
        creativeTaboo: "切忌堆砌浮夸名牌造成疏离感，切忌生硬摆拍破坏静谧自然的生活流动感。",
    },
    "creative-concept": {
        id: "creative-concept",
        name: "创意概念",
        commercialProblem: "品牌具备怎样打破边界的先锋想象力，能带领观众进入前所未有的认知奇境？",
        audienceRelation: "前卫视觉的领路人与想象力构造师，激发感官探索。",
        coreDrive: "突破常规物理尺度的视觉隐喻、极具冲击力的反常态视听构想。",
        commercialPositioning: "承载品牌创新基因与先锋探索精神的视觉图腾。",
        creativeTaboo: "切忌形式自嗨让观众一头雾水，切忌概念悬空与品牌内核毫无关联。",
    },
    "twist-skit": {
        id: "twist-skit",
        name: "反转短剧",
        commercialProblem: "看似理所当然的人情互动或常规偏见，会以怎样意想不到的方式滑稽翻车？",
        audienceRelation: "戏谑的旁观者，与观众共享看破不说破的八卦与期待。",
        coreDrive: "先建立极高的预期或偏见，中段层层加固，末段猝不及防打脸翻转。",
        commercialPositioning: "意料之外但情理之中成为化解僵局、颠覆局势或打脸真相的解密钥匙。",
        creativeTaboo: "切忌反转老套一眼望到底，切忌为了带出商品强行让角色行为逻辑脱节。",
    },
    "emotional-clip": {
        id: "emotional-clip",
        name: "情绪短片",
        commercialProblem: "在奔波疲惫的日常中，是否有那么一个柔软瞬间能安抚情绪、唤醒对生活的热爱？",
        audienceRelation: "默默懂得的知心陪伴者，给予无声的理解与体谅。",
        coreDrive: "细腻入微的情感颗粒度，抚慰日常疲惫的温润暖意。",
        commercialPositioning: "在脆弱或放松时刻带来慰藉、陪伴与平静的情感寄托。",
        creativeTaboo: "切忌无病呻吟与虚假矫情，切忌情绪刚到位就急躁地跳出来逼人买单。",
    },
    "dialogue-skit": {
        id: "dialogue-skit",
        name: "对话短剧",
        commercialProblem: "现实中让人头疼的熟人沟通或人际摩擦，如何借由机智幽默的互动巧妙化解？",
        audienceRelation: "身临其境的偷听者，在生动真实的生活对白中会心一笑。",
        coreDrive: "地道口语化、充满戏剧张力的日常互怼与机智交锋。",
        commercialPositioning: "在双方观点交锋或尴尬对峙中，作为转变态度、化解冲突的润滑剂。",
        creativeTaboo: "切忌对白文绉绉脱离真实生活，切忌为了念卖点让角色突然出戏停顿。",
    },
    "suspense-skit": {
        id: "suspense-skit",
        name: "悬念短剧",
        commercialProblem: "这个反常的举动或神秘的线索背后，究竟藏着什么让人无法移开视线的秘密？",
        audienceRelation: "一同寻觅真相的探秘者，被层层谜题抓牢注意力。",
        coreDrive: "开局无法解释的悬疑好奇，步步深入的抽丝剥茧与完播吸引力。",
        commercialPositioning: "层层谜题揭开后的合理解密答案，所有疑问聚焦的核心落点。",
        creativeTaboo: "切忌故弄玄虚最后烂尾无聊，切忌谜底与核心标的毫无瓜葛强行硬套。",
    },
    "product-placement": {
        id: "product-placement",
        name: "产品植入",
        commercialProblem: "在一场引人入胜的生活故事中，这个好物是如何如影随形、毫不突兀地融入剧情的？",
        audienceRelation: "全神贯注沉浸于剧情的观众，注意力完全被生动故事吸引。",
        coreDrive: "扎实连贯的情节推进、引人入胜的人物关系与生活戏剧事件。",
        commercialPositioning: "完全服从叙事与生活真实的随身道具，绝不单独停下来刻意显摆。",
        creativeTaboo: "切忌剧情突然停滞变广告插播，切忌刻意特写打断影视叙事的流畅度。",
    },
    "story-conflict": {
        id: "story-conflict",
        name: "剧情故事",
        commercialProblem: "当主角遭遇现实两难困境与危机时，究竟该如何破局并迎来转机？",
        audienceRelation: "为人物命运揪心共情的关注者，期待见证破局时刻。",
        coreDrive: "经典戏剧矛盾冲突（面临危机 → 陷入僵局 → 灵光闪现逆转翻盘）。",
        commercialPositioning: "主角在最棘手的关键时刻，点亮解题思路、逆转局势的破局支点。",
        creativeTaboo: "切忌冲突平淡毫无波澜，切忌破局过程缺乏生活因果逻辑、机械降神。",
    },
};

/**
 * 获取并格式化工作流卡片的 5 维方向指引文本
 */
export function resolveVideoSkillDirectionText(skillId: string, fallbackName?: string): string {
    const dir = VIDEO_SKILL_DIRECTIONS[skillId];
    if (!dir) {
        const name = fallbackName || "综合视频创作";
        return [
            `## 本次创作模式：${name}`,
            "",
            "核心商业问题：如何通过真实自然的视听语言，让观众快速理解并认同标的物的独特价值？",
            "观众关系：真诚平视的生活体验见证者，零距离交流，拒绝说教与硬广。",
            "核心驱动：生动的生活切片细节、真实的感官体验与情感共鸣。",
            "商业定位：自然融入生活场景的体验改善道具或破局钥匙。",
            "创作禁区：切忌念说明书式枯燥参数，切忌虚假浮夸的表演感与生硬广告腔。",
        ].join("\n");
    }

    return [
        `## 本次创作模式：${dir.name}`,
        "",
        `核心商业问题：${dir.commercialProblem}`,
        `观众关系：${dir.audienceRelation}`,
        `核心驱动：${dir.coreDrive}`,
        `商业定位：${dir.commercialPositioning}`,
        `创作禁区：${dir.creativeTaboo}`,
    ].join("\n");
}
