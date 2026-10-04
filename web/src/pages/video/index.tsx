// @opc-feature: video_workbench [start]
import {
    VideoSkillHeaderSelector,
    VideoSkillPickerPopover,
    DirectorAssistantPanel,
    ReferenceReplicationPanel,
    useActiveVideoSkills,
} from "@/extensions/video-workbench-skills";
import { AlertCircle, BookOpen, BookmarkPlus, Check, CheckSquare, ChevronDown, ClipboardPaste, Download, FileText, Film, FolderPlus, History, ImagePlus, List, LoaderCircle, Music2, Play, Plus, RefreshCw, RotateCcw, Send, SlidersHorizontal, Sparkles, Trash2, Video as VideoIcon, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { App, Button, Checkbox, Drawer, Input, Modal, Tag, Tooltip, Typography } from "antd";
import { EmptyState } from "@/components/ui/product/empty-state";
import localforage from "localforage";
import { nanoid } from "nanoid";
import { saveAs } from "file-saver";
import { useLocation, useNavigate, useSearchParams } from "react-router";

import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { CanvasPromptChipInput } from "@/components/canvas/canvas-prompt-chip-input";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { createKeyedAsyncQueue } from "@/lib/keyed-async-queue";
import { PromptTemplateModal } from "@/components/prompts/prompt-template-modal";
import type { PromptPresetItem } from "@/pages/prompts/prompt-data";
import { CanvasVideoSettingsPopover } from "@/components/canvas/canvas-video-settings-popover";
import { useFeatureCredit } from "@/hooks/use-feature-credit";
import { FeatureCreditBadge } from "@/components/feature-credit-badge";
import { normalizeVideoSizeValue, videoSizeLabel } from "@/components/video-settings-panel";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import { boolConfig, isSeedanceVideoConfig, normalizeSeedanceRatio, seedanceVideoReferenceError, seedanceVideoReferenceHint, SEEDANCE_REFERENCE_LIMITS } from "@/lib/seedance-video";
import { getActiveUserScope, USER_SCOPE_CHANGED_EVENT } from "@/lib/user-scope";
import { collectMediaStorageKeys, deleteStoredMedia, resolveMediaUrl, uploadMediaFile } from "@/services/file-storage";
import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import { resolveResourceUrl } from "@/services/api/resources";
import { CachedResourceImage } from "@/components/cached-resource-image";
import { primeResourceBlobCache } from "@/services/resource-blob-cache";
import { captureVideoPoster } from "@/lib/video-poster";
import { disposeCreationAssistantVideoAnalyses, isReusableCreationAssistantVideoAnalysis, prepareCreationAssistantVideos } from "@/services/creation-assistant-video-analysis";
import { createVideoGenerationTask, pollVideoGenerationTask, storeGeneratedVideo, type VideoGenerationTask } from "@/services/api/video";
import { recoverGenerationTaskMedia, refreshGenerationTaskStatus } from "@/services/api/task-center";
import { getTieredPollingIntervalMs, runVideoSegmentBatch, VIDEO_SEGMENT_HARD_TIMEOUT_MS, VIDEO_SEGMENT_SOFT_TIMEOUT_MS, type VideoSegmentBatchResult, type VideoSegmentRunnerTaskEvent, type VideoSegmentTaskCheckpoint } from "@/services/video-segment-runner";
import { useAssetStore } from "@/stores/use-asset-store";
import { useVideoWorkbenchStore, type VideoTextReference, type VideoWorkbenchDraft } from "@/stores/use-video-workbench-store";
import { defaultCreationAssistantDraft, useCreationAssistantStore } from "@/stores/use-creation-assistant-store";
import type { CreationAssistantDraft } from "@/stores/use-creation-assistant-store";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import { batchDeleteGenerationLogsFromRemote, syncGenerationLogToRemote } from "@/services/user-data-sync";
import { listRemoteGenerationLogs } from "@/services/api/user-data";
import { ModelPicker } from "@/components/model-picker";
import { modelRequestOptions, resolveCompatibleModel, type ModelRequirements } from "@/lib/model-selection";
import { mergeVideos } from "@/lib/canvas/canvas-video-merge";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType } from "@/types/canvas";
import { clampDurationToChannelVideoModel, modelCapabilityConfigFor, resolveChannelVideoModelDurationBounds, resolveChannelVideoModelMaxDuration, videoDurationOptions } from "@/lib/model-capabilities";
import { refreshSystemChannels } from "@/lib/user-session";
import { modelDisplayName, modelOptionLabel, modelOptionName, resolveModelForCapability, selectableModelsByCapability, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import type { CreationOutputRecord, CreationRunRecord } from "@/lib/creation-session";
import { buildVideoCreationPlan, extractScriptShotBlocks, hashCreationScript, type VideoCreationPlan, type VideoSegmentHandoff, type VideoSegmentOutput } from "@/lib/video-segment-contract";

type GeneratedVideo = {
    id: string;
    url: string;
    storageKey: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
    label?: string;
};

type GenerationResult = {
    id: string;
    status: "draft" | "pending" | "success" | "failed";
    video?: GeneratedVideo;
    error?: string;
    task?: VideoGenerationTask;
    failureCount?: number;
};

type SegmentBatchLog = {
    batchId: string;
    status: VideoSegmentBatchResult["status"] | "pending";
    handoff: VideoSegmentHandoff;
    tasks: VideoSegmentTaskCheckpoint[];
    failedSegmentId?: string;
    error?: string;
};

type GenerationLog = {
    id: string;
    userId?: string;
    sessionId?: string;
    createdAt: number;
    updatedAt?: number;
    title: string;
    prompt: string;
    time: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    videoReferences: ReferenceVideo[];
    audioReferences: ReferenceAudio[];
    textReferences?: VideoTextReference[];
    referenceOrder: ReferenceOrderItem[];
    durationMs: number;
    size: string;
    resolution: string;
    seconds: string;
    status: "draft" | "pending" | "success" | "failed";
    task?: VideoGenerationTask;
    video?: GeneratedVideo;
    creationAssistant?: CreationAssistantDraft | null;
    creationPlan?: VideoCreationPlan;
    segmentBatch?: SegmentBatchLog;
    runs: CreationRunRecord[];
    runId?: string;
    error?: string;
    successCount?: number;
    failCount?: number;
    itemCount?: number;
    failureCount?: number;
    requestSignature?: string;
    chargedMicrocredits?: number;
};

type GenerationLogConfig = Pick<AiConfig, "model" | "videoModel" | "size" | "vquality" | "videoSeconds" | "videoGenerateAudio" | "videoWatermark">;

type UploadTarget = "product" | "model" | "scene" | "audio" | "all";
type ReferenceKind = "image" | "video" | "audio";
type ReferenceOrderItem = { id: string; kind: ReferenceKind };
type ReferencePreviewItem = ReferenceOrderItem & {
    name: string;
    type: string;
    url: string;
    dataUrl?: string;
    storageKey?: string;
    posterUrl?: string;
    posterStorageKey?: string;
    bytes?: number;
    width?: number;
    height?: number;
    durationMs?: number;
    uploading?: boolean;
    progress?: number;
    error?: string;
};

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
    "workbench.generate": "开始生成",
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
    "workbench.itemCount": "{{count}} 个",
    "workbench.untitled": "未命名",
    "workbench.configFirst": "请先完成配置",
    "workbench.generationFailed": "生成失败",
    "workbench.retrySuccess": "重试成功",
    "videoWorkbench.title": "生视频工作台",
    "videoWorkbench.aspectRatio": "比例",
    "videoWorkbench.resolution": "分辨率",
    "videoWorkbench.duration": "时长",
    "videoWorkbench.generateNow": "立即生成视频",
    "videoWorkbench.promptPlaceholder": "描述镜头运动、主体动作、场景氛围和画面风格",
    "videoWorkbench.addProduct": "添加商品",
    "videoWorkbench.addModel": "添加模特（可选）",
    "videoWorkbench.addScene": "添加场景（可选）",
    "videoWorkbench.addAudio": "添加声音（可选）",
    "videoWorkbench.addReference": "点击添加",
    "videoWorkbench.writeForMe": "创作助手",
    "videoWorkbench.replaceFile": "替换文件",
    "videoWorkbench.deleteFile": "删除文件",
    "videoWorkbench.replaceTypeMismatch": "替换文件类型或大小不符合要求",
    "videoWorkbench.references": "参考图",
    "videoWorkbench.videoReferences": "参考视频",
    "videoWorkbench.audioReferences": "参考音频",
    "videoWorkbench.removeImage": "移除参考图",
    "videoWorkbench.removeVideo": "移除参考视频",
    "videoWorkbench.removeAudio": "移除参考音频",
    "videoWorkbench.dropReferences": "松开即可上传参考资产",
    "videoWorkbench.noReferences": "暂无参考资产，可拖拽图片、视频或音频到这里",
    "videoWorkbench.empty": "还没有生成视频",
    "videoWorkbench.imageTooLarge": "图片大小不能超过 20MB",
    "videoWorkbench.videoTooLarge": "视频大小不能超过 100MB",
    "videoWorkbench.audioTooLarge": "音频大小不能超过 20MB",
    "videoWorkbench.unsupportedFiles": "存在不支持的文件格式，已自动忽略",
    "videoWorkbench.audioDurationInvalid": "参考音频单个时长需要在 2-15 秒之间，总时长不能超过 15 秒",
    "videoWorkbench.promptRequired": "请输入视频提示词，或连接参考图片/视频/音频",
    "videoWorkbench.configIncomplete": "生视频配置不完整",
    "videoWorkbench.invalidParams": "生视频参数无效",
    "videoWorkbench.busy": "生视频工作台已有任务正在运行",
    "videoWorkbench.generated": "视频已生成",
    "videoWorkbench.source": "生视频工作台",
    "videoWorkbench.unsupportedAsset": "不支持的素材类型",
    "videoWorkbench.timeout": "视频生成耗时较长，后台仍在全力处理中，您可随时点击【重新查询】刷新结果",
    "videoWorkbench.recheck": "重新查询",
    "videoWorkbench.rechecking": "查询中...",
    "videoWorkbench.recheckSuccess": "查询成功，已取回生成的视频！",
    "videoWorkbench.recheckStillPending": "后台仍在全力处理中，请稍后再次刷新查询",
    "videoWorkbench.failAttempts": "已尝试 {{count}} 次",
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

const LOG_STORE_KEY = "infinite-canvas:video_generation_logs";
const logStore = localforage.createInstance({ name: "infinite-canvas", storeName: "video_generation_logs" });
const generationLogWriteQueue = createKeyedAsyncQueue();

export default function VideoPage() {
    const { message, modal } = App.useApp();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragDepthRef = useRef(0);
    const activeLogIdsRef = useRef<Set<string>>(new Set());
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = () => navigate("/settings");
    const addAsset = useAssetStore((state) => state.addAsset);

    const draft = useVideoWorkbenchStore((state) => state.draft);
    const updateDraft = useVideoWorkbenchStore((state) => state.updateDraft);
    const {
        activeSkillId,
        activeSkill,
        isDirectorMode,
        selectSkill,
        enterDirectorMode,
        exitDirectorMode,
    } = useActiveVideoSkills();
    const [videoSkillPickerOpen, setVideoSkillPickerOpen] = useState(false);
    const prevVideoSkillIdRef = useRef<string | null | undefined>(activeSkillId ? undefined : null);
    useEffect(() => {
        if (activeSkillId !== prevVideoSkillIdRef.current) {
            const wasInitial = prevVideoSkillIdRef.current === undefined;
            prevVideoSkillIdRef.current = activeSkillId;
            if (!wasInitial) {
                // 切换视频卡片：清除原输入框文字，保留已上传的素材文件
                updateDraft({ prompt: "", textReferences: [] });
            }
        }
    }, [activeSkillId, updateDraft]);
    const [searchParams, setSearchParams] = useSearchParams();
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
            updateDraft((value) => {
                if (value.textReferences.some((t) => t.id === id || (t.name === title && t.content === effectivePrompt))) {
                    return value;
                }
                return {
                    ...value,
                    textReferences: [{ id, name: title, content: effectivePrompt }],
                    prompt: "", // 保持输入框干净，不注入重复 chip
                };
            });
            if (queryPrompt || queryTitle || queryPromptId) {
                const nextParams = new URLSearchParams(searchParams);
                nextParams.delete("prompt");
                nextParams.delete("title");
                nextParams.delete("promptId");
                setSearchParams(nextParams, { replace: true });
            }
        }
    }, [searchParams, setSearchParams, updateDraft, location.state]);
    const resetDraft = useVideoWorkbenchStore((state) => state.reset);
    const undoDraft = useVideoWorkbenchStore((state) => state.undo);
    const redoDraft = useVideoWorkbenchStore((state) => state.redo);
    const hydratedDraft = useVideoWorkbenchStore((state) => state.hydrated);
    const hasStoredDraft = useVideoWorkbenchStore((state) => state.hasStoredDraft);

    const prompt = draft.prompt;
    const references = draft.references;
    const videoReferences = draft.videoReferences;
    const audioReferences = draft.audioReferences;
    const textReferences = draft.textReferences;
    const referenceOrder = draft.referenceOrder;

    const setPrompt = (value: string) => updateDraft({ prompt: value });
    const handleSelectPromptPreset = (promptText: string, item?: PromptPresetItem) => {
        if (item) {
            const id = item.id || nanoid();
            updateDraft((value) => {
                if (value.textReferences.some((t) => t.id === id || (t.name === item.title && t.content === promptText.trim()))) {
                    return value;
                }
                return {
                    ...value,
                    textReferences: [...value.textReferences, { id, name: item.title, content: promptText.trim() }],
                    // 保持输入框干净，不注入重复 chip
                };
            });
        } else {
            setPrompt(promptText);
        }
    };
    const setReferences = (value: ReferenceImage[] | ((current: ReferenceImage[]) => ReferenceImage[])) => updateDraft((current) => ({ ...current, references: typeof value === "function" ? value(current.references) : value }));
    const setVideoReferences = (value: ReferenceVideo[] | ((current: ReferenceVideo[]) => ReferenceVideo[])) => updateDraft((current) => ({ ...current, videoReferences: typeof value === "function" ? value(current.videoReferences) : value }));
    const setAudioReferences = (value: ReferenceAudio[] | ((current: ReferenceAudio[]) => ReferenceAudio[])) => updateDraft((current) => ({ ...current, audioReferences: typeof value === "function" ? value(current.audioReferences) : value }));
    const [previewReferenceId, setPreviewReferenceId] = useState<string | null>(null);
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
    const [segmentProgress, setSegmentProgress] = useState<{ completedCount: number; totalCount: number; message: string } | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [referenceDragTarget, setReferenceDragTarget] = useState<boolean>(false);
    const [autoRunToken, setAutoRunToken] = useState(0);
    const [recheckingLogId, setRecheckingLogId] = useState<string | null>(null);

    const savedDraftSignatureRef = useRef<string | null>(null);
    const preparationVersionRef = useRef(0);
    const generationAbortControllerRef = useRef<AbortController | null>(null);
    const activeSegmentLogRef = useRef<GenerationLog | null>(null);
    const activeSegmentBatchIdsRef = useRef<Set<string>>(new Set());
    const sessionExplicitlyResetRef = useRef(false);
    const isReconcilingLogsRef = useRef(false);

    // 快捷键支持 (AGENTS.md Section 5.2/5.3 规范)
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
            if (isUndo) undoDraft();
            if (isRedo) redoDraft();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [undoDraft, redoDraft]);

    const videoCommand = useWorkbenchAgentStore((state) => state.videoCommand);
    const clearVideoCommand = useWorkbenchAgentStore((state) => state.clearVideoCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const agentTaskIdRef = useRef<string | undefined>(undefined);
    const uploadTargetRef = useRef<UploadTarget>("all");
    const replaceTargetRef = useRef<ReferenceOrderItem | null>(null);
    const preferredModel = resolveModelForCapability(effectiveConfig, draft.model || effectiveConfig.videoModel || effectiveConfig.model, "video");
    const modelRequirements = useMemo<ModelRequirements>(() => ({
        capability: "video",
        input: {
            textCount: (prompt.trim() ? 1 : 0) + (textReferences?.length || 0),
            imageCount: references.length,
            videoCount: videoReferences.length,
            audioCount: audioReferences.length,
            characterCount: 0,
        },
        videoSeconds: draft.durationSec ? String(draft.durationSec) : effectiveConfig.videoSeconds,
        options: modelRequestOptions({
            ...effectiveConfig,
            model: preferredModel,
            videoModel: preferredModel,
            size: draft.aspectRatio || effectiveConfig.size,
            vquality: draft.resolution || effectiveConfig.vquality,
            videoSeconds: String(draft.durationSec || effectiveConfig.videoSeconds),
        }, "video"),
    }), [prompt, textReferences, references.length, videoReferences.length, audioReferences.length, draft.durationSec, draft.aspectRatio, draft.resolution, effectiveConfig, preferredModel]);
    const model = resolveCompatibleModel(effectiveConfig, preferredModel, modelRequirements) || preferredModel;
    const videoFeatureCredit = useFeatureCredit("video_workbench", model);

    interface VideoChargedCreditRecord {
        runId: string;
        amount: number;
        model: string;
        deductKey: string;
        refundKey: string;
        userScope: string;
    }
    const activeChargedCreditsMapRef = useRef<Map<string, VideoChargedCreditRecord>>(new Map());


    // 用户切换监听与隔离刷新
    const [userScope, setUserScope] = useState(getActiveUserScope());
    useEffect(() => {
        const checkScope = () => {
            const currentScope = getActiveUserScope();
            if (currentScope !== userScope) {
                generationAbortControllerRef.current?.abort();
                for (const [, charged] of activeChargedCreditsMapRef.current.entries()) {
                    if (charged && charged.amount > 0) {
                        void videoFeatureCredit.refund(charged.amount, charged.model, "账号切换自动退款", charged.refundKey, charged.deductKey);
                    }
                }
                activeChargedCreditsMapRef.current.clear();
                setUserScope(currentScope);
                void createSession(false);
                void refreshLogs(true, true);
            }
        };
        window.addEventListener("storage", checkScope);
        window.addEventListener(USER_SCOPE_CHANGED_EVENT, checkScope);
        return () => {
            window.removeEventListener("storage", checkScope);
            window.removeEventListener(USER_SCOPE_CHANGED_EVENT, checkScope);
        };
    }, [userScope, videoFeatureCredit]);
    const isUploading = useMemo(
        () => references.some((r) => r.uploading) || videoReferences.some((v) => v.uploading) || audioReferences.some((a) => a.uploading),
        [references, videoReferences, audioReferences],
    );
    const hasUploadError = useMemo(
        () => references.some((r) => Boolean(r.error)) || videoReferences.some((v) => Boolean(v.error)) || audioReferences.some((a) => Boolean(a.error)),
        [references, videoReferences, audioReferences],
    );
    const canGenerate = (Boolean(prompt.trim()) || Boolean(references.length) || Boolean(videoReferences.length) || Boolean(audioReferences.length) || Boolean(textReferences.length)) && !isUploading && !hasUploadError;

    useEffect(() => {
        void refreshSystemChannels().catch((err) => console.warn("Failed to auto-refresh channels in video workbench:", err));
    }, []);

    // 当系统渠道或智能分流模式切换导致生效模型变化时，自动同步至 draft 并对齐默认参数
    useEffect(() => {
        if (model && model !== draft.model) {
            const profile = modelCapabilityConfigFor(effectiveConfig, model).video;
            updateDraft({
                model,
                aspectRatio: profile?.ratios?.[0] || draft.aspectRatio || "9:16",
                resolution: profile?.resolutions?.[0] || draft.resolution || "720p",
                durationSec: clampDurationToChannelVideoModel(effectiveConfig, model, draft.durationSec),
            });
        }
    }, [model, draft.model, effectiveConfig, updateDraft]);

    const resetCreationAssistantForSources = (nextDraft: VideoWorkbenchDraft) => {
        const assistantState = useCreationAssistantStore.getState();
        const retainedAnalyses = assistantState.draft.videoAnalyses.filter((analysis) => nextDraft.videoReferences.some((video) => isReusableCreationAssistantVideoAnalysis(video, analysis)));
        const staleAnalyses = assistantState.draft.videoAnalyses.filter((analysis) => !retainedAnalyses.includes(analysis));
        preparationVersionRef.current += 1;
        if (staleAnalyses.length) void disposeCreationAssistantVideoAnalyses(staleAnalyses);
        const videoAnalysisStatus = nextDraft.videoReferences.length === 0 ? "ready" : retainedAnalyses.length === nextDraft.videoReferences.length ? "ready" : "idle";
        assistantState.resetForSources(buildSourceFileSignatures(nextDraft), retainedAnalyses, videoAnalysisStatus);
    };

    const openCreationAssistant = async () => {
        const sourceFileIds = buildSourceFileSignatures(draft);
        const assistantState = useCreationAssistantStore.getState();
        const previousSourceIds = assistantState.draft.sourceFileIds || [];
        const sameSourceFiles = previousSourceIds.length === sourceFileIds.length && previousSourceIds.every((id, index) => id === sourceFileIds[index]);
        if (!sameSourceFiles) {
            resetCreationAssistantForSources(draft);
        }
        const videoBatch = [...draft.videoReferences];
        const preparationVersion = ++preparationVersionRef.current;
        useCreationAssistantStore.getState().updateDraft({ videoAnalysisStatus: videoBatch.length ? "preparing" : "ready", videoAnalysisError: "" });
        void prepareCreationAssistantVideos(videoBatch, useCreationAssistantStore.getState().draft.videoAnalyses)
            .then((videoAnalyses) => {
                const sourceStillMatches = sameStringList(sourceFileIds, buildSourceFileSignatures(useVideoWorkbenchStore.getState().draft));
                if (!sourceStillMatches) {
                    const currentVideos = useVideoWorkbenchStore.getState().draft.videoReferences;
                    const staleAnalyses = videoAnalyses.filter((analysis) => !currentVideos.some((video) => isReusableCreationAssistantVideoAnalysis(video, analysis)));
                    if (staleAnalyses.length) void disposeCreationAssistantVideoAnalyses(staleAnalyses);
                    return;
                }
                if (preparationVersion !== preparationVersionRef.current) return;
                useCreationAssistantStore.getState().updateDraft({ videoAnalyses, videoAnalysisStatus: "ready", videoAnalysisError: "" });
            })
            .catch((error) => {
                if (preparationVersion !== preparationVersionRef.current || !sameStringList(sourceFileIds, buildSourceFileSignatures(useVideoWorkbenchStore.getState().draft))) return;
                useCreationAssistantStore.getState().updateDraft({ videoAnalysisStatus: "failed", videoAnalysisError: error instanceof Error ? error.message : "视频抽帧失败" });
            });
        navigate("/creation-assistant");
    };

    const referenceItems = useMemo<ReferencePreviewItem[]>(
        () =>
            referenceOrder.flatMap((entry): ReferencePreviewItem[] => {
                if (entry.kind === "image") {
                    const item = references.find((reference) => reference.id === entry.id);
                    return item ? [{ ...entry, name: item.name, type: item.type, url: item.dataUrl, dataUrl: item.dataUrl, storageKey: item.storageKey, uploading: item.uploading, progress: item.progress, error: item.error }] : [];
                }
                if (entry.kind === "video") {
                    const item = videoReferences.find((reference) => reference.id === entry.id);
                    return item ? [{ ...entry, name: item.name, type: item.type, url: item.url, storageKey: item.storageKey, posterUrl: item.posterUrl, posterStorageKey: item.posterStorageKey, bytes: item.bytes, width: item.width, height: item.height, durationMs: item.durationMs, uploading: item.uploading, progress: item.progress, error: item.error }] : [];
                }
                const item = audioReferences.find((reference) => reference.id === entry.id);
                return item ? [{ ...entry, name: item.name, type: item.type, url: item.url, storageKey: item.storageKey, durationMs: item.durationMs, uploading: item.uploading, progress: item.progress, error: item.error }] : [];
            }),
        [audioReferences, referenceOrder, references, videoReferences],
    );
    const previewReference = referenceItems.find((item) => item.id === previewReferenceId) || null;
    const referenceCount = referenceItems.length;

    const promptMentionReferences = useMemo<CanvasResourceReference[]>(
        () => [
            ...references.map((item, index) => ({ id: item.id, nodeId: item.id, kind: "image" as const, label: `@图片${index + 1}`, title: item.name, previewUrl: item.dataUrl, active: true })),
            ...videoReferences.map((item, index) => ({ id: item.id, nodeId: item.id, kind: "video" as const, label: `@视频${index + 1}`, title: item.name, previewUrl: item.url, active: true })),
            ...audioReferences.map((item, index) => ({ id: item.id, nodeId: item.id, kind: "audio" as const, label: `@音频${index + 1}`, title: item.name, previewUrl: item.url, active: true })),
            ...textReferences.map((item, index) => ({ id: item.id, nodeId: item.id, kind: "text" as const, label: `@文档${index + 1}`, title: item.name, text: item.content, active: true })),
        ],
        [audioReferences, references, textReferences, videoReferences],
    );

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
                if (visibilityDebounceTimer) clearTimeout(visibilityDebounceTimer);
                visibilityDebounceTimer = setTimeout(() => {
                    void refreshLogs(true, true);
                }, 300);
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            if (visibilityDebounceTimer) clearTimeout(visibilityDebounceTimer);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
        // [silent-reconciliation] [end]
    }, []);

    // 状态生命周期守卫：同步生成记录与右侧结果面板（页面加载、刷新、路由切回、后台轮询完成均自动保活）
    // [workbench-lifecycle-guard] [start]
    useEffect(() => {
        if (submitting) return;
        if (sessionExplicitlyResetRef.current) return;
        if (!hydratedDraft || logs.length === 0) return;

        // 分支 1：当前已存在活跃预览记录 previewLog，响应后台更新（如轮询/远程同步）
        if (previewLog) {
            const updatedLog = logs.find((l) => l.id === previewLog.id);
            if (updatedLog && (updatedLog.updatedAt !== previewLog.updatedAt || updatedLog.status !== previewLog.status)) {
                setPreviewLog(updatedLog);
                const derived = deriveGenerationResultsFromLog(updatedLog);
                setResults((prev) => {
                    if (prev.length <= 1) return derived;
                    const targetIds = new Set([
                        updatedLog.id,
                        updatedLog.video?.id,
                        ...(updatedLog.runs?.flatMap((r) => r.outputs?.map((o) => o.outputId)) || []),
                    ].filter(Boolean));
                    const remaining = prev.filter((r) => !targetIds.has(r.id) && (!r.task?.id || r.task.id !== updatedLog.task?.id));
                    return [...derived, ...remaining];
                });
            }
            return;
        }

        // 分支 2：初始化挂载/刷新页面时 previewLog 为空，正向寻址恢复会话结果（若当前正在等待生成则不覆盖）
        if (isCurrentSessionPending) return;
        let targetLog: GenerationLog | undefined;
        if (draft.sessionId) {
            targetLog = logs.find((l) => (l.sessionId && l.sessionId === draft.sessionId) || l.id === draft.sessionId);
        }
        if (!targetLog) {
            // 回退定位最近一条包含有效视频或执行结果的记录
            targetLog = logs.find((l) => l.status === "success" || l.status === "pending" || Boolean(l.video) || (l.runs && l.runs.length > 0)) || logs[0];
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

    const addReferences = async (files?: FileList | null, target: UploadTarget = "all") => {
        const selectedFiles = Array.from(files || []);
        let remainingImages = SEEDANCE_REFERENCE_LIMITS.images - references.length;
        let remainingVideos = SEEDANCE_REFERENCE_LIMITS.videos - videoReferences.length;
        let remainingAudios = SEEDANCE_REFERENCE_LIMITS.audios - audioReferences.length;
        let skippedUnsupported = false;
        let skippedImageSize = false;
        let skippedVideoSize = false;
        let skippedAudioSize = false;
        const candidates: Array<{ file: File; kind: ReferenceKind; id: string; previewUrl: string }> = [];

        for (const file of selectedFiles) {
            const isImage = isImageFile(file);
            const isVideo = isVideoFile(file);
            const isAudio = isSupportedAudioFile(file);
            if (!isImage && !isVideo && !isAudio) {
                skippedUnsupported = true;
                continue;
            }
            if (isImage) {
                if (file.size > SEEDANCE_REFERENCE_LIMITS.imageMaxBytes) {
                    skippedImageSize = true;
                    continue;
                }
                if (remainingImages <= 0) continue;
                remainingImages -= 1;
                candidates.push({ file, kind: "image", id: nanoid(), previewUrl: URL.createObjectURL(file) });
            } else if (isVideo) {
                if (file.size > SEEDANCE_REFERENCE_LIMITS.videoMaxBytes) {
                    skippedVideoSize = true;
                    continue;
                }
                if (remainingVideos <= 0) continue;
                remainingVideos -= 1;
                candidates.push({ file, kind: "video", id: nanoid(), previewUrl: URL.createObjectURL(file) });
            } else {
                if (file.size > SEEDANCE_REFERENCE_LIMITS.audioMaxBytes) {
                    skippedAudioSize = true;
                    continue;
                }
                if (remainingAudios <= 0) continue;
                remainingAudios -= 1;
                candidates.push({ file, kind: "audio", id: nanoid(), previewUrl: URL.createObjectURL(file) });
            }
        }
        if (skippedUnsupported) message.warning(t("videoWorkbench.unsupportedFiles"));
        if (skippedImageSize) message.warning(t("videoWorkbench.imageTooLarge"));
        if (skippedVideoSize) message.warning(t("videoWorkbench.videoTooLarge"));
        if (skippedAudioSize) message.warning(t("videoWorkbench.audioTooLarge"));

        if (!candidates.length) return;

        // 1. 0ms 乐观添加占位卡片
        const optimisticImages: ReferenceImage[] = [];
        const optimisticVideos: ReferenceVideo[] = [];
        const optimisticAudios: ReferenceAudio[] = [];
        const optimisticOrders: ReferenceOrderItem[] = [];

        for (const c of candidates) {
            optimisticOrders.push({ id: c.id, kind: c.kind });
            if (c.kind === "image") {
                optimisticImages.push({
                    id: c.id,
                    name: c.file.name,
                    type: c.file.type || "image/png",
                    dataUrl: c.previewUrl,
                    uploading: true,
                    progress: 0,
                });
            } else if (c.kind === "video") {
                optimisticVideos.push({
                    id: c.id,
                    name: c.file.name,
                    type: c.file.type || "video/mp4",
                    url: c.previewUrl,
                    uploading: true,
                    progress: 0,
                });
            } else {
                optimisticAudios.push({
                    id: c.id,
                    name: c.file.name,
                    type: c.file.type || "audio/mp3",
                    url: c.previewUrl,
                    uploading: true,
                    progress: 0,
                });
            }
        }

        updateDraft((value) => ({
            ...value,
            references: [...value.references, ...optimisticImages].slice(0, SEEDANCE_REFERENCE_LIMITS.images),
            videoReferences: [...value.videoReferences, ...optimisticVideos].slice(0, SEEDANCE_REFERENCE_LIMITS.videos),
            audioReferences: [...value.audioReferences, ...optimisticAudios].slice(0, SEEDANCE_REFERENCE_LIMITS.audios),
            referenceOrder: [...value.referenceOrder, ...optimisticOrders],
        }));

        // 2. 异步上传与海报提取，并在就绪时预热本地缓存
        let completedCount = 0;
        let failedCount = 0;

        await Promise.all(
            candidates.map(async ({ file, kind, id, previewUrl }) => {
                try {
                    if (kind === "image") {
                        const uploaded = await uploadImage(file, (uploadedBytes, totalBytes) => {
                            const pct = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;
                            setReferences((prev) => prev.map((r) => (r.id === id ? { ...r, progress: pct } : r)));
                        });
                        if (uploaded.storageKey) {
                            try {
                                await primeResourceBlobCache(uploaded.storageKey, file);
                            } catch {}
                        }
                        setReferences((prev) =>
                            prev.map((r) =>
                                r.id === id
                                    ? {
                                          ...r,
                                          dataUrl: uploaded.url,
                                          storageKey: uploaded.storageKey,
                                          bytes: uploaded.bytes || file.size,
                                          width: uploaded.width,
                                          height: uploaded.height,
                                          uploading: false,
                                          progress: 100,
                                          error: undefined,
                                      }
                                    : r,
                            ),
                        );
                        completedCount += 1;
                    } else if (kind === "video") {
                        // 异步静默提取视频海报，先更新前端预览
                        let localPosterUrl: string | undefined;
                        try {
                            const captured = await captureVideoPoster(previewUrl);
                            if (captured?.poster) {
                                const posterBlobUrl = URL.createObjectURL(captured.poster);
                                localPosterUrl = posterBlobUrl;
                                setVideoReferences((prev) =>
                                    prev.map((v) =>
                                        v.id === id
                                            ? {
                                                  ...v,
                                                  posterUrl: posterBlobUrl,
                                                  width: captured.width,
                                                  height: captured.height,
                                                  durationMs: captured.durationMs,
                                              }
                                            : v,
                                    ),
                                );
                            }
                        } catch (err) {
                            console.warn("读取本地视频海报失败", err);
                        }

                        const uploaded = await uploadMediaFile(file, "video-reference", (uploadedBytes, totalBytes) => {
                            const pct = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;
                            setVideoReferences((prev) => prev.map((v) => (v.id === id ? { ...v, progress: pct } : v)));
                        });
                        if (uploaded.storageKey) {
                            try {
                                await primeResourceBlobCache(uploaded.storageKey, file);
                            } catch {}
                        }
                        setVideoReferences((prev) =>
                            prev.map((v) =>
                                v.id === id
                                    ? {
                                          ...v,
                                          url: uploaded.url,
                                          storageKey: uploaded.storageKey,
                                          posterUrl: uploaded.preview?.url || v.posterUrl || localPosterUrl,
                                          posterStorageKey: uploaded.preview?.storageKey || v.posterStorageKey,
                                          bytes: uploaded.bytes || file.size,
                                          width: uploaded.width || v.width,
                                          height: uploaded.height || v.height,
                                          durationMs: uploaded.durationMs || v.durationMs,
                                          uploading: false,
                                          progress: 100,
                                          error: undefined,
                                      }
                                    : v,
                            ),
                        );
                        completedCount += 1;
                    } else {
                        const uploaded = await uploadMediaFile(file, "audio-reference", (uploadedBytes, totalBytes) => {
                            const pct = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;
                            setAudioReferences((prev) => prev.map((a) => (a.id === id ? { ...a, progress: pct } : a)));
                        });
                        if (uploaded.storageKey) {
                            try {
                                await primeResourceBlobCache(uploaded.storageKey, file);
                            } catch {}
                        }
                        setAudioReferences((prev) =>
                            prev.map((a) =>
                                a.id === id
                                    ? {
                                          ...a,
                                          url: uploaded.url,
                                          storageKey: uploaded.storageKey,
                                          bytes: uploaded.bytes || file.size,
                                          durationMs: uploaded.durationMs || a.durationMs,
                                          uploading: false,
                                          progress: 100,
                                          error: undefined,
                                      }
                                    : a,
                            ),
                        );
                        completedCount += 1;
                    }
                } catch (err) {
                    failedCount += 1;
                    const errorMsg = err instanceof Error ? err.message : "上传失败";
                    if (kind === "image") {
                        setReferences((prev) => prev.map((r) => (r.id === id ? { ...r, uploading: false, error: errorMsg } : r)));
                    } else if (kind === "video") {
                        setVideoReferences((prev) => prev.map((v) => (v.id === id ? { ...v, uploading: false, error: errorMsg } : v)));
                    } else {
                        setAudioReferences((prev) => prev.map((a) => (a.id === id ? { ...a, uploading: false, error: errorMsg } : a)));
                    }
                }
            }),
        );

        // 音频时长再次校验过滤
        const currentAudioRefs = useVideoWorkbenchStore.getState().draft.audioReferences;
        const validAudios = filterAudioReferencesByDuration([], currentAudioRefs, message.warning);
        if (validAudios.length !== currentAudioRefs.length) {
            setAudioReferences(validAudios);
        }

        if (failedCount > 0) {
            message.warning(`${failedCount} 个素材上传未完成，请点击卡片重试或删除`);
        } else if (completedCount > 0) {
            message.success(`已添加 ${completedCount} 个素材并完成同步`);
        }
        resetCreationAssistantForSources(useVideoWorkbenchStore.getState().draft);
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
            await addReferences(dataTransfer.files, "all");
        } catch {
            message.error(t("imageWorkbench.clipboardEmpty"));
        }
    };

    const openFilePicker = (target: UploadTarget, replaceTarget?: ReferenceOrderItem) => {
        uploadTargetRef.current = target;
        replaceTargetRef.current = replaceTarget || null;
        fileInputRef.current?.click();
    };

    const replaceReference = async (target: ReferenceOrderItem, file?: File) => {
        if (!file) return;
        if (target.kind === "image") {
            if (!file.type.startsWith("image/")) {
                message.warning(t("videoWorkbench.replaceTypeMismatch"));
                return;
            }
            if (file.size > SEEDANCE_REFERENCE_LIMITS.imageMaxBytes) {
                message.warning(t("videoWorkbench.imageTooLarge"));
                return;
            }
            const previewUrl = URL.createObjectURL(file);
            setReferences((value) => value.map((item) => (item.id === target.id ? { ...item, name: file.name, type: file.type, dataUrl: previewUrl, uploading: true, progress: 0, error: undefined } : item)));
            try {
                const image = await uploadImage(file, (uploadedBytes, totalBytes) => {
                    const pct = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;
                    setReferences((value) => value.map((item) => (item.id === target.id ? { ...item, progress: pct } : item)));
                });
                if (image.storageKey) {
                    try {
                        await primeResourceBlobCache(image.storageKey, file);
                    } catch {}
                }
                setReferences((value) => value.map((item) => (item.id === target.id ? { ...item, name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey, uploading: false, progress: 100, error: undefined } : item)));
                message.success("参考图已替换就绪");
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : "替换失败";
                setReferences((value) => value.map((item) => (item.id === target.id ? { ...item, uploading: false, error: errMsg } : item)));
                message.error(`替换参考图失败: ${errMsg}`);
            }
            resetCreationAssistantForSources(useVideoWorkbenchStore.getState().draft);
            return;
        }
        if (target.kind === "video") {
            if (!isVideoFile(file) || file.size > SEEDANCE_REFERENCE_LIMITS.videoMaxBytes) {
                message.warning(t("videoWorkbench.replaceTypeMismatch"));
                return;
            }
            const previewUrl = URL.createObjectURL(file);
            let localPosterUrl: string | undefined;
            setVideoReferences((value) => value.map((item) => (item.id === target.id ? { ...item, name: file.name, type: file.type, url: previewUrl, uploading: true, progress: 0, error: undefined } : item)));
            try {
                try {
                    const captured = await captureVideoPoster(previewUrl);
                    if (captured?.poster) {
                        const posterBlobUrl = URL.createObjectURL(captured.poster);
                        localPosterUrl = posterBlobUrl;
                        setVideoReferences((value) => value.map((item) => (item.id === target.id ? { ...item, posterUrl: posterBlobUrl, width: captured.width, height: captured.height, durationMs: captured.durationMs } : item)));
                    }
                } catch (e) {
                    console.warn("读取本地视频海报失败", e);
                }

                const video = await uploadMediaFile(file, "video-reference", (uploadedBytes, totalBytes) => {
                    const pct = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;
                    setVideoReferences((value) => value.map((item) => (item.id === target.id ? { ...item, progress: pct } : item)));
                });
                if (video.storageKey) {
                    try {
                        await primeResourceBlobCache(video.storageKey, file);
                    } catch {}
                }
                setVideoReferences((value) =>
                    value.map((item) =>
                        item.id === target.id
                            ? {
                                  ...item,
                                  name: file.name,
                                  type: video.mimeType,
                                  url: video.url,
                                  storageKey: video.storageKey,
                                  posterUrl: video.preview?.url || item.posterUrl || localPosterUrl,
                                  posterStorageKey: video.preview?.storageKey || item.posterStorageKey,
                                  bytes: video.bytes,
                                  width: video.width || item.width,
                                  height: video.height || item.height,
                                  durationMs: video.durationMs || item.durationMs,
                                  uploading: false,
                                  progress: 100,
                                  error: undefined,
                              }
                            : item,
                    ),
                );
                message.success("视频素材已替换就绪");
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : "替换失败";
                setVideoReferences((value) => value.map((item) => (item.id === target.id ? { ...item, uploading: false, error: errMsg } : item)));
                message.error(`替换视频失败: ${errMsg}`);
            }
            resetCreationAssistantForSources(useVideoWorkbenchStore.getState().draft);
            return;
        }
        if (!isSupportedAudioFile(file) || file.size > SEEDANCE_REFERENCE_LIMITS.audioMaxBytes) {
            message.warning(t("videoWorkbench.replaceTypeMismatch"));
            return;
        }
        const previewUrl = URL.createObjectURL(file);
        setAudioReferences((value) => value.map((item) => (item.id === target.id ? { ...item, name: file.name, type: file.type, url: previewUrl, uploading: true, progress: 0, error: undefined } : item)));
        try {
            const audio = await uploadMediaFile(file, "audio-reference", (uploadedBytes, totalBytes) => {
                const pct = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;
                setAudioReferences((value) => value.map((item) => (item.id === target.id ? { ...item, progress: pct } : item)));
            });
            if (audio.storageKey) {
                try {
                    await primeResourceBlobCache(audio.storageKey, file);
                } catch {}
            }
            const updatedItem: ReferenceAudio = {
                id: target.id,
                name: file.name,
                type: audio.mimeType,
                url: audio.url,
                storageKey: audio.storageKey,
                durationMs: audio.durationMs,
                uploading: false,
                progress: 100,
                error: undefined,
            };
            const accepted = filterAudioReferencesByDuration(
                audioReferences.filter((item) => item.id !== target.id),
                [updatedItem],
                message.warning,
            );
            if (accepted.length) {
                setAudioReferences((value) => value.map((item) => (item.id === target.id ? accepted[0] : item)));
                message.success("音频素材已替换就绪");
            }
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : "替换失败";
            setAudioReferences((value) => value.map((item) => (item.id === target.id ? { ...item, uploading: false, error: errMsg } : item)));
            message.error(`替换音频失败: ${errMsg}`);
        }
        resetCreationAssistantForSources(useVideoWorkbenchStore.getState().draft);
    };

    const removeReference = async (target: ReferenceOrderItem) => {
        updateDraft((value) => ({
            ...value,
            references: target.kind === "image" ? value.references.filter((item) => item.id !== target.id) : value.references,
            videoReferences: target.kind === "video" ? value.videoReferences.filter((item) => item.id !== target.id) : value.videoReferences,
            audioReferences: target.kind === "audio" ? value.audioReferences.filter((item) => item.id !== target.id) : value.audioReferences,
            referenceOrder: value.referenceOrder.filter((item) => item.id !== target.id),
        }));
        resetCreationAssistantForSources(useVideoWorkbenchStore.getState().draft);
        setPreviewReferenceId((value) => (value === target.id ? null : value));
    };

    const handleReferenceDragEnter = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current += 1;
        if (event.dataTransfer.types.includes("Files")) setReferenceDragTarget(true);
    };

    const handleReferenceDragLeave = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (!dragDepthRef.current) setReferenceDragTarget(false);
    };

    const handleReferenceDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setReferenceDragTarget(false);
        void addReferences(event.dataTransfer.files, "all");
    };

    const generate = async (resumeLog?: GenerationLog) => {
        if (submitting) return;
        const agentTaskId = agentTaskIdRef.current;
        agentTaskIdRef.current = undefined;
        if (isUploading) {
            message.warning("素材正在上传同步中，请稍候...");
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: "素材正在上传同步中" });
            return;
        }
        if (hasUploadError) {
            message.warning("存在上传失败或未就绪的素材，请重新上传或移除后再生成");
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: "存在未就绪素材" });
            return;
        }
        const snapshot = buildRequestSnapshot();
        if (!snapshot) {
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("videoWorkbench.invalidParams") });
            return;
        }

        let creationPlan = snapshot.creationPlan && isCurrentVideoCreationPlan(snapshot.creationPlan, snapshot.text, snapshot.model, snapshot.durationSec, snapshot.aspectRatio, snapshot.resolution) ? snapshot.creationPlan : undefined;
        if (!creationPlan && snapshot.text) {
            const bounds = resolveChannelVideoModelDurationBounds(effectiveConfig, snapshot.model);
            const channelMaxDuration = bounds.max;
            const fixedSegmentDurationSec = bounds.min === bounds.max ? bounds.max : undefined;
            const extracted = extractScriptShotBlocks(snapshot.text);
            const scriptDuration = extracted.blocks.reduce((max, b) => Math.max(max, b.endSec), 0);
            const effectiveDurationSec = Math.max(snapshot.durationSec, scriptDuration);
            // 物理视频分段严格以模型单段上限（channelMaxDuration）为基准划分，只有总时长超过上限时才进行多视频段生成
            if (effectiveDurationSec > channelMaxDuration) {
                creationPlan = buildVideoCreationPlan({
                    source: "config",
                    script: snapshot.text,
                    targetDurationSec: effectiveDurationSec,
                    model: snapshot.model,
                    aspectRatio: snapshot.aspectRatio,
                    resolution: snapshot.resolution,
                    maxSegmentDurationSec: channelMaxDuration,
                    minSegmentDurationSec: bounds.min,
                    fixedSegmentDurationSec,
                });
            }
        }
        const isMultiSegment = Boolean(creationPlan && creationPlan.segments.length > 1);
        const requestedBatchId = resumeLog?.segmentBatch?.batchId;
        if (isMultiSegment && requestedBatchId && activeSegmentBatchIdsRef.current.has(requestedBatchId)) return;

        sessionExplicitlyResetRef.current = false;
        const batchStartedAt = performance.now();
        const runId = resumeLog?.runId || nanoid();
        const activeSessionId = snapshot.sessionId || nanoid();
        if (!snapshot.sessionId) {
            updateDraft({ sessionId: activeSessionId });
        }
        const isCurrentSession = () => !activeSessionId || !useVideoWorkbenchStore.getState().draft.sessionId || activeSessionId === useVideoWorkbenchStore.getState().draft.sessionId;

        const initialUserScope = getActiveUserScope();
        const controller = new AbortController();
        generationAbortControllerRef.current = controller;

        const deductKey = `deduct:video_workbench:${runId}`;
        const refundKey = `refund:video_workbench:${runId}`;

        setSubmitting(true);
        let chargedMicrocredits = 0;
        try {
            const deductRes = await videoFeatureCredit.deduct(snapshot.model, "生视频工作台生成", deductKey);
            chargedMicrocredits = deductRes.deductedMicrocredits;
            activeChargedCreditsMapRef.current.set(runId, {
                runId,
                amount: chargedMicrocredits,
                model: snapshot.model,
                deductKey,
                refundKey,
                userScope: initialUserScope,
            });
        } catch (err) {
            setSubmitting(false);
            activeChargedCreditsMapRef.current.delete(runId);
            const errText = err instanceof Error ? err.message : "积分扣减失败";
            message.error(errText);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: errText });
            return;
        }

        if (isMultiSegment && creationPlan) {
            const batchId = resumeLog?.segmentBatch?.batchId || runId;
            activeSegmentBatchIdsRef.current.add(batchId);
            const initialRun = createRunRecord({ runId, prompt: snapshot.requestText, model: snapshot.model, config: snapshot.config, status: "pending" });
            const resumeTasks = resumeLog?.segmentBatch?.tasks || [];
            const resumeOutputs = resumeLog?.segmentBatch?.handoff.segments || [];
            let batchLog = buildLog({
                sessionId: activeSessionId,
                creationAssistant: snapshot.creationAssistant,
                creationPlan,
                segmentBatch: { batchId, status: "pending", handoff: { ...(resumeLog?.segmentBatch?.handoff || emptySegmentHandoff(creationPlan, batchId)), batchId }, tasks: resumeTasks },
                prompt: snapshot.text,
                model: snapshot.model,
                config: snapshot.config,
                references: snapshot.references,
                videoReferences: snapshot.videoReferences,
                audioReferences: snapshot.audioReferences,
                textReferences: snapshot.textReferences,
                referenceOrder: snapshot.referenceOrder,
                durationMs: 0,
                status: "pending",
                runId,
                run: initialRun,
                successCount: resumeOutputs.length,
                failCount: 0,
                itemCount: creationPlan.segments.length,
                chargedMicrocredits,
            });
            await saveLog(batchLog, false);
            activeSegmentLogRef.current = batchLog;

            if (isCurrentSession()) {
                setPreviewLog(batchLog);
                const batchPendingCard: GenerationResult = { id: batchId, status: "pending" };
                setResults((prev) => [batchPendingCard, ...prev.filter((r) => r.id !== batchId)]);
                setSegmentProgress({ completedCount: resumeOutputs.length, totalCount: creationPlan.segments.length, message: `准备生成 ${creationPlan.segments.length} 段视频` });
                setElapsedMs(0);
                setStartedAt(batchStartedAt);
            }
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "running", error: undefined });

            // 任务成功提交并持久化，立即释放前端锁定！
            setSubmitting(false);
            message.success("分段视频生成任务已提交，后台全自动执行中！");

            void (async () => {
                try {
                    const batchResult = await runVideoSegmentBatch({
                        plan: creationPlan,
                        config: snapshot.config,
                        batchId,
                        references: snapshot.references,
                        videoReferences: snapshot.videoReferences,
                        audioReferences: snapshot.audioReferences,
                        signal: controller.signal,
                        resume: { tasks: resumeTasks, outputs: resumeOutputs },
                        onProgress: (progress) => {
                            if (isCurrentSession()) {
                                setSegmentProgress({ completedCount: progress.completedCount, totalCount: progress.totalCount, message: progress.message });
                                setElapsedMs(performance.now() - batchStartedAt);
                            }
                        },
                        onTask: async (event) => {
                            const tasks = upsertSegmentTask(batchLog.segmentBatch?.tasks || [], event);
                            batchLog = { ...batchLog, updatedAt: Date.now(), segmentBatch: { ...(batchLog.segmentBatch || { batchId, status: "pending", handoff: emptySegmentHandoff(creationPlan, batchId) }), status: "pending", tasks } };
                            await saveLog(batchLog, false);
                        },
                        onOutput: async ({ output, outputs }) => {
                            const outputRecords = outputs.map((item) => buildSegmentOutputRecord(item));
                            const currentRun = batchLog.runs[0] || initialRun;
                            batchLog = {
                                ...batchLog,
                                updatedAt: Date.now(),
                                segmentBatch: { batchId, status: "pending", handoff: { ...(batchLog.segmentBatch?.handoff || emptySegmentHandoff(creationPlan, batchId)), segments: outputs }, tasks: batchLog.segmentBatch?.tasks || [] },
                                runs: [{ ...currentRun, updatedAt: Date.now(), outputs: outputRecords }],
                                successCount: outputs.length,
                                failCount: 0,
                                itemCount: creationPlan.segments.length,
                            };
                            activeSegmentLogRef.current = batchLog;
                            await saveLog(batchLog, false);
                            if (isCurrentSession()) {
                                const segmentResults = outputRecords.map(outputToGenerationResult).filter((item): item is GenerationResult => Boolean(item));
                                setResults((prev) => {
                                    const otherCards = prev.filter((r) => r.id !== batchId && !outputRecords.some((out) => out.outputId === r.id));
                                    return [...segmentResults, ...otherCards];
                                });
                                setSegmentProgress({ completedCount: outputs.length, totalCount: creationPlan.segments.length, message: `第 ${output.index} 段生成完成` });
                            }
                        },
                    });

                    if (controller.signal.aborted) {
                        const completedOutputsCount = activeSegmentLogRef.current?.runs?.[0]?.outputs?.length || 0;
                        if (completedOutputsCount === 0 && chargedMicrocredits > 0) {
                            void videoFeatureCredit.refund(chargedMicrocredits, snapshot.model, "视频分段任务中断退款", refundKey, deductKey);
                        }
                        activeChargedCreditsMapRef.current.delete(runId);
                        return;
                    }
                    if (getActiveUserScope() !== initialUserScope) {
                        console.warn("[video-workbench] 检测到账号已切换，熔断丢弃前序账号分段视频回写");
                        activeChargedCreditsMapRef.current.delete(runId);
                        return;
                    }

                    const finalStatus = batchResult.status === "completed" ? "success" : "failed";
                    const outputRecords = batchResult.outputs.map((item) => buildSegmentOutputRecord(item));

                    let mergedVideo: GeneratedVideo | undefined = undefined;
                    if (finalStatus === "success" && outputRecords.length > 1) {
                        try {
                            if (isCurrentSession()) {
                                setSegmentProgress({ completedCount: outputRecords.length, totalCount: outputRecords.length, message: "分段完成，正在浏览器端无损合并完整成片..." });
                            }
                            const inputs = outputRecords.map((item, idx) => ({ id: item.outputId || `seg-${idx}`, url: item.url, storageKey: item.storageKey }));
                            const mergedBlob = await mergeVideos(inputs, (prog) => {
                                if (isCurrentSession()) {
                                    setSegmentProgress({
                                        completedCount: outputRecords.length,
                                        totalCount: outputRecords.length,
                                        message: `正在合并完整成片 (${prog.phase === "encoding" ? "转码" : "读取"} ${prog.progress}%)...`,
                                    });
                                }
                            });
                            const stored = await uploadMediaFile(mergedBlob, "video");
                            const totalDurationMs = outputRecords.reduce((sum, item) => sum + (item.durationMs || 0), 0);
                            mergedVideo = {
                                id: nanoid(),
                                url: stored.url,
                                storageKey: stored.storageKey,
                                durationMs: totalDurationMs,
                                width: outputRecords[0]?.width || 1280,
                                height: outputRecords[0]?.height || 720,
                                bytes: stored.bytes || mergedBlob.size,
                                mimeType: stored.mimeType || "video/mp4",
                                label: `完整成片 (${Math.round(totalDurationMs / 1000)}s · ${outputRecords.length}段)`,
                            };
                        } catch (mergeErr) {
                            console.warn("视频客户端合并失败，保留各分段视频:", mergeErr);
                            if (isCurrentSession()) {
                                message.warning("分段视频已生成，但自动拼接遇到异常，已保留各分段视频");
                            }
                        }
                    }

                    const finalRun = { ...(batchLog.runs[0] || initialRun), status: finalStatus, updatedAt: Date.now(), outputs: outputRecords, error: batchResult.error } satisfies CreationRunRecord;
                    const finalLog: GenerationLog = {
                        ...batchLog,
                        status: finalStatus,
                        durationMs: performance.now() - batchStartedAt,
                        video: mergedVideo || (outputRecords[0]?.url ? {
                            id: outputRecords[0].outputId || nanoid(),
                            url: outputRecords[0].url,
                            storageKey: outputRecords[0].storageKey || "",
                            durationMs: outputRecords[0].durationMs || 0,
                            width: outputRecords[0].width || 1280,
                            height: outputRecords[0].height || 720,
                            bytes: outputRecords[0].bytes || 0,
                            mimeType: outputRecords[0].mimeType || "video/mp4",
                            label: outputRecords[0].segmentIndex ? `第 ${outputRecords[0].segmentIndex} 段` : undefined,
                        } : undefined),
                        segmentBatch: {
                            batchId: batchResult.batchId,
                            status: batchResult.status,
                            handoff: batchResult.handoff,
                            tasks: batchLog.segmentBatch?.tasks || [],
                            ...(batchResult.failedSegmentId ? { failedSegmentId: batchResult.failedSegmentId } : {}),
                            ...(batchResult.error ? { error: batchResult.error } : {}),
                        },
                        runs: [finalRun],
                        successCount: outputRecords.length,
                        failCount: finalStatus === "success" ? 0 : 1,
                        itemCount: creationPlan.segments.length,
                        error: batchResult.error,
                    };
                    activeSegmentLogRef.current = finalLog;
                    await saveLog(finalLog, false);
                    if (agentTaskId) updateAgentTask(agentTaskId, { status: finalStatus === "success" ? "succeeded" : "failed", successCount: finalStatus === "success" ? outputRecords.length : 0, failCount: finalStatus === "success" ? 0 : 1, error: batchResult.error });

                    // 资金与积分安全：严格对齐“产出有效视频即扣积分，不设补偿免单”规则，仅在 0 视频产出时全额退款
                    if (outputRecords.length === 0) {
                        if (chargedMicrocredits > 0) {
                            void videoFeatureCredit.refund(chargedMicrocredits, snapshot.model, "视频分段生成未成功退款", refundKey, deductKey);
                        }
                    }
                    activeChargedCreditsMapRef.current.delete(runId);

                    if (isCurrentSession()) {
                        setPreviewLog(finalLog);
                        const derived = deriveGenerationResultsFromLog(finalLog);
                        const segmentResults = outputRecords.map(outputToGenerationResult).filter((item): item is GenerationResult => Boolean(item));
                        const allResults = mergedVideo ? [{ id: mergedVideo.id, status: "success" as const, video: mergedVideo }, ...segmentResults] : segmentResults;
                        const finalCards = derived.length ? derived : (allResults.length ? allResults : [{ id: batchId, status: "failed" as const, error: batchResult.error || t("videoWorkbench.generationFailed") }]);
                        setResults((prev) => {
                            const otherCards = prev.filter((r) => r.id !== batchId && !allResults.some((ar) => ar.id === r.id));
                            return [...finalCards, ...otherCards];
                        });
                        if (finalStatus === "success") {
                            if (mergedVideo) message.success(`已完成 ${outputRecords.length} 段视频生成并无损拼接为完整成片！`);
                            else message.success(`已完成 ${outputRecords.length} 段视频生成`);
                        } else {
                            message.error(batchResult.error || t("videoWorkbench.generationFailed"));
                        }
                        setStartedAt(0);
                        setSegmentProgress(null);
                    }
                } catch (batchErr) {
                    console.error("分段任务后台执行异常:", batchErr);
                    const isAborted = controller.signal.aborted || (batchErr instanceof DOMException && batchErr.name === "AbortError");
                    const completedOutputsCount = activeSegmentLogRef.current?.runs?.[0]?.outputs?.length || 0;
                    const charged = activeChargedCreditsMapRef.current.get(runId);
                    if (completedOutputsCount === 0) {
                        if (charged && charged.amount > 0) {
                            activeChargedCreditsMapRef.current.delete(runId);
                            void videoFeatureCredit.refund(charged.amount, snapshot.model, isAborted ? "视频分段中断退款" : "视频分段生成异常退款", charged.refundKey, charged.deductKey);
                        } else if (chargedMicrocredits > 0) {
                            void videoFeatureCredit.refund(chargedMicrocredits, snapshot.model, isAborted ? "视频分段中断退款" : "视频分段生成异常退款", refundKey, deductKey);
                        }
                    } else {
                        activeChargedCreditsMapRef.current.delete(runId);
                    }
                    const errMsg = isAborted ? "任务执行中断" : (batchErr instanceof Error ? batchErr.message : "分段生成异常");
                    if (activeSegmentLogRef.current) {
                        const failedSegmentLog: GenerationLog = {
                            ...activeSegmentLogRef.current,
                            status: "failed",
                            error: errMsg,
                            chargedMicrocredits: 0,
                            updatedAt: Date.now(),
                        };
                        activeSegmentLogRef.current = failedSegmentLog;
                        void saveLog(failedSegmentLog, false);
                        setLogs((prev) => prev.map((l) => (l.id === batchId || l.runId === batchId ? failedSegmentLog : l)));
                    }
                    if (isCurrentSession()) {
                        message.error(errMsg);
                        const failedCard: GenerationResult = { id: batchId, status: "failed", error: errMsg };
                        setResults((prev) => {
                            const existingIdx = prev.findIndex((r) => r.id === batchId);
                            if (existingIdx >= 0) {
                                const next = [...prev];
                                next[existingIdx] = failedCard;
                                return next;
                            }
                            return [failedCard, ...prev];
                        });
                        setSegmentProgress(null);
                    }
                } finally {
                    activeSegmentBatchIdsRef.current.delete(batchId);
                    activeChargedCreditsMapRef.current.delete(runId);
                }
            })();
            return;
        }

        activeSegmentLogRef.current = null;
        const requestSignature = computeVideoRequestSignature(snapshot);
        const matchingFailedLog = resumeLog || logs.find((l) => l.status === "failed" && l.requestSignature === requestSignature);
        const targetLogId = matchingFailedLog?.id || nanoid();
        const prevFailureCount = matchingFailedLog?.failureCount || 0;

        try {
            // 向后端提交生成任务（对齐画布模式，创建持久化任务 POST /api/tasks）
            const task = await createVideoGenerationTask(
                snapshot.config,
                snapshot.requestText,
                snapshot.references,
                snapshot.videoReferences,
                snapshot.audioReferences,
                { signal: controller.signal },
            );

            const log = buildLog({
                logId: targetLogId,
                sessionId: activeSessionId,
                creationAssistant: snapshot.creationAssistant,
                prompt: snapshot.text,
                model: snapshot.model,
                config: snapshot.config,
                references: snapshot.references,
                videoReferences: snapshot.videoReferences,
                audioReferences: snapshot.audioReferences,
                textReferences: snapshot.textReferences,
                referenceOrder: snapshot.referenceOrder,
                durationMs: 0,
                status: "pending",
                task,
                runId,
                run: createRunRecord({ runId, prompt: snapshot.requestText, model: snapshot.model, config: snapshot.config, task, status: "pending" }),
                successCount: 0,
                failCount: 0,
                itemCount: 1,
                failureCount: prevFailureCount,
                requestSignature,
                chargedMicrocredits,
            });
            await saveLog(log, false);

            if (isCurrentSession()) {
                setPreviewLog(log);
                const pendingCard: GenerationResult = { id: targetLogId, status: "pending", task };
                setResults((prev) => [pendingCard, ...prev.filter((r) => r.id !== targetLogId)]);
                setElapsedMs(0);
                setStartedAt(batchStartedAt);
            }
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "running", error: undefined });

            // 任务已提交到后端并完成持久化，立即释放前端输入与生成按钮锁定！
            setSubmitting(false);
            message.success("视频生成任务已提交，后台全自动执行中！");

            // 后台自持轮询，保证即使页面跳转或查看历史，仍能正常保存成片与退款
            void pollGenerationLog(log, snapshot.config, agentTaskId, controller.signal, chargedMicrocredits);
        } catch (error) {
            setSubmitting(false);
            const errorMessage = error instanceof Error ? error.message : t("workbench.generationFailed");
            if (chargedMicrocredits > 0) {
                void videoFeatureCredit.refund(chargedMicrocredits, snapshot.model, "视频生成异常退款", refundKey, deductKey);
            }
            activeChargedCreditsMapRef.current.delete(runId);
            if (isCurrentSession()) {
                const submitFailedCard: GenerationResult = { id: targetLogId, status: "failed", error: errorMessage };
                setResults((prev) => {
                    const existingIndex = prev.findIndex((r) => r.id === targetLogId);
                    if (existingIndex >= 0) {
                        const next = [...prev];
                        next[existingIndex] = submitFailedCard;
                        return next;
                    }
                    return [submitFailedCard, ...prev];
                });
                message.error(errorMessage);
                setSegmentProgress(null);
            }
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: 1, error: errorMessage });
        }
    };

    const pollGenerationLog = async (log: GenerationLog, configOverride?: AiConfig, agentTaskId?: string, signal?: AbortSignal, chargedMicrocredits = 0) => {
        if (!log.task) return;
        activeLogIdsRef.current.add(log.id);
        const effectiveChargedCredits = chargedMicrocredits || log.chargedMicrocredits || 0;
        const isCurrentSession = () => !log.sessionId || !useVideoWorkbenchStore.getState().draft.sessionId || log.sessionId === useVideoWorkbenchStore.getState().draft.sessionId;
        const taskConfig = buildVideoConfig(configOverride || { ...effectiveConfig, model: log.config.model, videoModel: log.config.videoModel }, log.model);
        const isLongRunningProvider = log.task?.provider !== "agnes";
        const startedAt = log.createdAt || Date.now();
        let notifiedSoftTimeout = false;

        // [tiered-video-polling] [start]
        if (isLongRunningProvider) {
            const initialElapsed = Date.now() - startedAt;
            if (initialElapsed < 60_000) {
                await delay(60_000 - initialElapsed, signal);
            }
        }
        // [tiered-video-polling] [end]
        try {
            for (let attempt = 0; ; attempt += 1) {
                if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
                const state = await pollVideoGenerationTask(taskConfig, log.task, { signal });
                if (state.status === "completed") {
                    if (getActiveUserScope() !== (log.userId || getActiveUserScope())) {
                        console.warn("[video-workbench] 检测到账号已切换，熔断丢弃前序账号视频成片回写");
                        activeChargedCreditsMapRef.current.delete(log.runId || log.id);
                        return;
                    }
                    activeChargedCreditsMapRef.current.delete(log.runId || log.id);
                    const stored = await storeGeneratedVideo(state.result);
                    const nextVideo: GeneratedVideo = {
                        id: nanoid(),
                        url: stored.url,
                        storageKey: stored.storageKey,
                        durationMs: Date.now() - log.createdAt,
                        width: stored.width || 1280,
                        height: stored.height || 720,
                        bytes: stored.bytes,
                        mimeType: stored.mimeType,
                    };
                    const output = buildOutputRecord(nextVideo, "final");
                    const updatedRuns = (log.runs || []).map((run) => (run.runId === log.runId ? { ...run, status: "success" as const, outputs: upsertOutput(run.outputs || [], output) } : run));
                    const savedSuccessLog: GenerationLog = {
                        ...log,
                        status: "success",
                        durationMs: nextVideo.durationMs,
                        video: nextVideo,
                        runs: updatedRuns,
                        error: undefined,
                        successCount: 1,
                        failCount: 0,
                        itemCount: 1,
                        failureCount: 0,
                        chargedMicrocredits: log.chargedMicrocredits || effectiveChargedCredits,
                    };
                    if (isCurrentSession()) {
                        setPreviewLog(savedSuccessLog);
                        const successCard: GenerationResult = {
                            id: nextVideo.id,
                            status: "success",
                            video: nextVideo,
                        };
                        setResults((prev) => {
                            const existingIndex = prev.findIndex((r) => r.id === log.id || (r.task?.id && r.task.id === log.task?.id) || r.id === nextVideo.id);
                            if (existingIndex >= 0) {
                                const next = [...prev];
                                next[existingIndex] = successCard;
                                return next;
                            }
                            return [successCard, ...prev];
                        });
                        message.success(t("videoWorkbench.generated"));
                    } else {
                        // [workbench-cross-session-notify] [start]
                        message.success("后台视频任务已生成完成，已同步存入生成记录！");
                        // [workbench-cross-session-notify] [end]
                    }
                    if (agentTaskId) updateAgentTask(agentTaskId, { status: "succeeded", successCount: 1, failCount: 0, error: undefined });
                    await saveLog(savedSuccessLog);
                    return;
                }
                if (state.status === "failed") throw new Error(state.error);

                // [tiered-video-polling] [start]
                const currentElapsed = Date.now() - startedAt;
                if (currentElapsed >= 90 * 1000 && !notifiedSoftTimeout) {
                    notifiedSoftTimeout = true;
                    if (isCurrentSession()) {
                        message.info("当前模型算力高峰排队中，已转入后台长效托管，成片后将自动入库回填，请耐心等待");
                    }
                }
                if (isLongRunningProvider) {
                    if (currentElapsed >= VIDEO_SEGMENT_HARD_TIMEOUT_MS) {
                        throw new Error(t("videoWorkbench.timeout"));
                    }
                    const nextInterval = getTieredPollingIntervalMs(currentElapsed);
                    await delay(nextInterval, signal);
                } else {
                    const delayMs = log.task?.provider === "agnes" ? 1500 : 2500;
                    if (currentElapsed >= 15 * 60 * 1000) {
                        throw new Error(t("videoWorkbench.timeout"));
                    }
                    await delay(delayMs, signal);
                }
                // [tiered-video-polling] [end]
            }
        } catch (error) {
            const isAborted = signal?.aborted || (error instanceof DOMException && error.name === "AbortError");
            const targetRunId = log.runId || log.id;
            const charged = activeChargedCreditsMapRef.current.get(targetRunId);
            if (charged && charged.amount > 0) {
                activeChargedCreditsMapRef.current.delete(targetRunId);
                void videoFeatureCredit.refund(charged.amount, log.model, isAborted ? "视频生成中断退款" : "视频生成未完成退款", charged.refundKey, charged.deductKey);
            } else if (effectiveChargedCredits > 0) {
                const logDeductKey = `deduct:video_workbench:${targetRunId}`;
                const logRefundKey = `refund:video_workbench:${targetRunId}`;
                void videoFeatureCredit.refund(effectiveChargedCredits, log.model, isAborted ? "视频生成中断退款" : "视频生成未完成退款", logRefundKey, logDeductKey);
            }
            if (isAborted) {
                const savedAbortedLog: GenerationLog = {
                    ...log,
                    status: "failed",
                    durationMs: Date.now() - log.createdAt,
                    runs: (log.runs || []).map((run) => (run.runId === log.runId ? { ...run, status: "failed" as const, error: "任务执行中断" } : run)),
                    error: "任务执行中断",
                    successCount: 0,
                    failCount: 1,
                    chargedMicrocredits: 0,
                };
                void saveLog(savedAbortedLog, false);
                setLogs((prev) => prev.map((l) => (l.id === log.id ? savedAbortedLog : l)));
                return;
            }
            const errorMessage = error instanceof Error ? error.message : t("workbench.generationFailed");
            const updatedRuns = (log.runs || []).map((run) => (run.runId === log.runId ? { ...run, status: "failed" as const, error: errorMessage } : run));
            const nextFailureCount = (log.failureCount || 0) + 1;
            const savedFailedLog: GenerationLog = {
                ...log,
                status: "failed",
                durationMs: Date.now() - log.createdAt,
                runs: updatedRuns,
                error: errorMessage,
                successCount: 0,
                failCount: 1,
                itemCount: 1,
                failureCount: nextFailureCount,
                chargedMicrocredits: 0,
            };
            if (isCurrentSession()) {
                setPreviewLog(savedFailedLog);
                const failedCard: GenerationResult = {
                    id: log.id,
                    status: "failed",
                    error: errorMessage,
                    task: log.task,
                    failureCount: nextFailureCount,
                };
                setResults((prev) => {
                    const existingIndex = prev.findIndex((r) => r.id === log.id || (r.task?.id && r.task.id === log.task?.id));
                    if (existingIndex >= 0) {
                        const next = [...prev];
                        next[existingIndex] = failedCard;
                        return next;
                    }
                    return [failedCard, ...prev];
                });
                message.error(errorMessage);
            } else {
                // [workbench-cross-session-notify] [start]
                message.error(`后台视频任务失败：${errorMessage}`);
                // [workbench-cross-session-notify] [end]
            }
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: 1, error: errorMessage });
            await saveLog(savedFailedLog);
        } finally {
            activeLogIdsRef.current.delete(log.id);
            activeChargedCreditsMapRef.current.delete(log.runId || log.id);
            if (!activeLogIdsRef.current.size) {
                if (isCurrentSession()) {
                    setStartedAt(0);
                }
            }
        }
    };

    const handleRecheck = async (task?: VideoGenerationTask, targetLog?: GenerationLog | null) => {
        const activeLog = targetLog || previewLog || logs.find((l) =>
            l.task?.id === task?.id ||
            l.segmentBatch?.tasks?.some((t) => t.task?.id === task?.id)
        );
        const isSegmentBatch = Boolean(activeLog?.segmentBatch && activeLog.segmentBatch.tasks?.length);
        const activeTask = task || activeLog?.task || activeLog?.segmentBatch?.tasks?.find((t) => t.task)?.task;

        if (!activeTask && !isSegmentBatch) {
            message.warning("未能找到对应的后台生成任务");
            return;
        }

        const logToUpdate = activeLog || logs.find((l) =>
            (activeTask && l.task?.id === activeTask.id) ||
            (activeTask && l.segmentBatch?.tasks?.some((t) => t.task?.id === activeTask.id))
        );
        const targetId = logToUpdate?.id || activeTask?.id || "unknown";
        setRecheckingLogId(targetId);
        message.loading({ content: t("videoWorkbench.rechecking"), key: "recheck-video-status", duration: 0 });

        try {
            if (isSegmentBatch && logToUpdate?.segmentBatch) {
                // 分段生成批次任务穿透查询与自愈
                const currentSegmentBatch = logToUpdate.segmentBatch;
                const batchLog = logToUpdate;
                const batchId = currentSegmentBatch.batchId || batchLog.id;
                const handoff: VideoSegmentHandoff = currentSegmentBatch.handoff || (batchLog.creationPlan ? emptySegmentHandoff(batchLog.creationPlan, batchId) : {
                    batchId,
                    schemaVersion: "video-segment-handoff-v1" as const,
                    targetDurationSec: 0,
                    aspectRatio: "16:9",
                    resolution: "720p",
                    segments: [],
                });
                const batchTasks = [...(currentSegmentBatch.tasks || [])];
                const existingOutputs = [...(batchLog.runs?.[0]?.outputs || [])];
                const totalSegments = batchLog.creationPlan?.segments.length || batchTasks.length || 1;
                let anyRunning = false;
                let firstFailedError: string | undefined;

                for (let i = 0; i < batchTasks.length; i++) {
                    const chk = batchTasks[i];
                    if (!chk.task) continue;

                    // 若该分段已存在成功产物，跳过查询
                    if (existingOutputs.some((out) => out.outputId === chk.segmentId && out.status === "success" && (out.url || out.storageKey))) {
                        continue;
                    }

                    // 1. 若为 backend 任务且媒体保存异常，先执行 recover
                    if (chk.task.provider === "backend") {
                        try {
                            const latest = await refreshGenerationTaskStatus(chk.task.id);
                            if (latest.canRecoverMedia && latest.status === "failed") {
                                message.loading({ content: `第 ${i + 1} 段作品正在重新保存至存储...`, key: "recheck-video-status", duration: 0 });
                                await recoverGenerationTaskMedia(chk.task.id);
                            }
                        } catch (recoverErr) {
                            console.warn("recoverGenerationTaskMedia error for segment:", chk.segmentId, recoverErr);
                        }
                    }

                    // 2. 轮询/查询后端最新状态
                    const segConfig = buildVideoConfig(
                        batchLog.config ? { ...effectiveConfig, model: batchLog.config.model, videoModel: batchLog.config.videoModel } : effectiveConfig,
                        chk.task.model,
                    );
                    const state = await pollVideoGenerationTask(segConfig, chk.task);

                    if (state.status === "completed") {
                        const stored = await storeGeneratedVideo(state.result);
                        const segPlan = batchLog.creationPlan?.segments.find((s) => s.segmentId === chk.segmentId);
                        const segmentIndex = segPlan?.index || (i + 1);
                        const startSec = segPlan?.startSec ?? (segmentIndex === 1 ? 0 : 8);
                        const endSec = segPlan?.endSec ?? (startSec + (segPlan?.keepDurationSec || 8));
                        const keepDurationSec = segPlan?.keepDurationSec || (endSec - startSec);

                        const newOutput: CreationOutputRecord = {
                            outputId: chk.segmentId,
                            mediaType: "video",
                            role: "segment",
                            status: "success",
                            storageKey: stored.storageKey,
                            url: stored.url || (stored.storageKey ? resolveResourceUrl(stored.storageKey) : ""),
                            segmentIndex,
                            startSec,
                            endSec,
                            durationMs: keepDurationSec * 1000,
                            width: stored.width || 1280,
                            height: stored.height || 720,
                            mimeType: stored.mimeType || "video/mp4",
                        };

                        const outIdx = existingOutputs.findIndex((o) => o.outputId === chk.segmentId);
                        if (outIdx >= 0) {
                            existingOutputs[outIdx] = newOutput;
                        } else {
                            existingOutputs.push(newOutput);
                        }

                        batchTasks[i] = { ...chk, status: "success", error: undefined };
                    } else if (state.status === "failed") {
                        batchTasks[i] = { ...chk, status: "failed", error: state.error || "服务端确认任务生成失败" };
                        if (!firstFailedError) firstFailedError = state.error;
                    } else {
                        anyRunning = true;
                    }
                }

                // 按分段 index 排序产物
                existingOutputs.sort((a, b) => (a.segmentIndex || 0) - (b.segmentIndex || 0));

                const allSuccess = existingOutputs.length >= totalSegments && !anyRunning && batchTasks.every((t) => t.status === "success" || existingOutputs.some((o) => o.outputId === t.segmentId));

                if (allSuccess) {
                    // 全部分段就绪：尝试合并成片并更新为成功状态
                    let mergedVideo: GeneratedVideo | undefined = undefined;
                    if (existingOutputs.length > 1) {
                        try {
                            message.loading({ content: "分段已全部就绪，正在合成完整成片...", key: "recheck-video-status", duration: 0 });
                            const inputs = existingOutputs.map((item, idx) => ({ id: item.outputId || `seg-${idx}`, url: item.url, storageKey: item.storageKey }));
                            const mergedBlob = await mergeVideos(inputs);
                            const storedMerged = await uploadMediaFile(mergedBlob, "video");
                            const totalDurationMs = existingOutputs.reduce((sum, item) => sum + (item.durationMs || 0), 0);
                            mergedVideo = {
                                id: nanoid(),
                                url: storedMerged.url,
                                storageKey: storedMerged.storageKey,
                                durationMs: totalDurationMs,
                                width: existingOutputs[0]?.width || 1280,
                                height: existingOutputs[0]?.height || 720,
                                bytes: storedMerged.bytes || mergedBlob.size,
                                mimeType: storedMerged.mimeType || "video/mp4",
                                label: `完整成片 (${Math.round(totalDurationMs / 1000)}s · ${existingOutputs.length}段)`,
                            };
                        } catch (mergeErr) {
                            console.warn("客户端视频合并失败，保留各分段视频:", mergeErr);
                        }
                    }

                    const finalRun: CreationRunRecord = {
                        ...(batchLog.runs?.[0] || {
                            runId: batchLog.runId || nanoid(),
                            prompt: batchLog.prompt,
                            model: batchLog.model,
                            config: batchLog.config as any,
                            status: "success",
                            outputs: [],
                            createdAt: batchLog.createdAt,
                            updatedAt: Date.now(),
                        }),
                        status: "success",
                        updatedAt: Date.now(),
                        outputs: existingOutputs,
                        error: undefined,
                    };

                    const savedSuccessLog: GenerationLog = {
                        ...batchLog,
                        status: "success",
                        durationMs: Date.now() - batchLog.createdAt,
                        video: mergedVideo || (existingOutputs[0]?.url ? {
                            id: existingOutputs[0].outputId || nanoid(),
                            url: existingOutputs[0].url,
                            storageKey: existingOutputs[0].storageKey || "",
                            durationMs: existingOutputs[0].durationMs || 0,
                            width: existingOutputs[0].width || 1280,
                            height: existingOutputs[0].height || 720,
                            bytes: existingOutputs[0].bytes || 0,
                            mimeType: existingOutputs[0].mimeType || "video/mp4",
                            label: existingOutputs[0].segmentIndex ? `第 ${existingOutputs[0].segmentIndex} 段` : undefined,
                        } : undefined),
                        segmentBatch: {
                            ...currentSegmentBatch,
                            batchId,
                            status: "completed",
                            handoff: {
                                ...handoff,
                                segments: existingOutputs.map((item) => ({
                                    segmentId: item.outputId,
                                    index: item.segmentIndex || 1,
                                    startSec: item.startSec || 0,
                                    endSec: item.endSec || (item.startSec || 0) + Math.round((item.durationMs || 0) / 1000),
                                    keepDurationSec: Math.round((item.durationMs || 0) / 1000) || 5,
                                    storageKey: item.storageKey || "",
                                    url: item.url || "",
                                    width: item.width,
                                    height: item.height,
                                    durationMs: item.durationMs,
                                })),
                            },
                            tasks: batchTasks,
                            error: undefined,
                        },
                        runs: [finalRun],
                        successCount: existingOutputs.length,
                        failCount: 0,
                        itemCount: totalSegments,
                        error: undefined,
                    };

                    await saveLog(savedSuccessLog, false);
                    setPreviewLog(savedSuccessLog);
                    const derivedCards = deriveGenerationResultsFromLog(savedSuccessLog);
                    setResults((prev) => {
                        const otherCards = prev.filter((r) => r.id !== targetId && r.id !== `${targetId}-failed` && !derivedCards.some((dc) => dc.id === r.id));
                        return [...derivedCards, ...otherCards];
                    });
                    message.success({ content: t("videoWorkbench.recheckSuccess"), key: "recheck-video-status" });
                } else if (anyRunning) {
                    // 仍有分段在执行
                    const updatedLog: GenerationLog = {
                        ...batchLog,
                        segmentBatch: {
                            ...currentSegmentBatch,
                            batchId,
                            status: "pending",
                            handoff,
                            tasks: batchTasks,
                        },
                        runs: [{
                            ...(batchLog.runs?.[0] || {
                                runId: batchLog.runId || nanoid(),
                                prompt: batchLog.prompt,
                                model: batchLog.model,
                                config: batchLog.config as any,
                                status: "pending",
                                outputs: [],
                                createdAt: batchLog.createdAt,
                                updatedAt: Date.now(),
                            }),
                            outputs: existingOutputs,
                        }],
                        successCount: existingOutputs.length,
                    };
                    await saveLog(updatedLog, false);
                    setPreviewLog(updatedLog);
                    const derivedCards = deriveGenerationResultsFromLog(updatedLog);
                    setResults((prev) => {
                        const otherCards = prev.filter((r) => r.id !== targetId && r.id !== `${targetId}-failed` && !derivedCards.some((dc) => dc.id === r.id));
                        return [...derivedCards, ...otherCards];
                    });
                    message.info({ content: t("videoWorkbench.recheckStillPending"), key: "recheck-video-status" });
                } else {
                    // 分段中有失败且无正在运行的分段
                    const errText = firstFailedError || "分段生成失败";
                    const updatedFailedLog: GenerationLog = {
                        ...batchLog,
                        status: "failed",
                        error: errText,
                        segmentBatch: {
                            ...currentSegmentBatch,
                            batchId,
                            status: "failed",
                            handoff,
                            tasks: batchTasks,
                            error: errText,
                        },
                        runs: [{
                            ...(batchLog.runs?.[0] || {
                                runId: batchLog.runId || nanoid(),
                                prompt: batchLog.prompt,
                                model: batchLog.model,
                                config: batchLog.config as any,
                                status: "failed",
                                outputs: [],
                                createdAt: batchLog.createdAt,
                                updatedAt: Date.now(),
                            }),
                            outputs: existingOutputs,
                            error: errText,
                        }],
                        successCount: existingOutputs.length,
                    };
                    await saveLog(updatedFailedLog, false);
                    setPreviewLog(updatedFailedLog);
                    const derivedCards = deriveGenerationResultsFromLog(updatedFailedLog);
                    setResults((prev) => {
                        const otherCards = prev.filter((r) => r.id !== targetId && r.id !== `${targetId}-failed` && !derivedCards.some((dc) => dc.id === r.id));
                        return [...derivedCards, ...otherCards];
                    });
                    message.error({ content: errText, key: "recheck-video-status" });
                }
                return;
            }

            // 单任务原生分支保持不变
            if (activeTask && activeTask.provider === "backend") {
                try {
                    const latestTask = await refreshGenerationTaskStatus(activeTask.id);
                    if (latestTask.canRecoverMedia && latestTask.status === "failed") {
                        message.loading({ content: "作品已在云端就绪，正在重新保存至存储...", key: "recheck-video-status", duration: 0 });
                        await recoverGenerationTaskMedia(activeTask.id);
                    }
                } catch (recoverErr) {
                    console.warn("recoverGenerationTaskMedia check error:", recoverErr);
                }
            }
            if (!activeTask) {
                message.warning("未能找到对应的后台生成任务");
                return;
            }
            const taskConfig = buildVideoConfig(
                logToUpdate?.config ? { ...effectiveConfig, model: logToUpdate.config.model, videoModel: logToUpdate.config.videoModel } : effectiveConfig,
                activeTask.model,
            );
            const state = await pollVideoGenerationTask(taskConfig, activeTask);
            if (state.status === "completed") {
                const stored = await storeGeneratedVideo(state.result);
                const nextVideo: GeneratedVideo = {
                    id: nanoid(),
                    url: stored.url,
                    storageKey: stored.storageKey,
                    durationMs: logToUpdate ? Date.now() - logToUpdate.createdAt : 0,
                    width: stored.width || 1280,
                    height: stored.height || 720,
                    bytes: stored.bytes,
                    mimeType: stored.mimeType,
                };
                if (logToUpdate) {
                    const output = buildOutputRecord(nextVideo, "final");
                    const updatedRuns = (logToUpdate.runs || []).map((run) =>
                        run.runId === logToUpdate.runId ? { ...run, status: "success" as const, outputs: upsertOutput(run.outputs || [], output) } : run,
                    );
                    const savedSuccessLog: GenerationLog = {
                        ...logToUpdate,
                        status: "success",
                        durationMs: nextVideo.durationMs,
                        video: nextVideo,
                        runs: updatedRuns.length ? updatedRuns : [{
                            runId: logToUpdate.runId || nanoid(),
                            prompt: logToUpdate.prompt,
                            model: logToUpdate.model,
                            config: logToUpdate.config as any,
                            status: "success",
                            outputs: [output],
                            createdAt: logToUpdate.createdAt,
                            updatedAt: Date.now(),
                        }],
                        error: undefined,
                        successCount: 1,
                        failCount: 0,
                        itemCount: 1,
                        failureCount: 0,
                    };
                    await saveLog(savedSuccessLog, false);
                    setPreviewLog(savedSuccessLog);
                }
                const recheckSuccessCard: GenerationResult = { id: nextVideo.id, status: "success", video: nextVideo };
                setResults((prev) => {
                    const existingIdx = prev.findIndex((r) => r.id === targetId || (r.task?.id && r.task.id === activeTask.id) || r.id === nextVideo.id);
                    if (existingIdx >= 0) {
                        const next = [...prev];
                        next[existingIdx] = recheckSuccessCard;
                        return next;
                    }
                    return [recheckSuccessCard, ...prev];
                });
                message.success({ content: t("videoWorkbench.recheckSuccess"), key: "recheck-video-status" });
            } else if (state.status === "failed") {
                const errText = state.error || "服务端确认任务生成失败";
                if (logToUpdate) {
                    await saveLog({ ...logToUpdate, status: "failed", error: errText }, false);
                }
                message.error({ content: errText, key: "recheck-video-status" });
            } else {
                message.info({ content: t("videoWorkbench.recheckStillPending"), key: "recheck-video-status" });
                if (logToUpdate && !activeLogIdsRef.current.has(logToUpdate.id)) {
                    void pollGenerationLog(logToUpdate);
                }
            }
        } catch (err) {
            const errText = err instanceof Error ? err.message : "重新查询失败";
            message.error({ content: errText, key: "recheck-video-status" });
        } finally {
            setRecheckingLogId(null);
        }
    };

    const downloadVideo = (video: GeneratedVideo) => {
        saveAs(video.url, `video-${Date.now()}.mp4`);
    };

    const saveResultToAssets = async (video: GeneratedVideo) => {
        const payload = {
            kind: "video" as const,
            title: `视频作品 #${Date.now().toString().slice(-4)}`,
            coverUrl: video.url,
            tags: [],
            source: t("videoWorkbench.source"),
            data: { url: video.url, storageKey: video.storageKey, width: video.width, height: video.height, bytes: video.bytes, mimeType: video.mimeType },
            metadata: { source: "video-page", prompt },
        };
        const existing = useAssetStore.getState().findMatchingAsset(payload);
        addAsset(payload);
        if (existing) {
            message.info("素材库中已存在该生成视频，已自动认定并复用");
        } else {
            message.success(t("common.addedToAssets"));
        }
    };

    const insertPickedAsset = async (payloads: InsertAssetPayload | InsertAssetPayload[]) => {
        let changed = false;
        const list = Array.isArray(payloads) ? payloads : [payloads];
        for (const payload of list) {
            if (payload.kind === "text") {
                const id = nanoid();
                updateDraft((value) => {
                    const label = `@文本${value.textReferences.length + 1}`;
                    return { ...value, textReferences: [...value.textReferences, { id, name: payload.title, content: payload.content }], prompt: appendPromptReference(value.prompt, label) };
                });
                changed = true;
            } else if (payload.kind === "image") {
                const url = payload.dataUrl || payload.url || "";
                const stored = await uploadImage(url);
                const id = nanoid();
                if (useVideoWorkbenchStore.getState().draft.references.length < SEEDANCE_REFERENCE_LIMITS.images) {
                    updateDraft((value) => ({
                        ...value,
                        references: [...value.references, {
                            id,
                            name: payload.title,
                            type: stored.mimeType,
                            dataUrl: stored.url,
                            storageKey: stored.storageKey,
                            bytes: stored.bytes || payload.bytes,
                            width: stored.width || payload.width,
                            height: stored.height || payload.height,
                        }],
                        referenceOrder: [...value.referenceOrder, { id, kind: "image" }],
                    }));
                    changed = true;
                }
            } else if (payload.kind === "video") {
                const id = nanoid();
                if (useVideoWorkbenchStore.getState().draft.videoReferences.length < SEEDANCE_REFERENCE_LIMITS.videos) {
                    updateDraft((value) => ({
                        ...value,
                        videoReferences: [...value.videoReferences, {
                            id,
                            name: payload.title,
                            type: payload.mimeType || "video/mp4",
                            url: payload.url,
                            storageKey: payload.storageKey,
                            width: payload.width,
                            height: payload.height,
                            bytes: payload.bytes,
                            durationMs: payload.durationMs,
                        }],
                        referenceOrder: [...value.referenceOrder, { id, kind: "video" }],
                    }));
                    changed = true;
                    void (async () => {
                        try {
                            const source = payload.url || (payload.storageKey ? await resolveMediaUrl(payload.storageKey, "") : "");
                            if (!source) return;
                            const captured = await captureVideoPoster(source);
                            if (captured?.poster) {
                                const posterBlobUrl = URL.createObjectURL(captured.poster);
                                setVideoReferences((current) => current.map((item) => (item.id === id ? { ...item, posterUrl: posterBlobUrl } : item)));
                            }
                        } catch {
                            // ignore poster extraction error
                        }
                    })();
                }
            }
        }
        if (changed) resetCreationAssistantForSources(useVideoWorkbenchStore.getState().draft);
        setAssetPickerOpen(false);
    };

    const saveLog = async (log: GenerationLog, resumePending = true) => {
        const userLog = { ...log, userId: getActiveUserScope() };
        const serialized = serializeLog(userLog);
        await generationLogWriteQueue(userLog.id, async () => {
            await logStore.setItem(userLog.id, serialized);
        });
        void syncGenerationLogToRemote(serialized, "video");
        await refreshLogs(resumePending);
    };

    const refreshLogs = async (resumePending = true, fetchRemote = false) => {
        if (isReconcilingLogsRef.current) return logs;
        isReconcilingLogsRef.current = true;
        try {
            const scope = getActiveUserScope();
            let nextLogs = await readStoredLogs(scope);
            setLogs(nextLogs);

            if (fetchRemote) {
                try {
                    const res = await listRemoteGenerationLogs("video");
                    if (res?.logs?.length) {
                        const localMap = new Map(nextLogs.map((item) => [item.id, item]));
                        let hasNewRemote = false;
                        for (const raw of res.logs) {
                            const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
                            if (parsed && typeof parsed === "object" && "id" in parsed) {
                                const remoteLog = parsed as GenerationLog;
                                const local = localMap.get(remoteLog.id);
                                if (!local || (remoteLog.updatedAt || 0) > (local.updatedAt || 0)) {
                                    await logStore.setItem(remoteLog.id, remoteLog);
                                    hasNewRemote = true;
                                }
                            }
                        }
                        if (hasNewRemote) {
                            nextLogs = await readStoredLogs(scope);
                            setLogs(nextLogs);
                        }
                    }
                } catch (err) {
                    console.warn("拉取服务端视频生成记录失败:", err);
                }
            }

            if (resumePending) {
                const pendingLogs = nextLogs.filter((log) => log.status === "pending" && (log.userId === scope || (!log.userId && scope === "guest")));
                for (const log of pendingLogs) {
                    if (log.task || log.segmentBatch) {
                        if (!activeLogIdsRef.current.has(log.id)) {
                            activeLogIdsRef.current.add(log.id);
                            if (log.segmentBatch) {
                                void handleRecheck(undefined, log);
                            } else if (log.task) {
                                void pollGenerationLog(log);
                            }
                        }
                    } else {
                        // 自愈孤儿态：既无物理 task 也无 segmentBatch 的 pending 记录
                        const hasOutputs = Boolean(log.video || (log.runs && log.runs.some((r) => r.outputs && r.outputs.length > 0)));
                        if (hasOutputs) {
                            const healed: GenerationLog = { ...log, status: "success", updatedAt: Date.now() };
                            void logStore.setItem(healed.id, healed);
                            setLogs((prev) => prev.map((l) => (l.id === healed.id ? healed : l)));
                        } else {
                            const healed: GenerationLog = { ...log, status: "failed", error: "任务执行中断", updatedAt: Date.now() };
                            void logStore.setItem(healed.id, healed);
                            setLogs((prev) => prev.map((l) => (l.id === healed.id ? healed : l)));
                            const charged = log.chargedMicrocredits || 0;
                            if (charged > 0) {
                                const logRunId = log.runId || log.id;
                                const logDeductKey = `deduct:video_workbench:${logRunId}`;
                                const logRefundKey = `refund:video_workbench:${logRunId}`;
                                void videoFeatureCredit.refund(charged, log.model, "视频任务中断自动对账补偿退款", logRefundKey, logDeductKey);
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

    const buildDraftLog = (): GenerationLog => {
        const assistantDraft = structuredClone(useCreationAssistantStore.getState().draft);
        const resolvedModel = resolveModelForCapability(effectiveConfig, draft.model || effectiveConfig.videoModel || effectiveConfig.model, "video");
        const logId = (previewLog && previewLog.status === "draft") ? previewLog.id : nanoid();
        const resolvedSessionId = draft.sessionId || logId;
        const now = Date.now();
        const firstReference = draft.referenceOrder[0];
        const title = draft.prompt.trim().slice(0, 30)
            || assistantDraft.script.trim().slice(0, 30)
            || (firstReference ? `草稿 #${firstReference.id.slice(-4)}` : "未命名草稿");

        const logConfig = buildVideoConfig({
            ...effectiveConfig,
            size: draft.aspectRatio,
            vquality: draft.resolution,
            videoSeconds: String(draft.durationSec),
        }, resolvedModel);

        return {
            id: logId,
            sessionId: resolvedSessionId,
            userId: getActiveUserScope(),
            prompt: draft.prompt || assistantDraft.script || "",
            model: resolvedModel,
            status: "draft",
            createdAt: previewLog?.createdAt || now,
            updatedAt: now,
            title,
            time: new Date(now).toLocaleTimeString(),
            size: logConfig.size || draft.aspectRatio,
            resolution: normalizeResolution(logConfig.vquality || draft.resolution),
            seconds: logConfig.videoSeconds || String(draft.durationSec),
            references: [...draft.references],
            videoReferences: [...draft.videoReferences],
            audioReferences: [...draft.audioReferences],
            textReferences: [...draft.textReferences],
            referenceOrder: [...draft.referenceOrder],
            config: logConfig,
            runs: [],
            creationPlan: draft.creationPlan,
            creationAssistant: assistantDraft,
            successCount: 0,
            failCount: 0,
            itemCount: 0,
            durationMs: 0,
        };
    };

    const createSession = async (saveCurrentDraft = true) => {
        // 不要粗暴掐断后台正在执行的任务，保持后台自持执行与结果落库
        if (saveCurrentDraft) {
            const assistantDraft = useCreationAssistantStore.getState().draft;
            const hasAssistantData = Boolean(
                assistantDraft.script.trim() ||
                assistantDraft.additionalNotes.trim() ||
                assistantDraft.sourceFileIds.length ||
                assistantDraft.fileSummaries.length ||
                assistantDraft.insightSections.some((s) => s.items.length)
            );
            const hasWorkbenchData = Boolean(
                draft.prompt.trim() ||
                draft.references.length ||
                draft.videoReferences.length ||
                draft.audioReferences.length ||
                draft.textReferences.length ||
                draft.creationPlan
            );

            const isCompletedLog = previewLog && (previewLog.status === "success" || previewLog.status === "failed");
            const hasModifiedFromCompleted = isCompletedLog && (
                draft.prompt.trim() !== (previewLog.prompt || "").trim() ||
                draft.references.length !== (previewLog.references?.length || 0) ||
                draft.videoReferences.length !== (previewLog.videoReferences?.length || 0) ||
                draft.audioReferences.length !== (previewLog.audioReferences?.length || 0) ||
                draft.textReferences.length !== (previewLog.textReferences?.length || 0)
            );

            if ((hasAssistantData || hasWorkbenchData) && (!isCompletedLog || hasModifiedFromCompleted)) {
                const draftLog = buildDraftLog();
                await saveLog(draftLog, false);
                message.info("当前会话草稿与创作助手内容已自动保存至历史记录");
            }
        }

        sessionExplicitlyResetRef.current = true;
        resetDraft();
        useCreationAssistantStore.getState().reset();
        setPreviewReferenceId(null);
        setResults([]);
        setElapsedMs(0);
        setStartedAt(0);
        setSelectedLogIds([]);
        setPreviewLog(null);
        setSegmentProgress(null);
    };

    const deleteSelectedLogs = () => {
        const idsToDelete = [...selectedLogIds];
        const selectedLogs = logs.filter((log) => selectedLogIds.includes(log.id));
        const mediaKeys = new Set<string>();
        selectedLogs.forEach((log) => {
            collectMediaStorageKeys(log, mediaKeys);
        });

        void Promise.all([
            deleteStoredMedia(mediaKeys),
            ...selectedLogIds.map((id) => logStore.removeItem(id)),
        ]).then(async () => {
            await refreshLogs();
        });
        void batchDeleteGenerationLogsFromRemote(idsToDelete);
        if (previewLog && selectedLogIds.includes(previewLog.id)) {
            setPreviewLog(null);
            setResults([]);
        }
        setSelectedLogIds([]);
        setDeleteConfirmOpen(false);
    };

    const previewGenerationLog = async (log: GenerationLog) => {
        sessionExplicitlyResetRef.current = false;
        // 不要粗暴掐断后台正在执行的任务，保持后台自持执行与结果落库
        setPreviewLog(log);
        activeSegmentLogRef.current = log;
        setLogsOpen(false);
        // 回到最终提示词输入状态页面，退出当前工作流卡片模式与编导模式
        selectSkill(null);
        exitDirectorMode();
        prevVideoSkillIdRef.current = null;
        const restoredModel = resolveModelForCapability(effectiveConfig, log.config.videoModel || log.model || draft.model, "video");
        updateDraft({
            sessionId: log.sessionId || log.id,
            prompt: log.prompt,
            references: log.references || [],
            videoReferences: log.videoReferences || [],
            audioReferences: log.audioReferences || [],
            textReferences: log.textReferences || [],
            referenceOrder: log.referenceOrder || [],
            model: restoredModel,
            aspectRatio: log.config.size || draft.aspectRatio,
            resolution: log.config.vquality || draft.resolution,
            durationSec: log.creationPlan?.targetDurationSec || Number(log.config.videoSeconds || draft.durationSec) || draft.durationSec,
            creationPlan: log.creationPlan,
        });
        updateConfig("videoModel", restoredModel);
        if (log.config.size) updateConfig("size", log.config.size);
        if (log.config.vquality) updateConfig("vquality", log.config.vquality);
        if (log.config.videoSeconds) updateConfig("videoSeconds", log.config.videoSeconds);
        if (log.config.videoGenerateAudio) updateConfig("videoGenerateAudio", log.config.videoGenerateAudio);
        if (log.config.videoWatermark) updateConfig("videoWatermark", log.config.videoWatermark);
        if (log.creationAssistant) useCreationAssistantStore.getState().replaceDraft(log.creationAssistant);
        else useCreationAssistantStore.getState().replaceDraft({ ...defaultCreationAssistantDraft, sourceFileIds: buildSourceFileSignatures({ ...draft, references: log.references || [], videoReferences: log.videoReferences || [], audioReferences: log.audioReferences || [], referenceOrder: log.referenceOrder || [] }) });
        const displayResults = deriveGenerationResultsFromLog(log);
        setResults(displayResults);
    };

    const buildRequestSnapshot = () => {
        const resolvedText = appendTextReferenceContext(prompt.trim(), textReferences);
        if (!resolvedText.trim() && !references.length && !videoReferences.length && !audioReferences.length) {
            message.error(t("videoWorkbench.promptRequired"));
            return null;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog();
            return null;
        }
        const videoReferenceError = seedanceVideoReferenceError(videoReferences);
        if (videoReferenceError) {
            message.error(videoReferenceError || seedanceVideoReferenceHint);
            return null;
        }
        return {
            text: resolvedText,
            model,
            requestText: resolvedText,
            config: buildVideoConfig({ ...effectiveConfig, size: draft.aspectRatio, vquality: draft.resolution, videoSeconds: String(draft.durationSec) }, model),
            references: [...references],
            videoReferences: [...videoReferences],
            audioReferences: [...audioReferences],
            textReferences: [...textReferences],
            referenceOrder: [...referenceOrder],
            sessionId: draft.sessionId,
            durationSec: draft.durationSec,
            aspectRatio: draft.aspectRatio,
            resolution: draft.resolution,
            creationPlan: draft.creationPlan,
            creationAssistant: structuredClone(useCreationAssistantStore.getState().draft),
        };
    };

    const retryResult = async () => {
        const resumeLog = (activeSegmentLogRef.current && ["failed", "cancelled"].includes(activeSegmentLogRef.current.segmentBatch?.status || ""))
            ? activeSegmentLogRef.current
            : (previewLog && ["failed", "cancelled"].includes(previewLog.segmentBatch?.status || ""))
            ? previewLog
            : undefined;
        await generate(resumeLog || undefined);
    };

    const retrySegment = async (segmentId: string) => {
        const currentLog = activeSegmentLogRef.current || previewLog;
        if (!currentLog?.segmentBatch || !currentLog.creationPlan) return;
        const nextOutputs = (currentLog.segmentBatch.handoff.segments || []).filter((s) => s.segmentId !== segmentId);
        const nextTasks = (currentLog.segmentBatch.tasks || []).filter((t) => t.segmentId !== segmentId);
        const resumeLog: GenerationLog = {
            ...currentLog,
            status: "pending",
            segmentBatch: {
                ...currentLog.segmentBatch,
                status: "pending",
                handoff: {
                    ...currentLog.segmentBatch.handoff,
                    segments: nextOutputs,
                },
                tasks: nextTasks,
            },
        };
        await generate(resumeLog);
    };

    const sendVideoToCanvas = async (video: GeneratedVideo) => {
        try {
            addAsset({
                kind: "video",
                title: video.label || `视频作品 #${Date.now().toString().slice(-4)}`,
                coverUrl: video.url,
                tags: [],
                source: t("videoWorkbench.source"),
                data: { url: video.url, storageKey: video.storageKey, width: video.width, height: video.height, bytes: video.bytes, mimeType: video.mimeType },
                metadata: { source: "video-page", prompt },
            });
            const canvasStore = useCanvasStore.getState();
            let activeProject = canvasStore.projects[0];
            if (!activeProject) {
                const newId = canvasStore.createProject("生视频作品");
                activeProject = canvasStore.projects.find((p) => p.id === newId) || canvasStore.projects[0];
            }
            if (activeProject) {
                const videoNodeId = nanoid();
                const existingNodes = activeProject.nodes || [];
                const maxX = existingNodes.reduce((max, n) => Math.max(max, n.position.x + n.width), 0);
                const newNode = {
                    id: videoNodeId,
                    type: CanvasNodeType.Video,
                    title: video.label || "生成视频",
                    position: { x: maxX ? maxX + 60 : 100, y: 100 },
                    width: Math.min(video.width || 720, 720),
                    height: Math.min(video.height || 405, 405),
                    status: "success" as const,
                    metadata: {
                        content: video.url,
                        storageKey: video.storageKey,
                        prompt,
                        durationMs: video.durationMs,
                    },
                };
                canvasStore.updateProject(activeProject.id, {
                    nodes: [...existingNodes, newNode as any],
                });
            }
            message.success("已成功载入画布！可在无限画布中自由排布与连接编导");
        } catch (err) {
            console.error("载入画布失败:", err);
            message.error("载入画布失败，请重试");
        }
    };

    const resolveRecheckContext = (result: GenerationResult) => {
        const targetLog = previewLog?.id === result.id || `${previewLog?.id}-failed` === result.id
            ? previewLog
            : logs.find((l) => l.id === result.id || `${l.id}-failed` === result.id) || previewLog;
        const task = result.task || targetLog?.task || targetLog?.segmentBatch?.tasks?.find((t) => t.task && t.status !== "success")?.task || targetLog?.segmentBatch?.tasks?.find((t) => t.task)?.task;
        const canRecheck = Boolean(
            task ||
            targetLog?.task ||
            targetLog?.segmentBatch?.tasks?.some((t) => t.task)
        );
        const isRechecking = Boolean(
            recheckingLogId && (
                recheckingLogId === result.id ||
                recheckingLogId === targetLog?.id ||
                `${recheckingLogId}-failed` === result.id ||
                (task && recheckingLogId === task.id)
            )
        );
        const failureCount = result.failureCount || targetLog?.failureCount;
        return { targetLog, task, canRecheck, isRechecking, failureCount };
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-[#f5f5f7] text-stone-900 dark:bg-[#000000] dark:text-stone-100">
            <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[300px_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="thin-scrollbar hidden min-h-0 overflow-y-auto rounded-2xl border border-black/[0.06] bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] dark:border-white/[0.08] dark:bg-[#1c1c1e] lg:block">
                    <LogPanel logs={logs} selectedLogIds={selectedLogIds} activeLogId={previewLog?.id} recheckingLogId={recheckingLogId} onSelectedLogIdsChange={setSelectedLogIds} onCreateSession={() => void createSession()} onDeleteSelected={() => setDeleteConfirmOpen(true)} onPreviewLog={previewGenerationLog} onRecheckLog={(log) => void handleRecheck(log.task || log.segmentBatch?.tasks?.find((t) => t.task)?.task, log)} />
                </aside>

                <section className="grid gap-3 lg:min-h-0 lg:overflow-hidden lg:grid-cols-[minmax(480px,680px)_minmax(0,1fr)] xl:grid-cols-[720px_minmax(0,1fr)] 2xl:grid-cols-[760px_minmax(0,1fr)]">
                    <div className="thin-scrollbar flex flex-col rounded-2xl border border-black/[0.06] bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] dark:border-white/[0.08] dark:bg-[#1c1c1e] lg:min-h-0 lg:overflow-y-auto">
                        <div className="relative">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <VideoSkillHeaderSelector
                                        skill={activeSkill}
                                        onOpenPicker={() => setVideoSkillPickerOpen((prev) => !prev)}
                                        onNewSession={() => void createSession()}
                                    />
                                </div>
                                <div className="flex shrink-0 gap-2 lg:hidden">
                                    <Button icon={<History className="size-4" />} onClick={() => { setLogsOpen(true); void refreshLogs(false, true); }}>
                                        {t("workbench.logs")}
                                    </Button>
                                    <Button icon={<SlidersHorizontal className="size-4" />} onClick={() => setSettingsOpen(true)}>
                                        {t("workbench.settings")}
                                    </Button>
                                </div>
                            </div>
                            <VideoSkillPickerPopover
                                open={videoSkillPickerOpen}
                                onClose={() => setVideoSkillPickerOpen(false)}
                                activeSkillId={activeSkillId}
                                onSelectSkill={(id) => {
                                    selectSkill(id);
                                    setVideoSkillPickerOpen(false);
                                }}
                            />
                        </div>

                        {isDirectorMode && activeSkillId !== "reference-replication" ? (
                            <div className="mt-5 flex min-h-0 flex-1 flex-col">
                                <DirectorAssistantPanel
                                    skill={activeSkill}
                                    onExitDirector={exitDirectorMode}
                                    onApplyScript={(script, meta) => {
                                        setPrompt(script);
                                        if (meta?.images && meta.images.length > 0) {
                                            setReferences(meta.images);
                                        }
                                        if (meta?.audios && meta.audios.length > 0) {
                                            setAudioReferences(meta.audios);
                                        }
                                        if (meta?.durationSec) {
                                            updateDraft({ durationSec: meta.durationSec });
                                        }
                                        exitDirectorMode();
                                        message.success("脚本已应用");
                                    }}
                                    initialImages={references}
                                    initialAudios={audioReferences}
                                    textReferences={textReferences}
                                    onRemoveTextReference={(id) => {
                                        updateDraft((value) => ({
                                            ...value,
                                            textReferences: value.textReferences.filter((d) => d.id !== id),
                                        }));
                                    }}
                                    onOpenAssetPicker={() => setAssetPickerOpen(true)}
                                    onOpenPromptDialog={() => { setPromptDialogMode("select"); setPromptDialogOpen(true); }}
                                    onSavePromptDialog={() => { setPromptDialogMode("save"); setPromptDialogOpen(true); }}
                                    onAddFromClipboard={() => void addReferencesFromClipboard()}
                                    model={model}
                                />
                            </div>
                        ) : (
                        <div className="mt-5 flex min-h-0 flex-1 flex-col gap-5">
                            {activeSkillId === "reference-replication" ? (
                                <ReferenceReplicationPanel
                                    skill={activeSkill}
                                    onExit={() => selectSkill(null)}
                                    prompt={prompt}
                                    onPromptChange={setPrompt}
                                    onApply={(appliedPrompt, meta) => {
                                        const nextImages = meta?.images || [];
                                        const rawVideos = meta?.videos || [];
                                        const nextAudios = meta?.audios || [];

                                        // 防御性契约：Seedance-2.0 限制单个参考视频需在 2-15s 之间
                                        // 若视频时长大于 15s，提示用户并做平滑降级（不强塞入 videoReferences 避免 400 校验阻断）
                                        const validVideos: ReferenceVideo[] = [];
                                        let hasOverlongVideo = false;
                                        for (const v of rawVideos) {
                                            if (v.durationMs && v.durationMs > 15000) {
                                                hasOverlongVideo = true;
                                            } else {
                                                validVideos.push(v);
                                            }
                                        }

                                        let finalPrompt = appliedPrompt;
                                        if (hasOverlongVideo && validVideos.length === 0) {
                                            finalPrompt = finalPrompt.replace(/【基于@视频1参考复刻与映射】/g, "【基于参考分镜复刻与映射】").replace(/@视频1/g, "原片参考分镜");
                                            message.warning("参考视频时长大于 15 秒（超出 Seedance 动作参考上限），已自动转换为高质量分镜提示词引导");
                                        }

                                        const newOrders: ReferenceOrderItem[] = [
                                            ...nextImages.map((img) => ({ id: img.id, kind: "image" as const })),
                                            ...validVideos.map((vid) => ({ id: vid.id, kind: "video" as const })),
                                            ...nextAudios.map((aud) => ({ id: aud.id, kind: "audio" as const })),
                                        ];

                                        updateDraft((current) => ({
                                            ...current,
                                            prompt: finalPrompt,
                                            references: nextImages,
                                            videoReferences: validVideos,
                                            audioReferences: nextAudios,
                                            referenceOrder: newOrders,
                                            durationSec: meta?.durationSec || current.durationSec,
                                        }));
                                        if (!(meta as any)?.silent) {
                                            message.success("复刻提示词已成功回填，请调节参数后点击下方生成视频");
                                        }
                                    }}
                                    initialImages={references}
                                    initialAudios={audioReferences}
                                    initialVideos={videoReferences}
                                    textReferences={textReferences}
                                    targetModel={model}
                                    onOpenPromptDialog={() => {
                                        setPromptDialogMode("select");
                                        setPromptDialogOpen(true);
                                    }}
                                    onSavePromptDialog={() => {
                                        setPromptDialogMode("save");
                                        setPromptDialogOpen(true);
                                    }}
                                    onOpenAssetPicker={() => setAssetPickerOpen(true)}
                                    onAddFromClipboard={() => void addReferencesFromClipboard()}
                                />
                            ) : (
                                <>
                            <div className="relative min-w-0 shrink-0">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <span className="text-xs font-medium text-stone-500 dark:text-stone-400">{referenceCount} / 15</span>
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
                                        {referenceItems.length > 0 && (
                                            <Tooltip title="清空素材" mouseEnterDelay={0.2}>
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    className="!h-7 !w-7 !p-0 !text-stone-400 hover:!text-red-500 dark:hover:!text-red-400"
                                                    icon={<Trash2 className="size-3.5" />}
                                                    onClick={() => {
                                                        updateDraft({
                                                            references: [],
                                                            videoReferences: [],
                                                            audioReferences: [],
                                                            referenceOrder: [],
                                                        });
                                                        setPreviewReferenceId(null);
                                                    }}
                                                />
                                            </Tooltip>
                                        )}
                                    </div>
                                </div>
                                <div
                                    className={`hover-scrollbar hover-scrollbar-hint min-w-0 overflow-x-auto rounded-xl border border-dashed p-2.5 transition-colors ${referenceDragTarget ? "border-amber-500 bg-amber-50/50 dark:border-amber-400 dark:bg-amber-950/20" : "border-stone-200 dark:border-stone-800"}`}
                                    onDragEnter={handleReferenceDragEnter}
                                    onDragOver={(event) => {
                                        event.preventDefault();
                                        event.dataTransfer.dropEffect = "copy";
                                    }}
                                    onDragLeave={handleReferenceDragLeave}
                                    onDrop={handleReferenceDrop}
                                >
                                    {!referenceItems.length ? (
                                        <div className="flex min-w-max items-start gap-2">
                                            <UploadSlot icon={<ImagePlus className="size-5" />} label={t("videoWorkbench.addProduct")} onClick={() => openFilePicker("product")} />
                                            <UploadDivider />
                                            <UploadSlot icon={<ImagePlus className="size-5" />} label={t("videoWorkbench.addModel")} onClick={() => openFilePicker("model")} />
                                            <UploadDivider />
                                            <UploadSlot icon={<ImagePlus className="size-5" />} label={t("videoWorkbench.addScene")} onClick={() => openFilePicker("scene")} />
                                            <UploadDivider />
                                            <UploadSlot icon={<Music2 className="size-5" />} label={t("videoWorkbench.addAudio")} onClick={() => openFilePicker("audio")} />
                                            <UploadSlot compact icon={<Plus className="size-5" />} label={t("videoWorkbench.addReference")} onClick={() => openFilePicker("all")} />
                                        </div>
                                    ) : (
                                        <div className="flex min-w-max items-center gap-2">
                                            {referenceItems.map((item, index) => (
                                                <ReferenceTile
                                                    key={item.id}
                                                    item={item}
                                                    index={index}
                                                    active={previewReferenceId === item.id}
                                                    onPreview={() => setPreviewReferenceId(item.id)}
                                                    onLeave={() => setPreviewReferenceId(null)}
                                                    onReplace={() => openFilePicker(item.kind === "audio" ? "audio" : item.kind === "video" ? "scene" : "product", item)}
                                                    onRemove={() => void removeReference(item)}
                                                    replaceLabel={t("videoWorkbench.replaceFile")}
                                                    removeLabel={t("videoWorkbench.deleteFile")}
                                                />
                                            ))}
                                            <UploadSlot compact icon={<Plus className="size-5" />} label={t("videoWorkbench.addReference")} onClick={() => openFilePicker("all")} />
                                        </div>
                                    )}
                                </div>
                                {previewReference ? <ReferencePreview item={previewReference} /> : null}
                            </div>

                            <div className="flex min-h-0 flex-1 flex-col">
                                <div className="flex h-full min-h-0 flex-col">
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
                                    <div className="relative flex-1 min-h-0 flex flex-col rounded-xl border border-black/[0.08] bg-white p-3 dark:border-white/[0.08] dark:bg-[#1c1c1e] focus-within:ring-2 focus-within:ring-amber-500/20 focus-within:border-amber-500/50 transition-all">
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
                                                                const label1 = `@文档${idx + 1}`;
                                                                const label2 = `@文本${idx + 1}`;
                                                                updateDraft((value) => ({
                                                                    ...value,
                                                                    textReferences: value.textReferences.filter((d) => d.id !== doc.id),
                                                                    prompt: value.prompt.split(label1).join("").split(label2).join("").trim(),
                                                                }));
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
                                        <div className="relative flex-1 min-h-0 flex flex-col">
                                            <CanvasPromptChipInput
                                                value={prompt}
                                                references={promptMentionReferences}
                                                onChange={setPrompt}
                                                showReferenceLabels
                                                className="flex-1 min-h-[140px] !border-0 !p-0 !shadow-none !bg-transparent focus:!shadow-none !text-sm leading-6"
                                                placeholder=""
                                            />
                                            {!prompt ? (
                                                <div className="pointer-events-none absolute left-0 top-0.5 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-2 text-sm text-stone-400 dark:text-stone-500">
                                                    <span className="truncate">{textReferences.length > 0 ? "可输入额外指令或提示词（已关联上方参考文本）..." : (activeSkill?.placeholder || t("videoWorkbench.promptPlaceholder"))}</span>
                                                    <button
                                                        type="button"
                                                        disabled={submitting}
                                                        onClick={openCreationAssistant}
                                                        className="pointer-events-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-indigo-200/80 bg-gradient-to-r from-indigo-50/90 via-purple-50/80 to-pink-50/80 px-2.5 py-0.5 text-xs font-medium text-indigo-700 shadow-[0_1px_3px_rgba(99,102,241,0.12)] backdrop-blur-sm transition-all hover:border-indigo-300 hover:from-indigo-100/90 hover:shadow-[0_2px_8px_rgba(99,102,241,0.2)] active:scale-95 disabled:opacity-50 dark:border-indigo-500/30 dark:from-indigo-950/50 dark:via-purple-950/40 dark:to-pink-950/40 dark:text-indigo-300 dark:hover:border-indigo-400/50 cursor-pointer"
                                                    >
                                                        <Sparkles className="size-3.5 text-indigo-500 dark:text-indigo-400" />
                                                        <span>{t("videoWorkbench.writeForMe")}</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={submitting}
                                                        onClick={enterDirectorMode}
                                                        className="pointer-events-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-500/30 bg-gradient-to-r from-amber-50/90 to-orange-50/80 px-2.5 py-0.5 text-xs font-medium text-amber-700 shadow-[0_1px_3px_rgba(245,158,11,0.12)] backdrop-blur-sm transition-all hover:border-amber-400 hover:from-amber-100/90 hover:text-amber-800 active:scale-95 disabled:opacity-50 dark:border-amber-500/30 dark:from-amber-950/50 dark:to-orange-950/40 dark:text-amber-300 cursor-pointer"
                                                    >
                                                        <Sparkles className="size-3.5 text-amber-500 dark:text-amber-400" />
                                                        <span>✨ 编导助手</span>
                                                    </button>
                                                </div>
                                            ) : null}
                                        </div>
                                        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-stone-400 pt-1 border-t border-black/[0.04] dark:border-white/[0.04]">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    disabled={submitting}
                                                    onClick={openCreationAssistant}
                                                    className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200/80 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 px-3 py-1 text-xs font-semibold text-indigo-600 shadow-[0_1px_4px_rgba(99,102,241,0.15)] backdrop-blur-md transition-all hover:border-indigo-400 hover:from-indigo-500/20 hover:via-purple-500/20 hover:to-pink-500/20 hover:text-indigo-700 hover:shadow-[0_2px_10px_rgba(99,102,241,0.25)] active:scale-95 disabled:opacity-50 dark:border-indigo-400/30 dark:from-indigo-500/15 dark:via-purple-500/15 dark:to-pink-500/15 dark:text-indigo-300 dark:hover:border-indigo-400/60 dark:hover:text-indigo-200 cursor-pointer"
                                                >
                                                    <Sparkles className="size-3.5 text-indigo-500 dark:text-indigo-400" />
                                                    <span>{t("videoWorkbench.writeForMe")}</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={submitting}
                                                    onClick={enterDirectorMode}
                                                    className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-orange-500/10 px-3 py-1 text-xs font-semibold text-amber-700 shadow-[0_1px_4px_rgba(245,158,11,0.15)] backdrop-blur-md transition-all hover:border-amber-400 hover:from-amber-500/20 hover:to-orange-500/20 hover:text-amber-800 active:scale-95 disabled:opacity-50 dark:border-amber-400/30 dark:from-amber-500/15 dark:to-orange-500/15 dark:text-amber-300 cursor-pointer"
                                                >
                                                    <Sparkles className="size-3.5 text-amber-500 dark:text-amber-400" />
                                                    <span>✨ 编导助手</span>
                                                </button>
                                            </div>
                                            <span>{prompt.length} / 10000</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                                </>
                            )}

                            <div className="flex items-center justify-between rounded-xl border border-black/[0.06] bg-stone-50/70 px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-[#2c2c2e] sm:hidden">
                                <span className="truncate text-stone-500 dark:text-stone-400">
                                    {modelOptionLabel(effectiveConfig, model) || modelOptionName(model) || model} · {draft.resolution} · {draft.aspectRatio} · {draft.durationSec}s
                                </span>
                                <Button size="small" type="text" icon={<SlidersHorizontal className="size-4" />} onClick={() => setSettingsOpen(true)}>
                                    {t("workbench.adjust")}
                                </Button>
                            </div>

                            <div className="hidden shrink-0 sm:block w-full">
                                <GenerationSettings
                                    config={effectiveConfig}
                                    model={model}
                                    requirements={modelRequirements}
                                    aspectRatio={draft.aspectRatio}
                                    resolution={draft.resolution}
                                    durationSec={draft.durationSec}
                                    onModelChange={(value) => {
                                        updateConfig("videoModel", value);
                                        const profile = modelCapabilityConfigFor(effectiveConfig, value).video;
                                        updateDraft({
                                            model: value,
                                            aspectRatio: profile?.ratios?.[0] || draft.aspectRatio || "9:16",
                                            resolution: profile?.resolutions?.[0] || draft.resolution || "720p",
                                            durationSec: clampDurationToChannelVideoModel(effectiveConfig, value, draft.durationSec),
                                        });
                                    }}
                                    onAspectRatioChange={(value) => updateDraft({ aspectRatio: value as any })}
                                    onResolutionChange={(value) => updateDraft({ resolution: value as any })}
                                    onDurationChange={(value) => updateDraft({ durationSec: value })}
                                    onConfigChange={(key, value) => updateConfig(key, value)}
                                />
                            </div>

                            <div className="mt-auto pt-4 shrink-0 w-full">
                                <div className="flex items-center justify-between mb-2 px-1">
                                    <span className="text-xs text-stone-500 dark:text-stone-400">单次预计消耗</span>
                                    <FeatureCreditBadge scene="video_workbench" model={model} size="small" />
                                </div>
                                <Button
                                    type="primary"
                                    size="large"
                                    block
                                    className="!h-11 !rounded-full !border-0 !text-white font-medium shadow-[0_2px_12px_rgba(245,158,11,0.25)] hover:!opacity-95 active:scale-[0.99] transition-all duration-200 !bg-gradient-to-r !from-amber-500 !to-amber-600 disabled:!opacity-50 disabled:!pointer-events-none disabled:!shadow-none"
                                    icon={
                                        isUploading || submitting ? (
                                            <LoaderCircle className="size-4 animate-spin" />
                                        ) : (
                                            <Sparkles className="size-4" />
                                        )
                                    }
                                    loading={submitting}
                                    disabled={!canGenerate || submitting || isUploading || hasUploadError}
                                    onClick={() => void generate()}
                                >
                                    {isUploading
                                        ? "素材同步中..."
                                        : hasUploadError
                                          ? "存在未就绪素材"
                                          : submitting
                                            ? "正在提交任务..."
                                            : t("videoWorkbench.generateNow")}
                                </Button>
                            </div>
                        </div>
                        )}
                    </div>

                    <div className="thin-scrollbar rounded-2xl border border-black/[0.06] bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] dark:border-white/[0.08] dark:bg-[#1c1c1e] lg:min-h-0 lg:overflow-y-auto lg:p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <h2 className="text-xl font-semibold">{t("workbench.results")}</h2>
                            {isCurrentSessionPending ? <Tag className="m-0 px-2 py-1">{t("workbench.waiting", { time: formatDuration(elapsedMs) })}</Tag> : null}
                        </div>
                        {segmentProgress ? (
                            <div className="mb-4 rounded-xl border border-black/[0.06] bg-stone-50/80 px-3 py-2 text-xs text-stone-600 dark:border-white/[0.08] dark:bg-[#2c2c2e] dark:text-stone-300">
                                <div className="flex items-center justify-between gap-3"><span>{segmentProgress.message}</span><span>{segmentProgress.completedCount}/{segmentProgress.totalCount}</span></div>
                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700"><div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${segmentProgress.totalCount ? Math.round((segmentProgress.completedCount / segmentProgress.totalCount) * 100) : 0}%` }} /></div>
                            </div>
                        ) : null}
                        {results.length ? (
                            <div className="grid gap-4">
                                {results.map((result) => (
                                    result.status === "success" && result.video ? (
                                        <ResultVideoCard
                                            key={result.id}
                                            video={result.video}
                                            onDownload={downloadVideo}
                                            onSaveAsset={saveResultToAssets}
                                            onSendToCanvas={sendVideoToCanvas}
                                            onRetrySegment={retrySegment}
                                            segmentId={result.id.startsWith("segment-") ? result.id : undefined}
                                        />
                                    ) : result.status === "failed" ? (
                                        <FailedVideoCard
                                            key={result.id}
                                            error={result.error || t("workbench.generationFailed")}
                                            onRetry={retryResult}
                                            canRecheck={resolveRecheckContext(result).canRecheck}
                                            onRecheck={() => {
                                                const { task, targetLog } = resolveRecheckContext(result);
                                                void handleRecheck(task, targetLog);
                                            }}
                                            isRechecking={resolveRecheckContext(result).isRechecking}
                                            failureCount={resolveRecheckContext(result).failureCount}
                                        />
                                    ) : (
                                        <PendingVideoCard key={result.id} />
                                    )
                                ))}
                            </div>
                        ) : (
                            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200 text-center dark:border-stone-800 lg:min-h-[560px]">
                                <EmptyState size="compact" icon={VideoIcon} description={t("videoWorkbench.empty")} />
                            </div>
                        )}
                    </div>
                </section>
            </main>
            <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                    const replaceTarget = replaceTargetRef.current;
                    replaceTargetRef.current = null;
                    if (replaceTarget) void replaceReference(replaceTarget, event.target.files?.[0]);
                    else void addReferences(event.target.files, uploadTargetRef.current);
                    event.target.value = "";
                }}
            />
            <Drawer title={t("workbench.logs")} placement="bottom" size="large" open={logsOpen} onClose={() => setLogsOpen(false)}>
                <LogPanel logs={logs} selectedLogIds={selectedLogIds} activeLogId={previewLog?.id} recheckingLogId={recheckingLogId} onSelectedLogIdsChange={setSelectedLogIds} onCreateSession={() => void createSession()} onDeleteSelected={() => setDeleteConfirmOpen(true)} onPreviewLog={previewGenerationLog} onRecheckLog={(log) => void handleRecheck(log.task, log)} />
            </Drawer>
            <Drawer title={t("workbench.settings")} placement="bottom" size="large" open={settingsOpen} onClose={() => setSettingsOpen(false)}>
                <div className="flex flex-col gap-3 pb-4">
                    <GenerationSettings
                        config={effectiveConfig}
                        model={model}
                        requirements={modelRequirements}
                        aspectRatio={draft.aspectRatio}
                        resolution={draft.resolution}
                        durationSec={draft.durationSec}
                        onModelChange={(value) => {
                            updateConfig("videoModel", value);
                            const profile = modelCapabilityConfigFor(effectiveConfig, value).video;
                            updateDraft({
                                model: value,
                                aspectRatio: profile?.ratios?.[0] || draft.aspectRatio || "9:16",
                                resolution: profile?.resolutions?.[0] || draft.resolution || "720p",
                                durationSec: clampDurationToChannelVideoModel(effectiveConfig, value, draft.durationSec),
                            });
                        }}
                        onAspectRatioChange={(value) => updateDraft({ aspectRatio: value as any })}
                        onResolutionChange={(value) => updateDraft({ resolution: value as any })}
                        onDurationChange={(value) => updateDraft({ durationSec: value })}
                        onConfigChange={(key, value) => updateConfig(key, value)}
                    />
                </div>
            </Drawer>
            <PromptTemplateModal
                open={promptDialogOpen}
                onOpenChange={setPromptDialogOpen}
                defaultKind="video"
                initialMode={promptDialogMode}
                prefillContent={draft.prompt}
                onSelect={(text) => {
                    const prev = (draft.prompt || "").trim();
                    setPrompt(prev ? `${prev}\n\n${text}` : text);
                }}
            />
            <AssetPickerModal open={assetPickerOpen} onInsert={(payload) => void insertPickedAsset(payload)} onClose={() => setAssetPickerOpen(false)} />
            <Modal title={t("workbench.deleteLogs")} open={deleteConfirmOpen} onCancel={() => setDeleteConfirmOpen(false)} onOk={deleteSelectedLogs} okText={t("common.delete")} okButtonProps={{ danger: true }} cancelText={t("common.cancel")}>
                {t("workbench.deleteLogsConfirm", { count: selectedLogIds.length })}
            </Modal>
        </div>
    );
}

function UploadSlot({ icon, label, onClick, compact = false, disabled = false, tooltip }: { icon: ReactNode; label: string; onClick: () => void; compact?: boolean; disabled?: boolean; tooltip?: string }) {
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
    item: ReferencePreviewItem;
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
            {item.kind === "image" ? (
                <div className="relative size-full overflow-hidden rounded-xl">
                    <CachedResourceImage
                        storageKey={item.storageKey}
                        src={item.dataUrl || item.url}
                        alt={item.name}
                        className="size-full object-cover block"
                        loadingFallback={<div className="size-full animate-pulse rounded-xl bg-stone-200 dark:bg-stone-700" />}
                        fallback={<div className="grid size-full place-items-center rounded-xl bg-stone-200 text-stone-400 text-xs dark:bg-stone-700">图片</div>}
                    />
                </div>
            ) : item.kind === "video" ? (
                <VideoSlotThumbnail item={item} />
            ) : (
                <div className="relative flex size-full flex-col items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-300">
                    <Music2 className="size-5" />
                    {item.durationMs ? (
                        <span className="mt-0.5 text-[9px] font-mono opacity-80">
                            {formatDuration(item.durationMs)}
                        </span>
                    ) : null}
                </div>
            )}

            <span className="absolute left-1 top-1 z-5 grid size-5 place-items-center rounded-full bg-black/65 text-[10px] font-semibold text-white">
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

function VideoSlotThumbnail({ item }: { item: ReferencePreviewItem }) {
    const [localPoster, setLocalPoster] = useState<string>("");

    useEffect(() => {
        if (item.posterUrl || item.posterStorageKey || !item.url) return;
        let cancelled = false;
        let createdUrl = "";
        void captureVideoPoster(item.url)
            .then((res) => {
                if (!cancelled && res?.poster) {
                    createdUrl = URL.createObjectURL(res.poster);
                    setLocalPoster(createdUrl);
                }
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
            if (createdUrl) {
                URL.revokeObjectURL(createdUrl);
            }
        };
    }, [item.posterStorageKey, item.posterUrl, item.url]);

    const posterSrc = item.posterUrl || localPoster || (item.url?.startsWith("data:image") ? item.url : undefined);

    return (
        <div className="relative size-full overflow-hidden rounded-xl bg-stone-900">
            <CachedResourceImage
                storageKey={item.posterStorageKey}
                src={posterSrc}
                alt={item.name}
                className="size-full object-cover block"
                loadingFallback={<div className="size-full animate-pulse bg-stone-800" />}
                fallback={
                    <div className="grid size-full place-items-center bg-stone-800 text-stone-400">
                        <Film className="size-5" />
                    </div>
                }
            />
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
                <div className="grid size-5 place-items-center rounded-full bg-black/60 text-white shadow-xs">
                    <Play className="size-2.5 fill-white ml-0.5" />
                </div>
            </div>
            {item.durationMs ? (
                <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.2 text-[9px] font-mono text-white/90 pointer-events-none">
                    {formatDuration(item.durationMs)}
                </span>
            ) : null}
        </div>
    );
}

function ReferencePreview({ item }: { item: ReferencePreviewItem }) {
    const directImageUrl = item.dataUrl || item.url || (item.storageKey ? resolveResourceUrl(item.storageKey) : "");
    const directVideoUrl = item.url || (item.storageKey ? resolveResourceUrl(item.storageKey) : "");
    const videoPosterUrl = item.posterUrl || (item.posterStorageKey ? resolveResourceUrl(item.posterStorageKey) : undefined);
    return (
        <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-max max-w-[min(90vw,36rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-black/[0.08] bg-white/95 p-2 shadow-2xl backdrop-blur-xl dark:border-white/[0.1] dark:bg-[#1c1c1e]/95">
            {item.kind === "image" ? (
                <img
                    src={directImageUrl}
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
            ) : item.kind === "video" ? (
                <video
                    src={directVideoUrl}
                    poster={videoPosterUrl}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="block h-auto w-auto max-h-[min(70vh,36rem)] max-w-[min(90vw,36rem)] rounded-md bg-stone-950 object-contain shadow-sm"
                    onError={(e) => {
                        if (item.storageKey) {
                            const fallback = resolveResourceUrl(item.storageKey);
                            if (fallback && e.currentTarget.src !== fallback) {
                                e.currentTarget.src = fallback;
                            }
                        }
                    }}
                />
            ) : (
                <div className="flex flex-col items-center gap-3 px-3 py-5">
                    <Music2 className="size-8 text-stone-400" />
                    <audio src={item.url} controls className="w-[min(28rem,80vw)]" />
                </div>
            )}
        </div>
    );
}

function GenerationSettings({
    config,
    model,
    requirements,
    aspectRatio,
    resolution,
    durationSec,
    onModelChange,
    onAspectRatioChange,
    onResolutionChange,
    onDurationChange,
    onConfigChange,
}: {
    config: AiConfig;
    model: string;
    requirements?: ModelRequirements;
    aspectRatio: string;
    resolution: string;
    durationSec: number;
    onModelChange: (value: string) => void;
    onAspectRatioChange: (value: string) => void;
    onResolutionChange: (value: string) => void;
    onDurationChange: (value: number) => void;
    onConfigChange?: (key: keyof AiConfig, value: string) => void;
}) {
    const mergedConfig = useMemo(() => ({
        ...config,
        model,
        videoModel: model,
        size: aspectRatio || config.size,
        vquality: resolution || config.vquality,
        videoSeconds: String(durationSec || config.videoSeconds),
    }), [config, model, aspectRatio, resolution, durationSec]);

    const handleVideoSettingChange = (key: keyof AiConfig, value: string) => {
        if (key === "size") onAspectRatioChange(value);
        if (key === "vquality") onResolutionChange(value);
        if (key === "videoSeconds") onDurationChange(Number(value));
        onConfigChange?.(key, value);
    };

    return (
        <div className="relative w-full min-w-0">
            <div className="grid grid-cols-2 gap-2 w-full items-end">
                <div className="flex flex-col min-w-0 w-full">
                    <span className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">{t("workbench.model")}</span>
                    <ModelPicker
                        config={config}
                        value={model}
                        onChange={(nextModel) => {
                            onModelChange(nextModel);
                        }}
                        capability="video"
                        requirements={requirements}
                        fullWidth
                        showSelectedPrice
                        className="!h-[38px] !w-full"
                    />
                </div>
                <div className="min-w-0 w-full flex flex-col">
                    <span className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">{t("workbench.settings")}</span>
                    <CanvasVideoSettingsPopover
                        config={mergedConfig}
                        onConfigChange={handleVideoSettingChange}
                        placement="top"
                        className="w-full flex"
                        buttonClassName="!h-[38px] !w-full !max-w-none !justify-between !rounded-lg !px-3 font-medium text-sm shadow-sm"
                    />
                </div>
            </div>
        </div>
    );
}

function getConfiguredVideoModelOptions(config: AiConfig) {
    const selectable = selectableModelsByCapability(config, "video").filter(Boolean);
    if (selectable.length) {
        return selectable.map((value) => ({ value, label: modelOptionLabel(config, value) || modelDisplayName(config, value) || value }));
    }
    const configuredValues = config.channels.flatMap((channel) => {
        if (channel.modelCosts?.length) {
            return channel.modelCosts.filter((item) => item.capability === "video").map((item) => `${channel.id}::${item.model}`);
        }
        return channel.models.map((modelName) => `${channel.id}::${modelName}`);
    });
    return configuredValues.map((value) => ({ value, label: modelOptionLabel(config, value) || value }));
}

function SelectTrigger({ label, value, open, onClick }: { label: string; value: string; open: boolean; onClick: () => void }) {
    return (
        <div className="flex flex-col min-w-0 w-full">
            <span className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">{label}</span>
            <button
                type="button"
                className="canvas-composer-model-picker !h-[38px] !w-full !rounded-lg !px-3 text-sm font-medium flex items-center justify-between shadow-sm cursor-pointer"
                aria-expanded={open}
                onClick={onClick}
            >
                <span className="truncate">{value}</span>
                <ChevronDown className={`size-4 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
            </button>
        </div>
    );
}

function OptionMenu({ children }: { children: ReactNode }) {
    return <div className="absolute bottom-full left-0 right-0 z-40 mb-2 max-h-[min(70vh,28rem)] overflow-y-auto rounded-2xl border border-black/[0.08] bg-white/95 p-2 shadow-2xl backdrop-blur-xl dark:border-white/[0.1] dark:bg-[#1c1c1e]/95">{children}</div>;
}

function OptionButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
    return <button type="button" className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${selected ? "bg-amber-500/[0.08] text-amber-900 dark:bg-amber-500/[0.15] dark:text-amber-200" : "hover:bg-stone-50/80 dark:hover:bg-white/[0.06] text-stone-700 dark:text-stone-300"}`} onClick={onClick}><span>{children}</span>{selected ? <Check className="size-4 text-amber-600 dark:text-amber-400" /> : null}</button>;
}

function SettingChoiceRow({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string; onChange: (value: string) => void }) {
    return (
        <div className="border-b border-stone-100 py-2.5 last:border-b-0 dark:border-stone-800/80">
            <div className="mb-2 text-xs font-medium text-stone-500 dark:text-stone-400">{label}</div>
            <div className="flex flex-wrap gap-1.5">
                {options.map((option) => (
                    <button
                        key={option}
                        type="button"
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                            value === option
                                ? "border-amber-500/80 bg-amber-500/[0.08] text-amber-900 shadow-sm ring-1 ring-amber-500/20 dark:border-amber-400/70 dark:bg-amber-500/[0.15] dark:text-amber-200"
                                : "border-black/[0.06] bg-white/70 text-stone-600 hover:bg-stone-50 hover:text-stone-900 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-stone-400 dark:hover:bg-white/[0.08] dark:hover:text-stone-200"
                        }`}
                        onClick={() => onChange(option)}
                    >
                        {value === option ? <Check className="size-3 text-amber-600 dark:text-amber-400" /> : null}
                        {option}
                    </button>
                ))}
            </div>
        </div>
    );
}

function DurationSliderRow({ label, value, min, max, disabled, onChange }: { label: string; value: number; min: number; max: number; disabled: boolean; onChange: (value: number) => void }) {
    return (
        <div className="py-2.5">
            <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-medium text-stone-500 dark:text-stone-400">{label}</span>
                <span className="font-semibold text-stone-900 dark:text-stone-100">{value}s</span>
            </div>
            <input type="range" min={min} max={max} step={1} value={value} disabled={disabled} className="h-2 w-full cursor-pointer accent-amber-500 disabled:cursor-default disabled:opacity-50 dark:accent-amber-400" aria-label={label} aria-valuetext={`${value}s`} onChange={(event) => onChange(Number(event.target.value))} />
            <div className="mt-1 flex justify-between text-[11px] text-stone-500 dark:text-stone-400"><span>{min}s</span><span>{max}s</span></div>
        </div>
    );
}

function ResultVideoCard({
    video,
    onDownload,
    onSaveAsset,
    onSendToCanvas,
    onRetrySegment,
    segmentId,
}: {
    video: GeneratedVideo;
    onDownload: (video: GeneratedVideo) => void;
    onSaveAsset: (video: GeneratedVideo) => void;
    onSendToCanvas?: (video: GeneratedVideo) => void;
    onRetrySegment?: (segmentId: string) => void;
    segmentId?: string;
}) {
    const isMerged = video.label?.includes("完整成片");
    const initialSrc = video.url || (video.storageKey ? resolveResourceUrl(video.storageKey) : "");
    const [videoSrc, setVideoSrc] = useState(initialSrc);
    const [loadFailed, setLoadFailed] = useState(false);
    const [triedFallback, setTriedFallback] = useState(false);

    useEffect(() => {
        const nextSrc = video.url || (video.storageKey ? resolveResourceUrl(video.storageKey) : "");
        setVideoSrc(nextSrc);
        setLoadFailed(false);
        setTriedFallback(false);
    }, [video.url, video.storageKey]);

    const handleVideoError = () => {
        if (!triedFallback && video.storageKey) {
            const fallbackUrl = resolveResourceUrl(video.storageKey);
            if (fallbackUrl && fallbackUrl !== videoSrc) {
                setTriedFallback(true);
                setVideoSrc(fallbackUrl);
                return;
            }
        }
        setLoadFailed(true);
    };

    return (
        <div
            className={`overflow-hidden rounded-2xl border transition ${
                isMerged
                    ? "border-amber-500/50 bg-amber-500/[0.03] shadow-[0_4px_16px_rgba(245,158,11,0.12)] ring-1 ring-amber-500/30 dark:border-amber-400/50 dark:bg-amber-500/[0.05]"
                    : "border-black/[0.06] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)] dark:border-white/[0.08] dark:bg-[#1c1c1e]"
            }`}
        >
            <div className="relative">
                {loadFailed ? (
                    <div className="aspect-video w-full flex flex-col items-center justify-center gap-2 bg-stone-900 text-stone-400 p-4 text-center">
                        <AlertCircle className="size-8 text-amber-500/80" />
                        <span className="text-xs">视频加载异常，可能因网络波动或临时链接过期导致</span>
                        <Button
                            size="small"
                            icon={<RefreshCw className="size-3" />}
                            onClick={() => {
                                setLoadFailed(false);
                                setTriedFallback(false);
                                const retryUrl = video.storageKey ? resolveResourceUrl(video.storageKey) : video.url;
                                setVideoSrc(retryUrl);
                            }}
                        >
                            重新加载
                        </Button>
                    </div>
                ) : (
                    <video src={videoSrc} controls preload="none" onError={handleVideoError} className="aspect-video w-full bg-black object-contain" />
                )}
                {isMerged ? (
                    <span className="absolute left-2.5 top-2.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-2.5 py-0.5 text-xs font-semibold text-white shadow-md">
                        完整合成视频
                    </span>
                ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-stone-200 px-3 py-2.5 dark:border-stone-800">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                    {video.label ? <span className="font-medium text-stone-700 dark:text-stone-200">{video.label}</span> : null}
                    <span>
                        {video.width}x{video.height}
                    </span>
                    <span>{formatBytes(video.bytes)}</span>
                    <span>{formatDuration(video.durationMs)}</span>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                    {onSendToCanvas ? (
                        <Button size="small" icon={<Send className="size-3.5" />} onClick={() => onSendToCanvas(video)}>
                            载入画布
                        </Button>
                    ) : null}
                    {segmentId && onRetrySegment ? (
                        <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={() => onRetrySegment(segmentId)}>
                            重生成此段
                        </Button>
                    ) : null}
                    <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => onSaveAsset(video)}>
                        {t("common.addToAssets")}
                    </Button>
                    <Button size="small" icon={<Download className="size-3.5" />} onClick={() => onDownload(video)}>
                        {t("common.download")}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function PendingVideoCard() {
    return (
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-dashed border-stone-200 bg-stone-50/50 dark:border-stone-800 dark:bg-[#1c1c1e]">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-stone-500 dark:text-stone-400">
                <LoaderCircle className="size-6 animate-spin text-amber-500" />
                <span>{t("workbench.generating")}</span>
            </div>
        </div>
    );
}

function FailedVideoCard({
    error,
    onRetry,
    onRecheck,
    canRecheck,
    isRechecking,
    failureCount,
}: {
    error: string;
    onRetry: () => void;
    onRecheck?: () => void;
    canRecheck?: boolean;
    isRechecking?: boolean;
    failureCount?: number;
}) {
    const isRecoverable = error.includes("保存未完成") || error.includes("上传 OSS 失败");
    return (
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-dashed border-red-300 bg-red-50/50 dark:border-red-900/60 dark:bg-red-950/20">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                <AlertCircle className="size-7 text-red-500" />
                <span className="max-w-md text-xs text-red-600 dark:text-red-400">
                    {error}
                    {failureCount && failureCount > 1 ? `（${t("videoWorkbench.failAttempts", { count: failureCount })}）` : ""}
                </span>
                <div className="mt-1 flex items-center gap-2">
                    {canRecheck && onRecheck ? (
                        <Button
                            size="small"
                            type="primary"
                            icon={<RefreshCw className={`size-3.5 ${isRechecking ? "animate-spin" : ""}`} />}
                            loading={isRechecking}
                            onClick={onRecheck}
                            className="!rounded-full"
                        >
                            {isRechecking ? t("videoWorkbench.rechecking") : isRecoverable ? "重新同步作品" : t("videoWorkbench.recheck")}
                        </Button>
                    ) : null}
                    <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={onRetry} className="!rounded-full">
                        {t("workbench.retry")}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function LogPanel({
    logs,
    selectedLogIds,
    activeLogId,
    recheckingLogId,
    onSelectedLogIdsChange,
    onCreateSession,
    onDeleteSelected,
    onPreviewLog,
    onRecheckLog,
}: {
    logs: GenerationLog[];
    selectedLogIds: string[];
    activeLogId?: string;
    recheckingLogId?: string | null;
    onSelectedLogIdsChange: (ids: string[]) => void;
    onCreateSession: () => void;
    onDeleteSelected: () => void;
    onPreviewLog: (log: GenerationLog) => void;
    onRecheckLog?: (log: GenerationLog) => void;
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
                        isRechecking={recheckingLogId === log.id || recheckingLogId === log.task?.id}
                        onSelectedChange={(checked) => onSelectedLogIdsChange(checked ? [...selectedLogIds, log.id] : selectedLogIds.filter((id) => id !== log.id))}
                        onClick={() => onPreviewLog(log)}
                        onRecheck={onRecheckLog ? () => onRecheckLog(log) : undefined}
                    />
                ))}
                {!logs.length ? <div className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-stone-200 text-center text-sm text-stone-400 dark:border-stone-800">{t("workbench.noLogs")}</div> : null}
            </div>
        </>
    );
}

function LogCard({
    log,
    selected,
    active,
    isRechecking,
    onSelectedChange,
    onClick,
    onRecheck,
}: {
    log: GenerationLog;
    selected: boolean;
    active: boolean;
    isRechecking?: boolean;
    onSelectedChange: (checked: boolean) => void;
    onClick: () => void;
    onRecheck?: () => void;
}) {
    const firstReference = log.referenceOrder[0];
    const firstImage = firstReference?.kind === "image" ? log.references.find((item) => item.id === firstReference.id) : undefined;
    const firstVideo = firstReference?.kind === "video" ? log.videoReferences.find((item) => item.id === firstReference.id) : undefined;
    const imageThumb = firstImage?.dataUrl || (firstImage?.storageKey ? resolveResourceUrl(firstImage.storageKey) : undefined);
    const videoPoster = firstVideo?.posterUrl || (firstVideo?.posterStorageKey ? resolveResourceUrl(firstVideo.posterStorageKey) : undefined);
    const generatedVideoUrl = log.video?.url || (log.video?.storageKey ? resolveResourceUrl(log.video.storageKey) : undefined) || log.runs?.[0]?.outputs?.find((o) => o.status === "success")?.url;
    const outputCount = log.runs.reduce((count, run) => count + run.outputs.filter((output) => output.status === "success").length, 0);
    const segmentCount = log.creationPlan?.segments?.length || log.segmentBatch?.tasks?.length || 0;
    const isSegmented = segmentCount > 1;
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
                <Checkbox className="mt-0.5" checked={selected} onClick={(event) => event.stopPropagation()} onChange={(event) => onSelectedChange(event.target.checked)} />
                <div className="relative size-14 overflow-hidden rounded-md bg-stone-100 dark:bg-stone-800 flex items-center justify-center">
                    {imageThumb ? (
                        <img
                            src={imageThumb}
                            alt=""
                            className="size-full object-cover"
                            onError={(e) => {
                                if (firstImage?.storageKey) {
                                    const fallback = resolveResourceUrl(firstImage.storageKey);
                                    if (fallback && e.currentTarget.src !== fallback) {
                                        e.currentTarget.src = fallback;
                                        return;
                                    }
                                }
                                e.currentTarget.style.display = "none";
                            }}
                        />
                    ) : videoPoster ? (
                        <img
                            src={videoPoster}
                            alt=""
                            className="size-full object-cover"
                            onError={(e) => {
                                if (firstVideo?.posterStorageKey) {
                                    const fallback = resolveResourceUrl(firstVideo.posterStorageKey);
                                    if (fallback && e.currentTarget.src !== fallback) {
                                        e.currentTarget.src = fallback;
                                        return;
                                    }
                                }
                                e.currentTarget.style.display = "none";
                            }}
                        />
                    ) : (generatedVideoUrl || firstVideo) ? (
                        <div className="size-full flex flex-col items-center justify-center bg-stone-900/10 dark:bg-stone-800/80 text-amber-600 dark:text-amber-400">
                            <Film className="size-5 opacity-80" />
                        </div>
                    ) : (
                        <FileText className="size-6 text-stone-400" />
                    )}
                    {isSegmented ? (
                        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 py-0.5 text-[9px] font-medium text-white">
                            分段
                        </span>
                    ) : null}
                </div>
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold leading-5">{log.title}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                        {isSegmented && segmentCount > 1 ? (
                            <Tag color="purple" className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">
                                {segmentCount}段 · {log.creationPlan?.targetDurationSec || log.seconds}s
                            </Tag>
                        ) : null}
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.size}</Tag>
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.resolution}p</Tag>
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.seconds}s</Tag>
                        {outputCount ? <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{outputCount} 个结果</Tag> : null}
                    </div>
                </div>
                <div className="grid justify-items-end gap-2">
                    <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color={log.status === "success" ? "blue" : log.status === "pending" ? "processing" : log.status === "draft" ? "default" : "red"}>
                        {log.status === "draft" ? "草稿" : t(`workbench.${log.status === "success" ? "success" : log.status === "pending" ? "generating" : "failed"}`)}
                        {log.status === "failed" && log.failureCount && log.failureCount > 1 ? ` (${log.failureCount}次)` : ""}
                    </Tag>
                    {log.status === "failed" && log.task && onRecheck ? (
                        <Button
                            size="small"
                            type="link"
                            className="!p-0 !h-auto text-xs text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                            loading={isRechecking}
                            onClick={(e) => {
                                e.stopPropagation();
                                onRecheck();
                            }}
                        >
                            <RefreshCw className={`size-3 ${isRechecking ? "animate-spin" : ""}`} />
                            {isRechecking ? t("videoWorkbench.rechecking") : t("videoWorkbench.recheck")}
                        </Button>
                    ) : (
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color="green">
                            {formatDuration(log.durationMs)}
                        </Tag>
                    )}
                </div>
            </div>
        </button>
    );
}

async function readStoredLogs(scope = getActiveUserScope()) {
    if (typeof window === "undefined") return [];
    try {
        const logs: GenerationLog[] = [];
        await logStore.iterate<GenerationLog, void>((value) => {
            if (value.userId === scope || (!value.userId && scope === "guest")) {
                logs.push(value);
            }
        });
        return (await Promise.all(logs.map(normalizeLog))).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch {
        return [];
    }
}

async function normalizeLog(log: Partial<GenerationLog>): Promise<GenerationLog> {
    const video = log.video?.storageKey ? { ...log.video, url: await resolveMediaUrl(log.video.storageKey, log.video.url) } : log.video;
    const videoReferences = await Promise.all(
        (log.videoReferences || []).map(async (item) => ({
            ...item,
            url: item.storageKey ? await resolveMediaUrl(item.storageKey, item.url) : item.url,
            posterUrl: item.posterStorageKey ? await resolveImageUrl(item.posterStorageKey, item.posterUrl) : item.posterUrl,
            uploading: false,
            progress: undefined,
        })),
    );
    const audioReferences = await Promise.all(
        (log.audioReferences || []).map(async (item) => ({
            ...item,
            url: item.storageKey ? await resolveMediaUrl(item.storageKey, item.url) : item.url,
            uploading: false,
            progress: undefined,
        })),
    );
    const references = await Promise.all(
        (log.references || []).map(async (item) => ({
            ...item,
            dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl),
            uploading: false,
            progress: undefined,
        })),
    );
    const config = normalizeLogConfig(log);
    const creationAssistant = log.creationAssistant ? await restoreCreationAssistant(log.creationAssistant) : log.creationAssistant;
    const runs = await Promise.all(
        (log.runs || []).map(async (run) => ({
            ...run,
            outputs: await Promise.all((run.outputs || []).map(async (output) => ({ ...output, url: output.storageKey ? await resolveMediaUrl(output.storageKey, output.url) : output.url }))),
        })),
    );
    const segmentBatch = log.segmentBatch
        ? {
              ...log.segmentBatch,
              tasks: log.segmentBatch.tasks || [],
              handoff: log.segmentBatch.handoff
                  ? {
                        ...log.segmentBatch.handoff,
                        segments: await Promise.all(
                            (log.segmentBatch.handoff.segments || []).map(async (segment) => ({
                                ...segment,
                                url: segment.storageKey ? await resolveMediaUrl(segment.storageKey, segment.url) : segment.url,
                            })),
                        ),
                    }
                  : log.segmentBatch.handoff,
          }
        : undefined;
    const sessionId = log.sessionId || log.id || nanoid();
    return {
        id: log.id || nanoid(),
        userId: log.userId,
        sessionId,
        createdAt: log.createdAt || Date.now(),
        updatedAt: log.updatedAt || log.createdAt || Date.now(),
        title: log.title || log.model || i18n.t("workbench.untitled"),
        prompt: log.prompt || "",
        time: log.time || new Date().toLocaleString(i18n.resolvedLanguage, { hour12: false }),
        model: log.model || config.videoModel || "",
        config,
        references,
        videoReferences,
        audioReferences,
        textReferences: log.textReferences || [],
        referenceOrder: log.referenceOrder || [
            ...references.map((item) => ({ id: item.id, kind: "image" as const })),
            ...videoReferences.map((item) => ({ id: item.id, kind: "video" as const })),
            ...audioReferences.map((item) => ({ id: item.id, kind: "audio" as const })),
        ],
        durationMs: log.durationMs || 0,
        size: log.size || config.size || "",
        resolution: normalizeResolution(log.resolution || config.vquality || ""),
        seconds: log.seconds || config.videoSeconds || "",
        status: log.status || "success",
        task: log.task,
        video,
        creationAssistant,
        creationPlan: log.creationPlan,
        segmentBatch,
        runs,
        runId: log.runId,
        error: log.error,
        successCount: log.successCount,
        failCount: log.failCount,
        itemCount: log.itemCount,
    };
}

function serializeLog(log: GenerationLog): GenerationLog {
    return {
        ...log,
        userId: log.userId || getActiveUserScope(),
        creationAssistant: log.creationAssistant ? serializeCreationAssistant(log.creationAssistant) : log.creationAssistant,
        references: log.references.map((item) => ({ ...item, dataUrl: item.storageKey ? "" : item.dataUrl, uploading: false, progress: undefined, error: undefined })),
        videoReferences: log.videoReferences.map((item) => (item.storageKey ? { ...item, url: "", posterUrl: item.posterStorageKey ? "" : item.posterUrl, uploading: false, progress: undefined, error: undefined } : { ...item, uploading: false, progress: undefined, error: undefined })),
        audioReferences: log.audioReferences.map((item) => (item.storageKey ? { ...item, url: "", uploading: false, progress: undefined, error: undefined } : { ...item, uploading: false, progress: undefined, error: undefined })),
        textReferences: log.textReferences || [],
        video: log.video?.storageKey ? { ...log.video, url: "" } : log.video,
        runs: (log.runs || []).map((run) => ({ ...run, outputs: (run.outputs || []).map((output) => (output.storageKey ? { ...output, url: "" } : output)) })),
        segmentBatch: log.segmentBatch
            ? {
                  ...log.segmentBatch,
                  handoff: {
                      ...log.segmentBatch.handoff,
                      segments: (log.segmentBatch.handoff.segments || []).map((segment) => (segment.storageKey ? { ...segment, url: "" } : segment)),
                  },
              }
            : log.segmentBatch,
    };
}

function isImageFile(file: File) {
    return file.type.startsWith("image/") || /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/i.test(file.name);
}

function isVideoFile(file: File) {
    return file.type.startsWith("video/") || /\.(avi|flv|m4v|mkv|mov|mp4|mpeg|mpg|3gp|webm)$/i.test(file.name);
}

function isSupportedAudioFile(file: File) {
    return file.type.startsWith("audio/") || /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav|wma)$/i.test(file.name);
}

function filterAudioReferencesByDuration(existing: ReferenceAudio[], next: ReferenceAudio[], warn: (content: string) => void) {
    let total = existing.reduce((sum, item) => sum + (item.durationMs || 0), 0);
    const accepted: ReferenceAudio[] = [];
    let skipped = false;
    for (const item of next) {
        if (item.durationMs && (item.durationMs < 2000 || item.durationMs > 15000)) {
            skipped = true;
            continue;
        }
        if (item.durationMs && total + item.durationMs > 15000) {
            skipped = true;
            continue;
        }
        total += item.durationMs || 0;
        accepted.push(item);
    }
    if (skipped) warn(i18n.t("videoWorkbench.audioDurationInvalid"));
    return accepted;
}

function normalizeLogConfig(log: Partial<GenerationLog>): GenerationLogConfig {
    return {
        model: log.config?.model || log.model || "",
        videoModel: log.config?.videoModel || log.model || "",
        size: log.config?.size || log.size || "",
        vquality: normalizeResolution(log.config?.vquality || log.resolution || ""),
        videoSeconds: log.config?.videoSeconds || log.seconds || "",
        videoGenerateAudio: log.config?.videoGenerateAudio || "true",
        videoWatermark: log.config?.videoWatermark || "false",
    };
}

function computeVideoRequestSignature(snapshot: {
    text: string;
    model: string;
    aspectRatio: string;
    resolution: string;
    durationSec: number;
    references: ReferenceImage[];
    videoReferences: ReferenceVideo[];
    audioReferences: ReferenceAudio[];
    textReferences?: VideoTextReference[];
}): string {
    const refImgIds = (snapshot.references || []).map((r) => r.id || r.dataUrl || "").sort().join(",");
    const refVidIds = (snapshot.videoReferences || []).map((r) => r.id || r.url || "").sort().join(",");
    const refAudIds = (snapshot.audioReferences || []).map((r) => r.id || r.url || "").sort().join(",");
    const textRefIds = (snapshot.textReferences || []).map((r) => `${r.id}:${r.content}`).sort().join(",");
    return [
        snapshot.text.trim(),
        snapshot.model.trim(),
        snapshot.aspectRatio,
        snapshot.resolution,
        snapshot.durationSec,
        refImgIds,
        refVidIds,
        refAudIds,
        textRefIds,
    ].join("|#|");
}

function buildLog({
    logId,
    sessionId,
    creationAssistant,
    creationPlan,
    segmentBatch,
    prompt,
    model,
    config,
    references,
    videoReferences,
    audioReferences,
    textReferences,
    referenceOrder,
    durationMs,
    status,
    task,
    video,
    error,
    runId,
    run,
    successCount,
    failCount,
    itemCount,
    failureCount,
    requestSignature,
    chargedMicrocredits,
}: {
    logId?: string;
    sessionId?: string;
    creationAssistant?: CreationAssistantDraft | null;
    creationPlan?: VideoCreationPlan;
    segmentBatch?: SegmentBatchLog;
    prompt: string;
    model: string;
    config: AiConfig;
    references: ReferenceImage[];
    videoReferences: ReferenceVideo[];
    audioReferences: ReferenceAudio[];
    textReferences: VideoTextReference[];
    referenceOrder: ReferenceOrderItem[];
    durationMs: number;
    status: GenerationLog["status"];
    task?: VideoGenerationTask;
    video?: GeneratedVideo;
    error?: string;
    runId?: string;
    run?: CreationRunRecord;
    successCount?: number;
    failCount?: number;
    itemCount?: number;
    failureCount?: number;
    requestSignature?: string;
    chargedMicrocredits?: number;
}): GenerationLog {
    const logConfig = {
        model: config.model,
        videoModel: config.videoModel,
        size: config.size,
        vquality: normalizeResolution(config.vquality),
        videoSeconds: config.videoSeconds,
        videoGenerateAudio: config.videoGenerateAudio,
        videoWatermark: config.videoWatermark,
    };
    const id = logId || nanoid();
    const resolvedSessionId = sessionId || id;
    const computedSuccessCount = successCount ?? (status === "success" ? 1 : 0);
    const computedFailCount = failCount ?? (status === "failed" ? 1 : 0);
    const computedItemCount = itemCount ?? (creationPlan?.segments.length || 1);
    return {
        id,
        userId: getActiveUserScope(),
        sessionId: resolvedSessionId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        title: (prompt.trim() || textReferences[0]?.name || textReferences[0]?.content || i18n.t("workbench.untitled")).slice(0, 18),
        prompt,
        time: new Date().toLocaleString(i18n.resolvedLanguage, { hour12: false }),
        model,
        config: logConfig,
        references,
        videoReferences,
        audioReferences,
        textReferences,
        referenceOrder,
        durationMs,
        size: logConfig.size,
        resolution: logConfig.vquality,
        seconds: logConfig.videoSeconds,
        status,
        task,
        video,
        creationAssistant: creationAssistant === undefined ? null : creationAssistant,
        creationPlan,
        segmentBatch,
        runs: run ? [run] : [],
        runId,
        error,
        successCount: computedSuccessCount,
        failCount: computedFailCount,
        itemCount: computedItemCount,
        failureCount,
        requestSignature,
        chargedMicrocredits,
    };
}

function appendPromptReference(prompt: string, label: string) {
    const trimmed = prompt.trimEnd();
    return trimmed ? `${trimmed} ${label}` : label;
}

function buildSourceFileSignatures(draft: ReturnType<typeof useVideoWorkbenchStore.getState>["draft"]) {
    const images = new Map(draft.references.map((item) => [item.id, item]));
    const videos = new Map(draft.videoReferences.map((item) => [item.id, item]));
    const audios = new Map(draft.audioReferences.map((item) => [item.id, item]));
    const signatures = draft.referenceOrder.map((entry) => {
        const item = entry.kind === "image" ? images.get(entry.id) : entry.kind === "video" ? videos.get(entry.id) : audios.get(entry.id);
        return `${entry.kind}:${entry.id}:${item?.storageKey || item?.name || ""}`;
    });
    return [...signatures, ...draft.textReferences.map((item) => `text:${item.id}:${item.name}:${item.content}`)];
}

function sameStringList(left: string[], right: string[]) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function createRunRecord({ runId, prompt, model, config, task, status, error }: { runId: string; prompt: string; model: string; config: AiConfig; task?: VideoGenerationTask; status: CreationRunRecord["status"]; error?: string }): CreationRunRecord {
    const now = Date.now();
    return { runId, createdAt: now, updatedAt: now, status, prompt, model, config, task, outputs: [], error };
}

function buildOutputRecord(video: GeneratedVideo, role: CreationOutputRecord["role"]): CreationOutputRecord {
    return { outputId: video.id, mediaType: "video", role, status: "success", storageKey: video.storageKey, url: video.url || (video.storageKey ? resolveResourceUrl(video.storageKey) : ""), durationMs: video.durationMs, width: video.width, height: video.height, bytes: video.bytes, mimeType: video.mimeType };
}

function upsertOutput(outputs: CreationOutputRecord[], next: CreationOutputRecord) {
    const index = outputs.findIndex((item) => item.outputId === next.outputId);
    return index < 0 ? [...outputs, next] : outputs.map((item, itemIndex) => (itemIndex === index ? next : item));
}

function outputToGenerationResult(output: CreationOutputRecord): GenerationResult | null {
    if (output.mediaType !== "video" || output.status !== "success") return null;
    const effectiveUrl = output.url || (output.storageKey ? resolveResourceUrl(output.storageKey) : "");
    if (!effectiveUrl) return null;
    return {
        id: output.outputId,
        status: "success",
        video: {
            id: output.outputId,
            url: effectiveUrl,
            storageKey: output.storageKey || "",
            durationMs: output.durationMs || 0,
            width: output.width || 1280,
            height: output.height || 720,
            bytes: output.bytes || 0,
            mimeType: output.mimeType || "video/mp4",
            ...(output.segmentIndex ? { label: `第 ${output.segmentIndex} 段 · ${output.startSec ?? 0}-${output.endSec ?? 0}秒` } : {}),
        },
    };
}

export function deriveGenerationResultsFromLog(log: GenerationLog): GenerationResult[] {
    const outputResults = (log.runs || [])
        .flatMap((run) => (run.outputs || []).map((output) => outputToGenerationResult(output)))
        .filter((item): item is GenerationResult => Boolean(item));
    const mergedResult = log.video ? [{ id: log.video.id, status: "success" as const, video: { ...log.video, url: log.video.url || (log.video.storageKey ? resolveResourceUrl(log.video.storageKey) : "") } }] : [];
    const representativeTask = log.task || log.segmentBatch?.tasks?.find((t) => t.task && t.status !== "success")?.task || log.segmentBatch?.tasks?.find((t) => t.task)?.task;
    const failedResult =
        log.status === "failed" && log.segmentBatch
            ? [{ id: `${log.id}-failed`, status: "failed" as const, error: log.error || t("workbench.generationFailed"), task: representativeTask, failureCount: log.failureCount }]
            : [];

    if (log.status === "pending") {
        return [{ id: log.id, status: "pending", task: representativeTask }];
    }
    if (log.segmentBatch && mergedResult.length && outputResults.length > 1) {
        return [...mergedResult, ...outputResults, ...failedResult];
    }
    if (outputResults.length) {
        return [...outputResults, ...failedResult];
    }
    if (log.status === "draft") {
        return [];
    }
    if (log.video) {
        const effectiveUrl = log.video.url || (log.video.storageKey ? resolveResourceUrl(log.video.storageKey) : "");
        return [{ id: log.video.id, status: "success", video: { ...log.video, url: effectiveUrl } }];
    }
    return [{ id: log.id, status: "failed", error: log.error || t("workbench.generationFailed"), task: representativeTask, failureCount: log.failureCount }];
}

function serializeCreationAssistant(draft: CreationAssistantDraft): CreationAssistantDraft {
    const normalized = { ...defaultCreationAssistantDraft, ...draft, referenceVideos: draft.referenceVideos || [], videoAnalyses: draft.videoAnalyses || [] };
    return {
        ...normalized,
        referenceVideos: normalized.referenceVideos.map((item) => (item.storageKey ? { ...item, url: "" } : item)),
        videoAnalyses: normalized.videoAnalyses.map((analysis) => ({ ...analysis, sheets: (analysis.sheets || []).map((sheet) => (sheet.storageKey ? { ...sheet, url: "" } : sheet)), audio: analysis.audio?.storageKey ? { ...analysis.audio, url: "" } : analysis.audio })),
    };
}

async function restoreCreationAssistant(draft: CreationAssistantDraft): Promise<CreationAssistantDraft> {
    const normalized = { ...defaultCreationAssistantDraft, ...draft, referenceVideos: draft.referenceVideos || [], videoAnalyses: draft.videoAnalyses || [] };
    return {
        ...normalized,
        referenceVideos: await Promise.all(normalized.referenceVideos.map(async (item) => ({ ...item, url: item.storageKey ? await resolveMediaUrl(item.storageKey, item.url) : item.url }))),
        videoAnalyses: await Promise.all(normalized.videoAnalyses.map(async (analysis) => ({ ...analysis, sheets: await Promise.all((analysis.sheets || []).map(async (sheet) => ({ ...sheet, url: sheet.storageKey ? await resolveImageUrl(sheet.storageKey, sheet.url) : sheet.url }))), audio: analysis.audio?.storageKey ? { ...analysis.audio, url: await resolveMediaUrl(analysis.audio.storageKey, analysis.audio.url) } : analysis.audio }))),
    };
}

function appendTextReferenceContext(prompt: string, references: VideoTextReference[]) {
    if (!references.length) return prompt;
    let expanded = prompt;
    let anyReplaced = false;
    references.forEach((item, index) => {
        const label = `@文本${index + 1}`;
        const altLabel = `@文档${index + 1}`;
        if (expanded.includes(label)) {
            expanded = expanded.split(label).join(item.content);
            anyReplaced = true;
        } else if (expanded.includes(altLabel)) {
            expanded = expanded.split(altLabel).join(item.content);
            anyReplaced = true;
        }
    });

    if (!anyReplaced) {
        const docsContent = references.map((item) => item.content.trim()).filter(Boolean).join("\n\n");
        if (!expanded.trim()) {
            return docsContent;
        }
        return `${docsContent}\n\n${expanded.trim()}`;
    }
    return expanded;
}

function buildVideoConfig(config: AiConfig, model: string): AiConfig {
    const cap = modelCapabilityConfigFor(config, model).video;
    const ratio = cap?.ratios?.includes(config.size) ? config.size : (cap?.defaultRatio || "16:9");
    const resolution = cap?.resolutions?.includes(config.vquality) ? config.vquality : (cap?.defaultResolution || "720p");
    const seconds = normalizeVideoSeconds(config.videoSeconds || String(cap?.duration?.default || 5));
    const audioSupported = cap?.generateAudio?.supported ?? false;
    const defaultAudio = cap?.generateAudio?.default ?? false;
    const watermarkSupported = cap?.watermark?.supported ?? false;
    const defaultWatermark = cap?.watermark?.default ?? false;
    return {
        ...config,
        model,
        videoModel: model,
        size: ratio,
        vquality: resolution,
        videoSeconds: seconds,
        videoGenerateAudio: audioSupported ? String(boolConfig(config.videoGenerateAudio, defaultAudio)) : "false",
        videoWatermark: watermarkSupported ? String(boolConfig(config.videoWatermark, defaultWatermark)) : "false",
    };
}

function normalizeVideoSeconds(value: string) {
    if (String(value).trim() === "-1") return "-1";
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(1, seconds));
}

function normalizeVideoSize(value: string) {
    return normalizeVideoSizeValue(value);
}

function normalizeResolution(value: string) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw === "480p" || raw === "720p" || raw === "1080p" || raw === "4k") return raw;
    return "720p";
}

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
        };
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

function buildSegmentOutputRecord(output: VideoSegmentOutput): CreationOutputRecord {
    return {
        outputId: output.segmentId,
        mediaType: "video",
        role: "segment",
        status: "success",
        storageKey: output.storageKey,
        url: output.url || (output.storageKey ? resolveResourceUrl(output.storageKey) : ""),
        segmentIndex: output.index,
        startSec: output.startSec,
        endSec: output.endSec,
        durationMs: output.durationMs || output.keepDurationSec * 1000,
        width: output.width,
        height: output.height,
        mimeType: "video/mp4",
    };
}

function upsertSegmentTask(tasks: VideoSegmentTaskCheckpoint[], event: VideoSegmentRunnerTaskEvent) {
    const next: VideoSegmentTaskCheckpoint = {
        segmentId: event.segment.segmentId,
        ...(event.task || tasks.find((item) => item.segmentId === event.segment.segmentId)?.task ? { task: event.task || tasks.find((item) => item.segmentId === event.segment.segmentId)?.task } : {}),
        status: event.status,
        ...(event.error ? { error: event.error } : {}),
    };
    const index = tasks.findIndex((item) => item.segmentId === next.segmentId);
    return index < 0 ? [...tasks, next] : tasks.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item));
}

function emptySegmentHandoff(plan: VideoCreationPlan, batchId: string): VideoSegmentHandoff {
    return {
        batchId,
        schemaVersion: "video-segment-handoff-v1",
        targetDurationSec: plan.targetDurationSec,
        aspectRatio: plan.aspectRatio,
        resolution: plan.resolution,
        segments: [],
    };
}

function isCurrentVideoCreationPlan(plan: VideoCreationPlan, prompt: string, model: string, targetDurationSec: number, aspectRatio: string, resolution: string) {
    return plan.schemaVersion === "video-creation-plan-v2"
        && !plan.warnings?.some((warning) => warning.includes("时间段无法解析"))
        && plan.scriptHash === hashCreationScript(prompt)
        && plan.model === model
        && plan.targetDurationSec === targetDurationSec
        && plan.aspectRatio === aspectRatio
        && plan.resolution === resolution;
}
// @opc-feature: video_workbench [end]
