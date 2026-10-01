import { create } from "zustand";

export interface BatchReferenceClipboardItem {
    nodeId: string;
    title?: string;
    previewUrl?: string;
    storageKey?: string;
    mimeType?: string;
}

interface BatchReferenceClipboardStore {
    clipboard: BatchReferenceClipboardItem | null;
    copy: (item: BatchReferenceClipboardItem) => void;
    clear: () => void;
}

export const useBatchReferenceClipboard = create<BatchReferenceClipboardStore>((set) => ({
    clipboard: null,
    copy: (item) => set({ clipboard: item }),
    clear: () => set({ clipboard: null }),
}));

export function copyBatchReference(item: BatchReferenceClipboardItem) {
    useBatchReferenceClipboard.getState().copy(item);
}

export function getBatchReferenceClipboard(): BatchReferenceClipboardItem | null {
    return useBatchReferenceClipboard.getState().clipboard;
}

export function clearBatchReferenceClipboard() {
    useBatchReferenceClipboard.getState().clear();
}
