import { describe, expect, it } from "bun:test";
import {
    reconcileGenerationResults,
    isSameGenerationResult,
    getGenerationCardSlotId,
    deriveGenerationResultsFromLog,
    formatBatchDisplayTime,
    type GenerationResult,
} from "../src/pages/video/index";
import type { GenerationLog, GeneratedVideo } from "@/types/media";

describe("生视频工作台卡片强幂等与防克隆架构契约 (Video Workbench Idempotency & Anti-Cloning)", () => {
    const mockVideo1: GeneratedVideo = {
        id: "video-master-1",
        url: "blob:http://localhost:3000/v1.mp4",
        storageKey: "storage-v1",
        durationMs: 5000,
        width: 1280,
        height: 720,
        bytes: 1048576,
        mimeType: "video/mp4",
    };

    it("单段任务生命周期：从 pending 原地翻转为 success，卡片总数严格恒等于 1，杜绝卡片裂变", () => {
        const batchId = "batch-single-101";
        const slotId = getGenerationCardSlotId(batchId);

        // 1. 发起时：产生 pending 卡片
        const pendingCard: GenerationResult = {
            id: batchId,
            slotId,
            status: "pending",
            batchId,
            task: { id: "task-001", provider: "backend", model: "minimax-h3" } as any,
        };

        let currentResults: GenerationResult[] = [pendingCard];
        expect(currentResults).toHaveLength(1);
        expect(currentResults[0].status).toBe("pending");

        // 2. 轮询完成：返回带有真实 video.id 的成片卡片
        const successCard: GenerationResult = {
            id: mockVideo1.id, // "video-master-1"
            slotId,
            status: "success",
            video: mockVideo1,
            batchId,
            task: { id: "task-001", provider: "backend", model: "minimax-h3" } as any,
        };

        currentResults = reconcileGenerationResults(currentResults, [successCard], "merge-update");

        // 3. 断言：数量严格保持 1，原有 pending 卡片被原地升级为 success，杜绝裂变为 2 个卡片
        expect(currentResults).toHaveLength(1);
        expect(currentResults[0].status).toBe("success");
        expect(currentResults[0].video?.id).toBe("video-master-1");
        expect(currentResults[0].video?.url).toBe("blob:http://localhost:3000/v1.mp4");
        expect(currentResults[0].slotId).toBe(slotId);
    });

    it("用户连续多次点击左侧生成中记录：卡片严格强幂等，彻底根治卡片自我克隆 Bug", () => {
        const batchId = "batch-clone-defense-202";
        const slotId = getGenerationCardSlotId(batchId);

        const initialPendingCard: GenerationResult = {
            id: batchId,
            slotId,
            status: "pending",
            batchId,
            task: { id: "task-002", provider: "backend", model: "minimax-h3" } as any,
        };

        let currentResults: GenerationResult[] = [initialPendingCard];

        // 构造对应的 pending 状态日志
        const pendingLog: GenerationLog = {
            id: batchId,
            sessionId: "session-clone",
            userId: "user-1",
            prompt: "正在生成的视频",
            model: "minimax-h3",
            status: "pending",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            durationMs: 0,
            task: { id: "task-002", provider: "backend", model: "minimax-h3" } as any,
            runs: [],
            references: [],
            videoReferences: [],
            audioReferences: [],
            referenceOrder: [],
            config: {} as any,
            size: "16:9",
            resolution: "720p",
            seconds: "10",
        };

        // 用户连续 5 次点击左侧生成记录
        for (let i = 0; i < 5; i++) {
            const derived = deriveGenerationResultsFromLog(pendingLog);
            currentResults = reconcileGenerationResults(currentResults, derived, "prepend-or-update");
        }

        // 核心断言：无论用户点击多少次，卡片绝对不会自我克隆为 3 个或 5 个！
        expect(currentResults).toHaveLength(1);
        expect(currentResults[0].status).toBe("pending");
        expect(currentResults[0].batchId).toBe(batchId);
    });

    it("多段分镜视频任务：槽位全流程守恒与平滑推进（从 3 个槽位到 3 成品 + 1 总成片）", () => {
        const batchId = "batch-multi-303";
        const totalSegments = 3;

        // 1. 初始化 3 个分段槽位
        const initialSlots: GenerationResult[] = Array.from({ length: totalSegments }).map((_, idx) => ({
            id: getGenerationCardSlotId(batchId, idx + 1),
            slotId: getGenerationCardSlotId(batchId, idx + 1),
            batchId,
            segmentIndex: idx + 1,
            title: `第 ${idx + 1} 段`,
            status: "pending",
        }));

        let currentResults: GenerationResult[] = reconcileGenerationResults([], initialSlots, "prepend-or-update");
        expect(currentResults).toHaveLength(3);
        expect(currentResults.every((r) => r.status === "pending")).toBe(true);

        // 2. 第 1 段完成（推进事件）
        const seg1Output: GenerationResult = {
            id: "seg-output-1",
            slotId: getGenerationCardSlotId(batchId, 1),
            batchId,
            segmentIndex: 1,
            status: "success",
            video: { ...mockVideo1, id: "seg-output-1", label: "第 1 段" },
        };
        currentResults = reconcileGenerationResults(currentResults, [seg1Output], "merge-update");

        expect(currentResults).toHaveLength(3);
        const slot1 = currentResults.find((r) => r.segmentIndex === 1);
        const slot2 = currentResults.find((r) => r.segmentIndex === 2);
        expect(slot1?.status).toBe("success");
        expect(slot1?.video?.id).toBe("seg-output-1");
        expect(slot2?.status).toBe("pending");

        // 3. 第 2 段完成
        const seg2Output: GenerationResult = {
            id: "seg-output-2",
            slotId: getGenerationCardSlotId(batchId, 2),
            batchId,
            segmentIndex: 2,
            status: "success",
            video: { ...mockVideo1, id: "seg-output-2", label: "第 2 段" },
        };
        currentResults = reconcileGenerationResults(currentResults, [seg2Output], "merge-update");
        expect(currentResults).toHaveLength(3);
        expect(currentResults.find((r) => r.segmentIndex === 2)?.status).toBe("success");
        expect(currentResults.find((r) => r.segmentIndex === 3)?.status).toBe("pending");

        // 4. 全部完成：生成完整成片与最终 Log
        const multiLog: GenerationLog = {
            id: batchId,
            sessionId: "session-multi",
            userId: "user-1",
            prompt: "多段视频完整成片",
            model: "minimax-h3",
            status: "success",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            durationMs: 15000,
            video: { ...mockVideo1, id: "merged-master-video", label: "完整成片 (15s · 3段)" },
            segmentBatch: {
                batchId,
                status: "completed",
                handoff: {} as any,
                tasks: [],
            },
            runs: [
                {
                    runId: batchId,
                    status: "success",
                    prompt: "多段",
                    model: "minimax-h3",
                    config: {} as any,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    outputs: [
                        { outputId: "seg-output-1", mediaType: "video", status: "success", url: "v1.mp4", durationMs: 5000, segmentIndex: 1 },
                        { outputId: "seg-output-2", mediaType: "video", status: "success", url: "v2.mp4", durationMs: 5000, segmentIndex: 2 },
                        { outputId: "seg-output-3", mediaType: "video", status: "success", url: "v3.mp4", durationMs: 5000, segmentIndex: 3 },
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

        const finalDerived = deriveGenerationResultsFromLog(multiLog);
        currentResults = reconcileGenerationResults(currentResults, finalDerived, "prepend-or-update");

        // 最终断言：包含完整成片 + 3 段分镜卡片，共 4 项，全部为 success，没有任何重复卡片！
        expect(currentResults).toHaveLength(4);
        expect(currentResults[0].id).toBe("merged-master-video");
        expect(currentResults[0].status).toBe("success");
        expect(currentResults.slice(1).map((r) => r.segmentIndex)).toEqual([1, 2, 3]);
        expect(currentResults.every((r) => r.status === "success")).toBe(true);
    });

    it("槽位等价性判定：无论 ID 如何演进，同批次同槽位均能 100% 精准识别", () => {
        const batchId = "batch-slot-match";
        const slotCard: GenerationResult = {
            id: `${batchId}:slot:1`,
            slotId: `${batchId}:slot:1`,
            batchId,
            segmentIndex: 1,
            status: "pending",
        };

        const completedCard: GenerationResult = {
            id: "out-video-id-99",
            slotId: `${batchId}:slot:1`,
            batchId,
            segmentIndex: 1,
            status: "success",
        };

        expect(isSameGenerationResult(slotCard, completedCard)).toBe(true);

        const otherSegmentCard: GenerationResult = {
            id: "out-video-id-100",
            slotId: `${batchId}:slot:2`,
            batchId,
            segmentIndex: 2,
            status: "success",
        };
        expect(isSameGenerationResult(slotCard, otherSegmentCard)).toBe(false);
    });

    it("多段部分失败场景：失败卡片与成片/分段卡片槽位完全正交，互不冲突覆盖", () => {
        const batchId = "batch-fail-isolation";
        const partialFailedLog: GenerationLog = {
            id: batchId,
            sessionId: "session-fail",
            userId: "user-1",
            prompt: "分段失败日志",
            model: "minimax-h3",
            status: "failed",
            error: "第 2 段生成超时",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            durationMs: 5000,
            segmentBatch: {
                batchId,
                status: "failed",
                handoff: {} as any,
                tasks: [],
            },
            runs: [
                {
                    runId: batchId,
                    status: "failed",
                    prompt: "分段",
                    model: "minimax-h3",
                    config: {} as any,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    outputs: [
                        { outputId: "seg-output-1", role: "segment", mediaType: "video", status: "success", url: "v1.mp4", durationMs: 5000, segmentIndex: 1 },
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
            seconds: "10",
        };

        const derived = deriveGenerationResultsFromLog(partialFailedLog);
        // 期望得到：1 个成功的第 1 段卡片 + 1 个失败卡片（带有独立的 slotId: `${batchId}:failed`）
        expect(derived).toHaveLength(2);
        const successSeg = derived.find((r) => r.status === "success");
        const failedCard = derived.find((r) => r.status === "failed");

        expect(successSeg).toBeDefined();
        expect(successSeg?.slotId).toBe(`${batchId}:slot:1`);
        expect(successSeg?.segmentId).toBe("segment-1");

        expect(failedCard).toBeDefined();
        expect(failedCard?.id).toBe(`${batchId}-failed`);
        expect(failedCard?.slotId).toBe(`${batchId}:failed`);

        // 断言：失败卡片与成片/主卡片即使同批次，isSameGenerationResult 也是 false，绝不互相吞噬
        const masterCard: GenerationResult = {
            id: `${batchId}:master`,
            slotId: `${batchId}:master`,
            batchId,
            status: "pending",
        };
        expect(isSameGenerationResult(masterCard, failedCard!)).toBe(false);
    });

    it("批次日志删除联动：根据 batchId 精准过滤剔除结果卡片，无幽灵卡片残留", () => {
        const batchId1 = "batch-to-delete-1";
        const batchId2 = "batch-to-keep-2";

        const currentResults: GenerationResult[] = [
            { id: "v1", slotId: `${batchId1}:master`, batchId: batchId1, status: "success" },
            { id: "v2-1", slotId: `${batchId2}:slot:1`, batchId: batchId2, status: "success" },
            { id: "v2-2", slotId: `${batchId2}:slot:2`, batchId: batchId2, status: "success" },
        ];

        const deletedBatchSet = new Set([batchId1]);
        const nextResults = currentResults.filter((r) => !r.batchId || !deletedBatchSet.has(r.batchId));

        expect(nextResults).toHaveLength(2);
        expect(nextResults.every((r) => r.batchId === batchId2)).toBe(true);
    });

    it("时间格式化契约：跨天与同天时间戳精准区分，杜绝时间颠倒视觉幻觉", () => {
        const now = new Date();

        // 1. 同一天：仅输出 HH:mm:ss
        const todayTs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 29, 54).getTime();
        const todayStr = formatBatchDisplayTime(todayTs);
        expect(todayStr).toBe("10:29:54");

        // 2. 昨天：必须带有 '昨天' 前缀
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayTs = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 28, 16).getTime();
        const yesterdayStr = formatBatchDisplayTime(yesterdayTs);
        expect(yesterdayStr).toContain("昨天");
        expect(yesterdayStr).toContain("23:28:16");

        // 3. 同一年更早日期：包含月-日
        const earlierThisYearTs = new Date(now.getFullYear(), 0, 15, 8, 30, 0).getTime();
        const earlierStr = formatBatchDisplayTime(earlierThisYearTs);
        expect(earlierStr).toContain("01-15");
        expect(earlierStr).toContain("08:30:00");

        // 4. 跨年日期：包含年-月-日
        const lastYearTs = new Date(now.getFullYear() - 1, 5, 20, 14, 0, 0).getTime();
        const lastYearStr = formatBatchDisplayTime(lastYearTs);
        expect(lastYearStr).toContain(String(now.getFullYear() - 1));
        expect(lastYearStr).toContain("06-20");
    });

    it("批次真实物理时间严格倒序律：今天批次 (10:29:54) 严格置顶于昨天批次 (23:28:16) 之上，彻底解决展示错乱", () => {
        const now = new Date();
        const yesterdayTs = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 28, 16).getTime();
        const todayTs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 29, 54).getTime();

        const yesterdayLog: GenerationLog = {
            id: "batch-yesterday-232816",
            sessionId: "shared-draft-session",
            userId: "user-test",
            createdAt: yesterdayTs,
            title: "Seedance 2.0 Mini 生成",
            prompt: "古风汉服少女",
            time: "23:28:16",
            model: "seedance-2-mini",
            status: "failed",
            error: "上游服务过载",
            durationMs: 12000,
            size: "9:16",
            resolution: "720p",
            seconds: "5",
            runs: [],
            references: [],
            videoReferences: [],
            audioReferences: [],
            referenceOrder: [],
            config: {} as any,
        };

        const todayLog: GenerationLog = {
            id: "batch-today-102954",
            sessionId: "shared-draft-session",
            userId: "user-test",
            createdAt: todayTs,
            title: "Seedance 2.0 Mini 生成",
            prompt: "古风汉服少女再次生成",
            time: "10:29:54",
            model: "seedance-2-mini",
            status: "failed",
            error: "算力节点调度超时",
            durationMs: 15000,
            size: "9:16",
            resolution: "720p",
            seconds: "5",
            runs: [],
            references: [],
            videoReferences: [],
            audioReferences: [],
            referenceOrder: [],
            config: {} as any,
        };

        // 模拟存储/后台返回日志（哪怕原始列表是降序 [today, yesterday] 或乱序）
        const rawLogs = [todayLog, yesterdayLog];

        // 模拟页面状态同步生命周期：先按 createdAt 升序排序后再循环 prepend-or-update
        let pageResults: GenerationResult[] = [];
        const sortedLogs = [...rawLogs].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        sortedLogs.forEach((l) => {
            const derived = deriveGenerationResultsFromLog(l);
            pageResults = reconcileGenerationResults(pageResults, derived, "prepend-or-update");
        });

        // 断言：在结果列表 pageResults 中，今天的卡片严格排在最前方
        expect(pageResults).toHaveLength(2);
        expect(pageResults[0].batchId).toBe(todayLog.id);
        expect(pageResults[0].createdAt).toBe(todayTs);
        expect(pageResults[0].error).toBe("算力节点调度超时");
        expect(pageResults[1].batchId).toBe(yesterdayLog.id);
        expect(pageResults[1].createdAt).toBe(yesterdayTs);
        expect(pageResults[1].error).toBe("上游服务过载");

        // 模拟右侧批次聚合逻辑（batchGroups）
        const groupsMap = new Map<string, { batchId: string; createdAt: number; displayTime: string; items: GenerationResult[] }>();
        pageResults.forEach((item) => {
            const bId = item.batchId || item.id;
            if (!groupsMap.has(bId)) {
                const matchedLog = rawLogs.find((l) => l.id === bId);
                const createdTime = matchedLog?.createdAt || item.createdAt || Date.now();
                groupsMap.set(bId, {
                    batchId: bId,
                    createdAt: createdTime,
                    displayTime: formatBatchDisplayTime(createdTime),
                    items: [],
                });
            }
            groupsMap.get(bId)!.items.push(item);
        });

        const batchGroups = Array.from(groupsMap.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        // 核心商业级断言：
        // 1. 顶层第 0 项必须是今天 10:29:54 的批次
        expect(batchGroups[0].batchId).toBe("batch-today-102954");
        expect(batchGroups[0].displayTime).toBe("10:29:54");
        expect(batchGroups[0].displayTime).not.toContain("昨天");

        // 2. 第二项必须是昨天 23:28:16 的批次，且必须明确标注“昨天”
        expect(batchGroups[1].batchId).toBe("batch-yesterday-232816");
        expect(batchGroups[1].displayTime).toContain("昨天 23:28:16");

        // 3. 彻底终结时间乱序与视觉误判
        expect(batchGroups[0].createdAt).toBeGreaterThan(batchGroups[1].createdAt);
    });
});


