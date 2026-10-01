import { describe, expect, test } from "bun:test";
import {
    buildCapturePlans,
    normalizeVideoSamplingPolicy,
    compareFrameTimestampOrder,
    extractResourceStorageKey,
    extractVideoAudio,
    shouldEnableAnonymousCors,
} from "../src/extensions/opc-infinite/media/video-decomposition/frame-sampler";
import {
    chunkFrameManifest,
    limitGridPages,
} from "../src/extensions/opc-infinite/services/video-reverse-contracts";
import {
    isModelAudioInputSupported,
} from "../src/extensions/opc-infinite/services/video-reverse-analysis";

describe("Video decomposition and frame sampling", () => {
    test("buildCapturePlans respects maxFrames limit on long videos", () => {
        const policy = normalizeVideoSamplingPolicy({ mode: "seconds_and_scene", fps: 2, maxFrames: 50 });
        const plans = buildCapturePlans(60, policy);
        expect(plans.length).toBeGreaterThan(0);
        expect(plans.length).toBeLessThanOrEqual(150);
    });

    test("compareFrameTimestampOrder sorts chronologically", () => {
        const f1 = { timestampSec: 1.5, frameType: "timeline_sample" as const, index: 1 };
        const f2 = { timestampSec: 0.5, frameType: "timeline_sample" as const, index: 2 };
        expect(compareFrameTimestampOrder(f1, f2)).toBeGreaterThan(0);
        expect(compareFrameTimestampOrder(f2, f1)).toBeLessThan(0);
    });

    test("chunkFrameManifest chunks frames correctly", () => {
        const frames = Array.from({ length: 18 }, (_, i) => ({
            index: i + 1,
            frame_id: 'F' + (i + 1),
            path: 'blob:http://localhost/' + i,
            timestamp_sec: i * 0.5,
            seek_second: i * 0.5,
            source: "browser_explicit_time_seek" as const,
        }));
        const pages = chunkFrameManifest(frames, 9);
        expect(pages.length).toBe(2);
        expect(pages[0].length).toBe(9);
        expect(pages[1].length).toBe(9);
    });

    test("limitGridPages enforces max model images limit", () => {
        const pages = Array.from({ length: 8 }, (_, i) => ({
            pageIndex: i + 1,
            frameStart: i * 9 + 1,
            frameEnd: (i + 1) * 9,
            url: 'blob:http://localhost/sheet-' + i,
            blob: {} as Blob,
            frames: [],
        }));
        const limited = limitGridPages(pages, 4);
        expect(limited.length).toBe(4);
        expect(limited[0].pageIndex).toBe(1);
    });

    test("isModelAudioInputSupported correctly routes by provider and model capability", () => {
        // Gemini 支持音频
        expect(isModelAudioInputSupported({ model: "gemini-1.5-pro", apiFormat: "gemini" } as any)).toBe(true);
        expect(isModelAudioInputSupported({ model: "gemini-2.0-flash", apiFormat: "gemini" } as any)).toBe(true);
        expect(isModelAudioInputSupported({ model: "gpt-4o-audio-preview" } as any)).toBe(true);

        // Claude 和普通聊天模型不支持音频附加（避免 400 Bad Request 协议破坏）
        expect(isModelAudioInputSupported({ model: "claude-3-5-sonnet-20241022", interfaceType: "claude-api" } as any)).toBe(false);
        expect(isModelAudioInputSupported({ model: "deepseek-chat" } as any)).toBe(false);
        expect(isModelAudioInputSupported({ model: "gpt-4o" } as any)).toBe(false);
    });

    test("extractVideoAudio rejects oversized videos with clear reason", async () => {
        const hugeFakeBlob = { size: 350 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) } as any;
        const result = await extractVideoAudio(hugeFakeBlob);
        expect(result.blob).toBe(null);
        expect(result.errorReason).toContain("超过 300MB");

        const longDurationResult = await extractVideoAudio(new Blob([]), { sourceDurationSec: 700 });
        expect(longDurationResult.blob).toBe(null);
        expect(longDurationResult.errorReason).toContain("超过 10 分钟");
    });

    test("shouldEnableAnonymousCors accurately flags remote and redirecting resource URLs while keeping local blobs isolated", () => {
        // 本地相对资源路径（S3/OSS开启时会 307 重定向至外部存储桶）必须启用 anonymous CORS 避免 Canvas 污染
        expect(shouldEnableAnonymousCors("/api/resources/0a394a26fbeb82c30d3c2a166b08d3c6/file")).toBe(true);
        expect(shouldEnableAnonymousCors("/public/resources/123456/file")).toBe(true);
        expect(shouldEnableAnonymousCors("https://cn-nb2.rains3.com/zhiying/video.mp4")).toBe(true);
        expect(shouldEnableAnonymousCors("http://example.com/stream.mp4")).toBe(true);

        // 纯内存 Blob 和 Data URL 无需 CORS，绝对同源隔离
        expect(shouldEnableAnonymousCors("blob:http://localhost:3000/b1c4e7da-9a28-4c28")).toBe(false);
        expect(shouldEnableAnonymousCors("data:video/mp4;base64,AAAA")).toBe(false);
        expect(shouldEnableAnonymousCors(null as any)).toBe(false);
    });

    test("extractResourceStorageKey extracts storage keys accurately", () => {
        expect(extractResourceStorageKey("resource:0a394a26fbeb82c30d3c2a166b08d3c6")).toBe("resource:0a394a26fbeb82c30d3c2a166b08d3c6");
        expect(extractResourceStorageKey("/api/resources/0a394a26fbeb82c30d3c2a166b08d3c6/file")).toBe("resource:0a394a26fbeb82c30d3c2a166b08d3c6");
        expect(extractResourceStorageKey("https://cn-nb2.rains3.com/open-ai-canvas/0a394a26fbeb82c30d3c2a166b08d3c6/raw.mp4")).toBe("resource:0a394a26fbeb82c30d3c2a166b08d3c6");
        expect(extractResourceStorageKey("https://cn-nb2.rains3.com/open-ai-canvas/0a394a26fbeb82c30d3c2a166b08d3c6.mp4")).toBe("resource:0a394a26fbeb82c30d3c2a166b08d3c6");
        expect(extractResourceStorageKey("https://example.com/unrelated.mp4")).toBe("");
        expect(extractResourceStorageKey("")).toBe("");
        expect(extractResourceStorageKey(null as any)).toBe("");
    });
});