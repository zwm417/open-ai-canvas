// @opc-feature: image_workbench [start]
import { AlertCircle, ArrowLeft, ArrowRight, BookOpen, BookmarkPlus, CheckSquare, ClipboardPaste, Download, FileText, FolderPlus, History, ImagePlus, LoaderCircle, PenLine, Plus, RefreshCw, RotateCcw, SlidersHorizontal, Sparkles, Trash2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Checkbox, Drawer, Image, Input, Modal, Tag, Tooltip, Typography } from "antd";
import { EmptyState } from "@/components/ui/product/empty-state";
import localforage from "localforage";
import { saveAs } from "file-saver";
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
import { getActiveUserScope, USER_SCOPE_CHANGED_EVENT } from "@/lib/user-scope";
import { requestEdit, requestGeneration } from "@/services/api/image";
import { deleteStoredImages, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { resolveResourceUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import { submitBackendGenerationTask, parseBackendGenerationResult, type BackendGenerationResult } from "@/services/api/generation-task";
import { waitForGenerationTask, refreshGenerationTaskStatus, type GenerationTask } from "@/services/api/task-center";
import { CachedResourceImage } from "@/components/cached-resource-image";
import { primeResourceBlobCache } from "@/services/resource-blob-cache";
import { useAssetStore } from "@/stores/use-asset-store";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import { batchDeleteGenerationLogsFromRemote, syncGenerationLogToRemote } from "@/services/user-data-sync";
import type { ReferenceImage } from "@/types/image";
import { useImageWorkbenchStore } from "@/stores/use-image-workbench-store";
import {
    SkillHeaderSelector,
    SkillPickerPopover,
    SkillUploadSlots,
    SkillBadgeIcon,
    useActiveWorkbenchSkills,
    useWorkbenchSlotsState,
    assembleWorkbenchPrompt,
    optimizeSkillPrompt,
} from "@/extensions/image-workbench-skills";

type GeneratedImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType?: string;
    taskId?: string;
};

type GenerationResult = {
    id: string;
    batchId?: string;
    slotIndex?: number;
    status: "pending" | "success" | "failed";
    image?: GeneratedImage;
    error?: string;
    failureCount?: number;
    taskId?: string;
};

type GenerationLog = {
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
};

export function deriveGenerationResultsFromLog(log: GenerationLog): GenerationResult[] {
    if (log.status === "pending") {
        const count = log.imageCount || Number(log.config?.count) || 1;
        return Array.from({ length: count }, (_, index) => ({
            id: `${log.id}_slot_${index}`,
            batchId: log.id,
            slotIndex: index,
            status: "pending",
            taskId: log.taskIds?.[index],
        }));
    }
    if (log.status === "success" && log.images?.length) {
        return log.images.map((image, index) => ({
            id: image.id,
            batchId: log.id,
            status: "success",
            taskId: image.taskId || log.taskIds?.[index],
            image: {
                ...image,
                dataUrl: image.dataUrl || (image.storageKey ? resolveResourceUrl(image.storageKey) : ""),
            },
        }));
    }
    return [{
        id: log.id,
        batchId: log.id,
        status: "failed",
        error: log.error || t("workbench.generationFailed"),
        failureCount: log.failureCount,
        taskId: log.taskIds?.[0],
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
const RESULT_ACTION_BUTTON_CLASS = "min-w-0 px-1.5 [&_.ant-btn-icon]:shrink-0 [&>span:last-child]:min-w-0 [&>span:last-child]:truncate";
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
    const [skillPickerOpen, setSkillPickerOpen] = useState(false);
    const {
        slotFiles,
        slotFilesMap,
        slotActiveIdMap,
        setSlotFile,
        addSlotFile,
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
    } = useWorkbenchSlotsState(activeSkill);

    const preferredModel = resolveModelForCapability(effectiveConfig, effectiveConfig.imageModel || effectiveConfig.model, "image");
    const modelRequirements = useMemo<ModelRequirements>(() => {
        const textCount = (prompt.trim() ? 1 : 0) + textReferences.length;
        const activeImageCount = activeSkill ? slotUploadedCount : references.length;
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
    }, [prompt, textReferences.length, activeSkill, slotUploadedCount, references.length, effectiveConfig, preferredModel]);
    const model = resolveCompatibleModel(effectiveConfig, preferredModel, modelRequirements) || preferredModel;
    const imageFeatureCredit = useFeatureCredit("image_workbench", model);
    const imageProfile = mergedImageCapabilityConfig(effectiveConfig, model);
    const effectiveMaxCount = Math.min(15, imageProfile.maxOutputs || 15);
    const isUploading = useMemo(() => references.some((r) => r.uploading), [references]);
    const hasUploadError = useMemo(() => references.some((r) => Boolean(r.error)), [references]);
    const canGenerate = (activeSkill ? isSlotsValid() : Boolean(prompt.trim() || textReferences.length)) && !isUploading && !hasUploadError;
    const generationCount = Math.max(1, Math.min(effectiveMaxCount, Number(config.count) || 1));

    useEffect(() => {
        void refreshSystemChannels().catch((err) => console.warn("Failed to auto-refresh channels in image workbench:", err));
    }, []);

    // 当工作流卡片发生切换时：
    // 1. 清空原输入框内容（prompt 与 textReferences 彻底重置，避免旧卡片文字残留干扰）
    // 2. 完整保留上传的素材文件，双向自适应合并到新卡片槽位
    const previousSkillIdRef = useRef<string | null | undefined>(activeSkillId ? undefined : null);
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
                    // 通用切到技能：若通用模式此前有上传参考图，自动合并转移进新技能槽位
                    if (!hadPrevSkill && references.length > 0) {
                        importExternalReferences(references, activeSkill);
                    }
                } else {
                    // 技能切回通用：将技能各槽位中的全部素材无损还原到通用参考图列表
                    const filesFromSlots = getAllSlotFiles();
                    if (filesFromSlots.length > 0) {
                        setReferences(
                            filesFromSlots.map((f) => ({
                                id: f.id,
                                name: f.name,
                                type: f.mimeType || "image/png",
                                dataUrl: f.previewUrl || f.dataUrl,
                                storageKey: f.storageKey,
                            }))
                        );
                    }
                }
            }

            if (activeSkill) {
                const targetCount = activeSkill.defaultCount || 1;
                const clamped = Math.min(effectiveMaxCount, Math.max(1, targetCount));
                updateConfig("count", String(clamped));
            } else if (previousSkillIdRef.current !== undefined) {
                updateConfig("count", "1");
            }
        }
    }, [activeSkillId, activeSkill, effectiveMaxCount, updateConfig, references, importExternalReferences, getAllSlotFiles]);

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

        if (activeSkill) {
            let index = 0;
            const list: CanvasResourceReference[] = [];
            activeSkill.uploadSlots.forEach((slot) => {
                const files = slotFilesMap[slot.id] || (slotFiles[slot.id] ? [slotFiles[slot.id]!] : []);
                files.forEach((file) => {
                    if (file && (file.dataUrl || file.previewUrl)) {
                        index += 1;
                        list.push({
                            id: file.id || slot.id,
                            nodeId: file.id || slot.id,
                            kind: "image",
                            label: `@${imageReferenceLabel(index - 1)}`,
                            title: `${slot.label || slot.semanticTag} (${file.name || "已上传"})`,
                            previewUrl: file.previewUrl || file.dataUrl,
                            active: true,
                        });
                    }
                });
            });
            return [...list, ...docRefs];
        }
        return [
            ...references.map((item, index) => ({
                id: item.id,
                nodeId: item.id,
                kind: "image" as const,
                label: `@${imageReferenceLabel(index)}`,
                title: item.name,
                previewUrl: item.dataUrl || item.url,
                active: true,
            })),
            ...docRefs,
        ];
    }, [activeSkill, slotFiles, references, textReferences]);

    const currentSessionIdRef = useRef(nanoid());
    const activeBatchIdsRef = useRef<Set<string>>(new Set());
    const generationAbortControllerRef = useRef<AbortController | null>(null);

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
    }, [isOptimizingPrompt, activeSkill, prompt, textReferences, slotFiles, model, effectiveConfig, recordHistory, references, message]);

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
        const checkScope = () => {
            const currentScope = getActiveUserScope();
            if (currentScope !== userScope) {
                setUserScope(currentScope);
                createSession();
                void refreshLogs();
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
        void refreshLogs(true);
    }, []);

    // 状态生命周期守卫：同步生成记录与右侧结果面板（页面加载、刷新、路由切回、后台任务完成均自动保活回填）
    // [workbench-lifecycle-guard] [start]
    useEffect(() => {
        if (submitting) return;
        if (sessionExplicitlyResetRef.current) return;
        if (!hydratedDraft || logs.length === 0) return;

        // 分支 1：当前已存在活跃预览记录 previewLog，响应后台更新（如后台落库/状态变迁）
        if (previewLog) {
            const updatedLog = logs.find((l) => l.id === previewLog.id);
            if (updatedLog && (updatedLog.updatedAt !== previewLog.updatedAt || updatedLog.status !== previewLog.status)) {
                setPreviewLog(updatedLog);
                const derived = deriveGenerationResultsFromLog(updatedLog);
                setResults((prev) => {
                    if (prev.length <= 1) return derived;
                    const targetIds = new Set([
                        updatedLog.id,
                        ...(updatedLog.images?.map((img) => img.id) || []),
                    ]);
                    const remaining = prev.filter((r) => !targetIds.has(r.id) && r.batchId !== updatedLog.id);
                    return [...derived, ...remaining];
                });
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
            setPreviewLog(targetLog);
            const sessionLogs = draft.sessionId ? logs.filter((l) => (l.sessionId && l.sessionId === draft.sessionId) || l.id === draft.sessionId) : [targetLog];
            const allSessionResults = sessionLogs.flatMap(deriveGenerationResultsFromLog);
            setResults(allSessionResults.length ? allSessionResults : deriveGenerationResultsFromLog(targetLog));
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

        const snapshot = buildRequestSnapshot();
        if (!snapshot) {
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.invalidParams") });
            return;
        }

        setSubmitting(true);
        let chargedMicrocredits = 0;
        try {
            const deductRes = await imageFeatureCredit.deduct(model, "生图工作台生成");
            chargedMicrocredits = deductRes.deductedMicrocredits;
        } catch (err) {
            setSubmitting(false);
            const errText = err instanceof Error ? err.message : "积分扣减失败";
            message.error(errText);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: errText });
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
        activeBatchIdsRef.current.add(batchId);

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
            const tasks = newPendingSlots.map((slot) => runGenerationSlot(slot.id, slot.slotIndex || 0, snapshot, batchId));

            const result = await Promise.allSettled(tasks);
            const successImages = result.filter((item): item is PromiseFulfilledResult<GeneratedImage | null> => item.status === "fulfilled" && Boolean(item.value)).map((item) => item.value!);
            const successCount = successImages.length;
            const failCount = generationCount - successCount;
            const failed = result.find((item): item is PromiseRejectedResult => item.status === "rejected");
            const error = failed?.reason instanceof Error ? failed.reason.message : failCount ? t("workbench.generationFailed") : undefined;
            if (agentTaskId) updateAgentTask(agentTaskId, { status: successCount ? "succeeded" : "failed", successCount, failCount, error: successCount ? undefined : error });

            // 资金与积分安全：任何未产出有效图片的情况，必须 100% 自动原路退款
            if (successCount === 0 && chargedMicrocredits > 0) {
                void imageFeatureCredit.refund(chargedMicrocredits, model, "生图全部失败退款");
            }

            try {
                const logImages = await Promise.all(
                    successImages.map(async (image) => {
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
                const batchTaskIds = Array.from(new Set(successImages.map((img) => img.taskId).filter((id): id is string => Boolean(id))));

                if (successCount === 0) {
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
                            taskIds: batchTaskIds.length ? batchTaskIds : undefined,
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
                        // [workbench-cross-session-notify] [start]
                        message.error(`后台生图任务失败：${failed?.reason instanceof Error ? failed.reason.message : t("workbench.generationFailed")}`);
                        // [workbench-cross-session-notify] [end]
                    }
                } else {
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
                            failCount,
                            status: "success",
                            images: logImages,
                            failureCount: 0,
                            requestSignature,
                            chargedMicrocredits: 0,
                            taskIds: batchTaskIds.length ? batchTaskIds : undefined,
                        }),
                    );
                    if (isCurrentSession()) {
                        message.success(t("imageWorkbench.generated"));
                    } else {
                        // [workbench-cross-session-notify] [start]
                        message.success("后台生图任务已生成完成，已同步存入生成记录！");
                        // [workbench-cross-session-notify] [end]
                    }
                }
            } catch (saveErr) {
                console.error("保存生图记录失败:", saveErr);
            } finally {
                activeBatchIdsRef.current.delete(batchId);
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

    const downloadImage = (image: GeneratedImage, index: number) => {
        saveAs(image.dataUrl, `image-${index + 1}.png`);
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
            setReferences((value) => [...value, { id: nanoid(), name: payload.title, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }]);
        } else {
            message.warning(t("imageWorkbench.unsupportedAsset"));
        }
        setAssetPickerOpen(false);
    };

    const createSession = () => {
        // 不要粗暴掐断后台正在执行的任务，保持后台自持执行与结果落库
        sessionExplicitlyResetRef.current = true;
        const newSessionId = nanoid();
        currentSessionIdRef.current = newSessionId;
        updateDraft({
            sessionId: newSessionId,
            prompt: "",
            textReferences: [],
            references: [],
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
    };

    const deleteSelectedLogs = () => {
        const imageKeys = logs.filter((log) => selectedLogIds.includes(log.id)).flatMap((log) => log.images.map((image) => image.storageKey).filter((key): key is string => Boolean(key)));
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

        try {
            const taskResults = await Promise.allSettled(
                log.taskIds.map(async (taskId) => {
                    const completed = await waitForGenerationTask(taskId, { intervalMs: 2500, timeoutMs: 180000 });
                    return parseBackendGenerationResult(completed);
                }),
            );

            const fulfilledResults = taskResults.filter((r): r is PromiseFulfilledResult<BackendGenerationResult> => r.status === "fulfilled").map((r) => r.value);
            const extractedImages: GeneratedImage[] = [];
            for (const res of fulfilledResults) {
                if (res.images && res.images.length > 0) {
                    for (const img of res.images) {
                        let dataUrl = img.dataUrl || "";
                        if (img.storageKey && !dataUrl) {
                            dataUrl = await resolveImageUrl(img.storageKey);
                        }
                        extractedImages.push({
                            id: img.storageKey ? resourceIdFromStorageKey(img.storageKey) || nanoid() : nanoid(),
                            dataUrl,
                            storageKey: img.storageKey,
                            durationMs: Date.now() - log.createdAt,
                            width: img.width || 0,
                            height: img.height || 0,
                            bytes: img.bytes || 0,
                            mimeType: img.mimeType,
                        });
                    }
                }
            }

            if (extractedImages.length === 0) {
                const firstRejected = taskResults.find((r): r is PromiseRejectedResult => r.status === "rejected");
                throw new Error(firstRejected?.reason instanceof Error ? firstRejected.reason.message : t("workbench.generationFailed"));
            }

            const logImages = await Promise.all(
                extractedImages.map(async (img) => {
                    if (img.storageKey) return img;
                    const stored = await uploadImage(img.dataUrl);
                    return { ...img, dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType };
                }),
            );

            const savedSuccessLog: GenerationLog = {
                ...log,
                status: "success",
                durationMs: Date.now() - log.createdAt,
                images: logImages,
                thumbnails: logImages.map((img) => img.dataUrl).filter(Boolean),
                successCount: logImages.length,
                failCount: Math.max(0, log.taskIds.length - logImages.length),
                imageCount: logImages.length,
                failureCount: 0,
                chargedMicrocredits: 0,
                updatedAt: Date.now(),
            };

            await saveLog(savedSuccessLog);

            if (isCurrentSession()) {
                setPreviewLog(savedSuccessLog);
                const successCards: GenerationResult[] = logImages.map((img) => ({
                    id: img.id,
                    batchId: log.id,
                    status: "success",
                    image: img,
                }));
                setResults((prev) => {
                    const remaining = prev.filter((r) => r.batchId !== log.id && !log.taskIds?.includes(r.taskId || ""));
                    return [...successCards, ...remaining];
                });
                message.success(t("imageWorkbench.generated"));
            } else {
                // [workbench-cross-session-notify] [start]
                message.success("后台生图任务已生成完成，已同步存入生成记录！");
                // [workbench-cross-session-notify] [end]
            }
        } catch (err) {
            if (effectiveChargedCredits > 0) {
                void imageFeatureCredit.refund(effectiveChargedCredits, log.model, "后台生图失败退款");
            }
            const errorMessage = err instanceof Error ? err.message : t("workbench.generationFailed");
            const savedFailedLog: GenerationLog = {
                ...log,
                status: "failed",
                durationMs: Date.now() - log.createdAt,
                error: errorMessage,
                successCount: 0,
                failCount: log.taskIds.length,
                failureCount: (log.failureCount || 0) + 1,
                chargedMicrocredits: 0,
                updatedAt: Date.now(),
            };
            await saveLog(savedFailedLog);
            if (isCurrentSession()) {
                setPreviewLog(savedFailedLog);
                setResults((prev) => prev.map((item) => (item.batchId === log.id ? { ...item, status: "failed", error: errorMessage } : item)));
                message.error(errorMessage);
            } else {
                // [workbench-cross-session-notify] [start]
                message.error(`后台生图任务失败：${errorMessage}`);
                // [workbench-cross-session-notify] [end]
            }
        } finally {
            activeBatchIdsRef.current.delete(log.id);
            if (activeBatchIdsRef.current.size === 0) {
                setStartedAt(0);
            }
        }
    };

    const saveLog = (log: GenerationLog) => {
        const userLog = { ...log, userId: getActiveUserScope() };
        const serialized = serializeLog(userLog);
        void logStore.setItem(userLog.id, serialized).then(() => refreshLogs(false));
        void syncGenerationLogToRemote(serialized, "image");
    };

    const refreshLogs = async (resumePending = true) => {
        const scope = getActiveUserScope();
        const nextLogs = await readStoredLogs(scope);
        setLogs(nextLogs);
        if (resumePending) {
            const pendingLogs = nextLogs.filter(
                (log) => log.status === "pending" && !activeBatchIdsRef.current.has(log.id) && (log.userId === scope || (!log.userId && scope === "guest")),
            );
            for (const log of pendingLogs) {
                if (log.taskIds && log.taskIds.length > 0) {
                    void pollPendingImageLog(log);
                }
            }
        }
        return nextLogs;
    };

    const previewGenerationLog = async (log: GenerationLog) => {
        sessionExplicitlyResetRef.current = false;
        currentSessionIdRef.current = log.id;
        setPreviewLog(log);
        setLogsOpen(false);
        // 回到最终提示词输入状态页面，退出当前技能/工作流卡片模式
        selectSkill(null);
        clearAllSlots();
        previousSkillIdRef.current = null;
        setPrompt(log.prompt);
        setTextReferences([]);
        setReferences(log.references || []);
        updateDraft({
            sessionId: log.sessionId || log.id,
            prompt: log.prompt,
            references: log.references || [],
            textReferences: [],
        });
        const targetModel = log.config.imageModel || log.config.model || log.model;
        if (targetModel) updateConfig("imageModel", resolveModelForCapability(effectiveConfig, targetModel, "image"));
        if (log.config.quality) updateConfig("quality", log.config.quality);
        if (log.config.size) updateConfig("size", log.config.size);
        if (log.config.count) updateConfig("count", log.config.count);
        if (log.config.transparentBackground !== undefined) updateConfig("transparentBackground", log.config.transparentBackground);
        const displayResults = deriveGenerationResultsFromLog(log);
        setResults(displayResults);
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
                text: assembled.finalPrompt,
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
        return { text, config: { ...effectiveConfig, model, count: "1" }, references: [...references] };
    };

    const runGenerationSlot = async (
        slotIdentifier: string | number,
        indexOrSnapshot: number | { text: string; config: AiConfig; references: ReferenceImage[] },
        snapshotOrSessionId: { text: string; config: AiConfig; references: ReferenceImage[] } | string,
        sessionIdOrSignal?: string | AbortSignal,
        signal?: AbortSignal,
    ) => {
        const itemStartedAt = performance.now();
        const cardId = typeof slotIdentifier === "string" ? slotIdentifier : undefined;
        const fallbackIndex = typeof slotIdentifier === "number" ? slotIdentifier : (typeof indexOrSnapshot === "number" ? indexOrSnapshot : 0);
        const snapshot = (typeof indexOrSnapshot === "object" ? indexOrSnapshot : (typeof snapshotOrSessionId === "object" ? snapshotOrSessionId : undefined)) as { text: string; config: AiConfig; references: ReferenceImage[] };
        const effectiveSignal = (sessionIdOrSignal instanceof AbortSignal ? sessionIdOrSignal : signal);
        const batchOrSessionId = typeof sessionIdOrSignal === "string" ? sessionIdOrSignal : (typeof snapshotOrSessionId === "string" ? snapshotOrSessionId : undefined);

        let backendTask: GenerationTask | null = null;
        try {
            backendTask = await submitBackendGenerationTask({
                mode: "image",
                prompt: snapshot.text,
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
            if (backendTask?.id) {
                if (batchOrSessionId) {
                    recordLogTaskId(batchOrSessionId, backendTask.id);
                }
                setResults((value) => {
                    if (cardId) {
                        const idx = value.findIndex((r) => r.id === cardId);
                        if (idx >= 0) return updateResultAt(value, idx, { taskId: backendTask!.id });
                    }
                    return value;
                });
            }
        } catch (taskSubmitErr) {
            console.warn("Backend task submission fallback to direct client generation:", taskSubmitErr);
        }

        try {
            if (backendTask?.id) {
                const completed = await waitForGenerationTask(backendTask.id, { signal: effectiveSignal, initialTask: backendTask });
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
                    id: rawImg.storageKey ? resourceIdFromStorageKey(rawImg.storageKey) || nanoid() : nanoid(),
                    dataUrl,
                    storageKey,
                    durationMs,
                    width,
                    height,
                    bytes,
                    mimeType,
                    taskId: backendTask.id,
                };
                setResults((value) => {
                    if (cardId) {
                        const idx = value.findIndex((r) => r.id === cardId);
                        if (idx >= 0) return updateResultAt(value, idx, { status: "success", image: nextImage });
                        return value;
                    }
                    return value;
                });
                return nextImage;
            }

            const result = snapshot.references.length
                ? await requestEdit(snapshot.config, snapshot.text, snapshot.references, undefined, { signal: effectiveSignal })
                : await requestGeneration(snapshot.config, snapshot.text, { signal: effectiveSignal });
            const image = result[0];
            if (!image) throw new Error(t("imageWorkbench.missingResult"));
            const meta = await readImageMeta(image.dataUrl);
            const nextImage: GeneratedImage = { id: image.id, dataUrl: image.dataUrl, durationMs: performance.now() - itemStartedAt, width: meta.width, height: meta.height, bytes: getDataUrlByteSize(image.dataUrl) };
            setResults((value) => {
                if (cardId) {
                    const idx = value.findIndex((r) => r.id === cardId);
                    if (idx >= 0) return updateResultAt(value, idx, { status: "success", image: nextImage });
                    return value;
                }
                return value;
            });
            return nextImage;
        } catch (error) {
            if (effectiveSignal?.aborted) return null;
            const errMsg = error instanceof Error ? error.message : t("workbench.generationFailed");
            setResults((value) => {
                if (cardId) {
                    const idx = value.findIndex((r) => r.id === cardId);
                    if (idx >= 0) return updateResultAt(value, idx, { status: "failed", error: errMsg });
                    return value;
                }
                return value;
            });
            throw error;
        }
    };

    const retryResult = async (index: number) => {
        if (submitting) return;
        const snapshot = buildRequestSnapshot();
        if (!snapshot) return;
        const currentFailedLog = previewLog;
        setPreviewLog(null);
        const targetItem = results[index];
        const targetCardId = targetItem?.id || nanoid();
        setResults((value) => updateResultAt(value, index, { status: "pending", error: undefined, image: undefined }));
        const retryStartedAt = performance.now();
        const sessionId = currentSessionIdRef.current;
        let chargedMicrocredits = 0;
        try {
            const deductRes = await imageFeatureCredit.deduct(model, "生图重试");
            chargedMicrocredits = deductRes.deductedMicrocredits;
        } catch (err) {
            const errText = err instanceof Error ? err.message : "积分扣减失败";
            message.error(errText);
            setResults((value) => updateResultAt(value, index, { status: "failed", error: errText }));
            return;
        }
        try {
            const image = await runGenerationSlot(targetCardId, index, snapshot, sessionId);
            if (!image) return;
            const stored = await uploadImage(image.dataUrl);
            const logImage = { ...image, dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType };
            setResults((value) => {
                const idx = value.findIndex((r) => r.id === targetCardId);
                return updateResultAt(value, idx >= 0 ? idx : index, { image: { ...image, dataUrl: stored.url, storageKey: stored.storageKey } });
            });
            saveLog(
                buildLog({
                    logId: currentFailedLog?.id,
                    prompt: snapshot.text,
                    model,
                    config: { ...snapshot.config, count: "1" },
                    references: snapshot.references,
                    durationMs: performance.now() - retryStartedAt,
                    successCount: 1,
                    failCount: 0,
                    status: "success",
                    images: [logImage],
                }),
            );
            message.success(t("workbench.retrySuccess"));
        } catch (retryErr) {
            if (chargedMicrocredits > 0) {
                void imageFeatureCredit.refund(chargedMicrocredits, model, "生图重试失败退款");
            }
            // runGenerationSlot has already marked the result as failed.
        }
    };

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
            <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[300px_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="thin-scrollbar hidden min-h-0 overflow-y-auto rounded-2xl border border-black/[0.06] bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] dark:border-white/[0.08] dark:bg-[#1c1c1e] lg:block">
                    <LogPanel
                        logs={logs}
                        selectedLogIds={selectedLogIds}
                        activeLogId={previewLog?.id}
                        onSelectedLogIdsChange={setSelectedLogIds}
                        onCreateSession={createSession}
                        onDeleteSelected={() => setDeleteConfirmOpen(true)}
                        onPreviewLog={(log) => void previewGenerationLog(log)}
                    />
                </aside>

                <section className="grid gap-3 lg:min-h-0 lg:overflow-hidden xl:grid-cols-[720px_minmax(0,1fr)] 2xl:grid-cols-[760px_minmax(0,1fr)]">
                    <div className="relative thin-scrollbar flex flex-col rounded-2xl border border-black/[0.06] bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] dark:border-white/[0.08] dark:bg-[#1c1c1e] lg:min-h-0 lg:overflow-y-auto">
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
                            {activeSkill ? (
                                <SkillUploadSlots
                                    skill={activeSkill}
                                    slotFiles={slotFiles}
                                    slotFilesMap={slotFilesMap}
                                    slotActiveIdMap={slotActiveIdMap}
                                    onSetSlotFile={setSlotFile}
                                    onAddSlotFile={addSlotFile}
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
                            ) : (
                                <div className="relative min-w-0 shrink-0">
                                    <div className="mb-2 flex items-center justify-between gap-3">
                                        <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
                                            {references.length} / {imageProfile.references.maxImages || 6}
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                            <Tooltip title="从剪切板粘贴" mouseEnterDelay={0.2}>
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    className="!h-7 !w-7 !p-0 !text-stone-400 hover:!text-stone-700 dark:hover:!text-stone-200"
                                                    icon={<ClipboardPaste className="size-3.5" />}
                                                    onClick={() => void addReferencesFromClipboard()}
                                                />
                                            </Tooltip>
                                            <Tooltip title="提示词模板" mouseEnterDelay={0.2}>
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    className="!h-7 !w-7 !p-0 !text-stone-400 hover:!text-stone-700 dark:hover:!text-stone-200"
                                                    icon={<Sparkles className="size-3.5 text-amber-500" />}
                                                    onClick={() => { setPromptDialogMode("select"); setPromptDialogOpen(true); }}
                                                />
                                            </Tooltip>
                                            <Tooltip title="保存为模板" mouseEnterDelay={0.2}>
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    className="!h-7 !w-7 !p-0 !text-stone-400 hover:!text-stone-700 dark:hover:!text-stone-200"
                                                    icon={<BookmarkPlus className="size-3.5 text-amber-500" />}
                                                    onClick={() => { setPromptDialogMode("save"); setPromptDialogOpen(true); }}
                                                />
                                            </Tooltip>
                                            <Tooltip title="查看我的资产" mouseEnterDelay={0.2}>
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    className="!h-7 !w-7 !p-0 !text-stone-400 hover:!text-stone-700 dark:hover:!text-stone-200"
                                                    icon={<FolderPlus className="size-3.5" />}
                                                    onClick={() => setAssetPickerOpen(true)}
                                                />
                                            </Tooltip>
                                            {references.length > 0 && (
                                                <Tooltip title="清空素材" mouseEnterDelay={0.2}>
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        className="!h-7 !w-7 !p-0 !text-stone-400 hover:!text-red-500 dark:hover:!text-red-400"
                                                        icon={<Trash2 className="size-3.5" />}
                                                        onClick={() => {
                                                            setReferences([]);
                                                            setPreviewReferenceId(null);
                                                        }}
                                                    />
                                                </Tooltip>
                                            )}
                                        </div>
                                    </div>
                                    <div
                                        className={`hover-scrollbar hover-scrollbar-hint min-w-0 overflow-x-auto rounded-xl border border-dashed p-2.5 transition-colors ${
                                            isReferenceDragActive ? "border-amber-500 bg-amber-50/50 dark:border-amber-400 dark:bg-amber-950/20" : "border-stone-200 dark:border-stone-800"
                                        }`}
                                        onDragEnter={(event) => {
                                            event.preventDefault();
                                            dragDepthRef.current += 1;
                                            if (event.dataTransfer.types.includes("Files")) setIsReferenceDragActive(true);
                                        }}
                                        onDragOver={(event) => {
                                            event.preventDefault();
                                            event.dataTransfer.dropEffect = "copy";
                                        }}
                                        onDragLeave={(event) => {
                                            event.preventDefault();
                                            dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
                                            if (!dragDepthRef.current) setIsReferenceDragActive(false);
                                        }}
                                        onDrop={(event) => {
                                            event.preventDefault();
                                            dragDepthRef.current = 0;
                                            setIsReferenceDragActive(false);
                                            replaceTargetRef.current = null;
                                            void addReferences(event.dataTransfer.files);
                                        }}
                                    >
                                        {!references.length ? (
                                            <div className="flex min-w-max items-start gap-2">
                                                <UploadSlot disabled={(imageProfile.references.maxImages ?? 0) <= 0} tooltip={(imageProfile.references.maxImages ?? 0) <= 0 ? "当前模型及同组模型均不支持参考图，请在右上角切换至支持垫图/图生图的模型" : undefined} icon={<ImagePlus className="size-5" />} label="添加商品" onClick={() => { replaceTargetRef.current = null; fileInputRef.current?.click(); }} />
                                                <UploadDivider />
                                                <UploadSlot disabled={(imageProfile.references.maxImages ?? 0) <= 0} tooltip={(imageProfile.references.maxImages ?? 0) <= 0 ? "当前模型及同组模型均不支持参考图，请在右上角切换至支持垫图/图生图的模型" : undefined} icon={<ImagePlus className="size-5" />} label="添加模特" onClick={() => { replaceTargetRef.current = null; fileInputRef.current?.click(); }} />
                                                <UploadDivider />
                                                <UploadSlot disabled={(imageProfile.references.maxImages ?? 0) <= 0} tooltip={(imageProfile.references.maxImages ?? 0) <= 0 ? "当前模型及同组模型均不支持参考图，请在右上角切换至支持垫图/图生图的模型" : undefined} icon={<ImagePlus className="size-5" />} label="添加场景" onClick={() => { replaceTargetRef.current = null; fileInputRef.current?.click(); }} />
                                                <UploadDivider />
                                                <UploadSlot disabled={(imageProfile.references.maxImages ?? 0) <= 0} tooltip={(imageProfile.references.maxImages ?? 0) <= 0 ? "当前模型及同组模型均不支持参考图，请在右上角切换至支持垫图/图生图的模型" : undefined} compact icon={<Plus className="size-5" />} label={t("imageWorkbench.addReference")} onClick={() => { replaceTargetRef.current = null; fileInputRef.current?.click(); }} />
                                            </div>
                                        ) : (
                                            <div className="flex min-w-max items-center gap-2">
                                                {references.map((item, index) => (
                                                    <ReferenceTile
                                                        key={item.id}
                                                        item={{
                                                            id: item.id,
                                                            name: item.name,
                                                            url: item.dataUrl || item.url || (item.storageKey ? resolveResourceUrl(item.storageKey) : ""),
                                                            storageKey: item.storageKey,
                                                            uploading: item.uploading,
                                                            progress: item.progress,
                                                            error: item.error,
                                                        }}
                                                        index={index}
                                                        active={previewReferenceId === item.id}
                                                        onPreview={() => setPreviewReferenceId(item.id)}
                                                        onLeave={() => setPreviewReferenceId(null)}
                                                        onReplace={() => {
                                                            replaceTargetRef.current = item.id;
                                                            fileInputRef.current?.click();
                                                        }}
                                                        onRemove={() => {
                                                            setReferences((value) => value.filter((ref) => ref.id !== item.id));
                                                            setPreviewReferenceId((prev) => (prev === item.id ? null : prev));
                                                        }}
                                                        replaceLabel="替换图片"
                                                        removeLabel={t("imageWorkbench.removeReference")}
                                                    />
                                                ))}
                                                {references.length < (imageProfile.references.maxImages || 6) && (
                                                    <UploadSlot disabled={(imageProfile.references.maxImages ?? 0) <= 0} tooltip={(imageProfile.references.maxImages ?? 0) <= 0 ? "当前模型及同组模型均不支持参考图，请在右上角切换至支持垫图/图生图的模型" : undefined} compact icon={<Plus className="size-5" />} label={t("imageWorkbench.addReference")} onClick={() => { replaceTargetRef.current = null; fileInputRef.current?.click(); }} />
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    {previewReference && <ReferencePreview item={{ name: previewReference.name, url: previewReference.dataUrl || previewReference.url || "" }} />}
                                </div>
                            )}

                            <div className="flex min-h-0 flex-1 flex-col">
                                <div className="mb-2 flex items-center justify-between gap-3 shrink-0">
                                    <span className="text-base font-semibold">{t("workbench.prompt")}</span>
                                    <div className="flex gap-2">
                                        <Button size="small" icon={<Sparkles className="size-3.5 text-amber-500" />} onClick={() => { setPromptDialogMode("select"); setPromptDialogOpen(true); }}>
                                            提示词模板
                                        </Button>
                                        <Button size="small" icon={<BookmarkPlus className="size-3.5 text-amber-500" />} onClick={() => { setPromptDialogMode("save"); setPromptDialogOpen(true); }}>
                                            保存为模板
                                        </Button>
                                        <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => setAssetPickerOpen(true)}>
                                            {t("workbench.viewAssets")}
                                        </Button>
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

                            <div className="flex items-center justify-between rounded-xl border border-black/[0.06] bg-stone-50/70 px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-[#2c2c2e] sm:hidden">
                                <span className="truncate text-stone-500 dark:text-stone-400">
                                    {modelOptionLabel(effectiveConfig, model)} · {effectiveConfig.size} · {effectiveConfig.quality}
                                </span>
                                <Button size="small" type="text" icon={<SlidersHorizontal className="size-4" />} onClick={() => setSettingsOpen(true)}>
                                    {t("workbench.adjust")}
                                </Button>
                            </div>

                            <div className="hidden shrink-0 sm:block w-full">
                                <GenerationSettings config={effectiveConfig} model={model} requirements={modelRequirements} updateConfig={updateConfig} openConfigDialog={openConfigDialog} />
                            </div>
                        </div>

                        <div className="mt-auto pt-6">
                            <div className="flex items-center justify-between mb-2 px-1">
                                <span className="text-xs text-stone-500 dark:text-stone-400">单次预计消耗</span>
                                <FeatureCreditBadge scene="image_workbench" model={model} size="small" />
                            </div>
                            <Button
                                type="primary"
                                size="large"
                                block
                                icon={isUploading ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                                loading={submitting}
                                disabled={!canGenerate || submitting || isUploading || hasUploadError}
                                onClick={() => void generate()}
                                className="!h-11 !rounded-full !border-0 !text-white !font-medium shadow-[0_2px_12px_rgba(245,158,11,0.25)] hover:!opacity-95 active:scale-[0.99] transition-all duration-200 !bg-gradient-to-r !from-amber-500 !to-amber-600 disabled:!opacity-50 disabled:!pointer-events-none disabled:!shadow-none"
                            >
                                {isUploading ? "素材上传中..." : hasUploadError ? "存在上传失败素材" : t("workbench.generate")}
                            </Button>
                        </div>
                    </div>

                    <div className="thin-scrollbar rounded-2xl border border-black/[0.06] bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] dark:border-white/[0.08] dark:bg-[#1c1c1e] lg:min-h-0 lg:overflow-y-auto lg:p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-xl font-semibold">{t("workbench.results")}</h2>
                            </div>
                            {isCurrentSessionPending ? <Tag className="m-0 px-2 py-1">{t("workbench.waiting", { time: formatDuration(elapsedMs) })}</Tag> : null}
                        </div>
                        {results.length ? (
                            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                                {results.map((result, index) =>
                                    result.status === "success" && result.image ? (
                                        <ResultImageCard key={result.id} image={result.image} index={index} onEdit={addResultToReferences} onDownload={downloadImage} onSaveAsset={saveResultToAssets} />
                                    ) : result.status === "failed" ? (
                                        <FailedImageCard key={result.id} error={result.error || t("workbench.generationFailed")} failureCount={result.failureCount || previewLog?.failureCount} onRetry={() => retryResult(index)} />
                                    ) : (
                                        <PendingImageCard key={result.id} />
                                    ),
                                )}
                            </div>
                        ) : (
                            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200 text-center dark:border-stone-800 lg:min-h-[560px]">
                                <EmptyState size="compact" icon={ImagePlus} description={t("imageWorkbench.empty")} />
                            </div>
                        )}
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
                    activeLogId={previewLog?.id}
                    onSelectedLogIdsChange={setSelectedLogIds}
                    onCreateSession={createSession}
                    onDeleteSelected={() => setDeleteConfirmOpen(true)}
                    onPreviewLog={(log) => void previewGenerationLog(log)}
                />
            </Drawer>
            <Drawer title={t("workbench.settings")} placement="bottom" size="large" open={settingsOpen} onClose={() => setSettingsOpen(false)}>
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

            <div className={`absolute inset-0 z-20 hidden items-center justify-center gap-1 rounded-xl bg-black/45 ${item.uploading ? "" : "group-hover:flex group-focus:flex"}`}>
                <Tooltip title={replaceLabel}>
                    <button
                        type="button"
                        className="grid size-7 place-items-center rounded-full bg-white/90 text-stone-800 shadow-sm transition hover:bg-white cursor-pointer"
                        onClick={(event) => {
                            event.stopPropagation();
                            onReplace();
                        }}
                        title={replaceLabel}
                        aria-label={replaceLabel}
                    >
                        <RefreshCw className="size-3.5" />
                    </button>
                </Tooltip>
                <Tooltip title={removeLabel}>
                    <button
                        type="button"
                        className="grid size-7 place-items-center rounded-full bg-white/90 text-red-600 shadow-sm transition hover:bg-white cursor-pointer"
                        onClick={(event) => {
                            event.stopPropagation();
                            onRemove();
                        }}
                        title={removeLabel}
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
    const directUrl = item.url || (item.storageKey ? resolveResourceUrl(item.storageKey) : "");
    return (
        <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-max max-w-[min(90vw,36rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-black/[0.08] bg-white/95 p-2 shadow-2xl backdrop-blur-xl dark:border-white/[0.1] dark:bg-[#1c1c1e]/95">
            <img
                src={directUrl}
                alt={item.name}
                className="block h-auto w-auto max-h-[min(70vh,36rem)] max-w-[min(90vw,36rem)] rounded-md object-contain"
                onError={(e) => {
                    if (item.storageKey) {
                        const fallback = resolveResourceUrl(item.storageKey);
                        if (fallback && e.currentTarget.src !== fallback) {
                            e.currentTarget.src = fallback;
                            return;
                        }
                    }
                    e.currentTarget.style.display = "none";
                }}
            />
        </div>
    );
}

function GenerationSettings({
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
    return (
        <div className="grid grid-cols-2 gap-2 w-full items-end">
            <div className="min-w-0 w-full flex flex-col">
                <span className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">{t("workbench.model")}</span>
                <ModelPicker
                    config={config}
                    value={model}
                    onChange={(value) => {
                        updateConfig("imageModel", value);
                        const defaults = defaultImageParamsForModel(config, value);
                        Object.entries(defaults).forEach(([k, v]) => {
                            updateConfig(k as any, v);
                        });
                    }}
                    capability="image"
                    requirements={requirements}
                    fullWidth
                    className="!h-[38px] !w-full !rounded-lg !px-3 text-sm font-medium shadow-sm"
                    onMissingConfig={() => openConfigDialog()}
                />
            </div>
            <div className="min-w-0 w-full flex flex-col">
                <span className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">{t("workbench.settings")}</span>
                <CanvasImageSettingsPopover
                    config={config}
                    onConfigChange={(key, value) => updateConfig(key, value)}
                    placement="top"
                    className="w-full flex"
                    buttonClassName="!h-[38px] !w-full !max-w-none !justify-between !rounded-lg !px-3 font-medium text-sm shadow-sm"
                />
            </div>
        </div>
    );
}

const IMAGE_FALLBACK_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23f5f5f4'/><text x='50' y='50' font-size='12' fill='%23a8a29e' text-anchor='middle' dominant-baseline='middle'>图片加载失败</text></svg>";

function ResultImageCard({
    image,
    index,
    onEdit,
    onDownload,
    onSaveAsset,
}: {
    image: GeneratedImage;
    index: number;
    onEdit: (image: GeneratedImage, index: number) => void;
    onDownload: (image: GeneratedImage, index: number) => void;
    onSaveAsset: (image: GeneratedImage, index: number) => void;
}) {
    const directUrl = image.dataUrl || (image.storageKey ? resolveResourceUrl(image.storageKey) : "");
    const fallbackUrl = image.storageKey && directUrl !== resolveResourceUrl(image.storageKey) ? resolveResourceUrl(image.storageKey) : IMAGE_FALLBACK_SVG;
    return (
        <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)] dark:border-white/[0.08] dark:bg-[#1c1c1e]">
            <Image src={directUrl} fallback={fallbackUrl} alt={t("imageWorkbench.resultAlt", { count: index + 1 })} className="aspect-square object-cover" />
            <div className="space-y-2 border-t border-stone-200 px-3 py-2.5 dark:border-stone-800">
                <div className="flex min-w-0 gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                    <span>
                        {image.width}x{image.height}
                    </span>
                    <span>{formatBytes(image.bytes)}</span>
                    <span>{formatDuration(image.durationMs)}</span>
                </div>
                <div className="grid min-w-0 grid-cols-3 gap-2">
                    <Tooltip title={t("common.addToAssets")}>
                        <Button className={RESULT_ACTION_BUTTON_CLASS} size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => void onSaveAsset(image, index)}>
                            {t("common.addToAssets")}
                        </Button>
                    </Tooltip>
                    <Tooltip title={t("imageWorkbench.addReference")}>
                        <Button className={RESULT_ACTION_BUTTON_CLASS} size="small" icon={<PenLine className="size-3.5" />} onClick={() => void onEdit(image, index)}>
                            {t("imageWorkbench.addReference")}
                        </Button>
                    </Tooltip>
                    <Tooltip title={t("common.download")}>
                        <Button className={RESULT_ACTION_BUTTON_CLASS} size="small" icon={<Download className="size-3.5" />} onClick={() => onDownload(image, index)}>
                            {t("common.download")}
                        </Button>
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

function FailedImageCard({ error, onRetry, failureCount }: { error: string; onRetry: () => void; failureCount?: number }) {
    return (
        <div className="relative aspect-square overflow-hidden rounded-2xl border border-dashed border-red-300 bg-red-50/50 dark:border-red-900/60 dark:bg-red-950/20">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                <AlertCircle className="size-7 text-red-500" />
                <span className="text-xs text-red-600 dark:text-red-400">
                    {error}
                    {failureCount && failureCount > 1 ? `（${t("imageWorkbench.failAttempts", { count: failureCount })}）` : ""}
                </span>
                <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={onRetry} className="mt-1 !rounded-full">
                    {t("workbench.retry")}
                </Button>
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
    const firstImage = log.images?.[0]?.dataUrl || (log.images?.[0]?.storageKey ? resolveResourceUrl(log.images[0].storageKey) : undefined) || log.thumbnails?.[0];
    const firstReference = log.references?.[0]?.dataUrl || (log.references?.[0]?.storageKey ? resolveResourceUrl(log.references[0].storageKey) : undefined);
    const displayThumb = firstImage || firstReference;

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
                <div className="relative size-14 overflow-hidden rounded-md bg-stone-100 dark:bg-stone-800 flex items-center justify-center">
                    {displayThumb ? (
                        <img
                            src={displayThumb}
                            alt=""
                            className="size-full object-cover"
                            onError={(e) => {
                                const fallbackKey = log.images?.[0]?.storageKey || log.references?.[0]?.storageKey;
                                if (fallbackKey) {
                                    const fallbackUrl = resolveResourceUrl(fallbackKey);
                                    if (e.currentTarget.src !== fallbackUrl) {
                                        e.currentTarget.src = fallbackUrl;
                                        return;
                                    }
                                }
                                e.currentTarget.style.display = "none";
                            }}
                        />
                    ) : (
                        <FileText className="m-4 size-6 text-stone-400" />
                    )}
                </div>
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold leading-5">{log.title}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                        {log.size ? <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.size}</Tag> : null}
                        {log.quality ? <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.quality}</Tag> : null}
                        {log.imageCount ? <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.imageCount} 张</Tag> : null}
                    </div>
                </div>
                <div className="grid justify-items-end gap-2">
                    <Tag
                        className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none"
                        color={log.status === "success" ? "blue" : log.status === "pending" ? "processing" : "red"}
                    >
                        {log.status === "pending" ? t("workbench.generating") : t(`workbench.${log.status === "success" ? "success" : "failed"}`)}
                        {log.status === "failed" && log.failureCount && log.failureCount > 1 ? ` (${log.failureCount}次)` : ""}
                    </Tag>
                    <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color="green">
                        {formatDuration(log.durationMs)}
                    </Tag>
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

async function normalizeLog(log: Partial<GenerationLog>): Promise<GenerationLog> {
    const references = await Promise.all(
        (log.references || []).map(async (item) => ({
            ...item,
            dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl),
        })),
    );
    const images = await Promise.all(
        (log.images || []).map(async (item) => ({
            ...item,
            dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl),
        })),
    );
    const config = normalizeLogConfig(log);
    const finalId = log.id || nanoid();
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
        successCount: log.successCount ?? log.imageCount ?? 0,
        failCount: log.failCount || 0,
        imageCount: log.imageCount || log.successCount || 0,
        size: log.size || config.size || "",
        quality: log.quality || config.quality || "",
        status: log.status || (log.images?.length ? "success" : "failed"),
        images,
        thumbnails: images.map((image) => image.dataUrl).filter(Boolean),
        failureCount: log.failureCount,
        requestSignature: log.requestSignature,
        error: log.error,
        chargedMicrocredits: log.chargedMicrocredits,
        taskIds: log.taskIds,
    };
}

function serializeLog(log: GenerationLog): GenerationLog {
    return {
        ...log,
        userId: log.userId || getActiveUserScope(),
        references: log.references.map((item) => ({ ...item, dataUrl: item.storageKey ? "" : item.dataUrl })),
        images: log.images.map((image) => ({ ...image, dataUrl: image.storageKey ? "" : image.dataUrl })),
        thumbnails: [],
        taskIds: log.taskIds,
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
// @opc-feature: image_workbench [end]
