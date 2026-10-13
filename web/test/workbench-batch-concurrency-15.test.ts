import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import {
    MAX_IMAGE_WORKBENCH_BATCH_COUNT,
    DETAIL_SET_TOTAL_MAX_COUNT,
} from "../src/extensions/image-workbench-skills/types/detail-set";
import { deriveGenerationResultsFromLog } from "../src/pages/image/index";
import type { GenerationLog } from "../src/types/workbench-history";

describe("生图工作台：全模式单次15张上限与服务端生命周期正向开发契约 (Workbench Batch 15 Ceiling & Server Lifecycle)", () => {
    const imageIndexPath = path.resolve(import.meta.dir, "../src/pages/image/index.tsx");
    const imageSource = fs.readFileSync(imageIndexPath, "utf-8");
    const settingsPanelPath = path.resolve(import.meta.dir, "../src/components/image-settings-panel.tsx");
    const settingsPanelSource = fs.readFileSync(settingsPanelPath, "utf-8");
    const detailSetCardPath = path.resolve(import.meta.dir, "../src/extensions/image-workbench-skills/components/detail-set-workflow-card.tsx");
    const detailSetCardSource = fs.readFileSync(detailSetCardPath, "utf-8");

    describe("规范一：单批次 15 张图片硬上限契约 (Batch Ceiling 15 Guardrail)", () => {
        it("全局常量统一导出 MAX_IMAGE_WORKBENCH_BATCH_COUNT 为 15", () => {
            expect(MAX_IMAGE_WORKBENCH_BATCH_COUNT).toBe(15);
            expect(DETAIL_SET_TOTAL_MAX_COUNT).toBe(15);
        });

        it("图像设置面板 CountInput 输入超出 15 张时即时 clamp 并给出预警提示", () => {
            expect(settingsPanelSource).toContain("if (raw > max)");
            expect(settingsPanelSource).toContain("单次批量生成上限为");
            expect(settingsPanelSource).toContain("已自动调整为");
        });

        it("电商套图卡片在达到 15 张上限时，模块卡片加号置灰并在越界点击时弹出上限警告", () => {
            expect(detailSetCardSource).toContain("totalCount >= DETAIL_SET_TOTAL_MAX_COUNT");
            expect(detailSetCardSource).toContain("已达批量上限");
            expect(detailSetCardSource).toContain("{totalCount} / {DETAIL_SET_TOTAL_MAX_COUNT}");
        });

        it("主调度器在所有入口点实施 <= 15 门禁防御", () => {
            // 1. 默认创造页面入口门禁
            expect(imageSource).toContain('if (Number(config.count) > 15)');
            expect(imageSource).toContain('message.warning("单次批量生成上限为 15 张图片，已自动调整为 15 张上限");');

            // 2. 套图 AI 规划门禁
            expect(imageSource).toContain('if (detailSetTotal > 15)');
            expect(imageSource).toContain('message.warning("单次批量生成上限为 15 张图片，请调整选择模块数量");');

            // 3. 套图逐行执行门禁
            expect(imageSource).toContain('if (plan.rows.length > 15)');
            expect(imageSource).toContain('message.warning("单次批量生成上限为 15 张图片，已超出批次限制");');
        });
    });

    describe("规范二：彻底切除前端直调降级反模式 (Zero Client-Direct Fallback & Strict Server Lifecycle)", () => {
        it("runGenerationSlot 绝不捕获提交错误降级为前端裸调用，严禁使用 requestGeneration/requestEdit 本地直发", () => {
            // 严格排除旧有静默降级代码
            expect(imageSource).not.toContain("Backend task submission fallback to direct client generation");
            expect(imageSource).not.toContain("await requestGeneration(snapshot.config");
            expect(imageSource).not.toContain("await requestEdit(snapshot.config");

            // 严格确保无有效 Task ID 时抛出异常进入标准失败/退款管线
            expect(imageSource).toContain('if (!backendTask?.id)');
            expect(imageSource).toContain('throw new Error("服务端生图任务建档失败，未返回有效任务 ID");');
        });

        it("默认创造页面与技能卡片任务在生成时通过 onSlotSettled 渐进落盘，防止中途退出丢图", () => {
            expect(imageSource).toContain("const currentImg = outcome.image;");
            expect(imageSource).toContain("saveLog(progressiveLog);");
            expect(imageSource).toContain("saveCurrentWorkspaceSnapshot(activeSessionId);");
        });
    });

    describe("规范三：在途批次部分出图时的占位卡片对账还原 (Progressive Settled & Pending In-Flight Restoration)", () => {
        it("当普通生图批次在途时，已完成图片展开为 success，剩余槽位展开为 pending 卡片，绝不提前吞食未完成卡槽", () => {
            const runningLog: GenerationLog = {
                id: "batch_test_15",
                batchId: "batch_test_15",
                prompt: "测试 Prompt",
                model: "flux-schnell",
                config: { count: "15" },
                imageCount: 15,
                taskIds: Array.from({ length: 15 }, (_, i) => `task_${i}`),
                status: "pending",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                images: [
                    { id: "img_0", dataUrl: "https://cdn.example.com/0.webp", durationMs: 2000, width: 1024, height: 1024, bytes: 50000, taskId: "task_0" },
                    { id: "img_1", dataUrl: "https://cdn.example.com/1.webp", durationMs: 2100, width: 1024, height: 1024, bytes: 50000, taskId: "task_1" },
                    { id: "img_2", dataUrl: "https://cdn.example.com/2.webp", durationMs: 2200, width: 1024, height: 1024, bytes: 50000, taskId: "task_2" },
                ],
                successCount: 3,
                failCount: 0,
            };

            const results = deriveGenerationResultsFromLog(runningLog, new Set(["batch_test_15"]));
            expect(results.length).toBe(15);
            expect(results[0]?.status).toBe("success");
            expect(results[1]?.status).toBe("success");
            expect(results[2]?.status).toBe("success");
            expect(results[3]?.status).toBe("pending");
        });

        it("当已完成历史批次存在部分失败时，全量展开所有失败卡槽且各自具备独立 slotIndex，绝不抹杀未完成项", () => {
            const finishedPartialLog: GenerationLog = {
                id: "batch_finished_partial_12",
                batchId: "batch_finished_partial_12",
                prompt: "电商测试 12 张",
                model: "flux-schnell",
                config: { count: "12" },
                imageCount: 5,
                taskIds: Array.from({ length: 5 }, (_, i) => `task_${i}`),
                status: "success",
                createdAt: Date.now() - 3600_000,
                updatedAt: Date.now() - 3600_000,
                images: Array.from({ length: 5 }, (_, i) => ({
                    id: `img_${i}`,
                    dataUrl: `https://cdn.example.com/${i}.webp`,
                    durationMs: 2000,
                    width: 1024,
                    height: 1024,
                    bytes: 50000,
                    taskId: `task_${i}`,
                })),
                successCount: 5,
                failCount: 7,
            };

            const results = deriveGenerationResultsFromLog(finishedPartialLog);
            expect(results.length).toBe(12);
            // 前 5 张成功卡槽
            for (let i = 0; i < 5; i++) {
                expect(results[i]?.status).toBe("success");
                expect(results[i]?.image).toBeDefined();
            }
            // 后 7 张失败卡槽，各自具有独立的 slotIndex 与重试入口
            for (let i = 5; i < 12; i++) {
                expect(results[i]?.status).toBe("failed");
                expect(results[i]?.slotIndex).toBe(i);
                expect(results[i]?.id).toBe(`batch_finished_partial_12_slot_${i}`);
                expect(results[i]?.error).toBeDefined();
            }
        });
    });

    describe("规范四：资金与微积分正向扣减与按失败比例退款契约 (Batch Credits Deduction & Proportional Refund)", () => {
        it("默认创造页面按 generationCount 正向扣减微积分，绝不按单张写死", () => {
            expect(imageSource).toContain("const singleCost = imageFeatureCredit.costMicrocredits;");
            expect(imageSource).toContain("const totalCharge = singleCost > 0 ? singleCost * generationCount : 0;");
            expect(imageSource).toContain("`生图工作台生成 (${generationCount}张)`");
        });

        it("任务结算时若存在失败卡槽，严格按失败比例退款，成功卡槽正常履约扣费", () => {
            expect(imageSource).toContain("if (failCount > 0 && chargedMicrocredits > 0)");
            expect(imageSource).toContain("const refundAmount = Math.round((chargedMicrocredits / generationCount) * failCount);");
            expect(imageSource).toContain('void imageFeatureCredit.refund(refundAmount, model, "生图失败卡槽退款"');
        });

        it("普通多图批次重试成功时执行增量合并（Incremental Merge），杜绝覆盖抹杀其他已成功图片", () => {
            expect(imageSource).toContain("const targetModel = targetBatchLog?.model || targetBatchLog?.config?.model || model;");
            expect(imageSource).toContain("const existsInLogs = prev.some((l) => l.id === targetBatchId || l.batchId === targetBatchId);");
            expect(imageSource).toContain("existingImages.some((img) => img.id === imgId)");
            expect(imageSource).toContain("curSuccess = nextImages.length");
        });
    });

    describe("规范五：生图工作台生成张数解耦单模型 maxOutputs 并发契约 (Effective Max Count & Popover Decoupling)", () => {
        it("生图工作台 effectiveMaxCount 恒定对齐 MAX_IMAGE_WORKBENCH_BATCH_COUNT (15)，决不受单模型 maxOutputs 限制锁死在 1", () => {
            expect(imageSource).toContain("const effectiveMaxCount = MAX_IMAGE_WORKBENCH_BATCH_COUNT;");
            expect(imageSource).not.toContain("Math.min(15, imageProfile.maxOutputs || 15)");
        });

        it("底部参数栏 CanvasImageSettingsPopover 显式传入 maxCount={MAX_IMAGE_WORKBENCH_BATCH_COUNT}", () => {
            expect(imageSource).toContain("maxCount={MAX_IMAGE_WORKBENCH_BATCH_COUNT}");
        });

        it("ImageSettingsPanel 在 caller 传入 maxCount 时优先使用 maxCount，支持工作台批次并发自由选择", () => {
            expect(settingsPanelSource).toContain("const effectiveMaxCount = maxCount !== undefined ? maxCount : profile.maxOutputs;");
            expect(settingsPanelSource).toContain("const count = Math.max(1, Math.min(effectiveMaxCount, Number(config.count) || 1));");
        });
    });
});
