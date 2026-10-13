import { useEffect, useRef } from "react";
import localforage from "localforage";
import { getActiveUserScope, USER_SCOPE_CHANGED_EVENT } from "@/lib/user-scope";
import { refreshGenerationTaskStatus, recoverGenerationTaskMedia, type GenerationTask } from "@/services/api/task-center";
import { parseBackendGenerationResult } from "@/services/api/generation-task";
import { resolveImageUrl } from "@/services/image-storage";
import { resolveResourceUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import { syncGenerationLogToRemote } from "@/services/user-data-sync";
import { useDetailSetStore } from "@/extensions/image-workbench-skills";
import type { GeneratedImage, GenerationLog } from "@/pages/image";

export interface ActiveWorkbenchTaskRegistration {
    type: "image" | "video";
    taskId: string;
    logId: string;
    batchId?: string;
    slotIndex?: number;
    planId?: string;
}

const imageLogStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_generation_logs" });
const videoLogStore = localforage.createInstance({ name: "infinite-canvas", storeName: "video_generation_logs" });

// 全局活跃任务注册表（跨路由/跨页面常驻内存）
const activeTaskRegistry = new Map<string, ActiveWorkbenchTaskRegistration>();
const terminalTaskIds = new Set<string>();

export function registerActiveWorkbenchTask(reg: ActiveWorkbenchTaskRegistration) {
    if (!reg.taskId) return;
    if (terminalTaskIds.has(reg.taskId)) return;
    activeTaskRegistry.set(reg.taskId, reg);
}

export function unregisterActiveWorkbenchTask(taskId: string) {
    activeTaskRegistry.delete(taskId);
    terminalTaskIds.add(taskId);
}

export function clearActiveWorkbenchTaskRegistry() {
    activeTaskRegistry.clear();
    terminalTaskIds.clear();
}

export function getActiveWorkbenchTaskCount(): number {
    return activeTaskRegistry.size;
}

export function deduplicateLogImages(images: GeneratedImage[], batchId?: string): GeneratedImage[] {
    const result: GeneratedImage[] = [];
    const seenSlots = new Set<number>();
    const seenStorageKeys = new Set<string>();
    const seenTaskIds = new Set<string>();

    for (const img of images) {
        if (batchId && img.id && img.id.includes("_slot_") && !img.id.startsWith(`${batchId}_slot_`)) continue;

        let slot: number | undefined;
        if (typeof (img as any).slotIndex === "number") {
            slot = (img as any).slotIndex;
        } else if (img.id && img.id.includes("_slot_")) {
            const m = img.id.match(/_slot_(\d+)/);
            if (m) slot = parseInt(m[1], 10);
        }

        if (slot !== undefined) {
            if (seenSlots.has(slot)) {
                const existingIdx = result.findIndex((r) => (r as any).slotIndex === slot || (batchId && r.id === `${batchId}_slot_${slot}`));
                if (existingIdx >= 0 && (img.storageKey || img.dataUrl)) {
                    const oldImg = result[existingIdx];
                    if (oldImg.storageKey) seenStorageKeys.delete(oldImg.storageKey);
                    if (oldImg.taskId) seenTaskIds.delete(oldImg.taskId);
                    if (img.storageKey) seenStorageKeys.add(img.storageKey);
                    if (img.taskId) seenTaskIds.add(img.taskId);
                    result[existingIdx] = img;
                }
                continue;
            }
            seenSlots.add(slot);
        }

        if (img.storageKey) {
            if (seenStorageKeys.has(img.storageKey)) continue;
            seenStorageKeys.add(img.storageKey);
        }
        if (img.taskId) {
            if (seenTaskIds.has(img.taskId)) continue;
            seenTaskIds.add(img.taskId);
        }
        result.push(img);
    }
    // 严格按 slotIndex 升序排序，无 slotIndex 的排在末尾，保证卡槽顺序恒定递增
    return result.sort((a, b) => {
        const slotA = typeof (a as any).slotIndex === "number" ? (a as any).slotIndex : (a.id && a.id.includes("_slot_") ? parseInt(a.id.match(/_slot_(\d+)/)?.[1] || "999", 10) : 999);
        const slotB = typeof (b as any).slotIndex === "number" ? (b as any).slotIndex : (b.id && b.id.includes("_slot_") ? parseInt(b.id.match(/_slot_(\d+)/)?.[1] || "999", 10) : 999);
        return slotA - slotB;
    });
}

function serializeVideoLog(log: any) {
    return {
        ...log,
        userId: log.userId || getActiveUserScope(),
        references: (log.references || []).map((item: any) => ({ ...item, dataUrl: item.storageKey ? "" : item.dataUrl })),
        videoReferences: (log.videoReferences || []).map((item: any) => ({ ...item, url: item.storageKey ? "" : item.url })),
        audioReferences: (log.audioReferences || []).map((item: any) => ({ ...item, url: item.storageKey ? "" : item.url })),
    };
}

function serializeImageLog(log: any) {
    const cleanedDetailSet = log.detailSet ? {
        ...log.detailSet,
        rows: log.detailSet.rows?.map((row: any) => ({
            ...row,
            imageUrl: row.storageKey ? "" : (row.imageUrl?.startsWith("data:") ? "" : row.imageUrl),
        })),
    } : undefined;
    return {
        ...log,
        userId: log.userId || getActiveUserScope(),
        references: (log.references || []).map((item: any) => ({ ...item, dataUrl: item.storageKey ? "" : item.dataUrl })),
        images: (log.images || []).map((image: any) => ({ ...image, dataUrl: image.storageKey ? "" : image.dataUrl })),
        thumbnails: [],
        detailSet: cleanedDetailSet,
    };
}

/**
 * 全站级任务守护服务 (Global Workbench Task Guardian)
 * 挂载于公共壳层 UserLayout，确保用户在生图/生视频发起大模型请求后，
 * 随意切换到画布、创作中心、资产库、任务列表或设置页面，均能保持后台自持守护、
 * 轮询对账、落库存储与实时广播回填。
 */
export function useGlobalWorkbenchTaskGuardian() {
    const isScanningRef = useRef(false);
    const hasInitialScannedRef = useRef(false);

    useEffect(() => {
        const scanPendingTasks = async () => {
            try {
                const scope = getActiveUserScope();
                // 扫描生图未决日志
                await imageLogStore.iterate<GenerationLog, void>((log) => {
                    if (log.userId && log.userId !== scope) return;
                    const hasPendingDetails = log.detailSet?.rows?.some(
                        (r) => r.status === "pending" || (!r.imageUrl && !r.storageKey && r.taskId && !terminalTaskIds.has(r.taskId))
                    );
                    const isPending = log.status === "pending" || hasPendingDetails;
                    if (isPending) {
                        if (log.detailSet?.rows) {
                            for (const row of log.detailSet.rows) {
                                if (row.taskId && !terminalTaskIds.has(row.taskId) && (!row.imageUrl && !row.storageKey)) {
                                    registerActiveWorkbenchTask({
                                        type: "image",
                                        taskId: row.taskId,
                                        logId: log.id,
                                        batchId: log.detailSet.planId || log.id,
                                        slotIndex: row.seq - 1,
                                        planId: log.detailSet.planId || log.id,
                                    });
                                }
                            }
                        } else if (log.taskIds?.length) {
                            for (let i = 0; i < log.taskIds.length; i++) {
                                const tid = log.taskIds[i];
                                if (tid && !terminalTaskIds.has(tid)) {
                                    registerActiveWorkbenchTask({
                                        type: "image",
                                        taskId: tid,
                                        logId: log.id,
                                        batchId: log.id,
                                        slotIndex: i,
                                    });
                                }
                            }
                        }
                    }
                });

                // 扫描生视频未决日志
                await videoLogStore.iterate<any, void>((log) => {
                    if (log.userId && log.userId !== scope) return;
                    const isPending = log.status === "pending";
                    if (isPending) {
                        if (log.task?.id && !terminalTaskIds.has(log.task.id)) {
                            registerActiveWorkbenchTask({
                                type: "video",
                                taskId: log.task.id,
                                logId: log.id,
                            });
                        }
                        if (log.runs?.length) {
                            for (const run of log.runs) {
                                if (run.task?.id && !terminalTaskIds.has(run.task.id)) {
                                    registerActiveWorkbenchTask({
                                        type: "video",
                                        taskId: run.task.id,
                                        logId: log.id,
                                    });
                                }
                            }
                        }
                    }
                });
            } catch (scanErr) {
                console.warn("[GlobalTaskGuardian] 初始化存储扫描异常:", scanErr);
            }
        };

        const runReconciliationSweep = async () => {
            if (isScanningRef.current) return;
            if (activeTaskRegistry.size === 0) return;

            isScanningRef.current = true;
            try {
                const candidates = Array.from(activeTaskRegistry.values());
                for (const item of candidates) {
                    try {
                        const taskInfo = await refreshGenerationTaskStatus(item.taskId);

                        if (taskInfo.status === "succeeded") {
                            unregisterActiveWorkbenchTask(item.taskId);

                            if (item.type === "image") {
                                const parsed = parseBackendGenerationResult(taskInfo);
                                let rawImg = parsed.images?.[0];
                                let storageKey = rawImg?.storageKey;
                                let dataUrl = rawImg?.dataUrl || "";

                                if (storageKey && !dataUrl) {
                                    dataUrl = (await resolveImageUrl(storageKey)) || "";
                                }

                                if (storageKey || dataUrl) {
                                    const outcomeImage: GeneratedImage = {
                                        id: item.batchId && typeof item.slotIndex === "number" ? `${item.batchId}_slot_${item.slotIndex}` : (storageKey ? resourceIdFromStorageKey(storageKey) || item.taskId : item.taskId),
                                        dataUrl,
                                        storageKey,
                                        taskId: item.taskId,
                                        durationMs: 0,
                                        width: rawImg?.width || 0,
                                        height: rawImg?.height || 0,
                                        bytes: rawImg?.bytes || 0,
                                        mimeType: rawImg?.mimeType,
                                    };

                                    // A. 异步回填本地持久化日志
                                    try {
                                        const storedLog = (await imageLogStore.getItem<GenerationLog>(item.logId)) ||
                                            (item.batchId ? await imageLogStore.getItem<GenerationLog>(item.batchId) : null);
                                        if (storedLog) {
                                            const existingImgs = storedLog.images || [];
                                            const nextImgs = deduplicateLogImages([...existingImgs, outcomeImage], storedLog.id);

                                            let updatedDetailSet = storedLog.detailSet;
                                            if (updatedDetailSet?.rows) {
                                                updatedDetailSet = {
                                                    ...updatedDetailSet,
                                                    rows: updatedDetailSet.rows.map((r) =>
                                                        (typeof item.slotIndex === "number" ? r.seq === item.slotIndex + 1 : r.taskId === item.taskId)
                                                            ? { ...r, imageUrl: dataUrl, storageKey, taskId: item.taskId, status: "success" as const, error: undefined }
                                                            : r
                                                    ),
                                                };
                                            }

                                            const curSuccess = updatedDetailSet?.rows
                                                ? updatedDetailSet.rows.filter((r) => Boolean(r.imageUrl || r.storageKey)).length
                                                : nextImgs.length;
                                            const totalCount = updatedDetailSet?.rows?.length || storedLog.taskIds?.length || nextImgs.length;
                                            const curFail = Math.max(0, totalCount - curSuccess);
                                            // @opc-feature: workbench_task_reconcile_self_heal [start]
                                            const nextTaskIds = Array.from(new Set([...(storedLog.taskIds || []), item.taskId]));
                                            // @opc-feature: workbench_task_reconcile_self_heal [end]

                                            const patchedLog: GenerationLog = {
                                                ...storedLog,
                                                taskIds: nextTaskIds,
                                                images: nextImgs,
                                                thumbnails: nextImgs.map((img) => img.dataUrl).filter(Boolean),
                                                detailSet: updatedDetailSet,
                                                successCount: curSuccess,
                                                failCount: curFail,
                                                status: curFail === 0 ? "success" : (curSuccess > 0 ? "success" : "failed"),
                                                error: curFail === 0 ? undefined : storedLog.error,
                                                updatedAt: Date.now(),
                                            };
                                            await imageLogStore.setItem(patchedLog.id, patchedLog);
                                            void syncGenerationLogToRemote(serializeImageLog(patchedLog), "image");
                                        }
                                    } catch (patchErr) {
                                        console.warn("[GlobalTaskGuardian] 图像日志回填失败:", patchErr);
                                    }

                                    // B. 回填电商套图 livePlan（若恰好处于相同 plan 视图）
                                    const livePlan = useDetailSetStore.getState().plan;
                                    if (livePlan && (livePlan.planId === item.batchId || livePlan.planId === item.planId)) {
                                        const targetRow = livePlan.rows.find((r) =>
                                            (typeof item.slotIndex === "number" ? r.seq === item.slotIndex + 1 : r.taskId === item.taskId)
                                        );
                                        if (targetRow) {
                                            useDetailSetStore.getState().applyRowResult(livePlan.planId, targetRow.seq, {
                                                imageUrl: dataUrl,
                                                storageKey,
                                                taskId: item.taskId,
                                                error: undefined,
                                            });
                                        }
                                    }

                                    // C. 触发全局总线事件广播
                                    window.dispatchEvent(new CustomEvent("workbench:task-settled", {
                                        detail: {
                                            type: "image",
                                            taskId: item.taskId,
                                            logId: item.logId,
                                            batchId: item.batchId,
                                            slotIndex: item.slotIndex,
                                            status: "succeeded",
                                            outcomeImage,
                                        },
                                    }));
                                }
                            } else if (item.type === "video") {
                                try {
                                    const parsed = parseBackendGenerationResult(taskInfo);
                                    let videoUrl = parsed.video?.dataUrl || "";
                                    const storageKey = parsed.video?.storageKey || "";
                                    if (storageKey && !videoUrl) {
                                        videoUrl = resolveResourceUrl(storageKey);
                                    }
                                    const storedLog = await videoLogStore.getItem<any>(item.logId);
                                    if (storedLog && (videoUrl || storageKey)) {
                                        const generatedVideo = {
                                            id: item.taskId,
                                            url: videoUrl,
                                            storageKey,
                                            durationMs: Date.now() - (storedLog.createdAt || Date.now()),
                                            width: parsed.video?.width || 1280,
                                            height: parsed.video?.height || 720,
                                            bytes: parsed.video?.bytes || 0,
                                            mimeType: parsed.video?.mimeType || "video/mp4",
                                        };
                                        const patchedLog = {
                                            ...storedLog,
                                            video: generatedVideo,
                                            status: "success",
                                            successCount: 1,
                                            failCount: 0,
                                            itemCount: 1,
                                            error: undefined,
                                            updatedAt: Date.now(),
                                        };
                                        await videoLogStore.setItem(patchedLog.id, patchedLog);
                                        void syncGenerationLogToRemote(serializeVideoLog(patchedLog), "video");
                                    }
                                } catch (patchErr) {
                                    console.warn("[GlobalTaskGuardian] 视频日志回填异常:", patchErr);
                                }
                                // 视频任务完成广播
                                window.dispatchEvent(new CustomEvent("workbench:task-settled", {
                                    detail: {
                                        type: "video",
                                        taskId: item.taskId,
                                        logId: item.logId,
                                        status: "succeeded",
                                    },
                                }));
                            }
                        } else if (taskInfo.status === "failed" || taskInfo.status === "cancelled") {
                            if (taskInfo.canRecoverMedia) {
                                try {
                                    await recoverGenerationTaskMedia(item.taskId);
                                } catch {}
                            } else {
                                unregisterActiveWorkbenchTask(item.taskId);
                                window.dispatchEvent(new CustomEvent("workbench:task-settled", {
                                    detail: {
                                        type: item.type,
                                        taskId: item.taskId,
                                        logId: item.logId,
                                        batchId: item.batchId,
                                        slotIndex: item.slotIndex,
                                        status: "failed",
                                        error: taskInfo.error,
                                    },
                                }));
                            }
                        }
                    } catch {
                        // 忽略单次网络抖动
                    }
                }
            } finally {
                isScanningRef.current = false;
            }
        };

        // 1. 初始化扫描持久化存储中的未决任务
        if (!hasInitialScannedRef.current) {
            hasInitialScannedRef.current = true;
            void scanPendingTasks();
        }

        // 2. 周期性后台对账巡检（空闲时 0 轮询 0 负载）
        const intervalId = window.setInterval(() => {
            void runReconciliationSweep();
        }, 4000);

        // 3. 标签页切回前台即时唤醒巡检
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                void runReconciliationSweep();
            }
        };

        // 4. 账号切换时清空旧用户活跃任务并重新扫描
        const handleScopeChanged = () => {
            clearActiveWorkbenchTaskRegistry();
            void scanPendingTasks();
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener(USER_SCOPE_CHANGED_EVENT, handleScopeChanged);

        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener(USER_SCOPE_CHANGED_EVENT, handleScopeChanged);
        };
    }, []);
}
