// @opc-feature: model-smart-router [start]
import type {
    FrontendModelItem,
    UpstreamCandidateModel,
    ResolutionBillingTier,
    BillingSurchargeItem,
} from "../types";

export interface ModelGenerationRequest {
    modelId: string;
    resolution?: string;          // "480p" | "720p" | "1080p" | "768p" | "2k"
    aspectRatio?: string;         // "auto" | "9:16" | "16:9" | "3:4" | "4:3" | "1:1" | "21:9"
    duration?: number;            // 整数秒
    firstFrameImage?: string;
    lastFrameImage?: string;
    referenceImages?: string[];   // 多图列表
    motionReferenceVideo?: string;
    hasAudioGeneration?: boolean;
    hasAudioLipSync?: boolean;
    isOmniRef?: boolean;
    isEditing?: boolean;
    isContinuation?: boolean;
    customParams?: Record<string, any>;
}

export interface RoutingDecision {
    success: boolean;
    targetCandidate?: UpstreamCandidateModel;
    targetChannelId: string;
    targetModelId: string;
    ruleMatched: "SPECIFIC_PARAM_OVERRIDE" | "MAX_DURATION_TRIGGER" | "DEFAULT_PRIORITY_CASCADE" | "FALLBACK_CHANNEL" | "NONE";
    matchedParamKey?: string;
    reason?: string;
    requiredParamKeys: string[];
    qualifiedCandidateCount: number;
    billing: {
        unit: "second" | "count" | "token";
        baseCost: number;
        surchargeTotal: number;
        markupRatio: number;
        finalPrice: number;
        appliedSurcharges: BillingSurchargeItem[];
    };
    isCacheHit?: boolean;
}

/** 内存 O(1) 预编译查找表缓存 (Key -> RoutingDecision) */
const ROUTING_LUT_CACHE = new Map<string, RoutingDecision>();

/** 生成请求参数的归一化特征键 (用于 O(1) 查找表) */
export function generateRequestFeatureKey(
    modelId: string,
    req: ModelGenerationRequest,
    requiredKeys: string[]
): string {
    const sortedKeys = [...requiredKeys].sort().join("|");
    const dur = req.duration || 5;
    return `${modelId}::${sortedKeys}::dur_${dur}`;
}

/** 清理或重置指定模型的预编译 LUT 缓存 */
export function invalidateRoutingCache(modelId?: string) {
    if (!modelId) {
        ROUTING_LUT_CACHE.clear();
    } else {
        for (const key of ROUTING_LUT_CACHE.keys()) {
            if (key.startsWith(`${modelId}::`)) {
                ROUTING_LUT_CACHE.delete(key);
            }
        }
    }
}

/**
 * 根据创作者在前端传入的素材与选项，自动推断并标准化必须满足的参数集合
 * 严格按照业务规则推断：
 * - 无图片 -> 文生视频
 * - 1 张图 -> 默认首帧 (first_frame)
 * - 2 张图 -> 用户上传首尾帧或多图参考 (first_last_frame / multi_ref)
 * - >2 张图 -> 多图参考 (multi_ref)
 * - seedance -> 全能参考 (omni_ref)
 */
export function inferRequiredParameters(
    model: FrontendModelItem,
    req: ModelGenerationRequest
): string[] {
    const keys: string[] = [];

    // 1. 分辨率
    if (req.resolution) {
        const r = req.resolution.toLowerCase().trim();
        if (r.includes("480")) keys.push("res_480p");
        else if (r.includes("720")) keys.push("res_720p");
        else if (r.includes("1080")) keys.push("res_1080p");
        else if (r.includes("768")) keys.push("res_768p");
        else if (r.includes("2k") || r.includes("1440") || r.includes("2048")) keys.push("res_2k");
        else if (r.includes("4k") || r.includes("2160") || r.includes("4096")) keys.push("res_4k");
        else if (r.includes("1k") || r.includes("1024")) keys.push(model.capability === "image" ? "res_1k" : "res_720p");
        else keys.push(model.capability === "image" ? "res_1k" : "res_720p");
    }

    // 2. 尺寸画幅比例
    if (req.aspectRatio) {
        const a = req.aspectRatio.toLowerCase().trim();
        if (a === "auto" || a.includes("自适应")) keys.push("ratio_auto");
        else if (a === "9:16" || a.includes("9:16")) keys.push("ratio_9_16");
        else if (a === "16:9" || a.includes("16:9")) keys.push("ratio_16_9");
        else if (a === "3:4" || a.includes("3:4")) keys.push("ratio_3_4");
        else if (a === "4:3" || a.includes("4:3")) keys.push("ratio_4_3");
        else if (a === "1:1" || a.includes("1:1")) keys.push("ratio_1_1");
        else if (a === "21:9" || a.includes("21:9")) keys.push("ratio_21_9");
    }

    // 3. 多模态与素材推断
    const isSeedance = (model.family || "").toLowerCase().includes("seedance") ||
        (model.id || "").toLowerCase().includes("seedance");

    const refCount = (req.referenceImages?.length || 0) +
        (req.firstFrameImage ? 1 : 0) +
        (req.lastFrameImage ? 1 : 0);

    if (isSeedance && (refCount > 0 || req.isOmniRef)) {
        keys.push("omni_ref");
    } else if (req.lastFrameImage && req.firstFrameImage) {
        keys.push("first_last_frame");
    } else if (refCount > 1 || (req.referenceImages && req.referenceImages.length > 1)) {
        keys.push("multi_ref");
    } else if (refCount === 1 || req.firstFrameImage) {
        keys.push("first_frame");
    }

    // 4. 特殊特性
    if (req.motionReferenceVideo) keys.push("motion_reference");
    if (req.hasAudioGeneration) keys.push("audio_generation");
    if (req.hasAudioLipSync) keys.push("audio_lip_sync");
    if (req.isEditing) keys.push("video_editing");
    if (req.isContinuation) keys.push("video_continuation");

    return keys;
}

/**
 * 校验上游候选模型是否 100% 具备用户选择的全部参数
 * 兼容管理员显式特指：若管理员在后台将某一参数显式指定给该模型，则自动具备该参数资格
 */
export function isCandidateFullyQualified(
    candidate: UpstreamCandidateModel,
    requiredKeys: string[],
    paramPriorities?: Record<string, string[]>
): boolean {
    if (!candidate.enabled) return false;
    const supported = new Set(candidate.supportedParameters || []);
    for (const key of requiredKeys) {
        if (!supported.has(key)) {
            if (paramPriorities?.[key]?.includes(candidate.id)) {
                continue;
            }
            return false;
        }
    }
    return true;
}

/**
 * 计算模型计费价格: (上游成本 + 对应叠加费用) * 定价倍率
 * 规则：
 * 1. 优先匹配 (目标分辨率 + 特定参数列) 的精准计费行
 * 2. 若未指定或无特定参数匹配，回退至该分辨率的“基础画面”行 (matchedParameterKey 为 "none" 或空)
 * 3. 提取对应叠加费用 (surchargeCost)，与上游成本相加后乘以定价倍率
 * 4. 兼容检查全局 billing.surcharges 中未包含在 tier 内的额外叠加项
 */
export function calculateModelPrice(
    model: FrontendModelItem,
    requiredKeys: string[]
): {
    unit: "second" | "count" | "token";
    baseCost: number;
    surchargeTotal: number;
    markupRatio: number;
    finalPrice: number;
    appliedSurcharges: BillingSurchargeItem[];
} {
    const billing = model.billing;
    const tiers = billing.tiers || [];
    const surcharges = billing.surcharges || [];

    // 1. 匹配目标分辨率
    let resName: string | undefined;
    for (const key of requiredKeys) {
        if (key.startsWith("res_")) {
            resName = key.replace("res_", "").toLowerCase();
            break;
        }
    }

    // 找到所有匹配该分辨率的 tiers
    const candidateTiers = resName
        ? tiers.filter((t) => t.resolution.toLowerCase().includes(resName!))
        : [];

    let matchedTier: ResolutionBillingTier | undefined;

    // 2. 优先在同分辨率中匹配具体参数叠加行 (例如: 720p + audio_generation)
    for (const t of candidateTiers) {
        if (
            t.matchedParameterKey &&
            t.matchedParameterKey !== "none" &&
            requiredKeys.includes(t.matchedParameterKey)
        ) {
            matchedTier = t;
            break;
        }
    }

    // 若未匹配到特定参数行，回退到基础无叠加行 (matchedParameterKey 为 "none" 或未指定)
    if (!matchedTier && candidateTiers.length > 0) {
        matchedTier = candidateTiers.find((t) => !t.matchedParameterKey || t.matchedParameterKey === "none") || candidateTiers[0];
    }

    const baseCost = matchedTier ? matchedTier.upstreamCost : (billing.defaultCost || 0.03);
    const markupRatio = matchedTier ? matchedTier.markupRatio : (billing.defaultRatio || 1.8);

    const appliedSurcharges: BillingSurchargeItem[] = [];
    let surchargeTotal = 0;

    // 3. 如果匹配的 tier 自带 surchargeCost
    if (matchedTier && matchedTier.surchargeCost && matchedTier.surchargeCost > 0) {
        surchargeTotal += Number(matchedTier.surchargeCost);
        appliedSurcharges.push({
            id: matchedTier.id || `tier-sc-${matchedTier.matchedParameterKey}`,
            parameterKey: matchedTier.matchedParameterKey || "param",
            parameterLabel: matchedTier.matchedParameterLabel || "参数叠加",
            additionalCost: matchedTier.surchargeCost,
            enabled: true,
        });
    }

    // 4. 检查全局 surcharges 中是否有开启且尚未在 tier 中计入的参数叠加项 (向后兼容)
    for (const sc of surcharges) {
        if (!sc.enabled) continue;
        if (requiredKeys.includes(sc.parameterKey)) {
            const alreadyCovered = matchedTier?.matchedParameterKey === sc.parameterKey;
            if (!alreadyCovered) {
                appliedSurcharges.push(sc);
                surchargeTotal += Number(sc.additionalCost || 0);
            }
        }
    }

    const totalCost = baseCost + surchargeTotal;
    const finalPrice = Number((totalCost * markupRatio).toFixed(4));

    return {
        unit: billing.unit,
        baseCost,
        surchargeTotal,
        markupRatio,
        finalPrice,
        appliedSurcharges,
    };
}

/**
 * 核心智能路由决策执行器 (结合 5 大性能优化)
 * 判定链：
 * 1. 过滤：候选模型必须 100% 满足用户选择的所有参数
 * 2. 单参数特指优先 (Rule 1)：用户所选参数中，后台若明确指定了具体模型 A，且 A 满足全部参数，直接优先路由 A
 * 3. 最大秒数路由开关：达到最大秒数且开启特定路由，优先路由到指定上游
 * 4. 默认优先级兜底 (Rule 2)：全选默认时，在所有合格模型中按默认优先级链顺序路由
 * 5. 就地瀑布流熔断：健康模型优先，异常顺位降级
 */
export function resolveModelRouting(
    model: FrontendModelItem,
    req: ModelGenerationRequest
): RoutingDecision {
    const requiredKeys = inferRequiredParameters(model, req);
    const cacheKey = generateRequestFeatureKey(model.id, req, requiredKeys);

    // 1. 检查 O(1) 预编译查找表缓存
    const cached = ROUTING_LUT_CACHE.get(cacheKey);
    if (cached) {
        return { ...cached, isCacheHit: true };
    }

    const priceInfo = calculateModelPrice(model, requiredKeys);
    const candidates = model.candidateUpstreams || [];
    const paramPriorities = model.parameterPriorities || {};

    // 2. 筛选 100% 满足全部参数的合格上游模型 (全量参数匹配，兼容管理员显式特指)
    const qualifiedCandidates = candidates.filter((c) =>
        isCandidateFullyQualified(c, requiredKeys, paramPriorities)
    );

    // 无任何上游支持全部所选参数
    if (qualifiedCandidates.length === 0) {
        const decision: RoutingDecision = {
            success: false,
            targetChannelId: model.primaryChannelId,
            targetModelId: model.sourceCard.upstreamModelId,
            ruleMatched: "NONE",
            reason: "当前候选池中没有上游模型能同时满足所选择的全部参数",
            requiredParamKeys: requiredKeys,
            qualifiedCandidateCount: 0,
            billing: priceInfo,
            isCacheHit: false,
        };
        ROUTING_LUT_CACHE.set(cacheKey, decision);
        return decision;
    }

    // 3. 检查单参数特指优先 (Rule 1)
    // 检查用户所选的各个参数中，是否在后台绑定了非 "default" 的具体模型
    let specificOverrideCandidate: UpstreamCandidateModel | undefined;
    let overrideParamKey: string | undefined;

    for (const key of requiredKeys) {
        const priorityList = paramPriorities[key];
        const designatedId = priorityList && priorityList.length > 0 ? priorityList[0] : undefined;
        if (designatedId && designatedId !== "default") {
            const foundInQualified = qualifiedCandidates.find((c) => c.id === designatedId);
            if (foundInQualified && foundInQualified.status !== "error") {
                specificOverrideCandidate = foundInQualified;
                overrideParamKey = key;
                break;
            }
        }
    }

    if (specificOverrideCandidate) {
        const decision: RoutingDecision = {
            success: true,
            targetCandidate: specificOverrideCandidate,
            targetChannelId: specificOverrideCandidate.channelId,
            targetModelId: specificOverrideCandidate.upstreamModelId,
            ruleMatched: "SPECIFIC_PARAM_OVERRIDE",
            matchedParamKey: overrideParamKey,
            requiredParamKeys: requiredKeys,
            qualifiedCandidateCount: qualifiedCandidates.length,
            billing: priceInfo,
            isCacheHit: false,
        };
        ROUTING_LUT_CACHE.set(cacheKey, decision);
        return decision;
    }

    // 4. 检查最大秒数特定路由开关
    const durSettings = model.durationSettings;
    if (
        durSettings?.maxDurationRouteEnabled &&
        durSettings.maxDurationTargetCandidateId &&
        req.duration &&
        req.duration >= durSettings.maxSeconds
    ) {
        const maxDurationTarget = qualifiedCandidates.find(
            (c) => c.id === durSettings.maxDurationTargetCandidateId && c.status !== "error"
        );
        if (maxDurationTarget) {
            const decision: RoutingDecision = {
                success: true,
                targetCandidate: maxDurationTarget,
                targetChannelId: maxDurationTarget.channelId,
                targetModelId: maxDurationTarget.upstreamModelId,
                ruleMatched: "MAX_DURATION_TRIGGER",
                requiredParamKeys: requiredKeys,
                qualifiedCandidateCount: qualifiedCandidates.length,
                billing: priceInfo,
                isCacheHit: false,
            };
            ROUTING_LUT_CACHE.set(cacheKey, decision);
            return decision;
        }
    }

    // 5. 走默认优先级链兜底 (Rule 2: Default Priority Cascade)
    const priorityOrder = model.defaultCandidatePriority || candidates.map((c) => c.id);

    const sortedQualified = [...qualifiedCandidates].sort((a, b) => {
        const idxA = priorityOrder.indexOf(a.id);
        const idxB = priorityOrder.indexOf(b.id);
        const orderA = idxA === -1 ? 9999 : idxA;
        const orderB = idxB === -1 ? 9999 : idxB;
        return orderA - orderB;
    });

    // 瀑布流熔断：优先选择状态健康的模型，若全在警告/待测，取第一位
    const chosen = sortedQualified.find((c) => c.status === "healthy") ||
        sortedQualified.find((c) => c.status !== "error") ||
        sortedQualified[0];

    const decision: RoutingDecision = {
        success: true,
        targetCandidate: chosen,
        targetChannelId: chosen.channelId,
        targetModelId: chosen.upstreamModelId,
        ruleMatched: "DEFAULT_PRIORITY_CASCADE",
        requiredParamKeys: requiredKeys,
        qualifiedCandidateCount: qualifiedCandidates.length,
        billing: priceInfo,
        isCacheHit: false,
    };

    ROUTING_LUT_CACHE.set(cacheKey, decision);
    return decision;
}
// @opc-feature: model-smart-router [end]
