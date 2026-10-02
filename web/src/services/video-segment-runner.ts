import { nanoid } from "nanoid";

import { createVideoGenerationTask, pollVideoGenerationTask, storeGeneratedVideo, type VideoGenerationTask } from "@/services/api/video";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import { extractProportionalScriptSlice, extractSharedScriptHeader, formatSegmentTimeRange, type VideoCreationPlan, type VideoCreationSegment, type VideoSegmentHandoff, type VideoSegmentOutput } from "@/lib/video-segment-contract";

export type VideoSegmentRunnerProgress = {
    batchId: string;
    segment: VideoCreationSegment;
    status: "queued" | "running" | "success" | "failed";
    completedCount: number;
    totalCount: number;
    message: string;
};

export type VideoSegmentRunnerOutput = {
    batchId: string;
    segment: VideoCreationSegment;
    output: VideoSegmentOutput;
    outputs: VideoSegmentOutput[];
};

export type VideoSegmentTaskCheckpoint = {
    segmentId: string;
    task?: VideoGenerationTask;
    status: "pending" | "running" | "success" | "failed";
    error?: string;
};

export type VideoSegmentRunnerTaskEvent = {
    batchId: string;
    segment: VideoCreationSegment;
    task?: VideoGenerationTask;
    status: VideoSegmentTaskCheckpoint["status"];
    error?: string;
};

export type VideoSegmentBatchResult = {
    batchId: string;
    status: "completed" | "failed" | "cancelled";
    outputs: VideoSegmentOutput[];
    handoff: VideoSegmentHandoff;
    failedSegmentId?: string;
    error?: string;
};

export type VideoSegmentRunnerInput = {
    plan: VideoCreationPlan;
    config: AiConfig;
    batchId?: string;
    references?: ReferenceImage[];
    videoReferences?: ReferenceVideo[];
    audioReferences?: ReferenceAudio[];
    resume?: {
        tasks?: ReadonlyArray<VideoSegmentTaskCheckpoint>;
        outputs?: ReadonlyArray<VideoSegmentOutput>;
    };
    onProgress?: (progress: VideoSegmentRunnerProgress) => void;
    onTask?: (event: VideoSegmentRunnerTaskEvent) => void | Promise<void>;
    onOutput?: (output: VideoSegmentRunnerOutput) => void | Promise<void>;
    signal?: AbortSignal;
};

// @opc-feature: concurrent-video-segment-runner [start]
export async function runVideoSegmentBatch(input: VideoSegmentRunnerInput): Promise<VideoSegmentBatchResult> {
    const batchId = input.batchId || nanoid();
    const references = input.references || [];
    const videoReferences = input.videoReferences || [];
    const audioReferences = input.audioReferences || [];
    const resumedTasks = new Map((input.resume?.tasks || []).map((item) => [item.segmentId, item]));
    const resumedOutputs = new Map((input.resume?.outputs || []).map((item) => [item.segmentId, item]));

    const outputMap = new Map<string, VideoSegmentOutput>();

    // 1. 恢复已完成的分段产物
    for (const segment of input.plan.segments) {
        const resumedOutput = resumedOutputs.get(segment.segmentId);
        if (resumedOutput) {
            outputMap.set(segment.segmentId, resumedOutput);
            await input.onTask?.({ batchId, segment, task: resumedTasks.get(segment.segmentId)?.task, status: "success" });
        }
    }

    const currentSortedOutputs = () =>
        input.plan.segments
            .map((s) => outputMap.get(s.segmentId))
            .filter((o): o is VideoSegmentOutput => Boolean(o));

    if (outputMap.size > 0) {
        input.onProgress?.({
            batchId,
            segment: input.plan.segments[0],
            status: "success",
            completedCount: outputMap.size,
            totalCount: input.plan.segments.length,
            message: `已恢复 ${outputMap.size}/${input.plan.segments.length} 段已完成产物`,
        });
    }

    const pendingSegments = input.plan.segments.filter((s) => !outputMap.has(s.segmentId));
    if (pendingSegments.length === 0) {
        return buildBatchResult(input.plan, batchId, currentSortedOutputs(), "completed");
    }

    if (input.signal?.aborted) {
        return buildBatchResult(input.plan, batchId, currentSortedOutputs(), "cancelled", undefined, "视频分段生成已中断或已取消");
    }

    // 2. 并发调度发起所有待生成的独立分段（不等待前段完成）
    let firstFailedSegmentId: string | undefined;
    let firstErrorMessage: string | undefined;

    const segmentPromises = pendingSegments.map(async (segment) => {
        if (input.signal?.aborted) return;
        input.onProgress?.({
            batchId,
            segment,
            status: "queued",
            completedCount: outputMap.size,
            totalCount: input.plan.segments.length,
            message: `并发调度：发起第 ${segment.index}/${input.plan.segments.length} 段生成`,
        });
        const checkpoint = resumedTasks.get(segment.segmentId);
        try {
            const output = await runVideoSegment(
                { ...input, batchId, segment, references, videoReferences, audioReferences },
                checkpoint?.status === "failed" ? undefined : checkpoint?.task,
            );
            outputMap.set(segment.segmentId, output);
            const sortedOutputs = currentSortedOutputs();
            await input.onOutput?.({ batchId, segment, output, outputs: sortedOutputs });
            input.onProgress?.({
                batchId,
                segment,
                status: "success",
                completedCount: outputMap.size,
                totalCount: input.plan.segments.length,
                message: `第 ${segment.index}/${input.plan.segments.length} 段生成完成`,
            });
        } catch (error) {
            if (input.signal?.aborted) return;
            const message = error instanceof Error ? error.message : "视频分段生成失败";
            if (!firstFailedSegmentId) {
                firstFailedSegmentId = segment.segmentId;
                firstErrorMessage = message;
            }
            input.onProgress?.({
                batchId,
                segment,
                status: "failed",
                completedCount: outputMap.size,
                totalCount: input.plan.segments.length,
                message: `第 ${segment.index} 段失败: ${message}`,
            });
        }
    });

    await Promise.all(segmentPromises);

    const finalOutputs = currentSortedOutputs();
    if (input.signal?.aborted) {
        return buildBatchResult(input.plan, batchId, finalOutputs, "cancelled", undefined, "视频分段生成已中断或已取消");
    }

    if (finalOutputs.length === input.plan.segments.length) {
        return buildBatchResult(input.plan, batchId, finalOutputs, "completed");
    }

    return buildBatchResult(
        input.plan,
        batchId,
        finalOutputs,
        "failed",
        firstFailedSegmentId,
        firstErrorMessage || "部分分段生成未完成",
    );
}
// @opc-feature: concurrent-video-segment-runner [end]

// @opc-feature: isolated-segment-prompt [start]
export function buildVideoSegmentPrompt(plan: VideoCreationPlan, segment: VideoCreationSegment) {
    const shotText = segment.shotBlockIds
        .map((blockId) => plan.shotBlocks.find((block) => block.blockId === blockId)?.text)
        .filter((text): text is string => Boolean(text))
        .join("\n");

    const sharedHeader = extractSharedScriptHeader(plan.scriptSnapshot);
    const segmentContent = shotText || extractProportionalScriptSlice(plan.scriptSnapshot, segment.index, plan.segments.length);

    const parts: string[] = [];
    if (sharedHeader) {
        parts.push(sharedHeader);
    }

    const modeDesc = segment.mode === "initial"
        ? "开场段：从初始静态或基准画面起幅"
        : segment.mode === "tail_frame"
            ? "承接段：从上一段尾帧动作与画面承接"
            : "独立段：保持人物与场景设定一致，独立生成";

    parts.push([
        `【当前执行分段：第 ${segment.index} 段 / 共 ${plan.segments.length} 段】(${formatSegmentTimeRange(segment.startSec, segment.endSec)})`,
        `【执行规格】模型请求时长 ${segment.requestDurationSec} 秒，最终保留剪辑 ${segment.keepDurationSec} 秒。${modeDesc}`,
        `【本段镜头动作】\n${segmentContent}`,
        `【起幅状态】\n${segment.continuityIn || "保持主体与光影自然建立"}`,
        `【落幅状态】\n${segment.continuityOut || "动作与运镜保持张力，为下段或成片收束留出过渡"}`,
        segment.index === plan.segments.length
            ? "【收束要求】本段覆盖完整视频结尾，请自然完成最后约 2 秒的情绪与视觉收束。"
            : "【连续性禁令】本段为中间过渡段，严禁提前完成结局、CTA（行动号召）或结尾卡，落幅画面必须保持动态以便下一段承接。",
    ].join("\n\n"));

    return parts.join("\n\n");
}
// @opc-feature: isolated-segment-prompt [end]

async function runVideoSegment(input: VideoSegmentRunnerInput & { batchId: string; segment: VideoCreationSegment; references: ReferenceImage[]; videoReferences: ReferenceVideo[]; audioReferences: ReferenceAudio[] }, existingTask?: VideoGenerationTask) {
    if (input.segment.mode === "native_continuation" || input.segment.mode === "tail_frame") {
        throw new Error("当前视频模型尚未验证分段续接能力");
    }
    const requestConfig: AiConfig = {
        ...input.config,
        model: input.plan.model,
        videoModel: input.plan.model,
        size: input.plan.aspectRatio,
        vquality: input.plan.resolution,
        videoSeconds: String(input.segment.requestDurationSec),
    };
    const prompt = buildVideoSegmentPrompt(input.plan, input.segment);
    let task = existingTask;
    try {
        task = task || await createVideoGenerationTask(requestConfig, prompt, input.references, input.videoReferences, input.audioReferences, { signal: input.signal });
        await input.onTask?.({ batchId: input.batchId, segment: input.segment, task, status: "running" });
        const result = await pollSegmentTask(requestConfig, task, input.signal, Boolean(existingTask));
        const stored = await storeGeneratedVideo(result);
        const output = {
            segmentId: input.segment.segmentId,
            index: input.segment.index,
            startSec: input.segment.startSec,
            endSec: input.segment.endSec,
            keepDurationSec: input.segment.keepDurationSec,
            storageKey: stored.storageKey,
            url: stored.url,
            width: stored.width,
            height: stored.height,
            durationMs: stored.durationMs,
        } satisfies VideoSegmentOutput;
        await input.onTask?.({ batchId: input.batchId, segment: input.segment, task, status: "success" });
        return output;
    } catch (error) {
        if (task) await input.onTask?.({ batchId: input.batchId, segment: input.segment, task, status: input.signal?.aborted ? "pending" : "failed", ...(input.signal?.aborted ? {} : { error: error instanceof Error ? error.message : "视频分段生成失败" }) });
        throw error;
    }
}

// @opc-feature: tiered-video-polling [start]
export const VIDEO_SEGMENT_HARD_TIMEOUT_MS = 60 * 60 * 1000; // 60 分钟硬守护上限
export const VIDEO_SEGMENT_SOFT_TIMEOUT_MS = 15 * 60 * 1000; // 15 分钟软超时托管线

export function getTieredPollingIntervalMs(elapsedMs: number): number {
    if (elapsedMs < 60_000) {
        // 前 1 分钟免探静默期：直接计算距离第 1 分钟的剩余等待毫秒数
        return Math.max(1000, 60_000 - elapsedMs);
    }
    if (elapsedMs < 180_000) {
        // 1~3 分钟：第一阶段探测，15~20 秒探测一次（采用 18 秒）
        return 18_000;
    }
    if (elapsedMs < 900_000) {
        // 3~15 分钟：第二阶段探测（出片高峰期），10~15 秒探测一次（采用 12 秒）
        return 12_000;
    }
    // 15 分钟以后：长尾低频托管期，30~60 秒探测一次（采用 30 秒）
    return 30_000;
}

async function pollSegmentTask(config: AiConfig, task: VideoGenerationTask, signal?: AbortSignal, isResumed = false) {
    const startTime = Date.now();
    const isLongRunning = task.provider !== "agnes";
    // 首次探测前：新创建长任务前 1 分钟免探静默，不发起任何 HTTP 请求；快速本地预览（agnes）不等待 60s
    if (!isResumed && isLongRunning) {
        await delay(60_000, signal);
    }

    const timeoutLimit = isLongRunning ? VIDEO_SEGMENT_HARD_TIMEOUT_MS : 5 * 60 * 1000;
    while (Date.now() - startTime < timeoutLimit) {
        if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
        const state = await pollVideoGenerationTask(config, task, { signal });
        if (state.status === "completed") return state.result;
        if (state.status === "failed") throw new Error(state.error || "视频分段上游生成失败");

        if (!isLongRunning) {
            await delay(1500, signal);
            continue;
        }

        const elapsed = (isResumed ? 60_000 : 0) + (Date.now() - startTime);
        const nextInterval = getTieredPollingIntervalMs(elapsed);
        await delay(nextInterval, signal);
    }
    throw new Error(isLongRunning ? "视频分段生成超时（已达 60 分钟最长守护上限）" : "视频分段生成超时");
}
// @opc-feature: tiered-video-polling [end]

function buildBatchResult(plan: VideoCreationPlan, batchId: string, outputs: VideoSegmentOutput[], status: VideoSegmentBatchResult["status"], failedSegmentId?: string, error?: string): VideoSegmentBatchResult {
    return {
        batchId,
        status,
        outputs,
        handoff: {
            batchId,
            schemaVersion: "video-segment-handoff-v1",
            targetDurationSec: plan.targetDurationSec,
            aspectRatio: plan.aspectRatio,
            resolution: plan.resolution,
            segments: outputs,
        },
        ...(failedSegmentId ? { failedSegmentId } : {}),
        ...(error ? { error } : {}),
    };
}

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("The operation was aborted", "AbortError"));
            return;
        }
        const timer = globalThis.setTimeout(resolve, ms);
        signal?.addEventListener("abort", () => {
            globalThis.clearTimeout(timer);
            reject(new DOMException("The operation was aborted", "AbortError"));
        }, { once: true });
    });
}
