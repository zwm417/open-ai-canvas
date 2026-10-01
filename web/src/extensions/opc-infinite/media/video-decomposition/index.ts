import { buildContactSheets } from "./contact-sheet-builder";
import {
    clampSheetCount,
    extractVideoAudio as extractVideoAudioFallback,
    extractVideoFrames as extractVideoFramesFallback,
    normalizeVideoSamplingPolicy,
    DEFAULT_VIDEO_SAMPLING_POLICY,
    VIDEO_DECOMPOSITION_ENGINE_VERSION,
} from "./frame-sampler";
import {
    checkDesktopFFmpegAvailable,
    extractAudioWithDesktopFFmpeg,
    extractFramesWithDesktopFFmpeg,
} from "./desktop-ffmpeg-sampler";
import type { VideoDecompositionOptions, VideoDecompositionResult, VideoSamplingPolicyInput } from "./types";

export type { VideoContactSheet, VideoDecompositionManifestFrame, VideoDecompositionOptions, VideoDecompositionResult, VideoFrameRecord, VideoFrameType, VideoSamplingMode, VideoSamplingPolicy, VideoSamplingPolicyInput, VideoTimelineFrameManifest } from "./types";
export { buildContactSheets, resolveContactSheetColumns, resolveContactSheetPageSizes } from "./contact-sheet-builder";
export { buildCapturePlans, buildTimelineFrameManifest, clampFrameCount, clampSheetCount, compareFrameTimestampOrder, computeColorHistogram, computeLaplacianSharpness, DEFAULT_VIDEO_SAMPLING_POLICY, evaluateDeconstructBudget, extractResourceStorageKey, formatTimecode, frameDifferenceScore, histogramIntersection, isTransitionGhost, normalizeSceneChangeThreshold, normalizeVideoSamplingPolicy, resolveAgentSamplingPolicy, sampleMiddleTimestampsAtFps, sampleTimestamps, sampleTimestampsAtFps, sanitizeAgentPolicyJson, summarizeAgentPolicy, timelineSeekSecond, VIDEO_DECOMPOSITION_ENGINE_VERSION } from "./frame-sampler";
export { checkDesktopFFmpegAvailable, extractAudioWithDesktopFFmpeg, extractFramesWithDesktopFFmpeg };

/**
 * 视频抽帧统一入口：优先调用桌面端本地 FFmpeg，不可用或失败时自动平滑回退到浏览器 Canvas
 */
export async function extractVideoFrames(input: Blob | File | string, options: VideoDecompositionOptions = {}) {
    if (checkDesktopFFmpegAvailable()) {
        try {
            const samplingPolicy = normalizeVideoSamplingPolicy(options.samplingPolicy || {
                mode: options.samplingMode,
                fps: options.fps,
                includeMiddleFrames: options.includeMiddleFrames,
                sceneChangeThreshold: options.sceneChangeThreshold ?? (options as { sceneThreshold?: number }).sceneThreshold,
                minSceneGapSec: options.minSceneGapSec,
                maxFrames: options.maxFrames,
            });
            const res = await extractFramesWithDesktopFFmpeg(input, {
                samplingPolicy,
                signal: options.signal,
            });
            if (res && res.frames && res.frames.length > 0) {
                return res;
            }
        } catch (e) {
            console.warn("[extractVideoFrames] 桌面原生抽帧异常，回退至浏览器 Canvas:", e);
        }
    }
    return extractVideoFramesFallback(input, options);
}

/**
 * 视频音频提取统一入口：优先调用桌面端本地 FFmpeg，不可用或失败时自动平滑回退到浏览器 Web Audio
 */
export async function extractVideoAudio(input: Blob | File | string, options: { signal?: AbortSignal; sourceDurationSec?: number } = {}) {
    if (checkDesktopFFmpegAvailable()) {
        try {
            const nativeAudio = await extractAudioWithDesktopFFmpeg(input, options);
            if (nativeAudio) {
                return {
                    blob: nativeAudio,
                    durationSec: options.sourceDurationSec || 0,
                    truncated: false,
                };
            }
        } catch (e) {
            console.warn("[extractVideoAudio] 桌面原生音频提取异常，回退至 Web Audio:", e);
        }
    }
    return extractVideoAudioFallback(input, options);
}

export async function decomposeVideo(input: Blob | File | string, options: VideoDecompositionOptions = {}): Promise<VideoDecompositionResult> {
    const extracted = await extractVideoFrames(input, options);
    try {
        const sheetCount = clampSheetCount(options.sheetCount, extracted.frameCount);
        const hasExplicitSamplingPolicy = Boolean(options.samplingPolicy || options.agentPolicy !== undefined || options.samplingMode);
        const agentPolicyActive = options.agentPolicy !== undefined || options.samplingMode === "agent" || options.samplingPolicy?.mode === "agent" || options.samplingPolicy?.samplingMode === "agent";
        const requestedMaxFramesPerSheet = agentPolicyActive ? extracted.samplingPolicy.maxFramesPerSheet : options.maxFramesPerSheet ?? options.samplingPolicy?.maxFramesPerSheet ?? (hasExplicitSamplingPolicy ? extracted.samplingPolicy.maxFramesPerSheet : undefined);
        const built = await buildContactSheets(extracted.frames, sheetCount, { ...options, ...(requestedMaxFramesPerSheet === undefined ? {} : { maxFramesPerSheet: requestedMaxFramesPerSheet }) });
        return {
            durationSec: extracted.durationSec,
            sourceWidth: extracted.width,
            sourceHeight: extracted.height,
            frameCount: extracted.frameCount,
            sheetCount: built.sheets.length,
            frames: extracted.frames,
            sheets: built.sheets,
            manifest: {
                schema_version: "infinite-canvas.video_decomposition.v1",
                strategy: extracted.samplingPolicy.mode,
                engine_version: VIDEO_DECOMPOSITION_ENGINE_VERSION,
                evidence_method: extracted.samplingPolicy.mode === "scene" ? "browser_visual_difference" : extracted.samplingPolicy.mode === "seconds_and_scene" ? "browser_explicit_time_seek+browser_visual_difference" : "browser_explicit_time_seek",
                requested_policy: extracted.requestedPolicy as VideoSamplingPolicyInput,
                ...(extracted.requestedAgentPolicy ? { requested_agent_policy: extracted.requestedAgentPolicy as Record<string, unknown> } : {}),
                effective_policy: extracted.samplingPolicy,
                ...(extracted.agentFallbackReason ? { agent_fallback_reason: extracted.agentFallbackReason } : {}),
                fps: extracted.samplingPolicy.fps,
                duration_sec: extracted.durationSec,
                frame_count: extracted.frameCount,
                sheet_count: built.sheets.length,
                columns: built.columns,
                timeline_frame_manifest: extracted.timelineManifest,
                frames: built.manifestFrames,
            },
        };
    } catch (error) {
        extracted.frames.forEach((frame) => URL.revokeObjectURL(frame.url));
        throw error;
    } finally {
        extracted.dispose();
    }
}

export function revokeVideoDecomposition(result: Pick<VideoDecompositionResult, "frames" | "sheets">) {
    result.frames.forEach((frame) => URL.revokeObjectURL(frame.url));
    result.sheets.forEach((sheet) => URL.revokeObjectURL(sheet.url));
}
