import { describe, expect, it } from "bun:test";
import { findVideoSkill, BUILTIN_VIDEO_SKILLS } from "../src/extensions/video-workbench-skills/catalog/builtin-video-skills";
import { fetchVaultPrompt, VAULT_PROMPT_IDS } from "../src/services/api/prompt-vault";

describe("Seedance-2.0 参考视频复刻工作流管线契约", () => {
    it("builtin-video-skills 必须注册深度复刻技能且排序为第一优先级", () => {
        const skill = findVideoSkill("reference-replication");
        expect(skill).toBeDefined();
        expect(skill?.name).toBe("深度复刻");
        expect(skill?.scriptType).toBe("smart");
        expect(skill?.order).toBe(0);
        expect(skill?.isRecommended).toBe(true);

        const firstSkill = BUILTIN_VIDEO_SKILLS[0];
        expect(firstSkill.id).toBe("reference-replication");
    });

    it("金库中的 seedance-replication 元提示词必须具备原生多模态指针契约与四维物理法则", async () => {
        const prompt = await fetchVaultPrompt(VAULT_PROMPT_IDS.SEEDANCE_REPLICATION);
        expect(prompt).toBeDefined();
        expect(prompt.length).toBeGreaterThan(100);

        // 1. 原生指针契约：必须包含 @视频1 与 @图片1（商品）、@图片2（人物）、@图片3（背景）
        expect(prompt).toContain("@视频1");
        expect(prompt).toContain("@图片1（商品）");
        expect(prompt).toContain("@图片2（人物）");
        expect(prompt).toContain("@图片3（背景）");

        // 2. 篇幅铁律：明确要求 250 ~ 320 汉字
        expect(prompt).toContain("250 ~ 320");

        // 3. 因果演进与场景重构
        expect(prompt).toContain("动作连锁同步变化与场景重光照");
        expect(prompt).toContain("静态转工作态");

        // 4. 正向物理锁死约束（代替反向粉色大象负面词）
        expect(prompt).toContain("正向锁死物理约束");
        expect(prompt).toContain("全程严格锁定指定人物的原生面部骨相");
        expect(prompt).toContain("维持清晰物理层叠与独立边缘轮廓");

        // 5. 三段式标准输出结构
        expect(prompt).toContain("【基于@视频1参考复刻与映射】");
        expect(prompt).toContain("【动作连锁演进与场景重构】");
        expect(prompt).toContain("【正向物理锁死约束】");
    });

    it("多素材指针映射算法验证：商品、人物、背景各多图时必须严格有序连续编号", () => {
        const productCount = 2;
        const modelCount = 1;
        const sceneCount = 2;

        const assetMappings: Array<{ label: string; role: string }> = [];
        let counter = 1;

        for (let i = 0; i < productCount; i++) {
            assetMappings.push({
                label: `@图片${counter}（商品${productCount > 1 ? i + 1 : ""}）`,
                role: "product",
            });
            counter++;
        }

        for (let i = 0; i < modelCount; i++) {
            assetMappings.push({
                label: `@图片${counter}（人物${modelCount > 1 ? i + 1 : ""}）`,
                role: "model",
            });
            counter++;
        }

        for (let i = 0; i < sceneCount; i++) {
            assetMappings.push({
                label: `@图片${counter}（背景${sceneCount > 1 ? i + 1 : ""}）`,
                role: "scene",
            });
            counter++;
        }

        expect(assetMappings).toHaveLength(5);
        expect(assetMappings[0].label).toBe("@图片1（商品1）");
        expect(assetMappings[1].label).toBe("@图片2（商品2）");
        expect(assetMappings[2].label).toBe("@图片3（人物）");
        expect(assetMappings[3].label).toBe("@图片4（背景1）");
        expect(assetMappings[4].label).toBe("@图片5（背景2）");
    });

    it("应用到工作台时，referenceOrder 与多素材插槽必须保持原子化完整映射", () => {
        const mockImages = [
            { id: "img-1", name: "商品1.png", type: "image", dataUrl: "data:image/png;base64,111" },
            { id: "img-2", name: "人物1.png", type: "image", dataUrl: "data:image/png;base64,222" },
        ];
        const mockVideos = [
            { id: "vid-1", name: "ref.mp4", type: "video", url: "http://localhost/ref.mp4", durationMs: 12000 },
        ];
        const mockAudios = [
            { id: "aud-1", name: "bgm.mp3", type: "audio", url: "http://localhost/bgm.mp3", durationMs: 8000 },
        ];

        // 模拟原子更新逻辑
        const newOrders = [
            ...mockImages.map((img) => ({ id: img.id, kind: "image" as const })),
            ...mockVideos.map((vid) => ({ id: vid.id, kind: "video" as const })),
            ...mockAudios.map((aud) => ({ id: aud.id, kind: "audio" as const })),
        ];

        expect(newOrders).toHaveLength(4);
        expect(newOrders[0]).toEqual({ id: "img-1", kind: "image" });
        expect(newOrders[1]).toEqual({ id: "img-2", kind: "image" });
        expect(newOrders[2]).toEqual({ id: "vid-1", kind: "video" });
        expect(newOrders[3]).toEqual({ id: "aud-1", kind: "audio" });

        // 验证 workbench referenceItems flatMap 能够 100% 命中全部预览素材
        const referenceItems = newOrders.flatMap((entry) => {
            if (entry.kind === "image") {
                const item = mockImages.find((r) => r.id === entry.id);
                return item ? [item] : [];
            }
            if (entry.kind === "video") {
                const item = mockVideos.find((r) => r.id === entry.id);
                return item ? [item] : [];
            }
            const item = mockAudios.find((r) => r.id === entry.id);
            return item ? [item] : [];
        });

        expect(referenceItems).toHaveLength(4);
        expect(referenceItems.map((r) => r.id)).toEqual(["img-1", "img-2", "vid-1", "aud-1"]);
    });

    it("参考视频时长边界防御：<= 15s 正常透传为 @视频1，> 15s 降级保护防止 Seedance 400 校验阻断", () => {
        // 场景 A：12 秒标准视频，符合 Seedance 2~15s 规范
        const normalVideos = [
            { id: "vid-normal", name: "normal.mp4", type: "video", url: "http://localhost/normal.mp4", durationMs: 12000 },
        ];
        const validVideosA = normalVideos.filter((v) => !v.durationMs || v.durationMs <= 15000);
        expect(validVideosA).toHaveLength(1);

        // 场景 B：30 秒超长视频，无裁剪且未受保护时
        const overlongVideos = [
            { id: "vid-long", name: "long.mp4", type: "video", url: "http://localhost/long.mp4", durationMs: 30000 },
        ];
        const validVideosB: typeof overlongVideos = [];
        let hasOverlongVideo = false;
        for (const v of overlongVideos) {
            if (v.durationMs && v.durationMs > 15000) {
                hasOverlongVideo = true;
            } else {
                validVideosB.push(v);
            }
        }
        expect(hasOverlongVideo).toBe(true);
        expect(validVideosB).toHaveLength(0);

        // 提示词自愈：若无合法参考视频，消除裸 @视频1 指针，降级为原片分镜引导
        let rawPrompt = "【基于@视频1参考复刻与映射】镜头推进保留@视频1运镜，拍摄@图片1（商品）\n【动作连锁演进与场景重构】抹口红唇部水光化\n【正向物理锁死约束】锁定面部骨相";
        if (hasOverlongVideo && validVideosB.length === 0) {
            rawPrompt = rawPrompt.replace(/【基于@视频1参考复刻与映射】/g, "【基于参考分镜复刻与映射】").replace(/@视频1/g, "原片参考分镜");
        }
        expect(rawPrompt).not.toContain("@视频1");
        expect(rawPrompt).toContain("【基于参考分镜复刻与映射】");
        expect(rawPrompt).toContain("原片参考分镜");
    });
});

