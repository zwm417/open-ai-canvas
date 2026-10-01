import { extractHttpUrl } from "@/lib/video-reverse-url";

const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_VIDEO_BYTES = 512 * 1024 * 1024;
const VIDEO_DOWNLOAD_SERVICE_URL = "http://127.0.0.1:17372";
const VIDEO_EXTENSION = /\.(?:mp4|mov|webm|m4v|avi|mkv)(?:[?#].*)?$/i;
const DOUYIN_HOST = /(?:^|\.)douyin\.com$|(?:^|\.)iesdouyin\.com$/i;

export type DownloadedReferenceVideo = { blob: Blob; filename: string; source: "browser-direct" | "video-service" };

export async function downloadReferenceVideo(input: string, signal?: AbortSignal): Promise<DownloadedReferenceVideo> {
    throwIfAborted(signal);
    const url = parseVideoUrl(input);
    if (isPlatformShareUrl(url)) {
        try {
            return await downloadViaVideoService(url, signal);
        } catch (error) {
            throw new Error("本地视频下载服务不可用或无法解析该分享链接；请启动视频下载服务，或使用“上传视频”导入本地文件。" + errorMessageSuffix(error));
        }
    }
    let browserError: Error | null = null;
    try {
        return await downloadDirectUrl(url, signal);
    } catch (error) {
        if (signal?.aborted) throw error;
        browserError = error instanceof Error ? error : new Error(String(error));
    }
    try {
        return await downloadViaVideoService(url, signal);
    } catch (error) {
        if (signal?.aborted) throw error;
        throw new Error("浏览器直链读取失败：" + browserError.message + "；本地视频下载服务失败：" + (error instanceof Error ? error.message : String(error)));
    }
}

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

function errorMessageSuffix(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || "");
    return message ? `（${message}）` : "";
}

async function downloadDirectUrl(url: string, parentSignal?: AbortSignal): Promise<DownloadedReferenceVideo> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    parentSignal?.addEventListener("abort", abort, { once: true });
    const timer = window.setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
        const response = await fetch(url, { redirect: "follow", headers: { Accept: "video/*,text/html;q=0.9,*/*;q=0.8" }, signal: controller.signal });
        if (!response.ok) throw new Error("读取视频链接失败（HTTP " + response.status + "）");
        const contentLength = Number(response.headers.get("content-length") || 0);
        if (contentLength > MAX_VIDEO_BYTES) throw new Error("视频文件超过 512 MB 上限");
        const blob = await readResponseBlobWithLimit(response, controller.signal);
        if (!blob.size) throw new Error("视频链接返回空文件");
        const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim() || blob.type;
        if (!isVideoBlob(blob, contentType, response.url || url)) throw new Error("链接返回的不是视频文件");
        if (blob.size > MAX_VIDEO_BYTES) throw new Error("视频文件超过 512 MB 上限");
        return { blob: normalizeVideoBlob(blob, contentType, response.url || url), filename: filenameFromHeaders(response, response.url || url), source: "browser-direct" };
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw new Error("读取视频链接超时");
        throw error;
    } finally {
        window.clearTimeout(timer);
        parentSignal?.removeEventListener("abort", abort);
    }
}

async function downloadViaVideoService(url: string, parentSignal?: AbortSignal): Promise<DownloadedReferenceVideo> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    parentSignal?.addEventListener("abort", abort, { once: true });
    const timer = window.setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS + 5_000);
    try {
        const response = await fetch(VIDEO_DOWNLOAD_SERVICE_URL + "/video/download", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ url }),
            signal: controller.signal,
        });
        if (!response.ok) {
            const payload = (await response.json().catch(() => ({}))) as { error?: string; msg?: string };
            throw new Error(payload.error || payload.msg || "视频下载服务返回失败（HTTP " + response.status + "）");
        }
        const contentLength = Number(response.headers.get("content-length") || 0);
        if (contentLength > MAX_VIDEO_BYTES) throw new Error("视频文件超过 512 MB 上限");
        const blob = await readResponseBlobWithLimit(response, controller.signal);
        if (!blob.size) throw new Error("视频下载服务返回空文件");
        const filename = filenameFromHeaders(response, url);
        return { blob: normalizeVideoBlob(blob, response.headers.get("content-type") || blob.type, url), filename, source: "video-service" };
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw new Error("本地视频下载服务超时");
        throw error;
    } finally {
        window.clearTimeout(timer);
        parentSignal?.removeEventListener("abort", abort);
    }
}

async function readResponseBlobWithLimit(response: Response, signal?: AbortSignal) {
    if (!response.body) throw new Error("视频响应没有可读取的数据流");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
        for (;;) {
            if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            bytes += value.byteLength;
            if (bytes > MAX_VIDEO_BYTES) {
                await reader.cancel();
                throw new Error("视频文件超过 512 MB 上限");
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }
    return new Blob(chunks.map((chunk) => new Uint8Array(chunk)));
}

function parseVideoUrl(value: string) {
    return extractHttpUrl(value).toString();
}

function isPlatformShareUrl(value: string) {
    try {
        return DOUYIN_HOST.test(new URL(value).hostname);
    } catch {
        return false;
    }
}

function isVideoBlob(blob: Blob, contentType: string, url: string) {
    return contentType.toLowerCase().startsWith("video/") || blob.type.toLowerCase().startsWith("video/") || VIDEO_EXTENSION.test(url);
}

function normalizeVideoBlob(blob: Blob, contentType: string, url: string) {
    if (blob.type.toLowerCase().startsWith("video/")) return blob;
    const type = contentType.toLowerCase().startsWith("video/") ? contentType : url.toLowerCase().endsWith(".webm") ? "video/webm" : url.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4";
    return blob.slice(0, blob.size, type);
}

function filenameFromHeaders(response: Response, fallbackUrl: string) {
    const disposition = response.headers.get("content-disposition") || "";
    const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const plain = disposition.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1];
    let value = plain || "";
    if (utf8) {
        try {
            value = decodeURIComponent(utf8);
        } catch {
            value = utf8;
        }
    }
    if (!value) {
        try {
            value = new URL(fallbackUrl).pathname.split("/").pop() || "reference-video.mp4";
        } catch {
            value = "reference-video.mp4";
        }
    }
    const safe = value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim();
    return /\.[a-z0-9]{2,5}$/i.test(safe) ? safe.slice(0, 160) : safe.slice(0, 150) + ".mp4";
}
