import { describe, expect, it } from "bun:test";
import {
    deriveGenerationResultsFromLog,
    matchImageForDetailSetRow,
    normalizeLog,
} from "../src/pages/image/index";
import { deduplicateLogImages } from "../src/services/global-task-guardian";
import type { DetailSetRow } from "../src/extensions/image-workbench-skills";

describe("电商套图与分镜多图槽位匹配与防污染契约 (Detail Set Slot Image Matching & Anti-Corruption)", () => {
    // 构造 12 行标准电商套图分镜行（模拟真实生成未持久化 taskId/storageKey 的初始状态）
    const createMockRows = (): DetailSetRow[] =>
        Array.from({ length: 12 }, (_, i) => ({
            seq: i + 1,
            modulePurpose: `模块_${i + 1}`,
            title: `镜头_${i + 1}`,
            copy: `文案_${i + 1}`,
            visualDescription: `视觉描述_${i + 1}`,
            finalPrompt: `Prompt_${i + 1}`,
            aspectRatio: "3:4",
            status: "pending" as const,
            taskId: undefined,
            storageKey: undefined,
            imageUrl: undefined,
        }));

    // 构造 5 张不同生成的真实图片（模拟 12 张任务仅完成 5 张后被前端刷新中断）
    const createMockImages = (batchId: string) => [
        {
            id: "ffff5e138983fd3c50db34f116102fa1",
            storageKey: "resource:ffff5e138983fd3c50db34f116102fa1",
            dataUrl: "data:image/png;base64,mockImage1",
            durationMs: 1200,
            width: 768,
            height: 1024,
            bytes: 50000,
            taskId: undefined,
        },
        {
            id: "7e6ea0b8af4df0fdea0f8da157cb813b",
            storageKey: "resource:7e6ea0b8af4df0fdea0f8da157cb813b",
            dataUrl: "data:image/png;base64,mockImage2",
            durationMs: 1300,
            width: 768,
            height: 1024,
            bytes: 52000,
            taskId: undefined,
        },
        {
            id: "eeaa8f442bba46d07d8dfa4a8d48c8e7",
            storageKey: "resource:eeaa8f442bba46d07d8dfa4a8d48c8e7",
            dataUrl: "data:image/png;base64,mockImage3",
            durationMs: 1100,
            width: 768,
            height: 1024,
            bytes: 48000,
            taskId: undefined,
        },
        {
            id: "6f6fb8442198314a7f1481a2442be228",
            storageKey: "resource:6f6fb8442198314a7f1481a2442be228",
            dataUrl: "data:image/png;base64,mockImage4",
            durationMs: 1400,
            width: 768,
            height: 1024,
            bytes: 51000,
            taskId: undefined,
        },
        {
            id: "f700cb177657bc66277521a8a98a12e1",
            storageKey: "resource:f700cb177657bc66277521a8a98a12e1",
            dataUrl: "data:image/png;base64,mockImage5",
            durationMs: 1250,
            width: 768,
            height: 1024,
            bytes: 49000,
            taskId: undefined,
        },
    ];

    it("规范一：当 taskId 均未定义时，绝对禁止触发 undefined === undefined 通配，前 5 行严格独占映射，后 7 行绝不命中任何图片", () => {
        const batchId = "batch_test_001";
        const rows = createMockRows();
        const images = createMockImages(batchId);

        // 前 5 行逐行匹配验证
        for (let i = 0; i < 5; i++) {
            const matched = matchImageForDetailSetRow(rows[i], images, batchId);
            expect(matched).toBeDefined();
            expect(matched?.storageKey).toBe(images[i].storageKey);
        }

        // 核心安全验证：第 2 行到第 5 行绝对不能命中第 1 张图 (images[0])
        expect(matchImageForDetailSetRow(rows[1], images, batchId)?.storageKey).not.toBe(images[0].storageKey);
        expect(matchImageForDetailSetRow(rows[2], images, batchId)?.storageKey).not.toBe(images[0].storageKey);

        // 后 7 行（未出图的槽位）绝对不能匹配到任何图片
        for (let i = 5; i < 12; i++) {
            const matched = matchImageForDetailSetRow(rows[i], images, batchId);
            expect(matched).toBeUndefined();
        }
    });

    it("规范二：deriveGenerationResultsFromLog 结果派生时，前 5 张卡片为 success 且各具独立图片，后 7 张卡片为 failed，绝无 12 张相同图片事故", () => {
        const batchId = "ui7mk-7jJaWjm0C_MWyqE";
        const rows = createMockRows();
        const images = createMockImages(batchId);

        const mockLog = {
            id: batchId,
            createdAt: Date.now() - 60_000,
            title: "电商套图测试",
            prompt: "测试提示词",
            time: "15:00",
            model: "gemini-2.5-flash",
            config: { model: "gemini-2.5-flash", count: "12" },
            references: [],
            durationMs: 6500,
            successCount: 5,
            failCount: 7,
            imageCount: 5,
            size: "768x1024",
            quality: "standard",
            status: "success" as const,
            images,
            thumbnails: images.map((img) => img.dataUrl),
            detailSet: {
                planId: batchId,
                createdAt: Date.now() - 60_000,
                productName: "测试商品",
                category: "skincare",
                config: { addText: true, outputLanguage: "zh" },
                rows,
            },
        };

        const results = deriveGenerationResultsFromLog(mockLog as any);

        expect(results).toHaveLength(12);

        // 前 5 张为 success
        const successCards = results.slice(0, 5);
        for (let i = 0; i < 5; i++) {
            expect(successCards[i].status).toBe("success");
            expect(successCards[i].image).toBeDefined();
            expect(successCards[i].image?.storageKey).toBe(images[i].storageKey);
        }

        // 收集前 5 张卡片的 storageKey，断言全部独立互斥
        const distinctKeys = new Set(successCards.map((c) => c.image?.storageKey));
        expect(distinctKeys.size).toBe(5);

        // 后 7 张为 failed，错误提示清晰且绝无图片挂载
        const failedCards = results.slice(5, 12);
        for (let i = 0; i < 7; i++) {
            expect(failedCards[i].status).toBe("failed");
            expect(failedCards[i].image).toBeUndefined();
            expect(failedCards[i].error).toMatch(/任务执行中断或未生成|任务超时中断/);
        }
    });

    it("规范三：历史脏数据被污染场景下的自愈清洗契约 (Anti-Corruption Cleansing)", async () => {
        const batchId = "corrupted_historical_batch";
        const cleanImages = createMockImages(batchId);

        // 构造被旧版漏洞污染的历史数据：12 行 rows 全被写入了第一张图的 storageKey
        const corruptedRows: DetailSetRow[] = Array.from({ length: 12 }, (_, i) => ({
            seq: i + 1,
            modulePurpose: `模块_${i + 1}`,
            title: `镜头_${i + 1}`,
            copy: `文案_${i + 1}`,
            visualDescription: `视觉描述_${i + 1}`,
            finalPrompt: `Prompt_${i + 1}`,
            aspectRatio: "3:4",
            status: "success" as const,
            storageKey: cleanImages[0].storageKey, // 全部被污染成第 0 张图
            imageUrl: cleanImages[0].dataUrl,
        }));

        const corruptedLog = {
            id: batchId,
            createdAt: Date.now() - 7200_000,
            title: "历史受污染套图",
            prompt: "提示词",
            time: "14:00",
            model: "gemini-2.5-flash",
            config: { model: "gemini-2.5-flash" },
            references: [],
            durationMs: 5000,
            successCount: 12,
            failCount: 0,
            imageCount: 5,
            size: "768x1024",
            quality: "standard",
            status: "success" as const,
            images: cleanImages, // 但 images 实际上保留了 5 张不同图
            thumbnails: cleanImages.map((img) => img.dataUrl),
            detailSet: {
                planId: batchId,
                createdAt: Date.now() - 7200_000,
                productName: "受污染商品",
                category: "skincare",
                config: { addText: true, outputLanguage: "zh" },
                rows: corruptedRows,
            },
        };

        const normalized = await normalizeLog(corruptedLog as any);

        expect(normalized.detailSet?.rows).toBeDefined();
        const healedRows = normalized.detailSet!.rows;

        // 自愈后前 5 行必须分别还原为各自真实的 storageKey
        for (let i = 0; i < 5; i++) {
            expect(healedRows[i].storageKey).toBe(cleanImages[i].storageKey);
            expect(healedRows[i].status).toBe("success");
        }

        // 自愈后前 5 行的 storageKey 互不相同
        const healedStorageKeys = new Set(healedRows.slice(0, 5).map((r) => r.storageKey));
        expect(healedStorageKeys.size).toBe(5);

        // 自愈后后 7 行被清空污染，状态重置为 failed
        for (let i = 5; i < 12; i++) {
            expect(healedRows[i].storageKey).toBeUndefined();
            expect(healedRows[i].status).toBe("failed");
        }
    });

    it("规范四：显式 Task ID 与 Card ID 具备更高优先级且不受位置变动影响", () => {
        const batchId = "batch_explicit_id_001";
        const rows = createMockRows();
        // 指定第 3 行拥有独立 Task ID
        rows[2].taskId = "task_row_3_unique";

        const images = [
            {
                id: "other_img_1",
                storageKey: "resource:other_1",
                dataUrl: "data:image/png;base64,1",
                durationMs: 1000,
                width: 768,
                height: 1024,
                bytes: 40000,
                taskId: "other_task",
            },
            {
                id: "target_img_row_3",
                storageKey: "resource:target_row_3",
                dataUrl: "data:image/png;base64,3",
                durationMs: 1200,
                width: 768,
                height: 1024,
                bytes: 45000,
                taskId: "task_row_3_unique",
            },
        ];

        const matched = matchImageForDetailSetRow(rows[2], images, batchId);
        expect(matched).toBeDefined();
        expect(matched?.id).toBe("target_img_row_3");
        expect(matched?.storageKey).toBe("resource:target_row_3");
    });

    it("规范五：LWW (Last-Write-Wins) 重试覆盖契约：同一槽位产生新重试任务并产出新图片时，新图片必须准确就地覆盖旧图片，绝不新增重复槽位", () => {
        const batchId = "batch_lww_test_001";
        const oldImageSlot0 = {
            id: `${batchId}_slot_0`,
            storageKey: "resource:old_key_0",
            dataUrl: "data:image/png;base64,old0",
            durationMs: 1000,
            width: 768,
            height: 1024,
            bytes: 50000,
            taskId: "task_old_0",
            slotIndex: 0,
        };
        const imageSlot1 = {
            id: `${batchId}_slot_1`,
            storageKey: "resource:key_1",
            dataUrl: "data:image/png;base64,1",
            durationMs: 1200,
            width: 768,
            height: 1024,
            bytes: 52000,
            taskId: "task_1",
            slotIndex: 1,
        };
        const newRetryImageSlot0 = {
            id: `${batchId}_slot_0`,
            storageKey: "resource:new_retry_key_0",
            dataUrl: "data:image/png;base64,new0",
            durationMs: 1500,
            width: 768,
            height: 1024,
            bytes: 55000,
            taskId: "task_new_retry_0",
            slotIndex: 0,
        };

        // 模拟去重：新重试图片放在末尾，执行 LWW 更新
        const deduped = deduplicateLogImages([oldImageSlot0, imageSlot1, newRetryImageSlot0], batchId);

        expect(deduped).toHaveLength(2);
        expect(deduped[0].id).toBe(`${batchId}_slot_0`);
        expect(deduped[0].storageKey).toBe("resource:new_retry_key_0");
        expect(deduped[0].taskId).toBe("task_new_retry_0");
        expect(deduped[1].id).toBe(`${batchId}_slot_1`);
        expect(deduped[1].storageKey).toBe("resource:key_1");
    });

    it("规范六：绝对物理槽位防漂移契约 (ui7mk 场景)：当中间槽位（如 slot 1~3）缺失未生成时，对应行严格呈现 failed，后续物理槽位（slot 4~11）绝不向前顺延抢占错位", () => {
        const batchId = "ui7mk-7jJaWjm0C_MWyqE";
        const rows = createMockRows(); // 12 行 (seq 1..12)

        // 模拟 ui7mk 数据库真实物理事实：物理上仅存在 slot 0 和 slot 4~11，slot 1~3 从未成功排队
        const presentSlots = [0, 4, 5, 6, 7, 8, 9, 10, 11];
        const sparseImages = presentSlots.map((slot) => ({
            id: `${batchId}_slot_${slot}`,
            storageKey: `resource:image_slot_${slot}`,
            dataUrl: `data:image/png;base64,sparse_${slot}`,
            durationMs: 1000 + slot * 10,
            width: 768,
            height: 1024,
            bytes: 50000,
            taskId: `task_slot_${slot}`,
            slotIndex: slot,
        }));

        // 逐行匹配断言：
        // 第 1 行 (seq 1, slot 0) 命中 slot 0 图片
        expect(matchImageForDetailSetRow(rows[0], sparseImages, batchId)?.storageKey).toBe("resource:image_slot_0");

        // 第 2~4 行 (seq 2..4, slot 1..3) 必须为 undefined，绝不允许向后借图把 slot 4 移到第 2 行！
        expect(matchImageForDetailSetRow(rows[1], sparseImages, batchId)).toBeUndefined();
        expect(matchImageForDetailSetRow(rows[2], sparseImages, batchId)).toBeUndefined();
        expect(matchImageForDetailSetRow(rows[3], sparseImages, batchId)).toBeUndefined();

        // 第 5 行 (seq 5, slot 4) 严格命中 slot 4 图片
        expect(matchImageForDetailSetRow(rows[4], sparseImages, batchId)?.storageKey).toBe("resource:image_slot_4");

        // 结果派生断言：
        const mockLog = {
            id: batchId,
            createdAt: Date.now() - 3600_000,
            title: "嫒堤皙电商套图",
            prompt: "清洁蜜露",
            time: "12:00",
            model: "gemini-2.5-flash",
            config: { model: "gemini-2.5-flash", count: "12" },
            references: [],
            durationMs: 9000,
            successCount: 9,
            failCount: 3,
            imageCount: 9,
            size: "768x1024",
            quality: "standard",
            status: "success" as const,
            images: sparseImages,
            thumbnails: sparseImages.map((img) => img.dataUrl),
            detailSet: {
                planId: batchId,
                createdAt: Date.now() - 3600_000,
                productName: "嫒堤皙胶原香氛清洁蜜露",
                category: "skincare",
                config: { addText: true, outputLanguage: "zh" },
                rows,
            },
        };

        const results = deriveGenerationResultsFromLog(mockLog as any);
        expect(results).toHaveLength(12);

        // 卡片 0 为 success
        expect(results[0].status).toBe("success");
        expect(results[0].image?.storageKey).toBe("resource:image_slot_0");

        // 卡片 1, 2, 3 严格为 failed，且绝对无图，真实暴露缺失项
        for (let s = 1; s <= 3; s++) {
            expect(results[s].status).toBe("failed");
            expect(results[s].image).toBeUndefined();
            expect(results[s].error).toMatch(/任务执行中断或未生成|任务超时中断/);
        }

        // 卡片 4~11 严格为 success，且对应自身槽位
        for (let s = 4; s < 12; s++) {
            expect(results[s].status).toBe("success");
            expect(results[s].image?.storageKey).toBe(`resource:image_slot_${s}`);
        }
    });

    it("规范七：跨任务/外来批次串图污染自愈与纯化契约 (Y9N 场景)：当套图行混入外来任务脏数据时，批次防跨界净化剔除外来干扰，还原真实物理卡槽结果", () => {
        const batchId = "Y9N-SxRJlLyF3hFSSHW-d";
        // 构造 14 行套图
        const rows: DetailSetRow[] = Array.from({ length: 14 }, (_, i) => ({
            seq: i + 1,
            modulePurpose: `模块_${i + 1}`,
            title: `镜头_${i + 1}`,
            copy: `文案_${i + 1}`,
            visualDescription: `视觉描述_${i + 1}`,
            finalPrompt: `Prompt_${i + 1}`,
            aspectRatio: "3:4",
            status: "success" as const,
            taskId: `real_task_${i}`,
            storageKey: `resource:real_clean_${i}`,
            imageUrl: `data:image/png;base64,real_${i}`,
        }));

        // 模拟历史脏数据被污染：第 2 行和第 3 行被写入了人脸融合与厨房刷子等外来任务
        rows[1].taskId = "foreign_face_task_999";
        rows[1].storageKey = "resource:foreign_face_fusion";
        rows[1].imageUrl = "data:image/png;base64,foreign_face";

        rows[2].taskId = "foreign_brush_task_888";
        rows[2].storageKey = "resource:foreign_kitchen_brush";
        rows[2].imageUrl = "data:image/png;base64,foreign_brush";

        // 本批次的 14 张真实纯正图片
        const authenticImages = Array.from({ length: 14 }, (_, i) => ({
            id: `${batchId}_slot_${i}`,
            storageKey: `resource:real_clean_${i}`,
            dataUrl: `data:image/png;base64,real_${i}`,
            durationMs: 1200,
            width: 768,
            height: 1024,
            bytes: 50000,
            taskId: `real_task_${i}`,
            slotIndex: i,
        }));

        // 外来批次混入的污染图片
        const foreignImages = [
            {
                id: "other_batch_slot_1",
                storageKey: "resource:foreign_face_fusion",
                dataUrl: "data:image/png;base64,foreign_face",
                durationMs: 1000,
                width: 768,
                height: 1024,
                bytes: 45000,
                taskId: "foreign_face_task_999",
            },
            {
                id: "other_batch_slot_2",
                storageKey: "resource:foreign_kitchen_brush",
                dataUrl: "data:image/png;base64,foreign_brush",
                durationMs: 1000,
                width: 768,
                height: 1024,
                bytes: 46000,
                taskId: "foreign_brush_task_888",
            },
        ];

        // 1. deduplicateLogImages 必须剔除外来 _slot_ 图片
        const mixedImages = [...authenticImages, ...foreignImages];
        const cleaned = deduplicateLogImages(mixedImages, batchId);
        expect(cleaned).toHaveLength(14);
        expect(cleaned.some((img) => img.storageKey === "resource:foreign_face_fusion")).toBe(false);
        expect(cleaned.some((img) => img.storageKey === "resource:foreign_kitchen_brush")).toBe(false);

        // 2. matchImageForDetailSetRow 精确槽位卡片 ID 优先级高于错误 storageKey/taskId
        // 第 2 行 (seq 2, slot 1) 能够精确匹配到当前批次的 authenticImages[1] (real_clean_1)
        const matchedRow1 = matchImageForDetailSetRow(rows[1], cleaned, batchId);
        expect(matchedRow1).toBeDefined();
        expect(matchedRow1?.id).toBe(`${batchId}_slot_1`);
        expect(matchedRow1?.storageKey).toBe("resource:real_clean_1");

        // 第 3 行 (seq 3, slot 2) 能够精确匹配到当前批次的 authenticImages[2] (real_clean_2)
        const matchedRow2 = matchImageForDetailSetRow(rows[2], cleaned, batchId);
        expect(matchedRow2).toBeDefined();
        expect(matchedRow2?.id).toBe(`${batchId}_slot_2`);
        expect(matchedRow2?.storageKey).toBe("resource:real_clean_2");
    });

    it("规范八：同批次跨卡槽防盗门阀与权威度倒挂治理契约：当某行因脏数据残留同批次其他卡槽的 storageKey/taskId 时，严格排他拦截，杜绝霸占偷图导致错位", () => {
        const batchId = "batch_anti_theft_001";
        const rows = createMockRows(); // 12 行

        // 构造同批次的 2 张图片：分别为 Slot 0 与 Slot 4
        const authenticImages = [
            {
                id: `${batchId}_slot_0`,
                storageKey: "resource:authentic_slot_0",
                dataUrl: "data:image/png;base64,slot0",
                durationMs: 1000,
                width: 768,
                height: 1024,
                bytes: 50000,
                taskId: "task_authentic_slot_0",
                slotIndex: 0,
            },
            {
                id: `${batchId}_slot_4`,
                storageKey: "resource:authentic_slot_4",
                dataUrl: "data:image/png;base64,slot4",
                durationMs: 1200,
                width: 768,
                height: 1024,
                bytes: 52000,
                taskId: "task_authentic_slot_4",
                slotIndex: 4,
            },
        ];

        // 模拟旧漏洞脏数据场景：第 2 行 (seq 2, slotIndex 1) 物理上从未生成成功，
        // 但因历史借图残留了第 5 行 (seq 5, slotIndex 4) 的 storageKey 与 taskId
        rows[1].taskId = "task_authentic_slot_4";
        rows[1].storageKey = "resource:authentic_slot_4";
        rows[1].imageUrl = "data:image/png;base64,slot4";

        // 1. matchImageForDetailSetRow 断言：
        // 第 2 行绝不能通过 Rule 2 (TaskId) 或 Rule 4 (StorageKey) 盗用属于 Slot 4 的图片！
        const matchedStolenRow = matchImageForDetailSetRow(rows[1], authenticImages, batchId);
        expect(matchedStolenRow).toBeUndefined();

        // 第 5 行 (seq 5, slotIndex 4) 必须正确独占属于它自己的 Slot 4 图片！
        const matchedLegitRow = matchImageForDetailSetRow(rows[4], authenticImages, batchId);
        expect(matchedLegitRow).toBeDefined();
        expect(matchedLegitRow?.id).toBe(`${batchId}_slot_4`);
        expect(matchedLegitRow?.storageKey).toBe("resource:authentic_slot_4");

        // 2. deriveGenerationResultsFromLog 结果派生断言：
        const mockLog = {
            id: batchId,
            createdAt: Date.now() - 3600_000,
            title: "防偷图测试",
            prompt: "提示词",
            time: "10:00",
            model: "gemini-2.5-flash",
            config: { model: "gemini-2.5-flash", count: "12" },
            references: [],
            durationMs: 3000,
            successCount: 2,
            failCount: 10,
            imageCount: 2,
            size: "768x1024",
            quality: "standard",
            status: "success" as const,
            images: authenticImages,
            thumbnails: authenticImages.map((img) => img.dataUrl),
            detailSet: {
                planId: batchId,
                createdAt: Date.now() - 3600_000,
                productName: "商品",
                category: "skincare",
                config: { addText: true, outputLanguage: "zh" },
                rows,
            },
        };

        const results = deriveGenerationResultsFromLog(mockLog as any);
        expect(results).toHaveLength(12);

        // 卡片 0 为 success (自身图片)
        expect(results[0].status).toBe("success");
        expect(results[0].image?.storageKey).toBe("resource:authentic_slot_0");

        // 卡片 1 (seq 2, slotIndex 1) 严禁呈现 success！必须识别为 isStolenKey 并呈现 failed！
        expect(results[1].status).toBe("failed");
        expect(results[1].image).toBeUndefined();

        // 卡片 4 (seq 5, slotIndex 4) 为 success (独占自身图片)
        expect(results[4].status).toBe("success");
        expect(results[4].image?.storageKey).toBe("resource:authentic_slot_4");
    });
});
