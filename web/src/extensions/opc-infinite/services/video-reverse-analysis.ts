import { extractVideoAudio, extractVideoFrames, type VideoTimelineFrameManifest } from "../media/video-decomposition";
import { buildContactSheets } from "../media/video-decomposition/contact-sheet-builder";
import { checkDesktopFFmpegAvailable, extractAudioWithDesktopFFmpeg, extractFramesWithDesktopFFmpeg, type DesktopExtractedVideoResult } from "../media/video-decomposition/desktop-ffmpeg-sampler";
import { transcribeWithLocalAsr, type LocalAsrTranscribeResult } from "./local-asr-transcriber";
import { requestImageQuestion, type AiTextMessage } from "@/services/api/image";
import { resolveModelRequestConfig, type AiConfig } from "@/stores/use-config-store";
import {
    chunkFrameManifest,
    dedupeReverseModelCandidates,
    hasReverseVisualEvidence,
    isAudioCapableModel,
    isReverseModelFallbackError,
    limitGridPages,
    normalizeReversePromptResponse,
    resolveReverseFramesPerGrid,
    resolveReverseSamplingPolicy,
    type ReverseFrameManifest,
    type ReverseGridSize,
    type ReverseModelCandidate,
    type ReversePromptResponse,
} from "./video-reverse-contracts";
import { getVaultPromptSync, VAULT_PROMPT_IDS } from "@/services/api/prompt-vault";

const MAX_MODEL_IMAGES = 12;

export type ReverseAnalysisProgress = { stage: "frames" | "audio" | "analysis"; percent: number; message: string };

export type ReverseGridPage = {
    pageIndex: number;
    frameStart: number;
    frameEnd: number;
    url: string;
    blob: Blob;
    localFilePath?: string;
    frames: ReverseFrameManifest[];
};

export type PreparedReverseVideo = {
    durationSec: number;
    frameCount: number;
    gridSize: ReverseGridSize;
    pages: ReverseGridPage[];
    submittedPages: ReverseGridPage[];
    audio: Blob | null;
    audioError?: string;
    timelineManifest: VideoTimelineFrameManifest;
    samplingPolicy: ReturnType<typeof resolveReverseSamplingPolicy>;
    agentFallbackReason?: string;
    isDesktopFFmpegUsed?: boolean;
    localAsrResult?: LocalAsrTranscribeResult;
};

export type ReverseAnalysisResult = ReversePromptResponse & {
    durationSec: number;
    frameCount: number;
    submittedGridCount: number;
    omittedGridCount: number;
    localAsrResult?: LocalAsrTranscribeResult;
    isDesktopFFmpegUsed?: boolean;
    contactSheets?: Array<{
        pageIndex: number;
        url: string;
        localFilePath?: string;
    }>;
};

export type ReverseVideoPrepareOptions = {
    samplingPolicy?: Parameters<typeof resolveReverseSamplingPolicy>[1];
    agentPolicy?: unknown;
    localAsrEnabled?: boolean;
    track?: "classic" | "deconstruct";
    signal?: AbortSignal;
};

export function disposePreparedReverseVideo(prepared: PreparedReverseVideo, options: { retainPages?: boolean } = {}) {
    if (!options.retainPages) {
        prepared.pages.forEach((page) => URL.revokeObjectURL(page.url));
    }
}

export async function prepareReverseVideo(source: Blob | File | string, gridSize: ReverseGridSize, onProgress?: (progress: ReverseAnalysisProgress) => void, prepareOptions: ReverseVideoPrepareOptions = {}): Promise<PreparedReverseVideo> {
    const isDesktopFFmpeg = checkDesktopFFmpegAvailable();
    onProgress?.({
        stage: "frames",
        percent: 5,
        message: isDesktopFFmpeg ? "正在调用本地 FFmpeg 原生算力抽取视频画面..." : "正在按时间顺序抽取视频画面...",
    });
    const samplingPolicy = resolveReverseSamplingPolicy(gridSize, prepareOptions.samplingPolicy);

    // 优先尝试桌面端原生 FFmpeg 硬件级极速抽帧与场景切点探测
    let extracted: Awaited<ReturnType<typeof extractVideoFrames>> | DesktopExtractedVideoResult | null = null;
    let isDesktopFFmpegUsed = false;
    if (isDesktopFFmpeg) {
        try {
            extracted = await extractFramesWithDesktopFFmpeg(source, {
                samplingPolicy,
                signal: prepareOptions.signal,
                onProgress,
            });
            if (extracted && extracted.frames && extracted.frames.length > 0) {
                isDesktopFFmpegUsed = true;
            }
        } catch (desktopErr) {
            console.warn("[prepareReverseVideo] 桌面原生抽帧异常，自动平滑回退到浏览器 Canvas:", desktopErr);
            extracted = null;
        }
    }

    // 桌面端未就绪、执行异常或抽取结果为 0 帧时，平滑回退至浏览器 Canvas 抽帧
    if (!extracted || !extracted.frames || extracted.frames.length === 0) {
        onProgress?.({
            stage: "frames",
            percent: 8,
            message: "正在按时间顺序抽取视频画面...",
        });
        extracted = await extractVideoFrames(source, {
            samplingPolicy,
            agentPolicy: prepareOptions.agentPolicy,
            quality: 0.82,
            signal: prepareOptions.signal,
            onProgress: (p) => {
                const percent = Math.min(42, Math.round(8 + (p.current / Math.max(1, p.total)) * 34));
                onProgress?.({
                    stage: "frames",
                    percent,
                    message: `正在按时间顺序抽取视频画面 (${p.current}/${p.total})...`,
                });
            },
        });
    }

    const pages: ReverseGridPage[] = [];
    try {
        // 核心正向逻辑：切页分页之前，先对全局抽取帧序列执行严格时间戳升序排序，杜绝跨页时间跳跃与拼图时序乱序
        extracted.frames.sort((a, b) => a.timestampSec - b.timestampSec || a.index - b.index);
        extracted.frames.forEach((frame, idx) => {
            frame.index = idx + 1;
            frame.frameId = `F${String(idx + 1).padStart(4, "0")}`;
            frame.gridLabel = `Grid ${idx + 1}`;
        });

        const frameManifest = extracted.frames.map((frame) => ({
            frameId: frame.frameId,
            timestampSec: frame.timestampSec,
            frameType: frame.frameType,
            source: frame.source,
            seekTimestampSec: frame.seekTimestampSec,
            ...(frame.sceneScore === undefined ? {} : { sceneScore: frame.sceneScore }),
        }));
        if (!frameManifest.length) throw new Error("视频没有可用画面证据，已停止反推模型请求");

        // 提前提取音频：不仅供给后续分析，更支持优先本地 ASR 提取逐词毫秒时间戳标注拼图证据 (对齐 Hypit 证据体系)
        if (prepareOptions.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        onProgress?.({ stage: "audio", percent: 45, message: "正在提取音频信息..." });
        let audio: Blob | null = null;
        let audioError = "";
        try {
            if (checkDesktopFFmpegAvailable()) {
                audio = await extractAudioWithDesktopFFmpeg(source, { signal: prepareOptions.signal });
            }
            if (!audio) {
                const audioResult = await extractVideoAudio(source, { signal: prepareOptions.signal });
                audio = audioResult ? (audioResult instanceof Blob ? audioResult : audioResult.blob) : null;
            }
        } catch (error) {
            if (prepareOptions.signal?.aborted) throw error;
            audioError = error instanceof Error ? error.message : "音频提取失败";
            onProgress?.({ stage: "audio", percent: 48, message: `音频提取失败，将仅使用画面继续：${audioError}` });
        }

        // 若开启了本地 ASR，优先执行转写以获取逐词毫秒时间戳打标在拼图画面上 (对齐 Hypit 词级对白证据拼图)
        let localAsrResult: LocalAsrTranscribeResult | undefined;
        if (prepareOptions.localAsrEnabled && audio) {
            onProgress?.({ stage: "audio", percent: 50, message: "正在调用本地 FunASR 转写逐词时间戳以标注拼图..." });
            try {
                localAsrResult = await transcribeWithLocalAsr(audio, { signal: prepareOptions.signal });
                if (localAsrResult?.success && localAsrResult.words?.length) {
                    onProgress?.({ stage: "audio", percent: 54, message: `本地 ASR 识别成功 (${localAsrResult.words.length} 词)，正在生成带词级对白证据的拼图` });
                }
            } catch (asrErr) {
                console.warn("[prepareReverseVideo] 本地 ASR 转写异常，拼图将使用基础时间码模式:", asrErr);
            }
        }

        const agentMaxFramesPerSheet = prepareOptions.agentPolicy !== undefined ? extracted.samplingPolicy.maxFramesPerSheet : undefined;
        const framesPerGrid = resolveReverseFramesPerGrid(gridSize, frameManifest.length, agentMaxFramesPerSheet);
        const framePages = chunkFrameManifest(frameManifest, framesPerGrid);
        for (const [index, pageFrames] of framePages.entries()) {
            if (prepareOptions.signal?.aborted) throw new DOMException("Aborted", "AbortError");
            const frameSet = extracted.frames.slice(index * framesPerGrid, index * framesPerGrid + pageFrames.length);
            const hasWords = Boolean(localAsrResult?.words && localAsrResult.words.length > 0);
            const built = await buildContactSheets(frameSet, 1, {
                tileWidth: 300,
                tileHeight: 440,
                labelHeight: hasWords ? 92 : 66,
                quality: 0.84,
                maxFramesPerSheet: framesPerGrid,
                words: localAsrResult?.words,
            });
            const sheet = built.sheets[0];
            if (!sheet) throw new Error(`第 ${index + 1} 张抽帧拼图生成失败`);

            // 将拼图构建阶段精确匹配的逐词对白与语境对齐注入该页帧清单中
            const enrichedPageFrames = pageFrames.map((pf, pIdx) => {
                const mf = built.manifestFrames[pIdx];
                return {
                    ...pf,
                    activeWords: mf?.active_words,
                    contextWords: mf?.context_words,
                };
            });

            // 持久化保留抽帧拼图：优先存盘至用户本地电脑专属目录 (桌面端)，同时写入 IndexedDB 避免会话丢失
            let localFilePath: string | undefined;
            if (typeof window !== "undefined") {
                const bridge = (window as unknown as {
                    desktopBridge?: {
                        saveMedia?: (opts: { fileName: string; buffer: Uint8Array; subFolder: string; mediaType: string }) => Promise<{ success: boolean; filePath?: string }>;
                    };
                }).desktopBridge;
                if (bridge?.saveMedia && sheet.blob) {
                    try {
                        const arrayBuf = await sheet.blob.arrayBuffer();
                        const trackPrefix = prepareOptions.track ? `${prepareOptions.track}_` : "";
                        const saveRes = await bridge.saveMedia({
                            fileName: `contact_sheet_${trackPrefix}p${index + 1}_${Date.now()}.jpg`,
                            buffer: new Uint8Array(arrayBuf),
                            subFolder: "contact-sheets",
                            mediaType: "image",
                        });
                        if (saveRes?.success && saveRes.filePath) {
                            localFilePath = saveRes.filePath;
                        }
                    } catch (saveErr) {
                        console.warn("[prepareReverseVideo] 拼图保存至本地磁盘失败，保留内存预览:", saveErr);
                    }
                }
            }

            pages.push({
                pageIndex: index + 1,
                frameStart: sheet.frameStart,
                frameEnd: sheet.frameEnd,
                url: sheet.url,
                blob: sheet.blob,
                localFilePath,
                frames: enrichedPageFrames,
            });
        }
        if (prepareOptions.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const submittedPages = limitGridPages(pages, MAX_MODEL_IMAGES);
        onProgress?.({ stage: "analysis", percent: 58, message: `已准备 ${submittedPages.length} 张按顺序排列的拼图，等待模型分析` });
        const effectiveSamplingPolicy = { ...extracted.samplingPolicy, maxFramesPerSheet: framesPerGrid || extracted.samplingPolicy.maxFramesPerSheet };
        return {
            durationSec: extracted.durationSec,
            frameCount: extracted.frameCount,
            gridSize,
            pages,
            submittedPages,
            audio,
            timelineManifest: extracted.timelineManifest,
            samplingPolicy: effectiveSamplingPolicy,
            isDesktopFFmpegUsed: Boolean(isDesktopFFmpegUsed),
            ...(localAsrResult ? { localAsrResult } : {}),
            ...(audioError ? { audioError } : {}),
            ...(extracted.agentFallbackReason ? { agentFallbackReason: extracted.agentFallbackReason } : {}),
        };
    } catch (error) {
        pages.forEach((page) => URL.revokeObjectURL(page.url));
        throw error;
    } finally {
        extracted.frames.forEach((frame) => URL.revokeObjectURL(frame.url));
        extracted.dispose();
    }
}

export async function analyzePreparedReverseVideo({
    config,
    fallbackConfig,
    fallbackConfigs = [],
    prepared,
    userRequirement = "保留参考视频的爆点、动作、镜头、节奏和声音结构，生成可直接用于二创的反推作战手册。",
    promptRules,
    replaceBuiltInPrompt = false,
    localAsrEnabled = false,
    wordLevelAudio,
    onDelta,
    onProgress,
    signal,
}: {
    config: AiConfig;
    fallbackConfig?: AiConfig;
    fallbackConfigs?: Array<ReverseModelCandidate<AiConfig>>;
    prepared: PreparedReverseVideo;
    userRequirement?: string;
    promptRules?: string;
    replaceBuiltInPrompt?: boolean;
    localAsrEnabled?: boolean;
    wordLevelAudio?: boolean;
    onDelta?: (text: string) => void;
    onProgress?: (progress: ReverseAnalysisProgress) => void;
    signal?: AbortSignal;
}): Promise<ReverseAnalysisResult> {
    throwIfAborted(signal);
    if (!hasReverseVisualEvidence(prepared.frameCount, prepared.submittedPages.length)) throw new Error("视频没有可用画面证据，已停止反推模型请求");

    let localAsrResult: LocalAsrTranscribeResult | undefined = prepared.localAsrResult;
    let effectiveRequirement = userRequirement;

    // 只有在明确开启了词级打标时，才在无本地 ASR 转写事实的情况下向多模态大模型下发词级时间戳标注约束
    const isWordLevelRequested = wordLevelAudio !== undefined
        ? wordLevelAudio
        : (userRequirement ? userRequirement.includes("词级打标") : false);
    const multimodalWordLevelDirective = isWordLevelRequested
        ? "\n\n【多模态原生听音与词级打标指令】\n本次请求未采用本地 ASR 预打标，已直接将原片音轨输入多模态模型。请仔细聆听音轨中的发音节奏与起止点，在逐镜头深度拆解的台词部分，必须给出包含字词级起止时间戳的结构化标注，格式如：0.0s[不要] 0.5s[懒] 0.8s[一定要] 1.2s[洗]。"
        : "";

    if (localAsrResult?.success && localAsrResult.wordTimingsFormatted) {
        effectiveRequirement = `${effectiveRequirement}\n\n【本地 FunASR 字级时间戳事实 (已精准识别)】\n${localAsrResult.wordTimingsFormatted}\n请严格直接复用上述字词与毫秒时间戳绑定到对应镜头，避免多余推算。`;
    } else if (localAsrEnabled && prepared.audio && !localAsrResult) {
        onProgress?.({ stage: "audio", percent: 52, message: "正在优先调用本地 FunASR 进行字词级毫秒时间戳打标..." });
        try {
            const asrRes = await transcribeWithLocalAsr(prepared.audio, { signal });
            localAsrResult = asrRes;
            if (asrRes.success && asrRes.wordTimingsFormatted) {
                effectiveRequirement = `${effectiveRequirement}\n\n【本地 FunASR 字级时间戳事实 (已精准识别)】\n${asrRes.wordTimingsFormatted}\n请严格直接复用上述字词与毫秒时间戳绑定到对应镜头，避免多余推算。`;
                onProgress?.({ stage: "audio", percent: 56, message: `本地 ASR 识别成功 (${asrRes.words?.length || 0} 词)，正在注入分镜分析` });
            } else {
                onProgress?.({ stage: "audio", percent: 56, message: `本地 ASR 未命中 (${asrRes.fallbackReason || "未知原因"})，已平滑回退至多模态音画解析` });
                effectiveRequirement = `${effectiveRequirement}${multimodalWordLevelDirective}`;
            }
        } catch (e) {
            console.warn("[analyzePreparedReverseVideo] 本地 ASR 调用异常，已平滑降级:", e);
            localAsrResult = {
                success: false,
                fallbackReason: e instanceof Error ? e.message : String(e),
                source: "fallback-multimodal",
            };
            const isAudioModel = isAudioCapableModel(config.model);
            const fallbackMessage = isAudioModel
                ? "本地 ASR 异常，已自动平滑回退为多模态听音解析"
                : "本地 ASR 异常且当前模型不支持音频输入，将依据画面进行拆解";
            onProgress?.({ stage: "audio", percent: 56, message: fallbackMessage });
            effectiveRequirement = `${effectiveRequirement}${multimodalWordLevelDirective}`;
        }
    } else if (!localAsrEnabled && prepared.audio) {
        // 用户未开启本地 ASR (选择 Gemini、GPT-4o、豆包、MiniMax 等多模态直接听音)
        effectiveRequirement = `${effectiveRequirement}${multimodalWordLevelDirective}`;
    }

    throwIfAborted(signal);
    const effectivePromptRules = replaceBuiltInPrompt && promptRules?.trim() ? promptRules.trim() : getVaultPromptSync(VAULT_PROMPT_IDS.VIDEO_REVERSE_CLASSIC).trim();
    const systemPrompt = `${effectivePromptRules}\n\n执行约束：\n1. 只依据按时间顺序提供的拼图和音频，无法确认的跨帧动作标注“推测”。\n2. 拼图页面按第1页到最后一页阅读，每页内部按左到右、从上到下阅读，不得打乱时间顺序。`;
    const textFallbackContent = await buildTextFallbackContent(prepared, effectiveRequirement);
    const candidates = dedupeReverseModelCandidates([
        { config: { ...config, systemPrompt }, contentMode: "visual" as const },
        ...fallbackConfigs.map((candidate) => ({ ...candidate, config: { ...candidate.config, systemPrompt } })),
        ...(fallbackConfig ? [{ config: { ...fallbackConfig, systemPrompt }, contentMode: "text" as const }] : []),
    ]);
    let raw = "";
    let lastError: unknown;
    let attemptedCount = 0;
    for (const candidate of candidates) {
        const candidateConfig = candidate.config;
        const resolvedCandidate = resolveModelRequestConfig(candidateConfig, candidateConfig.model);
        if (!resolvedCandidate.baseUrl.trim() || !resolvedCandidate.apiKey.trim()) continue;
        attemptedCount += 1;
        let currentPercent = attemptedCount > 1 ? 72 : 65;
        let elapsedSeconds = 0;
        let streamedChars = 0;
        const candidateName = resolvedCandidate.model || candidateConfig.model || "多模态大模型";
        onProgress?.({
            stage: "analysis",
            percent: currentPercent,
            message: `正在连接多模态视觉模型 (${candidateName})...`,
        });
        const progressTimer = setInterval(() => {
            elapsedSeconds += 1;
            if (currentPercent < 94) {
                currentPercent += Math.max(1, Math.round((94 - currentPercent) * 0.08));
            } else if (currentPercent < 98 && streamedChars > 0) {
                const dynamicPercent = Math.min(98, 94 + Math.floor(streamedChars / 250));
                if (dynamicPercent > currentPercent) {
                    currentPercent = dynamicPercent;
                }
            }
            const message = streamedChars > 0
                ? `⚡ 大模型实时流式推演中 (已生成 ${streamedChars} 字 · 已耗时 ${elapsedSeconds}s)`
                : `正在深度解析视听画面与镜头语言 (已耗时 ${elapsedSeconds}s)...`;
            onProgress?.({ stage: "analysis", percent: currentPercent, message });
        }, 1000);
        try {
            const candidateContent = candidate.contentMode === "text"
                ? textFallbackContent
                : await buildAnalysisContent(prepared, effectiveRequirement, candidateConfig);
            const handleDelta = (delta: string) => {
                streamedChars += delta.length;
                if (streamedChars <= delta.length) {
                    onProgress?.({
                        stage: "analysis",
                        percent: Math.max(currentPercent, 90),
                        message: `⚡ 大模型已开始吐字响应 · 实时流式推演中...`,
                    });
                }
                onDelta?.(delta);
            };
            raw = await requestImageQuestion(candidateConfig, [{ role: "user", content: candidateContent }], handleDelta, {
                signal,
                maxTokens: 16384,
                max_tokens: 16384,
            } as any);
            lastError = undefined;
            break;
        } catch (error) {
            lastError = error;
            if (isReverseAnalysisAborted(error, signal) || !isReverseModelFallbackError(error)) throw error;
            throwIfAborted(signal);
        } finally {
            clearInterval(progressTimer);
        }
    }
    if (lastError) throw lastError;
    if (!raw.trim()) throw new Error("没有可用的视频反推模型，请在设置中配置反推、多模态或文本模型");
    throwIfAborted(signal);
    const normalized = normalizeReversePromptResponse(raw);
    if (!normalized.prompt.trim()) throw new Error("模型未返回可编辑的反推提示词");
    onProgress?.({ stage: "analysis", percent: 100, message: "视频反推完成" });
    const isAudioModel = isAudioCapableModel(config.model);
    const notes = [
        ...(prepared.audioError ? [`音频提取失败，以上结果仅依据画面拼图：${prepared.audioError}`] : []),
        ...(prepared.agentFallbackReason ? [`Agent 抽帧策略未采用：${prepared.agentFallbackReason}，已回退到本地默认策略。`] : []),
        ...(localAsrResult?.success
            ? [`本地 ASR：已成功命中 FunASR 字词打标 (${localAsrResult.words?.length || 0} 词)`]
            : localAsrEnabled
            ? [isAudioModel ? "本地 ASR 未就绪，已平滑回退至多模态大模型原生听音解析" : `本地 ASR：${localAsrResult?.fallbackReason || "未就绪"}，已回退至画面分析`]
            : isAudioModel
            ? ["语音对齐：采用大模型原生多模态听音解析"]
            : []),
        ...(prepared.durationSec > 60 && prepared.samplingPolicy.mode === "deconstruct"
            ? ["时长提示：创意反推专为 60 秒以内短视频分镜拆解设计，本次已针对前 60 秒黄金时段完成工业级高精分镜拆解。"]
            : []),
        ...normalized.notes,
    ];
    return {
        ...normalized,
        notes,
        durationSec: prepared.durationSec,
        frameCount: prepared.frameCount,
        submittedGridCount: prepared.submittedPages.length,
        omittedGridCount: Math.max(0, prepared.pages.length - prepared.submittedPages.length),
        localAsrResult,
        isDesktopFFmpegUsed: prepared.isDesktopFFmpegUsed,
    };
}

async function buildAnalysisContent(
    prepared: PreparedReverseVideo,
    userRequirement: string,
    candidateConfig?: { model?: string; apiFormat?: string; interfaceType?: string } | null
): Promise<AiTextMessage["content"]> {
    const omittedGridCount = Math.max(0, prepared.pages.length - prepared.submittedPages.length);
    const content: AiTextMessage["content"] = [
        {
            type: "text",
            text: `任务：${userRequirement}\n视频时长：${prepared.durationSec.toFixed(2)} 秒\n抽帧总数：${prepared.frameCount}\n拼图总页数：${prepared.pages.length}\n提交拼图页数：${prepared.submittedPages.length}\n${omittedGridCount ? `由于模型输入上限，未提交最后 ${omittedGridCount} 张拼图；不得把未提交部分当作不存在，也不得对其画面细节做确定性判断。\n` : ""}阅读顺序：拼图页按 pageIndex 升序；每张拼图内部按左到右、从上到下；每个格子的时间戳见图中标签和下方清单。`,
        },
        {
            type: "text",
            text: `时间轴 manifest：${prepared.timelineManifest.schema_version}；策略为 ${prepared.timelineManifest.method}；时间轴帧 ${prepared.timelineManifest.frame_count} 张；中点帧和场景变化帧已按 timestamp_sec 合并到上面的有序拼图流。`,
        },
    ];

    // 提炼算法画面突变候选切点事实 (供 VLM 结合人声口播与气口综合判定分镜，避免硬切破片)
    const sceneCutFrames = prepared.submittedPages
        .flatMap((page) => page.frames)
        .filter((f) =>
            (f.frameType === "visual_change_frame" ||
                (f as any).frameType === "scene_change" ||
                (f.sceneScore !== undefined && f.sceneScore >= 0.28)) &&
            f.timestampSec > 0.05
        );
    if (sceneCutFrames.length > 0) {
        const uniqueCuts = sceneCutFrames.filter(
            (cut, idx, arr) => arr.findIndex((c) => Math.abs(c.timestampSec - cut.timestampSec) < 0.4) === idx
        );
        content.push({
            type: "text",
            text: `【算法画面突变关键切点 (视觉物理切点参考，分镜判定必须综合主播语音气口、台词完整性与主体景别转换)】:\n${uniqueCuts
                .map((c) => `${c.timestampSec.toFixed(2)}s${c.sceneScore !== undefined ? ` (突变分 ${c.sceneScore.toFixed(2)})` : ""}`)
                .join("、")}`,
        });
    }

    for (const page of prepared.submittedPages) {
        content.push({
            type: "text",
            text: `第 ${page.pageIndex} 张时间序列拼图，包含帧 ${page.frameStart}-${page.frameEnd}：${page.frames
                .map((frame) => `${frame.frameId}@${frame.timestampSec.toFixed(3)}s/${frame.frameType || "timeline_sample"}${frame.activeWords ? `[对白:"${frame.activeWords}"]` : ""}`)
                .join("、")}`,
        });
        content.push({ type: "image_url", image_url: { url: await blobToDataUrl(page.blob) } });
    }
    const audioSupported = isModelAudioInputSupported(candidateConfig);
    if (prepared.audio && audioSupported) {
        content.push({ type: "text", text: "下面的音频是同一视频按无限创作台逻辑提取的单声道 WAV，请识别人声、口播、音乐、环境声、混响和节奏，并与画面共同分析。" });
        content.push({ type: "input_audio", input_audio: { data: await blobToBase64(prepared.audio), format: "wav" } });
    } else if (prepared.audio) {
        const hasWordAnnotations = Boolean(prepared.localAsrResult?.success && prepared.localAsrResult.words?.length);
        if (hasWordAnnotations) {
            content.push({ type: "text", text: "该视频包含音频轨道，关键对白与时间戳已由本地 ASR 在拼图上方标注，请综合画面与对白时间戳进行分镜拆解。" });
        } else {
            content.push({ type: "text", text: "该视频包含音频轨道，但当前模型通道不支持直接输入音频且本地 ASR 未命中对白，请依据画面动作与视觉线索进行分镜拆解，无法确认的声音细节标注“推测”。" });
        }
    } else {
        content.push({ type: "text", text: prepared.audioError ? `该视频音频提取失败（${prepared.audioError}），不要凭空补写台词、BGM 或环境声。` : "该视频没有可用音频，不要凭空补写台词、BGM 或环境声。" });
    }
    return content;
}

async function buildTextFallbackContent(prepared: PreparedReverseVideo, userRequirement: string): Promise<AiTextMessage["content"]> {
    const omittedGridCount = Math.max(0, prepared.pages.length - prepared.submittedPages.length);
    return [
        {
            type: "text",
            text: `任务：${userRequirement}\n当前仅能使用文本模型，无法读取拼图和音频；不得虚构画面、动作或声音细节。视频时长：${prepared.durationSec.toFixed(2)} 秒；抽帧总数：${prepared.frameCount}；拼图总页数：${prepared.pages.length}；未提交拼图页数：${omittedGridCount}。可用时间轴证据：${
                prepared.submittedPages
                    .flatMap((page) => page.frames)
                    .map((frame) => `${frame.frameId}@${frame.timestampSec.toFixed(3)}s/${frame.frameType || "timeline_sample"}`)
                    .join("、") || "无"
            }。请仅输出八大部分结构，并明确标注无法从文本证据确认的内容。`,
        },
    ];
}

function isReverseAnalysisAborted(error: unknown, signal?: AbortSignal) {
    if (signal?.aborted) return true;
    if (error instanceof DOMException && error.name === "AbortError") return true;
    if (error instanceof Error && error.name === "AbortError") return true;
    return /(?:请求已取消|request\s+(?:was\s+)?cancel(?:ed|led)|aborted)/i.test(error instanceof Error ? error.message : String(error || ""));
}

function throwIfAborted(signal?: AbortSignal) {
    if (!signal?.aborted) return;
    throw new DOMException("Aborted", "AbortError");
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("拼图读取失败"));
        reader.readAsDataURL(blob);
    });
}

async function blobToBase64(blob: Blob) {
    const dataUrl = await blobToDataUrl(blob);
    const separator = dataUrl.indexOf(",");
    return separator >= 0 ? dataUrl.slice(separator + 1) : dataUrl;
}

export function isModelAudioInputSupported(config?: { model?: string; apiFormat?: string; interfaceType?: string } | null): boolean {
    if (!config || !config.model) return false;
    const model = config.model.toLowerCase();
    const apiFormat = config.apiFormat?.toLowerCase();
    const interfaceType = config.interfaceType?.toLowerCase();

    if (apiFormat === "gemini" || model.includes("gemini")) return true;
    if (model.includes("audio")) return true;
    if (interfaceType === "claude-api" || model.includes("claude")) return false;
    return false;
}
