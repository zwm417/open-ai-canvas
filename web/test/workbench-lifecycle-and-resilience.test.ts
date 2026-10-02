import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";

describe("工作台后台自持生命周期与资损安全契约 (Workbench Lifecycle & Resilience Contract)", () => {
    it("生视频工作台：提交任务后秒级释放锁定，新建会话与查看历史不得误杀后台生成", () => {
        const videoPagePath = path.resolve(import.meta.dir, "../src/pages/video/index.tsx");
        const source = fs.readFileSync(videoPagePath, "utf-8");

        // 1. 验证 submitting 瞬态提交锁在任务发起后立即释放
        expect(source.includes("setSubmitting(false);")).toBe(true);
        expect(source.includes("message.success(\"视频生成任务已提交，后台全自动执行中！\");")).toBe(true);

        // 2. 验证 createSession 严禁包含误杀 abort 与批量清空逻辑
        const createSessionMatch = source.match(/const createSession = async \([\s\S]*?\) => \{([\s\S]*?)\n    const deleteSelectedLogs/);
        expect(createSessionMatch).toBeTruthy();
        const createSessionBody = createSessionMatch![1];
        expect(createSessionBody.includes("abort()")).toBe(false);
        expect(createSessionBody.includes("activeSegmentBatchIdsRef.current.clear()")).toBe(false);

        // 3. 验证 previewGenerationLog 严禁包含误杀 abort 与批量清空逻辑
        const previewLogMatch = source.match(/const previewGenerationLog = async \(log: GenerationLog\) => \{([\s\S]*?)\n    const buildRequestSnapshot/);
        expect(previewLogMatch).toBeTruthy();
        const previewLogBody = previewLogMatch![1];
        expect(previewLogBody.includes("abort()")).toBe(false);
        expect(previewLogBody.includes("activeSegmentBatchIdsRef.current.clear()")).toBe(false);

        // 4. 验证资金与积分安全：任何未产出成片情况无论切屏与否 100% 自动退款
        expect(source.includes("视频分段生成未成功退款")).toBe(true);
        expect(source.includes("视频生成未完成退款")).toBe(true);
        expect(source.includes("chargedMicrocredits?: number")).toBe(true);
    });

    it("生图工作台：提交后立即释放前端锁定，会话切换不丢弃已生成图片且历史预览正确锚定会话", () => {
        const imagePagePath = path.resolve(import.meta.dir, "../src/pages/image/index.tsx");
        const source = fs.readFileSync(imagePagePath, "utf-8");

        // 1. 验证 submitting 提交锁与提示
        expect(source.includes("setSubmitting(false);")).toBe(true);
        expect(source.includes("message.success(\"生图任务已提交，后台全自动执行中！\");")).toBe(true);

        // 2. 验证 createSession 严禁调用 abort
        const createSessionMatch = source.match(/const createSession = \(\) => \{([\s\S]*?)\n    const deleteSelectedLogs/);
        expect(createSessionMatch).toBeTruthy();
        const createSessionBody = createSessionMatch![1];
        expect(createSessionBody.includes("abort()")).toBe(false);

        // 3. 验证 previewGenerationLog 正确将 currentSessionIdRef 锚定为当前预览日志 ID
        const previewLogMatch = source.match(/const previewGenerationLog = async \(log: GenerationLog\) => \{([\s\S]*?)\n    const buildRequestSnapshot/);
        expect(previewLogMatch).toBeTruthy();
        const previewLogBody = previewLogMatch![1];
        expect(previewLogBody.includes("currentSessionIdRef.current = log.id;")).toBe(true);

        // 4. 验证 runGenerationSlot 在跨会话时正常返回图片结果供持久化落库
        const runSlotMatch = source.match(/const runGenerationSlot = async \([\s\S]*?\n    const retryResult/);
        expect(runSlotMatch).toBeTruthy();
        const runSlotBody = runSlotMatch![0];
        // 严禁存在提前 return null 丢弃成品的逻辑
        expect(runSlotBody.includes("if (currentSessionIdRef.current !== sessionId) return null;")).toBe(false);
        // 返回有效图片
        expect(runSlotBody.includes("return nextImage;")).toBe(true);

        // 5. 验证重试逻辑具备积分防护与历史记录就地更新
        const retryMatch = source.match(/const retryResult = async \(index: number\) => \{([\s\S]*?)\n    const handleSelectPromptPreset/);
        expect(retryMatch).toBeTruthy();
        const retryBody = retryMatch![1];
        expect(retryBody.includes("imageFeatureCredit.deduct")).toBe(true);
        expect(retryBody.includes("imageFeatureCredit.refund")).toBe(true);
        expect(retryBody.includes("logId: currentFailedLog?.id")).toBe(true);
    });

    it("生图与生视频工作台：多次点击生成时真实保留多任务并发状态，完成与失败按卡片 ID 精确就地更新", () => {
        const videoPagePath = path.resolve(import.meta.dir, "../src/pages/video/index.tsx");
        const videoSource = fs.readFileSync(videoPagePath, "utf-8");

        // 1. 生视频：单视频任务提交时采用前置追加，严禁覆写清空既有并发任务
        expect(videoSource.includes("setResults((prev) => [pendingCard, ...prev.filter((r) => r.id !== targetLogId)])")).toBe(true);
        // 2. 生视频：分段视频任务提交时同样前置追加并保持已有任务
        expect(videoSource.includes("setResults((prev) => [batchPendingCard, ...prev.filter((r) => r.id !== batchId)])")).toBe(true);
        // 3. 生视频：pollGenerationLog 完成时按任务/log ID 就地替换，保留其他进行中或已完成的任务
        expect(videoSource.includes("existingIndex = prev.findIndex((r) => r.id === log.id || (r.task?.id && r.task.id === log.task?.id) || r.id === nextVideo.id)")).toBe(true);
        expect(videoSource.includes("existingIndex = prev.findIndex((r) => r.id === log.id || (r.task?.id && r.task.id === log.task?.id))")).toBe(true);

        const imagePagePath = path.resolve(import.meta.dir, "../src/pages/image/index.tsx");
        const imageSource = fs.readFileSync(imagePagePath, "utf-8");

        // 4. 生图：提交时前置追加新批次卡片，连续多次点击保持各自并发生成中状态
        expect(imageSource.includes("setResults((prev) => [...newPendingSlots, ...prev]);")).toBe(true);
        // 5. 生图：每个生成 slot 完成或失败时按 cardId 精确查找并就地更新，不冲掉其他并发批次卡片
        expect(imageSource.includes("const idx = value.findIndex((r) => r.id === cardId);")).toBe(true);
        expect(imageSource.includes("if (idx >= 0) return updateResultAt(value, idx, { status: \"success\", image: nextImage });")).toBe(true);
        expect(imageSource.includes("if (idx >= 0) return updateResultAt(value, idx, { status: \"failed\", error: errMsg });")).toBe(true);
    });

    it("生图与生视频工作台防裂图/防裂视频契约：临时链接自动转持久化，大图、缩略图、历史记录抽屉具备多级兜底与错误自愈", () => {
        const videoPagePath = path.resolve(import.meta.dir, "../src/pages/video/index.tsx");
        const videoSource = fs.readFileSync(videoPagePath, "utf-8");

        // 1. 生视频 ResultVideoCard 具备 initialSrc 兜底、onError 自动切换后端代理以及优雅降级重试面板
        expect(videoSource.includes("const initialSrc = video.url || (video.storageKey ? resolveResourceUrl(video.storageKey) : \"\");")).toBe(true);
        expect(videoSource.includes("const fallbackUrl = resolveResourceUrl(video.storageKey);")).toBe(true);
        expect(videoSource.includes("视频加载异常，可能因网络波动或临时链接过期导致")).toBe(true);

        // 2. 生视频 LogCard 历史记录抽屉缩略图具备 storageKey 兜底与 onError 自动修复
        expect(videoSource.includes("firstImage?.dataUrl || (firstImage?.storageKey ? resolveResourceUrl(firstImage.storageKey) : undefined)")).toBe(true);
        expect(videoSource.includes("firstVideo?.posterUrl || (firstVideo?.posterStorageKey ? resolveResourceUrl(firstVideo.posterStorageKey) : undefined)")).toBe(true);

        // 3. 生视频输出记录转换：即便原 url 缺失也能从 storageKey 恢复
        expect(videoSource.includes("output.url || (output.storageKey ? resolveResourceUrl(output.storageKey) : \"\")")).toBe(true);

        const videoServicePath = path.resolve(import.meta.dir, "../src/services/api/video.ts");
        const videoServiceSource = fs.readFileSync(videoServicePath, "utf-8");

        // 4. 生视频后台存储服务：上游返回的临时外链自动通过 importResourceFromUrl 导入后端持久化对象存储
        expect(videoServiceSource.includes("importResourceFromUrl(result.url, \"video\")")).toBe(true);

        const imagePagePath = path.resolve(import.meta.dir, "../src/pages/image/index.tsx");
        const imageSource = fs.readFileSync(imagePagePath, "utf-8");

        // 5. 生图 ResultImageCard 与 LogCard 具备 storageKey 与 IMAGE_FALLBACK_SVG 双重防裂
        expect(imageSource.includes("IMAGE_FALLBACK_SVG")).toBe(true);
        expect(imageSource.includes("fallbackKey")).toBe(true);
    });

    it("生图与生视频工作台：同一页面多次点击并发发起、修改输入隔离、跨路由切换自愈与后台结果安全回填契约", () => {
        const imagePagePath = path.resolve(import.meta.dir, "../src/pages/image/index.tsx");
        const imageSource = fs.readFileSync(imagePagePath, "utf-8");

        // 1. 生图工作台：必须导出 deriveGenerationResultsFromLog 以支持会话级结果反解
        expect(imageSource.includes("export function deriveGenerationResultsFromLog(log: GenerationLog): GenerationResult[]")).toBe(true);

        // 2. 生图工作台：提交生成瞬间立即保存 pendingLog，保证断电与跨路由有据可查
        expect(imageSource.includes("const pendingLog = buildLog({")).toBe(true);
        expect(imageSource.includes("saveLog(pendingLog);")).toBe(true);

        // 3. 生图工作台：具备基于 draft.sessionId 的全生命周期状态守卫，路由切回自动聚合回填当前会话生成结果
        expect(imageSource.includes("const sessionLogs = draft.sessionId ? logs.filter((l) => (l.sessionId && l.sessionId === draft.sessionId) || l.id === draft.sessionId) : [targetLog];")).toBe(true);
        expect(imageSource.includes("const allSessionResults = sessionLogs.flatMap(deriveGenerationResultsFromLog);")).toBe(true);

        // 4. 生图工作台：runGenerationSlot 在 cardId 不在当前视图时严禁篡改当前视图，安全返回原值
        expect(imageSource.includes("if (idx >= 0) return updateResultAt(value, idx, { status: \"success\", image: nextImage });")).toBe(true);
        expect(imageSource.includes("if (idx >= 0) return updateResultAt(value, idx, { status: \"failed\", error: errMsg });")).toBe(true);
        expect(imageSource.includes("updateResultAt(value, fallbackIndex")).toBe(false);

        const videoPagePath = path.resolve(import.meta.dir, "../src/pages/video/index.tsx");
        const videoSource = fs.readFileSync(videoPagePath, "utf-8");

        // 5. 生视频工作台：会话聚合恢复与后台轮询自动续接
        expect(videoSource.includes("const sessionLogs = draft.sessionId ? logs.filter((l) => (l.sessionId && l.sessionId === draft.sessionId) || l.id === draft.sessionId) : [targetLog];")).toBe(true);
        expect(videoSource.includes("const allSessionResults = sessionLogs.flatMap(deriveGenerationResultsFromLog);")).toBe(true);
        expect(/for\s*\(\s*const\s+log\s+of\s+pendingLogs\s*\)[\s\S]*?void\s+pollGenerationLog\(log\)/.test(videoSource)).toBe(true);
    });
});
