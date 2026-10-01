import type { CreationAssistantPlatform, CreationAssistantScriptType, CreationAssistantShootingStyle } from "@/lib/creation-assistant-catalog";
import type { CreationAssistantFileSummary, CreationAssistantInsightSection } from "@/stores/use-creation-assistant-store";
import type { CreationAssistantVideoSegment } from "@/lib/creation-assistant-segmentation";

export const CREATION_ASSISTANT_ANALYSIS_PLUGIN_ID = "creation-assistant-analysis";
export const CREATION_ASSISTANT_ANALYSIS_NODE_TYPE = "creation-assistant-analysis:analyzer";

export const CREATION_ASSISTANT_SCRIPT_PLUGIN_ID = "creation-assistant-script";
export const CREATION_ASSISTANT_SCRIPT_NODE_TYPE = "creation-assistant-script:generator";

export const CREATION_ASSISTANT_REF_SCRIPT_PLUGIN_ID = "creation-assistant-ref-script";
export const CREATION_ASSISTANT_REF_SCRIPT_NODE_TYPE = "creation-assistant-ref-script:generator";

export type MaterialAnalysisMeta = {
    model?: string;
    version?: "material-analysis.v1";
    sourceBindings?: Array<{ nodeId: string; role: "media" | "context"; enabled: boolean; order: number }>;
    localSources?: Array<{ id: string; name: string; kind: "image" | "video" | "audio"; storageKey?: string; url?: string; mimeType?: string; width?: number; height?: number; durationMs?: number }>;
    status?: "idle" | "preparing" | "running" | "success" | "error" | "cancelled";
    runId?: string;
    errorDetails?: string;
    progress?: { stage: string; percent: number; message: string };
    result?: {
        version: "material-analysis-result.v1";
        generatedAt: number;
        sourceIds: string[];
        fileSummaries: CreationAssistantFileSummary[];
        insightSections: CreationAssistantInsightSection[];
    };
    autoConnectDownstream?: boolean;
    customRules?: string;
    replaceBuiltInPrompt?: boolean;
    promptRules?: string;
    prompt?: string;
    content?: string;
    updatedAt?: number;
};

export type ConfigScriptMeta = {
    model?: string;
    version?: "config-script.v1";
    inputBindings?: Array<{ nodeId: string; role: "analysis_result" | "reference_script" | "custom_rules" | "context"; enabled: boolean; order: number }>;
    inlineInputs?: Array<{ id: string; source: "inline" | "text_file"; name: string; role: string; text: string; enabled: boolean }>;
    businessScenario?: "ecommerce" | "local_life";
    language?: "zh" | "en";
    generationMethod?: "standard" | "reference_script";
    scriptType?: CreationAssistantScriptType;
    shootingStyle?: CreationAssistantShootingStyle;
    durationSec?: number;
    primaryPlatform?: CreationAssistantPlatform;
    secondaryPlatforms?: CreationAssistantPlatform[];
    additionalNotes?: string;
    videoModel?: string;
    customRules?: string;
    customPrompt?: string;
    useCustomPrompt?: boolean;
    replaceBuiltInPrompt?: boolean;
    promptRules?: string;
    status?: "idle" | "running" | "success" | "error" | "cancelled";
    runId?: string;
    errorDetails?: string;
    result?: {
        version: "config-script-result.v1";
        script: string;
        generatedAt: number;
        videoModel?: string;
        segmentPlan?: CreationAssistantVideoSegment[];
    };
    prompt?: string;
    content?: string;
    exportedScriptNodeId?: string;
    updatedAt?: number;
};

export type RefScriptTrackClassic = {
    script?: string;
    status?: "idle" | "running" | "success" | "error" | "cancelled";
    errorDetails?: string;
    durationSec?: number;
    referenceScriptDurationSec?: number;
    referenceScript?: string;
    additionalNotes?: string;
    customRules?: string;
    customPrompt?: string;
    useCustomPrompt?: boolean;
    replaceBuiltInPrompt?: boolean;
    promptRules?: string;
    businessScenario?: "ecommerce" | "local_life";
    language?: "zh" | "en";
    segmentPlan?: CreationAssistantVideoSegment[];
    updatedAt?: number;
};

export type RefScriptTrackDirector = {
    script?: string;
    status?: "idle" | "running" | "success" | "error" | "cancelled";
    errorDetails?: string;
    masterSlots?: any;
    variations?: any[];
    activeVariationId?: string;
    assetSlots?: any[];
    structuredShots?: any[];
    userRequirement?: string;
    productSellingPoints?: string;
    masterVisualAnchor?: string;
    motionStyle?: string;
    customRules?: string;
    customPrompt?: string;
    useCustomPrompt?: boolean;
    targetVideoModel?: string;
    enableVisual?: boolean;
    enableVoice?: boolean;
    enableVideo?: boolean;
    generatedTableIds?: {
        masterTableId?: string;
        voiceTableId?: string;
        storyboardTableId?: string;
    };
    updatedAt?: number;
};

export type RefScriptMeta = {
    model?: string;
    version?: "ref-script.v1";
    inputBindings?: Array<{ nodeId: string; role: "reference_video" | "analysis_result" | "context"; enabled: boolean; order: number }>;
    businessScenario?: "ecommerce" | "local_life";
    language?: "zh" | "en";
    durationSec?: number;
    referenceScriptDurationSec?: number;
    referenceScript?: string;
    additionalNotes?: string;
    customRules?: string;
    customPrompt?: string;
    useCustomPrompt?: boolean;
    replaceBuiltInPrompt?: boolean;
    promptRules?: string;
    videoModel?: string;
    activeTab?: "classic" | "director";
    // 双轨独立隔离槽位 (Dual-Track Isolation Slots)
    classic?: RefScriptTrackClassic;
    director?: RefScriptTrackDirector;
    enableVisual?: boolean;
    enableVoice?: boolean;
    enableVideo?: boolean;
    targetVideoModel?: string;
    userRequirement?: string;
    productSellingPoints?: string;
    masterVisualAnchor?: string;
    motionStyle?: string;
    status?: "idle" | "running" | "success" | "error" | "cancelled";
    runId?: string;
    errorDetails?: string;
    result?: {
        version: "ref-script-result.v1";
        script: string;
        generatedAt: number;
        videoModel?: string;
        segmentPlan?: CreationAssistantVideoSegment[];
    };
    prompt?: string;
    content?: string;
    generatedTableIds?: {
        masterTableId?: string;
        voiceTableId?: string;
        storyboardTableId?: string;
    };
    masterSlots?: any;
    variations?: any[];
    activeVariationId?: string;
    isUserEditedReferenceScript?: boolean;
    updatedAt?: number;
};

export type CreationAssistantAnalysisNodeState = MaterialAnalysisMeta;
export type CreationAssistantScriptNodeState = ConfigScriptMeta;
export type CreationAssistantRefScriptNodeState = RefScriptMeta;

/**
 * 从用户输入的文本中精准提取显式要求的视频总时长（秒）
 * 优先级最高，用于满足用户显式指定时长的诉求（如：“生成一条30秒视频”、“时长45s”、“总时长: 60秒”等）
 * 同时严格排除年龄、价格、画质、帧率等干扰（如“25岁”、“199元”、“买2送1”、“60帧”、“4k”等）
 */
export function extractExplicitDurationFromText(text?: string): number | undefined {
    if (!text || typeof text !== "string") return undefined;
    const cleanText = text.trim();
    if (!cleanText) return undefined;

    // 1. 显式前缀表达：时长: 30秒 / 视频时长 45s / 总时长：60秒 / 目标时长: 1分30秒 / 长度为 20s
    // 负向预查排除帧率 (60fps, 60帧)
    const prefixSecRegex = /(?:视频|总|目标|要求|参考|期望)?(?:时长|时间|长度)\s*[:：=为]?\s*(\d+(?:\.\d+)?)\s*(?:秒|s|sec|seconds?)(?![a-zA-Z\d]|(?:fps|帧))/i;
    const matchPrefixSec = cleanText.match(prefixSecRegex);
    if (matchPrefixSec && matchPrefixSec[1]) {
        const val = parseFloat(matchPrefixSec[1]);
        if (val > 0 && val <= 1800) return Math.round(val);
    }

    const prefixMinRegex = /(?:视频|总|目标|要求|参考|期望)?(?:时长|时间|长度)\s*[:：=为]?\s*(\d+)\s*(?:分|分钟|min|minutes?)(?:\s*(\d+)\s*(?:秒|s|sec)?)?/i;
    const matchPrefixMin = cleanText.match(prefixMinRegex);
    if (matchPrefixMin && matchPrefixMin[1]) {
        const mins = parseInt(matchPrefixMin[1], 10);
        const secs = matchPrefixMin[2] ? parseInt(matchPrefixMin[2], 10) : 0;
        const total = mins * 60 + secs;
        if (total > 0 && total <= 1800) return total;
    }

    // 2. 动词引导表达：生成/制作/做/输出/搞 一条 30秒/45s 的视频/脚本/短视频
    const actionSecRegex = /(?:生成|制作|创作|拍摄|剪辑|做|搞|输出)\s*(?:一条|一个|一段|一小段)?\s*(\d+(?:\.\d+)?)\s*(?:秒|s|sec)\s*(?:左右|上下)?\s*(?:的)?\s*(?:带货)?(?:短视频|视频|脚本|成片|片子)(?![a-zA-Z\d]|(?:fps|帧))/i;
    const matchActionSec = cleanText.match(actionSecRegex);
    if (matchActionSec && matchActionSec[1]) {
        const val = parseFloat(matchActionSec[1]);
        if (val > 0 && val <= 1800) return Math.round(val);
    }

    const actionMinRegex = /(?:生成|制作|创作|拍摄|剪辑|做|搞|输出)\s*(?:一条|一个|一段|一小段)?\s*(\d+)\s*(?:分|分钟|min)\s*(?:左右|上下)?(?:\s*(\d+)\s*(?:秒|s|sec)?)?\s*(?:的)?\s*(?:带货)?(?:短视频|视频|脚本|成片|片子)/i;
    const matchActionMin = cleanText.match(actionMinRegex);
    if (matchActionMin && matchActionMin[1]) {
        const mins = parseInt(matchActionMin[1], 10);
        const secs = matchActionMin[2] ? parseInt(matchActionMin[2], 10) : 0;
        const total = mins * 60 + secs;
        if (total > 0 && total <= 1800) return total;
    }

    // 3. 约束表达：控制在 30 秒内 / 限制在 45s / 约 60 秒脚本
    const limitSecRegex = /(?:控制在|限制在|大约|大概|约|差不多)\s*(\d+(?:\.\d+)?)\s*(?:秒|s|sec)\s*(?:左右|以内|内)?(?:\s*(?:的)?(?:短视频|视频|脚本))?(?![a-zA-Z\d]|(?:fps|帧))/i;
    const matchLimitSec = cleanText.match(limitSecRegex);
    if (matchLimitSec && matchLimitSec[1]) {
        const val = parseFloat(matchLimitSec[1]);
        if (val > 0 && val <= 1800) return Math.round(val);
    }

    const limitMinRegex = /(?:控制在|限制在|大约|大概|约|差不多)\s*(\d+)\s*(?:分|分钟|min)(?:\s*(\d+)\s*(?:秒|s|sec)?)?\s*(?:左右|以内|内)?(?:\s*(?:的)?(?:短视频|视频|脚本))?/i;
    const matchLimitMin = cleanText.match(limitMinRegex);
    if (matchLimitMin && matchLimitMin[1]) {
        const mins = parseInt(matchLimitMin[1], 10);
        const secs = matchLimitMin[2] ? parseInt(matchLimitMin[2], 10) : 0;
        const total = mins * 60 + secs;
        if (total > 0 && total <= 1800) return total;
    }

    // 4. 独立时长目标词：例如句子开头或以标点隔开的“30秒短视频”、“45s脚本”
    const standaloneSecRegex = /(?:^|[，。！？；;\s\n])(\d+(?:\.\d+)?)\s*(?:秒|s)\s*(?:左右|上下)?\s*(?:的)?\s*(?:带货)?(?:短视频|视频|脚本|成片)(?![a-zA-Z\d]|(?:fps|帧))/i;
    const matchStandaloneSec = cleanText.match(standaloneSecRegex);
    if (matchStandaloneSec && matchStandaloneSec[1]) {
        const val = parseFloat(matchStandaloneSec[1]);
        if (val > 0 && val <= 1800) return Math.round(val);
    }

    const standaloneMinRegex = /(?:^|[，。！？；;\s\n])(\d+)\s*(?:分|分钟)\s*(?:左右|上下)?(?:\s*(\d+)\s*(?:秒|s|sec)?)?\s*(?:的)?\s*(?:带货)?(?:短视频|视频|脚本|成片)/i;
    const matchStandaloneMin = cleanText.match(standaloneMinRegex);
    if (matchStandaloneMin && matchStandaloneMin[1]) {
        const mins = parseInt(matchStandaloneMin[1], 10);
        const secs = matchStandaloneMin[2] ? parseInt(matchStandaloneMin[2], 10) : 0;
        const total = mins * 60 + secs;
        if (total > 0 && total <= 1800) return total;
    }

    return undefined;
}

/**
 * 从参考剧本/分镜文本中解析视频总时长（秒）
 * 支持头部元信息（“视频时长：30秒”）、分镜标题时间戳（“00:00-00:25”）、JSON 字段（“endSec”: 28.5）等
 */
export function extractDurationFromScriptText(script?: string): number | undefined {
    if (!script || typeof script !== "string") return undefined;
    const cleanScript = script.trim();
    if (!cleanScript) return undefined;

    // 1. 优先检查脚本头部的显式声明（如“视频时长：30秒”、“总时长: 00:45”）
    const headerSecMatch = cleanScript.match(/(?:视频|总|参考)?时长\s*[:：=]\s*(\d+(?:\.\d+)?)\s*(?:秒|s)/i);
    if (headerSecMatch && headerSecMatch[1]) {
        const val = parseFloat(headerSecMatch[1]);
        if (val > 0 && val <= 1800) return Math.round(val);
    }

    const headerTimeMatch = cleanScript.match(/(?:视频|总|参考)?时长\s*[:：=]\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/i);
    if (headerTimeMatch) {
        const h = headerTimeMatch[1] ? parseInt(headerTimeMatch[1], 10) : 0;
        const m = parseInt(headerTimeMatch[2], 10);
        const s = parseInt(headerTimeMatch[3], 10);
        const total = h * 3600 + m * 60 + s;
        if (total > 0 && total <= 1800) return total;
    }

    // 2. 扫描文本中所有的起止时间戳，获取最大结束秒数
    const candidateEnds: number[] = [];

    // 2.1 格式如：00:00-00:25 或 [01:05 - 01:30]
    const mmssRegex = /(?:\[|\(|【|<|\b)(\d{1,2}):(\d{2})(?:\.(\d+))?\s*[-~至到/—]\s*(\d{1,2}):(\d{2})(?:\.(\d+))?(?:\]|\)|】|>|\b)/g;
    let mMatch: RegExpExecArray | null;
    while ((mMatch = mmssRegex.exec(cleanScript)) !== null) {
        const endM = parseInt(mMatch[4], 10);
        const endS = parseInt(mMatch[5], 10);
        const endMs = mMatch[6] ? parseFloat(`0.${mMatch[6]}`) : 0;
        const endSec = endM * 60 + endS + endMs;
        if (endSec > 0 && endSec <= 1800) {
            candidateEnds.push(endSec);
        }
    }

    // 2.2 格式如：[0-5秒] 或 [0s - 15s] 或 0-30s
    const secRangeRegex = /(?:\[|\(|【|<|\b)(\d+(?:\.\d+)?)\s*(?:s|秒)?\s*[-~至到/—]\s*(\d+(?:\.\d+)?)\s*(?:s|秒)(?:\]|\)|】|>|\b)/gi;
    let sMatch: RegExpExecArray | null;
    while ((sMatch = secRangeRegex.exec(cleanScript)) !== null) {
        const endSec = parseFloat(sMatch[2]);
        if (endSec > 0 && endSec <= 1800) {
            candidateEnds.push(endSec);
        }
    }

    // 2.3 JSON 格式 endSec 声明："endSec": 28.5
    const jsonEndSecRegex = /(?:"endSec"|endSec)\s*:\s*(\d+(?:\.\d+)?)/g;
    let jMatch: RegExpExecArray | null;
    while ((jMatch = jsonEndSecRegex.exec(cleanScript)) !== null) {
        const endSec = parseFloat(jMatch[1]);
        if (endSec > 0 && endSec <= 1800) {
            candidateEnds.push(endSec);
        }
    }

    if (candidateEnds.length > 0) {
        const maxEnd = Math.max(...candidateEnds);
        if (maxEnd >= 1) return Math.round(maxEnd);
    }

    return undefined;
}

export type CreationAssistantDurationSource =
    | "user_explicit"
    | "upstream_reverse"
    | "upstream_video"
    | "reference_script_content"
    | "node_meta"
    | "default";

export type CreationAssistantDurationResult = {
    targetDurationSec: number;
    referenceDurationSec: number;
    durationSource: CreationAssistantDurationSource;
    isExplicitUserDuration: boolean;
};

export type ResolveCreationAssistantDurationOptions = {
    userRequirement?: string;
    additionalNotes?: string;
    customRules?: string;
    metaDurationSec?: number;
    metaRefDurationSec?: number;
    upstreamReverseMeta?: {
        durationSec?: number;
        result?: { durationSec?: number };
        shotManifest?: Array<{ endSec?: number; timeRange?: string; durationSec?: number }>;
    };
    upstreamVideoDurationSec?: number;
    referenceScriptText?: string;
    fallbackDurationSec?: number;
};

/**
 * 集中解析经典复刻与参考生脚本的时长：
 * 1. 优先级 1（用户显式输入）：用户在需求框、补充说明、规则中显式要求时长时，按要求生成对应时长；
 * 2. 优先级 2（继承原片时长）：未显式指定时，按原视频/参考脚本时长生成对应时长；
 * 3. 底层视频模型的最大单段时长仅作为切片计划上限，绝不截断整篇剧本总时长。
 */
export function resolveCreationAssistantDurations(
    options: ResolveCreationAssistantDurationOptions,
): CreationAssistantDurationResult {
    // 1. 解析基准原片/参考脚本时长 (referenceDurationSec)
    let refDurationSec: number | undefined;
    let refSource: CreationAssistantDurationSource = "default";

    // 1.1 上游视频反推结果记录的时长
    if (typeof options.upstreamReverseMeta?.result?.durationSec === "number" && options.upstreamReverseMeta.result.durationSec > 0) {
        refDurationSec = Math.round(options.upstreamReverseMeta.result.durationSec);
        refSource = "upstream_reverse";
    } else if (typeof options.upstreamReverseMeta?.durationSec === "number" && options.upstreamReverseMeta.durationSec > 0) {
        refDurationSec = Math.round(options.upstreamReverseMeta.durationSec);
        refSource = "upstream_reverse";
    }

    // 1.2 上游反推分镜清单中的最大时间
    if (!refDurationSec && Array.isArray(options.upstreamReverseMeta?.shotManifest) && options.upstreamReverseMeta.shotManifest.length > 0) {
        let maxShotEnd = 0;
        for (const shot of options.upstreamReverseMeta.shotManifest) {
            if (typeof shot.endSec === "number" && shot.endSec > maxShotEnd) {
                maxShotEnd = shot.endSec;
            } else if (shot.timeRange) {
                const parsed = extractDurationFromScriptText(shot.timeRange);
                if (parsed && parsed > maxShotEnd) maxShotEnd = parsed;
            }
        }
        if (maxShotEnd > 0) {
            refDurationSec = Math.round(maxShotEnd);
            refSource = "upstream_reverse";
        }
    }

    // 1.3 上游直连视频节点的时长
    if (!refDurationSec && typeof options.upstreamVideoDurationSec === "number" && options.upstreamVideoDurationSec > 0) {
        refDurationSec = Math.round(options.upstreamVideoDurationSec);
        refSource = "upstream_video";
    }

    // 1.4 从参考脚本正文中提取时间轴最大值
    if (!refDurationSec && options.referenceScriptText) {
        const fromScript = extractDurationFromScriptText(options.referenceScriptText);
        if (fromScript && fromScript > 0) {
            refDurationSec = fromScript;
            refSource = "reference_script_content";
        }
    }

    // 1.5 节点原有记录的时长
    if (!refDurationSec && typeof options.metaRefDurationSec === "number" && options.metaRefDurationSec > 0) {
        refDurationSec = Math.round(options.metaRefDurationSec);
        refSource = "node_meta";
    } else if (!refDurationSec && typeof options.metaDurationSec === "number" && options.metaDurationSec > 0) {
        refDurationSec = Math.round(options.metaDurationSec);
        refSource = "node_meta";
    }

    // 1.6 兜底默认值
    if (!refDurationSec || refDurationSec <= 0) {
        refDurationSec = Math.max(1, Math.round(options.fallbackDurationSec || 30));
        refSource = "default";
    }

    // 2. 解析用户显式注入或要求的时长 (优先级 1)
    const userTextParts = [options.userRequirement, options.additionalNotes, options.customRules].filter(Boolean) as string[];
    const userCombinedText = userTextParts.join("\n");
    const explicitUserSec = extractExplicitDurationFromText(userCombinedText);

    if (explicitUserSec && explicitUserSec > 0) {
        return {
            targetDurationSec: explicitUserSec,
            referenceDurationSec: refDurationSec,
            durationSource: "user_explicit",
            isExplicitUserDuration: true,
        };
    }

    // 3. 无显式要求时，按原视频/参考脚本时长生成脚本 (优先级 2)
    return {
        targetDurationSec: refDurationSec,
        referenceDurationSec: refDurationSec,
        durationSource: refSource,
        isExplicitUserDuration: false,
    };
}


