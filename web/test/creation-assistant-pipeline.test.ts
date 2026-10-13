import { describe, expect, it } from "bun:test";

import {
    buildCreationAssistantAnalysisPrompt,
    buildCreationAssistantPrompts,
    buildReferenceScriptCreationAssistantPrompts,
    normalizeCreationAssistantScript,
    type CreationAssistantManifestItem,
} from "../src/lib/creation-assistant-prompts";
import {
    calculateCreationAssistantSegments,
    formatCreationAssistantSegmentPlan,
    segmentCreationAssistantTimeline,
} from "../src/lib/creation-assistant-segmentation";
import {
    CREATION_ASSISTANT_ANALYSIS_NODE_TYPE,
    CREATION_ASSISTANT_ANALYSIS_PLUGIN_ID,
    CREATION_ASSISTANT_SCRIPT_NODE_TYPE,
    CREATION_ASSISTANT_SCRIPT_PLUGIN_ID,
} from "../src/extensions/opc-infinite/services/creation-assistant-contracts";

describe("Creation Assistant Pipeline & Contracts", () => {
    it("should export correct plugin IDs and node types", () => {
        expect(CREATION_ASSISTANT_ANALYSIS_PLUGIN_ID).toBe("creation-assistant-analysis");
        expect(CREATION_ASSISTANT_ANALYSIS_NODE_TYPE).toBe("creation-assistant-analysis:analyzer");
        expect(CREATION_ASSISTANT_SCRIPT_PLUGIN_ID).toBe("creation-assistant-script");
        expect(CREATION_ASSISTANT_SCRIPT_NODE_TYPE).toBe("creation-assistant-script:generator");
    });

    it("should build structured analysis prompt containing manifest items and 7 insight requirements", () => {
        const manifest: CreationAssistantManifestItem[] = [
            { fileId: "f1", order: 1, name: "demo.mp4", mediaType: "video" },
            { fileId: "f2", order: 2, name: "product.jpg", mediaType: "image" },
        ];
        const prompt = buildCreationAssistantAnalysisPrompt(manifest);
        expect(prompt).toContain("商品名称");
        expect(prompt).toContain("核心卖点");
        expect(prompt).toContain("人群痛点");
        expect(prompt).toContain("f1");
        expect(prompt).toContain("f2");
    });

    it("should segment timeline according to video model maximum duration bounds", () => {
        // 30 seconds total, max 10 seconds per segment
        const segments = segmentCreationAssistantTimeline(30, 10);
        expect(segments.length).toBe(3);
        expect(segments[0].durationSec).toBe(10);
        expect(segments[1].durationSec).toBe(10);
        expect(segments[2].durationSec).toBe(10);
        expect(segments[0].mode).toBe("initial");
        expect(segments[1].mode).toBe("independent");
        expect(segments[1].previousSegment).toBe(1);
    });

    it("should build prompt bundle for standard configuration generation", () => {
        const bundle = buildCreationAssistantPrompts({
            fileSummaries: [{ fileId: "f1", summary: "高清不锈钢保温杯展示" }],
            insightSections: [{ title: "核心卖点", items: [{ text: "24小时超长保温", sourceFileIds: ["f1"] }] }],
            assetReferenceMap: [{ ref: "@视频1", mediaType: "video", fileId: "f1", name: "demo.mp4" }],
            businessScenario: "ecommerce",
            language: "zh",
            scriptType: "qianchuan",
            shootingStyle: "unboxing_tabletop",
            durationSec: 30,
            videoModel: "kling-v1-6",
            videoModelMaxDurationSec: 10,
            videoSegmentPlan: segmentCreationAssistantTimeline(30, 10),
            primaryPlatform: "douyin",
            secondaryPlatforms: ["kuaishou"],
            additionalNotes: "结尾重点引导关注小黄车",
        });

        expect(bundle.systemPrompt).toBeDefined();
        expect(bundle.userPrompt).toContain("千川带货");
        expect(bundle.userPrompt).toContain("开箱桌拍");
        expect(bundle.userPrompt).toContain("抖音");
        expect(bundle.userPrompt).toContain("24小时超长保温");
    });

    it("should build prompt bundle for reference script generation", () => {
        const bundle = buildReferenceScriptCreationAssistantPrompts({
            fileSummaries: [{ fileId: "f1", summary: "产品外观与功能展示" }],
            insightSections: [{ title: "产品特性", items: [{ text: "轻量化设计", sourceFileIds: ["f1"] }] }],
            assetReferenceMap: [{ ref: "@视频1", mediaType: "video", fileId: "f1", name: "demo.mp4" }],
            businessScenario: "ecommerce",
            language: "zh",
            durationSec: 15,
            videoModel: "kling-v1-6",
            videoModelMaxDurationSec: 10,
            videoSegmentPlan: segmentCreationAssistantTimeline(15, 10),
            additionalNotes: "保留原视频节奏",
            referenceScript: "0-3s 快速展示杯盖阻水细节；4-10s 倾倒测试不漏水。",
            referenceScriptDurationSec: 15,
        });

        expect(bundle.userPrompt).toContain("0-3s 快速展示杯盖阻水细节");
        expect(bundle.userPrompt).toContain("轻量化设计");
    });

    it("should normalize output script removing markdown fences", () => {
        const raw = "```markdown\n【分镜 1】开场展示商品特写\n```";
        const normalized = normalizeCreationAssistantScript(raw);
        expect(normalized).toBe("【分镜 1】开场展示商品特写");
    });

    it("should strictly align dual-track reverse parameters and local ASR defaults with canvas node", async () => {
        const { defaultCreationAssistantDraft } = await import("../src/stores/use-creation-assistant-store");
        expect(defaultCreationAssistantDraft.deconstructSceneThreshold).toBe(0.15);
        expect(defaultCreationAssistantDraft.deconstructMinSceneGapSec).toBe(0.25);
        expect(defaultCreationAssistantDraft.deconstructLocalAsrEnabled).toBe(true);
        expect(defaultCreationAssistantDraft.deconstructWordLevelAudio).toBe(true);

        expect(defaultCreationAssistantDraft.classicSceneThreshold).toBe(0.20);
        expect(defaultCreationAssistantDraft.classicMinSceneGapSec).toBe(0.3);
        expect(defaultCreationAssistantDraft.reverseActiveMode).toBe("classic");
    });

    it("should isolate classic and deconstruct prompt states and preserve unapplied scripts", async () => {
        const { useCreationAssistantStore } = await import("../src/stores/use-creation-assistant-store");
        const store = useCreationAssistantStore.getState();

        // 模拟经典反推产出脚本
        store.updateDraft({
            classicPrompt: "【经典时序反推】0-5s 运镜推进特写",
            classicStatus: "complete",
        });

        // 模拟创意反推产出分镜
        store.updateDraft({
            deconstructPrompt: "【创意分镜拆解】镜头 1：0.0s-3.5s 核心钩子",
            deconstructStatus: "complete",
        });

        const currentDraft = useCreationAssistantStore.getState().draft;
        expect(currentDraft.classicPrompt).toBe("【经典时序反推】0-5s 运镜推进特写");
        expect(currentDraft.deconstructPrompt).toBe("【创意分镜拆解】镜头 1：0.0s-3.5s 核心钩子");

        // 模拟用户进入配置模式重调参数（非破坏性）
        store.updateDraft({
            deconstructSceneThreshold: 0.18,
            classicSceneThreshold: 0.22,
        });

        const updatedDraft = useCreationAssistantStore.getState().draft;
        // 脚本必须完整保留，绝不被清空
        expect(updatedDraft.classicPrompt).toBe("【经典时序反推】0-5s 运镜推进特写");
        expect(updatedDraft.deconstructPrompt).toBe("【创意分镜拆解】镜头 1：0.0s-3.5s 核心钩子");
        expect(updatedDraft.deconstructSceneThreshold).toBe(0.18);
        expect(updatedDraft.classicSceneThreshold).toBe(0.22);
    });
});

