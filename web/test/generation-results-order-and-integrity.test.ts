import { describe, expect, it } from "bun:test";
import {
    deriveGenerationResultsFromLog,
    isSameImageGenerationResult,
    reconcileImageGenerationResults,
    type GeneratedImage,
    type GenerationLog,
    type GenerationResult,
} from "../src/pages/image/index";
import { deduplicateLogImages } from "../src/services/global-task-guardian";

describe("工作台生成结果派生与跨批次拓扑顺序严格治理 (Generation Results Order & Integrity Contract)", () => {
    it("规范一：普通生图乱序完成与部分失败时，图片必须精准落入其所属 slotIndex，槽位绝对禁止错位或前后倒置", () => {
        const batchId = "batch_alpha";
        // 模拟槽位 2 先完成，槽位 0 后完成，槽位 1 失败未产出图片
        const outOfOrderImages: GeneratedImage[] = [
            {
                id: `${batchId}_slot_2`,
                dataUrl: "data:image/png;base64,slot2_img",
                storageKey: "storage_slot_2",
                durationMs: 1200,
                width: 1024,
                height: 1024,
                bytes: 4096,
                taskId: "task_slot_2",
                slotIndex: 2,
            },
            {
                id: `${batchId}_slot_0`,
                dataUrl: "data:image/png;base64,slot0_img",
                storageKey: "storage_slot_0",
                durationMs: 1500,
                width: 1024,
                height: 1024,
                bytes: 4096,
                taskId: "task_slot_0",
                slotIndex: 0,
            },
        ];

        const log: GenerationLog = {
            id: batchId,
            sessionId: "session_001",
            prompt: "测试提示词",
            model: "test-model",
            config: { count: "3" },
            taskIds: ["task_slot_0", "task_slot_1", "task_slot_2"],
            images: outOfOrderImages,
            status: "failed",
            error: "部分槽位生成中断",
            createdAt: 1000,
        };

        const derived = deriveGenerationResultsFromLog(log);
        expect(derived.length).toBe(3);

        // 验证槽位 0：精确对应 slot 0 成功图片
        expect(derived[0].slotIndex).toBe(0);
        expect(derived[0].status).toBe("success");
        expect(derived[0].id).toBe(`${batchId}_slot_0`);
        expect(derived[0].image?.storageKey).toBe("storage_slot_0");
        expect(derived[0].taskId).toBe("task_slot_0");

        // 验证槽位 1：精准标识为失败卡槽，并附带专属 task_slot_1 与重试信息，未被槽位 2 篡位！
        expect(derived[1].slotIndex).toBe(1);
        expect(derived[1].status).toBe("failed");
        expect(derived[1].id).toBe(`${batchId}_slot_1`);
        expect(derived[1].taskId).toBe("task_slot_1");

        // 验证槽位 2：精确对应 slot 2 成功图片，位置恒定在末尾递增
        expect(derived[2].slotIndex).toBe(2);
        expect(derived[2].status).toBe("success");
        expect(derived[2].id).toBe(`${batchId}_slot_2`);
        expect(derived[2].image?.storageKey).toBe("storage_slot_2");
        expect(derived[2].taskId).toBe("task_slot_2");
    });

    it("规范二：多批次汇聚对账时，新批次必须前置排在最前（顶层），批次内部槽位必须严格按 slotIndex 升序排列", () => {
        // 批次 1（老批次，createdAt: 1000）
        const oldLog: GenerationLog = {
            id: "batch_old",
            sessionId: "session_001",
            prompt: "第一批次",
            model: "model_v1",
            config: { count: "2" },
            taskIds: ["old_t0", "old_t1"],
            images: [
                { id: "batch_old_slot_0", dataUrl: "img_old_0", storageKey: "key_old_0", durationMs: 100, width: 512, height: 512, bytes: 100, slotIndex: 0 },
                { id: "batch_old_slot_1", dataUrl: "img_old_1", storageKey: "key_old_1", durationMs: 100, width: 512, height: 512, bytes: 100, slotIndex: 1 },
            ],
            status: "success",
            createdAt: 1000,
        };

        // 批次 2（新批次，createdAt: 2000）
        const newLog: GenerationLog = {
            id: "batch_new",
            sessionId: "session_001",
            prompt: "第二批次",
            model: "model_v1",
            config: { count: "2" },
            taskIds: ["new_t0", "new_t1"],
            images: [
                { id: "batch_new_slot_0", dataUrl: "img_new_0", storageKey: "key_new_0", durationMs: 100, width: 512, height: 512, bytes: 100, slotIndex: 0 },
                { id: "batch_new_slot_1", dataUrl: "img_new_1", storageKey: "key_new_1", durationMs: 100, width: 512, height: 512, bytes: 100, slotIndex: 1 },
            ],
            status: "success",
            createdAt: 2000,
        };

        const logs = [oldLog, newLog];
        // 模拟生命周期守卫中的正向聚合流程：升序排序后逐个 prepend-or-update
        const sortedLogs = [...logs].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        let reconciled: GenerationResult[] = [];
        sortedLogs.forEach((logItem) => {
            const derived = deriveGenerationResultsFromLog(logItem);
            reconciled = reconcileImageGenerationResults(reconciled, derived, "prepend-or-update");
        });

        expect(reconciled.length).toBe(4);
        // 新批次在顶层：index 0 和 1 属于 batch_new，且 slotIndex 递增
        expect(reconciled[0].batchId).toBe("batch_new");
        expect(reconciled[0].slotIndex).toBe(0);
        expect(reconciled[1].batchId).toBe("batch_new");
        expect(reconciled[1].slotIndex).toBe(1);

        // 老批次在下方：index 2 和 3 属于 batch_old，且 slotIndex 递增
        expect(reconciled[2].batchId).toBe("batch_old");
        expect(reconciled[2].slotIndex).toBe(0);
        expect(reconciled[3].batchId).toBe("batch_old");
        expect(reconciled[3].slotIndex).toBe(1);
    });

    it("规范三：并发与重试时相同卡槽卡片必须就地融合更新，绝不重复插入导致卡片爆炸或槽位错乱", () => {
        const initialResults: GenerationResult[] = [
            { id: "batch_1_slot_0", batchId: "batch_1", slotIndex: 0, status: "pending", taskId: "t0" },
            { id: "batch_1_slot_1", batchId: "batch_1", slotIndex: 1, status: "pending", taskId: "t1" },
        ];

        // 槽位 0 就绪更新
        const incomingSuccess: GenerationResult[] = [
            {
                id: "batch_1_slot_0",
                batchId: "batch_1",
                slotIndex: 0,
                status: "success",
                taskId: "t0",
                image: { id: "batch_1_slot_0", dataUrl: "data:image/png;base64,done", durationMs: 500, width: 512, height: 512, bytes: 2048 },
            },
        ];

        const afterReconcile = reconcileImageGenerationResults(initialResults, incomingSuccess, "merge-update");
        expect(afterReconcile.length).toBe(2);
        expect(afterReconcile[0].status).toBe("success");
        expect(afterReconcile[0].image?.dataUrl).toBe("data:image/png;base64,done");
        expect(afterReconcile[1].status).toBe("pending");
    });

    it("规范四：deduplicateLogImages 强幂等去重且严格按 slotIndex 升序重排", () => {
        const batchId = "batch_test";
        const duplicateImages: GeneratedImage[] = [
            { id: `${batchId}_slot_1`, dataUrl: "url1_old", storageKey: "key_1", durationMs: 1, width: 1, height: 1, bytes: 1, slotIndex: 1 },
            { id: `${batchId}_slot_0`, dataUrl: "url0", storageKey: "key_0", durationMs: 1, width: 1, height: 1, bytes: 1, slotIndex: 0 },
            { id: `${batchId}_slot_1`, dataUrl: "url1_new", storageKey: "key_1_new", durationMs: 1, width: 1, height: 1, bytes: 1, slotIndex: 1 }, // 同槽位最新覆盖
        ];

        const deduped = deduplicateLogImages(duplicateImages, batchId);
        expect(deduped.length).toBe(2);
        // slotIndex: 0 排在最前
        expect((deduped[0] as any).slotIndex).toBe(0);
        expect(deduped[0].id).toBe(`${batchId}_slot_0`);
        // slotIndex: 1 排在第二位，且内容被有效更新
        expect((deduped[1] as any).slotIndex).toBe(1);
        expect(deduped[1].id).toBe(`${batchId}_slot_1`);
        expect(deduped[1].dataUrl).toBe("url1_new");
    });
});
