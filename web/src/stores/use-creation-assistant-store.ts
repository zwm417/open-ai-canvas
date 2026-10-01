import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import { resolveMediaUrl } from "@/services/file-storage";
import { resolveImageUrl } from "@/services/image-storage";
import type { ReferenceVideo } from "@/types/media";
import type { ReferenceImage } from "@/types/image";
import type { CreationAssistantPlatform, CreationAssistantScriptType, CreationAssistantShootingStyle } from "@/lib/creation-assistant-catalog";
import type { ReverseGridSize } from "@/extensions/opc-infinite/services/video-reverse-contracts";
import { sanitizeAgentPolicyJson, type VideoSamplingMode } from "@/extensions/opc-infinite/media/video-decomposition";

export type CreationAssistantStage = "analysis" | "config" | "result";
export type CreationAssistantAnalysisStatus = "idle" | "analyzing" | "complete" | "failed";
export type CreationAssistantVideoAnalysisStatus = "idle" | "preparing" | "ready" | "failed";
export type CreationAssistantGenerationMethod = "config" | "reference_video";
export type CreationAssistantReverseStatus = "idle" | "preparing" | "analyzing" | "complete" | "failed";
export type CreationAssistantBusinessScenario = "ecommerce" | "local_life";
export type CreationAssistantLanguage = "zh" | "en";

export type CreationAssistantFileSummary = {
    fileId: string;
    order: number;
    name: string;
    mediaType: "image" | "video" | "audio";
    summary: string;
    confidence?: number;
    riskFlags?: string[];
};

export type CreationAssistantInsightItem = {
    itemId: string;
    text: string;
    sourceFileIds: string[];
    confidence: number;
    riskFlags: string[];
    userEdited?: boolean;
};

export type CreationAssistantInsightSection = {
    sectionKey: string;
    title: string;
    sectionType: "core" | "extension";
    order: number;
    items: CreationAssistantInsightItem[];
};

export type CreationAssistantVideoAnalysisSheet = {
    id: string;
    storageKey: string;
    url: string;
    sheetIndex: number;
    frameStart: number;
    frameEnd: number;
};

export type CreationAssistantVideoAnalysisAudio = {
    storageKey: string;
    url: string;
    mimeType: string;
    durationMs?: number;
};

export type CreationAssistantVideoAnalysis = {
    videoId: string;
    sourceStorageKey?: string;
    frameCount: number;
    sheetCount: number;
    sheets: CreationAssistantVideoAnalysisSheet[];
    audioPrepared: boolean;
    audio?: CreationAssistantVideoAnalysisAudio;
    audioError?: string;
};

export type CreationAssistantDraft = {
    sourceFileIds: string[];
    stage: CreationAssistantStage;
    analysisStatus: CreationAssistantAnalysisStatus;
    analysisError: string;
    videoAnalysisStatus: CreationAssistantVideoAnalysisStatus;
    videoAnalysisError: string;
    videoAnalyses: CreationAssistantVideoAnalysis[];
    fileSummaries: CreationAssistantFileSummary[];
    insightSections: CreationAssistantInsightSection[];
    businessScenario: CreationAssistantBusinessScenario;
    language: CreationAssistantLanguage;
    generationMethod: CreationAssistantGenerationMethod;
    scriptType: CreationAssistantScriptType;
    shootingStyle: CreationAssistantShootingStyle;
    durationSec: number;
    additionalNotes: string;
    primaryPlatform: CreationAssistantPlatform;
    secondaryPlatforms: CreationAssistantPlatform[];
    referenceVideos: ReferenceVideo[];
    reverseSourceUrl: string;
    reverseDownloadedUrl: string;
    reverseGridSize: ReverseGridSize;
    reverseSamplingMode: VideoSamplingMode;
    reverseSamplingFps: number;
    reverseIncludeMiddleFrames: boolean;
    reverseSceneThreshold: number;
    reverseMinSceneGapSec: number;
    reverseAgentPolicyJson: string;
    reverseStatus: CreationAssistantReverseStatus;
    reverseError: string;
    reversePrompt: string;
    reverseNotes: string[];
    reverseDurationSec: number;
    reverseFrameCount: number;
    reverseSubmittedGridCount: number;
    reverseOmittedGridCount: number;
    script: string;
    /**
     * The user-approved, editable reference script. Keep this separate from
     * `reversePrompt` so later generation can consume a stable document even
     * when the reverse-analysis panel is rerun.
     */
    referenceScript: string;
    referenceScriptDurationSec: number;
    referenceScriptAppliedAt: string;
};

type CreationAssistantStore = {
    hydrated: boolean;
    draft: CreationAssistantDraft;
    past: CreationAssistantDraft[];
    future: CreationAssistantDraft[];
    updateDraft: (patch: Partial<CreationAssistantDraft> | ((draft: CreationAssistantDraft) => CreationAssistantDraft)) => void;
    replaceDraft: (draft: CreationAssistantDraft) => void;
    setStage: (stage: CreationAssistantStage) => void;
    openInitial: () => void;
    resetForSources: (sourceFileIds: string[], videoAnalyses?: CreationAssistantVideoAnalysis[], videoAnalysisStatus?: CreationAssistantVideoAnalysisStatus) => void;
    undo: () => void;
    redo: () => void;
    reset: () => void;
};

export const CREATION_ASSISTANT_STORE_KEY = "infinite-canvas:creation_assistant_draft:v3";
export const CREATION_ASSISTANT_CORE_SECTIONS = [
    ["product_name", "商品名称"],
    ["category", "商品类目"],
    ["product_features", "产品特性"],
    ["core_selling_points", "核心卖点"],
    ["usage_scenarios", "使用场景"],
    ["target_audience", "目标人群"],
    ["audience_pain_points", "人群痛点"],
] as const;

export const defaultCreationAssistantDraft: CreationAssistantDraft = {
    sourceFileIds: [],
    stage: "analysis",
    analysisStatus: "idle",
    analysisError: "",
    videoAnalysisStatus: "idle",
    videoAnalysisError: "",
    videoAnalyses: [],
    fileSummaries: [],
    insightSections: CREATION_ASSISTANT_CORE_SECTIONS.map(([sectionKey, title], index) => ({ sectionKey, title, sectionType: "core" as const, order: index + 1, items: [] })),
    businessScenario: "ecommerce",
    language: "zh",
    generationMethod: "config",
    scriptType: "smart",
    shootingStyle: "smart",
    durationSec: 15,
    additionalNotes: "",
    primaryPlatform: "douyin",
    secondaryPlatforms: [],
    referenceVideos: [],
    reverseSourceUrl: "",
    reverseDownloadedUrl: "",
    reverseGridSize: "auto",
    reverseSamplingMode: "seconds_and_scene",
    reverseSamplingFps: 1,
    reverseIncludeMiddleFrames: true,
    reverseSceneThreshold: 0.20,
    reverseMinSceneGapSec: 0.3,
    reverseAgentPolicyJson: "",
    reverseStatus: "idle",
    reverseError: "",
    reversePrompt: "",
    reverseNotes: [],
    reverseDurationSec: 0,
    reverseFrameCount: 0,
    reverseSubmittedGridCount: 0,
    reverseOmittedGridCount: 0,
    script: "",
    referenceScript: "",
    referenceScriptDurationSec: 0,
    referenceScriptAppliedAt: "",
};

const MAX_HISTORY = 50;

const creationAssistantStorage: PersistStorage<CreationAssistantStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        try {
            const parsed = JSON.parse(value) as StorageValue<CreationAssistantStore>;
            if (!parsed?.state?.draft) return null;
            parsed.state.draft = { ...defaultCreationAssistantDraft, ...parsed.state.draft, referenceVideos: parsed.state.draft.referenceVideos || [], videoAnalyses: parsed.state.draft.videoAnalyses || [], reverseNotes: parsed.state.draft.reverseNotes || [], reverseAgentPolicyJson: sanitizeAgentPolicyJson(parsed.state.draft.reverseAgentPolicyJson || "") };
            parsed.state.draft.referenceVideos = await Promise.all(parsed.state.draft.referenceVideos.map(async (item) => ({ ...item, url: await resolveMediaUrl(item.storageKey, item.url) })));
            parsed.state.draft.videoAnalyses = await Promise.all(
                parsed.state.draft.videoAnalyses.map(async (analysis) => ({
                    ...analysis,
                    sheets: await Promise.all(analysis.sheets.map(async (sheet) => ({ ...sheet, url: await resolveImageUrl(sheet.storageKey, sheet.url) }))),
                    audio: analysis.audio ? { ...analysis.audio, url: await resolveMediaUrl(analysis.audio.storageKey, analysis.audio.url) } : undefined,
                })),
            );
            return parsed;
        } catch {
            return null;
        }
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useCreationAssistantStore = create<CreationAssistantStore>()(
    persist(
        (set) => ({
            hydrated: false,
            draft: defaultCreationAssistantDraft,
            past: [],
            future: [],
            updateDraft: (patch) =>
                set((state) => {
                    const next = typeof patch === "function" ? patch(state.draft) : { ...state.draft, ...patch };
                    if (JSON.stringify(next) === JSON.stringify(state.draft)) return state;
                    return { draft: next, past: [...state.past, state.draft].slice(-MAX_HISTORY), future: [] };
                }),
            replaceDraft: (draft) => set((state) => ({ draft, past: [...state.past, state.draft].slice(-MAX_HISTORY), future: [] })),
            setStage: (stage) => set((state) => ({ draft: { ...state.draft, stage }, past: [...state.past, state.draft].slice(-MAX_HISTORY), future: [] })),
            openInitial: () => set((state) => (state.draft.stage === "analysis" ? state : { draft: { ...state.draft, stage: "analysis" }, past: state.past, future: state.future })),
            resetForSources: (sourceFileIds, videoAnalyses = [], videoAnalysisStatus) =>
                set({
                    draft: {
                        ...defaultCreationAssistantDraft,
                        sourceFileIds,
                        videoAnalyses,
                        videoAnalysisStatus: videoAnalysisStatus || (videoAnalyses.length ? "ready" : "idle"),
                    },
                    past: [],
                    future: [],
                }),
            undo: () =>
                set((state) => {
                    const previous = state.past[state.past.length - 1];
                    return previous ? { draft: previous, past: state.past.slice(0, -1), future: [state.draft, ...state.future].slice(0, MAX_HISTORY) } : state;
                }),
            redo: () =>
                set((state) => {
                    const next = state.future[0];
                    return next ? { draft: next, past: [...state.past, state.draft].slice(-MAX_HISTORY), future: state.future.slice(1) } : state;
                }),
            reset: () => set((state) => ({ draft: { ...defaultCreationAssistantDraft }, past: [...state.past, state.draft].slice(-MAX_HISTORY), future: [] })),
        }),
        {
            name: CREATION_ASSISTANT_STORE_KEY,
            storage: creationAssistantStorage,
            partialize: (state) => ({ draft: state.draft }) as StorageValue<CreationAssistantStore>["state"],
            onRehydrateStorage: () => () => useCreationAssistantStore.setState({ hydrated: true }),
        },
    ),
);

export function sourceImageToSummary(image: ReferenceImage, order: number): CreationAssistantFileSummary {
    return { fileId: image.id, order, name: image.name, mediaType: "image", summary: "等待素材分析" };
}
