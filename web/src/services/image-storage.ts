import localforage from "localforage";

import { nanoid } from "nanoid";
import { readImageMeta } from "@/lib/image-utils";
import { getActiveUserScope, USER_SCOPE_CHANGED_EVENT } from "@/lib/user-scope";
import { getResourceAccess, importResourceFromUrl, isResourceUrl, resolveResourceAccessURL, resourceFileUrl, resourceIdFromStorageKey, resourceStorageKey, ResourceUploadError, uploadResourceFile } from "@/services/api/resources";
import { getCachedResourceBlob, getCachedResourceObjectUrl, peekCachedResourceObjectUrl, primeResourceBlobCache } from "@/services/resource-blob-cache";
import { evictLocalFirstMedia, peekLocalFirstMedia, resolveLocalFirstMedia } from "@/services/local-first-media-resolver";

// @opc-feature: asset-deduplication [start]
import { computeBlobSha256, computeTextSha256 } from "@/lib/asset-fingerprint";
// @opc-feature: asset-deduplication [end]
// @opc-feature: upstream-image-adaptation [start]
import { resolveModelRequestConfig, type AiConfig } from "@/stores/use-config-store";
import { isVolcengineArkImageProtocol } from "@/lib/model-protocols";
import { getResourceInputURL } from "@/services/api/resources";
// @opc-feature: upstream-image-adaptation [end]

export type UploadedImage = {
    url: string;
    storageKey: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
    // @opc-feature: asset-deduplication [start]
    fileHash?: string;
    // @opc-feature: asset-deduplication [end]
    /**
     * true 表示直传失败、文件当前只存在于本机 IndexedDB。
     * 云端数据同步会用同一幂等键重传，但在那之前它不是一份已持久化的服务端资源：
     * `url` 是页面级 objectURL，刷新即失效。UI 不得把这种结果说成"已保存"。
     */
    pendingRemoteUpload?: boolean;
    /** 直传失败原因，仅在 pendingRemoteUpload 为 true 时有值，供 UI 如实告知用户。 */
    remoteUploadError?: string;
};

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "image_files" });
const objectUrls = new Map<string, string>();

export async function uploadImage(input: string | Blob, onProgress?: (uploadedBytes: number, totalBytes: number) => void): Promise<UploadedImage> {
    if (typeof input === "string" && shouldImportRemoteImage(input)) {
        // @opc-feature: asset-deduplication [start]
        const remoteHash = await computeTextSha256(input);
        const storageKey = `image:${getActiveUserScope()}:${remoteHash}`;
        // @opc-feature: asset-deduplication [end]
        try {
            const resource = await importResourceFromUrl(input, "image", { idempotencyKey: storageKey });
            return {
                url: resource.publicUrl || resourceFileUrl(resource.id),
                storageKey: resourceStorageKey(resource.id),
                width: resource.width || 1024,
                height: resource.height || 1024,
                bytes: resource.size || 0,
                mimeType: resource.mimeType || "image/png",
                // @opc-feature: asset-deduplication [start]
                fileHash: remoteHash,
                // @opc-feature: asset-deduplication [end]
            };
        } catch {
            // Keep the browser-side path as a fallback for CORS-enabled HTTPS images.
        }
    }
    const blob = typeof input === "string" ? await (await fetch(input)).blob() : input;
    // @opc-feature: asset-deduplication [start]
    // 采用文件内容 SHA-256 哈希生成确定性 storageKey 与幂等键，相同文件直传后端时直接复用已有资源，杜绝冗余落盘。
    const fileHash = await computeBlobSha256(blob);
    const storageKey = `image:${getActiveUserScope()}:${fileHash}`;
    // @opc-feature: asset-deduplication [end]
    const previewUrl = URL.createObjectURL(blob);
    const meta = await readImageMeta(previewUrl);
    let remoteUploadError = "";
    try {
        const resource = await uploadResourceFile(blob, "image", { width: meta.width, height: meta.height, fileName: input instanceof File ? input.name : undefined, idempotencyKey: storageKey }, onProgress);
        // @opc-feature: preserve-local-preview [start]
        // 预热 L1 内存与 L2 本地持久缓存；杜绝上传成功后立即 revoke 导致画布卡片闪白转圈
        await primeResourceBlobCache(resourceStorageKey(resource.id), blob).catch(() => "");
        // @opc-feature: preserve-local-preview [end]
        return {
            url: resource.publicUrl || resourceFileUrl(resource.id),
            storageKey: resourceStorageKey(resource.id),
            width: resource.width || meta.width,
            height: resource.height || meta.height,
            bytes: resource.size || blob.size,
            mimeType: resource.mimeType || blob.type || meta.mimeType,
            // @opc-feature: asset-deduplication [start]
            fileHash,
            // @opc-feature: asset-deduplication [end]
        };
    } catch (error) {
        // 鉴权失效、越权、体积超限这类失败重传也是同样结果，不能退化成"稍后自动同步"。
        if (error instanceof ResourceUploadError && error.permanent) throw error;
        remoteUploadError = error instanceof Error ? error.message : "图片直传失败";
    }
    // 瞬时失败退回本机：文件仍可用，且云端数据同步会用同一幂等键重传。
    await store.setItem(storageKey, blob);
    const url = previewUrl;
    objectUrls.set(storageKey, url);
    return { url, storageKey, width: meta.width, height: meta.height, bytes: blob.size, mimeType: blob.type || meta.mimeType, fileHash, pendingRemoteUpload: true, remoteUploadError };
}

function shouldImportRemoteImage(input: string) {
    return /^https?:\/\//i.test(input) && !isResourceUrl(input);
}

export async function resolveImageUrl(storageKey?: string, fallback = "", options?: { cacheMiss?: boolean }) {
    if (!storageKey) return fallback;
    // @opc-feature: zero-overhead-local-cache [start]
    // 商业化交付与极致流畅规范：桌面端内嵌优先以本地为主，
    // 只有本地故障或纯 Web 端时回退到浏览器持久缓存，彻底消除 OSS 临时签名失效导致的长期反复下载与额外流量扣费。
    const memoryHit = peekLocalFirstMedia(storageKey, fallback) || peekCachedResourceObjectUrl(storageKey);
    if (memoryHit) return memoryHit;

    if (storageKey.startsWith("image:") || storageKey.startsWith("generation-image:")) {
        const cached = objectUrls.get(storageKey);
        if (cached) return cached;
        try {
            const resolved = await resolveLocalFirstMedia(storageKey, {
                fallbackUrl: fallback,
                mediaType: "image",
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
                mediaType: "image",
            });
            if (resolved && resolved.url) {
                return resolved.url;
            }
        } catch (err) {
            console.warn("[resolveImageUrl] 本地优先解析失败，回退至远程地址:", err);
        }
        const cachedObjectUrl = await getCachedResourceObjectUrl(storageKey).catch(() => "");
        if (cachedObjectUrl) return cachedObjectUrl;
        // @opc-feature: zero-overhead-local-cache [end]
        // 远程资源展示直接使用 OSS/CDN 授权地址，不把媒体内容读进浏览器 Blob。
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

export async function getImageBlob(storageKey: string) {
    if (resourceIdFromStorageKey(storageKey)) return getCachedResourceBlob(storageKey);
    return store.getItem<Blob>(storageKey);
}

export async function setImageBlob(storageKey: string, blob: Blob) {
    if (resourceIdFromStorageKey(storageKey)) return primeResourceBlobCache(storageKey, blob);
    await store.setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function imageToDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string; name?: string; type?: string; mimeType?: string }) {
    if (image.storageKey) {
        const blob = await getImageBlob(image.storageKey);
        if (blob) return blobToDataUrl(await normalizeImageBlob(blob, image.name || image.url, image.type || image.mimeType));
    }
    const url = image.dataUrl || (await resolveImageUrl(image.storageKey, image.url || ""));
    if (!url) return url;
    if (url.startsWith("data:image/")) return url;
    if (url.startsWith("data:")) return blobToDataUrl(await normalizeImageBlob(await (await fetch(url)).blob(), image.name, image.type || image.mimeType));
    let fetchUrl = url;
    if (typeof window !== "undefined" && url.startsWith("/")) {
        fetchUrl = `${window.location.origin}${url}`;
    }
    const blob = await (await fetch(fetchUrl, { credentials: isResourceUrl(url) ? "include" : "same-origin" })).blob();
    return blobToDataUrl(await normalizeImageBlob(blob, image.name || url, image.type || image.mimeType));
}

// @opc-feature: upstream-image-adaptation [start]
export type UpstreamImageRequirement = "auto" | "require-url" | "require-base64";

export interface UpstreamImageAdaptOptions {
    targetModel?: string;
    requirement?: UpstreamImageRequirement;
    label?: string;
}

export function isPublicMediaUrl(value?: string): boolean {
    return /^https?:\/\//i.test(String(value || "").trim());
}

/**
 * 智能嗅探上游渠道/模型对图片素材的协议要求：
 * - "require-url": 必须为公网可达 URL（例如插件声明 requiresPublicMediaUrls、第三方 Webhook 等）
 * - "require-base64": 必须为标准带 MIME 类型的 Base64 Data URL（例如原生 Gemini API、火山方舟等）
 * - "auto": 自适应模式（OpenAI 兼容协议 / NewAPI / Claude 等）：公网 URL 优先，本地/内网/未公开素材自动转换为合规 Base64 Data URL
 */
export function detectUpstreamImageRequirement(config?: AiConfig, targetModel?: string): UpstreamImageRequirement {
    if (!config) return "auto";
    const safeConfig = { ...config, channels: config.channels || [], models: config.models || [] };
    const selectedModel = targetModel || safeConfig.model || safeConfig.imageModel || safeConfig.textModel;
    const requestConfig = resolveModelRequestConfig(safeConfig, selectedModel);

    const explicitInterfaceType = (config as any)?.interfaceType;
    const effectiveInterfaceType = explicitInterfaceType || requestConfig.interfaceType || "";
    const explicitApiFormat = (config as any)?.apiFormat;
    const effectiveApiFormat = explicitApiFormat || requestConfig.apiFormat || "";

    // 1. 严格要求公网可达 URL 的协议或插件通道
    if (
        effectiveInterfaceType === "agnes-image" ||
        (requestConfig as any).requiresPublicMediaUrls ||
        (safeConfig as any).requiresPublicMediaUrls
    ) {
        return "require-url";
    }

    // 2. 严格要求内联 Base64 的原生协议
    // - Gemini 原生协议（apiFormat === "gemini" 或 interfaceType === "gemini-image"）：
    //   Gemini API inlineData 仅支持内联 base64 字节，不支持随意传入任意公网外部 url
    // - 火山方舟图片原生协议（volcengine-ark-image / volcengine-ark-agent-plan-image）：直接接受 base64
    if (
        effectiveApiFormat === "gemini" ||
        effectiveInterfaceType === "gemini-image" ||
        isVolcengineArkImageProtocol(effectiveInterfaceType)
    ) {
        return "require-base64";
    }

    // 3. 自适应协议（chat-completion、claude-api、grok-image 等）
    return "auto";
}

/**
 * 将任意形态的图片素材（本地 resource:id、/api/resources/... 相对路径、blob:、公网 URL、DataURL）
 * 根据上游通道的协议要求，自动适配为标准 Base64 Data URL 或标准公网 URL。
 * 与视频工作台 resolveMiniMaxImageUrl / resolveSeedanceVideosImageUrl / resolveVideoGenerationsUrl 机制完全对齐。
 */
export async function resolveUpstreamImageReference(
    image: { url?: string; dataUrl?: string; storageKey?: string; name?: string; type?: string; mimeType?: string },
    config?: AiConfig,
    options?: UpstreamImageAdaptOptions
): Promise<string> {
    const requirement = options?.requirement || (config ? detectUpstreamImageRequirement(config, options?.targetModel) : "auto");
    const directUrl = (image.url || image.dataUrl || "").trim();
    const label = options?.label || "参考图";

    if (requirement === "require-url") {
        if (image.storageKey?.startsWith("resource:")) {
            try {
                const publicUrl = await getResourceInputURL(image.storageKey);
                if (isPublicMediaUrl(publicUrl)) return publicUrl;
            } catch (err) {
                console.warn("[resolveUpstreamImageReference] 读取公网对象存储地址失败:", err);
            }
        }
        if (isPublicMediaUrl(directUrl)) {
            return directUrl;
        }
        throw new Error(`${label}需要公网可达的 URL 地址；请先将素材保存至对象存储或提供公网直链`);
    }

    if (requirement === "require-base64") {
        if (directUrl.startsWith("data:image/")) {
            return directUrl;
        }
        const dataUrl = await imageToDataUrl(image);
        if (!dataUrl) throw new Error(`${label}读取失败，无法转换为标准 Base64 数据`);
        return dataUrl;
    }

    // "auto" 自适应模式：
    // 1. 若已经是公网可达 URL，直接复用公网 URL（0 额外开销，0 流量冗余）
    if (isPublicMediaUrl(directUrl)) {
        return directUrl;
    }

    // 2. 若已经是标准 image DataURL，直接复用
    if (directUrl.startsWith("data:image/")) {
        return directUrl;
    }

    // 3. 包含本地相对路径（如 /api/resources/...）、blob: 临时地址、storageKey 等：
    // 外部上游渠道无法直接拉取本地内网资源，必须自动转换为标准 Base64 DataURL（附带通过 magic bytes 或文件名校验的合法 MIME 类型）
    const dataUrl = await imageToDataUrl(image);
    if (!dataUrl) throw new Error(`${label}读取失败，请检查素材是否有效或重新上传`);
    return dataUrl;
}
// @opc-feature: upstream-image-adaptation [end]

export async function deleteStoredImages(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            const url = objectUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            objectUrls.delete(key);
            evictLocalFirstMedia(key, url);
            if (resourceIdFromStorageKey(key)) return;
            await store.removeItem(key);
        }),
    );
}

export async function cleanupUnusedImages(usedData: unknown, scope = getActiveUserScope()) {
    const usedKeys = collectImageStorageKeys(usedData);
    const currentPrefixes = [`image:${scope}:`, `generation-image:${scope}:`];
    const unused: string[] = [];
    await store.iterate((_value, key) => {
        if (currentPrefixes.some((prefix) => key.startsWith(prefix)) && !usedKeys.has(key)) unused.push(key);
    });
    await deleteStoredImages(unused);
}

export function collectImageStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && (value.storageKey.startsWith("image:") || value.storageKey.startsWith("generation-image:") || resourceIdFromStorageKey(value.storageKey))) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectImageStorageKeys(child, keys)) : collectImageStorageKeys(item, keys)));
    return keys;
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(blob);
    });
}

async function normalizeImageBlob(blob: Blob, sourceName = "", declaredType = "") {
    if (blob.type.startsWith("image/")) {
        // 部分非标准环境可能生成 image/jpg，规范化为标准 RFC image/jpeg
        if (blob.type === "image/jpg") return blob.slice(0, blob.size, "image/jpeg");
        return blob;
    }
    const bytes = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
    let mimeType = detectImageMimeType(bytes) || (declaredType.startsWith("image/") ? declaredType : "") || imageMimeTypeFromName(sourceName);
    if (mimeType === "image/jpg") mimeType = "image/jpeg";
    if (!mimeType) throw new Error("无法识别参考图片格式，请重新上传 PNG、JPEG、WebP 或 GIF 图片");
    return blob.slice(0, blob.size, mimeType);
}

function detectImageMimeType(bytes: Uint8Array) {
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 6)).startsWith("GIF8")) return "image/gif";
    if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
    if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
    return "";
}

function imageMimeTypeFromName(value: string) {
    const path = value.toLowerCase().split(/[?#]/)[0];
    if (path.endsWith(".png")) return "image/png";
    if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
    if (path.endsWith(".webp")) return "image/webp";
    if (path.endsWith(".gif")) return "image/gif";
    if (path.endsWith(".bmp")) return "image/bmp";
    return "";
}

// 监听账户变更事件（Session Epoch 切换时自动释放旧账号的所有内存图片 Object URL 句柄）
if (typeof window !== "undefined") {
    window.addEventListener(USER_SCOPE_CHANGED_EVENT, () => {
        objectUrls.forEach((url) => {
            try { URL.revokeObjectURL(url); } catch {}
        });
        objectUrls.clear();
    });
}
