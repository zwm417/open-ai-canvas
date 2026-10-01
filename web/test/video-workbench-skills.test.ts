import { describe, expect, it } from "bun:test";
import {
    BUILTIN_VIDEO_SKILLS,
    VIDEO_SKILL_CATEGORIES,
    getVideoSkillById,
    filterVideoSkills,
} from "../src/extensions/video-workbench-skills";

describe("Video Workbench Skills Catalog & Contracts", () => {
    it("should provide all 5 canonical categories matching design screenshots", () => {
        const categoryIds = VIDEO_SKILL_CATEGORIES.map((c) => c.id);
        expect(categoryIds).toContain("recommend");
        expect(categoryIds).toContain("ecommerce");
        expect(categoryIds).toContain("store");
        expect(categoryIds).toContain("brand");
        expect(categoryIds).toContain("drama");
    });

    it("should contain comprehensive preset cards (20+ skills) covering all requirements", () => {
        expect(BUILTIN_VIDEO_SKILLS.length).toBeGreaterThanOrEqual(20);

        // Core cards from screenshots and presets
        const requiredSkillIds = [
            "livestream-pitch",
            "promotional-conversion",
            "store-visit",
            "group-buying",
            "twist-skit",
            "emotional-clip",
            "scene-seeding",
            "pain-point-solve",
            "feature-demo",
            "selling-hook",
            "object-pov",
            "store-discovery",
            "signature-experience",
            "weekend-discovery",
            "street-interview",
            "brand-advocacy",
            "brand-story",
            "lifestyle-brand",
            "creative-concept",
            "dialogue-skit",
            "suspense-skit",
            "product-placement",
            "story-conflict",
        ];

        for (const id of requiredSkillIds) {
            const skill = getVideoSkillById(id);
            expect(skill).toBeDefined();
            expect(skill?.name.length).toBeGreaterThan(0);
            expect(skill?.description.length).toBeGreaterThan(0);
            expect(skill?.categoryId.length).toBeGreaterThan(0);
            expect(skill?.suggestedQuickPhrases?.length).toBeGreaterThan(0);
        }
    });

    it("should filter skills by category accurately", () => {
        const recommendSkills = filterVideoSkills("recommend");
        expect(recommendSkills.length).toBeGreaterThan(0);

        const ecommerceSkills = filterVideoSkills("ecommerce");
        expect(ecommerceSkills.length).toBeGreaterThan(0);
        expect(ecommerceSkills.every((s) => s.categoryId === "ecommerce" || s.secondaryCategoryIds?.includes("ecommerce"))).toBe(true);

        const dramaSkills = filterVideoSkills("drama");
        expect(dramaSkills.length).toBeGreaterThan(0);
        expect(dramaSkills.every((s) => s.categoryId === "drama" || s.secondaryCategoryIds?.includes("drama"))).toBe(true);
    });

    it("should search skills by name, description or tags", () => {
        const resultsByTag = filterVideoSkills("all", "带货");
        expect(resultsByTag.length).toBeGreaterThan(0);

        const resultsByName = filterVideoSkills("all", "探店");
        expect(resultsByName.length).toBeGreaterThan(0);

        const resultsEmpty = filterVideoSkills("all", "non_existing_query_xyz_123");
        expect(resultsEmpty.length).toBe(0);
    });

    it("should return undefined for non-existent skill ID", () => {
        expect(getVideoSkillById("non-existent-skill-id")).toBeUndefined();
    });
});
