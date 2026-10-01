import { nanoid } from "nanoid";

import { createVideoGenerationTask, pollVideoGenerationTask, storeGeneratedVideo, type VideoGenerationTask } from "@/services/api/video";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import { formatSegmentTimeRange, type VideoCreationPlan, type VideoCreationSegment, type VideoSegmentHandoff, type VideoSegmentOutput } from "@/lib/video-segment-contract";

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

export function buildVideoSegmentPrompt(plan: VideoCreationPlan, segment: VideoCreationSegment) {
    const shotText = segment.shotBlockIds
        .map((blockId) => plan.shotBlocks.find((block) => block.blockId === blockId)?.text)
        .filter((text): text is string => Boolean(text))
        .join("\n");
    const mode = segment.mode === "initial" ? "从全局脚本的开场状态开始生成" : segment.mode === "independent" ? "独立生成本段，并执行连续性状态" : segment.mode === "tail_frame" ? "从上一段尾帧状态继续生成" : "调用已验证的模型原生续接能力继续生成";
    return [
        "【视频分段执行】",
        `这是完整视频的第 ${segment.index} 段，覆盖 ${formatSegmentTimeRange(segment.startSec, segment.endSec)}，本次模型请求时长为 ${segment.requestDurationSec} 秒，最终保留 ${segment.keepDurationSec} 秒。`,
        `执行方式：${mode}。`,
        `【完整脚本】\n${plan.scriptSnapshot}`,
        `【本段镜头内容】\n${shotText || "按本段时间范围执行完整脚本中的对应内容"}`,
        `【进入状态】\n${segment.continuityIn}`,
        `【结束状态】\n${segment.continuityOut}`,
        segment.index === plan.segments.length ? "本段覆盖完整视频结尾，按脚本风格自然完成最后约 2 秒的收束。" : "本段不得提前完成 CTA、结尾卡或行动引导，结束状态必须可被下一段承接。",
    ].join("\n\n");
}

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
        const result = await pollSegmentTask(requestConfig, task, input.signal);
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

async function pollSegmentTask(config: AiConfig, task: VideoGenerationTask, signal?: AbortSignal) {
    const delayMs = task.provider === "backend" ? 4000 : task.provider === "seedance" ? 5000 : 2500;
    // 轮询上限提升至 360 次（约 15~20 分钟），杜绝高负载与 GPU 排队提前误判超时
    for (let attempt = 0; attempt < 360; attempt += 1) {
        if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
        const state = await pollVideoGenerationTask(config, task, { signal });
        if (state.status === "completed") return state.result;
        if (state.status === "failed") throw new Error(state.error);
        await delay(delayMs, signal);
    }
    throw new Error("视频分段生成超时");
}

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
