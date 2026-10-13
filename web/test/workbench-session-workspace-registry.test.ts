import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { useImageWorkbenchStore, type ImageSessionWorkspaceSnapshot } from "../src/stores/use-image-workbench-store";
import { useVideoWorkbenchStore, type VideoSessionWorkspaceSnapshot } from "../src/stores/use-video-workbench-store";
import { useDetailSetStore } from "../src/extensions/image-workbench-skills/stores/use-detail-set-store";

describe("多会话工作区快照注册表契约 (Session Workspace Registry Architecture)", () => {
    describe("生图工作台状态快照与 LRU 淘汰机制 (Image Workbench Store Registry)", () => {
        it("正确暂存、获取与移除会话快照，完整保留技能卡片、槽位素材与电商套图现场", () => {
            const store = useImageWorkbenchStore.getState();
            const sessionId = "session_test_img_001";

            const mockSnapshot: Omit<ImageSessionWorkspaceSnapshot, "sessionId" | "updatedAt"> = {
                skillId: "ecommerce-detail-set",
                prompt: "测试商品主图提示词",
                references: [{ id: "ref_1", name: "商品1.png", dataUrl: "data:image/png;base64,abc", type: "image/png" }],
                textReferences: [{ id: "txt_1", name: "卖点", content: "核心卖点介绍" }],
                slotContainers: {
                    product: {
                        files: [{ id: "f1", slotId: "product", name: "p.png", dataUrl: "data:image/png;base64,123", previewUrl: "data:image/png;base64,123", mimeType: "image/png", size: 100 }],
                        activeId: "f1",
                    },
                },
                model: "flux-pro",
                size: "3:4",
                quality: "high",
                count: 1,
                transparentBackground: false,
                detailSet: {
                    phase: "review",
                    resultView: "phone",
                    plan: {
                        planId: "plan_test_001",
                        createdAt: Date.now(),
                        config: { addText: true, outputLanguage: "zh", aspectRatio: "3:4", resolution: "1K", outputFormat: "PNG", productSafe: true },
                        productName: "测试护肤品",
                        category: "beauty",
                        selections: { "首图 / 主视觉": 1 },
                        rows: [{ seq: 1, modulePurpose: "首图 / 主视觉", title: "主视觉", finalPrompt: "Prompt 1", status: "planned" }],
                    },
                },
            };

            store.saveSessionSnapshot(sessionId, mockSnapshot);

            const retrieved = store.getSessionSnapshot(sessionId);
            expect(retrieved).toBeDefined();
            expect(retrieved?.sessionId).toBe(sessionId);
            expect(retrieved?.skillId).toBe("ecommerce-detail-set");
            expect(retrieved?.detailSet?.phase).toBe("review");
            expect(retrieved?.detailSet?.resultView).toBe("phone");
            expect(retrieved?.slotContainers?.product?.files).toHaveLength(1);
            expect(retrieved?.updatedAt).toBeGreaterThan(0);

            store.removeSessionSnapshot(sessionId);
            expect(store.getSessionSnapshot(sessionId)).toBeUndefined();
        });

        it("会话快照注册表超过 100 条时自动执行 LRU 淘汰，避免内存与本地存储无限膨胀", () => {
            const store = useImageWorkbenchStore.getState();
            for (let i = 0; i < 105; i++) {
                store.saveSessionSnapshot(`session_lru_img_${i}`, {
                    skillId: null,
                    prompt: `Prompt ${i}`,
                    references: [],
                    textReferences: [],
                    slotContainers: {},
                });
            }

            const snapshots = useImageWorkbenchStore.getState().sessionSnapshots;
            const keys = Object.keys(snapshots);
            expect(keys.length).toBeLessThanOrEqual(100);

            // 清理测试数据
            for (let i = 0; i < 105; i++) {
                store.removeSessionSnapshot(`session_lru_img_${i}`);
            }
        });
    });

    describe("生视频工作台状态快照与模式保留 (Video Workbench Store Registry)", () => {
        it("正确暂存、获取与移除视频会话快照，完整保留深度复刻、编导模式与音视频多模态参考", () => {
            const store = useVideoWorkbenchStore.getState();
            const sessionId = "session_test_vid_001";

            const mockSnapshot: Omit<VideoSessionWorkspaceSnapshot, "sessionId" | "updatedAt"> = {
                skillId: "reference-replication",
                isDirectorMode: true,
                prompt: "【基于参考分镜复刻与映射】原片分镜动作流转",
                references: [{ id: "img_ref", name: "ref.jpg", dataUrl: "data:image/jpeg;base64,img" }],
                videoReferences: [{ id: "vid_ref", name: "action.mp4", url: "https://example.com/v.mp4", durationMs: 5000, width: 1080, height: 1920, bytes: 2048, mimeType: "video/mp4" }],
                audioReferences: [{ id: "aud_ref", name: "bgm.mp3", url: "https://example.com/a.mp3", durationMs: 15000, bytes: 1024, mimeType: "audio/mp3" }],
                textReferences: [{ id: "txt_ref", name: "风格约束", content: "电影质感" }],
                referenceOrder: [
                    { id: "img_ref", kind: "image" },
                    { id: "vid_ref", kind: "video" },
                    { id: "aud_ref", kind: "audio" },
                ],
                model: "seedance-2.0",
                aspectRatio: "9:16",
                resolution: "720p",
                durationSec: 10,
            };

            store.saveSessionSnapshot(sessionId, mockSnapshot);

            const retrieved = store.getSessionSnapshot(sessionId);
            expect(retrieved).toBeDefined();
            expect(retrieved?.sessionId).toBe(sessionId);
            expect(retrieved?.skillId).toBe("reference-replication");
            expect(retrieved?.isDirectorMode).toBe(true);
            expect(retrieved?.videoReferences).toHaveLength(1);
            expect(retrieved?.audioReferences).toHaveLength(1);
            expect(retrieved?.referenceOrder).toHaveLength(3);

            store.removeSessionSnapshot(sessionId);
            expect(store.getSessionSnapshot(sessionId)).toBeUndefined();
        });

        it("视频会话快照注册表同样具备 100 条 LRU 淘汰机制", () => {
            const store = useVideoWorkbenchStore.getState();
            for (let i = 0; i < 105; i++) {
                store.saveSessionSnapshot(`session_lru_vid_${i}`, {
                    skillId: null,
                    isDirectorMode: false,
                    prompt: `Video Prompt ${i}`,
                    references: [],
                    videoReferences: [],
                    audioReferences: [],
                    textReferences: [],
                    referenceOrder: [],
                });
            }

            const snapshots = useVideoWorkbenchStore.getState().sessionSnapshots;
            const keys = Object.keys(snapshots);
            expect(keys.length).toBeLessThanOrEqual(100);

            // 清理测试数据
            for (let i = 0; i < 105; i++) {
                store.removeSessionSnapshot(`session_lru_vid_${i}`);
            }
        });
    });

    describe("电商套图 Store 阶段水合规范 (Detail Set Store Hydration)", () => {
        it("hydrateFromSnapshot 含有规划行时默认保留 review 态，杜绝粗暴退回空白 create 态", () => {
            const detailStore = useDetailSetStore.getState();

            detailStore.hydrateFromSnapshot(
                {
                    planId: "plan_h_001",
                    createdAt: Date.now(),
                    config: { addText: true, outputLanguage: "zh", aspectRatio: "3:4", resolution: "1K", outputFormat: "PNG", productSafe: true },
                    productName: "精华液",
                    category: "beauty",
                    selections: { "首图 / 主视觉": 1 },
                    rows: [{ seq: 1, modulePurpose: "首图 / 主视觉", title: "主视觉", finalPrompt: "Prompt", status: "planned" }],
                },
                "user_default"
            );

            expect(useDetailSetStore.getState().phase).toBe("review");
            expect(useDetailSetStore.getState().plan?.rows).toHaveLength(1);
        });
    });

    describe("页面层生命周期与切换切面源码契约 (Workbench Page Lifecycle Contracts)", () => {
        it("生图工作台页面必须完整挂载 saveCurrentWorkspaceSnapshot 与 restoreTargetWorkspaceSnapshot 切面", () => {
            const imageIndexFile = path.resolve(import.meta.dir, "../src/pages/image/index.tsx");
            const source = fs.readFileSync(imageIndexFile, "utf-8");

            // 1. 存在 saveCurrentWorkspaceSnapshot 与 restoreTargetWorkspaceSnapshot
            expect(source.includes("const saveCurrentWorkspaceSnapshot =")).toBe(true);
            expect(source.includes("const restoreTargetWorkspaceSnapshot =")).toBe(true);

            // 2. previewGenerationLog 包含切出封存与切入还原
            const previewMatch = source.match(/const previewGenerationLog = async \(log: GenerationLog\) => \{([\s\S]*?)\};/);
            expect(previewMatch).toBeTruthy();
            const previewBody = previewMatch![1];
            expect(previewBody.includes("saveCurrentWorkspaceSnapshot(prevSessionId)")).toBe(true);
            expect(previewBody.includes("restoreTargetWorkspaceSnapshot(log)")).toBe(true);

            // 3. createSession 包含切出封存
            const createMatch = source.match(/const createSession = (?:async )?\([\s\S]*?\) => \{([\s\S]*?)\};/);
            expect(createMatch).toBeTruthy();
            const createBody = createMatch![1];
            expect(createBody.includes("saveCurrentWorkspaceSnapshot(prevSessionId)")).toBe(true);

            // 4. 生成开始前触发快照保存
            expect(source.includes("saveCurrentWorkspaceSnapshot(sessionId)")).toBe(true);
        });

        it("生视频工作台页面必须完整挂载 saveCurrentVideoWorkspaceSnapshot 与 restoreTargetVideoWorkspaceSnapshot 切面", () => {
            const videoIndexFile = path.resolve(import.meta.dir, "../src/pages/video/index.tsx");
            const source = fs.readFileSync(videoIndexFile, "utf-8");

            // 1. 存在 saveCurrentVideoWorkspaceSnapshot 与 restoreTargetVideoWorkspaceSnapshot
            expect(source.includes("const saveCurrentVideoWorkspaceSnapshot =")).toBe(true);
            expect(source.includes("const restoreTargetVideoWorkspaceSnapshot =")).toBe(true);

            // 2. previewGenerationLog 包含切出封存与切入还原
            const previewMatch = source.match(/const previewGenerationLog = async \(log: GenerationLog\) => \{([\s\S]*?)\};/);
            expect(previewMatch).toBeTruthy();
            const previewBody = previewMatch![1];
            expect(previewBody.includes("saveCurrentVideoWorkspaceSnapshot(prevSessionId)")).toBe(true);
            expect(previewBody.includes("restoreTargetVideoWorkspaceSnapshot(log)")).toBe(true);

            // 3. createSession 包含切出封存
            const createMatch = source.match(/const createSession = async \([\s\S]*?\) => \{([\s\S]*?)\};/);
            expect(createMatch).toBeTruthy();
            const createBody = createMatch![1];
            expect(createBody.includes("saveCurrentVideoWorkspaceSnapshot(prevSessionId)")).toBe(true);

            // 4. 生成开始前触发快照保存
            expect(source.includes("saveCurrentVideoWorkspaceSnapshot(activeSessionId)")).toBe(true);
        });

        it("生图与生视频工作台切入历史日志时必须将 currentSessionIdRef 与目标会话 ID 严格对齐，彻底消除裂脑快照键", () => {
            const imageIndexFile = path.resolve(import.meta.dir, "../src/pages/image/index.tsx");
            const imageSource = fs.readFileSync(imageIndexFile, "utf-8");
            expect(imageSource.includes("currentSessionIdRef.current = log.id;")).toBe(true);
            expect(imageSource.includes("if (log.sessionId) currentSessionIdRef.current = log.sessionId;")).toBe(true);

            const videoIndexFile = path.resolve(import.meta.dir, "../src/pages/video/index.tsx");
            const videoSource = fs.readFileSync(videoIndexFile, "utf-8");
            expect(videoSource.includes("currentSessionIdRef.current = log.id;")).toBe(true);
            expect(videoSource.includes("if (log.sessionId) currentSessionIdRef.current = log.sessionId;")).toBe(true);
        });

        it("生图工作台电商套图逐行生成与单行重试完成后必须实时固化至工作区快照，且失败卡槽精准路由重试", () => {
            const imageIndexFile = path.resolve(import.meta.dir, "../src/pages/image/index.tsx");
            const imageSource = fs.readFileSync(imageIndexFile, "utf-8");

            // 1. runDetailSetRows 结束时固化 activeSessionId
            expect(imageSource.includes("saveCurrentWorkspaceSnapshot(activeSessionId);")).toBe(true);

            // 2. retryResult 识别电商套图并路由到独立槽位处理器
            expect(imageSource.includes("await retryDetailSetRowRef.current(targetBatchId, targetItem.slotIndex + 1);")).toBe(true);

            // 3. deriveGenerationResultsFromLog 对 detailSet.rows 逐行解构映射，且普通批次保留部分成功卡
            expect(imageSource.includes("if (log.detailSet?.rows?.length) {")).toBe(true);
            expect(imageSource.includes("const cardId = `${log.id}_slot_${slotIndex}`;")).toBe(true);
        });
    });
});

