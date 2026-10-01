// @opc-feature: model-smart-router [start]
import type {
    AdminLogicalModel,
    LogicalModelMutation,
    CapabilitySpec,
} from "@/services/api/logical-models";
import type { ChannelModel, ChannelModelPriceTier } from "@/services/api/wallet";
import type { ModelChannel } from "@/stores/use-config-store";
import type {
    FrontendModelItem,
    UpstreamCandidateModel,
    ResolutionBillingTier,
    ParameterPriorityMap,
    SwitchFeatureItem,
    CapabilityType,
    ChannelSourceCard,
    DurationSettings,
} from "./types";
import {
    COMPREHENSIVE_VIDEO_SWITCHES,
    COMPREHENSIVE_IMAGE_SWITCHES,
} from "./mock-data";
import { capabilitySpecFromChannelModel, mergeCapabilitySpecs, sanitizeDefaults } from "../logical-models/model-routing-capabilities";

/** 从微积分转换至常规显示元 (1 元 = 1,000,000 微积分) */
export function microcreditsToYuan(microcredits: number): number {
    return Math.round((microcredits / 1_000_000) * 1000) / 1000;
}

/** 从元转换至微积分 */
export function yuanToMicrocredits(yuan: number): number {
    return Math.round(yuan * 1_000_000);
}

export interface ModelRouterExtraData {
    parameterPriorities?: ParameterPriorityMap;
    durationSettings?: DurationSettings;
    switchMatrix?: Array<{ key: string; showInFrontend?: boolean }>;
}

const STORAGE_KEY_PREFIX = "opc_model_router_extra_";
const memoryStorage = new Map<string, string>();

function getStorage(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void } | null {
    try {
        if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
        if (typeof localStorage !== "undefined") return localStorage;
    } catch {
        // 私密模式或无存储权限时回退至内存存储
    }
    return {
        getItem: (k: string) => memoryStorage.get(k) ?? null,
        setItem: (k: string, v: string) => { memoryStorage.set(k, v); },
    };
}

/** 读取跨会话持久化的扩展路由与参数看板配置 (localStorage) */
export function loadModelRouterExtra(modelIdOrCode: string): ModelRouterExtraData {
    const storage = getStorage();
    if (!modelIdOrCode || !storage) return {};
    try {
        const raw = storage.getItem(`${STORAGE_KEY_PREFIX}${modelIdOrCode}`);
        if (!raw) return {};
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

/** 写入跨会话持久化的扩展路由与参数看板配置 (localStorage) */
export function saveModelRouterExtra(modelIdOrCode: string, data: ModelRouterExtraData): void {
    const storage = getStorage();
    if (!modelIdOrCode || !storage) return;
    try {
        const existing = loadModelRouterExtra(modelIdOrCode);
        const merged = { ...existing, ...data };
        storage.setItem(`${STORAGE_KEY_PREFIX}${modelIdOrCode}`, JSON.stringify(merged));
    } catch (e) {
        console.warn("Failed to save model router extra data", e);
    }
}

/** 严格归一化模型能力类型，兼容数据库历史空值或遗留数据 */
export function resolveCapability(rawCapability?: string, modelKey?: string): CapabilityType {
    const norm = (rawCapability || "").trim().toLowerCase();
    if (norm === "image" || norm === "video" || norm === "text") {
        return norm as CapabilityType;
    }
    const key = (modelKey || "").toLowerCase();
    if (
        key.includes("video") ||
        key.includes("kling") ||
        key.includes("runway") ||
        key.includes("luma") ||
        key.includes("sora") ||
        key.includes("seedance") ||
        key.includes("h3") ||
        key.includes("wan") ||
        key.includes("cog")
    ) {
        return "video";
    }
    if (
        key.includes("chat") ||
        key.includes("claude") ||
        key.includes("deepseek") ||
        key.includes("qwen") ||
        key.includes("glm") ||
        (key.includes("gpt") && !key.includes("image"))
    ) {
        return "text";
    }
    return "image";
}

/** 判断给定的尺寸字符串是否属于 4K 级别 (如 3840x2160、2880x2880、3808x1632 或 4k/4096) */
export function is4KImageSize(s: string): boolean {
    const lower = s.toLowerCase().trim();
    if (lower.includes("4k") || lower.includes("4096")) return true;
    const match = lower.match(/^(\d{3,5})\s*[x*×_]\s*(\d{3,5})$/);
    if (match) {
        const w = parseInt(match[1], 10);
        const h = parseInt(match[2], 10);
        if (!isNaN(w) && !isNaN(h)) {
            if (w * h >= 6_000_000 || Math.max(w, h) >= 3000) return true;
        }
    }
    return false;
}

/** 判断给定的尺寸字符串是否属于 2K 级别 (如 2048x2048、2752x1536、2304x1728、2496x1664、2560x1440、1920x1080) */
export function is2KImageSize(s: string): boolean {
    const lower = s.toLowerCase().trim();
    if (lower.includes("2k") || lower.includes("2048")) return true;
    const match = lower.match(/^(\d{3,5})\s*[x*×_]\s*(\d{3,5})$/);
    if (match) {
        const w = parseInt(match[1], 10);
        const h = parseInt(match[2], 10);
        if (!isNaN(w) && !isNaN(h)) {
            if (w * h >= 2_000_000 && w * h < 6_000_000 && Math.max(w, h) < 3000) return true;
        }
    }
    return false;
}

/** 判断给定的尺寸字符串是否属于 1K 级别 (如 1024x1024、1824x1024、1024x1824) */
export function is1KImageSize(s: string): boolean {
    const lower = s.toLowerCase().trim();
    if (lower.includes("1k") || lower.includes("1024")) return true;
    const match = lower.match(/^(\d{3,5})\s*[x*×_]\s*(\d{3,5})$/);
    if (match) {
        const w = parseInt(match[1], 10);
        const h = parseInt(match[2], 10);
        if (!isNaN(w) && !isNaN(h)) {
            if (w * h < 2_000_000 && Math.max(w, h) <= 1824) return true;
        }
    }
    return false;
}

/** 从能力画像推导该上游物理模型支持的看板参数 key 列表 */
export function extractSupportedParameterKeys(
    capability: CapabilityType,
    spec: CapabilitySpec | null | undefined,
    priceTiers?: ChannelModelPriceTier[]
): string[] {
    const keys: string[] = [];

    if (capability === "video") {
        if (spec) {
            // 分辨率：同时提取 vquality、priceTiers 与 spec.options.size
            const vqualities = (spec.options?.vquality?.values || []) as string[];
            const resolutions = new Set<string>(vqualities.map((v) => String(v).toLowerCase()));
            if (priceTiers?.length) {
                priceTiers.forEach((tier) => {
                    if (tier.resolution) resolutions.add(tier.resolution.toLowerCase());
                    if (tier.selector?.resolution) resolutions.add(tier.selector.resolution.toLowerCase());
                    if (tier.selector?.quality) resolutions.add(tier.selector.quality.toLowerCase());
                    if (tier.selector?.vquality) resolutions.add(tier.selector.vquality.toLowerCase());
                    if (tier.selector?.size) resolutions.add(tier.selector.size.toLowerCase());
                });
            }
            // 读取尺寸列表中可能包含的分辨率像元
            const rawSizes = (spec.options?.size?.values || []) as string[];
            for (const s of rawSizes) {
                resolutions.add(s.toLowerCase());
            }
            for (const res of resolutions) {
                if (res.includes("480")) keys.push("res_480p");
                if (res.includes("720")) keys.push("res_720p");
                if (res.includes("1080")) keys.push("res_1080p");
                if (res.includes("768")) keys.push("res_768p");
                if (res.includes("2k") || res.includes("1440") || is2KImageSize(res)) keys.push("res_2k");
                if (res.includes("4k") || res.includes("2160") || is4KImageSize(res)) keys.push("res_4k");
            }

            // 画幅比例
            const sizes = (spec.options?.size?.values || []) as string[];
            for (const s of sizes) {
                if (s === "16:9") keys.push("ratio_16_9");
                if (s === "9:16") keys.push("ratio_9_16");
                if (s === "1:1") keys.push("ratio_1_1");
                if (s === "3:4") keys.push("ratio_3_4");
                if (s === "4:3") keys.push("ratio_4_3");
                if (s === "21:9") keys.push("ratio_21_9");
                if (s === "auto" || s === "adaptive") keys.push("ratio_auto");
            }

            // 时长
            if (spec.options?.videoSeconds) {
                keys.push("duration_continuous");
            }

            // 多模态输入参考
            const imgInput = spec.inputs?.image;
            if (imgInput) {
                if (imgInput.max >= 1) keys.push("first_frame");
                if (imgInput.max >= 2) {
                    keys.push("first_last_frame");
                    keys.push("multi_ref");
                    keys.push("omni_ref");
                }
            }
            const vidInput = spec.inputs?.video;
            if (vidInput && vidInput.max >= 1) {
                keys.push("motion_reference", "video_editing", "video_continuation");
            }

            // 同步音频与水印
            const audioOpt = spec.options?.videoGenerateAudio?.values as boolean[] | undefined;
            if (audioOpt && audioOpt.includes(true)) {
                keys.push("audio_generation");
            }
            const wmOpt = spec.options?.videoWatermark?.values as boolean[] | undefined;
            if (wmOpt && wmOpt.includes(true)) {
                keys.push("watermark_removal");
            }

            // 音频对口型
            const audioInput = spec.inputs?.audio;
            if (audioInput && audioInput.max >= 1) {
                keys.push("audio_lip_sync");
            }

            // 60帧率
            const fpsValues = (spec.options as any)?.fps?.values as number[] | undefined;
            if (fpsValues && fpsValues.includes(60)) {
                keys.push("fps_60");
            }

            // 种子锁定 (通用能力)
            keys.push("seed_lock");
        }

        // 视频模型通用保底规格
        if (!keys.some((k) => k.startsWith("ratio_"))) {
            keys.push("ratio_16_9", "ratio_9_16", "ratio_1_1", "ratio_auto");
        } else if (!keys.includes("ratio_auto")) {
            keys.push("ratio_auto");
        }
        if (!keys.some((k) => k.startsWith("res_"))) {
            keys.push("res_720p", "res_1080p");
        }
        if (!keys.includes("first_frame")) {
            keys.push("first_frame");
        }
        if (!keys.includes("duration_continuous")) {
            keys.push("duration_continuous");
        }
        if (!keys.includes("seed_lock")) {
            keys.push("seed_lock");
        }
    } else if (capability === "image") {
        // 图片尺寸 / 分辨率：支持从 spec.options.size、imageSize.presets、quality 及 priceTiers 统一深度提取
        const sizes = new Set<string>((spec?.options?.size?.values || []) as string[]);
        if (priceTiers?.length) {
            priceTiers.forEach((tier) => {
                if (tier.resolution) sizes.add(tier.resolution.toLowerCase());
                if (tier.selector?.size) sizes.add(tier.selector.size.toLowerCase());
                if (tier.selector?.ratio) sizes.add(tier.selector.ratio.toLowerCase());
                if (tier.selector?.aspect_ratio) sizes.add(tier.selector.aspect_ratio.toLowerCase());
            });
        }

        // 1. 深度识别图片尺寸与像元分辨率
        sizes.forEach((s) => {
            if (is1KImageSize(s)) keys.push("res_1k");
            if (is2KImageSize(s)) keys.push("res_2k");
            if (is4KImageSize(s)) keys.push("res_4k");
            if (s.includes("16:9") || s === "16:9") keys.push("ratio_16_9");
            if (s.includes("9:16") || s === "9:16") keys.push("ratio_9_16");
            if (s.includes("1:1") || s === "1:1") keys.push("ratio_1_1");
            if (s.includes("3:4") || s === "3:4") keys.push("ratio_3_4");
            if (s.includes("4:3") || s === "4:3") keys.push("ratio_4_3");
            if (s.includes("21:9") || s === "21:9") keys.push("ratio_21_9");
        });

        // 2. 深度读取预设 presets（系统渠道勾选 4K/2K/1K 会完整保存在 imageSize.presets）
        if (spec?.imageSize?.presets?.length) {
            spec.imageSize.presets.forEach((p) => {
                if (p.tier === "4k" || is4KImageSize(p.size)) keys.push("res_4k");
                if (p.tier === "2k" || is2KImageSize(p.size)) keys.push("res_2k");
                if (p.tier === "1k" || is1KImageSize(p.size)) keys.push("res_1k");
                if (p.ratio === "16:9") keys.push("ratio_16_9");
                if (p.ratio === "9:16") keys.push("ratio_9_16");
                if (p.ratio === "1:1") keys.push("ratio_1_1");
                if (p.ratio === "3:4") keys.push("ratio_3_4");
                if (p.ratio === "4:3") keys.push("ratio_4_3");
                if (p.ratio === "21:9") keys.push("ratio_21_9");
            });
        }

        // 3. 深度读取图片质量 quality 参数
        const qualityValues = (spec?.options?.quality?.values || []) as string[];
        qualityValues.forEach((qv) => {
            const qLower = String(qv).toLowerCase();
            if (qLower === "4k" || qLower === "high" || qLower === "ultra") keys.push("res_4k", "quality_hd");
            if (qLower === "2k" || qLower === "medium") keys.push("res_2k");
            if (qLower === "1k" || qLower === "low") keys.push("res_1k");
            if (qLower.includes("hd") || qLower.includes("high")) keys.push("quality_hd");
        });

        // 4. 透明背景、局部重绘、生成张数、多图参考、提示词扩写
        const transOpt = spec?.options?.transparentBackground?.values as boolean[] | undefined;
        if (transOpt && transOpt.includes(true)) {
            keys.push("transparent_bg");
        }
        const maskInput = spec?.inputs?.mask;
        if (maskInput && maskInput.max >= 1) {
            keys.push("inpaint_mask");
        }
        const countOpt = spec?.options?.count;
        if (countOpt && (countOpt.max ?? 1) > 1) {
            keys.push("batch_count");
        }
        const imgInput = spec?.inputs?.image;
        if (imgInput && imgInput.max >= 2) {
            keys.push("multi_ref_synthesis");
        }
        keys.push("prompt_expansion", "batch_count");

        // 参考图 / 图生图
        if (imgInput && imgInput.max >= 1) {
            keys.push("image_reference");
        } else {
            keys.push("image_reference");
        }

        // 默认基础画幅保底
        if (!keys.some((k) => k.startsWith("ratio_"))) {
            keys.push("ratio_1_1", "ratio_16_9", "ratio_9_16");
        }
        if (!keys.some((k) => k.startsWith("res_"))) {
            keys.push("res_1k");
        }
    }

    return Array.from(new Set(keys));
}

/** 统一计算物理或展示模型的最高分辨率标识 (严格联动 4K 像元与视频全分辨率档位) */
export function resolveMaxResolution(
    capability: CapabilityType,
    supportedParameters: string[],
    priceTiers?: ChannelModelPriceTier[],
    vqualities?: string[]
): string {
    if (capability === "image") {
        if (supportedParameters.includes("res_4k")) {
            return "4K 超清";
        } else if (supportedParameters.includes("res_2k")) {
            return "2K 高清";
        } else if (supportedParameters.includes("res_1k")) {
            return "1K (1024x1024)";
        } else {
            const tierRes = priceTiers?.map((t) => t.resolution).filter(Boolean) || [];
            if (tierRes.some((r) => is4KImageSize(r))) {
                return "4K 超清";
            } else if (tierRes.some((r) => is2KImageSize(r))) {
                return "2K 高清";
            } else if (tierRes.some((r) => is1KImageSize(r))) {
                return "1K (1024x1024)";
            } else if (tierRes.length > 0) {
                return tierRes[tierRes.length - 1];
            } else {
                return "2K 高清";
            }
        }
    } else if (capability === "video") {
        if (supportedParameters.includes("res_4k")) {
            return "4K (2160p)";
        } else if (supportedParameters.includes("res_2k")) {
            return "2K (1440p)";
        } else if (supportedParameters.includes("res_1080p")) {
            return "1080p";
        } else if (supportedParameters.includes("res_768p")) {
            return "768p";
        } else if (supportedParameters.includes("res_720p")) {
            return "720p";
        } else if (supportedParameters.includes("res_480p")) {
            return "480p";
        } else if (vqualities && vqualities.length > 0) {
            return vqualities[vqualities.length - 1];
        } else {
            return "1080p";
        }
    }
    return "1080p";
}

/** 将后端 AdminLogicalModel 完整适配为前端展示模型 FrontendModelItem */
export function logicalModelToFrontendItem(
    logical: AdminLogicalModel,
    channels: ModelChannel[],
    channelModels: ChannelModel[]
): FrontendModelItem {
    const channelMap = new Map(channels.map((c) => [c.id, c]));
    const channelModelMap = new Map(channelModels.map((cm) => [cm.id, cm]));
    const effectiveCap = resolveCapability(logical.capability, logical.code || logical.id);
    const isImage = effectiveCap === "image";
    const isVideo = effectiveCap === "video";

    // 候选线路按后端 priority 降序排列 (数值越大，优先级越高，P1 首选路线排在首位)
    const sortedRoutes = [...(logical?.routes || [])].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    // 转换候选线路
    const candidateUpstreams: UpstreamCandidateModel[] = sortedRoutes.map((route) => {
        const cm = channelModelMap.get(route.channelModelId);
        const ch = channelMap.get(route.channelId) || (cm ? channelMap.get(cm.channelId) : undefined);

        const cmSpec = cm ? capabilitySpecFromChannelModel(cm) : null;
        // 融合真实渠道模型的能力规格与已有路由规格，确保系统渠道修改的能力（如开启 4K、调整秒数与画幅）实时同步
        const spec = cmSpec && route.capabilitySpec ? mergeCapabilitySpecs(effectiveCap, [route.capabilitySpec, cmSpec]) : (cmSpec || route.capabilitySpec);
        const supportedParameters = extractSupportedParameterKeys(
            effectiveCap,
            spec,
            cm?.priceTiers
        );

        const vqualities = (spec?.options?.vquality?.values || []) as string[];
        const ratios = (spec?.options?.size?.values || []) as string[];
        const durationOpt = spec?.options?.videoSeconds;
        let durationRange: string | undefined = undefined;
        if (isVideo) {
            durationRange = "5s";
            if (durationOpt) {
                const numVals = Array.isArray(durationOpt.values) ? durationOpt.values.map(Number).filter((n) => !isNaN(n)) : [];
                if (numVals.length > 0) {
                    durationRange = `${Math.min(...numVals)}s ~ ${Math.max(...numVals)}s`;
                } else if (typeof durationOpt.min === "number" && typeof durationOpt.max === "number") {
                    durationRange = `${durationOpt.min}s ~ ${durationOpt.max}s`;
                }
            } else if (cm?.priceTiers?.some((t) => t.videoSeconds > 0)) {
                const secs = cm.priceTiers.map((t) => t.videoSeconds).filter((s) => s > 0);
                durationRange = `${Math.min(...secs)}s ~ ${Math.max(...secs)}s`;
            }
        }

        // 分辨率计算：严格联动 supportedParameters，精准呈现 4K / 2K / 1080p
        const maxResolution = resolveMaxResolution(
            effectiveCap,
            supportedParameters,
            cm?.priceTiers,
            vqualities
        );

        const aspectRatios = ratios.length > 0
            ? ratios
            : (isImage ? ["1:1", "16:9", "9:16", "3:4", "4:3"] : ["16:9", "9:16", "1:1"]);

        const modalities = isImage
            ? ["Text-to-Image (文生图)", "Image-to-Image (图生图/参考图)"]
            : isVideo
            ? ["Text-to-Video (文生视频)", "Image-to-Video (图生视频/首尾帧)"]
            : ["Text (纯文本)"];

        return {
            id: route.id || `cand-${route.channelId}-${route.channelModelKey}`,
            channelId: route.channelId || cm?.channelId || "",
            channelName: ch?.name || "未知渠道",
            upstreamModelId: route.channelModelKey || cm?.providerModelKey || cm?.modelKey || "",
            channelModelId: route.channelModelId,
            channelProtocol: cm?.protocol,
            protocolType: (cm?.protocol && String(cm.protocol).includes("plugin") ? "plugin" : "system") as any,
            endpoint: ch?.baseUrl || "",
            authType: "Bearer Token",
            extractPath: "data.output",
            timeoutSeconds: 300,
            enabled: route.enabled,
            supportedParameters,
            status: route.available ? "healthy" : "untested",
            parameterSpecs: {
                maxResolution,
                durationRange,
                aspectRatios,
                modalities,
                notes: cm?.description || `真实渠道物理模型已接入（${isImage ? "生图片" : "生视频"}）`,
            },
        };
    });

    // P1 主力来源卡片 (取已启用的最高优先级线路)
    const primaryRoute = sortedRoutes.find((r) => r.enabled) || sortedRoutes[0];
    const primaryCM = primaryRoute ? channelModelMap.get(primaryRoute.channelModelId) : undefined;
    const primaryCH = primaryRoute ? channelMap.get(primaryRoute.channelId) || (primaryCM ? channelMap.get(primaryCM.channelId) : undefined) : undefined;

    const sourceCard: ChannelSourceCard = {
        channelId: primaryRoute?.channelId || primaryCH?.id || "",
        channelName: primaryCH?.name || "未指定主渠道",
        channelProtocol: primaryCM?.protocol,
        protocolType: (primaryCM?.protocol && String(primaryCM.protocol).includes("plugin") ? "plugin" : "system") as any,
        upstreamModelId: primaryRoute?.channelModelKey || primaryCM?.providerModelKey || primaryCM?.modelKey || "",
        endpoint: primaryCH?.baseUrl || "",
        authType: "Bearer Token",
        extractPath: "data.output",
        timeoutSeconds: 300,
        status: primaryRoute?.available ? "healthy" : "untested",
    };

    const extraKey = logical.id || logical.code || "";
    const extra: ModelRouterExtraData = {
        ...loadModelRouterExtra(logical.code || ""),
        ...loadModelRouterExtra(logical.id || ""),
        ...loadModelRouterExtra(extraKey),
    };

    // 同参数优先级：优先读取用户已保存的单参数路由映射，未设置时默认由系统按 defaultCandidatePriority 兜底 ("default")
    const parameterPriorities: ParameterPriorityMap = extra.parameterPriorities ? { ...extra.parameterPriorities } : {};

    // 计费档位：读取真实 priceTiers
    const tiers: ResolutionBillingTier[] = (logical.priceTiers || []).map((pt, idx) => {
        const userPrice = microcreditsToYuan(pt.unitPriceMicrocredits);
        let matchedParameterKey = "none";
        let matchedParameterLabel = "无 (基础画面 / 默认)";
        if (pt.selector?.videoGenerateAudio === "true") {
            matchedParameterKey = "audio_generation";
            matchedParameterLabel = "生成声音";
        } else if (pt.selector?.imageCount === "2") {
            matchedParameterKey = isVideo ? "first_last_frame" : "multi_ref";
            matchedParameterLabel = isVideo ? "首尾帧" : "多图参考";
        } else if (pt.selector?.imageCount === "1") {
            matchedParameterKey = "first_frame";
            matchedParameterLabel = "首帧参考";
        } else if (pt.selector?.operation === "image_to_image" || pt.selector?.operation === "image_to_video") {
            matchedParameterKey = "image_reference";
            matchedParameterLabel = "参考图";
        } else if (pt.selector?.quality === "hd" || pt.selector?.quality === "ultra") {
            matchedParameterKey = "quality_hd";
            matchedParameterLabel = "超清画质";
        }

        let res = pt.resolution || "*";
        if (isImage) {
            if (pt.selector?.quality) {
                res = pt.selector.quality;
            } else if (pt.selector?.size) {
                res = pt.selector.size;
            }
        }

        return {
            id: `tier-${idx}-${res}`,
            resolution: res,
            upstreamCost: Math.round(userPrice * 0.6 * 1000) / 1000,
            matchedParameterKey,
            matchedParameterLabel,
            surchargeCost: 0,
            markupRatio: 1.6,
            userPrice,
            isDefault: res === "*" || idx === 0,
        };
    });

    // 默认单价
    const defaultPrice = microcreditsToYuan(logical.unitPriceMicrocredits || 0);

    // 构造模型分类与家族
    const rawCode = logical?.code || (logical as any)?.key || "";
    const family = rawCode ? (rawCode.split(/[-_.]/)[0].toUpperCase() || "通用家族") : "通用家族";
    const group = effectiveCap === "video" ? "生视频" : effectiveCap === "image" ? "生图片" : "智能中枢";

    // 常规开关控制看板：融合保存的前台展示显隐状态
    const baseSwitches = effectiveCap === "image" ? COMPREHENSIVE_IMAGE_SWITCHES : COMPREHENSIVE_VIDEO_SWITCHES;
    const savedSwitchMap = new Map((extra.switchMatrix || []).map((s) => [s.key, s.showInFrontend]));
    const switchMatrix: SwitchFeatureItem[] = baseSwitches.map((sw) => {
        const hasProvider = candidateUpstreams.some((c) => c.supportedParameters.includes(sw.key));
        const showInFrontend = savedSwitchMap.has(sw.key) ? Boolean(savedSwitchMap.get(sw.key)) : true;
        return {
            ...sw,
            channelDefault: hasProvider,
            forcedEnabled: true,
            showInFrontend,
        };
    });

    // 时长与秒数控制：从 extra 读取，或从 capabilitySpec.options.videoSeconds 智能推导
    let initialDurationSettings: DurationSettings | undefined = undefined;
    if (isVideo) {
        const durationOpt = logical.capabilitySpec?.options?.videoSeconds;
        let minSec = 2;
        let maxSec = 15;
        let isLocked = false;
        let lockedSec = 5;

        if (durationOpt) {
            const numVals = Array.isArray(durationOpt.values) ? durationOpt.values.map(Number).filter((n) => !isNaN(n)) : [];
            if (numVals.length === 1) {
                isLocked = true;
                lockedSec = numVals[0];
                minSec = numVals[0];
                maxSec = numVals[0];
            } else if (numVals.length > 1) {
                minSec = Math.min(...numVals);
                maxSec = Math.max(...numVals);
            } else if (typeof durationOpt.min === "number" && typeof durationOpt.max === "number") {
                minSec = durationOpt.min;
                maxSec = durationOpt.max;
                if (minSec === maxSec) {
                    isLocked = true;
                    lockedSec = minSec;
                }
            }
        }
        initialDurationSettings = extra.durationSettings || {
            minSeconds: minSec,
            maxSeconds: maxSec,
            isLocked,
            lockedSeconds: lockedSec,
            maxDurationRouteEnabled: false,
            maxDurationTargetCandidateId: candidateUpstreams[0]?.id,
        };
    }

    // 生成合理的默认多规格矩阵档位
    const defaultTiers: ResolutionBillingTier[] = isImage
        ? [
            {
                id: "tier-1k",
                resolution: "1k",
                upstreamCost: Math.round((defaultPrice || 0.05) * 0.6 * 1000) / 1000,
                matchedParameterKey: "none",
                matchedParameterLabel: "无 (基础画面 / 默认)",
                surchargeCost: 0,
                markupRatio: 1.6,
                userPrice: defaultPrice || 0.05,
                isDefault: true,
            },
            {
                id: "tier-2k",
                resolution: "2k",
                upstreamCost: Math.round((defaultPrice || 0.05) * 1.5 * 0.6 * 1000) / 1000,
                matchedParameterKey: "none",
                matchedParameterLabel: "无 (基础画面 / 默认)",
                surchargeCost: 0,
                markupRatio: 1.6,
                userPrice: Math.round((defaultPrice || 0.05) * 1.5 * 1000) / 1000,
                isDefault: false,
            },
            {
                id: "tier-4k",
                resolution: "4k",
                upstreamCost: Math.round((defaultPrice || 0.05) * 2.5 * 0.6 * 1000) / 1000,
                matchedParameterKey: "none",
                matchedParameterLabel: "无 (基础画面 / 默认)",
                surchargeCost: 0,
                markupRatio: 1.6,
                userPrice: Math.round((defaultPrice || 0.05) * 2.5 * 1000) / 1000,
                isDefault: false,
            },
        ]
        : [
            {
                id: "tier-720p",
                resolution: "720p",
                upstreamCost: Math.round((defaultPrice || 0.1) * 0.6 * 1000) / 1000,
                matchedParameterKey: "none",
                matchedParameterLabel: "无 (基础画面 / 默认)",
                surchargeCost: 0,
                markupRatio: 1.6,
                userPrice: defaultPrice || 0.1,
                isDefault: true,
            },
            {
                id: "tier-1080p",
                resolution: "1080p",
                upstreamCost: Math.round((defaultPrice || 0.1) * 1.5 * 0.6 * 1000) / 1000,
                matchedParameterKey: "none",
                matchedParameterLabel: "无 (基础画面 / 默认)",
                surchargeCost: 0,
                markupRatio: 1.6,
                userPrice: Math.round((defaultPrice || 0.1) * 1.5 * 1000) / 1000,
                isDefault: false,
            },
        ];

    return {
        id: logical.id || logical.code,
        code: logical.code,
        displayName: logical.name || logical.code,
        subtitle: logical.description || "",
        showSubtitle: Boolean(logical.description),
        capability: effectiveCap,
        family,
        group,
        iconUrl: logical.icon || "",
        enabled: logical.enabled,
        sortOrder: logical.sortOrder || 1,
        primaryChannelId: sourceCard.channelId,
        primaryProtocolType: sourceCard.protocolType,
        sourceCard,
        fallbackChannels: [],
        candidateUpstreams,
        parameterPriorities,
        defaultCandidatePriority: candidateUpstreams.map((c) => c.id),
        switchMatrix,
        durationSettings: initialDurationSettings,
        conditionalRoutes: [],
        durationThresholdRule: {
            enabled: false,
            thresholdSeconds: 10,
            targetChannelId: "",
            targetChannelName: "",
            targetModelId: "",
            unitPrice: defaultPrice,
        },
        billing: {
            pricingMode: logical.pricePolicy === "unified" ? "unified" : "matrix",
            unit: logical.billingMode === "per_second" ? "second" : "count",
            defaultCost: Math.round(defaultPrice * 0.6 * 1000) / 1000,
            defaultRatio: 1.6,
            defaultPrice,
            tiers: tiers.length > 0 ? tiers : defaultTiers,
            surcharges: [],
        },
    };
}

/** 将前端展示模型 FrontendModelItem 转换为后端可保存的 LogicalModelMutation */
export function frontendItemToLogicalModelMutation(
    item: FrontendModelItem,
    existingLogical?: AdminLogicalModel,
    channelModels: ChannelModel[] = []
): LogicalModelMutation {
    // 规范化 code 优先保留真实模型标识码，满足后端小写字母/数字/点/划线正则 (2-80位)
    const targetCode = existingLogical?.code || item.code || item.id || "";
    let cleanCode = targetCode.toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/^[._-]+/, "");
    if (cleanCode.length < 2) cleanCode = `m-${cleanCode || "model"}`;
    if (cleanCode.length > 80) cleanCode = cleanCode.slice(0, 80);

    // 候选路线优先级调度：
    // 后端选路 Priority 数值越大优先级越高 (Go model_router: route.Route.Priority > maxPriority)。
    // 前端若配置了 defaultCandidatePriority，优先按其排定顺序；否则按 candidateUpstreams 数组顺序。
    // 首选路线 (P1, idx 0) 获得最高 Priority (如 100)，后续顺位依次递减 (90, 80, ...)。
    let orderedCandidates = [...(item.candidateUpstreams || [])];
    if (item.defaultCandidatePriority && item.defaultCandidatePriority.length > 0) {
        const priorityOrder = item.defaultCandidatePriority;
        orderedCandidates.sort((a, b) => {
            const idxA = priorityOrder.indexOf(a.id);
            const idxB = priorityOrder.indexOf(b.id);
            const orderA = idxA === -1 ? 9999 : idxA;
            const orderB = idxB === -1 ? 9999 : idxB;
            return orderA - orderB;
        });
    }

    // 构造 routes，过滤掉无真实物理渠道模型 ID 的无效条目
    const routes = orderedCandidates
        .map((cand, idx) => {
            const resolvedCMId = cand.channelModelId || (cand.id?.startsWith("cand-") ? undefined : cand.id);
            return {
                channelModelId: resolvedCMId || "",
                enabled: cand.enabled !== false,
                priority: Math.max(1, 100 - idx * 10),
                weight: 100,
            };
        })
        .filter((r) => Boolean(r.channelModelId));

    const defaultUnitPrice = yuanToMicrocredits(item.billing?.defaultPrice || 0);

    // 自动从 candidateUpstreams 关联的渠道物理模型提取全部参数画像并合成，绝不写入空规格
    const sourceSpecs: CapabilitySpec[] = [];
    const cms = channelModels || [];
    for (const cand of item.candidateUpstreams || []) {
        const resolvedCMId = cand.channelModelId || (cand.id?.startsWith("cand-") ? undefined : cand.id);
        const cm = cms.find(
            (m) =>
                (resolvedCMId && m.id === resolvedCMId) ||
                (cand.channelId && m.channelId === cand.channelId && m.modelKey === cand.upstreamModelId) ||
                m.modelKey === cand.upstreamModelId
        );
        if (cm) {
            const spec = capabilitySpecFromChannelModel(cm);
            if (spec) sourceSpecs.push(spec);
        }
    }

    let capabilitySpec: CapabilitySpec;
    if (sourceSpecs.length > 0) {
        capabilitySpec = mergeCapabilitySpecs(item.capability as any, sourceSpecs);
    } else if (
        existingLogical?.capabilitySpec &&
        (Object.keys(existingLogical.capabilitySpec.inputs || {}).length > 0 ||
            Object.keys(existingLogical.capabilitySpec.options || {}).length > 0 ||
            existingLogical.capabilitySpec.imageSize)
    ) {
        capabilitySpec = existingLogical.capabilitySpec;
    } else if (item.capability === "video") {
        capabilitySpec = {
            version: 1,
            capability: "video",
            operations: ["text-to-video", "image-to-video"],
            inputs: {
                image: { min: 0, max: 2 },
                video: { min: 0, max: 1 },
                audio: { min: 0, max: 1 },
            },
            options: {
                videoSeconds: { values: [5, 10] },
                size: { values: ["16:9", "9:16", "1:1"] },
                vquality: { values: ["720p", "1080p"] },
                videoGenerateAudio: { values: [false, true] },
                videoWatermark: { values: [false, true] },
            },
        };
    } else if (item.capability === "image") {
        capabilitySpec = {
            version: 1,
            capability: "image",
            operations: [],
            inputs: {
                image: { min: 0, max: 16 },
                mask: { min: 0, max: 1 },
            },
            options: {
                size: { values: ["1:1", "16:9", "9:16", "4:3", "3:4"] },
            },
            imageSize: {
                parameter: "size",
                allowCustom: true,
            },
        };
    } else {
        capabilitySpec = {
            version: 1,
            capability: item.capability as any,
            operations: [],
            inputs: {},
            options: {},
        };
    }

    // 若配置了秒数控制 (锁定秒数或秒数区间)，强制写入 capabilitySpec.options.videoSeconds
    if (item.capability === "video" && item.durationSettings) {
        capabilitySpec.options = capabilitySpec.options || {};
        if (item.durationSettings.isLocked) {
            capabilitySpec.options.videoSeconds = {
                values: [item.durationSettings.lockedSeconds],
            };
        } else {
            capabilitySpec.options.videoSeconds = {
                min: item.durationSettings.minSeconds,
                max: item.durationSettings.maxSeconds,
                values: [item.durationSettings.minSeconds, item.durationSettings.maxSeconds],
            };
        }
    }

    const defaultOptions = sanitizeDefaults(capabilitySpec, existingLogical?.defaultOptions || {});
    const isUnified = item.billing?.pricingMode
        ? item.billing.pricingMode === "unified"
        : (existingLogical?.pricePolicy ? existingLogical.pricePolicy === "unified" : (!item.billing?.tiers || item.billing.tiers.length <= 1));

    // 持久化扩展配置（单参数路由优先级、秒数与最大秒数策略、前台展示开关）
    const extraKey = item.id || item.code || cleanCode;
    const extraDataToSave: ModelRouterExtraData = {
        parameterPriorities: item.parameterPriorities,
        durationSettings: item.durationSettings,
        switchMatrix: (item.switchMatrix || []).map((s) => ({
            key: s.key,
            showInFrontend: s.showInFrontend,
        })),
    };
    saveModelRouterExtra(extraKey, extraDataToSave);
    if (item.code && item.code !== extraKey) {
        saveModelRouterExtra(item.code, extraDataToSave);
    }
    if (cleanCode && cleanCode !== extraKey && cleanCode !== item.code) {
        saveModelRouterExtra(cleanCode, extraDataToSave);
    }

    return {
        code: cleanCode,
        name: item.displayName,
        icon: item.iconUrl || item.iconEmoji || "",
        description: item.subtitle || "",
        capability: item.capability as any,
        enabled: item.enabled !== false,
        sortOrder: item.sortOrder || 1,
        pricePolicy: isUnified ? "unified" : "channel",
        billingMode: item.billing?.unit === "second" ? "per_second" : "fixed_request",
        unitPriceMicrocredits: defaultUnitPrice,
        inputPriceMicrocredits: 0,
        outputPriceMicrocredits: 0,
        cachedPriceMicrocredits: 0,
        legacyModelIds: existingLogical?.legacyModelIds || [],
        capabilitySpec,
        defaultOptions,
        routes,
    };
}

/** 将前端多规格矩阵价格档转换为后端渠道模型所需的 ChannelModelPriceTier 列表 */
export function convertMatrixTiersToChannelPriceTiers(
    capability: CapabilityType,
    tiers: ResolutionBillingTier[],
    billingMode: "fixed_request" | "per_second",
    defaultPrice: number
): Array<Omit<ChannelModelPriceTier, "id" | "channelModelId" | "selectorKey" | "priceVersion" | "createdAt" | "updatedAt">> {
    const isImage = capability === "image";
    const result: Array<Omit<ChannelModelPriceTier, "id" | "channelModelId" | "selectorKey" | "priceVersion" | "createdAt" | "updatedAt">> = [];
    const seenSelectors = new Set<string>();

    const safeTiers = (tiers && tiers.length > 0) ? tiers : [];

    for (const t of safeTiers) {
        const selector: Record<string, string> = {};
        let resolution = "*";
        const unitPriceMicrocredits = yuanToMicrocredits(t.userPrice || defaultPrice || 0);

        if (isImage) {
            resolution = "*";
            const resLower = (t.resolution || "1k").toLowerCase().trim();
            if (resLower === "1k" || resLower === "2k" || resLower === "4k") {
                selector["quality"] = resLower;
            } else if (resLower.includes("x")) {
                selector["size"] = resLower;
            } else if (resLower !== "*") {
                selector["quality"] = resLower;
            }

            if (t.matchedParameterKey === "image_reference") {
                selector["operation"] = "image_to_image";
            } else if (t.matchedParameterKey === "quality_hd") {
                selector["quality"] = "hd";
            }
        } else if (capability === "video") {
            const resLower = (t.resolution || "720p").toLowerCase().trim();
            resolution = resLower;
            if (resLower !== "*") {
                selector["vquality"] = resLower;
            }
            if (t.matchedParameterKey === "audio_generation") {
                selector["videoGenerateAudio"] = "true";
            } else if (t.matchedParameterKey === "first_last_frame" || t.matchedParameterKey === "multi_ref") {
                selector["imageCount"] = "2";
            } else if (t.matchedParameterKey === "first_frame") {
                selector["imageCount"] = "1";
            } else if (t.matchedParameterKey === "motion_reference") {
                selector["operation"] = "video_to_video";
            }
        }

        // 构造唯一性 key 防止同一 selector 重复落库报错
        const selectorKey = JSON.stringify(Object.keys(selector).sort().reduce((acc, k) => {
            acc[k] = selector[k];
            return acc;
        }, {} as Record<string, string>)) + `:${resolution}`;

        if (seenSelectors.has(selectorKey)) {
            continue;
        }
        seenSelectors.add(selectorKey);

        result.push({
            selector,
            resolution,
            videoSeconds: 0,
            providerModelKey: "",
            billingMode,
            unitPriceMicrocredits,
            inputTokenPriceMicrocredits: 0,
            outputTokenPriceMicrocredits: 0,
            cachedTokenPriceMicrocredits: 0,
            priceConfigured: true,
            enabled: true,
        });
    }

    // 保底：确保至少存在一个默认通配价格档 (resolution: "*", selector: {})，防止未覆盖规格完全无法报价
    const wildcardKey = JSON.stringify({}) + ":*";
    if (!seenSelectors.has(wildcardKey)) {
        result.unshift({
            selector: {},
            resolution: "*",
            videoSeconds: 0,
            providerModelKey: "",
            billingMode,
            unitPriceMicrocredits: yuanToMicrocredits(defaultPrice || 0),
            inputTokenPriceMicrocredits: 0,
            outputTokenPriceMicrocredits: 0,
            cachedTokenPriceMicrocredits: 0,
            priceConfigured: true,
            enabled: true,
        });
    }

    return result;
}

export interface AssociatedChannelRouteDetail {
    routeId?: string;
    upstreamModelId: string;
    sourceType: "primary" | "candidate" | "fallback";
    protocolType?: "system" | "plugin";
    endpoint?: string;
    status?: "healthy" | "warning" | "error" | "untested";
    lastLatencyMs?: number;
    enabled?: boolean;
    channelModelId?: string;
}

export interface AssociatedChannelInfo {
    channelId: string;
    channelName: string;
    isPrimary: boolean;
    upstreamModels: string[];
    primaryUpstreamModel?: string;
    routes: AssociatedChannelRouteDetail[];
    status?: "healthy" | "warning" | "error" | "untested";
    lastLatencyMs?: number;
}

/**
 * 聚合前台模型卡片关联的所有渠道来源（主渠道、候选物理路线、备用路线）
 * 用于多渠道来源下的精准选择管理，解决多渠道卡片点击渠道模型时的歧义
 */
export function getAssociatedChannels(
    m: FrontendModelItem,
    allChannels?: Array<{ id: string; name?: string }>
): AssociatedChannelInfo[] {
    const channelMap = new Map<string, AssociatedChannelInfo>();
    const channels = allChannels || [];

    // 1. P1 主渠道
    if (m.sourceCard?.channelId) {
        const chId = m.sourceCard.channelId;
        const matched = channels.find((c) => c.id === chId);
        const upstreamModelId = m.sourceCard.upstreamModelId || "";
        const routes: AssociatedChannelRouteDetail[] = [];
        if (upstreamModelId) {
            routes.push({
                routeId: "primary",
                upstreamModelId,
                sourceType: "primary",
                protocolType: m.sourceCard.protocolType,
                endpoint: m.sourceCard.endpoint,
                status: m.sourceCard.status,
                lastLatencyMs: m.sourceCard.lastLatencyMs,
                enabled: true,
            });
        }
        channelMap.set(chId, {
            channelId: chId,
            channelName: matched?.name || m.sourceCard.channelName || "主渠道",
            isPrimary: true,
            upstreamModels: upstreamModelId ? [upstreamModelId] : [],
            primaryUpstreamModel: upstreamModelId,
            routes,
            status: m.sourceCard.status,
            lastLatencyMs: m.sourceCard.lastLatencyMs,
        });
    }

    // 2. 候选物理路线 candidateUpstreams
    if (m.candidateUpstreams && m.candidateUpstreams.length > 0) {
        for (const cand of m.candidateUpstreams) {
            if (!cand.channelId) continue;
            const candModelId = cand.upstreamModelId || "";
            const candRoute: AssociatedChannelRouteDetail = {
                routeId: cand.id,
                upstreamModelId: candModelId,
                sourceType: "candidate",
                protocolType: cand.protocolType,
                endpoint: cand.endpoint,
                status: cand.status,
                lastLatencyMs: cand.lastLatencyMs,
                enabled: cand.enabled,
                channelModelId: cand.channelModelId,
            };

            const existing = channelMap.get(cand.channelId);
            if (existing) {
                if (candModelId && !existing.upstreamModels.includes(candModelId)) {
                    existing.upstreamModels.push(candModelId);
                }
                existing.routes.push(candRoute);
                if (!existing.status || existing.status === "untested") {
                    existing.status = cand.status;
                    existing.lastLatencyMs = cand.lastLatencyMs;
                }
            } else {
                const matched = channels.find((c) => c.id === cand.channelId);
                channelMap.set(cand.channelId, {
                    channelId: cand.channelId,
                    channelName: matched?.name || cand.channelName || "候选渠道",
                    isPrimary: false,
                    upstreamModels: candModelId ? [candModelId] : [],
                    primaryUpstreamModel: candModelId,
                    routes: [candRoute],
                    status: cand.status,
                    lastLatencyMs: cand.lastLatencyMs,
                });
            }
        }
    }

    // 3. 容灾备用路线 fallbackChannels
    if (m.fallbackChannels && m.fallbackChannels.length > 0) {
        for (const fb of m.fallbackChannels) {
            if (!fb.channelId) continue;
            const fbModelId = fb.upstreamModelId || "";
            const fbRoute: AssociatedChannelRouteDetail = {
                routeId: `fb-${fb.channelId}`,
                upstreamModelId: fbModelId,
                sourceType: "fallback",
                enabled: true,
            };

            const existing = channelMap.get(fb.channelId);
            if (existing) {
                if (fbModelId && !existing.upstreamModels.includes(fbModelId)) {
                    existing.upstreamModels.push(fbModelId);
                }
                existing.routes.push(fbRoute);
            } else {
                const matched = channels.find((c) => c.id === fb.channelId);
                channelMap.set(fb.channelId, {
                    channelId: fb.channelId,
                    channelName: matched?.name || fb.channelName || "备用渠道",
                    isPrimary: false,
                    upstreamModels: fbModelId ? [fbModelId] : [],
                    primaryUpstreamModel: fbModelId,
                    routes: [fbRoute],
                });
            }
        }
    }

    return Array.from(channelMap.values());
}
// @opc-feature: model-smart-router [end]
