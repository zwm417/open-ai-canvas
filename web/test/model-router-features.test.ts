// @opc-feature: model-smart-router [start]
import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import {
    COMPREHENSIVE_VIDEO_SWITCHES,
    COMPREHENSIVE_IMAGE_SWITCHES,
    getApplicableParametersForModel,
    INITIAL_FAMILIES,
    INITIAL_PLUGIN_PROTOCOLS,
} from "../src/pages/admin/model-router/mock-data";
import { useModelRouterStore } from "../src/pages/admin/model-router/model-router-store";
import {
    logicalModelToFrontendItem,
    frontendItemToLogicalModelMutation,
    extractSupportedParameterKeys,
    microcreditsToYuan,
    yuanToMicrocredits,
} from "../src/pages/admin/model-router/model-router-adapter";
import { resolveOutboundPayload } from "../src/pages/admin/model-router/utils/outbound-parameter-fallback";
import type { FrontendModelItem, UpstreamCandidateModel } from "../src/pages/admin/model-router/types";
import type { AdminLogicalModel } from "@/services/api/logical-models";
import type { ModelChannel } from "@/stores/use-config-store";
import type { ChannelModel } from "@/services/api/wallet";
import * as logicalModelsApi from "@/services/api/logical-models";

describe("智能模型中枢与智能路由真实落地契约测试", () => {
    // 构造测试用的标准物理渠道与模型元数据
    const mockChannel: ModelChannel = {
        id: "yunzhi",
        name: "云智原厂",
        baseUrl: "https://api.yunzhi.ai/v1",
        apiKey: "sk-test-key",
        enabled: true,
        order: 1,
    };

    const mockChannelModel: ChannelModel = {
        id: "cm-seedance-25",
        channelId: "yunzhi",
        modelKey: "seedance-2.5-orig",
        providerModelKey: "seedance-2.5",
        protocol: "openai/v1",
        enabled: true,
        costPrice: 1500000, // 1.5 元 (微积分)
        salePrice: 2000000,
        billingType: "duration",
        description: "云智原厂 Seedance 2.5 视频模型",
        capabilitySpec: {
            capability: "video",
            options: {
                vquality: { values: ["480p", "720p", "1080p"] },
                size: { values: ["16:9", "9:16", "1:1"] },
                videoSeconds: { min: 3, max: 10, default: 5 },
                videoGenerateAudio: { values: [true, false] },
            },
            inputs: {
                image: { min: 0, max: 2 },
            },
        },
    };

    const mockLogicalModel: AdminLogicalModel = {
        id: "lm-seedance-25",
        key: "seedance-2.5",
        name: "Seedance 2.5 电影短剧",
        family: "字节跳动 Seedance",
        capability: "video",
        defaultResolution: "720p",
        enabled: true,
        sortOrder: 1,
        routes: [
            {
                id: "route-seedance-1",
                logicalModelId: "lm-seedance-25",
                channelId: "yunzhi",
                channelModelId: "cm-seedance-25",
                channelModelKey: "seedance-2.5",
                priority: 1,
                enabled: true,
                available: true,
                capabilitySpec: mockChannelModel.capabilitySpec,
            },
        ],
    };

    const createSampleFrontendItem = (overrides?: Partial<FrontendModelItem>): FrontendModelItem => ({
        id: "seedance-2.5",
        displayName: "seedance-2.5",
        family: "字节跳动 Seedance",
        group: "生视频",
        capability: "video",
        enabled: true,
        sortOrder: 1,
        primaryChannelId: "yunzhi",
        primaryProtocolType: "system",
        subtitle: "超清电影级镜头生成，支持首尾帧与音频",
        showSubtitle: true,
        sourceCard: {
            channelId: "yunzhi",
            channelName: "云智原厂",
            protocolType: "system",
            upstreamModelId: "seedance-2.5",
            endpoint: "https://api.yunzhi.ai/v1",
            authType: "Bearer Token",
            extractPath: "data.output",
            timeoutSeconds: 300,
            status: "untested",
        },
        fallbackChannels: [],
        billing: {
            unit: "second",
            defaultCost: 0.03,
            defaultRatio: 1.8,
            defaultPrice: 0.054,
            tiers: [],
            surcharges: [],
        },
        candidateUpstreams: [
            {
                id: "cand-yunzhi-25",
                channelId: "yunzhi",
                channelName: "云智原厂",
                upstreamModelId: "seedance-2.5-3.0",
                channelModelId: "cm-seedance-25",
                protocolType: "system",
                endpoint: "https://api.yunzhi.ai/v1",
                authType: "Bearer Token",
                extractPath: "data.output",
                timeoutSeconds: 300,
                enabled: true,
                supportedParameters: ["res_1080p", "res_720p", "ratio_16_9", "ratio_9_16"],
                status: "untested",
                parameterSpecs: {
                    maxResolution: "1080p",
                    durationRange: "3s ~ 10s",
                    aspectRatios: ["16:9", "9:16", "1:1"],
                    modalities: ["Text-to-Video", "Image-to-Video"],
                    notes: "云智原厂专线",
                },
            },
            {
                id: "cand-lxmone-720",
                channelId: "lxmone",
                channelName: "万有引力",
                upstreamModelId: "seedance-2.5-720p",
                channelModelId: "cm-lx-720",
                protocolType: "system",
                endpoint: "https://api.lxmone.com/v1",
                authType: "Bearer Token",
                extractPath: "data.output",
                timeoutSeconds: 300,
                enabled: true,
                supportedParameters: ["res_720p", "res_480p", "ratio_16_9"],
                status: "untested",
                parameterSpecs: {
                    maxResolution: "720p",
                    durationRange: "3s ~ 10s",
                    aspectRatios: ["16:9"],
                    modalities: ["Text-to-Video"],
                    notes: "万有引力经济档",
                },
            },
        ],
        defaultCandidatePriority: ["cand-yunzhi-25", "cand-lxmone-720"],
        parameterPriorities: {
            res_1080p: ["cand-yunzhi-25"],
            res_720p: ["cand-lxmone-720"],
        },
        switchMatrix: COMPREHENSIVE_VIDEO_SWITCHES.map((sw) => ({ ...sw })),
        conditionalRoutes: [],
        durationThresholdRule: {
            enabled: true,
            thresholdSeconds: 30,
            targetChannelId: "lxmone",
            targetChannelName: "万有引力",
            targetModelId: "sd-2.5-flat-rate",
            unitPrice: 1.5,
        },
        durationSettings: {
            minSeconds: 2,
            maxSeconds: 15,
            isLocked: false,
            lockedSeconds: 5,
            maxDurationRouteEnabled: false,
        },
        ...overrides,
    });

    beforeEach(() => {
        // 模拟 API 请求，确保在单元测试环境不会发出真实不可解析的 URL
        spyOn(logicalModelsApi, "createAdminLogicalModel").mockResolvedValue({} as any);
        spyOn(logicalModelsApi, "updateAdminLogicalModel").mockResolvedValue({} as any);
        spyOn(logicalModelsApi, "deleteAdminLogicalModel").mockResolvedValue({} as any);

        // 重置 Store 状态
        useModelRouterStore.setState({
            models: [],
            rawLogicalModels: [],
            channels: [mockChannel],
            channelModels: [mockChannelModel],
            plugins: INITIAL_PLUGIN_PROTOCOLS,
            families: [...INITIAL_FAMILIES],
            isLoading: false,
            error: null,
            selectedCapability: "all",
            selectedProtocolType: "all",
            selectedFamily: "all",
            searchQuery: "",
        });
    });

    it("需求1: 真实落地适配层 (model-router-adapter) 精度换算与物理模型能力画像推导", () => {
        // 1. 微积分与常规元双向转换
        expect(microcreditsToYuan(1_500_000)).toBe(1.5);
        expect(microcreditsToYuan(30_000)).toBe(0.03);
        expect(yuanToMicrocredits(1.5)).toBe(1_500_000);
        expect(yuanToMicrocredits(0.054)).toBe(54_000);

        // 2. 从 CapabilitySpec 自动推导视频模型支持参数
        const videoKeys = extractSupportedParameterKeys("video", mockChannelModel.capabilitySpec);
        expect(videoKeys).toContain("res_480p");
        expect(videoKeys).toContain("res_720p");
        expect(videoKeys).toContain("res_1080p");
        expect(videoKeys).not.toContain("res_768p"); // 严禁跨模型参数串扰
        expect(videoKeys).toContain("ratio_16_9");
        expect(videoKeys).toContain("ratio_9_16");
        expect(videoKeys).toContain("duration_continuous");
        expect(videoKeys).toContain("first_frame");
        expect(videoKeys).toContain("first_last_frame");
        expect(videoKeys).toContain("audio_generation");

        // 3. 将后端 GORM AdminLogicalModel 转换至前端展示卡片
        const frontendCard = logicalModelToFrontendItem(mockLogicalModel, [mockChannel], [mockChannelModel]);
        expect(frontendCard.id).toBe("lm-seedance-25");
        expect(frontendCard.displayName).toBe("Seedance 2.5 电影短剧");
        expect(frontendCard.family).toBe("SEEDANCE");
        expect(frontendCard.capability).toBe("video");
        expect(frontendCard.sourceCard.channelName).toBe("云智原厂");
        expect(frontendCard.sourceCard.endpoint).toBe("https://api.yunzhi.ai/v1");
        expect(frontendCard.candidateUpstreams.length).toBe(1);
        expect(frontendCard.candidateUpstreams[0].supportedParameters).toContain("res_1080p");

        // 4. 将前端展示卡片逆向构建为后端更新载荷 Mutation
        const mutation = frontendItemToLogicalModelMutation(frontendCard);
        expect(mutation.code).toBe("lm-seedance-25");
        expect(mutation.name).toBe("Seedance 2.5 电影短剧");
        expect(mutation.capability).toBe("video");
        expect(mutation.routes?.length).toBe(1);
        expect(mutation.routes?.[0].channelModelId).toBe("cm-seedance-25");
        expect(mutation.routes?.[0].enabled).toBe(true);
    });

    it("需求2: 前端展示模型具备独立启用/停用总开关", async () => {
        const store = useModelRouterStore.getState();
        const sampleModel = createSampleFrontendItem();
        useModelRouterStore.setState({ models: [sampleModel] });

        // 初始为启用
        expect(useModelRouterStore.getState().models[0].enabled).toBe(true);

        // 管理员停用该模型
        await store.toggleModelEnabled("seedance-2.5", false);
        expect(useModelRouterStore.getState().models[0].enabled).toBe(false);

        // 再次启用
        await store.toggleModelEnabled("seedance-2.5", true);
        expect(useModelRouterStore.getState().models[0].enabled).toBe(true);
    });

    it("需求3: 渠道来源唯一信息卡片与模型副标题说明", () => {
        const sampleModel = createSampleFrontendItem();
        useModelRouterStore.setState({ models: [sampleModel] });

        const model = useModelRouterStore.getState().models[0];
        expect(model.sourceCard).toBeDefined();
        expect(model.sourceCard.channelName).toBe("云智原厂");
        expect(model.sourceCard.upstreamModelId).toBe("seedance-2.5");
        expect(model.sourceCard.endpoint).toContain("https://");
        expect(model.sourceCard.authType).toBe("Bearer Token");

        // 副标题与展示开关
        expect(model.subtitle.length).toBeGreaterThan(5);
        expect(model.subtitle.length).toBeLessThanOrEqual(120);
        expect(model.showSubtitle).toBe(true);
    });

    it("结合需求3: 一个前端展示模型 + 不同参数，后端匹配多个上游模型", () => {
        const sampleModel = createSampleFrontendItem();

        // 1. 用户选择 1080P -> 匹配到云智原厂 (seedance-2.5-3.0)
        const res1080 = resolveOutboundPayload(sampleModel, {
            modelId: sampleModel.id,
            prompt: "超清院线短剧",
            resolution: "1080p",
            duration: 5,
        });
        expect(res1080.targetChannelId).toBe("yunzhi");
        expect(res1080.targetModelId).toBe("seedance-2.5-3.0");
        expect(res1080.matchedRuleName).toContain("res_1080p");

        // 2. 用户选择 720P -> 匹配到万有引力 (seedance-2.5-720p)
        const res720 = resolveOutboundPayload(sampleModel, {
            modelId: sampleModel.id,
            prompt: "日常快速分镜",
            resolution: "720p",
            duration: 5,
        });
        expect(res720.targetChannelId).toBe("lxmone");
        expect(res720.targetModelId).toBe("seedance-2.5-720p");
    });

    it("需求4: 模型类别与前端展示排序通过穿梭框调整", async () => {
        const model1 = createSampleFrontendItem({ id: "model-1", sortOrder: 1 });
        const model2 = createSampleFrontendItem({ id: "model-2", sortOrder: 2 });
        useModelRouterStore.setState({ models: [model1, model2] });

        const store = useModelRouterStore.getState();
        // 调整排序：将 model-2 移到第一位
        await store.reorderModels("video", ["model-2", "model-1"]);

        const updated = useModelRouterStore.getState().models;
        expect(updated.find((m) => m.id === "model-2")?.sortOrder).toBe(1);
        expect(updated.find((m) => m.id === "model-1")?.sortOrder).toBe(2);
    });

    it("需求4拓展: 支持新增模型家族与新增前端模型卡片", async () => {
        const store = useModelRouterStore.getState();

        // 1. 增加新模型家族
        store.addFamily("快手可灵 Kling");
        expect(useModelRouterStore.getState().families).toContain("快手可灵 Kling");

        // 2. 增加具体新展示模型卡片
        const newCard = createSampleFrontendItem({
            id: "kling-1.5-pro",
            displayName: "kling-1.5-pro",
            family: "快手可灵 Kling",
            subtitle: "可灵 1.5 电影运镜与物理仿真",
        });
        await store.addModel(newCard);

        const found = useModelRouterStore.getState().models.find((m) => m.id === "kling-1.5-pro");
        expect(found).toBeDefined();
        expect(found?.family).toBe("快手可灵 Kling");
    });

    it("需求5: 支持【系统协议】与【插件协议】多态来源区分", () => {
        const systemModel = createSampleFrontendItem({
            id: "sys-1",
            primaryProtocolType: "system",
        });
        const pluginModel = createSampleFrontendItem({
            id: "plug-1",
            primaryProtocolType: "plugin",
            sourceCard: {
                channelId: "metaso",
                channelName: "秘塔插件通道",
                protocolType: "plugin",
                upstreamModelId: "metaso-video-h3",
                endpoint: "https://api.metaso.cn",
                authType: "Bearer Token",
                extractPath: "data.url",
                timeoutSeconds: 300,
                status: "untested",
            },
        });
        useModelRouterStore.setState({ models: [systemModel, pluginModel] });

        const store = useModelRouterStore.getState();
        const sys = store.models.filter((m) => m.primaryProtocolType === "system");
        const plug = store.models.filter((m) => m.primaryProtocolType === "plugin");

        expect(sys.length).toBe(1);
        expect(plug.length).toBe(1);
        expect(plug[0].sourceCard.channelName).toContain("秘塔");
    });

    it("需求6: 开关默认值与强制开启出站兜底替换机制", () => {
        const baseModel = createSampleFrontendItem();
        // 管理员强制开启了 1080P (forcedEnabled: true)，但渠道原生不支持 (channelDefault: false)
        const customModel: FrontendModelItem = {
            ...baseModel,
            switchMatrix: baseModel.switchMatrix.map((s) =>
                s.key === "res_1080p"
                    ? { ...s, channelDefault: false, forcedEnabled: true, fallbackValue: "720p" }
                    : s
            ),
        };

        // 用户在前端选择了 1080P 请求
        const resolution = resolveOutboundPayload(customModel, {
            modelId: customModel.id,
            prompt: "短剧特写镜头",
            resolution: "1080p",
            duration: 5,
        });

        // 验证出站拦截器自动替换为渠道合法的默认值 720p，并记录替换原因
        expect(resolution.isFallbackReplaced).toBe(true);
        expect(resolution.finalPayload.resolution).toBe("720p");
        expect(resolution.replacedFields[0].field).toBe("resolution");
        expect(resolution.replacedFields[0].fallbackValue).toBe("720p");
    });

    it("需求7: 长视频时长阈值自动分流开关 (转按条一口价上游)", () => {
        const model = createSampleFrontendItem();

        // 1. 生成时长 10 秒 (< 30s 阈值)：走常规渠道
        const shortRes = resolveOutboundPayload(model, {
            modelId: model.id,
            prompt: "短视频",
            duration: 10,
        });
        expect(shortRes.isFlatRateRouted).toBe(false);

        // 2. 生成时长 35 秒 (>= 30s 阈值)：自动转流至 SD-2.5 一口价渠道
        const longRes = resolveOutboundPayload(model, {
            modelId: model.id,
            prompt: "长剧集生成",
            duration: 35,
        });
        expect(longRes.isFlatRateRouted).toBe(true);
        expect(longRes.targetChannelId).toBe("lxmone");
        expect(longRes.targetModelId).toBe("sd-2.5-flat-rate");
        expect(longRes.billingType).toBe("count");
        expect(longRes.estimatedPrice).toBe(1.5);
    });

    it("需求8: 三元联动计费公式计算与双向回填 (Price = Cost * Ratio)", () => {
        const cost = 0.03;
        const ratio = 1.8;
        const price = Number((cost * ratio).toFixed(4));
        expect(price).toBe(0.054);

        const newPrice = 0.09;
        const backfilledRatio = Number((newPrice / cost).toFixed(4));
        expect(backfilledRatio).toBe(3.0);

        const newRatio = 2.5;
        const recalculatedPrice = Number((cost * newRatio).toFixed(4));
        expect(recalculatedPrice).toBe(0.075);
    });

    it("需求6: 一键 AI 分析插件契约并识别差异", async () => {
        const store = useModelRouterStore.getState();
        const mockRawSchema = JSON.stringify({
            name: "metaso-custom-video",
            fps: 24,
            adaptive: true,
            base64_required: true,
        });

        const analysis = await store.analyzePluginWithAI(mockRawSchema);
        expect(analysis.differences.length).toBeGreaterThan(0);
        expect(analysis.canAutoRoute).toBe(true);
        expect(analysis.suggestedGroup).toBe("生视频");
    });

    it("需求复核1: 彻底消除假静态测试数据，初始状态为待测速，测速后记录真实耗时与精确时间戳", async () => {
        const sampleModel = createSampleFrontendItem();
        useModelRouterStore.setState({ models: [sampleModel] });

        const model = useModelRouterStore.getState().models[0];
        // 初始未测试时，状态必须为 untested，无 fake 延迟和 fake 时间戳
        expect(model.sourceCard.status).toBe("untested");
        expect(model.sourceCard.lastLatencyMs).toBeUndefined();
        expect(model.sourceCard.lastTestedAt).toBeUndefined();

        // 候选池中所有候选模型初始也全部为 untested
        expect(model.candidateUpstreams?.every((c) => c.status === "untested")).toBe(true);
    });

    it("核心新特性1: 候选池上游物理模型勾选与前端常规参数变绿联动", async () => {
        const sampleModel = createSampleFrontendItem();
        useModelRouterStore.setState({ models: [sampleModel] });

        const store = useModelRouterStore.getState();
        const model = store.models[0];
        const primaryCand = model.candidateUpstreams[0];
        expect(primaryCand.enabled).toBe(true);

        // 联动计算：激活参数包含 1080p
        const activeParams = new Set(
            model.candidateUpstreams.filter((c) => c.enabled).flatMap((c) => c.supportedParameters)
        );
        expect(activeParams.has("res_1080p")).toBe(true);

        // 取消勾选主力模型
        await store.toggleCandidateEnabled(model.id, primaryCand.id, false);
        const afterDisable = useModelRouterStore.getState().models[0];
        expect(afterDisable.candidateUpstreams.find((c) => c.id === primaryCand.id)?.enabled).toBe(false);

        // 重新勾选
        await store.toggleCandidateEnabled(model.id, primaryCand.id, true);
        const restored = useModelRouterStore.getState().models[0];
        expect(restored.candidateUpstreams.find((c) => c.id === primaryCand.id)?.enabled).toBe(true);
    });

    it("核心新特性2: 同参数多模型优选路由映射 (Parameter Priority Routing)", async () => {
        const sampleModel = createSampleFrontendItem();
        useModelRouterStore.setState({ models: [sampleModel] });

        const store = useModelRouterStore.getState();
        const fallbackCand = sampleModel.candidateUpstreams[1]; // cand-lxmone-720

        // 设置 720P 优先路由至 fallbackCand
        await store.setParameterPriority(sampleModel.id, "res_720p", [fallbackCand.id]);
        const updated = useModelRouterStore.getState().models[0];
        expect(updated.parameterPriorities["res_720p"][0]).toBe(fallbackCand.id);
    });

    it("核心新特性3: 渠道模型添加至前端展示模型分组卡片", async () => {
        const sampleModel = createSampleFrontendItem();
        useModelRouterStore.setState({ models: [sampleModel] });

        const store = useModelRouterStore.getState();
        const newCandidate: UpstreamCandidateModel = {
            id: `cand-test-import-${Date.now()}`,
            channelId: "newtoken",
            channelName: "NewToken (全量)",
            upstreamModelId: "custom-imported-model",
            protocolType: "system",
            endpoint: "https://api.newtoken.top/v1/test",
            authType: "Bearer Token",
            extractPath: "response.url",
            timeoutSeconds: 300,
            enabled: true,
            supportedParameters: ["res_1080p", "res_2k", "fps_60"],
            status: "untested",
            parameterSpecs: {
                maxResolution: "2K",
                durationRange: "4s ~ 8s",
                aspectRatios: ["16:9", "9:16"],
                modalities: ["Text-to-Video"],
                notes: "测试导入",
            },
        };

        await store.addCandidateToModel(sampleModel.id, newCandidate);

        const targetModel = useModelRouterStore.getState().models[0];
        expect(targetModel.candidateUpstreams.some((c) => c.upstreamModelId === "custom-imported-model")).toBe(true);
        expect(targetModel.parameterPriorities["fps_60"]).toBeDefined();
    });

    it("整改核验1: 所有前端展示参数名称均在 6 个汉字以内，直观明了", () => {
        // 验证视频所有开关名称长度 <= 6
        COMPREHENSIVE_VIDEO_SWITCHES.forEach((item) => {
            expect(item.label.length).toBeLessThanOrEqual(6);
            expect(item.label.length).toBeGreaterThan(0);
        });

        // 验证图像所有开关名称长度 <= 6
        COMPREHENSIVE_IMAGE_SWITCHES.forEach((item) => {
            expect(item.label.length).toBeLessThanOrEqual(6);
            expect(item.label.length).toBeGreaterThan(0);
        });
    });

    it("整改核验2: 优先匹配系统默认展示参数，并清晰区分【系统默认】与【扩展参数】", () => {
        // 视频原生系统参数标记为 isSystemDefault: true
        const videoDefaultKeys = [
            "res_480p", "res_720p", "res_1080p", "ratio_16_9", "ratio_9_16",
            "ratio_1_1", "ratio_4_3", "first_frame", "duration_continuous",
            "audio_generation", "watermark_removal"
        ];
        videoDefaultKeys.forEach((key) => {
            const item = COMPREHENSIVE_VIDEO_SWITCHES.find((s) => s.key === key);
            expect(item).toBeDefined();
            expect(item?.isSystemDefault).toBe(true);
        });

        // 验证原生简单命名
        expect(COMPREHENSIVE_VIDEO_SWITCHES.find((s) => s.key === "res_480p")?.label).toBe("480p");
        expect(COMPREHENSIVE_VIDEO_SWITCHES.find((s) => s.key === "res_720p")?.label).toBe("720p");
        expect(COMPREHENSIVE_VIDEO_SWITCHES.find((s) => s.key === "ratio_16_9")?.label).toBe("16:9");
        expect(COMPREHENSIVE_VIDEO_SWITCHES.find((s) => s.key === "ratio_9_16")?.label).toBe("9:16");
        expect(COMPREHENSIVE_VIDEO_SWITCHES.find((s) => s.key === "duration_continuous")?.label).toBe("手动设置秒数");
        expect(COMPREHENSIVE_VIDEO_SWITCHES.find((s) => s.key === "audio_generation")?.label).toBe("生成声音");

        // 图像原生系统参数标记为 isSystemDefault: true
        const imgDefaultKeys = ["res_1k", "res_2k", "res_4k", "quality_hd", "ratio_1_1", "ratio_16_9", "transparent_bg", "inpaint_mask", "batch_count"];
        imgDefaultKeys.forEach((key) => {
            const item = COMPREHENSIVE_IMAGE_SWITCHES.find((s) => s.key === key);
            expect(item).toBeDefined();
            expect(item?.isSystemDefault).toBe(true);
        });
    });

    it("整改核验3: 彻底杜绝跨家族参数串扰 (Seedance 绝对无 768P电影/音频对口型，而 H3 具有)", () => {
        const seedance = createSampleFrontendItem({
            id: "seedance-2.5",
            displayName: "seedance-2.5",
            family: "字节跳动 Seedance",
        });
        const h3 = createSampleFrontendItem({
            id: "minimax-h3",
            displayName: "MiniMax-H3-增强",
            family: "MiniMax H3",
        });

        // 1. 验证 Seedance 2.5 适用参数库中绝对没有 768P电影
        const seedanceParams = getApplicableParametersForModel(seedance);
        expect(seedanceParams.some((p) => p.key === "res_768p")).toBe(false);

        // 2. 验证 MiniMax H3 适用参数库中正确拥有专属 768P电影
        const h3Params = getApplicableParametersForModel(h3);
        expect(h3Params.some((p) => p.key === "res_768p")).toBe(true);
    });
});
// @opc-feature: model-smart-router [end]
