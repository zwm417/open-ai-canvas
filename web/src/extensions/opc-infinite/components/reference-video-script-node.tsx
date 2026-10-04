import { useEffect, useMemo, useRef, useState } from "react";
import { App, Modal, Select, message as staticMessage } from "antd";
import {
    AtSign,
    Check,
    ChevronDown,
    ChevronUp,
    Clapperboard,
    Clock,
    Copy,
    Download,
    FileText,
    Film,
    Loader2,
    Maximize2,
    Music2,
    Play,
    RefreshCw,
    SlidersHorizontal,
    Sparkles,
    Video,
    X,
} from "lucide-react";
import saveAs from "file-saver";
import { nanoid } from "nanoid";

import { useUpstreamNodes, useCanvasGraphActions } from "@/components/canvas/canvas-node-graph-context";
import { useCanvasNodeActions } from "@/components/canvas/canvas-node-action-context";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CanvasNodeData } from "@/types/canvas";
import { CanvasNodeType } from "@/types/canvas";
import { resolveModelForCapability, useEffectiveConfig, useConfigStore } from "@/stores/use-config-store";
import { ModelPicker } from "@/components/model-picker";
import { FeatureCreditBadge } from "@/components/feature-credit-badge";
import { useFeatureCredit } from "@/hooks/use-feature-credit";
import { requestImageQuestion } from "@/services/api/image";
import { resolveResourceUrl } from "@/services/api/resources";
import { CanvasResourceMentionTextarea } from "@/components/canvas/canvas-resource-mention-textarea";
import { useResolvedCanvasResourceReferences } from "@/components/canvas/use-resolved-canvas-resource-references";
import {
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
    CREATION_ASSISTANT_REF_SCRIPT_NODE_TYPE,
    extractDurationFromScriptText,
    resolveCreationAssistantDurations,
    type MaterialAnalysisMeta,
    type RefScriptMeta,
    type RefScriptTrackClassic,
} from "../services/creation-assistant-contracts";
import { VIDEO_REVERSE_NODE_TYPE } from "../services/video-reverse-contracts";
import { PromptEditorModal } from "./prompt-editor-modal";
import { ScriptReferencePreview } from "./script-reference-preview";
import { formatShotManifestToReadableScript } from "../prompts/hypit-director-prompts";
import {
    buildRefScriptMentionReferences,
    resolveMentionedContentPartsAsync,
} from "../services/script-mention-resolver";
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

/**
 * 健壮解析上游参考源（打通视频反推、文本节点与素材分析跨模式协同）
 */
export function resolveUpstreamReferenceScript(
    upstreamVideoReverse?: CanvasNodeData,
    upstreamTexts?: CanvasNodeData[],
    upstreamVideos?: CanvasNodeData[],
    upstreamAnalysis?: CanvasNodeData,
): {
    script: string;
    source: "deconstruct_shots" | "reverse_prompt" | "text_node" | "analysis_node" | "none";
    shotCount?: number;
    durationSec?: number;
    hasUpstream: boolean;
    isUpstreamReady: boolean;
} {
    if (!upstreamVideoReverse && (!upstreamTexts || upstreamTexts.length === 0) && (!upstreamVideos || upstreamVideos.length === 0) && !upstreamAnalysis) {
        return { script: "", source: "none", hasUpstream: false, isUpstreamReady: false };
    }

    if (upstreamVideoReverse) {
        const reverseMeta = upstreamVideoReverse.metadata?.videoReverse as any;
        const activeTab = reverseMeta?.activeTab as ("classic" | "deconstruct" | undefined);
        const deconstructShots = reverseMeta?.deconstruct?.shotManifest || reverseMeta?.shotManifest;
        const hasShots = Array.isArray(deconstructShots) && deconstructShots.length > 0;
        const classicPrompt = reverseMeta?.classic?.prompt || (activeTab === "classic" ? reverseMeta?.prompt : undefined);
        const hasPrompt = Boolean(classicPrompt?.trim() || reverseMeta?.prompt?.trim() || upstreamVideoReverse.metadata?.content?.trim());
        const isReady = hasShots || hasPrompt;

        // 提取上游反推视频时长
        let durationSec: number | undefined;
        if (typeof reverseMeta?.result?.durationSec === "number" && reverseMeta.result.durationSec > 0) {
            durationSec = Math.round(reverseMeta.result.durationSec);
        } else if (typeof reverseMeta?.durationSec === "number" && reverseMeta.durationSec > 0) {
            durationSec = Math.round(reverseMeta.durationSec);
        }

        // 1. 若上游明确处于经典反推模式 (activeTab === "classic")，严格按经典反推文本协议接入
        if (activeTab === "classic") {
            const script = (classicPrompt || (reverseMeta?.activeTab === "classic" ? reverseMeta?.prompt : undefined) || upstreamVideoReverse.metadata?.content || "").trim();
            if (!durationSec && script) durationSec = extractDurationFromScriptText(script);
            return {
                script,
                source: "reverse_prompt",
                durationSec,
                hasUpstream: true,
                isUpstreamReady: Boolean(script),
            };
        }

        // 2. 若上游处于创意反推模式 (activeTab === "deconstruct")，将其分镜转换为纯文本剧本供参考
        if (activeTab === "deconstruct") {
            if (!durationSec) {
                let maxEnd = 0;
                for (const s of (deconstructShots || [])) {
                    if (typeof s.endSec === "number" && s.endSec > maxEnd) {
                        maxEnd = s.endSec;
                    } else if (s.timeRange) {
                        const parsed = extractDurationFromScriptText(s.timeRange);
                        if (parsed && parsed > maxEnd) maxEnd = parsed;
                    }
                }
                if (maxEnd > 0) durationSec = Math.round(maxEnd);
            }

            const rawDeconstructPrompt = reverseMeta?.deconstruct?.prompt || (reverseMeta?.activeTab === "deconstruct" ? reverseMeta?.prompt : undefined);
            const overview = rawDeconstructPrompt && !rawDeconstructPrompt.startsWith("{") ? rawDeconstructPrompt : undefined;
            const formatted = hasShots
                ? formatShotManifestToReadableScript(deconstructShots, overview, "上游创意反推分镜")
                : (rawDeconstructPrompt || "");

            return {
                script: formatted,
                source: "deconstruct_shots",
                shotCount: hasShots ? deconstructShots.length : 0,
                durationSec,
                hasUpstream: true,
                isUpstreamReady: Boolean(formatted),
            };
        }

        // 若上游缺省 activeTab 但包含分镜清单
        if (hasShots && !reverseMeta?.isUserEditedScript) {
            if (!durationSec) {
                let maxEnd = 0;
                for (const s of deconstructShots) {
                    if (typeof s.endSec === "number" && s.endSec > maxEnd) {
                        maxEnd = s.endSec;
                    } else if (s.timeRange) {
                        const parsed = extractDurationFromScriptText(s.timeRange);
                        if (parsed && parsed > maxEnd) maxEnd = parsed;
                    }
                }
                if (maxEnd > 0) durationSec = Math.round(maxEnd);
            }

            const rawDeconstructPrompt = reverseMeta?.deconstruct?.prompt || reverseMeta?.prompt;
            const overview = rawDeconstructPrompt && !rawDeconstructPrompt.startsWith("{") ? rawDeconstructPrompt : undefined;
            const formatted = formatShotManifestToReadableScript(
                deconstructShots,
                overview,
                "上游创意反推分镜"
            );
            return {
                script: formatted || rawDeconstructPrompt || "",
                source: "deconstruct_shots",
                shotCount: deconstructShots.length,
                durationSec,
                hasUpstream: true,
                isUpstreamReady: true,
            };
        }

        if (reverseMeta?.prompt?.trim()) {
            const script = reverseMeta.prompt.trim();
            if (!durationSec) durationSec = extractDurationFromScriptText(script);
            return {
                script,
                source: "reverse_prompt",
                durationSec,
                hasUpstream: true,
                isUpstreamReady: true,
            };
        }

        if (upstreamVideoReverse.metadata?.content?.trim()) {
            const script = upstreamVideoReverse.metadata.content.trim();
            if (!durationSec) durationSec = extractDurationFromScriptText(script);
            return {
                script,
                source: "reverse_prompt",
                durationSec,
                hasUpstream: true,
                isUpstreamReady: true,
            };
        }

        return {
            script: "",
            source: "none",
            durationSec,
            hasUpstream: true,
            isUpstreamReady: false,
        };
    }

    if (upstreamTexts && upstreamTexts.length > 0) {
        const textContent = upstreamTexts[0]?.metadata?.content?.trim() || "";
        const durationSec = extractDurationFromScriptText(textContent);
        return {
            script: textContent,
            source: textContent ? "text_node" : "none",
            durationSec,
            hasUpstream: true,
            isUpstreamReady: Boolean(textContent),
        };
    }

    if (upstreamVideos && upstreamVideos.length > 0) {
        const videoNode = upstreamVideos[0];
        const durationSec = videoNode.metadata?.durationMs
            ? Math.round(Number(videoNode.metadata.durationMs) / 1000)
            : Number((videoNode.metadata as any)?.durationSec) || undefined;
        return {
            script: "",
            source: "none",
            durationSec,
            hasUpstream: true,
            isUpstreamReady: false,
        };
    }

    if (upstreamAnalysis) {
        const analysisMeta = upstreamAnalysis.metadata?.materialAnalysis as any;
        const report = (analysisMeta?.result?.reportText || upstreamAnalysis.metadata?.content || upstreamAnalysis.metadata?.prompt || "").trim();
        return {
            script: report,
            source: report ? "analysis_node" : "none",
            hasUpstream: true,
            isUpstreamReady: Boolean(report),
        };
    }

    return { script: "", source: "none", hasUpstream: false, isUpstreamReady: false };
}

type ScriptGenerationProgress = {
    stage?: string;
    percent: number;
    message?: string;
};

type Props = {
    node: CanvasNodeData;
    theme: CanvasTheme;
};

export function CreationAssistantRefScriptNodeContent({ node, theme }: Props) {
    const { message: appMessage } = App.useApp();
    const message = appMessage || staticMessage;
    const upstreamNodes = useUpstreamNodes(node.id);
    const { updateMetadata } = useCanvasNodeActions();
    const { disconnectNodes } = useCanvasGraphActions();
    const config = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);

    const handleDisconnectReference = (ref: CanvasResourceReference) => {
        if (!ref.nodeId || !disconnectNodes) return;
        disconnectNodes(ref.nodeId, node.id);
        message.info(`已断开与素材 ${ref.label} (${ref.title}) 的画布连线`);
    };

    const meta: RefScriptMeta = useMemo(() => {
        return (node.metadata?.refScript as RefScriptMeta) || {};
    }, [node.metadata?.refScript]);

    // 模型选择
    const defaultModel = meta.model || config.textModel || config.model;
    const [selectedModel, setSelectedModel] = useState<string>(defaultModel);

    useEffect(() => {
        if (meta.model) setSelectedModel(meta.model);
    }, [meta.model]);

    const handleModelChange = (newModel: string) => {
        setSelectedModel(newModel);
        updateMetadata?.(node.id, {
            refScript: {
                ...meta,
                model: newModel,
            },
        });
    };

    const featureCredit = useFeatureCredit("ref_script", selectedModel);

    // 核心恢复选项：业务场景、输出语言、目标视频模型、目标总时长
    const [businessScenario, setBusinessScenario] = useState<"ecommerce" | "local_life">(
        meta.businessScenario || meta.classic?.businessScenario || "ecommerce"
    );
    const [language, setLanguage] = useState<"zh" | "en">(
        meta.language || meta.classic?.language || "zh"
    );
    const [targetVideoModel, setTargetVideoModel] = useState<string>(
        meta.targetVideoModel || meta.videoModel || config.videoModel || "kling-v1-6"
    );
    const [durationSec, setDurationSec] = useState<number>(
        meta.durationSec || meta.classic?.durationSec || 30
    );
    const [configExpanded, setConfigExpanded] = useState<boolean>(true);

    const targetModelBounds = useMemo(() => {
        return resolveChannelVideoModelDurationBounds(config, targetVideoModel);
    }, [config, targetVideoModel]);
    const targetModelMaxDuration = targetModelBounds.max;

    // 参考文案、用户创作需求与自定义提示词
    const [referenceScriptDurationSec, setReferenceScriptDurationSec] = useState<number>(
        meta.referenceScriptDurationSec || meta.durationSec || 30
    );
    const [referenceScript, setReferenceScript] = useState<string>(
        meta.referenceScript || meta.classic?.referenceScript || ""
    );
    const [userRequirement, setUserRequirement] = useState<string>(() => {
        if (meta.userRequirement) return meta.userRequirement;
        if (meta.additionalNotes) return meta.additionalNotes;
        return "";
    });
    const [customRules, setCustomRules] = useState<string>(meta.customRules || "");
    const [customPrompt, setCustomPrompt] = useState<string>(meta.customPrompt || "");
    const [useCustomPrompt, setUseCustomPrompt] = useState<boolean>(Boolean(meta.useCustomPrompt));
    const [promptModalOpen, setPromptModalOpen] = useState<boolean>(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    // 运行状态与结果 (自持无头任务机制)
    const hubTask = useNodeTask<ScriptGenerationProgress>(node.id);
    const isNodeExecuting = hubTask.isRunning;
    const [running, setRunning] = useState<boolean>(isNodeExecuting);
    const [localProgress, setLocalProgress] = useState<ScriptGenerationProgress | null>(null);
    const effectiveProgress = hubTask.progress || localProgress;
    const [streamedScript, setStreamedScript] = useState<string>("");
    const effectiveStreamedScript = hubTask.streamedText || streamedScript;
    const [errorMsg, setErrorMsg] = useState<string>(meta.errorDetails || "");

    const [scriptResult, setScriptResult] = useState<string>(() => {
        return meta.classic?.script || meta.result?.script || meta.prompt || node.metadata?.content || "";
    });

    const [expandedModalOpen, setExpandedModalOpen] = useState(false);
    const [refScriptModalOpen, setRefScriptModalOpen] = useState(false);
    const [copied, setCopied] = useState<boolean>(false);

    // 同步元数据变更
    useEffect(() => {
        const text = meta.classic?.script || meta.result?.script || meta.prompt || node.metadata?.content || node.metadata?.prompt || "";
        if (text) setScriptResult(text);
        if (meta.businessScenario) setBusinessScenario(meta.businessScenario);
        if (meta.language) setLanguage(meta.language);
        if (meta.durationSec) setDurationSec(meta.durationSec);
        if (meta.referenceScriptDurationSec) setReferenceScriptDurationSec(meta.referenceScriptDurationSec);
        if (meta.targetVideoModel) setTargetVideoModel(meta.targetVideoModel);
        else if (meta.videoModel) setTargetVideoModel(meta.videoModel);
        if (meta.referenceScript !== undefined) setReferenceScript(meta.referenceScript);
        if (meta.userRequirement !== undefined) setUserRequirement(meta.userRequirement);
        else if (meta.additionalNotes !== undefined) setUserRequirement(meta.additionalNotes);
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
            meta.classic?.script ||
            meta.result?.script ||
            node.metadata?.content
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
                setLocalProgress(null);
                updateMetadata?.(node.id, {
                    status: healedStatus,
                    taskStatus: "idle",
                    refScript: {
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

    const upstreamVideos = useMemo(() => {
        return upstreamNodes.filter((n) => n.type === CanvasNodeType.Video);
    }, [upstreamNodes]);

    const upstreamTexts = useMemo(() => {
        return upstreamNodes.filter((n) => n.type === CanvasNodeType.Text);
    }, [upstreamNodes]);

    // 构造可用素材 @ 引用清单 (支持 @图片1, @视频1, @音频1, @文本1 等)
    const rawMentionReferences = useMemo(() => {
        return buildRefScriptMentionReferences(upstreamNodes, upstreamAnalysis);
    }, [upstreamNodes, upstreamAnalysis]);

    const mentionReferences = useResolvedCanvasResourceReferences(rawMentionReferences);

    // 智能解析上游反推、视频或文本脚本
    const upstreamScriptInfo = useMemo(() => {
        return resolveUpstreamReferenceScript(upstreamVideoReverse, upstreamTexts, upstreamVideos, upstreamAnalysis);
    }, [upstreamVideoReverse, upstreamTexts, upstreamVideos, upstreamAnalysis]);

    // 动态智能解析时长（用户显式输入优先 > 原视频/参考脚本时长 > 默认兜底）
    const resolvedDurations = useMemo(() => {
        return resolveCreationAssistantDurations({
            userRequirement,
            additionalNotes: userRequirement,
            customRules,
            metaDurationSec: meta.durationSec,
            metaRefDurationSec: meta.referenceScriptDurationSec,
            upstreamReverseMeta: upstreamVideoReverse?.metadata?.videoReverse as any,
            upstreamVideoDurationSec: upstreamScriptInfo.durationSec || (
                upstreamVideos[0]?.metadata?.durationMs
                    ? Math.round(Number(upstreamVideos[0].metadata.durationMs) / 1000)
                    : Number((upstreamVideos[0]?.metadata as any)?.durationSec) || undefined
            ),
            referenceScriptText: referenceScript || upstreamScriptInfo.script,
            fallbackDurationSec: 30,
        });
    }, [
        userRequirement,
        customRules,
        meta.durationSec,
        meta.referenceScriptDurationSec,
        upstreamVideoReverse?.metadata?.videoReverse,
        upstreamScriptInfo.durationSec,
        upstreamScriptInfo.script,
        upstreamVideos,
        referenceScript,
    ]);

    // 自动提取上游反推或文本脚本作为默认参考并持久化至 metadata
    useEffect(() => {
        if (!upstreamScriptInfo.script) return;
        if (!referenceScript.trim() || (!meta.isUserEditedReferenceScript && referenceScript !== upstreamScriptInfo.script)) {
            setReferenceScript(upstreamScriptInfo.script);
            updateMetadata?.(node.id, {
                refScript: {
                    ...meta,
                    referenceScript: upstreamScriptInfo.script,
                    referenceScriptDurationSec: resolvedDurations.referenceDurationSec,
                },
            });
        }
    }, [upstreamScriptInfo.script, referenceScript, meta, node.id, updateMetadata, resolvedDurations.referenceDurationSec]);

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

    // 处理剧本内容手动变更
    const handleScriptChange = (nextText: string) => {
        setScriptResult(nextText);
        setErrorMsg("");
        updateMetadata?.(node.id, {
            content: nextText,
            prompt: nextText,
            composerContent: nextText,
            refScript: {
                ...meta,
                status: "success",
                errorDetails: "",
                prompt: nextText,
                content: nextText,
                classic: {
                    ...meta.classic,
                    script: nextText,
                    status: "success",
                    errorDetails: "",
                    updatedAt: Date.now(),
                },
                updatedAt: Date.now(),
            },
        });
    };

    // 参数变更处理函数
    const handleBusinessScenarioChange = (v: "ecommerce" | "local_life") => {
        setBusinessScenario(v);
        updateMetadata?.(node.id, {
            refScript: {
                ...meta,
                businessScenario: v,
                classic: {
                    ...meta.classic,
                    businessScenario: v,
                    updatedAt: Date.now(),
                },
                updatedAt: Date.now(),
            },
        });
    };

    const handleLanguageChange = (v: "zh" | "en") => {
        setLanguage(v);
        updateMetadata?.(node.id, {
            refScript: {
                ...meta,
                language: v,
                classic: {
                    ...meta.classic,
                    language: v,
                    updatedAt: Date.now(),
                },
                updatedAt: Date.now(),
            },
        });
    };

    const handleTargetVideoModelChange = (v: string) => {
        setTargetVideoModel(v);
        updateMetadata?.(node.id, {
            refScript: {
                ...meta,
                targetVideoModel: v,
                videoModel: v,
                updatedAt: Date.now(),
            },
        });
    };

    const handleDurationChange = (nextSec: number) => {
        setDurationSec(nextSec);
        updateMetadata?.(node.id, {
            refScript: {
                ...meta,
                durationSec: nextSec,
                classic: {
                    ...meta.classic,
                    durationSec: nextSec,
                    updatedAt: Date.now(),
                },
                updatedAt: Date.now(),
            },
        });
    };

    const handleUserRequirementChange = (val: string) => {
        setUserRequirement(val);
        updateMetadata?.(node.id, {
            refScript: {
                ...meta,
                userRequirement: val,
                additionalNotes: val,
                classic: {
                    ...meta.classic,
                    additionalNotes: val,
                    updatedAt: Date.now(),
                },
                updatedAt: Date.now(),
            },
        });
    };

    // 运行参考视频生成脚本
    const runGenerate = async () => {
        const effectiveScriptModel = selectedModel || config.textModel || config.model;
        if (!isAiConfigReady(config, effectiveScriptModel)) {
            message.error("请先在设置中配置并启用 AI 模型");
            return;
        }

        let effectiveRefScript = referenceScript.trim();
        if (!effectiveRefScript && upstreamScriptInfo.script) {
            effectiveRefScript = upstreamScriptInfo.script.trim();
            setReferenceScript(effectiveRefScript);
            updateMetadata?.(node.id, {
                refScript: {
                    ...meta,
                    referenceScript: effectiveRefScript,
                },
            });
        }

        if (!effectiveRefScript && !upstreamAnalysis && !userRequirement.trim()) {
            if (upstreamScriptInfo.hasUpstream && !upstreamScriptInfo.isUpstreamReady) {
                message.warning("已连接上游节点，但尚未完成分析。请先在对应节点中点击开始生成，或在此手动输入参考脚本/创作需求。");
            } else {
                message.warning("请在节点中输入参考脚本内容/创作需求，或连接上游【视频反推】/【素材分析】节点");
            }
            return;
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const currentExecutionId = `${node.id}_${Date.now()}_${nanoid(6)}`;
        const deductKey = `deduct:ref_script:${node.id}:${currentExecutionId}`;
        const refundKey = `refund:ref_script:${node.id}:${currentExecutionId}`;

        let deductedMicrocredits = 0;
        const refundIfDeducted = async () => {
            if (deductedMicrocredits > 0) {
                const amount = deductedMicrocredits;
                deductedMicrocredits = 0;
                try {
                    await featureCredit.refund(amount, selectedModel, "参考生脚本任务中止退款", refundKey, deductKey);
                } catch (e) {
                    console.warn("[reference-script] refund error on abort:", e);
                }
            }
        };

        setRunning(true);
        setErrorMsg("");
        setStreamedScript("");
        const initProgress: ScriptGenerationProgress = { stage: "init", percent: 5, message: "正在校验积分与初始化参考复刻编导上下文..." };
        setLocalProgress(initProgress);
        startNodeTask(node.id, "reference-script", initProgress, {
            executionId: currentExecutionId,
            controller,
            onAbortRefund: refundIfDeducted,
        });

        updateMetadata?.(node.id, {
            status: "loading",
            taskStatus: "running",
            isClientMockTask: true,
            refScript: {
                ...meta,
                status: "running",
                activeExecutionId: currentExecutionId,
                errorDetails: undefined,
            },
        });

        const reportProgress = (p: ScriptGenerationProgress) => {
            if (!isCurrentExecution(node.id, currentExecutionId)) return;
            setLocalProgress(p);
            updateNodeTaskProgress(node.id, p, undefined, currentExecutionId);
        };
        let streamedScriptAccumulator = "";
        const reportStream = (text: string) => {
            if (!isCurrentExecution(node.id, currentExecutionId)) return;
            setStreamedScript(text);
            updateNodeTaskStreamedText(node.id, text, currentExecutionId);
        };

        try {
            const deductRes = await featureCredit.deduct(selectedModel, "画布参考生脚本", deductKey);
            deductedMicrocredits = deductRes.deductedMicrocredits;
            recordTaskDeduction(node.id, deductedMicrocredits, deductKey, currentExecutionId);
        } catch (creditErr) {
            const msg = creditErr instanceof Error ? creditErr.message : "积分扣减失败";
            setErrorMsg(msg);
            setRunning(false);
            setLocalProgress(null);
            failNodeTask(node.id, msg, currentExecutionId);
            updateMetadata?.(node.id, {
                status: scriptResult ? "success" : "idle",
                taskStatus: "idle",
                isClientMockTask: true,
                refScript: {
                    ...meta,
                    status: scriptResult ? "success" : "idle",
                    errorDetails: msg,
                },
            });
            return;
        }

        let progressTimer: any = null;
        try {
            setLocalProgress({ stage: "prep", percent: 12, message: "正在提取多模态素材并编织提示词..." });

            // 1. 提取素材分析数据
            const analysisMeta = upstreamAnalysis?.metadata?.materialAnalysis as MaterialAnalysisMeta | undefined;
            const fileSummaries = analysisMeta?.result?.fileSummaries || [];
            const insightSections = analysisMeta?.result?.insightSections || [];

            // 2. 构造素材引用表
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

            // 3. 计算实际目标时长与视频分段计划
            const targetDuration = durationSec;
            const refDuration = referenceScriptDurationSec || upstreamScriptInfo.durationSec || durationSec;
            const videoModel = targetVideoModel || config.videoModel || resolveModelForCapability(config, config.model, "video");
            const maxDuration = resolveChannelVideoModelMaxDuration(config, videoModel);
            const segmentPlan = segmentCreationAssistantTimeline(targetDuration, maxDuration);

            // 4. 构建提示词
            const reqText = userRequirement.trim();
            const effectiveNotes = (reqText ? `${reqText}\n` : "") + (customRules ? `【补充要求】\n${customRules}` : "");
            const promptBundle = buildReferenceScriptCreationAssistantPrompts({
                fileSummaries,
                insightSections,
                assetReferenceMap,
                businessScenario,
                language,
                durationSec: targetDuration,
                videoModel,
                videoModelMaxDurationSec: maxDuration,
                videoSegmentPlan: segmentPlan,
                additionalNotes: effectiveNotes,
                referenceScript: effectiveRefScript,
                referenceScriptDurationSec: refDuration,
            });

            // 5. 提示词替换与模型调用
            const effectiveSystemPrompt =
                useCustomPrompt && customPrompt.trim()
                    ? customPrompt.trim()
                    : promptBundle.systemPrompt;

            const { contentParts: finalContentParts } = await resolveMentionedContentPartsAsync({
                textPrompt: promptBundle.userPrompt,
                userRequirement: reqText,
                references: mentionReferences,
            });

            const startTime = Date.now();
            let streamedChars = 0;
            let currentPercent = 20;
            reportProgress({ stage: "generation", percent: 20, message: "正在连接大模型生成脚本..." });

            progressTimer = setInterval(() => {
                const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
                if (streamedChars > 0) {
                    const dynamicPercent = Math.min(96, 85 + Math.floor(streamedChars / 200));
                    currentPercent = Math.max(currentPercent, dynamicPercent);
                    reportProgress({
                        stage: "generation",
                        percent: currentPercent,
                        message: `⚡ 大模型实时流式推演中 (已生成 ${streamedChars} 字 · 耗时 ${elapsedSec}s)`,
                    });
                } else {
                    const waitPercent = Math.min(80, 20 + elapsedSec * 2);
                    currentPercent = Math.max(currentPercent, waitPercent);
                    reportProgress({
                        stage: "generation",
                        percent: currentPercent,
                        message: `正在调用大模型进行剧本与分镜深度推理 (已耗时 ${elapsedSec}s)...`,
                    });
                }
            }, 800);

            const handleDelta = (delta: string) => {
                streamedChars += delta.length;
                streamedScriptAccumulator += delta;
                reportStream(streamedScriptAccumulator);
                if (streamedChars <= delta.length) {
                    reportProgress({
                        stage: "generation",
                        percent: Math.max(currentPercent, 88),
                        message: "⚡ 大模型已开始吐字响应 · 实时流式推演中...",
                    });
                }
            };

            const response = await requestImageQuestion(
                { ...config, model: effectiveScriptModel, systemPrompt: effectiveSystemPrompt },
                [{ role: "user", content: finalContentParts }],
                handleDelta,
                { temperature: 0.85, presence_penalty: 0.2, signal: controller.signal, scene: "ref_script" },
            );

            clearInterval(progressTimer);
            progressTimer = null;

            reportProgress({ stage: "complete", percent: 100, message: "参考生脚本生成成功！" });
            if (!isCurrentExecution(node.id, currentExecutionId)) return;
            const cleanScript = normalizeCreationAssistantScript(response, assetReferenceMap);

            updateMetadata?.(node.id, {
                status: "success",
                taskStatus: "succeeded",
                isClientMockTask: true,
                content: cleanScript,
                prompt: cleanScript,
                composerContent: cleanScript,
                refScript: {
                    ...meta,
                    model: selectedModel,
                    status: "success",
                    activeExecutionId: currentExecutionId,
                    errorDetails: "",
                    businessScenario,
                    language,
                    durationSec: targetDuration,
                    referenceScriptDurationSec: refDuration,
                    targetVideoModel,
                    videoModel,
                    referenceScript: effectiveRefScript,
                    userRequirement: reqText,
                    additionalNotes: reqText,
                    customRules,
                    customPrompt,
                    useCustomPrompt,
                    prompt: cleanScript,
                    content: cleanScript,
                    result: {
                        version: "ref-script-result.v1",
                        script: cleanScript,
                        generatedAt: Date.now(),
                        videoModel,
                        segmentPlan,
                    },
                    classic: {
                        script: cleanScript,
                        status: "success",
                        errorDetails: "",
                        businessScenario,
                        language,
                        durationSec: targetDuration,
                        referenceScriptDurationSec: refDuration,
                        segmentPlan,
                        updatedAt: Date.now(),
                    },
                    updatedAt: Date.now(),
                },
            });

            finishNodeTask(node.id, currentExecutionId);
            setRunning(false);
            setLocalProgress(null);
            setStreamedScript("");
            setScriptResult(cleanScript);
            setErrorMsg("");
            message.success("参考生脚本生成成功！");
        } catch (error) {
            await refundIfDeducted();
            if (!isCurrentExecution(node.id, currentExecutionId)) return;
            const msg = error instanceof Error ? error.message : String(error);
            setErrorMsg(msg);
            const hasAnyResult = Boolean(scriptResult || meta.classic?.script || meta.result?.script);
            updateMetadata?.(node.id, {
                status: hasAnyResult ? "success" : "error",
                taskStatus: "idle",
                isClientMockTask: true,
                refScript: {
                    ...meta,
                    status: hasAnyResult ? "success" : "error",
                    errorDetails: msg,
                    classic: {
                        ...meta.classic,
                        status: hasAnyResult ? "success" : "error",
                        errorDetails: msg,
                        updatedAt: Date.now(),
                    },
                    updatedAt: Date.now(),
                },
            });
            failNodeTask(node.id, msg, currentExecutionId);
            setRunning(false);
            setLocalProgress(null);
            setStreamedScript("");
        } finally {
            if (progressTimer) clearInterval(progressTimer);
            setLocalProgress(null);
            setStreamedScript("");
            if (abortControllerRef.current === controller) {
                setRunning(false);
                abortControllerRef.current = null;
            }
        }
    };

    const handleClearScript = () => {
        setScriptResult("");
        setErrorMsg("");
        setStreamedScript("");
        setLocalProgress(null);
        updateMetadata?.(node.id, {
            content: "",
            prompt: "",
            composerContent: "",
            refScript: {
                ...meta,
                status: "idle",
                errorDetails: "",
                prompt: "",
                content: "",
                result: undefined,
                classic: {
                    ...meta.classic,
                    script: "",
                    status: "idle",
                    errorDetails: "",
                    updatedAt: Date.now(),
                },
                updatedAt: Date.now(),
            },
        });
    };

    const downloadScriptFile = () => {
        if (!scriptResult) return;
        const blob = new Blob([scriptResult], { type: "text/plain;charset=utf-8" });
        saveAs(blob, `参考视频替换脚本-${Date.now()}.txt`);
        message.success("已下载脚本文件");
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
            {/* 顶部标题与状态栏（画布拖拽把手） */}
            <div
                className="flex h-12 shrink-0 cursor-grab items-center justify-between border-b px-4 gap-2 active:cursor-grabbing select-none"
                style={{ borderColor: theme.node.stroke, background: theme.node.panel }}
            >
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex items-center gap-1.5 font-bold text-base shrink-0">
                        <Clapperboard className="size-5 text-amber-500" />
                        <span>参考生脚本</span>
                    </div>
                    <div onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <FeatureCreditBadge scene="ref_script" model={selectedModel} size="small" />
                    </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-auto" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                    {running ? (
                        <span className="flex items-center gap-1.5 text-amber-500 text-sm font-medium">
                            <Loader2 className="size-4 animate-spin" />
                            <span>处理中</span>
                        </span>
                    ) : scriptResult ? (
                        <span className="flex items-center gap-1.5 text-emerald-500 text-sm font-medium">
                            <Check className="size-4" />
                            <span>已就绪</span>
                        </span>
                    ) : null}
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

            {/* 模型选择 */}
            <div className="flex items-center gap-2 min-w-0">
                <span style={{ color: theme.node.muted }} className="shrink-0 text-xs font-medium">
                    脚本模型
                </span>
                <ModelPicker
                    config={config}
                    value={selectedModel}
                    onChange={handleModelChange}
                    capability="text"
                    className="h-9 text-sm flex-1 min-w-0"
                />
            </div>

            {/* 参考脚本/爆款文案 输入卡片（点击弹窗放大编辑） */}
            <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setRefScriptModalOpen(true)}
                className="flex items-center justify-between rounded-lg border p-3 text-left transition-colors hover:border-amber-400 dark:hover:border-amber-600 cursor-pointer"
                style={inputBaseStyle}
            >
                <div className="flex items-center gap-2.5 min-w-0">
                    <Video className="size-4 text-amber-500 shrink-0" />
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-stone-800 dark:text-stone-200">
                                参考脚本 / 爆款文案
                            </span>
                            {upstreamScriptInfo.hasUpstream ? (
                                upstreamScriptInfo.isUpstreamReady ? (
                                    <span className="rounded bg-purple-500/10 px-2 py-0.5 text-xs text-purple-600 dark:text-purple-400 font-medium">
                                        {upstreamScriptInfo.source === "deconstruct_shots"
                                            ? `已同步创意分镜 (${upstreamScriptInfo.shotCount || 0}镜)`
                                            : `已同步反推文案 (${(referenceScript || upstreamScriptInfo.script).length}字)`}
                                    </span>
                                ) : (
                                    <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">
                                        反推未就绪
                                    </span>
                                )
                            ) : referenceScript.trim() ? (
                                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                                    已填写 ({referenceScript.length}字)
                                </span>
                            ) : (
                                <span className="text-xs" style={{ color: theme.node.muted }}>
                                    未填写
                                </span>
                            )}
                        </div>
                        <span className="truncate text-xs mt-0.5" style={{ color: theme.node.muted }}>
                            {referenceScript.trim()
                                ? referenceScript.replace(/\s+/g, " ")
                                : "点击输入/粘贴参考视频文案或分镜结构..."}
                        </span>
                    </div>
                </div>
                <span className="text-xs text-amber-500 font-semibold shrink-0 ml-2">编辑</span>
            </button>

            {/* 恢复的创作参数设置卡片（业务场景、输出语言、目标视频模型、目标总时长） */}
            <div className="flex flex-col gap-2 rounded-lg border p-3 text-xs" style={inputBaseStyle}>
                <button
                    type="button"
                    onClick={() => setConfigExpanded(!configExpanded)}
                    className="flex w-full items-center justify-between cursor-pointer font-medium select-none text-left"
                >
                    <span className="flex items-center gap-1.5">
                        <SlidersHorizontal className="size-4 text-amber-500" />
                        <span className="font-semibold text-sm text-stone-800 dark:text-stone-200">创作参数设置</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                        {configExpanded ? <ChevronUp className="size-3.5 text-neutral-400" /> : <ChevronDown className="size-3.5 text-neutral-400" />}
                    </div>
                </button>

                {configExpanded ? (
                    <div className="flex flex-col gap-2.5 pt-1.5 border-t border-stone-100 dark:border-stone-800">
                        {/* 业务场景 & 输出语言 */}
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <span className="text-[11px] text-stone-500 dark:text-stone-400 block mb-1 font-medium">业务场景</span>
                                <Select
                                    value={businessScenario}
                                    onChange={handleBusinessScenarioChange}
                                    size="small"
                                    className="w-full"
                                    options={[
                                        { label: "电商带货", value: "ecommerce" },
                                        { label: "本地生活", value: "local_life" },
                                    ]}
                                />
                            </div>
                            <div>
                                <span className="text-[11px] text-stone-500 dark:text-stone-400 block mb-1 font-medium">输出语言</span>
                                <Select
                                    value={language}
                                    onChange={handleLanguageChange}
                                    size="small"
                                    className="w-full"
                                    options={[
                                        { label: "中文", value: "zh" },
                                        { label: "英文", value: "en" },
                                    ]}
                                />
                            </div>
                        </div>

                        {/* 目标视频模型 */}
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] text-stone-500 dark:text-stone-400 flex items-center gap-1 font-medium">
                                    <Film className="size-3.5 text-amber-500" />
                                    <span>目标视频模型</span>
                                </span>
                                <span className="text-[11px] text-stone-400">
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
                                className="h-8 text-xs w-full"
                            />
                        </div>

                        {/* 目标总时长 */}
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] text-stone-500 dark:text-stone-400 flex items-center gap-1 font-medium">
                                    <Clock className="size-3.5 text-amber-500" />
                                    <span>目标总时长</span>
                                </span>
                                <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                    {durationSec}s · 预计规划 {Math.ceil(durationSec / targetModelMaxDuration)} 段切片
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-1.5">
                                <div className="flex flex-wrap items-center gap-1">
                                    {[15, 30, 45, 60].map((d) => (
                                        <button
                                            key={d}
                                            type="button"
                                            onClick={() => handleDurationChange(d)}
                                            className={`rounded px-2 py-0.5 text-xs transition-colors cursor-pointer ${
                                                durationSec === d
                                                    ? "bg-amber-500 text-white font-medium shadow-2xs"
                                                    : "border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-amber-500"
                                            }`}
                                        >
                                            {d}s
                                        </button>
                                    ))}
                                    {resolvedDurations.referenceDurationSec && resolvedDurations.referenceDurationSec !== durationSec ? (
                                        <button
                                            type="button"
                                            onClick={() => handleDurationChange(resolvedDurations.referenceDurationSec!)}
                                            className="rounded px-2 py-0.5 text-xs border border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-colors cursor-pointer"
                                            title="一键对齐上游参考视频时长"
                                        >
                                            原片({resolvedDurations.referenceDurationSec}s)
                                        </button>
                                    ) : null}
                                </div>
                                <div className="flex items-center rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-1.5 py-0.5 focus-within:border-amber-500">
                                    <input
                                        type="number"
                                        min={1}
                                        max={300}
                                        value={durationSec}
                                        onChange={(e) => {
                                            const v = parseInt(e.target.value, 10);
                                            if (!isNaN(v)) handleDurationChange(Math.max(1, Math.min(300, v)));
                                        }}
                                        className="w-8 bg-transparent text-center text-xs font-semibold text-neutral-800 dark:text-neutral-200 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    />
                                    <span className="text-[11px] text-neutral-400">秒</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-[11px] text-neutral-400 flex items-center justify-between pt-0.5">
                        <span>
                            {businessScenario === "ecommerce" ? "电商带货" : "本地生活"} · {language === "zh" ? "中文" : "英文"} · {durationSec}s · {targetVideoModel}
                        </span>
                        <span>规划 {Math.ceil(durationSec / targetModelMaxDuration)} 段</span>
                    </div>
                )}
            </div>

            {/* 用户创作需求总输入框（支持 @ 引用素材，与生图/生视频节点完全一致） */}
            <div className="flex flex-col gap-2 rounded-lg border p-3 text-xs" style={inputBaseStyle}>
                <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-stone-800 dark:text-stone-200">
                        用户创作需求
                    </span>
                    {mentionReferences.length > 0 && (
                        <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <AtSign className="size-3" />
                            <span>支持 @ 引用 {mentionReferences.length} 个素材</span>
                        </span>
                    )}
                </div>

                {/* 上方素材快捷点击插入栏 */}
                {mentionReferences.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 py-1 max-h-28 overflow-y-auto thin-scrollbar">
                        {mentionReferences.map((ref) => {
                            const isImg = ref.kind === "image" && Boolean(ref.previewUrl);
                            return (
                                <span
                                    key={ref.id}
                                    className="inline-flex items-center gap-1.5 rounded-md border border-amber-300/70 bg-white/90 dark:bg-stone-800/90 pl-2 pr-1.5 py-1 text-xs text-amber-800 dark:text-amber-200 shadow-2xs select-none"
                                >
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const token = `@${ref.label} `;
                                            handleUserRequirementChange(userRequirement ? `${userRequirement} ${token}` : token);
                                        }}
                                        className="flex items-center gap-1 hover:text-amber-950 dark:hover:text-amber-100 cursor-pointer transition-colors"
                                        title={`点击快速插入 @${ref.label} (${ref.title})`}
                                    >
                                        {isImg ? (
                                            <img src={ref.previewUrl} alt={ref.label} className="size-4 rounded object-cover" />
                                        ) : ref.kind === "video" ? (
                                            <Film className="size-3.5 text-purple-500" />
                                        ) : ref.kind === "audio" ? (
                                            <Music2 className="size-3.5 text-emerald-500" />
                                        ) : (
                                            <FileText className="size-3.5 text-blue-500" />
                                        )}
                                        <span className="font-medium">@{ref.label}</span>
                                    </button>
                                    {ref.nodeId ? (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDisconnectReference(ref);
                                            }}
                                            className="rounded p-0.5 text-stone-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition-colors cursor-pointer"
                                            title={`断开与 ${ref.label} (${ref.title}) 的画布连线`}
                                        >
                                            <X className="size-3" />
                                        </button>
                                    ) : null}
                                </span>
                            );
                        })}
                    </div>
                ) : null}

                <div
                    className="w-full rounded-md border overflow-hidden"
                    style={{ borderColor: theme.node.stroke, background: theme.node.panel }}
                    data-canvas-no-zoom
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onWheel={(e) => e.stopPropagation()}
                >
                    <CanvasResourceMentionTextarea
                        value={userRequirement}
                        references={mentionReferences}
                        includeAssetLibrary
                        onChange={handleUserRequirementChange}
                        sendOnEnter={false}
                        highlightLabels={true}
                        containerClassName="w-full"
                        className="thin-scrollbar min-h-[80px] max-h-44 w-full resize-y border-none bg-transparent p-2 text-xs leading-relaxed text-stone-800 dark:text-stone-200 !outline-none !ring-0 !shadow-none focus:!outline-none focus:!ring-0 focus:!shadow-none placeholder:text-stone-400"
                        placeholder="输入您的创作需求，键入 @ 可直接引用关联的图片/视频/文本素材... 例如：将原视频中的运动鞋替换为女士保湿精华，保持原有快节奏剪辑与痛点引入，强调核心卖点与功效..."
                    />
                </div>
            </div>

            {/* 提示词编辑卡片 */}
            <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setPromptModalOpen(true)}
                className="flex items-center justify-between rounded-lg border p-3 text-left transition-colors hover:border-amber-400 dark:hover:border-amber-600 cursor-pointer"
                style={inputBaseStyle}
            >
                <div className="flex items-center gap-2.5 min-w-0">
                    <SlidersHorizontal className="size-4 text-amber-500 shrink-0" />
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-stone-800 dark:text-stone-200">提示词编辑</span>
                            {useCustomPrompt ? (
                                <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">已替换提示词</span>
                            ) : customRules.trim() ? (
                                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">已补充提示词</span>
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

            {/* 进度显示条与实时流式推演（严格仅在运行态展现，终态自动收敛清空） */}
            {(running || isNodeExecuting) && effectiveProgress ? (
                <div className="flex flex-col gap-2 rounded-lg border p-3 text-xs" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
                    <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm flex items-center gap-1.5" style={{ color: theme.accent.primary }}>
                            {effectiveProgress.percent >= 100 ? (
                                <>
                                    <Check className="size-4 text-emerald-500 shrink-0" />
                                    <span className="text-emerald-500">参考复刻生成完成</span>
                                </>
                            ) : (
                                <>
                                    <Loader2 className="size-4 animate-spin text-amber-500 shrink-0" />
                                    <span>参考复刻生成中</span>
                                </>
                            )}
                        </span>
                        <span className={`font-mono font-semibold text-xs ${effectiveProgress.percent >= 100 ? "text-emerald-500" : ""}`}>{effectiveProgress.percent}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                        <div
                            className={`h-full transition-all duration-300 ${effectiveProgress.percent >= 100 ? "bg-emerald-500" : "bg-amber-500"}`}
                            style={{ width: `${effectiveProgress.percent}%` }}
                        />
                    </div>
                    {effectiveProgress.message ? (
                        <div className="text-xs text-stone-500 dark:text-stone-400 truncate flex items-center gap-1">
                            <span>{effectiveProgress.message}</span>
                        </div>
                    ) : null}
                    {effectiveStreamedScript ? (
                        <div className="mt-1 rounded-md bg-stone-900/5 dark:bg-stone-900/40 p-2 font-mono text-xs text-stone-600 dark:text-stone-300 max-h-32 overflow-y-auto thin-scrollbar break-all leading-relaxed border border-stone-200/50 dark:border-stone-800/50">
                            <div className="flex items-center justify-between text-stone-400 mb-1 text-[11px]">
                                <span>⚡ 实时推演输出 ({effectiveStreamedScript.length} 字)</span>
                                <span className="animate-pulse text-amber-500 font-semibold">写入中...</span>
                            </div>
                            <div className="whitespace-pre-wrap">{effectiveStreamedScript.slice(-300)}</div>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {/* 错误提示 */}
            {errorMsg ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-600 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-400">
                    {errorMsg}
                </div>
            ) : null}

            {/* 提示词结果展示条 */}
            {scriptResult ? (
                <div
                    className="flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-xs"
                    style={{ background: theme.node.fill, borderColor: theme.node.stroke }}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <Sparkles className="size-4 text-amber-500 shrink-0" />
                        <span className="truncate font-semibold text-sm">视频提示词已就绪</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={() => setExpandedModalOpen(true)}
                            className="flex items-center gap-1 hover:text-amber-500 transition-colors cursor-pointer text-xs"
                            title="放大查看与编辑"
                        >
                            <Maximize2 className="size-3.5" />
                            <span>放大</span>
                        </button>
                        <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={copyScript}
                            className="flex items-center gap-1 hover:text-amber-500 transition-colors cursor-pointer text-xs"
                            title="复制内容"
                        >
                            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                            <span>{copied ? "已复制" : "复制"}</span>
                        </button>
                        <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={downloadScriptFile}
                            className="flex items-center gap-1 text-amber-500 font-semibold hover:text-amber-600 transition-colors cursor-pointer text-xs"
                            title="下载文件"
                        >
                            <Download className="size-3.5" />
                            <span>下载</span>
                        </button>
                    </div>
                </div>
            ) : null}

            {/* 底部操作栏 */}
            <div className="mt-auto flex items-center justify-between pt-2.5">
                <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={handleClearScript}
                    disabled={running}
                    className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors hover:opacity-80 disabled:opacity-50 cursor-pointer"
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
                            <Loader2 className="size-4 animate-spin text-white" />
                            <span>脚本生成中...</span>
                        </>
                    ) : (
                        <>
                            <Play className="size-3.5 fill-current" />
                            <span>{scriptResult ? "重新生成脚本" : "生成脚本"}</span>
                        </>
                    )}
                </button>
            </div>
            </div>

            {/* 参考脚本/爆款文案编辑弹窗 */}
            <Modal
                open={refScriptModalOpen}
                onCancel={() => setRefScriptModalOpen(false)}
                footer={null}
                width={760}
                destroyOnClose
                title={
                    <div className="flex items-center justify-between pr-8 select-none">
                        <div className="flex items-center gap-2 text-base font-semibold">
                            <Video className="size-4 text-amber-500" />
                            <span>编辑参考脚本 / 爆款文案</span>
                        </div>
                        {upstreamScriptInfo.hasUpstream ? (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-amber-600 dark:text-amber-400">
                                    {upstreamScriptInfo.isUpstreamReady ? "当前已与上游视频反推保持同步" : "已连接上游反推，等待上游生成"}
                                </span>
                                {upstreamScriptInfo.isUpstreamReady && upstreamScriptInfo.script && referenceScript !== upstreamScriptInfo.script ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setReferenceScript(upstreamScriptInfo.script);
                                            updateMetadata?.(node.id, {
                                                refScript: {
                                                    ...meta,
                                                    referenceScript: upstreamScriptInfo.script,
                                                    isUserEditedReferenceScript: false,
                                                },
                                            });
                                            message.success("已重新同步上游最新反推内容");
                                        }}
                                        className="rounded bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 cursor-pointer"
                                    >
                                        重新同步上游
                                    </button>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                }
            >
                <div
                    className="flex flex-col gap-3 pt-2"
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                        请在此粘贴或修改参考视频的爆款文案、镜头动作或分镜拆解脚本。系统将在此结构基础上，融合已连接的素材洞察生成全新的视频提示词。
                    </p>
                    <textarea
                        value={referenceScript}
                        onChange={(e) => {
                            const val = e.target.value;
                            setReferenceScript(val);
                            updateMetadata?.(node.id, {
                                refScript: {
                                    ...meta,
                                    referenceScript: val,
                                    isUserEditedReferenceScript: true,
                                },
                            });
                        }}
                        placeholder="粘贴参考视频的分镜脚本或文案... 例如：&#10;[0-3秒] 黄金3秒痛点勾子：经常熬夜脸色蜡黄怎么办？&#10;[3-8秒] 场景展示：拿出产品展示质地与核心成分...&#10;[8-15秒] 效果演示与结尾引导下单..."
                        rows={14}
                        className="w-full resize-none rounded-lg border border-stone-200 bg-white p-3 font-sans text-[14px] leading-relaxed text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100"
                    />
                    <div className="flex items-center justify-between border-t border-stone-100 pt-3 dark:border-stone-800">
                        <span className="text-xs text-stone-400">已输入 {referenceScript.length} 字</span>
                        <button
                            type="button"
                            onClick={() => {
                                setRefScriptModalOpen(false);
                                updateMetadata?.(node.id, {
                                    refScript: {
                                        ...meta,
                                        referenceScript,
                                    },
                                });
                            }}
                            className="rounded bg-amber-500 hover:bg-amber-400 active:bg-amber-600 px-4 py-1.5 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                            style={{ color: "#0c0a09" }}
                        >
                            <span className="font-semibold" style={{ color: "#0c0a09" }}>确认并保存</span>
                        </button>
                    </div>
                </div>
            </Modal>

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
                            <Clapperboard className="size-4 text-amber-500" />
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
                        references={mentionReferences}
                        sourceMediaList={combinedSourceMediaList}
                        onChange={handleScriptChange}
                        onDisconnectReference={handleDisconnectReference}
                    />
                    <div className="flex items-center justify-between text-xs text-neutral-400 pt-2 border-t border-stone-200 dark:border-stone-800">
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
                nodeTitle="提示词编辑"
                initialMode={useCustomPrompt ? "replace" : "supplement"}
                supplementPrompt={customRules}
                replacePrompt={customPrompt}
                supplementPlaceholder="例如：&#10;1. 重点保留参考视频的快节奏反转剪辑结构与钩子设置；&#10;2. 将主推产品功能点在第 5-10 秒进行密集展示；&#10;3. 结尾呼应开篇痛点，引导评论区互动与下单..."
                replacePlaceholder="在此输入您的自定义系统提示词（将完全替换内置参考视频结构重构规则）..."
                onSave={({ mode, supplementPrompt, replacePrompt: nextReplace }) => {
                    setCustomRules(supplementPrompt);
                    setCustomPrompt(nextReplace);
                    setUseCustomPrompt(mode === "replace");
                    updateMetadata?.(node.id, {
                        refScript: {
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
