import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import type { CanvasResourceReference, CanvasResourceKind } from "@/lib/canvas/canvas-resource-references";
import type { AiTextContentPart } from "@/services/api/image-contracts";
import { resolveResourceUrl } from "@/services/api/resources";
import { imageToDataUrl } from "@/services/image-storage";

function escapeRegExp(val: string): string {
    return val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 为参考生脚本（经典复刻 / 创意复刻）统一构建上游可用素材的 @ 引用清单
 */
export function buildRefScriptMentionReferences(
    upstreamNodes: CanvasNodeData[],
    upstreamAnalysis?: CanvasNodeData,
): CanvasResourceReference[] {
    const refs: CanvasResourceReference[] = [];
    const seenIds = new Set<string>();

    const counters: Record<CanvasResourceKind, number> = {
        image: 0,
        video: 0,
        audio: 0,
        text: 0,
        character: 0,
        skill: 0,
        tool: 0,
    };

    // 1. 遍历直接相连的上游节点
    upstreamNodes.forEach((node) => {
        if (seenIds.has(node.id)) return;

        let storageKey =
            node.metadata?.storageKey ||
            (typeof node.metadata?.content === "string" && node.metadata.content.startsWith("image:")
                ? node.metadata.content
                : undefined);

        let previewUrl: string | undefined =
            node.metadata?.previewContent ||
            (typeof node.metadata?.content === "string" ? node.metadata.content : undefined) ||
            (node as any).metadata?.imageUrl ||
            (node as any).data?.url ||
            (node as any).data?.src;

        let mediaUrl: string | undefined =
            (typeof node.metadata?.content === "string" ? node.metadata.content : undefined) ||
            (node as any).metadata?.imageUrl ||
            (node as any).data?.url;

        let kind: CanvasResourceKind | undefined;
        let text: string | undefined;

        if (storageKey) {
            const resolved = resolveResourceUrl(storageKey);
            if (resolved) {
                previewUrl = resolved;
                mediaUrl = resolved;
            }
        }

        // 如果 previewUrl 是本地 IndexedDB 协议或 resource 键，转入 storageKey，避免作为未解析内部协议传给 img src
        if (previewUrl && (previewUrl.startsWith("image:") || previewUrl.startsWith("resource:"))) {
            if (!storageKey) {
                storageKey = previewUrl;
            }
            const resolved = resolveResourceUrl(previewUrl);
            previewUrl = resolved || undefined;
        }

        if (node.metadata?.workflowKind === "character") {
            kind = "character";
            previewUrl = node.metadata.characterCoverUrl || previewUrl;
            text = node.metadata.characterPrompt;
        } else if (node.type === CanvasNodeType.Image) {
            kind = "image";
        } else if (node.type === CanvasNodeType.Video) {
            kind = "video";
            if (node.metadata?.videoPreview?.storageKey) {
                const vidResolved = resolveResourceUrl(node.metadata.videoPreview.storageKey);
                if (vidResolved) previewUrl = vidResolved;
            }
        } else if (node.type === CanvasNodeType.Audio) {
            kind = "audio";
        } else if (node.type === CanvasNodeType.Text) {
            kind = "text";
            text = node.metadata?.content || node.metadata?.composerContent || node.metadata?.prompt;
        }

        if (kind) {
            seenIds.add(node.id);
            counters[kind] += 1;
            const index = counters[kind];
            const prefix =
                kind === "image"
                    ? "图片"
                    : kind === "video"
                      ? "视频"
                      : kind === "audio"
                        ? "音频"
                        : kind === "character"
                          ? "角色"
                          : "文本";

            let label = `${prefix}${index}`;
            const titleTrim = node.title?.trim() || "";
            // 如果节点原生标题本身已经带有符合规则的标准代号（如“图片2”），优先继承以保持全局一致性
            const matchedPrefixRegex = new RegExp(`^${prefix}\\s*(\\d+)$`, "u");
            const titleMatch = titleTrim.match(matchedPrefixRegex);
            if (titleMatch) {
                label = `${prefix}${titleMatch[1]}`;
            }

            refs.push({
                id: node.id,
                nodeId: node.id,
                kind,
                label,
                title: titleTrim || label,
                previewUrl,
                mediaUrl,
                storageKey,
                previewStorageKey: node.type === CanvasNodeType.Video ? node.metadata?.videoPreview?.storageKey : undefined,
                text,
                active: true,
                mentionToken: `@${label}`,
                sourceType: node.type,
            });
        }
    });

    // 2. 如果上游挂载了 materialAnalysis 记录的额外源素材，且尚未记录，则按序补入
    const analysisMeta = upstreamAnalysis?.metadata?.materialAnalysis as any;
    analysisMeta?.localSources?.forEach((src: any) => {
        if (!seenIds.has(src.id)) {
            seenIds.add(src.id);
            const kind: CanvasResourceKind =
                src.kind === "image" ? "image" : src.kind === "video" ? "video" : src.kind === "audio" ? "audio" : "image";
            counters[kind] += 1;
            const index = counters[kind];
            const prefix = kind === "image" ? "图片" : kind === "video" ? "视频" : "音频";
            const label = `${prefix}${index}`;

            refs.push({
                id: src.id,
                nodeId: src.id,
                kind,
                label,
                title: src.name || label,
                previewUrl: src.url,
                mediaUrl: src.url,
                active: true,
                mentionToken: `@${label}`,
            });
        }
    });

    return refs;
}

export type MentionedAssetSummary = {
    label: string;
    title: string;
    kind: string;
    isDirectlyMentioned: boolean;
};

/**
 * 判断指定素材引用是否被用户在需求文本中提及（支持 @图片1、@【图片1】、@[图片1]、@图片1:特写、@节点标题等所有变体）
 */
export function isReferenceMentionedInText(ref: CanvasResourceReference, text: string): boolean {
    if (!text.trim()) return false;

    // 收集该素材的所有可识别标记
    const candidates: string[] = [ref.label];
    if (ref.title && ref.title !== ref.label) {
        candidates.push(ref.title);
    }
    // 编号别名（如 图片1 -> 图1）
    const numMatch = ref.label.match(/^(?:图片|视频|音频|角色|文本)(\d+)$/);
    if (numMatch) {
        candidates.push(`图${numMatch[1]}`);
    }

    for (const name of candidates) {
        if (!name.trim()) continue;
        const escaped = escapeRegExp(name.trim());
        // 允许 @图片1、@【图片1】、@[图片1]、且其后不能是连带的数字（防止 @图片10 误伤 @图片1）
        const regex = new RegExp(`@(?:【|\\[)?${escaped}(?:】|\\])?(?![0-9])`, "u");
        if (regex.test(text)) {
            return true;
        }
    }

    // 节点专属标记检测
    if (ref.nodeId && text.includes(`@[node:${ref.nodeId}]`)) {
        return true;
    }
    if (ref.assetId && text.includes(`@[asset:${ref.assetId}]`)) {
        return true;
    }

    // 若用户明确使用了独特标题（非通用缺省名），亦做包含判定
    if (ref.title && ref.title.length >= 3 && !/^图片\d+$/.test(ref.title) && text.includes(ref.title)) {
        return true;
    }

    return false;
}

/**
 * 解析用户创作需求中的 @ 素材引用，并将图片素材多模态化打通注入模型输入
 */
export function resolveMentionedContentParts(params: {
    textPrompt: string;
    userRequirement: string;
    references: CanvasResourceReference[];
}): {
    contentParts: AiTextContentPart[];
    expandedRequirement: string;
    mentionedAssets: MentionedAssetSummary[];
    targetImageUrls: string[];
} {
    const { textPrompt, userRequirement, references } = params;

    // 文本素材展开：如果在需求中直接提到了 @文本N 或具体文本内容，将其完整文字正文展开附在括号内，让大模型读懂
    let expandedRequirement = userRequirement;
    references.forEach((ref) => {
        if (ref.kind === "text" && ref.text?.trim()) {
            if (isReferenceMentionedInText(ref, expandedRequirement)) {
                const token = `@${ref.label}`;
                if (expandedRequirement.includes(token)) {
                    expandedRequirement = expandedRequirement
                        .split(token)
                        .join(`【引用${ref.label} (${ref.title})】: ${ref.text.trim()}`);
                } else {
                    expandedRequirement += `\n\n【附录参考${ref.label} (${ref.title})】:\n${ref.text.trim()}`;
                }
            }
        }
    });

    // 整理素材引用摘要
    const mentionedAssets: MentionedAssetSummary[] = references.map((ref) => {
        const isDirect = isReferenceMentionedInText(ref, userRequirement);
        return {
            label: `@${ref.label}`,
            title: ref.title,
            kind: ref.kind,
            isDirectlyMentioned: isDirect,
        };
    });

    // 筛选目标图片多模态资产：
    // 若用户明确 @ 了某些图片，优先使用明确 @ 的图片；
    // 若用户未显式输入 @图片，但上游直连了图片素材，则将直连图片全部作为视觉背景提供给大模型
    const directImages = references.filter((r) => r.kind === "image" && isReferenceMentionedInText(r, userRequirement));
    const targetImages = directImages.length > 0 ? directImages : references.filter((r) => r.kind === "image");

    const targetImageUrls: string[] = [];
    const seenUrls = new Set<string>();

    targetImages.forEach((img) => {
        const url = img.previewUrl || img.mediaUrl || (img.storageKey ? resolveResourceUrl(img.storageKey) : "");
        if (url && !seenUrls.has(url)) {
            seenUrls.add(url);
            targetImageUrls.push(url);
        }
    });

    // 组装最终的多模态 contentParts
    const contentParts: AiTextContentPart[] = [{ type: "text", text: textPrompt }];
    targetImageUrls.forEach((url) => {
        contentParts.push({
            type: "image_url",
            image_url: { url },
        });
    });

    return {
        contentParts,
        expandedRequirement,
        mentionedAssets,
        targetImageUrls,
    };
}

/**
 * 异步解析多模态图片资产，确保本地 IndexedDB (image:*) 或 Blob URL 均转换为合规的 Data URL (Base64) 传给云端 AI 大模型
 */
export async function resolveMentionedContentPartsAsync(params: {
    textPrompt: string;
    userRequirement: string;
    references: CanvasResourceReference[];
}): Promise<{
    contentParts: AiTextContentPart[];
    expandedRequirement: string;
    mentionedAssets: MentionedAssetSummary[];
    targetImageUrls: string[];
}> {
    const base = resolveMentionedContentParts(params);

    const directImages = params.references.filter(
        (r) => r.kind === "image" && isReferenceMentionedInText(r, params.userRequirement),
    );
    const targetImages = directImages.length > 0 ? directImages : params.references.filter((r) => r.kind === "image");

    const hydratedUrls: string[] = [];
    for (const img of targetImages) {
        let finalUrl = img.previewUrl || img.mediaUrl || "";
        if (img.storageKey || !finalUrl || finalUrl.startsWith("blob:") || finalUrl.startsWith("image:")) {
            try {
                const dataUrl = await imageToDataUrl({
                    url: finalUrl,
                    storageKey: img.storageKey,
                });
                if (dataUrl) finalUrl = dataUrl;
            } catch (e) {
                console.warn("Failed to convert image to dataUrl:", e);
            }
        }
        if (finalUrl && !hydratedUrls.includes(finalUrl)) {
            hydratedUrls.push(finalUrl);
        }
    }

    if (hydratedUrls.length > 0) {
        const contentParts: AiTextContentPart[] = [{ type: "text", text: params.textPrompt }];
        hydratedUrls.forEach((url) => {
            contentParts.push({
                type: "image_url",
                image_url: { url },
            });
        });
        return {
            ...base,
            contentParts,
            targetImageUrls: hydratedUrls,
        };
    }

    return base;
}

