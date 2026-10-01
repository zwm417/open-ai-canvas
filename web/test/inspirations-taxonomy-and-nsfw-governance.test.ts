// @opc-feature: creative_inspirations [start]
import { describe, it, expect } from "bun:test";
import fs from "fs";
import path from "path";
import { IMAGE_CATEGORIES, VIDEO_CATEGORIES } from "../src/pages/prompts/prompt-data";

describe("创作灵感分类、标签池治理与NSFW清除回归测试", () => {
    const webDir = path.resolve(__dirname, "..");
    const imgJsonPath = path.join(webDir, "public/data/image-presets.json");
    const vidJsonPath = path.join(webDir, "public/data/video-presets.json");

    const imagePresets = JSON.parse(fs.readFileSync(imgJsonPath, "utf8"));
    const videoPresets = JSON.parse(fs.readFileSync(vidJsonPath, "utf8"));

    it("生图分类体系与数据 100% 双向契合，且无空分类 (0项挂空)", () => {
        expect(imagePresets.length).toBeGreaterThanOrEqual(1950);
        
        const definedCats = new Set<string>(IMAGE_CATEGORIES);
        expect(definedCats.has("3D立体字效与字体排印")).toBe(true);
        expect(definedCats.has("鞋靴箱包与奢品配饰")).toBe(true);
        expect(definedCats.has("界面UI与信息图表")).toBe(true);
        expect(definedCats.has("二次元动漫与游戏原画")).toBe(true);
        expect(definedCats.has("商业广告与TVC故事板")).toBe(true);

        const categoryCounts: Record<string, number> = {};
        IMAGE_CATEGORIES.forEach(c => { categoryCounts[c] = 0; });

        for (const preset of imagePresets) {
            expect(definedCats.has(preset.category)).toBe(true);
            categoryCounts[preset.category]++;
        }

        // 验证除'全部'外，每个分类均有真实预设资产，绝无死类
        for (const cat of IMAGE_CATEGORIES) {
            if (cat === "全部") continue;
            expect(categoryCounts[cat]).toBeGreaterThan(0);
        }
    });

    it("标题质量与视觉前置治理：同名占位标题清零，且前排卡片全部具备真实出图", () => {
        const genericTitles = ["3D立体商业字效预设", "UI与界面", "其他", "提示词prompt"];
        const genericCount = imagePresets.filter((p: any) => genericTitles.includes(p.title)).length;
        expect(genericCount).toBe(0);

        // 前 50 张卡片必须 100% 具备真实配图，绝无无图灰卡霸占前排
        const top50 = imagePresets.slice(0, 50);
        for (const card of top50) {
            expect(card.hasImage).toBe(true);
            expect(card.previewImage).toBeTruthy();
        }
    });

    it("生视频分类体系完备，包含商业广告与TVC故事板", () => {
        const vidCats = new Set<string>(VIDEO_CATEGORIES);
        expect(vidCats.has("商业广告与TVC故事板")).toBe(true);
        expect(vidCats.has("电影级运镜与基础机位")).toBe(true);
        expect(vidCats.has("剧情叙事与短剧分镜")).toBe(true);

        for (const v of videoPresets) {
            expect(vidCats.has(v.category)).toBe(true);
        }

        const sbVideos = videoPresets.filter((v: any) => v.category === "商业广告与TVC故事板");
        expect(sbVideos.length).toBeGreaterThanOrEqual(10);
    });

    it("核心高价值资产资产保全：25条Nomi微表情与10条广告故事板完整保留", () => {
        const nomiItems = imagePresets.filter((p: any) => p.id.startsWith("builtin-expr-"));
        expect(nomiItems.length).toBe(25);

        const sbImageCases = imagePresets.filter((p: any) => p.id.startsWith("sb-case-"));
        expect(sbImageCases.length).toBe(10);
    });

    it("NSFW 零容忍：全量预设库中彻底清除所有暴露、色情与擦边资产", () => {
        const nsfwKeywords = [
            /nsfw/i, /r-?18/i, /18禁/, /色情/, /情色/, /涩琴/, /私处/, /下体/,
            /下半乳/, /露点/, /自慰/, /性爱/, /做爱/, /打屁股管教/,
            /仅穿着内衣/, /系带内裤/, /丁字裤/, /情趣内衣/, /透明比基尼/, /隐秘小便/,
            /没有可见衣物/, /私密情事/, /触摸身体不同部位/, /ahegao/i, /fuck me/i,
            /bimbofication/i, /避孕套/
        ];

        const allPresets = [...imagePresets, ...videoPresets];
        const violations: string[] = [];

        for (const p of allPresets) {
            const text = `${p.id} ${p.title} ${(p.tags || []).join(" ")} ${p.description || ""} ${p.positivePrompt || ""}`;
            for (const pat of nsfwKeywords) {
                if (pat.test(text)) {
                    if (text.includes("避免色情") || text.includes("不要低俗色情") || text.includes("no lewd") || text.includes("不要过度情色化")) {
                        continue;
                    }
                    violations.push(`[${p.id}] ${p.title} matched ${pat.source}`);
                    break;
                }
            }
        }

        expect(violations).toEqual([]);
    });

    it("标签池深度净化：机械切词断句垃圾碎片 100% 根除", () => {
        const garbageFragments = [
            "输入提示词", "将图", "风格去与图", "黑曜石镜面反", "度角黄金立体",
            "苹果风格海报", "生成自媒体爆", "海报产品私有", "制作出一整套"
        ];

        for (const p of imagePresets) {
            const tags: string[] = p.tags || [];
            expect(tags.length).toBeGreaterThanOrEqual(1);
            expect(tags.length).toBeLessThanOrEqual(8);
            for (const g of garbageFragments) {
                expect(tags).not.toContain(g);
            }
        }
    });
});
// @opc-feature: creative_inspirations [end]
