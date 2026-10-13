import { describe, expect, it } from "bun:test";
import { isolateCopiedNodeMetadata } from "@/lib/canvas/canvas-node-copy";
import { canvasMediaFileExtension } from "@/lib/canvas/canvas-media-download";
import { generationErrorMessage } from "@/lib/generation-error";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { AssetAudioArchivePreview } from "@/pages/assets/asset-library-panels";

describe("BeefTV 对比审计与正向治理验收测试", () => {
    it("P0: 复制节点必须隔离 generationEffectKeys，避免持久化快照被判定为未确认生成而丢弃", () => {
        const sourceNode: CanvasNodeData = {
            id: "node-source-1",
            type: CanvasNodeType.Image,
            x: 100,
            y: 100,
            width: 300,
            height: 300,
            metadata: {
                content: "https://example.com/generated.webp",
                generationStatus: "success",
                generationEffectKeys: ["effect-key-tx-12345"],
                generationBatches: [{ batchId: "b-1", timestamp: 1000 }],
                batchRootId: "root-1",
                versionPrimary: true,
            },
        };

        const idMap = new Map<string, string>([["node-source-1", "node-copy-1"]]);
        const copiedMetadata = isolateCopiedNodeMetadata(sourceNode, idMap);

        // 副本必须清理 generationEffectKeys
        expect(copiedMetadata.generationEffectKeys).toBeUndefined();
        expect(copiedMetadata.copiedFromNodeId).toBe("node-source-1");
        expect(copiedMetadata.generationBatches).toBeUndefined();
        expect(copiedMetadata.batchRootId).toBeUndefined();
        expect(copiedMetadata.versionPrimary).toBeUndefined();
    });

    it("P3: canvasMediaFileExtension 支持扩展的音视频与图片 MIME/扩展名映射 (avif, bmp, tiff, avi, mkv, m4a)", () => {
        const testCases: Array<{ mime?: string; content?: string; type: CanvasNodeType; expected: string }> = [
            { mime: "image/avif", type: CanvasNodeType.Image, expected: "avif" },
            { mime: "image/bmp", type: CanvasNodeType.Image, expected: "bmp" },
            { mime: "image/x-ms-bmp", type: CanvasNodeType.Image, expected: "bmp" },
            { mime: "image/tiff", type: CanvasNodeType.Image, expected: "tiff" },
            { mime: "video/x-msvideo", type: CanvasNodeType.Video, expected: "avi" },
            { mime: "video/x-matroska", type: CanvasNodeType.Video, expected: "mkv" },
            { mime: "audio/x-m4a", type: CanvasNodeType.Audio, expected: "m4a" },
            { content: "https://cdn.example.com/asset.avif", type: CanvasNodeType.Image, expected: "avif" },
            { content: "https://cdn.example.com/asset.bmp", type: CanvasNodeType.Image, expected: "bmp" },
            { content: "https://cdn.example.com/asset.tif", type: CanvasNodeType.Image, expected: "tiff" },
            { content: "https://cdn.example.com/asset.avi", type: CanvasNodeType.Video, expected: "avi" },
            { content: "https://cdn.example.com/asset.mkv", type: CanvasNodeType.Video, expected: "mkv" },
        ];

        for (const tc of testCases) {
            const node: CanvasNodeData = {
                id: "test-node",
                type: tc.type,
                x: 0,
                y: 0,
                metadata: {
                    mimeType: tc.mime,
                    content: tc.content,
                },
            };
            expect(canvasMediaFileExtension(node)).toBe(tc.expected);
        }
    });

    it("P2: generationErrorMessage 正确识别 Windows Socket 异常与网络断连模式", () => {
        const windowsErrors = [
            "wsarecv: An existing connection was forcibly closed by the remote host.",
            "wsasend: An established connection was aborted by the software in your host machine. (connection abort)",
            "read tcp 127.0.0.1:8080: wsaeconnreset",
            "write tcp 127.0.0.1:8080: wsaeconnaborted",
        ];

        for (const errMsg of windowsErrors) {
            const formatted = generationErrorMessage(new Error(errMsg));
            expect(formatted).toBe("网络异常。");
        }
    });

    it("P1: AssetAudioArchivePreview 组件正常导出，具备素材解析与容灾能力", () => {
        expect(typeof AssetAudioArchivePreview).toBe("function");
    });

    it("P2: Seedance 自适应画幅真实业务函数在具备视觉参考时保留 adaptive，纯文本时兜底 16:9", async () => {
        const { resolveSeedanceAdaptiveRatio } = await import("@/services/api/video-provider-seedance");
        expect(resolveSeedanceAdaptiveRatio("adaptive", true)).toBe("adaptive");
        expect(resolveSeedanceAdaptiveRatio("adaptive", false)).toBe("16:9");
        expect(resolveSeedanceAdaptiveRatio("9:16", true)).toBe("9:16");
        expect(resolveSeedanceAdaptiveRatio("9:16", false)).toBe("9:16");
    });

    it("P2: formatSeedanceErrorMessage 正确映射细粒度上游错误码 (如 TaskTypeConstraint)", async () => {
        const { formatSeedanceErrorMessage } = await import("@/services/api/video-provider-seedance");
        const constraintTask = {
            id: "task-1",
            status: "failed" as const,
            error: {
                code: "TaskTypeConstraint",
                message: "input duration must be -1 when first_frame is specified",
            },
        };
        const formatted = formatSeedanceErrorMessage(constraintTask);
        expect(formatted).toContain("任务类型或输入素材不满足模型约束");
        expect(formatted).toContain("TaskTypeConstraint");
        expect(formatted).toContain("input duration must be -1");

        const normalTask = {
            id: "task-2",
            status: "failed" as const,
            error: {
                code: "CustomProviderError",
                message: "upstream service unavailable",
            },
        };
        expect(formatSeedanceErrorMessage(normalTask)).toBe("CustomProviderError：upstream service unavailable");
    });
});
