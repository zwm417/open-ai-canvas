export const VIDEO_CREATION_PLAN_SCHEMA_VERSION = "video-creation-plan-v2" as const;
export const VIDEO_SEGMENT_HANDOFF_SCHEMA_VERSION = "video-segment-handoff-v1" as const;

export type VideoCreationSource = "config" | "reference_video";
export type VideoSegmentExecutionMode = "initial" | "native_continuation" | "tail_frame" | "independent";

export type VideoShotBlock = {
    blockId: string;
    startSec: number;
    endSec: number;
    text: string;
};

export type VideoCreationSegment = {
    segmentId: string;
    index: number;
    startSec: number;
    endSec: number;
    requestDurationSec: number;
    keepDurationSec: number;
    mode: VideoSegmentExecutionMode;
    shotBlockIds: string[];
    continuityIn: string;
    continuityOut: string;
};

export type VideoCreationPlan = {
    schemaVersion: typeof VIDEO_CREATION_PLAN_SCHEMA_VERSION;
    source: VideoCreationSource;
    scriptSnapshot: string;
    scriptHash: string;
    targetDurationSec: number;
    model: string;
    aspectRatio: string;
    resolution: string;
    timeFormat: "seconds";
    shotBlocks: VideoShotBlock[];
    segments: VideoCreationSegment[];
    warnings?: string[];
};

export type VideoSegmentOutput = {
    segmentId: string;
    index: number;
    startSec: number;
    endSec: number;
    keepDurationSec: number;
    storageKey: string;
    url: string;
    width?: number;
    height?: number;
    durationMs?: number;
    audioPresent?: boolean;
};

export type VideoSegmentHandoff = {
    batchId: string;
    schemaVersion: typeof VIDEO_SEGMENT_HANDOFF_SCHEMA_VERSION;
    targetDurationSec: number;
    aspectRatio: string;
    resolution: string;
    segments: VideoSegmentOutput[];
};

export type ScriptTimeRange = { startSec: number; endSec: number };

export function parseScriptTimeRange(value: string, format: "seconds" | "clock" = "seconds"): ScriptTimeRange | null {
    const cleaned = value.replace(/[（）]/g, "").replace(/\*\*/g, "").trim();
    const parts = cleaned.match(/^([0-9]+(?:\.[0-9]+)?)(?:\s*(?:秒|s))?\s*[-~至]\s*([0-9]+(?:\.[0-9]+)?)(?:\s*(?:秒|s))?$/i);
    if (parts) return makeTimeRange(Number(parts[1]), Number(parts[2]));
    if (format !== "clock") return null;
    const clockParts = cleaned.match(/^(\d+):(\d+(?:\.\d+)?)\s*[-~至]\s*(\d+):(\d+(?:\.\d+)?)$/);
    if (!clockParts) return null;
    const startSeconds = Number(clockParts[1]) * 60 + Number(clockParts[2]);
    const endSeconds = Number(clockParts[3]) * 60 + Number(clockParts[4]);
    if (Number(clockParts[2]) >= 60 || Number(clockParts[4]) >= 60) return null;
    return makeTimeRange(startSeconds, endSeconds);
}

export function extractScriptShotBlocks(script: string, format: "seconds" | "clock" = "seconds") {
    const blocks: VideoShotBlock[] = [];
    const errors: string[] = [];
    const lines = script.split(/\r?\n/);
    const rangePattern = /(?:时间段\s*[:：]\s*)?((?:\d+(?:\.\d+)?\s*(?:秒|s)?\s*[-~至]\s*\d+(?:\.\d+)?\s*(?:秒|s)?)|(?:\d+:\d+(?:\.\d+)?\s*[-~至]\s*\d+:\d+(?:\.\d+)?))/i;
    lines.forEach((line, lineIndex) => {
        const match = line.replace(/\*\*/g, "").match(rangePattern);
        if (!match) return;
        const range = parseScriptTimeRange(match[1], format);
        if (!range) {
            errors.push(`第 ${lineIndex + 1} 行时间段无法解析`);
            return;
        }
        blocks.push({ blockId: `shot-${blocks.length + 1}`, ...range, text: line.trim() });
    });
    return { blocks, errors };
}

export type BuildVideoCreationPlanInput = {
    source: VideoCreationSource;
    script: string;
    targetDurationSec: number;
    model: string;
    aspectRatio: string;
    resolution: string;
    maxSegmentDurationSec: number;
    minSegmentDurationSec?: number;
    fixedSegmentDurationSec?: number;
};

export function buildVideoCreationPlan(input: BuildVideoCreationPlanInput): VideoCreationPlan {
    const targetDurationSec = normalizeDuration(input.targetDurationSec);
    const maxSegmentDurationSec = Math.max(1, normalizeDuration(input.maxSegmentDurationSec || targetDurationSec));
    const minSegmentDurationSec = Math.min(maxSegmentDurationSec, Math.max(1, normalizeDuration(input.minSegmentDurationSec || 4)));
    const fixedSegmentDurationSec = input.fixedSegmentDurationSec ? Math.max(minSegmentDurationSec, normalizeDuration(input.fixedSegmentDurationSec)) : undefined;
    const extracted = extractScriptShotBlocks(input.script);
    const durations = createSegmentDurations(targetDurationSec, maxSegmentDurationSec, minSegmentDurationSec, fixedSegmentDurationSec);
    const segments: VideoCreationSegment[] = [];
    let startSec = 0;
    durations.forEach(({ requestDurationSec, keepDurationSec }, index) => {
        const endSec = roundSeconds(startSec + keepDurationSec);
        const shotBlockIds = extracted.blocks.filter((block) => block.endSec > startSec && block.startSec < endSec).map((block) => block.blockId);
        segments.push({
            segmentId: `segment-${index + 1}`,
            index: index + 1,
            startSec: roundSeconds(startSec),
            endSec,
            requestDurationSec,
            keepDurationSec,
            mode: index === 0 ? "initial" : "independent",
            shotBlockIds,
            continuityIn: index === 0 ? "从完整脚本的开场状态开始" : `承接第 ${index} 段结束时的主体、动作、视线、光线、道具和声音状态`,
            continuityOut: index === durations.length - 1 ? "完成目标时长并自然收束" : `保留第 ${index + 1} 段开场所需的主体、动作、视线、光线、道具和声音状态`,
        });
        startSec = endSec;
    });
    const warnings = [...extracted.errors];
    if (targetDurationSec < minSegmentDurationSec) warnings.push(`目标时长低于模型最小时长，首段请求将按 ${minSegmentDurationSec} 秒提交并保留 ${targetDurationSec} 秒`);
    return {
        schemaVersion: VIDEO_CREATION_PLAN_SCHEMA_VERSION,
        source: input.source,
        scriptSnapshot: input.script,
        scriptHash: hashCreationScript(input.script),
        targetDurationSec,
        model: input.model,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        timeFormat: "seconds",
        shotBlocks: extracted.blocks,
        segments,
        ...(warnings.length ? { warnings } : {}),
    };
}

export function formatSegmentTimeRange(startSec: number, endSec: number) {
    return `${formatSeconds(startSec)}-${formatSeconds(endSec)}秒`;
}

export function hashCreationScript(value: string) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

function createSegmentDurations(targetDurationSec: number, maxSegmentDurationSec: number, minSegmentDurationSec: number, fixedSegmentDurationSec?: number) {
    if (fixedSegmentDurationSec) {
        const count = Math.max(1, Math.ceil(targetDurationSec / fixedSegmentDurationSec));
        return Array.from({ length: count }, (_, index) => ({
            requestDurationSec: fixedSegmentDurationSec,
            keepDurationSec: roundSeconds(Math.min(fixedSegmentDurationSec, Math.max(0, targetDurationSec - index * fixedSegmentDurationSec))),
        }));
    }
    const count = Math.max(1, Math.ceil(targetDurationSec / maxSegmentDurationSec));
    if (count === 1) return [{ requestDurationSec: Math.max(minSegmentDurationSec, targetDurationSec), keepDurationSec: targetDurationSec }];
    const baseDuration = Math.floor(targetDurationSec / count);
    const remainder = targetDurationSec - baseDuration * count;
    const wholeRemainder = Math.floor(remainder);
    const fractionalRemainder = roundSeconds(remainder - wholeRemainder);
    return Array.from({ length: count }, (_, index) => {
        const keepDurationSec = roundSeconds(baseDuration + (index < wholeRemainder ? 1 : 0) + (index === count - 1 ? fractionalRemainder : 0));
        return { requestDurationSec: Math.max(minSegmentDurationSec, keepDurationSec), keepDurationSec };
    });
}

function makeTimeRange(startSec: number, endSec: number): ScriptTimeRange | null {
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || startSec < 0 || endSec <= startSec) return null;
    return { startSec: roundSeconds(startSec), endSec: roundSeconds(endSec) };
}

function normalizeDuration(value: number) {
    return Math.max(0, roundSeconds(Number(value) || 0));
}

function roundSeconds(value: number) {
    return Math.round(value * 10) / 10;
}

function formatSeconds(value: number) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/0$/, "");
}
