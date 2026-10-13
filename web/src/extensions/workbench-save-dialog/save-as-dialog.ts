import { message } from "antd";
import {
    getResourceAccess,
    resolveResourceAccessURL,
    resolveResourceUrl,
    resourceIdFromStorageKey,
    type ResourceAccessVariant,
} from "@/services/api/resources";
import { peekLocalFirstMedia } from "@/services/local-first-media-resolver";

export type SaveMediaWithDialogOptions = {
    fileName: string;
    url?: string;
    dataUrl?: string;
    storageKey?: string;
    mediaType?: "image" | "video";
    blob?: Blob;
    variant?: ResourceAccessVariant;
};

/**
 * 调起系统“另存为 / 选择保存路径”对话框并完成媒体文件下载。
 * 1. 桌面端 (Electron): 调起原生 SaveFileDialog 窗口选择本地路径；
 * 2. 现代 Web 端 (Chrome/Edge 等): 调起浏览器原生 File System Access API (showSaveFilePicker)；
 * 3. 降级兜底: 转为 Blob 并通过 a[download] 下载至默认目录。
 */
export async function downloadMediaWithSaveDialog(options: SaveMediaWithDialogOptions): Promise<{
    success: boolean;
    canceled?: boolean;
    filePath?: string;
    error?: string;
}> {
    const { fileName, url, dataUrl, storageKey, mediaType, variant = "original" } = options;
    const isVideo = mediaType === "video" || /\.(mp4|webm|mov|mkv)$/i.test(fileName);

    let resolvedUrl = url?.trim() || "";
    const effectiveDataUrl = dataUrl?.trim() || "";
    let resolvedBlob = options.blob;

    // 1. 数据源多层解析与兜底恢复 (解决历史记录或接口只返回 storageKey 导致下载空文件的痛点)
    if (effectiveDataUrl) {
        if (effectiveDataUrl.startsWith("http:") || effectiveDataUrl.startsWith("https:") || effectiveDataUrl.startsWith("blob:")) {
            if (!resolvedUrl) resolvedUrl = effectiveDataUrl;
        }
    }

    if (!resolvedUrl && !resolvedBlob && !effectiveDataUrl.startsWith("data:") && storageKey) {
        const normalizedKey = storageKey.trim();
        const localHit = peekLocalFirstMedia(normalizedKey);
        if (localHit) {
            resolvedUrl = localHit;
        } else if (resourceIdFromStorageKey(normalizedKey)) {
            try {
                const access = await getResourceAccess(normalizedKey, "download", variant, fileName);
                if (access?.url) {
                    resolvedUrl = resolveResourceAccessURL(access.url);
                }
            } catch {
                resolvedUrl = resolveResourceUrl(normalizedKey) || normalizedKey;
            }
        } else {
            resolvedUrl = resolveResourceUrl(normalizedKey) || normalizedKey;
        }
    }

    const hasData = Boolean(resolvedBlob || effectiveDataUrl.startsWith("data:") || resolvedUrl);
    if (!hasData) {
        throw new Error("媒体文件不存在或已释放");
    }

    // 2. 桌面端原生桥接 (Electron SaveFileDialog: 优先调起操作系统的“另存为”原生对话框)
    const desktopBridge = typeof window !== "undefined"
        ? (window as unknown as { desktopBridge?: { isDesktop?: boolean; saveMediaAs?: (data: any) => Promise<any> } }).desktopBridge
        : undefined;

    if (desktopBridge?.isDesktop && desktopBridge.saveMediaAs) {
        try {
            const desktopPayload: any = {
                defaultName: fileName,
                mediaType: isVideo ? "video" : "image",
            };

            if (resolvedBlob) {
                desktopPayload.buffer = await resolvedBlob.arrayBuffer();
            } else if (effectiveDataUrl.startsWith("data:")) {
                desktopPayload.url = effectiveDataUrl;
            } else if (resolvedUrl) {
                if (resolvedUrl.startsWith("blob:")) {
                    try {
                        const blobRes = await fetch(resolvedUrl);
                        desktopPayload.buffer = await blobRes.arrayBuffer();
                    } catch {
                        desktopPayload.url = resolvedUrl;
                    }
                } else {
                    desktopPayload.url = resolvedUrl;
                }
            }

            const res = await desktopBridge.saveMediaAs(desktopPayload);
            if (res?.canceled) {
                return { success: false, canceled: true };
            }
            if (res?.success) {
                if (typeof document !== "undefined") {
                    message.success(res.filePath ? `已保存至：${res.filePath}` : "文件已成功保存");
                }
                return { success: true, filePath: res.filePath };
            }
            if (res?.error) {
                throw new Error(res.error);
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.warn("[desktopBridge] 另存为失败，降级浏览器保存:", errMsg);
        }
    }

    // 3. 现代浏览器 File System Access API (showSaveFilePicker: 调起操作系统“另存为 / 选择保存路径”窗口)
    if (!resolvedBlob) {
        try {
            if (effectiveDataUrl.startsWith("data:")) {
                const dataRes = await fetch(effectiveDataUrl);
                resolvedBlob = await dataRes.blob();
            } else if (resolvedUrl) {
                const urlRes = await fetch(resolvedUrl);
                if (urlRes.ok) {
                    resolvedBlob = await urlRes.blob();
                }
            }
        } catch (fetchErr) {
            console.warn("[downloadMediaWithSaveDialog] 提前获取 Blob 失败:", fetchErr);
        }
    }

    if (typeof window !== "undefined" && "showSaveFilePicker" in window && resolvedBlob) {
        try {
            const ext = fileName.split(".").pop()?.toLowerCase() || (isVideo ? "mp4" : "png");
            const mime = resolvedBlob.type || (isVideo ? "video/mp4" : "image/png");
            const pickerOptions: any = {
                suggestedName: fileName,
                types: [
                    {
                        description: isVideo ? "视频文件" : "图片文件",
                        accept: {
                            [mime]: [`.${ext}`],
                        },
                    },
                ],
            };
            const fileHandle = await (window as any).showSaveFilePicker(pickerOptions);
            const writable = await fileHandle.createWritable();
            await writable.write(resolvedBlob);
            await writable.close();
            if (typeof document !== "undefined") {
                message.success("文件已成功保存");
            }
            return { success: true };
        } catch (pickerErr: any) {
            if (pickerErr?.name === "AbortError") {
                return { success: false, canceled: true };
            }
            console.warn("[showSaveFilePicker] 弹出保存路径失败，降级常规下载:", pickerErr);
        }
    }

    // 4. 降级兜底: 普通浏览器下载
    const downloadHref = resolvedBlob
        ? URL.createObjectURL(resolvedBlob)
        : (effectiveDataUrl || resolvedUrl);

    if (!downloadHref) {
        throw new Error("无法生成下载链接");
    }

    if (typeof document !== "undefined") {
        const anchor = document.createElement("a");
        anchor.href = downloadHref;
        anchor.download = fileName;
        anchor.rel = "noopener noreferrer";
        anchor.style.display = "none";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();

        if (resolvedBlob) {
            setTimeout(() => URL.revokeObjectURL(downloadHref), 60000);
        }
        message.info("已下载至默认下载目录");
    }
    return { success: true };
}
