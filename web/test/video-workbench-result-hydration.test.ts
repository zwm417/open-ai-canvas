import { describe, expect, it } from "bun:test";
import { deriveGenerationResultsFromLog } from "../src/pages/video/index";
import type { GenerationLog, GeneratedVideo } from "@/types/media";

describe("生视频工作台结果派生与状态保活契约 (Enterprise Result Hydration)", () => {
    const mockVideo: GeneratedVideo = {
        id: "video-101",
        url: "blob:http://localhost:3000/mock-video.mp4",
        storageKey: "storage-key-101",
        durationMs: 5000,
        width: 1280,
        height: 720,
        bytes: 1048576,
        mimeType: "video/mp4",
    };

    it("单视频成功记录：派生出包含 video 的 success 结果", () => {
        const successLog: GenerationLog = {
            id: "log-1",
            sessionId: "session-1",
            userId: "user-1",
            prompt: "测试单视频生成",
            model: "seedance-2.0",
            status: "success",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            durationMs: 5000,
            video: mockVideo,
            runs: [],
            references: [],
            videoReferences: [],
            audioReferences: [],
            referenceOrder: [],
            config: {} as any,
            size: "16:9",
            resolution: "720p",
            seconds: "5",
        };

        const results = deriveGenerationResultsFromLog(successLog);
        expect(results).toHaveLength(1);
        expect(results[0].status).toBe("success");
        expect(results[0].video?.id).toBe("video-101");
        expect(results[0].video?.url).toBe("blob:http://localhost:3000/mock-video.mp4");
    });

    it("多段拼接视频成功记录：优先派生完整成片以及各分段 output", () => {
        const multiSegmentLog: GenerationLog = {
            id: "log-multi",
            sessionId: "session-multi",
            userId: "user-1",
            prompt: "多段视频生成",
            model: "seedance-2.0",
            status: "success",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            durationMs: 15000,
            video: { ...mockVideo, id: "merged-video", label: "完整成片 (15s · 2段)" },
            segmentBatch: {
                batchId: "batch-1",
                status: "completed",
                handoff: {} as any,
                tasks: [],
            },
            runs: [
                {
                    runId: "run-1",
                    status: "success",
                    prompt: "多段",
                    model: "seedance-2.0",
                    config: {} as any,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    outputs: [
                        { outputId: "seg-1", mediaType: "video", status: "success", url: "seg1.mp4", durationMs: 7000, segmentIndex: 1 },
                        { outputId: "seg-2", mediaType: "video", status: "success", url: "seg2.mp4", durationMs: 8000, segmentIndex: 2 },
                    ],
                },
            ],
            references: [],
            videoReferences: [],
            audioReferences: [],
            referenceOrder: [],
            config: {} as any,
            size: "16:9",
            resolution: "720p",
            seconds: "15",
        };

        const results = deriveGenerationResultsFromLog(multiSegmentLog);
        // 应包含完整成片 + 2 个分段视频
        expect(results).toHaveLength(3);
        expect(results[0].id).toBe("merged-video");
        expect(results[1].id).toBe("seg-1");
        expect(results[2].id).toBe("seg-2");
    });

    it("生成中（pending）任务记录：正确派生 pending 占位结果", () => {
        const pendingLog: GenerationLog = {
            id: "log-pending",
            sessionId: "session-pending",
            userId: "user-1",
            prompt: "正在生成",
            model: "seedance-2.0",
            status: "pending",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            durationMs: 0,
            task: { id: "task-999", provider: "seedance", model: "seedance-2.0" } as any,
            runs: [],
            references: [],
            videoReferences: [],
            audioReferences: [],
            referenceOrder: [],
            config: {} as any,
            size: "16:9",
            resolution: "720p",
            seconds: "5",
        };

        const results = deriveGenerationResultsFromLog(pendingLog);
        expect(results).toHaveLength(1);
        expect(results[0].status).toBe("pending");
        expect(results[0].task?.id).toBe("task-999");
    });

    it("生成失败（failed）记录：派生包含明确错误信息的 failed 结果", () => {
        const failedLog: GenerationLog = {
            id: "log-failed",
            sessionId: "session-failed",
            userId: "user-1",
            prompt: "生成失败案例",
            model: "seedance-2.0",
            status: "failed",
            error: "上游服务配额不足",
            failureCount: 2,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            durationMs: 1200,
            runs: [],
            references: [],
            videoReferences: [],
            audioReferences: [],
            referenceOrder: [],
            config: {} as any,
            size: "16:9",
            resolution: "720p",
            seconds: "5",
        };

        const results = deriveGenerationResultsFromLog(failedLog);
        expect(results).toHaveLength(1);
        expect(results[0].status).toBe("failed");
        expect(results[0].error).toBe("上游服务配额不足");
        expect(results[0].failureCount).toBe(2);
    });

    it("草稿（draft）记录：派生出空数组，不渲染无意义占位符", () => {
        const draftLog: GenerationLog = {
            id: "log-draft",
            sessionId: "session-draft",
            userId: "user-1",
            prompt: "未执行草稿",
            model: "seedance-2.0",
            status: "draft",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            durationMs: 0,
            runs: [],
            references: [],
            videoReferences: [],
            audioReferences: [],
            referenceOrder: [],
            config: {} as any,
            size: "16:9",
            resolution: "720p",
            seconds: "5",
        };

        const results = deriveGenerationResultsFromLog(draftLog);
        expect(results).toEqual([]);
    });

    it("多段分段生成失败（failed）记录：穿透 segmentBatch 任务派生出携带 representativeTask 的失败卡片以支持重新查询自愈", () => {
        const segmentFailedLog: GenerationLog = {
            id: "log-segment-failed",
            sessionId: "session-seg",
            userId: "user-1",
            prompt: "15秒两段式生成",
            model: "minimax_h3_b99_003_12s",
            status: "failed",
            error: "网络超时或排队超时",
            failureCount: 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            durationMs: 499000,
            runs: [],
            references: [],
            videoReferences: [],
            audioReferences: [],
            referenceOrder: [],
            config: {} as any,
            size: "16:9",
            resolution: "720p",
            seconds: "15",
            // 顶层 task 为 undefined，但在 segmentBatch.tasks 中存在真实后台任务
            task: undefined,
            segmentBatch: {
                batchId: "batch-15s",
                status: "failed",
                handoff: {
                    batchId: "batch-15s",
                    schemaVersion: "video-segment-handoff-v1",
                    targetDurationSec: 15,
                    aspectRatio: "16:9",
                    resolution: "720p",
                    segments: [],
                },
                tasks: [
                    {
                        segmentId: "seg-1",
                        status: "success",
                        task: { id: "task-autodl-seg1", provider: "backend", model: "minimax_h3_b99_003_12s" } as any,
                    },
                    {
                        segmentId: "seg-2",
                        status: "failed",
                        task: { id: "task-autodl-seg2-8af0ce", provider: "backend", model: "minimax_h3_b99_003_12s" } as any,
                        error: "排队超时",
                    },
                ],
            },
        };

        const results = deriveGenerationResultsFromLog(segmentFailedLog);
        expect(results).toHaveLength(1);
        expect(results[0].status).toBe("failed");
        expect(results[0].id).toBe("log-segment-failed");
        // 关键断言：即使顶层 log.task 为 undefined，结果卡片也必须正确穿透并优先携带未成功/失败分段的代表性 task
        expect(results[0].task).toBeDefined();
        expect(results[0].task?.id).toBe("task-autodl-seg2-8af0ce");

        // 场景 2：第一段已生成（存入 runs[0].outputs），第二段失败
        const partialSuccessLog: GenerationLog = {
            ...segmentFailedLog,
            runs: [
                {
                    runId: "run-1",
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    status: "failed",
                    prompt: "15秒两段式生成",
                    model: "minimax_h3_b99_003_12s",
                    outputs: [
                        {
                            outputId: "seg-1",
                            mediaType: "video",
                            role: "segment",
                            status: "success",
                            url: "https://example.com/seg1.mp4",
                            segmentIndex: 1,
                            startSec: 0,
                            endSec: 8,
                            durationMs: 8000,
                        },
                    ],
                },
            ],
        };

        const partialResults = deriveGenerationResultsFromLog(partialSuccessLog);
        expect(partialResults).toHaveLength(2);
        // 第一项为第一段成功视频
        expect(partialResults[0].id).toBe("seg-1");
        expect(partialResults[0].status).toBe("success");
        // 第二项为整体分段失败卡片，用于提示失败并允许重查自愈，优先绑定失败分段的任务句柄
        expect(partialResults[1].id).toBe("log-segment-failed-failed");
        expect(partialResults[1].status).toBe("failed");
        expect(partialResults[1].task?.id).toBe("task-autodl-seg2-8af0ce");
    });
});
