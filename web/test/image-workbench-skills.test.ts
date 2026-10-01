import { describe, expect, it } from "bun:test";
import { BUILTIN_SKILLS, BUILTIN_CATEGORIES } from "@/extensions/image-workbench-skills/catalog/builtin-skills";
import { assembleWorkbenchPrompt } from "@/extensions/image-workbench-skills/core/prompt-assembler";
import type { ActiveSlotFile } from "@/extensions/image-workbench-skills/types/skill-contract";
import fs from "node:fs";
import path from "node:path";

describe("生图工作台视觉技能体系与装配引擎", () => {
    it("内置技能目录与分类完整有效，全面覆盖6大专业场景插件库", () => {
        expect(BUILTIN_CATEGORIES.length).toBe(8);
        expect(BUILTIN_SKILLS.length).toBe(33);

        // 验证 6 大专业场景覆盖
        const categories = new Set(BUILTIN_SKILLS.map((s) => s.categoryId));
        expect(categories.has("portrait")).toBe(true);
        expect(categories.has("ecommerce")).toBe(true);
        expect(categories.has("spatial")).toBe(true);
        expect(categories.has("cinema")).toBe(true);
        expect(categories.has("oriental")).toBe(true);
        expect(categories.has("social")).toBe(true);
        expect(categories.has("enhance")).toBe(true);

        // 验证空间/家居/建材 6 大技能
        const spatialSkills = BUILTIN_SKILLS.filter((s) => s.categoryId === "spatial");
        expect(spatialSkills.length).toBe(6);
        expect(spatialSkills.map((s) => s.id)).toEqual(
            expect.arrayContaining([
                "bare-to-renovated",
                "day-night-lighting",
                "furniture-in-situ",
                "finish-swap",
                "tile-flooring",
                "material-macro-texture",
            ])
        );

        // 验证新加入的 6 个专业工作流卡片
        const newSkillIds = [
            "ghost-mannequin-3d",
            "before-after",
            "ingredient-infographic",
            "flat-lay-aesthetic",
            "garment-extract",
            "clothing-dewrinkle",
        ];
        for (const id of newSkillIds) {
            const found = BUILTIN_SKILLS.find((s) => s.id === id);
            expect(found).toBeDefined();
            expect(found?.instructions).toBeTruthy();
            expect(found?.avoid?.length).toBeGreaterThan(0);
        }

        // 验证每一个技能必须具备必要字段、专属槽位与明确约定的 defaultCount
        for (const skill of BUILTIN_SKILLS) {
            expect(skill.id).toBeDefined();
            expect(skill.name).toBeTruthy();
            expect(skill.uploadSlots.length).toBeGreaterThanOrEqual(1);
            expect(skill.instructions).toBeTruthy();
            expect(skill.showcaseImageUrl).toBeTruthy();
            expect(typeof skill.defaultCount).toBe("number");
            expect(skill.defaultCount).toBeGreaterThanOrEqual(1);
            if (skill.id === "detail-8pack") {
                expect(skill.defaultCount).toBe(8);
            } else {
                expect(skill.defaultCount).toBe(1);
            }
        }
    });

    it("通用模式下提示词组装兜底正常", () => {
        const result = assembleWorkbenchPrompt({
            skill: null,
            userPrompt: "自然风景，晨雾，富士山",
            slotFiles: {},
        });

        expect(result.finalPrompt).toBe("自然风景，晨雾，富士山");
        expect(result.referenceImages).toEqual([]);
        expect(result.slotMappings).toEqual([]);
    });

    it("专业技能模式下按槽位映射正确组装工业级提示词与参考图", () => {
        const tryonSkill = BUILTIN_SKILLS.find((s) => s.id === "virtual-try-on");
        expect(tryonSkill).toBeDefined();

        const slotFiles: Record<string, ActiveSlotFile> = {
            model: {
                id: "slot-file-1",
                slotId: "model",
                name: "model.png",
                dataUrl: "data:image/png;base64,mockmodel",
                previewUrl: "blob:http://localhost/mock1",
                storageKey: "storage/mock-model.png",
                width: 1024,
                height: 1024,
                bytes: 2048,
            },
            top: {
                id: "slot-file-2",
                slotId: "top",
                name: "top.png",
                dataUrl: "data:image/png;base64,mocktop",
                previewUrl: "blob:http://localhost/mock2",
                storageKey: "storage/mock-top.png",
                width: 800,
                height: 1200,
                bytes: 4096,
            },
        };

        const result = assembleWorkbenchPrompt({
            skill: tryonSkill,
            userPrompt: "换成米白色羊绒毛衣，户外街拍",
            slotFiles,
        });

        // 验证参考图与槽位映射顺序
        expect(result.referenceImages.length).toBe(2);
        expect(result.referenceImages[0].dataUrl).toBe("data:image/png;base64,mockmodel");
        expect(result.referenceImages[1].dataUrl).toBe("data:image/png;base64,mocktop");

        expect(result.slotMappings.length).toBe(2);
        expect(result.slotMappings[0].label).toBe("模特");
        expect(result.slotMappings[1].label).toBe("上身/全身装");

        // 验证包含 @图片 标注与工业级核心指令
        expect(result.finalPrompt).toContain("@图片1为【模特】");
        expect(result.finalPrompt).toContain("@图片2为【上身/全身装】");
        expect(result.finalPrompt).toContain("【工作流目标：服装上身】");
        expect(result.finalPrompt).toContain("核心工业级规范：");
        expect(result.finalPrompt).toContain("用户补充指令：");
        expect(result.finalPrompt).toContain("换成米白色羊绒毛衣，户外街拍");
        expect(result.finalPrompt).toContain("一致性约束：");
    });

    it("6 个视觉技能独立插件包符合 zhiying.plugin/v1 规范", () => {
        const pluginDirs = [
            "opc-plugin-image-ecommerce",
            "opc-plugin-image-portrait",
            "opc-plugin-image-spatial",
            "opc-plugin-image-cinema",
            "opc-plugin-image-oriental",
            "opc-plugin-image-social",
        ];

        const baseDir = path.resolve(import.meta.dir, "../../plugin-packages");

        for (const dir of pluginDirs) {
            const manifestPath = path.join(baseDir, dir, "manifest.json");
            expect(fs.existsSync(manifestPath)).toBe(true);

            const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
            expect(manifest.apiVersion === "zhiying.plugin/v1" || manifest.apiVersion === "yingce.plugin/v1").toBe(true);
            expect(manifest.id).toBe(dir);
            expect(manifest.contributes).toBeDefined();
            expect(Array.isArray(manifest.permissions)).toBe(true);
        }
    });

    it("全量 33 个工作流卡片的静态图片资源均物理存在于 public/images/skills", () => {
        const publicDir = path.resolve(import.meta.dir, "../public");
        for (const skill of BUILTIN_SKILLS) {
            if (skill.avatarUrl) {
                const avatarPath = path.join(publicDir, skill.avatarUrl.replace(/^\//, ""));
                expect(fs.existsSync(avatarPath)).toBe(true);
            }
            if (skill.showcaseImageUrl) {
                const showcasePath = path.join(publicDir, skill.showcaseImageUrl.replace(/^\//, ""));
                expect(fs.existsSync(showcasePath)).toBe(true);
            }
        }
    });

    it("buildImageReferencePromptText 对已组装工作流提示词透明透传，杜绝重复【】中括号前缀", () => {
        const { buildImageReferencePromptText } = require("@/lib/image-reference-prompt");
        const mockRefs = [
            { id: "1", name: "m.png", dataUrl: "mock1" },
            { id: "2", name: "t.png", dataUrl: "mock2" },
        ];

        // 场景1：普通用户提示词 -> 自动添加 [图片1、图片2]
        const normalPrompt = "两个模特站立合影";
        expect(buildImageReferencePromptText(normalPrompt, mockRefs as any)).toBe("[图片1、图片2] 两个模特站立合影");

        // 场景2：已组装的技能工作流提示词 -> 透明透传，不添加额外 [图片1、图片2]
        const skillPrompt = "【工作流目标：服装上身】\n【参考素材映射】\n- @图片1为【模特】\n用户指令：自然站立";
        expect(buildImageReferencePromptText(skillPrompt, mockRefs as any)).toBe(skillPrompt);
    });

    it("切换卡片槽位减少时自动合并折叠素材且零丢失验证", () => {
        // 模拟卡片 A（3 个槽位）
        const skillA = {
            id: "skill-3-slots",
            uploadSlots: [
                { id: "slot-1", label: "模特" },
                { id: "slot-2", label: "背景" },
                { id: "slot-3", label: "产品" },
            ],
        };

        // 模拟卡片 A 已上传 3 张素材
        const existingFiles = [
            { id: "f-1", name: "model.png", dataUrl: "data:image/png;base64,1" },
            { id: "f-2", name: "bg.png", dataUrl: "data:image/png;base64,2" },
            { id: "f-3", name: "product.png", dataUrl: "data:image/png;base64,3" },
        ];

        // 场景 1：切换到只有 1 个槽位的卡片 B（如单槽位技能）
        const skillB = {
            id: "skill-1-slot",
            uploadSlots: [{ id: "single-slot", label: "主体图" }],
        };

        // 模拟合并分配逻辑：
        // 1 个槽位时，所有 3 张图片全部合并进该槽位，形成折叠态
        const targetSlotsB = skillB.uploadSlots;
        const mergedContainersB: Record<string, { files: any[]; activeId?: string }> = {};
        if (targetSlotsB.length === 1) {
            mergedContainersB[targetSlotsB[0].id] = {
                files: existingFiles.map((f) => ({ ...f, slotId: targetSlotsB[0].id })),
                activeId: existingFiles[0].id,
            };
        }

        expect(mergedContainersB["single-slot"].files.length).toBe(3);
        expect(mergedContainersB["single-slot"].files[0].id).toBe("f-1");
        expect(mergedContainersB["single-slot"].files[1].id).toBe("f-2");
        expect(mergedContainersB["single-slot"].files[2].id).toBe("f-3");
        expect(mergedContainersB["single-slot"].activeId).toBe("f-1");

        // 场景 2：切换到有 2 个槽位的卡片 C
        const skillC = {
            id: "skill-2-slots",
            uploadSlots: [
                { id: "slot-c1", label: "主图" },
                { id: "slot-c2", label: "辅助图" },
            ],
        };
        const targetSlotsC = skillC.uploadSlots;
        const mergedContainersC: Record<string, { files: any[]; activeId?: string }> = {};
        for (let i = 0; i < targetSlotsC.length; i++) {
            const slotId = targetSlotsC[i].id;
            if (i < targetSlotsC.length - 1) {
                mergedContainersC[slotId] = {
                    files: [{ ...existingFiles[i], slotId }],
                    activeId: existingFiles[i].id,
                };
            } else {
                mergedContainersC[slotId] = {
                    files: existingFiles.slice(i).map((f) => ({ ...f, slotId })),
                    activeId: existingFiles[i].id,
                };
            }
        }

        // 槽位 1 容纳 1 张，槽位 2 自动合并多出的 2 张素材（折叠态）
        expect(mergedContainersC["slot-c1"].files.length).toBe(1);
        expect(mergedContainersC["slot-c2"].files.length).toBe(2);
        expect(mergedContainersC["slot-c2"].files.map((f) => f.id)).toEqual(["f-2", "f-3"]);

        // 场景 3：折叠槽位内切换主图
        const slotC2 = mergedContainersC["slot-c2"];
        // 将 f-3 设为主图
        const target = slotC2.files.find((f) => f.id === "f-3");
        const others = slotC2.files.filter((f) => f.id !== "f-3");
        slotC2.files = [target, ...others];
        slotC2.activeId = "f-3";

        expect(slotC2.files[0].id).toBe("f-3");
        expect(slotC2.activeId).toBe("f-3");
    });

    it("assembleWorkbenchPrompt 在存在折叠多素材槽位时完整装配全部参考图", () => {
        const skill = BUILTIN_SKILLS.find((s) => s.id === "virtual-try-on")!;
        const slotFiles = {
            model: {
                id: "f-model",
                slotId: "model",
                name: "model.png",
                dataUrl: "data:image/png;base64,mockmodel",
                previewUrl: "data:image/png;base64,mockmodel",
            },
            top: {
                id: "f-top-1",
                slotId: "top",
                name: "top1.png",
                dataUrl: "data:image/png;base64,mocktop1",
                previewUrl: "data:image/png;base64,mocktop1",
            },
        };

        const slotFilesMap = {
            model: [slotFiles["model"]],
            top: [
                slotFiles["top"],
                {
                    id: "f-top-2",
                    slotId: "top",
                    name: "top2_extra.png",
                    dataUrl: "data:image/png;base64,mocktop2",
                    previewUrl: "data:image/png;base64,mocktop2",
                },
            ],
        };

        const result = assembleWorkbenchPrompt({
            skill,
            userPrompt: "自然户外街拍",
            slotFiles: slotFiles as any,
            slotFilesMap: slotFilesMap as any,
        });

        // 验证主图映射建立正常
        expect(result.slotMappings.length).toBe(2);
        // 验证全部 3 张素材（包含折叠额外素材）均完整进入 referenceImages
        expect(result.referenceImages.length).toBe(3);
        expect(result.referenceImages.map((r) => r.id)).toContain("f-model");
        expect(result.referenceImages.map((r) => r.id)).toContain("f-top-1");
        expect(result.referenceImages.map((r) => r.id)).toContain("f-top-2");
    });
});

