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

export type ImageSessionWorkspaceSnapshot = {
    sessionId: string;
    skillId: string | null;
    prompt: string;
    references: ReferenceImage[];
    textReferences: ImageWorkbenchTextReference[];
    slotContainers?: Record<string, SlotFilesContainer>;
    model?: string;
    size?: string;
    quality?: string;
    count?: string;
    transparentBackground?: string;
    detailSet?: {
        draft: any;
        phase: "create" | "planning" | "review";
        plan: any;
        resultView: "grid" | "phone";
    };
    updatedAt: number;
};

type ImageWorkbenchStore = {
    hydrated: boolean;
    hasStoredDraft: boolean;
    draft: ImageWorkbenchDraft;
    sessionSnapshots: Record<string, ImageSessionWorkspaceSnapshot>;
    past: ImageWorkbenchDraft[];
    future: ImageWorkbenchDraft[];
    updateDraft: (patch: Partial<ImageWorkbenchDraft> | ((draft: ImageWorkbenchDraft) => ImageWorkbenchDraft)) => void;
    replaceDraft: (draft: ImageWorkbenchDraft) => void;
    saveSessionSnapshot: (sessionId: string, snapshot: Omit<ImageSessionWorkspaceSnapshot, "sessionId" | "updatedAt">) => void;
    getSessionSnapshot: (sessionId: string) => ImageSessionWorkspaceSnapshot | undefined;
    removeSessionSnapshot: (sessionId: string) => void;
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

const MAX_HISTORY = 20;

let persistTimer: ReturnType<typeof setTimeout> | null = null;

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
    setItem: (name, value) => {
        if (persistTimer) clearTimeout(persistTimer);
        persistTimer = setTimeout(() => {
            try {
                void localForageStorage.setItem(name, JSON.stringify(value));
            } catch (err) {
                console.warn("[image-workbench-store] Storage persist error:", err);
            }
        }, 200);
    },
    removeItem: (name) => {
        if (persistTimer) clearTimeout(persistTimer);
        return localForageStorage.removeItem(name);
    },
};

function areDraftsEqual(a: ImageWorkbenchDraft, b: ImageWorkbenchDraft): boolean {
    if (a === b) return true;
    if (
        a.sessionId !== b.sessionId ||
        a.prompt !== b.prompt ||
        a.model !== b.model ||
        a.size !== b.size ||
        a.quality !== b.quality ||
        a.count !== b.count ||
        a.transparentBackground !== b.transparentBackground
    ) {
        return false;
    }
    if (a.references !== b.references) {
        if (a.references?.length !== b.references?.length) return false;
        for (let i = 0; i < (a.references?.length || 0); i++) {
            const rA = a.references[i];
            const rB = b.references[i];
            if (rA?.id !== rB?.id || rA?.storageKey !== rB?.storageKey || rA?.dataUrl !== rB?.dataUrl) return false;
        }
    }
    if (a.textReferences !== b.textReferences) {
        if (a.textReferences?.length !== b.textReferences?.length) return false;
        for (let i = 0; i < (a.textReferences?.length || 0); i++) {
            const tA = a.textReferences[i];
            const tB = b.textReferences[i];
            if (tA?.id !== tB?.id || tA?.content !== tB?.content) return false;
        }
    }
    if (a.slotContainers !== b.slotContainers) {
        const aKeys = Object.keys(a.slotContainers || {});
        const bKeys = Object.keys(b.slotContainers || {});
        if (aKeys.length !== bKeys.length) return false;
        for (const k of aKeys) {
            const aCont = a.slotContainers?.[k];
            const bCont = b.slotContainers?.[k];
            if (!aCont || !bCont) {
                if (aCont !== bCont) return false;
                continue;
            }
            if (aCont.activeId !== bCont.activeId || aCont.files?.length !== bCont.files?.length) return false;
            const aFiles = aCont.files || [];
            const bFiles = bCont.files || [];
            for (let i = 0; i < aFiles.length; i++) {
                const fA = aFiles[i];
                const fB = bFiles[i];
                if (fA?.id !== fB?.id || fA?.dataUrl !== fB?.dataUrl || fA?.storageKey !== fB?.storageKey) return false;
            }
        }
    }
    return true;
}

function sanitizeSnapshotForPersist(snap: ImageSessionWorkspaceSnapshot): ImageSessionWorkspaceSnapshot {
    const sanitizedSlots: Record<string, SlotFilesContainer> = {};
    if (snap.slotContainers) {
        for (const [k, cont] of Object.entries(snap.slotContainers)) {
            sanitizedSlots[k] = {
                ...cont,
                files: (cont.files || []).map((f) => ({
                    ...f,
                    dataUrl: f.storageKey ? "" : (f.dataUrl?.startsWith("data:") && f.dataUrl.length > 200000 ? "" : f.dataUrl),
                    previewUrl: f.storageKey ? "" : f.previewUrl,
                })),
            };
        }
    }
    const sanitizedRefs = (snap.references || []).map((r) => ({
        ...r,
        dataUrl: r.storageKey ? "" : (r.dataUrl?.startsWith("data:") && r.dataUrl.length > 200000 ? "" : r.dataUrl),
    }));
    return {
        ...snap,
        references: sanitizedRefs,
        slotContainers: sanitizedSlots,
    };
}

export const useImageWorkbenchStore = create<ImageWorkbenchStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            hasStoredDraft: false,
            draft: defaultImageWorkbenchDraft,
            sessionSnapshots: {},
            past: [],
            future: [],
            updateDraft: (patch) =>
                set((state) => {
                    const next = typeof patch === "function" ? patch(state.draft) : { ...state.draft, ...patch };
                    if (areDraftsEqual(state.draft, next)) return state;
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
            saveSessionSnapshot: (sessionId, snapshot) =>
                set((state) => {
                    const next = { ...state.sessionSnapshots };
                    next[sessionId] = {
                        ...snapshot,
                        sessionId,
                        updatedAt: Date.now(),
                    };
                    const keys = Object.keys(next);
                    if (keys.length > 30) {
                        const sorted = keys.sort((a, b) => (next[a]?.updatedAt || 0) - (next[b]?.updatedAt || 0));
                        sorted.slice(0, keys.length - 30).forEach((k) => delete next[k]);
                    }
                    return { sessionSnapshots: next };
                }),
            getSessionSnapshot: (sessionId) => get().sessionSnapshots[sessionId],
            removeSessionSnapshot: (sessionId) =>
                set((state) => {
                    const next = { ...state.sessionSnapshots };
                    delete next[sessionId];
                    return { sessionSnapshots: next };
                }),
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
            partialize: (state) => {
                const recentSnapshots: Record<string, ImageSessionWorkspaceSnapshot> = {};
                const keys = Object.keys(state.sessionSnapshots || {});
                const sorted = keys.sort((a, b) => (state.sessionSnapshots[b]?.updatedAt || 0) - (state.sessionSnapshots[a]?.updatedAt || 0));
                for (const k of sorted.slice(0, 15)) {
                    const s = state.sessionSnapshots[k];
                    if (s) recentSnapshots[k] = sanitizeSnapshotForPersist(s);
                }
                return {
                    draft: state.draft,
                    sessionSnapshots: recentSnapshots,
                } as StorageValue<ImageWorkbenchStore>["state"];
            },
            onRehydrateStorage: () => (state) => {
                if (!state?.draft) {
                    useImageWorkbenchStore.setState({
                        hydrated: true,
                        hasStoredDraft: false,
                        draft: { ...defaultImageWorkbenchDraft, sessionId: nanoid() },
                        sessionSnapshots: state?.sessionSnapshots || {},
                        past: [],
                        future: [],
                    });
                    return;
                }
                useImageWorkbenchStore.setState((current) => ({
                    hydrated: true,
                    hasStoredDraft: Boolean(state.draft?.references?.length || state.draft?.prompt),
                    draft: { ...current.draft, sessionId: current.draft.sessionId || nanoid() },
                    sessionSnapshots: state?.sessionSnapshots || current.sessionSnapshots || {},
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
