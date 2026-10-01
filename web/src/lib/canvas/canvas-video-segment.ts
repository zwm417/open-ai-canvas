import { fetchFile } from "@ffmpeg/util";

import { getMediaBlob } from "@/services/file-storage";
import { buildExtractAudioArgs, buildSegmentTrimArgs, SEGMENT_INPUT_NAME, SEGMENT_OUTPUT_NAME } from "./canvas-video-segment-args";
import { loadFFmpeg } from "./canvas-video-merge";

export type VideoSegmentRange = {
    startMs: number;
    endMs: number;
};

export type VideoSegmentSource = {
    url?: string;
    storageKey?: string;
};

export type VideoSegmentProgress = {
    phase: "loading" | "reading" | "encoding";
    progress: number;
};

const INPUT_NAME = SEGMENT_INPUT_NAME;
const OUTPUT_NAME = SEGMENT_OUTPUT_NAME;

function assertValidRange(range: VideoSegmentRange, durationMs?: number) {
    const startMs = Math.max(0, Math.round(range.startMs));
    const endMs = Math.round(range.endMs);
    if (endMs <= startMs) throw new Error("片段结束时间必须晚于开始时间");
    if (durationMs !== undefined && endMs > Math.round(durationMs)) throw new Error("片段结束时间超过视频时长");
}

async function readVideoSourceBlob(source: VideoSegmentSource) {
    if (source.storageKey) {
        const stored = await getMediaBlob(source.storageKey);
        if (stored) return stored;
    }
    if (source.url) {
        const response = await fetch(source.url);
        if (!response.ok) throw new Error(`视频资源请求失败（${response.status}）`);
        return response.blob();
    }
    throw new Error("找不到视频素材，请重新上传后再操作");
}

// @opc-feature: desktop-native-ffmpeg-job [start]
async function tryRunDesktopSegmentJob(
    source: VideoSegmentSource,
    range: VideoSegmentRange,
    buildArgs: (startSec: string, durationSec: string) => string[],
    outputType: string,
    onProgress?: (progress: VideoSegmentProgress) => void,
): Promise<Blob | null> {
    const desktopBridge = (window as unknown as { desktopBridge?: {
        runFFmpegJob?: (options: {
            inputUrl?: string;
            inputBuffer?: Uint8Array;
            inputExtension?: string;
            args: string[];
            outputExtension?: string;
            mimeType?: string;
        }) => Promise<{ success: boolean; outputBlob?: Blob; error?: string }>;
    } }).desktopBridge;

    if (!desktopBridge?.runFFmpegJob) {
        return null;
    }

    try {
        onProgress?.({ phase: "reading", progress: 20 });
        const startSec = String(range.startMs / 1000);
        const durationSec = String((range.endMs - range.startMs) / 1000);
        const args = buildArgs(startSec, durationSec);

        let inputUrl: string | undefined;
        let inputBuffer: Uint8Array | undefined;

        if (source.url && /^https?:\/\//i.test(source.url)) {
            inputUrl = source.url;
        } else {
            const blob = await readVideoSourceBlob(source);
            const arrayBuf = await blob.arrayBuffer();
            inputBuffer = new Uint8Array(arrayBuf);
        }

        onProgress?.({ phase: "encoding", progress: 50 });
        const ext = outputType.includes("audio") || outputType.includes("mpeg") ? "mp3" : "mp4";
        const result = await desktopBridge.runFFmpegJob({
            inputUrl,
            inputBuffer,
            inputExtension: "mp4",
            args,
            outputExtension: ext,
            mimeType: outputType,
        });

        if (result?.success && result.outputBlob) {
            onProgress?.({ phase: "encoding", progress: 100 });
            return result.outputBlob;
        }
        console.warn("[desktop-native-ffmpeg] 桌面端原生 FFmpeg 执行未完成，回退至 WebAssembly:", result?.error);
        return null;
    } catch (e) {
        console.warn("[desktop-native-ffmpeg] 桌面端加速失败，回退至 WebAssembly:", e);
        return null;
    }
}
// @opc-feature: desktop-native-ffmpeg-job [end]

async function runSegmentJob(
    source: VideoSegmentSource,
    range: VideoSegmentRange,
    durationMs: number | undefined,
    buildArgs: (startSec: string, durationSec: string) => string[],
    onProgress?: (progress: VideoSegmentProgress) => void,
    outputType = "video/mp4",
) {
    assertValidRange(range, durationMs);
    // @opc-feature: desktop-native-ffmpeg-dispatch [start]
    const desktopBlob = await tryRunDesktopSegmentJob(source, range, buildArgs, outputType, onProgress);
    if (desktopBlob) {
        return desktopBlob;
    }
    // @opc-feature: desktop-native-ffmpeg-dispatch [end]
    const ffmpeg = await loadFFmpeg(({ phase, progress }) => onProgress?.({ phase: phase === "loading" ? "loading" : "reading", progress }));
    const blob = await readVideoSourceBlob(source);
    onProgress?.({ phase: "reading", progress: 45 });
    await ffmpeg.writeFile(INPUT_NAME, await fetchFile(blob));
    const startSec = String(range.startMs / 1000);
    const durationSec = String((range.endMs - range.startMs) / 1000);
    onProgress?.({ phase: "encoding", progress: 55 });
    try {
        const exitCode = await ffmpeg.exec(["-y", ...buildArgs(startSec, durationSec)]);
        if (exitCode !== 0) throw new Error("媒体处理失败，请确认视频编码格式兼容");
        const output = await ffmpeg.readFile(OUTPUT_NAME);
        onProgress?.({ phase: "encoding", progress: 100 });
        return new Blob([output as BlobPart], { type: outputType });
    } finally {
        await Promise.all([INPUT_NAME, OUTPUT_NAME].map((file) => ffmpeg.deleteFile(file).catch(() => undefined)));
    }
}

/** 按片段范围截取视频，输出统一编码 MP4（复用时间线 trim 的参数模板）。 */
export async function trimVideoSegment(source: VideoSegmentSource, range: VideoSegmentRange, durationMs?: number, onProgress?: (progress: VideoSegmentProgress) => void) {
    return runSegmentJob(source, range, durationMs, (startSec, durationSec) => buildSegmentTrimArgs(startSec, durationSec), onProgress, "video/mp4");
}

/** 从视频片段提取声音为 MP3；优先 libmp3lame，内核不支持时回退默认 mp3 编码器。 */
export async function extractVideoAudio(source: VideoSegmentSource, range: VideoSegmentRange, durationMs?: number, onProgress?: (progress: VideoSegmentProgress) => void) {
    assertValidRange(range, durationMs);
    // @opc-feature: desktop-native-ffmpeg-audio [start]
    const desktopAudioBlob = await tryRunDesktopSegmentJob(
        source,
        range,
        (startSec, durationSec) => buildExtractAudioArgs("libmp3lame", startSec, durationSec),
        "audio/mpeg",
        onProgress,
    );
    if (desktopAudioBlob) {
        return desktopAudioBlob;
    }
    // @opc-feature: desktop-native-ffmpeg-audio [end]
    const ffmpeg = await loadFFmpeg(({ phase, progress }) => onProgress?.({ phase: phase === "loading" ? "loading" : "reading", progress }));
    const blob = await readVideoSourceBlob(source);
    onProgress?.({ phase: "reading", progress: 45 });
    await ffmpeg.writeFile(INPUT_NAME, await fetchFile(blob));
    const startSec = String(range.startMs / 1000);
    const durationSec = String((range.endMs - range.startMs) / 1000);
    onProgress?.({ phase: "encoding", progress: 55 });
    try {
        const args = (audioCodec: string) => buildExtractAudioArgs(audioCodec, startSec, durationSec);
        let exitCode = await ffmpeg.exec(["-y", ...args("libmp3lame")]);
        if (exitCode !== 0) exitCode = await ffmpeg.exec(["-y", ...args("mp3")]);
        if (exitCode !== 0) throw new Error("音频提取失败：当前 FFmpeg 内核不支持 MP3 编码");
        const output = await ffmpeg.readFile(OUTPUT_NAME);
        onProgress?.({ phase: "encoding", progress: 100 });
        return new Blob([output as BlobPart], { type: "audio/mpeg" });
    } finally {
        await Promise.all([INPUT_NAME, OUTPUT_NAME].map((file) => ffmpeg.deleteFile(file).catch(() => undefined)));
    }
}
