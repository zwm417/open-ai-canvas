import type { FrontendModelItem, ConditionalRouteRule } from "../types";
import { resolveModelRouting } from "./routing-engine";

export interface OutboundPayloadRequest {
    modelId: string;
    prompt: string;
    resolution?: string;
    duration?: number;
    firstFrameImage?: string;
    lastFrameImage?: string;
    motionReferenceVideo?: string;
    hasAudioLipSync?: boolean;
    hasInpaintMask?: boolean;
    customParams?: Record<string, any>;
}

export interface OutboundPayloadResolution {
    targetChannelId: string;
    targetModelId: string;
    matchedRuleName?: string;
    finalPayload: Record<string, any>;
    isFallbackReplaced: boolean;
    replacedFields: Array<{ field: string; requestedValue: any; fallbackValue: any; reason: string }>;
    isFlatRateRouted: boolean;
    billingType: "second" | "count" | "token";
    estimatedPrice: number;
}

/**
 * 出站参数多上游智能分流与安全兜底替换器
 */
export function resolveOutboundPayload(
    model: FrontendModelItem,
    request: OutboundPayloadRequest
): OutboundPayloadResolution {
    const replacedFields: Array<{ field: string; requestedValue: any; fallbackValue: any; reason: string }> = [];
    let isFallbackReplaced = false;
    let targetChannelId = model.primaryChannelId;
    let targetModelId = model.sourceCard.upstreamModelId;
    let matchedRuleName: string | undefined = undefined;
    let isFlatRateRouted = false;
    let billingType = model.billing?.unit || "second";
    let estimatedPrice = model.billing?.defaultPrice || 0;

    // 若配置了候选池，优先使用新版智能路由引擎 (100% 参数匹配 -> 单参数特指优先 -> 默认优先级瀑布流)
    let candidateDecision: any = undefined;
    if (model.candidateUpstreams && model.candidateUpstreams.length > 0) {
        const decision = resolveModelRouting(model, {
            modelId: model.id,
            resolution: request.resolution,
            duration: request.duration,
            firstFrameImage: request.firstFrameImage,
            lastFrameImage: request.lastFrameImage,
            motionReferenceVideo: request.motionReferenceVideo,
            hasAudioLipSync: request.hasAudioLipSync,
        });

        if (decision.success) {
            candidateDecision = decision;
            if (decision.ruleMatched === "SPECIFIC_PARAM_OVERRIDE") {
                targetChannelId = decision.targetChannelId;
                targetModelId = decision.targetModelId;
                matchedRuleName = `单参数特指优先 [${decision.matchedParamKey}]`;
                billingType = decision.billing.unit;
                estimatedPrice = decision.billing.finalPrice;
            } else if (decision.ruleMatched === "MAX_DURATION_TRIGGER") {
                targetChannelId = decision.targetChannelId;
                targetModelId = decision.targetModelId;
                matchedRuleName = "达到最大秒数专属路由";
                billingType = decision.billing.unit;
                estimatedPrice = decision.billing.finalPrice;
            }
        }
    }

    // 1. 兼容原有参数分流表 (若存在且未被新路由覆盖)
    if (!matchedRuleName && model.conditionalRoutes && model.conditionalRoutes.length > 0) {
        for (const rule of model.conditionalRoutes) {
            if (!rule.enabled) continue;

            let isMatched = false;

            // 1.1 分辨率条件匹配 (如 1080p, 480p, 720p, 4k)
            if (rule.conditionType === "resolution" && request.resolution) {
                const reqRes = request.resolution.toLowerCase();
                const condRes = rule.conditionValue.toLowerCase();
                if (reqRes.includes(condRes) || condRes.includes(reqRes)) {
                    isMatched = true;
                }
            }

            // 1.2 时长大于等于阈值匹配 (如 >= 30秒)
            if (rule.conditionType === "duration_gte" && request.duration) {
                if (request.duration >= Number(rule.conditionValue)) {
                    isMatched = true;
                }
            }

            // 1.3 多模态输入类型匹配 (如 音频对口型、局部涂抹蒙版、动作参考)
            if (rule.conditionType === "input_modality") {
                if (rule.conditionValue === "audio_lip_sync" && request.hasAudioLipSync) {
                    isMatched = true;
                }
                if (rule.conditionValue === "inpaint_mask" && request.hasInpaintMask) {
                    isMatched = true;
                }
                if (rule.conditionValue === "motion_reference" && request.motionReferenceVideo) {
                    isMatched = true;
                }
                if (rule.conditionValue === "first_last_frame" && request.lastFrameImage) {
                    isMatched = true;
                }
            }

            if (isMatched) {
                targetChannelId = rule.targetChannelId;
                targetModelId = rule.targetModelId;
                matchedRuleName = rule.name;
                if (rule.conditionType === "duration_gte") {
                    isFlatRateRouted = true;
                    billingType = "count";
                    estimatedPrice = rule.overridePrice || model.durationThresholdRule?.unitPrice || 1.5;
                }
                break; // 命中首条匹配的高优先级规则
            }
        }
    }

    // 2. 检查时长阈值转一口价规则兜底 (Requirement 7)
    if (
        !isFlatRateRouted &&
        model.capability === "video" &&
        model.durationThresholdRule.enabled &&
        request.duration &&
        request.duration >= model.durationThresholdRule.thresholdSeconds
    ) {
        isFlatRateRouted = true;
        targetChannelId = model.durationThresholdRule.targetChannelId;
        targetModelId = model.durationThresholdRule.targetModelId;
        billingType = "count";
        estimatedPrice = model.durationThresholdRule.unitPrice;
        matchedRuleName = "长视频时长阈值自动分流至一口价通道";
    }

    // 2.5 检查同参数多模型优选路由映射 (Parameter Priorities)
    if (!matchedRuleName && !isFlatRateRouted && model.parameterPriorities && model.candidateUpstreams) {
        let matchedParamKey: string | undefined = undefined;
        if (request.resolution) {
            const low = request.resolution.toLowerCase();
            if (low.includes("1080")) matchedParamKey = "res_1080p";
            else if (low.includes("720")) matchedParamKey = "res_720p";
            else if (low.includes("480")) matchedParamKey = "res_480p";
            else if (low.includes("768")) matchedParamKey = "res_768p";
            else if (low.includes("2k")) matchedParamKey = "res_2k";
            else if (low.includes("4k")) matchedParamKey = "res_4k";
        }
        if (!matchedParamKey && request.hasAudioLipSync) matchedParamKey = "audio_lip_sync";
        if (!matchedParamKey && request.motionReferenceVideo) matchedParamKey = "motion_reference";

        if (matchedParamKey && model.parameterPriorities[matchedParamKey]?.length > 0) {
            const topCandId = model.parameterPriorities[matchedParamKey][0];
            const candidate = model.candidateUpstreams.find((c) => c.id === topCandId && c.enabled);
            if (candidate) {
                targetChannelId = candidate.channelId;
                targetModelId = candidate.upstreamModelId;
                matchedRuleName = `同参数优选路由 [${matchedParamKey} -> ${candidate.channelName}]`;
            }
        }
    }

    // 2.8 若上述具体规则均未命中，回退至候选池默认优先级级联决策
    if (!matchedRuleName && candidateDecision && candidateDecision.success) {
        targetChannelId = candidateDecision.targetChannelId;
        targetModelId = candidateDecision.targetModelId;
        matchedRuleName = "默认优先级级联路由";
        billingType = candidateDecision.billing.unit;
        estimatedPrice = candidateDecision.billing.finalPrice;
    }

    // 3. 检查开关矩阵与出站默认值替换 (Requirement 6)
    const switchMap = new Map(model.switchMatrix.map((s) => [s.key, s]));

    // 3.1 分辨率安全替换检查 (例如请求 1080P 但当前命中渠道原生不支持)
    const res1080Switch = switchMap.get("res_1080p");
    let finalResolution = request.resolution || "720p";
    if (
        request.resolution?.toLowerCase().includes("1080") &&
        res1080Switch &&
        !res1080Switch.channelDefault &&
        res1080Switch.forcedEnabled
    ) {
        isFallbackReplaced = true;
        finalResolution = res1080Switch.fallbackValue || "720p";
        replacedFields.push({
            field: "resolution",
            requestedValue: request.resolution,
            fallbackValue: finalResolution,
            reason: "上游渠道原生未支持 1080P，已由调度网关自动安全替换为默认值",
        });
    }

    // 3.2 480P 格式安全归一化
    if (request.resolution?.toLowerCase().includes("480")) {
        finalResolution = "480p";
    }

    // 3.3 首尾帧排他与自适应检查
    const firstLastSwitch = switchMap.get("first_last_frame");
    let hasLastFrame = Boolean(request.lastFrameImage);
    if (
        hasLastFrame &&
        firstLastSwitch &&
        !firstLastSwitch.channelDefault &&
        firstLastSwitch.forcedEnabled
    ) {
        isFallbackReplaced = true;
        hasLastFrame = false;
        replacedFields.push({
            field: "lastFrameImage",
            requestedValue: request.lastFrameImage,
            fallbackValue: null,
            reason: "当前渠道要求单图首帧或首尾排他，已自动安全剥离尾帧",
        });
    }

    // 组装最终出站 Payload
    const finalPayload: Record<string, any> = {
        model: targetModelId,
        prompt: request.prompt,
        resolution: finalResolution,
        duration: request.duration || 5,
        ...(request.firstFrameImage ? { image_url: request.firstFrameImage } : {}),
        ...(hasLastFrame && request.lastFrameImage ? { last_frame_image: request.lastFrameImage } : {}),
        ...(request.motionReferenceVideo ? { reference_video: request.motionReferenceVideo } : {}),
        ...(request.hasAudioLipSync ? { audio_driven: true } : {}),
        ...(request.hasInpaintMask ? { inpaint_mode: true } : {}),
        ...(request.customParams || {}),
    };

    return {
        targetChannelId,
        targetModelId,
        matchedRuleName,
        finalPayload,
        isFallbackReplaced,
        replacedFields,
        isFlatRateRouted,
        billingType,
        estimatedPrice,
    };
}
