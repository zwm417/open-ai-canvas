import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
    getCanonicalMediaKey,
    peekLocalFirstMedia,
    resolveLocalFirstMedia,
    persistMediaLocally,
    clearLocalFirstMediaCache,
    clearMemoryCacheOnly,
    getLocalFirstMediaStats,
    WEB_CACHE_NAME,
} from "@/services/local-first-media-resolver";

describe("local-first-media-resolver (桌面端内嵌本地优先与防流量损耗治理)", () => {
    const originalWindow = globalThis.window;
    const originalFetch = globalThis.fetch;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    let mockCacheStorageMap = new Map<string, Response>();
    let revokedUrls: string[] = [];

    beforeEach(async () => {
        await clearLocalFirstMediaCache();
        mockCacheStorageMap.clear();
        revokedUrls = [];

        URL.createObjectURL = (blob: any) => `blob:mock-resolved-${Math.random().toString(36).slice(2)}`;
        URL.revokeObjectURL = (url: string) => {
            revokedUrls.push(url);
        };

        const mockCaches = {
            open: async (name: string) => ({
                match: async (req: Request) => mockCacheStorageMap.get(req.url) || null,
                put: async (req: Request, res: Response) => {
                    mockCacheStorageMap.set(req.url, res);
                },
                delete: async (req: Request) => mockCacheStorageMap.delete(req.url),
                keys: async () => Array.from(mockCacheStorageMap.keys()),
            }),
            delete: async (name: string) => {
                mockCacheStorageMap.clear();
                return true;
            },
        };

        (globalThis as any).window = {
            location: { origin: "http://localhost:3000" },
            caches: mockCaches,
            get fetch() {
                return globalThis.fetch;
            },
        };
    });

    afterEach(async () => {
        await clearLocalFirstMediaCache();
        globalThis.window = originalWindow;
        globalThis.fetch = originalFetch;
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 1. 规范键生成与 OSS 签名参数脱敏 (消除长期反复下载与流量损耗)
    // ──────────────────────────────────────────────────────────────────────────
    test("getCanonicalMediaKey 针对资源 ID 生成规范键", () => {
        expect(getCanonicalMediaKey("res:xyz789")).toBe("res:xyz789");
    });

    test("getCanonicalMediaKey 过滤 OSS 签名与过期时间戳，保证键恒定唯一", () => {
        const url1 = "https://cdn.zhiying.cc/assets/shot01.webp?OSSAccessKeyId=KEY1&Expires=1700000000&Signature=SIG1";
        const url2 = "https://cdn.zhiying.cc/assets/shot01.webp?OSSAccessKeyId=KEY2&Expires=1700009999&Signature=SIG2";

        const key1 = getCanonicalMediaKey(undefined, url1);
        const key2 = getCanonicalMediaKey(undefined, url2);

        expect(key1).toBe("url:https://cdn.zhiying.cc/assets/shot01.webp");
        expect(key2).toBe("url:https://cdn.zhiying.cc/assets/shot01.webp");
        expect(key1).toBe(key2); // 消除 OSS 签名变动导致重复下载！
    });

    test("getCanonicalMediaKey 保留 blob: 与 data: 原生 URL", () => {
        expect(getCanonicalMediaKey(undefined, "blob:http://localhost/test")).toBe("blob:http://localhost/test");
        expect(getCanonicalMediaKey(undefined, "data:image/png;base64,xxxx")).toBe("data:image/png;base64,xxxx");
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 2. Tier 0: 桌面端内嵌优先直读本地磁盘 (<10ms, 0 外部流量损耗)
    // ──────────────────────────────────────────────────────────────────────────
    test("在桌面端内嵌环境中，优先命中本地媒体 (Tier 0: Desktop Native Local)", async () => {
        let desktopQueried = false;
        (globalThis as any).window.desktopBridge = {
            isDesktop: true,
            getLocalMedia: async (query: any) => {
                desktopQueried = true;
                return {
                    exists: true,
                    localUrl: "zhiying-media://local-cache/shot01.png",
                    filePath: "C:\\Users\\test\\智影专属媒体\\images\\shot01.png",
                };
            },
        };

        const result = await resolveLocalFirstMedia("res:shot01", {
            fallbackUrl: "https://oss.example.com/shot01.png",
            mediaType: "image",
        });

        expect(desktopQueried).toBe(true);
        expect(result.isLocal).toBe(true);
        expect(result.hitSource).toBe("desktop-local");
        expect(result.url).toBe("zhiying-media://local-cache/shot01.png");

        // 验证 0ms 内存同步探测已自动预热
        expect(peekLocalFirstMedia("res:shot01")).toBe("zhiying-media://local-cache/shot01.png");
    });

    test("桌面端通过 ArrayBuffer 返回时，能自动转化为 Object URL 供浏览器渲染", async () => {
        const dummyBuffer = new Uint8Array([1, 2, 3, 4]).buffer;
        (globalThis as any).window.desktopBridge = {
            isDesktop: true,
            getLocalMedia: async () => ({
                exists: true,
                buffer: dummyBuffer,
                mimeType: "image/png",
            }),
        };

        const result = await resolveLocalFirstMedia("res:buffered-img", {
            fallbackUrl: "https://oss.example.com/buffer.png",
        });

        expect(result.isLocal).toBe(true);
        expect(result.hitSource).toBe("desktop-local");
        expect(result.url.startsWith("blob:")).toBe(true);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 3. 桌面端故障或本地不存在时，平滑降级至 Web 管道并异步回填沉淀
    // ──────────────────────────────────────────────────────────────────────────
    test("桌面端异常或未落盘时，平滑降级至远程拉取，并异步回填落盘至桌面端", async () => {
        let savedToDesktop = false;
        let savedFileName = "";

        (globalThis as any).window.desktopBridge = {
            isDesktop: true,
            getLocalMedia: async () => {
                // 本地不存在或读取故障
                return { exists: false };
            },
            saveMedia: async (options: any) => {
                savedToDesktop = true;
                savedFileName = options.fileName;
                return { success: true };
            },
        };

        // Mock 远程请求
        const mockBlob = new Blob(["image-binary-data"], { type: "image/webp" });
        (globalThis as any).fetch = async (url: string) => {
            return new Response(mockBlob, { status: 200 });
        };

        const result = await resolveLocalFirstMedia("res:remote-fallback-01", {
            fallbackUrl: "https://oss.example.com/remote.webp",
            fileName: "custom-shot.webp",
            mediaType: "image",
        });

        expect(result.hitSource).toBe("remote-fetched");
        expect(result.isLocal).toBe(false);
        expect(result.url.startsWith("blob:")).toBe(true);

        // 等待异步沉淀任务执行
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(savedToDesktop).toBe(true);
        expect(savedFileName).toBe("custom-shot.webp");
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 4. 纯 Web 端模式运行正常，且命中 CacheStorage
    // ──────────────────────────────────────────────────────────────────────────
    test("在纯 Web 环境下，首次从远程拉取并沉淀至 CacheStorage，再次读取 0 流量命中", async () => {
        (globalThis as any).window.desktopBridge = undefined; // 纯 Web 用户

        let remoteFetchCount = 0;
        const mockBlob = new Blob(["web-media-bytes"], { type: "image/png" });
        (globalThis as any).fetch = async (url: string) => {
            remoteFetchCount += 1;
            return new Response(mockBlob, { status: 200 });
        };

        // 第 1 次：远程拉取并写入 CacheStorage
        const res1 = await resolveLocalFirstMedia("res:web-shot", {
            fallbackUrl: "https://oss.example.com/web.png?token=first",
            mediaType: "image",
        });
        expect(res1.hitSource).toBe("remote-fetched");
        expect(remoteFetchCount).toBe(1);

        // 清除内存会话缓存，强制走磁盘/CacheStorage
        clearMemoryCacheOnly();
        // 重新设置 mockCacheStorageMap 里的数据（模拟页面刷新后）
        // 第 2 次访问：OSS 签名已过期变更为 token=second
        const res2 = await resolveLocalFirstMedia("res:web-shot", {
            fallbackUrl: "https://oss.example.com/web.png?token=second",
            mediaType: "image",
        });

        // 验证：即使 OSS 签名变动，由于规范键一致，直接命中 CacheStorage，remoteFetchCount 保持为 1！
        expect(res2.hitSource).toBe("cache-storage");
        expect(res2.isLocal).toBe(true);
        expect(remoteFetchCount).toBe(1); // 0 额外网络损耗！
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 5. 并发防雪崩与主动落盘
    // ──────────────────────────────────────────────────────────────────────────
    test("多个并发请求相同规范键时复用同一个解析 Promise", async () => {
        let fetchCalls = 0;
        (globalThis as any).fetch = async () => {
            fetchCalls += 1;
            await new Promise((r) => setTimeout(r, 20));
            return new Response(new Blob(["data"]), { status: 200 });
        };

        const [r1, r2, r3] = await Promise.all([
            resolveLocalFirstMedia("res:concurrent-res", { fallbackUrl: "https://oss.example.com/c.png" }),
            resolveLocalFirstMedia("res:concurrent-res", { fallbackUrl: "https://oss.example.com/c.png" }),
            resolveLocalFirstMedia("res:concurrent-res", { fallbackUrl: "https://oss.example.com/c.png" }),
        ]);

        expect(fetchCalls).toBe(1);
        expect(r1.url).toBe(r2.url);
        expect(r2.url).toBe(r3.url);
    });

    test("persistMediaLocally 能够双向主动持久化媒体至桌面端与 Web 端", async () => {
        let desktopSaved = false;
        (globalThis as any).window.desktopBridge = {
            isDesktop: true,
            saveMedia: async () => {
                desktopSaved = true;
                return { success: true };
            },
        };

        const testBlob = new Blob(["persist-test-content"], { type: "image/png" });
        const success = await persistMediaLocally("res:generated-task-99", testBlob, {
            fileName: "task99.png",
            mediaType: "image",
        });

        expect(success).toBe(true);
        expect(desktopSaved).toBe(true);
        expect(peekLocalFirstMedia("res:generated-task-99")).not.toBeNull();
    });

    test("视频媒体在 Web 端默认走 HTTP 206 流式透传，严禁无节制全量 fetch().blob() 导致网络阻塞", async () => {
        let blobFetched = false;
        (globalThis as any).fetch = async () => {
            blobFetched = true;
            return new Response(new Blob(["video-data"]), { status: 200 });
        };

        const res = await resolveLocalFirstMedia("res:video-stream-01", {
            fallbackUrl: "https://oss.example.com/stream-video.mp4?OSSAccessKeyId=KEY1&Signature=SIG1",
            mediaType: "video",
        });

        // 默认不应执行 fetch().blob()，保持 HTTP 206 流式 URL
        expect(blobFetched).toBe(false);
        expect(res.url).toBe("https://oss.example.com/stream-video.mp4?OSSAccessKeyId=KEY1&Signature=SIG1");
        expect(res.hitSource).toBe("remote-fallback");
    });

    test("LRU 内存机制：达到视频上限 (3 项) 时自动淘汰旧条目，并显式调用 URL.revokeObjectURL 防内存泄漏", async () => {
        // 主动设置 4 个视频 Object URL
        for (let i = 1; i <= 4; i++) {
            const b = new Blob([`video-${i}`], { type: "video/mp4" });
            await persistMediaLocally(`res:vid-${i}`, b, { mediaType: "video" });
        }

        // 第 4 个加入时，超出上限的条目应被自动淘汰并触发 URL.revokeObjectURL
        expect(revokedUrls.length).toBeGreaterThanOrEqual(1);
    });

    test("支持画布 image:* 与 generation-image:* 前缀暂存图的规范键", () => {
        expect(getCanonicalMediaKey("image:user_scope:hash123")).toBe("image_user_scope_hash123");
        expect(getCanonicalMediaKey("generation-image:user_scope:hash456")).toBe("generation-image_user_scope_hash456");
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 6. 核心接入组件与契约围栏审查
    // ──────────────────────────────────────────────────────────────────────────
    test("cached-resource-image.tsx、image-storage.ts 与 file-storage.ts 完整接入本地优先治理", () => {
        const root = resolve(import.meta.dir, "..");
        const cachedImgSrc = readFileSync(resolve(root, "src/components/cached-resource-image.tsx"), "utf-8");
        const imageStorageSrc = readFileSync(resolve(root, "src/services/image-storage.ts"), "utf-8");
        const fileStorageSrc = readFileSync(resolve(root, "src/services/file-storage.ts"), "utf-8");
        const taskSyncSrc = readFileSync(resolve(root, "src/lib/canvas/canvas-generation-task-sync.ts"), "utf-8");

        // 检验 CachedResourceImage 组件
        expect(cachedImgSrc).toContain("peekLocalFirstMedia");
        expect(cachedImgSrc).toContain("resolveLocalFirstMedia");
        expect(cachedImgSrc).toContain("// @opc-feature: zero-overhead-local-cache [start]");
        expect(cachedImgSrc).toContain("// @opc-feature: zero-overhead-local-cache [end]");

        // 检验 resolveImageUrl
        expect(imageStorageSrc).toContain("peekLocalFirstMedia");
        expect(imageStorageSrc).toContain("resolveLocalFirstMedia");
        expect(imageStorageSrc).toContain("// @opc-feature: zero-overhead-local-cache [start]");
        expect(imageStorageSrc).toContain("// @opc-feature: zero-overhead-local-cache [end]");

        // 检验 resolveMediaUrl
        expect(fileStorageSrc).toContain("peekLocalFirstMedia");
        expect(fileStorageSrc).toContain("resolveLocalFirstMedia");
        expect(fileStorageSrc).toContain("// @opc-feature: zero-overhead-local-cache [start]");
        expect(fileStorageSrc).toContain("// @opc-feature: zero-overhead-local-cache [end]");

        // 检验任务生成后双向主动落盘沉淀
        expect(taskSyncSrc).toContain("persistMediaLocally");
        expect(taskSyncSrc).toContain("// @opc-feature: desktop-media-save [start]");
        expect(taskSyncSrc).toContain("// @opc-feature: desktop-media-save [end]");
    });
});
