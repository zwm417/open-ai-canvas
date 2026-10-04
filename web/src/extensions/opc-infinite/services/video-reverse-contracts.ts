import { DEFAULT_VIDEO_SAMPLING_POLICY, evaluateDeconstructBudget, normalizeVideoSamplingPolicy, type VideoSamplingPolicy, type VideoSamplingPolicyInput } from "../media/video-decomposition";

export { evaluateDeconstructBudget };

export const VIDEO_REVERSE_PLUGIN_ID = "video-reverse";
export const VIDEO_REVERSE_NODE_TYPE = "video-reverse:analyzer";

export type ReverseGridSize = 9 | 12 | 16 | 24 | "auto";
export type VideoSamplingMode = "seconds" | "scene" | "seconds_and_scene" | "agent" | "deconstruct";

const AUTOMATIC_REVERSE_GRID_SIZES: Array<Exclude<ReverseGridSize, "auto">> = [9, 12, 16, 24];

export type ReverseFrameManifest = {
    frameId: string;
    timestampSec: number;
    frameType?: string;
    source?: string;
    seekTimestampSec?: number;
    sceneScore?: number;
    activeWords?: string;
    contextWords?: string;
};

export type ReversePromptResponse = {
    prompt: string;
    notes: string[];
};

export type ReverseModelCandidate<T extends { model: string }> = {
    config: T;
    contentMode: "visual" | "text";
};

export type ReverseTrackClassic = {
    prompt?: string;
    customRules?: string;
    promptRules?: string;
    replaceBuiltInPrompt?: boolean;
    samplingMode?: VideoSamplingMode;
    samplingFps?: number;
    includeMiddleFrames?: boolean;
    sceneThreshold?: number;
    minSceneGapSec?: number;
    contactSheets?: Array<{
        pageIndex: number;
        url: string;
        storageKey?: string;
        localFilePath?: string;
        frameStart?: number;
        frameEnd?: number;
        frameCount?: number;
    }>;
    updatedAt?: number;
};

export type ReverseTrackDeconstruct = {
    prompt?: string;
    rawPrompt?: string;
    shotManifest?: ReverseMeta["shotManifest"];
    coreElements?: ReverseMeta["coreElements"];
    originalMasterSlots?: ReverseMeta["originalMasterSlots"];
    customRules?: string;
    promptRules?: string;
    replaceBuiltInPrompt?: boolean;
    wordLevelAudio?: boolean;
    sceneThreshold?: number;
    minSceneGapSec?: number;
    contactSheets?: Array<{
        pageIndex: number;
        url: string;
        storageKey?: string;
        localFilePath?: string;
        frameStart?: number;
        frameEnd?: number;
        frameCount?: number;
    }>;
    updatedAt?: number;
};

export type ReverseMeta = {
    model?: string;
    sourceNodeId?: string;
    sourceFileName?: string;
    gridSize?: ReverseGridSize;
    samplingMode?: VideoSamplingMode;
    samplingFps?: number;
    includeMiddleFrames?: boolean;
    sceneThreshold?: number;
    minSceneGapSec?: number;
    agentPolicyJson?: string;
    requirement?: string;
    customRules?: string;
    promptRules?: string;
    replaceBuiltInPrompt?: boolean;
    activeTab?: "classic" | "deconstruct";
    // 双轨隔离存储槽位 (Dual-Track Isolation)
    classic?: ReverseTrackClassic;
    deconstruct?: ReverseTrackDeconstruct;
    originalMasterSlots?: {
        actor?: string;
        character?: string;
        product?: string;
        focalObject?: string;
        scene?: string;
    };
    coreElements?: {
        character?: string;
        focalObject?: string;
        scene?: string;
    };
    shotManifest?: Array<{
        shotNumber: number;
        shotType?: string;
        timeRange: string;
        startSec?: number;
        endSec?: number;
        durationSec?: number;
        scaleAndAngle?: string;
        cameraMovement?: string;
        visualSubject?: string;
        visualContent?: string;
        performanceTiming?: string;
        physicalFeedback?: string;
        dialogue?: string;
        wordTimings?: string;
        voiceTone?: string;
        speechRate?: string;
        stressWords?: string;
        emotionAndGaze?: string;
        emotion?: string;
        lightingTone?: string;
        soundAndAtmosphere?: string;
        sfxCue?: string;
        soundAndBgm?: string;
        transition?: string;
        narrativeFunction?: string;
        hookType?: string;
        characterAnchor?: string;
        productAnchor?: string;
        focalAnchor?: string;
        sceneAnchor?: string;
        replicateStrategy?: string;
        brollCoverSlot?: {
            targetWord?: string;
            coverDurationSec?: number;
            assetLabel?: string;
            coverPrompt?: string;
        };
    }>;
    wordLevelAudio?: boolean;
    localAsrEnabled?: boolean;
    userTouchedAsr?: boolean;
    useNativeFFmpeg?: boolean;
    localAsrFeedback?: string;
    status?: "idle" | "running" | "success" | "error" | "cancelled";
    isUserEditedScript?: boolean;
    runId?: string;
    errorDetails?: string;
    prompt?: string;
    rawPrompt?: string;
    updatedAt?: number;
    progress?: { stage: string; percent: number; message: string };
    result?: {
        prompt: string;
        notes: string[];
        durationSec: number;
        frameCount: number;
        submittedGridCount: number;
        omittedGridCount: number;
    } | null;
    exportedScriptNodeId?: string;
    exportedFramesNodeId?: string;
    contactSheets?: Array<{
        pageIndex: number;
        url: string;
        storageKey?: string;
        localFilePath?: string;
        frameStart?: number;
        frameEnd?: number;
        frameCount?: number;
    }>;
};

export type VideoReverseNodeState = ReverseMeta;

export function resolveGridFrameCount(setting: ReverseGridSize, totalFrames: number, maxModelImages = 12) {
    const available = Math.max(0, Math.floor(totalFrames));
    if (!available) return 0;
    if (setting !== "auto") return Math.min(available, setting);
    const modelImageLimit = Math.max(1, Math.floor(Number.isFinite(maxModelImages) ? maxModelImages : 12));
    const selected = AUTOMATIC_REVERSE_GRID_SIZES.find((size) => Math.ceil(available / size) <= modelImageLimit) || AUTOMATIC_REVERSE_GRID_SIZES[AUTOMATIC_REVERSE_GRID_SIZES.length - 1];
    return Math.min(available, selected);
}

export function resolveReverseFramesPerGrid(setting: ReverseGridSize, totalFrames: number, explicitMaxFramesPerSheet?: number) {
    const available = Math.max(0, Math.floor(totalFrames));
    if (!available) return 0;
    if (explicitMaxFramesPerSheet !== undefined) return Math.min(available, Math.max(1, Math.floor(explicitMaxFramesPerSheet)));
    return resolveGridFrameCount(setting, available);
}

export function chunkFrameManifest<T extends ReverseFrameManifest>(frames: T[], framesPerGrid: number) {
    const size = Math.max(1, Math.floor(framesPerGrid));
    const pages: T[][] = [];
    for (let index = 0; index < frames.length; index += size) pages.push(frames.slice(index, index + size));
    return pages;
}

export function limitGridPages<T>(pages: T[], maxModelImages = 12) {
    return pages.slice(0, Math.max(0, Math.floor(maxModelImages)));
}

export function dedupeReverseModelCandidates<T extends { model: string }>(candidates: ReverseModelCandidate<T>[]) {
    const seen = new Set<string>();
    return candidates.filter((candidate) => {
        const model = candidate.config.model.trim();
        if (!model || seen.has(model)) return false;
        seen.add(model);
        return true;
    });
}

export function hasReverseVisualEvidence(totalFrames: number, pageCount: number) {
    return totalFrames > 0 && pageCount > 0;
}

export function isReverseModelFallbackError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || "");
    return /multimodal|vision|image|unsupported|not allowed|400|404|not support/i.test(message);
}

export function normalizeReversePromptResponse(raw: string): ReversePromptResponse {
    const trimmed = raw.trim();
    if (!trimmed) return { prompt: "", notes: [] };
    const notes: string[] = [];
    const prompt = trimmed.replace(/```markdown\n?([\s\S]*?)```/g, "$1").trim();
    return { prompt, notes };
}

export function resolveReverseSamplingPolicy(gridSize: ReverseGridSize, custom?: VideoSamplingPolicyInput): VideoSamplingPolicy {
    const base = normalizeVideoSamplingPolicy(custom, DEFAULT_VIDEO_SAMPLING_POLICY);
    const maxFramesPerSheet = typeof gridSize === "number" ? gridSize : base.maxFramesPerSheet;
    return { ...base, maxFramesPerSheet };
}

/**
 * 判定目标模型通道是否在当前 API 协议下真正支持直接传入音频轨道（端到端原生听音）
 * - 仅放行 Gemini 全系列（原生支持音频分块）或模型名明确含 audio 的专属多模态通道（如 gpt-4o-audio-preview）；
 * - 普通 GPT 系列 (gpt-4o / gpt-4o-mini)、豆包 (Doubao)、MiniMax、DeepSeek、Claude、Qwen 等通过常规
 *   OpenAI-compatible 聊天网关传输时，不支持直接发送 input_audio 格式音频，必须依靠本地 FunASR 提取对白硬事实注入提示词。
 */
export function isAudioCapableModel(modelIdOrName?: string): boolean {
    if (!modelIdOrName) return false;
    const lower = modelIdOrName.toLowerCase();
    if (lower.includes("gemini")) return true;
    if (lower.includes("audio")) return true;
    return false;
}

/**
 * 根据所选模型自适应计算“本地 ASR”的推荐默认值
 * - 若模型具备原生音频理解能力 (如 Gemini)，默认取消勾选本地 ASR (false)，让大模型直接端到端听音打标；
 * - 若模型不具备音频理解能力 (如 DeepSeek, Claude, Qwen, GPT-4o, 豆包, MiniMax 等)，默认必须开启本地 ASR (true) 提取对白硬事实注入模型。
 */
export function resolveDefaultLocalAsrSetting(modelIdOrName?: string): boolean {
    return !isAudioCapableModel(modelIdOrName);
}
