/**
 * 桌面壳专属媒体保存扩展 (Desktop Media Saver)
 * 遵循 Out-of-Tree Extension First 原则，为智影创作提供自动/显式媒体保存至本地专属文件夹能力。
 */

export type DesktopSaveMediaOptions = {
    fileName: string;
    url?: string;
    buffer?: ArrayBuffer | Uint8Array;
    base64?: string;
    mediaType?: "image" | "video" | "audio";
    subFolder?: string;
    storageKey?: string;
    canonicalKey?: string;
};

export type DesktopSaveMediaResult = {
    success: boolean;
    filePath?: string;
    fileName?: string;
    folder?: string;
    baseDir?: string;
    error?: string;
};

export type DesktopLocalMediaQuery = {
    storageKey?: string;
    fileName?: string;
    mediaId?: string;
    url?: string;
    subFolder?: string;
};

export type DesktopLocalMediaResult = {
    exists: boolean;
    filePath?: string;
    localUrl?: string;
    dataUrl?: string;
    buffer?: ArrayBuffer | Uint8Array;
    mimeType?: string;
    size?: number;
    error?: string;
};

export interface DesktopBridgeSaveAPI {
    isDesktop?: boolean;
    saveMedia?: (options: DesktopSaveMediaOptions) => Promise<DesktopSaveMediaResult>;
    getMediaSaveDir?: () => Promise<string>;
    openMediaSaveDir?: (subFolder?: string) => Promise<string>;
    hasLocalMedia?: (query: DesktopLocalMediaQuery) => Promise<boolean>;
    getLocalMedia?: (query: DesktopLocalMediaQuery) => Promise<DesktopLocalMediaResult>;
    readLocalMedia?: (query: DesktopLocalMediaQuery) => Promise<DesktopLocalMediaResult>;
}

export function isDesktopShell(): boolean {
    if (typeof window === "undefined") return false;
    const bridge = (window as unknown as { desktopBridge?: DesktopBridgeSaveAPI }).desktopBridge;
    return Boolean(bridge?.isDesktop);
}

/**
 * 自动或手动将媒体文件保存至用户电脑的专属文件夹内
 */
export async function saveMediaToDedicatedFolder(options: DesktopSaveMediaOptions): Promise<DesktopSaveMediaResult | null> {
    if (typeof window === "undefined") return null;
    const bridge = (window as unknown as { desktopBridge?: DesktopBridgeSaveAPI }).desktopBridge;
    if (!bridge?.isDesktop || !bridge.saveMedia) return null;

    try {
        const payload: DesktopSaveMediaOptions = { ...options };
        // 若为 blob: URL，在渲染进程中读取为 ArrayBuffer，以便主进程直接写入
        if (payload.url && payload.url.startsWith("blob:") && !payload.buffer && !payload.base64) {
            try {
                const fetchFn = window.fetch;
                if (typeof fetchFn === "function") {
                    const blobRes = await fetchFn(payload.url);
                    if (blobRes.ok) {
                        payload.buffer = await blobRes.arrayBuffer();
                        delete payload.url;
                    }
                }
            } catch (blobErr) {
                console.warn("[desktopMediaSave] 读取本地 Blob 失败:", blobErr);
            }
        }
        return await bridge.saveMedia(payload);
    } catch (error) {
        console.warn("[desktopMediaSave] 保存到用户专属文件夹异常:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * 在系统文件资源管理器中打开专属文件夹
 */
export async function openDedicatedFolder(subFolder?: string): Promise<string | null> {
    if (typeof window === "undefined") return null;
    const bridge = (window as unknown as { desktopBridge?: DesktopBridgeSaveAPI }).desktopBridge;
    if (bridge?.isDesktop && bridge.openMediaSaveDir) {
        return await bridge.openMediaSaveDir(subFolder);
    }
    return null;
}

/**
 * 获取当前专属文件夹基础路径
 */
export async function getDedicatedFolder(): Promise<string | null> {
    if (typeof window === "undefined") return null;
    const bridge = (window as unknown as { desktopBridge?: DesktopBridgeSaveAPI }).desktopBridge;
    if (bridge?.isDesktop && bridge.getMediaSaveDir) {
        return await bridge.getMediaSaveDir();
    }
    return null;
}

/**
 * 探测桌面端专属目录/缓存中是否已存在该媒体
 */
export async function hasLocalMediaInDesktop(query: DesktopLocalMediaQuery): Promise<boolean> {
    if (typeof window === "undefined") return false;
    const bridge = (window as unknown as { desktopBridge?: DesktopBridgeSaveAPI }).desktopBridge;
    if (!bridge?.isDesktop) return false;
    try {
        if (bridge.hasLocalMedia) {
            return await bridge.hasLocalMedia(query);
        }
        if (bridge.getLocalMedia) {
            const res = await bridge.getLocalMedia(query);
            return Boolean(res?.exists);
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * 优先从桌面端本地读取媒体资源，0 外部网络开销与 0 云端流量损耗
 */
export async function getLocalMediaFromDesktop(query: DesktopLocalMediaQuery): Promise<DesktopLocalMediaResult | null> {
    if (typeof window === "undefined") return null;
    const bridge = (window as unknown as { desktopBridge?: DesktopBridgeSaveAPI }).desktopBridge;
    if (!bridge?.isDesktop) return null;
    try {
        if (bridge.getLocalMedia) {
            const res = await bridge.getLocalMedia(query);
            if (res && res.exists) return res;
        }
        if (bridge.readLocalMedia) {
            const res = await bridge.readLocalMedia(query);
            if (res && res.exists) return res;
        }
        return null;
    } catch (err) {
        console.warn("[desktopMediaSave] 探测或读取桌面本地媒体异常，将自动平滑降级:", err);
        return null;
    }
}
