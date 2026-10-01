import { describe, expect, test, beforeEach } from "bun:test";
import {
    resolveModelRouting,
    inferRequiredParameters,
    calculateModelPrice,
    invalidateRoutingCache,
    isCandidateFullyQualified,
} from "../src/pages/admin/model-router/utils/routing-engine";
import type { FrontendModelItem, UpstreamCandidateModel } from "../src/pages/admin/model-router/types";

function createMockModel(): FrontendModelItem {
    const candA: UpstreamCandidateModel = {
        id: "cand-newtoken-A",
        channelId: "newtoken",
        channelName: "NewToken",
        upstreamModelId: "seedance-mini-A",
        protocolType: "system",
        endpoint: "https://api.newtoken.top/v1",
        authType: "Bearer Token",
        extractPath: "url",
        timeoutSeconds: 300,
        enabled: true,
        supportedParameters: ["res_720p", "ratio_9_16", "motion_reference", "first_frame"],
        status: "healthy",
    };

    const candB: UpstreamCandidateModel = {
        id: "cand-lxmone-B",
        channelId: "lxmone",
        channelName: "万有引力",
        upstreamModelId: "seedance-mini-B",
        protocolType: "system",
        endpoint: "https://api.lxmone.com/v1",
        authType: "Bearer Token",
        extractPath: "url",
        timeoutSeconds: 300,
        enabled: true,
        supportedParameters: ["res_720p", "res_1080p", "ratio_9_16", "ratio_16_9", "first_frame", "motion_reference"],
        status: "healthy",
    };

    const candC: UpstreamCandidateModel = {
        id: "cand-yunzhi-C",
        channelId: "yunzhi",
        channelName: "云智",
        upstreamModelId: "seedance-mini-C",
        protocolType: "system",
        endpoint: "https://api.yunzhi.com/v1",
        authType: "Bearer Token",
        extractPath: "url",
        timeoutSeconds: 300,
        enabled: true,
        supportedParameters: ["res_720p", "ratio_9_16", "first_frame"], // 不支持 motion_reference
        status: "healthy",
    };

    return {
        id: "seedance-2.0-mini",
        displayName: "seedance-2.0-mini",
        subtitle: "轻量快速生成",
        showSubtitle: true,
        capability: "video",
        family: "字节 Seedance",
        group: "生视频",
        enabled: true,
        sortOrder: 1,
        primaryChannelId: "newtoken",
        primaryProtocolType: "system",
        sourceCard: {
            channelId: "newtoken",
            channelName: "NewToken",
            protocolType: "system",
            upstreamModelId: "seedance-mini-A",
            endpoint: "https://api.newtoken.top/v1",
            authType: "Bearer Token",
            extractPath: "url",
            timeoutSeconds: 300,
            status: "healthy",
        },
        fallbackChannels: [],
        candidateUpstreams: [candA, candB, candC],
        defaultCandidatePriority: ["cand-newtoken-A", "cand-lxmone-B", "cand-yunzhi-C"],
        parameterPriorities: {
            res_720p: ["default"],
        },
        switchMatrix: [],
        conditionalRoutes: [],
        durationSettings: {
            minSeconds: 2,
            maxSeconds: 15,
            isLocked: false,
            lockedSeconds: 5,
            maxDurationRouteEnabled: false,
            maxDurationTargetCandidateId: "cand-lxmone-B",
        },
        durationThresholdRule: {
            enabled: false,
            thresholdSeconds: 30,
            targetChannelId: "",
            targetChannelName: "",
            targetModelId: "",
            unitPrice: 1.5,
        },
        billing: {
            unit: "second",
            defaultCost: 0.03,
            defaultRatio: 1.8,
            defaultPrice: 0.054,
            tiers: [
                { resolution: "720p", upstreamCost: 0.03, markupRatio: 1.8, userPrice: 0.054 },
                { resolution: "1080p", upstreamCost: 0.05, markupRatio: 1.8, userPrice: 0.09 },
            ],
            surcharges: [
                { id: "sc-audio", parameterKey: "audio_generation", parameterLabel: "生成声音", additionalCost: 0.01, enabled: true },
                { id: "sc-multi", parameterKey: "multi_ref", parameterLabel: "多图参考", additionalCost: 0.005, enabled: true },
            ],
        },
    };
}

describe("智能模型中枢与智能路由决策引擎 (Routing Engine)", () => {
    beforeEach(() => {
        invalidateRoutingCache();
    });

    test("1. 候选模型必须 100% 具备用户选择的所有参数", () => {
        const model = createMockModel();

        // 用户选了 720p + 9:16 + 上传了参考视频 (motion_reference)
        const req = {
            modelId: model.id,
            resolution: "720p",
            aspectRatio: "9:16",
            motionReferenceVideo: "https://example.com/ref.mp4",
        };

        const required = inferRequiredParameters(model, req);
        expect(required).toContain("res_720p");
        expect(required).toContain("ratio_9_16");
        expect(required).toContain("motion_reference");

        // candA 支持全部3项
        expect(isCandidateFullyQualified(model.candidateUpstreams[0], required)).toBe(true);
        // candB 支持全部3项
        expect(isCandidateFullyQualified(model.candidateUpstreams[1], required)).toBe(true);
        // candC 不支持 motion_reference，必须被淘汰
        expect(isCandidateFullyQualified(model.candidateUpstreams[2], required)).toBe(false);

        const decision = resolveModelRouting(model, req);
        expect(decision.success).toBe(true);
        expect(decision.qualifiedCandidateCount).toBe(2);
        expect(decision.targetCandidate?.id).not.toBe("cand-yunzhi-C");
    });

    test("2. 默认优先级兜底：全选默认时，按默认优先级 (P1 > P2) 顺序命中最高者", () => {
        const model = createMockModel();
        // defaultCandidatePriority: candA (P1), candB (P2)
        model.parameterPriorities = {
            res_720p: ["default"],
            ratio_9_16: ["default"],
        };

        const decision = resolveModelRouting(model, {
            modelId: model.id,
            resolution: "720p",
            aspectRatio: "9:16",
            motionReferenceVideo: "https://example.com/ref.mp4",
        });

        expect(decision.success).toBe(true);
        expect(decision.ruleMatched).toBe("DEFAULT_PRIORITY_CASCADE");
        expect(decision.targetCandidate?.id).toBe("cand-newtoken-A"); // P1 优先
    });

    test("3. 单参数特指优先：当某参数在后台明确指定了模型，且该模型满足用户所有参数，直接优先路由", () => {
        const model = createMockModel();
        // 在 720p 上特指优先路由 candB (万有引力)
        model.parameterPriorities = {
            res_720p: ["cand-lxmone-B"],
        };

        const decision = resolveModelRouting(model, {
            modelId: model.id,
            resolution: "720p",
            aspectRatio: "9:16",
            motionReferenceVideo: "https://example.com/ref.mp4",
        });

        expect(decision.success).toBe(true);
        expect(decision.ruleMatched).toBe("SPECIFIC_PARAM_OVERRIDE");
        expect(decision.targetCandidate?.id).toBe("cand-lxmone-B");
        expect(decision.matchedParamKey).toBe("res_720p");
    });

    test("4. 单参数特指若未能满足用户的其他参数，自动剔除并降级回默认优先级", () => {
        const model = createMockModel();
        // 在 720p 上特指 candC (云智)
        // 但用户选了参考视频，candC 不支持参考视频
        model.parameterPriorities = {
            res_720p: ["cand-yunzhi-C"],
        };

        const decision = resolveModelRouting(model, {
            modelId: model.id,
            resolution: "720p",
            aspectRatio: "9:16",
            motionReferenceVideo: "https://example.com/ref.mp4",
        });

        expect(decision.success).toBe(true);
        // candC 被淘汰，自动降级回默认优先级 P1 (candA)
        expect(decision.ruleMatched).toBe("DEFAULT_PRIORITY_CASCADE");
        expect(decision.targetCandidate?.id).toBe("cand-newtoken-A");
    });

    test("5. 瀑布流熔断降级：当 P1 模型故障报错时，自动顺位降级至 P2", () => {
        const model = createMockModel();
        // 将 P1 (candA) 设为 error 状态
        model.candidateUpstreams[0].status = "error";

        const decision = resolveModelRouting(model, {
            modelId: model.id,
            resolution: "720p",
            aspectRatio: "9:16",
            motionReferenceVideo: "https://example.com/ref.mp4",
        });

        expect(decision.success).toBe(true);
        expect(decision.targetCandidate?.id).toBe("cand-lxmone-B"); // 顺位降级到 candB
    });

    test("6. 最大秒数开关路由触发", () => {
        const model = createMockModel();
        model.durationSettings = {
            minSeconds: 2,
            maxSeconds: 15,
            isLocked: false,
            lockedSeconds: 5,
            maxDurationRouteEnabled: true,
            maxDurationTargetCandidateId: "cand-lxmone-B",
        };

        // 用户请求 15 秒（达到最大秒数）
        const decision = resolveModelRouting(model, {
            modelId: model.id,
            resolution: "720p",
            aspectRatio: "9:16",
            duration: 15,
        });

        expect(decision.success).toBe(true);
        expect(decision.ruleMatched).toBe("MAX_DURATION_TRIGGER");
        expect(decision.targetCandidate?.id).toBe("cand-lxmone-B");
    });

    test("7. 叠加计费公式验证: (基础成本 + ∑叠加费用) × 定价倍率", () => {
        const model = createMockModel();

        // 720p 基础成本 0.03，倍率 1.8
        // 勾选生成声音 (audio_generation)，叠加 0.01
        // 总成本 = 0.03 + 0.01 = 0.04
        // 最终价格 = 0.04 * 1.8 = 0.072
        const priceInfo = calculateModelPrice(model, ["res_720p", "audio_generation"]);
        expect(priceInfo.baseCost).toBe(0.03);
        expect(priceInfo.surchargeTotal).toBe(0.01);
        expect(priceInfo.finalPrice).toBe(0.072);
        expect(priceInfo.appliedSurcharges).toHaveLength(1);
    });

    test("8. O(1) 预编译查找表缓存命中验证", () => {
        const model = createMockModel();
        const req = {
            modelId: model.id,
            resolution: "720p",
            aspectRatio: "9:16",
        };

        const firstDecision = resolveModelRouting(model, req);
        expect(firstDecision.isCacheHit).toBe(false);

        const secondDecision = resolveModelRouting(model, req);
        expect(secondDecision.isCacheHit).toBe(true);
        expect(secondDecision.targetCandidate?.id).toBe(firstDecision.targetCandidate?.id);
    });

    test("9. 行级规格与参数列匹配计费: 优先命中 (分辨率 + 特殊参数列) 规则行", () => {
        const model = createMockModel();
        // 配置行级参数计费矩阵 (上游成本 + 对应叠加费用) * 定价倍率
        model.billing.surcharges = []; // 清空旧的全局 surcharges
        model.billing.tiers = [
            { id: "t-720-base", resolution: "720p", upstreamCost: 0.03, matchedParameterKey: "none", matchedParameterLabel: "无 (基础画面)", surchargeCost: 0, markupRatio: 1.8, userPrice: 0.054 },
            { id: "t-720-audio", resolution: "720p", upstreamCost: 0.03, matchedParameterKey: "audio_generation", matchedParameterLabel: "生成声音", surchargeCost: 0.015, markupRatio: 1.8, userPrice: 0.081 },
            { id: "t-1080-base", resolution: "1080p", upstreamCost: 0.05, matchedParameterKey: "none", matchedParameterLabel: "无 (基础画面)", surchargeCost: 0, markupRatio: 1.8, userPrice: 0.09 },
            { id: "t-1080-audio", resolution: "1080p", upstreamCost: 0.05, matchedParameterKey: "audio_generation", matchedParameterLabel: "生成声音", surchargeCost: 0.02, markupRatio: 1.8, userPrice: 0.126 },
        ];

        // 场景 A: 纯 720p 基础画面 -> 命中 t-720-base
        const priceBase = calculateModelPrice(model, ["res_720p"]);
        expect(priceBase.baseCost).toBe(0.03);
        expect(priceBase.surchargeTotal).toBe(0);
        expect(priceBase.finalPrice).toBe(0.054);

        // 场景 B: 720p + 生成声音 -> 优先命中 t-720-audio，(0.03 + 0.015) * 1.8 = 0.081
        const priceAudio = calculateModelPrice(model, ["res_720p", "audio_generation"]);
        expect(priceAudio.baseCost).toBe(0.03);
        expect(priceAudio.surchargeTotal).toBe(0.015);
        expect(priceAudio.finalPrice).toBe(0.081);
        expect(priceAudio.appliedSurcharges[0].parameterKey).toBe("audio_generation");

        // 场景 C: 1080p + 生成声音 -> 优先命中 t-1080-audio，(0.05 + 0.02) * 1.8 = 0.126
        const price1080Audio = calculateModelPrice(model, ["res_1080p", "audio_generation"]);
        expect(price1080Audio.baseCost).toBe(0.05);
        expect(price1080Audio.surchargeTotal).toBe(0.02);
        expect(price1080Audio.finalPrice).toBe(0.126);
    });
});
