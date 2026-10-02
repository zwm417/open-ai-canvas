import { type ReactNode, useEffect, useRef, useState } from "react";

import { CachedResourceImage } from "@/components/cached-resource-image";
import type { Asset } from "@/stores/use-asset-store";

type AssetMediaPreviewProps = {
    asset?: Asset | null;
    alt: string;
    className?: string;
    fallback?: ReactNode;
    /** 是否启用 220ms 悬停微动效播放（默认开启） */
    hoverPreview?: boolean;
};

export function AssetMediaPreview({ asset, alt, className = "", fallback = null, hoverPreview = true }: AssetMediaPreviewProps) {
    if (!asset) return fallback;

    if (asset.kind === "video" && asset.data.url) {
        return <VideoAssetCardPreview asset={asset} alt={alt} className={className} fallback={fallback} hoverPreview={hoverPreview} />;
    }

    const storageKey = asset.kind === "image" ? asset.data.storageKey : undefined;
    const imageUrl = asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "");
    if (!imageUrl && !storageKey) return fallback;
    return <CachedResourceImage storageKey={storageKey} src={imageUrl} alt={alt} loading="lazy" decoding="async" className={className} fallback={fallback} />;
}

function VideoAssetCardPreview({
    asset,
    alt,
    className,
    fallback,
    hoverPreview,
}: {
    asset: Asset;
    alt: string;
    className: string;
    fallback: ReactNode;
    hoverPreview: boolean;
}) {
    const [isHovered, setIsHovered] = useState(false);
    const [videoLoaded, setVideoLoaded] = useState(false);
    const hoverTimerRef = useRef<number | null>(null);

    const videoUrl = asset.kind === "video" ? asset.data.url : undefined;
    const poster = asset.coverUrl && asset.coverUrl !== videoUrl ? asset.coverUrl : undefined;
    const coverStorageKey = (asset as { coverStorageKey?: string }).coverStorageKey;

    useEffect(() => {
        return () => {
            if (hoverTimerRef.current !== null) {
                window.clearTimeout(hoverTimerRef.current);
            }
        };
    }, []);

    const handleMouseEnter = () => {
        if (!hoverPreview || !videoUrl) return;
        if (hoverTimerRef.current !== null) {
            window.clearTimeout(hoverTimerRef.current);
        }
        // 遵循《AGENTS.md》4.4 条款：220ms 生理决策防抖确认后才按需挂载视频
        hoverTimerRef.current = window.setTimeout(() => {
            setIsHovered(true);
        }, 220);
    };

    const handleMouseLeave = () => {
        if (hoverTimerRef.current !== null) {
            window.clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
        // 移出即刻销毁 <video> 标签并释放硬件解码器显存
        setIsHovered(false);
        setVideoLoaded(false);
    };

    const hasCover = Boolean(poster || coverStorageKey);

    return (
        <span
            className={`relative block h-full w-full overflow-hidden ${className}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* 阶段 1：首屏 0KB 视频网络请求，仅渲染 WebP 封面海报或占位图 */}
            {hasCover ? (
                <CachedResourceImage
                    storageKey={coverStorageKey}
                    src={poster}
                    alt={alt}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                    fallback={fallback}
                />
            ) : fallback ? (
                fallback
            ) : (
                <div className="grid h-full w-full place-items-center bg-muted/40 text-foreground/30" />
            )}

            {/* 阶段 2：悬停 220ms 确认后按需挂载无声轻量视频，移出时即刻卸载销毁 */}
            {isHovered && videoUrl ? (
                <video
                    src={videoUrl}
                    poster={poster}
                    aria-label={alt}
                    muted
                    playsInline
                    autoPlay
                    loop
                    onLoadedData={() => setVideoLoaded(true)}
                    className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                        videoLoaded ? "opacity-100" : "opacity-0"
                    }`}
                />
            ) : null}
        </span>
    );
}

