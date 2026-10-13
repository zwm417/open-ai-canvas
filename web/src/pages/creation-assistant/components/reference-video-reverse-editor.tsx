import { Check, FileText, FolderOpen, LoaderCircle, RotateCcw, SlidersHorizontal, Sparkles, Upload, Video, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, App, Button, Input, Progress, Select, Tag } from "antd";

import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { FeatureCreditBadge } from "@/components/feature-credit-badge";
import { deleteStoredMedia, getMediaBlob, resolveMediaUrl, uploadMediaFile } from "@/services/file-storage";
import {
    analyzePreparedReverseVideo,
    disposePreparedReverseVideo,
    prepareReverseVideo,
    type PreparedReverseVideo,
    type ReverseAnalysisProgress,
} from "@/extensions/opc-infinite/services/video-reverse-analysis";
import {
    CREATIVE_REVERSE_SHOT_DECONSTRUCTION_SYSTEM_PROMPT,
    fetchCreativeReversePrompt,
    formatShotManifestToReadableScript,
    parseDirectorJson,
    parseMarkdownShots,
} from "@/extensions/opc-infinite/prompts/hypit-director-prompts";
import { useConfigStore, type AiConfig } from "@/stores/use-config-store";
import { useCreationAssistantStore } from "@/stores/use-creation-assistant-store";
import { VAULT_PROMPT_IDS } from "@/services/api/prompt-vault";
import { useFeatureCredit } from "@/hooks/use-feature-credit";
import type { ReferenceVideo } from "@/types/media";
import type { ReverseGridSize } from "@/extensions/opc-infinite/services/video-reverse-contracts";
import { sanitizeAgentPolicyJson, type VideoSamplingMode } from "@/extensions/opc-infinite/media/video-decomposition";

const GRID_OPTIONS: Array<{ label: string; value: ReverseGridSize }> = [
    { label: "自动", value: "auto" },
    { label: "9 格 / 拼图", value: 9 },
    { label: "12 格 / 拼图", value: 12 },
    { label: "16 格 / 拼图", value: 16 },
    { label: "24 格 / 拼图", value: 24 },
];

const SAMPLING_MODE_OPTIONS: Array<{ label: string; value: VideoSamplingMode }> = [
    { label: "按秒抽帧", value: "seconds" },
    { label: "按场景变化抽帧", value: "scene" },
    { label: "按秒 + 场景变化（推荐）", value: "seconds_and_scene" },
    { label: "Agent 自定义策略", value: "agent" },
];

export type ReferenceVideoReverseEditorProps = {
    embedded?: boolean;
    reverseInferenceConfig: AiConfig;
    multimodalConfig: AiConfig;
    textConfig: AiConfig;
    initialVideo?: ReferenceVideo;
    activeMode?: "classic" | "deconstruct";
    onActiveModeChange?: (mode: "classic" | "deconstruct") => void;
    onApply?: (prompt: string, durationSec: number) => void;
    onClose?: () => void;
};

export function ReferenceVideoReverseEditor({
    embedded = false,
    reverseInferenceConfig,
    multimodalConfig,
    textConfig,
    initialVideo,
    activeMode: propActiveMode,
    onActiveModeChange,
    onApply,
    onClose,
}: ReferenceVideoReverseEditorProps) {
    const { message } = App.useApp();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const draft = useCreationAssistantStore((state) => state.draft);
    const updateDraft = useCreationAssistantStore((state) => state.updateDraft);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);

    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [agentPolicyText, setAgentPolicyText] = useState(() => draft.reverseAgentPolicyJson || "");

    // 经典反推独立运行状态
    const [classicRunning, setClassicRunning] = useState(false);
    const [classicProgress, setClassicProgress] = useState<ReverseAnalysisProgress>({ stage: "frames", percent: 0, message: "等待启动" });
    const [classicStreamText, setClassicStreamText] = useState("");

    // 创意反推独立运行状态
    const [deconstructRunning, setDeconstructRunning] = useState(false);
    const [deconstructProgress, setDeconstructProgress] = useState<ReverseAnalysisProgress>({ stage: "frames", percent: 0, message: "等待启动" });
    const [deconstructStreamText, setDeconstructStreamText] = useState("");

    const currentMode = propActiveMode || draft.reverseActiveMode || "classic";
    const selectedVideo = initialVideo || draft.referenceVideos[0];

    const hasModelConfig = useMemo(
        () => isAiConfigReady(reverseInferenceConfig, reverseInferenceConfig.model) || isAiConfigReady(multimodalConfig, multimodalConfig.model) || isAiConfigReady(textConfig, textConfig.model),
        [isAiConfigReady, multimodalConfig, reverseInferenceConfig, textConfig],
    );

    const effectiveReverseModel = reverseInferenceConfig.model || multimodalConfig.model || textConfig.model;
    const featureCredit = useFeatureCredit("assistant_video_reverse", effectiveReverseModel);

    // 双模式视图切换状态（若有生成内容则默认展示结果，调整参数时不冲掉已有脚本）
    const [viewModeOverride, setViewModeOverride] = useState<Record<"classic" | "deconstruct", "result" | "config">>({
        classic: "result",
        deconstruct: "result",
    });

    const currentPromptValue = currentMode === "deconstruct" ? (draft.deconstructPrompt || "") : (draft.classicPrompt || "");
    const currentError = currentMode === "deconstruct" ? draft.deconstructError : draft.classicError;

    // 当前模式是否已有生成的参考脚本（未点击应用前持续保存在弹窗中，除非被新反推成功覆盖）
    const hasExistingScript = Boolean(currentPromptValue?.trim());
    const currentViewMode = hasExistingScript ? (viewModeOverride[currentMode] || "result") : "config";

    // 判定当前所选模式是否正在运行（结合局部活跃态与 Store 状态机双向自愈）
    const isCurrentRunning = currentMode === "classic"
        ? (classicRunning || draft.classicStatus === "preparing" || draft.classicStatus === "analyzing")
        : (deconstructRunning || draft.deconstructStatus === "preparing" || draft.deconstructStatus === "analyzing");
    const currentProgress = currentMode === "classic" ? classicProgress : deconstructProgress;
    const currentStreamText = currentMode === "classic" ? classicStreamText : deconstructStreamText;

    useEffect(() => {
        setAgentPolicyText(draft.reverseAgentPolicyJson || "");
    }, [draft.reverseAgentPolicyJson]);

    // 本地文件上传
    const selectVideoFile = async (file?: File) => {
        if (!file || !file.type.startsWith("video/")) {
            message.warning("请选择 MP4、MOV 或 WebM 视频文件");
            return;
        }
        try {
            const stored = await uploadMediaFile(file, "creation-assistant-reference-reverse");
            const reference: ReferenceVideo = {
                id: stored.storageKey,
                name: file.name,
                type: stored.mimeType,
                url: stored.url,
                storageKey: stored.storageKey,
                bytes: stored.bytes,
                width: stored.width,
                height: stored.height,
                durationMs: stored.durationMs,
            };
            updateDraft({
                referenceVideos: [reference],
            });
            message.success(`已上传视频素材：${file.name}`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "视频保存失败");
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    // 资产库导入处理（支持多级缓存与确定性媒体寻址）
    const handleInsertAsset = async (payloads: InsertAssetPayload[]) => {
        const payload = payloads[0];
        if (!payload) return;
        if (payload.kind !== "video") {
            message.warning("请从资产库选择视频素材");
            return;
        }
        setAssetPickerOpen(false);
        let targetUrl = payload.url;
        if (payload.storageKey) {
            const resolved = await resolveMediaUrl(payload.storageKey, payload.url);
            if (resolved) targetUrl = resolved;
        }
        const refVideo: ReferenceVideo = {
            id: payload.storageKey || payload.assetId || `asset-${Date.now()}`,
            name: payload.title || "已导入视频资产",
            type: payload.mimeType || "video/mp4",
            url: targetUrl,
            storageKey: payload.storageKey || "",
            bytes: payload.bytes || 0,
            width: payload.width || 0,
            height: payload.height || 0,
            durationMs: payload.durationMs || 0,
        };
        updateDraft({
            referenceVideos: [refVideo],
        });
        message.success(`已从资产库导入视频：${refVideo.name}`);
    };

    // 解析视频媒体源（严格对齐 L1 内存 / L2 IndexedDB / 本地直读 / 远端网关 多级缓存机制）
    const resolveSource = async (signal?: AbortSignal, reportProgress?: (progress: ReverseAnalysisProgress) => void): Promise<Blob | File | string> => {
        if (selectedVideo?.storageKey) {
            const stored = await getMediaBlob(selectedVideo.storageKey);
            if (stored) return stored;
            const resolved = await resolveMediaUrl(selectedVideo.storageKey, selectedVideo.url);
            if (resolved) {
                if (resolved.startsWith("blob:") || resolved.startsWith("data:")) {
                    const response = await fetch(resolved, signal ? { signal } : undefined);
                    if (response.ok) return response.blob();
                }
                return resolved;
            }
        }
        if (selectedVideo?.url) {
            if (selectedVideo.url.startsWith("blob:") || selectedVideo.url.startsWith("data:")) {
                const response = await fetch(selectedVideo.url, signal ? { signal } : undefined);
                if (response.ok) return response.blob();
            }
            return selectedVideo.url;
        }
        throw new Error("请先上传视频或从资产导入视频素材");
    };

    // 开始执行反推（与画布节点一致：不可取消和中止）
    const startAnalysis = async () => {
        if (!selectedVideo) {
            message.warning("请先上传或从资产导入视频素材");
            return;
        }
        if (!hasModelConfig) {
            message.warning("请先在设置中配置多模态模型或文本模型");
            return;
        }

        if (featureCredit.isEnabled && !featureCredit.hasSufficientBalance) {
            message.error(featureCredit.isTokenMultiplier ? "当前积分余额不足，请先充值或签到领取积分后再执行此功能" : `当前积分余额不足（需 ${featureCredit.costCredits} 积分）`);
            return;
        }

        const isDeconstruct = currentMode === "deconstruct";
        let deductedMicrocredits = 0;
        try {
            const deductRes = await featureCredit.deduct(
                effectiveReverseModel,
                isDeconstruct ? "生视频工作台 · 创作助手 · 创意反推" : "生视频工作台 · 创作助手 · 经典反推"
            );
            deductedMicrocredits = deductRes.deductedMicrocredits;
        } catch (creditErr: any) {
            message.error(creditErr?.response?.data?.message || creditErr?.message || "视频反推积分扣减失败，余额不足");
            return;
        }

        const controller = new AbortController();

        if (isDeconstruct) {
            setDeconstructRunning(true);
            setDeconstructStreamText("");
            setDeconstructProgress({ stage: "frames", percent: 5, message: "正在启动创意反推与镜头抽帧..." });
            updateDraft({
                deconstructStatus: "preparing",
                deconstructError: "",
            });
        } else {
            setClassicRunning(true);
            setClassicStreamText("");
            setClassicProgress({ stage: "frames", percent: 5, message: "正在启动经典反推与时序抽帧..." });
            updateDraft({
                classicStatus: "preparing",
                classicError: "",
            });
        }

        const reportProgress = (p: ReverseAnalysisProgress) => {
            if (isDeconstruct) {
                setDeconstructProgress(p);
            } else {
                setClassicProgress(p);
            }
        };

        const handleDelta = (delta: string) => {
            if (isDeconstruct) {
                setDeconstructStreamText((prev) => prev + delta);
            } else {
                setClassicStreamText((prev) => prev + delta);
            }
        };

        let prepared: PreparedReverseVideo | null = null;
        try {
            const source = await resolveSource(controller.signal, reportProgress);

            if (isDeconstruct) {
                // 创意反推：工业级镜头拆解管线（对齐画布：0.15 阈值、0.25s 最小间隔、本地 ASR）
                const effectiveAsrEnabled = (draft.deconstructWordLevelAudio ?? true)
                    ? (draft.deconstructLocalAsrEnabled ?? true)
                    : false;

                prepared = await prepareReverseVideo(source, draft.deconstructGridSize || "auto", reportProgress, {
                    track: "deconstruct",
                    samplingPolicy: {
                        mode: "deconstruct",
                        sceneChangeThreshold: draft.deconstructSceneThreshold ?? 0.15,
                        minSceneGapSec: draft.deconstructMinSceneGapSec ?? 0.25,
                    },
                    localAsrEnabled: effectiveAsrEnabled,
                    signal: controller.signal,
                });

                updateDraft({
                    deconstructStatus: "analyzing",
                    deconstructDurationSec: prepared.durationSec,
                    deconstructFrameCount: prepared.frameCount,
                });

                const defaultDeconstructPrompt = await fetchCreativeReversePrompt();
                const effectiveSystemPrompt = defaultDeconstructPrompt?.trim() || CREATIVE_REVERSE_SHOT_DECONSTRUCTION_SYSTEM_PROMPT;
                const effectiveRequirement =
                    (draft.deconstructCustomRules?.trim() ? `【用户要求】\n${draft.deconstructCustomRules.trim()}\n` : "") +
                    ((draft.deconstructWordLevelAudio ?? true)
                        ? "【开启词级打标】请对每个镜头中的台词标出具体的字词时间轴（例如：0.0s[熬夜] 0.6s[脸垮] 1.4s[姐妹] 2.1s[看过来]）。"
                        : "");

                const result = await analyzePreparedReverseVideo({
                    config: reverseInferenceConfig,
                    fallbackConfigs: [
                        { config: multimodalConfig, contentMode: "visual" },
                        { config: textConfig, contentMode: "text" },
                    ],
                    prepared,
                    userRequirement: effectiveRequirement,
                    promptRules: effectiveSystemPrompt,
                    replaceBuiltInPrompt: false,
                    vaultPromptId: VAULT_PROMPT_IDS.CREATIVE_REVERSE,
                    localAsrEnabled: effectiveAsrEnabled,
                    wordLevelAudio: draft.deconstructWordLevelAudio ?? true,
                    scene: "assistant_video_reverse",
                    onProgress: reportProgress,
                    onDelta: handleDelta,
                    signal: controller.signal,
                });

                // 结构化转译为可读分镜剧本文档
                const parsed = parseDirectorJson<{ title?: string; coreElements?: any; originalMasterSlots?: any; shots?: any[] }>(result.prompt);
                const parsedShots = parsed?.shots && Array.isArray(parsed.shots) ? parsed.shots : parseMarkdownShots(result.prompt);
                const isJsonOutput = result.prompt.trim().startsWith("{");
                const userFacingScript = isJsonOutput ? formatShotManifestToReadableScript(parsedShots, result.prompt) : result.prompt;

                updateDraft({
                    deconstructStatus: "complete",
                    deconstructError: "",
                    deconstructPrompt: userFacingScript,
                    deconstructNotes: result.notes,
                    deconstructDurationSec: result.durationSec,
                    deconstructFrameCount: result.frameCount,
                    deconstructShotManifest: parsedShots,
                    // 同步到顶层通用字段以保障向后兼容
                    reverseStatus: "complete",
                    reverseError: "",
                    reversePrompt: userFacingScript,
                    reverseNotes: result.notes,
                    reverseDurationSec: result.durationSec,
                });
                setViewModeOverride((prev) => ({ ...prev, deconstruct: "result" }));
                message.success("创意反推完成，可直接编辑分镜脚本");
            } else {
                // 经典反推：全景时序抽帧与提示词推演管线
                prepared = await prepareReverseVideo(source, draft.classicGridSize || draft.reverseGridSize || "auto", reportProgress, {
                    track: "classic",
                    samplingPolicy: {
                        mode: draft.classicSamplingMode === "agent" ? "seconds_and_scene" : (draft.classicSamplingMode || draft.reverseSamplingMode || "seconds_and_scene"),
                        fps: draft.classicSamplingFps || draft.reverseSamplingFps || 1,
                        includeMiddleFrames: draft.classicIncludeMiddleFrames ?? draft.reverseIncludeMiddleFrames ?? true,
                        sceneChangeThreshold: draft.classicSceneThreshold ?? draft.reverseSceneThreshold ?? 0.20,
                        minSceneGapSec: draft.classicMinSceneGapSec ?? draft.reverseMinSceneGapSec ?? 0.3,
                    },
                    agentPolicy: draft.classicSamplingMode === "agent" ? draft.reverseAgentPolicyJson : undefined,
                    signal: controller.signal,
                });

                updateDraft({
                    classicStatus: "analyzing",
                    classicDurationSec: prepared.durationSec,
                    classicFrameCount: prepared.frameCount,
                });

                const effectiveRequirement = draft.classicCustomRules?.trim() || undefined;

                const result = await analyzePreparedReverseVideo({
                    config: reverseInferenceConfig,
                    fallbackConfigs: [
                        { config: multimodalConfig, contentMode: "visual" },
                        { config: textConfig, contentMode: "text" },
                    ],
                    prepared,
                    userRequirement: effectiveRequirement,
                    scene: "assistant_video_reverse",
                    onProgress: reportProgress,
                    onDelta: handleDelta,
                    signal: controller.signal,
                });

                updateDraft({
                    classicStatus: "complete",
                    classicError: "",
                    classicPrompt: result.prompt,
                    classicNotes: result.notes,
                    classicDurationSec: result.durationSec,
                    classicFrameCount: result.frameCount,
                    // 同步到顶层通用字段以保障向后兼容
                    reverseStatus: "complete",
                    reverseError: "",
                    reversePrompt: result.prompt,
                    reverseNotes: result.notes,
                    reverseDurationSec: result.durationSec,
                });
                setViewModeOverride((prev) => ({ ...prev, classic: "result" }));
                message.success("经典反推完成，可直接编辑提示词");
            }
        } catch (error) {
            if (deductedMicrocredits > 0) {
                void featureCredit.refund(
                    deductedMicrocredits,
                    effectiveReverseModel,
                    isDeconstruct ? "生视频工作台 · 创意反推失败退款" : "生视频工作台 · 经典反推失败退款"
                );
                deductedMicrocredits = 0;
            }
            const errorText = error instanceof Error ? error.message : "视频反推失败";
            if (isDeconstruct) {
                updateDraft({ deconstructStatus: "failed", deconstructError: errorText });
            } else {
                updateDraft({ classicStatus: "failed", classicError: errorText });
            }
            message.error(errorText);
        } finally {
            if (prepared) disposePreparedReverseVideo(prepared);
            if (isDeconstruct) {
                setDeconstructRunning(false);
            } else {
                setClassicRunning(false);
            }
        }
    };

    // 应用当前模式生成的脚本为参考脚本
    const applyCurrentPrompt = () => {
        const isDeconstruct = currentMode === "deconstruct";
        const scriptText = (isDeconstruct ? draft.deconstructPrompt : draft.classicPrompt)?.trim();
        if (!scriptText) return;

        const durSec = (isDeconstruct ? draft.deconstructDurationSec : draft.classicDurationSec) || draft.durationSec || 15;
        const roundedDur = Math.round(durSec);
        const appliedAt = new Date().toISOString();

        updateDraft({
            referenceScript: scriptText,
            referenceScriptDurationSec: roundedDur,
            referenceScriptAppliedAt: appliedAt,
            durationSec: roundedDur,
            generationMethod: "reference_video",
            stage: "config",
        });

        if (onApply) {
            onApply(scriptText, roundedDur);
        }
        if (onClose) {
            onClose();
        }
        message.success("已成功应用为参考脚本！");
    };

    return (
        <div className={`grid gap-4 ${embedded ? "p-2" : ""}`}>
            {/* 顶部素材选择与导入栏（双模式共享资产） */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200/80 bg-stone-50/70 p-2.5 dark:border-stone-800 dark:bg-stone-900/50">
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        icon={<FolderOpen className="size-4 text-amber-500" />}
                        onClick={() => setAssetPickerOpen(true)}
                        disabled={isCurrentRunning}
                        size="small"
                        className="font-medium shadow-2xs hover:!border-amber-400"
                    >
                        资产导入
                    </Button>
                    <Button
                        icon={<Upload className="size-4" />}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isCurrentRunning}
                        size="small"
                    >
                        上传视频
                    </Button>
                    {selectedVideo ? (
                        <div className="flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2 py-0.5 text-xs text-stone-700 shadow-2xs dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
                            <Video className="size-3.5 text-amber-500 shrink-0" />
                            <span className="max-w-[240px] truncate font-medium">{selectedVideo.name}</span>
                            {selectedVideo.durationMs ? (
                                <span className="text-stone-400">({(selectedVideo.durationMs / 1000).toFixed(1)}s)</span>
                            ) : null}
                            {!isCurrentRunning && (
                                <button
                                    type="button"
                                    onClick={() => updateDraft({ referenceVideos: [] })}
                                    className="ml-1 text-stone-400 hover:text-red-500 cursor-pointer"
                                    title="移除素材"
                                >
                                    <X className="size-3" />
                                </button>
                            )}
                        </div>
                    ) : (
                        <span className="text-xs text-stone-400">请选择或上传需要反推的对标视频</span>
                    )}
                </div>
                <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={(event) => void selectVideoFile(event.target.files?.[0])} />
            </div>

            {/* 状态 1：反推进度显示画面（执行中不可取消与中止） */}
            {isCurrentRunning ? (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-6 flex flex-col items-center gap-4 text-center">
                    <LoaderCircle className="size-8 animate-spin text-amber-500" />
                    <div className="space-y-1">
                        <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                            {currentMode === "classic" ? "正在执行经典反推推演..." : "正在执行创意反推 · 工业级分镜拆解..."}
                        </div>
                        <div className="text-xs text-stone-500 dark:text-stone-400">{currentProgress.message}</div>
                    </div>
                    <Progress percent={currentProgress.percent} status="active" strokeColor="#f59e0b" className="w-full max-w-md" />
                    {currentStreamText ? (
                        <div className="w-full max-h-40 overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-700 bg-white/80 dark:bg-stone-900/80 p-3 text-left font-mono text-[11px] text-stone-600 dark:text-stone-300 leading-relaxed">
                            {currentStreamText}
                        </div>
                    ) : null}
                    <div className="text-[11px] text-stone-400">
                        ⚡ 反推任务正由多模态引擎进行端侧密采样分析，执行中不可取消或中止，请耐心等待推演完成
                    </div>
                </div>
            ) : currentViewMode === "result" && hasExistingScript ? (
                /* 状态 2：反推脚本编辑框（双模式产出后独立保存在弹窗中，支持润色与应用） */
                <div className="grid gap-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Tag color="success" className="m-0 font-medium">
                                ✨ {currentMode === "classic" ? "经典反推已就绪" : "创意反推分镜已就绪"}
                            </Tag>
                            <span className="text-xs text-stone-400">
                                时长约 {Math.round((currentMode === "deconstruct" ? draft.deconstructDurationSec : draft.classicDurationSec) || draft.durationSec || 0)} 秒
                            </span>
                        </div>
                        <Button
                            icon={<SlidersHorizontal className="size-3.5" />}
                            onClick={() => setViewModeOverride((prev) => ({ ...prev, [currentMode]: "config" }))}
                            size="small"
                        >
                            调整参数 / 重新反推
                        </Button>
                    </div>
                    <Input.TextArea
                        value={currentPromptValue}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (currentMode === "deconstruct") {
                                updateDraft({ deconstructPrompt: val, reversePrompt: val });
                            } else {
                                updateDraft({ classicPrompt: val, reversePrompt: val });
                            }
                        }}
                        rows={12}
                        className="font-mono text-xs leading-relaxed"
                        placeholder="反推脚本生成就绪，可直接在这里润色或调整..."
                    />
                    <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-stone-400">
                            提示：反推脚本已保存在当前模式中。可直接在此自由润色编辑，点击右侧应用为参考脚本。
                        </span>
                        <div className="flex items-center gap-2">
                            <Button
                                icon={<RotateCcw className="size-3.5" />}
                                onClick={() => setViewModeOverride((prev) => ({ ...prev, [currentMode]: "config" }))}
                                size="middle"
                            >
                                重新反推
                            </Button>
                            <Button
                                type="primary"
                                icon={<Check className="size-4" />}
                                onClick={applyCurrentPrompt}
                                size="middle"
                                className="!border-amber-500 !bg-amber-500 font-semibold shadow-xs hover:!bg-amber-600 active:!bg-amber-700 !text-white"
                            >
                                应用为参考脚本
                            </Button>
                        </div>
                    </div>
                </div>
            ) : (
                /* 状态 3：参数配置与启动画面（【经典反推】与【创意反推】页面排版保持规整一致） */
                <div className="grid gap-3">
                    {hasExistingScript ? (
                        <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs">
                            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                                <FileText className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
                                <span>当前模式已保留上一轮生成的参考脚本（未应用）。重新反推将生成新脚本并覆盖，或随时返回查看。</span>
                            </div>
                            <Button
                                size="small"
                                onClick={() => setViewModeOverride((prev) => ({ ...prev, [currentMode]: "result" }))}
                                className="text-xs font-semibold text-amber-700 dark:text-amber-300 border-amber-500/40 hover:!border-amber-500"
                            >
                                查看/编辑已有脚本
                            </Button>
                        </div>
                    ) : null}

                    {/* 经典反推配置视图 */}
                    {currentMode === "classic" ? (
                        <>
                            <div className="flex flex-wrap items-center gap-2 rounded-md border border-stone-200 p-2 text-xs dark:border-stone-800">
                                <span className="font-medium text-stone-700 dark:text-stone-300" title="拼图按视频时间顺序生成；自动模式会限制模型单次接收不超过 12 张">
                                    拼图密度
                                </span>
                                <Select
                                    value={draft.classicGridSize || draft.reverseGridSize || "auto"}
                                    options={GRID_OPTIONS}
                                    onChange={(value: ReverseGridSize) => updateDraft({ classicGridSize: value, reverseGridSize: value })}
                                    className="min-w-[160px]"
                                    size="small"
                                />
                            </div>
                            <div className="grid gap-2 rounded-md border border-stone-200 p-2.5 text-xs dark:border-stone-800">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium text-stone-700 dark:text-stone-300">抽帧模式</span>
                                    <Select
                                        value={draft.classicSamplingMode || draft.reverseSamplingMode || "seconds_and_scene"}
                                        options={SAMPLING_MODE_OPTIONS}
                                        onChange={(value: VideoSamplingMode) => updateDraft({ classicSamplingMode: value, reverseSamplingMode: value })}
                                        className="min-w-[190px]"
                                        size="small"
                                    />
                                </div>
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <span className="text-stone-600 dark:text-stone-400">频率</span>
                                    <Input
                                        type="number"
                                        min={0.1}
                                        max={10}
                                        step={0.1}
                                        value={draft.classicSamplingFps ?? draft.reverseSamplingFps ?? 1}
                                        onChange={(e) => updateDraft({ classicSamplingFps: Math.min(10, Math.max(0.1, Number(e.target.value) || 1)) })}
                                        className="w-24"
                                        size="small"
                                        suffix="fps"
                                    />
                                    {(draft.classicSamplingMode || draft.reverseSamplingMode) !== "scene" ? (
                                        <label className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-400 ml-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={draft.classicIncludeMiddleFrames ?? draft.reverseIncludeMiddleFrames ?? true}
                                                onChange={(e) => updateDraft({ classicIncludeMiddleFrames: e.target.checked })}
                                            />
                                            每个区间增加中点帧
                                        </label>
                                    ) : null}
                                </div>
                                {((draft.classicSamplingMode || draft.reverseSamplingMode) === "scene" || (draft.classicSamplingMode || draft.reverseSamplingMode) === "seconds_and_scene") ? (
                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                        <span className="text-stone-600 dark:text-stone-400">场景切变阈值</span>
                                        <Input
                                            type="number"
                                            min={0}
                                            max={1}
                                            step={0.01}
                                            value={draft.classicSceneThreshold ?? draft.reverseSceneThreshold ?? 0.20}
                                            onChange={(e) => updateDraft({ classicSceneThreshold: Math.min(1, Math.max(0, Number(e.target.value) || 0)) })}
                                            className="w-20"
                                            size="small"
                                        />
                                        <span className="text-stone-600 dark:text-stone-400 ml-2">最小间隔</span>
                                        <Input
                                            type="number"
                                            min={0}
                                            max={60}
                                            step={0.1}
                                            value={draft.classicMinSceneGapSec ?? draft.reverseMinSceneGapSec ?? 0.3}
                                            onChange={(e) => updateDraft({ classicMinSceneGapSec: Math.min(60, Math.max(0, Number(e.target.value) || 0)) })}
                                            className="w-20"
                                            size="small"
                                            suffix="秒"
                                        />
                                    </div>
                                ) : null}
                                {(draft.classicSamplingMode || draft.reverseSamplingMode) === "agent" ? (
                                    <Input.TextArea
                                        value={agentPolicyText}
                                        onChange={(event) => {
                                            const val = event.target.value;
                                            setAgentPolicyText(val);
                                            updateDraft({ reverseAgentPolicyJson: sanitizeAgentPolicyJson(val) });
                                        }}
                                        placeholder='粘贴策略 JSON，例如 {"mode":"scene","fps":2,"sceneChangeThreshold":0.20}'
                                        autoSize={{ minRows: 2, maxRows: 4 }}
                                    />
                                ) : null}
                            </div>
                            <div className="grid gap-1.5 rounded-md border border-stone-200 p-2.5 text-xs dark:border-stone-800">
                                <span className="font-medium text-stone-700 dark:text-stone-300">自定义反推规则 / 补充要求（选填）</span>
                                <Input.TextArea
                                    value={draft.classicCustomRules || ""}
                                    onChange={(e) => updateDraft({ classicCustomRules: e.target.value })}
                                    placeholder="例如：重点提取主角表情与运镜推拉方式，忽略背景路人台词..."
                                    rows={2}
                                />
                            </div>
                        </>
                    ) : (
                        /* 创意反推配置视图（全面对齐画布节点参数与本地ASR） */
                        <>
                            <div className="flex flex-wrap items-center gap-2 rounded-md border border-stone-200 p-2 text-xs dark:border-stone-800">
                                <span className="font-medium text-stone-700 dark:text-stone-300" title="拼图按视频时间顺序生成；自动模式会限制模型单次接收不超过 12 张">
                                    拼图密度
                                </span>
                                <Select
                                    value={draft.deconstructGridSize || "auto"}
                                    options={GRID_OPTIONS}
                                    onChange={(value: ReverseGridSize) => updateDraft({ deconstructGridSize: value })}
                                    className="min-w-[160px]"
                                    size="small"
                                />
                            </div>
                            <div className="grid gap-2 rounded-md border border-stone-200 p-2.5 text-xs dark:border-stone-800">
                                <span className="font-medium text-stone-700 dark:text-stone-300">工业级分镜拆解参数</span>
                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-stone-600 dark:text-stone-400">镜头切变阈值</span>
                                        <Input
                                            type="number"
                                            min={0.05}
                                            max={0.8}
                                            step={0.01}
                                            value={draft.deconstructSceneThreshold ?? 0.15}
                                            onChange={(e) => updateDraft({ deconstructSceneThreshold: Math.min(0.8, Math.max(0.05, Number(e.target.value) || 0.15)) })}
                                            className="w-20"
                                            size="small"
                                        />
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-stone-600 dark:text-stone-400">镜头最小间隔</span>
                                        <Input
                                            type="number"
                                            min={0.1}
                                            max={5}
                                            step={0.05}
                                            value={draft.deconstructMinSceneGapSec ?? 0.25}
                                            onChange={(e) => updateDraft({ deconstructMinSceneGapSec: Math.min(5, Math.max(0.1, Number(e.target.value) || 0.25)) })}
                                            className="w-20"
                                            size="small"
                                            suffix="秒"
                                        />
                                    </div>
                                </div>
                                <div className="pt-1 flex flex-col gap-2">
                                    <label className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-400 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={draft.deconstructWordLevelAudio ?? true}
                                            onChange={(e) => updateDraft({ deconstructWordLevelAudio: e.target.checked })}
                                        />
                                        <span>开启词级打标（对每个镜头的对白标出具体的字词时间轴）</span>
                                    </label>
                                    <label
                                        className={`flex items-center gap-1.5 text-xs ml-4 transition-opacity ${
                                            (draft.deconstructWordLevelAudio ?? true) ? "cursor-pointer text-stone-600 dark:text-stone-400" : "cursor-not-allowed opacity-50 text-stone-400"
                                        }`}
                                        title="开启后优先调用本地电脑显卡/CPU 运行 FunASR 进行毫秒级字词打标；未勾选或本地未就绪时自动平滑采用大模型原生音画听觉打标。"
                                    >
                                        <input
                                            type="checkbox"
                                            disabled={!(draft.deconstructWordLevelAudio ?? true)}
                                            checked={draft.deconstructLocalAsrEnabled ?? true}
                                            onChange={(e) => updateDraft({ deconstructLocalAsrEnabled: e.target.checked })}
                                        />
                                        <span className="font-semibold text-stone-700 dark:text-stone-300">本地 ASR (FunASR 优先加速)</span>
                                    </label>
                                </div>
                            </div>
                            <div className="grid gap-1.5 rounded-md border border-stone-200 p-2.5 text-xs dark:border-stone-800">
                                <span className="font-medium text-stone-700 dark:text-stone-300">创意拆解指导指令（选填）</span>
                                <Input.TextArea
                                    value={draft.deconstructCustomRules || ""}
                                    onChange={(e) => updateDraft({ deconstructCustomRules: e.target.value })}
                                    placeholder="例如：提炼高潮反转镜头，将主角情绪变化与核心道具卖点做因果映射..."
                                    rows={2}
                                />
                            </div>
                        </>
                    )}

                    {currentError ? <Alert type="error" showIcon message={currentError} /> : null}

                    {/* 统一底栏执行按钮：【开始反推】 / 【开始重新反推】 */}
                    <div className="flex items-center justify-between pt-2 border-t border-stone-200/60 dark:border-stone-800/60">
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] text-stone-400">
                                模式：{currentMode === "classic" ? "经典时序反推" : "创意分镜拆解"}
                            </span>
                            <FeatureCreditBadge scene="assistant_video_reverse" model={effectiveReverseModel} size="small" />
                        </div>
                        <div className="flex items-center gap-2">
                            {hasExistingScript ? (
                                <Button
                                    size="middle"
                                    onClick={() => setViewModeOverride((prev) => ({ ...prev, [currentMode]: "result" }))}
                                    className="font-medium"
                                >
                                    返回已有脚本
                                </Button>
                            ) : null}
                            <Button
                                type="primary"
                                icon={<Sparkles className="size-4" />}
                                onClick={() => void startAnalysis()}
                                size="middle"
                                className="!border-amber-500 !bg-amber-500 font-semibold shadow-xs hover:!bg-amber-600 active:!bg-amber-700 !text-white"
                            >
                                {hasExistingScript ? "开始重新反推" : "开始反推"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* 资产库导入弹窗 */}
            <AssetPickerModal
                open={assetPickerOpen}
                multiple={false}
                onInsert={handleInsertAsset}
                onClose={() => setAssetPickerOpen(false)}
            />
        </div>
    );
}
