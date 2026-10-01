import { Check, Link2, LoaderCircle, Upload, Video, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, App, Button, Input, Progress, Select, Tag } from "antd";

import { deleteStoredMedia, getMediaBlob, uploadMediaFile } from "@/services/file-storage";
import { analyzePreparedReverseVideo, disposePreparedReverseVideo, prepareReverseVideo, type ReverseAnalysisProgress } from "@/extensions/opc-infinite/services/video-reverse-analysis";
import { downloadReferenceVideo } from "@/services/video-reverse-download";
import { useConfigStore, type AiConfig } from "@/stores/use-config-store";
import { useCreationAssistantStore } from "@/stores/use-creation-assistant-store";
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
    onApply?: (prompt: string, durationSec: number) => void;
    onClose?: () => void;
};

export function ReferenceVideoReverseEditor({
    embedded = false,
    reverseInferenceConfig,
    multimodalConfig,
    textConfig,
    initialVideo,
    onApply,
    onClose,
}: ReferenceVideoReverseEditorProps) {
    const { message } = App.useApp();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const draft = useCreationAssistantStore((state) => state.draft);
    const updateDraft = useCreationAssistantStore((state) => state.updateDraft);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState<ReverseAnalysisProgress>({ stage: "frames", percent: 0, message: "等待视频" });
    const [agentPolicyText, setAgentPolicyText] = useState(() => draft.reverseAgentPolicyJson);
    const requestVersionRef = useRef(0);
    const requestControllerRef = useRef<AbortController | null>(null);

    const selectedVideo = initialVideo || draft.referenceVideos[0];
    const hasModelConfig = useMemo(
        () => isAiConfigReady(reverseInferenceConfig, reverseInferenceConfig.model) || isAiConfigReady(multimodalConfig, multimodalConfig.model) || isAiConfigReady(textConfig, textConfig.model),
        [isAiConfigReady, multimodalConfig, reverseInferenceConfig, textConfig],
    );
    const showResult = draft.reverseStatus === "complete" && Boolean(draft.reversePrompt.trim());

    useEffect(() => {
        setAgentPolicyText(draft.reverseAgentPolicyJson);
        return () => {
            requestControllerRef.current?.abort();
            requestVersionRef.current += 1;
        };
    }, []);

    const selectVideoFile = async (file?: File) => {
        if (!file || !file.type.startsWith("video/")) {
            message.warning("请选择 MP4、MOV 或 WebM 视频文件");
            return;
        }
        requestControllerRef.current?.abort();
        requestControllerRef.current = null;
        const fileRequestVersion = ++requestVersionRef.current;
        setProgress({ stage: "frames", percent: 0, message: "等待视频" });
        setBusy(true);
        try {
            const stored = await uploadMediaFile(file, "creation-assistant-reference-reverse");
            if (requestVersionRef.current !== fileRequestVersion) {
                await deleteStoredMedia([stored.storageKey]);
                return;
            }
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
                reverseSourceUrl: "",
                reverseDownloadedUrl: "",
                reverseStatus: "idle",
                reverseError: "",
                reversePrompt: "",
                reverseNotes: [],
                referenceScript: "",
                referenceScriptDurationSec: 0,
                referenceScriptAppliedAt: "",
            });
        } catch (error) {
            if (requestVersionRef.current === fileRequestVersion) message.error(error instanceof Error ? error.message : "视频保存失败");
        } finally {
            if (requestVersionRef.current === fileRequestVersion) setBusy(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const resolveSource = async (isCurrentRequest?: () => boolean, signal?: AbortSignal, reportProgress?: (progress: ReverseAnalysisProgress) => void) => {
        const url = draft.reverseSourceUrl.trim();
        if (url) {
            if (draft.reverseDownloadedUrl === url && selectedVideo?.storageKey) {
                const cached = await getMediaBlob(selectedVideo.storageKey);
                if (cached) return cached;
            }
            reportProgress?.({ stage: "frames", percent: 5, message: "正在下载视频" });
            const downloaded = await downloadReferenceVideo(url, signal);
            if (isCurrentRequest && !isCurrentRequest()) return downloaded.blob;
            const stored = await uploadMediaFile(downloaded.blob, "creation-assistant-reference-reverse");
            if (isCurrentRequest && !isCurrentRequest()) {
                await deleteStoredMedia([stored.storageKey]);
                return downloaded.blob;
            }
            const reference: ReferenceVideo = {
                id: stored.storageKey,
                name: downloaded.filename,
                type: stored.mimeType,
                url: stored.url,
                storageKey: stored.storageKey,
                bytes: stored.bytes,
                width: stored.width,
                height: stored.height,
                durationMs: stored.durationMs,
            };
            updateDraft({ referenceVideos: [reference], reverseDownloadedUrl: url, reverseStatus: "idle", reverseError: "", reversePrompt: "", reverseNotes: [], referenceScript: "", referenceScriptDurationSec: 0, referenceScriptAppliedAt: "" });
            return (await getMediaBlob(stored.storageKey)) || downloaded.blob;
        }
        if (selectedVideo?.storageKey) {
            const stored = await getMediaBlob(selectedVideo.storageKey);
            if (stored) return stored;
        }
        if (selectedVideo?.url) {
            const response = await fetch(selectedVideo.url, signal ? { signal } : undefined);
            if (!response.ok) throw new Error(`读取已上传视频失败（HTTP ${response.status}）`);
            return response.blob();
        }
        throw new Error("请先上传视频或输入视频直链");
    };

    const analyze = async () => {
        if (!hasModelConfig) {
            message.warning("请先在设置中配置多模态模型或文本模型");
            return;
        }
        requestControllerRef.current?.abort();
        const controller = new AbortController();
        requestControllerRef.current = controller;
        const requestVersion = ++requestVersionRef.current;
        const isCurrentRequest = () => requestVersionRef.current === requestVersion;
        const reportProgress = (nextProgress: ReverseAnalysisProgress) => {
            if (isCurrentRequest()) setProgress(nextProgress);
        };
        setBusy(true);
        updateDraft({ reverseStatus: "preparing", reverseError: "", reversePrompt: "", reverseNotes: [], referenceScript: "", referenceScriptDurationSec: 0, referenceScriptAppliedAt: "" });
        let prepared: Awaited<ReturnType<typeof prepareReverseVideo>> | null = null;
        try {
            const source = await resolveSource(isCurrentRequest, controller.signal, reportProgress);
            if (!isCurrentRequest()) return;
            prepared = await prepareReverseVideo(source, draft.reverseGridSize, reportProgress, {
                samplingPolicy: {
                    mode: draft.reverseSamplingMode === "agent" ? "seconds_and_scene" : draft.reverseSamplingMode,
                    fps: draft.reverseSamplingFps,
                    includeMiddleFrames: draft.reverseIncludeMiddleFrames,
                    sceneChangeThreshold: draft.reverseSceneThreshold,
                    minSceneGapSec: draft.reverseMinSceneGapSec,
                },
                agentPolicy: draft.reverseSamplingMode === "agent" ? draft.reverseAgentPolicyJson : undefined,
                signal: controller.signal,
            });
            if (!isCurrentRequest()) return;
            updateDraft({
                reverseStatus: "analyzing",
                reverseError: "",
                reverseDurationSec: prepared.durationSec,
                reverseFrameCount: prepared.frameCount,
                reverseSubmittedGridCount: prepared.submittedPages.length,
                reverseOmittedGridCount: Math.max(0, prepared.pages.length - prepared.submittedPages.length),
            });
            const result = await analyzePreparedReverseVideo({
                config: reverseInferenceConfig,
                fallbackConfigs: [
                    { config: multimodalConfig, contentMode: "visual" },
                    { config: textConfig, contentMode: "text" },
                ],
                prepared,
                onProgress: reportProgress,
                signal: controller.signal,
            });
            if (!isCurrentRequest()) return;
            updateDraft({
                reverseStatus: "complete",
                reverseError: "",
                reversePrompt: result.prompt,
                reverseNotes: result.notes,
                reverseDurationSec: result.durationSec,
                reverseFrameCount: result.frameCount,
                reverseSubmittedGridCount: result.submittedGridCount,
                reverseOmittedGridCount: result.omittedGridCount,
            });
            message.success("视频反推完成，可直接编辑结果");
        } catch (error) {
            if (!isCurrentRequest()) return;
            if (controller.signal.aborted) return;
            const errorText = error instanceof Error ? error.message : "视频分析失败";
            updateDraft({ reverseStatus: "failed", reverseError: errorText });
            message.error(errorText);
        } finally {
            if (prepared) disposePreparedReverseVideo(prepared);
            if (isCurrentRequest()) {
                requestControllerRef.current = null;
                setBusy(false);
            }
        }
    };

    const applyPrompt = () => {
        const referenceScript = draft.reversePrompt.trim();
        if (!referenceScript) return;
        const sourceDurationSec = selectedVideo?.durationMs ? selectedVideo.durationMs / 1000 : 0;
        const measuredDurationSec = Number.isFinite(draft.reverseDurationSec) && draft.reverseDurationSec > 0 ? Math.round(draft.reverseDurationSec) : sourceDurationSec > 0 ? Math.round(sourceDurationSec) : draft.durationSec;
        const referenceScriptDurationSec = Math.min(180, Math.max(1, measuredDurationSec));
        const referenceScriptAppliedAt = new Date().toISOString();
        updateDraft({
            referenceScript,
            referenceScriptDurationSec,
            referenceScriptAppliedAt,
            durationSec: referenceScriptDurationSec,
            generationMethod: "reference_video",
            stage: "config",
        });
        if (onApply) {
            onApply(referenceScript, referenceScriptDurationSec);
        }
        if (onClose) {
            onClose();
        }
    };

    const resetReverseInput = () => {
        requestControllerRef.current?.abort();
        requestControllerRef.current = null;
        requestVersionRef.current += 1;
        setAgentPolicyText("");
        setProgress({ stage: "frames", percent: 0, message: "等待视频" });
        setBusy(false);
        updateDraft({ reverseStatus: "idle", reverseError: "", reversePrompt: "", reverseNotes: [], reverseAgentPolicyJson: "", referenceScript: "", referenceScriptDurationSec: 0, referenceScriptAppliedAt: "" });
    };

    return (
        <div className={`grid gap-4 ${embedded ? "p-2" : ""}`}>
            {showResult ? (
                <div className="grid gap-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                        <Tag>已分析 {draft.reverseFrameCount} 帧</Tag>
                        <Tag>提交 {draft.reverseSubmittedGridCount} 张拼图</Tag>
                        {draft.reverseOmittedGridCount ? <Tag color="warning">省略 {draft.reverseOmittedGridCount} 张超出上限的拼图</Tag> : null}
                    </div>
                    <Input.TextArea value={draft.reversePrompt} onChange={(event) => updateDraft({ reversePrompt: event.target.value })} autoSize={{ minRows: 14, maxRows: 28 }} className="!font-mono !text-xs !leading-5" />
                    {draft.reverseNotes.length ? (
                        <Alert
                            type="info"
                            showIcon
                            message="分析备注"
                            description={
                                <ul className="m-0 pl-5">
                                    {draft.reverseNotes.map((note) => (
                                        <li key={note}>{note}</li>
                                    ))}
                                </ul>
                            }
                        />
                    ) : null}
                    <div className="flex justify-end gap-2">
                        <Button icon={<X className="size-4" />} onClick={resetReverseInput} size="small">
                            重新输入
                        </Button>
                        <Button
                            type="primary"
                            icon={<Check className="size-4" />}
                            onClick={applyPrompt}
                            size="small"
                            className="!border-amber-500 !bg-amber-500 font-semibold shadow-xs hover:!bg-amber-600 active:!bg-amber-700 !text-white"
                        >
                            应用为参考脚本
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="grid gap-3">
                    <Input
                        prefix={<Link2 className="size-4" />}
                        value={draft.reverseSourceUrl}
                        onChange={(event) => {
                            setProgress({ stage: "frames", percent: 0, message: "等待视频" });
                            updateDraft((current) => ({
                                ...current,
                                reverseSourceUrl: event.target.value,
                                reverseDownloadedUrl: "",
                                referenceVideos: event.target.value.trim() ? [] : current.referenceVideos,
                                reverseStatus: "idle",
                                reverseError: "",
                                reversePrompt: "",
                                reverseNotes: [],
                                referenceScript: "",
                                referenceScriptDurationSec: 0,
                                referenceScriptAppliedAt: "",
                            }));
                        }}
                        placeholder="输入视频直链或抖音分享链接"
                        disabled={busy}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                        <Button icon={<Upload className="size-4" />} onClick={() => fileInputRef.current?.click()} disabled={busy} size="small">
                            上传视频
                        </Button>
                        <Button
                            type="primary"
                            icon={busy ? <LoaderCircle className="size-4 animate-spin" /> : <Video className="size-4" />}
                            onClick={() => void analyze()}
                            loading={busy}
                            size="small"
                            className="!border-amber-500 !bg-amber-500 font-semibold shadow-xs hover:!bg-amber-600 active:!bg-amber-700 !text-white"
                        >
                            反推分析
                        </Button>
                        {selectedVideo ? <Tag className="m-0 max-w-[280px] truncate">{selectedVideo.name}</Tag> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-stone-200 p-2 text-xs dark:border-stone-800">
                        <span className="font-medium" title="拼图按视频时间顺序生成；自动模式会限制模型单次接收不超过 12 张">
                            拼图密度
                        </span>
                        <Select value={draft.reverseGridSize} options={GRID_OPTIONS} onChange={(value: ReverseGridSize) => updateDraft({ reverseGridSize: value })} className="min-w-[180px]" size="small" disabled={busy} />
                    </div>
                    <div className="grid gap-2 rounded-md border border-stone-200 p-2 text-xs dark:border-stone-800">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium" title="按秒、场景变化或 Agent 策略选择取证方式">
                                抽帧模式
                            </span>
                            <Select value={draft.reverseSamplingMode} options={SAMPLING_MODE_OPTIONS} onChange={(value: VideoSamplingMode) => updateDraft({ reverseSamplingMode: value })} className="min-w-[200px]" size="small" disabled={busy} />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span>频率</span>
                            <Input
                                type="number"
                                min={0.1}
                                max={10}
                                step={0.1}
                                value={draft.reverseSamplingFps}
                                onChange={(event) => updateDraft({ reverseSamplingFps: Math.min(10, Math.max(0.1, Number(event.target.value) || 1)) })}
                                className="w-24"
                                size="small"
                                disabled={busy}
                                suffix="fps"
                            />
                            {draft.reverseSamplingMode !== "scene" ? (
                                <label className="flex items-center gap-1.5 text-xs">
                                    <input type="checkbox" checked={draft.reverseIncludeMiddleFrames} onChange={(event) => updateDraft({ reverseIncludeMiddleFrames: event.target.checked })} disabled={busy} />
                                    每个区间增加中点帧
                                </label>
                            ) : null}
                        </div>
                        {draft.reverseSamplingMode === "scene" || draft.reverseSamplingMode === "seconds_and_scene" ? (
                            <div className="flex flex-wrap items-center gap-2">
                                <span>场景阈值</span>
                                <Input
                                    type="number"
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    value={draft.reverseSceneThreshold}
                                    onChange={(event) => updateDraft({ reverseSceneThreshold: Math.min(1, Math.max(0, Number(event.target.value) || 0)) })}
                                    className="w-20"
                                    size="small"
                                    disabled={busy}
                                />
                                <span>最小间隔</span>
                                <Input
                                    type="number"
                                    min={0}
                                    max={60}
                                    step={0.1}
                                    value={draft.reverseMinSceneGapSec}
                                    onChange={(event) => updateDraft({ reverseMinSceneGapSec: Math.min(60, Math.max(0, Number(event.target.value) || 0)) })}
                                    className="w-20"
                                    size="small"
                                    disabled={busy}
                                    suffix="秒"
                                />
                            </div>
                        ) : null}
                        {draft.reverseSamplingMode === "agent" ? (
                            <Input.TextArea
                                value={agentPolicyText}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    setAgentPolicyText(value);
                                    updateDraft({ reverseAgentPolicyJson: sanitizeAgentPolicyJson(value) });
                                }}
                                placeholder='粘贴策略 JSON，例如 {"mode":"scene","fps":2,"sceneChangeThreshold":0.20}'
                                autoSize={{ minRows: 2, maxRows: 4 }}
                                disabled={busy}
                            />
                        ) : null}
                    </div>
                    {progress.percent > 0 ? <Progress percent={progress.percent} status={draft.reverseStatus === "failed" ? "exception" : undefined} format={() => progress.message} size="small" /> : null}
                    {draft.reverseError ? <Alert type="error" showIcon message={draft.reverseError} /> : null}
                    <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={(event) => void selectVideoFile(event.target.files?.[0])} />
                </div>
            )}
        </div>
    );
}
