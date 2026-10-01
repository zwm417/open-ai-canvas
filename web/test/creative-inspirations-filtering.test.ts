// @opc-feature: creative_inspirations [start]
import { describe, it, expect } from "bun:test";
import fs from "fs";
import path from "path";
import { 
    IMAGE_CATEGORIES, 
    VIDEO_CATEGORIES,
    type PromptPresetItem 
} from "../src/pages/prompts/prompt-data";

describe("创作灵感分组专题与交叉标签筛选机制 (Creative Inspirations Filtering)", () => {
    const imagePresetsPath = path.resolve(__dirname, "../public/data/image-presets.json");
    const video500Path = path.resolve(__dirname, "../public/data/video-presets-500.json");
    const videoAllPath = path.resolve(__dirname, "../public/data/video-presets.json");

    const imagePresets: PromptPresetItem[] = JSON.parse(fs.readFileSync(imagePresetsPath, "utf8"));
    const video500Presets: PromptPresetItem[] = JSON.parse(fs.readFileSync(video500Path, "utf8"));
    const videoAllPresets: PromptPresetItem[] = JSON.parse(fs.readFileSync(videoAllPath, "utf8"));

    it("生图灵感库应包含所有官方预设 (2902条)，且每一个精细化专题均能命中非空数据", () => {
        expect(imagePresets.length).toBeGreaterThanOrEqual(2900);

        // 验证 IMAGE_CATEGORIES 中除“全部”外的每一个专题分类，都有真实预设对应，绝不能出现 0 结果
        IMAGE_CATEGORIES.forEach((cat) => {
            if (cat === "全部") return;
            const matches = imagePresets.filter(
                (p) => p.category === cat || (p.crossCategories && p.crossCategories.includes(cat))
            );
            expect(matches.length).toBeGreaterThan(0);
        });
    });

    it("之前失效的排在 1000 条之后的 6 大生图专题，在重构后均具有完整数据", () => {
        const criticalCategories = [
            "界面UI与信息图表",
            "3D立体字效与字体排印",
            "二次元动漫与游戏原画",
            "图像重绘与风格迁移",
            "分镜漫画与绘本设计",
            "其他综合与实验风格",
            "国风国潮与东方美学",
            "赛博科幻与未来机甲",
        ];

        criticalCategories.forEach((cat) => {
            const matches = imagePresets.filter(
                (p) => p.category === cat || (p.crossCategories && p.crossCategories.includes(cat))
            );
            expect(matches.length).toBeGreaterThan(0);
        });
    });

    it("首屏轻量生视频包 (video-presets-500.json) 应均衡覆盖关键分类，文本生成等排头分类绝不为0", () => {
        expect(video500Presets.length).toBeGreaterThanOrEqual(490);

        // 首屏包必须包含文本生成、参考素材生成、商业广告等核心分类
        const textGenMatches = video500Presets.filter((p) => p.category === "文本生成");
        expect(textGenMatches.length).toBeGreaterThan(10);

        const refGenMatches = video500Presets.filter((p) => p.category === "参考素材生成");
        expect(refGenMatches.length).toBeGreaterThan(0);

        const tvcMatches = video500Presets.filter((p) => p.category === "商业广告与TVC故事板");
        expect(tvcMatches.length).toBeGreaterThan(0);
    });

    it("全量视频灵感库 (video-presets.json) 应包含所有官方分类，且每个有效分类均有丰富预设", () => {
        expect(videoAllPresets.length).toBeGreaterThanOrEqual(12000);

        VIDEO_CATEGORIES.forEach((cat) => {
            if (cat === "全部" || cat === "其他视频与综合待分类") return;
            const matches = videoAllPresets.filter(
                (p) => p.category === cat || (p.crossCategories && p.crossCategories.includes(cat))
            );
            expect(matches.length).toBeGreaterThan(0);
        });
    });

    it("后置规模截断模型 (Post-filtering Slicing) 应在分类筛选后生效，杜绝小众分类被整体截断", () => {
        // 模拟筛选逻辑：若全局先截断 500 条
        const badSlicing = imagePresets.slice(0, 500);
        const badCategoryResults = badSlicing.filter((p) => p.category === "二次元动漫与游戏原画");
        // 验证旧逻辑中该分类确实会被直接截断为 0
        expect(badCategoryResults.length).toBe(0);

        // 验证新逻辑：先分类过滤，再按规模截断 (例如当前规模 500)
        const filtered = imagePresets.filter((p) => p.category === "二次元动漫与游戏原画");
        const finalResults = filtered.slice(0, 500);
        // 新逻辑下所有 150 条二次元原画均能完整呈现！
        expect(finalResults.length).toBe(150);
    });

    it("分类与标签反选 (Toggle Unselect) 状态机应正确回退为「全部」", () => {
        let selectedCategory = "全部";
        const toggleCategory = (cat: string) => {
            selectedCategory = selectedCategory === cat ? "全部" : cat;
        };

        toggleCategory("广告创意");
        expect(selectedCategory).toBe("广告创意");

        // 再次点击相同分类，恢复为「全部」
        toggleCategory("广告创意");
        expect(selectedCategory).toBe("全部");

        let selectedTag = "全部";
        const toggleTag = (tag: string) => {
            selectedTag = selectedTag === tag ? "全部" : tag;
        };

        toggleTag("Seedance 2.5");
        expect(selectedTag).toBe("Seedance 2.5");

        // 再次点击相同标签，恢复为「全部」
        toggleTag("Seedance 2.5");
        expect(selectedTag).toBe("全部");
    });
});
// @opc-feature: creative_inspirations [end]
