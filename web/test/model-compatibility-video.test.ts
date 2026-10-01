import { expect, test } from "bun:test";
import { modelCompatibilityError, type ModelRequirements } from "../src/lib/model-selection";
import { systemChannelModelChannels } from "../src/lib/user-session";
import type { PublicChannelCatalog, PublicChannelModel } from "../src/services/api/logical-models";
import { defaultConfig, normalizeConfigSnapshot } from "../src/stores/use-config-store";
import { defaultModelCapabilityConfig } from "../src/lib/model-capabilities";

function customVideoModel(modelKey: string, customize: (base: ReturnType<typeof defaultModelCapabilityConfig>) => void): PublicChannelModel {
    const capabilityConfig = defaultModelCapabilityConfig("autodl-comfyui", modelKey);
    customize(capabilityConfig);
    return {
        id: modelKey,
        modelKey,
        displayName: modelKey,
        channelLabel: "AutoDL",
        description: "",
        icon: "AutoDL",
        capability: "video",
        protocol: "autodl-comfyui",
        available: true,
        pricingMode: "provider",
        priceLabel: "",
        capabilityConfig,
        priceTiers: [],
    };
}

test("modelCompatibilityError enforces minImages requirement", () => {
    // 首尾帧模型：minImages = 2, maxImages = 2
    const firstLastModel = customVideoModel("minimax_h3_lightx2v", (cfg) => {
        cfg.video!.references.minImages = 2;
        cfg.video!.references.maxImages = 2;
        cfg.video!.operations = ["image_to_video"];
    });
    const channels: PublicChannelCatalog[] = [
        { id: "autodl", name: "AutoDL", displayName: "AutoDL", models: [firstLastModel] },
    ];
    const config = normalizeConfigSnapshot({
        config: { ...defaultConfig, channels: systemChannelModelChannels(channels) },
    }).config;

    // 0 张图
    const req0: ModelRequirements = {
        capability: "video",
        input: { textCount: 1, imageCount: 0, videoCount: 0, audioCount: 0, characterCount: 0 },
    };
    expect(modelCompatibilityError(config, "autodl::minimax_h3_lightx2v", req0)).toBe("需至少 2 张参考图");

    // 1 张图
    const req1: ModelRequirements = {
        capability: "video",
        input: { textCount: 1, imageCount: 1, videoCount: 0, audioCount: 0, characterCount: 0 },
    };
    expect(modelCompatibilityError(config, "autodl::minimax_h3_lightx2v", req1)).toBe("需至少 2 张参考图");

    // 2 张图（合规）
    const req2: ModelRequirements = {
        capability: "video",
        input: { textCount: 1, imageCount: 2, videoCount: 0, audioCount: 0, characterCount: 0 },
    };
    expect(modelCompatibilityError(config, "autodl::minimax_h3_lightx2v", req2)).toBe("");

    // 3 张图（超限）
    const req3: ModelRequirements = {
        capability: "video",
        input: { textCount: 1, imageCount: 3, videoCount: 0, audioCount: 0, characterCount: 0 },
    };
    expect(modelCompatibilityError(config, "autodl::minimax_h3_lightx2v", req3)).toBe("最多支持 2 张参考图");
});

test("modelCompatibilityError enforces ratios and resolution options", () => {
    const ratioModel = customVideoModel("z0901", (cfg) => {
        cfg.video!.ratios = ["9:16", "16:9"];
        cfg.video!.resolutions = ["480p竖", "768p竖", "480p横", "768p横"];
        cfg.video!.references.minImages = 0;
        cfg.video!.references.maxImages = 0;
        cfg.video!.operations = ["text_to_video"];
    });
    const channels: PublicChannelCatalog[] = [
        { id: "autodl", name: "AutoDL", displayName: "AutoDL", models: [ratioModel] },
    ];
    const config = normalizeConfigSnapshot({
        config: { ...defaultConfig, channels: systemChannelModelChannels(channels) },
    }).config;

    // 1:1 画幅不支持
    const reqSquare: ModelRequirements = {
        capability: "video",
        options: { size: "1:1" },
    };
    expect(modelCompatibilityError(config, "autodl::z0901", reqSquare)).toBe("不支持当前画幅比例 (1:1)");

    // 9:16 画幅支持
    const reqPortrait: ModelRequirements = {
        capability: "video",
        options: { size: "9:16" },
    };
    expect(modelCompatibilityError(config, "autodl::z0901", reqPortrait)).toBe("");

    // 1080p 分辨率不支持
    const req1080p: ModelRequirements = {
        capability: "video",
        options: { vquality: "1080p" },
    };
    expect(modelCompatibilityError(config, "autodl::z0901", req1080p)).toBe("不支持当前分辨率 (1080p)");

    // 768p 分辨率支持（前缀匹配 768p竖/横）
    const req768p: ModelRequirements = {
        capability: "video",
        options: { vquality: "768p" },
    };
    expect(modelCompatibilityError(config, "autodl::z0901", req768p)).toBe("");
});

test("modelCompatibilityError enforces audio generation and minAudios constraints", () => {
    const noAudioModel = customVideoModel("b99_001", (cfg) => {
        cfg.video!.generateAudio = { supported: false, default: false };
        cfg.video!.references.minAudios = 0;
        cfg.video!.references.maxAudios = 0;
    });
    const requireAudioModel = customVideoModel("lip_sync", (cfg) => {
        cfg.video!.generateAudio = { supported: true, default: true };
        cfg.video!.references.minAudios = 1;
        cfg.video!.references.maxAudios = 1;
    });
    const channels: PublicChannelCatalog[] = [
        { id: "autodl", name: "AutoDL", displayName: "AutoDL", models: [noAudioModel, requireAudioModel] },
    ];
    const config = normalizeConfigSnapshot({
        config: { ...defaultConfig, channels: systemChannelModelChannels(channels) },
    }).config;

    // 请求开启音频但模型不支持
    const reqAudioOn: ModelRequirements = {
        capability: "video",
        options: { videoGenerateAudio: true },
    };
    expect(modelCompatibilityError(config, "autodl::b99_001", reqAudioOn)).toBe("该模型不支持生成音频");

    // 必须提供参考音频但输入为 0
    const reqNoAudioInput: ModelRequirements = {
        capability: "video",
        input: { textCount: 1, imageCount: 1, videoCount: 0, audioCount: 0, characterCount: 0 },
    };
    expect(modelCompatibilityError(config, "autodl::lip_sync", reqNoAudioInput)).toBe("需至少 1 个参考音频");
});
