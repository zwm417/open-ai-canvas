// @opc-feature: local-first-media-resolver [start]
/**
 * 本地优先媒体治理中心 (Local-First Media Governance Center)
 * 遵循《商业化交付与极致流畅浏览性能规范》及《桌面端内嵌本地优先铁律》：
 *
 * 1. 动静分治与流式解耦 (Image vs Video Governance)：
 *    - 图片：本地磁盘/专属目录 (Tier 0: Desktop Native FS) ➔ 内存 LRU (Tier 1: <10ms) ➔ CacheStorage & IndexedDB (Tier 2) ➔ 远程拉取并沉淀落盘 (Tier 3)；
 *    - 视频：遵循《AGENTS.md》第 4.4 节商业化铁律，默认严禁全量 fetch().blob() 阻塞网络与撑爆内存。
 *      在桌面端直读本地磁盘 URI；在 Web 端与远程场景保持 HTTP 206 流式分段（Range Requests）透传，首屏 0 流量，悬停按需微切片，仅视频封面（Poster）参与本地持久沉淀。
 * 2. 真实 LRU 内存生命周期管理 (Zero Memory Leak & OOM Protection)：
 *    - 分设图片与视频独立容量阈值（图片 60 项，视频 3 项）；
 *    - 淘汰或覆盖时自动调用 URL.revokeObjectURL 并释放 Blob 强引用，杜绝内存堆无上限膨胀引发崩溃。
 * 3. 规范键与双轨存储支持 (Canonical Keys & Full Canvas Support)：
 *    - 脱敏 OSS 临时签名与时间戳，彻底消除重复下载与网络扣费；
 *    - 全面兼容画布 resource:* 与 image:* 双轨存储体系。
 */

import localforage from "localforage";

import {
    isDesktopShell,
    getLocalMediaFromDesktop,
    saveMediaToDedicatedFolder,
} from "@/extensions/desktop-media-save";
import {
    getResourceAccess,
    resolveResourceAccessURL,
    resourceFileUrl,
    resourceIdFromStorageKey,
} from "@/services/api/resources";
import {
    getCachedResourceBlob,
    peekCachedResourceObjectUrl,
    primeResourceBlobCache,
} from "@/services/resource-blob-cache";

export type MediaHitSource =
    | "memory"
    | "desktop-local"
    | "cache-storage"
    | "indexeddb"
    | "remote-fetched"
    | "remote-fallback";

export interface ResolvedLocalMedia {
    url: string;
    blob?: Blob;
    isLocal: boolean;
    hitSource: MediaHitSource;
    storageKey?: string;
    canonicalKey: string;
}

export interface ResolveLocalMediaOptions {
    fileName?: string;
    mediaType?: "image" | "video" | "audio";
    fallbackUrl?: string;
    subFolder?: string;
    silentPersist?: boolean;
    /** 显式允许视频全量 Blob 化（仅用于小文件离线导出或单文件打包，常规播放与悬停预览必须禁止） */
    allowFullVideoBlob?: boolean;
}

export const WEB_CACHE_NAME = "zhiying-media-local-v1";

export function isCacheStorageSupported(): boolean {
    return typeof window !== "undefined" && Boolean(window.caches?.open);
}

// 本地 IndexedDB 多表句柄（支持画布 image:* 与 media:*）
const imageStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_files" });
const mediaStore = localforage.createInstance({ name: "infinite-canvas", storeName: "media_files" });

// ──────────────────────────────────────────────────────────────────────────
// 1. 具备自动 Revoke 机制的企业级双轨 LRU 缓存
// ──────────────────────────────────────────────────────────────────────────

interface LRUEntry {
    key: string;
    url: string;
    blob?: Blob;
    mediaType: "image" | "video" | "audio";
    lastAccessed: number;
}

class MediaLRUCache {
    private entries = new Map<string, LRUEntry>();
    private maxImageEntries: number;
    private maxVideoEntries: number;

    constructor(maxImageEntries = 60, maxVideoEntries = 3) {
        this.maxImageEntries = maxImageEntries;
        this.maxVideoEntries = maxVideoEntries;
    }

    get(key: string): LRUEntry | undefined {
        const entry = this.entries.get(key);
        if (entry) {
            entry.lastAccessed = Date.now();
            this.entries.delete(key);
            this.entries.set(key, entry);
        }
        return entry;
    }

    getUrl(key: string): string | undefined {
        return this.get(key)?.url;
    }

    getBlob(key: string): Blob | undefined {
        return this.get(key)?.blob;
    }

    set(key: string, entry: Omit<LRUEntry, "lastAccessed">): void {
        const existing = this.entries.get(key);
        if (existing) {
            if (existing.url !== entry.url && existing.url.startsWith("blob:")) {
                try {
                    URL.revokeObjectURL(existing.url);
                } catch {}
            }
            this.entries.delete(key);
        }

        this.entries.set(key, {
            ...entry,
            lastAccessed: Date.now(),
        });

        this.evictIfNecessary(entry.mediaType);
    }

    private evictIfNecessary(mediaType: "image" | "video" | "audio"): void {
        const max = mediaType === "video" ? this.maxVideoEntries : this.maxImageEntries;
        let count = 0;
        for (const entry of this.entries.values()) {
            if (entry.mediaType === mediaType) count++;
        }

        if (count <= max) return;

        for (const [k, entry] of this.entries.entries()) {
            if (count <= max) break;
            if (entry.mediaType === mediaType) {
                if (entry.url.startsWith("blob:")) {
                    try {
                        URL.revokeObjectURL(entry.url);
                    } catch {}
                }
                this.entries.delete(k);
                count--;
            }
        }
    }

    delete(key: string): boolean {
        const entry = this.entries.get(key);
        if (entry) {
            if (entry.url.startsWith("blob:")) {
                try {
                    URL.revokeObjectURL(entry.url);
                } catch {}
            }
            return this.entries.delete(key);
        }
        return false;
    }

    clear(): void {
        for (const entry of this.entries.values()) {
            if (entry.url.startsWith("blob:")) {
                try {
                    URL.revokeObjectURL(entry.url);
                } catch {}
            }
        }
        this.entries.clear();
    }

    size(): number {
        return this.entries.size;
    }

    getMaxEntries(mediaType: "image" | "video"): number {
        return mediaType === "video" ? this.maxVideoEntries : this.maxImageEntries;
    }
}

const lruCache = new MediaLRUCache();
const inFlightResolutions = new Map<string, Promise<ResolvedLocalMedia>>();

/**
 * 基础规范化唯一键生成器 (脱敏 OSS 签名临时 Query 参数，保证永久稳定)
 */
export function getCanonicalMediaKey(storageKey?: string, url?: string): string {
    if (storageKey) {
        const resId = resourceIdFromStorageKey(storageKey);
        if (resId) return `res:${resId}`;
        if (storageKey.startsWith("res:")) return storageKey;
        return storageKey.replace(/[\\/:*?"<>|\s]/g, "_");
    }
    if (url) {
        if (url.startsWith("blob:") || url.startsWith("data:")) return url;
        try {
            const parsed = new URL(url, typeof window !== "undefined" ? window.location?.origin : "http://localhost");
            return `url:${parsed.origin}${parsed.pathname}`;
        } catch {
            return `url:${url.split("?")[0]}`;
        }
    }
    return `unknown_${Date.now()}`;
}

/**
 * 同步检查内存是否已就绪 (0ms 秒开探测)
 */
export function peekLocalFirstMedia(storageKey?: string, url?: string): string | null {
    const key = getCanonicalMediaKey(storageKey, url);
    const memUrl = lruCache.getUrl(key);
    if (memUrl) return memUrl;
    if (storageKey) {
        const idbMem = peekCachedResourceObjectUrl(storageKey);
        if (idbMem) return idbMem;
    }
    return null;
}

/**
 * 核心统一解析器：桌面本地优先 ➔ 内存 ➔ CacheStorage/IndexedDB ➔ 远程拉取并沉淀落盘
 */
export async function resolveLocalFirstMedia(
    storageKey?: string,
    options: ResolveLocalMediaOptions = {},
): Promise<ResolvedLocalMedia> {
    const mediaType = options.mediaType || "image";
    const canonicalKey = getCanonicalMediaKey(storageKey, options.fallbackUrl);

    // 0. 防并发雪崩 (In-Flight Task Reuse)
    const existing = inFlightResolutions.get(canonicalKey);
    if (existing) return existing;

    const task = (async (): Promise<ResolvedLocalMedia> => {
        // ══════════════════════════════════════════════════════════════════════════
        // Tier 0: 桌面端内嵌环境 —— 优先以本地磁盘直读为主 (0 外部流量，<10ms)
        // ══════════════════════════════════════════════════════════════════════════
        if (isDesktopShell()) {
            try {
                const desktopMedia = await getLocalMediaFromDesktop({
                    storageKey,
                    fileName: options.fileName,
                    url: options.fallbackUrl,
                    subFolder: options.subFolder,
                });

                if (desktopMedia && desktopMedia.exists) {
                    let localUrl = desktopMedia.localUrl;
                    let blob: Blob | undefined;

                    if (!localUrl && desktopMedia.filePath) {
                        localUrl = `file:///${desktopMedia.filePath.replace(/\\/g, "/")}`;
                    }

                    if (!localUrl) {
                        if (desktopMedia.buffer) {
                            blob = new Blob([desktopMedia.buffer as ArrayBuffer], {
                                type: desktopMedia.mimeType || (mediaType === "video" ? "video/mp4" : "image/png"),
                            });
                            localUrl = URL.createObjectURL(blob);
                        } else if (desktopMedia.dataUrl) {
                            localUrl = desktopMedia.dataUrl;
                        }
                    }

                    if (localUrl) {
                        lruCache.set(canonicalKey, {
                            key: canonicalKey,
                            url: localUrl,
                            blob,
                            mediaType,
                        });
                        return {
                            url: localUrl,
                            blob,
                            isLocal: true,
                            hitSource: "desktop-local",
                            storageKey,
                            canonicalKey,
                        };
                    }
                }
            } catch (err) {
                console.warn("[LocalFirstMedia] 桌面端原生直读失败，正在平滑降级至 Web 缓存管道:", err);
            }
        }

        // ══════════════════════════════════════════════════════════════════════════
        // Tier 1: 内存会话 LRU 级缓存 (0ms 秒开)
        // ══════════════════════════════════════════════════════════════════════════
        const memEntry = lruCache.get(canonicalKey);
        if (memEntry) {
            return {
                url: memEntry.url,
                blob: memEntry.blob,
                isLocal: true,
                hitSource: "memory",
                storageKey,
                canonicalKey,
            };
        }

        // ══════════════════════════════════════════════════════════════════════════
        // 动静分治：视频媒体特殊流式通道 (遵循 AGENTS.md 4.4 商业化规范)
        // ══════════════════════════════════════════════════════════════════════════
        if (mediaType === "video" && !options.allowFullVideoBlob) {
            // 视频严禁无节制 fetch().blob()，保持 HTTP 206 流式边下边播
            let streamUrl = options.fallbackUrl;
            const resId = storageKey ? (resourceIdFromStorageKey(storageKey) || (storageKey.startsWith("res:") ? storageKey.slice(4) : "")) : "";
            if (!streamUrl && storageKey && resId) {
                try {
                    const access = await getResourceAccess(storageKey, "display");
                    streamUrl = resolveResourceAccessURL(access.url);
                } catch {
                    streamUrl = resId ? resourceFileUrl(resId) : "";
                }
            }

            if (streamUrl) {
                lruCache.set(canonicalKey, {
                    key: canonicalKey,
                    url: streamUrl,
                    mediaType: "video",
                });
                return {
                    url: streamUrl,
                    isLocal: false,
                    hitSource: "remote-fallback",
                    storageKey,
                    canonicalKey,
                };
            }
        }

        // ══════════════════════════════════════════════════════════════════════════
        // Tier 2: 浏览器持久化本地存储 (CacheStorage & IndexedDB) - 适用于图片/音频
        // ══════════════════════════════════════════════════════════════════════════
        if (isCacheStorageSupported()) {
            try {
                const cache = await window.caches.open(WEB_CACHE_NAME);
                const pseudoRequest = new Request(`https://zhiying.local/media/${encodeURIComponent(canonicalKey)}`);
                const matched = await cache.match(pseudoRequest);
                if (matched) {
                    const blob = await matched.blob();
                    const objectUrl = URL.createObjectURL(blob);
                    lruCache.set(canonicalKey, {
                        key: canonicalKey,
                        url: objectUrl,
                        blob,
                        mediaType,
                    });

                    // 若当前在桌面端，顺便异步沉淀落盘至桌面专属目录
                    if (isDesktopShell() && options.silentPersist !== false) {
                        void saveMediaToDedicatedFolder({
                            fileName: options.fileName || `${canonicalKey.replace(/[^a-zA-Z0-9_-]/g, "_")}.${mediaType === "video" ? "mp4" : "png"}`,
                            buffer: await blob.arrayBuffer(),
                            mediaType,
                            subFolder: options.subFolder,
                            storageKey,
                            canonicalKey,
                        });
                    }

                    return {
                        url: objectUrl,
                        blob,
                        isLocal: true,
                        hitSource: "cache-storage",
                        storageKey,
                        canonicalKey,
                    };
                }
            } catch (err) {
                console.warn("[LocalFirstMedia] CacheStorage 读取异常，尝试回退 IndexedDB:", err);
            }
        }

        // Tier 2b: IndexedDB 本地缓存 (对接 resource_blobs, image_files, media_files)
        let idbBlob: Blob | null | undefined;
        if (storageKey) {
            try {
                if (storageKey.startsWith("image:") || storageKey.startsWith("generation-image:")) {
                    idbBlob = await imageStore.getItem<Blob>(storageKey);
                } else if (storageKey.startsWith("media:") || storageKey.startsWith("file:")) {
                    idbBlob = await mediaStore.getItem<Blob>(storageKey);
                } else {
                    const resId = resourceIdFromStorageKey(storageKey) || (storageKey.startsWith("res:") ? storageKey.slice(4) : "");
                    if (resId) {
                        idbBlob = await getCachedResourceBlob(storageKey);
                    }
                }
            } catch (err) {
                console.warn("[LocalFirstMedia] IndexedDB 读取异常:", err);
            }
        }

        if (idbBlob) {
            const objectUrl = URL.createObjectURL(idbBlob);
            lruCache.set(canonicalKey, {
                key: canonicalKey,
                url: objectUrl,
                blob: idbBlob,
                mediaType,
            });

            // 顺便回填至 CacheStorage 与桌面专属目录
            if (isCacheStorageSupported()) {
                try {
                    const cache = await window.caches.open(WEB_CACHE_NAME);
                    const pseudoRequest = new Request(`https://zhiying.local/media/${encodeURIComponent(canonicalKey)}`);
                    await cache.put(
                        pseudoRequest,
                        new Response(idbBlob, {
                            headers: {
                                "Content-Type": idbBlob.type || "application/octet-stream",
                                "Content-Length": String(idbBlob.size),
                            },
                        }),
                    );
                } catch {}
            }

            if (isDesktopShell() && options.silentPersist !== false) {
                const b = idbBlob;
                void b.arrayBuffer().then((buf) => {
                    void saveMediaToDedicatedFolder({
                        fileName: options.fileName || `${canonicalKey.replace(/[^a-zA-Z0-9_-]/g, "_")}.${mediaType === "video" ? "mp4" : "png"}`,
                        buffer: buf,
                        mediaType,
                        subFolder: options.subFolder,
                        storageKey,
                        canonicalKey,
                    });
                });
            }

            return {
                url: objectUrl,
                blob: idbBlob,
                isLocal: true,
                hitSource: "indexeddb",
                storageKey,
                canonicalKey,
            };
        }

        // ══════════════════════════════════════════════════════════════════════════
        // Tier 3: 远程拉取 + 双向自动落盘沉淀 (针对图片及显式允许的小视频)
        // ══════════════════════════════════════════════════════════════════════════
        let remoteTargetUrl = options.fallbackUrl;
        const resId = storageKey ? (resourceIdFromStorageKey(storageKey) || (storageKey.startsWith("res:") ? storageKey.slice(4) : "")) : "";
        if (!remoteTargetUrl && storageKey && resId) {
            try {
                const access = await getResourceAccess(storageKey, "display");
                remoteTargetUrl = resolveResourceAccessURL(access.url);
            } catch {
                remoteTargetUrl = resId ? resourceFileUrl(resId) : "";
            }
        }

        if (remoteTargetUrl && !remoteTargetUrl.startsWith("blob:") && !remoteTargetUrl.startsWith("data:")) {
            // 如果是视频但未显式开启 allowFullVideoBlob，直接返回流式 URL，不执行全量拉取
            if (mediaType === "video" && !options.allowFullVideoBlob) {
                return {
                    url: remoteTargetUrl,
                    isLocal: false,
                    hitSource: "remote-fallback",
                    storageKey,
                    canonicalKey,
                };
            }

            try {
                const fetchFn = typeof window !== "undefined" && window.fetch ? window.fetch : fetch;
                const fetchRes = await fetchFn(remoteTargetUrl, { mode: "cors" });
                if (fetchRes.ok) {
                    const blob = await fetchRes.blob();
                    const objectUrl = URL.createObjectURL(blob);
                    lruCache.set(canonicalKey, {
                        key: canonicalKey,
                        url: objectUrl,
                        blob,
                        mediaType,
                    });

                    // 1. 沉淀至浏览器持久化 CacheStorage
                    if (isCacheStorageSupported()) {
                        try {
                            const cache = await window.caches.open(WEB_CACHE_NAME);
                            const pseudoRequest = new Request(`https://zhiying.local/media/${encodeURIComponent(canonicalKey)}`);
                            const cacheResponse = new Response(blob, {
                                headers: {
                                    "Content-Type": blob.type || "application/octet-stream",
                                    "Content-Length": String(blob.size),
                                },
                            });
                            await cache.put(pseudoRequest, cacheResponse);
                        } catch (cacheErr) {
                            console.warn("[LocalFirstMedia] 写入 CacheStorage 异常:", cacheErr);
                        }
                    }

                    // 2. 沉淀至 IndexedDB
                    if (storageKey) {
                        if (storageKey.startsWith("image:") || storageKey.startsWith("generation-image:")) {
                            await imageStore.setItem(storageKey, blob).catch(() => null);
                        } else if (storageKey.startsWith("media:") || storageKey.startsWith("file:")) {
                            await mediaStore.setItem(storageKey, blob).catch(() => null);
                        } else {
                            await primeResourceBlobCache(storageKey, blob).catch(() => "");
                        }
                    }

                    // 3. 若在桌面端，后台自动沉淀落盘至专属文件夹
                    if (isDesktopShell() && options.silentPersist !== false) {
                        void blob.arrayBuffer().then((buf) => {
                            void saveMediaToDedicatedFolder({
                                fileName: options.fileName || `${canonicalKey.replace(/[^a-zA-Z0-9_-]/g, "_")}.${mediaType === "video" ? "mp4" : "png"}`,
                                buffer: buf,
                                mediaType,
                                subFolder: options.subFolder,
                                storageKey,
                                canonicalKey,
                            });
                        });
                    }

                    return {
                        url: objectUrl,
                        blob,
                        isLocal: false,
                        hitSource: "remote-fetched",
                        storageKey,
                        canonicalKey,
                    };
                }
            } catch (netErr) {
                console.warn("[LocalFirstMedia] 远程拉取并沉淀异常，优雅回退原始地址:", netErr);
            }
        }

        // ══════════════════════════════════════════════════════════════════════════
        // 最终优雅兜底回退 (Fail-Safe)
        // ══════════════════════════════════════════════════════════════════════════
        return {
            url: options.fallbackUrl || remoteTargetUrl || "",
            isLocal: false,
            hitSource: "remote-fallback",
            storageKey,
            canonicalKey,
        };
    })().finally(() => {
        inFlightResolutions.delete(canonicalKey);
    });

    inFlightResolutions.set(canonicalKey, task);
    return task;
}

/**
 * 主动将生成完成或已有媒体持久化落盘至本地 (桌面端落盘到用户目录，Web 端落盘到 CacheStorage 与 IndexedDB)
 */
export async function persistMediaLocally(
    storageKey: string,
    source: Blob | string,
    meta: { fileName?: string; mediaType?: "image" | "video" | "audio"; subFolder?: string } = {},
): Promise<boolean> {
    const canonicalKey = getCanonicalMediaKey(storageKey);
    const mediaType = meta.mediaType || "image";
    let blob: Blob | null = null;

    if (source instanceof Blob) {
        blob = source;
    } else if (typeof source === "string" && (source.startsWith("blob:") || source.startsWith("data:"))) {
        try {
            const fetchFn = typeof window !== "undefined" && window.fetch ? window.fetch : fetch;
            const res = await fetchFn(source);
            blob = await res.blob();
        } catch {}
    }

    if (blob) {
        const objUrl = URL.createObjectURL(blob);
        lruCache.set(canonicalKey, {
            key: canonicalKey,
            url: objUrl,
            blob,
            mediaType,
        });
    }

    // 1. 桌面端落盘
    if (isDesktopShell()) {
        try {
            const buf = blob ? await blob.arrayBuffer() : undefined;
            const res = await saveMediaToDedicatedFolder({
                fileName: meta.fileName || `${canonicalKey.replace(/[^a-zA-Z0-9_-]/g, "_")}.${mediaType === "video" ? "mp4" : "png"}`,
                buffer: buf,
                url: typeof source === "string" ? source : undefined,
                mediaType,
                subFolder: meta.subFolder,
                storageKey,
                canonicalKey,
            });
            if (res?.success) return true;
        } catch (err) {
            console.warn("[LocalFirstMedia] 桌面落盘失败，将回退至 Web 存储:", err);
        }
    }

    // 2. Web 端持久化 (CacheStorage) - 仅限图片与小体积资源
    let webSuccess = false;
    if (blob && isCacheStorageSupported() && mediaType !== "video") {
        try {
            const cache = await window.caches.open(WEB_CACHE_NAME);
            const pseudoRequest = new Request(`https://zhiying.local/media/${encodeURIComponent(canonicalKey)}`);
            await cache.put(
                pseudoRequest,
                new Response(blob, {
                    headers: { "Content-Type": blob.type, "Content-Length": String(blob.size) },
                }),
            );
            webSuccess = true;
        } catch {}
    }

    // 3. Web 端持久化 (IndexedDB)
    if (blob && storageKey) {
        if (storageKey.startsWith("image:") || storageKey.startsWith("generation-image:")) {
            await imageStore.setItem(storageKey, blob).catch(() => null);
            webSuccess = true;
        } else if (storageKey.startsWith("media:") || storageKey.startsWith("file:")) {
            await mediaStore.setItem(storageKey, blob).catch(() => null);
            webSuccess = true;
        } else {
            const resId = resourceIdFromStorageKey(storageKey) || (storageKey.startsWith("res:") ? storageKey.slice(4) : "");
            if (resId) {
                await primeResourceBlobCache(storageKey, blob).catch(() => "");
                webSuccess = true;
            }
        }
    }

    return webSuccess;
}

/**
 * 仅清除会话内存缓存，释放所有 Object URL，保留底层 CacheStorage (用于模拟页面刷新测试)
 */
export function clearMemoryCacheOnly(): void {
    lruCache.clear();
    inFlightResolutions.clear();
}

/**
 * 获取本地缓存指标与运行模式
 */
export async function getLocalFirstMediaStats(): Promise<{
    isDesktop: boolean;
    memoryCount: number;
    diskCacheCount: number;
}> {
    let diskCount = 0;
    if (isCacheStorageSupported()) {
        try {
            const cache = await window.caches.open(WEB_CACHE_NAME);
            const keys = await cache.keys();
            diskCount = keys.length;
        } catch {}
    }
    return {
        isDesktop: isDesktopShell(),
        memoryCount: lruCache.size(),
        diskCacheCount: diskCount,
    };
}

/**
 * 清除所有本地缓存 (包括会话内存与 CacheStorage，登出/清理时调用)
 */
export async function clearLocalFirstMediaCache(): Promise<void> {
    clearMemoryCacheOnly();
    if (isCacheStorageSupported()) {
        try {
            await window.caches.delete(WEB_CACHE_NAME);
        } catch {}
    }
}
// @opc-feature: local-first-media-resolver [end]
