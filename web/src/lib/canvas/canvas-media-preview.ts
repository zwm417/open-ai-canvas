import { buildLibTVVideoPreviewUrl } from "@/lib/canvas/libtv-import";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export type CanvasVideoPreviewReference = {
    src: string;
    storageKey?: string;
};

/**
 * Returns the passive preview image reference for a video node.
 *
 * `storageKey` is kept separate from the fallback URL so UI callers can
 * resolve a fresh OSS/CDN display URL instead of mounting a stale historical
 * `/api/resources/:id/file` URL stored in older canvas data.
 */
// @opc-feature: video-hover-preview-sync [start]
function isVideoSourceUrl(url: string): boolean {
    if (!url) return false;
    const clean = url.split("?")[0].toLowerCase();
    return clean.endsWith(".mp4") || clean.endsWith(".webm") || clean.endsWith(".mov") || clean.endsWith(".mkv") || clean.endsWith(".avi") || clean.endsWith(".3gp");
}
// @opc-feature: video-hover-preview-sync [end]

export function canvasNodeVideoPreviewReference(node: CanvasNodeData): CanvasVideoPreviewReference | null {
    if (node.type !== CanvasNodeType.Video) return null;
    const content = node.metadata?.content || "";
    const generatedPreview = node.metadata?.videoPreview;
    if (generatedPreview?.storageKey || (generatedPreview?.content && generatedPreview.content !== content)) {
        return { src: generatedPreview.content || "", storageKey: generatedPreview.storageKey };
    }
    // @opc-feature: video-hover-preview-sync [start]
    const explicitPreview = node.metadata?.previewContent || "";
    if (explicitPreview && explicitPreview !== content && !isVideoSourceUrl(explicitPreview)) return { src: explicitPreview };
    // @opc-feature: video-hover-preview-sync [end]
    const importedPreview = buildLibTVVideoPreviewUrl(content);
    return importedPreview ? { src: importedPreview } : null;
}

/**
 * Returns an image source that is safe to mount for a passive video preview.
 * The original video URL is deliberately never returned: callers must fall
 * back to a video icon instead of creating a decoder outside the active node.
 */
export function canvasNodeVideoPreviewUrl(node: CanvasNodeData) {
    return canvasNodeVideoPreviewReference(node)?.src || "";
}

export function canvasVideoAssetPreviewUrl(videoUrl: string, coverUrl?: string) {
    const explicitCover = coverUrl?.trim() || "";
    if (explicitCover && explicitCover !== videoUrl) return explicitCover;
    return buildLibTVVideoPreviewUrl(videoUrl);
}
