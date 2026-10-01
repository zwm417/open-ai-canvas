import { describe, expect, test, beforeEach } from "bun:test";
import {
    logicalModelToFrontendItem,
    frontendItemToLogicalModelMutation,
    loadModelRouterExtra,
    saveModelRouterExtra,
    extractSupportedParameterKeys,
} from "../src/pages/admin/model-router/model-router-adapter";
import { resolveModelRouting } from "../src/pages/admin/model-router/utils/routing-engine";
import type { AdminLogicalModel } from "@/services/api/logical-models";
import type { ChannelModel } from "@/services/api/wallet";
import type { ModelChannel } from "@/stores/use-config-store";

describe("智能模型中枢 · 修复项与持久化回归测试", () => {
    beforeEach(() => {
        if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.clear();
        }
    });

    const mockChannel: ModelChannel = {
        id: "ch-1",
        name: "测试渠道1",
        type: "openai",
        baseUrl: "https://api.test.com",
        status: "active",
        priority: 10,
        weight: 10,
        retryCount: 3,
        timeoutMs: 30000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    const mockChannelModel: ChannelModel = {
        id: "cm-1",
        channelId: "ch-1",
        modelKey: "test-video-model",
        displayName: "测试上游模型",
        billingMode: "per_second",
        capability: "video",
        enabled: true,
        protocol: "system",
        capabilityConfig: {
            video: {
                duration: { selection: "range", min: 3, max: 12, step: 1 },
                ratios: ["16:9", "9:16", "1:1"],
                resolutions: ["720p", "1080p"],
            },
        },
    } as any;

    const mockLogical: AdminLogicalModel = {
        id: "logical-test-1",
        code: "test-video-hub",
        name: "测试视频模型中枢",
        capability: "video",
        enabled: true,
        pricePolicy: "unified",
        billingMode: "per_second",
        unitPriceMicrocredits: 50000,
        sortOrder: 1,
        routes: [
            {
                id: "route-1",
                channelId: "ch-1",
                channelModelId: "cm-1",
                channelModelKey: "test-video-model",
                enabled: true,
                available: true,
                priority: 100,
                weight: 100,
            },
        ],
        capabilitySpec: {
            version: 1,
            capability: "video",
            options: {
                videoSeconds: { min: 3, max: 12 },
                vquality: { values: ["720p", "1080p"] },
                size: { values: ["16:9", "9:16", "1:1"] },
            },
        },
    };

    test("1. 单参数优选路由不会默认强行锁死为首个模型，支持默认 'default' 与保存恢复", () => {
        // 初始转换：未保存时，parameterPriorities 应为空对象，而不是把每个参数强行赋值为 cand.id
        const item = logicalModelToFrontendItem(mockLogical, [mockChannel], [mockChannelModel]);
        expect(item.parameterPriorities).toEqual({});

        // 模拟用户在参数看板将 res_1080p 指定为特定模型 cm-1
        item.parameterPriorities["res_1080p"] = ["cm-1"];
        item.parameterPriorities["res_720p"] = ["default"];

        // 模拟保存
        frontendItemToLogicalModelMutation(item, mockLogical, [mockChannelModel]);

        // 模拟重新从后端拉取并转换
        const itemReloaded = logicalModelToFrontendItem(mockLogical, [mockChannel], [mockChannelModel]);
        expect(itemReloaded.parameterPriorities["res_1080p"]).toEqual(["cm-1"]);
        expect(itemReloaded.parameterPriorities["res_720p"]).toEqual(["default"]);
    });

    test("2. 锁定固定秒数与最大秒数路由配置能持久化并同步至 capabilitySpec", () => {
        const item = logicalModelToFrontendItem(mockLogical, [mockChannel], [mockChannelModel]);
        expect(item.durationSettings).toBeDefined();
        expect(item.durationSettings?.minSeconds).toBe(3);
        expect(item.durationSettings?.maxSeconds).toBe(12);

        // 用户开启锁定固定 6 秒，并配置达到最大秒数特定路由
        item.durationSettings = {
            minSeconds: 3,
            maxSeconds: 12,
            isLocked: true,
            lockedSeconds: 6,
            maxDurationRouteEnabled: true,
            maxDurationTargetCandidateId: "route-1",
        };

        const mutation = frontendItemToLogicalModelMutation(item, mockLogical, [mockChannelModel]);
        // 验证写入了 capabilitySpec.options.videoSeconds
        expect(mutation.capabilitySpec.options?.videoSeconds).toEqual({ values: [6] });

        // 重新加载后，durationSettings 完整还原
        const itemReloaded = logicalModelToFrontendItem(
            { ...mockLogical, capabilitySpec: mutation.capabilitySpec },
            [mockChannel],
            [mockChannelModel]
        );
        expect(itemReloaded.durationSettings?.isLocked).toBe(true);
        expect(itemReloaded.durationSettings?.lockedSeconds).toBe(6);
        expect(itemReloaded.durationSettings?.maxDurationRouteEnabled).toBe(true);
        expect(itemReloaded.durationSettings?.maxDurationTargetCandidateId).toBe("route-1");
    });

    test("3. 前台展示开关状态能持久化并跨会话恢复", () => {
        const item = logicalModelToFrontendItem(mockLogical, [mockChannel], [mockChannelModel]);
        const targetSwitch = item.switchMatrix.find((s) => s.key === "res_720p");
        expect(targetSwitch).toBeDefined();

        // 用户关闭 res_720p 的前台展示
        item.switchMatrix = item.switchMatrix.map((s) =>
            s.key === "res_720p" ? { ...s, showInFrontend: false } : s
        );

        frontendItemToLogicalModelMutation(item, mockLogical, [mockChannelModel]);

        // 重新加载
        const itemReloaded = logicalModelToFrontendItem(mockLogical, [mockChannel], [mockChannelModel]);
        const reloadedSwitch = itemReloaded.switchMatrix.find((s) => s.key === "res_720p");
        expect(reloadedSwitch?.showInFrontend).toBe(false);
    });

    test("4. 视频与生图能力画像提取包含全参数与基础保底", () => {
        // 视频画像提取
        const videoKeys = extractSupportedParameterKeys("video", {
            version: 1,
            capability: "video",
            inputs: { image: { min: 0, max: 2 }, video: { min: 0, max: 1 }, audio: { min: 0, max: 1 } },
            options: {
                videoSeconds: { min: 2, max: 15 },
                vquality: { values: ["720p", "1080p"] },
                size: { values: ["16:9", "9:16"] },
                videoGenerateAudio: { values: [true] },
                fps: { values: [30, 60] } as any,
            },
        });
        expect(videoKeys).toContain("res_720p");
        expect(videoKeys).toContain("res_1080p");
        expect(videoKeys).toContain("ratio_16_9");
        expect(videoKeys).toContain("ratio_9_16");
        expect(videoKeys).toContain("ratio_auto");
        expect(videoKeys).toContain("first_frame");
        expect(videoKeys).toContain("first_last_frame");
        expect(videoKeys).toContain("multi_ref");
        expect(videoKeys).toContain("motion_reference");
        expect(videoKeys).toContain("video_editing");
        expect(videoKeys).toContain("video_continuation");
        expect(videoKeys).toContain("audio_generation");
        expect(videoKeys).toContain("audio_lip_sync");
        expect(videoKeys).toContain("fps_60");
        expect(videoKeys).toContain("seed_lock");

        // 生图画像提取
        const imageKeys = extractSupportedParameterKeys("image", {
            version: 1,
            capability: "image",
            inputs: { image: { min: 0, max: 4 }, mask: { min: 0, max: 1 } },
            options: {
                size: { values: ["1:1", "16:9"] },
                transparentBackground: { values: [true] },
                count: { min: 1, max: 4 },
            },
        });
        expect(imageKeys).toContain("ratio_1_1");
        expect(imageKeys).toContain("ratio_16_9");
        expect(imageKeys).toContain("transparent_bg");
        expect(imageKeys).toContain("inpaint_mask");
        expect(imageKeys).toContain("batch_count");
        expect(imageKeys).toContain("multi_ref_synthesis");
        expect(imageKeys).toContain("prompt_expansion");
    });

    test("5. 路由引擎在管理员显式特指未打标参数时依然能准确匹配该特指模型", () => {
        const item = logicalModelToFrontendItem(mockLogical, [mockChannel], [mockChannelModel]);
        // 模拟 candidateUpstreams 中有未显式打标 res_4k 的模型，但管理员手动在后台特指了该模型走 res_4k
        item.candidateUpstreams[0].supportedParameters = ["res_720p", "ratio_16_9"];
        item.parameterPriorities = {
            res_4k: [item.candidateUpstreams[0].id],
        };

        const decision = resolveModelRouting(item, {
            modelId: item.id,
            resolution: "4k",
            aspectRatio: "16:9",
        });

        expect(decision.success).toBe(true);
        expect(decision.ruleMatched).toBe("SPECIFIC_PARAM_OVERRIDE");
        expect(decision.targetModelId).toBe(item.candidateUpstreams[0].upstreamModelId);
    });
});

