import { deleteStoredImages, uploadImage } from "@/services/image-storage";
import { deleteStoredMedia, uploadMediaFile } from "@/services/file-storage";
import { decomposeVideo, extractVideoAudio, revokeVideoDecomposition, type VideoContactSheet, type VideoDecompositionOptions } from "@/extensions/opc-infinite/media/video-decomposition";
import type { ReferenceVideo } from "@/types/media";
import type { CreationAssistantVideoAnalysis, CreationAssistantVideoAnalysisAudio, CreationAssistantVideoAnalysisSheet } from "@/stores/use-creation-assistant-store";

export const CREATION_ASSISTANT_VIDEO_DECOMPOSITION_OPTIONS: VideoDecompositionOptions = {
    frameCount: 24,
    sheetCount: 3,
    tileWidth: 360,
    tileHeight: 520,
    labelHeight: 82,
};

const preparationCache = new Map<string, Promise<CreationAssistantVideoAnalysis>>();

export function prepareCreationAssistantVideos(videos: ReferenceVideo[], existingAnalyses: CreationAssistantVideoAnalysis[] = [], options: VideoDecompositionOptions = CREATION_ASSISTANT_VIDEO_DECOMPOSITION_OPTIONS) {
    return Promise.all(
        videos.map((video) => {
            const existing = existingAnalyses.find((analysis) => isReusableCreationAssistantVideoAnalysis(video, analysis) && analysis.audioPrepared && analysis.sheets.length);
            return existing || prepareCreationAssistantVideo(video, options);
        }),
    );
}

export function hasPreparedCreationAssistantVideos(videos: ReferenceVideo[], analyses: CreationAssistantVideoAnalysis[]) {
    return videos.every((video) => {
        const analysis = analyses.find((item) => item.videoId === video.id);
        return Boolean(analysis && isReusableCreationAssistantVideoAnalysis(video, analysis) && analysis.audioPrepared && analysis.sheets.length);
    });
}

export function isReusableCreationAssistantVideoAnalysis(video: ReferenceVideo, analysis: CreationAssistantVideoAnalysis) {
    if (analysis.videoId !== video.id) return false;
    if (analysis.sourceStorageKey || video.storageKey) return analysis.sourceStorageKey === (video.storageKey || video.url);
    return true;
}

export function clearPreparedCreationAssistantVideos(videos: ReferenceVideo[]) {
    videos.forEach((video) => preparationCache.delete(videoCacheKey(video)));
}

export async function disposeCreationAssistantVideoAnalyses(analyses: CreationAssistantVideoAnalysis[]) {
    const keys = analyses.flatMap((analysis) => analysis.sheets.map((sheet) => sheet.storageKey)).filter(Boolean);
    if (keys.length) await deleteStoredImages(keys);
    const audioKeys = analyses.map((analysis) => analysis.audio?.storageKey).filter((key): key is string => Boolean(key));
    if (audioKeys.length) await deleteStoredMedia(audioKeys);
    analyses.forEach((analysis) => {
        if (analysis.sourceStorageKey) preparationCache.delete(`${analysis.videoId}:${analysis.sourceStorageKey}`);
    });
}

async function prepareCreationAssistantVideo(video: ReferenceVideo, options: VideoDecompositionOptions) {
    const key = videoCacheKey(video);
    const cached = preparationCache.get(key);
    if (cached) return cached;
    const promise = buildCreationAssistantVideoAnalysis(video, options).catch((error) => {
        preparationCache.delete(key);
        throw error;
    });
    preparationCache.set(key, promise);
    return promise;
}

async function buildCreationAssistantVideoAnalysis(video: ReferenceVideo, options: VideoDecompositionOptions): Promise<CreationAssistantVideoAnalysis> {
    const decomposition = await decomposeVideo(video.url, options);
    const storageKeys: string[] = [];
    const audioStorageKeys: string[] = [];
    try {
        const sheets: CreationAssistantVideoAnalysisSheet[] = await Promise.all(
            decomposition.sheets.map(async (sheet) => {
                const stored = await uploadImage(sheet.blob);
                storageKeys.push(stored.storageKey);
                return {
                    id: `${video.id}:sheet:${sheet.sheetIndex}`,
                    storageKey: stored.storageKey,
                    url: stored.url,
                    sheetIndex: sheet.sheetIndex,
                    frameStart: sheet.frameStart,
                    frameEnd: sheet.frameEnd,
                };
            }),
        );
        let audio: CreationAssistantVideoAnalysisAudio | undefined;
        let audioError = "";
        try {
            const extractedAudio = await extractVideoAudio(video.url);
            if (extractedAudio) {
                const audioBlob = extractedAudio instanceof Blob ? extractedAudio : (extractedAudio as { blob: Blob }).blob;
                const stored = await uploadMediaFile(audioBlob, "creation-assistant-derived-audio");
                audioStorageKeys.push(stored.storageKey);
                audio = { storageKey: stored.storageKey, url: stored.url, mimeType: stored.mimeType, durationMs: stored.durationMs };
            }
        } catch (error) {
            await deleteStoredMedia(audioStorageKeys);
            audioError = error instanceof Error ? error.message : "视频音频提取失败";
        }
        return { videoId: video.id, sourceStorageKey: video.storageKey || video.url, frameCount: decomposition.frameCount, sheetCount: decomposition.sheetCount, sheets, audioPrepared: true, audio, ...(audioError ? { audioError } : {}) };
    } catch (error) {
        await deleteStoredImages(storageKeys);
        await deleteStoredMedia(audioStorageKeys);
        throw error;
    } finally {
        revokeVideoDecomposition(decomposition);
    }
}

function videoCacheKey(video: ReferenceVideo) {
    return `${video.id}:${video.storageKey || video.url}`;
}
