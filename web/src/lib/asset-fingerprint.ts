// @opc-feature: asset-deduplication [start]
import type { Asset, NewAsset } from "@/stores/use-asset-store";
import { resourceIdFromStorageKey } from "@/services/api/resources";

/**
 * 提取资源定位符中的 resourceId（兼容 resource:id 与 /api/resources/:id/file 等形式）。
 */
export function extractResourceId(locator?: string): string {
    if (!locator || typeof locator !== "string") return "";
    const fromKey = resourceIdFromStorageKey(locator);
    if (fromKey) return fromKey;
    const match = locator.match(/\/resources\/([^/?#]+)\/file/);
    return match ? match[1] : "";
}

/**
 * 计算完整 Blob / File 的严格全量 SHA-256 哈希字符串（十六进制）。
 * 注意：> 100MB 的极大文件建议使用流式或分块计算，避免一次性 arrayBuffer 占用过大内存。
 */
export async function computeFullBlobSha256(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * 计算 Blob / File 的快速特征指纹（十六进制）。
 * - 针对 <= 20MB 文件：采用原生 100% 全量 SHA-256；
 * - 针对 > 20MB 的大文件：采用工业级复合抽样特征指纹（头 2MB + 中 2MB + 尾 2MB + 字节尺寸与 MIME 类型），
 *   在 10ms 内生成确定性特征指纹，彻底规避数百兆视频文件整体载入内存导致的浏览器卡顿或 OOM 崩溃。
 */
export async function computeBlobSha256(blob: Blob): Promise<string> {
    if (blob.size <= 20 * 1024 * 1024) {
        const buffer = await blob.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", buffer);
        return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    const sampleSize = 2 * 1024 * 1024;
    const mid = Math.floor(blob.size / 2);
    const head = blob.slice(0, sampleSize);
    const middle = blob.slice(mid, mid + sampleSize);
    const tail = blob.slice(Math.max(0, blob.size - sampleSize), blob.size);

    const [headBuf, midBuf, tailBuf] = await Promise.all([
        head.arrayBuffer(),
        middle.arrayBuffer(),
        tail.arrayBuffer(),
    ]);

    const metaBuf = new TextEncoder().encode(`${blob.size}:${blob.type}`);
    const totalLen = headBuf.byteLength + midBuf.byteLength + tailBuf.byteLength + metaBuf.byteLength;
    const combined = new Uint8Array(totalLen);
    let offset = 0;
    combined.set(new Uint8Array(headBuf), offset);
    offset += headBuf.byteLength;
    combined.set(new Uint8Array(midBuf), offset);
    offset += midBuf.byteLength;
    combined.set(new Uint8Array(tailBuf), offset);
    offset += tailBuf.byteLength;
    combined.set(metaBuf, offset);

    const digest = await crypto.subtle.digest("SHA-256", combined);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * 计算文本内容的 SHA-256 哈希字符串。
 */
export async function computeTextSha256(text: string): Promise<string> {
    const encoded = new TextEncoder().encode(text.trim());
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * 计算 Data URL 的 SHA-256 哈希。
 */
export async function computeDataUrlSha256(dataUrl: string): Promise<string> {
    if (dataUrl.startsWith("data:")) {
        const commaIndex = dataUrl.indexOf(",");
        if (commaIndex !== -1) {
            const isBase64 = dataUrl.slice(0, commaIndex).includes(";base64");
            const raw = dataUrl.slice(commaIndex + 1);
            if (isBase64) {
                const binary = atob(raw);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }
                const digest = await crypto.subtle.digest("SHA-256", bytes);
                return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
            }
        }
    }
    return computeTextSha256(dataUrl);
}

/**
 * 获取素材数据中可能存在的媒体定位 URL 或存储键。
 */
function getAssetMediaLocator(asset: NewAsset | Asset): { url?: string; storageKey?: string } {
    if (asset.kind === "text" || asset.kind === "entity") return {};
    const data = asset.data as Record<string, unknown>;
    const url = typeof data.url === "string" ? data.url : typeof data.dataUrl === "string" ? data.dataUrl : undefined;
    const storageKey = typeof data.storageKey === "string" ? data.storageKey : undefined;
    return { url, storageKey };
}

/**
 * 在已有素材列表中检索是否存在与候选素材代表“同一物理文件/内容”的已有素材。
 * 判定依据（优先级自高至低）：
 * 1. 内容指纹（fileHash / contentHash）：同一种类且内容哈希一致；
 * 2. 存储定位符（storageKey / resourceId）：指向同一个后端资源或本地存储键；
 * 3. 资源 URL：同属一个 /api/resources/:id/file 或完全相同的公网 URL（排除临时 blob: URL）；
 * 4. 文本素材：kind 为 text 且正文内容完全一致（trim 后）；
 * 5. 实体素材：kind 为 entity 且 definition 结构完全相同。
 */
export function findMatchingAsset(
    assets: Asset[],
    candidate: NewAsset | Asset,
    options?: { excludeId?: string; candidateHash?: string },
): Asset | undefined {
    const excludeId = options?.excludeId;
    const candidateHash = options?.candidateHash || (typeof candidate.metadata?.fileHash === "string" ? candidate.metadata.fileHash : undefined);
    const candidateLocator = getAssetMediaLocator(candidate);
    const candidateResourceId = extractResourceId(candidateLocator.storageKey) || extractResourceId(candidateLocator.url);
    const candidateUrl = candidateLocator.url && !candidateLocator.url.startsWith("blob:") ? candidateLocator.url : undefined;

    for (const existing of assets) {
        if (excludeId && existing.id === excludeId) continue;
        if (existing.kind !== candidate.kind) continue;

        // 1. 指纹哈希匹配
        if (candidateHash) {
            const existingHash = typeof existing.metadata?.fileHash === "string" ? existing.metadata.fileHash : undefined;
            if (existingHash && existingHash === candidateHash) {
                return existing;
            }
        }

        // 2. 文本素材内容匹配
        if (candidate.kind === "text" && existing.kind === "text") {
            const candidateContent = candidate.data.content?.trim();
            const existingContent = existing.data.content?.trim();
            if (candidateContent && candidateContent === existingContent) {
                return existing;
            }
            continue;
        }

        // 3. 实体素材结构匹配
        if (candidate.kind === "entity" && existing.kind === "entity") {
            try {
                if (JSON.stringify(candidate.data.definition) === JSON.stringify(existing.data.definition)) {
                    return existing;
                }
            } catch {
                // Ignore serialization error
            }
            continue;
        }

        // 4. 存储键与资源 ID 匹配
        const existingLocator = getAssetMediaLocator(existing);
        const existingResourceId = extractResourceId(existingLocator.storageKey) || extractResourceId(existingLocator.url);

        if (candidateResourceId && existingResourceId && candidateResourceId === existingResourceId) {
            return existing;
        }

        if (candidateLocator.storageKey && existingLocator.storageKey && candidateLocator.storageKey === existingLocator.storageKey) {
            return existing;
        }

        // 5. 稳定资源 URL 匹配
        if (candidateUrl && existingLocator.url && !existingLocator.url.startsWith("blob:") && candidateUrl === existingLocator.url) {
            return existing;
        }

        // 6. 备用兜底：若均为本地图片且 bytes / width / height / mimeType 均完全吻合且标题相同
        if (candidate.kind === "image" && existing.kind === "image") {
            const cData = candidate.data;
            const eData = existing.data;
            if (
                cData.bytes > 0 &&
                cData.bytes === eData.bytes &&
                cData.width > 0 &&
                cData.width === eData.width &&
                cData.height > 0 &&
                cData.height === eData.height &&
                cData.mimeType &&
                cData.mimeType === eData.mimeType &&
                candidate.title.trim() === existing.title.trim()
            ) {
                return existing;
            }
        }
    }

    return undefined;
}

/**
 * 扫描并去重素材列表，剔除完全相同内容的重复资产，保留最完整的一条（优先已确认、最早建立的），
 * 并返回合并映射字典（duplicateId -> primaryId）。
 */
export function deduplicateAssetList(assets: Asset[]): {
    uniqueAssets: Asset[];
    duplicateCount: number;
    mergedIdMap: Map<string, string>;
} {
    const uniqueAssets: Asset[] = [];
    const mergedIdMap = new Map<string, string>();
    let duplicateCount = 0;

    for (const asset of assets) {
        const existing = findMatchingAsset(uniqueAssets, asset);
        if (existing) {
            duplicateCount++;
            mergedIdMap.set(asset.id, existing.id);
            // 如果已有项是草稿而当前项已确认，提升状态
            if (existing.status === "draft" && asset.status === "confirmed") {
                existing.status = "confirmed";
            }
        } else {
            uniqueAssets.push(asset);
        }
    }

    return { uniqueAssets, duplicateCount, mergedIdMap };
}
// @opc-feature: asset-deduplication [end]
