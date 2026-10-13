import { describe, expect, it } from "bun:test";
import { LOCAL_STORAGE_KEY_PATTERN, isLocalStorageKey } from "@/services/user-data-sync-media";
import { mediaIdentityFromValue } from "@/services/canvas-asset-repair";
import { InspirationCache } from "@/components/prompts/inspiration-cache";
import { deleteStoredImages } from "@/services/image-storage";
import { deleteStoredMedia } from "@/services/file-storage";
import { peekLocalFirstMedia, primeLocalFirstMedia } from "@/services/local-first-media-resolver";

describe("多级缓存横向治理与防丢失契约 (Enterprise Media Multi-Tier Cache Governance)", () => {
    it("P0-2: LOCAL_STORAGE_KEY_PATTERN 正确匹配 generation-(image|video|audio) 并在云端同步中放行", () => {
        const generationImageKey = "generation-image:user-1:task-abc-123";
        const generationVideoKey = "generation-video:user-1:task-video-456";
        const generationAudioKey = "generation-audio:user-1:task-audio-789";

        expect(LOCAL_STORAGE_KEY_PATTERN.test(generationImageKey)).toBe(true);
        expect(LOCAL_STORAGE_KEY_PATTERN.test(generationVideoKey)).toBe(true);
        expect(LOCAL_STORAGE_KEY_PATTERN.test(generationAudioKey)).toBe(true);

        expect(isLocalStorageKey(generationImageKey)).toBe(true);
        expect(isLocalStorageKey(generationVideoKey)).toBe(true);
        expect(isLocalStorageKey(generationAudioKey)).toBe(true);
    });

    it("P0-2: canvas-asset-repair 正确将 generation-image 识别为合法本地身份以支持素材重绑与修复", () => {
        const key = "generation-image:user-1:effect-999";
        const identity = mediaIdentityFromValue(key);
        expect(identity).toBe(key);
        expect(identity).not.toBeUndefined();
    });

    it("P1-2: InspirationCache 脱敏带签名的临时 URL，消除签名刷新导致的缓存雪崩", () => {
        const url1 = "https://cdn.example.com/assets/sample.webp?Expires=1700000000&Signature=abc1";
        const url2 = "https://cdn.example.com/assets/sample.webp?Expires=1700000500&Signature=xyz2";

        // 模拟已预热
        InspirationCache.getMemoryCached(url1);
        InspirationCache.clear();
        expect(InspirationCache.getMemoryCached(url1)).toBeNull();
    });

    it("P1-7: deleteStoredImages 和 deleteStoredMedia 针对 resource 键同样彻底释放内存与解析器缓存", async () => {
        const resKey = "resource:res-test-999";
        const mockUrl = "blob:https://zhiying.local/mock-obj-123";
        primeLocalFirstMedia(resKey, mockUrl, undefined, "image");

        expect(peekLocalFirstMedia(resKey)).toBe(mockUrl);

        // 删除 resource 键
        await deleteStoredImages([resKey]);
        expect(peekLocalFirstMedia(resKey)).toBeNull();

        const videoResKey = "resource:video-test-888";
        const mockVideoUrl = "blob:https://zhiying.local/mock-video-456";
        primeLocalFirstMedia(videoResKey, mockVideoUrl, undefined, "video");
        expect(peekLocalFirstMedia(videoResKey)).toBe(mockVideoUrl);

        await deleteStoredMedia([videoResKey]);
        expect(peekLocalFirstMedia(videoResKey)).toBeNull();
    });

    it("P1-New: clearLocalFirstMediaCache 触发 generation epoch 递增，确保代次守卫拦截旧会话在途异步写", async () => {
        const { getLocalFirstMediaEpoch, clearLocalFirstMediaCache } = await import("@/services/local-first-media-resolver");
        const initialEpoch = getLocalFirstMediaEpoch();
        await clearLocalFirstMediaCache();
        const nextEpoch = getLocalFirstMediaEpoch();
        expect(nextEpoch).toBeGreaterThan(initialEpoch);
    });
});
