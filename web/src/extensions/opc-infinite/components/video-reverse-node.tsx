import { useEffect, useMemo, useRef, useState } from "react";
import { App, Modal, message as staticMessage, Tag } from "antd";
import { AlertCircle, BookmarkPlus, Check, Clapperboard, Copy, Download, FileEdit, FileVideo, Film, FolderOpen, Image as ImageIcon, Layers, Loader2, Maximize2, Mic, Play, Plus, RefreshCw, Scissors, SlidersHorizontal, Sparkles, Trash2, Upload, X } from "lucide-react";
import { nanoid } from "nanoid";
import saveAs from "file-saver";

import { PromptEditorModal } from "./prompt-editor-modal";
import {
    CREATIVE_REVERSE_SHOT_DECONSTRUCTION_SYSTEM_PROMPT,
    fetchCreativeReversePrompt,
    formatShotManifestToReadableScript,
    parseDirectorJson,
    parseMarkdownShots,
    stripJsonCodeBlocks,
} from "../prompts/hypit-director-prompts";

import { useUpstreamNodes } from "@/components/canvas/canvas-node-graph-context";
import { useCanvasNodeActions } from "@/components/canvas/canvas-node-action-context";
import { getNodeResourceKind } from "@/lib/canvas/node-registry";
import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CanvasNodeData } from "@/types/canvas";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { ModelPicker } from "@/components/model-picker";
import { FeatureCreditBadge } from "@/components/feature-credit-badge";
import { useFeatureCredit } from "@/hooks/use-feature-credit";
import { usePluginStore } from "@/stores/use-plugin-store";
import { scopedLocalStorage } from "@/lib/user-scope";
import { getCachedResourceBlob } from "@/services/resource-blob-cache";
import { deleteStoredMedia, getMediaBlob, setMediaBlob } from "@/services/file-storage";
import { resolveResourceUrl } from "@/services/api/resources";
import {
    analyzePreparedReverseVideo,
    disposePreparedReverseVideo,
    prepareReverseVideo,
    type PreparedReverseVideo,
    type ReverseAnalysisProgress,
} from "../services/video-reverse-analysis";
import {
    VIDEO_REVERSE_PLUGIN_ID,
    isAudioCapableModel,
    resolveDefaultLocalAsrSetting,
    type ReverseGridSize,
    type ReverseMeta,
    type ReverseTrackClassic,
    type ReverseTrackDeconstruct,
    type VideoSamplingMode,
} from "../services/video-reverse-contracts";

type SavedPromptPreset = {
    id: string;
    title: string;
    content: string;
};

const RULE_PRESETS_STORAGE_KEY = "opc:video-reverse:rule-presets";
const PROMPT_PRESETS_STORAGE_KEY = "opc:video-reverse:prompt-presets";

const DEFAULT_RULE_PRESETS: SavedPromptPreset[] = [
    { id: "builtin-1", title: "镜头运镜与构图轨迹", content: "重点拆解镜头运镜与构图轨迹" },
    { id: "builtin-2", title: "人物微动作与手部操作", content: "重点分析人物微动作与手部操作细节" },
    { id: "builtin-3", title: "强化换品复刻策略与建议", content: "强化换品复刻策略与具体商品拍摄修改建议" },
    { id: "builtin-4", title: "忽略背景音乐与杂音", content: "忽略背景音乐与次要环境音" },
    { id: "builtin-5", title: "0-3秒黄金钩子与转化机制", content: "深入分析0-3秒视觉黄金钩子与转化信任机制" },
    { id: "builtin-6", title: "光影色温与置景道具清单", content: "详细列出主光色温、阴影软硬度与场景置景道具清单" },
];

function readSavedPresets(key: string): SavedPromptPreset[] {
    try {
        const raw = scopedLocalStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeSavedPresets(key: string, presets: SavedPromptPreset[]) {
    try {
        scopedLocalStorage.setItem(key, JSON.stringify(presets));
    } catch (error) {
        console.error("Failed to persist presets:", error);
    }
}

type VideoReverseNodeContentProps = {
    node: CanvasNodeData;
    theme: CanvasTheme;
};

export function VideoReverseNodeContent({ node, theme }: VideoReverseNodeContentProps) {
    const { message: appMessage } = App.useApp();
    const message = appMessage || staticMessage;
    const { updateMetadata } = useCanvasNodeActions();
    const enabled = usePluginStore((state) => state.pluginStates[VIDEO_REVERSE_PLUGIN_ID]?.effectiveEnabled ?? Boolean(state.installations.find((item) => item.manifest.id === VIDEO_REVERSE_PLUGIN_ID)?.enabled));
    const upstream = useUpstreamNodes(node.id);
    const upstreamVideo = upstream.find((item) => getNodeResourceKind(item) === "video" || item.metadata?.mimeType?.startsWith("video/"));
    const config = useEffectiveConfig();

    const meta = (node.metadata?.videoReverse || {}) as ReverseMeta;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const defaultModel = meta.model || config.textModel || config.model;
    const [selectedModel, setSelectedModel] = useState<string>(defaultModel);

    // 本地交互状态（不频繁触发全局画布重绘）
    const [activeTab, setActiveTab] = useState<"classic" | "deconstruct">(meta.activeTab || "classic");
    const [wordLevelAudio, setWordLevelAudio] = useState<boolean>(meta.wordLevelAudio !== false);
    const [userTouchedAsr, setUserTouchedAsr] = useState<boolean>(Boolean(meta.userTouchedAsr));
    const initialLocalAsr = meta.localAsrEnabled !== undefined
        ? Boolean(meta.localAsrEnabled)
        : resolveDefaultLocalAsrSetting(defaultModel);
    const [localAsrEnabled, setLocalAsrEnabled] = useState<boolean>(initialLocalAsr);
    const [localAsrFeedback, setLocalAsrFeedback] = useState<string>(meta.localAsrFeedback || "");

    const isDualTrackNode = Boolean(meta.classic || meta.deconstruct);

    // 经典反推独立轨状态
    const [classicPrompt, setClassicPrompt] = useState<string>(() => {
        if (meta.classic?.prompt !== undefined) return meta.classic.prompt;
        if (!isDualTrackNode && meta.activeTab === "classic" && !meta.shotManifest?.length) {
            return meta.prompt || node.metadata?.content || "";
        }
        return "";
    });
    const [classicCustomRules, setClassicCustomRules] = useState<string>(() => {
        if (meta.classic?.customRules !== undefined) return meta.classic.customRules;
        if (!isDualTrackNode && meta.activeTab === "classic") {
            return meta.customRules || meta.requirement || "";
        }
        return "";
    });
    const [classicReplacePrompt, setClassicReplacePrompt] = useState<boolean>(() => {
        if (meta.classic?.replaceBuiltInPrompt !== undefined) return meta.classic.replaceBuiltInPrompt;
        if (!isDualTrackNode && meta.activeTab === "classic") {
            return Boolean(meta.replaceBuiltInPrompt);
        }
        return false;
    });
    const [classicPromptRules, setClassicPromptRules] = useState<string>(() => {
        if (meta.classic?.promptRules !== undefined) return meta.classic.promptRules;
        if (!isDualTrackNode && meta.activeTab === "classic") {
            return meta.promptRules || "";
        }
        return "";
    });
    const [classicSamplingMode, setClassicSamplingMode] = useState<VideoSamplingMode>(
        () => meta.classic?.samplingMode || (meta.samplingMode !== "deconstruct" ? meta.samplingMode : "seconds_and_scene") || "seconds_and_scene"
    );
    const [classicSamplingFps, setClassicSamplingFps] = useState<number>(
        () => meta.classic?.samplingFps ?? (meta.samplingFps ?? 1)
    );

    // 创意反推独立轨状态
    const [deconstructPrompt, setDeconstructPrompt] = useState<string>(() => {
        if (meta.deconstruct?.prompt !== undefined) return meta.deconstruct.prompt;
        if (!isDualTrackNode && (meta.activeTab === "deconstruct" || (meta.shotManifest && meta.shotManifest.length > 0))) {
            return meta.prompt || node.metadata?.content || "";
        }
        return "";
    });
    const [shotManifest, setShotManifest] = useState<any[]>(() => {
        if (meta.deconstruct?.shotManifest !== undefined) return meta.deconstruct.shotManifest;
        if (!isDualTrackNode && meta.shotManifest) return meta.shotManifest;
        return [];
    });
    const [originalMasterSlots, setOriginalMasterSlots] = useState<{ actor?: string; character?: string; product?: string; focalObject?: string; scene?: string } | undefined>(() => {
        if (meta.deconstruct?.originalMasterSlots || meta.deconstruct?.coreElements) {
            return meta.deconstruct.originalMasterSlots || meta.deconstruct.coreElements;
        }
        if (!isDualTrackNode && (meta.coreElements || meta.originalMasterSlots)) {
            return meta.coreElements || meta.originalMasterSlots;
        }
        return undefined;
    });
    const [deconstructCustomRules, setDeconstructCustomRules] = useState<string>(() => {
        if (meta.deconstruct?.customRules !== undefined) return meta.deconstruct.customRules;
        if (!isDualTrackNode && meta.activeTab === "deconstruct") {
            return meta.customRules || "";
        }
        return "";
    });
    const [deconstructReplacePrompt, setDeconstructReplacePrompt] = useState<boolean>(
        () => meta.deconstruct?.replaceBuiltInPrompt ?? false
    );
    const [deconstructPromptRules, setDeconstructPromptRules] = useState<string>(
        () => meta.deconstruct?.promptRules ?? ""
    );

    const [sourceMode, setSourceMode] = useState<"__upstream__" | "__local__">(meta.sourceNodeId === "__local__" ? "__local__" : "__upstream__");
    const [localFile, setLocalFile] = useState<File | null>(null);
    const [localUrl, setLocalUrl] = useState<string>("");
    const [gridSize, setGridSize] = useState<ReverseGridSize>(meta.gridSize || "auto");
    const [includeMiddleFrames, setIncludeMiddleFrames] = useState<boolean>(meta.includeMiddleFrames !== false);
    const [sceneThreshold, setSceneThreshold] = useState<number>(meta.sceneThreshold ?? 0.20);
    const [minSceneGapSec, setMinSceneGapSec] = useState<number>(meta.minSceneGapSec ?? 0.3);

    // 当前活跃轨派生脚本、提示词与抽帧拼图
    const currentActiveScript = activeTab === "classic"
        ? classicPrompt
        : (deconstructPrompt || (shotManifest.length > 0 ? formatShotManifestToReadableScript(shotManifest) : ""));
    const activeCustomRules = activeTab === "classic" ? classicCustomRules : deconstructCustomRules;
    const activeReplacePrompt = activeTab === "classic" ? classicReplacePrompt : deconstructReplacePrompt;
    const activePromptRules = activeTab === "classic" ? classicPromptRules : deconstructPromptRules;
    const activeContactSheets = activeTab === "classic"
        ? (meta.classic?.contactSheets ?? (!isDualTrackNode && meta.activeTab === "classic" ? meta.contactSheets : undefined))
        : (meta.deconstruct?.contactSheets ?? (!isDualTrackNode && meta.activeTab === "deconstruct" ? meta.contactSheets : undefined));

    const handleTabChange = (tab: "classic" | "deconstruct") => {
        setActiveTab(tab);
        const nextActiveScript = tab === "classic"
            ? classicPrompt
            : (deconstructPrompt || (shotManifest.length > 0 ? formatShotManifestToReadableScript(shotManifest) : ""));
        const nextContactSheets = tab === "classic"
            ? (meta.classic?.contactSheets ?? (!isDualTrackNode && meta.activeTab === "classic" ? meta.contactSheets : undefined))
            : (meta.deconstruct?.contactSheets ?? (!isDualTrackNode && meta.activeTab === "deconstruct" ? meta.contactSheets : undefined));
        const nextCustomRules = tab === "classic" ? classicCustomRules : deconstructCustomRules;
        const nextReplacePrompt = tab === "classic" ? classicReplacePrompt : deconstructReplacePrompt;
        const nextPromptRules = tab === "classic" ? classicPromptRules : deconstructPromptRules;
        const nextSamplingMode = tab === "classic" ? classicSamplingMode : "deconstruct";

        updateMetadata?.(node.id, {
            content: nextActiveScript || "",
            prompt: nextActiveScript || "",
            videoReverse: {
                ...meta,
                activeTab: tab,
                prompt: nextActiveScript || "",
                customRules: nextCustomRules,
                replaceBuiltInPrompt: nextReplacePrompt,
                promptRules: nextPromptRules,
                samplingMode: nextSamplingMode,
                contactSheets: nextContactSheets,
            },
        });
    };

    useEffect(() => {
        if (meta.model) setSelectedModel(meta.model);
    }, [meta.model]);

    const handleModelChange = (newModel: string) => {
        setSelectedModel(newModel);
        let nextAsr = localAsrEnabled;
        if (!userTouchedAsr) {
            nextAsr = resolveDefaultLocalAsrSetting(newModel);
            setLocalAsrEnabled(nextAsr);
        }
        updateMetadata?.(node.id, {
            videoReverse: {
                ...meta,
                model: newModel,
                localAsrEnabled: nextAsr,
            },
        });
    };

    const featureCredit = useFeatureCredit("video_reverse", selectedModel);

    // 弹窗状态与草稿
    const [rulesModalOpen, setRulesModalOpen] = useState(false);
    const [expandedModalOpen, setExpandedModalOpen] = useState(false);
    const [contactSheetsModalOpen, setContactSheetsModalOpen] = useState(false);

    // 快捷预设持久化状态
    const [savedRulePresets, setSavedRulePresets] = useState<SavedPromptPreset[]>(() => readSavedPresets(RULE_PRESETS_STORAGE_KEY));
    const [savedPromptPresets, setSavedPromptPresets] = useState<SavedPromptPreset[]>(() => readSavedPresets(PROMPT_PRESETS_STORAGE_KEY));

    // 运行状态与节流进度（本地驱动，主线程零卡顿）
    const isNodeExecuting = meta.status === "running" || node.metadata?.status === "loading" || node.metadata?.taskStatus === "running";
    const [running, setRunning] = useState<boolean>(isNodeExecuting);
    const [localProgress, setLocalProgress] = useState<ReverseAnalysisProgress | null>(null);
    const [errorMsg, setErrorMsg] = useState<string>(meta.errorDetails || "");
    const [streamedScript, setStreamedScript] = useState<string>("");
    const [copied, setCopied] = useState<boolean>(false);

    useEffect(() => {
        const isDual = Boolean(meta.classic || meta.deconstruct);

        // 同步经典反推轨
        if (meta.classic?.prompt !== undefined) {
            setClassicPrompt(meta.classic.prompt);
        } else if (!isDual && meta.activeTab === "classic" && !meta.shotManifest?.length && (meta.prompt || node.metadata?.content)) {
            setClassicPrompt(meta.prompt || node.metadata?.content || "");
        } else if (isDual && meta.classic === undefined) {
            setClassicPrompt("");
        }
        if (meta.classic?.customRules !== undefined) {
            setClassicCustomRules(meta.classic.customRules);
        } else if (!isDual && meta.activeTab === "classic" && (meta.customRules !== undefined || meta.requirement !== undefined)) {
            setClassicCustomRules(meta.customRules || meta.requirement || "");
        }
        if (meta.classic?.replaceBuiltInPrompt !== undefined) {
            setClassicReplacePrompt(meta.classic.replaceBuiltInPrompt);
        } else if (!isDual && meta.activeTab === "classic" && meta.replaceBuiltInPrompt !== undefined) {
            setClassicReplacePrompt(Boolean(meta.replaceBuiltInPrompt));
        }
        if (meta.classic?.promptRules !== undefined) {
            setClassicPromptRules(meta.classic.promptRules);
        } else if (!isDual && meta.activeTab === "classic" && meta.promptRules !== undefined) {
            setClassicPromptRules(meta.promptRules);
        }
        if (meta.classic?.samplingMode) setClassicSamplingMode(meta.classic.samplingMode);
        if (meta.classic?.samplingFps !== undefined) setClassicSamplingFps(meta.classic.samplingFps);

        // 同步创意反推轨
        if (meta.deconstruct?.prompt !== undefined) {
            setDeconstructPrompt(meta.deconstruct.prompt);
        } else if (!isDual && meta.activeTab === "deconstruct" && (meta.prompt || node.metadata?.content)) {
            setDeconstructPrompt(meta.prompt || node.metadata?.content || "");
        } else if (isDual && meta.deconstruct === undefined) {
            setDeconstructPrompt("");
        }
        if (meta.deconstruct?.shotManifest !== undefined) {
            setShotManifest(meta.deconstruct.shotManifest);
        } else if (!isDual && meta.shotManifest) {
            setShotManifest(meta.shotManifest);
        } else if (isDual && meta.deconstruct === undefined) {
            setShotManifest([]);
        }
        if (meta.deconstruct?.originalMasterSlots || meta.deconstruct?.coreElements) {
            setOriginalMasterSlots(meta.deconstruct.originalMasterSlots || meta.deconstruct.coreElements);
        } else if (!isDual && (meta.coreElements || meta.originalMasterSlots)) {
            setOriginalMasterSlots(meta.coreElements || meta.originalMasterSlots);
        } else if (isDual && meta.deconstruct === undefined) {
            setOriginalMasterSlots(undefined);
        }
        if (meta.deconstruct?.customRules !== undefined) {
            setDeconstructCustomRules(meta.deconstruct.customRules);
        } else if (!isDual && meta.activeTab === "deconstruct" && meta.customRules !== undefined) {
            setDeconstructCustomRules(meta.customRules);
        }
        if (meta.deconstruct?.replaceBuiltInPrompt !== undefined) setDeconstructReplacePrompt(meta.deconstruct.replaceBuiltInPrompt);
        if (meta.deconstruct?.promptRules !== undefined) setDeconstructPromptRules(meta.deconstruct.promptRules);

        const activeRunning = meta.status === "running" || node.metadata?.status === "loading" || node.metadata?.taskStatus === "running";
        setRunning(activeRunning);
        if (meta.activeTab) setActiveTab(meta.activeTab);
        if (meta.wordLevelAudio !== undefined) setWordLevelAudio(meta.wordLevelAudio);
        if (meta.userTouchedAsr !== undefined) setUserTouchedAsr(meta.userTouchedAsr);
        if (meta.localAsrEnabled !== undefined) setLocalAsrEnabled(meta.localAsrEnabled);
        if (meta.localAsrFeedback !== undefined) setLocalAsrFeedback(meta.localAsrFeedback);
        if (meta.errorDetails !== undefined) setErrorMsg(meta.errorDetails);
        if (meta.gridSize) setGridSize(meta.gridSize);
        if (meta.includeMiddleFrames !== undefined) setIncludeMiddleFrames(meta.includeMiddleFrames);
        if (meta.sceneThreshold !== undefined) setSceneThreshold(meta.sceneThreshold);
        if (meta.minSceneGapSec !== undefined) setMinSceneGapSec(meta.minSceneGapSec);
    }, [meta, node.metadata?.content, node.metadata?.prompt, node.metadata?.status, node.metadata?.taskStatus]);

    const handleResultScriptChange = (nextText: string) => {
        if (activeTab === "classic") {
            setClassicPrompt(nextText);
            updateMetadata?.(node.id, {
                content: nextText,
                prompt: nextText,
                videoReverse: {
                    ...meta,
                    status: "success",
                    prompt: nextText,
                    isUserEditedScript: true,
                    classic: {
                        ...meta.classic,
                        prompt: nextText,
                        updatedAt: Date.now(),
                    },
                    result: meta.result ? { ...meta.result, prompt: nextText } : undefined,
                    updatedAt: Date.now(),
                },
            });
        } else {
            setDeconstructPrompt(nextText);
            updateMetadata?.(node.id, {
                content: nextText,
                prompt: nextText,
                videoReverse: {
                    ...meta,
                    status: "success",
                    prompt: nextText,
                    isUserEditedScript: true,
                    deconstruct: {
                        ...meta.deconstruct,
                        prompt: nextText,
                        updatedAt: Date.now(),
                    },
                    result: meta.result ? { ...meta.result, prompt: nextText } : undefined,
                    updatedAt: Date.now(),
                },
            });
        }
    };

    // 释放本地上传视频的临时 ObjectURL
    useEffect(() => {
        return () => {
            if (localUrl) URL.revokeObjectURL(localUrl);
            abortControllerRef.current?.abort();
        };
    }, [localUrl]);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (localUrl) URL.revokeObjectURL(localUrl);
        const url = URL.createObjectURL(file);
        setLocalFile(file);
        setLocalUrl(url);
        setSourceMode("__local__");
        event.target.value = "";
    };

    const runAnalysis = async () => {
        setErrorMsg("");
        if (!enabled) {
            setErrorMsg("插件已在插件中心停用，请先在插件中心启用后再运行反推");
            return;
        }
        setLocalProgress({ stage: "frames", percent: 0, message: "正在启动视频反推..." });
        setRunning(true);
        updateMetadata?.(node.id, {
            status: "loading",
            taskStatus: "running",
            isClientMockTask: true,
            videoReverse: {
                ...meta,
                status: "running",
            },
        });

        const controller = new AbortController();
        abortControllerRef.current = controller;

        let deductedMicrocredits = 0;
        try {
            const deductRes = await featureCredit.deduct(selectedModel, "画布视频反推");
            deductedMicrocredits = deductRes.deductedMicrocredits;
        } catch (creditErr) {
            const msg = creditErr instanceof Error ? creditErr.message : "积分扣减失败";
            staticMessage.error(msg);
            setErrorMsg(msg);
            setRunning(false);
            setLocalProgress(null);
            updateMetadata?.(node.id, {
                status: (classicPrompt || deconstructPrompt || shotManifest.length > 0) ? "success" : "idle",
                taskStatus: "idle",
                isClientMockTask: true,
                videoReverse: {
                    ...meta,
                    status: (classicPrompt || deconstructPrompt || shotManifest.length > 0) ? "success" : "idle",
                },
            });
            return;
        }

        // 商业级自适应硬件超时守护与静默看门狗 (结合 CPU 并发核心数与内存容量，避免对低配电脑误判)
        const cores = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency || 4) : 4;
        const mem = typeof navigator !== "undefined" ? ((navigator as any).deviceMemory || 8) : 8;
        const hwFactor = (cores <= 4 ? 1.5 : 1.0) * (mem <= 4 ? 1.3 : 1.0);
        // 单个阶段静默无心跳保护阈值（只要有解码步进或推演 token 输出即持续重置刷新，纯卡死/挂起才触发）
        const inactivityLimitMs = Math.round(50_000 * hwFactor);
        const maxCeilingMs = Math.round(300_000 * hwFactor); // 绝对总时长上限 (5~10分钟)

        let lastActivityTime = Date.now();
        const startTime = Date.now();
        let isTimedOut = false;

        const watchdogInterval = window.setInterval(() => {
            const now = Date.now();
            if (now - lastActivityTime > inactivityLimitMs || now - startTime > maxCeilingMs) {
                isTimedOut = true;
                console.warn(`[video-reverse] 静默超时看门狗触发 (无心跳 ${now - lastActivityTime}ms, 总耗时 ${now - startTime}ms)`);
                window.clearInterval(watchdogInterval);
                controller.abort();
            }
        }, 2000);

        // 清理当前轨上一次运行留存的拼图 Blob 内存（绝不跨轨撤销另一模式拼图）
        const prevTrackSheets = activeTab === "classic"
            ? meta.classic?.contactSheets
            : meta.deconstruct?.contactSheets;
        prevTrackSheets?.forEach((sheet) => {
            if (sheet.url && sheet.url.startsWith("blob:")) {
                try { URL.revokeObjectURL(sheet.url); } catch {}
            }
        });

        let sourceInput: File | Blob | string | null = null;
        if (sourceMode === "__local__") {
            sourceInput = localFile || localUrl;
        } else if (upstreamVideo) {
            const storageKey = upstreamVideo.metadata?.storageKey;
            if (storageKey) {
                try {
                    const cachedBlob = await getCachedResourceBlob(storageKey);
                    if (cachedBlob) {
                        sourceInput = cachedBlob;
                    }
                } catch (cacheErr) {
                    console.warn("[video-reverse-node] 读取多级缓存异常，回退至远程 URL:", cacheErr);
                }
            }
            if (!sourceInput) {
                sourceInput = upstreamVideo.metadata?.content || (storageKey ? resolveResourceUrl(storageKey) : "") || "";
            }
        }

        if (!sourceInput) {
            window.clearInterval(watchdogInterval);
            if (deductedMicrocredits > 0) {
                void featureCredit.refund(deductedMicrocredits, selectedModel, "反推未成功积分返还");
            }
            staticMessage.warning("请先选择本地视频或在画布中连线上游视频节点");
            setErrorMsg("请先选择本地视频或在画布中连线上游视频节点");
            setRunning(false);
            setLocalProgress(null);
            updateMetadata?.(node.id, {
                status: (classicPrompt || deconstructPrompt || shotManifest.length > 0) ? "success" : "idle",
                taskStatus: "idle",
                isClientMockTask: true,
                videoReverse: {
                    ...meta,
                    status: (classicPrompt || deconstructPrompt || shotManifest.length > 0) ? "success" : "idle",
                },
            });
            return;
        }

        let prepared: PreparedReverseVideo | null = null;
        try {
            const isDeconstruct = activeTab === "deconstruct";
            const effectiveAsrEnabled = isDeconstruct ? (wordLevelAudio ? localAsrEnabled : false) : localAsrEnabled;

            // 阶段一：本地抽帧与拼图准备
            prepared = await prepareReverseVideo(sourceInput, gridSize, (progress) => {
                lastActivityTime = Date.now();
                if (!controller.signal.aborted) {
                    setLocalProgress(progress);
                }
            }, {
                track: isDeconstruct ? "deconstruct" : "classic",
                samplingPolicy: isDeconstruct
                    ? {
                        mode: "deconstruct",
                        sceneChangeThreshold: sceneThreshold,
                        minSceneGapSec,
                    }
                    : {
                        mode: classicSamplingMode,
                        fps: classicSamplingFps,
                        includeMiddleFrames,
                        sceneChangeThreshold: sceneThreshold,
                        minSceneGapSec,
                    },
                localAsrEnabled: effectiveAsrEnabled,
                signal: controller.signal,
            });

            if (controller.signal.aborted) {
                throw new DOMException("Aborted", "AbortError");
            }

            // 阶段二：多模态 VLM 模型分析
            const effectiveReverseModel = selectedModel || config.textModel || config.model;
            const textModelConfig = {
                ...config,
                model: effectiveReverseModel,
            };

            const defaultDeconstructPrompt = isDeconstruct
                ? await fetchCreativeReversePrompt()
                : undefined;

            const effectiveSystemPrompt = isDeconstruct
                ? (deconstructReplacePrompt && deconstructPromptRules.trim() ? deconstructPromptRules.trim() : (defaultDeconstructPrompt?.trim() || CREATIVE_REVERSE_SHOT_DECONSTRUCTION_SYSTEM_PROMPT))
                : (classicReplacePrompt && classicPromptRules.trim() ? classicPromptRules.trim() : undefined);

            const effectiveRequirement = isDeconstruct
                ? (deconstructCustomRules.trim() ? `【用户要求】\n${deconstructCustomRules.trim()}\n` : "") + (wordLevelAudio ? "【开启词级打标】请对每个镜头中的台词标出具体的字词时间轴（例如：0.0s[熬夜] 0.6s[脸垮] 1.4s[姐妹] 2.1s[看过来]）。" : "")
                : (classicCustomRules.trim() || undefined);

            setStreamedScript("");
            const result = await analyzePreparedReverseVideo({
                config: textModelConfig,
                prepared,
                userRequirement: effectiveRequirement,
                promptRules: effectiveSystemPrompt,
                replaceBuiltInPrompt: isDeconstruct ? true : classicReplacePrompt,
                localAsrEnabled: effectiveAsrEnabled,
                wordLevelAudio: isDeconstruct ? wordLevelAudio : false,
                onProgress: (progress) => {
                    lastActivityTime = Date.now();
                    if (!controller.signal.aborted) {
                        setLocalProgress(progress);
                    }
                },
                onDelta: (delta) => {
                    lastActivityTime = Date.now();
                    if (!controller.signal.aborted) {
                        setStreamedScript((prev) => prev + delta);
                    }
                },
                signal: controller.signal,
            });

            if (controller.signal.aborted) {
                throw new DOMException("Aborted", "AbortError");
            }

            let parsedShots: any[] = [];
            let parsedMasterSlots: any = undefined;
            if (isDeconstruct) {
                const parsed = parseDirectorJson<{ title?: string; coreElements?: any; originalMasterSlots?: any; shots?: any[] }>(result.prompt);
                if (parsed?.shots && Array.isArray(parsed.shots)) {
                    parsedShots = parsed.shots;
                } else {
                    parsedShots = parseMarkdownShots(result.prompt);
                }
                if (parsedShots.length > 0) {
                    setShotManifest(parsedShots);
                }
                const rawSlots = parsed?.coreElements || parsed?.originalMasterSlots;
                if (rawSlots && typeof rawSlots === "object") {
                    parsedMasterSlots = {
                        character: rawSlots.character || rawSlots.actor,
                        actor: rawSlots.actor || rawSlots.character,
                        focalObject: rawSlots.focalObject || rawSlots.product,
                        product: rawSlots.product || rawSlots.focalObject,
                        scene: rawSlots.scene,
                    };
                    setOriginalMasterSlots(parsedMasterSlots);
                }
            }

            const isAudioModel = isAudioCapableModel(selectedModel);
            const asrFeedbackText = result.localAsrResult?.success
                ? `⚡ 本地 ASR 已命中 (${result.localAsrResult.words?.length || 0} 词)`
                : effectiveAsrEnabled
                ? (isAudioModel ? `☁️ 原生听音对齐 (本地 ASR 未就绪平滑回退)` : `⚠️ 仅画面推断 (本地 ASR 离线且模型无音频)`)
                : wordLevelAudio
                ? (isAudioModel ? undefined : `⚠️ 仅画面推断 (模型无音频)`)
                : undefined;
            if (asrFeedbackText) setLocalAsrFeedback(asrFeedbackText);

            // 提取结构化分镜并无缝接入板块五“逐镜头全息工程图纸”，杜绝裸露 JSON 与空缺
            const userFacingScript = isDeconstruct
                ? formatShotManifestToReadableScript(parsedShots, result.prompt)
                : result.prompt;

            if (isDeconstruct) {
                setDeconstructPrompt(userFacingScript);
            } else {
                setClassicPrompt(userFacingScript);
            }
            setLocalProgress({ stage: "analysis", percent: 100, message: isDeconstruct ? "创意反推完成" : "经典反推完成" });

            const trackKey = isDeconstruct ? "deconstruct" : "classic";
            const newContactSheets = prepared?.pages
                ? await Promise.all(
                      prepared.pages.map(async (p) => {
                          const storageKey = `reverse_sheet_${node.id}_${trackKey}_${p.pageIndex}`;
                          await setMediaBlob(storageKey, p.blob);
                          return {
                              pageIndex: p.pageIndex,
                              url: p.url,
                              storageKey,
                              localFilePath: p.localFilePath,
                              frameStart: p.frameStart,
                              frameEnd: p.frameEnd,
                              frameCount: p.frames.length,
                          };
                      }),
                  )
                : undefined;

            const nextClassicTrack: ReverseTrackClassic | undefined = isDeconstruct ? meta.classic : {
                prompt: userFacingScript,
                customRules: classicCustomRules,
                promptRules: classicPromptRules,
                replaceBuiltInPrompt: classicReplacePrompt,
                samplingMode: classicSamplingMode,
                samplingFps: classicSamplingFps,
                includeMiddleFrames,
                sceneThreshold,
                minSceneGapSec,
                contactSheets: newContactSheets,
                updatedAt: Date.now(),
            };

            const nextDeconstructTrack: ReverseTrackDeconstruct | undefined = isDeconstruct ? {
                prompt: userFacingScript,
                rawPrompt: result.prompt,
                shotManifest: parsedShots.length > 0 ? parsedShots : (meta.deconstruct?.shotManifest || meta.shotManifest),
                coreElements: parsedMasterSlots || meta.deconstruct?.coreElements || meta.coreElements,
                originalMasterSlots: parsedMasterSlots || meta.deconstruct?.originalMasterSlots || meta.originalMasterSlots,
                customRules: deconstructCustomRules,
                promptRules: deconstructPromptRules,
                replaceBuiltInPrompt: deconstructReplacePrompt,
                wordLevelAudio,
                contactSheets: newContactSheets,
                updatedAt: Date.now(),
            } : meta.deconstruct;

            // 最终单次同步到全局 Store，同时设置 content 和 prompt 供下游节点与 @ 资产引用
            updateMetadata?.(node.id, {
                status: "success",
                taskStatus: "succeeded",
                content: userFacingScript,
                prompt: userFacingScript,
                isClientMockTask: true,
                videoReverse: {
                    ...meta,
                    status: "success",
                    model: selectedModel,
                    gridSize,
                    samplingMode: isDeconstruct ? "deconstruct" : classicSamplingMode,
                    samplingFps: isDeconstruct ? undefined : classicSamplingFps,
                    includeMiddleFrames,
                    sceneThreshold,
                    minSceneGapSec,
                    customRules: isDeconstruct ? deconstructCustomRules : classicCustomRules,
                    replaceBuiltInPrompt: isDeconstruct ? deconstructReplacePrompt : classicReplacePrompt,
                    promptRules: isDeconstruct ? deconstructPromptRules : classicPromptRules,
                    prompt: userFacingScript,
                    rawPrompt: isDeconstruct ? result.prompt : (meta.rawPrompt || meta.deconstruct?.rawPrompt),
                    shotManifest: isDeconstruct ? (parsedShots.length > 0 ? parsedShots : (meta.deconstruct?.shotManifest || meta.shotManifest)) : (meta.deconstruct?.shotManifest || meta.shotManifest),
                    coreElements: isDeconstruct ? (parsedMasterSlots || meta.deconstruct?.coreElements || meta.coreElements) : (meta.deconstruct?.coreElements || meta.coreElements),
                    originalMasterSlots: isDeconstruct ? (parsedMasterSlots || meta.deconstruct?.originalMasterSlots || meta.originalMasterSlots) : (meta.deconstruct?.originalMasterSlots || meta.originalMasterSlots),
                    isUserEditedScript: false,
                    wordLevelAudio,
                    localAsrEnabled,
                    userTouchedAsr,
                    localAsrFeedback: asrFeedbackText,
                    useNativeFFmpeg: result.isDesktopFFmpegUsed,
                    activeTab,
                    contactSheets: newContactSheets,
                    classic: nextClassicTrack,
                    deconstruct: nextDeconstructTrack,
                    result: { ...result, prompt: userFacingScript },
                    errorDetails: undefined,
                },
            });
        } catch (error) {
            window.clearInterval(watchdogInterval);
            if (deductedMicrocredits > 0) {
                try {
                    await featureCredit.refund(deductedMicrocredits, selectedModel, "反推未成功积分返还");
                } catch (refundErr) {
                    console.error("[video-reverse] 积分返还异常:", refundErr);
                }
            }
            // 极简 UI 提示：面向商业化用户统一输出极简明确提示，绝不展现内部生涩技术词汇与堆栈
            staticMessage.error("反推未成功，积分已返还");
            setErrorMsg("反推未成功，积分已返还");
            console.warn("[video-reverse] 反推未成功:", error);

            const hasAnyResult = Boolean(classicPrompt || deconstructPrompt || shotManifest.length > 0);
            updateMetadata?.(node.id, {
                status: hasAnyResult ? "success" : "idle",
                taskStatus: "idle",
                isClientMockTask: true,
                videoReverse: {
                    ...meta,
                    status: hasAnyResult ? "success" : "idle",
                    errorDetails: isTimedOut ? "反推超时未成功" : (error instanceof Error ? error.message : String(error)),
                },
            });
        } finally {
            window.clearInterval(watchdogInterval);
            setStreamedScript("");
            if (prepared) disposePreparedReverseVideo(prepared, { retainPages: true });
            if (abortControllerRef.current === controller) {
                setRunning(false);
                abortControllerRef.current = null;
            }
        }
    };

    const clearAll = () => {
        if (activeTab === "classic") {
            const classicKeys = meta.classic?.contactSheets?.map((s) => s.storageKey).filter(Boolean) as string[] | undefined;
            if (classicKeys && classicKeys.length > 0) {
                void deleteStoredMedia(classicKeys).catch(() => {});
            }
            meta.classic?.contactSheets?.forEach((sheet) => {
                if (sheet.url && sheet.url.startsWith("blob:")) {
                    try { URL.revokeObjectURL(sheet.url); } catch {}
                }
            });
            setClassicPrompt("");
            setStreamedScript("");
            setLocalProgress(null);
            setErrorMsg("");
            updateMetadata?.(node.id, {
                content: "",
                prompt: "",
                videoReverse: {
                    ...meta,
                    prompt: "",
                    contactSheets: undefined,
                    classic: undefined,
                    status: (deconstructPrompt || shotManifest.length > 0) ? "success" : "idle",
                },
            });
        } else {
            const deconstructKeys = meta.deconstruct?.contactSheets?.map((s) => s.storageKey).filter(Boolean) as string[] | undefined;
            if (deconstructKeys && deconstructKeys.length > 0) {
                void deleteStoredMedia(deconstructKeys).catch(() => {});
            }
            meta.deconstruct?.contactSheets?.forEach((sheet) => {
                if (sheet.url && sheet.url.startsWith("blob:")) {
                    try { URL.revokeObjectURL(sheet.url); } catch {}
                }
            });
            setDeconstructPrompt("");
            setShotManifest([]);
            setOriginalMasterSlots(undefined);
            setStreamedScript("");
            setLocalProgress(null);
            setErrorMsg("");
            updateMetadata?.(node.id, {
                content: "",
                prompt: "",
                videoReverse: {
                    ...meta,
                    prompt: "",
                    contactSheets: undefined,
                    shotManifest: [],
                    coreElements: undefined,
                    originalMasterSlots: undefined,
                    deconstruct: undefined,
                    status: classicPrompt ? "success" : "idle",
                },
            });
        }
    };

    const copyScript = async () => {
        if (!currentActiveScript) return;
        try {
            await navigator.clipboard.writeText(currentActiveScript);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // fallback
        }
    };

    const downloadScriptFile = () => {
        if (!currentActiveScript.trim()) {
            message.warning("暂无脚本内容可下载");
            return;
        }
        const blob = new Blob([currentActiveScript], { type: "text/markdown;charset=utf-8" });
        saveAs(blob, `video-reverse-${activeTab}-${Date.now()}.md`);
        message.success("已下载反推脚本 Markdown 文件");
    };

    const openRulesModal = () => {
        setRulesModalOpen(true);
    };

    const inputBaseStyle = {
        background: theme.node.fill,
        color: theme.node.text,
        borderColor: theme.node.stroke,
    };

    return (
        <div
            className="flex h-full min-h-0 w-full flex-col gap-3.5 overflow-y-auto rounded-[inherit] p-4 text-sm"
            style={{ background: theme.node.panel, color: theme.node.text }}
            data-canvas-no-zoom
            data-canvas-no-drag
            onWheel={(e) => e.stopPropagation()}
        >
            <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileSelect} className="hidden" />

            {/* 顶部标题、模式切换与状态栏 (同一排紧凑排列) */}
            <div className="flex items-center justify-between border-b pb-2.5 gap-2.5" style={{ borderColor: theme.node.stroke }}>
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex items-center gap-2 font-bold text-base shrink-0">
                        <Sparkles className="size-5 text-amber-500" />
                        <span>视频反推</span>
                        {!enabled ? <span className="text-xs font-normal text-rose-500 dark:text-rose-400">(已停用)</span> : null}
                    </div>

                    {/* 模式切换 (紧随文字同一排，严格四字按钮) */}
                    <div className="flex items-center rounded-lg p-0.5 border shrink-0" style={{ background: theme.node.panel, borderColor: theme.node.stroke }}>
                        <button
                            type="button"
                            onClick={() => handleTabChange("classic")}
                            disabled={running}
                            className={`flex h-8 px-3 items-center justify-center rounded-md text-xs font-semibold transition-all ${
                                running
                                    ? "cursor-not-allowed opacity-80"
                                    : "cursor-pointer"
                            } ${
                                activeTab === "classic"
                                    ? (running ? "bg-neutral-400 dark:bg-neutral-600 text-white shadow-xs" : "bg-amber-500 text-white shadow-xs")
                                    : (running ? "text-neutral-400 dark:text-neutral-500 opacity-50" : "hover:opacity-80")
                            }`}
                        >
                            {running && activeTab === "classic" ? "反推中" : "经典反推"}
                        </button>
                        <button
                            type="button"
                            onClick={() => handleTabChange("deconstruct")}
                            disabled={running}
                            className={`flex h-8 px-3 items-center justify-center rounded-md text-xs font-semibold transition-all ${
                                running
                                    ? "cursor-not-allowed opacity-80"
                                    : "cursor-pointer"
                            } ${
                                activeTab === "deconstruct"
                                    ? (running ? "bg-neutral-400 dark:bg-neutral-600 text-white shadow-xs" : "bg-amber-500 text-white shadow-xs")
                                    : (running ? "text-neutral-400 dark:text-neutral-500 opacity-50" : "hover:opacity-80")
                            }`}
                        >
                            {running && activeTab === "deconstruct" ? "反推中" : "创意反推"}
                        </button>
                    </div>

                    <FeatureCreditBadge scene="video_reverse" model={selectedModel} size="small" />
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-auto">
                    {running ? (
                        <span className="flex items-center gap-1.5 text-amber-500 text-xs font-medium">
                            <Loader2 className="size-4 animate-spin" />
                            <span>处理中</span>
                        </span>
                    ) : (activeTab === "deconstruct" ? (shotManifest.length > 0 || deconstructPrompt) : classicPrompt) ? (
                        <span className="flex items-center gap-1.5 text-emerald-500 text-xs font-medium">
                            <Check className="size-4" />
                            <span>已完成</span>
                        </span>
                    ) : null}
                </div>
            </div>

            {/* 模型选择 */}
            <div className="flex items-center gap-2 min-w-0">
                <span style={{ color: theme.node.muted }} className="shrink-0 text-xs font-medium">反推模型</span>
                <div className={running ? "pointer-events-none opacity-60 flex-1 min-w-0 select-none cursor-not-allowed" : "flex-1 min-w-0"}>
                    <ModelPicker
                        config={config}
                        value={selectedModel}
                        onChange={handleModelChange}
                        capability="text"
                        className="h-9 text-sm w-full"
                    />
                </div>
            </div>

            {/* 来源选择与文件上传 */}
            <div className="grid grid-cols-2 gap-2.5">
                <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium" style={{ color: theme.node.muted }}>视频来源</span>
                    <select
                        value={sourceMode}
                        disabled={running}
                        onChange={(e) => setSourceMode(e.target.value as any)}
                        className="h-9 rounded-lg border px-2.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                        style={inputBaseStyle}
                    >
                        <option value="__upstream__">上游视频节点 {upstreamVideo ? "(已连线)" : "(未连线)"}</option>
                        <option value="__local__">本地视频文件</option>
                    </select>
                </div>
                <div className="flex flex-col justify-end">
                    <button
                        type="button"
                        disabled={running}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => fileInputRef.current?.click()}
                        className="flex h-9 items-center justify-center gap-2 rounded-lg border px-2.5 text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        style={inputBaseStyle}
                    >
                        <Upload className="size-4" />
                        <span className="truncate">{localFile ? localFile.name : "选择本地视频"}</span>
                    </button>
                </div>
            </div>

            {/* 模式专属配置 */}
            {activeTab === "classic" ? (
                <>
                    {/* 抽帧模式与拼图网格设置 */}
                    <div className="grid grid-cols-3 gap-2.5">
                        <div className="flex flex-col gap-1.5">
                            <span className="text-xs font-medium" style={{ color: theme.node.muted }}>抽帧模式</span>
                            <select
                                value={classicSamplingMode}
                                disabled={running}
                                onChange={(e) => {
                                    const nextMode = e.target.value as VideoSamplingMode;
                                    setClassicSamplingMode(nextMode);
                                    updateMetadata?.(node.id, {
                                        videoReverse: {
                                            ...meta,
                                            samplingMode: nextMode,
                                            classic: {
                                                ...meta.classic,
                                                samplingMode: nextMode,
                                                updatedAt: Date.now(),
                                            },
                                        },
                                    });
                                }}
                                className="h-9 rounded-lg border px-2.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                style={inputBaseStyle}
                            >
                                <option value="seconds_and_scene">秒级 + 场景</option>
                                <option value="seconds">按秒抽帧</option>
                                <option value="scene">场景突变</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <span className="text-xs font-medium" style={{ color: theme.node.muted }}>拼图密度</span>
                            <select
                                value={gridSize}
                                disabled={running}
                                onChange={(e) => setGridSize(e.target.value === "auto" ? "auto" : (Number(e.target.value) as any))}
                                className="h-9 rounded-lg border px-2.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                style={inputBaseStyle}
                            >
                                <option value="auto">自动密度</option>
                                <option value={9}>9 格</option>
                                <option value={12}>12 格</option>
                                <option value={16}>16 格</option>
                                <option value={24}>24 格</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <span className="text-xs font-medium" style={{ color: theme.node.muted }}>采样频率</span>
                            <div className="flex items-center gap-1.5">
                                <input
                                    type="number"
                                    min={0.1}
                                    max={5}
                                    step={0.1}
                                    disabled={running}
                                    value={classicSamplingFps}
                                    onChange={(e) => {
                                        const nextFps = Math.max(0.1, Number(e.target.value) || 1);
                                        setClassicSamplingFps(nextFps);
                                        updateMetadata?.(node.id, {
                                            videoReverse: {
                                                ...meta,
                                                samplingFps: nextFps,
                                                classic: {
                                                    ...meta.classic,
                                                    samplingFps: nextFps,
                                                    updatedAt: Date.now(),
                                                },
                                            },
                                        });
                                    }}
                                    className="h-9 w-full rounded-lg border px-2 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                    style={inputBaseStyle}
                                />
                                <span className="text-xs font-medium" style={{ color: theme.node.muted }}>fps</span>
                            </div>
                        </div>
                    </div>

                    {/* 中点帧与场景阈值微调 */}
                    <div className="flex items-center justify-between">
                        <label className={`flex items-center gap-2 text-xs font-medium ${running ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`} style={{ color: theme.node.muted }}>
                            <input
                                type="checkbox"
                                disabled={running}
                                checked={includeMiddleFrames}
                                onChange={(e) => setIncludeMiddleFrames(e.target.checked)}
                            />
                            <span>区间插入中点帧 (双倍细节)</span>
                        </label>
                        <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: theme.node.muted }}>
                            <span>场景阈值</span>
                            <input
                                type="number"
                                min={0.1}
                                max={1}
                                step={0.05}
                                disabled={running}
                                value={sceneThreshold}
                                onChange={(e) => setSceneThreshold(Number(e.target.value) || 0.20)}
                                className="h-7 w-14 rounded-md border px-1.5 text-center text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                style={inputBaseStyle}
                            />
                        </div>
                    </div>
                </>
            ) : (
                /* 镜头拆解专属配置 */
                <>
                    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs leading-tight">
                        <Sparkles className="size-3.5 shrink-0 text-amber-500" />
                        <span>工业级分镜拆解专注 60s 内视频；超出部分自动按前 60s 黄金时段拆解</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                        <div className="flex flex-col gap-1.5">
                            <span className="text-xs font-medium" style={{ color: theme.node.muted }}>抽帧策略</span>
                            <div className="flex h-9 items-center rounded-lg border px-2.5 text-xs opacity-90 select-none" style={inputBaseStyle}>
                                <span>自适应 (秒级+场景突变)</span>
                            </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <span className="text-xs font-medium" style={{ color: theme.node.muted }}>拼图密度</span>
                            <select
                                value={gridSize}
                                disabled={running}
                                onChange={(e) => setGridSize(e.target.value === "auto" ? "auto" : (Number(e.target.value) as any))}
                                className="h-9 rounded-lg border px-2.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                style={inputBaseStyle}
                            >
                                <option value="auto">自动密度</option>
                                <option value={12}>12 格 (推荐)</option>
                                <option value={16}>16 格</option>
                                <option value={24}>24 格 (高精)</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <label className={`flex items-center gap-2 text-xs font-medium ${running ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`} style={{ color: theme.node.muted }}>
                            <input
                                type="checkbox"
                                disabled={running}
                                checked={wordLevelAudio}
                                onChange={(e) => {
                                    setWordLevelAudio(e.target.checked);
                                    updateMetadata?.(node.id, {
                                        videoReverse: {
                                            ...meta,
                                            wordLevelAudio: e.target.checked,
                                        },
                                    });
                                }}
                            />
                            <span className="font-medium text-stone-700 dark:text-stone-300">词级语音打标</span>
                        </label>
                        <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: theme.node.muted }}>
                            <span>场景阈值</span>
                            <input
                                type="number"
                                min={0.1}
                                max={1}
                                step={0.05}
                                disabled={running}
                                value={sceneThreshold}
                                onChange={(e) => setSceneThreshold(Number(e.target.value) || 0.20)}
                                className="h-7 w-14 rounded-md border px-1.5 text-center text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                style={inputBaseStyle}
                            />
                        </div>
                    </div>
                </>
            )}

            {/* 本地 ASR 配置 (经典反推与创意反推通用) */}
            <div className="flex items-center justify-between">
                <label
                    className={`flex items-center gap-2 text-xs font-medium ${running ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                    title="开启后优先调用本地电脑显卡/CPU 运行 FunASR 进行毫秒级字词打标；未勾选或本地未就绪时自动平滑采用大模型原生音画听觉打标。"
                    style={{ color: theme.node.muted }}
                >
                    <input
                        type="checkbox"
                        disabled={running}
                        checked={localAsrEnabled}
                        onChange={(e) => {
                            setLocalAsrEnabled(e.target.checked);
                            setUserTouchedAsr(true);
                            updateMetadata?.(node.id, {
                                videoReverse: {
                                    ...meta,
                                    localAsrEnabled: e.target.checked,
                                    userTouchedAsr: true,
                                },
                            });
                        }}
                    />
                    <span className="font-semibold text-stone-700 dark:text-stone-300">本地 ASR (FunASR 优先)</span>
                </label>
                {localAsrFeedback && !localAsrFeedback.includes("大模型原生听音打标") ? (
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                        {localAsrFeedback}
                    </span>
                ) : (
                    <span className="text-xs" style={{ color: theme.node.muted }}>
                        {isAudioCapableModel(selectedModel) ? "原生听音 (故障回退)" : "不支持音频输入"}
                    </span>
                )}
            </div>

            {/* 提示词编辑入口 (全宽按钮) */}
            <button
                type="button"
                onClick={openRulesModal}
                disabled={running}
                onMouseDown={(e) => e.stopPropagation()}
                className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-all ${
                    running ? "cursor-not-allowed opacity-50" : "hover:border-amber-500/60 cursor-pointer"
                }`}
                style={{ background: theme.node.fill, borderColor: theme.node.stroke }}
            >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <SlidersHorizontal className="size-4 text-amber-500 shrink-0" />
                    <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="flex items-center gap-2 font-semibold text-sm">
                            <span>{activeTab === "deconstruct" ? "创意拆解规则编辑" : "经典提示词编辑"}</span>
                            {activeReplacePrompt ? (
                                <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400 font-medium">已替换提示词</span>
                            ) : activeCustomRules.trim() ? (
                                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">已补充提示词</span>
                            ) : (
                                <span className="text-xs" style={{ color: theme.node.muted }}>
                                    默认内置规范
                                </span>
                            )}
                        </div>
                        <span className="truncate text-xs mt-0.5" style={{ color: theme.node.muted }}>
                            {activeReplacePrompt
                                ? (activePromptRules.trim() || "未填写自定义 Prompt")
                                : (activeCustomRules.trim() || (activeTab === "deconstruct" ? "点击微调拆解关注点或完全替换内置拆解提示词" : "点击补充个性化关注点或完全替换内置提示词"))}
                        </span>
                    </div>
                </div>
                <span className="text-xs text-amber-500 font-semibold shrink-0 ml-2">编辑</span>
            </button>

            {/* 进度显示条与实时流式推演 */}
            {localProgress ? (
                <div className="flex flex-col gap-2 rounded-xl border p-2.5 text-xs" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
                    <div className="flex items-center justify-between">
                        <span className="font-semibold flex items-center gap-2" style={{ color: theme.accent.primary }}>
                            <Loader2 className="size-4 animate-spin text-amber-500 shrink-0" />
                            <span>{activeTab === "deconstruct" ? "创意反推处理中" : "视频反推处理中"}</span>
                        </span>
                        <span className="font-mono font-semibold">{localProgress.percent}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                        <div
                            className="h-full bg-amber-500 transition-all duration-300"
                            style={{ width: `${localProgress.percent}%` }}
                        />
                    </div>
                    {localProgress.message ? (
                        <div className="text-xs text-stone-500 dark:text-stone-400 truncate flex items-center gap-1.5">
                            <span>{localProgress.message}</span>
                        </div>
                    ) : null}
                    {streamedScript ? (
                        <div className="mt-1.5 rounded-lg bg-stone-900/5 dark:bg-stone-900/40 p-2 font-mono text-xs text-stone-600 dark:text-stone-300 max-h-32 overflow-y-auto thin-scrollbar break-all leading-relaxed border border-stone-200/50 dark:border-stone-800/50">
                            <div className="flex items-center justify-between text-stone-400 mb-1.5 text-xs">
                                <span>⚡ 实时推演输出 ({streamedScript.length} 字)</span>
                                <span className="animate-pulse text-amber-500 font-semibold">写入中...</span>
                            </div>
                            <div className="whitespace-pre-wrap">{streamedScript.slice(-300)}</div>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {/* 错误提示 */}
            {errorMsg ? (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-rose-600 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-400">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    <span className="break-all text-xs">{errorMsg}</span>
                </div>
            ) : null}

            {/* 反推与分镜结果展示 */}
            {activeTab === "deconstruct" ? (
                shotManifest.length > 0 ? (
                    <div className="flex flex-col gap-2 rounded-xl border p-3 text-xs" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 font-semibold">
                                <Layers className="size-4 text-amber-500" />
                                <span>创意反推分镜图纸</span>
                                <Tag color="orange" className="m-0 text-xs px-2 py-0.5 leading-tight">
                                    {shotManifest.length} 镜
                                </Tag>
                            </div>
                            <div className="flex items-center gap-2.5">
                                {activeContactSheets && activeContactSheets.length > 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => setContactSheetsModalOpen(true)}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className="flex items-center gap-1 hover:text-amber-500 transition-colors cursor-pointer"
                                        title="查看抽帧对白证据拼图"
                                    >
                                        <ImageIcon className="size-3.5" />
                                        <span>拼图({activeContactSheets.length})</span>
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={() => setExpandedModalOpen(true)}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1 hover:text-amber-500 transition-colors cursor-pointer"
                                    title="放大查看分镜清单"
                                >
                                    <Maximize2 className="size-3.5" />
                                    <span>放大</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={copyScript}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1 hover:text-amber-500 transition-colors cursor-pointer"
                                    title="复制分镜脚本"
                                >
                                    {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                                    <span>{copied ? "已复制" : "复制"}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={downloadScriptFile}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1 text-amber-500 font-medium hover:text-amber-600 transition-colors cursor-pointer"
                                    title="下载分镜图纸"
                                >
                                    <Download className="size-3.5" />
                                    <span>下载</span>
                                </button>
                            </div>
                        </div>

                        {/* 视听核心要素概览 */}
                        {originalMasterSlots && (originalMasterSlots.character || originalMasterSlots.actor || originalMasterSlots.focalObject || originalMasterSlots.product || originalMasterSlots.scene) ? (
                            <div className="flex flex-col gap-1 rounded-lg bg-stone-50 dark:bg-stone-900/40 border border-stone-200/60 dark:border-stone-800/60 p-2 text-xs text-stone-600 dark:text-stone-300">
                                <div className="flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-400">
                                    <span>🎯 视听核心要素</span>
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-1 leading-snug">
                                    {(originalMasterSlots.character || originalMasterSlots.actor) ? (
                                        <span className="truncate max-w-[240px]" title={originalMasterSlots.character || originalMasterSlots.actor}>
                                            👤 主体/人物: {originalMasterSlots.character || originalMasterSlots.actor}
                                        </span>
                                    ) : null}
                                    {(originalMasterSlots.focalObject || originalMasterSlots.product) ? (
                                        <span className="truncate max-w-[240px]" title={originalMasterSlots.focalObject || originalMasterSlots.product}>
                                            📦 焦点物品/道具: {originalMasterSlots.focalObject || originalMasterSlots.product}
                                        </span>
                                    ) : null}
                                    {originalMasterSlots.scene ? (
                                        <span className="truncate max-w-[240px]" title={originalMasterSlots.scene}>
                                            🏠 场域/空间: {originalMasterSlots.scene}
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                        ) : null}

                        {/* 镜头预览卡片流 */}
                        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-0.5 thin-scrollbar">
                            {shotManifest.map((shot: any, idx: number) => {
                                const isARoll = shot.shotType === "a-roll";
                                const isLCut = shot.shotType === "l-cut";
                                const isPov = shot.shotType === "pov";
                                const isSplit = shot.shotType === "split";
                                return (
                                    <div
                                        key={idx}
                                        className="flex flex-col gap-1.5 rounded-xl border p-2.5 text-xs transition-colors hover:border-amber-400"
                                        style={{ background: theme.node.panel, borderColor: theme.node.stroke }}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-amber-600 dark:text-amber-400">
                                                    镜 {shot.shotNumber || idx + 1}
                                                </span>
                                                <span
                                                    className={`rounded-md px-1.5 py-0.5 text-xs font-semibold uppercase ${
                                                        isARoll
                                                            ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                                                            : isLCut
                                                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                                            : isPov
                                                            ? "bg-teal-500/10 text-teal-600 dark:text-teal-400"
                                                            : isSplit
                                                            ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                                                            : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                                    }`}
                                                >
                                                    {isARoll ? "A-Roll口播" : isLCut ? "L-Cut伴音盖镜" : isPov ? "POV第一视角" : isSplit ? "Split分屏" : "B-Roll特写"}
                                                </span>
                                                {shot.hookType ? (
                                                    <span className="rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 text-xs font-medium">
                                                        🔥 {shot.hookType}
                                                    </span>
                                                ) : shot.narrativeFunction ? (
                                                    <span className="rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 px-1.5 py-0.5 text-xs font-medium">
                                                        🎬 {shot.narrativeFunction}
                                                    </span>
                                                ) : null}
                                                <span className="font-mono text-xs" style={{ color: theme.node.muted }}>
                                                    {shot.timeRange || `${shot.startSec || 0}s - ${shot.endSec || 3}s`}
                                                </span>
                                            </div>
                                            <span className="text-xs text-neutral-400 truncate max-w-[150px]">
                                                {shot.camera || shot.scaleAndAngle || shot.cameraMovement || ""}
                                            </span>
                                        </div>

                                        <div className="text-xs leading-relaxed font-normal text-neutral-800 dark:text-neutral-200">
                                            {shot.visualAction || shot.visualContent || shot.visualSubject || "（画面详情）"}
                                        </div>

                                        {shot.dialogue ? (
                                            <div className="flex items-start gap-1.5 rounded-lg bg-stone-100/80 dark:bg-stone-800/50 px-2 py-1.5 text-xs text-stone-700 dark:text-stone-300">
                                                <Mic className="size-3.5 shrink-0 text-amber-500 mt-0.5" />
                                                <span className="leading-relaxed">
                                                    {shot.dialogue}
                                                    {shot.voiceTone ? <span className="opacity-75 ml-1">({shot.voiceTone})</span> : null}
                                                </span>
                                            </div>
                                        ) : null}

                                        {(shot.soundFx || shot.lightingTone || shot.soundAndBgm || shot.sfxCue) ? (
                                            <div className="truncate text-xs opacity-75">
                                                ✨ {[shot.soundFx ? `音效: ${shot.soundFx}` : "", shot.lightingTone ? `光影: ${shot.lightingTone}` : "", (shot.soundAndBgm || shot.sfxCue) ? `视听: ${shot.soundAndBgm || shot.sfxCue}` : ""].filter(Boolean).join(" · ")}
                                            </div>
                                        ) : null}
                                        {shot.focalAnchor || shot.productAnchor ? (
                                            <div className="truncate text-xs font-medium text-amber-600/90 dark:text-amber-400/90">
                                                🎯 核心锚点: {shot.focalAnchor || shot.productAnchor}
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : deconstructPrompt ? (
                    <div
                        className="flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs"
                        style={{ background: theme.node.fill, borderColor: theme.node.stroke }}
                    >
                        <div className="flex items-center gap-2 min-w-0">
                            <Sparkles className="size-4 text-amber-500 shrink-0" />
                            <span className="truncate font-semibold text-xs">创意反推分镜图纸已就绪</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                            {activeContactSheets && activeContactSheets.length > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => setContactSheetsModalOpen(true)}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1 hover:text-amber-500 transition-colors cursor-pointer"
                                    title="查看抽帧对白证据拼图"
                                >
                                    <ImageIcon className="size-3.5" />
                                    <span>拼图({activeContactSheets.length})</span>
                                </button>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => setExpandedModalOpen(true)}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="flex items-center gap-1 hover:text-amber-500 transition-colors cursor-pointer"
                                title="放大查看分镜清单"
                            >
                                <Maximize2 className="size-3.5" />
                                <span>放大</span>
                            </button>
                            <button
                                type="button"
                                onClick={copyScript}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="flex items-center gap-1 hover:text-amber-500 transition-colors cursor-pointer"
                                title="复制分镜脚本"
                            >
                                {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                                <span>{copied ? "已复制" : "复制"}</span>
                            </button>
                            <button
                                type="button"
                                onClick={downloadScriptFile}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="flex items-center gap-1 text-amber-500 font-medium hover:text-amber-600 transition-colors cursor-pointer"
                                title="下载分镜图纸"
                            >
                                <Download className="size-3.5" />
                                <span>下载</span>
                            </button>
                        </div>
                    </div>
                ) : null
            ) : (
                classicPrompt ? (
                    <div
                        className="flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs"
                        style={{ background: theme.node.fill, borderColor: theme.node.stroke }}
                    >
                        <div className="flex items-center gap-2 min-w-0">
                            <Sparkles className="size-4 text-amber-500 shrink-0" />
                            <span className="truncate font-semibold text-xs">经典反推手册已就绪</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                            {activeContactSheets && activeContactSheets.length > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => setContactSheetsModalOpen(true)}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1 hover:text-amber-500 transition-colors cursor-pointer"
                                    title="查看抽帧对白证据拼图"
                                >
                                    <ImageIcon className="size-3.5" />
                                    <span>拼图({activeContactSheets.length})</span>
                                </button>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => setExpandedModalOpen(true)}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="flex items-center gap-1 hover:text-amber-500 transition-colors cursor-pointer"
                                title="放大查看与编辑反推报告"
                            >
                                <Maximize2 className="size-3.5" />
                                <span>放大</span>
                            </button>
                            <button
                                type="button"
                                onClick={copyScript}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="flex items-center gap-1 hover:text-amber-500 transition-colors cursor-pointer"
                                title="复制反推脚本"
                            >
                                {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                                <span>{copied ? "已复制" : "复制"}</span>
                            </button>
                            <button
                                type="button"
                                onClick={downloadScriptFile}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="flex items-center gap-1 text-amber-500 font-medium hover:text-amber-600 transition-colors cursor-pointer"
                                title="下载文件"
                            >
                                <Download className="size-3.5" />
                                <span>下载</span>
                            </button>
                        </div>
                    </div>
                ) : null
            )}

            {/* 底部动作操作栏 */}
            <div className="mt-auto flex items-center justify-between pt-2.5">
                <button
                    type="button"
                    onClick={clearAll}
                    onMouseDown={(e) => e.stopPropagation()}
                    disabled={running}
                    className="flex h-9 items-center gap-1.5 rounded-lg border px-3.5 text-sm transition-colors hover:opacity-80 disabled:opacity-50 cursor-pointer"
                    style={inputBaseStyle}
                >
                    <RefreshCw className="size-3.5" />
                    <span>清空</span>
                </button>

                <div className="flex items-center gap-2">
                    {running ? (
                        <button
                            type="button"
                            disabled
                            onMouseDown={(e) => e.stopPropagation()}
                            className="flex h-9 items-center gap-2 rounded-lg bg-neutral-300 dark:bg-neutral-700 px-4 text-sm font-medium text-neutral-500 dark:text-neutral-400 cursor-not-allowed border-none shadow-none select-none"
                        >
                            <Loader2 className="size-3.5 animate-spin text-neutral-400 dark:text-neutral-500" />
                            <span>反推中</span>
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={runAnalysis}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="flex h-9 items-center gap-2 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-white shadow-sm transition-transform hover:bg-amber-600 active:scale-95 cursor-pointer"
                        >
                            <Play className="size-3.5 fill-current" />
                            <span>
                                {activeTab === "deconstruct"
                                    ? ((shotManifest.length > 0 || deconstructPrompt) ? "重新创意反推" : "开始创意反推")
                                    : (classicPrompt ? "重新经典反推" : "开始经典反推")}
                            </span>
                        </button>
                    )}
                </div>
            </div>

            {/* 提示词编辑弹窗 */}
            <PromptEditorModal
                open={rulesModalOpen}
                onClose={() => setRulesModalOpen(false)}
                nodeTitle={activeTab === "deconstruct" ? "创意拆解" : "经典反推"}
                initialMode={activeReplacePrompt ? "replace" : "supplement"}
                supplementPrompt={activeCustomRules}
                replacePrompt={activePromptRules}
                onSave={({ mode, supplementPrompt, replacePrompt: nextReplacePrompt }) => {
                    const isReplace = mode === "replace";
                    if (activeTab === "classic") {
                        setClassicCustomRules(supplementPrompt);
                        setClassicReplacePrompt(isReplace);
                        setClassicPromptRules(nextReplacePrompt);
                        updateMetadata?.(node.id, {
                            videoReverse: {
                                ...meta,
                                customRules: supplementPrompt,
                                replaceBuiltInPrompt: isReplace,
                                promptRules: nextReplacePrompt,
                                classic: {
                                    ...meta.classic,
                                    customRules: supplementPrompt,
                                    replaceBuiltInPrompt: isReplace,
                                    promptRules: nextReplacePrompt,
                                    updatedAt: Date.now(),
                                },
                            },
                        });
                    } else {
                        setDeconstructCustomRules(supplementPrompt);
                        setDeconstructReplacePrompt(isReplace);
                        setDeconstructPromptRules(nextReplacePrompt);
                        updateMetadata?.(node.id, {
                            videoReverse: {
                                ...meta,
                                customRules: supplementPrompt,
                                replaceBuiltInPrompt: isReplace,
                                promptRules: nextReplacePrompt,
                                deconstruct: {
                                    ...meta.deconstruct,
                                    customRules: supplementPrompt,
                                    replaceBuiltInPrompt: isReplace,
                                    promptRules: nextReplacePrompt,
                                    updatedAt: Date.now(),
                                },
                            },
                        });
                    }
                }}
                savedPresets={savedRulePresets}
                onSavePreset={(newPreset) => {
                    const next = [newPreset, ...savedRulePresets.filter((item) => item.title !== newPreset.title)].slice(0, 20);
                    setSavedRulePresets(next);
                    writeSavedPresets(RULE_PRESETS_STORAGE_KEY, next);
                    message.success(`已保存预设: ${newPreset.title}`);
                }}
                onDeletePreset={(presetId) => {
                    const next = savedRulePresets.filter((item) => item.id !== presetId);
                    setSavedRulePresets(next);
                    writeSavedPresets(RULE_PRESETS_STORAGE_KEY, next);
                }}
            />

            {/* 报告放大编辑弹窗 */}
            <Modal
                open={expandedModalOpen}
                onCancel={() => setExpandedModalOpen(false)}
                footer={null}
                width={960}
                destroyOnClose
                title={
                    <div className="flex items-center justify-between pr-8">
                        <div className="flex items-center gap-2 text-base font-semibold">
                            <Maximize2 className="size-4 text-amber-500" />
                            <span>{activeTab === "deconstruct" ? "镜头拆解图纸 / 提示词编辑" : "视频反推报告 / 提示词编辑"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                                <Check className="size-3.5" />
                                <span>修改实时自动保存</span>
                            </span>
                            <button
                                type="button"
                                onClick={copyScript}
                                className="flex items-center gap-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2.5 py-1 text-xs text-neutral-700 dark:text-neutral-200 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700"
                            >
                                {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                                <span>{copied ? "已复制" : "复制报告"}</span>
                            </button>
                        </div>
                    </div>
                }
            >
                <div
                    className="flex flex-col gap-2.5 pt-2 text-sm"
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                        if (e.key !== "Escape") e.stopPropagation();
                    }}
                >
                    <div className="text-xs text-neutral-500">
                        在此修改视频反推或提示词内容，修改后将实时自动保存并同步至画布节点；连接至下游生图、生视频或 LLM 节点时，将按照您修改后的最新内容接入。
                    </div>
                    <textarea
                        value={currentActiveScript}
                        onChange={(e) => handleResultScriptChange(e.target.value)}
                        rows={20}
                        className="w-full resize-y rounded-lg border p-4 font-mono text-[15px] leading-relaxed focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100"
                        placeholder={activeTab === "deconstruct" ? "创意拆解分镜脚本输出内容为空..." : "视频反推报告输出内容为空..."}
                    />
                    <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1">
                        <span>总字数：{currentActiveScript.length} 字</span>
                        <button
                            type="button"
                            onClick={() => setExpandedModalOpen(false)}
                            className="rounded bg-amber-500 hover:bg-amber-400 active:bg-amber-600 px-4 py-1 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                            style={{ color: "#0c0a09" }}
                        >
                            <span className="font-semibold" style={{ color: "#0c0a09" }}>完成并关闭</span>
                        </button>
                    </div>
                </div>
            </Modal>

            {/* 抽帧证据拼图查看弹窗 */}
            <Modal
                open={contactSheetsModalOpen}
                onCancel={() => setContactSheetsModalOpen(false)}
                footer={null}
                width={1000}
                destroyOnClose
                title={
                    <div className="flex items-center justify-between pr-8">
                        <div className="flex items-center gap-2 text-base font-semibold">
                            <ImageIcon className="size-4 text-amber-500" />
                            <span>抽帧对白证据拼图 ({activeTab === "classic" ? "经典反推" : "创意反推"} · 共 {activeContactSheets?.length || 0} 张)</span>
                        </div>
                        {typeof window !== "undefined" && (window as any).desktopBridge?.openMediaSaveDir ? (
                            <button
                                type="button"
                                onClick={() => (window as any).desktopBridge?.openMediaSaveDir?.("contact-sheets")}
                                className="flex items-center gap-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1 text-xs text-neutral-700 dark:text-neutral-200 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700 cursor-pointer"
                            >
                                <FolderOpen className="size-3.5 text-amber-500" />
                                <span>在本地文件夹中打开</span>
                            </button>
                        ) : null}
                    </div>
                }
            >
                <div
                    className="flex flex-col gap-4 pt-2 max-h-[75vh] overflow-y-auto pr-2 thin-scrollbar"
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                        if (e.key !== "Escape") e.stopPropagation();
                    }}
                >
                    <div className="text-xs text-neutral-500">
                        抽帧证据拼图包含每一帧的毫秒级时间戳、抽帧模式（首末基准帧、突变触发帧）以及匹配的 FunASR 活跃对白与语境句子，是视觉多模态大模型进行精准镜头拆解的直接依据。
                    </div>
                    <div className="flex flex-col gap-6">
                        {activeContactSheets?.map((sheet, sIdx) => (
                            <ContactSheetItem
                                key={`${activeTab}_${sheet.storageKey || sheet.pageIndex}_${sIdx}`}
                                sheet={sheet}
                            />
                        ))}
                    </div>
                </div>
            </Modal>
        </div>
    );
}

function ContactSheetItem({ sheet }: { sheet: NonNullable<ReverseMeta["contactSheets"]>[number] }) {
    const [resolvedUrl, setResolvedUrl] = useState<string>(sheet.url || "");

    useEffect(() => {
        let active = true;
        let createdUrl = "";

        const restoreImage = async () => {
            // 1. 如果已有非 blob URL 直接使用
            if (sheet.url && !sheet.url.startsWith("blob:")) {
                if (active) setResolvedUrl(sheet.url);
                return;
            }

            // 2. 从本地 IndexedDB 缓存持久化恢复 (Web 与桌面通用)
            if (sheet.storageKey) {
                try {
                    const blob = await getMediaBlob(sheet.storageKey);
                    if (blob && active) {
                        createdUrl = URL.createObjectURL(blob);
                        setResolvedUrl(createdUrl);
                        return;
                    }
                } catch {}
            }

            // 3. 桌面环境从磁盘本地路径恢复 (Electron)
            if (sheet.localFilePath && typeof window !== "undefined") {
                const bridge = (window as any).desktopBridge;
                if (bridge?.readMediaFile) {
                    try {
                        const fileRes = await bridge.readMediaFile(sheet.localFilePath);
                        if (fileRes?.success && fileRes.blob && active) {
                            createdUrl = URL.createObjectURL(fileRes.blob);
                            setResolvedUrl(createdUrl);
                            return;
                        }
                    } catch {}
                }
            }

            if (sheet.url && active) {
                setResolvedUrl(sheet.url);
            }
        };

        void restoreImage();

        return () => {
            active = false;
            if (createdUrl) {
                try { URL.revokeObjectURL(createdUrl); } catch {}
            }
        };
    }, [sheet.url, sheet.storageKey, sheet.localFilePath]);

    return (
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 bg-neutral-50 dark:bg-neutral-900/50">
            <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    第 {sheet.pageIndex} 页
                    {sheet.frameStart && sheet.frameEnd ? ` (帧 F${String(sheet.frameStart).padStart(4, "0")} - F${String(sheet.frameEnd).padStart(4, "0")}, 共 ${sheet.frameCount || 0} 帧)` : ""}
                </span>
                {resolvedUrl ? (
                    <a
                        href={resolvedUrl}
                        download={`contact_sheet_p${sheet.pageIndex}.jpg`}
                        className="flex items-center gap-1 text-amber-500 hover:text-amber-600 font-medium transition-colors cursor-pointer"
                        title="下载此拼图"
                    >
                        <Download className="size-3.5" />
                        <span>下载图片</span>
                    </a>
                ) : null}
            </div>
            <div className="overflow-hidden rounded border border-neutral-300 dark:border-neutral-700 bg-black flex items-center justify-center min-h-[140px]">
                {resolvedUrl ? (
                    <img
                        src={resolvedUrl}
                        alt={`Contact Sheet Page ${sheet.pageIndex}`}
                        className="w-full object-contain max-h-[60vh]"
                        loading="lazy"
                    />
                ) : (
                    <span className="text-xs text-neutral-400">正在恢复拼图证据...</span>
                )}
            </div>
            {sheet.localFilePath ? (
                <div className="truncate text-[10px] font-mono text-neutral-400" title={sheet.localFilePath}>
                    💾 本地保存路径: {sheet.localFilePath}
                </div>
            ) : null}
        </div>
    );
}
