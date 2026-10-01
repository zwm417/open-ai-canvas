export type ReferenceVideo = {
    id: string;
    name: string;
    type: string;
    url: string;
    storageKey?: string;
    bytes?: number;
    width?: number;
    height?: number;
    durationMs?: number;
    // @opc-feature: workbench-optimistic-upload [start]
    posterUrl?: string;
    posterStorageKey?: string;
    uploading?: boolean;
    progress?: number;
    error?: string;
    // @opc-feature: workbench-optimistic-upload [end]
};

export type ReferenceAudio = {
    id: string;
    name: string;
    type: string;
    url: string;
    storageKey?: string;
    bytes?: number;
    durationMs?: number;
    // @opc-feature: workbench-optimistic-upload [start]
    uploading?: boolean;
    progress?: number;
    error?: string;
    // @opc-feature: workbench-optimistic-upload [end]
};
