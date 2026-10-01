import type { VideoDecompositionOptions, VideoFrameRecord, VideoSamplingMode, VideoSamplingPolicy, VideoSamplingPolicyInput, VideoTimelineFrameManifest } from "./types";
import { getCachedResourceBlob, primeResourceBlobCache } from "@/services/resource-blob-cache";

export const VIDEO_DECOMPOSITION_ENGINE_VERSION = "browser-evidence-v1";

export const DEFAULT_VIDEO_SAMPLING_POLICY: VideoSamplingPolicy = {
    mode: "seconds_and_scene",
    fps: 1,
    includeMiddleFrames: true,
    sceneChangeThreshold: 0.20,
    minSceneGapSec: 0.3,
    maxFrames: 500,
    maxFramesPerSheet: 12,
    source: "default",
};

/**
 * 针对 <= 60 秒的影视短剧与短视频，正向评估物理分镜与画格预算
 * 依据影视剪辑规律（快切 0.25s~1.2s，常规分镜 1.5s ~ 3.5s）动态推导分镜上限与画格容量，
 * 全面容纳镜头内分级生成机制（Clean In 起幅、Apex 动势、Clean Out 落幅及长镜头多点细节演变），
 * 正向满足 4~6 张抽帧拼图 (约 48~96 帧) 的高密度细节与快切表达需求。
 */
export function evaluateDeconstructBudget(durationSec: number) {
    const safeDuration = Math.max(0.5, Math.min(60, Number(durationSec) || 0));
    // 基础分镜预算：正向覆盖高节奏快切蒙太奇与常规分镜，上限放宽至 40 个分镜
    const maxShots = Math.min(40, Math.max(3, Math.ceil(safeDuration / 1.3)));
    // 总画格预算上限：全面匹配镜头内分级演变机制 (Clean In + Apex + 多点画面细节补充 + Clean Out)，
    // 动态容量按 ~1.5 帧/秒 + 10 帧基础容量正向供给，上限充裕放宽至 96 帧 (对应 12/16 格拼图约 5~8 张)，
    // 确保长镜头的细节帧不被预算强行修剪。
    const dynamicTargetFrames = Math.round(safeDuration * 1.5) + 10;
    const maxFrames = Math.min(96, Math.max(8, dynamicTargetFrames));
    // 镜头间最小时间间隔：基于时长动态微调 (0.2s ~ 0.25s)，精准捕获快切蒙太奇，同时杜绝单帧撕裂
    const minSceneGapSec = safeDuration < 10 ? 0.2 : 0.25;
    return {
        durationSec: safeDuration,
        maxShots,
        maxFrames,
        minSceneGapSec,
        sceneThreshold: 0.20,
    };
}

let activeDecodeLock: Promise<void> = Promise.resolve();

/**
 * 全局解码会话排队锁：串行化浏览器 GPU 硬件解码管线，彻底根除双画布并发抽帧导致的死锁、丢帧与 5% 挂起
 * 内置看门狗自愈与超时抢占，防止由于前序任务异常挂起导致后续任务永久死锁
 */
export async function withVideoDecodeLock<T>(action: () => Promise<T>, timeoutMs = 25000): Promise<T> {
    const previous = activeDecodeLock;
    let releaseLock: () => void = () => {};
    activeDecodeLock = new Promise<void>((resolve) => {
        releaseLock = resolve;
    });

    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    const lockWatchdog = new Promise<void>((resolve) => {
        timeoutTimer = setTimeout(resolve, timeoutMs);
    });

    try {
        await Promise.race([previous, lockWatchdog]);
    } finally {
        if (timeoutTimer) clearTimeout(timeoutTimer);
    }

    try {
        return await action();
    } finally {
        releaseLock();
    }
}

type SamplingOptions = VideoDecompositionOptions | VideoSamplingPolicyInput;

export function normalizeVideoSamplingPolicy(options: SamplingOptions = {}, fallback: VideoSamplingPolicy = DEFAULT_VIDEO_SAMPLING_POLICY): VideoSamplingPolicy {
    const value = options as VideoDecompositionOptions & VideoSamplingPolicyInput;
    const nested = value.samplingPolicy || {};
    const explicitMode = value.samplingMode ?? nested.samplingMode ?? nested.mode ?? value.mode;
    const nestedHasSamplingFields = Object.keys(nested).some((key) => key !== "maxFrames" && key !== "maxFramesPerSheet");
    const hasLegacyFields = value.fps !== undefined || value.includeMiddleFrames !== undefined || value.detectSceneChanges !== undefined || value.sceneChangeThreshold !== undefined;
    const source = explicitMode || nestedHasSamplingFields ? "user" : hasLegacyFields ? "legacy" : fallback.source;
    const requestedMode = explicitMode || (hasLegacyFields ? (value.detectSceneChanges === true ? "seconds_and_scene" : "seconds") : fallback.mode);
    const safeMode = requestedMode === "seconds" || requestedMode === "scene" || requestedMode === "seconds_and_scene" || requestedMode === "agent" || requestedMode === "deconstruct" ? requestedMode : fallback.mode;
    const mode = safeMode === "agent" ? (fallback.mode === "agent" ? DEFAULT_VIDEO_SAMPLING_POLICY.mode : fallback.mode) : safeMode;
    const includeMiddleFrames = nested.includeMiddleFrames ?? value.includeMiddleFrames ?? (hasLegacyFields ? false : fallback.includeMiddleFrames);
    return {
        mode,
        fps: clampNumber(nested.fps ?? value.fps ?? fallback.fps, 0.1, 10),
        includeMiddleFrames,
        sceneChangeThreshold: clampNumber(nested.sceneChangeThreshold ?? value.sceneChangeThreshold ?? fallback.sceneChangeThreshold, 0, 1),
        minSceneGapSec: clampNumber(nested.minSceneGapSec ?? value.minSceneGapSec ?? fallback.minSceneGapSec, 0, 60),
        maxFrames: clampInteger(nested.maxFrames ?? value.maxFrames ?? fallback.maxFrames, 1, 500),
        maxFramesPerSheet: clampInteger(nested.maxFramesPerSheet ?? value.maxFramesPerSheet ?? fallback.maxFramesPerSheet, 1, 24),
        source,
    };
}

export function resolveAgentSamplingPolicy(raw: unknown, fallback: VideoSamplingPolicy = DEFAULT_VIDEO_SAMPLING_POLICY) {
    const parsed = parseAgentPolicy(raw);
    if (!parsed) return { policy: { ...fallback, source: "fallback" as const }, fallbackReason: "Agent 抽帧策略不是有效 JSON 对象" };
    const candidateMode = parsed.mode ?? parsed.samplingMode;
    if (parsed.mode !== undefined && parsed.samplingMode !== undefined && parsed.mode !== parsed.samplingMode) return { policy: { ...fallback, source: "fallback" as const }, fallbackReason: "Agent 抽帧策略的 mode 与 samplingMode 冲突" };
    if (candidateMode !== undefined && candidateMode !== "seconds" && candidateMode !== "scene" && candidateMode !== "seconds_and_scene") return { policy: { ...fallback, source: "fallback" as const }, fallbackReason: "Agent 抽帧策略的 mode 无效" };
    const validationError = validateAgentPolicy(parsed);
    if (validationError) return { policy: { ...fallback, source: "fallback" as const }, fallbackReason: validationError };
    if (parsed.mode === "agent" || parsed.samplingMode === "agent") return { policy: { ...fallback, source: "fallback" as const }, fallbackReason: "Agent 抽帧策略不能继续使用 agent 模式" };
    const policy = normalizeVideoSamplingPolicy({ samplingPolicy: parsed }, { ...fallback, source: "agent" });
    return { policy: { ...policy, source: "agent" as const } };
}

export function summarizeAgentPolicy(raw: unknown): Record<string, unknown> | undefined {
    if (raw === undefined) return undefined;
    const parsed = parseAgentPolicy(raw);
    if (!parsed) return { invalid: true };
    const summary: Record<string, unknown> = {};
    const allowedModes = new Set(["seconds", "scene", "seconds_and_scene", "agent", "deconstruct"]);
    for (const key of ["mode", "samplingMode"] as const) {
        const value = parsed[key];
        if (typeof value === "string" && allowedModes.has(value)) summary[key] = value;
    }
    for (const key of ["fps", "sceneChangeThreshold", "minSceneGapSec", "maxFrames", "maxFramesPerSheet"] as const) {
        const value = parsed[key];
        if (typeof value === "number" && Number.isFinite(value)) summary[key] = value;
    }
    if (typeof parsed.includeMiddleFrames === "boolean") summary.includeMiddleFrames = parsed.includeMiddleFrames;
    return summary;
}

export function sanitizeAgentPolicyJson(raw: string) {
    const parsed = parseAgentPolicy(raw);
    if (!parsed) return "";
    const resolved = resolveAgentSamplingPolicy(parsed);
    if (resolved.fallbackReason) return "";
    const policy = resolved.policy;
    return JSON.stringify({ mode: policy.mode, fps: policy.fps, includeMiddleFrames: policy.includeMiddleFrames, sceneChangeThreshold: policy.sceneChangeThreshold, minSceneGapSec: policy.minSceneGapSec, maxFrames: policy.maxFrames, maxFramesPerSheet: policy.maxFramesPerSheet });
}

function parseAgentPolicy(raw: unknown): VideoSamplingPolicyInput | null {
    if (typeof raw === "string") {
        try {
            return parseAgentPolicy(JSON.parse(raw));
        } catch {
            return null;
        }
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw as VideoSamplingPolicyInput;
}

function validateAgentPolicy(policy: VideoSamplingPolicyInput) {
    const allowedKeys = new Set(["mode", "samplingMode", "fps", "includeMiddleFrames", "sceneChangeThreshold", "minSceneGapSec", "maxFrames", "maxFramesPerSheet"]);
    const unknownKey = Object.keys(policy).find((key) => !allowedKeys.has(key));
    if (unknownKey) return `Agent 抽帧策略包含未知字段：${unknownKey}`;
    const ranges: Array<[keyof VideoSamplingPolicyInput, number, number]> = [
        ["fps", 0.1, 10],
        ["sceneChangeThreshold", 0, 1],
        ["minSceneGapSec", 0, 60],
        ["maxFrames", 1, 500],
        ["maxFramesPerSheet", 1, 24],
    ];
    for (const [key, min, max] of ranges) {
        const value = policy[key];
        if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) return `Agent 抽帧策略的 ${String(key)} 类型无效`;
        if (typeof value === "number" && (value < min || value > max)) return `Agent 抽帧策略的 ${String(key)} 超出范围 ${min}..${max}`;
    }
    if (policy.includeMiddleFrames !== undefined && typeof policy.includeMiddleFrames !== "boolean") return "Agent 抽帧策略的 includeMiddleFrames 类型无效";
    return "";
}

function clampNumber(value: unknown, min: number, max: number) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : min;
}

function clampInteger(value: unknown, min: number, max: number) {
    return Math.floor(clampNumber(value, min, max));
}

export function clampFrameCount(value: number | undefined, durationSec: number) {
    const fallback = Math.max(1, Math.ceil(durationSec));
    return Math.min(500, Math.max(1, Math.floor(Number(value) || fallback)));
}

export function sampleTimestampsAtFps(durationSec: number, fps = 1) {
    const duration = Math.max(0, Number(durationSec) || 0);
    const safeFps = Number.isFinite(Number(fps)) && Number(fps) > 0 ? Number(fps) : 1;
    if (!duration) return [0];
    const step = 1 / safeFps;
    const count = Math.max(1, Math.floor(duration * safeFps) + 1);
    return Array.from({ length: count }, (_, index) => Number((index * step).toFixed(3)));
}

export type VideoCapturePlan = {
    timestampSec: number;
    frameType: VideoFrameRecord["frameType"] | "scene_probe";
    source: string;
};

export function buildCapturePlans(durationSec: number, policy: VideoSamplingPolicy): VideoCapturePlan[] {
    if (policy.mode === "deconstruct") return [];
    const timelineTimestamps = sampleTimestampsAtFps(durationSec, policy.fps);
    if (policy.mode === "scene") return timelineTimestamps.map((timestampSec) => ({ timestampSec, frameType: "scene_probe" as const, source: "video-work.scene_probe" }));
    const timelinePlans = timelineTimestamps.map((timestampSec) => ({ timestampSec, frameType: "timeline_sample" as const, source: "video-work.timeline" }));
    if (policy.mode === "seconds") {
        const middleTimestamps = policy.includeMiddleFrames ? sampleMiddleTimestampsAtFps(durationSec, policy.fps) : [];
        return [...timelinePlans, ...middleTimestamps.map((timestampSec) => ({ timestampSec, frameType: "timeline_midpoint" as const, source: "video-work.timeline_midpoint" }))].sort(compareCapturePlanOrder);
    }
    const middleTimestamps = policy.includeMiddleFrames ? sampleMiddleTimestampsAtFps(durationSec, policy.fps) : [];
    return [...timelinePlans, ...middleTimestamps.map((timestampSec) => ({ timestampSec, frameType: "timeline_midpoint" as const, source: "video-work.timeline_midpoint" }))].sort(compareCapturePlanOrder);
}

function compareCapturePlanOrder(left: VideoCapturePlan, right: VideoCapturePlan) {
    const timestampOrder = left.timestampSec - right.timestampSec;
    if (timestampOrder) return timestampOrder;
    const typeOrder: Record<VideoCapturePlan["frameType"], number> = { timeline_sample: 0, timeline_midpoint: 1, visual_change_frame: 2, scene_probe: 3 };
    return typeOrder[left.frameType] - typeOrder[right.frameType];
}

export function sampleMiddleTimestampsAtFps(durationSec: number, fps = 1) {
    const duration = Math.max(0, Number(durationSec) || 0);
    const safeFps = Number.isFinite(Number(fps)) && Number(fps) > 0 ? Number(fps) : 1;
    if (!duration) return [];
    const step = 1 / safeFps;
    const count = Math.max(0, Math.ceil(duration / step));
    return Array.from({ length: count }, (_, index) => {
        const start = index * step;
        const end = Math.min(duration, start + step);
        return end > start ? Number(((start + end) / 2).toFixed(3)) : null;
    }).filter((value): value is number => value !== null);
}

export function compareFrameTimestampOrder(left: Pick<VideoFrameRecord, "timestampSec" | "frameType" | "index">, right: Pick<VideoFrameRecord, "timestampSec" | "frameType" | "index">) {
    const timestampOrder = left.timestampSec - right.timestampSec;
    if (timestampOrder) return timestampOrder;
    const typeOrder: Record<VideoFrameRecord["frameType"], number> = { timeline_sample: 0, timeline_midpoint: 1, visual_change_frame: 2 };
    return typeOrder[left.frameType] - typeOrder[right.frameType] || left.index - right.index;
}

export function normalizeSceneChangeThreshold(value: number | undefined) {
    const threshold = Number(value);
    return Number.isFinite(threshold) ? Math.min(1, Math.max(0, threshold)) : 0.20;
}

export function timelineSeekSecond(sampleTime: number, durationSec: number) {
    const safeTime = Math.max(0, Number(sampleTime) || 0);
    const duration = Math.max(0, Number(durationSec) || 0);
    if (!duration || safeTime === 0) return safeTime;
    const endGuard = duration > 0.2 ? 0.2 : 0;
    const seekTime = safeTime >= duration ? Math.max(0, duration - endGuard) : safeTime;
    return Number(Math.min(seekTime, duration).toFixed(3));
}

export function clampSheetCount(value: number | undefined, frameCount: number) {
    return Math.min(Math.max(1, frameCount), Math.max(1, Math.floor(Number(value) || 1)));
}

export function sampleTimestamps(durationSec: number, frameCount: number, options: Pick<VideoDecompositionOptions, "includeStart" | "includeEnd"> = {}) {
    const duration = Math.max(0, Number(durationSec) || 0);
    const count = Math.max(1, Math.floor(frameCount));
    const includeStart = options.includeStart !== false;
    const includeEnd = options.includeEnd !== false;
    if (count === 1) return [duration / 2];
    const first = includeStart ? 0 : duration / (count + 1);
    const last = includeEnd ? duration : (duration * count) / (count + 1);
    return Array.from({ length: count }, (_, index) => Number((first + ((last - first) * index) / (count - 1)).toFixed(3)));
}

export function formatTimecode(seconds: number) {
    const totalMillis = Math.max(0, Math.round((Number(seconds) || 0) * 1000));
    const hours = Math.floor(totalMillis / 3_600_000);
    const minutes = Math.floor((totalMillis % 3_600_000) / 60_000);
    const wholeSeconds = Math.floor((totalMillis % 60_000) / 1000);
    const millis = totalMillis % 1000;
    return `${hours ? `${String(hours).padStart(2, "0")}:` : ""}${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function buildTimelineFrameManifest(frames: VideoFrameRecord[], durationSec: number, fps = 1, sourceVideo = "", blockedFrames: VideoTimelineFrameManifest["blocked_frames"] = [], samplingMode?: VideoSamplingMode): VideoTimelineFrameManifest {
    const timelineFrames = (samplingMode === "deconstruct" || samplingMode === "scene"
        ? frames
        : frames.filter((frame) => frame.frameType === "timeline_sample"))
        .slice()
        .sort(compareFrameTimestampOrder);
    const timelineBlockedFrames = samplingMode === "scene" || samplingMode === "deconstruct" ? [] : blockedFrames;
    return {
        schema_version: "video-work.timeline_frame_manifest.v1",
        status: samplingMode === "scene" ? "completed" : timelineFrames.length ? (timelineBlockedFrames.length ? "partial" : "completed") : "blocked",
        method: "browser_explicit_time_seek",
        fps: Number.isFinite(Number(fps)) && Number(fps) > 0 ? Number(fps) : 1,
        source_video: sourceVideo,
        duration_sec: Math.max(0, Number(durationSec) || 0),
        frame_count: timelineFrames.length,
        blocked_count: timelineBlockedFrames.length,
        frames: timelineFrames.map((frame, index) => ({
            index: index + 1,
            frame_id: frame.frameId,
            path: frame.url,
            timestamp_sec: frame.timestampSec,
            seek_second: frame.seekTimestampSec,
            source: "browser_explicit_time_seek",
        })),
        blocked_frames: timelineBlockedFrames,
    };
}

function isCrossOriginHttpUrl(source: string) {
    try {
        const url = new URL(source, window.location.href);
        return /^https?:$/.test(url.protocol) && url.origin !== window.location.origin;
    } catch {
        return false;
    }
}

export function shouldEnableAnonymousCors(source: string): boolean {
    if (typeof source !== "string") return false;
    if (source.startsWith("blob:") || source.startsWith("data:")) return false;
    // 凡是 HTTP/HTTPS 地址（无论是外部域名还是本地可能经过 307 重定向至外部 S3/OSS/CDN 的相对/同源路径），
    // 均须启用 crossOrigin = "anonymous"，确保跟随重定向加载的媒体具备 Canvas 导出权限，杜绝画布污染
    return true;
}

function isCanvasOriginClean(video: HTMLVideoElement): boolean {
    if (typeof document === "undefined") return true;
    try {
        const probeCanvas = document.createElement("canvas");
        probeCanvas.width = 16;
        probeCanvas.height = 16;
        const probeCtx = probeCanvas.getContext("2d", { willReadFrequently: true });
        if (!probeCtx) return true;
        probeCtx.drawImage(video, 0, 0, 16, 16);
        probeCtx.getImageData(0, 0, 16, 16);
        return true;
    } catch {
        return false;
    }
}

/**
 * 从资源路径或 URL 中嗅探并提取标准存储键 (storageKey)，用于客户端多级缓存寻址
 */
export function extractResourceStorageKey(source: string): string {
    if (typeof source !== "string") return "";
    const trimmed = source.trim();
    if (trimmed.startsWith("resource:")) return trimmed;
    const resourceUrlMatch = trimmed.match(/\/resources\/([a-zA-Z0-9_-]+)/);
    if (resourceUrlMatch) {
        return `resource:${resourceUrlMatch[1]}`;
    }
    const hexMatch = trimmed.match(/\/([a-f0-9]{32})(?:[/?#.]|$)/i);
    if (hexMatch) {
        return `resource:${hexMatch[1]}`;
    }
    return "";
}

export async function loadVideo(input: Blob | File | string, signal?: AbortSignal) {
    throwIfAborted(signal);
    let activeBlobUrl: string | null = null;
    let sourceUrl = typeof input === "string" ? input : URL.createObjectURL(input);
    if (typeof input !== "string") {
        activeBlobUrl = sourceUrl;
    } else if (!sourceUrl.startsWith("blob:") && !sourceUrl.startsWith("data:")) {
        // 核心性能与稳定性防线：检测本地多级缓存 (L1 内存 / L2 IndexedDB)
        const storageKey = extractResourceStorageKey(sourceUrl);
        if (storageKey) {
            try {
                const cachedBlob = await getCachedResourceBlob(storageKey);
                if (cachedBlob) {
                    activeBlobUrl = URL.createObjectURL(cachedBlob);
                    sourceUrl = activeBlobUrl;
                }
            } catch (err) {
                console.warn("[loadVideo] 检索多级缓存失败，尝试网络拉取:", err);
            }
        }

        // 若多级缓存未命中，且输入为网络 HTTP/HTTPS 地址：
        // 绝不在公网 S3/OSS 上直接执行 70+ 次连续 seek (杜绝频繁 HTTP 206 Range 请求导致连接池耗尽与 16% 挂死)
        // 预先一次性流式缓冲至本地内存 Blob，并写入多级缓存，保证后续全部抽帧在本地 RAM 极速完成 (<0.1s)
        if (!activeBlobUrl && /^https?:\/\//i.test(sourceUrl)) {
            try {
                throwIfAborted(signal);
                const response = await fetch(sourceUrl, { signal });
                if (response.ok) {
                    const blob = await response.blob();
                    if (storageKey) {
                        void primeResourceBlobCache(storageKey, blob);
                    }
                    activeBlobUrl = URL.createObjectURL(blob);
                    sourceUrl = activeBlobUrl;
                }
            } catch (fetchErr) {
                if (isAbortError(fetchErr) || signal?.aborted) throw fetchErr;
                console.warn("[loadVideo] 预缓冲视频 Blob 失败，平滑降级为直连:", fetchErr);
            }
        }
    }

    const initVideoElement = async (url: string, useCors: boolean) => {
        const video = document.createElement("video");
        video.preload = "auto";
        video.muted = true;
        video.playsInline = true;

        // 挂载到离屏 DOM，确保 Chromium 合成器与硬件解码管线正常分配渲染资源
        if (typeof document !== "undefined" && document.body) {
            video.style.position = "fixed";
            video.style.left = "-9999px";
            video.style.top = "-9999px";
            video.style.width = "320px";
            video.style.height = "180px";
            video.style.opacity = "0.01";
            video.style.pointerEvents = "none";
            document.body.appendChild(video);
        }

        if (useCors) {
            video.crossOrigin = "anonymous";
        }
        video.src = url;

        try {
            await waitForMediaEvent(video, "loadedmetadata", "无法读取视频元数据", signal);
            // 等待第一帧解码就绪 (loadeddata / readyState >= HAVE_CURRENT_DATA)，最多等待 1.5 秒
            if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
                await new Promise<void>((resolve) => {
                    let resolved = false;
                    const done = () => {
                        if (resolved) return;
                        resolved = true;
                        cleanup();
                        resolve();
                    };
                    const cleanup = () => {
                        video.removeEventListener("loadeddata", done);
                        video.removeEventListener("canplay", done);
                        window.clearTimeout(timer);
                    };
                    const timer = window.setTimeout(done, 1500);
                    video.addEventListener("loadeddata", done, { once: true });
                    video.addEventListener("canplay", done, { once: true });
                });
            }
            // 尝试非阻塞静音微播唤醒解码流水线 (绝不阻塞主线程和抽帧流水线)
            try {
                const playPromise = video.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        try { video.pause(); } catch {}
                    }).catch(() => {});
                }
            } catch {}

            return video;
        } catch (error) {
            if (video.parentElement) video.parentElement.removeChild(video);
            video.removeAttribute("src");
            video.load();
            throw error;
        }
    };

    let video: HTMLVideoElement;
    const needsCors = typeof input === "string" && !activeBlobUrl && shouldEnableAnonymousCors(sourceUrl);

    try {
        video = await initVideoElement(sourceUrl, needsCors);

        // 检测 Canvas 是否被污染（例如被 307 重定向至未开放 CORS 或限制跨域导出的存储桶）
        if (typeof input === "string" && !isCanvasOriginClean(video)) {
            console.warn("[loadVideo] 检测到直接挂载视频触发了画布污染 (Tainted Canvas)，启动前端本地内存 Blob 隔离拉取保底...");
            if (video.parentElement) video.parentElement.removeChild(video);
            video.removeAttribute("src");
            video.load();

            throwIfAborted(signal);
            const response = await fetch(sourceUrl, { signal });
            if (!response.ok) {
                throw new Error(`视频保底拉取失败 (HTTP ${response.status})`);
            }
            const blob = await response.blob();
            activeBlobUrl = URL.createObjectURL(blob);
            sourceUrl = activeBlobUrl;
            video = await initVideoElement(sourceUrl, false);
        }
    } catch (primaryError) {
        if (isAbortError(primaryError) || signal?.aborted) {
            if (activeBlobUrl) URL.revokeObjectURL(activeBlobUrl);
            throw primaryError;
        }

        // 若直接直连因为 CORS 或重定向协议在 loadedmetadata 阶段受阻，且源为外部地址，自动降级为 Blob 本地拉取
        if (typeof input === "string" && !activeBlobUrl) {
            try {
                throwIfAborted(signal);
                console.warn("[loadVideo] 视频直连读取元数据受阻，启动本地内存 Blob 降级加载:", primaryError);
                const response = await fetch(sourceUrl, { signal });
                if (response.ok) {
                    const blob = await response.blob();
                    activeBlobUrl = URL.createObjectURL(blob);
                    sourceUrl = activeBlobUrl;
                    video = await initVideoElement(sourceUrl, false);
                } else {
                    throw primaryError;
                }
            } catch (fallbackError) {
                if (activeBlobUrl) URL.revokeObjectURL(activeBlobUrl);
                throw primaryError;
            }
        } else {
            if (activeBlobUrl) URL.revokeObjectURL(activeBlobUrl);
            throw primaryError;
        }
    }

    return {
        video,
        sourceUrl,
        durationSec: Number.isFinite(video.duration) ? Math.max(0, video.duration) : 0,
        width: video.videoWidth || 1280,
        height: video.videoHeight || 720,
        dispose: () => {
            if (video.parentElement) video.parentElement.removeChild(video);
            video.removeAttribute("src");
            video.load();
            if (activeBlobUrl) URL.revokeObjectURL(activeBlobUrl);
        },
    };
}

export async function seekVideo(video: HTMLVideoElement, timestampSec: number) {
    const timestamp = Math.max(0, Math.min(video.duration || timestampSec, timestampSec));
    await new Promise<void>((resolve, reject) => {
        let settled = false;
        let lastActiveTime = Date.now();
        let retriedWithJitter = false;
        let rafId: number | null = null;
        let intervalId: number | null = null;
        const SEEK_TIMEOUT_MS = 3000; // 3秒超时，避免长久冻结

        const cleanup = () => {
            if (intervalId) window.clearInterval(intervalId);
            if (rafId) window.cancelAnimationFrame(rafId);
            video.removeEventListener("seeked", onSeeked);
            video.removeEventListener("timeupdate", onActivity);
            video.removeEventListener("canplay", onActivity);
            video.removeEventListener("loadeddata", onActivity);
            video.removeEventListener("error", onError);
        };

        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (error) reject(error);
            else resolve();
        };

        const checkReadyAndFinish = () => {
            if (settled) return;
            if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                finish();
                return;
            }
            rafId = window.requestAnimationFrame(() => {
                if (settled) return;
                if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                    finish();
                }
            });
        };

        const onSeeked = () => {
            lastActiveTime = Date.now();
            checkReadyAndFinish();
        };

        const onActivity = () => {
            lastActiveTime = Date.now();
            if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                finish();
            }
        };

        const onError = () => finish(new Error("视频帧定位失败"));

        video.addEventListener("seeked", onSeeked);
        video.addEventListener("timeupdate", onActivity);
        video.addEventListener("canplay", onActivity);
        video.addEventListener("loadeddata", onActivity);
        video.addEventListener("error", onError, { once: true });

        // 周期性主动探测与自愈轮询（每 80ms）
        intervalId = window.setInterval(() => {
            if (settled) return;
            const now = Date.now();

            if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                finish();
                return;
            }

            // 800ms 后若仍未就绪，通过微调偏移 (微抖动 +/- 0.04s) 唤醒 Chromium 解码器寻找临近关键帧
            if (!retriedWithJitter && now - lastActiveTime > 800) {
                retriedWithJitter = true;
                lastActiveTime = now;
                try {
                    const jitter = timestamp > 0.05 ? timestamp - 0.04 : timestamp + 0.04;
                    video.currentTime = Math.max(0, Math.min(video.duration || jitter, jitter));
                } catch {}
            }

            // 超过 3 秒兜底：只要已获取到元数据，平滑通过，允许 Canvas 抓取已有帧缓冲，绝不挂起整个批次
            if (now - lastActiveTime > SEEK_TIMEOUT_MS) {
                if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
                    finish();
                } else {
                    finish(new Error("视频帧定位超时"));
                }
            }
        }, 80);

        try {
            const wasAtTimestamp = Math.abs(video.currentTime - timestamp) < 0.001;
            if (wasAtTimestamp && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                finish();
                return;
            }
            video.currentTime = timestamp;
            // 如果已经在该时间戳但尚未解码就绪，轻微抖动强制触发底层 seek 刷新
            if (wasAtTimestamp && video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
                const nudge = timestamp > 0.01 ? timestamp - 0.005 : timestamp + 0.005;
                video.currentTime = nudge;
            }
        } catch {
            finish(new Error("视频帧定位失败"));
        }
    });
}

function waitForMediaEvent(video: HTMLVideoElement, eventName: "loadedmetadata", errorMessage: string, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        let settled = false;
        let lastBufferedEnd = 0;
        let lastActiveTime = Date.now();
        const BASELINE_TIMEOUT_MS = 60_000; // 基线超时放宽至 60 秒

        let timeoutId = window.setTimeout(checkTimeout, 5_000);

        function checkTimeout() {
            if (settled) return;
            const now = Date.now();
            try {
                if (video.buffered && video.buffered.length > 0) {
                    const currentBufferedEnd = video.buffered.end(video.buffered.length - 1);
                    if (currentBufferedEnd > lastBufferedEnd + 0.01) {
                        lastBufferedEnd = currentBufferedEnd;
                        lastActiveTime = now;
                    }
                }
            } catch {}

            if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
                finish();
                return;
            }

            if (now - lastActiveTime > BASELINE_TIMEOUT_MS) {
                finish(new Error(`${errorMessage}（超时）`));
            } else {
                timeoutId = window.setTimeout(checkTimeout, 2_000);
            }
        }

        const onProgress = () => {
            lastActiveTime = Date.now();
        };

        const cleanup = () => {
            window.clearTimeout(timeoutId);
            video.removeEventListener(eventName, onReady);
            video.removeEventListener("progress", onProgress);
            video.removeEventListener("error", onError);
            signal?.removeEventListener("abort", onAbort);
        };
        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (error) reject(error);
            else resolve();
        };
        const onReady = () => finish();
        const onError = () => finish(new Error(errorMessage));
        const onAbort = () => finish(new DOMException("Aborted", "AbortError"));

        video.addEventListener(eventName, onReady, { once: true });
        video.addEventListener("progress", onProgress);
        video.addEventListener("error", onError, { once: true });
        signal?.addEventListener("abort", onAbort, { once: true });
        if (signal?.aborted) onAbort();
        if (video.readyState >= HTMLMediaElement.HAVE_METADATA) finish();
    });
}

export async function extractVideoFrames(input: Blob | File | string, options: VideoDecompositionOptions = {}) {
    return withVideoDecodeLock(async () => {
        throwIfAborted(options.signal);
        const loaded = await loadVideo(input, options.signal);
    const frames: VideoFrameRecord[] = [];
    const capturedFrames: Array<Omit<VideoFrameRecord, "index" | "frameId" | "gridLabel">> = [];
    const blockedFrames: VideoTimelineFrameManifest["blocked_frames"] = [];
    try {
        throwIfAborted(options.signal);
        const nestedSamplingDirective = options.samplingPolicy ? Object.keys(options.samplingPolicy).some((key) => key !== "maxFrames" && key !== "maxFramesPerSheet") : false;
        const hasSamplingDirective = Boolean(
            nestedSamplingDirective ||
            options.samplingMode ||
            options.agentPolicy !== undefined ||
            options.fps !== undefined ||
            options.includeMiddleFrames !== undefined ||
            options.detectSceneChanges !== undefined ||
            options.sceneChangeThreshold !== undefined ||
            options.minSceneGapSec !== undefined
        );
        const defaultMode = { ...DEFAULT_VIDEO_SAMPLING_POLICY, mode: "seconds" as const, includeMiddleFrames: false, source: "default" as const };
        const requestedPolicy = options.samplingPolicy || {
            frameCount: options.frameCount,
            samplingMode: options.samplingMode,
            fps: options.fps,
            includeMiddleFrames: options.includeMiddleFrames,
            sceneChangeThreshold: options.sceneChangeThreshold,
            minSceneGapSec: options.minSceneGapSec,
            maxFrames: options.maxFrames,
            maxFramesPerSheet: options.maxFramesPerSheet,
        };
        let policy = normalizeVideoSamplingPolicy(options, hasSamplingDirective ? DEFAULT_VIDEO_SAMPLING_POLICY : defaultMode);
        let agentFallbackReason = "";
        const nestedAgentMode = options.samplingPolicy?.mode === "agent" || options.samplingPolicy?.samplingMode === "agent";
        const requestedAgentPolicy = options.agentPolicy !== undefined ? summarizeAgentPolicy(options.agentPolicy) : nestedAgentMode ? { mode: "agent" } : undefined;
        if (options.agentPolicy !== undefined || options.samplingMode === "agent" || nestedAgentMode) {
            const resolved = resolveAgentSamplingPolicy(options.agentPolicy, policy);
            policy = resolved.policy;
            agentFallbackReason = resolved.fallbackReason || "";
        }
        let capturePlans = buildCapturePlans(loaded.durationSec, policy);
        if (!options.fps && !hasSamplingDirective) {
            const frameCount = clampFrameCount(options.frameCount, loaded.durationSec);
            capturePlans = sampleTimestamps(loaded.durationSec, frameCount, options).map((timestampSec) => ({ timestampSec, frameType: "timeline_sample" as const, source: "video-work.timeline" }));
        }
        const maxFramesLimit = Math.max(1, policy.maxFrames || 500);
        if (capturePlans.length > maxFramesLimit) {
            const step = capturePlans.length / maxFramesLimit;
            capturePlans = Array.from({ length: maxFramesLimit }, (_, i) => capturePlans[Math.min(capturePlans.length - 1, Math.floor(i * step))]);
        }
        const sceneThreshold = normalizeSceneChangeThreshold(policy.sceneChangeThreshold);
        const canvas = document.createElement("canvas");
        canvas.width = loaded.width;
        canvas.height = loaded.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("浏览器不支持视频帧绘制");
        const detectSceneChanges = policy.mode === "scene" || policy.mode === "seconds_and_scene";
        // 始终初始化 32x18 缩略图特征 Canvas，用于全场景精确的逐帧 RGB 差异度比对
        const differenceCanvas = document.createElement("canvas");
        differenceCanvas.width = 32;
        differenceCanvas.height = 18;
        const differenceContext = differenceCanvas.getContext("2d");

        let previousProbeSignature: Uint8ClampedArray | null = null;
        let lastRetainedSignature: Uint8ClampedArray | null = null;
        let lastRetainedTimestamp = Number.NEGATIVE_INFINITY;
        let lastSceneTimestamp = Number.NEGATIVE_INFINITY;
        let timelinePlanIndex = 0;

        if (policy.mode === "deconstruct") {
            // =========================================================================
            // 创意反推：正向两阶段物理分镜解构管线 (<= 60秒短视频专用)
            // Phase 1：32x18 内存双时标粗筛 + 局部毫秒级高精对齐 (0.033s 步长锁定真实硬切点)
            // Phase 2：微观精细窗口多帧优选 (Clean In 拐点平稳首帧 + Apex 核心动势 + Clean Out 落幅定格 + 拉普拉斯清晰度防拖影)
            // =========================================================================
            const effectiveDuration = Math.max(0.5, Math.min(60, loaded.durationSec));
            const budget = evaluateDeconstructBudget(effectiveDuration);
            const sceneThreshold = normalizeSceneChangeThreshold(policy.sceneChangeThreshold || budget.sceneThreshold);
            const minSceneGap = policy.minSceneGapSec !== undefined && policy.source === "user"
                ? Math.max(0.15, policy.minSceneGapSec)
                : budget.minSceneGapSec;

            // Phase 1A: 极速全片双时标粗筛 (Fast Dual-Timescale Screening)
            // 步长设为 0.20s ~ 0.35s，快速掠过全片生成 32x18 特征签名
            const probeStep = Math.max(0.20, Math.min(0.35, effectiveDuration / 120));
            const probeTimestamps: number[] = [];
            for (let t = 0; t <= effectiveDuration; t += probeStep) {
                probeTimestamps.push(Number(t.toFixed(3)));
            }
            if (probeTimestamps[probeTimestamps.length - 1] < effectiveDuration - 0.08) {
                probeTimestamps.push(Number(effectiveDuration.toFixed(3)));
            }

            const candidateCuts: Array<{ timestampSec: number; sceneScore: number }> = [];
            let lastCutTime = 0;
            let previousSig: Uint8ClampedArray | null = null;
            let previousHist: Float32Array | null = null;

            // 滑动窗环形缓冲区 (覆盖 ~0.8s，用于捕获慢速叠化 Dissolve 转场)
            const ringBuffer: Array<{ timestampSec: number; sig: Uint8ClampedArray; hist: Float32Array }> = [];
            const RING_SIZE = 4;

            for (let i = 0; i < probeTimestamps.length; i++) {
                throwIfAborted(options.signal);
                const probeT = probeTimestamps[i];
                options.onProgress?.({
                    current: Math.round((i / probeTimestamps.length) * 35),
                    total: 100,
                });

                try {
                    await seekVideo(loaded.video, probeT);
                    if (differenceContext && differenceCanvas) {
                        differenceContext.drawImage(loaded.video, 0, 0, differenceCanvas.width, differenceCanvas.height);
                        const curSig = differenceContext.getImageData(0, 0, differenceCanvas.width, differenceCanvas.height).data;
                        const curHist = computeColorHistogram(curSig);

                        if (previousSig) {
                            const instantScore = frameDifferenceScore(previousSig, curSig);
                            const windowScore = ringBuffer.length >= 2
                                ? frameDifferenceScore(ringBuffer[0].sig, curSig)
                                : instantScore;
                            const histSim = previousHist ? histogramIntersection(previousHist, curHist) : 1;

                            // 1. 运镜晃动抑制 (Pan/Tilt Decoupling)：
                            // 若整体色彩直方图相似度极高 (> 0.91)，且瞬时差未超过极大阈值，判定为同机位运镜晃动，抑制伪切点
                            const isPanMotion = histSim > 0.91 && instantScore < sceneThreshold * 1.5;

                            // 2. 双时标切点条件：
                            // 瞬时硬切 (Hard Cut) 或 慢速平滑叠化 (Dissolve)
                            const isHardCut = instantScore >= sceneThreshold && !isPanMotion;
                            const isSlowDissolve = windowScore >= sceneThreshold * 1.35 && histSim < 0.72 && instantScore >= 0.07;

                            if ((isHardCut || isSlowDissolve) && (probeT - lastCutTime >= minSceneGap)) {
                                if (!isTransitionGhost(curSig)) {
                                    // =========================================================================
                                    // Phase 1B: 局部高精度精修 (Local Sub-Frame Refinement Pass)
                                    // 真实切点必然严格位于 [prevProbeT, probeT] 区间内！
                                    // 绝不直接记录滞后的 probeT，而是以 ~0.033s (约 30fps) 微步长在该 0.25s~0.35s 窗口内精细逼近，
                                    // 锁定帧差产生单步剧变的真实毫秒切点 T_exact，将时间误差彻底压缩至 < 0.033s！
                                    // =========================================================================
                                    const windowStart = isSlowDissolve && ringBuffer.length > 0
                                        ? ringBuffer[0].timestampSec
                                        : (probeTimestamps[i - 1] ?? Math.max(0, probeT - probeStep));
                                    const windowEnd = probeT;

                                    let exactCutT = probeT;
                                    let maxJumpScore = instantScore;

                                    if (windowEnd - windowStart >= 0.06) {
                                        const subStep = 0.033;
                                        let lastSubSig = previousSig;
                                        let bestJump = 0;
                                        let candidateSubT = probeT;

                                        for (let subT = windowStart + subStep; subT <= windowEnd; subT += subStep) {
                                            try {
                                                if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
                                                await seekVideo(loaded.video, Number(subT.toFixed(3)));
                                                differenceContext.drawImage(loaded.video, 0, 0, differenceCanvas.width, differenceCanvas.height);
                                                const subSig = differenceContext.getImageData(0, 0, differenceCanvas.width, differenceCanvas.height).data;
                                                const stepJump = frameDifferenceScore(lastSubSig, subSig);
                                                const cumDiff = frameDifferenceScore(previousSig, subSig);

                                                if (stepJump > bestJump && cumDiff >= sceneThreshold * 0.5) {
                                                    bestJump = stepJump;
                                                    candidateSubT = Number(subT.toFixed(3));
                                                }
                                                lastSubSig = new Uint8ClampedArray(subSig);
                                            } catch (err) {
                                                if (isAbortError(err) || options.signal?.aborted) throw err;
                                            }
                                        }
                                        if (bestJump >= sceneThreshold * 0.4) {
                                            exactCutT = candidateSubT;
                                            maxJumpScore = Math.max(instantScore, bestJump);
                                        }
                                    }

                                    candidateCuts.push({ timestampSec: exactCutT, sceneScore: maxJumpScore });
                                    lastCutTime = exactCutT;
                                }
                            }
                        }

                        previousSig = new Uint8ClampedArray(curSig);
                        previousHist = curHist;
                        ringBuffer.push({ timestampSec: probeT, sig: new Uint8ClampedArray(curSig), hist: curHist });
                        if (ringBuffer.length > RING_SIZE) {
                            ringBuffer.shift();
                        }
                    }
                } catch (seekErr) {
                    if (isAbortError(seekErr) || options.signal?.aborted) throw seekErr;
                }
            }

            // 整理切点序列：保证以 0 起始，且切点数量受到正向预算约束 (maxShots 上限 40)
            let selectedCutTimes: number[] = [];
            if (candidateCuts.length > budget.maxShots - 1) {
                const sortedByScore = [...candidateCuts].sort((a, b) => b.sceneScore - a.sceneScore);
                const topCuts = sortedByScore.slice(0, budget.maxShots - 1).sort((a, b) => a.timestampSec - b.timestampSec);
                selectedCutTimes = topCuts.map((c) => c.timestampSec);
            } else {
                selectedCutTimes = candidateCuts.map((c) => c.timestampSec);
            }
            const cuts = [0, ...selectedCutTimes];

            // 局部微观窗口拉普拉斯方差清晰度选拔 (Laplacian Sharpness PK)
            // 在目标时间戳的微小局部邻域内选拔边缘最锐利、无拖影拉丝与闭眼的画格
            const selectSharpestFrameTime = async (
                targetT: number,
                lowerBound: number,
                upperBound: number
            ): Promise<number> => {
                if (!differenceContext || !differenceCanvas) return targetT;
                // 核心正向优化：候选帧保持完全一致数学集合 [targetT, targetT - 0.033, targetT + 0.033]，
                // 但执行严格升序排序。彻底消除解码器倒退寻道（Backward Seek）引发的 GOP 刷新与解码器死锁，保持 100% 精度
                const candidates = [
                    targetT,
                    Number((targetT - 0.033).toFixed(3)),
                    Number((targetT + 0.033).toFixed(3)),
                ].filter((t) => t >= lowerBound && t <= upperBound).sort((a, b) => a - b);

                let bestTime = targetT;
                let maxSharpness = -1;

                for (const candT of candidates) {
                    try {
                        if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
                        await seekVideo(loaded.video, candT);
                        differenceContext.drawImage(loaded.video, 0, 0, differenceCanvas.width, differenceCanvas.height);
                        const sig = differenceContext.getImageData(0, 0, differenceCanvas.width, differenceCanvas.height).data;
                        if (!isTransitionGhost(sig)) {
                            const sharpness = computeLaplacianSharpness(sig, differenceCanvas.width, differenceCanvas.height);
                            if (sharpness > maxSharpness) {
                                maxSharpness = sharpness;
                                bestTime = candT;
                            }
                        }
                    } catch (err) {
                        if (isAbortError(err) || options.signal?.aborted) throw err;
                    }
                }
                return bestTime;
            };

            // Phase 2: 微观窗口精细选拔与黄金画格生成 (Clean In + Apex 动势 + 画面细节补充)
            type DeconstructPlanItem = {
                timestampSec: number;
                frameType: VideoFrameRecord["frameType"];
                source: string;
                sceneScore?: number;
                shotIndex: number;
                priority: number; // 1: Clean In (必保), 2: Apex (动势核心), 3: Detail (演变细节)
            };
            const candidatePlans: DeconstructPlanItem[] = [];

            for (let idx = 0; idx < cuts.length; idx++) {
                throwIfAborted(options.signal);
                const start = cuts[idx];
                const next = idx < cuts.length - 1 ? cuts[idx + 1] : effectiveDuration;
                const shotLen = next - start;

                // 1. Clean In 稳定首帧 (Peak-to-Plateau 避开转场撕裂峰值，自适应选拔最清晰定格首帧)
                let cleanInT = start === 0 ? 0 : Number((start + Math.min(0.04, shotLen * 0.15)).toFixed(3));
                if (start > 0 && shotLen >= 0.2) {
                    cleanInT = await selectSharpestFrameTime(
                        cleanInT,
                        Number((start + 0.015).toFixed(3)),
                        Number((Math.min(effectiveDuration, start + Math.min(0.10, shotLen * 0.35))).toFixed(3))
                    );
                }
                const matchedScore = candidateCuts.find((c) => Math.abs(c.timestampSec - start) < 0.15)?.sceneScore;
                candidatePlans.push({
                    timestampSec: cleanInT,
                    frameType: "visual_change_frame",
                    source: start === 0 ? "video-work.scene_start" : "video-work.scene_detection",
                    sceneScore: matchedScore,
                    shotIndex: idx + 1,
                    priority: 1,
                });

                // 2. 镜头内黄金画格分级注入 (Clean In 起幅 + Apex 核心动势 + Detail 细节演变 + Clean Out 落幅定格)：
                if (shotLen < 0.8) {
                    // 超短快切镜头 (0.25s ~ 0.8s)：Clean In 代表起幅，若时长允许补充 Clean Out 落幅
                    if (shotLen >= 0.4) {
                        const rawOutT = Number((next - 0.04).toFixed(3));
                        const cleanOutT = await selectSharpestFrameTime(
                            rawOutT,
                            Number((start + shotLen * 0.5).toFixed(3)),
                            Number((next - 0.015).toFixed(3))
                        );
                        candidatePlans.push({
                            timestampSec: cleanOutT,
                            frameType: "timeline_sample",
                            source: "video-work.clean_out",
                            shotIndex: idx + 1,
                            priority: 2,
                        });
                    }
                } else if (shotLen < 1.8) {
                    // 短镜头 (0.8s ~ 1.8s)：补充 1 帧核心动势 / 对白峰值帧 (Apex) + 1 帧动作落幅 (Clean Out)
                    const rawApexT = Number((start + shotLen * 0.46).toFixed(3));
                    const apexT = await selectSharpestFrameTime(
                        rawApexT,
                        Number((start + shotLen * 0.30).toFixed(3)),
                        Number((start + shotLen * 0.65).toFixed(3))
                    );
                    candidatePlans.push({
                        timestampSec: apexT,
                        frameType: "timeline_sample",
                        source: "video-work.apex_keyframe",
                        shotIndex: idx + 1,
                        priority: 2,
                    });

                    const rawOutT = Number((next - Math.min(0.04, shotLen * 0.06)).toFixed(3));
                    const cleanOutT = await selectSharpestFrameTime(
                        rawOutT,
                        Number((start + shotLen * 0.70).toFixed(3)),
                        Number((next - 0.015).toFixed(3))
                    );
                    candidatePlans.push({
                        timestampSec: cleanOutT,
                        frameType: "timeline_sample",
                        source: "video-work.clean_out",
                        shotIndex: idx + 1,
                        priority: 3,
                    });
                } else if (shotLen < 3.2) {
                    // 中等镜头 (1.8s ~ 3.2s)：补充 3 帧 (动势演变 + 细节 + Clean Out 落幅)
                    const rawApexT = Number((start + shotLen * 0.38).toFixed(3));
                    const apexT = await selectSharpestFrameTime(
                        rawApexT,
                        Number((start + shotLen * 0.25).toFixed(3)),
                        Number((start + shotLen * 0.50).toFixed(3))
                    );
                    candidatePlans.push({
                        timestampSec: apexT,
                        frameType: "timeline_sample",
                        source: "video-work.apex_keyframe",
                        shotIndex: idx + 1,
                        priority: 2,
                    });

                    const rawDetailT = Number((start + shotLen * 0.68).toFixed(3));
                    const detailT = await selectSharpestFrameTime(
                        rawDetailT,
                        Number((start + shotLen * 0.55).toFixed(3)),
                        Number((start + shotLen * 0.80).toFixed(3))
                    );
                    candidatePlans.push({
                        timestampSec: detailT,
                        frameType: "timeline_sample",
                        source: "video-work.timeline",
                        shotIndex: idx + 1,
                        priority: 3,
                    });

                    const rawOutT = Number((next - Math.min(0.05, shotLen * 0.04)).toFixed(3));
                    const cleanOutT = await selectSharpestFrameTime(
                        rawOutT,
                        Number((start + shotLen * 0.82).toFixed(3)),
                        Number((next - 0.015).toFixed(3))
                    );
                    candidatePlans.push({
                        timestampSec: cleanOutT,
                        frameType: "timeline_sample",
                        source: "video-work.clean_out",
                        shotIndex: idx + 1,
                        priority: 3,
                    });
                } else {
                    // 较长镜头 (>= 3.2s)：按 1.0s ~ 1.2s 步长提取画面细节，并确保尾部包含 Clean Out 落幅定格
                    const detailCount = Math.min(8, Math.max(3, Math.floor(shotLen / 1.1)));
                    for (let s = 1; s <= detailCount; s++) {
                        const isLast = s === detailCount;
                        if (isLast) {
                            const rawOutT = Number((next - Math.min(0.05, shotLen * 0.03)).toFixed(3));
                            const cleanOutT = await selectSharpestFrameTime(
                                rawOutT,
                                Number((next - 0.3).toFixed(3)),
                                Number((next - 0.015).toFixed(3))
                            );
                            candidatePlans.push({
                                timestampSec: cleanOutT,
                                frameType: "timeline_sample",
                                source: "video-work.clean_out",
                                shotIndex: idx + 1,
                                priority: 3,
                            });
                        } else {
                            const rawSubT = Number((start + (shotLen / (detailCount + 1)) * s).toFixed(3));
                            const subT = await selectSharpestFrameTime(
                                rawSubT,
                                Number((rawSubT - 0.05).toFixed(3)),
                                Number((rawSubT + 0.05).toFixed(3))
                            );
                            candidatePlans.push({
                                timestampSec: subT,
                                frameType: "timeline_sample",
                                source: "video-work.timeline",
                                shotIndex: idx + 1,
                                priority: s === Math.round(detailCount / 2) ? 2 : 3,
                            });
                        }
                    }
                }
            }

            // 正向容量保护：若总候选画格超出预算上限，按优先级保全 (保证所有镜头 Clean In 100% 留存)
            let deconstructPlans: DeconstructPlanItem[] = candidatePlans;
            if (candidatePlans.length > budget.maxFrames) {
                deconstructPlans = [...candidatePlans].sort((a, b) => a.priority - b.priority).slice(0, budget.maxFrames);
            }

            // 严格按时间戳排序并去重微小邻近帧 (<= 0.05s)
            deconstructPlans.sort((a, b) => a.timestampSec - b.timestampSec);
            const dedupedPlans: DeconstructPlanItem[] = [];
            for (const p of deconstructPlans) {
                const prev = dedupedPlans[dedupedPlans.length - 1];
                if (!prev || Math.abs(prev.timestampSec - p.timestampSec) > 0.05) {
                    dedupedPlans.push(p);
                } else if (p.priority < prev.priority) {
                    dedupedPlans[dedupedPlans.length - 1] = p;
                }
            }

            for (let pIdx = 0; pIdx < dedupedPlans.length; pIdx++) {
                throwIfAborted(options.signal);
                const dp = dedupedPlans[pIdx];
                options.onProgress?.({
                    current: Math.round(40 + ((pIdx + 1) / dedupedPlans.length) * 60),
                    total: 100,
                });

                try {
                    const seekT = timelineSeekSecond(dp.timestampSec, effectiveDuration);
                    await seekVideo(loaded.video, seekT);
                    context.drawImage(loaded.video, 0, 0, loaded.width, loaded.height);
                    const blob = await canvasToBlob(canvas, options.quality ?? 0.85);

                    capturedFrames.push({
                        timestampSec: dp.timestampSec,
                        timecode: formatTimecode(dp.timestampSec),
                        frameType: dp.frameType,
                        source: dp.source,
                        seekTimestampSec: seekT,
                        sceneScore: dp.sceneScore,
                        blob,
                        url: URL.createObjectURL(blob),
                        width: loaded.width,
                        height: loaded.height,
                    });
                } catch (frameErr) {
                    if (isAbortError(frameErr) || options.signal?.aborted) throw frameErr;
                    console.warn(`[extractVideoFrames:deconstruct] 镜头帧 ${dp.timestampSec}s 提取异常:`, frameErr);
                }
            }
        } else {
            for (let planIndex = 0; planIndex < capturePlans.length; planIndex++) {
                const plan = capturePlans[planIndex];
                throwIfAborted(options.signal);
            options.onProgress?.({ current: planIndex + 1, total: capturePlans.length });
            if (capturedFrames.length >= maxFramesLimit) break;
            const seekTimestampSec = timelineSeekSecond(plan.timestampSec, loaded.durationSec);
            const timelineIndex = plan.frameType === "timeline_sample" ? ++timelinePlanIndex : undefined;

            try {
                await seekVideo(loaded.video, seekTimestampSec);

                let instantScore = 0;
                let cumulativeScore = 1;
                let currentSignature: Uint8ClampedArray | null = null;

                if (differenceContext && differenceCanvas) {
                    differenceContext.drawImage(loaded.video, 0, 0, differenceCanvas.width, differenceCanvas.height);
                    const imgData = differenceContext.getImageData(0, 0, differenceCanvas.width, differenceCanvas.height);
                    currentSignature = imgData.data;

                    instantScore = previousProbeSignature ? frameDifferenceScore(previousProbeSignature, currentSignature) : 0;
                    cumulativeScore = lastRetainedSignature ? frameDifferenceScore(lastRetainedSignature, currentSignature) : 1;
                    previousProbeSignature = new Uint8ClampedArray(currentSignature);
                }

                const isFirstFrame = capturedFrames.length === 0 || plan.timestampSec === 0;
                const isLastPlan = planIndex === capturePlans.length - 1;

                const isTimelineSample = plan.frameType === "timeline_sample";
                const isMidpoint = plan.frameType === "timeline_midpoint";

                // 1. 镜头突变判定 (Scene Cut)：瞬时变化率超过真实场景阈值且满足最小时间间隔
                let isSceneCutCandidate = detectSceneChanges &&
                    instantScore >= sceneThreshold &&
                    (plan.timestampSec - lastSceneTimestamp >= policy.minSceneGapSec);

                // 1.1 转场过渡态与黑白闪鬼影检测 (Ghost & Flash Suppression)
                // 过滤纯黑过渡 (mean < 12)、白闪 (mean > 242) 以及方差极低无细节的半透明叠影 (variance < 10)
                let isGhost = isSceneCutCandidate && currentSignature && currentSignature.length > 0
                    ? isTransitionGhost(currentSignature)
                    : false;

                let effectiveTimestampSec = plan.timestampSec;
                let effectiveSeekSec = seekTimestampSec;

                // 1.2 鬼影避让自适应微步探测：若当前处于黑白闪或转场过渡态，向前微移 0.12s 重新探寻新镜头稳定展开首帧 (Clean In)
                if (isSceneCutCandidate && isGhost && plan.timestampSec + 0.12 < loaded.durationSec) {
                    try {
                        const advancedSeek = timelineSeekSecond(plan.timestampSec + 0.12, loaded.durationSec);
                        await seekVideo(loaded.video, advancedSeek);
                        if (differenceContext && differenceCanvas) {
                            differenceContext.drawImage(loaded.video, 0, 0, differenceCanvas.width, differenceCanvas.height);
                            const advImgData = differenceContext.getImageData(0, 0, differenceCanvas.width, differenceCanvas.height);
                            const advSig = advImgData.data;
                            if (!isTransitionGhost(advSig)) {
                                isGhost = false; // 成功避开转场黑白闪/鬼影，捕获到稳定首帧
                                currentSignature = advSig;
                                effectiveTimestampSec = Number((plan.timestampSec + 0.12).toFixed(3));
                                effectiveSeekSec = advancedSeek;
                            }
                        }
                    } catch {}
                }
                const isSceneCut = isSceneCutCandidate && !isGhost;

                // 2. 真实视觉动态判定 (Visual Movement)：仅用于中点辅助帧判定是否发生动作变化
                const minChangeThreshold = 0.06;
                const isMeaningfulChange = cumulativeScore >= minChangeThreshold;

                let shouldRetain = false;
                if (policy.mode === "scene") {
                    shouldRetain = isFirstFrame || isSceneCut;
                } else {
                    // 核心正向逻辑：
                    // - 首帧、末帧、以及每秒基准时间线帧 (timeline_sample) 100% 刚性保留，保障 1fps 物理节奏；
                    // - 真实场景突变 (isSceneCut，已剔除黑白闪鬼影) 100% 刚性保留为 visual_change_frame；
                    // - 仅对中点辅助帧 (timeline_midpoint) 检验 RGB 差异 (>= 0.06)，对静态无动作的中点帧进行剪枝；
                    // 彻底移除 4.0s 心跳兜底，正向维持严密时间线。
                    shouldRetain = isFirstFrame || isLastPlan || isTimelineSample || isSceneCut || (isMidpoint && isMeaningfulChange);
                }

                if (!shouldRetain) {
                    continue;
                }

                // 确定帧分类标识与数据来源 (突变切点统一标记为 visual_change_frame，杜绝单时间戳双插)
                const frameType: VideoFrameRecord["frameType"] = isSceneCut
                    ? "visual_change_frame"
                    : (plan.frameType === "scene_probe" ? "visual_change_frame" : plan.frameType);

                const source = isFirstFrame
                    ? (plan.frameType === "scene_probe" ? "video-work.scene_start" : plan.source)
                    : isSceneCut
                    ? "video-work.scene_detection"
                    : plan.source;

                context.drawImage(loaded.video, 0, 0, loaded.width, loaded.height);
                const blob = await canvasToBlob(canvas, options.quality ?? 0.9);

                capturedFrames.push({
                    timestampSec: effectiveTimestampSec,
                    timecode: formatTimecode(effectiveTimestampSec),
                    frameType,
                    source,
                    seekTimestampSec: effectiveSeekSec,
                    sceneScore: isSceneCut ? instantScore : cumulativeScore,
                    blob,
                    url: URL.createObjectURL(blob),
                    width: loaded.width,
                    height: loaded.height,
                });

                if (currentSignature) {
                    lastRetainedSignature = new Uint8ClampedArray(currentSignature);
                }
                lastRetainedTimestamp = plan.timestampSec;
                if (isSceneCut) {
                    lastSceneTimestamp = plan.timestampSec;
                }
            } catch (error) {
                if (isAbortError(error) || options.signal?.aborted) throw error;
                if (timelineIndex !== undefined) {
                    blockedFrames.push({
                        index: timelineIndex,
                        timestamp_sec: plan.timestampSec,
                        seek_second: seekTimestampSec,
                        blockedReason: error instanceof Error ? error.message : "视频帧提取失败",
                    });
                }
            }
        }
        }
        // 安全保底：若因抽帧异常或过滤导致未捕获任何帧，执行保底截取，绝不允许 0 帧空数据穿透
        if (capturedFrames.length === 0) {
            try {
                context.drawImage(loaded.video, 0, 0, loaded.width, loaded.height);
                const fallbackBlob = await canvasToBlob(canvas, options.quality ?? 0.82);
                capturedFrames.push({
                    timestampSec: 0,
                    timecode: "00:00:00.000",
                    frameType: "timeline_sample",
                    source: "video-work.fallback",
                    seekTimestampSec: 0,
                    blob: fallbackBlob,
                    url: URL.createObjectURL(fallbackBlob),
                    width: loaded.width,
                    height: loaded.height,
                });
            } catch (fallbackError) {
                console.warn("[extractVideoFrames] 保底首帧抓取失败:", fallbackError);
            }
        }
        capturedFrames.sort((left, right) => compareFrameTimestampOrder({ ...left, index: 0 }, { ...right, index: 0 }));
        const retainedFrames = capturedFrames.slice(0, policy.maxFrames);
        capturedFrames.slice(retainedFrames.length).forEach((frame) => URL.revokeObjectURL(frame.url));
        retainedFrames.forEach((frame, index) => frames.push({ ...frame, index: index + 1, frameId: `F${String(index + 1).padStart(4, "0")}`, gridLabel: `Grid ${index + 1}` }));
        capturedFrames.length = 0;
        return {
            ...loaded,
            frames,
            frameCount: frames.length,
            samplingPolicy: policy,
            requestedPolicy,
            requestedAgentPolicy,
            agentFallbackReason,
            timelineManifest: buildTimelineFrameManifest(frames, loaded.durationSec, policy.fps, typeof input === "string" ? input : "", blockedFrames, policy.mode),
        };
    } catch (error) {
        frames.forEach((frame) => URL.revokeObjectURL(frame.url));
        capturedFrames.forEach((frame) => URL.revokeObjectURL(frame.url));
        loaded.dispose();
        throw error;
    }
    });
}

export type ExtractedAudioResult = {
    blob: Blob | null;
    durationSec: number;
    truncated: boolean;
    errorReason?: string;
};

const MAX_AUDIO_DURATION_SEC = 120;
const MAX_AUDIO_SOURCE_BYTES = 300 * 1024 * 1024;
const MAX_AUDIO_SOURCE_MB = Math.round(MAX_AUDIO_SOURCE_BYTES / (1024 * 1024));
const TARGET_AUDIO_SAMPLE_RATE = 16000;

export async function extractVideoAudio(
    input: Blob | File | string,
    options: { signal?: AbortSignal; sourceDurationSec?: number } = {},
): Promise<ExtractedAudioResult> {
    throwIfAborted(options.signal);

    if (typeof input !== "string" && input.size > MAX_AUDIO_SOURCE_BYTES) {
        return { blob: null, durationSec: 0, truncated: false, errorReason: `视频文件体积超过 ${MAX_AUDIO_SOURCE_MB}MB (${Math.round(input.size / (1024 * 1024))}MB)，为保护内存已跳过音频提取` };
    }
    if (options.sourceDurationSec && options.sourceDurationSec > 600) {
        return { blob: null, durationSec: 0, truncated: false, errorReason: `视频时长超过 10 分钟 (${Math.round(options.sourceDurationSec)}s)，为保护内存已跳过音频提取` };
    }

    const AudioContextCtor = typeof window !== "undefined"
        ? (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined;
    if (!AudioContextCtor) {
        return { blob: null, durationSec: 0, truncated: false, errorReason: "当前环境不支持 Web Audio 音频提取" };
    }

    let arrayBuffer: ArrayBuffer;
    try {
        if (typeof input === "string") {
            let directBlob: Blob | null = null;
            const storageKey = extractResourceStorageKey(input);
            if (storageKey) {
                try {
                    directBlob = await getCachedResourceBlob(storageKey);
                } catch {}
            }
            if (directBlob) {
                if (directBlob.size > MAX_AUDIO_SOURCE_BYTES) {
                    return { blob: null, durationSec: 0, truncated: false, errorReason: `视频文件体积超过 ${MAX_AUDIO_SOURCE_MB}MB (${Math.round(directBlob.size / (1024 * 1024))}MB)，为保护内存已跳过音频提取` };
                }
                arrayBuffer = await directBlob.arrayBuffer();
            } else {
                const response = await fetch(input, { signal: options.signal });
                if (!response.ok) {
                    return { blob: null, durationSec: 0, truncated: false, errorReason: `视频网络拉取失败 (HTTP ${response.status})` };
                }
                const contentLength = Number(response.headers.get("content-length"));
                if (contentLength && contentLength > MAX_AUDIO_SOURCE_BYTES) {
                    return { blob: null, durationSec: 0, truncated: false, errorReason: `视频文件体积超过 ${MAX_AUDIO_SOURCE_MB}MB (${Math.round(contentLength / (1024 * 1024))}MB)，为保护内存已跳过音频提取` };
                }
                arrayBuffer = await response.arrayBuffer();
            }
        } else {
            arrayBuffer = await input.arrayBuffer();
        }
    } catch (error) {
        if (isAbortError(error) || options.signal?.aborted) throw error;
        return { blob: null, durationSec: 0, truncated: false, errorReason: error instanceof Error ? error.message : "读取视频文件缓冲失败" };
    }

    throwIfAborted(options.signal);
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        return { blob: null, durationSec: 0, truncated: false, errorReason: "视频文件数据为空" };
    }

    let audioContext: AudioContext | undefined;
    try {
        audioContext = new AudioContextCtor();
        const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
        throwIfAborted(options.signal);

        const fullDuration = Number.isFinite(decodedBuffer.duration) ? decodedBuffer.duration : 0;
        if (fullDuration <= 0) {
            return { blob: null, durationSec: 0, truncated: false, errorReason: "视频无有效音轨或为静音视频" };
        }

        const truncated = fullDuration > MAX_AUDIO_DURATION_SEC;
        const targetDuration = Math.min(fullDuration, MAX_AUDIO_DURATION_SEC);

        const OfflineContextCtor = typeof window !== "undefined"
            ? (window.OfflineAudioContext || (window as typeof window & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext)
            : undefined;
        if (!OfflineContextCtor) {
            const channel = decodedBuffer.getChannelData(0);
            const sampleCount = Math.min(channel.length, Math.floor(targetDuration * decodedBuffer.sampleRate));
            const blob = encodeWav(channel.subarray(0, sampleCount), decodedBuffer.sampleRate);
            return { blob, durationSec: targetDuration, truncated };
        }

        const targetLength = Math.max(1, Math.floor(targetDuration * TARGET_AUDIO_SAMPLE_RATE));
        const offlineContext = new OfflineContextCtor(1, targetLength, TARGET_AUDIO_SAMPLE_RATE);
        const source = offlineContext.createBufferSource();
        source.buffer = decodedBuffer;
        source.connect(offlineContext.destination);
        source.start(0, 0, targetDuration);

        const rendered = await offlineContext.startRendering();
        throwIfAborted(options.signal);
        const monoData = rendered.getChannelData(0);
        const blob = encodeWav(monoData, TARGET_AUDIO_SAMPLE_RATE);
        return { blob, durationSec: targetDuration, truncated };
    } catch (error) {
        if (isAbortError(error) || options.signal?.aborted) throw error;
        return { blob: null, durationSec: 0, truncated: false, errorReason: error instanceof Error ? error.message : "音频解码失败或格式不受支持" };
    } finally {
        if (audioContext && audioContext.state !== "closed") {
            void audioContext.close().catch(() => undefined);
        }
    }
}

export function frameDifferenceScore(previous: Uint8ClampedArray, current: Uint8ClampedArray) {
    if (!previous.length || previous.length !== current.length) return 0;
    let difference = 0;
    let pixelCount = 0;
    for (let index = 0; index < current.length; index += 4) {
        difference += (Math.abs(current[index] - previous[index]) + Math.abs(current[index + 1] - previous[index + 1]) + Math.abs(current[index + 2] - previous[index + 2])) / (3 * 255);
        pixelCount += 1;
    }
    return pixelCount ? difference / pixelCount : 0;
}

/**
 * 转场过渡态与黑白闪鬼影检测算子：
 * 拦截纯黑过渡 (mean < 12)、白闪过曝 (mean > 242) 以及无纹理细节的半透明灰雾叠影 (variance < 10)
 */
export function isTransitionGhost(signature: Uint8ClampedArray): boolean {
    if (!signature || !signature.length) return false;
    let totalBrightness = 0;
    const pixelCount = signature.length / 4;
    if (pixelCount === 0) return false;
    for (let px = 0; px < signature.length; px += 4) {
        totalBrightness += (signature[px] + signature[px + 1] + signature[px + 2]) / 3;
    }
    const meanBrightness = totalBrightness / pixelCount;
    if (meanBrightness < 12 || meanBrightness > 242) return true;

    let varianceTotal = 0;
    for (let px = 0; px < signature.length; px += 4) {
        const b = (signature[px] + signature[px + 1] + signature[px + 2]) / 3;
        varianceTotal += (b - meanBrightness) ** 2;
    }
    const variance = varianceTotal / pixelCount;
    return variance < 10;
}

/**
 * 24 维微型颜色直方图：R/G/B 各 8-bin (0..7)
 * 用于运镜横摇/俯仰 (Pan/Tilt) 与真实场景切换 (Scene Cut) 的物理色彩解耦
 */
export function computeColorHistogram(signature: Uint8ClampedArray): Float32Array {
    const hist = new Float32Array(24);
    const pixelCount = signature.length / 4;
    if (pixelCount === 0) return hist;
    for (let i = 0; i < signature.length; i += 4) {
        const rBin = Math.min(7, Math.floor(signature[i] / 32));
        const gBin = Math.min(7, Math.floor(signature[i + 1] / 32));
        const bBin = Math.min(7, Math.floor(signature[i + 2] / 32));
        hist[rBin] += 1;
        hist[8 + gBin] += 1;
        hist[16 + bBin] += 1;
    }
    const inv = 1 / (pixelCount * 3);
    for (let b = 0; b < 24; b++) {
        hist[b] *= inv;
    }
    return hist;
}

/**
 * 微型直方图交集相似度 (Intersection Similarity, 0..1)
 */
export function histogramIntersection(h1: Float32Array, h2: Float32Array): number {
    if (h1.length !== 24 || h2.length !== 24) return 0;
    let score = 0;
    for (let i = 0; i < 24; i++) {
        score += Math.min(h1[i], h2[i]);
    }
    return score;
}

/**
 * 拉普拉斯算子方差清晰度评分 Var(∇²I)
 * 用于剔除运动模糊拉丝与闭眼残影帧，优先选拔边缘最锐利的黄金帧
 */
export function computeLaplacianSharpness(signature: Uint8ClampedArray, width = 32, height = 18): number {
    if (!signature || signature.length < width * height * 4) return 0;
    const gray = new Float32Array(width * height);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
        gray[i] = (signature[p] + signature[p + 1] + signature[p + 2]) / 3;
    }

    let sum = 0;
    let sumSq = 0;
    let count = 0;

    for (let y = 1; y < height - 1; y++) {
        const row = y * width;
        for (let x = 1; x < width - 1; x++) {
            const idx = row + x;
            // 离散拉普拉斯卷积核 [0 1 0; 1 -4 1; 0 1 0]
            const lap = gray[idx - width] + gray[idx + width] + gray[idx - 1] + gray[idx + 1] - 4 * gray[idx];
            sum += lap;
            sumSq += lap * lap;
            count++;
        }
    }

    if (count === 0) return 0;
    const mean = sum / count;
    const variance = (sumSq / count) - (mean * mean);
    return Math.max(0, variance);
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("视频帧导出失败"))), "image/jpeg", Math.min(1, Math.max(0.1, quality)));
    });
}

function isAbortError(error: unknown) {
    return error instanceof DOMException && error.name === "AbortError" || error instanceof Error && error.name === "AbortError";
}

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

function encodeWav(samples: Float32Array, sampleRate: number) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    writeAscii(view, 0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeAscii(view, 8, "WAVE");
    writeAscii(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(view, 36, "data");
    view.setUint32(40, samples.length * 2, true);
    samples.forEach((sample, index) => {
        const clamped = Math.max(-1, Math.min(1, sample));
        view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    });
    return new Blob([buffer], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, value: string) {
    [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
}
