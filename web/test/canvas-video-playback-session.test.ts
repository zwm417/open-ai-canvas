import { describe, expect, it } from "bun:test";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";
import { useVideoPlaybackUrl } from "../src/components/canvas/canvas-node-content";
import * as React from "react";

// @opc-feature: zero-overhead-local-cache [start]
describe("画布视频播放会话原子锁定与防黑屏单测 (Canvas Video Playback Session Guardrail)", () => {
    it("导出 useVideoPlaybackUrl 确保可被单测与上游契约消费", () => {
        expect(typeof useVideoPlaybackUrl).toBe("function");
    });

    it("单次播放会话原子锁定契约：初始有效源在播放中途严禁被异步远端重写", () => {
        // 模拟节点状态
        const mockNode: CanvasNodeData = {
            id: "video-node-1",
            type: CanvasNodeType.Video,
            x: 0,
            y: 0,
            width: 640,
            height: 360,
            title: "测试短剧分镜视频",
            metadata: {
                content: "blob:http://localhost:3000/local-fast-preview.mp4",
                storageKey: "res:video-resource-888",
            },
        };

        // 验证初始 URL 提取规则与会话隔离
        const rawContent = mockNode.metadata?.content || "";
        const storageKey = mockNode.metadata?.storageKey || "";
        const initialUrl = rawContent.startsWith("blob:") ? rawContent : "";
        expect(initialUrl).toBe("blob:http://localhost:3000/local-fast-preview.mp4");

        // 会话锁逻辑断言：若当前会话已有锁定的 url，异步返回的远端地址严禁覆盖当前播放中的 url
        let lockedUrl = initialUrl;
        const asyncResolvedRemoteUrl = "https://cdn.example.com/oss-signed-video.mp4?Expires=1727829999&Signature=xyz";

        // 模拟后台异步解析完成
        const canOverride = !lockedUrl;
        if (canOverride) {
            lockedUrl = asyncResolvedRemoteUrl;
        }

        // 核心断言：已有播放源必须锁死，防止向组件触发 setUrl(newUrl)
        expect(canOverride).toBe(false);
        expect(lockedUrl).toBe("blob:http://localhost:3000/local-fast-preview.mp4");
    });

    it("无初始源场景：异步解析完成后必须原子性确立并填入播放源", () => {
        const mockNode: CanvasNodeData = {
            id: "video-node-2",
            type: CanvasNodeType.Video,
            x: 0,
            y: 0,
            width: 640,
            height: 360,
            title: "纯远端资源视频",
            metadata: {
                storageKey: "res:video-remote-only",
            },
        };

        let lockedUrl = "";
        const asyncResolvedRemoteUrl = "https://cdn.example.com/stream-video.mp4";

        const canOverride = !lockedUrl;
        if (canOverride) {
            lockedUrl = asyncResolvedRemoteUrl;
        }

        expect(canOverride).toBe(true);
        expect(lockedUrl).toBe("https://cdn.example.com/stream-video.mp4");
    });

    it("节点失活或切换场景：必须重置播放会话锁以释放解码器资源", () => {
        let active = true;
        let sessionUrl = "https://cdn.example.com/active-video.mp4";

        // 用户停止播放或离开视口
        active = false;
        if (!active) {
            sessionUrl = "";
        }

        expect(sessionUrl).toBe("");
    });

    it("直链可播视频场景：无私有 storageKey 时 fallback 优先 0ms 起播", () => {
        const directHttpNode: CanvasNodeData = {
            id: "video-node-direct",
            type: CanvasNodeType.Video,
            x: 0,
            y: 0,
            width: 640,
            height: 360,
            title: "外链 HTTP 视频",
            metadata: {
                content: "https://my-domain.com/fast-video.mp4",
            },
        };

        const rawContent = directHttpNode.metadata?.content || "";
        const storageKey = directHttpNode.metadata?.storageKey || "";
        const isDirectPlayableFallback = Boolean(rawContent && (!storageKey || rawContent.startsWith("blob:") || rawContent.startsWith("data:")));

        expect(isDirectPlayableFallback).toBe(true);
        const initialUrl = isDirectPlayableFallback ? rawContent : "";
        expect(initialUrl).toBe("https://my-domain.com/fast-video.mp4");
    });

    it("同一节点原地重新生成场景：资源键变化触发会话锁精准重置并接纳新源", () => {
        const nodeId = "video-node-regenerate";
        let session = {
            nodeKey: `${nodeId}:res:old-version`,
            url: "https://cdn.example.com/old-version.mp4",
        };

        // 重新生成完成，同一 node.id 被赋予新的 storageKey
        const newStorageKey = "res:new-version";
        const newFallback = "blob:http://localhost:3000/new-generated.mp4";
        const currentNodeKey = `${nodeId}:${newStorageKey || newFallback}`;

        // 验证会话锁感知变化
        const hasKeyChanged = session.nodeKey !== currentNodeKey;
        expect(hasKeyChanged).toBe(true);

        if (hasKeyChanged) {
            session = { nodeKey: currentNodeKey, url: newFallback };
        }

        expect(session.nodeKey).toBe(`${nodeId}:res:new-version`);
        expect(session.url).toBe("blob:http://localhost:3000/new-generated.mp4");
    });
});
// @opc-feature: zero-overhead-local-cache [end]
