// @opc-feature: hypit [start]
/**
 * 桌面端原生 FFmpeg 高性能抽帧适配器
 * 优先复用全局 tools/bin/ffmpeg.exe 算力，通过 Electron desktopBridge 执行原生抽帧算法
 * 运行在纯浏览器环境或本地执行失败时，平滑返回 null 以回退到浏览器 Canvas 抽帧
 */

import type { VideoFrameRecord, VideoSamplingPolicy, VideoSamplingPolicyInput, VideoTimelineFrameManifest } from "./types";
import { buildTimelineFrameManifest, formatTimecode, frameDifferenceScore, isTransitionGhost } from "./frame-sampler";

export type DesktopFFmpegCapabilities = {
    isDesktop: boolean;
    hasFFmpeg: boolean;
};

export function checkDesktopFFmpegAvailable(): boolean {
    const target = typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? (globalThis as any) : undefined;
    if (!target) return false;
    const bridge = (target as unknown as {
        desktopBridge?: {
            extractVideoFrames?: unknown;
            runFFmpeg?: unknown;
            runFFmpegJob?: unknown;
        };
    }).desktopBridge;
    return Boolean(bridge && (bridge.extractVideoFrames || bridge.runFFmpeg || bridge.runFFmpegJob));
}

export type NativeExtractFrameResult = {
    blob: Blob;
    timestampSec: number;
    url: string;
};

export type DesktopExtractedVideoResult = {
    sourceUrl: string;
    video?: HTMLVideoElement;
    durationSec: number;
    width: number;
    height: number;
    frames: VideoFrameRecord[];
    frameCount: number;
    samplingPolicy: VideoSamplingPolicy;
    requestedPolicy: VideoSamplingPolicyInput;
    requestedAgentPolicy?: Record<string, unknown>;
    agentFallbackReason?: string;
    timelineManifest: VideoTimelineFrameManifest;
    isDesktopNative: true;
    dispose: () => void;
};

/**
 * 通过桌面端 FFmpeg 原生极速批量抽取视频关键帧与场景切点
 * 耗时仅数百毫秒，彻底避免浏览器 DOM 软解卡死与 15 秒超时
 */
export async function extractFramesWithDesktopFFmpeg(
    source: Blob | File | string,
    options: {
        samplingPolicy: VideoSamplingPolicy;
        signal?: AbortSignal;
        onProgress?: (progress: { stage: "frames"; percent: number; message: string }) => void;
    },
): Promise<DesktopExtractedVideoResult | null> {
    if (!checkDesktopFFmpegAvailable()) return null;
    const target = typeof window !== "undefined" ? window : (globalThis as any);
    const desktopBridge = (target as unknown as {
        desktopBridge?: {
            extractVideoFrames?: (opts: {
                inputUrl?: string;
                inputBuffer?: Uint8Array;
                inputExtension?: string;
                mode?: string;
                fps?: number;
                includeMiddleFrames?: boolean;
                sceneThreshold?: number;
                minSceneGapSec?: number;
                maxFrames?: number;
                width?: number;
                quality?: number;
            }) => Promise<{
                success: boolean;
                error?: string;
                durationSec?: number;
                width?: number;
                height?: number;
                frames?: Array<{
                    index: number;
                    timestampSec: number;
                    frameType: VideoFrameRecord["frameType"];
                    source: string;
                    buffer: Uint8Array | ArrayBuffer | Buffer;
                    mimeType: string;
                    width: number;
                    height: number;
                    sharpnessScore?: number;
                    candidateIndex?: number;
                    shotIndex?: number;
                }>;
            }>;
        };
    }).desktopBridge;

    if (!desktopBridge?.extractVideoFrames) return null;

    try {
        if (options.signal?.aborted) return null;
        options.onProgress?.({
            stage: "frames",
            percent: 10,
            message: "正在提取视频画面...",
        });

        let inputUrl: string | undefined;
        let inputBuffer: Uint8Array | undefined;
        let inputExtension = "mp4";

        if (typeof source === "string" && /^https?:\/\//i.test(source)) {
            inputUrl = source;
        } else if (typeof source === "string" && /^file:\/\//i.test(source)) {
            inputUrl = source.replace(/^file:\/\/\/?/, "");
        } else if (source instanceof File && typeof (source as any).path === "string" && (source as any).path) {
            // Electron 桌面环境下本地文件直接携带物理磁盘路径，实现 0 内存读取直接传给 FFmpeg
            inputUrl = (source as any).path;
        } else if (source instanceof File) {
            inputExtension = source.name.split(".").pop() || "mp4";
            const buf = await source.arrayBuffer();
            inputBuffer = new Uint8Array(buf);
        } else if (source instanceof Blob) {
            const buf = await source.arrayBuffer();
            inputBuffer = new Uint8Array(buf);
        } else if (typeof source === "string") {
            const blob = await fetch(source).then((r) => r.blob());
            const buf = await blob.arrayBuffer();
            inputBuffer = new Uint8Array(buf);
        }

        if (options.signal?.aborted) return null;

        const policy = options.samplingPolicy;
        const abortPromise = new Promise<never>((_, reject) => {
            if (options.signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
            options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        });

        const res = await Promise.race([
            desktopBridge.extractVideoFrames({
                inputUrl,
                inputBuffer,
                inputExtension,
                mode: policy.mode,
                fps: policy.fps,
                includeMiddleFrames: policy.includeMiddleFrames,
                sceneThreshold: policy.sceneChangeThreshold,
                minSceneGapSec: policy.minSceneGapSec,
                maxFrames: policy.maxFrames,
                width: 960,
            }),
            abortPromise,
        ]);

        if (!res?.success || !res.frames || res.frames.length === 0) {
            console.warn("[desktop-ffmpeg-sampler] 本地 FFmpeg 返回失败或 0 帧，回退至浏览器:", res?.error);
            return null;
        }

        options.onProgress?.({
            stage: "frames",
            percent: 38,
            message: "正在进行画面特征比对与时间线组装...",
        });

        // 对 FFmpeg 抽取的原始帧序列执行特征比对与时间线组织
        const diffCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
        if (diffCanvas) {
            const isVert = (res.height || 720) > (res.width || 1280);
            diffCanvas.width = isVert ? 36 : 64;
            diffCanvas.height = isVert ? 64 : 36;
        }
        const diffCtx = diffCanvas?.getContext("2d") || null;

        let lastRetainedSig: Uint8ClampedArray | null = null;
        let lastRetainedTime = Number.NEGATIVE_INFINITY;
        const minChangeThreshold = 0.06;

        const filteredFrames: VideoFrameRecord[] = [];
        const createdUrls: string[] = [];

        for (let i = 0; i < res.frames.length; i++) {
            const f = res.frames[i];
            const rawBytes = f.buffer instanceof Uint8Array ? f.buffer : new Uint8Array(f.buffer as ArrayBuffer);
            const blob = new Blob([rawBytes.buffer as ArrayBuffer], { type: f.mimeType || "image/jpeg" });

            let shouldRetain = true;
            let currentSig: Uint8ClampedArray | null = null;

            // 在 deconstruct 创意反推模式下：
            // 底层 FFmpeg 原生后台已完成微观窗口三候选拉普拉斯方差清晰度选拔 (Var(∇²I)) 与黑白闪鬼影自愈清除，
            // 所有下发的帧均为黄金代表帧 (Clean In / Apex / Clean Out / Detail)，前端 100% 刚性保留，彻底省去浏览器二次软解开销；
            // 仅在非 deconstruct 模式 (如常规秒级/中点抽样) 时，按需对中点帧进行差异度去重。
            if (policy.mode !== "deconstruct") {
                if (diffCtx && diffCanvas && typeof createImageBitmap === "function") {
                    try {
                        const bitmap = await createImageBitmap(blob);
                        diffCtx.drawImage(bitmap, 0, 0, diffCanvas.width, diffCanvas.height);
                        bitmap.close();
                        currentSig = diffCtx.getImageData(0, 0, diffCanvas.width, diffCanvas.height).data;
                    } catch {}
                }

                const isFirst = filteredFrames.length === 0 || f.timestampSec === 0;
                const isLast = i === res.frames.length - 1;
                const isScene = f.frameType === "visual_change_frame";
                const isMidpoint = f.frameType === "timeline_midpoint";

                let isGhost = false;
                if (isScene && currentSig && currentSig.length > 0) {
                    isGhost = isTransitionGhost(currentSig);
                }
                if (isScene && isGhost && !isFirst && !isLast) {
                    shouldRetain = false;
                }

                if (isMidpoint && currentSig && lastRetainedSig) {
                    const diffScore = frameDifferenceScore(lastRetainedSig, currentSig);
                    if (diffScore < minChangeThreshold) {
                        shouldRetain = false;
                    }
                }
            }

            if (shouldRetain) {
                const url = URL.createObjectURL(blob);
                createdUrls.push(url);
                if (currentSig) {
                    lastRetainedSig = new Uint8ClampedArray(currentSig);
                }
                lastRetainedTime = f.timestampSec;
                const frameIndex = filteredFrames.length + 1;
                filteredFrames.push({
                    index: frameIndex,
                    frameId: `F${String(frameIndex).padStart(4, "0")}`,
                    gridLabel: `Grid ${frameIndex}`,
                    timestampSec: f.timestampSec,
                    seekTimestampSec: f.timestampSec,
                    timecode: formatTimecode(f.timestampSec),
                    frameType: f.frameType,
                    source: f.source || "ffmpeg.native",
                    sceneScore: f.sharpnessScore,
                    sharpnessScore: f.sharpnessScore,
                    blob,
                    url,
                    width: f.width || res.width || 1280,
                    height: f.height || res.height || 720,
                });
            }
        }

        // 如果全部过滤掉（极罕见），至少保留首帧
        if (filteredFrames.length === 0 && res.frames.length > 0) {
            const f = res.frames[0];
            const rawBytes = f.buffer instanceof Uint8Array ? f.buffer : new Uint8Array(f.buffer as ArrayBuffer);
            const blob = new Blob([rawBytes.buffer as ArrayBuffer], { type: f.mimeType || "image/jpeg" });
            const url = URL.createObjectURL(blob);
            createdUrls.push(url);
            filteredFrames.push({
                index: 1,
                frameId: "F0001",
                gridLabel: "Grid 1",
                timestampSec: f.timestampSec,
                seekTimestampSec: f.timestampSec,
                timecode: formatTimecode(f.timestampSec),
                frameType: f.frameType,
                source: f.source || "ffmpeg.native",
                blob,
                url,
                width: f.width || res.width || 1280,
                height: f.height || res.height || 720,
            });
        }

        // 全局严格按真实时间戳正向升序排序，并连续重排序号，杜绝并发抽取引起的拼图时序乱序
        filteredFrames.sort((a, b) => a.timestampSec - b.timestampSec);
        filteredFrames.forEach((frame, idx) => {
            frame.index = idx + 1;
            frame.frameId = `F${String(idx + 1).padStart(4, "0")}`;
            frame.gridLabel = `Grid ${idx + 1}`;
        });

        const frames = filteredFrames;

        if (options.signal?.aborted) {
            createdUrls.forEach((u) => URL.revokeObjectURL(u));
            return null;
        }

        const durationSec = res.durationSec || (frames.length > 0 ? frames[frames.length - 1].timestampSec : 0);
        const width = res.width || (frames.length > 0 ? frames[0].width : 1280);
        const height = res.height || (frames.length > 0 ? frames[0].height : 720);

        const timelineManifest = buildTimelineFrameManifest(
            frames,
            durationSec,
            policy.fps,
            typeof source === "string" ? source : "",
            [],
            policy.mode,
        );

        return {
            sourceUrl: typeof source === "string" ? source : "",
            durationSec,
            width,
            height,
            frames,
            frameCount: frames.length,
            samplingPolicy: policy,
            requestedPolicy: policy,
            timelineManifest,
            isDesktopNative: true,
            dispose: () => {
                createdUrls.forEach((u) => URL.revokeObjectURL(u));
            },
        };
    } catch (e) {
        console.warn("[desktop-ffmpeg-sampler] 原生抽帧调用异常，平滑降级到浏览器 Canvas:", e);
        return null;
    }
}

/**
 * 通过桌面端 FFmpeg 提取指定时间戳单帧（保留向后兼容）
 */
export async function extractSingleFrameWithNativeFFmpeg(
    sourceUrlOrBlob: string | Blob,
    timestampSec: number,
    options: {
        width?: number;
        quality?: number;
        signal?: AbortSignal;
    } = {},
): Promise<Blob | null> {
    if (!checkDesktopFFmpegAvailable()) return null;
    const target = typeof window !== "undefined" ? window : (globalThis as any);
    const desktopBridge = (target as unknown as {
        desktopBridge: {
            runFFmpegJob?: (opts: {
                inputUrl?: string;
                inputBuffer?: Uint8Array;
                inputExtension?: string;
                args: string[];
                outputExtension?: string;
                mimeType?: string;
            }) => Promise<{ success: boolean; outputBlob?: Blob; error?: string }>;
        };
    }).desktopBridge;

    if (!desktopBridge?.runFFmpegJob) return null;

    try {
        let inputUrl: string | undefined;
        let inputBuffer: Uint8Array | undefined;

        if (typeof sourceUrlOrBlob === "string" && /^https?:\/\//i.test(sourceUrlOrBlob)) {
            inputUrl = sourceUrlOrBlob;
        } else {
            const blob = typeof sourceUrlOrBlob === "string" ? await fetch(sourceUrlOrBlob).then((r) => r.blob()) : sourceUrlOrBlob;
            const buf = await blob.arrayBuffer();
            inputBuffer = new Uint8Array(buf);
        }

        const seekSec = Math.max(0, timestampSec).toFixed(3);
        const scaleFilter = options.width ? `scale=${options.width}:-1` : "scale=640:-1";
        const args = [
            "-ss", seekSec,
            "-i", "INPUT_PLACEHOLDER",
            "-vframes", "1",
            "-vf", scaleFilter,
            "-q:v", "3",
            "OUTPUT_PLACEHOLDER",
        ];

        const result = await desktopBridge.runFFmpegJob({
            inputUrl,
            inputBuffer,
            inputExtension: "mp4",
            args,
            outputExtension: "jpg",
            mimeType: "image/jpeg",
        });

        if (result?.success && result.outputBlob) {
            return result.outputBlob;
        }
        return null;
    } catch (e) {
        console.warn("[desktop-ffmpeg-sampler] 本地 FFmpeg 抽帧执行失败，将降级到浏览器 Canvas:", e);
        return null;
    }
}

/**
 * 通过桌面端 FFmpeg 原生提取 16kHz 单声道 WAV 音频（供 FunASR 及音画对齐使用）
 * 彻底避免浏览器 Web Audio API 50MB 尺寸限制与软解卡死
 */
export async function extractAudioWithDesktopFFmpeg(
    source: Blob | File | string,
    options: { signal?: AbortSignal } = {},
): Promise<Blob | null> {
    if (!checkDesktopFFmpegAvailable()) return null;
    const target = typeof window !== "undefined" ? window : (globalThis as any);
    const desktopBridge = (target as unknown as {
        desktopBridge?: {
            runFFmpegJob?: (opts: {
                inputUrl?: string;
                inputBuffer?: Uint8Array;
                inputExtension?: string;
                args: string[];
                outputExtension?: string;
                mimeType?: string;
            }) => Promise<{ success: boolean; outputBlob?: Blob; error?: string }>;
        };
    }).desktopBridge;

    if (!desktopBridge?.runFFmpegJob) return null;

    try {
        if (options.signal?.aborted) return null;

        let inputUrl: string | undefined;
        let inputBuffer: Uint8Array | undefined;
        let inputExtension = "mp4";

        if (typeof source === "string" && /^https?:\/\//i.test(source)) {
            inputUrl = source;
        } else if (typeof source === "string" && /^file:\/\//i.test(source)) {
            inputUrl = source.replace(/^file:\/\/\/?/, "");
        } else if (source instanceof File && typeof (source as any).path === "string" && (source as any).path) {
            inputUrl = (source as any).path;
        } else if (source instanceof File) {
            inputExtension = source.name.split(".").pop() || "mp4";
            const buf = await source.arrayBuffer();
            inputBuffer = new Uint8Array(buf);
        } else if (source instanceof Blob) {
            const buf = await source.arrayBuffer();
            inputBuffer = new Uint8Array(buf);
        } else if (typeof source === "string") {
            const blob = await fetch(source).then((r) => r.blob());
            const buf = await blob.arrayBuffer();
            inputBuffer = new Uint8Array(buf);
        }

        if (options.signal?.aborted) return null;

        const args = [
            "-vn",
            "-acodec", "libmp3lame",
            "-b:a", "64k",
            "-ar", "16000",
            "-ac", "1",
            "OUTPUT_PLACEHOLDER",
        ];

        const result = await desktopBridge.runFFmpegJob({
            inputUrl,
            inputBuffer,
            inputExtension,
            args,
            outputExtension: "mp3",
            mimeType: "audio/mp3",
        });

        if (options.signal?.aborted) return null;

        if (result?.success && result.outputBlob) {
            return result.outputBlob;
        }
        return null;
    } catch (e) {
        console.warn("[desktop-ffmpeg-sampler] 原生音频提取异常，降级到浏览器 Web Audio:", e);
        return null;
    }
}
// @opc-feature: hypit [end]
