import type { TranscriptWordTiming, VideoContactSheet, VideoDecompositionManifestFrame, VideoFrameRecord } from "./types";

export type FrameWords = {
    active: TranscriptWordTiming[];
    context: TranscriptWordTiming[];
};

/**
 * 对齐 Hypit 官方 wordsAt 音画证据对齐算法：
 * 根据给定时间秒数，检索当前正在播出的词 (active words)，以及上下文句子 (context words)。
 */
export function wordsAt(words: readonly TranscriptWordTiming[], at: number): FrameWords {
    if (!words || words.length === 0) return { active: [], context: [] };
    const active = words.filter((w) => w.startSec <= at && at <= w.endSec);
    let anchor = active.length > 0 ? words.indexOf(active[0]) : -1;
    if (anchor < 0) {
        let distance = Number.POSITIVE_INFINITY;
        for (let i = 0; i < words.length; i++) {
            const time = words[i].startSec ?? words[i].endSec;
            if (Math.abs(time - at) < distance) {
                anchor = i;
                distance = Math.abs(time - at);
            }
        }
    }
    const last = active.length > 0 ? words.indexOf(active[active.length - 1]) : anchor;
    return {
        active,
        context: anchor < 0 ? [] : words.slice(Math.max(0, anchor - 3), Math.min(words.length, last + 4)),
    };
}

const TARGET_ASPECT_RATIO = 16 / 9;
const MIN_ASPECT_RATIO = 1.35;

export function resolveContactSheetColumns(frameCount: number, tileWidth: number, tileHeight: number, requestedColumns = 0) {
    const count = Math.max(1, Math.floor(frameCount));
    const explicit = Math.floor(Number(requestedColumns) || 0);
    if (explicit > 0) return Math.min(count, explicit);
    let best = { columns: 1, score: Number.POSITIVE_INFINITY, rows: count };
    for (let columns = 1; columns <= count; columns += 1) {
        const rows = Math.max(1, Math.ceil(count / columns));
        const aspect = (columns * tileWidth) / (rows * tileHeight);
        const penalty = aspect < MIN_ASPECT_RATIO ? (MIN_ASPECT_RATIO - aspect) * 2 : 0;
        const score = Math.abs(aspect - TARGET_ASPECT_RATIO) + penalty;
        if (score < best.score || (score === best.score && rows < best.rows)) best = { columns, score, rows };
    }
    return best.columns;
}

export function resolveContactSheetPageSizes(frameCount: number, sheetCount: number, maxFramesPerSheet = 0) {
    const count = Math.max(0, Math.floor(frameCount));
    if (!count) return [];
    const safeSheetCount = Math.min(count, Math.max(1, Math.floor(sheetCount || 1)));
    const legacyPerSheet = Math.ceil(count / safeSheetCount);
    const limit = Math.floor(Number(maxFramesPerSheet) || 0);
    const perSheet = limit > 0 ? Math.min(legacyPerSheet, limit) : legacyPerSheet;
    const sizes: number[] = [];
    for (let remaining = count; remaining > 0; remaining -= perSheet) sizes.push(Math.min(perSheet, remaining));
    return sizes;
}

export async function buildContactSheets(
    frames: VideoFrameRecord[],
    sheetCount: number,
    options: {
        columns?: number;
        tileWidth?: number;
        tileHeight?: number;
        labelHeight?: number;
        quality?: number;
        maxFramesPerSheet?: number;
        words?: readonly TranscriptWordTiming[];
    } = {},
) {
    if (!frames.length) return { sheets: [] as VideoContactSheet[], columns: 1, manifestFrames: [] as VideoDecompositionManifestFrame[] };
    const frameTypeOrder: Record<VideoFrameRecord["frameType"], number> = { timeline_sample: 0, timeline_midpoint: 1, visual_change_frame: 2 };
    const orderedFrames = frames.slice().sort((left, right) => (left.timestampSec - right.timestampSec) || (frameTypeOrder[left.frameType] - frameTypeOrder[right.frameType]) || (left.index - right.index));
    const hasWords = Boolean(options.words && options.words.length > 0);
    const tileWidth = Math.max(120, Math.floor(options.tileWidth || 360));
    const tileHeight = Math.max(120, Math.floor(options.tileHeight || 520));
    const defaultLabelHeight = hasWords ? 92 : 82;
    const labelHeight = Math.min(tileHeight - 1, Math.max(48, Math.floor(options.labelHeight || defaultLabelHeight)));
    const pageSizes = resolveContactSheetPageSizes(orderedFrames.length, sheetCount, options.maxFramesPerSheet);
    const sheets: VideoContactSheet[] = [];
    const manifestFrames: VideoDecompositionManifestFrame[] = [];
    try {
        let sheetOffset = 0;
        for (const pageSize of pageSizes) {
            const sheetFrames = orderedFrames.slice(sheetOffset, sheetOffset + pageSize);
            sheetOffset += pageSize;
            const columns = resolveContactSheetColumns(sheetFrames.length, tileWidth, tileHeight, options.columns);
            const rows = Math.max(1, Math.ceil(sheetFrames.length / columns));
            const canvas = document.createElement("canvas");
            canvas.width = columns * tileWidth;
            canvas.height = rows * tileHeight;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("浏览器不支持拼图绘制");
            context.fillStyle = "#111111";
            context.fillRect(0, 0, canvas.width, canvas.height);
            for (let index = 0; index < sheetFrames.length; index += 1) {
                const frame = sheetFrames[index];
                const image = await loadImage(frame.url);
                const x = (index % columns) * tileWidth;
                const y = Math.floor(index / columns) * tileHeight;
                const imageHeight = tileHeight - labelHeight;
                const scale = Math.min(tileWidth / image.width, imageHeight / image.height);
                const width = Math.max(1, Math.round(image.width * scale));
                const height = Math.max(1, Math.round(image.height * scale));
                context.drawImage(image, x + Math.round((tileWidth - width) / 2), y + Math.round((imageHeight - height) / 2), width, height);

                const frameWords = hasWords ? wordsAt(options.words!, frame.timestampSec) : undefined;
                context.fillStyle = "rgba(0, 0, 0, 0.88)";
                context.fillRect(x, y + imageHeight, tileWidth, labelHeight);

                if (frameWords && hasWords) {
                    // Line 1: Grid Label · Frame ID · Timecode
                    context.fillStyle = "#ffffff";
                    context.font = "600 15px Arial, sans-serif";
                    context.fillText(`${frame.gridLabel} / ${frame.frameId} · ${frame.timecode}`, x + 10, y + imageHeight + 20, tileWidth - 20);

                    // Line 2: Active spoken word (warm gold #ffdc80, aligned with Hypit)
                    context.fillStyle = "#ffdc80";
                    context.font = "bold 13px Arial, sans-serif";
                    const activeText = frameWords.active.length > 0
                        ? `正在说: "${frameWords.active.map((w) => w.word).join(" ")}" (${frameWords.active[0].startSec.toFixed(2)}s)`
                        : "正在说: (无重合对白)";
                    context.fillText(activeText, x + 10, y + imageHeight + 42, tileWidth - 20);

                    // Line 3: Spoken context
                    context.fillStyle = "#9ca3af";
                    context.font = "12px Arial, sans-serif";
                    const contextText = frameWords.context.length > 0
                        ? `语境: "${frameWords.context.map((w) => w.word).join("")}"`
                        : "";
                    context.fillText(contextText.slice(0, 36), x + 10, y + imageHeight + 64, tileWidth - 20);
                } else {
                    context.fillStyle = "#ffffff";
                    context.font = "600 18px Arial, sans-serif";
                    context.fillText(`${frame.gridLabel} / ${frame.frameId}`, x + 12, y + imageHeight + 22, tileWidth - 24);
                    context.font = "14px Arial, sans-serif";
                    context.fillText(`${frame.timecode} / ${frame.frameType}`, x + 12, y + imageHeight + 45, tileWidth - 24);
                }

                manifestFrames.push({
                    index: frame.index,
                    frame_id: frame.frameId,
                    grid_label: frame.gridLabel,
                    timestamp_sec: frame.timestampSec,
                    seek_second: frame.seekTimestampSec,
                    timecode: frame.timecode,
                    frame_type: frame.frameType,
                    source: frame.source,
                    ...(frame.sceneScore === undefined ? {} : { scene_score: frame.sceneScore }),
                    ...(frameWords && frameWords.active.length > 0 ? { active_words: frameWords.active.map((w) => w.word).join(" ") } : {}),
                    ...(frameWords && frameWords.context.length > 0 ? { context_words: frameWords.context.map((w) => w.word).join("") } : {}),
                    sheet_index: sheets.length + 1,
                    row: Math.floor(index / columns) + 1,
                    column: (index % columns) + 1,
                });
            }
            const blob = await canvasToBlob(canvas, options.quality ?? 0.82);
            sheets.push({ sheetIndex: sheets.length + 1, frameStart: sheetFrames[0].index, frameEnd: sheetFrames[sheetFrames.length - 1].index, blob, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height, frames: sheetFrames });
        }
    } catch (error) {
        sheets.forEach((sheet) => URL.revokeObjectURL(sheet.url));
        throw error;
    }
    return { sheets, columns: resolveContactSheetColumns(pageSizes[0] || 1, tileWidth, tileHeight, options.columns), manifestFrames };
}

function loadImage(url: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("视频帧缩略图读取失败"));
        image.src = url;
    });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.82) {
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("总拼图导出失败"))), "image/webp", Math.min(1, Math.max(0.1, quality)));
    });
}
