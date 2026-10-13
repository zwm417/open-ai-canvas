import { describe, expect, it } from "bun:test";
import { isSeedanceModel, resolveModelIcon } from "@/lib/seedance-video";

describe("Seedance Jimeng Icon Governance", () => {
    it("normalizes ByteDance icon directly to Jimeng", () => {
        expect(resolveModelIcon("ByteDance")).toBe("Jimeng");
        expect(resolveModelIcon(" ByteDance ")).toBe("Jimeng");
    });

    it("identifies all Seedance variants and resolves their icon to Jimeng", () => {
        const seedanceCases = [
            { model: "seedance-2.0", name: "Seedance 2.0" },
            { model: "seedance-2.5", name: "Seedance 2.5" },
            { model: "sd-2.5", name: "Seedance-2.5" },
            { model: "sd2.0-720p", name: "Seedance-2.0" },
            { model: "sd2.0-fast", name: "Seedance-2.0-fast" },
            { model: "lxmone-sd-mini", name: "Seedance-2.0-Mini" },
            { model: "dola-720p", name: "Seedance-2.5" },
            { model: "sd-2.5-1080p-max", name: "Seedance-2.5" },
            { model: "sd-2.5-480p-plus", name: "Seedance-2.5" },
            { model: "newtoken-60-video-ultra-720p", name: "Seedance 2.0" },
            { model: "newtoken-60-video-ultra25-720p", name: "Seedance 2.5" },
            { model: "video-ultra-720p-mini", name: "Seedance 2.0 Mini" },
            { model: "doubao-seedance-2-0-260128", name: "Seedance 2.0" },
            { model: "custom-key", name: "即梦视频生成" },
        ];

        for (const c of seedanceCases) {
            expect(isSeedanceModel(c.model, undefined, c.name)).toBe(true);
            expect(resolveModelIcon("", c.model, undefined, c.name)).toBe("Jimeng");
            expect(resolveModelIcon("ByteDance", c.model, undefined, c.name)).toBe("Jimeng");
        }
    });

    it("recognizes protocol-based Seedance models", () => {
        expect(isSeedanceModel("my-model", "seedance-videos-compatible")).toBe(true);
        expect(isSeedanceModel("my-model", "lxmone-seedance-videos")).toBe(true);
        expect(isSeedanceModel("my-model", "lxmone-sd-videos")).toBe(true);
        expect(isSeedanceModel("my-model", "lxmone-seedance-hc")).toBe(true);
        expect(resolveModelIcon("", "my-model", "seedance-videos-compatible")).toBe("Jimeng");
    });

    it("preserves non-seedance icons faithfully", () => {
        expect(resolveModelIcon("Alibaba", "wan3.0-video")).toBe("Alibaba");
        expect(resolveModelIcon("Minimax", "minimax-h3")).toBe("Minimax");
        expect(resolveModelIcon("OpenAI", "gpt-4o")).toBe("OpenAI");
        expect(resolveModelIcon("Gemini", "gemini-2.5-pro")).toBe("Gemini");
        expect(resolveModelIcon("", "wan3.0-video")).toBe("");
    });
});
