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
    if (!value) return null;
    const cleaned = value.replace(/[（）()【】\[\]]/g, " ").replace(/\*\*/g, "").trim();

    // 优先尝试分秒时钟格式 (e.g. 00:00 - 00:08, 0:00-0:08)
    const clockMatch = cleaned.match(/(\d+):(\d+(?:\.\d+)?)\s*(?:秒|s)?\s*[-~至到—–]\s*(\d+):(\d+(?:\.\d+)?)\s*(?:秒|s)?/i);
    if (clockMatch) {
        const startSeconds = Number(clockMatch[1]) * 60 + Number(clockMatch[2]);
        const endSeconds = Number(clockMatch[3]) * 60 + Number(clockMatch[4]);
        if (Number(clockMatch[2]) < 60 && Number(clockMatch[4]) < 60) {
            return makeTimeRange(startSeconds, endSeconds);
        }
    }

    // 尝试秒数格式 (e.g. 0-8秒, 0s-8s, 0 - 8, 0-10秒 起势与痛点引入)
    const secMatch = cleaned.match(/(?:^|[^\d:.])([0-9]+(?:\.[0-9]+)?)(?:\s*(?:秒|s))?\s*[-~至到—–]\s*([0-9]+(?:\.[0-9]+)?)(?:\s*(?:秒|s)?)(?:[^\d.]|$)/i);
    if (secMatch) {
        return makeTimeRange(Number(secMatch[1]), Number(secMatch[2]));
    }

    return null;
}

const CHINESE_NUMERALS: Record<string, number> = {
    "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
    "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
    "十一": 11, "十二": 12, "十三": 13, "十四": 14, "十五": 15,
    "十六": 16, "十七": 17, "十八": 18, "十九": 19, "二十": 20,
};

export function parseSegmentIndex(val: string): number {
    const trimmed = val.trim();
    const parsed = parseInt(trimmed, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
    return CHINESE_NUMERALS[trimmed] || 1;
}

export type VideoScriptSegmentBlock = {
    segmentIndex: number;
    startSec: number;
    endSec: number;
    header: string;
    content: string;
};

/**
 * 标准剧本一级物理分段标题通用正则匹配器：
 * 完整覆盖并兼容：
 * - #### 【视频分段一：00:00 - 00:08】（首次生成）
 * - #### 【视频分段1：00:00 - 00:08】
 * - #### 【第一分段：0-10秒 起势与痛点引入】
 * - #### 【第 1 分段：0-10秒】
 * - #### 【分段一：0-10秒】
 * - #### 【分段1：0-10秒】
 * - #### 第一分段：0-10秒
 * - ### 视频分段一：0-8秒
 */
export const SCRIPT_SEGMENT_HEADER_REGEX = /^\s*#{0,5}\s*【?(?:(?:视频)?(?:第\s*)?([一二三四五六七八九十\d]+)\s*(?:个)?(?:视频)?分段|(?:视频)?分段\s*(?:第\s*)?([一二三四五六七八九十\d]+))/i;

/**
 * 提取一级物理分段容器（如：#### 【视频分段一：00:00 - 00:08】 或 【第一分段：0-10秒 起势与痛点引入】）
 * 采用包裹式（Block-Wrapping）提取：从当前标题行开始，包裹截取至下一分段标题行之前（或文本末尾），
 * 确保该物理分段内的全部子镜头、对白、口播、场景与衔接态 100% 完整保留。
 */
export function extractScriptSegmentBlocks(script: string): VideoScriptSegmentBlock[] {
    if (!script || !script.trim()) return [];
    const blocks: VideoScriptSegmentBlock[] = [];
    const lines = script.split(/\r?\n/);

    let currentSegment: { index: number; startSec: number; endSec: number; header: string; lines: string[] } | null = null;

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const cleaned = rawLine.replace(/\*\*/g, "").trim();
        const match = cleaned.match(SCRIPT_SEGMENT_HEADER_REGEX);

        if (match) {
            if (currentSegment) {
                blocks.push({
                    segmentIndex: currentSegment.index,
                    startSec: currentSegment.startSec,
                    endSec: currentSegment.endSec,
                    header: currentSegment.header,
                    content: currentSegment.lines.join("\n").trim(),
                });
                currentSegment = null;
            }

            const range = parseScriptTimeRange(cleaned);
            const indexStr = match[1] || match[2] || "1";
            const index = parseSegmentIndex(indexStr);
            const startSec = range ? range.startSec : 0;
            const endSec = range ? range.endSec : 0;

            currentSegment = {
                index,
                startSec,
                endSec,
                header: rawLine.trim(),
                lines: [],
            };
        } else {
            if (currentSegment) {
                currentSegment.lines.push(rawLine);
            }
        }
    }

    if (currentSegment) {
        blocks.push({
            segmentIndex: currentSegment.index,
            startSec: currentSegment.startSec,
            endSec: currentSegment.endSec,
            header: currentSegment.header,
            content: currentSegment.lines.join("\n").trim(),
        });
    }

    return blocks;
}

/**
 * 提取剧本中的镜头块（Shot Blocks）：
 * 采用多行包裹式（Multi-line Block Wrapping）提取，从时间戳起幅行开始，向后收集所有属性行
 * （景别/角度、场景与对白、口播内容、真人感细节、光线、音效等），直至下一镜头时间戳或分段结束，
 * 彻底废除旧版单行遍历丢弃多行对白的问题。
 */
export function extractScriptShotBlocks(script: string, format: "seconds" | "clock" = "seconds") {
    const blocks: VideoShotBlock[] = [];
    const errors: string[] = [];
    if (!script || !script.trim()) return { blocks, errors, segmentBlocks: [] as VideoScriptSegmentBlock[] };

    // 优先：检查是否包含完整的一级分段容器
    const segmentBlocks = extractScriptSegmentBlocks(script);

    const lines = script.split(/\r?\n/);
    const shotHeaderRegex = /^\s*#{0,5}\s*(?:\*\*)?(?:(?:镜头|分镜|SHOT|Shot)\s*\d+|(?:时间段)\s*\d*|[【\[]?(?:镜头|时间段)[】\]]?)?\s*[:：\s]*[（\(]?((?:\d+(?:\.\d+)?\s*(?:秒|s)?\s*[-~至到—–]\s*\d+(?:\.\d+)?\s*(?:秒|s)?)|(?:\d+:\d+(?:\.\d+)?\s*[-~至到—–]\s*\d+:\d+(?:\.\d+)?))[）\)]?\s*(?:\*\*)?\s*[:：]?/i;

    let currentShot: { blockId: string; startSec: number; endSec: number; lines: string[] } | null = null;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const rawLine = lines[lineIndex];
        const cleaned = rawLine.replace(/\*\*/g, "").trim();

        // 遇到一级分段容器标题行，封口结算上一个镜头
        if (SCRIPT_SEGMENT_HEADER_REGEX.test(cleaned)) {
            if (currentShot) {
                blocks.push({
                    blockId: currentShot.blockId,
                    startSec: currentShot.startSec,
                    endSec: currentShot.endSec,
                    text: currentShot.lines.join("\n").trim(),
                });
                currentShot = null;
            }
            continue;
        }

        const match = cleaned.match(shotHeaderRegex);
        if (match) {
            if (currentShot) {
                blocks.push({
                    blockId: currentShot.blockId,
                    startSec: currentShot.startSec,
                    endSec: currentShot.endSec,
                    text: currentShot.lines.join("\n").trim(),
                });
                currentShot = null;
            }

            const range = parseScriptTimeRange(match[1], format);
            if (!range) {
                errors.push(`第 ${lineIndex + 1} 行时间段无法解析: ${match[1]}`);
                continue;
            }

            currentShot = {
                blockId: `shot-${blocks.length + 1}`,
                startSec: range.startSec,
                endSec: range.endSec,
                lines: [rawLine],
            };
        } else {
            if (currentShot) {
                currentShot.lines.push(rawLine);
            }
        }
    }

    if (currentShot) {
        blocks.push({
            blockId: currentShot.blockId,
            startSec: currentShot.startSec,
            endSec: currentShot.endSec,
            text: currentShot.lines.join("\n").trim(),
        });
    }

    // 若未解析出具体的二级镜头时间戳，但解析出了明确的一级分段容器，将每个分段作为一个完整的 block 返回
    if (blocks.length === 0 && segmentBlocks.length > 0) {
        segmentBlocks.forEach((sb) => {
            blocks.push({
                blockId: `segment-block-${sb.segmentIndex}`,
                startSec: sb.startSec,
                endSec: sb.endSec,
                text: sb.header ? `${sb.header}\n${sb.content}`.trim() : sb.content.trim(),
            });
        });
    }

    return { blocks, errors, segmentBlocks };
}

// @opc-feature: isolated-segment-prompt [start]
/**
 * 提取剧本开头的全局共用设定（视频总览、场景光线、全局角色设定），
 * 截止到首个【视频分段】/【第一分段】或首个带时间段标记的镜头之前，作为所有分段的通用前缀。
 */
export function extractSharedScriptHeader(script: string): string {
    if (!script || !script.trim()) return "";
    const lines = script.split(/\r?\n/);
    const headerLines: string[] = [];
    const shotPattern = /^\s*#{0,5}\s*(?:\*\*)?(?:(?:镜头|分镜|SHOT|Shot)\s*\d+|(?:时间段)\s*\d*|[【\[]?(?:镜头|时间段)[】\]]?)?\s*[:：\s]*[（\(]?((?:\d+(?:\.\d+)?\s*(?:秒|s)?\s*[-~至到—–]\s*\d+(?:\.\d+)?\s*(?:秒|s)?)|(?:\d+:\d+(?:\.\d+)?\s*[-~至到—–]\s*\d+:\d+(?:\.\d+)?))[）\)]?/i;

    for (const line of lines) {
        const cleaned = line.replace(/\*\*/g, "").trim();
        if (SCRIPT_SEGMENT_HEADER_REGEX.test(cleaned) || shotPattern.test(cleaned)) {
            break;
        }
        headerLines.push(line);
    }
    return headerLines.join("\n").trim();
}

/**
 * 非结构化无时间轴纯文本脚本：按段落/句子在逻辑上切分提取属于当前分段的内容。
 * @deprecated 在商业生产多视频段生成中已被生成前安全门禁与包裹式解析器替代，仅作为历史纯文本回退兜底保留。
 */
export function extractProportionalScriptSlice(script: string, segmentIndex: number, totalSegments: number): string {
    if (!script || totalSegments <= 1) return script.trim();
    const cleanText = script.trim();
    // 优先按双换行段落切分
    const paragraphs = cleanText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    if (paragraphs.length >= totalSegments) {
        const itemsPerSeg = Math.ceil(paragraphs.length / totalSegments);
        const start = (segmentIndex - 1) * itemsPerSeg;
        const end = Math.min(paragraphs.length, start + itemsPerSeg);
        const slice = paragraphs.slice(start, end).join("\n\n");
        if (slice.trim()) return slice;
    }
    // 次优按主要标点句子切分
    const sentences = cleanText.split(/(?<=[。！？!?\n])/).map((s) => s.trim()).filter(Boolean);
    if (sentences.length >= totalSegments) {
        const itemsPerSeg = Math.ceil(sentences.length / totalSegments);
        const start = (segmentIndex - 1) * itemsPerSeg;
        const end = Math.min(sentences.length, start + itemsPerSeg);
        const slice = sentences.slice(start, end).join("");
        if (slice.trim()) return slice;
    }
    return cleanText;
}

/**
 * 生成前安全熔断门禁（Fail-Closed Gatekeeper）：
 * 商业级防高额模型浪费铁律：若任务判定需分段生成（segments.length > 1），
 * 提交生成及扣费前必须严格断言提示词已成功解析出完整、连续且内容非空的分段结构；
 * 若解析不到分段，立即阻断报错并拦截提交，严禁静默盲切，严禁扣减用户高昂积分。
 */
export function validateVideoCreationPlanForGeneration(plan: VideoCreationPlan): { valid: boolean; error?: string } {
    if (!plan || !Array.isArray(plan.segments)) {
        return { valid: false, error: "视频生成计划无效" };
    }

    // 单段生成无需分段结构，直接放行
    if (plan.segments.length <= 1) {
        return { valid: true };
    }

    // 多段生成必须有分段镜头块或分段容器
    if (!plan.shotBlocks || plan.shotBlocks.length === 0) {
        return {
            valid: false,
            error: `当前设置时长（${plan.targetDurationSec}秒）超出模型单段上限，需分段生成（共 ${plan.segments.length} 段）。但在提示词中未能检测到有效的分段标记（如【视频分段一】、【视频分段二】或镜头时间轴）。已拦截提交以防扣费浪费，请在提示词中补充标准分段标记或调整视频时长。`,
        };
    }

    for (const segment of plan.segments) {
        if (!segment.shotBlockIds || segment.shotBlockIds.length === 0) {
            return {
                valid: false,
                error: `分段生成校验失败：第 ${segment.index} 段（${formatSegmentTimeRange(segment.startSec, segment.endSec)}）未匹配到对应的分段提示词内容。已拦截提交以防扣费浪费，请核对提示词中的分段标记与时间范围。`,
            };
        }

        const segmentContent = segment.shotBlockIds
            .map((id) => plan.shotBlocks.find((b) => b.blockId === id)?.text)
            .filter((t): t is string => Boolean(t && t.trim()))
            .join("\n")
            .trim();

        if (!segmentContent) {
            return {
                valid: false,
                error: `分段生成校验失败：第 ${segment.index} 段（${formatSegmentTimeRange(segment.startSec, segment.endSec)}）提示词内容为空。已拦截提交以防扣费浪费。`,
            };
        }
    }

    return { valid: true };
}
// @opc-feature: isolated-segment-prompt [end]

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
    const collectedShotBlocksMap = new Map<string, VideoShotBlock>();
    extracted.blocks.forEach((b) => collectedShotBlocksMap.set(b.blockId, b));

    let startSec = 0;

    durations.forEach(({ requestDurationSec, keepDurationSec }, index) => {
        const endSec = roundSeconds(startSec + keepDurationSec);

        let matchedBlocks: VideoShotBlock[] = [];
        // 优先：若存在显式声明的一级分段容器且数量充足（>= 计划分段数），一级容器为最权威、包裹最完整的物理分段载体
        if (extracted.segmentBlocks && extracted.segmentBlocks.length >= durations.length && extracted.segmentBlocks.length > index) {
            const sb = extracted.segmentBlocks[index];
            const blockId = `segment-block-${sb.segmentIndex}`;
            const blockText = sb.header ? `${sb.header}\n${sb.content}`.trim() : sb.content.trim();
            const segBlock: VideoShotBlock = {
                blockId,
                startSec: sb.startSec || startSec,
                endSec: sb.endSec || endSec,
                text: blockText,
            };
            collectedShotBlocksMap.set(blockId, segBlock);
            matchedBlocks = [segBlock];
        } else {
            // 次优：按时间区间重叠匹配二级镜头块
            matchedBlocks = extracted.blocks.filter((block) => block.endSec > startSec && block.startSec < endSec);

            // 再次兜底：若二级镜头时间未重叠，但存在对应序号的一级分段容器
            if (matchedBlocks.length === 0 && extracted.segmentBlocks && extracted.segmentBlocks.length > index) {
                const sb = extracted.segmentBlocks[index];
                const blockId = `segment-block-${sb.segmentIndex}`;
                const blockText = sb.header ? `${sb.header}\n${sb.content}`.trim() : sb.content.trim();
                const segBlock: VideoShotBlock = {
                    blockId,
                    startSec: sb.startSec || startSec,
                    endSec: sb.endSec || endSec,
                    text: blockText,
                };
                collectedShotBlocksMap.set(blockId, segBlock);
                matchedBlocks = [segBlock];
            }
        }

        const shotBlockIds = matchedBlocks.map((block) => block.blockId);

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
    if (targetDurationSec < minSegmentDurationSec) {
        warnings.push(`目标时长低于模型最小时长，首段请求将按 ${minSegmentDurationSec} 秒提交并保留 ${targetDurationSec} 秒`);
    }

    if (durations.length > 1) {
        segments.forEach((seg) => {
            if (seg.shotBlockIds.length === 0) {
                warnings.push(`第 ${seg.index} 段（${formatSegmentTimeRange(seg.startSec, seg.endSec)}）未匹配到对应的分段或镜头提示词`);
            }
        });
    }

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
        shotBlocks: Array.from(collectedShotBlocksMap.values()),
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
