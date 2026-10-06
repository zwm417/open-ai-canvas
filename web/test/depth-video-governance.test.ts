import { describe, expect, test } from "bun:test";

// 导入注册表即触发全部工具定义注册（含 @opc-feature: depth-video 扩展工具）
import { resolveNodeToolbarPlacement, resolveToolbarTools, type ToolContext, type ToolbarHandlers } from "@/lib/canvas/tool-registry";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { depthStageStep, DEPTH_TOTAL_STEPS } from "@/extensions/opc-depth-video/stage-steps";
import { ensureDepthVideoCapabilityProbe, getDepthVideoCapability } from "@/extensions/opc-depth-video/capability-store";

function createNodeContext(node: CanvasNodeData, overrides: Partial<ToolContext> = {}): ToolContext {
    return {
        selectedCount: 0,
        selectedNodeTypes: new Set(),
        selectedVideoCount: 0,
        canvasTool: "move",
        workspaceMode: "professional",
        isProjectLinked: false,
        canUndo: false,
        canRedo: false,
        node,
        nodeMetadata: node.metadata,
        extractingVideoFrames: false,
        extractingAudio: false,
        trimmingVideo: false,
        mergingVideos: false,
        addPanelOpen: false,
        appearancePanelOpen: false,
        settingsPanelOpen: false,
        handlers: {} as ToolbarHandlers,
        ...overrides,
    };
}

describe("depth video governance", () => {
    test("深度视频工具挂载在视频节点 primary 位（原字幕位），字幕位于更多菜单", () => {
        const ctx = createNodeContext({ id: "video", type: CanvasNodeType.Video, title: "视频", position: { x: 0, y: 0 }, width: 320, height: 180, metadata: { content: "video.mp4" } });
        const tools = resolveToolbarTools("node-hover", ctx, null);
        const placements = new Map(tools.map((tool) => [tool.id, resolveNodeToolbarPlacement(tool, ctx)]));

        expect(placements.get("depthVideo")?.group).toBe("primary");
        expect(placements.get("depthVideo")?.order).toBe(20);
        expect(placements.get("subtitles")?.group).toBe("more");
    });

    test("非视频节点与简洁模式不适用；处理中/截取中禁用", () => {
        const imageCtx = createNodeContext({ id: "img", type: CanvasNodeType.Image, title: "图", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { content: "a.png" } });
        expect(resolveToolbarTools("node-hover", imageCtx, null).some((tool) => tool.id === "depthVideo")).toBe(false);

        const videoNode: CanvasNodeData = { id: "video", type: CanvasNodeType.Video, title: "视频", position: { x: 0, y: 0 }, width: 320, height: 180, metadata: { content: "video.mp4" } };
        const busyCtx = createNodeContext(videoNode, { trimmingVideo: true });
        const busyTool = resolveToolbarTools("node-hover", busyCtx, null).find((tool) => tool.id === "depthVideo")!;
        expect(busyTool.disabled?.(busyCtx)).toBe(true);

        const processingCtx = createNodeContext({ ...videoNode, metadata: { content: "video.mp4", depthSourceNodeId: "src-1", status: "loading" } });
        const processingTool = resolveToolbarTools("node-hover", processingCtx, null).find((tool) => tool.id === "depthVideo")!;
        expect(processingTool.disabled?.(processingCtx)).toBe(true);
    });

    test("桥接阶段文案映射为分步进度（非百分比）", () => {
        expect(DEPTH_TOTAL_STEPS).toBe(4);
        expect(depthStageStep("排队等待深度组件")).toBe(2);
        expect(depthStageStep("准备视频")).toBe(2);
        expect(depthStageStep("分析视频")).toBe(3);
        expect(depthStageStep("生成结果视频")).toBe(4);
        expect(depthStageStep("已完成")).toBe(4);
        expect(depthStageStep(undefined)).toBe(3);
    });

    // 注意：本用例会变更 capability 模块的全局状态，必须放在依赖"默认可用"快照的用例之后。
    test("无桌面桥接环境探测后能力降级为不可用", async () => {
        await ensureDepthVideoCapabilityProbe();
        const capability = getDepthVideoCapability();
        expect(capability.probed).toBe(true);
        expect(capability.desktop).toBe(false);
        expect(capability.supported).toBe(false);
        expect(capability.reason).toContain("桌面端");
    });
});
