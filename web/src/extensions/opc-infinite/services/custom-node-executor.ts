import { nanoid } from "nanoid";
import { isGenerationCanceled } from "@/lib/canvas/canvas-project-generation";

import type { CanvasGenerationExecution } from "@/pages/canvas/canvas-generation-executor-types";
import type { GenerationTask } from "@/services/api/task-center";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { resolveResourceUrl } from "@/services/api/resources";
import { getCachedResourceBlob } from "@/services/resource-blob-cache";
import { setMediaBlob } from "@/services/file-storage";
import { requestImageQuestion } from "@/services/api/image";
import {
    resolveChannelVideoModelDurationBounds,
    resolveChannelVideoModelMaxDuration,
} from "@/lib/model-capabilities";
import { resolveModelForCapability } from "@/stores/use-config-store";
import {
    buildCreationAssistantPrompts,
    buildReferenceScriptCreationAssistantPrompts,
    normalizeCreationAssistantScript,
} from "@/lib/creation-assistant-prompts";
import { segmentCreationAssistantTimeline } from "@/lib/creation-assistant-segmentation";
import { analyzeCreationAssistantBatch, type AnalysisFile } from "@/services/creation-assistant-analysis";
import { prepareCreationAssistantVideos } from "@/services/creation-assistant-video-analysis";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import { deductFeatureCredits, refundFeatureCredits } from "@/services/api/feature-credits";

import {
    VIDEO_REVERSE_NODE_TYPE,
    resolveDefaultLocalAsrSetting,
    type ReverseMeta,
} from "./video-reverse-contracts";
import {
    prepareReverseVideo,
    analyzePreparedReverseVideo,
    disposePreparedReverseVideo,
} from "./video-reverse-analysis";
import {
    CREATION_ASSISTANT_ANALYSIS_NODE_TYPE,
    CREATION_ASSISTANT_SCRIPT_NODE_TYPE,
    CREATION_ASSISTANT_REF_SCRIPT_NODE_TYPE,
    resolveCreationAssistantDurations,
    type MaterialAnalysisMeta,
    type ConfigScriptMeta,
    type RefScriptMeta,
} from "./creation-assistant-contracts";
import {
    CREATIVE_REVERSE_SHOT_DECONSTRUCTION_SYSTEM_PROMPT,
    fetchCreativeReversePrompt,
    formatShotManifestToReadableScript,
    parseDirectorJson,
} from "../prompts/hypit-director-prompts";
import {
    buildRefScriptMentionReferences,
    resolveMentionedContentPartsAsync,
} from "./script-mention-resolver";
import { resolveUpstreamReferenceScript } from "../components/reference-video-script-node";

export function isCustomPluginNode(type: string | undefined): boolean {
    if (!type) return false;
    return (
        type === VIDEO_REVERSE_NODE_TYPE ||
        type === CREATION_ASSISTANT_ANALYSIS_NODE_TYPE ||
        type === CREATION_ASSISTANT_SCRIPT_NODE_TYPE ||
        type === CREATION_ASSISTANT_REF_SCRIPT_NODE_TYPE
    );
}

function createMockGenerationTask(params: { id: string; type: string; prompt: string; progress?: number; stage?: string }): GenerationTask {
    const now = new Date().toISOString();
    return {
        id: params.id,
        type: params.type,
        status: "running",
        prompt: params.prompt,
        progress: params.progress ?? 10,
        stage: params.stage,
        attempts: 1,
        createdAt: now,
        updatedAt: now,
    };
}

/**
 * 二开算子统一无头执行器。
 * 供 useCanvasGenerationExecutor 调度，复用上游原生的任务生命周期、Task Center 与 resumeAgent 唤醒机制。
 */
export async function executeCustomPluginNode(execution: CanvasGenerationExecution): Promise<void> {
    const {
        nodeId,
        sourceNode,
        canvasNodes,
        canvasConnections,
        generationConfig,
        controller,
        setNodes,
        bindGenerationTask,
    } = execution;

    if (!sourceNode) return;

    // 1. 调度：视频反推算子 (video-reverse:analyzer)
    if (sourceNode.type === VIDEO_REVERSE_NODE_TYPE) {
        await executeVideoReverse(execution);
        return;
    }

    // 2. 调度：素材分析算子 (creation-assistant-analysis:analyzer)
    if (sourceNode.type === CREATION_ASSISTANT_ANALYSIS_NODE_TYPE) {
        await executeMaterialAnalysis(execution);
        return;
    }

    // 3. 调度：配置生成脚本算子 (creation-assistant-script:generator)
    if (sourceNode.type === CREATION_ASSISTANT_SCRIPT_NODE_TYPE) {
        await executeConfigScript(execution);
        return;
    }

    // 4. 调度：参考生脚本算子 (creation-assistant-ref-script:generator)
    if (sourceNode.type === CREATION_ASSISTANT_REF_SCRIPT_NODE_TYPE) {
        await executeRefScript(execution);
        return;
    }
}

// ---------------------------------------------------------------------------
// 1. 视频反推实现
// ---------------------------------------------------------------------------
async function executeVideoReverse(execution: CanvasGenerationExecution) {
    const { nodeId, sourceNode, canvasNodes, canvasConnections, generationConfig, controller, setNodes, bindGenerationTask } = execution;
    const meta = (sourceNode?.metadata?.videoReverse || {}) as ReverseMeta;

    // 寻找上游视频源
    const incomingEdges = canvasConnections.filter((c) => c.toNodeId === nodeId);
    const upstreamNodes = incomingEdges
        .map((e) => canvasNodes.find((n) => n.id === e.fromNodeId))
        .filter((n): n is CanvasNodeData => Boolean(n));

    let upstreamVideoNode = upstreamNodes.find((n) => n.type === CanvasNodeType.Video || n.metadata?.mimeType?.startsWith("video/"));
    if (!upstreamVideoNode && meta.sourceNodeId && meta.sourceNodeId !== "__local__") {
        upstreamVideoNode = canvasNodes.find((n) => n.id === meta.sourceNodeId);
    }
    if (!upstreamVideoNode) {
        upstreamVideoNode = canvasNodes.find((n) => n.type === CanvasNodeType.Video || n.metadata?.mimeType?.startsWith("video/"));
    }

    const storageKey = upstreamVideoNode?.metadata?.storageKey;
    let videoSource: Blob | string = "";
    if (storageKey) {
        try {
            const cachedBlob = await getCachedResourceBlob(storageKey);
            if (cachedBlob) {
                videoSource = cachedBlob;
            }
        } catch (cacheErr) {
            console.warn("[custom-node-executor] 读取多级缓存异常，回退至远程 URL:", cacheErr);
        }
    }
    if (!videoSource) {
        videoSource =
            upstreamVideoNode?.metadata?.content ||
            (storageKey ? resolveResourceUrl(storageKey) : "") ||
            "";
    }

    if (upstreamVideoNode?.metadata?.fileUpload === "uploading") {
        throw new Error("上游参考视频正在上传中，请等待上传完成后再执行视频反推");
    }

    if (!videoSource) {
        throw new Error("视频反推节点未找到可用的上游参考视频，请先连接视频节点");
    }

    const effectiveModel = meta.model || generationConfig.textModel || generationConfig.model;
    let deductedMicrocredits = 0;
    try {
        const creditRes = await deductFeatureCredits({
            scene: "video_reverse",
            model: effectiveModel,
            note: "画布视频反推任务",
        });
        deductedMicrocredits = creditRes.deductedMicrocredits;
    } catch (creditErr: any) {
        throw new Error(creditErr?.response?.data?.message || creditErr?.message || "视频反推积分扣减失败，余额不足");
    }

    const taskId = `mock_reverse_${nanoid()}`;
    const task = createMockGenerationTask({
        id: taskId,
        type: "video_reverse",
        prompt: execution.prompt || "视频反推拆解",
        progress: 10,
        stage: "正在抽帧与网格拼版",
    });
    bindGenerationTask(nodeId, task);

    const handleCancellation = () => {
        if (deductedMicrocredits > 0) {
            void refundFeatureCredits({
                scene: "video_reverse",
                model: effectiveModel,
                amountMicrocredits: deductedMicrocredits,
                note: "画布视频反推取消退款",
            });
            deductedMicrocredits = 0;
        }
        task.status = "cancelled";
        task.stage = "任务已取消";
        task.progress = 0;
        bindGenerationTask(nodeId, task);
        setNodes((prev) =>
            prev.map((n) =>
                n.id === nodeId
                    ? {
                          ...n,
                          metadata: {
                              ...n.metadata,
                              status: (n.metadata?.content || n.metadata?.prompt) ? "success" : "idle",
                              taskStatus: "cancelled",
                              taskProgress: 0,
                              taskStage: "任务已取消",
                              errorDetails: undefined,
                              videoReverse: {
                                  ...((n.metadata?.videoReverse || {}) as any),
                                  status: (n.metadata?.content || n.metadata?.prompt) ? "success" : "idle",
                              },
                          },
                      }
                    : n,
            ),
        );
    };

    setNodes((prev) =>
        prev.map((n) =>
            n.id === nodeId
                ? {
                      ...n,
                      metadata: {
                          ...n.metadata,
                          status: "loading",
                          taskId,
                          taskStatus: "running",
                          taskProgress: 10,
                          taskStage: "正在抽帧与网格拼版",
                          isClientMockTask: true,
                          videoReverse: {
                              ...((n.metadata?.videoReverse || {}) as any),
                              status: "running",
                          },
                      },
                  }
                : n,
        ),
    );

    let prepared: Awaited<ReturnType<typeof prepareReverseVideo>> | null = null;
    try {
        const isDeconstruct = meta.activeTab === "deconstruct";
        const wordLevelAudio = meta.wordLevelAudio !== false;
        const effectiveAsrEnabled = isDeconstruct
            ? (wordLevelAudio ? (meta.localAsrEnabled !== undefined ? meta.localAsrEnabled : resolveDefaultLocalAsrSetting(effectiveModel)) : false)
            : (meta.localAsrEnabled !== undefined ? meta.localAsrEnabled : resolveDefaultLocalAsrSetting(effectiveModel));

        prepared = await prepareReverseVideo(
            videoSource,
            meta.gridSize || "auto",
            (p) => {
                task.progress = p.percent;
                task.stage = p.message;
                bindGenerationTask(nodeId, task);
            },
            {
                track: isDeconstruct ? "deconstruct" : "classic",
                samplingPolicy: isDeconstruct
                    ? {
                        mode: "deconstruct",
                        sceneChangeThreshold: meta.sceneThreshold,
                        minSceneGapSec: meta.minSceneGapSec,
                    }
                    : {
                        samplingMode: meta.classic?.samplingMode || (meta.samplingMode !== "deconstruct" ? meta.samplingMode : undefined) || "seconds_and_scene",
                        fps: meta.classic?.samplingFps ?? meta.samplingFps ?? 1,
                        includeMiddleFrames: meta.classic?.includeMiddleFrames ?? (meta.includeMiddleFrames !== false),
                        sceneChangeThreshold: meta.classic?.sceneThreshold ?? meta.sceneThreshold ?? 0.20,
                        minSceneGapSec: meta.classic?.minSceneGapSec ?? meta.minSceneGapSec ?? 0.3,
                    },
                localAsrEnabled: effectiveAsrEnabled,
                signal: controller.signal,
            },
        );

        if (controller.signal.aborted) {
            handleCancellation();
            return;
        }

        task.progress = 60;
        task.stage = isDeconstruct ? "正在调用多模态视觉模型执行创意反推分镜拆解" : "正在调用多模态视觉大模型逐秒拆解";
        bindGenerationTask(nodeId, task);

        const deconstructCustomRules = meta.deconstruct?.customRules ?? (meta.activeTab === "deconstruct" ? meta.customRules : undefined);
        const deconstructReplacePrompt = meta.deconstruct?.replaceBuiltInPrompt ?? (meta.activeTab === "deconstruct" ? meta.replaceBuiltInPrompt : undefined);
        const deconstructPromptRules = meta.deconstruct?.promptRules ?? (meta.activeTab === "deconstruct" ? meta.promptRules : undefined);

        const classicCustomRules = meta.classic?.customRules ?? (meta.activeTab === "classic" ? (meta.customRules || meta.requirement) : undefined);
        const classicReplacePrompt = meta.classic?.replaceBuiltInPrompt ?? (meta.activeTab === "classic" ? meta.replaceBuiltInPrompt : undefined);
        const classicPromptRules = meta.classic?.promptRules ?? (meta.activeTab === "classic" ? meta.promptRules : undefined);

        const defaultDeconstructPrompt = isDeconstruct
            ? await fetchCreativeReversePrompt()
            : undefined;

        const effectivePromptRules = isDeconstruct
            ? (deconstructReplacePrompt && deconstructPromptRules?.trim() ? deconstructPromptRules.trim() : (defaultDeconstructPrompt?.trim() || CREATIVE_REVERSE_SHOT_DECONSTRUCTION_SYSTEM_PROMPT))
            : (classicPromptRules || undefined);
        const effectiveRequirement = isDeconstruct
            ? (deconstructCustomRules ? `【用户要求】\n${deconstructCustomRules}\n` : "") +
              (wordLevelAudio
                  ? "【开启词级打标】请对每个镜头中的台词标出具体的字词时间轴（例如：0.0s[熬夜] 0.6s[脸垮] 1.4s[姐妹] 2.1s[看过来]）。"
                  : "")
            : classicCustomRules;

        const analysisResult = await analyzePreparedReverseVideo({
            config: { ...(generationConfig as any), model: effectiveModel },
            prepared,
            userRequirement: effectiveRequirement,
            replaceBuiltInPrompt: isDeconstruct ? true : Boolean(classicReplacePrompt),
            promptRules: effectivePromptRules,
            localAsrEnabled: effectiveAsrEnabled,
            wordLevelAudio: isDeconstruct ? wordLevelAudio : false,
            signal: controller.signal,
            onProgress: (p) => {
                task.progress = p.percent;
                task.stage = p.message;
                bindGenerationTask(nodeId, task);
            },
        });

        if (controller.signal.aborted) {
            handleCancellation();
            return;
        }

        const rawPrompt = analysisResult.prompt;
        let parsedShots: any[] = [];
        let parsedMasterSlots: any = undefined;
        if (isDeconstruct) {
            const parsed = parseDirectorJson<{ title?: string; coreElements?: any; originalMasterSlots?: any; shots?: any[] }>(rawPrompt);
            if (parsed?.shots && Array.isArray(parsed.shots)) {
                parsedShots = parsed.shots;
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
            }
        }

        const userFacingPrompt = isDeconstruct
            ? formatShotManifestToReadableScript(parsedShots, rawPrompt)
            : rawPrompt;

        const finishStage = isDeconstruct ? "创意反推分镜拆解完成" : "反推完成";

        const trackKey = isDeconstruct ? "deconstruct" : "classic";
        const contactSheets = prepared?.pages.map((p) => {
            const storageKey = `reverse_sheet_${nodeId}_${trackKey}_${p.pageIndex}`;
            void setMediaBlob(storageKey, p.blob);
            return {
                pageIndex: p.pageIndex,
                url: p.url,
                storageKey,
                localFilePath: p.localFilePath,
                frameStart: p.frameStart,
                frameEnd: p.frameEnd,
                frameCount: p.frames.length,
            };
        });

        const nextClassicTrack = isDeconstruct ? meta.classic : {
            prompt: userFacingPrompt,
            customRules: classicCustomRules,
            promptRules: classicPromptRules,
            replaceBuiltInPrompt: classicReplacePrompt,
            samplingMode: meta.classic?.samplingMode || (meta.samplingMode !== "deconstruct" ? meta.samplingMode : undefined) || "seconds_and_scene",
            samplingFps: meta.classic?.samplingFps ?? meta.samplingFps ?? 1,
            includeMiddleFrames: meta.classic?.includeMiddleFrames ?? (meta.includeMiddleFrames !== false),
            sceneThreshold: meta.classic?.sceneThreshold ?? meta.sceneThreshold ?? 0.20,
            minSceneGapSec: meta.classic?.minSceneGapSec ?? meta.minSceneGapSec ?? 0.3,
            contactSheets,
            updatedAt: Date.now(),
        };

        const nextDeconstructTrack = isDeconstruct ? {
            prompt: userFacingPrompt,
            rawPrompt,
            shotManifest: parsedShots.length > 0 ? parsedShots : (meta.deconstruct?.shotManifest || meta.shotManifest),
            coreElements: parsedMasterSlots || meta.deconstruct?.coreElements || (meta as any).coreElements,
            originalMasterSlots: parsedMasterSlots || meta.deconstruct?.originalMasterSlots || (meta as any).originalMasterSlots,
            customRules: deconstructCustomRules,
            promptRules: deconstructPromptRules,
            replaceBuiltInPrompt: deconstructReplacePrompt,
            wordLevelAudio,
            contactSheets,
            updatedAt: Date.now(),
        } : meta.deconstruct;

        setNodes((prev) =>
            prev.map((n) =>
                n.id === nodeId
                    ? {
                          ...n,
                          metadata: {
                              ...n.metadata,
                              status: "success",
                              content: userFacingPrompt,
                              prompt: userFacingPrompt,
                              composerContent: userFacingPrompt,
                              taskId,
                              taskStatus: "succeeded",
                              taskProgress: 100,
                              taskStage: finishStage,
                              videoReverse: {
                                  ...meta,
                                  model: effectiveModel,
                                  status: "success",
                                  prompt: userFacingPrompt,
                                  rawPrompt,
                                  shotManifest: isDeconstruct ? (parsedShots.length > 0 ? parsedShots : (meta.deconstruct?.shotManifest || meta.shotManifest)) : (meta.deconstruct?.shotManifest || meta.shotManifest),
                                  coreElements: isDeconstruct ? (parsedMasterSlots || meta.deconstruct?.coreElements || (meta as any).coreElements) : (meta.deconstruct?.coreElements || (meta as any).coreElements),
                                  originalMasterSlots: isDeconstruct ? (parsedMasterSlots || meta.deconstruct?.originalMasterSlots || (meta as any).originalMasterSlots) : (meta.deconstruct?.originalMasterSlots || (meta as any).originalMasterSlots),
                                  isUserEditedScript: false,
                                  activeTab: meta.activeTab,
                                  customRules: isDeconstruct ? nextDeconstructTrack?.customRules : nextClassicTrack?.customRules,
                                  replaceBuiltInPrompt: isDeconstruct ? nextDeconstructTrack?.replaceBuiltInPrompt : nextClassicTrack?.replaceBuiltInPrompt,
                                  promptRules: isDeconstruct ? nextDeconstructTrack?.promptRules : nextClassicTrack?.promptRules,
                                  samplingMode: isDeconstruct ? "deconstruct" : nextClassicTrack?.samplingMode,
                                  contactSheets,
                                  classic: nextClassicTrack,
                                  deconstruct: nextDeconstructTrack,
                                  result: { ...analysisResult, prompt: userFacingPrompt },
                                  updatedAt: Date.now(),
                              },
                          },
                      }
                    : n,
            ),
        );

        task.status = "succeeded";
        task.progress = 100;
        task.stage = finishStage;
        bindGenerationTask(nodeId, task);
    } catch (err) {
        if (deductedMicrocredits > 0) {
            void refundFeatureCredits({
                scene: "video_reverse",
                model: effectiveModel,
                amountMicrocredits: deductedMicrocredits,
                note: "画布视频反推失败退款",
            });
            deductedMicrocredits = 0;
        }
        if (controller.signal.aborted || isGenerationCanceled(err)) {
            task.status = "cancelled";
            task.stage = "任务已取消";
            task.progress = 0;
            bindGenerationTask(nodeId, task);
            setNodes((prev) =>
                prev.map((n) =>
                    n.id === nodeId
                        ? {
                              ...n,
                              metadata: {
                                  ...n.metadata,
                                  status: (n.metadata?.content || n.metadata?.prompt) ? "success" : "idle",
                                  taskStatus: "cancelled",
                                  taskProgress: 0,
                                  taskStage: "任务已取消",
                                  errorDetails: undefined,
                                  videoReverse: {
                                      ...((n.metadata?.videoReverse || {}) as any),
                                      status: (n.metadata?.content || n.metadata?.prompt) ? "success" : "idle",
                                  },
                              },
                          }
                        : n,
                ),
            );
            return;
        }
        task.status = "failed";
        task.error = (err as any)?.message || "视频反推执行失败";
        bindGenerationTask(nodeId, task);
        setNodes((prev) =>
            prev.map((n) =>
                n.id === nodeId
                    ? {
                          ...n,
                          metadata: {
                              ...n.metadata,
                              status: "error",
                              taskStatus: "failed",
                              errorDetails: (err as any)?.message,
                              videoReverse: {
                                  ...((n.metadata?.videoReverse || {}) as any),
                                  status: "error",
                                  errorDetails: (err as any)?.message,
                              },
                          },
                      }
                    : n,
            ),
        );
        throw err;
    } finally {
        if (prepared) disposePreparedReverseVideo(prepared);
    }
}

// ---------------------------------------------------------------------------
// 2. 素材分析实现
// ---------------------------------------------------------------------------
async function executeMaterialAnalysis(execution: CanvasGenerationExecution) {
    const { nodeId, sourceNode, canvasNodes, canvasConnections, generationConfig, controller, setNodes, bindGenerationTask } = execution;
    const meta = (sourceNode?.metadata?.materialAnalysis || {}) as MaterialAnalysisMeta;

    // 聚合上游媒体连线
    const incomingEdges = canvasConnections.filter((c) => c.toNodeId === nodeId);
    const upstreamNodes = incomingEdges
        .map((e) => canvasNodes.find((n) => n.id === e.fromNodeId))
        .filter((n): n is CanvasNodeData => Boolean(n));

    const analysisFiles: AnalysisFile[] = [];

    // 上游图片
    upstreamNodes
        .filter((n) => n.type === CanvasNodeType.Image)
        .forEach((img, idx) => {
            const url = img.metadata?.content || (img.metadata?.storageKey ? resolveResourceUrl(img.metadata.storageKey) : "") || "";
            if (url) {
                analysisFiles.push({
                    id: img.id,
                    name: img.title || `图片${idx + 1}`,
                    kind: "image",
                    item: { id: img.id, name: img.title || `图片${idx + 1}`, url, dataUrl: url, type: img.metadata?.mimeType || "image/png" },
                });
            }
        });

    // 上游视频
    upstreamNodes
        .filter((n) => n.type === CanvasNodeType.Video)
        .forEach((vid, idx) => {
            const url = vid.metadata?.content || (vid.metadata?.storageKey ? resolveResourceUrl(vid.metadata.storageKey) : "") || "";
            if (url) {
                analysisFiles.push({
                    id: vid.id,
                    name: vid.title || `视频${idx + 1}`,
                    kind: "video",
                    item: { id: vid.id, name: vid.title || `视频${idx + 1}`, url, type: vid.metadata?.mimeType || "video/mp4", durationMs: Number(vid.metadata?.durationMs || 0) },
                });
            }
        });

    // 上游音频
    upstreamNodes
        .filter((n) => n.type === CanvasNodeType.Audio)
        .forEach((aud, idx) => {
            const url = aud.metadata?.content || (aud.metadata?.storageKey ? resolveResourceUrl(aud.metadata.storageKey) : "") || "";
            if (url) {
                analysisFiles.push({
                    id: aud.id,
                    name: aud.title || `音频${idx + 1}`,
                    kind: "audio",
                    item: { id: aud.id, name: aud.title || `音频${idx + 1}`, url, type: aud.metadata?.mimeType || "audio/wav" },
                });
            }
        });

    // 本地上传素材
    meta.localSources?.forEach((src) => {
        if (src.kind === "image") {
            analysisFiles.push({
                id: src.id,
                name: src.name,
                kind: "image",
                item: { id: src.id, name: src.name, type: src.mimeType || "image/png", url: src.url || "", dataUrl: src.url || "", storageKey: src.storageKey },
            });
        } else if (src.kind === "video") {
            analysisFiles.push({
                id: src.id,
                name: src.name,
                kind: "video",
                item: { id: src.id, name: src.name, type: src.mimeType || "video/mp4", url: src.url || "", storageKey: src.storageKey, bytes: 0, durationMs: src.durationMs },
            });
        } else {
            analysisFiles.push({
                id: src.id,
                name: src.name,
                kind: "audio",
                item: { id: src.id, name: src.name, type: src.mimeType || "audio/wav", url: src.url || "", storageKey: src.storageKey, bytes: 0 },
            });
        }
    });

    if (analysisFiles.length === 0) {
        if (upstreamNodes.some((n) => n.metadata?.fileUpload === "uploading")) {
            throw new Error("上游素材正在上传中，请等待上传完成后再执行素材分析");
        }
        throw new Error("素材分析节点至少需要连接一个图片、视频或音频素材节点");
    }

    const effectiveModel = meta.model || generationConfig.textModel || generationConfig.model;
    let deductedMicrocredits = 0;
    try {
        const creditRes = await deductFeatureCredits({
            scene: "material_analysis",
            model: effectiveModel,
            note: "画布素材分析任务",
        });
        deductedMicrocredits = creditRes.deductedMicrocredits;
    } catch (creditErr: any) {
        throw new Error(creditErr?.response?.data?.message || creditErr?.message || "素材分析积分扣减失败，余额不足");
    }

    const taskId = nanoid();
    const task = createMockGenerationTask({
        id: taskId,
        type: "material_analysis",
        prompt: execution.prompt || "素材特征与商业洞察分析",
        progress: 15,
        stage: "正在整理素材列表",
    });
    bindGenerationTask(nodeId, task);

    setNodes((prev) =>
        prev.map((n) =>
            n.id === nodeId
                ? {
                      ...n,
                      metadata: {
                          ...n.metadata,
                          status: "loading",
                          taskId,
                          taskStatus: "running",
                          taskProgress: 15,
                          taskStage: "正在准备多模态素材",
                      },
                  }
                : n,
        ),
    );

    try {
        // 视频抽帧
        const videoItems = analysisFiles.filter((f) => f.kind === "video").map((f) => f.item as ReferenceVideo);
        let videoAnalyses: any[] = [];
        if (videoItems.length > 0) {
            task.progress = 30;
            task.stage = "正在对视频素材进行密集抽帧与特征提取";
            bindGenerationTask(nodeId, task);
            videoAnalyses = await prepareCreationAssistantVideos(videoItems);
        }

        if (controller.signal.aborted) {
            if (deductedMicrocredits > 0) {
                void refundFeatureCredits({
                    scene: "material_analysis",
                    model: effectiveModel,
                    amountMicrocredits: deductedMicrocredits,
                    note: "画布素材分析取消退款",
                });
            }
            return;
        }

        task.progress = 60;
        task.stage = "正在调用 AI 大模型进行商品洞察与逐秒拆解";
        bindGenerationTask(nodeId, task);

        const result = await analyzeCreationAssistantBatch(
            { ...generationConfig, model: effectiveModel, systemPrompt: "" },
            analysisFiles,
            videoAnalyses,
            {
                customRules: meta.customRules,
                replaceBuiltInPrompt: meta.replaceBuiltInPrompt,
                promptRules: meta.promptRules,
            },
        );

        if (controller.signal.aborted) {
            if (deductedMicrocredits > 0) {
                void refundFeatureCredits({
                    scene: "material_analysis",
                    model: effectiveModel,
                    amountMicrocredits: deductedMicrocredits,
                    note: "画布素材分析取消退款",
                });
            }
            return;
        }

        // 构造摘要
        const kindCounters: Record<string, number> = { image: 0, video: 0, audio: 0 };
        const refByFileId = new Map<string, string>();
        result.fileSummaries.forEach((s) => {
            const k = s.mediaType || "video";
            kindCounters[k] = (kindCounters[k] || 0) + 1;
            const prefix = k === "image" ? "图片" : k === "video" ? "视频" : "音频";
            refByFileId.set(s.fileId, `@${prefix}${kindCounters[k]}`);
        });

        const summaryText = [
            "【素材分析报告】",
            `共分析 ${result.fileSummaries.length} 个素材文件：`,
            ...result.fileSummaries.map((s) => {
                const refToken = refByFileId.get(s.fileId) || "";
                const clean = (s.summary || "").replace(/\[[^\]]+?\]/gi, "").trim();
                return `${refToken} ${clean}`;
            }),
            "",
            "【商品核心洞察】",
            ...result.insightSections.map((sec) => {
                const itemsText = sec.items
                    .map((it) => {
                        const refs = it.sourceFileIds?.map((id) => refByFileId.get(id)).filter(Boolean) || [];
                        const refSuffix = refs.length ? ` (依据素材: ${refs.join("、")})` : "";
                        return `  - ${it.text}${refSuffix}`;
                    })
                    .join("\n");
                return `■ ${sec.title}：\n${itemsText}`;
            }),
        ].join("\n");

        setNodes((prev) =>
            prev.map((n) =>
                n.id === nodeId
                    ? {
                          ...n,
                          metadata: {
                              ...n.metadata,
                              status: "success",
                              content: summaryText,
                              prompt: summaryText,
                              composerContent: summaryText,
                              taskId,
                              taskStatus: "succeeded",
                              taskProgress: 100,
                              taskStage: "分析完成",
                              materialAnalysis: {
                                  ...meta,
                                  model: effectiveModel,
                                  status: "success",
                                  result: {
                                      version: "material-analysis-result.v1",
                                      generatedAt: Date.now(),
                                      sourceIds: analysisFiles.map((f) => f.id),
                                      fileSummaries: result.fileSummaries,
                                      insightSections: result.insightSections,
                                  },
                                  prompt: summaryText,
                                  content: summaryText,
                                  updatedAt: Date.now(),
                              },
                          },
                      }
                    : n,
            ),
        );

        task.status = "succeeded";
        task.progress = 100;
        task.stage = "分析完成";
        bindGenerationTask(nodeId, task);
    } catch (err) {
        if (deductedMicrocredits > 0) {
            void refundFeatureCredits({
                scene: "material_analysis",
                model: effectiveModel,
                amountMicrocredits: deductedMicrocredits,
                note: "画布素材分析失败退款",
            });
        }
        throw err;
    }
}

// ---------------------------------------------------------------------------
// 3. 配置生成脚本实现
// ---------------------------------------------------------------------------
async function executeConfigScript(execution: CanvasGenerationExecution) {
    const { nodeId, sourceNode, canvasNodes, canvasConnections, generationConfig, controller, setNodes, bindGenerationTask } = execution;
    const meta = (sourceNode?.metadata?.configScript || {}) as ConfigScriptMeta;

    // 寻找上游素材分析节点
    const incomingEdges = canvasConnections.filter((c) => c.toNodeId === nodeId);
    const upstreamAnalysisNode = incomingEdges
        .map((e) => canvasNodes.find((n) => n.id === e.fromNodeId))
        .find((n) => n?.type === CREATION_ASSISTANT_ANALYSIS_NODE_TYPE) ||
        canvasNodes.find((n) => n.type === CREATION_ASSISTANT_ANALYSIS_NODE_TYPE && n.metadata?.materialAnalysis?.result);

    const analysisMeta = upstreamAnalysisNode?.metadata?.materialAnalysis as MaterialAnalysisMeta | undefined;
    const fileSummaries = analysisMeta?.result?.fileSummaries || [];
    const insightSections = analysisMeta?.result?.insightSections || [];

    const businessScenario = meta.businessScenario || "ecommerce";
    const language = meta.language || "zh";
    const scriptType = meta.scriptType || "smart";
    const shootingStyle = meta.shootingStyle || "smart";
    const durationSec = meta.durationSec || 30;
    const primaryPlatform = meta.primaryPlatform || "douyin";
    const additionalNotes = meta.additionalNotes || "";
    const customRules = meta.customRules || "";

    const videoModel = meta.videoModel || (meta as any).targetVideoModel || generationConfig.videoModel || resolveModelForCapability(generationConfig, generationConfig.model, "video");
    const maxDuration = resolveChannelVideoModelMaxDuration(generationConfig, videoModel);
    const segmentPlan = segmentCreationAssistantTimeline(durationSec, maxDuration);

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

    const effectiveNotes = (additionalNotes ? `${additionalNotes}\n` : "") + (customRules ? `【补充要求】\n${customRules}` : "");

    const promptBundle = buildCreationAssistantPrompts({
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

    const effectiveModel = meta.model || generationConfig.textModel || generationConfig.model;
    let deductedMicrocredits = 0;
    try {
        const creditRes = await deductFeatureCredits({
            scene: "config_script",
            model: effectiveModel,
            note: "画布配置生成脚本任务",
        });
        deductedMicrocredits = creditRes.deductedMicrocredits;
    } catch (creditErr: any) {
        throw new Error(creditErr?.response?.data?.message || creditErr?.message || "配置生成脚本积分扣减失败，余额不足");
    }

    const taskId = nanoid();
    const task = createMockGenerationTask({
        id: taskId,
        type: "config_script",
        prompt: execution.prompt || "生成短视频剧本",
        progress: 20,
        stage: "正在根据模型切片规划剧本结构",
    });
    bindGenerationTask(nodeId, task);

    setNodes((prev) =>
        prev.map((n) =>
            n.id === nodeId
                ? {
                      ...n,
                      metadata: {
                          ...n.metadata,
                          status: "loading",
                          taskId,
                          taskStatus: "running",
                          taskProgress: 20,
                          taskStage: "正在根据模型切片规划剧本结构",
                      },
                  }
                : n,
        ),
    );

    const effectiveSystemPrompt = meta.useCustomPrompt && meta.customPrompt?.trim()
        ? meta.customPrompt.trim()
        : promptBundle.systemPrompt;

    let response: string;
    try {
        response = await requestImageQuestion(
            { ...generationConfig, model: effectiveModel, systemPrompt: effectiveSystemPrompt },
            [{ role: "user", content: [{ type: "text", text: promptBundle.userPrompt }] }],
            () => undefined,
            { signal: controller.signal, temperature: 0.85, presence_penalty: 0.2 },
        );
    } catch (err) {
        if (deductedMicrocredits > 0) {
            void refundFeatureCredits({
                scene: "config_script",
                model: effectiveModel,
                amountMicrocredits: deductedMicrocredits,
                note: "画布配置生成脚本失败退款",
            });
        }
        throw err;
    }

    if (controller.signal.aborted) {
        if (deductedMicrocredits > 0) {
            void refundFeatureCredits({
                scene: "config_script",
                model: effectiveModel,
                amountMicrocredits: deductedMicrocredits,
                note: "画布配置生成脚本取消退款",
            });
        }
        return;
    }

    const cleanScript = normalizeCreationAssistantScript(response, assetReferenceMap);

    setNodes((prev) =>
        prev.map((n) =>
            n.id === nodeId
                ? {
                      ...n,
                      metadata: {
                          ...n.metadata,
                          status: "success",
                          content: cleanScript,
                          prompt: cleanScript,
                          composerContent: cleanScript,
                          taskId,
                          taskStatus: "succeeded",
                          taskProgress: 100,
                          taskStage: "剧本生成完成",
                          configScript: {
                              ...meta,
                              model: effectiveModel,
                              status: "success",
                              businessScenario,
                              language,
                              scriptType,
                              shootingStyle,
                              durationSec,
                              primaryPlatform,
                              additionalNotes,
                              customRules,
                              prompt: cleanScript,
                              content: cleanScript,
                              result: {
                                  version: "config-script-result.v1",
                                  script: cleanScript,
                                  generatedAt: Date.now(),
                                  videoModel,
                                  segmentPlan,
                              },
                              updatedAt: Date.now(),
                          },
                      },
                  }
                : n,
        ),
    );

    task.status = "succeeded";
    task.progress = 100;
    task.stage = "剧本生成完成";
    bindGenerationTask(nodeId, task);
}

// ---------------------------------------------------------------------------
// 4. 参考生脚本实现
// ---------------------------------------------------------------------------
async function executeRefScript(execution: CanvasGenerationExecution) {
    const { nodeId, sourceNode, canvasNodes, canvasConnections, generationConfig, controller, setNodes, bindGenerationTask } = execution;
    const meta = (sourceNode?.metadata?.refScript || {}) as RefScriptMeta;

    // 寻找上游素材分析节点与视频反推节点
    const incomingEdges = canvasConnections.filter((c) => c.toNodeId === nodeId);
    const upstreamNodes = incomingEdges
        .map((e) => canvasNodes.find((n) => n.id === e.fromNodeId))
        .filter((n): n is CanvasNodeData => Boolean(n));

    const upstreamAnalysisNode = upstreamNodes.find((n) => n.type === CREATION_ASSISTANT_ANALYSIS_NODE_TYPE);
    const upstreamReverseNode = upstreamNodes.find((n) => n.type === VIDEO_REVERSE_NODE_TYPE);
    const reverseMeta = upstreamReverseNode?.metadata?.videoReverse as ReverseMeta | undefined;

    const mentionReferences = buildRefScriptMentionReferences(upstreamNodes, upstreamAnalysisNode);

    const analysisMeta = upstreamAnalysisNode?.metadata?.materialAnalysis as MaterialAnalysisMeta | undefined;
    const fileSummaries = analysisMeta?.result?.fileSummaries || [];
    const insightSections = analysisMeta?.result?.insightSections || [];

    const upstreamScriptInfo = resolveUpstreamReferenceScript(
        upstreamReverseNode,
        upstreamNodes.filter((n) => n.type === CanvasNodeType.Text),
        upstreamNodes.filter((n) => n.type === CanvasNodeType.Video),
    );

    let referenceScript = (
        meta.referenceScript ||
        upstreamScriptInfo.script ||
        ""
    ).trim();

    if (!referenceScript) {
        throw new Error("参考生脚本需要上游视频反推分镜或预设参考剧本");
    }

    const businessScenario = meta.businessScenario || "ecommerce";
    const language = meta.language || "zh";
    const reqText = (meta.userRequirement || meta.additionalNotes || "").trim();
    const additionalNotes = reqText;
    const customRules = meta.customRules || "";

    const durations = resolveCreationAssistantDurations({
        userRequirement: reqText,
        additionalNotes: reqText,
        customRules,
        metaDurationSec: meta.durationSec,
        metaRefDurationSec: meta.referenceScriptDurationSec,
        upstreamReverseMeta: reverseMeta as any,
        upstreamVideoDurationSec: upstreamReverseNode?.metadata?.durationMs
            ? Math.round(Number(upstreamReverseNode.metadata.durationMs) / 1000)
            : Number((upstreamReverseNode?.metadata as any)?.durationSec) || undefined,
        referenceScriptText: referenceScript,
        fallbackDurationSec: 30,
    });
    const durationSec = durations.targetDurationSec;
    const refDurationSec = durations.referenceDurationSec;

    const videoModel = meta.targetVideoModel || meta.videoModel || generationConfig.videoModel || resolveModelForCapability(generationConfig, generationConfig.model, "video");
    const maxDuration = resolveChannelVideoModelMaxDuration(generationConfig, videoModel);
    const segmentPlan = segmentCreationAssistantTimeline(durationSec, maxDuration);

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

    const effectiveNotes = (additionalNotes ? `${additionalNotes}\n` : "") + (customRules ? `【补充要求】\n${customRules}` : "");

    const promptBundle = buildReferenceScriptCreationAssistantPrompts({
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
        referenceScriptDurationSec: refDurationSec,
    });

    const { contentParts: classicContentParts } = await resolveMentionedContentPartsAsync({
        textPrompt: promptBundle.userPrompt,
        userRequirement: reqText,
        references: mentionReferences,
    });

    const effectiveModel = meta.model || generationConfig.textModel || generationConfig.model;
    let deductedMicrocredits = 0;
    try {
        const creditRes = await deductFeatureCredits({
            scene: "ref_script",
            model: effectiveModel,
            note: "画布参考生脚本任务",
        });
        deductedMicrocredits = creditRes.deductedMicrocredits;
    } catch (creditErr: any) {
        throw new Error(creditErr?.response?.data?.message || creditErr?.message || "参考生脚本积分扣减失败，余额不足");
    }

    const taskId = nanoid();
    const task = createMockGenerationTask({
        id: taskId,
        type: "ref_script",
        prompt: execution.prompt || "基于对标视频复刻生成剧本",
        progress: 20,
        stage: "正在融合对标视频节奏与商品卖点",
    });
    bindGenerationTask(nodeId, task);

    setNodes((prev) =>
        prev.map((n) =>
            n.id === nodeId
                ? {
                      ...n,
                      metadata: {
                          ...n.metadata,
                          status: "loading",
                          taskId,
                          taskStatus: "running",
                          taskProgress: 20,
                          taskStage: "正在融合对标视频节奏与商品卖点",
                      },
                  }
                : n,
        ),
    );

    const effectiveSystemPrompt = meta.useCustomPrompt && meta.customPrompt?.trim()
        ? meta.customPrompt.trim()
        : promptBundle.systemPrompt;

    let response: string;
    try {
        response = await requestImageQuestion(
            { ...generationConfig, model: effectiveModel, systemPrompt: effectiveSystemPrompt },
            [{ role: "user", content: classicContentParts }],
            () => undefined,
            { signal: controller.signal, temperature: 0.85, presence_penalty: 0.2 },
        );
    } catch (err) {
        if (deductedMicrocredits > 0) {
            void refundFeatureCredits({
                scene: "ref_script",
                model: effectiveModel,
                amountMicrocredits: deductedMicrocredits,
                note: "画布参考生脚本失败退款",
            });
        }
        throw err;
    }

    if (controller.signal.aborted) {
        if (deductedMicrocredits > 0) {
            void refundFeatureCredits({
                scene: "ref_script",
                model: effectiveModel,
                amountMicrocredits: deductedMicrocredits,
                note: "画布参考生脚本取消退款",
            });
        }
        return;
    }

    const cleanScript = normalizeCreationAssistantScript(response, assetReferenceMap);

    setNodes((prev) =>
        prev.map((n) =>
            n.id === nodeId
                ? {
                      ...n,
                      metadata: {
                          ...n.metadata,
                          status: "success",
                          content: cleanScript,
                          prompt: cleanScript,
                          composerContent: cleanScript,
                          taskId,
                          taskStatus: "succeeded",
                          taskProgress: 100,
                          taskStage: "复刻剧本生成完成",
                          refScript: {
                              ...meta,
                              model: effectiveModel,
                              status: "success",
                              businessScenario,
                              language,
                              durationSec,
                              referenceScriptDurationSec: refDurationSec,
                              referenceScript,
                              userRequirement: reqText,
                              additionalNotes: reqText,
                              customRules,
                              prompt: cleanScript,
                              content: cleanScript,
                              result: {
                                  version: "ref-script-result.v1",
                                  script: cleanScript,
                                  generatedAt: Date.now(),
                                  videoModel,
                                  segmentPlan,
                              },
                              updatedAt: Date.now(),
                          },
                      },
                  }
                : n,
        ),
    );

    task.status = "succeeded";
    task.progress = 100;
    task.stage = "复刻剧本生成完成";
    bindGenerationTask(nodeId, task);
}
