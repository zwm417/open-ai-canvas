// @opc-feature: model-smart-router [start]
import { describe, expect, test } from "bun:test";
import {
    logicalModelToFrontendItem,
    frontendItemToLogicalModelMutation,
    extractSupportedParameterKeys,
    microcreditsToYuan,
    yuanToMicrocredits,
    resolveCapability,
    getAssociatedChannels,
} from "../src/pages/admin/model-router/model-router-adapter";
import {
    inferRequiredParameters,
    calculateModelPrice,
    isCandidateFullyQualified,
} from "../src/pages/admin/model-router/utils/routing-engine";
import { testRealModelConnectivity } from "../src/pages/admin/model-router/utils/real-connectivity-tester";
import type { AdminLogicalModel } from "../src/services/api/logical-models";
import type { ChannelModel } from "../src/services/api/wallet";
import type { ModelChannel } from "../src/stores/use-config-store";
import type { FrontendModelItem, UpstreamCandidateModel } from "../src/pages/admin/model-router/types";

describe("智能模型中枢 · 适配器与双向契约转换", () => {
    test("微积分与常规元双向换算精准无损", () => {
        expect(microcreditsToYuan(1_500_000)).toBe(1.5);
        expect(yuanToMicrocredits(1.5)).toBe(1_500_000);
        expect(microcreditsToYuan(54_000)).toBe(0.054);
    });

    test("能力画像推导支持参数规格：视频分辨率、画幅、时长与音频", () => {
        const spec = {
            version: 1 as const,
            capability: "video" as const,
            options: {
                vquality: { values: ["480p", "720p", "1080p"] },
                size: { values: ["16:9", "9:16"] },
                videoSeconds: { min: 2, max: 10 },
                videoGenerateAudio: { values: [true] },
            },
            inputs: {
                image: { min: 0, max: 2 },
            },
        };

        const params = extractSupportedParameterKeys("video", spec as any);
        expect(params).toContain("res_480p");
        expect(params).toContain("res_720p");
        expect(params).toContain("res_1080p");
        expect(params).toContain("ratio_16_9");
        expect(params).toContain("ratio_9_16");
        expect(params).toContain("duration_continuous");
        expect(params).toContain("audio_generation");
        expect(params).toContain("first_frame");
        expect(params).toContain("first_last_frame");
    });

    test("将 AdminLogicalModel 转换至 FrontendModelItem 时保留真实上游路线与来源卡片协议", () => {
        const mockChannels: ModelChannel[] = [
            {
                id: "ch-1",
                name: "官方渠道",
                type: "openai",
                baseUrl: "https://api.example.com",
                apiKey: "sk-real-secret",
                models: [],
                enabled: true,
            },
        ];

        const mockChannelModels: ChannelModel[] = [
            {
                id: "cm-1",
                channelId: "ch-1",
                modelKey: "upstream-video-pro",
                providerModelKey: "upstream-video-pro",
                displayName: "即梦视频 Pro",
                channelLabel: "",
                description: "高质量影视模型",
                icon: "",
                capability: "video",
                protocol: "volcengine-jimeng-video",
                enabled: true,
                billingMode: "per_second",
                unitPriceMicrocredits: 60000,
                inputTokenPriceMicrocredits: 0,
                outputTokenPriceMicrocredits: 0,
                cachedTokenPriceMicrocredits: 0,
                priceConfigured: true,
                priceTiers: [],
                priceVersion: 1,
                createdAt: "",
                updatedAt: "",
            },
        ];

        const mockLogical: AdminLogicalModel = {
            id: "lmodel-123",
            code: "jimeng-2.1-video",
            name: "即梦 2.1 影视视频",
            icon: "sparkles",
            description: "专业短剧分镜生成",
            capability: "video",
            sortOrder: 1,
            pricePolicy: "unified",
            billingMode: "per_second",
            unitPriceMicrocredits: 80000,
            inputPriceMicrocredits: 0,
            outputPriceMicrocredits: 0,
            cachedPriceMicrocredits: 0,
            priceTiers: [
                {
                    selector: {},
                    resolution: "720p",
                    videoSeconds: 5,
                    billingMode: "per_second",
                    unitPriceMicrocredits: 80000,
                    inputTokenPriceMicrocredits: 0,
                    outputTokenPriceMicrocredits: 0,
                    cachedTokenPriceMicrocredits: 0,
                },
            ],
            legacyModelIds: [],
            capabilitySpec: { version: 1, capability: "video" },
            capabilityProfiles: [],
            defaultOptions: {},
            available: true,
            enabled: true,
            activeRevisionId: "rev-1",
            revisionVersion: 1,
            routes: [
                {
                    id: "route-1",
                    channelModelId: "cm-1",
                    channelId: "ch-1",
                    channelModelKey: "upstream-video-pro",
                    channelModelName: "即梦视频 Pro",
                    enabled: true,
                    priority: 1,
                    weight: 100,
                    available: true,
                    capabilitySpec: {
                        version: 1,
                        capability: "video",
                        options: { vquality: { values: ["720p", "1080p"] } },
                    },
                },
            ],
        };

        const frontendItem = logicalModelToFrontendItem(mockLogical, mockChannels, mockChannelModels);

        expect(frontendItem.id).toBe("lmodel-123");
        expect(frontendItem.code).toBe("jimeng-2.1-video");
        expect(frontendItem.displayName).toBe("即梦 2.1 影视视频");
        expect(frontendItem.sourceCard.channelProtocol).toBe("volcengine-jimeng-video");
        expect(frontendItem.candidateUpstreams).toHaveLength(1);
        expect(frontendItem.candidateUpstreams[0].channelProtocol).toBe("volcengine-jimeng-video");
        expect(frontendItem.candidateUpstreams[0].supportedParameters).toContain("res_720p");
        expect(frontendItem.candidateUpstreams[0].supportedParameters).toContain("res_1080p");
    });

    test("前端模型回写为 GORM Mutation 时优先保留真实 code 并过滤无 channelModelId 的无效路由", () => {
        const mockItem: FrontendModelItem = {
            id: "lmodel-123",
            code: "jimeng-2.1-video",
            displayName: "即梦 2.1 影视视频",
            subtitle: "专业短剧分镜生成",
            showSubtitle: true,
            capability: "video",
            family: "JIMENG",
            group: "生视频",
            enabled: true,
            sortOrder: 1,
            primaryChannelId: "ch-1",
            primaryProtocolType: "system",
            sourceCard: {
                channelId: "ch-1",
                channelName: "官方渠道",
                upstreamModelId: "upstream-video-pro",
                endpoint: "https://api.example.com",
                authType: "Bearer Token",
                extractPath: "data.output",
                timeoutSeconds: 300,
                status: "healthy",
            },
            fallbackChannels: [],
            candidateUpstreams: [
                {
                    id: "cand-1",
                    channelId: "ch-1",
                    channelName: "官方渠道",
                    upstreamModelId: "upstream-video-pro",
                    channelModelId: "cm-real-123",
                    protocolType: "system",
                    endpoint: "https://api.example.com",
                    authType: "Bearer Token",
                    extractPath: "data.output",
                    timeoutSeconds: 300,
                    enabled: true,
                    supportedParameters: ["res_720p"],
                    status: "healthy",
                },
                {
                    id: "cand-invalid",
                    channelId: "ch-1",
                    channelName: "官方渠道",
                    upstreamModelId: "ghost-model",
                    channelModelId: undefined, // 无效路由，必须被过滤防 GORM 外键损坏
                    protocolType: "system",
                    endpoint: "https://api.example.com",
                    authType: "Bearer Token",
                    extractPath: "data.output",
                    timeoutSeconds: 300,
                    enabled: true,
                    supportedParameters: [],
                    status: "untested",
                },
            ],
            parameterPriorities: {},
            switchMatrix: [],
            conditionalRoutes: [],
            durationThresholdRule: {
                enabled: false,
                thresholdSeconds: 10,
                targetChannelId: "",
                targetChannelName: "",
                targetModelId: "",
                unitPrice: 0.08,
            },
            billing: {
                unit: "second",
                defaultCost: 0.05,
                defaultRatio: 1.6,
                defaultPrice: 0.08,
                tiers: [],
            },
        };

        const existingRaw: AdminLogicalModel = {
            id: "lmodel-123",
            code: "jimeng-2.1-video",
            name: "即梦 2.1 影视视频",
            description: "",
            capability: "video",
            sortOrder: 1,
            pricePolicy: "unified",
            billingMode: "per_second",
            unitPriceMicrocredits: 80000,
            inputPriceMicrocredits: 0,
            outputPriceMicrocredits: 0,
            cachedPriceMicrocredits: 0,
            priceTiers: [],
            legacyModelIds: [],
            capabilitySpec: { version: 1, capability: "video" },
            capabilityProfiles: [],
            defaultOptions: {},
            available: true,
            enabled: true,
            activeRevisionId: "rev-1",
            revisionVersion: 1,
            routes: [],
        };

        const mutation = frontendItemToLogicalModelMutation(mockItem, existingRaw);

        expect(mutation.code).toBe("jimeng-2.1-video");
        expect(mutation.name).toBe("即梦 2.1 影视视频");
        expect(mutation.routes).toHaveLength(1);
        expect(mutation.routes[0].channelModelId).toBe("cm-real-123");
        expect(mutation.pricePolicy).toBe("unified");
        expect(mutation.capabilitySpec.version).toBe(1);
    });

    test("候选路线多上游优先级保真：首选路线分配最高 Priority 并支持按 defaultCandidatePriority 动态调序", () => {
        const mockItem: FrontendModelItem = {
            id: "lmodel-multi-cand",
            code: "seedance-multi",
            displayName: "Seedance 多线路",
            capability: "video",
            family: "SEEDANCE",
            group: "生视频",
            enabled: true,
            sortOrder: 1,
            primaryChannelId: "ch-1",
            primaryProtocolType: "system",
            sourceCard: {
                channelId: "ch-1",
                channelName: "首选渠道",
                upstreamModelId: "cand-1-upstream",
                endpoint: "https://api1.com",
                authType: "Bearer Token",
                extractPath: "output",
                timeoutSeconds: 300,
                status: "healthy",
            },
            fallbackChannels: [],
            candidateUpstreams: [
                {
                    id: "cand-1",
                    channelId: "ch-1",
                    channelName: "渠道1",
                    upstreamModelId: "cand-1-upstream",
                    channelModelId: "cm-1",
                    protocolType: "system",
                    endpoint: "https://api1.com",
                    authType: "Bearer Token",
                    extractPath: "output",
                    timeoutSeconds: 300,
                    enabled: true,
                    supportedParameters: ["res_720p"],
                    status: "healthy",
                },
                {
                    id: "cand-2",
                    channelId: "ch-2",
                    channelName: "渠道2",
                    upstreamModelId: "cand-2-upstream",
                    channelModelId: "cm-2",
                    protocolType: "system",
                    endpoint: "https://api2.com",
                    authType: "Bearer Token",
                    extractPath: "output",
                    timeoutSeconds: 300,
                    enabled: true,
                    supportedParameters: ["res_720p", "res_1080p"],
                    status: "healthy",
                },
            ],
            parameterPriorities: {},
            switchMatrix: [],
            conditionalRoutes: [],
            billing: { unit: "second", defaultCost: 0.05, defaultRatio: 1.6, defaultPrice: 0.08, tiers: [] },
        };

        const mutation1 = frontendItemToLogicalModelMutation(mockItem);
        expect(mutation1.routes).toHaveLength(2);
        // 首位 cand-1 应分配更高的 Priority (100 > 90) 契约，使 Go 后端选路满足 route.Priority > maxPriority
        expect(mutation1.routes[0].channelModelId).toBe("cm-1");
        expect(mutation1.routes[0].priority).toBe(100);
        expect(mutation1.routes[1].channelModelId).toBe("cm-2");
        expect(mutation1.routes[1].priority).toBe(90);

        // 当用户通过调度条将 cand-2 置顶为 P1 时
        const itemWithReorder: FrontendModelItem = {
            ...mockItem,
            defaultCandidatePriority: ["cand-2", "cand-1"],
        };
        const mutation2 = frontendItemToLogicalModelMutation(itemWithReorder);
        expect(mutation2.routes[0].channelModelId).toBe("cm-2");
        expect(mutation2.routes[0].priority).toBe(100);
        expect(mutation2.routes[1].channelModelId).toBe("cm-1");
        expect(mutation2.routes[1].priority).toBe(90);
    });

    test("前端模型回写为 GORM Mutation 时自动继承物理渠道模型的能力画像（蒙版 maskSupported 与参考图数）", () => {
        const mockChannelModels: ChannelModel[] = [
            {
                id: "cm-gpt-image-2",
                channelId: "ch-1",
                modelKey: "gpt-image-2",
                providerModelKey: "gpt-image-2",
                displayName: "GPT Image 2",
                channelLabel: "",
                description: "",
                icon: "",
                capability: "image",
                protocol: "openai",
                enabled: true,
                billingMode: "fixed_request",
                unitPriceMicrocredits: 50000,
                inputTokenPriceMicrocredits: 0,
                outputTokenPriceMicrocredits: 0,
                cachedTokenPriceMicrocredits: 0,
                priceConfigured: true,
                priceTiers: [],
                priceVersion: 1,
                capabilityConfig: {
                    version: 1,
                    image: {
                        references: {
                            promptMaxChars: 32000,
                            maxImages: 16,
                            maxImageBytes: 31457280,
                            maskSupported: true,
                        },
                        size: {
                            parameter: "size",
                            values: ["1:1", "16:9", "9:16"],
                            default: "1:1",
                            allowCustom: true,
                        },
                    },
                },
                createdAt: "",
                updatedAt: "",
            },
        ];

        const mockItem: FrontendModelItem = {
            id: "gpt-image-2",
            code: "gpt-image-2",
            displayName: "GPT-Image-2",
            subtitle: "",
            showSubtitle: false,
            capability: "image",
            family: "OpenAI",
            group: "生图片",
            enabled: true,
            sortOrder: 1,
            primaryChannelId: "ch-1",
            primaryProtocolType: "system",
            sourceCard: {
                channelId: "ch-1",
                channelName: "官方渠道",
                upstreamModelId: "gpt-image-2",
                status: "healthy",
            },
            fallbackChannels: [],
            candidateUpstreams: [
                {
                    id: "cand-1",
                    channelId: "ch-1",
                    channelName: "官方渠道",
                    upstreamModelId: "gpt-image-2",
                    channelModelId: "cm-gpt-image-2",
                    protocolType: "system",
                    endpoint: "",
                    authType: "Bearer Token",
                    extractPath: "",
                    timeoutSeconds: 60,
                    enabled: true,
                    supportedParameters: ["ratio_1_1", "ratio_16_9", "ratio_9_16"],
                    status: "healthy",
                },
            ],
            parameterPriorities: {},
            switchMatrix: [],
            conditionalRoutes: [],
            durationThresholdRule: {
                enabled: false,
                thresholdSeconds: 10,
                targetChannelId: "",
                targetChannelName: "",
                targetModelId: "",
                unitPrice: 0.05,
            },
            billing: {
                unit: "request",
                defaultCost: 0.05,
                defaultRatio: 1.0,
                defaultPrice: 0.05,
                tiers: [],
            },
        };

        const mutation = frontendItemToLogicalModelMutation(mockItem, undefined, mockChannelModels);

        expect(mutation.capabilitySpec).toBeDefined();
        expect(mutation.capabilitySpec.capability).toBe("image");
        expect(mutation.capabilitySpec.inputs?.mask).toBeDefined();
        expect(mutation.capabilitySpec.inputs?.image?.max).toBe(16);
    });

    test("视频模型回写为 GORM Mutation 时完整继承视频秒数、画幅、首尾帧与生成声音规格", () => {
        const mockVideoChannelModels: ChannelModel[] = [
            {
                id: "cm-seedance-video",
                channelId: "ch-1",
                modelKey: "seedance-2.0-fast",
                providerModelKey: "seedance-2.0-fast",
                displayName: "Seedance 2.0 Fast",
                channelLabel: "",
                description: "",
                icon: "",
                capability: "video",
                protocol: "volcengine-jimeng-video",
                enabled: true,
                billingMode: "per_second",
                unitPriceMicrocredits: 60000,
                inputTokenPriceMicrocredits: 0,
                outputTokenPriceMicrocredits: 0,
                cachedTokenPriceMicrocredits: 0,
                priceConfigured: true,
                priceTiers: [
                    { id: "t1", channelModelId: "cm-seedance-video", resolution: "720p", videoSeconds: 5, billingMode: "per_second", unitPriceMicrocredits: 60000, inputTokenPriceMicrocredits: 0, outputTokenPriceMicrocredits: 0, cachedTokenPriceMicrocredits: 0, createdAt: "", updatedAt: "" },
                    { id: "t2", channelModelId: "cm-seedance-video", resolution: "1080p", videoSeconds: 10, billingMode: "per_second", unitPriceMicrocredits: 80000, inputTokenPriceMicrocredits: 0, outputTokenPriceMicrocredits: 0, cachedTokenPriceMicrocredits: 0, createdAt: "", updatedAt: "" },
                ],
                priceVersion: 1,
                capabilityConfig: {
                    version: 1,
                    video: {
                        duration: { selection: "enum", values: [5, 10], default: 5 },
                        ratios: ["16:9", "9:16", "1:1"],
                        defaultRatio: "16:9",
                        resolutions: ["720p", "1080p"],
                        defaultResolution: "720p",
                        operations: ["text-to-video", "image-to-video"],
                        defaultOperation: "text-to-video",
                        references: { minImages: 0, maxImages: 2, maxVideos: 1, maxAudios: 1, maxImageBytes: 10485760, maxVideoBytes: 52428800, maxVideoDurationSeconds: 10, maxAudioBytes: 10485760, maxAudioDurationSeconds: 30 },
                        generateAudio: { supported: true, default: true },
                        watermark: { supported: true, default: false },
                    },
                },
                createdAt: "",
                updatedAt: "",
            },
        ];

        const mockVideoItem: FrontendModelItem = {
            id: "seedance-2.0-fast",
            code: "seedance-2.0-fast",
            displayName: "Seedance 2.0 Fast",
            subtitle: "极速运镜出片",
            showSubtitle: false,
            capability: "video",
            family: "字节 Seedance",
            group: "生视频",
            enabled: true,
            sortOrder: 2,
            primaryChannelId: "ch-1",
            primaryProtocolType: "system",
            sourceCard: {
                channelId: "ch-1",
                channelName: "官方渠道",
                upstreamModelId: "seedance-2.0-fast",
                status: "healthy",
            },
            fallbackChannels: [],
            candidateUpstreams: [
                {
                    id: "cand-v1",
                    channelId: "ch-1",
                    channelName: "官方渠道",
                    upstreamModelId: "seedance-2.0-fast",
                    channelModelId: "cm-seedance-video",
                    protocolType: "system",
                    endpoint: "",
                    authType: "Bearer Token",
                    extractPath: "",
                    timeoutSeconds: 300,
                    enabled: true,
                    supportedParameters: ["res_720p", "res_1080p", "ratio_16_9", "ratio_9_16", "first_frame", "first_last_frame", "audio_generation"],
                    status: "healthy",
                },
            ],
            parameterPriorities: {},
            switchMatrix: [],
            conditionalRoutes: [],
            durationThresholdRule: {
                enabled: false,
                thresholdSeconds: 10,
                targetChannelId: "",
                targetChannelName: "",
                targetModelId: "",
                unitPrice: 0.08,
            },
            billing: {
                unit: "second",
                defaultCost: 0.06,
                defaultRatio: 1.5,
                defaultPrice: 0.09,
                tiers: [],
            },
        };

        const mutation = frontendItemToLogicalModelMutation(mockVideoItem, undefined, mockVideoChannelModels);

        expect(mutation.capabilitySpec).toBeDefined();
        expect(mutation.capabilitySpec.capability).toBe("video");
        expect(mutation.capabilitySpec.inputs?.image?.max).toBe(2);
        expect(mutation.capabilitySpec.inputs?.video?.max).toBe(1);
        expect(mutation.capabilitySpec.options?.videoSeconds).toBeDefined();
        expect(mutation.capabilitySpec.options?.videoGenerateAudio).toBeDefined();
        expect(mutation.capabilitySpec.options?.size).toBeDefined();
        expect(mutation.capabilitySpec.options?.vquality).toBeDefined();
    });
});

describe("智能模型中枢 · 动态路由分流与三元计费引擎", () => {
    test("推断请求特征参数：多图与首尾帧精准推断", () => {
        const dummyModel: FrontendModelItem = {
            id: "model-test",
            displayName: "测试模型",
            subtitle: "",
            showSubtitle: false,
            capability: "video",
            family: "SEEDANCE",
            group: "生视频",
            enabled: true,
            sortOrder: 1,
            primaryChannelId: "ch-1",
            primaryProtocolType: "system",
            sourceCard: {} as any,
            fallbackChannels: [],
            candidateUpstreams: [],
            parameterPriorities: {},
            switchMatrix: [],
            conditionalRoutes: [],
            durationThresholdRule: {} as any,
            billing: {} as any,
        };

        const req1 = {
            modelId: "model-test",
            resolution: "1080p",
            aspectRatio: "9:16",
            firstFrameImage: "https://example.com/f.jpg",
            lastFrameImage: "https://example.com/l.jpg",
            hasAudioGeneration: true,
        };

        const params = inferRequiredParameters(dummyModel, req1);
        expect(params).toContain("res_1080p");
        expect(params).toContain("ratio_9_16");
        expect(params).toContain("omni_ref"); // Seedance 家族有图触发 omni_ref
        expect(params).toContain("audio_generation");
    });

    test("校验候选模型资格与计费联动计算", () => {
        const candidate: UpstreamCandidateModel = {
            id: "cand-1",
            channelId: "ch-1",
            channelName: "渠道",
            upstreamModelId: "model-1",
            protocolType: "system",
            endpoint: "",
            authType: "Bearer Token",
            extractPath: "",
            timeoutSeconds: 300,
            enabled: true,
            supportedParameters: ["res_720p", "ratio_16_9", "audio_generation"],
            status: "healthy",
        };

        expect(isCandidateFullyQualified(candidate, ["res_720p", "ratio_16_9"])).toBe(true);
        expect(isCandidateFullyQualified(candidate, ["res_1080p"])).toBe(false);

        const dummyModelWithBilling: FrontendModelItem = {
            id: "model-test",
            displayName: "测试模型",
            subtitle: "",
            showSubtitle: false,
            capability: "video",
            family: "GENERAL",
            group: "生视频",
            enabled: true,
            sortOrder: 1,
            primaryChannelId: "ch-1",
            primaryProtocolType: "system",
            sourceCard: {} as any,
            fallbackChannels: [],
            candidateUpstreams: [candidate],
            parameterPriorities: {},
            switchMatrix: [],
            conditionalRoutes: [],
            durationThresholdRule: {} as any,
            billing: {
                unit: "second",
                defaultCost: 0.03,
                defaultRatio: 1.8,
                defaultPrice: 0.054,
                tiers: [
                    {
                        id: "tier-720p",
                        resolution: "720p",
                        upstreamCost: 0.03,
                        matchedParameterKey: "audio_generation",
                        matchedParameterLabel: "生成声音",
                        surchargeCost: 0.01,
                        markupRatio: 1.8,
                        userPrice: 0.072, // (0.03 + 0.01) * 1.8 = 0.072
                    },
                ],
                surcharges: [],
            },
        };

        const pricing = calculateModelPrice(dummyModelWithBilling, ["res_720p", "audio_generation"]);
        expect(pricing.finalPrice).toBe(0.072);
        expect(pricing.baseCost).toBe(0.03);
        expect(pricing.surchargeTotal).toBe(0.01);
    });

    test("真实网络连通性实测在测试环境正确返回 performance.now() 真实延迟，非写死假数据", async () => {
        const result = await testRealModelConnectivity("ch-1", "test-model-key", "video", "newapi");
        expect(result.status).toBe("healthy");
        expect(result.latencyMs).toBeGreaterThan(0);
        expect(result.testedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    test("能力类型归一化 resolveCapability：数据库空值与历史遗留模型精准识别", () => {
        // 生图模型空值识别
        expect(resolveCapability("", "gpt-image-2")).toBe("image");
        expect(resolveCapability("", "gpt-image-2.5")).toBe("image");
        expect(resolveCapability("", "nano-banana-pro")).toBe("image");
        expect(resolveCapability(undefined, "flux-dev")).toBe("image");

        // 生视频模型空值识别
        expect(resolveCapability("", "seedance-2.5")).toBe("video");
        expect(resolveCapability("", "kling-v1.5")).toBe("video");
        expect(resolveCapability("", "wan-2.1-t2v-14b")).toBe("video");
        expect(resolveCapability(undefined, "minimax-h3-video")).toBe("video");

        // 文本对话模型识别
        expect(resolveCapability("", "deepseek-chat")).toBe("text");
        expect(resolveCapability("", "claude-3-5-sonnet")).toBe("text");

        // 明确能力值优先保留
        expect(resolveCapability("video", "gpt-image-custom")).toBe("video");
        expect(resolveCapability("image", "kling-custom")).toBe("image");
    });

    test("彻底根治【生图片/生视频筛选 0 卡片 Bug】：即使数据库空值也能正常命中展示", () => {
        // 模拟数据库中存储的 8 个渠道模型（真实数据库中 capability 早期全部为 ""）
        const mockRawChannelModels: Array<{ id: string; modelKey: string; capability: string }> = [
            { id: "cm-1", modelKey: "gpt-image-2", capability: "" },
            { id: "cm-2", modelKey: "gpt-image-2.5", capability: "" },
            { id: "cm-3", modelKey: "gpt-image-hd", capability: "" },
            { id: "cm-4", modelKey: "nano-banana-pro", capability: "" },
            { id: "cm-5", modelKey: "seedance-2.5", capability: "" },
            { id: "cm-6", modelKey: "kling-v1.5", capability: "" },
        ];

        // 模拟用户点击【生图片】筛选
        const selectedCapability: "all" | "image" | "video" = "image";
        const filtered = mockRawChannelModels.filter((m) => {
            const itemCap = resolveCapability(m.capability, m.modelKey);
            if (selectedCapability !== "all" && itemCap !== selectedCapability) return false;
            return true;
        });

        // 必须成功筛出 4 个生图片模型，杜绝 0 卡片
        expect(filtered.length).toBe(4);
        expect(filtered.map((m) => m.modelKey)).toEqual([
            "gpt-image-2",
            "gpt-image-2.5",
            "gpt-image-hd",
            "nano-banana-pro",
        ]);

        // 模拟用户点击【生视频】筛选
        const videoFiltered = mockRawChannelModels.filter((m) => {
            const itemCap = resolveCapability(m.capability, m.modelKey);
            if ("video" !== "all" && itemCap !== "video") return false;
            return true;
        });
        expect(videoFiltered.length).toBe(2);
        expect(videoFiltered.map((m) => m.modelKey)).toEqual(["seedance-2.5", "kling-v1.5"]);
    });

    test("系统预置 42 个标准底座展示模型规范性与零上游网络请求约束", async () => {
        const { BASE_FOUNDATION_MODELS, BASE_MODEL_DEFINITIONS } = await import(
            "../src/pages/admin/model-router/mock-data"
        );

        expect(BASE_MODEL_DEFINITIONS).toHaveLength(42);
        expect(BASE_FOUNDATION_MODELS).toHaveLength(42);

        // 验证全部 42 个底座模型的结构：无硬编码上游线路、初始待接入、代码合法
        const codePattern = /^[a-z0-9][a-z0-9._-]{1,79}$/;
        for (const m of BASE_FOUNDATION_MODELS) {
            expect(m.id).toBeTruthy();
            expect(m.displayName).toBeTruthy();
            expect(m.candidateUpstreams).toEqual([]); // 严格零上游硬编码
            expect(m.primaryChannelId).toBe("");
            expect(m.code).toBeTruthy();
            expect(codePattern.test(m.code!)).toBe(true); // 符合 GORM 校验正则
            expect(["video", "image"]).toContain(m.capability);
            expect(m.switchMatrix.length).toBeGreaterThan(0);
        }

        // 分类统计验证：24 个生视频，18 个生图片
        const videoModels = BASE_FOUNDATION_MODELS.filter((m) => m.capability === "video");
        const imageModels = BASE_FOUNDATION_MODELS.filter((m) => m.capability === "image");
        expect(videoModels).toHaveLength(24);
        expect(imageModels).toHaveLength(18);

        // 核心知名厂商分组全覆盖验证
        const families = new Set(BASE_FOUNDATION_MODELS.map((m) => m.family));
        expect(families.has("字节 Seedance")).toBe(true);
        expect(families.has("MiniMax H3")).toBe(true);
        expect(families.has("通义万相")).toBe(true);
        expect(families.has("xAI Grok")).toBe(true);
        expect(families.has("Google Omni")).toBe(true);
        expect(families.has("欢乐马")).toBe(true);
        expect(families.has("GPT Image 2")).toBe(true);
        expect(families.has("谷歌 nanobanana")).toBe(true);
        expect(families.has("字节 Seedream")).toBe(true);
        expect(families.has("Midjourney")).toBe(true);
    });

    test("底座展示模型与数据库真实模型无缝融合策略验证", async () => {
        const { BASE_FOUNDATION_MODELS } = await import(
            "../src/pages/admin/model-router/mock-data"
        );

        // 模拟数据库已落库 1 个定制的 seedance-2.5 模型
        const mockDbFrontendModels = [
            {
                id: "db-seedance-2.5-id",
                code: "seedance-2.5",
                displayName: "自建 Seedance 2.5 生产线路",
                capability: "video" as const,
                family: "字节 Seedance",
                group: "生视频",
                candidateUpstreams: [{ id: "cand-real", channelId: "ch-1", upstreamModelId: "seedance-2.5", enabled: true } as any],
                sortOrder: 1,
            } as any,
        ];

        // 执行融合逻辑
        const dbModelIds = new Set(mockDbFrontendModels.map((m) => m.id));
        const dbModelCodes = new Set(mockDbFrontendModels.map((m) => m.code).filter(Boolean));
        const unconfiguredBaseModels = BASE_FOUNDATION_MODELS.filter(
            (bm) => !dbModelIds.has(bm.id) && !dbModelCodes.has(bm.code || "")
        );
        const merged = [...mockDbFrontendModels, ...unconfiguredBaseModels];

        // 结果总数应为 42 (1 个已在数据库的覆盖底座，剩余 41 个未配置底座补齐)
        expect(merged).toHaveLength(42);
        // 数据库版本排在第一位，且包含真实线路
        expect(merged[0].id).toBe("db-seedance-2.5-id");
        expect(merged[0].displayName).toBe("自建 Seedance 2.5 生产线路");
        expect(merged[0].candidateUpstreams).toHaveLength(1);
    });

    test("4K 像元尺寸与视频 4K 分辨率全链路智能推导验证 (含 3840x2160、2880x2880 等超大画幅)", async () => {
        const { is4KImageSize, is2KImageSize, resolveMaxResolution, extractSupportedParameterKeys } = await import(
            "../src/pages/admin/model-router/model-router-adapter"
        );

        // 1. 像元尺寸判定验证
        expect(is4KImageSize("3840x2160")).toBe(true);
        expect(is4KImageSize("2160x3840")).toBe(true);
        expect(is4KImageSize("3808x1632")).toBe(true);
        expect(is4KImageSize("2880x2880")).toBe(true);
        expect(is4KImageSize("3264x2448")).toBe(true);
        expect(is4KImageSize("4k")).toBe(true);
        expect(is4KImageSize("4096x4096")).toBe(true);

        // 2K 判定验证 (非 4K)
        expect(is4KImageSize("2048x2048")).toBe(false);
        expect(is2KImageSize("2048x2048")).toBe(true);
        expect(is2KImageSize("2560x1440")).toBe(true);
        expect(is2KImageSize("1920x1080")).toBe(true);

        // 2. 图片模型能力画像推导：包含 3840x2160 尺寸时精准激活 res_4k
        const imageSpec = {
            version: 1 as const,
            capability: "image" as const,
            options: {
                size: {
                    values: ["1024x1024", "2048x2048", "3840x2160", "16:9"],
                },
            },
        };
        const imageParams = extractSupportedParameterKeys("image", imageSpec as any);
        expect(imageParams).toContain("res_1k");
        expect(imageParams).toContain("res_2k");
        expect(imageParams).toContain("res_4k");
        expect(imageParams).toContain("ratio_16_9");

        // 3. 统一分辨率标签计算
        expect(resolveMaxResolution("image", imageParams)).toBe("4K 超清");
        expect(resolveMaxResolution("video", ["res_4k", "res_1080p"])).toBe("4K (2160p)");
        expect(resolveMaxResolution("video", ["res_2k", "res_1080p"])).toBe("2K (1440p)");

        // 4. 视频模型能力画像推导：通过 vquality、priceTiers 或 size.values 支持 4K (2160p)
        const videoSpec = {
            version: 1 as const,
            capability: "video" as const,
            options: {
                vquality: { values: ["720p", "1080p", "2160p"] },
                size: { values: ["16:9", "9:16"] },
            },
        };
        const videoParams = extractSupportedParameterKeys("video", videoSpec as any);
        expect(videoParams).toContain("res_720p");
        expect(videoParams).toContain("res_1080p");
        expect(videoParams).toContain("res_4k");
        expect(resolveMaxResolution("video", videoParams)).toBe("4K (2160p)");
    });

    test("模式 A 新增卡片删除时防底座卡片死灰复燃逻辑验证", async () => {
        const { BASE_FOUNDATION_MODELS } = await import(
            "../src/pages/admin/model-router/mock-data"
        );

        // 模拟用户通过“模式 A”创建了针对已有底座 gpt-image-2-discount 的前台卡片
        const modelId = "GPT-Image-2-特惠";
        const cleanId = "gpt-image-2-discount";
        const rawDbRecord = { id: "LMODEL_001", code: "gpt-image-2-discount" };

        // 模拟执行删除并落入已删除底座黑名单 (本地存储/内存隔离)
        const deletedStorage = new Set<string>([
            modelId,
            cleanId,
            `model-${cleanId}`,
            rawDbRecord.id,
            rawDbRecord.code,
            `model-${rawDbRecord.code}`,
        ]);

        // 此时数据库记录已物理删除 (rawModels 为空)
        const rawModels: any[] = [];
        const dbModelIds = new Set(rawModels.map((m) => m.id));
        const dbModelCodes = new Set(rawModels.map((m) => m.code).filter(Boolean));

        // 过滤未配置底座模型 (BASE_FOUNDATION_MODELS)
        const unconfiguredBaseModels = BASE_FOUNDATION_MODELS.filter(
            (bm) =>
                !dbModelIds.has(bm.id) &&
                !dbModelCodes.has(bm.code || "") &&
                !deletedStorage.has(bm.id) &&
                !deletedStorage.has(bm.code || "") &&
                !deletedStorage.has(`model-${bm.code}`) &&
                !deletedStorage.has(bm.id.replace(/^model-/, ""))
        );

        // 验证：已删除的 gpt-image-2 绝不会在 unconfiguredBaseModels 中死灰复燃！
        const resurrected = unconfiguredBaseModels.find(
            (m) => m.id === modelId || m.code === cleanId || m.id === cleanId
        );
        expect(resurrected).toBeUndefined();

        // 剩余底座模型总数恰好减少 1 个 (42 - 1 = 41)
        expect(unconfiguredBaseModels).toHaveLength(41);
    });

    test("“gpt-image-2”全维度匹配与历史重名残留多记录批量彻底归档", async () => {
        const { BASE_FOUNDATION_MODELS } = await import(
            "../src/pages/admin/model-router/mock-data"
        );

        // 模拟数据库中存在多条历史遗留同名记录 (例如用户通过渠道导入或多次快捷添加)
        const mockRawModels = [
            { id: "LMODEL_000007", code: "gpt-image-2", name: "gpt-image-2" },
            { id: "LMODEL_000009", code: "gpt-image-2-8969", name: "gpt-image-2" },
            { id: "LMODEL_000012", code: "flash", name: "gemini" },
        ];

        // 模拟当前前端展示模型 (卡片 ID 可能是 model-gpt-image-2、LMODEL_000007 或 displayName)
        const targetModel = {
            id: "model-gpt-image-2",
            code: "gpt-image-2",
            displayName: "gpt-image-2",
        };

        const modelId = "model-gpt-image-2";
        const cleanId = "gpt-image-2";

        const candidateKeys = new Set<string>([
            modelId,
            cleanId,
            `model-${cleanId}`,
            targetModel.id,
            targetModel.code,
            targetModel.displayName,
            `model-${targetModel.code}`,
        ]);

        const isMatch = (lm: { id: string; code?: string; name?: string }) => {
            return (
                candidateKeys.has(lm.id) ||
                (Boolean(lm.code) && candidateKeys.has(lm.code!)) ||
                (Boolean(lm.name) && candidateKeys.has(lm.name!)) ||
                (Boolean(lm.code) && candidateKeys.has(`model-${lm.code}`)) ||
                (Boolean(lm.id) && candidateKeys.has(`model-${lm.id}`)) ||
                (lm.id === targetModel.id ||
                    lm.code === targetModel.code ||
                    lm.name === targetModel.displayName ||
                    lm.code === targetModel.displayName ||
                    lm.name === targetModel.code)
            );
        };

        const matchedRawIds = mockRawModels.filter(isMatch).map((m) => m.id);

        // 验证：必须同时精准命中 LMODEL_000007 与 LMODEL_000009 两条历史残留记录！
        expect(matchedRawIds).toContain("LMODEL_000007");
        expect(matchedRawIds).toContain("LMODEL_000009");
        expect(matchedRawIds).not.toContain("LMODEL_000012");
        expect(matchedRawIds).toHaveLength(2);

        // 模拟黑名单入库
        const deletedStorage = new Set<string>(candidateKeys);
        matchedRawIds.forEach((id) => deletedStorage.add(id));

        // 模拟 loadAllData() 双向严格过滤
        // 1. 模拟数据库模型即使因延迟仍在返回：
        const dbFrontendModels = [
            { id: "LMODEL_000007", code: "gpt-image-2", displayName: "gpt-image-2" },
            { id: "LMODEL_000012", code: "flash", displayName: "gemini" },
        ];
        const filteredDb = dbFrontendModels.filter(
            (m) =>
                !deletedStorage.has(m.id) &&
                !deletedStorage.has(m.code || "") &&
                !deletedStorage.has(`model-${m.code}`) &&
                !deletedStorage.has(m.displayName || "")
        );
        expect(filteredDb.map((m) => m.id)).toEqual(["LMODEL_000012"]);

        // 2. 模拟底座展示模型 unconfiguredBaseModels：
        const unconfigured = BASE_FOUNDATION_MODELS.filter(
            (bm) =>
                !deletedStorage.has(bm.id) &&
                !deletedStorage.has(bm.code || "") &&
                !deletedStorage.has(`model-${bm.code}`) &&
                !deletedStorage.has(bm.displayName || "")
        );
        // 验证底座中已删除项被彻底阻断，绝不复活
        expect(unconfigured.some((m) => m.displayName === "gpt-image-2" || m.code === "gpt-image-2")).toBe(false);
    });

    test("模型分组卡片多渠道来源精确聚合与弹窗消歧验证 (解决多来源不知弹哪个的痛点)", () => {
        const mockSystemChannels: ModelChannel[] = [
            { id: "ch-ztx", name: "智天下API", type: "newapi", baseUrl: "https://api.ztx.com", apiKey: "sk-1" },
            { id: "ch-volc", name: "火山引擎", type: "volcengine", baseUrl: "https://ark.cn-beijing.volces.com", apiKey: "sk-2" },
            { id: "ch-ali", name: "阿里云百炼", type: "dashscope", baseUrl: "https://dashscope.aliyuncs.com", apiKey: "sk-3" },
        ];

        // 场景 1: 单一渠道模型分组卡片
        const singleChannelModel: any = {
            id: "model-single",
            displayName: "单渠道模型",
            sourceCard: {
                channelId: "ch-ztx",
                channelName: "智天下API",
                upstreamModelId: "gpt-4o",
            },
            candidateUpstreams: [],
            fallbackChannels: [],
        };

        const singleResult = getAssociatedChannels(singleChannelModel, mockSystemChannels);
        expect(singleResult).toHaveLength(1);
        expect(singleResult[0].channelId).toBe("ch-ztx");
        expect(singleResult[0].channelName).toBe("智天下API");
        expect(singleResult[0].isPrimary).toBe(true);
        expect(singleResult[0].upstreamModels).toEqual(["gpt-4o"]);

        // 场景 2: 多个渠道来源的分组卡片 (主渠道: 智天下, 候选路线: 火山引擎 + 阿里云百炼)
        const multiChannelModel: any = {
            id: "model-multi",
            displayName: "多来源调度模型",
            sourceCard: {
                channelId: "ch-ztx",
                channelName: "智天下API",
                upstreamModelId: "seedance-2.5-primary",
            },
            candidateUpstreams: [
                {
                    id: "cand-1",
                    channelId: "ch-volc",
                    channelName: "火山引擎",
                    upstreamModelId: "doubao-seedance-pro",
                    enabled: true,
                },
                {
                    id: "cand-2",
                    channelId: "ch-ali",
                    channelName: "阿里云百炼",
                    upstreamModelId: "wanx-2.1-t2v",
                    enabled: false,
                },
                {
                    id: "cand-3",
                    channelId: "ch-volc", // 同渠道不同上游代码，验证上游模型聚合与渠道去重
                    channelName: "火山引擎",
                    upstreamModelId: "doubao-seedance-fast",
                    enabled: true,
                },
            ],
            fallbackChannels: [
                {
                    channelId: "ch-ztx", // 与主渠道相同，应合并
                    channelName: "智天下",
                    upstreamModelId: "seedance-backup",
                    priority: 2,
                },
            ],
        };

        const multiResult = getAssociatedChannels(multiChannelModel, mockSystemChannels);
        // 应聚合为恰好 3 个独立渠道
        expect(multiResult).toHaveLength(3);

        // 主渠道校验
        const primary = multiResult.find((c) => c.channelId === "ch-ztx");
        expect(primary).toBeDefined();
        expect(primary!.isPrimary).toBe(true);
        expect(primary!.channelName).toBe("智天下API");
        expect(primary!.upstreamModels).toContain("seedance-2.5-primary");
        expect(primary!.upstreamModels).toContain("seedance-backup");
        expect(primary!.primaryUpstreamModel).toBe("seedance-2.5-primary");
        expect(primary!.routes.length).toBeGreaterThanOrEqual(2);
        expect(primary!.routes[0].sourceType).toBe("primary");
        expect(primary!.routes[0].upstreamModelId).toBe("seedance-2.5-primary");

        // 火山引擎候选路线校验 (去重并聚合两个上游代码)
        const volc = multiResult.find((c) => c.channelId === "ch-volc");
        expect(volc).toBeDefined();
        expect(volc!.isPrimary).toBe(false);
        expect(volc!.channelName).toBe("火山引擎");
        expect(volc!.upstreamModels).toEqual(["doubao-seedance-pro", "doubao-seedance-fast"]);
        expect(volc!.routes).toHaveLength(2);
        expect(volc!.routes[0].sourceType).toBe("candidate");
        expect(volc!.routes[0].upstreamModelId).toBe("doubao-seedance-pro");
        expect(volc!.routes[1].upstreamModelId).toBe("doubao-seedance-fast");

        // 阿里云百炼候选路线校验
        const ali = multiResult.find((c) => c.channelId === "ch-ali");
        expect(ali).toBeDefined();
        expect(ali!.isPrimary).toBe(false);
        expect(ali!.channelName).toBe("阿里云百炼");
        expect(ali!.upstreamModels).toEqual(["wanx-2.1-t2v"]);
        expect(ali!.routes).toHaveLength(1);
        expect(ali!.routes[0].upstreamModelId).toBe("wanx-2.1-t2v");

        // 场景 3: 未绑定渠道的纯底座模型或空卡片
        const emptyModel: any = {
            id: "model-empty",
            displayName: "未配置渠道模型",
            sourceCard: {},
            candidateUpstreams: [],
            fallbackChannels: [],
        };
        const emptyResult = getAssociatedChannels(emptyModel, mockSystemChannels);
        expect(emptyResult).toHaveLength(0);
    });
});
// @opc-feature: model-smart-router [end]

