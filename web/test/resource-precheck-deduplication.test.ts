import { describe, expect, test } from "bun:test";
import { apiClient } from "@/services/api/request";
import { uploadResourceFile } from "@/services/api/resources";
import { computeBlobSha256 } from "@/lib/asset-fingerprint";

describe("素材预检探针与秒传去重 (Deduplication Pre-check)", () => {
    test("大文件 (>20MB) 复合抽样 SHA-256 具备确定性且耗时极短", async () => {
        // 创建一个 25MB 的虚拟 Blob 测试抽样计算
        const size = 25 * 1024 * 1024;
        const part = new Uint8Array(1024);
        part.fill(42);
        const blob = new Blob([part, new Uint8Array(size - 1024)], { type: "video/mp4" });
        expect(blob.size).toBe(size);

        const t0 = performance.now();
        const hash1 = await computeBlobSha256(blob);
        const hash2 = await computeBlobSha256(blob);
        const duration = performance.now() - t0;

        expect(typeof hash1).toBe("string");
        expect(hash1.length).toBe(64);
        expect(hash1).toBe(hash2);
        expect(duration).toBeLessThan(1500); // 25MB 抽样 6MB 计算远低于 1.5 秒
    });

    test("命中预检探针时直接返回现有资源，不发起实际 POST /resources 物理上传", async () => {
        const previous = apiClient.defaults.adapter;
        let postResourceCalled = false;
        let preCheckCalled = false;

        const mockExistingResource = {
            id: "res-prechecked-123",
            kind: "video" as const,
            status: "ready" as const,
            publicUrl: "/uploads/mock-video.mp4",
            size: 35000000,
            mimeType: "video/mp4",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        apiClient.defaults.adapter = async (config) => {
            const url = config.url || "";
            if (url.includes("/resources/pre-check")) {
                preCheckCalled = true;
                return {
                    data: { code: 0, data: { exists: true, resource: mockExistingResource }, msg: "ok" },
                    status: 200,
                    statusText: "OK",
                    headers: {},
                    config,
                };
            }
            if (url.endsWith("/resources")) {
                postResourceCalled = true;
                return {
                    data: { code: 0, data: { resource: { id: "res-new" } }, msg: "ok" },
                    status: 200,
                    statusText: "OK",
                    headers: {},
                    config,
                };
            }
            throw new Error(`Unexpected url: ${url}`);
        };

        try {
            let reportedLoaded = 0;
            let reportedTotal = 0;
            const blob = new Blob(["mock-content"], { type: "video/mp4" });
            const result = await uploadResourceFile(blob, "video", {
                fileName: "test.mp4",
                idempotencyKey: "test-dedup-key-123",
            }, (loaded, total) => {
                reportedLoaded = loaded;
                reportedTotal = total;
            });

            expect(preCheckCalled).toBe(true);
            expect(postResourceCalled).toBe(false); // 0 物理上传请求
            expect(result.id).toBe("res-prechecked-123");
            expect(reportedLoaded).toBe(blob.size);
            expect(reportedTotal).toBe(blob.size);
        } finally {
            apiClient.defaults.adapter = previous;
        }
    });

    test("未命中预检探针时正常回退到物理文件上传", async () => {
        const previous = apiClient.defaults.adapter;
        let postResourceCalled = false;
        let preCheckCalled = false;

        apiClient.defaults.adapter = async (config) => {
            const url = config.url || "";
            if (url.includes("/resources/pre-check")) {
                preCheckCalled = true;
                return {
                    data: { code: 0, data: { exists: false }, msg: "ok" },
                    status: 200,
                    statusText: "OK",
                    headers: {},
                    config,
                };
            }
            if (url.endsWith("/resources")) {
                postResourceCalled = true;
                return {
                    data: { code: 0, data: { resource: { id: "res-new-uploaded", kind: "video" } }, msg: "ok" },
                    status: 200,
                    statusText: "OK",
                    headers: {},
                    config,
                };
            }
            throw new Error(`Unexpected url: ${url}`);
        };

        try {
            const blob = new Blob(["fresh-content"], { type: "video/mp4" });
            const result = await uploadResourceFile(blob, "video", {
                fileName: "fresh.mp4",
                idempotencyKey: "new-key-456",
            });

            expect(preCheckCalled).toBe(true);
            expect(postResourceCalled).toBe(true);
            expect(result.id).toBe("res-new-uploaded");
        } finally {
            apiClient.defaults.adapter = previous;
        }
    });
});
