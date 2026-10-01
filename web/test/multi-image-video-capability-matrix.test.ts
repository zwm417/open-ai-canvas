import { describe, expect, test } from "bun:test";
import { inferVideoOperation, modelCompatibilityError, resolveCompatibleModel, type ModelRequirements } from "@/lib/model-selection";
import type { AiConfig } from "@/stores/use-config-store";

function createTestConfig(models: Array<{
    id: string;
    model: string;
    displayName: string;
    maxImages: number;
    maxVideos?: number;
    maxAudios?: number;
    operations: string[];
    resolutions?: string[];
}>): AiConfig {
    return {
        model: models[0]?.id || "",
        videoModel: models[0]?.id || "",
        baseUrl: "https://api.test.com",
        apiKey: "sk-test",
        size: "9:16",
        vquality: "720p",
        videoSeconds: "5",
        channels: [
            {
                id: "test-channel",
                name: "测试渠道",
                type: "custom",
                baseUrl: "https://api.test.com",
                apiKey: "sk-test",
                models: models.map((m) => m.model),
                modelCosts: models.map((m) => ({
                    model: m.model,
                    displayName: m.displayName,
                    capability: "video",
                    capabilityConfig: {
                        version: 1,
                        video: {
                            references: {
                                promptMaxChars: 5000,
                                minImages: 0,
                                maxImages: m.maxImages,
                                maxImageBytes: 31457280,
                                maxVideos: m.maxVideos ?? 0,
                                maxVideoBytes: 31457280,
                                maxVideoDurationSeconds: 15,
                                maxAudios: m.maxAudios ?? 0,
                                maxAudioBytes: 15728640,
                                maxAudioDurationSeconds: 15,
                            },
                            duration: {
                                selection: "range",
                                min: 1,
                                max: 15,
                                step: 1,
                                default: 5,
                            },
                            ratios: ["9:16", "16:9"],
                            defaultRatio: "9:16",
                            resolutions: m.resolutions || ["720p", "1080p"],
                            defaultResolution: "720p",
                            generateAudio: { supported: true, default: false },
                            watermark: { supported: false, default: false },
                            operations: m.operations,
                            defaultOperation: m.operations[0] || "image_to_video",
                        },
                    },
                })),
            },
        ],
    };
}

describe("生视频多图输入与模型真实能力矩阵正向契约 (Multi-Image Video Capability Matrix)", () => {
    test("inferVideoOperation 正向基于素材种类推断，纯图输入不因张数多被误判为全模态参考", () => {
        // 纯文本
        expect(inferVideoOperation({ textCount: 1, imageCount: 0, videoCount: 0, audioCount: 0, characterCount: 0 })).toBe("text_to_video");
        // 单图与双图
        expect(inferVideoOperation({ textCount: 1, imageCount: 1, videoCount: 0, audioCount: 0, characterCount: 0 })).toBe("image_to_video");
        expect(inferVideoOperation({ textCount: 1, imageCount: 2, videoCount: 0, audioCount: 0, characterCount: 0 })).toBe("image_to_video");
        // 3图、6图、9图：只要无视频输入，正向归属为图生视频（多图参考）
        expect(inferVideoOperation({ textCount: 1, imageCount: 3, videoCount: 0, audioCount: 0, characterCount: 0 })).toBe("image_to_video");
        expect(inferVideoOperation({ textCount: 1, imageCount: 6, videoCount: 0, audioCount: 0, characterCount: 0 })).toBe("image_to_video");
        expect(inferVideoOperation({ textCount: 1, imageCount: 9, videoCount: 0, audioCount: 0, characterCount: 0 })).toBe("image_to_video");
        // 包含参考视频时，正向归属为全模态参考
        expect(inferVideoOperation({ textCount: 1, imageCount: 0, videoCount: 1, audioCount: 0, characterCount: 0 })).toBe("reference_to_video");
        expect(inferVideoOperation({ textCount: 1, imageCount: 3, videoCount: 1, audioCount: 0, characterCount: 0 })).toBe("reference_to_video");
        // 纯音频输入
        expect(inferVideoOperation({ textCount: 1, imageCount: 0, videoCount: 0, audioCount: 1, characterCount: 0 })).toBe("audio_to_video");
        // 图 + 音频：以图像为主模态
        expect(inferVideoOperation({ textCount: 1, imageCount: 3, videoCount: 0, audioCount: 1, characterCount: 0 })).toBe("image_to_video");
    });

    test("AutoDL H3 模型（maxImages=6/9, operations=['image_to_video']）在多图输入下完全兼容可选", () => {
        const config = createTestConfig([
            {
                id: "autodl-minimax-h3-z0902",
                model: "autodl-minimax-h3-z0902",
                displayName: "AutoDL-H3-6图",
                maxImages: 6,
                operations: ["image_to_video"],
            },
            {
                id: "autodl-minimax-h3-b99-003",
                model: "autodl-minimax-h3-b99-003",
                displayName: "AutoDL-H3-9图",
                maxImages: 9,
                operations: ["image_to_video"],
            },
        ]);

        // 3 张图片输入：在 6 图与 9 图 H3 模型上均应 100% 兼容，无错误阻断
        const req3Images: ModelRequirements = {
            capability: "video",
            input: { textCount: 1, imageCount: 3, videoCount: 0, audioCount: 0, characterCount: 0 },
        };
        expect(modelCompatibilityError(config, "autodl-minimax-h3-z0902", req3Images)).toBe("");
        expect(modelCompatibilityError(config, "autodl-minimax-h3-b99-003", req3Images)).toBe("");
        expect(resolveCompatibleModel(config, "autodl-minimax-h3-z0902", req3Images)).toBe("autodl-minimax-h3-z0902");

        // 6 张图片输入：恰好达到 6 图上限，在两模型上均兼容
        const req6Images: ModelRequirements = {
            capability: "video",
            input: { textCount: 1, imageCount: 6, videoCount: 0, audioCount: 0, characterCount: 0 },
        };
        expect(modelCompatibilityError(config, "autodl-minimax-h3-z0902", req6Images)).toBe("");
        expect(modelCompatibilityError(config, "autodl-minimax-h3-b99-003", req6Images)).toBe("");

        // 7 张图片输入：超出 z0902 (6图) 上限，精准拦截并提示清晰原因；但在 b99-003 (9图) 上依然完全可用
        const req7Images: ModelRequirements = {
            capability: "video",
            input: { textCount: 1, imageCount: 7, videoCount: 0, audioCount: 0, characterCount: 0 },
        };
        expect(modelCompatibilityError(config, "autodl-minimax-h3-z0902", req7Images)).toBe("最多支持 6 张参考图");
        expect(modelCompatibilityError(config, "autodl-minimax-h3-b99-003", req7Images)).toBe("");
    });

    test("输入参考视频时，依然严格按视频上限和 operation 校验，杜绝虚假放行", () => {
        const config = createTestConfig([
            {
                id: "autodl-minimax-h3-z0902",
                model: "autodl-minimax-h3-z0902",
                displayName: "AutoDL-H3-纯图",
                maxImages: 6,
                maxVideos: 0,
                operations: ["image_to_video"],
            },
            {
                id: "seedance-ref-model",
                model: "seedance-ref-model",
                displayName: "全模态模型",
                maxImages: 9,
                maxVideos: 3,
                operations: ["image_to_video", "reference_to_video"],
            },
        ]);

        const reqWithVideo: ModelRequirements = {
            capability: "video",
            input: { textCount: 1, imageCount: 2, videoCount: 1, audioCount: 0, characterCount: 0 },
        };

        // 纯图模型输入视频：精准拦截
        expect(modelCompatibilityError(config, "autodl-minimax-h3-z0902", reqWithVideo)).toBe("最多支持 0 个参考视频");
        // 全模态模型输入视频：完全通过
        expect(modelCompatibilityError(config, "seedance-ref-model", reqWithVideo)).toBe("");
    });
});
