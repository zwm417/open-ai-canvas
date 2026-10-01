export type VideoSamplingMode = "seconds" | "scene" | "seconds_and_scene" | "agent" | "deconstruct";

export type VideoSamplingPolicy = {
    mode: VideoSamplingMode;
    fps: number;
    includeMiddleFrames: boolean;
    sceneChangeThreshold: number;
    minSceneGapSec: number;
    maxFrames: number;
    maxFramesPerSheet: number;
    source: "default" | "legacy" | "user" | "agent" | "fallback";
};

export type VideoSamplingPolicyInput = Partial<Omit<VideoSamplingPolicy, "source">> & {
    samplingMode?: VideoSamplingMode;
    mode?: VideoSamplingMode;
    frameCount?: number;
    detectSceneChanges?: boolean;
    sheetCount?: number;
};

export type VideoDecompositionOptions = {
    /** Total number of timeline frames to extract. */
    frameCount?: number;
    /** Timeline sampling frequency. When set, frames are sampled at 0, 1/fps, 2/fps ... rather than by frameCount. */
    fps?: number;
    /** Add the center frame of every timeline interval (including a final partial interval). */
    includeMiddleFrames?: boolean;
    /** Detect visual changes between ordered samples and add scene-change evidence frames. */
    detectSceneChanges?: boolean;
    /** Mean normalized pixel-difference threshold used by browser scene detection. */
    sceneChangeThreshold?: number;
    /** Explicit frame sampling mode. */
    samplingMode?: VideoSamplingMode;
    /** Optional structured policy supplied by a caller or Agent adapter. */
    samplingPolicy?: VideoSamplingPolicyInput;
    /** Raw structured policy returned by an Agent; never interpreted as executable text. */
    agentPolicy?: unknown;
    /** Minimum time between two browser scene evidence frames. */
    minSceneGapSec?: number;
    /** Maximum extracted evidence frames after ordering. */
    maxFrames?: number;
    /** Maximum frames in one contact sheet. */
    maxFramesPerSheet?: number;
    /** Number of contact sheets to generate from the extracted frames. */
    sheetCount?: number;
    /** Explicit columns per sheet. When omitted, a landscape-friendly value is calculated. */
    columns?: number;
    tileWidth?: number;
    tileHeight?: number;
    labelHeight?: number;
    includeStart?: boolean;
    includeEnd?: boolean;
    quality?: number;
    /** Abort an in-progress browser extraction when the owning workflow is replaced or closed. */
    signal?: AbortSignal;
    /** 对齐 Hypit 官方逐词对白时间戳，用于在拼图底部实时标注当前帧对白证据 */
    words?: readonly TranscriptWordTiming[];
    /** 抽帧进度回调，支持实时更新抽帧进度与帧数 */
    onProgress?: (progress: { current: number; total: number }) => void;
};

export type TranscriptWordTiming = {
    word: string;
    startSec: number;
    endSec: number;
};

export type VideoFrameType = "timeline_sample" | "timeline_midpoint" | "visual_change_frame";

export type VideoFrameRecord = {
    index: number;
    frameId: string;
    timestampSec: number;
    timecode: string;
    gridLabel: string;
    frameType: VideoFrameType;
    source: string;
    seekTimestampSec: number;
    sceneScore?: number;
    sharpnessScore?: number;
    blob: Blob;
    url: string;
    width: number;
    height: number;
};

export type VideoContactSheet = {
    sheetIndex: number;
    frameStart: number;
    frameEnd: number;
    blob: Blob;
    url: string;
    width: number;
    height: number;
    frames: VideoFrameRecord[];
};

export type VideoDecompositionManifestFrame = {
    index: number;
    frame_id: string;
    grid_label: string;
    timestamp_sec: number;
    seek_second: number;
    timecode: string;
    frame_type: VideoFrameRecord["frameType"];
    source: string;
    scene_score?: number;
    sharpness_score?: number;
    active_words?: string;
    context_words?: string;
    sheet_index: number;
    row: number;
    column: number;
};

export type VideoDecompositionResult = {
    durationSec: number;
    sourceWidth: number;
    sourceHeight: number;
    frameCount: number;
    sheetCount: number;
    frames: VideoFrameRecord[];
    sheets: VideoContactSheet[];
    manifest: {
        schema_version: "infinite-canvas.video_decomposition.v1";
        strategy: string;
        engine_version: string;
        evidence_method: "browser_explicit_time_seek" | "browser_visual_difference" | "browser_explicit_time_seek+browser_visual_difference";
        requested_policy: VideoSamplingPolicyInput;
        requested_agent_policy?: Record<string, unknown>;
        effective_policy: VideoSamplingPolicy;
        agent_fallback_reason?: string;
        fps: number;
        duration_sec: number;
        frame_count: number;
        sheet_count: number;
        columns: number;
        timeline_frame_manifest: VideoTimelineFrameManifest;
        frames: VideoDecompositionManifestFrame[];
    };
};

export type VideoTimelineFrameManifest = {
    schema_version: "video-work.timeline_frame_manifest.v1";
    status: "completed" | "partial" | "blocked";
    method: "browser_explicit_time_seek";
    fps: number;
    source_video: string;
    duration_sec: number;
    frame_count: number;
    blocked_count: number;
    frames: Array<{
        index: number;
        frame_id: string;
        path: string;
        timestamp_sec: number;
        seek_second: number;
        source: "browser_explicit_time_seek";
    }>;
    blocked_frames: Array<{
        index: number;
        timestamp_sec: number;
        seek_second: number;
        blockedReason: string;
    }>;
};
