// @opc-feature: depth-video [start]
// 深度视频桌面桥接探测层：对 window.desktopBridge.depthVideo 的可选式类型封装。
// 纯浏览器环境（无桌面壳）返回 null，由能力层据此隐藏功能入口。

export type DepthVideoProbeResult = {
    supported: boolean;
    reason: string;
    runtimeReady: boolean;
    modelReady: boolean;
    cudaAvailable: boolean;
    device: "cpu" | "cuda";
    version: string;
};

export type DepthVideoJobEvent = {
    jobId: string;
    kind: "progress" | "completed" | "failed" | "cancelled";
    stage?: string;
    progress?: number;
    status?: string;
    queuePosition?: number;
    error?: string;
};

export type DepthVideoOutput = {
    buffer: ArrayBuffer;
    meta: { width: number; height: number; durationMs: number; size: number; device: string };
};

export type DepthVideoBridgeApi = {
    probe: () => Promise<DepthVideoProbeResult>;
    start: (input: { video: Uint8Array; fileName?: string }) => Promise<{ jobId: string; queuePosition: number }>;
    onProgress: (callback: (event: DepthVideoJobEvent) => void) => () => void;
    onJobEvent: (callback: (event: DepthVideoJobEvent) => void) => () => void;
    readOutput: (jobId: string) => Promise<DepthVideoOutput>;
    cancel: (jobId: string) => Promise<{ success: boolean }>;
    listActive: () => Promise<Array<{ jobId: string; status: string; stage: string; progress: number; startedAt: number }>>;
    cleanup: (jobId: string) => Promise<{ success: boolean }>;
};

type DesktopBridgeHost = {
    desktopBridge?: {
        depthVideo?: DepthVideoBridgeApi;
    };
};

export function isDesktopShell(): boolean {
    return typeof window !== "undefined" && Boolean((window as unknown as DesktopBridgeHost).desktopBridge);
}

export function getDepthVideoBridge(): DepthVideoBridgeApi | null {
    if (typeof window === "undefined") return null;
    return (window as unknown as DesktopBridgeHost).desktopBridge?.depthVideo ?? null;
}
// @opc-feature: depth-video [end]
