import { describe, expect, it } from "bun:test";
import { computeBlobSha256, computeTextSha256, deduplicateAssetList, findMatchingAsset } from "@/lib/asset-fingerprint";
import { useAssetStore, type Asset, type NewAsset } from "@/stores/use-asset-store";

describe("asset-fingerprint and deduplication", () => {
    it("computes consistent SHA-256 for identical Blobs and different for different Blobs", async () => {
        const blob1 = new Blob(["test-image-content-123"], { type: "image/png" });
        const blob2 = new Blob(["test-image-content-123"], { type: "image/png" });
        const blob3 = new Blob(["different-content-456"], { type: "image/png" });

        const hash1 = await computeBlobSha256(blob1);
        const hash2 = await computeBlobSha256(blob2);
        const hash3 = await computeBlobSha256(blob3);

        expect(hash1).toBe(hash2);
        expect(hash1).not.toBe(hash3);
        expect(hash1.length).toBe(64);
    });

    it("computes consistent SHA-256 for text content", async () => {
        const hash1 = await computeTextSha256("hello world");
        const hash2 = await computeTextSha256("  hello world  ");
        const hash3 = await computeTextSha256("hello universe");

        expect(hash1).toBe(hash2);
        expect(hash1).not.toBe(hash3);
    });

    it("matches existing asset by fileHash", () => {
        const existing: Asset[] = [
            {
                id: "asset-1",
                kind: "image",
                title: "Existing Image",
                coverUrl: "https://example.com/cover.png",
                tags: [],
                createdAt: "2026-01-01T00:00:00Z",
                updatedAt: "2026-01-01T00:00:00Z",
                metadata: { fileHash: "hash-abc-123" },
                data: { dataUrl: "https://example.com/1.png", width: 100, height: 100, bytes: 500, mimeType: "image/png" },
            },
        ];

        const candidate: NewAsset = {
            kind: "image",
            title: "New Upload Same Image",
            coverUrl: "https://example.com/other.png",
            tags: [],
            metadata: { fileHash: "hash-abc-123" },
            data: { dataUrl: "https://example.com/new.png", width: 100, height: 100, bytes: 500, mimeType: "image/png" },
        };

        const match = findMatchingAsset(existing, candidate);
        expect(match).toBeDefined();
        expect(match?.id).toBe("asset-1");
    });

    it("matches existing asset by storageKey / resource ID", () => {
        const existing: Asset[] = [
            {
                id: "asset-res",
                kind: "video",
                title: "Video 1",
                coverUrl: "",
                tags: [],
                createdAt: "2026-01-01T00:00:00Z",
                updatedAt: "2026-01-01T00:00:00Z",
                data: { url: "/api/resources/res-999/file", storageKey: "resource:res-999", width: 1920, height: 1080, bytes: 10000, mimeType: "video/mp4" },
            },
        ];

        const candidate: NewAsset = {
            kind: "video",
            title: "Re-uploaded Video",
            coverUrl: "",
            tags: [],
            data: { url: "/api/resources/res-999/file", storageKey: "resource:res-999", width: 1920, height: 1080, bytes: 10000, mimeType: "video/mp4" },
        };

        const match = findMatchingAsset(existing, candidate);
        expect(match).toBeDefined();
        expect(match?.id).toBe("asset-res");
    });

    it("matches text asset by trimmed content", () => {
        const existing: Asset[] = [
            {
                id: "text-1",
                kind: "text",
                title: "Notes",
                coverUrl: "",
                tags: [],
                createdAt: "2026-01-01T00:00:00Z",
                updatedAt: "2026-01-01T00:00:00Z",
                data: { content: "Sample script content line 1\nline 2" },
            },
        ];

        const candidate: NewAsset = {
            kind: "text",
            title: "Copied Notes",
            coverUrl: "",
            tags: [],
            data: { content: "  Sample script content line 1\nline 2  " },
        };

        const match = findMatchingAsset(existing, candidate);
        expect(match).toBeDefined();
        expect(match?.id).toBe("text-1");
    });

    it("does not match different assets", () => {
        const existing: Asset[] = [
            {
                id: "asset-1",
                kind: "image",
                title: "Image 1",
                coverUrl: "",
                tags: [],
                createdAt: "2026-01-01T00:00:00Z",
                updatedAt: "2026-01-01T00:00:00Z",
                metadata: { fileHash: "hash-111" },
                data: { dataUrl: "https://example.com/1.png", storageKey: "resource:111", width: 100, height: 100, bytes: 500, mimeType: "image/png" },
            },
        ];

        const candidate: NewAsset = {
            kind: "image",
            title: "Image 2",
            coverUrl: "",
            tags: [],
            metadata: { fileHash: "hash-222" },
            data: { dataUrl: "https://example.com/2.png", storageKey: "resource:222", width: 200, height: 200, bytes: 800, mimeType: "image/png" },
        };

        const match = findMatchingAsset(existing, candidate);
        expect(match).toBeUndefined();
    });

    it("deduplicates asset list preserving unique records and merging duplicates", () => {
        const assets: Asset[] = [
            {
                id: "primary",
                kind: "image",
                title: "Primary Photo",
                coverUrl: "",
                tags: [],
                status: "confirmed",
                createdAt: "2026-01-01T00:00:00Z",
                updatedAt: "2026-01-01T00:00:00Z",
                metadata: { fileHash: "same-hash" },
                data: { dataUrl: "https://example.com/p.png", width: 100, height: 100, bytes: 500, mimeType: "image/png" },
            },
            {
                id: "duplicate-1",
                kind: "image",
                title: "Duplicate 1",
                coverUrl: "",
                tags: [],
                status: "draft",
                createdAt: "2026-01-02T00:00:00Z",
                updatedAt: "2026-01-02T00:00:00Z",
                metadata: { fileHash: "same-hash" },
                data: { dataUrl: "https://example.com/d1.png", width: 100, height: 100, bytes: 500, mimeType: "image/png" },
            },
            {
                id: "other",
                kind: "image",
                title: "Other Photo",
                coverUrl: "",
                tags: [],
                status: "confirmed",
                createdAt: "2026-01-03T00:00:00Z",
                updatedAt: "2026-01-03T00:00:00Z",
                metadata: { fileHash: "other-hash" },
                data: { dataUrl: "https://example.com/other.png", width: 200, height: 200, bytes: 800, mimeType: "image/png" },
            },
        ];

        const { uniqueAssets, duplicateCount, mergedIdMap } = deduplicateAssetList(assets);
        expect(duplicateCount).toBe(1);
        expect(uniqueAssets.length).toBe(2);
        expect(uniqueAssets.map((a) => a.id)).toEqual(["primary", "other"]);
        expect(mergedIdMap.get("duplicate-1")).toBe("primary");
    });

    it("useAssetStore.addAsset reuses existing asset when exact same file is added", () => {
        useAssetStore.setState({ assets: [] });

        const assetPayload: NewAsset = {
            kind: "image",
            title: "Test Photo",
            coverUrl: "https://example.com/photo.png",
            tags: ["test"],
            metadata: { fileHash: "test-photo-hash-12345" },
            data: { dataUrl: "https://example.com/photo.png", storageKey: "resource:res_test_1", width: 640, height: 480, bytes: 12345, mimeType: "image/png" },
        };

        const firstId = useAssetStore.getState().addAsset(assetPayload);
        expect(firstId).toBeDefined();
        expect(useAssetStore.getState().assets.length).toBe(1);

        // Add the exact same asset again
        const secondId = useAssetStore.getState().addAsset({
            ...assetPayload,
            title: "Test Photo Duplicate Upload",
        });

        // Must return the existing ID, and total assets count must remain 1!
        expect(secondId).toBe(firstId);
        expect(useAssetStore.getState().assets.length).toBe(1);
    });

    it("useAssetStore.addAsset unarchives existing asset if it was in trash", () => {
        useAssetStore.setState({ assets: [] });

        const assetPayload: NewAsset = {
            kind: "image",
            title: "Trash Photo",
            coverUrl: "https://example.com/trash.png",
            tags: [],
            metadata: { fileHash: "trash-hash-999" },
            data: { dataUrl: "https://example.com/trash.png", storageKey: "resource:trash_1", width: 400, height: 400, bytes: 8888, mimeType: "image/png" },
        };

        const id = useAssetStore.getState().addAsset(assetPayload);
        useAssetStore.getState().updateAsset(id, { status: "archived" });
        expect(useAssetStore.getState().assets[0].status).toBe("archived");

        // User uploads/adds the same photo again: should restore to confirmed!
        const restoredId = useAssetStore.getState().addAsset(assetPayload);
        expect(restoredId).toBe(id);
        expect(useAssetStore.getState().assets[0].status).toBe("confirmed");
        expect(useAssetStore.getState().assets.length).toBe(1);
    });
});
