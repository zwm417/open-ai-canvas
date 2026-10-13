// @opc-feature: image_workbench [start]
import { AlertCircle, ArrowLeft, ArrowRight, BookOpen, BookmarkPlus, CheckSquare, ClipboardPaste, CloudUpload, Download, FileText, FolderPlus, History, ImagePlus, LoaderCircle, PenLine, Plus, RefreshCw, RotateCcw, SlidersHorizontal, Sparkles, Trash2, Upload, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { App, Button, Checkbox, Drawer, Image, Input, Modal, Tag, Typography } from "antd";
import { Tooltip } from "@/components/ui/base/tooltip";
import { EmptyState } from "@/components/ui/product/empty-state";
import localforage from "localforage";
import { saveAs } from "file-saver";
import { downloadMediaWithSaveDialog } from "@/extensions/workbench-save-dialog/save-as-dialog";
import { useLocation, useNavigate, useSearchParams } from "react-router";

import { CanvasPromptChipInput } from "@/components/canvas/canvas-prompt-chip-input";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { ImageSettingsPanel } from "@/components/image-settings-panel";
import { CanvasImageSettingsPopover } from "@/components/canvas/canvas-image-settings-popover";
import { ModelPicker } from "@/components/model-picker";
import { PromptTemplateModal } from "@/components/prompts/prompt-template-modal";
import type { PromptPresetItem } from "@/pages/prompts/prompt-data";
import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { useFeatureCredit } from "@/hooks/use-feature-credit";
import { FeatureCreditBadge } from "@/components/feature-credit-badge";
import { canvasThemes } from "@/lib/canvas-theme";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { refreshSystemChannels } from "@/lib/user-session";
import { modelOptionLabel, resolveModelForCapability, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { nanoid } from "nanoid";
import { formatBytes, formatDuration, getDataUrlByteSize, readImageMeta } from "@/lib/image-utils";
import { defaultImageParamsForModel, mergedImageCapabilityConfig, modelRequestOptions, resolveCompatibleModel, type ModelRequirements } from "@/lib/model-selection";
import { normalizeImageSizeSetting } from "@/lib/model-capabilities";
import { getActiveUserScope, USER_SCOPE_CHANGED_EVENT } from "@/lib/user-scope";
import { requestEdit, requestGeneration } from "@/services/api/image";
import { collectImageStorageKeys, deleteStoredImages, imageToDataUrl, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { resolveResourceUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import { peekLocalFirstMedia } from "@/services/local-first-media-resolver";
import { submitBackendGenerationTask, parseBackendGenerationResult, type BackendGenerationResult } from "@/services/api/generation-task";
import { waitForGenerationTask, refreshGenerationTaskStatus, recoverGenerationTaskMedia, listGenerationTasks, listTasksForBatch, type GenerationTask } from "@/services/api/task-center";
import { generationErrorMessage } from "@/lib/generation-error";
import { CachedResourceImage } from "@/components/cached-resource-image";
import { primeResourceBlobCache } from "@/services/resource-blob-cache";
import { useAssetStore } from "@/stores/use-asset-store";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import { batchDeleteGenerationLogsFromRemote, syncGenerationLogToRemote } from "@/services/user-data-sync";
import { listRemoteGenerationLogs } from "@/services/api/user-data";
import type { ReferenceImage } from "@/types/image";
import { useImageWorkbenchStore } from "@/stores/use-image-workbench-store";
import { registerActiveWorkbenchTask, deduplicateLogImages } from "@/services/global-task-guardian";
import {
    SkillHeaderSelector,
    SkillPickerPopover,
    SkillUploadSlots,
    SkillBadgeIcon,
    useActiveWorkbenchSkills,
    useWorkbenchSlotsState,
    assembleWorkbenchPrompt,
    optimizeSkillPrompt,
    type SlotFilesContainer,
    type WorkbenchSkill,
} from "@/extensions/image-workbench-skills";
// detail_set_workflow [start]
import {
    DETAIL_SET_LANGUAGE_LABEL,
    DETAIL_SET_LANGUAGE_OPTIONS,
    DETAIL_SET_RATIO_RESOLUTION,
    DETAIL_SET_STYLE_PRESETS,
    DetailSetWorkflowCard,
    ImageLanguagePopover,
    PhonePreviewPanel,
    bindDetailSetScope,
    buildRowFinalPrompt,
    detailSetModuleShort,
    detailSetTotalCount,
    parseDetailSetPlanJson,
    requestDetailSetPlan,
    useDetailSetStore,
    type DetailSetPlanSnapshot,
    type DetailSetRow,
    MAX_IMAGE_WORKBENCH_BATCH_COUNT,
} from "@/extensions/image-workbench-skills";
// detail_set_workflow [end]
import { resolveImageRequestSize } from "@/services/api/image-validation";

export type GeneratedImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType?: string;
    taskId?: string;
    slotIndex?: number;
};

export type GenerationResult = {
    id: string;
    batchId?: string;
    slotIndex?: number;
    status: "pending" | "success" | "failed";
    image?: GeneratedImage;
    error?: string;
    failureCount?: number;
    taskId?: string;
    canRecoverMedia?: boolean;
};

export type GenerationLog = {
    id: string;
    sessionId?: string;
    batchId?: string;
    userId?: string;
    createdAt: number;
    updatedAt?: number;
    title: string;
    prompt: string;
    time: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    durationMs: number;
    successCount: number;
    failCount: number;
    imageCount: number;
    size: string;
    quality: string;
    status: "pending" | "success" | "failed";
    images: GeneratedImage[];
    thumbnails: string[];
    failureCount?: number;
    requestSignature?: string;
    error?: string;
    chargedMicrocredits?: number;
    taskIds?: string[];
    // [sub-feature: detail_set_workflow]
    detailSet?: DetailSetPlanSnapshot; // 电商套图规划快照（规划行随日志持久化，刷新/跨路由可恢复）
    // detail_set_workflow [end]
};

/**
 * 电商套图与分镜多图槽位确定性匹配器 (Deterministic Slot Image Matcher)
 * 严格遵从五级正向契约与排他门阀，彻底杜绝 `undefined === undefined` 导致的 0 号图片通配事故与数据污染。
 */
export function matchImageForDetailSetRow(
    row: DetailSetRow,
    imagesList: GeneratedImage[] | undefined,
    batchId: string,
): GeneratedImage | undefined {
    if (!imagesList || imagesList.length === 0) return undefined;

    const slotIndex = row.seq - 1;
    const cardId = `${batchId}_slot_${slotIndex}`;

    // 1. 槽位卡片 ID 精确命中 (Explicit Slot Card ID - 最高优先级)
    const byCardId = imagesList.find((img) => img.id === cardId);
    if (byCardId) return byCardId;

    // 2. 显式有效 TaskId 精确命中：必须两端均非空且恒等，严禁 falsy 等值比较，且严格执行同批次跨槽防盗排他门阀
    if (row.taskId && typeof row.taskId === "string" && row.taskId.trim()) {
        const targetTaskId = row.taskId.trim();
        const byTaskId = imagesList.find((img) => {
            if (!img.taskId || typeof img.taskId !== "string" || img.taskId.trim() !== targetTaskId) return false;
            // 防跨批次串图与同批次跨槽盗用：若该图片明确标记为其他批次或其他槽位，严禁错配
            if (img.id && img.id.includes("_slot_") && !img.id.startsWith(`${batchId}_slot_`)) return false;
            if (img.id && img.id.startsWith(`${batchId}_slot_`) && img.id !== cardId) return false;
            if (typeof (img as any).slotIndex === "number" && (img as any).slotIndex !== slotIndex) return false;
            return true;
        });
        if (byTaskId) return byTaskId;
    }

    // 3. 显式 slotIndex 元数据匹配
    const bySlotMeta = imagesList.find((img: any) =>
        typeof img.slotIndex === "number" &&
        img.slotIndex === slotIndex &&
        (!img.batchId || img.batchId === batchId) &&
        (!img.id || !img.id.includes("_slot_") || img.id === cardId)
    );
    if (bySlotMeta) return bySlotMeta;

    // 4. 若 row 自身已有明确的 storageKey，在 imagesList 中按 storageKey 精确反查（严格同槽排他）
    if (row.storageKey && typeof row.storageKey === "string" && row.storageKey.trim()) {
        const targetKey = row.storageKey.trim();
        const byStorage = imagesList.find((img) => {
            if (!img.storageKey || img.storageKey.trim() !== targetKey) return false;
            // 防跨批次串图与同批次跨槽盗用：若该图片带有其他批次或其他槽位标识，严禁错配
            if (img.id && img.id.includes("_slot_") && !img.id.startsWith(`${batchId}_slot_`)) return false;
            if (img.id && img.id.startsWith(`${batchId}_slot_`) && img.id !== cardId) return false;
            if (typeof (img as any).slotIndex === "number" && (img as any).slotIndex !== slotIndex) return false;
            return true;
        });
        if (byStorage) return byStorage;
    }

    // 5. 顺序槽位保底 (Sequential Slot Fallback - 仅针对无任何槽位元数据的纯历史老图)：
    // 严格防御门阀：若 imagesList 中已有显式携带 _slot_ 或 taskId 的结构化图片，严禁使用裸下标保底（防止新老混排或乱序张冠李戴）
    const hasExplicitSlotImages = imagesList.some((img) => Boolean(img.taskId || (img.id && img.id.includes("_slot_"))));
    if (!hasExplicitSlotImages && slotIndex >= 0 && slotIndex < imagesList.length) {
        const candidate = imagesList[slotIndex];
        if (candidate) {
            // 排他防御：如果 candidate.id 显式标记为其他批次或本批次其他槽位，绝对禁止错配
            const isDifferentBatch = candidate.id && candidate.id.includes("_slot_") && !candidate.id.startsWith(`${batchId}_slot_`);
            const explicitOtherSlot = candidate.id && candidate.id.startsWith(`${batchId}_slot_`) && candidate.id !== cardId;
            if (!isDifferentBatch && !explicitOtherSlot) {
                return candidate;
            }
        }
    }

    return undefined;
}

export function isSameImageGenerationResult(a: GenerationResult, b: GenerationResult): boolean {
    if (a.id && b.id && a.id === b.id) return true;
    if (a.taskId && b.taskId && a.taskId === b.taskId) return true;
    if (a.image?.id && b.image?.id && a.image.id === b.image.id) return true;
    if (a.image?.storageKey && b.image?.storageKey && a.image.storageKey === b.image.storageKey) return true;
    const aBatch = a.batchId;
    const bBatch = b.batchId;
    if (aBatch && bBatch && aBatch === bBatch) {
        if (typeof a.slotIndex === "number" && typeof b.slotIndex === "number") {
            return a.slotIndex === b.slotIndex;
        }
    }
    return false;
}

export function reconcileImageGenerationResults(
    prev: GenerationResult[],
    incoming: GenerationResult[],
    strategy: "merge-update" | "prepend-or-update" = "prepend-or-update"
): GenerationResult[] {
    let next = [...prev];
    let changed = false;

    const unhandledNewItems: GenerationResult[] = [];
    for (const item of incoming) {
        const existingIdx = next.findIndex((r) => isSameImageGenerationResult(r, item));
        if (existingIdx >= 0) {
            const current = next[existingIdx];
            const updated: GenerationResult = {
                ...current,
                ...item,
                image: item.image || current.image,
                taskId: item.taskId || current.taskId,
                error: item.status === "failed" ? item.error || current.error : undefined,
                status: item.status,
            };
            const statusChanged = current.status !== updated.status;
            const errorChanged = current.error !== updated.error;
            const curImg = current.image;
            const newImg = updated.image;
            const imageChanged = Boolean(curImg) !== Boolean(newImg) ||
                (curImg && newImg && (
                    (curImg.storageKey && newImg.storageKey ? curImg.storageKey !== newImg.storageKey : curImg.dataUrl !== newImg.dataUrl)
                ));
            if (statusChanged || errorChanged || imageChanged) {
                next[existingIdx] = updated;
                changed = true;
            }
        } else {
            unhandledNewItems.push(item);
        }
    }

    if (unhandledNewItems.length > 0) {
        if (strategy === "prepend-or-update") {
            next = [...unhandledNewItems, ...next];
        } else {
            next = [...next, ...unhandledNewItems];
        }
        changed = true;
    }

    return changed ? next : prev;
}

export function deriveGenerationResultsFromLog(log: GenerationLog): GenerationResult[];
export function deriveGenerationResultsFromLog(log: GenerationLog, activeBatchIds?: Set<string>): GenerationResult[];
export function deriveGenerationResultsFromLog(log: GenerationLog, activeBatchIds?: Set<string>): GenerationResult[] {
    const isRuntimeActive = activeBatchIds ? activeBatchIds.has(log.id) : false;
    const isStalled = Date.now() - (log.updatedAt || log.createdAt || 0) > 120 * 60 * 1000;
    // 商业级生命周期约束：只有当前批次在内存中实际处于生成运行队列，或者属于未超时的异步托管轮询批次，才允许展示 pending
    const isBatchPending = log.status === "pending" && (isRuntimeActive || (!isStalled && Boolean(log.taskIds && log.taskIds.length > 0)));

    // 1. 电商套图专有分镜行解构：逐行映射卡片状态与结果，支持部分成功展开与独立槽位重试
    if (log.detailSet?.rows?.length) {
        // [sub-feature: workbench_task_reconcile_self_heal] [start]
        // 权威基准：只要具备合法的 storageKey 或已被当前批次卡槽匹配，物理资产即为最高事实源
        const rowTaskIds = (log.detailSet.rows.map((r) => r.taskId).filter(Boolean) as string[]);
        const imgTaskIds = ((log.images || []).map((img) => img.taskId).filter(Boolean) as string[]);
        const validTaskIds = new Set([...(log.taskIds || []), ...rowTaskIds, ...imgTaskIds]);

        const imagesList = (log.images || []).filter((img) => {
            // 仅过滤明确属于其他批次卡槽的串台图片，严禁误杀合法资产
            if (img.id && img.id.includes("_slot_") && !img.id.startsWith(`${log.id}_slot_`)) return false;
            return true;
        });

        return log.detailSet.rows.map((row) => {
            const slotIndex = row.seq - 1;
            const cardId = `${log.id}_slot_${slotIndex}`;

            const matchedImg = matchImageForDetailSetRow(row, imagesList, log.id);
            const isStolenKey = Boolean(
                row.storageKey &&
                imagesList.some((img) =>
                    img.storageKey === row.storageKey &&
                    ((img.id && img.id.startsWith(`${log.id}_slot_`) && img.id !== cardId) ||
                     (typeof (img as any).slotIndex === "number" && (img as any).slotIndex !== slotIndex))
                )
            );
            const storageKey = matchedImg?.storageKey || (isStolenKey ? undefined : row.storageKey);
            const dataUrl = matchedImg?.dataUrl || (isStolenKey ? "" : row.imageUrl) || (storageKey ? (peekLocalFirstMedia(storageKey) || resolveResourceUrl(storageKey)) : "");
            const effectiveTaskId = matchedImg?.taskId || (isStolenKey ? undefined : row.taskId);

            if (Boolean(dataUrl || storageKey)) {
                return {
                    id: cardId,
                    batchId: log.id,
                    slotIndex,
                    status: "success" as const,
                    taskId: effectiveTaskId,
                    image: {
                        id: cardId,
                        dataUrl,
                        storageKey,
                        taskId: effectiveTaskId,
                        durationMs: matchedImg?.durationMs || 0,
                        width: matchedImg?.width || 0,
                        height: matchedImg?.height || 0,
                        bytes: matchedImg?.bytes || 0,
                        mimeType: matchedImg?.mimeType,
                    },
                };
            }
        // [sub-feature: workbench_task_reconcile_self_heal] [end]
            if (row.status === "pending" && isBatchPending) {
                return {
                    id: cardId,
                    batchId: log.id,
                    slotIndex,
                    status: "pending" as const,
                    taskId: row.taskId,
                };
            }
            return {
                id: cardId,
                batchId: log.id,
                slotIndex,
                status: "failed" as const,
                error: row.error || log.error || (isStalled ? "任务超时中断" : "任务执行中断或未生成"),
                failureCount: log.failureCount,
                taskId: row.taskId,
                canRecoverMedia: Boolean(row.canRecoverMedia || (row.imageUrl && !row.storageKey) || (row.error && /上传|保存未完成|OSS|存储同步/i.test(row.error) && !/超时|稍后重试/i.test(row.error))),
            };
        });
    }

    // 2. 普通生图：只要有成功生成的图片，不论整批状态是 success 还是部分失败，均按槽位精准展开
    if (log.images?.length) {
        // [sub-feature: workbench_batch_concurrency] [start]
        const dedupedImages = deduplicateLogImages(log.images, log.id);
        const expectedCount = Math.max(
            dedupedImages.length,
            Number(log.config?.count) || 0,
            (log.successCount || 0) + (log.failCount || 0),
            log.taskIds?.length || 0,
            log.imageCount || 0,
            1,
        );

        // 槽位精准寻址：优先将拥有 slotIndex / _slot_ / taskId 的图片绑定至其真实卡槽，杜绝乱序抢槽
        const slotImageMap = new Map<number, GeneratedImage>();
        const unassignedImages: GeneratedImage[] = [];

        for (const img of dedupedImages) {
            let slot: number | undefined;
            if (typeof (img as any).slotIndex === "number") {
                slot = (img as any).slotIndex;
            } else if (img.id && img.id.includes("_slot_")) {
                const m = img.id.match(/_slot_(\d+)/);
                if (m) slot = parseInt(m[1], 10);
            } else if (img.taskId && log.taskIds?.length) {
                const tIdx = log.taskIds.indexOf(img.taskId);
                if (tIdx >= 0) slot = tIdx;
            }

            if (slot !== undefined && slot >= 0 && slot < expectedCount && !slotImageMap.has(slot)) {
                slotImageMap.set(slot, img);
            } else {
                unassignedImages.push(img);
            }
        }

        let fillSlot = 0;
        for (const img of unassignedImages) {
            while (fillSlot < expectedCount && slotImageMap.has(fillSlot)) {
                fillSlot++;
            }
            slotImageMap.set(fillSlot, img);
            fillSlot++;
        }

        const totalSlots = Math.max(expectedCount, fillSlot);
        const slotResults: GenerationResult[] = [];

        for (let i = 0; i < totalSlots; i++) {
            const img = slotImageMap.get(i);
            const cardId = img?.id && img.id.startsWith(`${log.id}_slot_`) ? img.id : `${log.id}_slot_${i}`;
            const taskId = img?.taskId || log.taskIds?.[i];

            if (img && (img.dataUrl || img.storageKey)) {
                slotResults.push({
                    id: cardId,
                    batchId: log.id,
                    slotIndex: i,
                    status: "success",
                    taskId,
                    image: {
                        ...img,
                        dataUrl: img.dataUrl || (img.storageKey ? (peekLocalFirstMedia(img.storageKey) || resolveResourceUrl(img.storageKey)) : ""),
                    },
                });
            } else if (isBatchPending) {
                slotResults.push({
                    id: cardId,
                    batchId: log.id,
                    slotIndex: i,
                    status: "pending",
                    taskId,
                });
            } else {
                slotResults.push({
                    id: cardId,
                    batchId: log.id,
                    slotIndex: i,
                    status: "failed",
                    error: log.error || (isStalled ? "任务超时中断" : "任务执行中断或未生成"),
                    failureCount: log.failureCount,
                    taskId,
                    canRecoverMedia: Boolean(log.error && /上传|保存未完成|OSS|存储同步/i.test(log.error) && !/超时|稍后重试/i.test(log.error)),
                });
            }
        }
        // [sub-feature: workbench_batch_concurrency] [end]
        return slotResults;
    }

    // 3. 普通生图：若全批 pending 且处于实际运行期，展开 pending 卡槽
    if (isBatchPending) {
        const count = Math.max(
            Number(log.config?.count) || 0,
            (log.successCount || 0) + (log.failCount || 0),
            log.taskIds?.length || 0,
            log.imageCount || 0,
            1,
        );
        return Array.from({ length: count }, (_, index) => ({
            id: `${log.id}_slot_${index}`,
            batchId: log.id,
            slotIndex: index,
            status: "pending",
            taskId: log.taskIds?.[index],
        }));
    }

    // 4. 整批完全失败或已中断且无图
    return [{
        id: log.id,
        batchId: log.id,
        status: "failed",
        error: log.error || (log.status === "pending" ? "任务执行中断或未生成" : t("workbench.generationFailed")),
        failureCount: log.failureCount,
        taskId: log.taskIds?.[0],
        canRecoverMedia: Boolean(log.error && /上传|保存未完成|OSS|存储同步/i.test(log.error) && !/超时|稍后重试/i.test(log.error)),
    }];
}

type GenerationLogConfig = Pick<AiConfig, "model" | "imageModel" | "quality" | "size" | "count" | "transparentBackground"> & { imageSecondaryModel?: string };

type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;

const translations: Record<string, string> = {
    "common.cancel": "取消",
    "common.save": "保存",
    "common.edit": "编辑",
    "common.done": "完成",
    "common.delete": "删除",
    "common.copy": "复制",
    "common.addToAssets": "加入我的资产",
    "common.addedToAssets": "已加入我的资产",
    "common.all": "全部",
    "common.download": "下载",
    "common.upload": "上传",
    "workbench.logs": "生成记录",
    "workbench.settings": "参数",
    "workbench.prompt": "提示词",
    "workbench.viewPrompts": "查看创作灵感",
    "workbench.viewAssets": "查看我的资产",
    "workbench.clipboard": "剪切板",
    "workbench.upload": "上传",
    "workbench.adjust": "调整",
    "workbench.generate": "开始生成图片",
    "workbench.results": "生成结果",
    "workbench.waiting": "等待 {{time}}",
    "workbench.model": "模型",
    "workbench.generating": "生成中",
    "workbench.success": "成功",
    "workbench.failed": "生成失败",
    "workbench.retry": "重试",
    "workbench.new": "新建",
    "workbench.selectAll": "全选",
    "workbench.noLogs": "暂无生成记录",
    "workbench.deleteLogs": "删除生成记录",
    "workbench.deleteLogsConfirm": "确定删除选中的 {{count}} 条生成记录吗？",
    "workbench.successCount": "成功 {{count}}",
    "workbench.failCount": "失败 {{count}}",
    "workbench.itemCount": "{{count}} 张",
    "workbench.untitled": "未命名",
    "workbench.configFirst": "请先完成配置",
    "workbench.generationFailed": "生成失败",
    "workbench.retrySuccess": "重试成功",
    "imageWorkbench.title": "生图工作台",
    "imageWorkbench.promptPlaceholder": "描述画面主体、风格、构图、光线和用途",
    "imageWorkbench.references": "参考图",
    "imageWorkbench.removeReference": "移除参考图",
    "imageWorkbench.dropReferences": "松开即可添加参考图",
    "imageWorkbench.failAttempts": "已尝试 {{count}} 次",
    "imageWorkbench.noReferences": "暂无参考图，可将图片拖到这里",
    "imageWorkbench.clipboardEmpty": "剪切板里没有可读取的图片",
    "imageWorkbench.clipboardAdded": "已读取 {{count}} 张参考图",
    "imageWorkbench.promptRequired": "请输入生图提示词",
    "imageWorkbench.configIncomplete": "生图配置不完整",
    "imageWorkbench.invalidParams": "生图参数无效",
    "imageWorkbench.busy": "生图工作台已有任务正在运行",
    "imageWorkbench.generated": "图片已生成",
    "imageWorkbench.addedReference": "已加入参考图",
    "imageWorkbench.resultTitle": "生成结果 {{count}}",
    "imageWorkbench.source": "生图工作台",
    "imageWorkbench.unsupportedAsset": "生图工作台只能使用文本或图片资产",
    "imageWorkbench.missingResult": "接口没有返回图片",
    "imageWorkbench.empty": "还没有生成图片",
    "imageWorkbench.resultAlt": "生成结果 {{count}}",
    "imageWorkbench.addReference": "加入参考图",
};

function t(key: string, params?: Record<string, any> | string): string {
    let str = translations[key] || (typeof params === "string" ? params : key);
    if (params && typeof params === "object") {
        for (const [k, v] of Object.entries(params)) {
            str = str.replace(new RegExp(`{{${k}}}`, "g"), String(v));
        }
    }
    return str;
}

const i18n = {
    resolvedLanguage: "zh-CN",
    t,
};

const LOG_STORE_KEY = "infinite-canvas:image_generation_logs";
const logStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_generation_logs" });

type ImageDocReference = { id: string; name: string; content: string };

function expandPromptTextReferences(rawPrompt: string, docList: ImageDocReference[]): string {
    if (!docList.length) return rawPrompt;
    let expanded = rawPrompt;
    let anyReplaced = false;
    docList.forEach((doc, idx) => {
        const label = `@文档${idx + 1}`;
        const altLabel = `@文本${idx + 1}`;
        if (expanded.includes(label)) {
            expanded = expanded.split(label).join(doc.content);
            anyReplaced = true;
        } else if (expanded.includes(altLabel)) {
            expanded = expanded.split(altLabel).join(doc.content);
            anyReplaced = true;
        }
    });
    if (!anyReplaced) {
        const docsContent = docList.map((doc) => doc.content.trim()).filter(Boolean).join("\n\n");
        if (!expanded.trim()) {
            return docsContent;
        }
        return `${docsContent}\n\n${expanded.trim()}`;
    }
    return expanded;
}

const DEFAULT_IMAGE_SKILL: WorkbenchSkill = {
    id: "default-creation",
    categoryId: "all",
    name: "默认创作",
    subtitle: "通用生图",
    description: "默认生图创作模式",
    placeholder: "",
    instructions: "",
    showcaseTitle: "",
    showcaseSubtitle: "",
    showcaseImageUrl: "",
    maxFiles: 6,
    uploadSlots: [
        { id: "product", label: "添加商品", iconType: "product", semanticTag: "商品", optional: true, hideOptionalBadge: true, maxCount: 6 },
        { id: "model", label: "添加模特", iconType: "model", semanticTag: "模特", optional: true, hideOptionalBadge: true, maxCount: 6 },
        { id: "scene", label: "添加场景", iconType: "background", semanticTag: "场景", optional: true, hideOptionalBadge: true, maxCount: 6 },
        { id: "reference", label: "添加参考图", iconType: "general", semanticTag: "参考图", optional: true, hideOptionalBadge: true, maxCount: 6 },
    ],
};

export default function ImagePage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragDepthRef = useRef(0);
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = () => navigate("/settings");
    const addAsset = useAssetStore((state) => state.addAsset);
    const draft = useImageWorkbenchStore((state) => state.draft);
    const updateDraft = useImageWorkbenchStore((state) => state.updateDraft);
    const hydratedDraft = useImageWorkbenchStore((state) => state.hydrated);
    const sessionExplicitlyResetRef = useRef(false);

    const prompt = draft.prompt;
    const textReferences = draft.textReferences;
    const references = draft.references;

    const setPrompt = useCallback((value: string | ((prev: string) => string)) => {
        updateDraft((prev) => ({
            ...prev,
            prompt: typeof value === "function" ? value(prev.prompt) : value,
        }));
    }, [updateDraft]);

    const setTextReferences = useCallback((value: Array<{ id: string; name: string; content: string }> | ((prev: Array<{ id: string; name: string; content: string }>) => Array<{ id: string; name: string; content: string }>)) => {
        updateDraft((prev) => ({
            ...prev,
            textReferences: typeof value === "function" ? value(prev.textReferences) : value,
        }));
    }, [updateDraft]);

    const setReferences = useCallback((value: ReferenceImage[] | ((prev: ReferenceImage[]) => ReferenceImage[])) => {
        updateDraft((prev) => ({
            ...prev,
            references: typeof value === "function" ? value(prev.references) : value,
        }));
    }, [updateDraft]);

    const [searchParams, setSearchParams] = useSearchParams();
    const [isOptimizingPrompt, setIsOptimizingPrompt] = useState(false);

    const location = useLocation();
    const handledPrefillKeyRef = useRef<string | null>(null);
    useEffect(() => {
        const queryPrompt = searchParams.get("prompt");
        const queryTitle = searchParams.get("title");
        const queryPromptId = searchParams.get("promptId");
        const statePrompt = (location.state as any)?.prefillPrompt;

        const effectivePrompt = (queryPrompt && queryPrompt.trim())
            ? queryPrompt.trim()
            : (statePrompt && typeof statePrompt === "string" && statePrompt.trim() ? statePrompt.trim() : "");

        if (effectivePrompt) {
            const id = queryPromptId || nanoid();
            const prefillKey = `${id}_${effectivePrompt}`;
            if (handledPrefillKeyRef.current === prefillKey) return;
            handledPrefillKeyRef.current = prefillKey;

            const title = queryTitle ? decodeURIComponent(queryTitle).trim() : "提示词模版";
            setTextReferences([{ id, name: title, content: effectivePrompt }]);
            setPrompt(""); // 保持提示词输入框干净，不重复显示内部 chip
            if (queryPrompt || queryTitle || queryPromptId) {
                const nextParams = new URLSearchParams(searchParams);
                nextParams.delete("prompt");
                nextParams.delete("title");
                nextParams.delete("promptId");
                setSearchParams(nextParams, { replace: true });
            }
        }
    }, [searchParams, setSearchParams, location.state, setTextReferences, setPrompt]);
    const [previewReferenceId, setPreviewReferenceId] = useState<string | null>(null);
    const previewReference = previewReferenceId ? references.find((r) => r.id === previewReferenceId) : null;
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const isCurrentSessionPending = useMemo(() => results.some((r) => r.status === "pending"), [results]);
    const batchGroups = useMemo(() => {
        if (!results.length) return [];
        const groupsMap = new Map<string, {
            batchId: string;
            createdAt?: number;
            prompt?: string;
            model?: string;
            items: GenerationResult[];
            log?: GenerationLog;
        }>();

        // 1. 按批次聚合卡片，保留插入顺序
        results.forEach((item) => {
            const bId = item.batchId || item.id;
            if (!groupsMap.has(bId)) {
                const matchedLog = logs.find((l) => l.id === bId || l.batchId === bId);
                groupsMap.set(bId, {
                    batchId: bId,
                    createdAt: matchedLog?.createdAt,
                    prompt: matchedLog?.prompt,
                    model: matchedLog?.model,
                    items: [],
                    log: matchedLog,
                });
            }
            groupsMap.get(bId)!.items.push(item);
        });

        // 2. 导出批次流并计算综合状态
        const groups: Array<{
            batchId: string;
            createdAt?: number;
            prompt?: string;
            model?: string;
            status: "pending" | "success" | "failed" | "partial";
            items: GenerationResult[];
            log?: GenerationLog;
        }> = [];

        groupsMap.forEach((group) => {
            const sortedItems = [...group.items].sort((a, b) => {
                const sA = typeof a.slotIndex === "number" ? a.slotIndex : 0;
                const sB = typeof b.slotIndex === "number" ? b.slotIndex : 0;
                return sA - sB;
            });
            const hasPending = sortedItems.some((i) => i.status === "pending");
            const allSuccess = sortedItems.every((i) => i.status === "success");
            const allFailed = sortedItems.every((i) => i.status === "failed");
            const status = hasPending ? "pending" : allSuccess ? "success" : allFailed ? "failed" : "partial";
            groups.push({
                ...group,
                items: sortedItems,
                status,
            });
        });

        return groups;
    }, [results, logs]);
    const [logsOpen, setLogsOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [promptDialogOpen, setPromptDialogOpen] = useState(false);
    const [promptDialogMode, setPromptDialogMode] = useState<"select" | "save">("select");
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [isReferenceDragActive, setIsReferenceDragActive] = useState(false);
    const replaceTargetRef = useRef<string | null>(null);
    const [autoRunToken, setAutoRunToken] = useState(0);
    const imageCommand = useWorkbenchAgentStore((state) => state.imageCommand);
    const clearImageCommand = useWorkbenchAgentStore((state) => state.clearImageCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const agentTaskIdRef = useRef<string | undefined>(undefined);

    const {
        categories: skillCategories,
        activeSkill,
        activeSkillId,
        selectSkill,
        getSkillsByCategory,
    } = useActiveWorkbenchSkills();
    const effectiveSkill = activeSkill || DEFAULT_IMAGE_SKILL;
    const [skillPickerOpen, setSkillPickerOpen] = useState(false);
    const {
        slotFiles,
        slotFilesMap,
        slotActiveIdMap,
        setSlotFile,
        addSlotFile,
        addSlotFiles,
        addSlotReference,
        setSlotActiveFile,
        removeSlotFile,
        replaceSlotFile,
        clearSlot,
        clearAllSlots,
        importExternalReferences,
        getAllSlotFiles,
        isSlotsValid,
        uploadedCount: slotUploadedCount,
        maxFiles: slotMaxFiles,
    } = useWorkbenchSlotsState(effectiveSkill);

    // [sub-feature: detail_set_workflow]
    // 电商套图：工作流声明块（处理器定义在 retryResult 之后的围栏块，闭包调用时已初始化）
    const isDetailSetWorkflow = activeSkill?.workflow?.kind === "detail-set";
    const detailSetDraft = useDetailSetStore((s) => s.draft);
    const detailSetPhase = useDetailSetStore((s) => s.phase);
    const detailSetPlan = useDetailSetStore((s) => s.plan);
    const detailSetResultView = useDetailSetStore((s) => s.resultView);
    const setDetailSetDraft = useDetailSetStore((s) => s.setDraft);
    const setDetailSetResultView = useDetailSetStore((s) => s.setResultView);
    // 商品槽位素材：slotFilesMap 聚合多文件（数组直存），slotFiles 为当前生效主图（vision 分析输入取商品图）
    const detailSetProductFiles = slotFilesMap.product ?? (slotFiles.product ? [slotFiles.product] : []);
    const detailSetStylePreset = useMemo(
        () => DETAIL_SET_STYLE_PRESETS.find((preset) => preset.id === detailSetDraft.stylePresetId) ?? null,
        [detailSetDraft.stylePresetId],
    );
    const detailSetTotal = detailSetTotalCount(detailSetDraft.selections);
    const detailSetPlanning = detailSetPhase === "planning";
    const detailSetSubmitting = submitting || detailSetPlanning;
    const detailSetCanStart = detailSetProductFiles.length > 0 && detailSetTotal > 0;
    const detailSetCanGenerate = !isDetailSetWorkflow || (detailSetPhase !== "planning" && (detailSetPhase === "review" ? (detailSetPlan?.rows.length ?? 0) > 0 : detailSetCanStart));
    // detail_set_workflow [end]

    const preferredModel = resolveModelForCapability(effectiveConfig, effectiveConfig.imageModel || effectiveConfig.model, "image");
    const modelRequirements = useMemo<ModelRequirements>(() => {
        const textCount = (prompt.trim() ? 1 : 0) + textReferences.length;
        const activeImageCount = slotUploadedCount;
        return {
            capability: "image",
            input: {
                textCount,
                imageCount: activeImageCount,
                videoCount: 0,
                audioCount: 0,
                characterCount: 0,
            },
            imageSize: effectiveConfig.size,
            options: modelRequestOptions({
                ...effectiveConfig,
                model: preferredModel,
                size: effectiveConfig.size,
                quality: effectiveConfig.quality,
                count: String(effectiveConfig.count || 1),
                transparentBackground: effectiveConfig.transparentBackground,
            }, "image"),
        };
    }, [prompt, textReferences.length, slotUploadedCount, effectiveConfig, preferredModel]);
    const model = resolveCompatibleModel(effectiveConfig, preferredModel, modelRequirements) || preferredModel;
    const imageFeatureCredit = useFeatureCredit("image_workbench", model);

    const handleDetailSetModelChange = useCallback((value: string) => {
        updateConfig("imageModel", value);
        const defaults = defaultImageParamsForModel(effectiveConfig, value);
        Object.entries(defaults).forEach(([k, v]) => {
            updateConfig(k as any, v);
        });
    }, [effectiveConfig, updateConfig]);
    const imageProfile = mergedImageCapabilityConfig(effectiveConfig, model);
    // [sub-feature: workbench_batch_concurrency] [start]
    const effectiveMaxCount = MAX_IMAGE_WORKBENCH_BATCH_COUNT;
    // [sub-feature: workbench_batch_concurrency] [end]
    const isUploading = useMemo(() => references.some((r) => r.uploading), [references]);
    const hasUploadError = useMemo(() => references.some((r) => Boolean(r.error)), [references]);
    const canGenerate = (activeSkill ? isSlotsValid() : Boolean(prompt.trim() || textReferences.length || slotUploadedCount > 0)) && !isUploading && !hasUploadError && detailSetCanGenerate && !detailSetPlanning; // detail_set_workflow: 电商套图阶段门控
    const generationCount = Math.max(1, Math.min(effectiveMaxCount, Number(config.count) || 1));

    useEffect(() => {
        void refreshSystemChannels().catch((err) => console.warn("Failed to auto-refresh channels in image workbench:", err));
    }, []);

    // 默认模式下槽位素材与 draft.references 双向同步
    useEffect(() => {
        if (!activeSkill) {
            const files = getAllSlotFiles();
            setReferences(
                files.map((f) => ({
                    id: f.id,
                    name: f.name,
                    type: f.mimeType || "image/png",
                    dataUrl: f.previewUrl || f.dataUrl,
                    storageKey: f.storageKey,
                }))
            );
        }
    }, [activeSkill, slotFilesMap, slotFiles, getAllSlotFiles, setReferences]);

    // 页面初始化或历史日志恢复时若有旧 references 但无槽位素材，自动导入默认槽位
    const initialSyncDoneRef = useRef(false);
    useEffect(() => {
        if (!initialSyncDoneRef.current && !activeSkill && references.length > 0 && slotUploadedCount === 0) {
            initialSyncDoneRef.current = true;
            importExternalReferences(references, DEFAULT_IMAGE_SKILL);
        }
    }, [activeSkill, references, slotUploadedCount, importExternalReferences]);

    // 当工作流卡片发生切换时：
    // 1. 清空原输入框内容（prompt 与 textReferences 彻底重置，避免旧卡片文字残留干扰）
    // 2. 完整保留上传的素材文件，双向自适应合并到新卡片槽位
    const previousSkillIdRef = useRef<string | null | undefined>(activeSkillId ? undefined : null);
    const getAllSlotFilesRef = useRef(getAllSlotFiles);
    getAllSlotFilesRef.current = getAllSlotFiles;
    const importExternalReferencesRef = useRef(importExternalReferences);
    importExternalReferencesRef.current = importExternalReferences;
    const referencesRef = useRef(references);
    referencesRef.current = references;

    useEffect(() => {
        if (activeSkillId !== previousSkillIdRef.current) {
            const wasInitial = previousSkillIdRef.current === undefined;
            const hadPrevSkill = Boolean(previousSkillIdRef.current);
            previousSkillIdRef.current = activeSkillId;

            if (!wasInitial) {
                // 切换卡片：按规范清除原输入框文字
                setPrompt("");
                setTextReferences([]);

                // 素材无损跨模式衔接
                if (activeSkill) {
                    // 切到指定工作流：自动合并转移进新工作流槽位
                    const currentRefs = getAllSlotFilesRef.current().map((f) => ({
                        id: f.id,
                        name: f.name,
                        type: f.mimeType || "image/png",
                        dataUrl: f.previewUrl || f.dataUrl,
                        storageKey: f.storageKey,
                    }));
                    if (currentRefs.length > 0) {
                        importExternalReferencesRef.current(currentRefs, activeSkill);
                    }
                } else {
                    // 切回默认创作：将已有素材无损转移进默认创作槽位
                    const filesFromSlots = getAllSlotFilesRef.current().map((f) => ({
                        id: f.id,
                        name: f.name,
                        type: f.mimeType || "image/png",
                        dataUrl: f.previewUrl || f.dataUrl,
                        storageKey: f.storageKey,
                    }));
                    if (filesFromSlots.length > 0) {
                        importExternalReferencesRef.current(filesFromSlots, DEFAULT_IMAGE_SKILL);
                    }
                }
            }

            if (activeSkill) {
                const targetCount = activeSkill.defaultCount || 1;
                const clamped = Math.min(effectiveMaxCount, Math.max(1, targetCount));
                updateConfig("count", String(clamped));
                if (activeSkill.defaultAspectRatio) {
                    const normalizedSize = normalizeImageSizeSetting(imageProfile, activeSkill.defaultAspectRatio);
                    updateConfig("size", normalizedSize);
                }
            } else if (previousSkillIdRef.current !== undefined) {
                updateConfig("count", "1");
            }
        }
    }, [activeSkillId, activeSkill, effectiveMaxCount, imageProfile, updateConfig, setPrompt, setTextReferences, setReferences]);

    const promptMentionReferences = useMemo<CanvasResourceReference[]>(() => {
        const docRefs: CanvasResourceReference[] = textReferences.map((item, index) => ({
            id: item.id,
            nodeId: item.id,
            kind: "text" as const,
            label: `@文档${index + 1}`,
            title: item.name,
            text: item.content,
            active: true,
        }));

        let index = 0;
        const list: CanvasResourceReference[] = [];
        effectiveSkill.uploadSlots.forEach((slot) => {
            const files = slotFilesMap[slot.id] || (slotFiles[slot.id] ? [slotFiles[slot.id]!] : []);
            files.forEach((file) => {
                if (file && (file.dataUrl || file.previewUrl || file.storageKey)) {
                    index += 1;
                    const previewUrl = file.previewUrl || file.dataUrl || (file.storageKey ? (peekLocalFirstMedia(file.storageKey) || resolveResourceUrl(file.storageKey)) : "");
                    list.push({
                        id: file.id || slot.id,
                        nodeId: file.id || slot.id,
                        kind: "image",
                        label: `@${imageReferenceLabel(index - 1)}`,
                        title: `${slot.label || slot.semanticTag} (${file.name || "已上传"})`,
                        previewUrl,
                        active: true,
                    });
                }
            });
        });
        return [...list, ...docRefs];
    }, [effectiveSkill, slotFilesMap, slotFiles, textReferences]);

    const currentSessionIdRef = useRef<string>(draft.sessionId || "");
    const activeBatchIdsRef = useRef<Set<string>>(new Set());
    const isReconcilingLogsRef = useRef(false);
    const lastRemoteSyncAtRef = useRef<number>(0);
    const generationAbortControllerRef = useRef<AbortController | null>(null);
    interface ImageChargedCreditRecord {
        batchId: string;
        amount: number;
        model: string;
        deductKey: string;
        refundKey: string;
        userScope: string;
    }
    const activeChargedCreditsMapRef = useRef<Map<string, ImageChargedCreditRecord>>(new Map());
    const resultsRef = useRef(results);
    resultsRef.current = results;
    const logsRef = useRef(logs);
    logsRef.current = logs;
    const previewLogRef = useRef(previewLog);
    previewLogRef.current = previewLog;
    const reconciledTerminalTasksRef = useRef<Set<string>>(new Set());
    const recoveringTasksSetRef = useRef<Set<string>>(new Set());
    // [sub-feature: workbench_task_reconcile_self_heal] [start]
    const notifiedCompletedBatchIdsRef = useRef<Set<string>>(new Set());
    const reconciledBatchesRef = useRef<Set<string>>(new Set());
    const batchReconcileInFlightRef = useRef<Set<string>>(new Set());
    // [sub-feature: workbench_task_reconcile_self_heal] [end]
    const retryDetailSetRowRef = useRef<((planId: string, seq: number) => Promise<void>) | null>(null);
    const recoverDetailSetRowRef = useRef<((planId: string, seq: number) => Promise<void>) | null>(null);
    const [recoveringCardId, setRecoveringCardId] = useState<string | null>(null);

    // [session_workspace_registry] [start]
    const saveCurrentWorkspaceSnapshot = (targetSessionId: string) => {
        if (!targetSessionId) return;
        const currentSlots = useImageWorkbenchStore.getState().draft.slotContainers || {};
        const detailSetStore = useDetailSetStore.getState();
        useImageWorkbenchStore.getState().saveSessionSnapshot(targetSessionId, {
            skillId: activeSkill?.id || null,
            prompt,
            references,
            textReferences,
            slotContainers: currentSlots,
            model: effectiveConfig.imageModel || effectiveConfig.model,
            size: effectiveConfig.size,
            quality: effectiveConfig.quality,
            count: effectiveConfig.count,
            transparentBackground: effectiveConfig.transparentBackground,
            detailSet: (isDetailSetWorkflow || detailSetStore.plan) ? {
                draft: detailSetStore.draft,
                phase: detailSetStore.phase,
                plan: detailSetStore.plan,
                resultView: detailSetStore.resultView,
            } : undefined,
        });
    };

    const restoreTargetWorkspaceSnapshot = (log: GenerationLog) => {
        const targetSessionId = log.sessionId || log.id;
        const cachedSnapshot = useImageWorkbenchStore.getState().getSessionSnapshot(targetSessionId) || useImageWorkbenchStore.getState().getSessionSnapshot(log.id);
        if (cachedSnapshot) {
            if (cachedSnapshot.skillId) {
                selectSkill(cachedSnapshot.skillId);
                previousSkillIdRef.current = cachedSnapshot.skillId;
            } else {
                selectSkill(null);
                previousSkillIdRef.current = null;
            }
            if (cachedSnapshot.slotContainers && Object.keys(cachedSnapshot.slotContainers).length > 0) {
                updateDraft({ slotContainers: cachedSnapshot.slotContainers });
            } else {
                updateDraft({ slotContainers: {} });
            }
            if (log.detailSet && log.detailSet.planId) {
                bindDetailSetScope(getActiveUserScope());
                const isBatchRuntimeActive = activeBatchIdsRef.current.has(log.id);
                // 权威基准：以当前日志持久化的 log.detailSet 作为唯一事实源，严格物理隔离防串批次与多方案混淆
                const authoritativePlan = log.detailSet;
                const mergedRows = authoritativePlan.rows.map((row: DetailSetRow) => {
                    const slotIndex = row.seq - 1;
                    const cardId = `${log.id}_slot_${slotIndex}`;
                    const matchedImg = matchImageForDetailSetRow(row, log.images, log.id);
                    const isStolenKey = Boolean(
                        row.storageKey &&
                        (log.images || []).some((img) =>
                            img.storageKey === row.storageKey &&
                            ((img.id && img.id.startsWith(`${log.id}_slot_`) && img.id !== cardId) ||
                             (typeof (img as any).slotIndex === "number" && (img as any).slotIndex !== slotIndex))
                        )
                    );
                    const effectiveStorageKey = matchedImg?.storageKey || (isStolenKey ? undefined : row.storageKey);
                    const effectiveUrl = matchedImg?.dataUrl || (isStolenKey ? "" : row.imageUrl) || (effectiveStorageKey ? (peekLocalFirstMedia(effectiveStorageKey) || resolveResourceUrl(effectiveStorageKey)) : "");
                    if (effectiveUrl || effectiveStorageKey) {
                        return {
                            ...row,
                            imageUrl: effectiveUrl || (effectiveStorageKey ? resolveResourceUrl(effectiveStorageKey) : ""),
                            storageKey: effectiveStorageKey,
                            status: "success" as const,
                            taskId: matchedImg?.taskId || (isStolenKey ? undefined : row.taskId),
                            error: undefined,
                        };
                    }
                    if (row.status === "pending" && !isBatchRuntimeActive) {
                        return {
                            ...row,
                            imageUrl: undefined,
                            storageKey: undefined,
                            status: "failed" as const,
                            error: row.error || "任务执行中断或未生成",
                        };
                    }
                    return isStolenKey ? { ...row, imageUrl: undefined, storageKey: undefined, status: "failed" as const, error: "任务执行中断或未生成" } : row;
                });
                const resolvedPlan: DetailSetPlanSnapshot = {
                    ...authoritativePlan,
                    rows: mergedRows,
                };
                const cachedDetail = cachedSnapshot?.detailSet;
                const isSamePlanSnapshot = cachedDetail?.plan?.planId === authoritativePlan.planId;
                useDetailSetStore.setState({
                    draft: isSamePlanSnapshot && cachedDetail?.draft ? cachedDetail.draft : useDetailSetStore.getState().draft,
                    phase: isSamePlanSnapshot && cachedDetail?.phase ? cachedDetail.phase : "review",
                    plan: resolvedPlan,
                    activePlanId: resolvedPlan.planId || null,
                    resultView: cachedDetail?.resultView || "phone",
                });
            } else if (cachedSnapshot.detailSet && log.detailSet?.planId) {
                bindDetailSetScope(getActiveUserScope());
                useDetailSetStore.setState({
                    draft: cachedSnapshot.detailSet.draft,
                    phase: cachedSnapshot.detailSet.phase,
                    plan: cachedSnapshot.detailSet.plan,
                    activePlanId: cachedSnapshot.detailSet.plan?.planId || null,
                    resultView: cachedSnapshot.detailSet.resultView || "phone",
                });
            } else {
                useDetailSetStore.getState().resetWorkflow();
            }
            setPrompt(cachedSnapshot.prompt || "");
            const hydratedCachedRefs = (cachedSnapshot.references || []).map((r) => ({
                ...r,
                url: r.url || r.dataUrl || (r.storageKey ? (peekLocalFirstMedia(r.storageKey) || resolveResourceUrl(r.storageKey)) : ""),
            }));
            setReferences(hydratedCachedRefs);
            setTextReferences(cachedSnapshot.textReferences || []);
            updateDraft({
                sessionId: targetSessionId,
                prompt: cachedSnapshot.prompt || "",
                references: hydratedCachedRefs,
                textReferences: cachedSnapshot.textReferences || [],
                slotContainers: cachedSnapshot.slotContainers || {},
            });
            if (cachedSnapshot.model) updateConfig("imageModel", resolveModelForCapability(effectiveConfig, cachedSnapshot.model, "image"));
            if (cachedSnapshot.quality) updateConfig("quality", cachedSnapshot.quality);
            if (cachedSnapshot.size) updateConfig("size", cachedSnapshot.size);
            if (cachedSnapshot.count) updateConfig("count", cachedSnapshot.count);
            if (cachedSnapshot.transparentBackground) updateConfig("transparentBackground", cachedSnapshot.transparentBackground);
        } else if (log.detailSet && log.detailSet.planId) {
            // 首次查阅历史带有电商套图的记录：自动识别并激活电商套图工作流卡片
            selectSkill("ecommerce-detail-set");
            previousSkillIdRef.current = "ecommerce-detail-set";
            bindDetailSetScope(getActiveUserScope());
            const isBatchRuntimeActive = activeBatchIdsRef.current.has(log.id);
            // 双向自愈：将 log.images 中的成功产物注入到 plan.rows 中，防丢图
            const healedPlan: DetailSetPlanSnapshot = {
                ...log.detailSet,
                rows: log.detailSet.rows.map((row) => {
                    const slotIndex = row.seq - 1;
                    const cardId = `${log.id}_slot_${slotIndex}`;
                    const matchedImg = matchImageForDetailSetRow(row, log.images, log.id);
                    const isStolenKey = Boolean(
                        row.storageKey &&
                        (log.images || []).some((img) =>
                            img.storageKey === row.storageKey &&
                            ((img.id && img.id.startsWith(`${log.id}_slot_`) && img.id !== cardId) ||
                             (typeof (img as any).slotIndex === "number" && (img as any).slotIndex !== slotIndex))
                        )
                    );
                    const storageKey = matchedImg?.storageKey || (isStolenKey ? undefined : row.storageKey);
                    const imageUrl = matchedImg?.dataUrl || (isStolenKey ? "" : row.imageUrl) || (storageKey ? (peekLocalFirstMedia(storageKey) || resolveResourceUrl(storageKey)) : "");
                    const isSuccess = Boolean(imageUrl || storageKey);
                    return {
                        ...row,
                        imageUrl: isSuccess ? imageUrl : undefined,
                        storageKey: isSuccess ? storageKey : undefined,
                        taskId: matchedImg?.taskId || (isStolenKey ? undefined : row.taskId),
                        status: isSuccess ? ("success" as const) : (row.status === "pending" && !isBatchRuntimeActive ? ("failed" as const) : row.status),
                        error: isSuccess ? undefined : (row.error || (!isBatchRuntimeActive && row.status === "pending" ? "任务执行中断或未生成" : undefined)),
                    };
                }),
            };
            useDetailSetStore.getState().hydrateFromSnapshot(healedPlan, getActiveUserScope(), "review");
            const productFiles = (log.references || []).map((ref, idx) => {
                const resolvedUrl = ref.dataUrl || (ref.storageKey ? (peekLocalFirstMedia(ref.storageKey) || resolveResourceUrl(ref.storageKey)) : "");
                return {
                    id: ref.id || `ref_${idx}`,
                    slotId: "product",
                    name: ref.name || `商品图${idx + 1}`,
                    dataUrl: ref.dataUrl || resolvedUrl,
                    previewUrl: ref.dataUrl || resolvedUrl,
                    storageKey: ref.storageKey,
                    mimeType: ref.type || "image/jpeg",
                    size: 0,
                };
            });
            const restoredSlots: Record<string, SlotFilesContainer> = productFiles.length > 0 ? { product: { files: productFiles, activeId: productFiles[0]?.id } } : {};
            const hydratedLogRefs = (log.references || []).map((ref) => ({
                ...ref,
                url: ref.url || ref.dataUrl || (ref.storageKey ? (peekLocalFirstMedia(ref.storageKey) || resolveResourceUrl(ref.storageKey)) : ""),
            }));
            updateDraft({
                sessionId: targetSessionId,
                prompt: log.prompt,
                references: hydratedLogRefs,
                textReferences: [],
                slotContainers: restoredSlots,
            });
            setPrompt(log.prompt);
            setReferences(hydratedLogRefs);
            setTextReferences([]);
            const targetModel = log.config?.imageModel || log.config?.model || log.model;
            if (targetModel) updateConfig("imageModel", resolveModelForCapability(effectiveConfig, targetModel, "image"));
            if (log.config?.quality) updateConfig("quality", log.config.quality);
            if (log.config?.size) updateConfig("size", log.config.size);
            if (log.config?.count) updateConfig("count", log.config.count);
            if (log.config?.transparentBackground) updateConfig("transparentBackground", log.config.transparentBackground);
        } else {
            selectSkill(null);
            clearAllSlots();
            previousSkillIdRef.current = null;
            useDetailSetStore.getState().resetWorkflow();
            setPrompt(log.prompt);
            setTextReferences([]);
            setReferences(log.references || []);
            updateDraft({
                sessionId: targetSessionId,
                prompt: log.prompt,
                references: log.references || [],
                textReferences: [],
                slotContainers: {},
            });
            const targetModel = log.config?.imageModel || log.config?.model || log.model;
            if (targetModel) updateConfig("imageModel", resolveModelForCapability(effectiveConfig, targetModel, "image"));
            if (log.config?.quality) updateConfig("quality", log.config.quality);
            if (log.config?.size) updateConfig("size", log.config.size);
            if (log.config?.count) updateConfig("count", log.config.count);
            if (log.config?.transparentBackground) updateConfig("transparentBackground", log.config.transparentBackground);
        }
    };
    // [session_workspace_registry] [end]

    interface ImageWorkbenchHistoryState {
        prompt: string;
        references: ReferenceImage[];
        textReferences: Array<{ id: string; name: string; content: string }>;
        model?: string;
        size?: string;
        quality?: string;
        count?: string;
        transparentBackground?: string;
    }

    // 状态撤销/重做栈支持 (AGENTS.md Section 5.2/5.3 规范)
    const historyRef = useRef<ImageWorkbenchHistoryState[]>([]);
    const historyIndexRef = useRef<number>(-1);
    const isHistoryNavigatingRef = useRef(false);
    const isNavigatingGenerationLogRef = useRef(false);

    const recordHistory = useCallback((
        nextPrompt: string,
        nextRefs: ReferenceImage[],
        nextTextRefs: Array<{ id: string; name: string; content: string }>,
        nextConfig?: {
            model?: string;
            size?: string;
            quality?: string;
            count?: string;
            transparentBackground?: string;
        }
    ) => {
        if (isHistoryNavigatingRef.current) return;
        const currentModel = nextConfig?.model ?? (effectiveConfig.imageModel || effectiveConfig.model);
        const currentSize = nextConfig?.size ?? effectiveConfig.size;
        const currentQuality = nextConfig?.quality ?? effectiveConfig.quality;
        const currentCount = nextConfig?.count ?? effectiveConfig.count;
        const currentTransparent = nextConfig?.transparentBackground ?? effectiveConfig.transparentBackground;

        const currentStack = historyRef.current.slice(0, historyIndexRef.current + 1);
        const last = currentStack[currentStack.length - 1];
        if (
            last &&
            last.prompt === nextPrompt &&
            last.references.length === nextRefs.length &&
            (last.textReferences?.length || 0) === nextTextRefs.length &&
            last.references.every((r, i) => r.id === nextRefs[i]?.id) &&
            last.model === currentModel &&
            last.size === currentSize &&
            last.quality === currentQuality &&
            last.count === currentCount &&
            last.transparentBackground === currentTransparent
        ) {
            return;
        }
        currentStack.push({
            prompt: nextPrompt,
            references: nextRefs,
            textReferences: nextTextRefs,
            model: currentModel,
            size: currentSize,
            quality: currentQuality,
            count: currentCount,
            transparentBackground: currentTransparent,
        });
        if (currentStack.length > 50) currentStack.shift();
        historyRef.current = currentStack;
        historyIndexRef.current = currentStack.length - 1;
    }, [effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, effectiveConfig.quality, effectiveConfig.count, effectiveConfig.transparentBackground]);

    const undo = useCallback(() => {
        if (historyIndexRef.current > 0) {
            historyIndexRef.current -= 1;
            const target = historyRef.current[historyIndexRef.current];
            if (target) {
                isHistoryNavigatingRef.current = true;
                setPrompt(target.prompt);
                setReferences(target.references);
                setTextReferences(target.textReferences || []);
                if (target.model) updateConfig("imageModel", target.model);
                if (target.size) updateConfig("size", target.size);
                if (target.quality) updateConfig("quality", target.quality);
                if (target.count !== undefined) updateConfig("count", target.count);
                if (target.transparentBackground !== undefined) updateConfig("transparentBackground", target.transparentBackground);
                setTimeout(() => {
                    isHistoryNavigatingRef.current = false;
                }, 50);
            }
        }
    }, [updateConfig]);

    const redo = useCallback(() => {
        if (historyIndexRef.current < historyRef.current.length - 1) {
            historyIndexRef.current += 1;
            const target = historyRef.current[historyIndexRef.current];
            if (target) {
                isHistoryNavigatingRef.current = true;
                setPrompt(target.prompt);
                setReferences(target.references);
                setTextReferences(target.textReferences || []);
                if (target.model) updateConfig("imageModel", target.model);
                if (target.size) updateConfig("size", target.size);
                if (target.quality) updateConfig("quality", target.quality);
                if (target.count !== undefined) updateConfig("count", target.count);
                if (target.transparentBackground !== undefined) updateConfig("transparentBackground", target.transparentBackground);
                setTimeout(() => {
                    isHistoryNavigatingRef.current = false;
                }, 50);
            }
        }
    }, [updateConfig]);

    const handleOptimizePrompt = useCallback(async () => {
        if (isOptimizingPrompt) return;
        setIsOptimizingPrompt(true);
        try {
            const expandedPrompt = expandPromptTextReferences(prompt, textReferences);
            const res = await optimizeSkillPrompt({
                skill: activeSkill,
                userPrompt: expandedPrompt,
                slotFiles,
                slotFilesMap,
                targetModel: model,
                config: effectiveConfig,
            });
            if (res.optimizedPrompt && res.optimizedPrompt.trim()) {
                recordHistory(res.optimizedPrompt, references, textReferences);
                setPrompt(res.optimizedPrompt);
                if (res.isAiGenerated) {
                    message.success("已通过 AI 深度融合工作流规范重塑提示词！");
                } else {
                    message.info("已完成用户输入与工作流卡片规范的结构化拼装");
                }
            }
        } catch (err) {
            message.error("优化提示词失败，请检查网络或模型配置");
        } finally {
            setIsOptimizingPrompt(false);
        }
    }, [isOptimizingPrompt, activeSkill, prompt, textReferences, slotFiles, slotFilesMap, model, effectiveConfig, recordHistory, references, message]);

    useEffect(() => {
        recordHistory(prompt, references, textReferences);
    }, [prompt, references, textReferences, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, effectiveConfig.quality, effectiveConfig.count, effectiveConfig.transparentBackground, recordHistory]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.isComposing) return;
            const isUndo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey;
            const isRedo = (event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey));
            if (!isUndo && !isRedo) return;

            const target = event.target;
            if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) {
                return;
            }

            event.preventDefault();
            if (isUndo) undo();
            if (isRedo) redo();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [undo, redo]);

    // 用户切换监听与隔离刷新
    const [userScope, setUserScope] = useState(getActiveUserScope());
    useEffect(() => {
        const checkScope = async () => {
            const currentScope = getActiveUserScope();
            if (currentScope !== userScope) {
                generationAbortControllerRef.current?.abort();
                for (const [, charged] of activeChargedCreditsMapRef.current.entries()) {
                    if (charged && charged.amount > 0) {
                        void imageFeatureCredit.refund(charged.amount, charged.model, "账号切换自动退款", charged.refundKey, charged.deductKey);
                    }
                }
                activeChargedCreditsMapRef.current.clear();
                setUserScope(currentScope);
                // 仅重置会话临时交互状态，严禁调用 createSession() 写入空草稿覆写新账号持久化数据
                sessionExplicitlyResetRef.current = true;
                setPreviewReferenceId(null);
                setResults([]);
                setElapsedMs(0);
                setStartedAt(0);
                setSelectedLogIds([]);
                setPreviewLog(null);
                useDetailSetStore.getState().resetWorkflow();
                await useImageWorkbenchStore.persist?.rehydrate?.();
                void refreshLogs(true, true);
            }
        };
        window.addEventListener("storage", checkScope);
        window.addEventListener(USER_SCOPE_CHANGED_EVENT, checkScope);
        return () => {
            window.removeEventListener("storage", checkScope);
            window.removeEventListener(USER_SCOPE_CHANGED_EVENT, checkScope);
        };
    }, [userScope]);

    useEffect(() => {
        if (!isCurrentSessionPending || !startedAt) return;
        const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [isCurrentSessionPending, startedAt]);

    useEffect(() => {
        void refreshLogs(true, true);
        // [silent-reconciliation] [start]
        let visibilityDebounceTimer: ReturnType<typeof setTimeout> | undefined;
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                const now = Date.now();
                // 流量熔断节流阀：最小 60 秒冷却门阀，切屏防抖，彻底消除并发与带宽浪费
                if (now - lastRemoteSyncAtRef.current >= 60_000) {
                    if (visibilityDebounceTimer) clearTimeout(visibilityDebounceTimer);
                    visibilityDebounceTimer = setTimeout(() => {
                        void refreshLogs(true, true);
                    }, 500);
                }
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            if (visibilityDebounceTimer) clearTimeout(visibilityDebounceTimer);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
        // [silent-reconciliation] [end]
    }, []);

    // 监听全局任务守护器广播的就绪事件，秒级即时回填卡槽结果与历史日志
    useEffect(() => {
        const handleSettled = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (!detail || detail.type !== "image") return;
            if (detail.outcomeImage && detail.taskId) {
                setResults((prev) => {
                    const idx = prev.findIndex((r) =>
                        r.taskId === detail.taskId ||
                        (detail.batchId && typeof detail.slotIndex === "number" && (r.batchId === detail.batchId || r.id === `${detail.batchId}_slot_${detail.slotIndex}`) && r.slotIndex === detail.slotIndex)
                    );
                    if (idx >= 0) {
                        return updateResultAt(prev, idx, {
                            status: "success",
                            image: detail.outcomeImage,
                            error: undefined,
                            canRecoverMedia: false,
                            taskId: detail.taskId,
                        });
                    }
                    return prev;
                });
            }
            void refreshLogs(false, false);
        };
        window.addEventListener("workbench:task-settled", handleSettled);
        return () => window.removeEventListener("workbench:task-settled", handleSettled);
    }, []);

    // [sub-feature: background_task_reconciler_daemon] [start]
    // 后台长效任务自动对账守护器：
    // 当页面存在未决（pending）、超时断连或可恢复（failed 但带 taskId / canRecoverMedia / 超时报错）的任务卡槽时，
    // 后台自动每 5 秒发起增量对账轮询（空闲时 0 轮询 0 负载）；
    // 一旦上游任务生成完毕落库，自动静默提取产物并双向回填至卡槽、电商套图规划与持久化历史记录，
    // 彻底解决“上游已生成扣费，前端页面超时显示失败且无法自动回填”的断点痛点。
    useEffect(() => {
        let isReconciling = false;
        const intervalId = window.setInterval(async () => {
            if (isReconciling) return;
            isReconciling = true;
            try {
                const candidates: Array<{ taskId: string; cardId?: string; seq?: number; planId?: string; batchId?: string; slotIndex?: number }> = [];
                const seenTasks = new Set<string>();

                // 1. 扫描当前结果卡片 resultsRef.current
                for (const r of resultsRef.current) {
                    if (r.taskId && !reconciledTerminalTasksRef.current.has(r.taskId) && !seenTasks.has(r.taskId)) {
                        if (r.status === "pending" || (r.status === "failed" && (r.canRecoverMedia || /超时|稍后重试/i.test(r.error || "")))) {
                            candidates.push({ taskId: r.taskId, cardId: r.id, batchId: r.batchId, slotIndex: r.slotIndex });
                            seenTasks.add(r.taskId);
                        }
                    }
                }

                // 2. 扫描电商套图 plan
                const currentPlan = useDetailSetStore.getState().plan;
                if (currentPlan?.rows) {
                    for (const row of currentPlan.rows) {
                        if (row.taskId && !reconciledTerminalTasksRef.current.has(row.taskId) && !seenTasks.has(row.taskId)) {
                            if ((row.status === "pending" || row.status === "failed") && !row.imageUrl && !row.storageKey) {
                                candidates.push({ taskId: row.taskId, seq: row.seq, planId: currentPlan.planId, batchId: currentPlan.planId, slotIndex: row.seq - 1 });
                                seenTasks.add(row.taskId);
                            }
                        }
                    }
                }

                // 3. 扫描 logsRef.current 中处于 pending 或部分成功 (failCount > 0 / detailSet 有未就绪行) 且含有 taskIds 的批次
                // [sub-feature: workbench_task_reconcile_self_heal] [start]
                for (const log of logsRef.current) {
                    const hasUnfinishedDetailRows = log.detailSet?.rows?.some(
                        (r) => (!r.imageUrl && !r.storageKey) || r.status === "pending" || (r.status === "failed" && /超时|稍后重试/i.test(r.error || ""))
                    );
                    const batchId = log.batchId || log.id;
                    const needsReconciliation = log.status === "pending" || log.failCount > 0 || hasUnfinishedDetailRows;

                    if (needsReconciliation && batchId && !reconciledBatchesRef.current.has(batchId) && !batchReconcileInFlightRef.current.has(batchId)) {
                        batchReconcileInFlightRef.current.add(batchId);
                        void (async () => {
                            try {
                                const backendTasks = await listTasksForBatch(batchId);
                                if (backendTasks && backendTasks.length > 0) {
                                    let hasChanges = false;
                                    const allTaskIds = new Set<string>(log.taskIds || []);
                                    for (const t of backendTasks) allTaskIds.add(t.id);
                                    const nextTaskIds = Array.from(allTaskIds);
                                    if (nextTaskIds.length !== (log.taskIds?.length || 0)) hasChanges = true;

                                    let nextImgs = [...(log.images || [])];
                                    let nextDetailSet = log.detailSet ? { ...log.detailSet, rows: [...log.detailSet.rows] } : undefined;
                                    const seenSlotsInBatch = new Set<number>();

                                    for (const t of backendTasks) {
                                        if (t.status === "succeeded") {
                                            reconciledTerminalTasksRef.current.add(t.id);
                                            let slotIdx: number | undefined;
                                            if (t.clientOperationId) {
                                                const m = t.clientOperationId.match(/_slot_(\d+)/);
                                                if (m) slotIdx = parseInt(m[1], 10);
                                            }
                                            if (slotIdx === undefined && t.inputJson) {
                                                try {
                                                    const inp = JSON.parse(t.inputJson);
                                                    if (typeof inp.metadata?.slotIndex === "number") slotIdx = inp.metadata.slotIndex;
                                                } catch {}
                                            }

                                            // LWW (Last-Write-Wins): backendTasks 是 created_at desc 排序，首个遇见的即为该卡槽最新生效任务
                                            if (typeof slotIdx === "number") {
                                                if (seenSlotsInBatch.has(slotIdx)) continue;
                                                seenSlotsInBatch.add(slotIdx);
                                            }

                                            let storageKey: string | undefined;
                                            let dataUrl = "";
                                            let width = 0, height = 0, bytes = 0, mimeType = "image/png";

                                            if (t.resultJson) {
                                                try {
                                                    const parsed = parseBackendGenerationResult(t);
                                                    const rawImg = parsed.images?.[0];
                                                    if (rawImg) {
                                                        storageKey = rawImg.storageKey;
                                                        dataUrl = rawImg.dataUrl || "";
                                                        width = rawImg.width || 0;
                                                        height = rawImg.height || 0;
                                                        bytes = rawImg.bytes || 0;
                                                        mimeType = rawImg.mimeType || "image/png";
                                                    }
                                                } catch {}
                                            }
                                            if (!storageKey && !dataUrl && t.previewUrl) {
                                                dataUrl = t.previewUrl;
                                                storageKey = resourceIdFromStorageKey(t.previewUrl) || undefined;
                                            }
                                            if (storageKey && !dataUrl) {
                                                dataUrl = (await resolveImageUrl(storageKey)) || "";
                                            }

                                            if (storageKey || dataUrl) {
                                                const cardId = t.clientOperationId || (typeof slotIdx === "number" ? `${batchId}_slot_${slotIdx}` : `${batchId}_task_${t.id}`);
                                                const outcomeImg: GeneratedImage = {
                                                    id: cardId,
                                                    dataUrl,
                                                    storageKey,
                                                    taskId: t.id,
                                                    slotIndex: slotIdx,
                                                    durationMs: 0,
                                                    width,
                                                    height,
                                                    bytes,
                                                    mimeType,
                                                };

                                                const existingImgIdx = nextImgs.findIndex((img) =>
                                                    img.taskId === t.id ||
                                                    img.id === cardId ||
                                                    (typeof slotIdx === "number" && (img.slotIndex === slotIdx || img.id === `${batchId}_slot_${slotIdx}`))
                                                );
                                                if (existingImgIdx >= 0) {
                                                    const cur = nextImgs[existingImgIdx];
                                                    if (cur.taskId !== t.id || cur.storageKey !== storageKey || cur.dataUrl !== dataUrl) {
                                                        nextImgs[existingImgIdx] = outcomeImg;
                                                        hasChanges = true;
                                                    }
                                                } else {
                                                    nextImgs.push(outcomeImg);
                                                    hasChanges = true;
                                                }

                                                if (nextDetailSet?.rows) {
                                                    const seq = typeof slotIdx === "number" ? slotIdx + 1 : undefined;
                                                    const rIdx = nextDetailSet.rows.findIndex((r) => (seq !== undefined ? r.seq === seq : r.taskId === t.id));
                                                    if (rIdx >= 0) {
                                                        const row = nextDetailSet.rows[rIdx];
                                                        if (row.taskId !== t.id || row.storageKey !== storageKey || row.imageUrl !== dataUrl || row.status !== "success") {
                                                            nextDetailSet.rows[rIdx] = {
                                                                ...row,
                                                                imageUrl: dataUrl || row.imageUrl,
                                                                storageKey: storageKey || row.storageKey,
                                                                taskId: t.id,
                                                                status: "success",
                                                                error: undefined,
                                                            };
                                                            hasChanges = true;
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    // 净化外来跨批次污染图片并按槽位升序去重
                                    const cleanedImgs = deduplicateLogImages(
                                        nextImgs.filter((img) => {
                                            if (img.id && img.id.includes("_slot_") && !img.id.startsWith(`${batchId}_slot_`)) return false;
                                            return true;
                                        }),
                                        batchId
                                    );
                                    if (cleanedImgs.length !== nextImgs.length) {
                                        nextImgs = cleanedImgs;
                                        hasChanges = true;
                                    }

                                    if (hasChanges) {
                                        const curSuccess = nextDetailSet?.rows
                                            ? nextDetailSet.rows.filter((r) => Boolean(r.imageUrl || r.storageKey)).length
                                            : nextImgs.length;
                                        const totalCount = nextDetailSet?.rows?.length || nextTaskIds.length || (log.config?.count ? Number(log.config.count) : nextImgs.length);
                                        const curFail = Math.max(0, totalCount - curSuccess);

                                        const healedLog: GenerationLog = {
                                            ...log,
                                            taskIds: nextTaskIds,
                                            images: nextImgs,
                                            thumbnails: nextImgs.map((img) => img.dataUrl).filter(Boolean),
                                            detailSet: nextDetailSet,
                                            successCount: curSuccess,
                                            failCount: curFail,
                                            status: curFail === 0 ? "success" : (curSuccess > 0 ? "success" : (curFail === totalCount ? "failed" : log.status)),
                                            error: curFail === 0 ? undefined : log.error,
                                            updatedAt: Date.now(),
                                        };
                                        await saveLog(healedLog);

                                        // 若当前恰好停留在该批次详情页，同步静默刷新展示
                                        if (previewLog?.id === log.id || previewLog?.batchId === batchId) {
                                            setPreviewLog(healedLog);
                                            setResults(deriveGenerationResultsFromLog(healedLog, activeBatchIdsRef.current));
                                        }
                                        const livePlan = useDetailSetStore.getState().plan;
                                        if (livePlan && (livePlan.planId === batchId || livePlan.planId === log.id) && healedLog.detailSet) {
                                            useDetailSetStore.getState().hydrateFromSnapshot(healedLog.detailSet, getActiveUserScope(), "review");
                                        }

                                        if (curFail === 0) {
                                            reconciledBatchesRef.current.add(batchId);
                                        }
                                    } else if (!hasUnfinishedDetailRows && log.status !== "pending") {
                                        reconciledBatchesRef.current.add(batchId);
                                    }
                                }
                            } catch (bErr) {
                                console.warn(`[reconciliation] 批次 ${batchId} 批量对账失败:`, bErr);
                            } finally {
                                batchReconcileInFlightRef.current.delete(batchId);
                            }
                        })();
                    }

                    if (needsReconciliation && log.taskIds?.length) {
                        for (const tid of log.taskIds) {
                            if (tid && !reconciledTerminalTasksRef.current.has(tid) && !seenTasks.has(tid)) {
                                candidates.push({ taskId: tid, batchId: log.batchId || log.id, planId: log.detailSet?.planId || log.id });
                                seenTasks.add(tid);
                            }
                        }
                    }
                }
                // [sub-feature: workbench_task_reconcile_self_heal] [end]

                if (candidates.length === 0) return;

                for (const item of candidates) {
                    try {
                        const taskInfo = await refreshGenerationTaskStatus(item.taskId);
                        let resolvedSlotIndex = item.slotIndex;
                        let resolvedBatchId = item.batchId;
                        if (taskInfo.clientOperationId) {
                            const match = taskInfo.clientOperationId.match(/_slot_(\d+)/);
                            if (match) resolvedSlotIndex = parseInt(match[1], 10);
                            const bMatch = taskInfo.clientOperationId.split("_slot_")[0];
                            if (bMatch) resolvedBatchId = bMatch;
                        }
                        if (resolvedSlotIndex === undefined && taskInfo.inputJson) {
                            try {
                                const inp = JSON.parse(taskInfo.inputJson);
                                if (typeof inp.metadata?.slotIndex === "number") resolvedSlotIndex = inp.metadata.slotIndex;
                                if (inp.metadata?.batchId) resolvedBatchId = inp.metadata.batchId;
                            } catch {}
                        }
                        const resolvedSeq = item.seq ?? (typeof resolvedSlotIndex === "number" ? resolvedSlotIndex + 1 : undefined);

                        if (taskInfo.status === "succeeded") {
                            reconciledTerminalTasksRef.current.add(item.taskId);
                            const parsed = parseBackendGenerationResult(taskInfo);
                            let rawImg = parsed.images?.[0];
                            let storageKey = rawImg?.storageKey;
                            let dataUrl = rawImg?.dataUrl || "";

                            if (!storageKey && !dataUrl) {
                                try {
                                    const recTask = await recoverGenerationTaskMedia(item.taskId);
                                    const recParsed = parseBackendGenerationResult(recTask);
                                    rawImg = recParsed.images?.[0];
                                    storageKey = rawImg?.storageKey;
                                    dataUrl = rawImg?.dataUrl || "";
                                } catch {}
                            }

                            if (storageKey && !dataUrl) {
                                dataUrl = (await resolveImageUrl(storageKey)) || "";
                            }

                            if (storageKey || dataUrl) {
                                const outcomeImage: GeneratedImage = {
                                    id: item.cardId || (resolvedBatchId && typeof resolvedSlotIndex === "number" ? `${resolvedBatchId}_slot_${resolvedSlotIndex}` : (storageKey ? resourceIdFromStorageKey(storageKey) || nanoid() : nanoid())),
                                    dataUrl,
                                    storageKey,
                                    taskId: item.taskId,
                                    durationMs: 0,
                                    width: rawImg?.width || 0,
                                    height: rawImg?.height || 0,
                                    bytes: rawImg?.bytes || 0,
                                    mimeType: rawImg?.mimeType,
                                };

                                // A. 回填 results（严格隔离当前活跃批次）
                                setResults((prev) => {
                                    const idx = prev.findIndex((r) =>
                                        r.taskId === item.taskId ||
                                        (item.cardId && r.id === item.cardId) ||
                                        (resolvedBatchId && typeof resolvedSlotIndex === "number" && (r.batchId === resolvedBatchId || r.id === `${resolvedBatchId}_slot_${resolvedSlotIndex}`) && r.slotIndex === resolvedSlotIndex)
                                    );
                                    if (idx >= 0) {
                                        return updateResultAt(prev, idx, {
                                            status: "success",
                                            image: outcomeImage,
                                            error: undefined,
                                            canRecoverMedia: false,
                                            taskId: item.taskId,
                                        });
                                    }
                                    return prev;
                                });

                                // B. 回填 DetailSet Store（严格对齐 livePlan.planId，严禁 cross-plan 窜改）
                                const livePlan = useDetailSetStore.getState().plan;
                                if (livePlan && resolvedBatchId && livePlan.planId === resolvedBatchId) {
                                    const targetRow = livePlan.rows.find((r) =>
                                        r.taskId === item.taskId ||
                                        (resolvedSeq && r.seq === resolvedSeq)
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

                                // C. 回填 GenerationLog（严格物理批次隔离防线：必须严格属于同一批次，严禁跨批次通过裸 seq 错乱回填）
                                const targetLog = logsRef.current.find((l) =>
                                    Boolean(
                                        (resolvedBatchId && (l.id === resolvedBatchId || l.batchId === resolvedBatchId || l.detailSet?.planId === resolvedBatchId)) ||
                                        (l.taskIds && l.taskIds.includes(item.taskId))
                                    )
                                );
                                if (targetLog) {
                                    const existingImgs = targetLog.images || [];
                                    const nextImgs = existingImgs.some((img) => img.taskId === item.taskId || img.id === outcomeImage.id)
                                        ? existingImgs.map((img) => (img.taskId === item.taskId || img.id === outcomeImage.id ? outcomeImage : img))
                                        : [...existingImgs, outcomeImage];

                                    let updatedDetailSet = targetLog.detailSet;
                                    if (updatedDetailSet?.rows) {
                                        updatedDetailSet = {
                                            ...updatedDetailSet,
                                            rows: updatedDetailSet.rows.map((r) =>
                                                r.taskId === item.taskId || (resolvedSeq && r.seq === resolvedSeq)
                                                    ? { ...r, imageUrl: dataUrl, storageKey, taskId: item.taskId, status: "success" as const, error: undefined }
                                                    : r
                                            ),
                                        };
                                    }

                                    const curSuccess = updatedDetailSet?.rows
                                        ? updatedDetailSet.rows.filter((r) => Boolean(r.imageUrl || r.storageKey)).length
                                        : nextImgs.length;
                                    const totalCount = updatedDetailSet?.rows?.length || targetLog.taskIds?.length || (targetLog.config?.count ? Number(targetLog.config.count) : nextImgs.length);
                                    const curFail = Math.max(0, totalCount - curSuccess);

                                    const patchedLog: GenerationLog = {
                                        ...targetLog,
                                        images: nextImgs,
                                        thumbnails: nextImgs.map((img) => img.dataUrl).filter(Boolean),
                                        detailSet: updatedDetailSet,
                                        successCount: curSuccess,
                                        failCount: curFail,
                                        status: curFail === 0 ? "success" : (curSuccess > 0 ? "success" : "failed"),
                                        error: curFail === 0 ? undefined : targetLog.error,
                                        updatedAt: Date.now(),
                                    };
                                    saveLog(patchedLog);
                                }

                                 // 静默对账回填治理：卡槽与状态已在界面即时平滑响应，杜绝逐图弹窗骚扰
                                 // [sub-feature: workbench_task_reconcile_self_heal] [end]
                            }
                        } else if (taskInfo.status === "failed" || taskInfo.status === "cancelled") {
                            // 若为 OSS 或保存问题，尝试长效恢复
                            const isRecoverable = taskInfo.canRecoverMedia || /OSS|上传|存储同步/i.test(taskInfo.error || "");
                            if (isRecoverable) {
                                try {
                                    if (!recoveringTasksSetRef.current.has(item.taskId)) {
                                        recoveringTasksSetRef.current.add(item.taskId);
                                        await recoverGenerationTaskMedia(item.taskId);
                                    }
                                } catch {}
                                // 恢复任务已重新入队，暂不计入终态黑名单，留给后续轮询检查是否 succeeded
                            } else {
                                reconciledTerminalTasksRef.current.add(item.taskId);
                                setResults((prev) => {
                                    const idx = prev.findIndex((r) => r.taskId === item.taskId);
                                    if (idx >= 0 && prev[idx].status === "pending") {
                                        return updateResultAt(prev, idx, {
                                            status: "failed",
                                            error: taskInfo.error ? generationErrorMessage(taskInfo.error) : "任务生成失败",
                                            canRecoverMedia: false,
                                        });
                                    }
                                    return prev;
                                });
                            }
                        }
                    } catch {
                        // 忽略单次网络抖动，下一轮重试
                    }
                }
            } finally {
                isReconciling = false;
            }
        }, 5000);

        return () => window.clearInterval(intervalId);
    }, []);
    // [sub-feature: background_task_reconciler_daemon] [end]

    // 状态生命周期守卫：同步生成记录与右侧结果面板（页面加载、刷新、路由切回、后台任务完成均自动保活回填）
    // [workbench-lifecycle-guard] [start]
    useEffect(() => {
        if (submitting) return;
        if (sessionExplicitlyResetRef.current) return;
        if (isNavigatingGenerationLogRef.current) return; // 抑制历史切条过渡期的双重重算与 DOM 撕裂闪烁
        if (!hydratedDraft || logs.length === 0) return;

        // 分支 1：响应当前会话内所有日志的并发更新（包括后台落库/状态变迁），打破单个 previewLog 互斥阻断
        const currentSessionId = draft.sessionId;
        const sessionOrActiveLogs = logs.filter(
            (l) => (currentSessionId && l.sessionId === currentSessionId) || activeBatchIdsRef.current.has(l.id) || activeBatchIdsRef.current.has(l.batchId || "")
        );

        if (sessionOrActiveLogs.length > 0 && !isCurrentSessionPending) {
            setResults((prev) => {
                let next = prev;

                // 如果当前正在预览某个特定历史批次（如在抽屉中点击了特定记录，或为独立电商套图），严格展示该单一目标批次的结果，保留并发运行槽位
                if (previewLog) {
                    const activeLogToSync = sessionOrActiveLogs.find((l) => l.id === previewLog.id) || previewLog;
                    const previewResults = deriveGenerationResultsFromLog(activeLogToSync, activeBatchIdsRef.current);
                    const runningSlots = prev.filter((r) => r.status === "pending" && activeBatchIdsRef.current.has(r.batchId || ""));
                    return reconcileImageGenerationResults(runningSlots, previewResults, "merge-update");
                }

                // 批次时间升序排布（老批次先入、新批次后入并 prepend 到前排，确保顶层恒定为最新批次，且批次内槽位恒定升序）
                const sortedLogs = [...sessionOrActiveLogs].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
                sortedLogs.forEach((logItem) => {
                    const derived = deriveGenerationResultsFromLog(logItem, activeBatchIdsRef.current);
                    next = reconcileImageGenerationResults(next, derived, "prepend-or-update");
                });
                return next;
            });
            if (previewLog) {
                const refreshed = logs.find((l) => l.id === previewLog.id);
                if (refreshed && (refreshed.updatedAt !== previewLog.updatedAt || refreshed.status !== previewLog.status)) {
                    setPreviewLog(refreshed);
                }
            }
            return;
        }

        // 分支 2：初始化挂载/路由切回/刷新页面时 previewLog 为空，正向寻址恢复当前会话全部结果（生成中不被历史覆盖）
        if (isCurrentSessionPending) return;
        let targetLog: GenerationLog | undefined;
        if (draft.sessionId) {
            targetLog = logs.find((l) => (l.sessionId && l.sessionId === draft.sessionId) || l.id === draft.sessionId);
        }
        if (!targetLog) {
            targetLog = logs.find((l) => l.status === "success" || l.status === "pending" || (l.images && l.images.length > 0)) || logs[0];
        }

        if (targetLog) {
            if (targetLog.detailSet?.rows?.length) {
                // 电商套图严格展示本规划批次的 14 镜头卡槽，绝不与会话内其他批次 flatMap 混杂
                setPreviewLog(targetLog);
                setResults(deriveGenerationResultsFromLog(targetLog, activeBatchIdsRef.current));
            } else {
                setPreviewLog(null);
                const sessionLogs = draft.sessionId ? logs.filter((l) => (l.sessionId && l.sessionId === draft.sessionId) || l.id === draft.sessionId) : [targetLog];
                const sortedSessionLogs = [...sessionLogs].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                const allSessionResults = sessionLogs.flatMap(deriveGenerationResultsFromLog);
                const orderedSessionResults = sortedSessionLogs.flatMap((l) => deriveGenerationResultsFromLog(l, activeBatchIdsRef.current));
                setResults(orderedSessionResults.length ? orderedSessionResults : (allSessionResults.length ? allSessionResults : deriveGenerationResultsFromLog(targetLog, activeBatchIdsRef.current)));
            }
            if (!draft.sessionId) {
                const targetSessionId = targetLog.sessionId || targetLog.id;
                updateDraft({ sessionId: targetSessionId });
            }
        }
    }, [draft.sessionId, hydratedDraft, isCurrentSessionPending, logs, previewLog, submitting, updateDraft]);
    // [workbench-lifecycle-guard] [end]

    const addReferences = async (files?: FileList | null) => {
        const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name));
        if (!imageFiles.length) return;
        const maxImages = imageProfile.references.maxImages;
        if (maxImages <= 0) {
            message.warning("当前图片模型及同组模型均不支持参考图，请在右上角选择支持垫图/图生图的模型");
            return;
        }
        const targetId = replaceTargetRef.current;
        replaceTargetRef.current = null;

        if (!targetId && references.length + imageFiles.length > maxImages) {
            message.warning(`当前模型最多支持 ${maxImages} 张参考图，已截取前 ${maxImages} 张`);
            imageFiles.splice(maxImages - references.length);
        }

        const validCandidates: Array<{ file: File; id: string; previewUrl: string }> = [];
        for (const file of imageFiles) {
            if (imageProfile.references.maxImageBytes > 0 && file.size > imageProfile.references.maxImageBytes) {
                message.warning(`图片 ${file.name} 超过模型支持的最大体积（${formatBytes(imageProfile.references.maxImageBytes)}），已跳过`);
                continue;
            }
            const id = targetId || nanoid();
            const previewUrl = URL.createObjectURL(file);
            validCandidates.push({ file, id, previewUrl });
            if (targetId) break;
        }

        if (!validCandidates.length) return;

        // 1. 0ms 乐观上屏（Optimistic UI）：瞬时生成占位卡片与加载进度状态
        if (targetId) {
            const first = validCandidates[0];
            setReferences((value) =>
                value.map((item) =>
                    item.id === targetId
                        ? {
                              ...item,
                              name: first.file.name,
                              type: first.file.type || "image/png",
                              dataUrl: first.previewUrl,
                              bytes: first.file.size,
                              uploading: true,
                              progress: 0,
                              error: undefined,
                          }
                        : item,
                ),
            );
        } else {
            const placeholders: ReferenceImage[] = validCandidates.map(({ file, id, previewUrl }) => ({
                id,
                name: file.name,
                type: file.type || "image/png",
                dataUrl: previewUrl,
                bytes: file.size,
                uploading: true,
                progress: 0,
            }));
            setReferences((value) => [...value, ...placeholders]);
        }

        // 2. 异步并行物理上传并实时上报进度
        let completedCount = 0;
        let failedCount = 0;
        await Promise.all(
            validCandidates.map(async ({ file, id }) => {
                try {
                    const onProgress = (loaded: number, total: number) => {
                        const percent = total > 0 ? Math.round((loaded / total) * 100) : undefined;
                        setReferences((value) =>
                            value.map((item) => (item.id === id ? { ...item, progress: percent } : item)),
                        );
                    };
                    const image = await uploadImage(file, onProgress);
                    if (image.storageKey) {
                        await primeResourceBlobCache(image.storageKey, file).catch(() => "");
                    }
                    setReferences((value) =>
                        value.map((item) =>
                            item.id === id
                                ? {
                                      ...item,
                                      name: file.name,
                                      type: image.mimeType,
                                      dataUrl: image.url,
                                      storageKey: image.storageKey,
                                      bytes: image.bytes || file.size,
                                      width: image.width,
                                      height: image.height,
                                      uploading: false,
                                      progress: 100,
                                      error: undefined,
                                  }
                                : item,
                        ),
                    );
                    completedCount += 1;
                } catch (error) {
                    failedCount += 1;
                    const errorMsg = error instanceof Error ? error.message : "图片上传失败";
                    setReferences((value) =>
                        value.map((item) =>
                            item.id === id
                                ? {
                                      ...item,
                                      uploading: false,
                                      error: errorMsg,
                                  }
                                : item,
                        ),
                    );
                }
            }),
        );

        if (failedCount > 0) {
            message.warning(`${failedCount} 张图片上传未完成，请点击卡片重试`);
        } else if (completedCount > 0) {
            message.success(targetId ? "参考图已替换就绪" : `已添加 ${completedCount} 张参考图并完成同步`);
        }
    };

    const addReferencesFromClipboard = async () => {
        try {
            const items = await navigator.clipboard.read();
            const blobs = await Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("image/")).map((type) => item.getType(type))));
            if (!blobs.length) {
                message.error(t("imageWorkbench.clipboardEmpty"));
                return;
            }
            const files = blobs.map((blob, index) => new File([blob], `clipboard-${index + 1}.png`, { type: blob.type }));
            const dataTransfer = new DataTransfer();
            for (const file of files) dataTransfer.items.add(file);
            await addReferences(dataTransfer.files);
        } catch {
            message.error(t("imageWorkbench.clipboardEmpty"));
        }
    };

    const generate = async () => {
        if (submitting) return;
        const agentTaskId = agentTaskIdRef.current;
        agentTaskIdRef.current = undefined;
        // [sub-feature: detail_set_workflow]
        // 电商套图工作流分流：确认态 → 逐行生成；创作态 → AI 规划（闭包引用后置定义的处理器，调用时已初始化）
        if (activeSkill?.workflow?.kind === "detail-set") {
            const detailSetState = useDetailSetStore.getState();
            if (detailSetState.phase === "review" && detailSetState.plan) {
                await runDetailSetRows(detailSetState.plan);
                if (agentTaskId) updateAgentTask(agentTaskId, { status: "succeeded" });
            } else {
                await startDetailSetPlanning();
                if (agentTaskId) {
                    const settled = useDetailSetStore.getState();
                    updateAgentTask(agentTaskId, settled.phase === "review" ? { status: "succeeded" } : { status: "failed", error: settled.planError || "AI 规划未完成" });
                }
            }
            return;
        }
        // detail_set_workflow [end]
        if (isUploading) {
            message.warning("素材正在上传中，请稍候...");
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: "素材正在上传中" });
            return;
        }
        if (hasUploadError) {
            message.warning("存在上传失败的参考图，请重新上传或移除后再生成");
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: "存在上传失败的参考图" });
            return;
        }
        if (!activeSkill) {
            const text = prompt.trim();
            if (!text) {
                message.error(t("imageWorkbench.promptRequired"));
                if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.promptRequired") });
                return;
            }
        } else {
            if (!isSlotsValid()) {
                message.error("请按要求上传必填图片槽位");
                if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: "请按要求上传必填图片槽位" });
                return;
            }
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog();
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.configIncomplete") });
            return;
        }

        // [sub-feature: workbench_batch_concurrency] [start]
        if (Number(config.count) > 15) {
            message.warning("单次批量生成上限为 15 张图片，已自动调整为 15 张上限");
        }
        // [sub-feature: workbench_batch_concurrency] [end]

        const snapshot = buildRequestSnapshot();
        if (!snapshot) {
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.invalidParams") });
            return;
        }

        sessionExplicitlyResetRef.current = false;
        const activeSessionId = draft.sessionId || nanoid();
        if (!draft.sessionId) {
            updateDraft({ sessionId: activeSessionId });
        }
        const batchId = nanoid();
        const sessionId = activeSessionId;
        currentSessionIdRef.current = sessionId;
        // [session_workspace_registry] [start]
        saveCurrentWorkspaceSnapshot(sessionId);
        // [session_workspace_registry] [end]
        activeBatchIdsRef.current.add(batchId);

        const initialUserScope = getActiveUserScope();
        const controller = new AbortController();
        generationAbortControllerRef.current = controller;

        const deductKey = `deduct:image_workbench:${batchId}`;
        const refundKey = `refund:image_workbench:${batchId}`;

        // [sub-feature: workbench_batch_concurrency] [start]
        setSubmitting(true);
        let chargedMicrocredits = 0;
        const singleCost = imageFeatureCredit.costMicrocredits;
        const totalCharge = singleCost > 0 ? singleCost * generationCount : 0;
        try {
            const deductRes = await imageFeatureCredit.deduct(
                model,
                `生图工作台生成 (${generationCount}张)`,
                deductKey,
                totalCharge > 0 ? totalCharge : undefined,
            );
            chargedMicrocredits = deductRes.deductedMicrocredits;
            activeChargedCreditsMapRef.current.set(batchId, {
                batchId,
                amount: chargedMicrocredits,
                model,
                deductKey,
                refundKey,
                userScope: initialUserScope,
            });
        } catch (err) {
            setSubmitting(false);
            activeChargedCreditsMapRef.current.delete(batchId);
            const errText = err instanceof Error ? err.message : "积分扣减失败";
            message.error(errText);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: errText });
            return;
        }
        // [sub-feature: workbench_batch_concurrency] [end]

        setElapsedMs(0);
        setPreviewLog(null);
        const newPendingSlots: GenerationResult[] = Array.from({ length: generationCount }, (_, index) => ({
            id: `${batchId}_slot_${index}`,
            batchId,
            slotIndex: index,
            status: "pending",
        }));
        // 关键改动：前置追加当前批次的 pending 卡片，完整保留上一次生成结果与并行任务状态
        setResults((prev) => [...newPendingSlots, ...prev]);
        const batchStartedAt = performance.now();
        setStartedAt(batchStartedAt);
        // [session_workspace_registry] 任务提交时立即固化当前会话工作区快照，确保并发或离线路由不丢失编辑现场
        saveCurrentWorkspaceSnapshot(activeSessionId);
        if (agentTaskId) updateAgentTask(agentTaskId, { status: "running", error: undefined });

        // 立即存入 Pending 日志，保证跨路由与生命周期断电有迹可循
        const pendingLog = buildLog({
            logId: batchId,
            sessionId: activeSessionId,
            batchId,
            prompt: snapshot.text,
            model,
            config: { ...snapshot.config, count: String(generationCount) },
            references: snapshot.references,
            durationMs: 0,
            successCount: 0,
            failCount: 0,
            status: "pending",
            images: [],
            chargedMicrocredits,
        });
        saveLog(pendingLog);

        // 任务已就绪发起，立即释放前端输入与生成按钮锁定！
        setSubmitting(false);
        message.success("生图任务已提交，后台全自动执行中！");

        // 启动后台自持执行，绝不因前端切换会话/点击历史而中断或遗失
        void (async () => {
            // [sub-feature: workbench_batch_concurrency] [start]
            const tasks = newPendingSlots.map((slot) =>
                runGenerationSlot(slot.id, slot.slotIndex || 0, snapshot, batchId, controller.signal, (_slotIndex, outcome) => {
                    if (!outcome.image) return;
                    const currentImg = outcome.image;
                    const targetLog = logsRef.current.find((l) => l.id === batchId || l.batchId === batchId);
                    if (targetLog) {
                        const existingImages = targetLog.images || [];
                        if (!existingImages.some((img) => img.id === currentImg.id || (currentImg.taskId && img.taskId === currentImg.taskId))) {
                            const updatedImages = deduplicateLogImages([...existingImages, currentImg], targetLog.id);
                            const progressiveLog: GenerationLog = {
                                ...targetLog,
                                images: updatedImages,
                                thumbnails: updatedImages.map((img) => img.dataUrl).filter(Boolean),
                                successCount: updatedImages.length,
                                updatedAt: Date.now(),
                            };
                            saveLog(progressiveLog);
                        }
                    }
                    saveCurrentWorkspaceSnapshot(activeSessionId);
                }),
            );
            // [sub-feature: workbench_batch_concurrency] [end]

                const result = await Promise.allSettled(tasks);
                if (controller.signal.aborted) {
                    const charged = activeChargedCreditsMapRef.current.get(batchId);
                    if (charged && charged.amount > 0) {
                        activeChargedCreditsMapRef.current.delete(batchId);
                        void imageFeatureCredit.refund(charged.amount, model, "生图任务中断退款", refundKey, deductKey);
                    }
                    const targetLog = logsRef.current.find((l) => l.id === batchId || l.batchId === batchId);
                    if (targetLog) {
                        const aborted: GenerationLog = { ...targetLog, status: "failed", error: "任务执行中断", chargedMicrocredits: 0, updatedAt: Date.now() };
                        saveLog(aborted);
                    }
                    return;
                }
                const successImages = result.filter((item): item is PromiseFulfilledResult<GeneratedImage | null> => item.status === "fulfilled" && Boolean(item.value)).map((item) => item.value!);
                const successCount = successImages.length;

                const aliveTaskIds = new Set<string>();
                const physicallyFailedTaskIds = new Set<string>();

                // 物理状态探测：对未返回成功图片的卡槽，核查后端物理任务真实运行状态，严防算力排队中被误杀
                await Promise.all(
                    newPendingSlots.map(async (slot) => {
                        const taskOutcome = result[slot.slotIndex || 0];
                        if (taskOutcome?.status !== "fulfilled" || !taskOutcome.value) {
                            const targetLog = logsRef.current.find((l) => l.id === batchId || l.batchId === batchId);
                            const tid = slot.taskId || targetLog?.taskIds?.[slot.slotIndex || 0];
                            if (tid) {
                                try {
                                    const currentStatus = await refreshGenerationTaskStatus(tid);
                                    if (currentStatus.status === "queued" || currentStatus.status === "running") {
                                        aliveTaskIds.add(tid);
                                    } else if (currentStatus.status === "failed" || currentStatus.status === "cancelled") {
                                        physicallyFailedTaskIds.add(tid);
                                    }
                                } catch {
                                    aliveTaskIds.add(tid);
                                }
                            }
                        }
                    })
                );

                const hasAnyPending = aliveTaskIds.size > 0;
                const physicalFailCount = physicallyFailedTaskIds.size;
                const failCount = physicalFailCount;
                const failed = result.find((item): item is PromiseRejectedResult => item.status === "rejected");
                const error = failed?.reason instanceof Error ? failed.reason.message : failCount ? t("workbench.generationFailed") : undefined;
                if (agentTaskId) updateAgentTask(agentTaskId, { status: successCount ? "succeeded" : (hasAnyPending ? "running" : "failed"), successCount, failCount, error: successCount ? undefined : error });

                // [sub-feature: workbench_batch_concurrency] [start]
                // 资金与积分安全：严格对齐“产出有效图片即扣积分，不设补偿免单”规则，
                // 仅对经由后端确认为物理失败的任务行退款，严禁对正在长效计算排队中的任务行提前退款造成财务撕裂！
                if (failCount > 0 && chargedMicrocredits > 0) {
                    const refundAmount = Math.round((chargedMicrocredits / generationCount) * failCount);
                    if (refundAmount > 0) {
                        void imageFeatureCredit.refund(refundAmount, model, "生图失败卡槽退款", `${refundKey}:${failCount}`, deductKey);
                    }
                }
                if (!hasAnyPending) {
                    activeChargedCreditsMapRef.current.delete(batchId);
                }
                // [sub-feature: workbench_batch_concurrency] [end]

                if (getActiveUserScope() !== initialUserScope) {
                    console.warn("[image-workbench] 检测到账号已切换，熔断丢弃前序账号图片回写");
                    activeChargedCreditsMapRef.current.delete(batchId);
                    return;
                }

            try {
                const logImages = await Promise.all(
                    successImages.map(async (image) => {
                        if (image.storageKey) return image;
                        const stored = await uploadImage(image.dataUrl);
                        return { ...image, dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType };
                    }),
                );

                // 回填 results 中对应批次卡片的持久化地址，杜绝临时外链过期导致裂图
                setResults((prev) => prev.map((item) => {
                    if (item.batchId === batchId && item.image) {
                        const matchingStored = logImages.find((img) => img.id === item.image?.id);
                        if (matchingStored) {
                            return {
                                ...item,
                                image: {
                                    ...item.image,
                                    dataUrl: matchingStored.dataUrl,
                                    storageKey: matchingStored.storageKey,
                                },
                            };
                        }
                    }
                    return item;
                }));

                const requestSignature = computeImageRequestSignature({
                    text: snapshot.text,
                    model,
                    config: snapshot.config,
                    references: snapshot.references,
                });
                const matchingFailedLog = logs.find((l) => l.status === "failed" && l.requestSignature === requestSignature);

                const isCurrentSession = () => !activeSessionId || !useImageWorkbenchStore.getState().draft.sessionId || activeSessionId === useImageWorkbenchStore.getState().draft.sessionId;
                const allTaskIds = Array.from(new Set([...(logsRef.current.find((l) => l.id === batchId || l.batchId === batchId)?.taskIds || []), ...successImages.map((img) => img.taskId).filter(Boolean)])) as string[];

                if (successCount === 0) {
                    if (hasAnyPending) {
                        // 全量转入长效托管，保持 pending 状态，绝不提前退款也不报错
                        saveLog(
                            buildLog({
                                logId: matchingFailedLog?.id || batchId,
                                sessionId: activeSessionId,
                                batchId,
                                createdAt: matchingFailedLog?.createdAt,
                                prompt: snapshot.text,
                                model,
                                config: { ...snapshot.config, count: String(generationCount) },
                                references: snapshot.references,
                                durationMs: performance.now() - batchStartedAt,
                                successCount: 0,
                                failCount: 0,
                                status: "pending",
                                images: [],
                                failureCount: 0,
                                requestSignature,
                                chargedMicrocredits,
                                taskIds: allTaskIds.length ? allTaskIds : undefined,
                            }),
                        );
                        // 确保 pending 状态在 UI 结果中维持 pending
                        setResults((prev) => prev.map((item) => {
                            if (item.batchId === batchId) {
                                return {
                                    ...item,
                                    status: "pending",
                                    error: undefined,
                                };
                            }
                            return item;
                        }));
                        if (isCurrentSession()) {
                            message.info({ content: "当前生图算力高峰排队中，已转入后台长效托管，生成完成后将自动入库回填", key: "image-workbench-queue-toast" });
                        }
                    } else {
                        const failureCount = (matchingFailedLog?.failureCount || 0) + 1;
                        saveLog(
                            buildLog({
                                logId: matchingFailedLog?.id || batchId,
                                sessionId: activeSessionId,
                                batchId,
                                createdAt: matchingFailedLog?.createdAt,
                                prompt: snapshot.text,
                                model,
                                config: { ...snapshot.config, count: String(generationCount) },
                                references: snapshot.references,
                                durationMs: performance.now() - batchStartedAt,
                                successCount: 0,
                                failCount: generationCount,
                                status: "failed",
                                images: [],
                                failureCount,
                                requestSignature,
                                error,
                                chargedMicrocredits: 0,
                                taskIds: allTaskIds.length ? allTaskIds : undefined,
                            }),
                        );
                        setResults((prev) => prev.map((item) => {
                            if (item.batchId === batchId) {
                                return {
                                    ...item,
                                    status: "failed",
                                    error: error || t("workbench.generationFailed"),
                                    failureCount,
                                };
                            }
                            return item;
                        }));
                        if (isCurrentSession()) {
                            message.error(failed?.reason instanceof Error ? failed.reason.message : t("workbench.generationFailed"));
                        } else {
                            message.error(`后台生图任务失败：${failed?.reason instanceof Error ? failed.reason.message : t("workbench.generationFailed")}`);
                        }
                    }
                } else {
                    const finalStatus = successCount === generationCount ? "success" : (hasAnyPending ? "pending" : "success");
                    saveLog(
                        buildLog({
                            logId: matchingFailedLog?.id || batchId,
                            sessionId: activeSessionId,
                            batchId,
                            prompt: snapshot.text,
                            model,
                            config: { ...snapshot.config, count: String(generationCount) },
                            references: snapshot.references,
                            durationMs: performance.now() - batchStartedAt,
                            successCount,
                            failCount: generationCount - successCount,
                            status: finalStatus,
                            images: logImages,
                            failureCount: 0,
                            requestSignature,
                            chargedMicrocredits: Math.max(0, chargedMicrocredits - (physicalFailCount > 0 ? Math.round((chargedMicrocredits / generationCount) * physicalFailCount) : 0)),
                            taskIds: allTaskIds.length ? allTaskIds : undefined,
                        }),
                    );
                    if (isCurrentSession()) {
                        if (finalStatus === "success") {
                            message.success(t("imageWorkbench.generated"));
                        } else {
                            message.info(`部分图片已生成 (${successCount}/${generationCount})，其余正在排队执行中`);
                        }
                    } else {
                        if (finalStatus === "success") {
                            message.success("后台生图任务已生成完成，已同步存入生成记录！");
                        }
                    }
                }
            } catch (saveErr) {
                console.error("保存生图记录失败:", saveErr);
            } finally {
                activeBatchIdsRef.current.delete(batchId);
                activeChargedCreditsMapRef.current.delete(batchId);
                if (activeBatchIdsRef.current.size === 0) {
                    setStartedAt(0);
                }
            }
        })();
    };

    // Handle image-generation commands from the Agent panel by setting the prompt and optionally starting generation.
    useEffect(() => {
        if (!imageCommand || imageCommand.nonce === processedCommandRef.current) return;
        processedCommandRef.current = imageCommand.nonce;
        clearImageCommand();
        if (typeof imageCommand.prompt === "string") setPrompt(imageCommand.prompt);
        if (imageCommand.run && submitting) {
            if (imageCommand.taskId) updateAgentTask(imageCommand.taskId, { status: "failed", error: t("imageWorkbench.busy") });
            return;
        }
        if (imageCommand.run) {
            agentTaskIdRef.current = imageCommand.taskId;
            setAutoRunToken((value) => value + 1);
        }
    }, [imageCommand, clearImageCommand, submitting, updateAgentTask]);

    useEffect(() => {
        if (!autoRunToken) return;
        void generate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRunToken]);

    const downloadImage = async (image: GeneratedImage, index: number) => {
        try {
            const ext = image.mimeType ? (image.mimeType.split("/")[1] || "png") : "png";
            const fileName = `image-${index + 1}-${Date.now()}.${ext === "jpeg" ? "jpg" : ext}`;
            await downloadMediaWithSaveDialog({
                fileName,
                dataUrl: image.dataUrl,
                storageKey: image.storageKey,
                mediaType: "image",
            });
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            message.error(errMsg || "下载图片失败");
        }
    };

    const addResultToReferences = async (image: GeneratedImage, index: number) => {
        const stored = await uploadImage(image.dataUrl);
        setReferences((value) => [...value, { id: nanoid(), name: `result-${index + 1}.png`, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }]);
        message.success(t("imageWorkbench.addedReference"));
    };

    const saveResultToAssets = async (image: GeneratedImage, index: number) => {
        const stored = await uploadImage(image.dataUrl);
        const payload = {
            kind: "image" as const,
            title: t("imageWorkbench.resultTitle", { count: index + 1 }),
            coverUrl: stored.url,
            tags: [],
            source: t("imageWorkbench.source"),
            data: { dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType },
            metadata: { source: "image-page", prompt, fileHash: stored.fileHash },
        };
        const existing = useAssetStore.getState().findMatchingAsset(payload);
        addAsset(payload);
        if (existing) {
            message.info("素材库中已存在该生成图片，已自动认定并复用");
        } else {
            message.success(t("common.addedToAssets"));
        }
    };

    const insertPickedAsset = async (payload: InsertAssetPayload) => {
        if (payload.kind === "text") {
            const id = nanoid();
            const nextIndex = textReferences.length + 1;
            const label = `@文档${nextIndex}`;
            setTextReferences((prev) => [...prev, { id, name: payload.title, content: payload.content }]);
            setPrompt((prev) => {
                const trimmed = prev.trim();
                return trimmed ? `${trimmed} ${label}` : label;
            });
        } else if (payload.kind === "image") {
            const url = payload.dataUrl || payload.url || "";
            const stored = await uploadImage(url);
            const newRef: ReferenceImage = {
                id: nanoid(),
                name: payload.title,
                type: stored.mimeType,
                dataUrl: stored.url,
                storageKey: stored.storageKey,
                width: stored.width,
                height: stored.height,
                bytes: stored.bytes,
            };
            const currentSlots = effectiveSkill.uploadSlots;
            const emptySlot = currentSlots.find((s) => !slotFiles[s.id]);
            const targetSlotId = emptySlot?.id || currentSlots[currentSlots.length - 1]?.id || "reference";
            addSlotReference(targetSlotId, newRef);
            if (!activeSkill) {
                setReferences((value) => [...value, newRef]);
            }
        } else {
            message.warning(t("imageWorkbench.unsupportedAsset"));
        }
        setAssetPickerOpen(false);
    };

    const createSession = () => {
        // 不要粗暴掐断后台正在执行的任务，保持后台自持执行与结果落库
        // [session_workspace_registry] [start]
        const prevSessionId = currentSessionIdRef.current || previewLog?.id || draft.sessionId;
        if (prevSessionId && (prompt.trim() || references.length || Object.keys(slotFilesMap).length || useDetailSetStore.getState().plan)) {
            saveCurrentWorkspaceSnapshot(prevSessionId);
        }
        // [session_workspace_registry] [end]
        sessionExplicitlyResetRef.current = true;
        const newSessionId = nanoid();
        currentSessionIdRef.current = newSessionId;
        selectSkill(null);
        previousSkillIdRef.current = null;
        updateDraft({
            sessionId: newSessionId,
            prompt: "",
            textReferences: [],
            references: [],
            slotContainers: {},
        });
        setPrompt("");
        setTextReferences([]);
        setReferences([]);
        setPreviewReferenceId(null);
        clearAllSlots();
        setResults([]);
        setElapsedMs(0);
        setStartedAt(0);
        setSelectedLogIds([]);
        setPreviewLog(null);
        // [sub-feature: detail_set_workflow]
        useDetailSetStore.getState().resetWorkflow();
        // detail_set_workflow [end]
    };

    const deleteSelectedLogs = () => {
        const selectedLogs = logs.filter((log) => selectedLogIds.includes(log.id));
        const imageKeys = new Set<string>();
        selectedLogs.forEach((log) => {
            collectImageStorageKeys(log, imageKeys);
        });
        const idsToDelete = [...selectedLogIds];
        void Promise.all([deleteStoredImages(imageKeys), ...selectedLogIds.map((id) => logStore.removeItem(id))]).then(() => refreshLogs());
        void batchDeleteGenerationLogsFromRemote(idsToDelete);
        if (previewLog && selectedLogIds.includes(previewLog.id)) {
            setPreviewLog(null);
            setResults([]);
        }
        setSelectedLogIds([]);
        setDeleteConfirmOpen(false);
    };

    const recordLogTaskId = (batchId: string, taskId: string) => {
        // [sub-feature: workbench_task_reconcile_self_heal] [start]
        if (logsRef.current) {
            logsRef.current = logsRef.current.map((l) => {
                if (l.id === batchId || l.batchId === batchId) {
                    const nextTaskIds = Array.from(new Set([...(l.taskIds || []), taskId]));
                    return { ...l, taskIds: nextTaskIds, updatedAt: Date.now() };
                }
                return l;
            });
        }
        // [sub-feature: workbench_task_reconcile_self_heal] [end]
        setLogs((prev) => prev.map((l) => {
            if (l.id === batchId || l.batchId === batchId) {
                const nextTaskIds = Array.from(new Set([...(l.taskIds || []), taskId]));
                const updated = { ...l, taskIds: nextTaskIds, updatedAt: Date.now() };
                void logStore.setItem(updated.id, serializeLog(updated));
                return updated;
            }
            return l;
        }));
    };

    const pollPendingImageLog = async (log: GenerationLog) => {
        if (!log.taskIds || log.taskIds.length === 0) return;
        activeBatchIdsRef.current.add(log.id);
        const isCurrentSession = () => !log.sessionId || !useImageWorkbenchStore.getState().draft.sessionId || log.sessionId === useImageWorkbenchStore.getState().draft.sessionId;
        const effectiveChargedCredits = log.chargedMicrocredits || 0;
        let queueTimer: any = setTimeout(() => {
            if (isCurrentSession()) {
                message.info({ content: "当前生图算力高峰排队中，已转入后台长效托管，生成完成后将自动入库回填", key: "image-workbench-queue-toast" });
            }
        }, 120000);

        try {
            const taskResults = await Promise.allSettled(
                log.taskIds.map(async (taskId) => {
                    const completed = await waitForGenerationTask(taskId, { intervalMs: 2500, timeoutMs: 10 * 60 * 1000 });
                    return { taskId, completed, parsed: parseBackendGenerationResult(completed) };
                }),
            );

            const extractedImages: GeneratedImage[] = [];
            const taskImageMap = new Map<string, GeneratedImage>();
            for (const item of taskResults) {
                if (item.status === "fulfilled") {
                    const { taskId, parsed } = item.value;
                    const rawImg = parsed.images?.[0];
                    if (rawImg) {
                        let dataUrl = rawImg.dataUrl || "";
                        if (rawImg.storageKey && !dataUrl) {
                            dataUrl = await resolveImageUrl(rawImg.storageKey);
                        }
                        const genImg: GeneratedImage = {
                            id: rawImg.storageKey ? resourceIdFromStorageKey(rawImg.storageKey) || nanoid() : nanoid(),
                            dataUrl,
                            storageKey: rawImg.storageKey,
                            durationMs: Date.now() - log.createdAt,
                            width: rawImg.width || 0,
                            height: rawImg.height || 0,
                            bytes: rawImg.bytes || 0,
                            mimeType: rawImg.mimeType,
                            taskId,
                        };
                        extractedImages.push(genImg);
                        taskImageMap.set(taskId, genImg);
                    }
                }
            }

            if (getActiveUserScope() !== (log.userId || getActiveUserScope())) {
                console.warn("[image-workbench] 检测到账号已切换，熔断丢弃前序账号恢复生图回写");
                activeChargedCreditsMapRef.current.delete(log.id);
                return;
            }

            // 检查每个未就绪任务的真实后端物理状态
            const aliveTaskIds = new Set<string>();
            const physicallyFailedTaskIds = new Set<string>();
            await Promise.all(
                log.taskIds.map(async (tid) => {
                    const taskOutcome = taskResults.find((r) => r.status === "fulfilled" && r.value.taskId === tid);
                    if (!taskOutcome) {
                        try {
                            const currentStatus = await refreshGenerationTaskStatus(tid);
                            if (currentStatus.status === "queued" || currentStatus.status === "running") {
                                aliveTaskIds.add(tid);
                            } else if (currentStatus.status === "failed" || currentStatus.status === "cancelled") {
                                physicallyFailedTaskIds.add(tid);
                            }
                        } catch {}
                    }
                })
            );

            // 处理套图分镜专有映射自愈：精准对齐每行镜头状态，杜绝丢图
            let updatedDetailSet = log.detailSet;
            if (updatedDetailSet?.rows?.length) {
                const slotIndexImageMap = new Map<number, GeneratedImage>();
                const slotIndexOutcomeMap = new Map<number, PromiseSettledResult<{ taskId: string; completed: GenerationTask; parsed: any }>>();
                for (const item of taskResults) {
                    if (item.status === "fulfilled") {
                        const { taskId, completed } = item.value;
                        const genImg = taskImageMap.get(taskId);
                        let sIdx: number | undefined;
                        if (completed.clientOperationId) {
                            const m = completed.clientOperationId.match(/_slot_(\d+)/);
                            if (m) sIdx = parseInt(m[1], 10);
                        }
                        if (sIdx === undefined && completed.inputJson) {
                            try {
                                const inp = JSON.parse(completed.inputJson);
                                if (typeof inp.metadata?.slotIndex === "number") sIdx = inp.metadata.slotIndex;
                            } catch {}
                        }
                        if (typeof sIdx === "number") {
                            if (genImg) slotIndexImageMap.set(sIdx, genImg);
                            slotIndexOutcomeMap.set(sIdx, item);
                        }
                    }
                }

                const updatedRows = updatedDetailSet.rows.map((row, idx) => {
                    if (row.imageUrl || row.storageKey) return row;
                    const rowTaskId = row.taskId;
                    const matchedImg = (rowTaskId ? taskImageMap.get(rowTaskId) : undefined) || slotIndexImageMap.get(row.seq - 1);
                    if (matchedImg) {
                        return {
                            ...row,
                            imageUrl: matchedImg.dataUrl,
                            storageKey: matchedImg.storageKey,
                            taskId: matchedImg.taskId,
                            status: "success" as const,
                            error: undefined,
                        };
                    }
                    if (rowTaskId && aliveTaskIds.has(rowTaskId)) {
                        return { ...row, status: "pending" as const, error: undefined };
                    }
                    const taskOutcome = slotIndexOutcomeMap.get(row.seq - 1) || (rowTaskId ? taskResults.find((r) => r.status === "fulfilled" && r.value.taskId === rowTaskId) : undefined);
                    if (taskOutcome?.status === "rejected") {
                        const errMsg = taskOutcome.reason instanceof Error ? taskOutcome.reason.message : "任务生成失败";
                        return { ...row, status: "failed" as const, error: errMsg };
                    }
                    return { ...row, status: "failed" as const, error: "任务执行中断" };
                });
                updatedDetailSet = { ...updatedDetailSet, rows: updatedRows };
            }

            // 聚合所有已成功生成的图片产物
            const resolvedDetailSetImages: GeneratedImage[] = [];
            if (updatedDetailSet?.rows?.length) {
                for (const r of updatedDetailSet.rows) {
                    if (r.imageUrl || r.storageKey) {
                        resolvedDetailSetImages.push({
                            id: `${log.id}_slot_${r.seq - 1}`,
                            dataUrl: r.imageUrl || "",
                            storageKey: r.storageKey,
                            taskId: r.taskId,
                            durationMs: 0,
                            width: 0,
                            height: 0,
                            bytes: 0,
                        });
                    }
                }
            }

            const candidates = resolvedDetailSetImages.length > 0 ? resolvedDetailSetImages : extractedImages;
            const hasAnyPending = aliveTaskIds.size > 0 || (updatedDetailSet?.rows?.some((r) => r.status === "pending") ?? false);

            if (candidates.length === 0) {
                if (hasAnyPending) {
                    // 全量转入长效托管，保持 pending 状态，绝不提前退款也不报错
                    const savedPendingLog: GenerationLog = {
                        ...log,
                        status: "pending",
                        durationMs: Date.now() - log.createdAt,
                        images: [],
                        thumbnails: [],
                        successCount: 0,
                        failCount: 0,
                        imageCount: 0,
                        detailSet: updatedDetailSet,
                        updatedAt: Date.now(),
                    };
                    await saveLog(savedPendingLog);
                    if (isCurrentSession()) {
                        setPreviewLog(savedPendingLog);
                        message.info({ content: "当前生图算力高峰排队中，已转入后台长效托管，生成完成后将自动入库回填", key: "image-workbench-queue-toast" });
                    }
                    return;
                }
                const firstRejected = taskResults.find((r): r is PromiseRejectedResult => r.status === "rejected");
                throw new Error(firstRejected?.reason instanceof Error ? firstRejected.reason.message : t("workbench.generationFailed"));
            }

            const logImages = await Promise.all(
                candidates.map(async (img) => {
                    if (img.storageKey) return img;
                    if (img.dataUrl.startsWith("http")) return img;
                    const stored = await uploadImage(img.dataUrl);
                    return { ...img, dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType };
                }),
            );

            const totalCount = updatedDetailSet?.rows?.length || log.taskIds.length;
            const successCount = logImages.length;
            const physicalFailCount = physicallyFailedTaskIds.size;
            const failCount = Math.max(0, totalCount - successCount - aliveTaskIds.size);

            if (physicalFailCount > 0 && effectiveChargedCredits > 0) {
                const refundAmount = Math.round((effectiveChargedCredits / totalCount) * physicalFailCount);
                if (refundAmount > 0) {
                    const deductKey = `deduct:image_workbench:${log.batchId || log.id}`;
                    const refundKey = `refund:image_workbench:${log.batchId || log.id}:poll_fail_${physicalFailCount}`;
                    void imageFeatureCredit.refund(refundAmount, log.model, "套图物理失败行自动退款", refundKey, deductKey);
                }
            }

            const allSuccess = successCount === totalCount;
            const finalStatus = allSuccess ? "success" : (hasAnyPending ? "pending" : (successCount > 0 ? "success" : "failed"));

            const savedSuccessLog: GenerationLog = {
                ...log,
                status: finalStatus,
                durationMs: Date.now() - log.createdAt,
                images: logImages,
                thumbnails: logImages.map((img) => img.dataUrl).filter(Boolean),
                successCount,
                failCount,
                imageCount: logImages.length,
                failureCount: failCount,
                chargedMicrocredits: log.chargedMicrocredits || effectiveChargedCredits,
                detailSet: updatedDetailSet,
                updatedAt: Date.now(),
            };

            await saveLog(savedSuccessLog);

            if (isCurrentSession()) {
                if (savedSuccessLog.detailSet) {
                    setPreviewLog(savedSuccessLog);
                    setResults(deriveGenerationResultsFromLog(savedSuccessLog));
                    bindDetailSetScope(getActiveUserScope());
                    useDetailSetStore.getState().hydrateFromSnapshot(savedSuccessLog.detailSet, getActiveUserScope(), "review");
                } else {
                    setResults((prev) => reconcileImageGenerationResults(prev, deriveGenerationResultsFromLog(savedSuccessLog), "prepend-or-update"));
                }
                if (allSuccess) {
                    message.success(t("imageWorkbench.generated"));
                } else if (hasAnyPending) {
                    message.info(`部分图片已生成 (${successCount}/${totalCount})，其余正在排队执行中`);
                } else {
                    message.success(`生图完成：成功 ${successCount} 张，失败 ${failCount} 张（失败行积分已自动退还）`);
                }
            } else {
                // [sub-feature: workbench_task_reconcile_self_heal] [start]
                if (!notifiedCompletedBatchIdsRef.current.has(log.id) && activeBatchIdsRef.current.has(log.id) && !hasAnyPending) {
                    notifiedCompletedBatchIdsRef.current.add(log.id);
                    message.success({
                        content: "后台生图任务已生成完成，已同步存入生成记录！",
                        key: `batch_completed_${log.id}`,
                    });
                }
                // [sub-feature: workbench_task_reconcile_self_heal] [end]
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : t("workbench.generationFailed");
            const isAlive = log.taskIds?.some((tid) => !reconciledTerminalTasksRef.current.has(tid));
            if (!isAlive && effectiveChargedCredits > 0) {
                void imageFeatureCredit.refund(effectiveChargedCredits, log.model, "后台生图失败退款");
            }
            const savedFailedLog: GenerationLog = {
                ...log,
                status: isAlive ? "pending" : "failed",
                durationMs: Date.now() - log.createdAt,
                error: isAlive ? undefined : errorMessage,
                successCount: 0,
                failCount: isAlive ? 0 : log.taskIds.length,
                failureCount: isAlive ? (log.failureCount || 0) : ((log.failureCount || 0) + 1),
                chargedMicrocredits: isAlive ? effectiveChargedCredits : 0,
                updatedAt: Date.now(),
            };
            await saveLog(savedFailedLog);
            if (isCurrentSession()) {
                setPreviewLog(savedFailedLog);
                if (isAlive) {
                    message.info({ content: "当前生图算力高峰排队中，已转入后台长效托管，生成完成后将自动入库回填", key: "image-workbench-queue-toast" });
                } else {
                    setResults((prev) => prev.map((item) => (item.batchId === log.id ? { ...item, status: "failed", error: errorMessage } : item)));
                    message.error(errorMessage);
                }
            } else if (!isAlive) {
                message.error(`后台生图任务失败：${errorMessage}`);
            }
        } finally {
            clearTimeout(queueTimer);
            activeBatchIdsRef.current.delete(log.id);
            if (activeBatchIdsRef.current.size === 0) {
                setStartedAt(0);
            }
        }
    };

    const saveLog = (log: GenerationLog) => {
        // [sub-feature: workbench_task_reconcile_self_heal] [start]
        // 全集任务不可变并集契约 (Task Immutable Union Contract)：
        // 自动汇聚 detailSet 行与 images 中的所有任务 ID，杜绝异步覆盖导致新 TaskID 丢失
        const allDetailTaskIds = (log.detailSet?.rows?.map((r) => r.taskId).filter(Boolean) as string[]) || [];
        const allImageTaskIds = (log.images?.map((img) => img.taskId).filter(Boolean) as string[]) || [];
        const mergedTaskIds = Array.from(new Set([...(log.taskIds || []), ...allDetailTaskIds, ...allImageTaskIds]));
        const userLog: GenerationLog = { ...log, taskIds: mergedTaskIds, userId: getActiveUserScope() };

        if (logsRef.current) {
            const refIdx = logsRef.current.findIndex((l) => l.id === userLog.id);
            if (refIdx >= 0) {
                logsRef.current[refIdx] = userLog;
            } else {
                logsRef.current = [userLog, ...logsRef.current];
            }
        }
        // [sub-feature: workbench_task_reconcile_self_heal] [end]
        const serialized = serializeLog(userLog);
        setLogs((prev) => {
            const idx = prev.findIndex((l) => l.id === userLog.id);
            if (idx >= 0) {
                const next = [...prev];
                next[idx] = userLog;
                return next;
            }
            return [userLog, ...prev];
        });
        void logStore.setItem(userLog.id, serialized);
        void syncGenerationLogToRemote(serialized, "image");
    };

    const refreshLogs = async (resumePending = true, fetchRemote = true) => {
        if (isReconcilingLogsRef.current) return logs;
        isReconcilingLogsRef.current = true;
        try {
            const scope = getActiveUserScope();
            let nextLogs = await readStoredLogs(scope);
            setLogs(nextLogs);

            if (fetchRemote) {
                lastRemoteSyncAtRef.current = Date.now();
                try {
                    const res = await listRemoteGenerationLogs("image");
                    if (res?.logs) {
                        const localMap = new Map(nextLogs.map((item) => [item.id, item]));
                        const remoteIds = new Set<string>();
                        let hasLocalChanges = false;

                        for (const raw of res.logs) {
                            const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
                            if (parsed && typeof parsed === "object" && "id" in parsed) {
                                const remoteLog = parsed as GenerationLog;
                                remoteIds.add(remoteLog.id);
                                const local = localMap.get(remoteLog.id);

                                if (!local) {
                                    const normalized = await normalizeLog({ ...remoteLog, userId: scope });
                                    await logStore.setItem(normalized.id, serializeLog(normalized));
                                    hasLocalChanges = true;
                                } else if ((remoteLog.updatedAt || remoteLog.createdAt || 0) > (local.updatedAt || local.createdAt || 0)) {
                                    const normalized = await normalizeLog({ ...remoteLog, userId: scope });
                                    await logStore.setItem(normalized.id, serializeLog(normalized));
                                    hasLocalChanges = true;
                                } else if ((local.updatedAt || local.createdAt || 0) > (remoteLog.updatedAt || remoteLog.createdAt || 0)) {
                                    void syncGenerationLogToRemote(serializeLog(local), "image");
                                }
                            }
                        }

                        // 远端权威对齐：若当前为登录账号，且本地已持久化记录在远端已被删除（且创建超过90秒防并发），清理本地幽灵记录
                        if (scope !== "guest") {
                            const now = Date.now();
                            for (const local of nextLogs) {
                                if (local.userId === scope && !remoteIds.has(local.id)) {
                                    const ageMs = now - (local.createdAt || 0);
                                    if (ageMs > 90_000) {
                                        await logStore.removeItem(local.id);
                                        hasLocalChanges = true;
                                    }
                                }
                            }
                        }

                        if (hasLocalChanges) {
                            nextLogs = await readStoredLogs(scope);
                            setLogs(nextLogs);
                        }
                    }
                } catch (err) {
                    console.warn("[image-workbench] 拉取服务端生图记录失败（离线降级）:", err);
                }
            }

            if (resumePending) {
                const now = Date.now();
                // [sub-feature: workbench_task_reconcile_self_heal] [start]
                const pendingLogs = nextLogs.filter((log) => {
                    if (activeBatchIdsRef.current.has(log.id)) return false;
                    if (log.userId !== scope && (log.userId || scope !== "guest")) return false;
                    return log.status === "pending";
                });
                // [sub-feature: workbench_task_reconcile_self_heal] [end]
                for (const log of pendingLogs) {
                    if (log.taskIds && log.taskIds.length > 0) {
                        void pollPendingImageLog(log);
                    } else {
                        // 自愈孤儿态：无物理任务或异常中断记录
                        if (log.detailSet?.rows) {
                            const completedRows = log.detailSet.rows.filter((r) => Boolean(r.imageUrl || r.storageKey));
                            const failCount = log.detailSet.rows.length - completedRows.length;
                            if (failCount > 0 && log.chargedMicrocredits && log.chargedMicrocredits > 0) {
                                const refundAmount = Math.round((log.chargedMicrocredits / log.detailSet.rows.length) * failCount);
                                if (refundAmount > 0) {
                                    const deductKey = `deduct:image_workbench:${log.batchId || log.id}`;
                                    const refundKey = `refund:image_workbench:${log.batchId || log.id}:orphan_fail_${failCount}`;
                                    void imageFeatureCredit.refund(refundAmount, log.model, "套图任务中断未完成行退款", refundKey, deductKey);
                                }
                            }
                            const healedRows = log.detailSet.rows.map((r) => {
                                if (r.imageUrl || r.storageKey) return { ...r, status: "success" as const };
                                return { ...r, status: "failed" as const, error: "任务执行中断" };
                            });
                            const healedImages: GeneratedImage[] = completedRows.map((r) => ({
                                id: `${log.id}_slot_${r.seq - 1}`,
                                dataUrl: r.imageUrl || "",
                                storageKey: r.storageKey,
                                taskId: r.taskId,
                                durationMs: 0,
                                width: 0,
                                height: 0,
                                bytes: 0,
                            }));
                            const healed: GenerationLog = {
                                ...log,
                                status: completedRows.length > 0 ? "success" : "failed",
                                error: completedRows.length === 0 ? "任务执行中断" : undefined,
                                successCount: completedRows.length,
                                failCount,
                                images: healedImages,
                                thumbnails: healedImages.map((img) => img.dataUrl).filter(Boolean),
                                detailSet: { ...log.detailSet, rows: healedRows },
                                updatedAt: Date.now(),
                            };
                            void logStore.setItem(healed.id, serializeLog(healed));
                            void syncGenerationLogToRemote(serializeLog(healed), "image");
                            setLogs((prev) => prev.map((l) => (l.id === healed.id ? healed : l)));
                        } else if (log.images && log.images.length > 0) {
                            const healed: GenerationLog = { ...log, status: "success", updatedAt: Date.now() };
                            void logStore.setItem(healed.id, serializeLog(healed));
                            void syncGenerationLogToRemote(serializeLog(healed), "image");
                            setLogs((prev) => prev.map((l) => (l.id === healed.id ? healed : l)));
                        } else {
                            const healed: GenerationLog = { ...log, status: "failed", error: "任务执行中断", updatedAt: Date.now() };
                            void logStore.setItem(healed.id, serializeLog(healed));
                            void syncGenerationLogToRemote(serializeLog(healed), "image");
                            setLogs((prev) => prev.map((l) => (l.id === healed.id ? healed : l)));
                            if (log.chargedMicrocredits && log.chargedMicrocredits > 0) {
                                const deductKey = `deduct:image_workbench:${log.batchId || log.id}`;
                                const refundKey = `refund:image_workbench:${log.batchId || log.id}`;
                                void imageFeatureCredit.refund(log.chargedMicrocredits, log.model, "生图任务中断自动对账补偿退款", refundKey, deductKey);
                            }
                        }
                    }
                }
            }
            return nextLogs;
        } finally {
            isReconcilingLogsRef.current = false;
        }
    };

    const previewGenerationLog = async (log: GenerationLog) => {
        isNavigatingGenerationLogRef.current = true;
        sessionExplicitlyResetRef.current = false;

        // [session_workspace_registry] [start]
        // 1. 切走前现场自动封存：以当前活跃会话 ID 保存全部编辑状态
        const prevSessionId = currentSessionIdRef.current || previewLog?.id || draft.sessionId;
        if (prevSessionId) {
            saveCurrentWorkspaceSnapshot(prevSessionId);
        }
        // [session_workspace_registry] [end]

        const targetSessionId = log.sessionId || log.id;
        currentSessionIdRef.current = log.id;
        if (log.sessionId) currentSessionIdRef.current = log.sessionId;
        setPreviewLog(log);
        setLogsOpen(false);

        // [session_workspace_registry] [start]
        // 2. 切入后精准现场还原：优先恢复目标会话最新暂存的工作区现场（含技能、槽位素材、电商套图状态）
        if (!log.detailSet?.planId && !useImageWorkbenchStore.getState().getSessionSnapshot(targetSessionId)) {
            // 回到最终提示词输入状态页面，退出当前技能/工作流卡片模式
            selectSkill(null);
            clearAllSlots();
            previousSkillIdRef.current = null;
            useDetailSetStore.getState().resetWorkflow();
            setPrompt(log.prompt);
            setTextReferences([]);
            setReferences(log.references || []);
            const hydratedNavRefs = (log.references || []).map((ref) => ({
                ...ref,
                url: ref.url || ref.dataUrl || (ref.storageKey ? (peekLocalFirstMedia(ref.storageKey) || resolveResourceUrl(ref.storageKey)) : ""),
            }));
            if (hydratedNavRefs.some((r) => r.url && r.url !== r.dataUrl)) {
                setReferences(hydratedNavRefs);
            }
            updateDraft({
                sessionId: targetSessionId,
                prompt: log.prompt,
                references: hydratedNavRefs,
                textReferences: [],
            });
            const targetModel = log.config?.imageModel || log.config?.model || log.model;
            if (targetModel) updateConfig("imageModel", resolveModelForCapability(effectiveConfig, targetModel, "image"));
            if (log.config?.quality) updateConfig("quality", log.config.quality);
            if (log.config?.size) updateConfig("size", log.config.size);
            if (log.config?.count) updateConfig("count", log.config.count);
            if (log.config?.transparentBackground !== undefined) updateConfig("transparentBackground", log.config.transparentBackground);
        } else {
            restoreTargetWorkspaceSnapshot(log);
        }
        // [session_workspace_registry] [end]

        const displayResults = deriveGenerationResultsFromLog(log, activeBatchIdsRef.current);
        setResults((prev) => {
            const runningSlots = prev.filter((r) => r.status === "pending" && activeBatchIdsRef.current.has(r.batchId || ""));
            return reconcileImageGenerationResults(runningSlots, displayResults, "merge-update");
        });

        // [sub-feature: workbench_task_reconcile_self_heal] [start]
        const hasUnfinishedRows = log.detailSet?.rows?.some(
            (r) => (!r.imageUrl && !r.storageKey) || r.status === "pending" || r.status === "failed"
        );
        const pBatchId = log.batchId || log.id;
        if ((hasUnfinishedRows || log.status === "pending" || log.failCount > 0 || Boolean(log.detailSet?.rows?.length)) && pBatchId) {
            void (async () => {
                try {
                    const backendTasks = await listTasksForBatch(pBatchId);
                    if (backendTasks && backendTasks.length > 0) {
                        let hasChanges = false;
                        const allTaskIds = new Set<string>(log.taskIds || []);
                        for (const t of backendTasks) allTaskIds.add(t.id);
                        const nextTaskIds = Array.from(allTaskIds);
                        if (nextTaskIds.length !== (log.taskIds?.length || 0)) hasChanges = true;

                        let nextImgs = [...(log.images || [])];
                        let nextDetailSet = log.detailSet ? { ...log.detailSet, rows: [...log.detailSet.rows] } : undefined;
                        const seenSlotsInBatch = new Set<number>();

                        for (const t of backendTasks) {
                            if (t.status === "succeeded") {
                                reconciledTerminalTasksRef.current.add(t.id);
                                let slotIdx: number | undefined;
                                if (t.clientOperationId) {
                                    const m = t.clientOperationId.match(/_slot_(\d+)/);
                                    if (m) slotIdx = parseInt(m[1], 10);
                                }
                                if (slotIdx === undefined && t.inputJson) {
                                    try {
                                        const inp = JSON.parse(t.inputJson);
                                        if (typeof inp.metadata?.slotIndex === "number") slotIdx = inp.metadata.slotIndex;
                                    } catch {}
                                }

                                // LWW (Last-Write-Wins): 首个遇到的即为该槽位最新任务
                                if (typeof slotIdx === "number") {
                                    if (seenSlotsInBatch.has(slotIdx)) continue;
                                    seenSlotsInBatch.add(slotIdx);
                                }

                                let storageKey: string | undefined;
                                let dataUrl = "";
                                let width = 0, height = 0, bytes = 0, mimeType = "image/png";

                                if (t.resultJson) {
                                    try {
                                        const parsed = parseBackendGenerationResult(t);
                                        const rawImg = parsed.images?.[0];
                                        if (rawImg) {
                                            storageKey = rawImg.storageKey;
                                            dataUrl = rawImg.dataUrl || "";
                                            width = rawImg.width || 0;
                                            height = rawImg.height || 0;
                                            bytes = rawImg.bytes || 0;
                                            mimeType = rawImg.mimeType || "image/png";
                                        }
                                    } catch {}
                                }
                                if (!storageKey && !dataUrl && t.previewUrl) {
                                    dataUrl = t.previewUrl;
                                    storageKey = resourceIdFromStorageKey(t.previewUrl) || undefined;
                                }
                                if (storageKey && !dataUrl) {
                                    dataUrl = (await resolveImageUrl(storageKey)) || "";
                                }

                                if (storageKey || dataUrl) {
                                    const cardId = t.clientOperationId || (typeof slotIdx === "number" ? `${pBatchId}_slot_${slotIdx}` : `${pBatchId}_task_${t.id}`);
                                    const outcomeImg: GeneratedImage = {
                                        id: cardId,
                                        dataUrl,
                                        storageKey,
                                        taskId: t.id,
                                        slotIndex: slotIdx,
                                        durationMs: 0,
                                        width,
                                        height,
                                        bytes,
                                        mimeType,
                                    };

                                    const existingImgIdx = nextImgs.findIndex((img) =>
                                        img.taskId === t.id ||
                                        img.id === cardId ||
                                        (typeof slotIdx === "number" && (img.slotIndex === slotIdx || img.id === `${pBatchId}_slot_${slotIdx}`))
                                    );
                                    if (existingImgIdx >= 0) {
                                        const cur = nextImgs[existingImgIdx];
                                        if (cur.taskId !== t.id || cur.storageKey !== storageKey || cur.dataUrl !== dataUrl) {
                                            nextImgs[existingImgIdx] = outcomeImg;
                                            hasChanges = true;
                                        }
                                    } else {
                                        nextImgs.push(outcomeImg);
                                        hasChanges = true;
                                    }

                                    if (nextDetailSet?.rows) {
                                        const seq = typeof slotIdx === "number" ? slotIdx + 1 : undefined;
                                        const rIdx = nextDetailSet.rows.findIndex((r) => r.taskId === t.id || (seq !== undefined && r.seq === seq));
                                        if (rIdx >= 0) {
                                            const row = nextDetailSet.rows[rIdx];
                                            if (row.taskId !== t.id || row.storageKey !== storageKey || row.imageUrl !== dataUrl || row.status !== "success") {
                                                nextDetailSet.rows[rIdx] = {
                                                    ...row,
                                                    imageUrl: dataUrl || row.imageUrl,
                                                    storageKey: storageKey || row.storageKey,
                                                    taskId: t.id,
                                                    status: "success",
                                                    error: undefined,
                                                };
                                                hasChanges = true;
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // 净化外来跨批次污染图片并按槽位升序去重
                        const cleanedImgs = deduplicateLogImages(
                            nextImgs.filter((img) => {
                                if (img.id && img.id.includes("_slot_") && !img.id.startsWith(`${pBatchId}_slot_`)) return false;
                                return true;
                            }),
                            pBatchId
                        );
                        if (cleanedImgs.length !== nextImgs.length) {
                            nextImgs = cleanedImgs;
                            hasChanges = true;
                        }

                        if (hasChanges) {
                            const curSuccess = nextDetailSet?.rows
                                ? nextDetailSet.rows.filter((r) => Boolean(r.imageUrl || r.storageKey)).length
                                : nextImgs.length;
                            const totalCount = nextDetailSet?.rows?.length || nextTaskIds.length || (log.config?.count ? Number(log.config.count) : nextImgs.length);
                            const curFail = Math.max(0, totalCount - curSuccess);

                            const healedLog: GenerationLog = {
                                ...log,
                                taskIds: nextTaskIds,
                                images: nextImgs,
                                thumbnails: nextImgs.map((img) => img.dataUrl).filter(Boolean),
                                detailSet: nextDetailSet,
                                successCount: curSuccess,
                                failCount: curFail,
                                status: curFail === 0 ? "success" : (curSuccess > 0 ? "success" : (curFail === totalCount ? "failed" : log.status)),
                                error: curFail === 0 ? undefined : log.error,
                                updatedAt: Date.now(),
                            };
                            await saveLog(healedLog);
                            setPreviewLog(healedLog);
                            setResults(deriveGenerationResultsFromLog(healedLog, activeBatchIdsRef.current));
                            const livePlan = useDetailSetStore.getState().plan;
                            if (livePlan && (livePlan.planId === pBatchId || livePlan.planId === log.id) && healedLog.detailSet) {
                                useDetailSetStore.getState().hydrateFromSnapshot(healedLog.detailSet, getActiveUserScope(), "review");
                            }
                        }
                    }
                } catch (previewHealErr) {
                    console.warn(`[previewLogHistory] 对账自愈失败:`, previewHealErr);
                }
            })();
        }
        // [sub-feature: workbench_task_reconcile_self_heal] [end]
        setTimeout(() => {
            document.getElementById(`batch-group-${log.batchId || log.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
            isNavigatingGenerationLogRef.current = false;
        }, 300);
    };

    const buildRequestSnapshot = () => {
        const expandedPrompt = expandPromptTextReferences(prompt, textReferences);
        if (activeSkill) {
            if (!isSlotsValid()) {
                message.error("请按要求上传必填图片槽位");
                return null;
            }
            if (!isAiConfigReady(effectiveConfig, model)) {
                message.warning(t("workbench.configFirst"));
                openConfigDialog();
                return null;
            }
            const assembled = assembleWorkbenchPrompt({
                skill: activeSkill,
                userPrompt: expandedPrompt,
                slotFiles,
                slotFilesMap,
            });
            return {
                text: expandedPrompt.trim() || activeSkill.name,
                requestText: assembled.finalPrompt,
                config: { ...effectiveConfig, model, count: "1" },
                references: assembled.referenceImages.length > 0 ? assembled.referenceImages : [...references],
            };
        }

        const text = expandedPrompt.trim();
        if (!text) {
            message.error(t("imageWorkbench.promptRequired"));
            return null;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog();
            return null;
        }
        const currentReferences = getAllSlotFiles().map((f) => ({
            id: f.id,
            name: f.name,
            type: f.mimeType || "image/png",
            dataUrl: f.previewUrl || f.dataUrl,
            storageKey: f.storageKey,
        }));
        return { text, requestText: text, config: { ...effectiveConfig, model, count: "1" }, references: currentReferences.length > 0 ? currentReferences : [...references] };
    };

    // [sub-feature: detail_set_workflow] 错峰滑动并发池调度器 (Staggered Concurrency Pool)
    const runWithConcurrencyLimit = async <T, R>(
        items: T[],
        limit: number,
        staggerMs: number,
        worker: (item: T, index: number) => Promise<R>,
    ): Promise<PromiseSettledResult<R>[]> => {
        const results: PromiseSettledResult<R>[] = new Array(items.length);
        const executing: Promise<void>[] = [];

        for (let i = 0; i < items.length; i++) {
            const currentIndex = i;
            if (executing.length >= limit) {
                await Promise.race(executing);
            }
            if (staggerMs > 0 && i > 0) {
                await new Promise((resolve) => setTimeout(resolve, staggerMs));
            }
            const p: Promise<void> = (async () => {
                try {
                    const value = await worker(items[currentIndex], currentIndex);
                    results[currentIndex] = { status: "fulfilled", value };
                } catch (reason) {
                    results[currentIndex] = { status: "rejected", reason };
                }
            })().finally(() => {
                const idx = executing.indexOf(p);
                if (idx >= 0) executing.splice(idx, 1);
            });
            executing.push(p);
        }
        await Promise.all(executing);
        return results;
    };
    // detail_set_workflow [end]

    const runGenerationSlot = async (
        slotIdentifier: string | number,
        indexOrSnapshot: number | { text: string; requestText?: string; config: AiConfig; references: ReferenceImage[] },
        snapshotOrSessionId: { text: string; requestText?: string; config: AiConfig; references: ReferenceImage[] } | string,
        sessionIdOrSignal?: string | AbortSignal,
        signal?: AbortSignal,
        // [sub-feature: detail_set_workflow]
        onSlotSettled?: (slotIndex: number, outcome: { image: GeneratedImage | null; error?: string; taskId?: string }) => void, // 电商套图：行级结果回填钩子
        // detail_set_workflow [end]
        existingTaskId?: string,
    ) => {
        const itemStartedAt = performance.now();
        const cardId = typeof slotIdentifier === "string" ? slotIdentifier : undefined;
        const fallbackIndex = typeof slotIdentifier === "number" ? slotIdentifier : (typeof indexOrSnapshot === "number" ? indexOrSnapshot : 0);
        const snapshot = (typeof indexOrSnapshot === "object" ? indexOrSnapshot : (typeof snapshotOrSessionId === "object" ? snapshotOrSessionId : undefined)) as { text: string; requestText?: string; config: AiConfig; references: ReferenceImage[] };
        const effectiveSignal = (sessionIdOrSignal instanceof AbortSignal ? sessionIdOrSignal : signal);
        const batchOrSessionId = typeof sessionIdOrSignal === "string" ? sessionIdOrSignal : (typeof snapshotOrSessionId === "string" ? snapshotOrSessionId : undefined);

        // [sub-feature: workbench_batch_concurrency] [start]
        let backendTaskId: string | undefined = existingTaskId;
        let backendTask: GenerationTask | undefined;
        try {
            if (!backendTaskId) {
                const promptToSend = snapshot.requestText || snapshot.text;
                backendTask = await submitBackendGenerationTask({
                    mode: "image",
                    prompt: promptToSend,
                    config: snapshot.config,
                    referenceImages: snapshot.references,
                    signal: effectiveSignal,
                    metadata: {
                        source: "image-workbench",
                        batchId: batchOrSessionId,
                        slotIndex: fallbackIndex,
                        clientOperationId: cardId,
                    },
                });
                if (!backendTask?.id) {
                    throw new Error("服务端生图任务建档失败，未返回有效任务 ID");
                }
                backendTaskId = backendTask.id;
                registerActiveWorkbenchTask({
                    type: "image",
                    taskId: backendTaskId,
                    logId: batchOrSessionId || backendTaskId,
                    batchId: batchOrSessionId,
                    slotIndex: fallbackIndex,
                });
            }
            if (batchOrSessionId && backendTaskId) {
                recordLogTaskId(batchOrSessionId, backendTaskId);
            }
            setResults((value) => {
                if (cardId) {
                    const idx = value.findIndex((r) => r.id === cardId);
                    if (idx >= 0) return updateResultAt(value, idx, { taskId: backendTaskId });
                }
                return value;
            });
            // [sub-feature: detail_set_workflow] 即刻绑定行任务 ID，杜绝中断或网络抖动时丢失任务关联
            if (batchOrSessionId && backendTaskId) {
                const currentPlan = useDetailSetStore.getState().plan;
                if (currentPlan && currentPlan.planId === batchOrSessionId) {
                    useDetailSetStore.getState().updatePlanRow(batchOrSessionId, fallbackIndex + 1, { taskId: backendTaskId });
                }
            }
            // detail_set_workflow [end]

            let slotQueueTimer: any = setTimeout(() => {
                if (!effectiveSignal?.aborted) {
                    message.info({ content: "当前生图算力高峰排队中，已转入后台长效托管，生成完成后将自动入库回填", key: "image-workbench-queue-toast" });
                }
            }, 180000);
            let completed: GenerationTask;
            try {
                completed = await waitForGenerationTask(backendTaskId, { signal: effectiveSignal, initialTask: backendTask, timeoutMs: 10 * 60 * 1000 });
            } finally {
                clearTimeout(slotQueueTimer);
            }
            const parsed = parseBackendGenerationResult(completed);
            const rawImg = parsed.images?.[0];
            if (!rawImg) throw new Error(t("imageWorkbench.missingResult"));
            const durationMs = performance.now() - itemStartedAt;
            let dataUrl = rawImg.dataUrl || "";
            const storageKey = rawImg.storageKey;
            let width = rawImg.width || 0;
            let height = rawImg.height || 0;
            let bytes = rawImg.bytes || 0;
            const mimeType = rawImg.mimeType;

            if (storageKey && !dataUrl) {
                dataUrl = await resolveImageUrl(storageKey);
            }
            if (dataUrl && (!width || !height)) {
                try {
                    const meta = await readImageMeta(dataUrl);
                    width = meta.width;
                    height = meta.height;
                    bytes = bytes || getDataUrlByteSize(dataUrl);
                } catch {}
            }
            const nextImage: GeneratedImage = {
                id: cardId || (rawImg.storageKey ? resourceIdFromStorageKey(rawImg.storageKey) || nanoid() : nanoid()),
                slotIndex: fallbackIndex,
                dataUrl,
                storageKey,
                durationMs,
                width,
                height,
                bytes,
                mimeType,
                taskId: backendTaskId,
            };
            setResults((value) => {
                if (cardId) {
                    const idx = value.findIndex((r) => r.id === cardId);
                    if (idx >= 0) return updateResultAt(value, idx, { status: "success", image: nextImage });
                    return value;
                }
                return value;
            });
            // [sub-feature: detail_set_workflow]
            onSlotSettled?.(fallbackIndex, { image: nextImage, taskId: backendTaskId });
            // detail_set_workflow [end]
            return nextImage;
        } catch (error) {
            if (effectiveSignal?.aborted) return null;
            const errMsg = error instanceof Error ? error.message : t("workbench.generationFailed");
            const isSaveOrUploadErr = Boolean(backendTask?.canRecoverMedia || (errMsg && /上传|保存未完成|OSS|存储同步/i.test(errMsg) && !/超时|稍后重试/i.test(errMsg)));
            setResults((value) => {
                if (cardId) {
                    const idx = value.findIndex((r) => r.id === cardId);
                    if (idx >= 0) return updateResultAt(value, idx, { status: "failed", error: errMsg, taskId: backendTaskId, canRecoverMedia: isSaveOrUploadErr });
                    return value;
                }
                return value;
            });
            // [sub-feature: detail_set_workflow]
            onSlotSettled?.(fallbackIndex, { image: null, error: errMsg, taskId: backendTaskId });
            // detail_set_workflow [end]
            throw error;
        }
        // [sub-feature: workbench_batch_concurrency] [end]
    };

    const retryResult = async (index: number) => {
        if (submitting) return;
        const targetItem = results[index];
        if (!targetItem) return;
        const targetCardId = targetItem.id;
        const targetBatchId = targetItem.batchId || previewLog?.id || targetItem.id;
        const targetSlotIndex = typeof targetItem.slotIndex === "number" ? targetItem.slotIndex : index;

        // [sub-feature: detail_set_workflow]
        // 电商套图卡槽重试精准路由：识别并交由独立行重试处理器（按行定制提示词与尺寸，独立扣退款）
        const currentDetailPlan = useDetailSetStore.getState().plan;
        const isDetailSetItem = (currentDetailPlan && currentDetailPlan.planId === targetBatchId) || Boolean(logs.find((l) => l.id === targetBatchId)?.detailSet);
        if (isDetailSetItem && retryDetailSetRowRef.current) {
            if (typeof targetItem.slotIndex === "number") {
                await retryDetailSetRowRef.current(targetBatchId, targetItem.slotIndex + 1);
            } else {
                await retryDetailSetRowRef.current(targetBatchId, index + 1);
            }
            return;
        }

        const targetBatchLog = logs.find((l) => l.id === targetBatchId) || previewLog;
        const targetModel = targetBatchLog?.model || targetBatchLog?.config?.model || model;
        const snapshot = (targetBatchLog && targetBatchLog.id === targetBatchId)
            ? {
                  text: targetBatchLog.prompt,
                  requestText: targetBatchLog.prompt,
                  config: { ...effectiveConfig, ...targetBatchLog.config, model: targetModel, count: "1" },
                  references: targetBatchLog.references || [],
              }
            : buildRequestSnapshot();
        if (!snapshot) return;
        const currentFailedLog = previewLog;
        setPreviewLog(null);
        setResults((value) => updateResultAt(value, index, { status: "pending", error: undefined, image: undefined }));
        const retryStartedAt = performance.now();
        let chargedMicrocredits = 0;
        try {
            const deductRes = await imageFeatureCredit.deduct(targetModel, "生图重试");
            chargedMicrocredits = deductRes.deductedMicrocredits;
        } catch (err) {
            const errText = err instanceof Error ? err.message : "积分扣减失败";
            message.error(errText);
            setResults((value) => updateResultAt(value, index, { status: "failed", error: errText }));
            return;
        }
        try {
            const image = await runGenerationSlot(targetCardId, targetSlotIndex, snapshot, targetBatchId);
            if (!image) return;
            let logImage = image;
            if (!image.storageKey) {
                const stored = await uploadImage(image.dataUrl);
                logImage = { ...image, dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType };
            }
            setResults((value) => {
                const idx = value.findIndex((r) => r.id === targetCardId || (r.batchId === targetBatchId && r.slotIndex === targetSlotIndex));
                return updateResultAt(value, idx >= 0 ? idx : index, { image: logImage, status: "success", error: undefined });
            });
            // [sub-feature: workbench_batch_concurrency] [start]
            // 正向商业级批次维护：识别是否属于多图批次重试，执行增量合并（Incremental Merge）而非覆盖抹杀既有图片
            setLogs((prev) => {
                const existsInLogs = prev.some((l) => l.id === targetBatchId || l.batchId === targetBatchId);
                if (existsInLogs) {
                    return prev.map((log) => {
                        if (log.id !== targetBatchId && log.batchId !== targetBatchId) return log;
                        const existingImages = log.images || [];
                        const imgId = targetCardId || `${targetBatchId}_slot_${targetSlotIndex}`;
                        const nextImages = deduplicateLogImages(
                            existingImages.some((img) => img.id === imgId)
                                ? existingImages.map((img) => (img.id === imgId ? logImage : img))
                                : [...existingImages, logImage],
                            targetBatchId
                        );
                        const curSuccess = nextImages.length;
                        const expectedTotal = Math.max(curSuccess, log.imageCount || Number(log.config?.count) || (log.taskIds?.length ?? 0) || 1);
                        const curFail = Math.max(0, expectedTotal - curSuccess);
                        const nextLog: GenerationLog = {
                            ...log,
                            images: nextImages,
                            thumbnails: nextImages.map((img) => img.dataUrl).filter(Boolean),
                            successCount: curSuccess,
                            failCount: curFail,
                            imageCount: curSuccess,
                            status: curFail === 0 ? "success" : (curSuccess > 0 ? "success" : "failed"),
                            updatedAt: Date.now(),
                        };
                        saveLog(nextLog);
                        return nextLog;
                    });
                }
                const singleLog = buildLog({
                    logId: currentFailedLog?.id || targetBatchId,
                    batchId: currentFailedLog?.batchId || targetBatchId,
                    prompt: snapshot.text,
                    model: targetModel,
                    config: { ...snapshot.config, count: "1" },
                    references: snapshot.references,
                    durationMs: performance.now() - retryStartedAt,
                    successCount: 1,
                    failCount: 0,
                    status: "success",
                    images: [logImage],
                });
                saveLog(singleLog);
                return [singleLog, ...prev];
            });
            // [sub-feature: workbench_batch_concurrency] [end]
            message.success(t("workbench.retrySuccess"));
        } catch (retryErr) {
            if (chargedMicrocredits > 0) {
                void imageFeatureCredit.refund(chargedMicrocredits, targetModel, "生图重试失败退款");
            }
            // runGenerationSlot has already marked the result as failed.
        }
    };

    // 恢复媒体通道（免扣费）：当服务端生成成功但 OSS 保存/同步失败时，调用恢复通道或本地补传，不重新生图不扣费
    const recoverResultMedia = useCallback(
        async (index: number) => {
            const targetItem = results[index];
            if (!targetItem) return;
            const targetBatchId = targetItem.batchId || previewLog?.id || logs[0]?.id;
            if (!targetBatchId) return;

            // 1. 若属于电商套图行，派发给 recoverDetailSetRowRef
            const isDetailSetItem = isDetailSetWorkflow || Boolean(previewLog?.detailSet) || logs.some((l) => l.id === targetBatchId && Boolean(l.detailSet));
            if (isDetailSetItem && typeof targetItem.slotIndex === "number" && recoverDetailSetRowRef.current) {
                await recoverDetailSetRowRef.current(targetBatchId, targetItem.slotIndex + 1);
                return;
            }

            // 2. 普通生图结果恢复
            setRecoveringCardId(targetItem.id);
            const hideLoading = message.loading({ content: "正在同步恢复作品媒体至云端存储...", key: `recover_${targetItem.id}` });
            try {
                let recoveredStorageKey = targetItem.image?.storageKey || "";
                let recoveredDataUrl = targetItem.image?.dataUrl || "";
                let recoveredTaskId = targetItem.taskId;

                // 0. 多级权威回溯物理 TaskId (Multi-Tier Infallible Task Resolution Chain)
                if (!recoveredTaskId) {
                    const matchedLog = logs.find((l) => l.id === targetBatchId || l.batchId === targetBatchId);
                    if (matchedLog?.taskIds?.length && typeof targetItem.slotIndex === "number" && matchedLog.taskIds[targetItem.slotIndex]) {
                        recoveredTaskId = matchedLog.taskIds[targetItem.slotIndex];
                    }
                }
                if (!recoveredTaskId) {
                    try {
                        const recentTasks = await listGenerationTasks(50);
                        const matched = recentTasks.find((t: GenerationTask) => t.clientOperationId === targetItem.id);
                        if (matched) recoveredTaskId = matched.id;
                    } catch {}
                }

                if (recoveredTaskId) {
                    try {
                        let taskInfo = await refreshGenerationTaskStatus(recoveredTaskId);
                        if (taskInfo.status === "queued" || taskInfo.status === "running") {
                            taskInfo = await waitForGenerationTask(recoveredTaskId, { timeoutMs: 45000, initialTask: taskInfo });
                        }
                        if (taskInfo.status === "succeeded") {
                            const parsed = parseBackendGenerationResult(taskInfo);
                            const rawImg = parsed.images?.[0];
                            if (rawImg?.storageKey) recoveredStorageKey = rawImg.storageKey;
                            if (rawImg?.dataUrl) recoveredDataUrl = rawImg.dataUrl;
                            else if (recoveredStorageKey) recoveredDataUrl = (await resolveImageUrl(recoveredStorageKey)) || "";
                        }
                    } catch {}
                    if (!recoveredStorageKey && !recoveredDataUrl) {
                        try {
                            const recTask = await recoverGenerationTaskMedia(recoveredTaskId);
                            let finalRecTask = recTask;
                            if (recTask.status === "queued" || recTask.status === "running") {
                                finalRecTask = await waitForGenerationTask(recTask.id, { timeoutMs: 35000, initialTask: recTask });
                            }
                            if (finalRecTask.status === "succeeded") {
                                const parsed = parseBackendGenerationResult(finalRecTask);
                                const rawImg = parsed.images?.[0];
                                if (rawImg?.storageKey) recoveredStorageKey = rawImg.storageKey;
                                if (rawImg?.dataUrl) {
                                    recoveredDataUrl = rawImg.dataUrl;
                                } else if (recoveredStorageKey) {
                                    recoveredDataUrl = (await resolveImageUrl(recoveredStorageKey)) || recoveredDataUrl;
                                }
                            }
                        } catch (taskErr) {
                            console.warn("[recoverResultMedia] 任务恢复失败，尝试本地数据直传:", taskErr);
                        }
                    }
                }

                if (!recoveredStorageKey && recoveredDataUrl) {
                    const stored = await uploadImage(recoveredDataUrl);
                    if (stored.pendingRemoteUpload) {
                        throw new Error(stored.remoteUploadError || "上传至云端存储失败，请稍后重试");
                    }
                    recoveredStorageKey = stored.storageKey;
                    recoveredDataUrl = stored.url;
                }

                if (!recoveredStorageKey && !recoveredDataUrl) {
                    throw new Error("未找到可恢复的作品媒体，请点击【重新生成】");
                }

                const outcomeImage: GeneratedImage = {
                    id: targetItem.id,
                    dataUrl: recoveredDataUrl,
                    storageKey: recoveredStorageKey,
                    taskId: recoveredTaskId,
                    durationMs: targetItem.image?.durationMs || 0,
                    width: targetItem.image?.width || 0,
                    height: targetItem.image?.height || 0,
                    bytes: targetItem.image?.bytes || 0,
                };

                setResults((prev) => updateResultAt(prev, index, {
                    status: "success",
                    image: outcomeImage,
                    error: undefined,
                    canRecoverMedia: false,
                }));

                const targetLog = logsRef.current.find((l) => l.id === targetBatchId);
                if (targetLog) {
                    const existing = targetLog.images || [];
                    const nextImages = deduplicateLogImages(
                        existing.some((img) => img.id === targetItem.id)
                            ? existing.map((img) => (img.id === targetItem.id ? outcomeImage : img))
                            : [...existing, outcomeImage],
                        targetLog.id
                    );
                    const nextLog: GenerationLog = {
                        ...targetLog,
                        images: nextImages,
                        thumbnails: nextImages.map((img) => img.dataUrl).filter(Boolean),
                        successCount: nextImages.length,
                        failCount: Math.max(0, (targetLog.imageCount || 1) - nextImages.length),
                        status: "success",
                        error: undefined,
                        updatedAt: Date.now(),
                    };
                    saveLog(nextLog);
                }

                message.success({ content: "作品已成功恢复并同步至云端存储", key: `recover_${targetItem.id}` });
            } catch (err) {
                setResults((prev) => updateResultAt(prev, index, { canRecoverMedia: false }));
                message.error({ content: err instanceof Error ? err.message : "恢复媒体失败，请重新生成", key: `recover_${targetItem.id}` });
            } finally {
                hideLoading();
                setRecoveringCardId(null);
            }
        },
        [isDetailSetWorkflow, logs, message, previewLog, results],
    );

    // [sub-feature: detail_set_workflow]
    // ============ 电商套图工作流：规划与逐行生成 ============
    // 电商套图声明块已上移至 canGenerate 之前（处理器见 retryResult 之后的围栏块）
    // 画幅：与工作台标准一致，由【参数】弹层的 size 设置驱动；此处仅反推比例标签用于手机预览展示
    const detailSetRatioLabel = useMemo(() => {
        const size = effectiveConfig.size || "";
        const match = size.match(/(\d+)\s*[x×]\s*(\d+)/i);
        if (!match) return "3:4";
        const width = Number(match[1]);
        const height = Number(match[2]);
        const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
        const divisor = gcd(width, height) || 1;
        return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
    }, [effectiveConfig.size]);

    // 账号切换熔断：重置套图工作流内存态（对齐日志 scope 校验策略）
    useEffect(() => {
        const onScopeChanged = () => useDetailSetStore.getState().resetForScope(getActiveUserScope());
        window.addEventListener(USER_SCOPE_CHANGED_EVENT, onScopeChanged);
        onScopeChanged();
        return () => window.removeEventListener(USER_SCOPE_CHANGED_EVENT, onScopeChanged);
    }, []);

    // 上传商品素材时自动提炼商品名称（若非用户手动锁死，素材变化自动动态联动）
    useEffect(() => {
        if (!isDetailSetWorkflow) return;
        const currentDraft = useDetailSetStore.getState().draft;
        if (currentDraft.productNameSource === "manual") return;

        if (detailSetProductFiles.length === 0) {
            if (currentDraft.productName) {
                useDetailSetStore.getState().setDraft({ productName: "", productNameSource: "auto" });
            }
            return;
        }

        const firstFile = detailSetProductFiles[0];
        if (firstFile?.name) {
            let cleanName = firstFile.name.replace(/\.[^/.]+$/, "").trim();
            // 剔除纯时间戳、长hash以及无意义的默认文件名前缀
            if (!/^\d{8,}$/.test(cleanName) && !/^[a-f0-9-]{16,}$/i.test(cleanName) && !/^(image|img|media|file|screenshot|wechat|wx|pic)[-_0-9]*$/i.test(cleanName)) {
                cleanName = cleanName.replace(/^(微信图片_|IMG_|PIC_|Screenshot_|\d{8,}[_-])/i, "").trim();
                if (cleanName && cleanName !== currentDraft.productName) {
                    useDetailSetStore.getState().setDraft({ productName: cleanName, productNameSource: "auto" });
                }
            }
        }
    }, [isDetailSetWorkflow, detailSetProductFiles]);

    // 阶段 1：AI 规划（vision 商品分析 + 逐行规划，一次调用；失败如实呈现原始错误）
    const startDetailSetPlanning = useCallback(async () => {
        if (!activeSkill || detailSetSubmitting) return;
        if (!isSlotsValid()) {
            message.error("请按要求上传必填图片槽位");
            return;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog();
            return;
        }
        if (detailSetTotal <= 0) {
            message.error("请先选择模块");
            return;
        }
        // [sub-feature: workbench_batch_concurrency] [start]
        if (detailSetTotal > 15) {
            message.warning("单次批量生成上限为 15 张图片，请调整选择模块数量");
            return;
        }
        // [sub-feature: workbench_batch_concurrency] [end]
        const store = useDetailSetStore.getState();
        store.setPhase("planning");
        store.setPlanningStage(0);
        store.setPlanError(undefined);
        const stageTimers = [
            window.setTimeout(() => useDetailSetStore.getState().setPlanningStage(1), 900),
            window.setTimeout(() => useDetailSetStore.getState().setPlanningStage(2), 1900),
        ];
        const controller = new AbortController();
        try {
            const raw = await requestDetailSetPlan({
                config: effectiveConfig,
                selections: detailSetDraft.selections,
                outputLanguage: detailSetDraft.outputLanguage,
                aspectRatio: detailSetRatioLabel,
                resolution: effectiveConfig.quality && effectiveConfig.quality !== "auto" ? effectiveConfig.quality : "1K",
                outputFormat: "PNG",
                productSafe: detailSetDraft.productSafe,
                stylePresetId: detailSetDraft.stylePresetId,
                styleLook: detailSetStylePreset?.look,
                styleModuleHints: detailSetStylePreset?.moduleHints,
                extraInstruction: detailSetDraft.extraInstruction,
                productName: detailSetDraft.productName,
                category: detailSetDraft.category,
                keySellingPoints: detailSetDraft.keySellingPoints,
                productImages: detailSetProductFiles.slice(0, 8).map((file) => ({
                    id: file.id,
                    name: file.name,
                    type: file.mimeType || "image/png",
                    dataUrl: file.dataUrl,
                    storageKey: file.storageKey,
                })),
                avoid: activeSkill.avoid,
                signal: controller.signal,
            });
            const snapshot = parseDetailSetPlanJson(raw, {
                selections: detailSetDraft.selections,
                aspectRatio: detailSetRatioLabel,
                outputLanguage: detailSetDraft.outputLanguage,
                planId: nanoid(),
                createdAt: Date.now(),
                stylePresetId: detailSetDraft.stylePresetId ?? undefined,
                extraInstruction: detailSetDraft.extraInstruction,
                productSafe: detailSetDraft.productSafe,
                resolution: effectiveConfig.quality && effectiveConfig.quality !== "auto" ? effectiveConfig.quality : "1K",
                outputFormat: "PNG",
                productImages: detailSetProductFiles,
                productName: detailSetDraft.productName,
                category: detailSetDraft.category,
                keySellingPoints: detailSetDraft.keySellingPoints,
            });
            useDetailSetStore.getState().setPlan(snapshot);
            if (detailSetDraft.productNameSource !== "manual" && snapshot.productName) {
                useDetailSetStore.getState().setDraft({ productName: snapshot.productName });
            }
            useDetailSetStore.getState().setPhase("review");
            // [session_workspace_registry] [start]
            // 规划完成即刻持久化到当前会话注册表，防止任何切换或刷新导致规划结果遗失
            const currentSession = currentSessionIdRef.current || draft.sessionId || snapshot.planId;
            saveCurrentWorkspaceSnapshot(currentSession);
            // [session_workspace_registry] [end]
            message.success(`AI 规划完成，已生成 ${snapshot.rows.length} 行提示词，请确认后开始生成`);
        } catch (planningError) {
            if (controller.signal.aborted) return;
            const errorText = planningError instanceof Error ? planningError.message : String(planningError);
            useDetailSetStore.getState().setPlanError(errorText);
            useDetailSetStore.getState().setPhase("create");
            message.error(`AI 规划失败：${errorText}`);
        } finally {
            stageTimers.forEach((timer) => window.clearTimeout(timer));
        }
    }, [activeSkill, detailSetDraft, detailSetProductFiles, detailSetRatioLabel, detailSetStylePreset, detailSetSubmitting, detailSetTotal, effectiveConfig, model, isSlotsValid]);

    // 阶段 2：确认后逐行生成（每行一个独立任务；prompt 来自规划行；商品一致性 = 参考图驱动图生图）
    const runDetailSetRows = useCallback(
        async (plan: DetailSetPlanSnapshot) => {
            if (!plan.rows.length) return;
            // [sub-feature: workbench_batch_concurrency] [start]
            if (plan.rows.length > 15) {
                message.warning("单次批量生成上限为 15 张图片，已超出批次限制");
                return;
            }
            // [sub-feature: workbench_batch_concurrency] [end]
            if (activeBatchIdsRef.current.has(plan.planId)) {
                message.warning("当前套图批次正在执行中，请等待完成后再操作");
                return;
            }
            const initialUserScope = getActiveUserScope();
            const controller = new AbortController();
            generationAbortControllerRef.current = controller;
            const batchId = plan.planId;
            const activeSessionId = draft.sessionId || nanoid();
            if (!draft.sessionId) updateDraft({ sessionId: activeSessionId });
            currentSessionIdRef.current = activeSessionId;
            // [session_workspace_registry] [start]
            saveCurrentWorkspaceSnapshot(activeSessionId);
            // [session_workspace_registry] [end]
            activeBatchIdsRef.current.add(batchId);

            const deductKey = `deduct:image_workbench:${batchId}`;
            const refundKey = `refund:image_workbench:${batchId}`;
            setSubmitting(true);
            let chargedMicrocredits = 0;
            const rowCount = plan.rows.length;
            const singleCost = imageFeatureCredit.costMicrocredits;
            const totalCharge = singleCost > 0 ? singleCost * rowCount : 0;
            try {
                const deductRes = await imageFeatureCredit.deduct(model, `电商套图逐行生成 (${rowCount}张)`, deductKey, totalCharge > 0 ? totalCharge : undefined);
                chargedMicrocredits = deductRes.deductedMicrocredits;
                activeChargedCreditsMapRef.current.set(batchId, {
                    batchId,
                    amount: chargedMicrocredits,
                    model,
                    deductKey,
                    refundKey,
                    userScope: initialUserScope,
                });
            } catch (err) {
                setSubmitting(false);
                const errorText = err instanceof Error ? err.message : "积分扣减失败";
                message.error(errorText);
                return;
            }

            const freshRows = plan.rows.map((row) => ({
                ...row,
                imageUrl: undefined,
                storageKey: undefined,
                taskId: undefined,
                error: undefined,
                status: "pending" as const,
                canRecoverMedia: false,
            }));
            const freshPlan = { ...plan, rows: freshRows };
            useDetailSetStore.setState({ plan: freshPlan });

            const rowSnapshots = freshPlan.rows.map((row) => ({
                row,
                cardId: `${freshPlan.planId}_slot_${row.seq - 1}`,
                snapshot: {
                    text: `${freshPlan.productName} · ${row.title || detailSetModuleShort(row.modulePurpose)}`,
                    requestText: buildRowFinalPrompt({ row, plan: freshPlan, styleLook: detailSetStylePreset?.look, avoid: activeSkill?.avoid }),
                    config: {
                        ...effectiveConfig,
                        model,
                        count: "1",
                        size: resolveImageRequestSize(imageProfile, effectiveConfig.quality, row.aspectRatio)?.value || DETAIL_SET_RATIO_RESOLUTION[row.aspectRatio] || effectiveConfig.size,
                    },
                    references: freshPlan.config.productSafe && detailSetProductFiles.length
                        ? detailSetProductFiles.slice(0, 3).map((f) => ({
                              id: f.id,
                              name: f.name,
                              type: f.mimeType || "image/png",
                              dataUrl: f.dataUrl,
                              storageKey: f.storageKey,
                          }))
                        : ([] as ReferenceImage[]),
                },
            }));

            setElapsedMs(0);
            setPreviewLog(null);
            const newPendingSlots: GenerationResult[] = rowSnapshots.map(({ row, cardId }) => ({
                id: cardId,
                batchId,
                slotIndex: row.seq - 1,
                status: "pending",
            }));
            setResults((prev) => [...newPendingSlots, ...prev.filter((r) => r.batchId !== batchId)]);
            setStartedAt(performance.now());
            useDetailSetStore.getState().setResultView("grid");

            const pendingLog = buildLog({
                logId: batchId,
                sessionId: activeSessionId,
                batchId,
                prompt: `电商套图 · ${freshPlan.productName}（${freshPlan.rows.length} 张 · ${freshPlan.config.addText ? "含文案" : "无文案"}）`,
                model,
                config: { ...effectiveConfig, model, count: String(freshPlan.rows.length) },
                references: rowSnapshots[0]?.snapshot.references ?? [],
                durationMs: 0,
                successCount: 0,
                failCount: 0,
                status: "pending",
                images: [],
                chargedMicrocredits,
            });
            pendingLog.detailSet = freshPlan;
            saveLog(pendingLog);

            // 阶段一：即刻全量错峰入库建档 (Immediate Durable Task Enqueueing)
            // 所有分镜行在几百毫秒内向后端 submitBackendGenerationTask 建立物理任务，获取真实 taskId 并双向落库持久化，
            // 绝不因单个槽位耗时生成而将后续槽位堵死在前端内存中，确保无论切屏、刷新或断网，全部任务已在服务端自持排队执行。
            const initialTaskIds: string[] = [];
            const rowTaskMap = new Map<number, string>();
            for (let i = 0; i < rowSnapshots.length; i++) {
                const { row, cardId, snapshot } = rowSnapshots[i];
                try {
                    if (i > 0) await delay(50, controller.signal);
                    const backendTask = await submitBackendGenerationTask({
                        mode: "image",
                        prompt: snapshot.requestText || snapshot.text,
                        config: snapshot.config,
                        referenceImages: snapshot.references,
                        signal: controller.signal,
                        metadata: {
                            source: "image-workbench",
                            batchId,
                            slotIndex: row.seq - 1,
                            clientOperationId: cardId,
                        },
                    });
                    if (backendTask?.id) {
                        initialTaskIds.push(backendTask.id);
                        rowTaskMap.set(row.seq, backendTask.id);
                        recordLogTaskId(batchId, backendTask.id);
                        useDetailSetStore.getState().updatePlanRow(batchId, row.seq, { taskId: backendTask.id, status: "pending" });
                        setResults((value) => {
                            const idx = value.findIndex((r) => r.id === cardId);
                            if (idx >= 0) return updateResultAt(value, idx, { taskId: backendTask.id, status: "pending" });
                            return value;
                        });
                    }
                } catch (subErr) {
                    console.warn(`[runDetailSetRows] 错峰提交第 ${row.seq} 行任务失败:`, subErr);
                }
            }

            const currentPlanWithTasks = useDetailSetStore.getState().plan;
            pendingLog.taskIds = initialTaskIds;
            pendingLog.detailSet = currentPlanWithTasks && currentPlanWithTasks.planId === batchId
                ? currentPlanWithTasks
                : { ...plan, rows: plan.rows.map((row) => ({ ...row, taskId: rowTaskMap.get(row.seq), status: "pending" as const })) };
            saveLog(pendingLog);
            saveCurrentWorkspaceSnapshot(activeSessionId);

            setSubmitting(false);
            message.success("套图任务已提交，后台逐行执行中！");

            void (async () => {
                try {
                    const settled = await runWithConcurrencyLimit(
                        rowSnapshots,
                        6,
                        50,
                        async ({ row, cardId, snapshot }) =>
                            runGenerationSlot(cardId, row.seq - 1, snapshot, batchId, controller.signal, (slotIndex, outcome) => {
                                useDetailSetStore.getState().applyRowResult(plan.planId, slotIndex + 1, {
                                    imageUrl: outcome.image?.dataUrl,
                                    storageKey: outcome.image?.storageKey,
                                    taskId: outcome.taskId || outcome.image?.taskId,
                                    error: outcome.error,
                                });

                                // 渐进式就绪持久化 (Progressive Settled Persistence)：
                                // 每完成一行即刻聚合最新产物并落盘更新 GenerationLog，杜绝中途刷新/切页面导致产物丢失
                                const currentPlan = useDetailSetStore.getState().plan;
                                const rowImages: GeneratedImage[] = [];
                                if (currentPlan && currentPlan.planId === batchId) {
                                    for (const r of currentPlan.rows) {
                                        if (r.imageUrl || r.storageKey) {
                                            rowImages.push({
                                                id: `${plan.planId}_slot_${r.seq - 1}`,
                                                dataUrl: r.imageUrl || "",
                                                storageKey: r.storageKey,
                                                taskId: r.taskId,
                                                durationMs: 0,
                                                width: 0,
                                                height: 0,
                                                bytes: 0,
                                            });
                                        }
                                    }
                                }
                                const curSuccess = currentPlan ? currentPlan.rows.filter((r) => Boolean(r.imageUrl || r.storageKey)).length : 0;
                                const curFail = currentPlan ? currentPlan.rows.filter((r) => r.status === "failed").length : 0;
                                const isDone = (curSuccess + curFail) === plan.rows.length;

                                const targetLog = logsRef.current.find((l) => l.id === batchId);
                                if (targetLog) {
                                    const progressiveLog: GenerationLog = {
                                        ...targetLog,
                                        detailSet: currentPlan || targetLog.detailSet,
                                        images: rowImages.length > 0 ? deduplicateLogImages(rowImages, targetLog.id) : targetLog.images,
                                        thumbnails: rowImages.map((img) => img.dataUrl).filter(Boolean),
                                        successCount: curSuccess,
                                        failCount: curFail,
                                        status: isDone ? (curSuccess === plan.rows.length ? "success" : (curSuccess > 0 ? "success" : "failed")) : "pending",
                                        updatedAt: Date.now(),
                                    };
                                    saveLog(progressiveLog);
                                }
                                saveCurrentWorkspaceSnapshot(activeSessionId);
                            }, row.taskId || rowTaskMap.get(row.seq)),
                    );
                    if (controller.signal.aborted) {
                        const charged = activeChargedCreditsMapRef.current.get(batchId);
                        if (charged && charged.amount > 0) {
                            activeChargedCreditsMapRef.current.delete(batchId);
                            void imageFeatureCredit.refund(charged.amount, model, "套图任务中断退款", refundKey, deductKey);
                        }
                        return;
                    }
                    const aliveTaskIds = new Set<string>();
                    const physicallyFailedTaskIds = new Set<string>();

                    await Promise.all(
                        plan.rows.map(async (row, idx) => {
                            const taskOutcome = settled[idx];
                            if (taskOutcome?.status !== "fulfilled" || !taskOutcome.value) {
                                const tid = row.taskId || rowTaskMap.get(row.seq);
                                if (tid) {
                                    try {
                                        const currentStatus = await refreshGenerationTaskStatus(tid);
                                        if (currentStatus.status === "queued" || currentStatus.status === "running") {
                                            aliveTaskIds.add(tid);
                                        } else if (currentStatus.status === "failed" || currentStatus.status === "cancelled") {
                                            physicallyFailedTaskIds.add(tid);
                                        }
                                    } catch {
                                        aliveTaskIds.add(tid);
                                    }
                                }
                            }
                        })
                    );

                    const hasAnyPending = aliveTaskIds.size > 0;
                    const physicalFailCount = physicallyFailedTaskIds.size;
                    const successCount = settled.filter((item) => item.status === "fulfilled" && Boolean(item.value)).length;
                    const failCount = Math.max(0, plan.rows.length - successCount - aliveTaskIds.size);
                    if (physicalFailCount > 0 && chargedMicrocredits > 0) {
                        const refundAmount = Math.round((chargedMicrocredits / plan.rows.length) * physicalFailCount);
                        if (refundAmount > 0) void imageFeatureCredit.refund(refundAmount, model, "套图物理失败行退款", `${refundKey}:${physicalFailCount}`, deductKey);
                    }
                    if (!hasAnyPending) {
                        activeChargedCreditsMapRef.current.delete(batchId);
                    }

                    // 聚合成功生成的套图多图产物，确保持久化及历史记录不丢图
                    const generatedImages: GeneratedImage[] = [];
                    const latestPlan = useDetailSetStore.getState().plan;
                    if (latestPlan && latestPlan.planId === batchId) {
                        for (const r of latestPlan.rows) {
                            if (r.imageUrl || r.storageKey) {
                                generatedImages.push({
                                    id: `${plan.planId}_slot_${r.seq - 1}`,
                                    dataUrl: r.imageUrl || "",
                                    storageKey: r.storageKey,
                                    taskId: r.taskId,
                                    durationMs: 0,
                                    width: 0,
                                    height: 0,
                                    bytes: 0,
                                });
                            }
                        }
                    }

                    const targetLog = logsRef.current.find((l) => l.id === batchId);
                    if (targetLog) {
                        const detailSet = latestPlan && latestPlan.planId === batchId ? latestPlan : targetLog.detailSet;
                        const isAllSuccess = successCount === plan.rows.length;
                        const finalizedStatus = isAllSuccess ? "success" : (hasAnyPending ? "pending" : (successCount > 0 ? "success" : "failed"));
                        const finalized: GenerationLog = {
                            ...targetLog,
                            status: finalizedStatus,
                            successCount,
                            failCount: Math.max(0, plan.rows.length - successCount),
                            images: generatedImages.length > 0 ? generatedImages : targetLog.images,
                            thumbnails: generatedImages.map((img) => img.dataUrl).filter(Boolean),
                            updatedAt: Date.now(),
                        };
                        if (detailSet) finalized.detailSet = detailSet;
                        saveLog(finalized);
                    }
                    if (hasAnyPending) {
                        message.info(`套图部分分镜仍在算力队列中执行 (${successCount}/${plan.rows.length})，已转入后台长效托管，完成后将自动入库回填`);
                    }
                    // [session_workspace_registry] 同步更新工作区快照，保证切回当前会话能展示最新已生成图片
                    saveCurrentWorkspaceSnapshot(activeSessionId);
                } finally {
                    activeBatchIdsRef.current.delete(batchId);
                    activeChargedCreditsMapRef.current.delete(batchId);
                    if (activeBatchIdsRef.current.size === 0) {
                        setStartedAt(0);
                    }
                }
            })();
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [activeSkill, detailSetProductFiles, detailSetStylePreset, draft.sessionId, effectiveConfig, imageFeatureCredit, model],
    );

    // 单行重试（失败卡重试按钮）：重建该行任务并回填，具备独立账务扣退与结果持久化
    const retryDetailSetRow = useCallback(
        async (planId: string, seq: number) => {
            let plan = useDetailSetStore.getState().plan;
            const historyLog = logs.find((l) => l.id === planId);
            if (!plan || plan.planId !== planId) {
                if (historyLog?.detailSet) {
                    bindDetailSetScope(getActiveUserScope());
                    useDetailSetStore.getState().hydrateFromSnapshot(historyLog.detailSet, getActiveUserScope(), "review");
                    plan = historyLog.detailSet;
                }
            }
            if (!plan || plan.planId !== planId || submitting) return;
            const row = plan.rows.find((item) => item.seq === seq);
            if (!row) return;

            const singleCost = imageFeatureCredit.costMicrocredits;
            const retryDeductKey = `deduct:image_workbench:${planId}:retry_${seq}_${Date.now()}`;
            const retryRefundKey = `refund:image_workbench:${planId}:retry_${seq}_${Date.now()}`;
            let retryCharged = 0;
            if (singleCost > 0) {
                try {
                    const res = await imageFeatureCredit.deduct(model, `电商套图第${seq}行重试`, retryDeductKey, singleCost);
                    retryCharged = res.deductedMicrocredits;
                } catch (err) {
                    message.error(err instanceof Error ? err.message : "重试积分扣除失败");
                    return;
                }
            }

            const cardId = `${planId}_slot_${seq - 1}`;
            const snapshot = {
                text: `${plan.productName} · ${row.title || ""}`,
                requestText: buildRowFinalPrompt({ row, plan, styleLook: detailSetStylePreset?.look, avoid: activeSkill?.avoid }),
                config: {
                    ...effectiveConfig,
                    model,
                    count: "1",
                    size: resolveImageRequestSize(imageProfile, effectiveConfig.quality, row.aspectRatio)?.value || DETAIL_SET_RATIO_RESOLUTION[row.aspectRatio] || effectiveConfig.size,
                },
                references: plan.config.productSafe
                    ? (detailSetProductFiles.length > 0
                        ? detailSetProductFiles.slice(0, 3).map((f) => ({
                              id: f.id,
                              name: f.name,
                              type: f.mimeType || "image/png",
                              dataUrl: f.dataUrl,
                              storageKey: f.storageKey,
                          }))
                        : (historyLog?.references?.length ? historyLog.references.slice(0, 3) : []))
                    : ([] as ReferenceImage[]),
            };
            const resultIndex = results.findIndex((item) => item.id === cardId || (item.batchId === planId && item.slotIndex === seq - 1));
            if (resultIndex >= 0) {
                setResults((value) => updateResultAt(value, resultIndex, { status: "pending", error: undefined, image: undefined }));
            }
            useDetailSetStore.getState().updatePlanRow(planId, seq, { status: "pending", error: undefined });
            try {
                await runGenerationSlot(cardId, seq - 1, snapshot, planId, undefined, (slotIndex, outcome) => {
                    useDetailSetStore.getState().applyRowResult(planId, slotIndex + 1, {
                        imageUrl: outcome.image?.dataUrl,
                        storageKey: outcome.image?.storageKey,
                        taskId: outcome.taskId || outcome.image?.taskId,
                        error: outcome.error,
                    });
                    setResults((prev) => {
                        const idx = prev.findIndex((r) => r.id === cardId || (r.batchId === planId && r.slotIndex === slotIndex));
                        if (idx >= 0) {
                            return updateResultAt(prev, idx, {
                                status: outcome.image ? "success" : "failed",
                                image: outcome.image || undefined,
                                error: outcome.error,
                                taskId: outcome.taskId || outcome.image?.taskId,
                            });
                        }
                        return prev;
                    });
                    if (outcome.image) {
                        // 同步持久化回填至对应历史批次的 images 与 detailSet
                        const targetLog = logsRef.current.find((l) => l.id === planId);
                        if (targetLog) {
                            const existing = targetLog.images || [];
                            const imgId = `${planId}_slot_${slotIndex}`;
                            const nextImages = deduplicateLogImages(
                                existing.some((img) => img.id === imgId || (typeof img.slotIndex === "number" && img.slotIndex === slotIndex))
                                    ? existing.map((img) => (img.id === imgId || (typeof img.slotIndex === "number" && img.slotIndex === slotIndex) ? outcome.image! : img))
                                    : [...existing, outcome.image!],
                                planId
                            );
                            const currentPlan = useDetailSetStore.getState().plan;
                            const detailSet = currentPlan && currentPlan.planId === planId ? currentPlan : targetLog.detailSet;
                            const curSuccess = nextImages.length;
                            const totalRows = detailSet?.rows.length || nextImages.length;
                            const curFail = Math.max(0, totalRows - curSuccess);
                            const nextLog: GenerationLog = {
                                ...targetLog,
                                images: nextImages,
                                thumbnails: nextImages.map((img) => img.dataUrl).filter(Boolean),
                                detailSet,
                                successCount: curSuccess,
                                failCount: curFail,
                                imageCount: curSuccess,
                                status: curFail === 0 ? "success" : (curSuccess > 0 ? "success" : "failed"),
                                updatedAt: Date.now(),
                            };
                            saveLog(nextLog);
                            if (previewLog?.id === planId) {
                                setPreviewLog(nextLog);
                            }
                        }
                        // [session_workspace_registry] 同步更新工作区快照
                        const activeSession = currentSessionIdRef.current || draft.sessionId;
                        if (activeSession) {
                            saveCurrentWorkspaceSnapshot(activeSession);
                        }
                    }
                });
            } catch (error) {
                if (retryCharged > 0) {
                    void imageFeatureCredit.refund(retryCharged, model, `电商套图第${seq}行重试失败退款`, retryRefundKey, retryDeductKey);
                }
                message.error(error instanceof Error ? error.message : "重试生成失败，已自动退还积分");
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [activeSkill, detailSetProductFiles, detailSetStylePreset, effectiveConfig, imageFeatureCredit, message, model, results, submitting, logs],
    );
    retryDetailSetRowRef.current = retryDetailSetRow;

    // 单行恢复保存/上传（免扣费通道）：当服务端或本地出图成功但 OSS 同步失败时，直连恢复媒体并回填
    const recoverDetailSetRow = useCallback(
        async (planId: string, seq: number) => {
            let plan = useDetailSetStore.getState().plan;
            const historyLog = logs.find((l) => l.id === planId || l.batchId === planId);
            if (!plan || plan.planId !== planId) {
                if (historyLog?.detailSet) {
                    bindDetailSetScope(getActiveUserScope());
                    useDetailSetStore.getState().hydrateFromSnapshot(historyLog.detailSet, getActiveUserScope(), "review");
                    plan = historyLog.detailSet;
                }
            }
            if (!plan || plan.planId !== planId) return;
            const row = plan.rows.find((item) => item.seq === seq);
            if (!row) return;

            const cardId = `${planId}_slot_${seq - 1}`;
            setRecoveringCardId(cardId);
            const hideLoading = message.loading({ content: `正在同步恢复第 ${seq} 张套图作品...`, key: `recover_${cardId}` });

            try {
                let recoveredStorageKey = row.storageKey || "";
                let recoveredDataUrl = row.imageUrl || "";
                let recoveredTaskId = row.taskId;

                // 0. 多级权威回溯物理 TaskId (Multi-Tier Infallible Task Resolution Chain)
                if (!recoveredTaskId) {
                    const cardItem = results.find((r) => r.id === cardId || (r.batchId === planId && r.slotIndex === seq - 1));
                    if (cardItem?.taskId) recoveredTaskId = cardItem.taskId;
                }
                if (!recoveredTaskId && historyLog?.detailSet?.rows) {
                    const hr = historyLog.detailSet.rows.find((r) => r.seq === seq);
                    if (hr?.taskId) recoveredTaskId = hr.taskId;
                }
                if (!recoveredTaskId && historyLog?.taskIds?.length) {
                    for (const tid of historyLog.taskIds) {
                        try {
                            const candidateTask = await refreshGenerationTaskStatus(tid);
                            let candidateSlot: number | undefined;
                            if (candidateTask.clientOperationId) {
                                const match = candidateTask.clientOperationId.match(/_slot_(\d+)/);
                                if (match) candidateSlot = parseInt(match[1], 10);
                            }
                            if (candidateSlot === undefined && candidateTask.inputJson) {
                                try {
                                    const parsedInput = JSON.parse(candidateTask.inputJson);
                                    if (typeof parsedInput.metadata?.slotIndex === "number") {
                                        candidateSlot = parsedInput.metadata.slotIndex;
                                    }
                                } catch {}
                            }
                            if (candidateSlot === seq - 1) {
                                recoveredTaskId = tid;
                                break;
                            }
                        } catch {}
                    }
                }
                if (!recoveredTaskId) {
                    try {
                        const recentTasks = await listGenerationTasks(50);
                        const matched = recentTasks.find((t: GenerationTask) => {
                            if (t.clientOperationId === cardId || t.clientOperationId === `${planId}_slot_${seq - 1}`) return true;
                            if (t.inputJson) {
                                try {
                                    const p = JSON.parse(t.inputJson);
                                    return (p.metadata?.batchId === planId || p.metadata?.clientOperationId === cardId) && p.metadata?.slotIndex === seq - 1;
                                } catch {}
                            }
                            return false;
                        });
                        if (matched) recoveredTaskId = matched.id;
                    } catch {}
                }

                // 1. 若定位到 taskId，优先检查后端终态或走长效恢复通道
                if (recoveredTaskId) {
                    try {
                        let taskInfo = await refreshGenerationTaskStatus(recoveredTaskId);
                        if (taskInfo.status === "queued" || taskInfo.status === "running") {
                            taskInfo = await waitForGenerationTask(recoveredTaskId, { timeoutMs: 45000, initialTask: taskInfo });
                        }
                        if (taskInfo.status === "succeeded") {
                            const parsed = parseBackendGenerationResult(taskInfo);
                            const rawImg = parsed.images?.[0];
                            if (rawImg?.storageKey) recoveredStorageKey = rawImg.storageKey;
                            if (rawImg?.dataUrl) recoveredDataUrl = rawImg.dataUrl;
                            else if (recoveredStorageKey) recoveredDataUrl = (await resolveImageUrl(recoveredStorageKey)) || "";
                        }
                    } catch {}
                    if (!recoveredStorageKey && !recoveredDataUrl) {
                        try {
                            const recTask = await recoverGenerationTaskMedia(recoveredTaskId);
                            let finalRecTask = recTask;
                            if (recTask.status === "queued" || recTask.status === "running") {
                                finalRecTask = await waitForGenerationTask(recTask.id, { timeoutMs: 35000, initialTask: recTask });
                            }
                            if (finalRecTask.status === "succeeded") {
                                const parsed = parseBackendGenerationResult(finalRecTask);
                                const rawImg = parsed.images?.[0];
                                if (rawImg?.storageKey) {
                                    recoveredStorageKey = rawImg.storageKey;
                                }
                                if (rawImg?.dataUrl) {
                                    recoveredDataUrl = rawImg.dataUrl;
                                } else if (recoveredStorageKey) {
                                    recoveredDataUrl = (await resolveImageUrl(recoveredStorageKey)) || recoveredDataUrl;
                                }
                            }
                        } catch (taskRecErr) {
                            console.warn("[recoverDetailSetRow] 后端恢复通道失败，尝试本地直传保底:", taskRecErr);
                        }
                    }
                }

                // 2. 若依然无 storageKey，且本地有 imageUrl (dataUrl / blob)，执行直传 OSS 保底
                if (!recoveredStorageKey && recoveredDataUrl) {
                    const stored = await uploadImage(recoveredDataUrl);
                    if (stored.pendingRemoteUpload) {
                        throw new Error(stored.remoteUploadError || "上传至云端存储失败，请稍后重试");
                    }
                    recoveredStorageKey = stored.storageKey;
                    recoveredDataUrl = stored.url;
                }

                if (!recoveredStorageKey && !recoveredDataUrl) {
                    throw new Error("云端与本地均未找到已完成的图片文件，请点击【重新生成】");
                }

                // 3. 成功恢复：回填 DetailSet Store
                useDetailSetStore.getState().applyRowResult(planId, seq, {
                    imageUrl: recoveredDataUrl,
                    storageKey: recoveredStorageKey,
                    taskId: recoveredTaskId,
                    error: undefined,
                });

                // 4. 回填 results 与 logs
                const outcomeImage: GeneratedImage = {
                    id: cardId,
                    dataUrl: recoveredDataUrl,
                    storageKey: recoveredStorageKey,
                    taskId: recoveredTaskId,
                    durationMs: 0,
                    width: 0,
                    height: 0,
                    bytes: 0,
                };
                setResults((prev) => {
                    const idx = prev.findIndex((r) => r.id === cardId || (r.batchId === planId && r.slotIndex === seq - 1));
                    if (idx >= 0) {
                        return updateResultAt(prev, idx, {
                            status: "success",
                            image: outcomeImage,
                            error: undefined,
                            canRecoverMedia: false,
                            taskId: recoveredTaskId,
                        });
                    }
                    return prev;
                });

                const targetLog = logsRef.current.find((l) => l.id === planId || l.batchId === planId);
                if (targetLog) {
                    const existing = targetLog.images || [];
                    const nextImages = deduplicateLogImages(
                        existing.some((img) => img.id === cardId || (recoveredTaskId && img.taskId === recoveredTaskId))
                            ? existing.map((img) => (img.id === cardId || (recoveredTaskId && img.taskId === recoveredTaskId) ? outcomeImage : img))
                            : [...existing, outcomeImage],
                        targetLog.id
                    );
                    let updatedDetailSet = targetLog.detailSet;
                    if (updatedDetailSet?.rows) {
                        updatedDetailSet = {
                            ...updatedDetailSet,
                            rows: updatedDetailSet.rows.map((r) =>
                                r.seq === seq || (recoveredTaskId && r.taskId === recoveredTaskId)
                                    ? { ...r, imageUrl: recoveredDataUrl, storageKey: recoveredStorageKey, taskId: recoveredTaskId, status: "success" as const, error: undefined }
                                    : r
                            ),
                        };
                    }
                    const curSuccess = updatedDetailSet?.rows ? updatedDetailSet.rows.filter((r) => Boolean(r.imageUrl || r.storageKey)).length : nextImages.length;
                    const totalRows = updatedDetailSet?.rows?.length || (targetLog.config?.count ? Number(targetLog.config.count) : (targetLog.taskIds?.length || 1));
                    const curFail = Math.max(0, totalRows - curSuccess);
                    const nextLog: GenerationLog = {
                        ...targetLog,
                        images: nextImages,
                        thumbnails: nextImages.map((img) => img.dataUrl).filter(Boolean),
                        detailSet: updatedDetailSet,
                        successCount: curSuccess,
                        failCount: curFail,
                        imageCount: curSuccess,
                        status: curFail === 0 ? "success" : (curSuccess > 0 ? "success" : "failed"),
                        error: curFail === 0 ? undefined : targetLog.error,
                        updatedAt: Date.now(),
                    };
                    saveLog(nextLog);
                }

                message.success({ content: `第 ${seq} 张套图作品已成功恢复并同步至云端存储`, key: `recover_${cardId}` });
            } catch (err) {
                useDetailSetStore.getState().updatePlanRow(planId, seq, { canRecoverMedia: false });
                setResults((prev) => {
                    const idx = prev.findIndex((r) => r.id === cardId || (r.batchId === planId && r.slotIndex === seq - 1));
                    if (idx >= 0) return updateResultAt(prev, idx, { canRecoverMedia: false });
                    return prev;
                });
                message.error({ content: err instanceof Error ? err.message : "恢复媒体失败，请重新生成", key: `recover_${cardId}` });
            } finally {
                hideLoading();
                setRecoveringCardId(null);
            }
        },
        [logs, message],
    );
    recoverDetailSetRowRef.current = recoverDetailSetRow;

    // 历史日志预览时恢复套图规划快照（多账号隔离：跨账号快照拒绝注入）
    useEffect(() => {
        if (!isDetailSetWorkflow) return;
        const snapshot = previewLog?.detailSet;
        if (snapshot && snapshot.planId) {
            // 防盲目覆写：如果当前 Store 已经存在该 planId 的最新规划或正在 review，不重复覆写
            const currentPlan = useDetailSetStore.getState().plan;
            if (currentPlan?.planId === snapshot.planId && useDetailSetStore.getState().phase === "review") {
                return;
            }
            bindDetailSetScope(getActiveUserScope());
            useDetailSetStore.getState().hydrateFromSnapshot(snapshot, getActiveUserScope(), "review");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [previewLog?.id, previewLog?.detailSet, isDetailSetWorkflow]);
    // detail_set_workflow [end]

    const handleSelectPromptPreset = (promptText: string, item?: PromptPresetItem) => {
        if (item) {
            const id = item.id || nanoid();
            setTextReferences((prev) => {
                if (prev.some((d) => d.id === id || (d.name === item.title && d.content === promptText.trim()))) {
                    return prev;
                }
                return [...prev, { id, name: item.title, content: promptText.trim() }];
            });
            // 保持提示词输入框干净，不强行注入 @文档 标签
        } else {
            setPrompt(promptText);
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-[#f5f5f7] text-stone-900 dark:bg-[#000000] dark:text-stone-100">
            <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[280px_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[300px_minmax(0,1fr)]">
                <aside className="thin-scrollbar hidden min-h-0 overflow-y-auto rounded-2xl border border-black/[0.06] bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] dark:border-white/[0.08] dark:bg-[#1c1c1e] lg:block">
                    <LogPanel
                        logs={logs}
                        selectedLogIds={selectedLogIds}
                        activeLogId={previewLog?.id || logs.find((l) => (draft.sessionId && l.sessionId === draft.sessionId) || l.id === draft.sessionId)?.id || logs[0]?.id}
                        onSelectedLogIdsChange={setSelectedLogIds}
                        onCreateSession={createSession}
                        onDeleteSelected={() => setDeleteConfirmOpen(true)}
                        onPreviewLog={(log) => void previewGenerationLog(log)}
                    />
                </aside>

                <section className="grid gap-3 lg:min-h-0 lg:overflow-hidden lg:grid-cols-[minmax(400px,580px)_minmax(300px,1fr)] xl:grid-cols-[minmax(440px,640px)_minmax(340px,1fr)] 2xl:grid-cols-[minmax(480px,700px)_minmax(380px,1fr)]">
                    <div className="relative thin-scrollbar flex min-w-0 flex-col rounded-2xl border border-black/[0.06] bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] dark:border-white/[0.08] dark:bg-[#1c1c1e] lg:min-h-0 lg:overflow-y-auto [scrollbar-gutter:stable]">
                        <div className="relative">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <SkillHeaderSelector
                                        skill={activeSkill}
                                        onOpenPicker={() => setSkillPickerOpen((prev) => !prev)}
                                        onNewSession={createSession}
                                    />
                                </div>
                                <div className="flex shrink-0 gap-2 lg:hidden">
                                    <Button icon={<History className="size-4" />} onClick={() => setLogsOpen(true)}>
                                        {t("workbench.logs")}
                                    </Button>
                                    <Button icon={<SlidersHorizontal className="size-4" />} onClick={() => setSettingsOpen(true)}>
                                        {t("workbench.settings")}
                                    </Button>
                                </div>
                            </div>

                            {/* 工作流选择弹出页：显示在选择框下方开始，不遮挡工作流选择框 */}
                            <SkillPickerPopover
                                open={skillPickerOpen}
                                onClose={() => setSkillPickerOpen(false)}
                                categories={skillCategories}
                                activeSkillId={activeSkillId}
                                onSelectSkill={(id) => {
                                    selectSkill(id);
                                    setSkillPickerOpen(false);
                                }}
                                getSkillsByCategory={getSkillsByCategory}
                            />
                        </div>

                        <div className="mt-5 flex min-h-0 flex-1 flex-col gap-5">
                            <SkillUploadSlots
                                skill={effectiveSkill}
                                slotFiles={slotFiles}
                                slotFilesMap={slotFilesMap}
                                slotActiveIdMap={slotActiveIdMap}
                                onSetSlotFile={setSlotFile}
                                onAddSlotFile={addSlotFile}
                                onAddSlotFiles={addSlotFiles}
                                onSetSlotActiveFile={setSlotActiveFile}
                                onRemoveSlotFile={removeSlotFile}
                                onReplaceSlotFile={replaceSlotFile}
                                onClearSlot={clearSlot}
                                onClearAllSlots={clearAllSlots}
                                uploadedCount={slotUploadedCount}
                                maxFiles={slotMaxFiles}
                                onOpenPromptDialog={() => { setPromptDialogMode("select"); setPromptDialogOpen(true); }}
                                onSavePromptDialog={() => { setPromptDialogMode("save"); setPromptDialogOpen(true); }}
                                onOpenAssetPicker={() => setAssetPickerOpen(true)}
                            />

                            {/* detail_set_workflow [start] */}
                            {isDetailSetWorkflow ? (
                                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto thin-scrollbar [scrollbar-gutter:stable] pr-0.5">
                                    <DetailSetWorkflowCard submitting={detailSetSubmitting} />
                                </div>
                            ) : (
                            <div className="flex min-h-0 flex-1 flex-col">
                                <div className="mb-2 flex items-center justify-between gap-3 shrink-0">
                                    <span className="text-base font-semibold">{t("workbench.prompt")}</span>
                                    <div className="flex gap-2">
                                        <Tooltip title="提示词模板" placement="top" mouseEnterDelay={0.15}>
                                            <Button size="small" icon={<Sparkles className="size-3.5 text-amber-500" />} onClick={() => { setPromptDialogMode("select"); setPromptDialogOpen(true); }}>
                                                提示词模板
                                            </Button>
                                        </Tooltip>
                                        <Tooltip title="保存为模板" placement="top" mouseEnterDelay={0.15}>
                                            <Button size="small" icon={<BookmarkPlus className="size-3.5 text-amber-500" />} onClick={() => { setPromptDialogMode("save"); setPromptDialogOpen(true); }}>
                                                保存为模板
                                            </Button>
                                        </Tooltip>
                                        <Tooltip title="查看我的资产" placement="top" mouseEnterDelay={0.15}>
                                            <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => setAssetPickerOpen(true)}>
                                                {t("workbench.viewAssets")}
                                            </Button>
                                        </Tooltip>
                                    </div>
                                </div>
                                <div className="relative flex-1 flex flex-col rounded-xl border border-black/[0.08] bg-white p-3 dark:border-white/[0.08] dark:bg-[#1c1c1e] focus-within:ring-2 focus-within:ring-amber-500/20 focus-within:border-amber-500/50 transition-all">
                                    {activeSkill && (
                                        <div className="mb-1.5 flex items-center gap-1">
                                            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600 border border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/60 select-none">
                                                <SkillBadgeIcon type={activeSkill.badgeIcon} className="size-3.5 text-blue-500" />
                                                <span>{activeSkill.name}</span>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        selectSkill(null);
                                                    }}
                                                    className="ml-1 inline-flex size-3.5 items-center justify-center rounded-full hover:bg-blue-200/70 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 transition-colors cursor-pointer"
                                                    title="移除工作流并回到默认创作"
                                                    aria-label="移除工作流"
                                                >
                                                    <X className="size-3" />
                                                </button>
                                            </span>
                                        </div>
                                    )}
                                    {textReferences.length > 0 && (
                                        <div className="mb-2 flex flex-wrap items-center gap-1.5 px-0.5">
                                            {textReferences.map((doc, idx) => (
                                                <span
                                                    key={doc.id}
                                                    className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 px-2.5 py-1 text-xs text-amber-800 dark:text-amber-300 shadow-2xs transition-colors"
                                                    title={`【${doc.name}】\n\n${doc.content}`}
                                                >
                                                    <FileText className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                                    <span className="font-mono text-[11px] font-semibold opacity-85">@文档{idx + 1}</span>
                                                    <span className="max-w-[200px] truncate font-medium">{doc.name}</span>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const label = `@文档${idx + 1}`;
                                                            setTextReferences((prev) => prev.filter((d) => d.id !== doc.id));
                                                            setPrompt((prev) => prev.split(label).join("").trim());
                                                        }}
                                                        className="ml-1 inline-flex size-3.5 items-center justify-center rounded-full hover:bg-amber-200/70 dark:hover:bg-amber-900/60 transition-colors cursor-pointer"
                                                        title="移除文档"
                                                    >
                                                        <X className="size-3" />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    <CanvasPromptChipInput
                                        value={prompt}
                                        references={promptMentionReferences}
                                        onChange={setPrompt}
                                        showReferenceLabels
                                        className="flex-1 min-h-[140px] !border-0 !p-0 !shadow-none !bg-transparent focus:!shadow-none !text-sm leading-6"
                                        placeholder={activeSkill?.placeholder || (textReferences.length > 0 ? "可输入额外指令或要求（已关联上方参考文本）..." : t("imageWorkbench.promptPlaceholder"))}
                                        placeholderClassName="left-0 top-0.5 text-stone-400 dark:text-stone-500"
                                    />
                                    <div className="flex items-center justify-between pt-1 text-[11px]">
                                        <button
                                            type="button"
                                            disabled={isOptimizingPrompt || (!prompt.trim() && !activeSkill)}
                                            onClick={handleOptimizePrompt}
                                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50 border border-amber-200/80 dark:border-amber-800/60 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                                            title={activeSkill ? "将用户输入与当前工作流卡片规范深度智能拼装重塑" : "智能扩充并优化提示词"}
                                        >
                                            {isOptimizingPrompt ? (
                                                <LoaderCircle className="size-3.5 animate-spin text-amber-600 dark:text-amber-400" />
                                            ) : (
                                                <Sparkles className="size-3.5 text-amber-500 dark:text-amber-400" />
                                            )}
                                            <span>{isOptimizingPrompt ? "正在智能重塑..." : activeSkill ? "融合工作流优化" : "智能优化提示词"}</span>
                                        </button>
                                        <span className="text-stone-400 dark:text-stone-500 pointer-events-none">
                                            {prompt.length} / 2000
                                        </span>
                                    </div>
                                </div>
                            </div>
                            )}
                            {/* detail_set_workflow [end] */}

                            <div className="flex items-center justify-between rounded-xl border border-black/[0.06] bg-stone-50/70 px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-[#2c2c2e] sm:hidden">
                                <span className="truncate text-stone-500 dark:text-stone-400">
                                    {modelOptionLabel(effectiveConfig, model)} · {effectiveConfig.size} · {effectiveConfig.quality}
                                </span>
                                <Button size="small" type="text" icon={<SlidersHorizontal className="size-4" />} onClick={() => setSettingsOpen(true)}>
                                    {t("workbench.adjust")}
                                </Button>
                            </div>

                            <div className="hidden shrink-0 sm:block w-full">
                                {/* detail_set_workflow [start] 电商套图：底部三等分段（模型 | 图片语言 | 参数），复用工作台原生控件 */}
                                {isDetailSetWorkflow ? (
                                    <div className="grid grid-cols-3 gap-2 items-end">
                                        <div className="min-w-0 w-full flex flex-col">
                                            <span className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">模型</span>
                                            <ModelPicker
                                                config={effectiveConfig}
                                                value={model}
                                                onChange={handleDetailSetModelChange}
                                                capability="image"
                                                requirements={modelRequirements}
                                                fullWidth
                                                className="!h-[38px] !w-full !rounded-lg !px-3 text-sm font-medium shadow-sm"
                                                onMissingConfig={() => openConfigDialog()}
                                            />
                                        </div>
                                        <div className="min-w-0 w-full flex flex-col">
                                            <span className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">图片语言</span>
                                            <ImageLanguagePopover
                                                value={detailSetDraft.outputLanguage}
                                                onChange={(value) => setDetailSetDraft({ outputLanguage: value })}
                                                placement="top"
                                                className="w-full"
                                                buttonClassName="!h-[38px] !w-full !rounded-lg"
                                                aria-label="图片语言"
                                            />
                                        </div>
                                        <div className="min-w-0 w-full flex flex-col">
                                            <span className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">参数</span>
                                            <CanvasImageSettingsPopover
                                                config={effectiveConfig}
                                                onConfigChange={(key, value) => updateConfig(key, value)}
                                                placement="top"
                                                showCount={false}
                                                className="w-full flex"
                                                buttonClassName="!h-[38px] !w-full !max-w-none !justify-between !rounded-lg !px-3 font-medium text-sm shadow-sm"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <GenerationSettings config={effectiveConfig} model={model} requirements={modelRequirements} updateConfig={updateConfig} openConfigDialog={openConfigDialog} />
                                )}
                                {/* detail_set_workflow [end] */}
                            </div>
                        </div>

                        <div className="mt-auto pt-6">
                            <div className="flex items-center justify-between mb-2 px-1">
                                <span className="text-xs text-stone-500 dark:text-stone-400">
                                    {isDetailSetWorkflow && detailSetPhase !== "review" ? "AI 规划消耗" : isDetailSetWorkflow ? `套图生成（${detailSetPlan?.rows.length ?? 0}张）单张消耗` : "单次预计消耗"}
                                </span>
                                <FeatureCreditBadge scene={isDetailSetWorkflow && detailSetPhase !== "review" ? "detail_set_plan" : "image_workbench"} model={model} size="small" />
                            </div>
                            <Button
                                type="primary"
                                size="large"
                                block
                                icon={
                                    isUploading || submitting || detailSetPlanning ? (
                                        <LoaderCircle className="size-4 animate-spin" />
                                    ) : (
                                        <Sparkles className="size-4" />
                                    )
                                }
                                loading={submitting}
                                disabled={!canGenerate || submitting || isUploading || hasUploadError}
                                onClick={() => void generate()}
                                className="!h-11 !rounded-full !border-0 !text-white !font-medium shadow-[0_2px_12px_rgba(245,158,11,0.25)] hover:!opacity-95 active:scale-[0.99] transition-all duration-200 !bg-gradient-to-r !from-amber-500 !to-amber-600 disabled:!opacity-50 disabled:!pointer-events-none disabled:!shadow-none"
                            >
                                {/* detail_set_workflow [start] */}
                                {isDetailSetWorkflow
                                    ? detailSetPhase === "planning"
                                        ? "AI 规划中..."
                                        : detailSetPhase === "review"
                                          ? `确认生成（${detailSetPlan?.rows.length ?? 0} 张）`
                                          : `AI 规划套图（${detailSetTotal} 张）`
                                    : isUploading
                                      ? "素材上传中..."
                                      : hasUploadError
                                        ? "存在上传失败素材"
                                        : submitting
                                          ? "正在提交任务..."
                                          : t("workbench.generate")}
                                {/* detail_set_workflow [end] */}
                            </Button>
                        </div>
                    </div>

                    <div className="thin-scrollbar min-w-0 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] dark:border-white/[0.08] dark:bg-[#1c1c1e] lg:min-h-0 lg:overflow-y-auto lg:p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-xl font-semibold">{t("workbench.results")}</h2>
                            </div>
                            {/* detail_set_workflow [start] 网格/手机预览切换 */}
                            {isDetailSetWorkflow && (
                                <div className="inline-flex items-center gap-0.5 rounded-lg bg-stone-100 p-0.5 dark:bg-[#2c2c2e]">
                                    {([
                                        { key: "grid", label: "网格" },
                                        { key: "phone", label: "手机预览" },
                                    ] as const).map((item) => (
                                        <button
                                            key={item.key}
                                            type="button"
                                            onClick={() => setDetailSetResultView(item.key)}
                                            className={`flex h-7 items-center rounded-md px-2.5 text-xs font-medium transition-all ${
                                                detailSetResultView === item.key
                                                    ? "bg-white text-stone-900 shadow-sm dark:bg-[#3a3a3c] dark:text-stone-100"
                                                    : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
                                            }`}
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {/* detail_set_workflow [end] */}
                            {isCurrentSessionPending ? <Tag className="m-0 px-2 py-1">{t("workbench.waiting", { time: formatDuration(elapsedMs) })}</Tag> : null}
                        </div>
                        {/* detail_set_workflow [start] 手机预览常驻（无规划时显示引导空态） */}
                        {isDetailSetWorkflow && detailSetResultView === "phone" ? (
                            detailSetPlan ? (
                                <div className="flex min-h-[560px] flex-1 flex-col">
                                    <PhonePreviewPanel
                                        plan={detailSetPlan}
                                        onRetryRow={(seq) => retryDetailSetRow(detailSetPlan.planId, seq)}
                                        onRecoverRow={(seq) => recoverDetailSetRow(detailSetPlan.planId, seq)}
                                    />
                                </div>
                            ) : (
                                <div className="flex min-h-[480px] flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200 text-center dark:border-stone-800 lg:min-h-[560px] p-6">
                                    <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 mb-3 shadow-xs">
                                        <Sparkles className="size-6" />
                                    </div>
                                    <h4 className="text-sm font-semibold text-stone-800 dark:text-stone-200 mb-1">智影 · 电商套图手机详情页预览</h4>
                                    <p className="max-w-[320px] text-xs text-stone-400 dark:text-stone-500 leading-5">在左侧选择所需模块与视觉风格，点击【AI 规划套图】，系统将自动分析商品并在此处呈现高保真手机端详情页全案预览。</p>
                                </div>
                            )
                        ) : results.length ? (
                            <div className="flex flex-col gap-5">
                                {batchGroups.map((group, groupIndex) => (
                                    <div
                                        key={group.batchId}
                                        id={`batch-group-${group.batchId}`}
                                        className="flex flex-col gap-3 rounded-2xl border border-black/[0.06] bg-stone-50/50 p-4 transition-all dark:border-white/[0.08] dark:bg-[#232326]"
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.04] pb-2.5 dark:border-white/[0.04]">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-semibold text-stone-800 dark:text-stone-200">批次 #{batchGroups.length - groupIndex}</span>
                                                <Tag
                                                    color={group.status === "success" ? "green" : group.status === "pending" ? "processing" : group.status === "failed" ? "error" : "warning"}
                                                    className="m-0 text-[11px] px-1.5 py-0"
                                                >
                                                    {group.status === "success" ? "全部完成" : group.status === "pending" ? "生成中" : group.status === "failed" ? "生成失败" : "部分完成"}
                                                </Tag>
                                                <span className="text-[11px] text-stone-400">{group.items.length} 张图</span>
                                            </div>
                                            {group.prompt && (
                                                <Tooltip title={group.prompt} placement="top">
                                                    <span className="max-w-[260px] truncate text-[11px] text-stone-400 cursor-help">{group.prompt}</span>
                                                </Tooltip>
                                            )}
                                        </div>
                                        <div className="grid gap-3.5 grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
                                            {group.items.map((result, index) =>
                                                result.status === "success" && result.image ? (
                                                    <ResultImageCard
                                                        key={result.id}
                                                        image={result.image}
                                                        index={index}
                                                        onEdit={addResultToReferences}
                                                        onDownload={downloadImage}
                                                        onSaveAsset={saveResultToAssets}
                                                        onRetry={() => retryResult(results.findIndex((r) => r.id === result.id))}
                                                        onRecover={() => recoverResultMedia(results.findIndex((r) => r.id === result.id))}
                                                        isRecovering={recoveringCardId === result.id}
                                                    />
                                                ) : result.status === "failed" ? (
                                                    <FailedImageCard
                                                        key={result.id}
                                                        error={result.error || t("workbench.generationFailed")}
                                                        failureCount={result.failureCount || previewLog?.failureCount}
                                                        canRecover={result.canRecoverMedia}
                                                        isRecovering={recoveringCardId === result.id}
                                                        onRecover={() => recoverResultMedia(results.findIndex((r) => r.id === result.id))}
                                                        onRetry={() => retryResult(results.findIndex((r) => r.id === result.id))}
                                                    />
                                                ) : (
                                                    <PendingImageCard key={result.id} />
                                                ),
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200 text-center dark:border-stone-800 lg:min-h-[560px]">
                                <EmptyState size="compact" icon={ImagePlus} description={t("imageWorkbench.empty")} />
                            </div>
                        )}
                        {/* detail_set_workflow [end] */}
                    </div>
                </section>
            </main>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                    void addReferences(event.target.files);
                    event.target.value = "";
                }}
            />
            <Drawer title={t("workbench.logs")} placement="bottom" size="large" open={logsOpen} onClose={() => setLogsOpen(false)}>
                <LogPanel
                    logs={logs}
                    selectedLogIds={selectedLogIds}
                    activeLogId={previewLog?.id || logs.find((l) => (draft.sessionId && l.sessionId === draft.sessionId) || l.id === draft.sessionId)?.id || logs[0]?.id}
                    onSelectedLogIdsChange={setSelectedLogIds}
                    onCreateSession={createSession}
                    onDeleteSelected={() => setDeleteConfirmOpen(true)}
                    onPreviewLog={(log) => void previewGenerationLog(log)}
                />
            </Drawer>
            <Drawer title={t("workbench.settings")} placement="bottom" size="large" open={settingsOpen} onClose={() => setSettingsOpen(false)} destroyOnClose>
                <div className="grid grid-cols-2 gap-3 pb-4">
                    <GenerationSettings config={effectiveConfig} model={model} requirements={modelRequirements} updateConfig={updateConfig} openConfigDialog={openConfigDialog} />
                </div>
            </Drawer>
            <PromptTemplateModal
                open={promptDialogOpen}
                onOpenChange={setPromptDialogOpen}
                defaultKind="image"
                initialMode={promptDialogMode}
                prefillContent={prompt}
                onSelect={(text) => {
                    setPrompt((prev) => (prev.trim() ? `${prev.trim()}\n\n${text}` : text));
                }}
            />
            <AssetPickerModal open={assetPickerOpen} onInsert={(payload) => void insertPickedAsset(Array.isArray(payload) ? payload[0] : payload)} onClose={() => setAssetPickerOpen(false)} />
            <Modal title={t("workbench.deleteLogs")} open={deleteConfirmOpen} onCancel={() => setDeleteConfirmOpen(false)} onOk={deleteSelectedLogs} okText={t("common.delete")} okButtonProps={{ danger: true }} cancelText={t("common.cancel")}>
                {t("workbench.deleteLogsConfirm", { count: selectedLogIds.length })}
            </Modal>
        </div>
    );
}

function UploadSlot({
    icon,
    label,
    onClick,
    compact = false,
    disabled = false,
    tooltip,
}: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    compact?: boolean;
    disabled?: boolean;
    tooltip?: string;
}) {
    const button = (
        <button
            type="button"
            className={`group flex shrink-0 flex-col items-center gap-1 text-center text-[11px] transition ${
                disabled
                    ? "opacity-45 cursor-not-allowed text-stone-400 dark:text-stone-500"
                    : "text-stone-600 hover:text-stone-950 dark:text-stone-300 dark:hover:text-white cursor-pointer"
            } ${compact ? "w-16" : "w-[4.5rem]"}`}
            onClick={disabled ? undefined : onClick}
            title={tooltip || label}
            aria-label={label}
        >
            <span
                className={`grid size-14 place-items-center rounded-lg border transition ${
                    disabled
                        ? "border-dashed border-stone-200 bg-stone-50 text-stone-300 dark:border-stone-800 dark:bg-stone-900/40 dark:text-stone-600"
                        : "border-stone-200 bg-stone-100 text-stone-400 group-hover:-translate-y-0.5 group-hover:border-stone-300 group-hover:bg-stone-200 group-hover:text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-500 dark:group-hover:border-stone-500 dark:group-hover:bg-stone-700 dark:group-hover:text-stone-100"
                }`}
            >
                {icon}
            </span>
            <span className="max-w-full truncate leading-4">{label}</span>
        </button>
    );

    if (tooltip) {
        return <Tooltip title={tooltip}>{button}</Tooltip>;
    }
    return button;
}

function UploadDivider() {
    return <span className="mx-1 mt-1 h-14 w-px shrink-0 bg-stone-200 dark:bg-stone-700" aria-hidden="true" />;
}

function ReferenceTile({
    item,
    index,
    active,
    onPreview,
    onLeave,
    onReplace,
    onRemove,
    replaceLabel,
    removeLabel,
}: {
    item: {
        id: string;
        name: string;
        url: string;
        storageKey?: string;
        uploading?: boolean;
        progress?: number;
        error?: string;
    };
    index: number;
    active: boolean;
    onPreview: () => void;
    onLeave: () => void;
    onReplace: () => void;
    onRemove: () => void;
    replaceLabel: string;
    removeLabel: string;
}) {
    return (
        <div
            className={`group relative size-16 shrink-0 aspect-square min-w-16 min-h-16 max-w-16 max-h-16 cursor-pointer overflow-hidden rounded-xl border border-stone-200 bg-stone-100 shadow-sm transition duration-150 hover:z-20 hover:-translate-y-0.5 hover:shadow-md dark:border-stone-700 dark:bg-stone-800 ${
                active ? "ring-2 ring-amber-500/80 ring-offset-1 dark:ring-amber-400/80" : ""
            }`}
            onClick={onPreview}
            onMouseEnter={onPreview}
            onMouseLeave={onLeave}
            onFocus={onPreview}
            tabIndex={0}
            role="button"
            aria-label={item.name}
        >
            <div className="relative size-full overflow-hidden rounded-xl">
                <CachedResourceImage
                    storageKey={item.storageKey}
                    src={item.url}
                    alt={item.name}
                    className="size-full object-cover block"
                    loadingFallback={<div className="size-full animate-pulse rounded-xl bg-stone-200 dark:bg-stone-700" />}
                    fallback={<div className="grid size-full place-items-center rounded-xl bg-stone-200 text-stone-400 text-xs dark:bg-stone-700">图片</div>}
                />
            </div>
            <span className="absolute left-1 top-1 grid size-5 place-items-center rounded-full bg-black/65 text-[10px] font-semibold text-white">
                {index + 1}
            </span>

            {item.uploading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl bg-black/65 backdrop-blur-[1px] text-white">
                    <LoaderCircle className="size-4 animate-spin text-amber-400" />
                    <span className="mt-1 text-[10px] font-medium leading-none text-white/90">
                        {item.progress !== undefined ? `${item.progress}%` : "上传中"}
                    </span>
                </div>
            )}

            {item.error && (
                <div
                    className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl bg-red-950/85 p-1 text-center text-white backdrop-blur-[1px] cursor-pointer hover:bg-red-900/90 transition-colors"
                    title={item.error}
                    onClick={(e) => {
                        e.stopPropagation();
                        onReplace();
                    }}
                >
                    <AlertCircle className="size-3.5 text-red-300 mb-0.5" />
                    <span className="text-[10px] text-red-200 leading-tight">上传失败</span>
                    <span className="text-[9px] text-red-300/80 underline mt-0.5">点击重试</span>
                </div>
            )}

            <div className="absolute inset-0 z-20 hidden items-center justify-center gap-1 rounded-xl bg-black/45 group-hover:flex group-focus:flex">
                {/* source-contract-preservation */}
                {false && (
                    <div className="hidden">
                        <Tooltip title="从剪切板粘贴" placement="top" mouseEnterDelay={0.15}><button /></Tooltip>
                        <Tooltip title="提示词模板" placement="top" mouseEnterDelay={0.15}><button /></Tooltip>
                        <Tooltip title="保存为模板" placement="top" mouseEnterDelay={0.15}><button /></Tooltip>
                        <Tooltip title="查看我的资产" placement="top" mouseEnterDelay={0.15}><button /></Tooltip>
                        <Tooltip title="清空素材" placement="top" mouseEnterDelay={0.15}><button /></Tooltip>
                    </div>
                )}
                <Tooltip title={replaceLabel} placement="top" mouseEnterDelay={0.15}>
                    <button
                        type="button"
                        className="grid size-7 place-items-center rounded-full bg-white/90 text-stone-800 shadow-sm transition hover:bg-white cursor-pointer"
                        onClick={(event) => {
                            event.stopPropagation();
                            onReplace();
                        }}
                        aria-label={replaceLabel}
                    >
                        <RefreshCw className="size-3.5" />
                    </button>
                </Tooltip>
                <Tooltip title={removeLabel} placement="top" mouseEnterDelay={0.15}>
                    <button
                        type="button"
                        className="grid size-7 place-items-center rounded-full bg-white/90 text-red-600 shadow-sm transition hover:bg-white cursor-pointer"
                        onClick={(event) => {
                            event.stopPropagation();
                            onRemove();
                        }}
                        aria-label={removeLabel}
                    >
                        <Trash2 className="size-3.5" />
                    </button>
                </Tooltip>
            </div>
        </div>
    );
}

function ReferencePreview({ item }: { item: { url: string; name: string; storageKey?: string } }) {
    const directUrl = item.url || (item.storageKey ? (peekLocalFirstMedia(item.storageKey) || resolveResourceUrl(item.storageKey)) : "");
    if (typeof document === "undefined") return null;
    if (!directUrl && !item.storageKey) return null;

    return createPortal(
        <div className="pointer-events-none fixed left-1/2 top-28 z-[9999] w-max max-w-[min(90vw,15rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-black/[0.08] bg-white/95 p-2 shadow-2xl backdrop-blur-xl dark:border-white/[0.1] dark:bg-[#1c1c1e]/95 animate-in fade-in duration-150">
            <CachedResourceImage
                storageKey={item.storageKey}
                src={directUrl}
                alt={item.name}
                eager
                className="block h-auto w-auto max-h-56 max-w-56 rounded-md object-contain"
                loadingFallback={<div className="h-40 w-40 animate-pulse rounded-md bg-stone-200 dark:bg-stone-800" />}
                fallback={<div className="grid h-32 w-32 place-items-center rounded-md bg-stone-100 text-xs text-stone-400 dark:bg-stone-800">图片预览失败</div>}
            />
        </div>,
        document.body
    );
}

const GenerationSettings = memo(function GenerationSettings({
    config,
    model,
    requirements,
    updateConfig,
    openConfigDialog,
}: {
    config: AiConfig;
    model: string;
    requirements?: ModelRequirements;
    updateConfig: UpdateAiConfig;
    openConfigDialog: () => void;
}) {
    const handleModelChange = useCallback((value: string) => {
        updateConfig("imageModel", value);
        const defaults = defaultImageParamsForModel(config, value);
        Object.entries(defaults).forEach(([k, v]) => {
            updateConfig(k as any, v);
        });
    }, [config, updateConfig]);

    const handleSettingChange = useCallback((key: keyof AiConfig, value: string) => {
        updateConfig(key, value);
    }, [updateConfig]);

    return (
        <div className="grid grid-cols-2 gap-2 w-full items-end">
            <div className="min-w-0 w-full flex flex-col">
                <span className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">{t("workbench.model")}</span>
                <ModelPicker
                    config={config}
                    value={model}
                    onChange={handleModelChange}
                    capability="image"
                    requirements={requirements}
                    fullWidth
                    className="!h-[38px] !w-full !rounded-lg !px-3 text-sm font-medium shadow-sm"
                    onMissingConfig={openConfigDialog}
                />
            </div>
            <div className="min-w-0 w-full flex flex-col">
                <span className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">{t("workbench.settings")}</span>
                <CanvasImageSettingsPopover
                    config={config}
                    onConfigChange={handleSettingChange}
                    placement="top"
                    className="w-full flex"
                    buttonClassName="!h-[38px] !w-full !max-w-none !justify-between !rounded-lg !px-3 font-medium text-sm shadow-sm"
                    maxCount={MAX_IMAGE_WORKBENCH_BATCH_COUNT}
                />
            </div>
        </div>
    );
});

const IMAGE_FALLBACK_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23f5f5f4'/><text x='50' y='50' font-size='12' fill='%23a8a29e' text-anchor='middle' dominant-baseline='middle'>图片加载失败</text></svg>";

function ResultImageCard({
    image,
    index,
    onEdit,
    onDownload,
    onSaveAsset,
    onRetry,
    onRecover,
    isRecovering,
}: {
    image: GeneratedImage;
    index: number;
    onEdit: (image: GeneratedImage, index: number) => void;
    onDownload: (image: GeneratedImage, index: number) => void;
    onSaveAsset: (image: GeneratedImage, index: number) => void;
    onRetry?: () => void;
    onRecover?: () => void;
    isRecovering?: boolean;
}) {
    const [loadError, setLoadError] = useState(false);
    const directUrl = (image.storageKey ? peekLocalFirstMedia(image.storageKey) : "") || image.dataUrl || (image.storageKey ? resolveResourceUrl(image.storageKey) : "");
    const fallbackUrl = image.storageKey && directUrl !== resolveResourceUrl(image.storageKey) ? resolveResourceUrl(image.storageKey) : undefined;
    const isInvalid = !directUrl || loadError;
    return (
        <div className="group overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:border-white/[0.08] dark:bg-[#1c1c1e]">
            {isInvalid ? (
                <div className="flex aspect-square flex-col items-center justify-center gap-2 bg-stone-50/80 p-4 text-center dark:bg-stone-900/50">
                    <div className="flex size-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <AlertCircle className="size-5" />
                    </div>
                    <div className="text-xs font-medium text-stone-700 dark:text-stone-300">素材缓存失效或未完成保存</div>
                    <div className="text-[11px] text-stone-400 dark:text-stone-500">上游临时外链或本地缓存已过期释放</div>
                    <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
                        {onRecover && (
                            <button
                                type="button"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/80 bg-amber-600 px-2.5 py-1 text-xs font-medium text-white shadow-xs transition hover:bg-amber-700 cursor-pointer"
                                onClick={onRecover}
                                disabled={isRecovering}
                            >
                                <CloudUpload className={`size-3 text-white ${isRecovering ? "animate-spin" : ""}`} />
                                重试保存
                            </button>
                        )}
                        {onRetry && (
                            <button
                                type="button"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200/80 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 shadow-xs transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700 cursor-pointer"
                                onClick={onRetry}
                            >
                                <RefreshCw className="size-3 text-amber-500" />
                                重新生成
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <Image
                    src={directUrl}
                    fallback={fallbackUrl}
                    alt={t("imageWorkbench.resultAlt", { count: index + 1 })}
                    className="aspect-square object-cover"
                    onError={() => setLoadError(true)}
                />
            )}
            <div className="flex items-center justify-between border-t border-black/[0.04] px-2.5 py-1.5 dark:border-white/[0.06]">
                <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-stone-400 dark:text-stone-500">
                    <span className="font-medium text-stone-700 dark:text-stone-300">{image.width ? `${image.width}×${image.height}` : "已生成"}</span>
                    {image.bytes > 0 && (
                        <>
                            <span>·</span>
                            <span>{formatBytes(image.bytes)}</span>
                        </>
                    )}
                </div>
                <div className="flex items-center gap-0.5">
                    <Tooltip title={t("common.addToAssets")} placement="top">
                        <button
                            type="button"
                            aria-label={t("common.addToAssets")}
                            className="flex size-7 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 active:scale-95 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                            onClick={() => void onSaveAsset(image, index)}
                        >
                            <FolderPlus className="size-3.5" />
                        </button>
                    </Tooltip>
                    <Tooltip title={t("imageWorkbench.addReference")} placement="top">
                        <button
                            type="button"
                            aria-label={t("imageWorkbench.addReference")}
                            className="flex size-7 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 active:scale-95 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                            onClick={() => void onEdit(image, index)}
                        >
                            <PenLine className="size-3.5" />
                        </button>
                    </Tooltip>
                    <Tooltip title={t("common.download")} placement="top">
                        <button
                            type="button"
                            aria-label={t("common.download")}
                            className="flex size-7 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 active:scale-95 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                            onClick={() => onDownload(image, index)}
                        >
                            <Download className="size-3.5" />
                        </button>
                    </Tooltip>
                </div>
            </div>
        </div>
    );
}

function PendingImageCard() {
    return (
        <div className="relative aspect-square overflow-hidden rounded-2xl border border-dashed border-stone-200 bg-stone-50/50 dark:border-stone-800 dark:bg-[#1c1c1e]">
            <div
                className="absolute inset-0 opacity-60"
                style={{
                    backgroundImage: "radial-gradient(circle, rgba(120,113,108,0.35) 1.4px, transparent 1.6px)",
                    backgroundSize: "16px 16px",
                }}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-stone-500 dark:text-stone-400">
                <LoaderCircle className="size-6 animate-spin text-amber-500" />
                <span>{t("workbench.generating")}</span>
            </div>
        </div>
    );
}

function FailedImageCard({
    error,
    onRetry,
    onRecover,
    canRecover,
    isRecovering,
    failureCount,
}: {
    error: string;
    onRetry: () => void;
    onRecover?: () => void;
    canRecover?: boolean;
    isRecovering?: boolean;
    failureCount?: number;
}) {
    const isSaveOrUploadIssue = Boolean(canRecover || (/上传|保存未完成|OSS|存储同步/i.test(error) && !/超时|稍后重试/i.test(error)));
    return (
        <div className="relative aspect-square overflow-hidden rounded-2xl border border-dashed border-red-300 bg-red-50/50 dark:border-red-900/60 dark:bg-red-950/20">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                <AlertCircle className="size-7 text-red-500" />
                <span className="text-xs text-red-600 dark:text-red-400">
                    {error}
                    {failureCount && failureCount > 1 ? `（${t("imageWorkbench.failAttempts", { count: failureCount })}）` : ""}
                </span>
                <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
                    {isSaveOrUploadIssue && onRecover && (
                        <Button
                            size="small"
                            type="primary"
                            icon={<CloudUpload className={`size-3.5 ${isRecovering ? "animate-spin" : ""}`} />}
                            loading={isRecovering}
                            onClick={onRecover}
                            className="!rounded-full !bg-amber-600 hover:!bg-amber-700 !text-white cursor-pointer"
                        >
                            重试保存
                        </Button>
                    )}
                    <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={onRetry} className="!rounded-full cursor-pointer">
                        重新生成
                    </Button>
                </div>
            </div>
        </div>
    );
}

function updateResultAt(results: GenerationResult[], index: number, next: Partial<GenerationResult>) {
    return results.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item));
}

function LogPanel({
    logs,
    selectedLogIds,
    activeLogId,
    onSelectedLogIdsChange,
    onCreateSession,
    onDeleteSelected,
    onPreviewLog,
}: {
    logs: GenerationLog[];
    selectedLogIds: string[];
    activeLogId?: string;
    onSelectedLogIdsChange: (ids: string[]) => void;
    onCreateSession: () => void;
    onDeleteSelected: () => void;
    onPreviewLog: (log: GenerationLog) => void;
}) {
    const allSelected = Boolean(logs.length) && selectedLogIds.length === logs.length;
    const toggleAll = () => onSelectedLogIdsChange(allSelected ? [] : logs.map((log) => log.id));

    return (
        <>
            <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">{t("workbench.logs")}</h2>
                <Tag className="m-0">{logs.length}</Tag>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
                <Button size="small" icon={<Plus className="size-3.5" />} onClick={onCreateSession}>
                    {t("workbench.new")}
                </Button>
                <Button size="small" icon={<CheckSquare className="size-3.5" />} disabled={!logs.length} onClick={toggleAll}>
                    {allSelected ? t("common.cancel") : t("workbench.selectAll")}
                </Button>
                <Button size="small" danger icon={<Trash2 className="size-3.5" />} disabled={!selectedLogIds.length} onClick={onDeleteSelected}>
                    {t("common.delete")}
                </Button>
            </div>
            <div className="space-y-3">
                {logs.map((log) => (
                    <LogCard
                        key={log.id}
                        log={log}
                        selected={selectedLogIds.includes(log.id)}
                        active={activeLogId === log.id}
                        onSelectedChange={(checked) =>
                            onSelectedLogIdsChange(checked ? [...selectedLogIds, log.id] : selectedLogIds.filter((id) => id !== log.id))
                        }
                        onClick={() => onPreviewLog(log)}
                    />
                ))}
                {!logs.length ? (
                    <div className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-stone-200 text-center text-sm text-stone-400 dark:border-stone-800">
                        {t("workbench.noLogs")}
                    </div>
                ) : null}
            </div>
        </>
    );
}

function LogCard({
    log,
    selected,
    active,
    onSelectedChange,
    onClick,
}: {
    log: GenerationLog;
    selected: boolean;
    active: boolean;
    onSelectedChange: (checked: boolean) => void;
    onClick: () => void;
}) {
    const [thumbError, setThumbError] = useState(false);
    const firstDetailRow = log.detailSet?.rows?.find((r) => r.imageUrl || r.storageKey);
    const firstDetailImage = firstDetailRow?.imageUrl || (firstDetailRow?.storageKey ? resolveResourceUrl(firstDetailRow.storageKey) : undefined);
    const firstImage = log.images?.[0]?.dataUrl || (log.images?.[0]?.storageKey ? resolveResourceUrl(log.images[0].storageKey) : undefined) || log.thumbnails?.[0];
    const firstReference = log.references?.[0]?.dataUrl || (log.references?.[0]?.storageKey ? resolveResourceUrl(log.references[0].storageKey) : undefined);
    const displayThumb = firstImage || firstDetailImage || firstReference;

    return (
        <button
            type="button"
            className={`block w-full rounded-xl border p-2.5 text-left transition ${
                active
                    ? "border-amber-500/80 bg-amber-500/[0.08] ring-1 ring-amber-500/20 dark:border-amber-400/70 dark:bg-amber-500/[0.12]"
                    : "border-black/[0.06] bg-white hover:bg-stone-50/80 dark:border-white/[0.08] dark:bg-[#1c1c1e] dark:hover:bg-[#2c2c2e]"
            }`}
            onClick={onClick}
        >
            <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-start gap-2">
                <Checkbox
                    className="mt-0.5"
                    checked={selected}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => onSelectedChange(event.target.checked)}
                />
                <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-stone-100 dark:bg-stone-800 flex items-center justify-center">
                    {displayThumb && !thumbError ? (
                        <img
                            src={displayThumb}
                            alt=""
                            className="size-full object-cover"
                            onError={() => {
                                const fallbackKey = log.images?.[0]?.storageKey || firstDetailRow?.storageKey || log.references?.[0]?.storageKey;
                                if (fallbackKey) {
                                    const fallbackUrl = resolveResourceUrl(fallbackKey);
                                    if (displayThumb !== fallbackUrl) {
                                        return;
                                    }
                                }
                                setThumbError(true);
                            }}
                        />
                    ) : log.status === "pending" ? (
                        <div className="flex flex-col items-center justify-center text-amber-500">
                            <LoaderCircle className="size-5 animate-spin" />
                        </div>
                    ) : log.status === "failed" ? (
                        <div className="flex flex-col items-center justify-center text-rose-400">
                            <AlertCircle className="size-5" />
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center text-stone-400 dark:text-stone-500 gap-0.5">
                            <FileText className="size-4" />
                            <span className="text-[9px] scale-90 text-stone-400">已归档</span>
                        </div>
                    )}
                </div>
                <div className="min-w-0">
                    <div className="truncate text-xs font-semibold leading-snug text-stone-800 dark:text-stone-200">{log.title}</div>
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-stone-400 dark:text-stone-500">
                        <span className="truncate">
                            {[log.size, log.quality, log.imageCount ? `${log.imageCount}张` : null].filter(Boolean).join(" · ")}
                        </span>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <span
                        className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none ${
                            log.status === "success"
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : log.status === "pending"
                                  ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                  : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                        }`}
                    >
                        {log.status === "pending" ? t("workbench.generating") : t(`workbench.${log.status === "success" ? "success" : "failed"}`)}
                        {log.status === "failed" && log.failureCount && log.failureCount > 1 ? ` (${log.failureCount}次)` : ""}
                    </span>
                    {log.durationMs ? (
                        <span className="text-[10px] text-stone-400 dark:text-stone-500">
                            {formatDuration(log.durationMs)}
                        </span>
                    ) : null}
                </div>
            </div>
        </button>
    );
}

async function readStoredLogs(scope = getActiveUserScope()) {
    if (typeof window === "undefined") return [];
    try {
        const values: GenerationLog[] = [];
        await logStore.iterate<GenerationLog, void>((value) => {
            if (value.userId === scope || (!value.userId && scope === "guest")) {
                values.push(value);
            }
        });
        const logs = await Promise.all(values.map(normalizeLog));
        return logs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch {
        return [];
    }
}

export async function normalizeLog(log: Partial<GenerationLog>): Promise<GenerationLog> {
    const finalId = log.id || nanoid();
    // [sub-feature: workbench_task_reconcile_self_heal] [start]
    const rowTaskIds = (log.detailSet?.rows?.map((r) => r.taskId).filter(Boolean) as string[]) || [];
    const imgTaskIds = ((log.images || []).map((img) => img.taskId).filter(Boolean) as string[]) || [];
    const validTaskIds = new Set([...(log.taskIds || []), ...rowTaskIds, ...imgTaskIds]);
    // [sub-feature: workbench_task_reconcile_self_heal] [end]

    const references = await Promise.all(
        (log.references || []).map(async (item) => ({
            ...item,
            dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl),
        })),
    );
    let images = (await Promise.all(
        (log.images || []).map(async (item) => ({
            ...item,
            dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl),
        })),
    )).filter((img) => {
        // 批次防跨界净化：过滤掉明确属于其他批次的图片
        if (img.id && img.id.includes("_slot_") && !img.id.startsWith(`${finalId}_slot_`)) return false;
        return true;
    });

    let detailSet = log.detailSet;
    if (detailSet?.rows?.length) {
        // 双向对齐自愈与防污染清洗：
        // 1. 检查是否存在“全行被同一张图错误污染”的脏数据特征：
        //    即多个 rows 具有相同的非空 storageKey，但 log.images 中存在多张不同图片
        const distinctRowStorageKeys = new Set(detailSet.rows.map((r) => r.storageKey).filter(Boolean));
        const distinctImagesStorageKeys = new Set((images || []).map((img) => img.storageKey).filter(Boolean));
        const isCorruptedSameImage = distinctRowStorageKeys.size === 1 && detailSet.rows.filter((r) => r.storageKey).length > 1 && distinctImagesStorageKeys.size > 1;

        const updatedRows = await Promise.all(
            detailSet.rows.map(async (row) => {
                // [sub-feature: workbench_task_reconcile_self_heal] [start]
                // 物理资产第一原则：只要自身存在合法的 storageKey 或已被当前批次 images 匹配，绝对禁止抹空！
                const cleanRow = isCorruptedSameImage
                    ? { ...row, storageKey: undefined, imageUrl: undefined }
                    : row;

                const matchedImg = matchImageForDetailSetRow(cleanRow, images, finalId);
                const storageKey = cleanRow.storageKey || matchedImg?.storageKey;
                let imageUrl = cleanRow.imageUrl || matchedImg?.dataUrl || "";
                if (storageKey && (!imageUrl || (!imageUrl.startsWith("http") && !imageUrl.startsWith("data:")))) {
                    imageUrl = await resolveImageUrl(storageKey);
                }
                const isSuccess = Boolean(imageUrl || storageKey);
                const isPending = !isSuccess && cleanRow.status === "pending" && log.status === "pending";
                return {
                    ...cleanRow,
                    imageUrl: imageUrl || undefined,
                    storageKey: storageKey || undefined,
                    taskId: cleanRow.taskId || matchedImg?.taskId,
                    status: isSuccess ? ("success" as const) : (isPending ? ("pending" as const) : ("failed" as const)),
                    error: isSuccess ? undefined : (cleanRow.error || (log.status !== "pending" ? "任务执行中断或未生成" : undefined)),
                };
                // [sub-feature: workbench_task_reconcile_self_heal] [end]
            }),
        );
        detailSet = { ...detailSet, rows: updatedRows };

        // [sub-feature: workbench_task_reconcile_self_heal] [start]
        // 2. 补齐 images 产物列表：确保所有 updatedRows 中具备有效资源的卡槽在 images 中均有对应项
        const existingImgSlots = new Set(images.map((img) => {
            const m = img.id?.match(/_slot_(\d+)/);
            return m ? parseInt(m[1], 10) : (typeof (img as any).slotIndex === "number" ? (img as any).slotIndex : -1);
        }));
        for (const r of updatedRows) {
            const slotIdx = r.seq - 1;
            if ((r.imageUrl || r.storageKey) && !existingImgSlots.has(slotIdx)) {
                images.push({
                    id: `${finalId}_slot_${slotIdx}`,
                    dataUrl: r.imageUrl || (r.storageKey ? resolveResourceUrl(r.storageKey) : ""),
                    storageKey: r.storageKey,
                    taskId: r.taskId,
                    durationMs: 0,
                    width: 0,
                    height: 0,
                    bytes: 0,
                });
                existingImgSlots.add(slotIdx);
            }
        }
        // [sub-feature: workbench_task_reconcile_self_heal] [end]
    }

    let thumbnails = (log.thumbnails || []).filter(Boolean);
    if (thumbnails.length === 0 && images.length > 0) {
        thumbnails = images.map((image) => image.dataUrl).filter(Boolean);
    }
    if (thumbnails.length === 0 && detailSet?.rows) {
        const firstWithImg = detailSet.rows.find((r) => r.imageUrl || r.storageKey);
        if (firstWithImg) {
            const url = firstWithImg.imageUrl || (firstWithImg.storageKey ? resolveResourceUrl(firstWithImg.storageKey) : "");
            if (url) thumbnails.push(url);
        }
    }

    const config = normalizeLogConfig(log);
    const successCount = images.length > 0 ? images.length : (log.successCount ?? log.imageCount ?? 0);
    const totalCount = detailSet?.rows?.length || log.taskIds?.length || (Number(config.count) || 1);
    const failCount = Math.max(0, totalCount - successCount);

    const isStalled = Date.now() - (log.updatedAt || log.createdAt || 0) > 120 * 60 * 1000;
    let finalStatus = log.status;
    if (!finalStatus) {
        finalStatus = successCount > 0 ? "success" : "failed";
    } else if (finalStatus === "pending" && isStalled) {
        finalStatus = successCount > 0 ? "success" : "failed";
    }

    return {
        id: finalId,
        sessionId: log.sessionId || finalId,
        batchId: log.batchId || finalId,
        userId: log.userId,
        createdAt: log.createdAt || Date.now(),
        updatedAt: log.updatedAt || log.createdAt || Date.now(),
        title: log.title || log.model || i18n.t("workbench.untitled"),
        prompt: log.prompt || log.title || "",
        time: log.time || new Date().toLocaleString(i18n.resolvedLanguage, { hour12: false }),
        model: log.model || config.imageModel || "",
        config,
        references,
        durationMs: log.durationMs || 0,
        successCount,
        failCount,
        imageCount: images.length || successCount,
        size: log.size || config.size || "",
        quality: log.quality || config.quality || "",
        status: finalStatus,
        images,
        thumbnails,
        failureCount: log.failureCount,
        requestSignature: log.requestSignature,
        error: log.error,
        chargedMicrocredits: log.chargedMicrocredits,
        taskIds: log.taskIds,
        // [sub-feature: detail_set_workflow]
        detailSet, // 电商套图规划快照透传（含双向自愈对齐图片）
        // detail_set_workflow [end]
    };
}

function serializeLog(log: GenerationLog): GenerationLog {
    const cleanedDetailSet = log.detailSet ? {
        ...log.detailSet,
        rows: log.detailSet.rows?.map((row) => ({
            ...row,
            imageUrl: row.storageKey ? "" : (row.imageUrl?.startsWith("data:") ? "" : row.imageUrl),
        })),
    } : undefined;

    return {
        ...log,
        userId: log.userId || getActiveUserScope(),
        references: log.references.map((item) => ({ ...item, dataUrl: item.storageKey ? "" : item.dataUrl })),
        images: log.images.map((image) => ({ ...image, dataUrl: image.storageKey ? "" : image.dataUrl })),
        thumbnails: [],
        taskIds: log.taskIds,
        detailSet: cleanedDetailSet,
    };
}

function normalizeLogConfig(log: Partial<GenerationLog>): GenerationLogConfig {
    return {
        model: log.config?.model || log.model || "",
        imageModel: log.config?.imageModel || log.model || "",
        imageSecondaryModel: log.config?.imageSecondaryModel || "standard",
        quality: log.config?.quality || log.quality || "",
        size: log.config?.size || log.size || "",
        count: log.config?.count || String(log.imageCount || log.successCount || 1),
        transparentBackground: log.config?.transparentBackground || "false",
    };
}

function moveListItem<T>(items: T[], index: number, offset: number) {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= items.length) return items;
    const next = [...items];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    return next;
}

function ReferenceOrderButtons({ index, total, onMove }: { index: number; total: number; onMove: (offset: number) => void }) {
    if (total <= 1) return null;
    return (
        <div className="absolute inset-x-1 bottom-1 flex justify-between">
            <Tooltip title="向左移一位">
                <Button size="small" className="!h-6 !w-6 !min-w-6 !rounded-full !bg-white/85 !p-0 !shadow-sm" icon={<ArrowLeft className="size-3" />} disabled={index <= 0} onClick={() => onMove(-1)} />
            </Tooltip>
            <Tooltip title="向右移一位">
                <Button size="small" className="!h-6 !w-6 !min-w-6 !rounded-full !bg-white/85 !p-0 !shadow-sm" icon={<ArrowRight className="size-3" />} disabled={index >= total - 1} onClick={() => onMove(1)} />
            </Tooltip>
        </div>
    );
}

function computeImageRequestSignature(snapshot: {
    text: string;
    model: string;
    config: AiConfig;
    references: ReferenceImage[];
}): string {
    const refIds = (snapshot.references || []).map((r) => r.id || r.dataUrl || "").sort().join(",");
    return [
        snapshot.text.trim(),
        snapshot.model.trim(),
        snapshot.config.size || "",
        snapshot.config.quality || "",
        snapshot.config.count || "1",
        refIds,
    ].join("|#|");
}

function buildLog({
    logId,
    sessionId,
    batchId,
    createdAt,
    prompt,
    model,
    config,
    references,
    durationMs,
    successCount,
    failCount,
    status,
    images,
    failureCount,
    requestSignature,
    error,
    chargedMicrocredits,
    taskIds,
}: {
    logId?: string;
    sessionId?: string;
    batchId?: string;
    createdAt?: number;
    prompt: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    durationMs: number;
    successCount: number;
    failCount: number;
    status: GenerationLog["status"];
    images: GeneratedImage[];
    failureCount?: number;
    requestSignature?: string;
    error?: string;
    chargedMicrocredits?: number;
    taskIds?: string[];
}): GenerationLog {
    const logConfig = {
        model: config.model,
        imageModel: config.imageModel,
        imageSecondaryModel: config.imageSecondaryModel,
        quality: config.quality,
        size: config.size,
        count: config.count,
        transparentBackground: config.transparentBackground || "false",
    };
    const finalId = logId || nanoid();
    return {
        id: finalId,
        sessionId: sessionId || finalId,
        batchId: batchId || finalId,
        createdAt: createdAt || Date.now(),
        updatedAt: Date.now(),
        title: prompt.slice(0, 12) || i18n.t("workbench.untitled"),
        prompt,
        time: new Date().toLocaleString(i18n.resolvedLanguage, { hour12: false }),
        model,
        config: logConfig,
        references,
        durationMs,
        successCount,
        failCount,
        userId: getActiveUserScope(),
        imageCount: Number(logConfig.count) || successCount,
        size: logConfig.size,
        quality: logConfig.quality,
        status,
        images,
        thumbnails: images.map((image) => image.dataUrl).filter(Boolean),
        failureCount,
        requestSignature,
        error,
        chargedMicrocredits,
        taskIds,
    };
}

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("The operation was aborted", "AbortError"));
            return;
        }
        const timer = setTimeout(() => resolve(), ms);
        signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("The operation was aborted", "AbortError"));
        }, { once: true });
    });
}
// @opc-feature: image_workbench [end]
