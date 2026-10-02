import { useEffect, useRef, useState, type ImgHTMLAttributes, type ReactNode } from "react";

import { getResourceAccess, resolveResourceAccessURL, resourceFileUrl, resourceIdFromStorageKey, type ResourceAccessVariant } from "@/services/api/resources";
import { resolveImageUrl } from "@/services/image-storage";
import { getCachedResourceObjectUrl, peekCachedResourceObjectUrl } from "@/services/resource-blob-cache";
import { peekLocalFirstMedia, resolveLocalFirstMedia } from "@/services/local-first-media-resolver";

type CachedResourceImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
    storageKey?: string;
    src?: string;
    fallback?: ReactNode;
    loadingFallback?: ReactNode;
    eager?: boolean;
    variant?: ResourceAccessVariant;
};

/**
 * 远程资源图片统一使用 OSS/CDN 授权地址。
 * Blob 缓存仍可用于导出、抽帧等字节处理，但不作为媒体展示 src，避免把
 * `blob:http(s)://...` 泄露到节点、素材库和浏览器媒体链路中。
 */
export function CachedResourceImage({ storageKey, src = "", fallback = null, loadingFallback = fallback, eager = false, variant = "original", onError, ...props }: CachedResourceImageProps) {
    const resourceId = resourceIdFromStorageKey(storageKey);
    const remoteResource = Boolean(resourceId);
    const localImageResource = Boolean(storageKey && (storageKey.startsWith("image:") || storageKey.startsWith("generation-image:")));
    const targetRef = useRef<HTMLSpanElement>(null);
    const [nearViewport, setNearViewport] = useState(eager || (!remoteResource && !localImageResource));
    const [cachedSrc, setCachedSrc] = useState(() => {
        // 1. 若已有本地 blob: 或 data:，首帧 0ms 呈现
        if (src && (src.startsWith("blob:") || src.startsWith("data:"))) {
            return src;
        }
        // 2. 0ms 探测 L1 内存缓存
        const memUrl = storageKey ? (peekLocalFirstMedia(storageKey, src) || peekCachedResourceObjectUrl(storageKey)) : "";
        if (memUrl) {
            return memUrl;
        }
        // 3. 若为纯外部 HTTP(S) 地址且没有 storageKey，直接作为默认 src
        if (!remoteResource && !localImageResource) {
            return src;
        }
        // 4. 远程资源或本地 IndexedDB 暂存图：首帧保持为空，展示 loadingFallback，
        // 杜绝挂载瞬间填入 /api/resources/:id/file 导致网络击穿，等待异步本地探测！
        return "";
    });
    const [cacheFailed, setCacheFailed] = useState(false);

    useEffect(() => {
        if ((!remoteResource && !localImageResource) || eager) {
            setNearViewport(true);
            return;
        }
        const image = targetRef.current;
        if (!image || typeof IntersectionObserver === "undefined") {
            setNearViewport(true);
            return;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setNearViewport(true);
                    observer.disconnect();
                }
            },
            { rootMargin: "240px" },
        );
        observer.observe(image);
        return () => observer.disconnect();
    }, [eager, localImageResource, remoteResource]);

    useEffect(() => {
        let cancelled = false;
        setCacheFailed(false);

        if (remoteResource && resourceId) {
            if (!nearViewport) {
                setCachedSrc("");
                return () => {
                    cancelled = true;
                };
            }
            // @opc-feature: zero-overhead-local-cache [start]
            // 本地优先治理：0ms 内存秒测 ➔ 桌面端本地磁盘直读 ➔ CacheStorage/IndexedDB ➔ 远程拉取并沉淀落盘
            const memUrl = peekLocalFirstMedia(storageKey!, src) || peekCachedResourceObjectUrl(storageKey!);
            if (memUrl) {
                setCachedSrc(memUrl);
                return () => {
                    cancelled = true;
                };
            }
            void resolveLocalFirstMedia(storageKey!, {
                fallbackUrl: src,
                mediaType: "image",
            })
                .then((resolved) => {
                    if (cancelled) return;
                    if (resolved && resolved.url) {
                        setCachedSrc(resolved.url);
                        return;
                    }
                    const fallbackSrc = src || (resourceId ? resourceFileUrl(resourceId) : "");
                    if (fallbackSrc) {
                        setCachedSrc(fallbackSrc);
                    } else {
                        setCacheFailed(true);
                    }
                })
                .catch(() => {
                    if (!cancelled) {
                        const fallbackSrc = src || (resourceId ? resourceFileUrl(resourceId) : "");
                        if (fallbackSrc) {
                            setCachedSrc(fallbackSrc);
                        } else {
                            setCacheFailed(true);
                        }
                    }
                });
            return () => {
                cancelled = true;
            };
            // @opc-feature: zero-overhead-local-cache [end]
        }

        if (localImageResource && storageKey) {
            const memUrl = peekLocalFirstMedia(storageKey, src);
            if (memUrl) {
                setCachedSrc(memUrl);
                return;
            }
            void resolveLocalFirstMedia(storageKey, {
                fallbackUrl: src,
                mediaType: "image",
            })
                .then((resolved) => {
                    if (!cancelled && resolved?.url) setCachedSrc(resolved.url);
                    else if (!cancelled) setCachedSrc(src);
                })
                .catch(() => {
                    if (!cancelled) setCachedSrc(src);
                });
            return () => {
                cancelled = true;
            };
        }

        setCachedSrc(src);
        return () => {
            cancelled = true;
        };
    }, [localImageResource, nearViewport, remoteResource, resourceId, src, storageKey]);

    const handleImgError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
        if (remoteResource && resourceId) {
            const proxyUrl = resourceFileUrl(resourceId);
            if (cachedSrc !== proxyUrl) {
                setCachedSrc(proxyUrl);
                return;
            }
        }
        if (localImageResource && storageKey && cachedSrc.startsWith("blob:")) {
            void resolveImageUrl(storageKey)
                .then((url) => {
                    if (url && url !== cachedSrc) {
                        setCachedSrc(url);
                        return;
                    }
                    setCacheFailed(true);
                    onError?.(e);
                })
                .catch(() => {
                    setCacheFailed(true);
                    onError?.(e);
                });
            return;
        }
        setCacheFailed(true);
        onError?.(e);
    };

    if (!remoteResource) {
        if (cacheFailed) {
            if (fallback) return <>{fallback}</>;
            return <div className="grid size-full place-items-center bg-stone-100 text-stone-400 text-xs dark:bg-stone-800">图片加载失败</div>;
        }
        return <img {...props} src={cachedSrc} onError={handleImgError} />;
    }
    return (
        <span ref={targetRef} className="cached-resource-image-shell">
            {cachedSrc && !cacheFailed ? (
                <img {...props} src={cachedSrc} onError={handleImgError} />
            ) : cacheFailed ? (
                fallback || <div className="grid size-full place-items-center bg-stone-100 text-stone-400 text-xs dark:bg-stone-800">图片加载失败</div>
            ) : (
                loadingFallback
            )}
        </span>
    );
}
