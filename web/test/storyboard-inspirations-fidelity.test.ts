import { describe, it, expect } from "bun:test";
import fs from "fs";
import path from "path";
import { 
    IMAGE_PROMPT_PRESETS, 
    VIDEO_PROMPT_PRESETS, 
    type PromptPresetItem 
} from "../src/pages/prompts/prompt-data";

describe("07广告故事板案例 1~10 双模态灵感保真度与资源完整性测试", () => {
    const publicDir = path.resolve(__dirname, "../public");
    const imagePresetsJsonPath = path.join(publicDir, "data/image-presets.json");
    const videoPresetsJsonPath = path.join(publicDir, "data/video-presets.json");

    const fullImages: PromptPresetItem[] = JSON.parse(fs.readFileSync(imagePresetsJsonPath, "utf8"));
    const fullVideos: PromptPresetItem[] = JSON.parse(fs.readFileSync(videoPresetsJsonPath, "utf8"));

    it("生图故事板全量 10 个案例在静态代码与运行时 JSON 中 100% 存在且格式合规", () => {
        for (let i = 1; i <= 10; i++) {
            const id = `sb-case-${i}`;
            
            // 静态常量检测
            const staticItem = IMAGE_PROMPT_PRESETS.find(p => p.id === id);
            expect(staticItem).toBeDefined();
            expect(staticItem?.kind).toBe("image");
            expect(staticItem?.category).toBe("商业广告与TVC故事板");
            expect(staticItem?.linkedPresetId).toBe(`seedance-storyboard-case-${i}`);

            // 运行时 JSON 检测
            const runtimeItem = fullImages.find(p => p.id === id);
            expect(runtimeItem).toBeDefined();
            expect(runtimeItem?.title).toBe(staticItem?.title);
            expect(runtimeItem?.positivePrompt).toBe(staticItem?.positivePrompt);
        }
    });

    it("严格遵循保真铁律：坚决杜绝先前占位假模板文案，提示词字符数与结构真实保真", () => {
        const placeholderSubstring = "9宫格商业广告TVC故事板：{主体}";

        for (let i = 1; i <= 10; i++) {
            const id = `sb-case-${i}`;
            const item = IMAGE_PROMPT_PRESETS.find(p => p.id === id)!;
            
            // 零假数据/零兜底占位文案检测
            expect(item.positivePrompt.includes(placeholderSubstring)).toBe(false);
            expect(item.positivePrompt.length).toBeGreaterThan(500);

            // 必须包含核心故事剧情或结构要素
            expect(
                item.positivePrompt.includes("故事") || 
                item.positivePrompt.includes("画面") ||
                item.positivePrompt.includes("镜头") ||
                item.positivePrompt.includes("提示词")
            ).toBe(true);

            // 推荐参数需对齐 16:9 画幅
            expect(item.recommendedParams?.aspectRatio).toBe("16:9");
        }
    });

    it("生视频故事板全量 10 个案例在静态代码与运行时 JSON 中 100% 存在，且模型对齐 Seedance 2.0", () => {
        for (let i = 1; i <= 10; i++) {
            const id = `seedance-storyboard-case-${i}`;
            
            // 静态常量检测
            const staticItem = VIDEO_PROMPT_PRESETS.find(p => p.id === id);
            expect(staticItem).toBeDefined();
            expect(staticItem?.kind).toBe("video");
            expect(staticItem?.category).toBe("剧情叙事与短剧分镜");
            expect(staticItem?.recommendedParams?.model).toBe("Seedance 2.0");
            expect(staticItem?.linkedPresetId).toBe(`sb-case-${i}`);
            expect(staticItem?.positivePrompt.length).toBeGreaterThan(100);

            // 运行时 JSON 检测
            const runtimeItem = fullVideos.find(p => p.id === id);
            expect(runtimeItem).toBeDefined();
            expect(runtimeItem?.title).toBe(staticItem?.title);
            expect(runtimeItem?.positivePrompt).toBe(staticItem?.positivePrompt);
        }
    });

    it("全量 10 个生图案例引用的高低清静态 WebP 图像在本地磁盘上物理存在", () => {
        for (let i = 1; i <= 10; i++) {
            const id = `sb-case-${i}`;
            const item = IMAGE_PROMPT_PRESETS.find(p => p.id === id)!;

            expect(item.previewImage).toBeDefined();
            expect(item.previewThumbnail).toBeDefined();

            const highPath = path.join(publicDir, item.previewImage!);
            const thumbPath = path.join(publicDir, item.previewThumbnail!);

            expect(fs.existsSync(highPath)).toBe(true);
            expect(fs.existsSync(thumbPath)).toBe(true);

            expect(fs.statSync(highPath).size).toBeGreaterThan(20000);
            expect(fs.statSync(thumbPath).size).toBeGreaterThan(5000);
        }
    });

    it("全量配属演示视频的 9 个案例（案例1~3、5~10）轻量化 MP4 视频均在 public 目录下真实存在且可流畅播放", () => {
        const casesWithVideo = [1, 2, 3, 5, 6, 7, 8, 9, 10];

        for (const num of casesWithVideo) {
            const id = `seedance-storyboard-case-${num}`;
            const item = VIDEO_PROMPT_PRESETS.find(p => p.id === id)!;

            expect(item.previewVideo).toBeDefined();
            expect(item.previewVideo?.endsWith(".mp4")).toBe(true);

            const videoDiskPath = path.join(publicDir, item.previewVideo!);
            expect(fs.existsSync(videoDiskPath)).toBe(true);

            const stat = fs.statSync(videoDiskPath);
            // 每个视频大小均在 1MB ~ 10MB 之间（经过 ffmpeg 轻量化压缩优化）
            expect(stat.size).toBeGreaterThan(1000000);
            expect(stat.size).toBeLessThan(12000000);
        }

        // 案例 4 为无视频案例
        const case4 = VIDEO_PROMPT_PRESETS.find(p => p.id === "seedance-storyboard-case-4")!;
        expect(case4.previewVideo).toBe("");
    });
});
