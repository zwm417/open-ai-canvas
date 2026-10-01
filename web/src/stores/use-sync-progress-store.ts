import { create } from "zustand";

export type SyncProjectProgress = {
    projectId: string;
    total: number;
    completed: number;
    phase: "pending" | "uploading" | "saving" | "done" | "error" | "conflict";
    message?: string;
    draftCount?: number;
};

// @opc-feature: remote-user-data-phase [start]
export type RemoteSyncPhase = "inactive" | "hydrating" | "ready" | "failed";
// @opc-feature: remote-user-data-phase [end]

type SyncProgressStore = {
    syncingProjects: Record<string, SyncProjectProgress>;
    // @opc-feature: remote-user-data-phase [start]
    remoteUserDataPhase: RemoteSyncPhase;
    setRemoteUserDataPhase: (phase: RemoteSyncPhase) => void;
    activeUploadsCount: number;
    registerActiveUpload: () => () => void;
    // @opc-feature: remote-user-data-phase [end]
    setProjectProgress: (projectId: string, patch: Partial<SyncProjectProgress> | null) => void;
    incrementProjectCompleted: (projectId: string) => void;
    clearAll: () => void;
    isAnySyncing: () => boolean;
};

export const useSyncProgressStore = create<SyncProgressStore>((set, get) => ({
    syncingProjects: {},
    // @opc-feature: remote-user-data-phase [start]
    remoteUserDataPhase: "inactive",
    setRemoteUserDataPhase: (phase) => set({ remoteUserDataPhase: phase }),
    activeUploadsCount: 0,
    registerActiveUpload: () => {
        set((state) => ({ activeUploadsCount: state.activeUploadsCount + 1 }));
        let released = false;
        return () => {
            if (released) return;
            released = true;
            set((state) => ({ activeUploadsCount: Math.max(0, state.activeUploadsCount - 1) }));
        };
    },
    // @opc-feature: remote-user-data-phase [end]
    setProjectProgress: (projectId, patch) =>
        set((state) => {
            if (!patch) {
                const next = { ...state.syncingProjects };
                delete next[projectId];
                return { syncingProjects: next };
            }
            const current = state.syncingProjects[projectId] || {
                projectId,
                total: 0,
                completed: 0,
                phase: "uploading",
            };
            return {
                syncingProjects: {
                    ...state.syncingProjects,
                    [projectId]: { ...current, ...patch },
                },
            };
        }),
    incrementProjectCompleted: (projectId) =>
        set((state) => {
            const current = state.syncingProjects[projectId];
            if (!current) return state;
            return {
                syncingProjects: {
                    ...state.syncingProjects,
                    [projectId]: {
                        ...current,
                        completed: Math.min(current.total, current.completed + 1),
                    },
                },
            };
        }),
    clearAll: () => set({ syncingProjects: {} }),
    isAnySyncing: () => {
        if (get().activeUploadsCount > 0) return true;
        const list = Object.values(get().syncingProjects);
        return list.some((item) => item.phase !== "done");
    },
}));

if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", (event) => {
        if (useSyncProgressStore.getState().isAnySyncing()) {
            event.preventDefault();
            event.returnValue = "系统正在上传文件或同步画布至云端，请勿关闭页面。";
            return "系统正在上传文件或同步画布至云端，请勿关闭页面。";
        }
    });
}
