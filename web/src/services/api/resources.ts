import { getActiveUserScope } from "@/lib/user-scope";
import { http, apiBaseURL, ApiError } from "@/services/api/request";
import type { OSSConnectionTestInput, OSSConnectionTestResult, OSSProvider, S3Preset } from "@/lib/oss-settings";
import { useSyncProgressStore } from "@/stores/use-sync-progress-store";

export type RemoteResource = {
    id: string;
    userId: string;
    kind: "image" | "video" | "audio" | "file" | string;
    status: "pending" | "ready" | "failed" | "deleted" | string;
    provider: string;
    endpoint: string;
    bucket: string;
    objectKey: string;
    publicUrl: string;
    mimeType: string;
    size: number;
    width?: number;
    height?: number;
    durationMs?: number;
    etag?: string;
    playbackStatus?: string;
    playbackObjectKey?: string;
    playbackError?: string;
    error?: string;
    createdAt: string;
    updatedAt: string;
};

export type UserOSSSetting = {
    enabled: boolean;
    provider: OSSProvider;
    s3Preset: S3Preset;
    region: string;
    endpoint: string;
    cdnBaseUrl: string;
    cdnAuthMode: "" | "public" | "qiniu" | string;
    requireCDN: boolean;
    allowPrivateProxy: boolean;
    bucket: string;
    accessKeyId: string;
    hasAccessKeySecret: boolean;
    sessionToken?: string;
    hasSessionToken: boolean;
    pathStyle: boolean;
    allowUserS3: boolean;
    publicBaseUrl: string;
    pathPrefix: string;
    testedAt?: string;
    testedDigest?: string;
    historyCount?: number;
    referencedResourceCount?: number;
    updatedAt?: string;
};

export type UserOSSSettingInput = Pick<UserOSSSetting, "enabled" | "provider" | "s3Preset" | "region" | "endpoint" | "cdnBaseUrl" | "bucket" | "accessKeyId" | "pathPrefix" | "pathStyle"> & {
    accessKeySecret?: string;
    sessionToken?: string;
    cdnAuthMode?: "" | "public" | "qiniu" | string;
    requireCDN?: boolean;
    allowPrivateProxy?: boolean;
};

export type AccountFileStorageUsage = {
    usedBytes: number;
    totalBytes: number;
};

export type ArkPrivateAssetSync = {
    resourceId: string;
    status: "active" | string;
};

export type ResourceUploadMeta = {
    width?: number;
    height?: number;
    durationMs?: number;
    fileName?: string;
    idempotencyKey?: string;
};

/**
 * 资源直传失败。
 *
 * `permanent` 是这条边界上唯一重要的信息：媒体直传失败后，调用方默认会把文件留在本机
 * IndexedDB，并由云端数据同步用同一幂等键重传（见 user-data-sync 的 uploadLocalStorageKey）。
 * 但鉴权失效、越权、请求本身不合法这几类失败重传多少次都是同样结果，把它们也归入
 * "稍后自动同步" 等于向用户撒谎，必须当场抛出。
 */
export class ResourceUploadError extends Error {
    readonly status?: number;
    /** true 表示重试不会自愈，调用方不得降级为本地暂存。 */
    readonly permanent: boolean;

    constructor(message: string, options: { status?: number; permanent: boolean; cause?: unknown }) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = "ResourceUploadError";
        this.status = options.status;
        this.permanent = options.permanent;
    }
}

const resourceCache = new Map<string, RemoteResource>();
const resourceRequests = new Map<string, Promise<RemoteResource>>();
const missingResourceIds = new Set<string>();
export type ResourceAccessPurpose = "display" | "copy" | "download" | "browser-process" | "provider-input";
export type ResourceAccessVariant = "original" | "playback";
export type ResourceAccess = {
    resourceId: string;
    requestedVariant: ResourceAccessVariant;
    actualVariant: ResourceAccessVariant;
    url: string;
    delivery: "cdn" | "origin" | "platform-local" | "platform-proxy";
    issuedAt: string;
    expiresAt?: string;
    refreshAt: string;
    revision: string;
    fallbackReason?: string;
};

const accessCache = new Map<string, { value: ResourceAccess; expiresAt: number }>();
const accessRequests = new Map<string, Promise<ResourceAccess>>();
let accessGeneration = 0;

/**
 * Drop every in-memory access descriptor when the authenticated scope changes.
 * Signed URLs are credentials, so an old request must not be allowed to publish
 * its result into the next account's cache after a logout/login race.
 */
export function clearResourceAccessCache() {
    accessGeneration += 1;
    accessCache.clear();
    accessRequests.clear();
    resourceCache.clear();
    resourceRequests.clear();
    missingResourceIds.clear();
}

export function resourceStorageKey(id: string) {
    return `resource:${id}`;
}

export function getUserOSSSetting() {
    return http.get<{ setting: UserOSSSetting }>("/settings/oss");
}

export function updateUserOSSSetting(input: UserOSSSettingInput) {
    return http.patch<{ setting: UserOSSSetting }>("/settings/oss", input);
}

export function testUserOSSConnection(input: OSSConnectionTestInput) {
    return http.post<OSSConnectionTestResult>("/settings/oss/test", input);
}

export async function getAccountFileStorageUsage() {
    const data = await http.get<{ usage: AccountFileStorageUsage }>("/resources/storage-usage");
    return data.usage;
}

export async function syncResourceToArkPrivateAsset(id: string) {
    const data = await http.post<{ sync: ArkPrivateAssetSync }>(`/resources/${encodeURIComponent(id)}/ark-private-asset`);
    return data.sync;
}

export function resourceIdFromStorageKey(storageKey?: string) {
    return storageKey?.startsWith("resource:") ? storageKey.slice("resource:".length) : "";
}

export function isResourceUrl(url?: string) {
    const base = String(apiBaseURL).replace(/\/+$/, "");
    const path = url?.split(/[?#]/, 1)[0] || "";
    return path.startsWith(`${base}/resources/`) && path.endsWith("/file");
}

// @opc-feature: preserve-local-preview [start]
// 与后端单文件上传策略对齐：48MB 以内的本地媒体走标准单个 multipart 流式上传（自带精准进度且零分片合并损耗）；
// 超过 48MB 的大文件才自动分流至分片断点上传通道（每片 8MB）
const CHUNK_UPLOAD_THRESHOLD = 48 << 20;
const CHUNK_UPLOAD_RETRIES = 2;

export async function preCheckResource(idempotencyKey: string) {
    return http.post<{ exists: boolean; resource?: RemoteResource }>("/resources/pre-check", { idempotencyKey });
}

export async function uploadResourceFile(file: Blob, kind: "image" | "video" | "audio" | "file", meta?: ResourceUploadMeta, onProgress?: (uploadedBytes: number, totalBytes: number) => void): Promise<RemoteResource> {
    const name = meta?.fileName || (file instanceof File ? file.name : `${kind}.${extensionFromMime(file.type, kind)}`);
    const releaseLock = typeof window !== "undefined" ? useSyncProgressStore.getState().registerActiveUpload?.() : undefined;
    // 分片与 multipart 两条路径的失败都要归一成 ResourceUploadError，
    // 否则调用方只能靠文案猜测该重试还是该报错。
    try {
        // 秒传探针：若提供了幂等标识，先发极轻量请求探查云端/服务是否已就绪同素材，实现 50ms 零流量秒传
        if (meta?.idempotencyKey) {
            try {
                const check = await preCheckResource(meta.idempotencyKey);
                if (check.exists && check.resource) {
                    resourceCache.set(resourceCacheKey(check.resource.id), check.resource);
                    onProgress?.(file.size, file.size);
                    return check.resource;
                }
            } catch (err) {
                console.warn("预检秒传探针跳过，继续执行物理上传", err);
            }
        }
        if (file.size > CHUNK_UPLOAD_THRESHOLD) {
            const resource = await uploadFileInChunks(file, name, kind, meta, onProgress);
            resourceCache.set(resourceCacheKey(resource.id), resource);
            return resource;
        }
        const formData = new FormData();
        formData.append("kind", kind);
        formData.append("file", file, name);
        if (meta?.width) formData.append("width", String(Math.round(meta.width)));
        if (meta?.height) formData.append("height", String(Math.round(meta.height)));
        if (meta?.durationMs) formData.append("durationMs", String(Math.round(meta.durationMs)));
        const data = await http.post<{ resource: RemoteResource }>("/resources", formData, {
            ...uploadRequestConfig(meta?.idempotencyKey),
            timeout: 180000,
            onUploadProgress: onProgress
                ? ({ loaded, total }) => {
                      if (total && total > 0) onProgress(Math.min(file.size, (file.size * loaded) / total), file.size);
                  }
                : undefined,
        });
        resourceCache.set(resourceCacheKey(data.resource.id), data.resource);
        return data.resource;
    } catch (error) {
        throw normalizeUploadError(error);
    } finally {
        releaseLock?.();
    }
}

// 分片上传：POST 开始会话 → 逐片 PUT 原始二进制（每片 8MB）→ POST 合并落库。
// 单请求体积小、可断点续传/失败重试；单文件不再受 50MB 限制（仅日/总量配额约束）。
async function uploadFileInChunks(file: Blob, name: string, kind: "image" | "video" | "audio" | "file", meta: ResourceUploadMeta | undefined, onProgress?: (uploadedBytes: number, totalBytes: number) => void) {
    // 片级失败通常意味着会话过期/网络抖动：整体重开一次会话重传（整传重试）。
    for (let attempt = 0; attempt < CHUNK_UPLOAD_RETRIES; attempt++) {
        try {
            return await runChunkedUpload(file, name, kind, meta, onProgress);
        } catch (error) {
            if (attempt === CHUNK_UPLOAD_RETRIES - 1) throw error;
        }
    }
    throw new Error("上传失败");
}

async function runChunkedUpload(file: Blob, name: string, kind: "image" | "video" | "audio" | "file", meta: ResourceUploadMeta | undefined, onProgress?: (uploadedBytes: number, totalBytes: number) => void) {
    const session = await http.post<{ uploadId: string; chunkSize: number; chunkCount: number; exists?: boolean; resource?: RemoteResource }>(
        "/resources/uploads",
        { fileName: name, kind, size: file.size, width: meta?.width, height: meta?.height, durationMs: meta?.durationMs, idempotencyKey: meta?.idempotencyKey },
        { ...uploadRequestConfig(meta?.idempotencyKey), timeout: 60000 },
    );
    if (session.exists && session.resource) {
        onProgress?.(file.size, file.size);
        return session.resource;
    }
    for (let index = 0; index < session.chunkCount; index++) {
        const start = index * session.chunkSize;
        const end = Math.min(file.size, start + session.chunkSize);
        const blob = file.slice(start, end);
        let chunkSuccess = false;
        let lastError: unknown;
        for (let chunkAttempt = 0; chunkAttempt < 3; chunkAttempt++) {
            try {
                await http.put<{ index: number }>(`/resources/uploads/${encodeURIComponent(session.uploadId)}/chunks/${index}`, blob, {
                    headers: { "Content-Type": "application/octet-stream" },
                    timeout: 120000,
                    onUploadProgress: onProgress ? ({ loaded }) => onProgress(start + Math.min(loaded, blob.size), file.size) : undefined,
                });
                chunkSuccess = true;
                break;
            } catch (err) {
                lastError = err;
                if (chunkAttempt < 2) {
                    await new Promise((resolve) => setTimeout(resolve, 1000 * (chunkAttempt + 1)));
                }
            }
        }
        if (!chunkSuccess) throw lastError;
        onProgress?.(Math.min(end, file.size), file.size);
    }
    const complete = await http.post<{ resource: RemoteResource }>(`/resources/uploads/${encodeURIComponent(session.uploadId)}/complete`, undefined, { timeout: 120000 });
    return complete.resource;
}
// @opc-feature: preserve-local-preview [end]

// 失败分类直接复用 request() 已经算好的 ApiError.retryable（408/425/429/5xx 可重试），
// 不在这里另起一套响应码判断，避免两处规则漂移。
// 差别只有一处：没有拿到任何 HTTP 响应（断网、超时）时 retryable 为 false，
// 但这种失败恰恰是最该退回本机等待重传的，因此单独按瞬时处理。
function normalizeUploadError(error: unknown): ResourceUploadError {
    if (error instanceof ResourceUploadError) return error;
    // 请求取消不是上传失败，保持原始语义交给调用方。
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof ApiError) {
        const status = error.status;
        const permanent = status !== undefined && !error.retryable;
        // 即使误超 50MB multipart 上限（后端 http.MaxBytesError），也给出可读中文而非英文裸错。
        if (status === 400 && /body too large|MaxBytes/i.test(error.message)) {
            return new ResourceUploadError("文件过大，请使用小于 50MB 的文件或稍后重试", { status, permanent: true, cause: error });
        }
        if (status === 413) return new ResourceUploadError("文件过大，无法上传", { status, permanent: true, cause: error });
        return new ResourceUploadError(error.message || "上传失败", { status, permanent, cause: error });
    }
    return new ResourceUploadError(error instanceof Error ? error.message : "上传失败", { permanent: false, cause: error });
}

export async function importResourceFromUrl(url: string, kind: "image" | "video" | "audio" | "file", meta?: Omit<ResourceUploadMeta, "fileName">) {
    const data = await http.post<{ resource: RemoteResource }>("/resources/import", { url, kind, width: meta?.width, height: meta?.height, durationMs: meta?.durationMs }, uploadRequestConfig(meta?.idempotencyKey));
    resourceCache.set(resourceCacheKey(data.resource.id), data.resource);
    return data.resource;
}

function uploadRequestConfig(idempotencyKey?: string) {
    const value = idempotencyKey?.trim();
    return value ? { headers: { "X-Idempotency-Key": value } } : undefined;
}

export function getResource(id: string): Promise<RemoteResource> {
    const generation = accessGeneration;
    const scope = getActiveUserScope();
    const cacheKey = resourceCacheKey(id);
    const cached = resourceCache.get(cacheKey);
    if (cached) return Promise.resolve(cached);
    if (missingResourceIds.has(cacheKey)) return Promise.reject(new Error("资源不存在或已被删除"));
    const pending = resourceRequests.get(cacheKey);
    if (pending) return pending;
    const task = http
        .get<{ resource: RemoteResource }>(`/resources/${encodeURIComponent(id)}`)
        .then((data) => {
            assertResourceRequestCurrent(generation, scope);
            resourceCache.set(cacheKey, data.resource);
            return data.resource;
        })
        .catch((error) => {
            assertResourceRequestCurrent(generation, scope);
            if (error instanceof ApiError && error.status === 404) missingResourceIds.add(cacheKey);
            throw error;
        })
        .finally(() => {
            if (resourceRequests.get(cacheKey) === task) resourceRequests.delete(cacheKey);
        });
    resourceRequests.set(cacheKey, task);
    return task;
}

// refreshResource 绕过缓存强制拉取资源最新状态（转码副本就绪轮询用），并回写缓存。
export function refreshResource(id: string): Promise<RemoteResource> {
    const generation = accessGeneration;
    const scope = getActiveUserScope();
    const cacheKey = resourceCacheKey(id);
    return http.get<{ resource: RemoteResource }>(`/resources/${encodeURIComponent(id)}`).then((data) => {
        assertResourceRequestCurrent(generation, scope);
        resourceCache.set(cacheKey, data.resource);
        missingResourceIds.delete(cacheKey);
        return data.resource;
    });
}

function assertResourceRequestCurrent(generation: number, scope: string) {
    if (generation !== accessGeneration || scope !== getActiveUserScope()) {
        throw new DOMException("资源请求已因账号切换失效", "AbortError");
    }
}

export async function getResourceAccess(storageKey: string | undefined, purpose: ResourceAccessPurpose = "display", variant: ResourceAccessVariant = "original", downloadName = "") {
    const id = resourceIdFromStorageKey(storageKey);
    if (!id) throw new Error("当前媒体尚未上传到后端资源存储");
    const scope = getActiveUserScope();
    const generation = accessGeneration;
    const key = `${scope}:${id}:${purpose}:${variant}:${downloadName}`;
    const cached = accessCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const pending = accessRequests.get(key);
    if (pending) return pending;
    let request!: Promise<ResourceAccess>;
    request = (async () => {
        try {
            const data = await http.post<{ items: Array<{ resourceId: string; access?: ResourceAccess; error?: { msg?: string } }> }>("/resources/access", [{ resourceId: id, purpose, variant, ...(downloadName ? { downloadName } : {}) }]);
            if (generation !== accessGeneration || scope !== getActiveUserScope()) {
                throw new DOMException("资源访问请求已因账号切换失效", "AbortError");
            }
            const item = data.items?.[0];
            if (!item?.access?.url) throw new Error(item?.error?.msg || "后端未返回资源访问地址");
            const value = item.access;
            const ttl = value.expiresAt ? Math.max(10_000, new Date(value.expiresAt).getTime() - Date.now() - 15_000) : 5 * 60_000;
            accessCache.set(key, { value, expiresAt: Date.now() + ttl });
            return value;
        } catch (error) {
            if (error instanceof ApiError) throw new Error(error.message || "获取对象存储地址失败");
            throw error;
        } finally {
            if (accessRequests.get(key) === request) accessRequests.delete(key);
        }
    })();
    accessRequests.set(key, request);
    return request;
}

/** 模型上游读取资源使用更长 TTL，但仍走统一资源访问合同。 */
export async function getResourceInputURL(storageKey?: string) {
    return (await getResourceAccess(storageKey, "provider-input")).url;
}

/**
 * Resolve a platform delivery URL against the configured API origin.
 *
 * Cloud deliveries are already absolute CDN/origin URLs. Local/proxy
 * deliveries are intentionally returned by the backend as controlled API
 * paths; when the frontend talks to a separate backend origin, resolving the
 * path here prevents a Blob read from accidentally targeting the web origin.
 */
export function resolveResourceAccessURL(url: string) {
    if (!url || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)) return url;
    const base = String(apiBaseURL).trim();
    if (!/^https?:\/\//i.test(base)) return url;
    return new URL(url, `${base.replace(/\/+$/, "")}/`).toString();
}

function resourceCacheKey(id: string) {
    return `${getActiveUserScope()}:${id}`;
}

export function resourceFileUrl(id: string) {
    const base = String(apiBaseURL).replace(/\/+$/, "");
    return `${base}/resources/${encodeURIComponent(id)}/file`;
}

export function resolveResourceUrl(storageKey?: string, fallback = "") {
    const id = resourceIdFromStorageKey(storageKey);
    // 资源引用本身已经包含稳定 ID；恢复/展示阶段不需要再查一遍元数据。
    // 需要 publicUrl、mime 或尺寸时必须显式调用 getResource，避免隐式 N+1。
    return id ? resourceFileUrl(id) : fallback;
}

// playbackVariantUrl 返回浏览器兼容播放副本 URL（H.265→H.264 转码结果）。
// 副本就绪前由后端回退原件，调用方再按需降级。
export function playbackVariantUrl(id: string) {
    const base = String(apiBaseURL).replace(/\/+$/, "");
    return `${base}/resources/${encodeURIComponent(id)}/file?variant=playback`;
}

export async function getResourceBlob(storageKey: string) {
    const id = resourceIdFromStorageKey(storageKey);
    if (!id) return null;
    const access = await getResourceAccess(storageKey, "browser-process");
    // CDN/origin URLs carry their own authorization and must not receive the
    // application session cookie. Local/proxy delivery is intentionally
    // session-bound, so a Blob read must include it even when the URL is
    // relative to the platform origin.
    const credentials = access.delivery === "platform-local" || access.delivery === "platform-proxy" ? "include" : "omit";
    const response = await fetch(resolveResourceAccessURL(access.url), { credentials, mode: "cors" });
    if (!response.ok) throw new Error(`资源读取失败（${response.status}）`);
    return response.blob();
}

function extensionFromMime(mimeType: string, kind: string) {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("mpeg")) return "mp3";
    if (mimeType.includes("wav")) return "wav";
    return kind === "image" ? "png" : "bin";
}
