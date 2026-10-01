import localforage from "localforage";
import { nanoid } from "nanoid";

import { getActiveUserScope } from "@/lib/user-scope";
import { captureVideoPoster, detectVideoAudioTrackFromBlob } from "@/lib/video-poster";
import { getResourceAccess, resolveResourceAccessURL, resourceFileUrl, resourceIdFromStorageKey, resourceStorageKey, ResourceUploadError, uploadResourceFile } from "@/services/api/resources";
import { uploadImage, type UploadedImage } from "@/services/image-storage";
import { getCachedResourceBlob, getCachedResourceObjectUrl, peekCachedResourceObjectUrl, primeResourceBlobCache } from "@/services/resource-blob-cache";
import { peekLocalFirstMedia, resolveLocalFirstMedia } from "@/services/local-first-media-resolver";
// @opc-feature: asset-deduplication [start]
import { computeBlobSha256 } from "@/lib/asset-fingerprint";
// @opc-feature: asset-deduplication [end]

export type UploadedFile = {
    url: string;
    storageKey: string;
    bytes: number;
    mimeType: string;
    width?: number;
    height?: number;
    durationMs?: number;
    hasAudio?: boolean;
    preview?: UploadedImage;
    // @opc-feature: asset-deduplication [start]
    fileHash?: string;
    // @opc-feature: asset-deduplication [end]
    /**
     * true 表示直传失败、文件当前只存在于本机 IndexedDB。语义与 UploadedImage 一致：
     * 云端数据同步会用同一幂等键重传，但在那之前 `url` 是页面级 objectURL，刷新即失效。
     */
    pendingRemoteUpload?: boolean;
    /** 直传失败原因，仅在 pendingRemoteUpload 为 true 时有值。 */
    remoteUploadError?: string;
};

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "media_files" });
const objectUrls = new Map<string, string>();

export async function uploadMediaFile(input: Blob, prefix = "file", onProgress?: (uploadedBytes: number, totalBytes: number) => void): Promise<UploadedFile> {
    const blob = input;
    // @opc-feature: asset-deduplication [start]
    // 基于内容 SHA-256 生成确定性存储键与幂等标识，重复上传直接命中已有远端资源
    const fileHash = await computeBlobSha256(blob);
    const storageKey = `${prefix}:${getActiveUserScope()}:${fileHash}`;
    // @opc-feature: asset-deduplication [end]
    const previewUrl = URL.createObjectURL(blob);
    let retainPreviewUrl = false;

    try {
        let captured: Awaited<ReturnType<typeof captureVideoPoster>> | undefined;
        if (blob.type.startsWith("video/")) {
            try {
                captured = await captureVideoPoster(previewUrl);
            } catch (error) {
                // 封面和轨道信息属于展示增强：失败不阻断原文件上传，但必须留下可诊断信号。
                console.warn("读取视频封面与媒体信息失败，继续上传原文件", { mimeType: blob.type, bytes: blob.size, error });
            }
        }

        // 浏览器轨道探测对部分 MP4/MOV 会误报；只有未确认存在音轨时才做二次解析，
        // 避免正常上传重复读取整个文件。
        let parsedHasAudio: boolean | undefined;
        if (blob.type.startsWith("video/") && captured?.hasAudio !== true) {
            try {
                parsedHasAudio = await detectVideoAudioTrackFromBlob(blob);
            } catch (error) {
                console.warn("解析视频音轨失败，继续上传但不写入音轨结论", { mimeType: blob.type, bytes: blob.size, error });
            }
        }
        const resolvedHasAudio = parsedHasAudio ?? (captured?.hasAudio === false ? undefined : captured?.hasAudio);

        let meta: { width?: number; height?: number; durationMs?: number; hasAudio?: boolean };
        if (captured) {
            meta = { width: captured.width, height: captured.height, durationMs: captured.durationMs, hasAudio: resolvedHasAudio };
        } else if (blob.type.startsWith("audio/")) {
            try {
                meta = await readAudioMeta(previewUrl);
            } catch (error) {
                console.warn("读取音频时长失败，继续上传原文件", { mimeType: blob.type, bytes: blob.size, error });
                meta = {};
            }
        } else {
            meta = { hasAudio: resolvedHasAudio };
        }

        let poster: UploadedImage | undefined;
        if (captured?.poster) {
            try {
                poster = await uploadImage(captured.poster);
            } catch (error) {
                // 预览图失败不应把已经可用的视频降级成本地文件；视频本体仍按强校验上传。
                console.warn("上传视频预览图失败，继续保存视频本体", { mimeType: blob.type, bytes: blob.size, error });
            }
        }

        let remoteUploadError = "";
        try {
            const kind = blob.type.startsWith("video/") ? "video" : blob.type.startsWith("audio/") ? "audio" : "file";
            const resource = await uploadResourceFile(blob, kind, { ...meta, fileName: input instanceof File ? input.name : undefined, idempotencyKey: storageKey }, onProgress);
            try {
                await primeResourceBlobCache(resourceStorageKey(resource.id), blob);
            } catch (error) {
                // 缓存只影响后续读取性能，服务端资源已经成功落盘，不得把缓存失败误报为上传失败。
                console.warn("预热媒体缓存失败，服务端资源已保存", { resourceId: resource.id, error });
            }
            return { url: resource.publicUrl || resourceFileUrl(resource.id), storageKey: resourceStorageKey(resource.id), bytes: resource.size || blob.size, mimeType: resource.mimeType || blob.type || "application/octet-stream", width: resource.width || meta.width, height: resource.height || meta.height, durationMs: resource.durationMs || meta.durationMs, hasAudio: meta.hasAudio, preview: poster, fileHash };
        } catch (error) {
            // 与图片上传同一套判定：永久性失败必须当场暴露，不能混进“稍后自动同步”。
            if (error instanceof ResourceUploadError && error.permanent) throw error;
            remoteUploadError = error instanceof Error ? error.message : "媒体直传失败";
        }

        // 瞬时失败退回本机：文件仍可用，且云端数据同步会用同一幂等键重传。
        await store.setItem(storageKey, blob);
        retainPreviewUrl = true;
        objectUrls.set(storageKey, previewUrl);
        return { url: previewUrl, storageKey, bytes: blob.size, mimeType: blob.type || "application/octet-stream", ...meta, preview: poster, fileHash, pendingRemoteUpload: true, remoteUploadError };
    } finally {
        // @opc-feature: preserve-local-preview [start]
        // 只有未预热本地缓存且明确无需保留的异常路径才释放，杜绝成功上传后立即销毁导致闪白与小水管二次请求
        if (!retainPreviewUrl && !resourceIdFromStorageKey(storageKey)) {
            URL.revokeObjectURL(previewUrl);
        }
        // @opc-feature: preserve-local-preview [end]
    }
}

export async function resolveMediaUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    // @opc-feature: zero-overhead-local-cache [start]
    // 商业化交付与极致流畅规范：桌面端内嵌优先以本地为主，
    // 只有本地故障或纯 Web 端时回退到浏览器持久缓存，彻底消除 OSS 临时签名失效导致的长期反复下载与额外流量扣费。
    const memoryHit = peekLocalFirstMedia(storageKey, fallback) || peekCachedResourceObjectUrl(storageKey);
    if (memoryHit) return memoryHit;

    if (storageKey.startsWith("file:") || storageKey.startsWith("media:")) {
        const cached = objectUrls.get(storageKey);
        if (cached) return cached;
        try {
            const resolved = await resolveLocalFirstMedia(storageKey, {
                fallbackUrl: fallback,
                mediaType: "video",
            });
            if (resolved?.url) return resolved.url;
        } catch {}
        const blob = await store.getItem<Blob>(storageKey);
        if (!blob) return fallback;
        const url = URL.createObjectURL(blob);
        objectUrls.set(storageKey, url);
        return url;
    }

    const resourceId = resourceIdFromStorageKey(storageKey);
    if (resourceId) {
        try {
            const resolved = await resolveLocalFirstMedia(storageKey, {
                fallbackUrl: fallback,
                mediaType: "video",
            });
            if (resolved && resolved.url) {
                return resolved.url;
            }
        } catch (err) {
            console.warn("[resolveMediaUrl] 本地优先解析失败，回退至远程地址:", err);
        }
        const cachedObjectUrl = await getCachedResourceObjectUrl(storageKey).catch(() => "");
        if (cachedObjectUrl) return cachedObjectUrl;
        // @opc-feature: zero-overhead-local-cache [end]
        // 展示直接命中 OSS/CDN；平台资源文件接口只保留给私有源站代理或本地存储兜底。
        try {
            return resolveResourceAccessURL((await getResourceAccess(storageKey, "display")).url);
        } catch {
            return resourceFileUrl(resourceId) || fallback;
        }
    }
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    const blob = await store.getItem<Blob>(storageKey);
    if (!blob) return fallback;
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function getMediaBlob(storageKey: string) {
    if (resourceIdFromStorageKey(storageKey)) return getCachedResourceBlob(storageKey);
    return store.getItem<Blob>(storageKey);
}

export async function setMediaBlob(storageKey: string, blob: Blob) {
    if (resourceIdFromStorageKey(storageKey)) return primeResourceBlobCache(storageKey, blob);
    await store.setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function deleteStoredMedia(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            if (resourceIdFromStorageKey(key)) return;
            const url = objectUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            objectUrls.delete(key);
            await store.removeItem(key);
        }),
    );
}

export async function cleanupUnusedMedia(usedData: unknown, scope = getActiveUserScope()) {
    const usedKeys = collectMediaStorageKeys(usedData);
    const currentScope = scope;
    const unused: string[] = [];
    await store.iterate((_value, key) => {
        const parts = key.split(":");
        if (parts.length >= 3 && parts[1] === currentScope && !usedKeys.has(key)) unused.push(key);
    });
    await Promise.all(unused.map((key) => store.removeItem(key)));
}

export function collectMediaStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && (value.storageKey.includes(":") || resourceIdFromStorageKey(value.storageKey))) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectMediaStorageKeys(child, keys)) : collectMediaStorageKeys(item, keys)));
    return keys;
}

function readAudioMeta(url: string) {
    return new Promise<{ durationMs?: number }>((resolve) => {
        const audio = document.createElement("audio");
        const done = () => resolve({ durationMs: Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : undefined });
        audio.onloadedmetadata = done;
        audio.onerror = done;
        audio.src = url;
    });
}
