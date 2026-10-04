import { ArrowLeft, ArrowRight, Check, FileText, LoaderCircle, Plus, Sparkles, Trash2, Video, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { App, Button, Input, InputNumber, Tag } from "antd";
import { EmptyState } from "@/components/ui/product/empty-state";
import { useNavigate } from "react-router";

import { analyzeCreationAssistantBatch, type AnalysisFile } from "@/services/creation-assistant-analysis";
import { disposeCreationAssistantVideoAnalyses, hasPreparedCreationAssistantVideos, isReusableCreationAssistantVideoAnalysis, prepareCreationAssistantVideos } from "@/services/creation-assistant-video-analysis";
import { buildCreationAssistantPrompts, buildReferenceScriptCreationAssistantPrompts, normalizeCreationAssistantScript } from "@/lib/creation-assistant-prompts";
import { segmentCreationAssistantTimeline } from "@/lib/creation-assistant-segmentation";
import { buildVideoCreationPlan } from "@/lib/video-segment-contract";
import { resolveChannelVideoModelDurationBounds, resolveChannelVideoModelMaxDuration } from "@/lib/model-capabilities";
import { requestImageQuestion } from "@/services/api/image";
import { ModelPicker } from "@/components/model-picker";
import { useFeatureCredit } from "@/hooks/use-feature-credit";
import { FeatureCreditBadge } from "@/components/feature-credit-badge";
import ReferenceVideoReverseDialog from "@/pages/creation-assistant/components/reference-video-reverse-dialog";
import {
    CREATION_ASSISTANT_DURATION_PRESETS,
    CREATION_ASSISTANT_PLATFORMS,
    CREATION_ASSISTANT_SCRIPT_TYPES,
    CREATION_ASSISTANT_SHOOTING_STYLES,
    findCreationAssistantScriptType,
    getCreationAssistantScriptTypeGroups,
    isScriptTypeValidForScenario,
    type CreationAssistantScriptType,
} from "@/lib/creation-assistant-catalog";
import { resolveModelForCapability, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { isReverseModelFallbackError } from "@/extensions/opc-infinite/services/video-reverse-contracts";
import { CREATION_ASSISTANT_CORE_SECTIONS, useCreationAssistantStore, type CreationAssistantFileSummary, type CreationAssistantInsightItem } from "@/stores/use-creation-assistant-store";
import { useVideoWorkbenchStore } from "@/stores/use-video-workbench-store";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import type { ReferenceImage } from "@/types/image";

type SourceFile = { id: string; name: string; kind: "image" | "video" | "audio"; url: string; durationMs?: number; dataUrl?: string };

const translations: Record<string, string> = {
    "creationAssistant.title": "创作助手",
    "creationAssistant.pageSubtitle": "从素材分析到脚本预览的三阶段创作流程",
    "creationAssistant.workflow": "创作流程",
    "creationAssistant.stageAnalysis": "分析素材",
    "creationAssistant.stageConfig": "创作脚本",
    "creationAssistant.stagePreview": "预览脚本",
    "creationAssistant.sourceCount": "个素材",
    "creationAssistant.backVideo": "返回视频创作台",
    "creationAssistant.analysisTitle": "分析素材",
    "creationAssistant.analysisDescription": "视频分析将消耗更多token。",
    "creationAssistant.analysisResultTitle": "素材分析结果",
    "creationAssistant.analysisResultDescription": "查看并修改文件总结和商品洞察，然后进入创作脚本。",
    "creationAssistant.analyzing": "正在分析当前素材批次…",
    "creationAssistant.analysisComplete": "素材分析已完成",
    "creationAssistant.analysisFailed": "素材分析失败",
    "creationAssistant.analysisConfigRequired": "请先在设置中配置文本/多模态模型",
    "creationAssistant.noSourceFiles": "请先在视频创作台上传素材",
    "creationAssistant.confirmAnalyze": "确认并开始分析",
    "creationAssistant.cancel": "取消",
    "creationAssistant.reanalyze": "重新分析",
    "creationAssistant.retry": "重试",
    "creationAssistant.next": "下一步",
    "creationAssistant.configTitle": "创作配置",
    "creationAssistant.configDescription": "使用已确认的素材总结和商品洞察配置脚本生成方式。",
    "creationAssistant.businessScenario": "业务场景",
    "creationAssistant.language": "语言",
    "creationAssistant.generationMethod": "脚本生成方式",
    "creationAssistant.configGenerationDescription": "基于商品卖点、内容方向和拍摄偏好，生成适合当前商品的原创短视频脚本",
    "creationAssistant.referenceGenerationDescription": "上传视频或输入视频直链，按时间顺序反推结构、节奏、镜头和声音",
    "creationAssistant.primaryPlatform": "主发布平台",
    "creationAssistant.secondaryPlatforms": "兼容发布平台（可选）",
    "creationAssistant.scriptType": "脚本类型",
    "creationAssistant.shootingStyle": "拍摄方式",
    "creationAssistant.duration": "视频时长",
    "creationAssistant.durationHint": "这是用户期望的总时长；脚本生成时会按当前视频模型能力自动分段和衔接。",
    "creationAssistant.durationRequired": "请输入有效的视频目标时长",
    "creationAssistant.referenceRequired": "参考生脚本至少需要上传视频或输入视频直链",
    "creationAssistant.referenceMaterial": "参考素材",
    "creationAssistant.referenceMaterialHint": "打开反推面板后，可上传视频或输入视频直链；反推结果会先进入可编辑预览。",
    "creationAssistant.openReferenceReverse": "打开反推面板",
    "creationAssistant.openReferenceScript": "打开参考脚本",
    "creationAssistant.referenceReverseReady": "已有反推结果",
    "creationAssistant.referenceReverseNotReady": "尚未反推",
    "creationAssistant.additionalNotes": "补充说明",
    "creationAssistant.additionalNotesPlaceholder": "补充语气、人设、禁用内容、重点卖点、镜头、节奏或 CTA",
    "creationAssistant.scriptConfigRequired": "请先在设置中配置文本模型",
    "creationAssistant.scriptFailed": "脚本生成失败",
    "creationAssistant.back": "返回",
    "creationAssistant.generateScript": "生成脚本",
    "creationAssistant.resultTitle": "视频脚本",
    "creationAssistant.resultDescription": "可直接修改脚本文本，应用后会写入视频创作台提示词输入框。",
    "creationAssistant.regenerate": "重新生成脚本",
    "creationAssistant.scriptPreview": "脚本预览",
    "creationAssistant.previewHint": "可直接修改脚本文本，应用后写入视频创作输入框",
    "creationAssistant.scriptPlaceholder": "在这里编辑脚本内容",
    "creationAssistant.applyScript": "应用脚本",
    "creationAssistant.applyReferenceScript": "应用到创作",
    "creationAssistant.applied": "脚本已应用到视频创作输入框",
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

export default function CreationAssistantPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const videoDraft = useVideoWorkbenchStore((state) => state.draft);
    const assistant = useCreationAssistantStore((state) => state.draft);
    const updateAssistant = useCreationAssistantStore((state) => state.updateDraft);
    const setStage = useCreationAssistantStore((state) => state.setStage);
    const undoAssistant = useCreationAssistantStore((state) => state.undo);
    const redoAssistant = useCreationAssistantStore((state) => state.redo);
    const config = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const sourceFiles = useMemo(
        () => buildSourceFiles(videoDraft.references, videoDraft.videoReferences, videoDraft.audioReferences, videoDraft.referenceOrder),
        [videoDraft.audioReferences, videoDraft.referenceOrder, videoDraft.references, videoDraft.videoReferences],
    );
    // @opc-feature: creation_assistant_model_picker [start]
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const defaultTextModel = config.textModel || config.model;
    const [selectedModel, setSelectedModel] = useState<string>(() => defaultTextModel);

    useEffect(() => {
        if (!selectedModel && defaultTextModel) {
            setSelectedModel(defaultTextModel);
        }
    }, [defaultTextModel, selectedModel]);

    const handleModelChange = (newModel: string) => {
        setSelectedModel(newModel);
        updateConfig("textModel", newModel);
    };

    const effectiveModel = selectedModel || defaultTextModel;
    const textModel = effectiveModel;
    const multimodalModel = effectiveModel;
    const textConfig = useMemo(() => ({ ...config, model: effectiveModel }), [config, effectiveModel]);
    const multimodalConfig = textConfig;
    const reverseInferenceConfig = textConfig;
    const materialCredit = useFeatureCredit("material_analysis", multimodalModel);
    const directingCredit = useFeatureCredit("directing_assistant", textModel);
    // @opc-feature: creation_assistant_model_picker [end]
    const [busy, setBusy] = useState(false);
    const [referenceReverseOpen, setReferenceReverseOpen] = useState(false);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.isComposing || busy || !(event.ctrlKey || event.metaKey)) return;
            const target = event.target;
            if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return;
            if (event.key.toLowerCase() === "z" && !event.shiftKey) {
                event.preventDefault();
                undoAssistant();
            } else if (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey)) {
                event.preventDefault();
                redoAssistant();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [busy, redoAssistant, undoAssistant]);

    const startAnalysis = async () => {
        if (!sourceFiles.length) {
            message.warning(t("creationAssistant.noSourceFiles"));
            return;
        }
        if (!isAiConfigReady(multimodalConfig, multimodalModel)) {
            message.warning(t("creationAssistant.analysisConfigRequired"));
            return;
        }
        setBusy(true);
        let deductedMicrocredits = 0;
        try {
            const deductRes = await materialCredit.deduct(multimodalModel, "素材分析");
            deductedMicrocredits = deductRes.deductedMicrocredits;
        } catch (creditErr) {
            message.error(creditErr instanceof Error ? creditErr.message : "积分扣减失败");
            setBusy(false);
            return;
        }
        try {
            let videoAnalyses = assistant.videoAnalyses;
            if (!hasPreparedCreationAssistantVideos(videoDraft.videoReferences, videoAnalyses)) {
                const staleAnalyses = videoAnalyses.filter((analysis) => !videoDraft.videoReferences.some((video) => isReusableCreationAssistantVideoAnalysis(video, analysis)));
                if (staleAnalyses.length) void disposeCreationAssistantVideoAnalyses(staleAnalyses);
                updateAssistant({ videoAnalysisStatus: "preparing", videoAnalysisError: "" });
                try {
                    videoAnalyses = await prepareCreationAssistantVideos(videoDraft.videoReferences, videoAnalyses);
                    updateAssistant({ videoAnalyses, videoAnalysisStatus: "ready", videoAnalysisError: "" });
                } catch (error) {
                    if (deductedMicrocredits > 0) {
                        void materialCredit.refund(deductedMicrocredits, multimodalModel, "素材分析失败退款");
                    }
                    const errorText = error instanceof Error ? error.message : "视频抽帧总拼图失败";
                    updateAssistant({ videoAnalysisStatus: "failed", videoAnalysisError: errorText });
                    message.error(errorText);
                    return;
                }
            }
            updateAssistant({ analysisStatus: "analyzing", analysisError: "" });
            const analysisFiles: AnalysisFile[] = sourceFiles.reduce<AnalysisFile[]>((files, file) => {
                if (file.kind === "image") {
                    const item = videoDraft.references.find((reference) => reference.id === file.id);
                    if (item) files.push({ id: file.id, name: file.name, kind: "image", item });
                    return files;
                }
                if (file.kind === "video") {
                    const item = videoDraft.videoReferences.find((reference) => reference.id === file.id);
                    if (item) files.push({ id: file.id, name: file.name, kind: "video", item });
                    return files;
                }
                const item = videoDraft.audioReferences.find((reference) => reference.id === file.id);
                if (item) files.push({ id: file.id, name: file.name, kind: "audio", item });
                return files;
            }, []);
            const result = await analyzeCreationAssistantBatch({ ...multimodalConfig, systemPrompt: "" }, analysisFiles, videoAnalyses);
            updateAssistant({ analysisStatus: "complete", fileSummaries: result.fileSummaries, insightSections: mergeCoreInsightSections(result.insightSections) });
            message.success(t("creationAssistant.analysisComplete"));
        } catch (error) {
            if (deductedMicrocredits > 0) {
                void materialCredit.refund(deductedMicrocredits, multimodalModel, "素材分析失败退款");
            }
            const errorText = error instanceof Error ? error.message : t("creationAssistant.analysisFailed");
            updateAssistant({ analysisStatus: "failed", analysisError: errorText });
            message.error(errorText);
        } finally {
            setBusy(false);
        }
    };

    const generateScript = async () => {
        if (!assistant.durationSec || assistant.durationSec < 1) {
            message.warning(t("creationAssistant.durationRequired"));
            return;
        }
        if (assistant.generationMethod === "reference_video") {
            if (!assistant.referenceScript.trim()) {
                setReferenceReverseOpen(true);
                return;
            }
        }
        if (!isAiConfigReady(textConfig, textModel)) {
            message.warning(t("creationAssistant.scriptConfigRequired"));
            return;
        }
        setBusy(true);
        let deductedScriptMicrocredits = 0;
        try {
            const deductRes = await directingCredit.deduct(textModel, "编导助手脚本生成");
            deductedScriptMicrocredits = deductRes.deductedMicrocredits;
        } catch (creditErr) {
            message.error(creditErr instanceof Error ? creditErr.message : "积分扣减失败");
            setBusy(false);
            return;
        }
        try {
            const assetReferenceMap = buildAssetReferenceMap(sourceFiles);
            const videoModel = resolveModelForCapability(config, videoDraft.model || config.videoModel || config.model, "video");
            const videoModelMaxDurationSec = resolveChannelVideoModelMaxDuration(config, videoModel);
            const videoSegmentPlan = segmentCreationAssistantTimeline(assistant.durationSec, videoModelMaxDurationSec);
            const promptBase = {
                fileSummaries: assistant.fileSummaries,
                insightSections: assistant.insightSections,
                assetReferenceMap,
                businessScenario: assistant.businessScenario,
                language: assistant.language,
                durationSec: assistant.durationSec,
                videoModel,
                videoModelMaxDurationSec,
                videoSegmentPlan,
                additionalNotes: assistant.additionalNotes,
            };
            const prompts =
                assistant.generationMethod === "reference_video"
                    ? buildReferenceScriptCreationAssistantPrompts({
                          ...promptBase,
                          referenceScript: assistant.referenceScript,
                          referenceScriptDurationSec: assistant.referenceScriptDurationSec,
                      })
                    : buildCreationAssistantPrompts({
                          ...promptBase,
                          scriptType: assistant.scriptType,
                          shootingStyle: assistant.shootingStyle,
                          primaryPlatform: assistant.primaryPlatform,
                          secondaryPlatforms: assistant.secondaryPlatforms,
                      });
            const script = await requestImageQuestion(
                { ...textConfig, systemPrompt: prompts.systemPrompt },
                [{ role: "user", content: prompts.userPrompt }],
                () => undefined,
                // @opc-feature: request-generation-options [start]
                { temperature: 0.85, presence_penalty: 0.2, scene: "directing_assistant" },
                // @opc-feature: request-generation-options [end]
            );
            updateAssistant({ script: normalizeCreationAssistantScript(script.trim(), assetReferenceMap), stage: "result" });
        } catch (error) {
            if (deductedScriptMicrocredits > 0) {
                void directingCredit.refund(deductedScriptMicrocredits, textModel, "编导助手脚本生成失败退款");
            }
            message.error(error instanceof Error ? error.message : t("creationAssistant.scriptFailed"));
        } finally {
            setBusy(false);
        }
    };

    const applyScript = () => {
        if (!assistant.script.trim()) return;
        const videoModel = resolveModelForCapability(config, videoDraft.model || config.videoModel || config.model, "video");
        const bounds = resolveChannelVideoModelDurationBounds(config, videoModel);
        const creationPlan = buildVideoCreationPlan({
            source: assistant.generationMethod,
            script: assistant.script.trim(),
            targetDurationSec: assistant.durationSec,
            model: videoModel,
            aspectRatio: videoDraft.aspectRatio,
            resolution: videoDraft.resolution,
            maxSegmentDurationSec: bounds.max,
            minSegmentDurationSec: bounds.min,
            fixedSegmentDurationSec: bounds.min === bounds.max ? bounds.max : undefined,
        });
        if (creationPlan.warnings?.some((warning) => warning.includes("时间段无法解析"))) {
            message.error("脚本时间段无法解析，请修正后再应用");
            return;
        }
        useVideoWorkbenchStore.getState().updateDraft({
            prompt: assistant.script.trim(),
            model: videoModel,
            durationSec: assistant.durationSec,
            creationPlan,
        });
        message.success(t("creationAssistant.applied"));
        navigate("/video");
    };

    return (
        <div className="fixed inset-0 z-50 flex min-h-0 items-center justify-center bg-black/40 p-2 text-stone-900 backdrop-blur-[1px] dark:bg-black/60 dark:text-stone-100 sm:p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="creation-assistant-title"
                className="flex h-full max-h-[960px] w-full max-w-[1360px] min-h-0 flex-col overflow-hidden rounded-2xl border border-black/[0.08] bg-[#f5f5f7] shadow-2xl dark:border-white/[0.1] dark:bg-[#121214]"
            >
                <header className="flex shrink-0 items-center justify-between border-b border-black/[0.06] bg-white/80 px-6 py-4 backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#1c1c1e]/80">
                    <div className="flex items-center gap-3">
                        <Button type="text" className="!rounded-full hover:!bg-black/[0.04] dark:hover:!bg-white/[0.06]" icon={<X className="size-4" />} onClick={() => navigate("/video")} aria-label={t("creationAssistant.backVideo")} />
                        <div>
                            <h1 id="creation-assistant-title" className="text-xl font-semibold tracking-tight text-stone-950 dark:text-stone-100">
                                {t("creationAssistant.title")}
                            </h1>
                            <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{t("creationAssistant.pageSubtitle")}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                        <span className="rounded-full bg-black/[0.04] px-2.5 py-1 font-medium text-stone-600 dark:bg-white/[0.06] dark:text-stone-300">
                            {sourceFiles.length} {t("creationAssistant.sourceCount")}
                        </span>
                        <span className="rounded-full bg-amber-500/10 px-2.5 py-1 font-medium text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                            {stageLabel(assistant.stage)}
                        </span>
                    </div>
                </header>

                <main className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[200px_minmax(0,1fr)]">
                    <aside className="flex flex-col rounded-xl border border-black/[0.06] bg-white p-3.5 shadow-xs dark:border-white/[0.08] dark:bg-[#1c1c1e]">
                        <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">{t("creationAssistant.workflow")}</div>
                        <div className="flex flex-col gap-1.5">
                            <StageButton label={t("creationAssistant.stageAnalysis")} active={assistant.stage === "analysis"} done={assistant.analysisStatus === "complete"} onClick={() => setStage("analysis")} />
                            <StageButton label={t("creationAssistant.stageConfig")} active={assistant.stage === "config"} done={assistant.stage === "result"} disabled={assistant.analysisStatus !== "complete"} onClick={() => setStage("config")} />
                            <StageButton label={t("creationAssistant.stagePreview")} active={assistant.stage === "result"} disabled={!assistant.script} onClick={() => setStage("result")} />
                        </div>
                    </aside>

                    <section className="thin-scrollbar min-h-0 overflow-y-auto rounded-lg border border-stone-200 bg-card p-5 dark:border-stone-800">
                        {assistant.stage === "analysis" ? (
                            <AnalysisStage sourceFiles={sourceFiles} assistant={assistant} busy={busy} config={config} model={effectiveModel} onModelChange={handleModelChange} onStart={startAnalysis} onRetry={startAnalysis} onUpdate={updateAssistant} onNext={() => setStage("config")} onCancel={() => navigate("/video")} />
                        ) : null}
                        {assistant.stage === "config" ? (
                            <ConfigStage assistant={assistant} busy={busy} config={config} model={effectiveModel} onModelChange={handleModelChange} onUpdate={updateAssistant} onGenerate={() => void generateScript()} onBack={() => setStage("analysis")} onOpenReferenceReverse={() => setReferenceReverseOpen(true)} />
                        ) : null}
                        {assistant.stage === "result" ? (
                            <ResultStage assistant={assistant} sourceFiles={sourceFiles} busy={busy} onUpdate={updateAssistant} onBack={() => setStage("config")} onRegenerate={() => setStage("config")} onApply={applyScript} />
                        ) : null}
                    </section>
                </main>
                <ReferenceVideoReverseDialog open={referenceReverseOpen} onClose={() => setReferenceReverseOpen(false)} reverseInferenceConfig={reverseInferenceConfig} multimodalConfig={multimodalConfig} textConfig={textConfig} />
            </div>
        </div>
    );
}

function isModelRoutingError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || "");
    return /unknown provider|provider .* model|model .* provider|does not exist or you do not have access/i.test(message);
}

// @opc-feature: creation_assistant_model_picker [start]
function AnalysisStage({
    sourceFiles,
    assistant,
    busy,
    config,
    model,
    onModelChange,
    onStart,
    onRetry,
    onUpdate,
    onNext,
    onCancel,
}: {
    sourceFiles: SourceFile[];
    assistant: ReturnType<typeof useCreationAssistantStore.getState>["draft"];
    busy: boolean;
    config: import("@/stores/use-config-store").AiConfig;
    model: string;
    onModelChange: (model: string) => void;
    onStart: () => void;
    onRetry: () => void;
    onUpdate: ReturnType<typeof useCreationAssistantStore.getState>["updateDraft"];
    onNext: () => void;
    onCancel: () => void;
}) {
    const analysisComplete = assistant.analysisStatus === "complete";
    return (
        <div data-view={analysisComplete ? "analysis-result" : "analysis-input"} className="grid gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <SectionHeading
                    title={t(analysisComplete ? "creationAssistant.analysisResultTitle" : "creationAssistant.analysisTitle")}
                    description={t(analysisComplete ? "creationAssistant.analysisResultDescription" : "creationAssistant.analysisDescription")}
                />
                <div className="flex items-center gap-2">
                    <FeatureCreditBadge scene="material_analysis" model={model} size="small" />
                    <span className="text-xs text-stone-500 whitespace-nowrap dark:text-stone-400">分析模型:</span>
                    <ModelPicker
                        config={config}
                        value={model}
                        onChange={onModelChange}
                        capability="text"
                        className="w-56"
                    />
                </div>
            </div>
            {!analysisComplete && !sourceFiles.length ? <EmptyState size="compact" description={t("creationAssistant.noSourceFiles")} /> : null}
            {!analysisComplete && (assistant.analysisStatus === "analyzing" || busy) ? (
                <div className="flex items-center gap-2 text-sm text-stone-500">
                    <LoaderCircle className="size-4 animate-spin" />
                    {t("creationAssistant.analyzing")}
                </div>
            ) : null}
            {!analysisComplete && assistant.analysisStatus === "failed" ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                    <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{assistant.analysisError}</span>
                        <Button size="small" onClick={onRetry}>
                            {t("creationAssistant.retry")}
                        </Button>
                    </div>
                    {isModelRoutingError(assistant.analysisError) ? (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-red-200/60 pt-2.5 dark:border-red-800/60">
                            <span className="text-xs text-red-600 dark:text-red-400">
                                提示：上游渠道未开通当前模型，请切换为可用模型重试：
                            </span>
                            <ModelPicker
                                config={config}
                                value={model}
                                onChange={(m) => { onModelChange(m); }}
                                capability="text"
                                className="w-56"
                            />
                        </div>
                    ) : null}
                </div>
            ) : null}
            {analysisComplete ? (
                <div className="grid gap-4">
                    <FileSummaryList
                        summaries={assistant.fileSummaries}
                        sourceFiles={sourceFiles}
                        onUpdate={(fileId, summary) =>
                            onUpdate((draft) => ({
                                ...draft,
                                fileSummaries: draft.fileSummaries.map((item) => (item.fileId === fileId ? { ...item, summary } : item)),
                            }))
                        }
                    />
                    <InsightBoard sections={assistant.insightSections} onUpdate={onUpdate} />
                </div>
            ) : null}
            <div className="sticky bottom-0 z-10 -mx-5 flex items-center justify-between gap-3 border-t border-stone-200/80 bg-card/95 px-5 py-3 backdrop-blur-md dark:border-stone-800/80">
                <div className="text-xs text-stone-400 dark:text-stone-500">
                    {assistant.analysisStatus === "complete" ? "素材分析已就绪，可继续完善或直接进入下一步" : "AI 将分析素材画面、卖点特征与人物角色"}
                </div>
                <div className="flex items-center gap-2.5">
                    {assistant.analysisStatus === "complete" ? (
                        <>
                            <Button onClick={onStart} loading={busy} disabled={busy} className="border-stone-200 dark:border-stone-800">
                                {t("creationAssistant.reanalyze")}
                            </Button>
                            <Button
                                type="primary"
                                disabled={busy}
                                onClick={onNext}
                                className="!border-amber-500 !bg-amber-500 font-semibold shadow-xs hover:!bg-amber-600 active:!bg-amber-700"
                                icon={<ArrowRight className="size-4" />}
                            >
                                {t("creationAssistant.next")}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button onClick={onCancel} disabled={busy} className="border-stone-200 dark:border-stone-800">
                                {t("creationAssistant.cancel")}
                            </Button>
                            <Button
                                type="primary"
                                onClick={onStart}
                                loading={busy}
                                disabled={busy}
                                className="!border-amber-500 !bg-amber-500 font-semibold shadow-xs hover:!bg-amber-600 active:!bg-amber-700"
                                icon={<Sparkles className="size-4" />}
                            >
                                {t("creationAssistant.confirmAnalyze")}
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function ConfigStage({
    assistant,
    busy,
    config,
    model,
    onModelChange,
    onUpdate,
    onGenerate,
    onBack,
    onOpenReferenceReverse,
}: {
    assistant: ReturnType<typeof useCreationAssistantStore.getState>["draft"];
    busy: boolean;
    config: import("@/stores/use-config-store").AiConfig;
    model: string;
    onModelChange: (model: string) => void;
    onUpdate: ReturnType<typeof useCreationAssistantStore.getState>["updateDraft"];
    onGenerate: () => void;
    onBack: () => void;
    onOpenReferenceReverse: () => void;
}) {
    return (
        <div className="grid gap-5">
            <SectionHeading title={t("creationAssistant.configTitle")} description={t("creationAssistant.configDescription")} />
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                <div>
                    <div className="text-sm font-semibold">生成脚本模型</div>
                    <div className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">用于分镜头脚本编写与提示词延展的文本大模型</div>
                </div>
                <div className="flex items-center gap-2">
                    <FeatureCreditBadge scene="directing_assistant" model={model} size="small" />
                    <ModelPicker
                        config={config}
                        value={model}
                        onChange={onModelChange}
                        capability="text"
                        className="w-56"
                    />
                </div>
            </div>
            {/* @opc-feature: creation_assistant_model_picker [end] */}
            <OptionSection
                title={t("creationAssistant.businessScenario")}
                options={[
                    { id: "ecommerce", label: "电商带货" },
                    { id: "local_life", label: "本地生活" },
                ]}
                value={assistant.businessScenario}
                onChange={(value) => {
                    const nextUpdates: Partial<typeof assistant> = { businessScenario: value };
                    if (!isScriptTypeValidForScenario(assistant.scriptType, value)) {
                        nextUpdates.scriptType = "smart";
                    }
                    onUpdate(nextUpdates);
                }}
            />
            <OptionSection
                title={t("creationAssistant.language")}
                options={[
                    { id: "zh", label: "中文" },
                    { id: "en", label: "英文" },
                ]}
                value={assistant.language}
                onChange={(value) => onUpdate({ language: value })}
            />
            <div className="grid gap-3 rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                <div className="text-sm font-semibold">{t("creationAssistant.generationMethod")}</div>
                <div className="grid gap-2 sm:grid-cols-2">
                    <GenerationMethodOption label="按配置生成脚本" description={t("creationAssistant.configGenerationDescription")} selected={assistant.generationMethod === "config"} onClick={() => onUpdate({ generationMethod: "config" })} />
                    <GenerationMethodOption
                        label="参考生脚本"
                        description={t("creationAssistant.referenceGenerationDescription")}
                        selected={assistant.generationMethod === "reference_video"}
                        onClick={() => {
                            onUpdate({ generationMethod: "reference_video" });
                            onOpenReferenceReverse();
                        }}
                    />
                </div>
            </div>
            {assistant.generationMethod === "config" ? (
                <>
                    <OptionSection title={t("creationAssistant.primaryPlatform")} options={CREATION_ASSISTANT_PLATFORMS} value={assistant.primaryPlatform} onChange={(value) => onUpdate({ primaryPlatform: value })} />
                    <div className="grid gap-3 rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                        <div className="text-sm font-semibold">{t("creationAssistant.secondaryPlatforms")}</div>
                        <MultiOptionGrid options={CREATION_ASSISTANT_PLATFORMS} values={assistant.secondaryPlatforms} onChange={(values) => onUpdate({ secondaryPlatforms: values })} />
                    </div>
                    <ScriptTypePicker
                        scenario={assistant.businessScenario}
                        value={assistant.scriptType}
                        onChange={(value) => onUpdate({ scriptType: value })}
                    />
                    <div className="grid gap-3 rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                        <div className="text-sm font-semibold">{t("creationAssistant.shootingStyle")}</div>
                        <OptionGrid options={CREATION_ASSISTANT_SHOOTING_STYLES} value={assistant.shootingStyle} onChange={(value) => onUpdate({ shootingStyle: value })} />
                    </div>
                </>
            ) : null}
            <div className="grid gap-3.5 rounded-2xl border border-black/[0.06] bg-white p-4.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] dark:border-white/[0.08] dark:bg-[#1c1c1e]">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">{t("creationAssistant.duration")}</div>
                        <div className="mt-0.5 text-xs text-stone-400 dark:text-stone-500">{t("creationAssistant.durationHint")}</div>
                    </div>
                    <InputNumber
                        min={1}
                        max={180}
                        value={assistant.durationSec}
                        addonAfter="秒"
                        className="w-24 font-medium"
                        onChange={(value) => onUpdate({ durationSec: Math.max(1, Math.min(180, Number(value) || 1)) })}
                    />
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-xs text-stone-400 dark:text-stone-500">预设:</span>
                    <div className="inline-flex flex-wrap items-center gap-1 rounded-full bg-black/[0.04] p-1 dark:bg-white/[0.06]">
                        {CREATION_ASSISTANT_DURATION_PRESETS.map((value) => {
                            const isSelected = assistant.durationSec === value;
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => onUpdate({ durationSec: value })}
                                    className={`rounded-full px-3.5 py-1 text-xs font-medium transition-all ${
                                        isSelected
                                            ? "bg-white text-stone-950 shadow-xs ring-1 ring-black/[0.04] dark:bg-[#2c2c2e] dark:text-amber-400 dark:ring-white/[0.1] font-semibold"
                                            : "text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
                                    }`}
                                >
                                    {value}s
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
            {assistant.generationMethod === "reference_video" ? (
                <div className="grid gap-3 rounded-2xl border border-black/[0.06] bg-white p-4.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] dark:border-white/[0.08] dark:bg-[#1c1c1e]">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-sm font-semibold">{t("creationAssistant.referenceMaterial")}</div>
                            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">{t("creationAssistant.referenceMaterialHint")}</div>
                        </div>
                        <Button type="primary" className="!rounded-full !bg-amber-500 hover:!bg-amber-600 !border-0 font-medium" icon={<FileText className="size-4" />} onClick={onOpenReferenceReverse}>
                            {assistant.referenceScript.trim() || assistant.reversePrompt.trim() ? t("creationAssistant.openReferenceScript") : t("creationAssistant.openReferenceReverse")}
                        </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                        {assistant.referenceScript.trim() || assistant.reversePrompt.trim() ? <Tag color="success">{t("creationAssistant.referenceReverseReady")}</Tag> : <Tag>{t("creationAssistant.referenceReverseNotReady")}</Tag>}
                        {assistant.reverseSourceUrl.trim() ? <span className="max-w-[520px] truncate">{assistant.reverseSourceUrl}</span> : null}
                    </div>
                </div>
            ) : null}
            <div className="grid gap-2 rounded-2xl border border-black/[0.06] bg-white p-4.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] dark:border-white/[0.08] dark:bg-[#1c1c1e]">
                <div className="text-sm font-semibold">{t("creationAssistant.additionalNotes")}</div>
                <Input.TextArea value={assistant.additionalNotes} onChange={(event) => onUpdate({ additionalNotes: event.target.value })} rows={5} maxLength={5000} placeholder={t("creationAssistant.additionalNotesPlaceholder")} />
            </div>
            <div className="sticky bottom-0 z-10 -mx-5 flex items-center justify-between gap-3 border-t border-black/[0.06] bg-white/80 px-6 py-3.5 backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#1c1c1e]/80">
                <Button
                    icon={<ArrowLeft className="size-4" />}
                    onClick={onBack}
                    className="!h-10 !px-5 !rounded-full !bg-black/[0.04] hover:!bg-black/[0.08] dark:!bg-white/[0.06] dark:hover:!bg-white/[0.1] !text-stone-700 dark:!text-stone-200 !border-0 font-medium active:scale-[0.98] transition-all flex items-center gap-1.5"
                >
                    {t("creationAssistant.back")}
                </Button>
                <div className="flex items-center gap-2">
                    <FeatureCreditBadge scene="directing_assistant" model={model} />
                    <Button
                        type="primary"
                        icon={<Sparkles className="size-4" />}
                        loading={busy}
                        onClick={onGenerate}
                        className="!h-10 !px-7 !rounded-full !bg-gradient-to-r !from-amber-500 !to-amber-600 hover:!from-amber-500/95 hover:!to-amber-600/95 !text-white font-semibold !border-0 shadow-md shadow-amber-500/25 active:scale-[0.98] transition-all flex items-center gap-2 text-sm"
                    >
                        {t("creationAssistant.generateScript")}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function ResultStage({
    assistant,
    sourceFiles,
    busy,
    onUpdate,
    onBack,
    onRegenerate,
    onApply,
}: {
    assistant: ReturnType<typeof useCreationAssistantStore.getState>["draft"];
    sourceFiles: SourceFile[];
    busy: boolean;
    onUpdate: ReturnType<typeof useCreationAssistantStore.getState>["updateDraft"];
    onBack: () => void;
    onRegenerate: () => void;
    onApply: () => void;
}) {
    return (
        <div className="flex min-h-[70vh] flex-col gap-4">
            <SectionHeading title={t("creationAssistant.resultTitle")} description={t("creationAssistant.resultDescription")} />
            <ScriptReferencePreview script={assistant.script} sourceFiles={sourceFiles} onChange={(script) => onUpdate({ script })} />
            <div className="flex items-center justify-between border-t border-black/[0.06] pt-4 dark:border-white/[0.08]">
                <Button
                    icon={<ArrowLeft className="size-4" />}
                    onClick={onBack}
                    className="!h-10 !px-5 !rounded-full !bg-black/[0.04] hover:!bg-black/[0.08] dark:!bg-white/[0.06] dark:hover:!bg-white/[0.1] !text-stone-700 dark:!text-stone-200 !border-0 font-medium active:scale-[0.98] transition-all"
                >
                    {t("creationAssistant.back")}
                </Button>
                <div className="flex items-center gap-2.5">
                    <Button
                        onClick={onRegenerate}
                        disabled={busy}
                        className="!h-10 !px-5 !rounded-full !bg-black/[0.04] hover:!bg-black/[0.08] dark:!bg-white/[0.06] dark:hover:!bg-white/[0.1] !text-stone-700 dark:!text-stone-200 !border-0 font-medium active:scale-[0.98] transition-all"
                    >
                        {t("creationAssistant.regenerate")}
                    </Button>
                    <Button
                        type="primary"
                        icon={<Check className="size-4" />}
                        onClick={onApply}
                        disabled={!assistant.script.trim() || busy}
                        className="!h-10 !px-6 !rounded-full !bg-amber-500 hover:!bg-amber-600 !text-white font-semibold !border-0 shadow-xs active:scale-[0.98] transition-all flex items-center gap-1.5"
                    >
                        {t("creationAssistant.applyScript")}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
    return (
        <div>
            <h2 className="text-lg font-semibold tracking-tight text-stone-950 dark:text-stone-100">{title}</h2>
            <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{description}</p>
        </div>
    );
}

function StageButton({ label, active, done = false, disabled, onClick }: { label: string; active: boolean; done?: boolean; disabled?: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            disabled={disabled}
            className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-left text-xs transition-all ${
                active
                    ? "bg-white text-stone-950 shadow-xs ring-1 ring-black/[0.06] dark:bg-[#2c2c2e] dark:text-stone-100 dark:ring-white/[0.1] font-semibold"
                    : done
                    ? "text-stone-700 hover:bg-black/[0.03] dark:text-stone-300 dark:hover:bg-white/[0.04]"
                    : "text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-400"
            } disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]`}
            onClick={onClick}
        >
            <span
                className={`size-2 rounded-full transition-all ${
                    active
                        ? "bg-amber-500 shadow-xs ring-2 ring-amber-500/20"
                        : done
                        ? "bg-amber-500/70"
                        : "bg-stone-300 dark:bg-stone-600"
                }`}
            />
            <span className="truncate">{label}</span>
            {done && !active ? <Check className="ml-auto size-3 text-amber-600 dark:text-amber-400 stroke-[2.5]" /> : null}
        </button>
    );
}

function FileSummaryList({ summaries, sourceFiles, onUpdate }: { summaries: CreationAssistantFileSummary[]; sourceFiles: SourceFile[]; onUpdate: (fileId: string, summary: string) => void }) {
    return (
        <div className="grid gap-2">
            {summaries.map((item) => (
                <div key={item.fileId} className="flex items-start gap-3 rounded-md border border-stone-200 p-3 dark:border-stone-800">
                    <div className="relative size-14 shrink-0 overflow-hidden rounded bg-stone-100 dark:bg-stone-900">
                        <SourceFilePreview file={sourceFiles.find((file) => file.id === item.fileId)} />
                        <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] text-white">{item.order}</span>
                    </div>
                    <Input.TextArea value={item.summary} onChange={(event) => onUpdate(item.fileId, event.target.value)} autoSize={{ minRows: 2, maxRows: 5 }} className="!resize-none" />
                </div>
            ))}
        </div>
    );
}

function SourceFilePreview({ file }: { file?: SourceFile }) {
    if (file?.kind === "image") return <img src={file.dataUrl || file.url} alt="" className="size-full object-cover" />;
    if (file?.kind === "video") return <video src={file.url} muted preload="metadata" className="size-full object-cover" />;
    return (
        <div className="grid size-full place-items-center">
            <FileText className="size-5 text-stone-400" />
        </div>
    );
}

function InsightBoard({ sections, onUpdate }: { sections: ReturnType<typeof useCreationAssistantStore.getState>["draft"]["insightSections"]; onUpdate: ReturnType<typeof useCreationAssistantStore.getState>["updateDraft"] }) {
    return (
        <div className="grid items-stretch gap-3 md:grid-cols-2">
            {sections.map((section) => (
                <div key={section.sectionKey} className="grid h-full content-start gap-2 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold">{section.title}</div>
                        <div className="flex items-center gap-1">
                            <Button
                                type="text"
                                size="small"
                                icon={<Plus className="size-4" />}
                                onClick={() =>
                                    onUpdate((draft) => ({
                                        ...draft,
                                        insightSections: draft.insightSections.map((item) =>
                                            item.sectionKey === section.sectionKey ? { ...item, items: [...item.items, { itemId: `assistant-item-${Date.now()}`, text: "", sourceFileIds: [], confidence: 0, riskFlags: [], userEdited: true }] } : item,
                                        ),
                                    }))
                                }
                            />
                            {section.sectionType === "extension" ? (
                                <Button
                                    type="text"
                                    size="small"
                                    danger
                                    icon={<Trash2 className="size-4" />}
                                    aria-label="删除补充洞察板块"
                                    onClick={() => onUpdate((draft) => ({ ...draft, insightSections: draft.insightSections.filter((item) => item.sectionKey !== section.sectionKey) }))}
                                />
                            ) : null}
                        </div>
                    </div>
                    {section.items.map((item) => (
                        <InsightItem
                            key={item.itemId}
                            item={item}
                            onUpdate={(text) =>
                                onUpdate((draft) => ({
                                    ...draft,
                                    insightSections: draft.insightSections.map((sectionItem) =>
                                        sectionItem.sectionKey === section.sectionKey ? { ...sectionItem, items: sectionItem.items.map((current) => (current.itemId === item.itemId ? { ...current, text, userEdited: true } : current)) } : sectionItem,
                                    ),
                                }))
                            }
                            onDelete={() =>
                                onUpdate((draft) => ({
                                    ...draft,
                                    insightSections: draft.insightSections.map((sectionItem) =>
                                        sectionItem.sectionKey === section.sectionKey ? { ...sectionItem, items: sectionItem.items.filter((current) => current.itemId !== item.itemId) } : sectionItem,
                                    ),
                                }))
                            }
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

function GenerationMethodOption({ label, description, selected, onClick }: { label: string; description: string; selected: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            className={`grid gap-1 rounded-md border px-3 py-3 text-left transition-all ${
                selected
                    ? "border-amber-500/80 bg-amber-50/70 ring-1 ring-amber-500/30 dark:border-amber-500/70 dark:bg-amber-950/25 dark:ring-amber-500/20 shadow-xs"
                    : "border-stone-200 hover:border-amber-300 hover:bg-stone-50/50 dark:border-stone-800 dark:hover:border-stone-700"
            }`}
            onClick={onClick}
        >
            <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                <span className={selected ? "text-stone-900 dark:text-stone-100" : ""}>{label}</span>
                {selected ? <Check className="size-4 shrink-0 text-amber-600 dark:text-amber-400 stroke-[2.5]" /> : null}
            </span>
            <span className="text-xs leading-5 text-stone-500 dark:text-stone-400">{description}</span>
        </button>
    );
}

function InsightItem({ item, onUpdate, onDelete }: { item: CreationAssistantInsightItem; onUpdate: (text: string) => void; onDelete: () => void }) {
    return (
        <div className="flex items-start gap-2">
            <Input.TextArea value={item.text} onChange={(event) => onUpdate(event.target.value)} autoSize={{ minRows: 1, maxRows: 4 }} placeholder="分析点" />
            <Button type="text" danger icon={<Trash2 className="size-4" />} onClick={onDelete} />
        </div>
    );
}

function ScriptTypePicker({
    scenario,
    value,
    onChange,
}: {
    scenario: "ecommerce" | "local_life";
    value: CreationAssistantScriptType;
    onChange: (value: CreationAssistantScriptType) => void;
}) {
    const smartOption = findCreationAssistantScriptType("smart");
    const groups = useMemo(() => getCreationAssistantScriptTypeGroups(scenario), [scenario]);
    const isSmartSelected = value === "smart";

    return (
        <div className="grid gap-3.5 rounded-xl border border-stone-200/90 bg-stone-50/40 p-4 dark:border-stone-800/90 dark:bg-stone-900/30">
            {/* 顶栏标题：极简干练 */}
            <div className="flex items-center justify-between border-b border-stone-200/80 pb-2.5 dark:border-stone-800/80">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">脚本类型</span>
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                        {scenario === "ecommerce" ? "电商带货" : "本地生活"}
                    </span>
                </div>
                <span className="text-xs text-stone-400 dark:text-stone-500">
                    支持定向自选，亦可交由 AI 智能匹配
                </span>
            </div>

            {/* 智能匹配置顶 Banner 卡片 */}
            <div>
                <button
                    type="button"
                    onClick={() => onChange("smart")}
                    className={`group relative flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-all ${
                        isSmartSelected
                            ? "border-amber-500/90 bg-amber-50/80 ring-1 ring-amber-500/30 dark:border-amber-500/70 dark:bg-amber-950/25 dark:ring-amber-500/20 shadow-xs"
                            : "border-stone-200/90 bg-white/80 hover:border-amber-300 hover:bg-amber-50/20 dark:border-stone-800 dark:bg-stone-900/60 dark:hover:border-amber-700/50"
                    }`}
                >
                    <div className="flex items-start gap-3">
                        <div
                            className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md transition-colors ${
                                isSmartSelected
                                    ? "bg-amber-500 text-white shadow-xs"
                                    : "bg-amber-50 text-amber-600 dark:bg-stone-800 dark:text-amber-400 group-hover:bg-amber-500/15"
                            }`}
                        >
                            <Sparkles className="size-4" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className={`text-sm font-semibold ${isSmartSelected ? "text-stone-900 dark:text-stone-100" : "text-stone-800 dark:text-stone-200"}`}>
                                    {smartOption.label}
                                </span>
                                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-400/20 dark:text-amber-300">
                                    ⚡ 推荐首选
                                </span>
                            </div>
                            <p className="mt-0.5 text-xs leading-4 text-stone-500 dark:text-stone-400">
                                {smartOption.desc}
                            </p>
                        </div>
                    </div>
                    <div className="shrink-0 pr-1">
                        {isSmartSelected ? (
                            <div className="flex size-5 items-center justify-center rounded-full bg-amber-500 text-white shadow-xs">
                                <Check className="size-3 stroke-[3]" />
                            </div>
                        ) : (
                            <div className="size-5 rounded-full border border-stone-300 transition-colors group-hover:border-amber-400 dark:border-stone-700" />
                        )}
                    </div>
                </button>
            </div>

            {/* 按分类分组呈现 */}
            <div className="grid gap-3.5 pt-0.5">
                {groups.map((group) => (
                    <div key={group.key} className="grid gap-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <span className="size-1.5 rounded-full bg-amber-500/70" />
                                <span className="text-xs font-semibold tracking-wide text-stone-800 dark:text-stone-200">
                                    {group.title}
                                </span>
                                <span className="text-[11px] text-stone-400 dark:text-stone-500">
                                    ({group.items.length})
                                </span>
                            </div>
                            {group.description ? (
                                <span className="hidden text-[11px] text-stone-400 sm:inline dark:text-stone-500">
                                    {group.description}
                                </span>
                            ) : null}
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                            {group.items.map((option) => {
                                const selected = value === option.id;
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => onChange(option.id)}
                                        className={`group relative flex min-h-[74px] flex-col justify-between rounded-lg border p-2.5 text-left transition-all ${
                                            selected
                                                ? "border-amber-500/90 bg-amber-50/80 ring-1 ring-amber-500/30 shadow-xs dark:border-amber-500/70 dark:bg-amber-950/25 dark:ring-amber-500/20"
                                                : "border-stone-200/90 bg-white/80 hover:border-amber-300/80 hover:bg-amber-50/20 dark:border-stone-800 dark:bg-stone-900/60 dark:hover:border-amber-800/40 dark:hover:bg-stone-800/80"
                                        }`}
                                    >
                                        <div className="flex w-full items-start justify-between gap-1.5">
                                            <span className={`font-semibold text-xs leading-4 ${
                                                selected ? "text-stone-900 dark:text-stone-100" : "text-stone-800 dark:text-stone-200"
                                            }`}>
                                                {option.label}
                                            </span>
                                            <div className="flex items-center gap-1">
                                                {option.badge && !selected ? (
                                                    <span className="rounded bg-stone-100 px-1 py-0.2 text-[9px] font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                                                        {option.badge}
                                                    </span>
                                                ) : null}
                                                {selected ? (
                                                    <div className="flex size-4 items-center justify-center rounded-full bg-amber-500 text-white shadow-xs">
                                                        <Check className="size-2.5 stroke-[3]" />
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                        {option.desc ? (
                                            <p
                                                className={`mt-1.5 line-clamp-2 text-[11px] leading-tight transition-colors ${
                                                    selected
                                                        ? "text-stone-600 dark:text-stone-300"
                                                        : "text-stone-500 group-hover:text-stone-700 dark:text-stone-400 dark:group-hover:text-stone-300"
                                                }`}
                                            >
                                                {option.desc}
                                            </p>
                                        ) : null}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function OptionSection<T extends string>({ title, options, value, onChange }: { title: string; options: ReadonlyArray<{ id: T; label: string }>; value: T; onChange: (value: T) => void }) {
    return (
        <div className="grid gap-3.5 rounded-2xl border border-black/[0.06] bg-white p-4.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] dark:border-white/[0.08] dark:bg-[#1c1c1e]">
            <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">{title}</div>
            <OptionGrid options={options} value={value} onChange={onChange} />
        </div>
    );
}

function OptionGrid<T extends string>({ options, value, onChange }: { options: ReadonlyArray<{ id: T; label: string }>; value: T; onChange: (value: T) => void }) {
    return (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {options.map((option) => (
                <button
                    key={option.id}
                    type="button"
                    className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-sm transition-all ${
                        value === option.id
                            ? "border-amber-500/90 bg-amber-500/[0.08] font-semibold text-stone-900 ring-1 ring-amber-500/30 dark:border-amber-500/70 dark:bg-amber-500/[0.12] dark:text-stone-100 shadow-xs"
                            : "border-black/[0.06] bg-black/[0.015] hover:border-amber-300/80 hover:bg-amber-50/20 dark:border-white/[0.08] dark:bg-white/[0.02] dark:hover:border-amber-700/50"
                    }`}
                    onClick={() => onChange(option.id)}
                >
                    <span>{option.label}</span>
                    {value === option.id ? <Check className="size-4 text-amber-600 dark:text-amber-400 stroke-[2.5]" /> : null}
                </button>
            ))}
        </div>
    );
}

function MultiOptionGrid<T extends string>({ options, values, onChange }: { options: ReadonlyArray<{ id: T; label: string }>; values: T[]; onChange: (values: T[]) => void }) {
    return (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {options.map((option) => {
                const selected = values.includes(option.id);
                return (
                    <button
                        key={option.id}
                        type="button"
                        className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-all ${
                            selected
                                ? "border-amber-500/90 bg-amber-50/70 font-semibold text-stone-900 ring-1 ring-amber-500/30 dark:border-amber-500/70 dark:bg-amber-950/25 dark:text-stone-100 shadow-xs"
                                : "border-stone-200 hover:border-amber-300 hover:bg-stone-50/50 dark:border-stone-800 dark:hover:border-stone-700"
                        }`}
                        onClick={() => onChange(selected ? values.filter((value) => value !== option.id) : [...values, option.id])}
                    >
                        <span>{option.label}</span>
                        {selected ? <Check className="size-4 text-amber-600 dark:text-amber-400 stroke-[2.5]" /> : null}
                    </button>
                );
            })}
        </div>
    );
}

function buildSourceFiles(images: ReferenceImage[], videos: ReferenceVideo[], audios: ReferenceAudio[], order: Array<{ id: string; kind: SourceFile["kind"] }> = []): SourceFile[] {
    const byId = new Map<string, SourceFile>();
    images.forEach((item) => byId.set(item.id, { id: item.id, name: item.name, kind: "image", url: item.dataUrl, dataUrl: item.dataUrl }));
    videos.forEach((item) => byId.set(item.id, { id: item.id, name: item.name, kind: "video", url: item.url, durationMs: item.durationMs }));
    audios.forEach((item) => byId.set(item.id, { id: item.id, name: item.name, kind: "audio", url: item.url, durationMs: item.durationMs }));
    const ordered = order.map((entry) => byId.get(entry.id)).filter((item): item is SourceFile => Boolean(item));
    const seen = new Set(ordered.map((item) => item.id));
    return [...ordered, ...Array.from(byId.values()).filter((item) => !seen.has(item.id))];
}

function buildAssetReferenceMap(sourceFiles: SourceFile[]) {
    const counters: Record<SourceFile["kind"], number> = { image: 0, video: 0, audio: 0 };
    return sourceFiles.map((file) => {
        counters[file.kind] += 1;
        const prefix = file.kind === "image" ? "图片" : file.kind === "video" ? "视频" : "音频";
        return { ref: `@${prefix}${counters[file.kind]}`, mediaType: file.kind, fileId: file.id, name: file.name };
    });
}

function ScriptReferencePreview({ script, sourceFiles, onChange }: { script: string; sourceFiles: SourceFile[]; onChange?: (script: string) => void }) {
    const references = buildAssetReferenceMap(sourceFiles);
    const byRef = new Map(references.map((item) => [item.ref, item]));
    return (
        <div
            className="min-h-[62vh] max-h-[70vh] overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm leading-7 outline-none focus-within:border-stone-500 dark:border-stone-800 dark:bg-stone-950"
            contentEditable={Boolean(onChange)}
            suppressContentEditableWarning
            onBlur={(event) => onChange?.(serializeScriptPreview(event.currentTarget))}
        >
            {script.split(/\r?\n/).map((line, lineIndex) => {
                const isHeading = /^(视频总览|场景与光线|逐秒镜头拆解列表|时间段：)/.test(line.trim());
                return (
                    <span key={`${line}-${lineIndex}`} className={isHeading ? "mt-3 block font-semibold first:mt-0" : "block min-h-7"}>
                        {line.split(/(@(?:图片|视频|音频|文本)\d+)/g).map((part, index) => {
                            const reference = byRef.get(part);
                            if (!reference) return <span key={`${part}-${index}`}>{part}</span>;
                            const file = sourceFiles.find((item) => item.id === reference.fileId);
                            return (
                                <span
                                    key={`${part}-${index}`}
                                    data-ref-label={reference.ref}
                                    contentEditable={false}
                                    className="mx-0.5 inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 align-baseline text-xs font-medium shadow-sm dark:bg-stone-900"
                                >
                                    {file?.kind === "image" ? <img src={file.dataUrl || file.url} alt={file.name} className="size-4 rounded object-cover" /> : file?.kind === "video" ? <Video className="size-3.5" /> : <FileText className="size-3.5" />}
                                    {reference.ref.slice(1)}
                                </span>
                            );
                        })}
                        {lineIndex < script.split(/\r?\n/).length - 1 ? <br /> : null}
                    </span>
                );
            })}
        </div>
    );
}

function serializeScriptPreview(editor: HTMLElement) {
    const visit = (nodes: NodeListOf<ChildNode>): string => {
        let result = "";
        nodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                result += node.textContent || "";
                return;
            }
            if (!(node instanceof HTMLElement)) return;
            if (node.dataset.refLabel) {
                result += node.dataset.refLabel;
                return;
            }
            if (node.tagName === "BR") {
                result += "\n";
                return;
            }
            result += visit(node.childNodes);
            if (node.tagName === "DIV") result += "\n";
        });
        return result;
    };
    return visit(editor.childNodes).replace(/\n+$/, "");
}

function mergeCoreInsightSections(sections: ReturnType<typeof useCreationAssistantStore.getState>["draft"]["insightSections"]) {
    const existing = new Map(sections.map((section) => [section.sectionKey, section]));
    const coreKeys = new Set<string>(CREATION_ASSISTANT_CORE_SECTIONS.map(([sectionKey]) => sectionKey));
    const current = useCreationAssistantStore.getState().draft.insightSections;
    return current
        .filter((section) => coreKeys.has(section.sectionKey))
        .map((section) => existing.get(section.sectionKey) || section)
        .concat(sections.filter((section) => section.sectionType === "extension" && !coreKeys.has(section.sectionKey)));
}

function stageLabel(stage: string) {
    return stage === "analysis" ? t("creationAssistant.stageAnalysis") : stage === "config" ? t("creationAssistant.stageConfig") : t("creationAssistant.stagePreview");
}
