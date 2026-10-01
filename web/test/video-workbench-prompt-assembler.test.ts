// @opc-feature: video-workbench-prompt-assembler-test [start]
import { describe, expect, it } from "bun:test";
import { buildVideoWorkbenchPrompts } from "../src/extensions/video-workbench-skills/services/video-workbench-prompt-assembler";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio } from "@/types/media";

describe("Video Workbench Prompt Assembler & Inspiration Injection Pipeline", () => {
    it("should inject 5-dimensional commercial skill directions into system prompt", () => {
        const bundle = buildVideoWorkbenchPrompts({
            skillId: "livestream-pitch",
            skillName: "口播带货",
            durationSec: 15,
        });

        // 验证系统提示词中正确注入了卡片的 5 维方向
        expect(bundle.systemPrompt).toContain("## 本次创作模式：口播带货");
        expect(bundle.systemPrompt).toContain("核心商业问题：如何打消观众对“付费商单推销”的天然戒备");
        expect(bundle.systemPrompt).toContain("观众关系：熟人或朋友间的真诚自用分享");
        expect(bundle.systemPrompt).toContain("核心驱动：生活化的真实微表情");
        expect(bundle.systemPrompt).toContain("商业定位：出镜人物在生活/工作中真实自用");
        expect(bundle.systemPrompt).toContain("创作禁区：切忌照本宣科念产品说明书");

        // 验证不再包含原始待填充的方括号占位
        expect(bundle.systemPrompt).not.toContain("[这张卡片要替观众解决的决策问题是什么]");
    });

    it("should fall back gracefully to synthetic direction for unknown skills", () => {
        const bundle = buildVideoWorkbenchPrompts({
            skillId: "future-custom-skill",
            skillName: "赛博穿搭秀",
            durationSec: 30,
        });

        expect(bundle.systemPrompt).toContain("## 本次创作模式：赛博穿搭秀");
        expect(bundle.systemPrompt).toContain("核心商业问题");
        expect(bundle.systemPrompt).toContain("创作禁区");
    });

    it("should construct structured asset reference map for images and audios", () => {
        const mockImages: ReferenceImage[] = [
            {
                id: "img_001",
                name: "精华液正面包装.png",
                type: "image/png",
                dataUrl: "https://example.com/img1.png",
                bytes: 1024,
                width: 800,
                height: 800,
            },
            {
                id: "img_002",
                name: "女主手部特写.jpg",
                type: "image/jpeg",
                dataUrl: "https://example.com/img2.jpg",
                bytes: 2048,
                width: 1080,
                height: 1920,
            },
        ];

        const mockAudios: ReferenceAudio[] = [
            {
                id: "aud_001",
                name: "轻快BGM.mp3",
                type: "audio/mpeg",
                url: "https://example.com/bgm.mp3",
                bytes: 4096,
                durationMs: 15000,
            },
        ];

        const bundle = buildVideoWorkbenchPrompts({
            skillId: "scene-seeding",
            skillName: "场景种草",
            durationSec: 15,
            uploadedImages: mockImages,
            uploadedAudios: mockAudios,
        });

        // 校验引用表映射
        expect(bundle.assetReferenceMap).toHaveLength(3);
        expect(bundle.assetReferenceMap[0]).toEqual({
            ref: "@图片1",
            mediaType: "image",
            fileId: "img_001",
            name: "精华液正面包装.png",
        });
        expect(bundle.assetReferenceMap[1]).toEqual({
            ref: "@图片2",
            mediaType: "image",
            fileId: "img_002",
            name: "女主手部特写.jpg",
        });
        expect(bundle.assetReferenceMap[2]).toEqual({
            ref: "@音频1",
            mediaType: "audio",
            fileId: "aud_001",
            name: "轻快BGM.mp3",
        });

        // 校验 userPrompt 中包含强锚定规范
        expect(bundle.userPrompt).toContain("<asset_reference_map>");
        expect(bundle.userPrompt).toContain("@图片1");
        expect(bundle.userPrompt).toContain("@音频1");
        expect(bundle.userPrompt).toContain("本次共上传 2 张图片参考与 1 个音频特征");
    });

    it("should calculate model-aware physical segmentation plan", () => {
        // 目标 15 秒，以单段最大 5 秒的模型计算，应划分为 3 段物理分段
        const bundle = buildVideoWorkbenchPrompts({
            skillId: "store-visit",
            skillName: "到店实录",
            durationSec: 15,
            videoModel: "seedance-2.0",
            videoModelMaxDurationSec: 5,
        });

        expect(bundle.userPrompt).toContain("目标总时长：15 秒");
        expect(bundle.userPrompt).toContain("单视频段生成上限：5 秒");
        expect(bundle.userPrompt).toContain("物理分段计划（共 3 段）");
        expect(bundle.userPrompt).toContain("第 1 段：0-5 秒，首次生成");
        expect(bundle.userPrompt).toContain("第 2 段：5-10 秒，独立生成并执行第 1 段结尾状态");
        expect(bundle.userPrompt).toContain("第 3 段：10-15 秒，独立生成并执行第 2 段结尾状态");
    });

    it("should inject inspiration and 4-pillar narrative fusion guidance when provided", () => {
        const mockInspiration = "【深夜暖心食堂】主角冒雨走进老巷面馆，一碗热气腾腾的手工面让他卸下疲惫，重拾前行勇气。";

        const bundle = buildVideoWorkbenchPrompts({
            skillId: "store-visit",
            skillName: "到店实录",
            durationSec: 15,
            inspirationPrompt: mockInspiration,
            notes: "我们是一家开在市中心的咖啡店，主打自烘焙咖啡豆",
        });

        // 验证灵感专区注入
        expect(bundle.userPrompt).toContain("【引入创作灵感（视听美学与叙事参考）】");
        expect(bundle.userPrompt).toContain(mockInspiration);

        // 验证 4 大深度融合与借代原则完整呈现
        expect(bundle.userPrompt).toContain("1. 叙事与情境深度借用（全面赋能）：");
        expect(bundle.userPrompt).toContain("2. 实体与角色自然转译（借灵感之壳，载真实素材）：");
        expect(bundle.userPrompt).toContain("3. 商业驱动契合（借剧情之势，达卡片之功）：");
        expect(bundle.userPrompt).toContain("4. 用户意志绝对优先：");

        // 验证用户自定义输入
        expect(bundle.userPrompt).toContain("自烘焙咖啡豆");
    });

    it("should omit inspiration block cleanly when no inspiration is provided", () => {
        const bundle = buildVideoWorkbenchPrompts({
            skillId: "promotional-conversion",
            skillName: "促销转化",
            durationSec: 15,
        });

        expect(bundle.userPrompt).not.toContain("【引入创作灵感（视听美学与叙事参考）】");
    });

    it("should ensure no dangling mustache injection placeholder in systemPrompt or fullPrompt", () => {
        const bundle = buildVideoWorkbenchPrompts({
            skillId: "dialogue-skit",
            skillName: "对话短剧",
            durationSec: 15,
            language: "zh",
        });

        // 确保模板占位符已被完全处理，不泄漏裸露的 Mustache 标签
        expect(bundle.systemPrompt).not.toContain("{{DYNAMIC_CONTEXT_INJECTION_SLOT}}");
        expect(bundle.fullPrompt).not.toContain("{{DYNAMIC_CONTEXT_INJECTION_SLOT}}");
        expect(bundle.fullPrompt).toContain("【素材引用表】");
        expect(bundle.fullPrompt).toContain("目标总时长：15 秒");
    });

    it("should enforce bilingual isolation policy for english mode", () => {
        const bundle = buildVideoWorkbenchPrompts({
            skillId: "brand-story",
            skillName: "品牌故事",
            durationSec: 30,
            language: "en",
        });

        expect(bundle.userPrompt).toContain("目标呈现语言：英文");
        expect(bundle.userPrompt).toContain("严格执行语言隔离底线：所有技术控制字段、景别、运镜、光影色温、声音描述与分镜表格说明强制 100% 使用中文");
    });
});
// @opc-feature: video-workbench-prompt-assembler-test [end]
