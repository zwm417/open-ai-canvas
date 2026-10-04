import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Input, InputNumber, Modal, Select, Switch, Tag, message as staticMessage } from "antd";
import { Check, ChevronDown, ChevronUp, Copy, Download, FileText, Film, LoaderCircle, Maximize2, Play, Plus, RefreshCw, SendHorizontal, Settings2, SlidersHorizontal, Sparkles, Upload } from "lucide-react";
import saveAs from "file-saver";

import { useUpstreamNodes } from "@/components/canvas/canvas-node-graph-context";
import { useCanvasNodeActions } from "@/components/canvas/canvas-node-action-context";
import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CanvasNodeData } from "@/types/canvas";
import { CanvasNodeType } from "@/types/canvas";
import { resolveModelForCapability, useEffectiveConfig, useConfigStore } from "@/stores/use-config-store";
import { ModelPicker } from "@/components/model-picker";
import { FeatureCreditBadge } from "@/components/feature-credit-badge";
import { useFeatureCredit } from "@/hooks/use-feature-credit";
import { requestImageQuestion } from "@/services/api/image";
import { resolveResourceUrl } from "@/services/api/resources";
import {
    CREATION_ASSISTANT_DURATION_PRESETS,
    CREATION_ASSISTANT_PLATFORMS,
    CREATION_ASSISTANT_SCRIPT_TYPES,
    CREATION_ASSISTANT_SHOOTING_STYLES,
    getCreationAssistantScriptTypeGroups,
    isScriptTypeValidForScenario,
    type CreationAssistantPlatform,
    type CreationAssistantScriptType,
    type CreationAssistantShootingStyle,
} from "@/lib/creation-assistant-catalog";
import {
    buildCreationAssistantPrompts,
    buildCreationAssistantSystemPrompt,
    buildReferenceScriptCreationAssistantPrompts,
    normalizeCreationAssistantScript,
} from "@/lib/creation-assistant-prompts";
import { segmentCreationAssistantTimeline } from "@/lib/creation-assistant-segmentation";
import {
    resolveChannelVideoModelDurationBounds,
    resolveChannelVideoModelMaxDuration,
} from "@/lib/model-capabilities";
import {
    CREATION_ASSISTANT_ANALYSIS_NODE_TYPE,
    CREATION_ASSISTANT_SCRIPT_NODE_TYPE,
    CREATION_ASSISTANT_SCRIPT_PLUGIN_ID,
    type ConfigScriptMeta,
    type MaterialAnalysisMeta,
} from "../services/creation-assistant-contracts";
import { nanoid } from "nanoid";
import {
    failNodeTask,
    finishNodeTask,
    isCurrentExecution,
    reconcileOrphanedClientNodeState,
    recordTaskDeduction,
    startNodeTask,
    updateNodeTaskProgress,
    updateNodeTaskStreamedText,
    useNodeTask,
} from "../services/opc-task-hub";
import { VIDEO_REVERSE_NODE_TYPE } from "../services/video-reverse-contracts";
import { PromptEditorModal } from "./prompt-editor-modal";
import { ScriptReferencePreview } from "./script-reference-preview";

type Props = {
    node: CanvasNodeData;
    theme: CanvasTheme;
};

export function CreationAssistantScriptNodeContent({ node, theme }: Props) {
    const { message: appMessage } = App.useApp();
    const message = appMessage || staticMessage;
    const upstreamNodes = useUpstreamNodes(node.id);
    const { updateMetadata } = useCanvasNodeActions();
    const config = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);

    const meta: ConfigScriptMeta = useMemo(() => {
        return (node.metadata?.configScript as ConfigScriptMeta) || {};
    }, [node.metadata?.configScript]);

    const [businessScenario, setBusinessScenario] = useState<"ecommerce" | "local_life">(meta.businessScenario || "ecommerce");
    const [language, setLanguage] = useState<"zh" | "en">(meta.language || "zh");
    const [scriptType, setScriptType] = useState<CreationAssistantScriptType>(meta.scriptType || "smart");
    const [shootingStyle, setShootingStyle] = useState<CreationAssistantShootingStyle>(meta.shootingStyle || "smart");
    const [durationSec, setDurationSec] = useState<number>(meta.durationSec || 30);
    const [primaryPlatform, setPrimaryPlatform] = useState<CreationAssistantPlatform>(meta.primaryPlatform || "douyin");
    const [additionalNotes, setAdditionalNotes] = useState<string>(meta.additionalNotes || "");
    const [customRules, setCustomRules] = useState<string>(meta.customRules || "");
    const [customPrompt, setCustomPrompt] = useState<string>(meta.customPrompt || "");
    const [useCustomPrompt, setUseCustomPrompt] = useState<boolean>(Boolean(meta.useCustomPrompt));
    const [promptModalOpen, setPromptModalOpen] = useState<boolean>(false);

    const defaultModel = meta.model || config.textModel || config.model;
    const [selectedModel, setSelectedModel] = useState<string>(defaultModel);

    useEffect(() => {
        if (meta.model) setSelectedModel(meta.model);
    }, [meta.model]);

    const handleModelChange = (newModel: string) => {
        setSelectedModel(newModel);
        updateMetadata?.(node.id, {
            configScript: {
                ...meta,
                model: newModel,
            },
        });
    };

    const [targetVideoModel, setTargetVideoModel] = useState<string>(
        meta.videoModel || (meta as any).targetVideoModel || config.videoModel || "doubao-seedance-2.0"
    );
    const targetModelBounds = useMemo(() => {
        return resolveChannelVideoModelDurationBounds(config, targetVideoModel);
    }, [config, targetVideoModel]);
    const targetModelMaxDuration = targetModelBounds.max;

    const handleTargetVideoModelChange = (newVideoModel: string) => {
        setTargetVideoModel(newVideoModel);
        updateMetadata?.(node.id, {
            configScript: {
                ...meta,
                videoModel: newVideoModel,
                targetVideoModel: newVideoModel,
            },
        });
    };

    const featureCredit = useFeatureCredit("config_script", selectedModel);

    const abortControllerRef = useRef<AbortController | null>(null);
    const hubTask = useNodeTask<{ percent: number; message: string }>(node.id);
    const isNodeExecuting = hubTask.isRunning;
    const [running, setRunning] = useState<boolean>(isNodeExecuting);
    const [progress, setProgress] = useState<{ percent: number; message: string } | null>(null);
    const effectiveProgress = hubTask.progress || progress;
    const [errorMsg, setErrorMsg] = useState<string>(meta.errorDetails || "");
    const [scriptResult, setScriptResult] = useState<string>(meta.result?.script || meta.prompt || node.metadata?.content || node.metadata?.prompt || "");
    const [configExpanded, setConfigExpanded] = useState<boolean>(false);
    const [expandedModalOpen, setExpandedModalOpen] = useState<boolean>(false);
    const [copied, setCopied] = useState<boolean>(false);

    useEffect(() => {
        const text = meta.result?.script || meta.prompt || node.metadata?.content || node.metadata?.prompt || "";
        if (text) setScriptResult(text);
        if (meta.businessScenario) setBusinessScenario(meta.businessScenario);
        if (meta.language) setLanguage(meta.language);
        if (meta.scriptType) setScriptType(meta.scriptType);
        if (meta.shootingStyle) setShootingStyle(meta.shootingStyle);
        if (meta.durationSec) setDurationSec(meta.durationSec);
        if (meta.videoModel || (meta as any).targetVideoModel) setTargetVideoModel(meta.videoModel || (meta as any).targetVideoModel);
        if (meta.primaryPlatform) setPrimaryPlatform(meta.primaryPlatform);
        if (meta.additionalNotes !== undefined) setAdditionalNotes(meta.additionalNotes);
        if (meta.customRules !== undefined) setCustomRules(meta.customRules);
        if (meta.customPrompt !== undefined) setCustomPrompt(meta.customPrompt);
        if (meta.useCustomPrompt !== undefined) setUseCustomPrompt(Boolean(meta.useCustomPrompt));
        setRunning(hubTask.isRunning);
        if (meta.errorDetails !== undefined) setErrorMsg(meta.errorDetails);
    }, [hubTask.isRunning, meta, node.metadata?.content, node.metadata?.prompt]);

    // 挂载期自主健康对账与孤儿态自愈（消灭 F5 刷新/异常崩溃导致的无取消按钮永久死锁）
    useEffect(() => {
        const hasValidResult = Boolean(
            scriptResult ||
            meta.result?.script ||
            node.metadata?.content ||
            node.metadata?.prompt
        );

        reconcileOrphanedClientNodeState({
            nodeId: node.id,
            isTaskRunning: hubTask.isRunning,
            persistedStatus: node.metadata?.status,
            persistedTaskStatus: node.metadata?.taskStatus,
            subStatus: meta.status,
            hasValidResult,
            onHeal: (healedStatus) => {
                setRunning(false);
                setProgress(null);
                updateMetadata?.(node.id, {
                    status: healedStatus,
                    taskStatus: "idle",
                    configScript: {
                        ...meta,
                        status: healedStatus,
                    },
                });
            },
        });
    }, [node.id, hubTask.isRunning]);

    // 发现上游输入来源
    const upstreamAnalysis = useMemo(() => {
        return upstreamNodes.find((n) => n.type === CREATION_ASSISTANT_ANALYSIS_NODE_TYPE);
    }, [upstreamNodes]);

    const upstreamVideoReverse = useMemo(() => {
        return upstreamNodes.find((n) => n.type === VIDEO_REVERSE_NODE_TYPE);
    }, [upstreamNodes]);

    const upstreamTexts = useMemo(() => {
        return upstreamNodes.filter((n) => n.type === CanvasNodeType.Text);
    }, [upstreamNodes]);

    const scriptTypeSelectOptions = useMemo(() => {
        const groups = getCreationAssistantScriptTypeGroups(businessScenario);
        return [
            {
                label: "智能推荐",
                options: [{ label: "⚡ 智能匹配 (推荐)", value: "smart" }],
            },
            ...groups.map((group) => ({
                label: group.title,
                options: group.items.map((item) => ({
                    label: item.badge ? `${item.label} · ${item.badge}` : item.label,
                    value: item.id,
                })),
            })),
        ];
    }, [businessScenario]);

    const combinedSourceMediaList = useMemo(() => {
        const list: Array<{ id: string; name: string; kind: "image" | "video" | "audio"; url?: string; dataUrl?: string }> = [];
        const seen = new Set<string>();

        // 1. 本地源或上游分析节点记录的素材
        const analysisMeta = upstreamAnalysis?.metadata?.materialAnalysis as MaterialAnalysisMeta | undefined;
        analysisMeta?.localSources?.forEach((src) => {
            if (!seen.has(src.id)) {
                seen.add(src.id);
                list.push({ id: src.id, name: src.name, kind: src.kind, url: src.url, dataUrl: src.url });
            }
        });

        // 2. 上游节点直连媒体
        upstreamNodes.forEach((n) => {
            const mediaUrl = n.metadata?.content || (n.metadata?.storageKey ? resolveResourceUrl(n.metadata.storageKey) : "");
            if (!seen.has(n.id) && mediaUrl) {
                seen.add(n.id);
                if (n.type === CanvasNodeType.Image) {
                    list.push({ id: n.id, name: n.title || "图片", kind: "image", url: mediaUrl, dataUrl: mediaUrl });
                } else if (n.type === CanvasNodeType.Video) {
                    list.push({ id: n.id, name: n.title || "视频", kind: "video", url: mediaUrl });
                } else if (n.type === CanvasNodeType.Audio) {
                    list.push({ id: n.id, name: n.title || "音频", kind: "audio", url: mediaUrl });
                }
            }
        });

        return list;
    }, [upstreamAnalysis, upstreamNodes]);

    const handleScriptChange = (nextText: string) => {
        setScriptResult(nextText);
        updateMetadata?.(node.id, {
            status: "success",
            taskStatus: "succeeded",
            isClientMockTask: true,
            content: nextText,
            prompt: nextText,
            composerContent: nextText,
            configScript: {
                ...meta,
                status: "success",
                businessScenario,
                language,
                scriptType,
                shootingStyle,
                durationSec,
                primaryPlatform,
                additionalNotes,
                customRules,
                customPrompt,
                useCustomPrompt,
                prompt: nextText,
                content: nextText,
                result: {
                    ...(meta.result || { version: "config-script-result.v1", generatedAt: Date.now(), videoModel: config.model }),
                    script: nextText,
                },
                updatedAt: Date.now(),
            },
        });
    };

    const runGenerate = async () => {
        const controller = new AbortController();
        abortControllerRef.current = controller;

        const currentExecutionId = `${node.id}_${Date.now()}_${nanoid(6)}`;
        const deductKey = `deduct:config_script:${node.id}:${currentExecutionId}`;
        const refundKey = `refund:config_script:${node.id}:${currentExecutionId}`;

        let deductedMicrocredits = 0;
        const refundIfDeducted = async () => {
            if (deductedMicrocredits > 0) {
                const amount = deductedMicrocredits;
                deductedMicrocredits = 0;
                try {
                    await featureCredit.refund(amount, selectedModel, "配置生成脚本任务中止退款", refundKey, deductKey);
                } catch (e) {
                    console.warn("[creation-assistant-script] refund error on abort:", e);
                }
            }
        };

        setRunning(true);
        setErrorMsg("");
        const initProgress = { percent: 10, message: "正在解析编导配置与素材引用..." };
        setProgress(initProgress);
        startNodeTask(node.id, "creation-assistant-script", initProgress, {
            executionId: currentExecutionId,
            controller,
            onAbortRefund: refundIfDeducted,
        });

        updateMetadata?.(node.id, {
            status: "loading",
            taskStatus: "running",
            isClientMockTask: true,
            configScript: {
                ...meta,
                status: "running",
                activeExecutionId: currentExecutionId,
                errorDetails: undefined,
            },
        });

        const reportProgress = (p: { percent: number; message: string }) => {
            if (!isCurrentExecution(node.id, currentExecutionId)) return;
            setProgress(p);
            updateNodeTaskProgress(node.id, p, undefined, currentExecutionId);
        };
        let streamedScriptAccumulator = "";
        const reportStream = (text: string) => {
            if (!isCurrentExecution(node.id, currentExecutionId)) return;
            setScriptResult(text);
            updateNodeTaskStreamedText(node.id, text, currentExecutionId);
        };

        try {
            const deductRes = await featureCredit.deduct(selectedModel, "画布配置生成脚本", deductKey);
            deductedMicrocredits = deductRes.deductedMicrocredits;
            recordTaskDeduction(node.id, deductedMicrocredits, deductKey, currentExecutionId);
        } catch (creditErr) {
            const msg = creditErr instanceof Error ? creditErr.message : "积分扣减失败";
            setErrorMsg(msg);
            setRunning(false);
            failNodeTask(node.id, msg, currentExecutionId);
            updateMetadata?.(node.id, {
                status: scriptResult ? "success" : "idle",
                taskStatus: "idle",
                isClientMockTask: true,
                configScript: {
                    ...meta,
                    status: scriptResult ? "success" : "idle",
                    errorDetails: msg,
                },
            });
            return;
        }

        try {
            // 1. 提取素材分析数据
            const analysisMeta = upstreamAnalysis?.metadata?.materialAnalysis as MaterialAnalysisMeta | undefined;
            const fileSummaries = analysisMeta?.result?.fileSummaries || [];
            const insightSections = analysisMeta?.result?.insightSections || [];

            // 2. 构造素材引用表（按照 @图片N、@视频N、@音频N 标准规范，与画布其他节点完全一致）
            const kindCounters: Record<string, number> = { image: 0, video: 0, audio: 0 };
            const assetReferenceMap = fileSummaries.map((f) => {
                const kind = f.mediaType || "video";
                kindCounters[kind] = (kindCounters[kind] || 0) + 1;
                const prefix = kind === "image" ? "图片" : kind === "video" ? "视频" : "音频";
                return {
                    ref: `@${prefix}${kindCounters[kind]}`,
                    mediaType: kind,
                    fileId: f.fileId,
                    name: f.name,
                };
            });

            // 3. 规划分段（严格按所选目标视频模型的系统渠道参数上限）
            const videoModel = targetVideoModel || config.videoModel || resolveModelForCapability(config, config.model, "video");
            const maxDuration = resolveChannelVideoModelMaxDuration(config, videoModel);
            const segmentPlan = segmentCreationAssistantTimeline(durationSec, maxDuration);

            // 4. 构造 Prompt Bundle
            const effectiveNotes = (additionalNotes ? `${additionalNotes}\n` : "") + (customRules ? `【补充要求】\n${customRules}` : "");
            let promptBundle: { systemPrompt: string; userPrompt: string };
            const isRefMode = meta.generationMethod === "reference_script" && Boolean(meta.inputBindings?.find((b) => b.role === "reference_script" && b.enabled));
            const referenceScript = (meta.inlineInputs?.find((i) => i.role === "reference_script" && i.enabled)?.text || "").trim();

            if (isRefMode && referenceScript) {
                promptBundle = buildReferenceScriptCreationAssistantPrompts({
                    fileSummaries,
                    insightSections,
                    assetReferenceMap,
                    businessScenario,
                    language,
                    durationSec,
                    videoModel,
                    videoModelMaxDurationSec: maxDuration,
                    videoSegmentPlan: segmentPlan,
                    additionalNotes: effectiveNotes,
                    referenceScript,
                    referenceScriptDurationSec: durationSec,
                });
            } else {
                promptBundle = buildCreationAssistantPrompts({
                    fileSummaries,
                    insightSections,
                    assetReferenceMap,
                    businessScenario,
                    language,
                    scriptType,
                    shootingStyle,
                    durationSec,
                    videoModel,
                    videoModelMaxDurationSec: maxDuration,
                    videoSegmentPlan: segmentPlan,
                    primaryPlatform,
                    secondaryPlatforms: [],
                    additionalNotes: effectiveNotes,
                });
            }

            reportProgress({ percent: 45, message: "正在调用大模型生成视频提示词..." });

            // 5. 提示词替换与模型调用
            const effectiveSystemPrompt = useCustomPrompt && customPrompt.trim()
                ? customPrompt.trim()
                : promptBundle.systemPrompt;

            const effectiveScriptModel = selectedModel || config.textModel || config.model;
            const response = await requestImageQuestion(
                { ...config, model: effectiveScriptModel, systemPrompt: effectiveSystemPrompt },
                [{ role: "user", content: [{ type: "text", text: promptBundle.userPrompt }] }],
                (delta: string) => {
                    streamedScriptAccumulator += delta;
                    reportStream(streamedScriptAccumulator);
                },
                { temperature: 0.85, presence_penalty: 0.2, signal: controller.signal, scene: "config_script" },
            );

            if (!isCurrentExecution(node.id, currentExecutionId)) return;

            const cleanScript = normalizeCreationAssistantScript(response, assetReferenceMap);
            handleScriptChange(cleanScript);
            finishNodeTask(node.id, currentExecutionId);
            setRunning(false);
            setProgress(null);
            message.success("视频提示词生成成功！");
        } catch (error) {
            await refundIfDeducted();
            if (!isCurrentExecution(node.id, currentExecutionId)) return;
            const msg = error instanceof Error ? error.message : String(error);
            setErrorMsg(msg);
            const hasAnyResult = Boolean(scriptResult || meta.result?.script);
            updateMetadata?.(node.id, {
                status: hasAnyResult ? "success" : "error",
                taskStatus: "idle",
                isClientMockTask: true,
                configScript: {
                    ...meta,
                    status: hasAnyResult ? "success" : "error",
                    errorDetails: msg,
                },
            });
            failNodeTask(node.id, msg, currentExecutionId);
            setRunning(false);
            setProgress(null);
        } finally {
            setProgress(null);
            if (abortControllerRef.current === controller) {
                setRunning(false);
                abortControllerRef.current = null;
            }
        }
    };

    const handleExportToTextNode = async () => {
        if (!scriptResult.trim()) {
            message.warning("暂无提示词内容可导出");
            return;
        }

        try {
            await navigator.clipboard.writeText(scriptResult);
            message.success("提示词内容已复制到剪贴板！可直接粘贴至任何文本节点或提示词输入框");
        } catch {
            message.info("请在放大窗口中全选复制提示词内容");
        }
    };

    const downloadScriptFile = () => {
        if (!scriptResult.trim()) {
            message.warning("暂无提示词内容可下载");
            return;
        }
        const blob = new Blob([scriptResult], { type: "text/markdown;charset=utf-8" });
        saveAs(blob, `视频提示词-${Date.now()}.md`);
        message.success("已下载提示词文件");
    };

    const copyScript = async () => {
        if (!scriptResult) return;
        try {
            await navigator.clipboard.writeText(scriptResult);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {}
    };

    const inputBaseStyle = {
        background: theme.node.fill,
        color: theme.node.text,
        borderColor: theme.node.stroke,
    };

    return (
        <div
            className="relative flex h-full min-h-0 w-full flex-col rounded-[inherit] overflow-hidden text-sm"
            style={{ background: theme.node.panel, color: theme.node.text }}
            data-canvas-no-zoom
        >
            {/* 顶部标题栏与上游状态合并（画布拖拽把手） */}
            <div
                className="flex h-12 shrink-0 cursor-grab items-center justify-between border-b px-4 active:cursor-grabbing select-none"
                style={{ borderColor: theme.node.stroke, background: theme.node.panel }}
            >
                <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="size-5 text-amber-500 shrink-0" />
                    <span className="font-bold text-base truncate">配置生成脚本</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                    {upstreamAnalysis ? (
                        <Tag color="cyan" className="m-0 text-xs px-2 py-0.5 leading-tight">
                            已接分析
                        </Tag>
                    ) : (
                        <Tag className="m-0 text-xs px-2 py-0.5 leading-tight opacity-60">纯文本模式</Tag>
                    )}
                    {upstreamVideoReverse ? (
                        <Tag color="purple" className="m-0 text-xs px-2 py-0.5 leading-tight">
                            含反推
                        </Tag>
                    ) : null}
                    {upstreamTexts.length > 0 ? (
                        <Tag color="blue" className="m-0 text-xs px-2 py-0.5 leading-tight">
                            文本({upstreamTexts.length})
                        </Tag>
                    ) : null}
                    <Tag
                        color={running ? "processing" : meta.status === "success" ? "success" : meta.status === "error" ? "error" : "default"}
                        className="m-0 text-xs px-2 py-0.5 leading-tight"
                    >
                        {running ? "生成中" : meta.status === "success" ? "已就绪" : meta.status === "error" ? "失败" : "配置"}
                    </Tag>
                </div>
            </div>

            {/* 可滚动内容区域 */}
            <div
                data-canvas-wheel-scroll
                data-canvas-no-drag
                className="thin-scrollbar flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-4 select-text"
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
            >

            {/* 模型选择与积分徽标 */}
            <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span style={{ color: theme.node.muted }} className="shrink-0 text-xs font-medium">脚本模型</span>
                    <ModelPicker
                        config={config}
                        value={selectedModel}
                        onChange={handleModelChange}
                        capability="text"
                        className="h-9 text-sm flex-1 min-w-0"
                    />
                </div>
                <FeatureCreditBadge scene="config_script" model={selectedModel} size="small" />
            </div>

            {/* 核心配置折叠区 */}
            <div className="flex flex-col gap-2.5 rounded-xl border p-3 text-xs" style={inputBaseStyle}>
                <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        setConfigExpanded(!configExpanded);
                    }}
                    className="flex w-full items-center justify-between cursor-pointer font-medium p-1 -m-0.5 rounded hover:bg-neutral-500/10 transition-colors select-none text-left"
                    style={{ color: "inherit" }}
                >
                    <span className="flex items-center gap-2">
                        <SlidersHorizontal className="size-4 text-amber-500" />
                        <span className="font-semibold text-sm">创作参数设置</span>
                    </span>
                    <div className="flex items-center gap-2">
                        {useCustomPrompt && customPrompt.trim() ? (
                            <span className="rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-xs font-semibold leading-none">
                                自定义提示词
                            </span>
                        ) : null}
                        {configExpanded ? <ChevronUp className="size-4 text-neutral-400" /> : <ChevronDown className="size-4 text-neutral-400" />}
                    </div>
                </button>

                {configExpanded ? (
                    <div className="flex flex-col gap-2.5 pt-1.5">
                        <div className="grid grid-cols-2 gap-2.5">
                            <div>
                                <span className="text-xs text-neutral-400 block mb-1 font-medium">业务场景</span>
                                <Select
                                    value={businessScenario}
                                    onChange={(v) => {
                                        setBusinessScenario(v);
                                        if (!isScriptTypeValidForScenario(scriptType, v)) {
                                            setScriptType("smart");
                                        }
                                    }}
                                    size="middle"
                                    className="w-full"
                                    options={[
                                        { label: "电商带货", value: "ecommerce" },
                                        { label: "本地生活", value: "local_life" },
                                    ]}
                                />
                            </div>
                            <div>
                                <span className="text-xs text-neutral-400 block mb-1 font-medium">主发布平台</span>
                                <Select
                                    value={primaryPlatform}
                                    onChange={(v) => setPrimaryPlatform(v)}
                                    size="middle"
                                    className="w-full"
                                    options={CREATION_ASSISTANT_PLATFORMS.map((p) => ({ label: p.label, value: p.id }))}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                            <div>
                                <span className="text-xs text-neutral-400 block mb-1 font-medium">脚本叙事类型</span>
                                <Select
                                    value={scriptType}
                                    onChange={(v) => setScriptType(v)}
                                    size="middle"
                                    className="w-full"
                                    options={scriptTypeSelectOptions}
                                />
                            </div>
                            <div>
                                <span className="text-xs text-neutral-400 block mb-1 font-medium">拍摄运镜方式</span>
                                <Select
                                    value={shootingStyle}
                                    onChange={(v) => setShootingStyle(v)}
                                    size="middle"
                                    className="w-full"
                                    options={CREATION_ASSISTANT_SHOOTING_STYLES.map((s) => ({ label: s.label, value: s.id }))}
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-neutral-400 flex items-center gap-1.5 font-medium">
                                    <Film className="size-3 text-amber-500" />
                                    <span>目标视频模型</span>
                                </span>
                                <span className="text-xs text-stone-500 dark:text-stone-400">
                                    单段上限 {targetModelMaxDuration}s
                                </span>
                            </div>
                            <ModelPicker
                                config={config}
                                capability="video"
                                value={targetVideoModel}
                                onChange={handleTargetVideoModelChange}
                                fullWidth
                                placeholder="选择目标视频模型"
                                className="h-9 text-sm w-full"
                            />
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs text-neutral-400 font-medium">目标总时长</span>
                                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                                    {durationSec}s · 预计规划 {Math.ceil(durationSec / targetModelMaxDuration)} 段切片
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {CREATION_ASSISTANT_DURATION_PRESETS.map((d) => (
                                        <button
                                            key={d}
                                            type="button"
                                            onClick={() => setDurationSec(d)}
                                            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                                                durationSec === d
                                                    ? "bg-amber-500 text-white font-medium shadow-2xs"
                                                    : "border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-amber-500"
                                            }`}
                                        >
                                            {d}s
                                        </button>
                                    ))}
                                </div>
                                <div className="flex items-center rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 focus-within:border-amber-500">
                                    <input
                                        type="number"
                                        min={1}
                                        max={300}
                                        value={durationSec}
                                        onChange={(e) => {
                                            const v = parseInt(e.target.value, 10);
                                            if (!isNaN(v)) setDurationSec(Math.max(1, Math.min(300, v)));
                                        }}
                                        className="w-9 bg-transparent text-center text-xs font-semibold text-neutral-800 dark:text-neutral-200 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    />
                                    <span className="text-xs text-neutral-400">秒</span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <span className="text-xs text-neutral-400 block mb-1 font-medium">补充诉求 / 卖点指定</span>
                            <input
                                value={additionalNotes}
                                onChange={(e) => setAdditionalNotes(e.target.value)}
                                placeholder="例如：重点突出防水特性，结尾引导点击左下角..."
                                className="w-full rounded-lg border px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                                style={inputBaseStyle}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="text-xs text-neutral-400 flex items-center justify-between">
                        <span>{businessScenario === "ecommerce" ? "电商带货" : "本地生活"} · {primaryPlatform} · {durationSec}秒 · {scriptType}</span>
                        {useCustomPrompt && customPrompt.trim() ? (
                            <span className="text-amber-500 font-medium">已启用自定义提示词</span>
                        ) : null}
                    </div>
                )}
            </div>

            {/* 提示词编辑按钮（统一全宽卡片） */}
            <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setPromptModalOpen(true)}
                className="flex items-center justify-between rounded-xl border p-3 text-left transition-colors hover:border-amber-400 dark:hover:border-amber-600 cursor-pointer"
                style={inputBaseStyle}
            >
                <div className="flex items-center gap-2.5 min-w-0">
                    <SlidersHorizontal className="size-4 text-amber-500 shrink-0" />
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-stone-800 dark:text-stone-200">提示词编辑</span>
                            {useCustomPrompt ? (
                                <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400 font-medium">已替换提示词</span>
                            ) : customRules.trim() ? (
                                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">已补充提示词</span>
                            ) : (
                                <span className="text-xs" style={{ color: theme.node.muted }}>默认内置规范</span>
                            )}
                        </div>
                        <span className="truncate text-xs mt-0.5" style={{ color: theme.node.muted }}>
                            {useCustomPrompt
                                ? (customPrompt.trim() || "未填写自定义 Prompt")
                                : (customRules.trim() || "点击补充个性化关注点或完全替换内置提示词")}
                        </span>
                    </div>
                </div>
                <span className="text-xs text-amber-500 font-semibold shrink-0 ml-2">编辑</span>
            </button>

            {/* 错误提示 */}
            {errorMsg ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-600 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-400">
                    {errorMsg}
                </div>
            ) : null}

            {/* 提示词生成结果操作栏 (统一为 放大/复制/下载) */}
            {scriptResult ? (
                <div
                    className="flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs"
                    style={{ background: theme.node.fill, borderColor: theme.node.stroke }}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <Sparkles className="size-4 text-amber-500 shrink-0" />
                        <span className="truncate font-semibold text-xs">视频提示词已就绪</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={() => setExpandedModalOpen(true)}
                            className="flex items-center gap-1 hover:text-amber-500 transition-colors cursor-pointer"
                            title="放大查看与编辑提示词"
                        >
                            <Maximize2 className="size-3.5" />
                            <span>放大</span>
                        </button>
                        <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={copyScript}
                            className="flex items-center gap-1 hover:text-amber-500 transition-colors cursor-pointer"
                            title="复制视频提示词"
                        >
                            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                            <span>{copied ? "已复制" : "复制"}</span>
                        </button>
                        <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={downloadScriptFile}
                            className="flex items-center gap-1 text-amber-500 font-medium hover:text-amber-600 transition-colors cursor-pointer"
                            title="下载文件"
                        >
                            <Download className="size-3.5" />
                            <span>下载</span>
                        </button>
                    </div>
                </div>
            ) : null}

            {/* 底部动作操作栏 */}
            <div className="mt-auto flex items-center justify-between pt-2.5">
                <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => {
                        setScriptResult("");
                        updateMetadata?.(node.id, {
                            content: "",
                            prompt: "",
                            composerContent: "",
                            configScript: { status: "idle" },
                        });
                    }}
                    disabled={running}
                    className="flex h-9 items-center gap-1.5 rounded-lg border px-3.5 text-sm transition-colors hover:opacity-80 disabled:opacity-50 cursor-pointer"
                    style={inputBaseStyle}
                >
                    <RefreshCw className="size-3.5" />
                    <span>清空</span>
                </button>

                <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={runGenerate}
                    disabled={running}
                    className={`flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white shadow-sm transition-all select-none ${
                        running
                            ? "bg-amber-500/75 cursor-not-allowed opacity-80"
                            : "bg-amber-500 hover:bg-amber-600 active:scale-95 cursor-pointer"
                    }`}
                >
                    {running ? (
                        <>
                            <LoaderCircle className="size-4 animate-spin text-white" />
                            <span>生成提示词中...</span>
                        </>
                    ) : (
                        <>
                            <Play className="size-3.5 fill-current" />
                            <span>{scriptResult ? "重新生成视频提示词" : "生成视频提示词"}</span>
                        </>
                    )}
                </button>
            </div>
            </div>

            {/* 放大编辑弹窗 */}
            <Modal
                open={expandedModalOpen}
                onCancel={() => setExpandedModalOpen(false)}
                footer={null}
                width={980}
                destroyOnClose
                title={
                    <div className="flex items-center justify-between pr-8 select-none">
                        <div className="flex items-center gap-2 text-base font-semibold">
                            <Sparkles className="size-4 text-amber-500" />
                            <span>视频提示词预览与编辑</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                                <Check className="size-3" />
                                <span>实时同步</span>
                            </span>
                            <button
                                type="button"
                                onClick={copyScript}
                                className="flex items-center gap-1 rounded bg-amber-500 hover:bg-amber-400 active:bg-amber-600 px-2.5 py-1 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                                style={{ color: "#0c0a09" }}
                            >
                                <Copy className="size-3" style={{ color: "#0c0a09" }} />
                                <span className="font-semibold" style={{ color: "#0c0a09" }}>复制提示词</span>
                            </button>
                        </div>
                    </div>
                }
            >
                <div
                    className="flex flex-col gap-3 pt-1 text-xs"
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                        if (e.key !== "Escape") e.stopPropagation();
                    }}
                >
                    <ScriptReferencePreview
                        script={scriptResult}
                        sourceMediaList={combinedSourceMediaList}
                        onChange={handleScriptChange}
                    />
                    <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-2 border-t border-stone-200 dark:border-stone-800">
                        <span>总字数：{scriptResult.length} 字</span>
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

            {/* 提示词编辑弹窗 */}
            <PromptEditorModal
                open={promptModalOpen}
                onClose={() => setPromptModalOpen(false)}
                nodeTitle="配置生成脚本"
                initialMode={useCustomPrompt ? "replace" : "supplement"}
                supplementPrompt={customRules}
                replacePrompt={customPrompt}
                supplementPlaceholder="例如：&#10;1. 强化前 3 秒钩子画面冲突感，制造强烈反差；&#10;2. 突出核心卖点的特写镜头与细节展示；&#10;3. 结尾增加限时折扣行动号召与下单引导..."
                replacePlaceholder="在此输入您的自定义系统提示词（将完全替换内置短视频编导规则）..."
                onSave={({ mode, supplementPrompt, replacePrompt: nextReplace }) => {
                    setCustomRules(supplementPrompt);
                    setCustomPrompt(nextReplace);
                    setUseCustomPrompt(mode === "replace");
                    updateMetadata?.(node.id, {
                        configScript: {
                            ...meta,
                            customRules: supplementPrompt,
                            customPrompt: nextReplace,
                            useCustomPrompt: mode === "replace",
                            updatedAt: Date.now(),
                        },
                    });
                }}
            />
        </div>
    );
}
