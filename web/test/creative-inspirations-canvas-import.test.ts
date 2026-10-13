import { expect, test } from "bun:test";
import { applyPromptToCanvas } from "@/pages/prompts/prompt-canvas-helper";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import type { PromptPresetItem } from "@/pages/prompts/prompt-data";
import { CanvasNodeType } from "@/types/canvas";

test("applyPromptToCanvas creates a new canvas project with image node and prompts", async () => {
    let navigatedUrl = "";
    const mockNavigate = ((to: string) => {
        navigatedUrl = to;
    }) as any;

    const preset: PromptPresetItem = {
        id: "preset-test-img-001",
        title: "赛博霓虹机甲",
        kind: "image",
        category: "广告创意",
        description: "赛博朋克科幻机甲",
        positivePrompt: "A cyberpunk mech warrior standing under neon rain, octane render 8k",
        styleTokens: ["cyberpunk", "neon"],
        tags: ["mech", "neon"],
        gradient: "from-blue-500 to-purple-500",
        accentColor: "#3b82f6",
        icon: "Bot",
        previewImage: "/images/inspirations/cache/cyber_mech.webp",
        recommendedParams: {
            aspectRatio: "16:9",
            model: "flux-schnell",
        },
    };

    const initialProjectsCount = useCanvasStore.getState().projects.length;

    await applyPromptToCanvas(preset, mockNavigate);

    const store = useCanvasStore.getState();
    expect(store.projects.length).toBe(initialProjectsCount + 1);

    const latestProject = store.projects[0];
    expect(latestProject.title).toBe("灵感 · 赛博霓虹机甲");
    expect(navigatedUrl).toBe(`/canvas/${latestProject.id}`);

    // 核验节点内容
    expect(latestProject.nodes.length).toBe(1);
    const node = latestProject.nodes[0];
    expect(node.type).toBe(CanvasNodeType.Image);
    expect(node.title).toBe("赛博霓虹机甲");
    expect(node.metadata?.prompt).toBe("A cyberpunk mech warrior standing under neon rain, octane render 8k");
    expect(node.metadata?.composerContent).toBe("A cyberpunk mech warrior standing under neon rain, octane render 8k");
    expect(node.metadata?.content).toBe("/images/inspirations/cache/cyber_mech.webp");
    expect(node.metadata?.size).toBe("16:9");
    expect(node.metadata?.model).toBe("flux-schnell");
});

test("applyPromptToCanvas creates a new canvas project for video preset with video node", async () => {
    let navigatedUrl = "";
    const mockNavigate = ((to: string) => {
        navigatedUrl = to;
    }) as any;

    const preset: PromptPresetItem = {
        id: "preset-test-vid-001",
        title: "深海巨兽游动",
        kind: "video",
        category: "商业广告与TVC故事板",
        description: "深海神秘发光巨兽",
        positivePrompt: "Deep sea giant glowing creature swimming gracefully, cinematic 4k",
        styleTokens: ["cinematic", "deepsea"],
        tags: ["ocean", "creature"],
        gradient: "from-cyan-500 to-blue-500",
        accentColor: "#06b6d4",
        icon: "Film",
        previewImage: "/images/inspirations/cache/ocean_beast.webp",
        previewVideo: "/videos/inspirations/ocean_beast.mp4",
        recommendedParams: {
            aspectRatio: "16:9",
            duration: 10,
        },
    };

    await applyPromptToCanvas(preset, mockNavigate);

    const latestProject = useCanvasStore.getState().projects[0];
    expect(latestProject.title).toBe("灵感 · 深海巨兽游动");
    expect(navigatedUrl).toBe(`/canvas/${latestProject.id}`);

    expect(latestProject.nodes.length).toBe(1);
    const node = latestProject.nodes[0];
    expect(node.type).toBe(CanvasNodeType.Video);
    expect(node.title).toBe("深海巨兽游动");
    expect(node.metadata?.prompt).toBe("Deep sea giant glowing creature swimming gracefully, cinematic 4k");
    expect(node.metadata?.content).toBe("/videos/inspirations/ocean_beast.mp4");
    expect(node.metadata?.seconds).toBe("10");
    expect(node.metadata?.generationMode).toBe("video");
});
