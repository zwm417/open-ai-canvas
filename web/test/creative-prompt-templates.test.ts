// @opc-feature: creative-prompt-templates [start]
import { describe, expect, test } from "bun:test";
import {
    BUILTIN_CREATIVE_PROMPT_TEMPLATES,
    fetchCreativePromptTemplates,
    saveCreativePromptTemplate,
    deleteCreativePromptTemplate,
} from "@/services/api/creative-prompt-templates";

describe("Creative Prompt Templates Service & Seeds", () => {
    test("内置模板库包含完整的 19 套硬编码离线模板", () => {
        expect(BUILTIN_CREATIVE_PROMPT_TEMPLATES.length).toBe(19);

        const imageTemplates = BUILTIN_CREATIVE_PROMPT_TEMPLATES.filter((t) => t.kind === "image");
        const videoTemplates = BUILTIN_CREATIVE_PROMPT_TEMPLATES.filter((t) => t.kind === "video");
        const dramaTemplates = BUILTIN_CREATIVE_PROMPT_TEMPLATES.filter((t) => t.kind === "drama");

        // 6 项改图/生图提示词来自 video-work
        expect(imageTemplates.length).toBe(6);
        // 7 项生视频提示词来自 video-work
        expect(videoTemplates.length).toBe(7);
        // 6 项短剧提示词来自已有 media-lab 系统预设
        expect(dramaTemplates.length).toBe(6);
    });

    test("生图提示词完整对齐 video-work 6 项改图提示词", () => {
        const imageTemplates = BUILTIN_CREATIVE_PROMPT_TEMPLATES.filter((t) => t.kind === "image");
        const titles = imageTemplates.map((t) => t.name);
        expect(titles).toContain("产品一致性故事板");
        expect(titles).toContain("生成模特提示词");
        expect(titles).toContain("生模特+换服装");
        expect(titles).toContain("生图换产品");
        expect(titles).toContain("分镜拼图替换");
        expect(titles).toContain("生成真人四宫格");
    });

    test("生视频提示词完整对齐 video-work 7 项生视频提示词", () => {
        const videoTemplates = BUILTIN_CREATIVE_PROMPT_TEMPLATES.filter((t) => t.kind === "video");
        const titles = videoTemplates.map((t) => t.name);
        expect(titles).toContain("生视频换头换音色");
        expect(titles).toContain("生视频换头不换音色");
        expect(titles).toContain("生视频换模特+服饰");
        expect(titles).toContain("生视频+替换产品");
        expect(titles).toContain("反推生视频提示词");
        expect(titles).toContain("反推视频提示词");
        expect(titles).toContain("生视频提示词（一致性复刻）");
    });

    test("短剧提示词完整对齐 media-lab 6 项短剧预设", () => {
        const dramaTemplates = BUILTIN_CREATIVE_PROMPT_TEMPLATES.filter((t) => t.kind === "drama");
        const titles = dramaTemplates.map((t) => t.name);
        expect(titles).toContain("角色设定图");
        expect(titles).toContain("多机位视角");
        expect(titles).toContain("画面推演");
        expect(titles).toContain("连续镜头");
        expect(titles).toContain("电影光影优化");
        expect(titles).toContain("视频提示词优化");
    });

    test("fetchCreativePromptTemplates 支持按 kind 隔离筛选", async () => {
        const allTemplates = await fetchCreativePromptTemplates();
        expect(allTemplates.length).toBeGreaterThanOrEqual(19);

        const imageOnly = await fetchCreativePromptTemplates("image");
        expect(imageOnly.every((t) => t.kind === "image")).toBe(true);
        expect(imageOnly.length).toBeGreaterThanOrEqual(6);

        const videoOnly = await fetchCreativePromptTemplates("video");
        expect(videoOnly.every((t) => t.kind === "video")).toBe(true);
        expect(videoOnly.length).toBeGreaterThanOrEqual(7);

        const dramaOnly = await fetchCreativePromptTemplates("drama");
        expect(dramaOnly.every((t) => t.kind === "drama")).toBe(true);
        expect(dramaOnly.length).toBeGreaterThanOrEqual(6);
    });

    test("离线保存并删除自定义提示词模板", async () => {
        const custom = await saveCreativePromptTemplate({
            kind: "video",
            name: "测试自定义视频运镜",
            content: "低角度仰拍，高速跟拍",
            tags: "测试,运镜",
        });

        expect(custom.id).toBeDefined();
        expect(custom.name).toBe("测试自定义视频运镜");
        expect(custom.kind).toBe("video");

        const listAfterSave = await fetchCreativePromptTemplates("video");
        expect(listAfterSave.some((t) => t.id === custom.id)).toBe(true);

        await deleteCreativePromptTemplate(custom.id);
        const listAfterDelete = await fetchCreativePromptTemplates("video");
        expect(listAfterDelete.some((t) => t.id === custom.id)).toBe(false);
    });
});
// @opc-feature: creative-prompt-templates [end]
