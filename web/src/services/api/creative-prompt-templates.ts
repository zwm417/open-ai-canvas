// @opc-feature: creative-prompt-templates [start]
import { http } from "@/services/api/request";
import { scopedLocalStorage, USER_SCOPE_CHANGED_EVENT } from "@/lib/user-scope";

export type CreativePromptKind = "image" | "video" | "drama";

export interface CreativePromptTemplate {
    id: string;
    userId?: string;
    kind: CreativePromptKind;
    name: string;
    category?: string;
    tags?: string;
    content: string;
    isBuiltin?: boolean;
    createdAt?: string;
    updatedAt?: string;
}

const LOCAL_STORAGE_KEY = "opc_creative_prompt_templates_v1";

// ─── 19 套系统内置初始模板（离线 0ms 纯文本硬编码，杜绝任何外部依赖） ───
export const BUILTIN_CREATIVE_PROMPT_TEMPLATES: CreativePromptTemplate[] = [
    // ── 1. 生图提示词 (Image, 6 items) ──
    {
        id: "builtin_img_product_consistency_storyboard",
        kind: "image",
        name: "产品一致性故事板",
        category: "改图提示词",
        tags: "电商,分镜,一致性,改图",
        isBuiltin: true,
        content: `你是一个专门为电商短视频做"产品一致性故事板"的提示词生成器。

【输入】用户给你一张或多张产品图（详情页截图/白底图/文案/链接均可）。

【你的任务】
基于输入的产品图，输出一段可直接喂给 img-to-image 生图模型的故事板提示词组，确保后续生成的所有分镜画面中，产品保持100%一致（颜色/材质/版型/细节/logo位置完全相同）。

━━━━━━━━━━━━━━━━━━━━
■ 构图铁律（CRITICAL）
━━━━━━━━━━━━━━━━━━━━
1. 如果输入中包含白底图 → 必须将白底图作为故事板的"主视觉锚点"，放在最大、最近、最清晰的展示位（占整张故事板视觉面积的30%以上），其他分镜以缩略图形式围绕排布
2. 主视觉锚点的产品必须满足：
   - 占画面60%以上
   - 1:1 或近距离镜头（产品边缘清晰、纹理可辨）
   - 纯白/纯灰背景，无任何干扰元素
   - 分辨率优先（同同等条件下选最高清的白底图）
3. 如果没有白底图，则从所有输入图中选"产品最大、最清晰、背景最干净"的一张作为主视觉锚点
4. 其他参考图（场景图、模特图、细节图）作为辅助视觉，缩略排布在主图周围，不抢主图位置
5. 故事板里所有产品缩略图最小边长不得低于主图的1/3，避免AI识别失真

━━━━━━━━━━━━━━━━━━━━
■ 产品DNA锁定（PRODUCT LOCK）
━━━━━━━━━━━━━━━━━━━━
从主视觉锚点（白底图优先）提取以下5个维度：
- 颜色：具体色名 + 饱和度 + 冷暖
- 材质：面料/工艺 + 光泽度 + 厚度
- 版型/形态：轮廓 + 关键结构
- 标志性细节：logo位置、装饰、印花、按键、瓶口等
- 不可变特征：任何使该产品区别于同类的细节

━━━━━━━━━━━━━━━━━━━━
■ 全局风格锁（GLOBAL STYLE LOCK）
━━━━━━━━━━━━━━━━━━━━
人物（如有）：年龄、发型、配饰、肤色，固定不变
灯光：自然光/影棚光/特定色温
风格：电影级写实/清新日系/极简产品摄影 等
相机参数：焦段、光圈、ISO

━━━━━━━━━━━━━━━━━━━━
■ 分镜提示词组（SHOTS）
━━━━━━━━━━━━━━━━━━━━
分镜数量按品类自动判断：
- 服饰类：8镜
- 美妆类：6镜
- 食饮类：5镜
- 3C/家居：6镜

【镜号XX · 镜头名称】
景别：远景/中景/近景/特写
环境：具体场景描述
动作：主体动作
情绪/氛围：一句话
提示词：[PRODUCT LOCK] + [GLOBAL STYLE LOCK] + 本镜变量描述

【铁律】
- 主视觉锚点（白底图）必须以最大尺寸出现在故事板顶部C位
- 不允许出现产品参考图小于100×100像素的情况
- 颜色描述必须精确到色调倾向
- 材质必须包含光泽度
- 输入图信息不足时标注"待补充"，不要猜测`,
    },
    {
        id: "builtin_img_generate_model",
        kind: "image",
        name: "生成模特提示词",
        category: "改图提示词",
        tags: "模特,四宫格,人像,细节",
        isBuiltin: true,
        content: `根据这两个人物的五官、发型、皮肤等所有细节 ，生成人物的四宫格形象图，背景白色  ，第一张头部正面、第二张头部侧面、第三张头部背面、第四张头部45度侧面。不要塑料陶瓷肌。去掉所有字幕。`,
    },
    {
        id: "builtin_img_model_and_clothes",
        kind: "image",
        name: "生模特+换服装",
        category: "改图提示词",
        tags: "模特,换装,服饰,四宫格",
        isBuiltin: true,
        content: `将图@图片2 中的服装穿在图@图片1 中的模特身上，生成人物四宫格形象图，背景白色，不要塑料陶瓷肌。
第一张头部正面、第二张头部侧面、第三张全身正面、第四张全身背面。不要塑料陶瓷肌。去掉所有字幕。`,
    },
    {
        id: "builtin_img_replace_product",
        kind: "image",
        name: "生图换产品",
        category: "改图提示词",
        tags: "换产品,电商,合成,无缝融合",
        isBuiltin: true,
        content: `把图@图片1 中的产品替换成图@图片2 中的产品，注意手部拿产品的动作，融合要自然，不能有抠图感，产品不能变形，背景不变，人物不变。`,
    },
    {
        id: "builtin_img_storyboard_puzzle_replace",
        kind: "image",
        name: "分镜拼图替换",
        category: "改图提示词",
        tags: "拼图,分镜,产品替换,故事板",
        isBuiltin: true,
        content: `将图@图片1 （故事板拼图）中所有的产品都替换成图@图片2 中的产品。注意产品不能变形，人物不变，场景不变，光影融合要自然。`,
    },
    {
        id: "builtin_img_generate_real_four_grid",
        kind: "image",
        name: "生成真人四宫格",
        category: "改图提示词",
        tags: "真人,四宫格,质感,发丝毛孔",
        isBuiltin: true,
        content: `请帮我生成一张中国女性真人四宫格图片：
1、背景为干净纯白底；
2、包含四个视角：正脸大特写、微侧45度半身、侧颜特写、低头浅笑特写；
3、人物要求：25岁左右中国女性，长相清秀温婉，原生自然眉形，野生毛流感，清透自然的微光裸妆，水润珊瑚粉唇色，发丝自然蓬松微乱；
4、画面质感：超高清真实摄影质感，皮肤细腻有真实毛孔与微小肌理，拒绝任何塑料假面感与过度磨皮，顶级商业棚拍柔光。`,
    },

    // ── 2. 生视频提示词 (Video, 7 items) ──
    {
        id: "builtin_vid_swap_head_and_voice",
        kind: "video",
        name: "生视频换头换音色",
        category: "生视频提示词",
        tags: "换头,换音色,口播,一致性",
        isBuiltin: true,
        content: `将原视频中的人物替换为参考图@图片 中的模特，生成一条全新的口播视频。
严格执行以下要求：
1. 【人物替换】：原视频人物的头部、面部五官、发型完整替换为参考图人物特征，确保模特面部特征稳定一致，表情自然生动，口型与音频精确同步。
2. 【保留要素】：原视频中模特的服装、首饰配饰完全保留；手部动作、身体姿态、走位及整体动作幅度与原视频保持完全一致；原视频的场景、背景元素、灯光光影及色调氛围完全保留。
3. 【音画质量】：输出高清画质，人物皮肤质感真实自然，无畸变、无频闪、无画面撕裂；音画高度对齐，整体节奏流畅自然。`,
    },
    {
        id: "builtin_vid_swap_head_keep_voice",
        kind: "video",
        name: "生视频换头不换音色",
        category: "生视频提示词",
        tags: "换头,原音色,口播同步,背景不变",
        isBuiltin: true,
        content: `将原视频中的人物替换为参考图@图片 中的模特，生成一条全新的口播视频。
严格执行以下要求：
1. 【人物替换】：原视频人物的头部、面部五官、发型完整替换为参考图人物特征，确保模特面部特征稳定一致，表情自然生动，口型与原音频精确同步。
2. 【声音保留】：原视频的声音、音色、语调、语速及背景音效完全保留，不做任何改变。
3. 【画面保留】：原视频中模特的服装完全保留；手部动作、身体姿态及整体动作与原视频保持一致；原视频的场景背景、灯光及色调氛围完全保留。
4. 【画面质量】：输出高清画质，人物皮肤质感真实自然，无畸变、无频闪，音画高度对齐。`,
    },
    {
        id: "builtin_vid_swap_model_and_clothes",
        kind: "video",
        name: "生视频换模特+服饰",
        category: "生视频提示词",
        tags: "换模特,换服饰,动态一致,商品质感",
        isBuiltin: true,
        content: `将原视频中的人物头部替换为参考图@图片1 中的模特，服装替换为参考图@图片2 中的服装，生成一条全新的视频。
严格执行以下要求：
1. 【人物与服装替换】：人物头部完整替换为参考图1特征，服装替换为参考图2样式，确保服装版型、颜色、图案及材质细节真实还原。
2. 【动态与场景保留】：手部动作、身体姿态、走位及整体动作与原视频保持完全一致；原视频场景背景、光影及氛围完全保留；服装随人物动作自然摆动，褶皱及垂坠感符合物理规律。
3. 【画面质量】：输出高清画质，人物与服装融合自然，边缘无抠图痕迹、无频闪撕裂。`,
    },
    {
        id: "builtin_vid_replace_product",
        kind: "video",
        name: "生视频+替换产品",
        category: "生视频提示词",
        tags: "换产品,电商带货,手部动作,光影融合",
        isBuiltin: true,
        content: `将原视频中出现的产品替换为参考图@图片 中的产品，生成一条全新的展示视频。
严格执行以下要求：
1. 【产品替换】：原视频中所有镜头内的产品完整替换为参考图产品，精准还原产品的外观造型、颜色、材质质感、Logo及细节特征，透视角度随镜头运动自然变化。
2. 【动作与场景保留】：人物动作、拿取/展示产品的姿态与原视频完全一致；手指与产品的接触遮挡关系真实自然；原视频场景背景、灯光反射及色调完全保留。
3. 【画面质量】：输出高清画质，产品与场景光影融合自然，反光与投影符合环境光源，无抖动变形。`,
    },
    {
        id: "builtin_vid_reverse_text_to_video",
        kind: "video",
        name: "反推生视频提示词",
        category: "生视频提示词",
        tags: "反推,生视频,脚本拼接,无字幕",
        isBuiltin: true,
        content: `人物参考：@图片   产品参考：@图片    视频不添加任何字幕
（AI反推出来的分镜头脚本提示词复制粘贴过来）`,
    },
    {
        id: "builtin_vid_reverse_video_prompt",
        kind: "video",
        name: "反推视频提示词",
        category: "生视频提示词",
        tags: "视频拆解,分镜,口播,产品替换",
        isBuiltin: true,
        content: `按照分镜拆解这条视频@视频1 ，文本呈现，不要表格，视频人物场景、服饰、画面、动作、口播、语气都要详细写出来，越详细越好。并把产品替换成@图片（如果产品和原视频不一致，可以添加产品图片）`,
    },
    {
        id: "builtin_vid_consistency_reproduction",
        kind: "video",
        name: "生视频提示词（一致性复刻）",
        category: "生视频提示词",
        tags: "复刻,运镜,时序,无字幕",
        isBuiltin: true,
        content: `人物参考：@图片   产品参考：@图片    视频不添加任何字幕
【镜头景别与构图】：中景/近景稳定镜头，主体置于视觉中心。
【主体动作】：模特自然手持产品向镜头展示，面带微笑，动作从容稳定。
【运镜轨迹】：缓慢向前推镜，景深适中，突出产品材质细节与质感光泽。
【灯光氛围】：商业摄影级柔光箱主光，侧逆光勾勒人物发丝与产品轮廓，背景轻微虚化。`,
    },

    // ── 3. 短剧提示词 (Drama, 6 items) ──
    {
        id: "builtin_drama_character_sheet",
        kind: "drama",
        name: "角色设定图",
        category: "短剧分镜",
        tags: "角色,一致性,三视图,设定图",
        isBuiltin: true,
        content: `生成角色设定图：保持同一角色身份、五官、发型、服装和体态一致，包含正面、侧面、背面和关键表情参考，背景简洁，便于后续镜头复用。`,
    },
    {
        id: "builtin_drama_multi_angle",
        kind: "drama",
        name: "多机位视角",
        category: "短剧分镜",
        tags: "机位,多视角,镜头衔接,一致性",
        isBuiltin: true,
        content: `围绕同一主体设计多机位画面，保持人物、服装、场景和光线一致，分别给出远景、全景、中景、近景、特写、侧面、背面和俯拍视角，镜头之间具有连续性。`,
    },
    {
        id: "builtin_drama_next_shot",
        kind: "drama",
        name: "画面推演",
        category: "短剧分镜",
        tags: "前后动作,连续性,推演,镜头衔接",
        isBuiltin: true,
        content: `基于当前画面推演下一个连续镜头：保持角色和场景一致，明确主体接下来的动作、视线、环境变化、镜头运动和自然衔接方式，不要跳变构图或身份。`,
    },
    {
        id: "builtin_drama_story_beats",
        kind: "drama",
        name: "连续镜头",
        category: "短剧分镜",
        tags: "分镜节拍,节奏,短剧叙事,时序",
        isBuiltin: true,
        content: `把这段内容拆成连续镜头节拍。每个镜头写清主体动作、景别、构图、机位、运镜、光线、情绪和与前后镜头的衔接，并保持角色、场景和道具一致。`,
    },
    {
        id: "builtin_drama_cinematic_light",
        kind: "drama",
        name: "电影光影优化",
        category: "短剧分镜",
        tags: "电影感,光影,氛围,去塑料感",
        isBuiltin: true,
        content: `保留主体身份、动作和原始构图，优化为真实电影摄影光线：明确主光方向、环境反射、阴影层次、肤色和背景融合，降低塑料感与过度锐化，不改变画面内容。`,
    },
    {
        id: "builtin_drama_video_prompt",
        kind: "drama",
        name: "视频提示词优化",
        category: "短剧分镜",
        tags: "时序指令,视频提示词,结构化,短剧",
        isBuiltin: true,
        content: `将当前要求改写为结构化视频提示词，按时间顺序描述开场画面、主体动作、镜头运动、环境变化、声音和结束画面；消除冲突指令，保留所有关键约束。`,
    },
];

let memoryCache: CreativePromptTemplate[] | null = null;

if (typeof window !== "undefined") {
    window.addEventListener(USER_SCOPE_CHANGED_EVENT, () => {
        memoryCache = null;
    });
}

// 读取本地缓存（0ms 秒开）
export function loadCachedTemplates(): CreativePromptTemplate[] {
    if (memoryCache) {
        return [...memoryCache];
    }
    try {
        const raw = scopedLocalStorage.getItem(LOCAL_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
                // 确保内置的 19 套始终存在
                const existingIds = new Set(parsed.map((p: CreativePromptTemplate) => p.id));
                const merged = [...parsed];
                for (const b of BUILTIN_CREATIVE_PROMPT_TEMPLATES) {
                    if (!existingIds.has(b.id)) {
                        merged.push(b);
                    }
                }
                memoryCache = merged;
                return [...merged];
            }
        }
    } catch {
        // ignore error
    }
    memoryCache = [...BUILTIN_CREATIVE_PROMPT_TEMPLATES];
    return [...memoryCache];
}

// 保存本地缓存
export function saveCachedTemplates(list: CreativePromptTemplate[]) {
    memoryCache = [...list];
    try {
        scopedLocalStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
    } catch {
        // ignore
    }
}

// 统一查询（带远程与本地混合同步）
export async function fetchCreativePromptTemplates(kind?: CreativePromptKind | "all"): Promise<CreativePromptTemplate[]> {
    const cached = loadCachedTemplates();
    const filterKind = (items: CreativePromptTemplate[]) => {
        if (!kind || kind === "all") return items;
        return items.filter((item) => item.kind === kind);
    };

    try {
        const res = await http.get<{ templates: CreativePromptTemplate[] }>("/creative-prompts", {
            params: { kind: kind && kind !== "all" ? kind : undefined },
        });
        if (res && Array.isArray(res.templates) && res.templates.length > 0) {
            // 将服务端最新的存回本地缓存
            const remoteTemplates = res.templates;
            const updatedCache = [...remoteTemplates];
            // 保留本地独有的非内置自定义
            const remoteIds = new Set(remoteTemplates.map((r) => r.id));
            for (const c of cached) {
                if (!remoteIds.has(c.id) && !c.isBuiltin) {
                    updatedCache.push(c);
                }
            }
            saveCachedTemplates(updatedCache);
            return filterKind(updatedCache);
        }
    } catch {
        // 离线或后端不可达时优雅回退本地缓存
    }

    return filterKind(cached);
}

// 创建或保存模板
export async function saveCreativePromptTemplate(
    item: Partial<CreativePromptTemplate> & { name: string; content: string; kind: CreativePromptKind }
): Promise<CreativePromptTemplate> {
    const cached = loadCachedTemplates();
    let savedItem: CreativePromptTemplate;

    try {
        if (item.id && !item.id.startsWith("builtin_")) {
            const res = await http.put<{ template: CreativePromptTemplate }>(`/creative-prompts/${item.id}`, item);
            savedItem = res.template;
        } else {
            const res = await http.post<{ template: CreativePromptTemplate }>("/creative-prompts", item);
            savedItem = res.template;
        }
    } catch {
        // 离线兜底
        const now = new Date().toISOString();
        savedItem = {
            id: item.id || `cpt_local_${Date.now()}_${item.kind}`,
            kind: item.kind,
            name: item.name,
            category: item.category || "我的自定义",
            tags: item.tags || "自定义",
            content: item.content,
            isBuiltin: false,
            createdAt: item.createdAt || now,
            updatedAt: now,
        };
    }

    const idx = cached.findIndex((t) => t.id === savedItem.id);
    if (idx >= 0) {
        cached[idx] = savedItem;
    } else {
        cached.unshift(savedItem);
    }
    saveCachedTemplates(cached);

    return savedItem;
}

// 删除模板
export async function deleteCreativePromptTemplate(id: string): Promise<void> {
    const cached = loadCachedTemplates();
    try {
        await http.delete(`/creative-prompts/${id}`);
    } catch {
        // ignore offline delete error
    }
    const filtered = cached.filter((t) => t.id !== id);
    saveCachedTemplates(filtered);
}
// @opc-feature: creative-prompt-templates [end]
