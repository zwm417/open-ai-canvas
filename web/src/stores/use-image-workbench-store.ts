// @opc-feature: image_workbench [start]
import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import { nanoid } from "nanoid";

import { localForageStorage } from "@/lib/localforage-storage";
import { resolveImageUrl } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";
import type { SlotFilesContainer } from "@/extensions/image-workbench-skills/types/skill-contract";

export type ImageWorkbenchTextReference = { id: string; name: string; content: string };

export type ImageWorkbenchDraft = {
    sessionId: string;
    prompt: string;
    references: ReferenceImage[];
    textReferences: ImageWorkbenchTextReference[];
    slotContainers?: Record<string, SlotFilesContainer>;
    model?: string;
    size?: string;
    quality?: string;
    count?: string;
    transparentBackground?: string;
};

type ImageWorkbenchStore = {
    hydrated: boolean;
    hasStoredDraft: boolean;
    draft: ImageWorkbenchDraft;
    past: ImageWorkbenchDraft[];
    future: ImageWorkbenchDraft[];
    updateDraft: (patch: Partial<ImageWorkbenchDraft> | ((draft: ImageWorkbenchDraft) => ImageWorkbenchDraft)) => void;
    replaceDraft: (draft: ImageWorkbenchDraft) => void;
    undo: () => void;
    redo: () => void;
    reset: () => void;
    clearHistory: () => void;
};

export const IMAGE_WORKBENCH_STORE_KEY = "infinite-canvas:image_workbench_draft:v1";

export const defaultImageWorkbenchDraft: ImageWorkbenchDraft = {
    sessionId: "",
    prompt: "",
    references: [],
    textReferences: [],
    slotContainers: {},
};

const MAX_HISTORY = 50;

const imageWorkbenchStorage: PersistStorage<ImageWorkbenchStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        try {
            const parsed = JSON.parse(value) as StorageValue<ImageWorkbenchStore>;
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

export const useImageWorkbenchStore = create<ImageWorkbenchStore>()(
    persist(
        (set) => ({
            hydrated: false,
            hasStoredDraft: false,
            draft: defaultImageWorkbenchDraft,
            past: [],
            future: [],
            updateDraft: (patch) =>
                set((state) => {
                    const next = typeof patch === "function" ? patch(state.draft) : { ...state.draft, ...patch };
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
                    draft: { ...defaultImageWorkbenchDraft, sessionId: nanoid() },
                    past: [...state.past, state.draft].slice(-MAX_HISTORY),
                    future: [],
                })),
            clearHistory: () => set({ past: [], future: [] }),
        }),
        {
            name: IMAGE_WORKBENCH_STORE_KEY,
            storage: imageWorkbenchStorage,
            partialize: (state) => ({ draft: state.draft }) as StorageValue<ImageWorkbenchStore>["state"],
            onRehydrateStorage: () => (state) => {
                useImageWorkbenchStore.setState((current) => ({
                    hydrated: true,
                    hasStoredDraft: Boolean(state?.draft?.references?.length || state?.draft?.prompt),
                    draft: { ...current.draft, sessionId: current.draft.sessionId || nanoid() },
                }));
            },
        },
    ),
);

async function restoreDraft(draft: ImageWorkbenchDraft | undefined): Promise<ImageWorkbenchDraft> {
    const source = draft || defaultImageWorkbenchDraft;
    const references = await Promise.all(
        (source.references || []).map(async (item) => ({
            ...item,
            dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl),
            uploading: false,
            progress: undefined,
        })),
    );
    const restoredSlotContainers: Record<string, SlotFilesContainer> = {};
    if (source.slotContainers) {
        for (const [slotId, container] of Object.entries(source.slotContainers)) {
            const files = await Promise.all(
                (container.files || []).map(async (file) => ({
                    ...file,
                    previewUrl: await resolveImageUrl(file.storageKey, file.previewUrl || file.dataUrl),
                    dataUrl: await resolveImageUrl(file.storageKey, file.dataUrl || file.previewUrl),
                })),
            );
            restoredSlotContainers[slotId] = {
                ...container,
                files,
            };
        }
    }
    return {
        ...defaultImageWorkbenchDraft,
        ...source,
        sessionId: source.sessionId || nanoid(),
        references,
        slotContainers: restoredSlotContainers,
        textReferences: source.textReferences || [],
    };
}
// @opc-feature: image_workbench [end]
