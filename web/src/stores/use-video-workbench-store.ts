import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import { nanoid } from "nanoid";

import { localForageStorage } from "@/lib/localforage-storage";
import { resolveMediaUrl } from "@/services/file-storage";
import { resolveImageUrl } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import type { VideoCreationPlan } from "@/lib/video-segment-contract";

export type VideoReferenceKind = "image" | "video" | "audio";
export type VideoReferenceOrderItem = { id: string; kind: VideoReferenceKind };
export type VideoTextReference = { id: string; name: string; content: string };

export type VideoWorkbenchDraft = {
    sessionId: string;
    prompt: string;
    references: ReferenceImage[];
    videoReferences: ReferenceVideo[];
    audioReferences: ReferenceAudio[];
    textReferences: VideoTextReference[];
    referenceOrder: VideoReferenceOrderItem[];
    model: string;
    aspectRatio: string;
    resolution: string;
    durationSec: number;
    creationPlan?: VideoCreationPlan;
};

type VideoWorkbenchStore = {
    hydrated: boolean;
    hasStoredDraft: boolean;
    draft: VideoWorkbenchDraft;
    past: VideoWorkbenchDraft[];
    future: VideoWorkbenchDraft[];
    updateDraft: (patch: Partial<VideoWorkbenchDraft> | ((draft: VideoWorkbenchDraft) => VideoWorkbenchDraft)) => void;
    replaceDraft: (draft: VideoWorkbenchDraft) => void;
    undo: () => void;
    redo: () => void;
    reset: () => void;
    clearHistory: () => void;
};

export const VIDEO_WORKBENCH_STORE_KEY = "infinite-canvas:video_workbench_draft:v1";
export const defaultVideoWorkbenchDraft: VideoWorkbenchDraft = {
    sessionId: "",
    prompt: "",
    references: [],
    videoReferences: [],
    audioReferences: [],
    textReferences: [],
    referenceOrder: [],
    model: "",
    aspectRatio: "9:16",
    resolution: "720p",
    durationSec: 10,
};

const MAX_HISTORY = 50;

const videoWorkbenchStorage: PersistStorage<VideoWorkbenchStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        try {
            const parsed = JSON.parse(value) as StorageValue<VideoWorkbenchStore>;
            if (!parsed?.state?.draft) return null;
            parsed.state.draft = await restoreDraft(parsed.state.draft);
            return parsed;
        } catch {
            return null;
        }
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useVideoWorkbenchStore = create<VideoWorkbenchStore>()(
    persist(
        (set) => ({
            hydrated: false,
            hasStoredDraft: false,
            draft: defaultVideoWorkbenchDraft,
            past: [],
            future: [],
            updateDraft: (patch) =>
                set((state) => {
                    const next = typeof patch === "function" ? patch(state.draft) : { ...state.draft, ...patch };
                    const planWasExplicitlyUpdated = typeof patch !== "function" && Object.prototype.hasOwnProperty.call(patch, "creationPlan");
                    const creationInputsChanged = ["prompt", "references", "videoReferences", "audioReferences", "textReferences", "referenceOrder", "model", "aspectRatio", "resolution", "durationSec"].some((key) => JSON.stringify(next[key as keyof VideoWorkbenchDraft]) !== JSON.stringify(state.draft[key as keyof VideoWorkbenchDraft]));
                    if (creationInputsChanged && !planWasExplicitlyUpdated) delete next.creationPlan;
                    if (JSON.stringify(next) === JSON.stringify(state.draft)) return state;
                    return {
                        draft: next,
                        past: [...state.past, state.draft].slice(-MAX_HISTORY),
                        future: [],
                    };
                }),
            replaceDraft: (draft) =>
                set((state) => ({
                    draft,
                    past: [...state.past, state.draft].slice(-MAX_HISTORY),
                    future: [],
                })),
            undo: () =>
                set((state) => {
                    const previous = state.past[state.past.length - 1];
                    if (!previous) return state;
                    return {
                        draft: previous,
                        past: state.past.slice(0, -1),
                        future: [state.draft, ...state.future].slice(0, MAX_HISTORY),
                    };
                }),
            redo: () =>
                set((state) => {
                    const next = state.future[0];
                    if (!next) return state;
                    return {
                        draft: next,
                        past: [...state.past, state.draft].slice(-MAX_HISTORY),
                        future: state.future.slice(1),
                    };
                }),
            reset: () =>
                set((state) => ({
                    draft: { ...defaultVideoWorkbenchDraft, sessionId: nanoid() },
                    past: [...state.past, state.draft].slice(-MAX_HISTORY),
                    future: [],
                })),
            clearHistory: () => set({ past: [], future: [] }),
        }),
        {
            name: VIDEO_WORKBENCH_STORE_KEY,
            storage: videoWorkbenchStorage,
            partialize: (state) => ({ draft: state.draft }) as StorageValue<VideoWorkbenchStore>["state"],
            onRehydrateStorage: () => (state) => {
                useVideoWorkbenchStore.setState((current) => ({
                    hydrated: true,
                    hasStoredDraft: Boolean(state?.draft?.model),
                    draft: { ...current.draft, sessionId: current.draft.sessionId || nanoid() },
                }));
            },
        },
    ),
);

async function restoreDraft(draft: VideoWorkbenchDraft | undefined): Promise<VideoWorkbenchDraft> {
    const source = draft || defaultVideoWorkbenchDraft;
    // @opc-feature: workbench-optimistic-upload [start]
    const [references, videoReferences, audioReferences] = await Promise.all([
        Promise.all((source.references || []).map(async (item) => ({ ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl), uploading: false, progress: undefined }))),
        Promise.all((source.videoReferences || []).map(async (item) => ({
            ...item,
            url: await resolveMediaUrl(item.storageKey, item.url),
            posterUrl: item.posterStorageKey ? await resolveImageUrl(item.posterStorageKey, item.posterUrl) : item.posterUrl,
            uploading: false,
            progress: undefined,
        }))),
        Promise.all((source.audioReferences || []).map(async (item) => ({ ...item, url: await resolveMediaUrl(item.storageKey, item.url), uploading: false, progress: undefined }))),
    ]);
    // @opc-feature: workbench-optimistic-upload [end]
    return {
        ...defaultVideoWorkbenchDraft,
        ...source,
        sessionId: source.sessionId || nanoid(),
        references,
        videoReferences,
        audioReferences,
        textReferences: source.textReferences || [],
        referenceOrder: source.referenceOrder || [],
    };
}
