// @opc-feature: model-smart-router [start]
import type {
    FrontendModelItem,
    PluginProtocolItem,
    SwitchFeatureItem,
    ResolutionBillingTier,
    ChannelAvailableModel,
    CapabilityType,
} from "./types";

/** 全面复核的视频模型参数开关控制项 (标准化视频核心参数：分辨率、尺寸、秒数、特殊参数) */
export const COMPREHENSIVE_VIDEO_SWITCHES: SwitchFeatureItem[] = [
    // 1. 分辨率 (480P、720P、1080P、768P、2K)
    { key: "res_480p", label: "480p", description: "标清 854x480，极速生成", category: "resolution", channelDefault: true, forcedEnabled: true, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "480p", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "res_720p", label: "720p", description: "高清 1280x720，影视短剧标准档", category: "resolution", channelDefault: true, forcedEnabled: true, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "720p", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "res_1080p", label: "1080p", description: "超清 1920x1080，高保真细节", category: "resolution", channelDefault: true, forcedEnabled: true, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "720p", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "res_768p", label: "768p", description: "特色画质 768x1360 (H3/特殊模型)", category: "resolution", channelDefault: false, forcedEnabled: false, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "720p", isSystemDefault: false, applicableFamilies: ["MiniMax H3"] },
    { key: "res_2k", label: "2k", description: "商业级 2K 交付大画幅", category: "resolution", channelDefault: false, forcedEnabled: false, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "1080p", isSystemDefault: false, applicableFamilies: ["ALL"] },
    { key: "res_4k", label: "4k", description: "超高清 3840x2160，院线商业画质", category: "resolution", channelDefault: false, forcedEnabled: false, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "1080p", isSystemDefault: false, applicableFamilies: ["ALL"] },

    // 2. 尺寸比例 (自适应、9:16、16:9、3:4、4:3、1:1、21:9)
    { key: "ratio_auto", label: "自适应", description: "根据首帧或素材自动适配画幅", category: "aspect_ratio", channelDefault: true, forcedEnabled: true, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "16:9", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "ratio_9_16", label: "9:16", description: "竖屏构图 (短剧/抖音/TikTok)", category: "aspect_ratio", channelDefault: true, forcedEnabled: true, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "9:16", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "ratio_16_9", label: "16:9", description: "横屏构图 (影视/电视标准)", category: "aspect_ratio", channelDefault: true, forcedEnabled: true, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "16:9", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "ratio_3_4", label: "3:4", description: "纵向竖版画幅", category: "aspect_ratio", channelDefault: true, forcedEnabled: true, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "3:4", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "ratio_4_3", label: "4:3", description: "传统电视与复古胶片画幅", category: "aspect_ratio", channelDefault: true, forcedEnabled: true, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "4:3", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "ratio_1_1", label: "1:1", description: "正方形构图", category: "aspect_ratio", channelDefault: true, forcedEnabled: true, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "1:1", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "ratio_21_9", label: "21:9", description: "电影宽银幕视觉", category: "aspect_ratio", channelDefault: false, forcedEnabled: false, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "16:9", isSystemDefault: false, applicableFamilies: ["ALL"] },

    // 3. 秒数与时长
    { key: "duration_continuous", label: "手动设置秒数", description: "在区间范围内选择整数秒生成", category: "duration", channelDefault: true, forcedEnabled: true, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "5s", isSystemDefault: true, applicableFamilies: ["ALL"] },

    // 4. 特殊参数与多模态参考 (素材自动推断)
    { key: "first_frame", label: "首帧生视频", description: "单张图驱动生成起始镜头 (0/1图默认)", category: "reference", channelDefault: true, forcedEnabled: true, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "first_frame", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "first_last_frame", label: "首尾帧过渡", description: "两张图指定首尾帧，引导精准过渡运镜", category: "reference", channelDefault: false, forcedEnabled: false, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "first_frame", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "multi_ref", label: "多图参考", description: "上传多张素材图联合参考生成", category: "reference", channelDefault: false, forcedEnabled: false, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "first_frame", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "omni_ref", label: "全能参考", description: "Seedance 等全能参考能力 (多图/视频联合推断)", category: "reference", channelDefault: true, forcedEnabled: true, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "omni", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "audio_generation", label: "生成声音", description: "画面伴生高保真音效与对白", category: "output", channelDefault: true, forcedEnabled: true, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "disabled", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "watermark_removal", label: "去水印", description: "去除平台水印与标识", category: "output", channelDefault: true, forcedEnabled: true, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "disabled", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "fps_60", label: "60帧率", description: "开启 60fps 超丝滑高帧率", category: "advanced", channelDefault: false, forcedEnabled: false, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "30", isSystemDefault: false, applicableFamilies: ["ALL"] },
    { key: "seed_lock", label: "固定种子", description: "指定固定随机数种子保持画面连续一致", category: "advanced", channelDefault: false, forcedEnabled: false, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "-1", isSystemDefault: false, applicableFamilies: ["ALL"] },
    { key: "video_editing", label: "视频编辑", description: "基于原视频做风格化重绘或区域修改", category: "advanced", channelDefault: false, forcedEnabled: false, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "disabled", isSystemDefault: false, applicableFamilies: ["ALL"] },
    { key: "video_continuation", label: "视频续写", description: "基于已生成片段继续延伸动作故事", category: "advanced", channelDefault: false, forcedEnabled: false, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "disabled", isSystemDefault: false, applicableFamilies: ["ALL"] },
    { key: "motion_reference", label: "参考视频", description: "提取参考视频动作骨骼姿态与运镜走位", category: "reference", channelDefault: true, forcedEnabled: true, showInFrontend: true, preferredCandidateId: "default", fallbackValue: "disabled", isSystemDefault: true, applicableFamilies: ["ALL"] },
];

/** 默认视频参数叠加费用项 */
export const DEFAULT_VIDEO_SURCHARGES = [
    { id: "sc-audio", parameterKey: "audio_generation", parameterLabel: "生成声音", additionalCost: 0.01, enabled: true },
    { id: "sc-multiref", parameterKey: "multi_ref", parameterLabel: "多图参考", additionalCost: 0.005, enabled: true },
    { id: "sc-maxdur", parameterKey: "max_duration", parameterLabel: "达到最大秒数", additionalCost: 0.015, enabled: false },
];

/** 标准多分辨率计费基准档位 */
export const standardVideoBillingTiers: ResolutionBillingTier[] = [
    { id: "tier-480p", resolution: "480p", upstreamCost: 0.015, matchedParameterKey: "none", matchedParameterLabel: "无 (基础画面)", surchargeCost: 0, markupRatio: 1.8, userPrice: 0.027 },
    { id: "tier-720p", resolution: "720p", upstreamCost: 0.03, matchedParameterKey: "none", matchedParameterLabel: "无 (基础画面)", surchargeCost: 0, markupRatio: 1.8, userPrice: 0.054 },
    { id: "tier-720p-audio", resolution: "720p", upstreamCost: 0.03, matchedParameterKey: "audio_generation", matchedParameterLabel: "生成声音", surchargeCost: 0.01, markupRatio: 1.8, userPrice: 0.072 },
    { id: "tier-1080p", resolution: "1080p", upstreamCost: 0.05, matchedParameterKey: "none", matchedParameterLabel: "无 (基础画面)", surchargeCost: 0, markupRatio: 1.8, userPrice: 0.09 },
    { id: "tier-1080p-audio", resolution: "1080p", upstreamCost: 0.05, matchedParameterKey: "audio_generation", matchedParameterLabel: "生成声音", surchargeCost: 0.01, markupRatio: 1.8, userPrice: 0.108 },
    { id: "tier-768p", resolution: "768p", upstreamCost: 0.035, matchedParameterKey: "none", matchedParameterLabel: "无 (基础画面)", surchargeCost: 0, markupRatio: 1.8, userPrice: 0.063 },
    { id: "tier-2k", resolution: "2k", upstreamCost: 0.07, matchedParameterKey: "none", matchedParameterLabel: "无 (基础画面)", surchargeCost: 0, markupRatio: 1.8, userPrice: 0.126 },
];

/** 全面复核的生图片参数开关控制项 */
export const COMPREHENSIVE_IMAGE_SWITCHES: SwitchFeatureItem[] = [
    { key: "res_1k", label: "1k", description: "1024x1024 基础快速出图与概念草案", category: "resolution", channelDefault: true, forcedEnabled: true, fallbackValue: "1024x1024", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "res_2k", label: "2k", description: "2048x2048 细节细腻、纹理丰富", category: "resolution", channelDefault: true, forcedEnabled: true, fallbackValue: "2048x2048", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "res_4k", label: "4k", description: "3840x2160 / 4096x4096 商业广告大图", category: "resolution", channelDefault: false, forcedEnabled: false, fallbackValue: "2048x2048", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "quality_hd", label: "高画质", description: "开启 quality: high 增强毛发景深与光影质感", category: "resolution", channelDefault: true, forcedEnabled: true, fallbackValue: "standard", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "ratio_1_1", label: "1:1", description: "正方形构图，头像/电商商品", category: "aspect_ratio", channelDefault: true, forcedEnabled: true, fallbackValue: "1:1", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "ratio_16_9", label: "16:9", description: "横向宽景构图，电脑壁纸/视频封面", category: "aspect_ratio", channelDefault: true, forcedEnabled: true, fallbackValue: "16:9", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "ratio_9_16", label: "9:16", description: "竖向全屏构图，手机壁纸/短视频海报", category: "aspect_ratio", channelDefault: true, forcedEnabled: true, fallbackValue: "9:16", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "ratio_4_3", label: "4:3", description: "经典画幅", category: "aspect_ratio", channelDefault: true, forcedEnabled: true, fallbackValue: "4:3", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "ratio_3_4", label: "3:4", description: "肖像画幅", category: "aspect_ratio", channelDefault: true, forcedEnabled: true, fallbackValue: "3:4", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "ratio_21_9", label: "21:9", description: "2352x1008 宽屏视野", category: "aspect_ratio", channelDefault: true, forcedEnabled: true, fallbackValue: "21:9", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "transparent_bg", label: "透明背景", description: "请求模型输出保留 Alpha 通道透明底 PNG", category: "output", channelDefault: false, forcedEnabled: false, fallbackValue: "false", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "inpaint_mask", label: "局部重绘", description: "涂抹蒙版指定区域精准重绘 (Inpaint)", category: "reference", channelDefault: true, forcedEnabled: true, fallbackValue: "disabled", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "batch_count", label: "生成张数", description: "单次批量生成 1~15 张高质量候选图", category: "advanced", channelDefault: true, forcedEnabled: true, fallbackValue: "1", isSystemDefault: true, applicableFamilies: ["ALL"] },
    { key: "multi_ref_synthesis", label: "多图参考", description: "传入多张角色、背景、风格图联合构图 (≤14张)", category: "reference", channelDefault: false, forcedEnabled: false, fallbackValue: "single_ref", isSystemDefault: false, applicableFamilies: ["ALL"] },
    { key: "prompt_expansion", label: "提示词扩写", description: "自动将简短中文扩展为高质量艺术提示词", category: "advanced", channelDefault: true, forcedEnabled: true, fallbackValue: "raw", isSystemDefault: false, applicableFamilies: ["ALL"] },
];

/** 根据模型能力与所属家族，精确过滤出该模型真正具备的参数项 */
export function getApplicableParametersForModel(model: FrontendModelItem): SwitchFeatureItem[] {
    const baseList = model.capability === "video" ? COMPREHENSIVE_VIDEO_SWITCHES : COMPREHENSIVE_IMAGE_SWITCHES;
    return baseList.filter((p) => {
        if (!p.applicableFamilies || p.applicableFamilies.includes("ALL")) {
            return true;
        }
        const famStr = (model.family || "").toLowerCase();
        const idStr = (model.id || "").toLowerCase();
        return p.applicableFamilies.some((fam) => {
            const fLow = fam.toLowerCase();
            return famStr.includes(fLow) || fLow.includes(famStr) || idStr.includes(fLow);
        });
    });
}

/** 系统预置底座展示模型基础分组定义 (供前台展示矩阵与【快捷加入】作为可选底座模板，内部无硬编码上游) */
export interface BaseModelDefinition {
    id: string;
    code: string;
    displayName: string;
    subtitle: string;
    capability: CapabilityType;
    family: string;
    group: string;
    sortOrder: number;
}

export const BASE_MODEL_DEFINITIONS: BaseModelDefinition[] = [
    // 字节 Seedance (12个)
    { id: "seedance-2.0-mini", code: "seedance-2.0-mini", displayName: "seedance-2.0-mini", subtitle: "轻量快速生成 · 经济首选", capability: "video", family: "字节 Seedance", group: "生视频", sortOrder: 1 },
    { id: "seedance-2.0-fast", code: "seedance-2.0-fast", displayName: "seedance-2.0-fast", subtitle: "极速运镜出片 · 伴生音效", capability: "video", family: "字节 Seedance", group: "生视频", sortOrder: 2 },
    { id: "seedance-2.0-vip", code: "seedance-2.0-vip", displayName: "seedance-2.0-vip", subtitle: "长镜头深度推演 · 全模态参考", capability: "video", family: "字节 Seedance", group: "生视频", sortOrder: 3 },
    { id: "seedance-2.5", code: "seedance-2.5", displayName: "seedance-2.5", subtitle: "2.5 全能自适应旗舰 · 1080P 超高清", capability: "video", family: "字节 Seedance", group: "生视频", sortOrder: 4 },
    { id: "seedance-2.0-mini-特惠", code: "seedance-2.0-mini-discount", displayName: "seedance-2.0-mini-特惠", subtitle: "批量短剧概念预演 · 超低单价", capability: "video", family: "字节 Seedance", group: "生视频", sortOrder: 5 },
    { id: "seedance-2.0-fast-特惠", code: "seedance-2.0-fast-discount", displayName: "seedance-2.0-fast-特惠", subtitle: "经济型快速分镜生成", capability: "video", family: "字节 Seedance", group: "生视频", sortOrder: 6 },
    { id: "seedance-2.0-vip-特惠", code: "seedance-2.0-vip-discount", displayName: "seedance-2.0-vip-特惠", subtitle: "高性价比长镜头通道", capability: "video", family: "字节 Seedance", group: "生视频", sortOrder: 7 },
    { id: "seedance-2.5-特惠", code: "seedance-2.5-discount", displayName: "seedance-2.5-特惠", subtitle: "2.5 经济通道 · 720p 优选", capability: "video", family: "字节 Seedance", group: "生视频", sortOrder: 8 },
    { id: "seedance-2.0-mini-官", code: "seedance-2.0-mini-official", displayName: "seedance-2.0-mini-官", subtitle: "原厂直连 SLA 保障 · 无排队", capability: "video", family: "字节 Seedance", group: "生视频", sortOrder: 9 },
    { id: "seedance-2.0-fast-官", code: "seedance-2.0-fast-official", displayName: "seedance-2.0-fast-官", subtitle: "原厂高并发专线 · 极速交付", capability: "video", family: "字节 Seedance", group: "生视频", sortOrder: 10 },
    { id: "seedance-2.0-vip-官", code: "seedance-2.0-vip-official", displayName: "seedance-2.0-vip-官", subtitle: "原厂尊享通道 · 院线质感", capability: "video", family: "字节 Seedance", group: "生视频", sortOrder: 11 },
    { id: "seedance-2.5-官", code: "seedance-2.5-official", displayName: "seedance-2.5-官", subtitle: "原厂 1080P 顶级画质直通", capability: "video", family: "字节 Seedance", group: "生视频", sortOrder: 12 },
    // MiniMax H3 (3个)
    { id: "MiniMax-H3-增强", code: "minimax-h3-enhanced", displayName: "MiniMax-H3-增强", subtitle: "Context IR 语义增强 · 首尾自适应", capability: "video", family: "MiniMax H3", group: "生视频", sortOrder: 13 },
    { id: "MiniMax-H3-标准", code: "minimax-h3-standard", displayName: "MiniMax-H3-标准", subtitle: "标准 H3 电影构图 · 原生块结构", capability: "video", family: "MiniMax H3", group: "生视频", sortOrder: 14 },
    { id: "MiniMax-H3-特惠", code: "minimax-h3-discount", displayName: "MiniMax-H3-特惠", subtitle: "AutoDL ComfyUI 流程 · 智能路由", capability: "video", family: "MiniMax H3", group: "生视频", sortOrder: 15 },
    // 通义万相 (2个)
    { id: "wan-3.0-标准", code: "wan-3.0-standard", displayName: "wan-3.0-标准", subtitle: "万相 3.0 Prime · 1080P 质感", capability: "video", family: "通义万相", group: "生视频", sortOrder: 16 },
    { id: "wan-3.0-特惠", code: "wan-3.0-discount", displayName: "wan-3.0-特惠", subtitle: "选480P出1080P质感 · 极致性价比", capability: "video", family: "通义万相", group: "生视频", sortOrder: 17 },
    // xAI Grok (2个生视频)
    { id: "grok-1.5-video", code: "grok-1.5-video", displayName: "grok-1.5-video", subtitle: "单次最长15秒 · 电影写实质感", capability: "video", family: "xAI Grok", group: "生视频", sortOrder: 18 },
    { id: "grok-1.5-video-特惠", code: "grok-1.5-video-discount", displayName: "grok-1.5-video-特惠", subtitle: "Grok 720p 经济通道 · 独立生成", capability: "video", family: "xAI Grok", group: "生视频", sortOrder: 19 },
    // Google Omni (3个)
    { id: "omni-fast", code: "omni-fast", displayName: "omni-fast", subtitle: "8秒一口价 · 英文台词逐字念读 8/8", capability: "video", family: "Google Omni", group: "生视频", sortOrder: 20 },
    { id: "omni-标准", code: "omni-standard", displayName: "omni-标准", subtitle: "专属视频续写 (+8~10s) · 20秒成片", capability: "video", family: "Google Omni", group: "生视频", sortOrder: 21 },
    { id: "omni-特惠", code: "omni-discount", displayName: "omni-特惠", subtitle: "8秒多模态自适应 · 经济通道", capability: "video", family: "Google Omni", group: "生视频", sortOrder: 22 },
    // 欢乐马 (2个)
    { id: "欢乐马-1.1", code: "huanlema-1.1", displayName: "欢乐马-1.1", subtitle: "多图生视频 · 动作运镜平滑", capability: "video", family: "欢乐马", group: "生视频", sortOrder: 23 },
    { id: "欢乐马-1.1-特惠", code: "huanlema-1.1-discount", displayName: "欢乐马-1.1-特惠", subtitle: "批量分镜快速生成通道", capability: "video", family: "欢乐马", group: "生视频", sortOrder: 24 },
    // GPT Image 2 (8个生图片)
    { id: "GPT-Image-2-标准", code: "gpt-image-2-standard", displayName: "GPT-Image-2-标准", subtitle: "商业写实排版 · 标准 1K/2K 构图", capability: "image", family: "GPT Image 2", group: "生图片", sortOrder: 25 },
    { id: "GPT-Image-2-原生", code: "gpt-image-2-native", displayName: "GPT-Image-2-原生", subtitle: "OpenAI 官方原生通道 · 涂抹改图", capability: "image", family: "GPT Image 2", group: "生图片", sortOrder: 26 },
    { id: "GPT-Image-2-高品", code: "gpt-image-2-hd", displayName: "GPT-Image-2-高品", subtitle: "4K 院线级超写实 · 微距毛发细节", capability: "image", family: "GPT Image 2", group: "生图片", sortOrder: 27 },
    { id: "GPT-Image-2-特惠", code: "gpt-image-2-discount", displayName: "GPT-Image-2-特惠", subtitle: "经济型写实生图 · 按张计费", capability: "image", family: "GPT Image 2", group: "生图片", sortOrder: 28 },
    { id: "GPT-Image-2.5-标准", code: "gpt-image-2.5-standard", displayName: "GPT-Image-2.5-标准", subtitle: "2.5 代升级构图 · 逼真景深", capability: "image", family: "GPT Image 2", group: "生图片", sortOrder: 29 },
    { id: "GPT-Image-2.5-原生", code: "gpt-image-2.5-native", displayName: "GPT-Image-2.5-原生", subtitle: "2.5 原生高保真通道 · 局部精修", capability: "image", family: "GPT Image 2", group: "生图片", sortOrder: 30 },
    { id: "GPT-Image-2.5-高品", code: "gpt-image-2.5-hd", displayName: "GPT-Image-2.5-高品", subtitle: "2.5 旗舰 4K 超高清 · 商业广告级", capability: "image", family: "GPT Image 2", group: "生图片", sortOrder: 31 },
    { id: "GPT-Image-2.5-特惠", code: "gpt-image-2.5-discount", displayName: "GPT-Image-2.5-特惠", subtitle: "2.5 经济分镜草图通道", capability: "image", family: "GPT Image 2", group: "生图片", sortOrder: 32 },
    // 谷歌 nanobanana (4个生图片)
    { id: "nanobanana-标准", code: "nanobanana-standard", displayName: "nanobanana-标准", subtitle: "谷歌前沿构图 · 艺术意境", capability: "image", family: "谷歌 nanobanana", group: "生图片", sortOrder: 33 },
    { id: "nanobanana-pro", code: "nanobanana-pro", displayName: "nanobanana-pro", subtitle: "专业级构图与自然风景", capability: "image", family: "谷歌 nanobanana", group: "生图片", sortOrder: 34 },
    { id: "nanobanana-高品", code: "nanobanana-hd", displayName: "nanobanana-高品", subtitle: "4K 超精细画质 · 摄影级色彩", capability: "image", family: "谷歌 nanobanana", group: "生图片", sortOrder: 35 },
    { id: "nanobanana-特惠", code: "nanobanana-discount", displayName: "nanobanana-特惠", subtitle: "快速概念图与创意草案", capability: "image", family: "谷歌 nanobanana", group: "生图片", sortOrder: 36 },
    // xAI Grok (2个生图片)
    { id: "Grok Imagine", code: "grok-imagine", displayName: "Grok Imagine", subtitle: "幽默创意与天马行空概念设计", capability: "image", family: "xAI Grok", group: "生图片", sortOrder: 37 },
    { id: "Grok Imagine-特惠", code: "grok-imagine-discount", displayName: "Grok Imagine-特惠", subtitle: "概念草图极速出图", capability: "image", family: "xAI Grok", group: "生图片", sortOrder: 38 },
    // 字节 Seedream (3个生图片)
    { id: "Seedream-5.0", code: "seedream-5.0", displayName: "Seedream-5.0", subtitle: "豆包东方国风美学 · 中文深度理解", capability: "image", family: "字节 Seedream", group: "生图片", sortOrder: 39 },
    { id: "Seedream-5.0-pro", code: "seedream-5.0-pro", displayName: "Seedream-5.0-pro", subtitle: "5.0 旗舰 4K 东方神韵 · 细腻工笔", capability: "image", family: "字节 Seedream", group: "生图片", sortOrder: 40 },
    { id: "Seedream-5.0-特惠", code: "seedream-5.0-discount", displayName: "Seedream-5.0-特惠", subtitle: "国风插画批量生成", capability: "image", family: "字节 Seedream", group: "生图片", sortOrder: 41 },
    // Midjourney (1个生图片)
    { id: "Midjourney", code: "midjourney-v6", displayName: "Midjourney", subtitle: "官方美学标杆 · v6.1 艺术光影", capability: "image", family: "Midjourney", group: "生图片", sortOrder: 42 },
];

export function createBaseFoundationModel(def: BaseModelDefinition): FrontendModelItem {
    const isImage = def.capability === "image";
    return {
        id: def.id,
        code: def.code,
        displayName: def.displayName,
        subtitle: def.subtitle,
        showSubtitle: true,
        capability: def.capability,
        family: def.family,
        group: def.group,
        enabled: true,
        sortOrder: def.sortOrder,
        primaryChannelId: "",
        primaryProtocolType: "system",
        sourceCard: {
            channelId: "",
            channelName: "待接入主渠道",
            protocolType: "system",
            upstreamModelId: "",
            endpoint: "",
            authType: "Bearer Token",
            extractPath: "data.output",
            timeoutSeconds: 300,
            status: "untested",
        },
        fallbackChannels: [],
        candidateUpstreams: [],
        parameterPriorities: {},
        switchMatrix: isImage ? COMPREHENSIVE_IMAGE_SWITCHES : COMPREHENSIVE_VIDEO_SWITCHES,
        conditionalRoutes: [],
        durationThresholdRule: {
            enabled: false,
            thresholdSeconds: 10,
            targetChannelId: "",
            targetChannelName: "",
            targetModelId: "",
            unitPrice: 0,
        },
        billing: {
            unit: isImage ? "count" : "second",
            defaultCost: 0,
            defaultRatio: 1.6,
            defaultPrice: 0,
            tiers: [],
        },
    };
}

/** 系统预置的 42 个底座展示模型对象池 (作为可选模板底座) */
export const BASE_FOUNDATION_MODELS: FrontendModelItem[] = BASE_MODEL_DEFINITIONS.map(createBaseFoundationModel);

/** 初始展示模型母版 */
export const INITIAL_FRONTEND_MODELS: FrontendModelItem[] = BASE_FOUNDATION_MODELS;

/** 初始家族列表（包含所有 15 个主流厂商家族） */
export const INITIAL_FAMILIES: string[] = [
    "字节 Seedance",
    "MiniMax H3",
    "通义万相",
    "xAI Grok",
    "Google Omni",
    "欢乐马",
    "GPT Image 2",
    "谷歌 nanobanana",
    "字节 Seedream",
    "Midjourney",
    "快手 可灵",
    "智谱 GLM",
    "Sora",
    "Luma",
    "PixVerse",
];

/** 预置插件协议参考 */
export const INITIAL_PLUGIN_PROTOCOLS: PluginProtocolItem[] = [
    {
        id: "seedance-video-protocol",
        name: "Seedance 全模态视频协议",
        version: "v1.2.0",
        author: "系统适配",
        capability: "video",
        billingRule: "按秒计费",
        scope: "全量渠道",
        status: true,
        description: "标准 480p~1080p 视频生成协议，支持单图首帧、参考图与动态时长控制",
        canAutoRouteBySwitch: true,
    },
    {
        id: "wan3-video-protocol",
        name: "通义万相 3.0 协议",
        version: "v1.0.4",
        author: "系统适配",
        capability: "video",
        billingRule: "按秒计费",
        scope: "全量渠道",
        status: true,
        description: "万相 3.0 生视频接口协议，支持 references 结构与成对首尾帧约束",
        canAutoRouteBySwitch: true,
    },
    {
        id: "minimax-h3-protocol",
        name: "MiniMax 原生插件协议",
        version: "v1.1.0",
        author: "系统适配",
        capability: "video",
        billingRule: "按秒计费",
        scope: "专项渠道",
        status: true,
        description: "强制锁定 adaptive: true，支持 Context IR 语义增强与首尾帧自适应对齐",
        canAutoRouteBySwitch: true,
    },
    {
        id: "gpt-image-protocol",
        name: "OpenAI 图像与重绘协议",
        version: "v1.0.0",
        author: "系统内置",
        capability: "image",
        billingRule: "按次计费",
        scope: "全量渠道",
        status: true,
        description: "DALL-E 3 与 GPT Image 标准图像生成与 Inpaint 协议",
        canAutoRouteBySwitch: true,
    },
];

/** 预置渠道列表（交由后端动态加载） */
export const CHANNELS_PRESET: Array<{ id: string; name: string }> = [];

/** 渠道可用物理模型知识库（完全交由后端动态从各渠道实时获取与展示） */
export const CHANNEL_AVAILABLE_MODELS: ChannelAvailableModel[] = [];
// @opc-feature: model-smart-router [end]
