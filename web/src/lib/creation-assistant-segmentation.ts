export type CreationAssistantSegmentMode = "initial" | "independent";

export type CreationAssistantVideoSegment = {
    index: number;
    startSec: number;
    endSec: number;
    durationSec: number;
    mode: CreationAssistantSegmentMode;
    previousSegment?: number;
};

export function segmentCreationAssistantTimeline(targetDurationSec: number, maxSegmentDurationSec: number): CreationAssistantVideoSegment[] {
    const targetDuration = Math.max(1, Math.round(Number(targetDurationSec) || 1));
    const maxSegmentDuration = Math.max(1, Math.round(Number(maxSegmentDurationSec) || targetDuration));
    const segmentCount = Math.max(1, Math.ceil(targetDuration / maxSegmentDuration));
    const baseDuration = Math.floor(targetDuration / segmentCount);
    const remainder = targetDuration % segmentCount;
    const segments: CreationAssistantVideoSegment[] = [];
    let startSec = 0;

    for (let index = 1; index <= segmentCount; index += 1) {
        const durationSec = baseDuration + (index <= remainder ? 1 : 0);
        const endSec = startSec + durationSec;
        segments.push({
            index,
            startSec,
            endSec,
            durationSec,
            mode: index === 1 ? "initial" : "independent",
            ...(index > 1 ? { previousSegment: index - 1 } : {}),
        });
        startSec = endSec;
    }

    return segments;
}

export function formatCreationAssistantSegmentPlan(segments: ReadonlyArray<CreationAssistantVideoSegment>) {
    return segments
        .map((segment) => {
            const mode = segment.mode === "initial" ? "首次生成" : `独立生成并执行第 ${segment.previousSegment} 段结尾状态`;
            return `第 ${segment.index} 段：${segment.startSec}-${segment.endSec} 秒，${mode}`;
        })
        .join("\n");
}

export type AnnotatedVideoShot<T = any> = T & {
    segmentIndex: number;
    shotInSegmentIndex: number;
    globalShotIndex: number;
    segmentPrefix: string;
    segmentTimeAndLensLabel: string;
    calculatedDurationSec: number;
};

export type VideoShotSegmentGroup<T = any> = {
    segmentIndex: number;
    startSec: number;
    endSec: number;
    durationSec: number;
    shots: AnnotatedVideoShot<T>[];
};

/**
 * 格式化秒数为 MM:SS 格式
 */
export function formatTimeSec(sec: number): string {
    const s = Math.max(0, Math.round(sec));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

/**
 * 从 shot 对象提取/计算时长（秒）
 */
export function extractShotDurationSec(shot: any): number {
    if (typeof shot?.durationSec === "number" && shot.durationSec > 0) {
        return Math.max(1, Math.round(shot.durationSec));
    }
    if (typeof shot?.endSec === "number" && typeof shot?.startSec === "number" && shot.endSec > shot.startSec) {
        return Math.max(1, Math.round(shot.endSec - shot.startSec));
    }
    if (shot?.timeRange && typeof shot.timeRange === "string") {
        const match = shot.timeRange.match(/(\d+(?:\.\d+)?)\s*(?:s|秒)?\s*[-~至到]\s*(\d+(?:\.\d+)?)\s*(?:s|秒)?/);
        if (match) {
            const st = parseFloat(match[1]);
            const et = parseFloat(match[2]);
            if (!isNaN(st) && !isNaN(et) && et > st) {
                return Math.max(1, Math.round(et - st));
            }
        }
        const durMatch = shot.timeRange.match(/\((\d+(?:\.\d+)?)\s*(?:s|秒)\)/);
        if (durMatch) {
            const d = parseFloat(durMatch[1]);
            if (!isNaN(d) && d > 0) return Math.max(1, Math.round(d));
        }
    }
    return 4;
}

/**
 * 格式化镜头起止时间区间字符串，例如：00:00 - 00:03 (3s)
 */
export function formatShotTimeRange(shot: any): string {
    const dur = extractShotDurationSec(shot);
    let start = 0;
    let end = dur;
    if (typeof shot?.startSec === "number") {
        start = shot.startSec;
        end = typeof shot?.endSec === "number" ? shot.endSec : start + dur;
    } else if (shot?.timeRange && typeof shot.timeRange === "string") {
        const match = shot.timeRange.match(/(\d+(?:\.\d+)?)\s*(?:s|秒)?\s*[-~至到]\s*(\d+(?:\.\d+)?)\s*(?:s|秒)?/);
        if (match) {
            const st = parseFloat(match[1]);
            const et = parseFloat(match[2]);
            if (!isNaN(st) && !isNaN(et)) {
                start = st;
                end = et;
            }
        }
    }
    return `${formatTimeSec(start)} - ${formatTimeSec(end)} (${Math.round(dur)}s)`;
}

/**
 * 依据“目标视频模型”的上限时长弹性聚合匹配视频段组 (Video Clip / Segment Groups)
 * 核心铁律：
 * 1. 每一行是一个分镜 (shot)；
 * 2. 多行分镜组合为一个视频段，视频段累计时长不能超出视频模型的时长上限 maxDurationSec；
 * 3. 绝不能把一个分镜拆分或跨越两个视频段（分镜原子性完整保持）；
 * 4. 若单个分镜时长本身即 >= maxDurationSec，则该分镜独立成为一个视频段。
 */
export function groupShotsIntoVideoSegments<T extends Record<string, any>>(
    shots: T[],
    maxDurationSec: number = 10,
): {
    segments: VideoShotSegmentGroup<T>[];
    annotatedShots: AnnotatedVideoShot<T>[];
} {
    if (!Array.isArray(shots) || shots.length === 0) {
        return { segments: [], annotatedShots: [] };
    }

    const maxDuration = Math.max(1, Math.round(Number(maxDurationSec) || 10));
    const segments: VideoShotSegmentGroup<T>[] = [];
    const annotatedShots: AnnotatedVideoShot<T>[] = [];

    let currentSegmentIndex = 1;
    let currentSegmentShots: AnnotatedVideoShot<T>[] = [];
    let currentSegmentDuration = 0;
    let currentSegmentStartSec = 0;

    for (let i = 0; i < shots.length; i++) {
        const rawShot = shots[i];
        const shotDuration = extractShotDurationSec(rawShot);

        // 如果加入当前镜头会导致段组超时，且当前段组已有至少一个镜头，则将当前段组封口结案并开启新段
        if (currentSegmentShots.length > 0 && currentSegmentDuration + shotDuration > maxDuration) {
            segments.push({
                segmentIndex: currentSegmentIndex,
                startSec: currentSegmentStartSec,
                endSec: currentSegmentStartSec + currentSegmentDuration,
                durationSec: currentSegmentDuration,
                shots: currentSegmentShots,
            });
            currentSegmentStartSec += currentSegmentDuration;
            currentSegmentIndex += 1;
            currentSegmentShots = [];
            currentSegmentDuration = 0;
        }

        const shotInSegmentIndex = currentSegmentShots.length + 1;
        const segmentPrefix = `段${currentSegmentIndex}-镜${shotInSegmentIndex}`;
        const timeRangeStr = formatShotTimeRange(rawShot);
        const shotTypeLabel = rawShot.shotType ? ` [${String(rawShot.shotType).toUpperCase()}]` : "";
        const segmentTimeAndLensLabel = `${segmentPrefix} · ${timeRangeStr}${shotTypeLabel}`;

        const annotated: AnnotatedVideoShot<T> = {
            ...rawShot,
            segmentIndex: currentSegmentIndex,
            shotInSegmentIndex,
            globalShotIndex: i + 1,
            segmentPrefix,
            segmentTimeAndLensLabel,
            calculatedDurationSec: shotDuration,
        };

        currentSegmentShots.push(annotated);
        annotatedShots.push(annotated);
        currentSegmentDuration += shotDuration;
    }

    // 封口收尾最后一个段组
    if (currentSegmentShots.length > 0) {
        segments.push({
            segmentIndex: currentSegmentIndex,
            startSec: currentSegmentStartSec,
            endSec: currentSegmentStartSec + currentSegmentDuration,
            durationSec: currentSegmentDuration,
            shots: currentSegmentShots,
        });
    }

    return { segments, annotatedShots };
}

/**
 * 拼接原脚本公共描述内容 + 该分镜描述内容，用于分镜表第 1 列【参考脚本】插槽
 */
export function buildShotReferenceScript(params: {
    commonOverview?: string;
    shot: any;
    shotIndex: number;
}): string {
    const common = (params.commonOverview || "").trim();
    const s = params.shot || {};
    const shotDescParts: string[] = [];

    if (s.plotDescription?.trim()) {
        shotDescParts.push(`【剧情/画面】${s.plotDescription.trim()}`);
    } else if (s.visualContent?.trim()) {
        shotDescParts.push(`【剧情/画面】${s.visualContent.trim()}`);
    } else if (s.visualSubject?.trim()) {
        shotDescParts.push(`【视觉主体】${s.visualSubject.trim()}`);
    }

    const lines = (s.lines || s.dialogue || s.voiceLine || "").trim();
    if (lines) {
        shotDescParts.push(`【原片台词/对白】${lines}`);
    }

    if (s.cameraMovement || s.scaleAndAngle || s.camera) {
        const cam = [s.scaleAndAngle, s.cameraMovement, s.camera].filter(Boolean).join(" ");
        if (cam) shotDescParts.push(`【景别运镜】${cam}`);
    }

    if (s.hookType) shotDescParts.push(`【吸睛钩子】${s.hookType}`);
    if (s.narrativeFunction) shotDescParts.push(`【叙事功能】${s.narrativeFunction}`);

    const shotDesc = shotDescParts.length > 0 ? shotDescParts.join("\n") : (lines || "无特定分镜描述");

    if (common) {
        return `【原脚本公共描述】\n${common}\n\n【第 ${params.shotIndex + 1} 镜参考描述】\n${shotDesc}`.trim();
    }
    return `【第 ${params.shotIndex + 1} 镜参考描述】\n${shotDesc}`.trim();
}

/**
 * 严格清洗净化“创意提示词”：杜绝在 UI 界面或分镜中暴露任何原始 JSON 格式代码块或语法，转换为电影级自然语言与清晰段落
 */
export function cleanCreativePromptText(text: string): string {
    if (!text || typeof text !== "string") return "";
    let cleaned = text.trim();

    // 剔除 markdown json 代码块包裹
    if (cleaned.startsWith("```json") || cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    }

    // 尝试如果整个字符串是 JSON 对象或数组，解析后转换为优美段落
    if ((cleaned.startsWith("{") && cleaned.endsWith("}")) || (cleaned.startsWith("[") && cleaned.endsWith("]"))) {
        try {
            const parsed = JSON.parse(cleaned);
            if (typeof parsed === "object" && parsed !== null) {
                const parts: string[] = [];
                const p = Array.isArray(parsed) ? parsed[0] : parsed;
                if (p.overview) parts.push(`【全局基调】${p.overview}`);
                if (p.style) parts.push(`【风格质感】${p.style}`);
                if (p.camera || p.motionPrompt) parts.push(`【物理运镜与动效】${p.motionPrompt || p.camera}`);
                if (p.lines || p.dialogue) parts.push(`【台词声音】${p.lines || p.dialogue}`);
                if (p.creativePrompt) parts.push(p.creativePrompt);
                if (parts.length > 0) return parts.join("\n\n");
            }
        } catch {}
    }

    // 剔除局部散落的 JSON 键值对花括号残片，如 {"shotNumber": 1}
    cleaned = cleaned
        .replace(/\{"(?:shotNumber|shotType|timeRange|durationSec|lines|imagePrompt|motionPrompt)":[^}]+\}/g, "")
        .replace(/"(?:shotNumber|shotType|timeRange|durationSec|lines|imagePrompt|motionPrompt)":\s*(?:"[^"]*"|\d+),?/g, "")
        .replace(/[{}]+/g, "");

    // 剔除未填充的占位符/模板标签（如 [痛点词]、[产品名]、[核心卖点]、[痛点表现]、[品牌名] 等）
    cleaned = cleaned
        .replace(/\[(?:痛点词|产品名|核心卖点|痛点表现|品牌名|使用场景|利益点|情绪词|目标受众|核心功能|痛点场景|产品亮点|行业词|主张词|金句)\]/g, "")
        .replace(/面对镜头自然表达：[“”""'']+/g, "")
        .replace(/自然表达：[“”""'']+/g, "")
        .replace(/说出：[“”""'']+/g, "")
        .replace(/[“”""'']{2}/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();

    return cleaned;
}

