import { describe, expect, it } from "bun:test";
import {
    startNodeTask,
    updateNodeTaskProgress,
    updateNodeTaskStreamedText,
    finishNodeTask,
    failNodeTask,
    cancelNodeTask,
    cancelAllNodeTasks,
    isNodeTaskRunning,
    getNodeTask,
    subscribeNodeTask,
    reconcileOrphanedClientNodeState,
} from "../src/extensions/opc-infinite/services/opc-task-hub";

describe("OPC Task Hub - 无头任务中枢与健康自愈机制", () => {
    it("startNodeTask 能够正确注册物理活跃任务并查询状态", () => {
        const nodeId = "test-node-1";
        const task = startNodeTask(nodeId, "video-reverse", { percent: 10, message: "抽帧中" });

        expect(task.nodeId).toBe(nodeId);
        expect(task.taskType).toBe("video-reverse");
        expect(task.status).toBe("running");
        expect(isNodeTaskRunning(nodeId)).toBe(true);

        const fetched = getNodeTask(nodeId);
        expect(fetched).toBeDefined();
        expect(fetched?.progress?.percent).toBe(10);
    });

    it("updateNodeTaskProgress 与 updateNodeTaskStreamedText 能精确更新进度并通知订阅者", () => {
        const nodeId = "test-node-2";
        startNodeTask(nodeId, "reference-script", { percent: 0, message: "初始化" });

        const receivedProgress: any[] = [];
        const receivedStreams: string[] = [];

        const unsubscribe = subscribeNodeTask(nodeId, (t) => {
            if (t.progress) receivedProgress.push(t.progress);
            if (t.streamedText) receivedStreams.push(t.streamedText);
        });

        updateNodeTaskProgress(nodeId, { percent: 50, message: "推演中" }, "第1句");
        updateNodeTaskStreamedText(nodeId, "第1句第2句");

        expect(receivedProgress.length).toBeGreaterThanOrEqual(1);
        expect(receivedStreams).toContain("第1句");
        expect(receivedStreams).toContain("第1句第2句");

        const finalTask = getNodeTask(nodeId);
        expect(finalTask?.progress?.percent).toBe(50);
        expect(finalTask?.streamedText).toBe("第1句第2句");

        unsubscribe();
    });

    it("subscribeNodeTask 监听通道与物理任务实体彻底隔离，绝不产生伪任务污染", () => {
        const ghostNodeId = "ghost-node-listener-only";

        // 挂载组件订阅尚未运行的任务
        const unsubscribe = subscribeNodeTask(ghostNodeId, () => {});

        // 核心验证：注册表里绝不允许存在该节点的物理任务
        expect(isNodeTaskRunning(ghostNodeId)).toBe(false);
        expect(getNodeTask(ghostNodeId)).toBeUndefined();

        unsubscribe();
    });

    it("cancelNodeTask 能够主动中止任务、触发 AbortController 并调用退款回调", async () => {
        const nodeId = "test-node-cancel";
        const controller = new AbortController();
        let refundCalled = false;

        startNodeTask(
            nodeId,
            "material-analysis",
            { percent: 20, message: "分析中" },
            {
                controller,
                onAbortRefund: () => {
                    refundCalled = true;
                },
            }
        );

        expect(isNodeTaskRunning(nodeId)).toBe(true);
        expect(controller.signal.aborted).toBe(false);

        const cancelled = await cancelNodeTask(nodeId, "用户手动删除节点");
        expect(cancelled).toBe(true);
        expect(controller.signal.aborted).toBe(true);
        expect(refundCalled).toBe(true);
        expect(isNodeTaskRunning(nodeId)).toBe(false);

        // 再次 cancel 应返回 false
        expect(await cancelNodeTask(nodeId)).toBe(false);
    });

    it("reconcileOrphanedClientNodeState: 当物理任务正在运行时，绝不触发误自愈", async () => {
        const nodeId = "test-running-node";
        startNodeTask(nodeId, "creation-assistant-script", { percent: 30, message: "生成中" });

        let healed = false;
        const result = await reconcileOrphanedClientNodeState({
            nodeId,
            isTaskRunning: isNodeTaskRunning(nodeId),
            persistedStatus: "loading",
            persistedTaskStatus: "running",
            subStatus: "running",
            hasValidResult: false,
            onHeal: () => {
                healed = true;
            },
        });

        expect(result).toBe(false);
        expect(healed).toBe(false);
    });

    it("reconcileOrphanedClientNodeState: 挂载期孤儿态自愈 - 无结果且无物理任务时自愈为 idle", async () => {
        const nodeId = "test-orphan-idle";
        let healedStatus = "";

        const result = await reconcileOrphanedClientNodeState({
            nodeId,
            isTaskRunning: false, // 页面刷新后物理任务已不存在
            persistedStatus: "loading", // 但落盘数据残留为 loading
            persistedTaskStatus: "running",
            subStatus: "running",
            hasValidResult: false,
            onHeal: (status) => {
                healedStatus = status;
            },
        });

        expect(result).toBe(true);
        expect(healedStatus).toBe("idle");
    });

    it("reconcileOrphanedClientNodeState: 挂载期孤儿态自愈 - 已有内容/结果时自愈为 success", async () => {
        const nodeId = "test-orphan-success";
        let healedStatus = "";

        const result = await reconcileOrphanedClientNodeState({
            nodeId,
            isTaskRunning: false,
            persistedStatus: "loading",
            persistedTaskStatus: "running",
            subStatus: "running",
            hasValidResult: true, // 已有历史生成结果
            onHeal: (status) => {
                healedStatus = status;
            },
        });

        expect(result).toBe(true);
        expect(healedStatus).toBe("success");
    });

    it("reconcileOrphanedClientNodeState: 正常完成或闲置的节点不触发自愈", async () => {
        const nodeId = "test-normal-idle";
        let healed = false;

        const result = await reconcileOrphanedClientNodeState({
            nodeId,
            isTaskRunning: false,
            persistedStatus: "idle",
            persistedTaskStatus: "idle",
            subStatus: "idle",
            hasValidResult: false,
            onHeal: () => {
                healed = true;
            },
        });

        expect(result).toBe(false);
        expect(healed).toBe(false);
    });

    it("代次隔离 Fencing: 启动新任务自动熔断同节点旧任务，且落后代次无法篡改活跃任务状态", () => {
        const nodeId = "test-fencing-node";
        const oldController = new AbortController();
        const oldTask = startNodeTask(nodeId, "video-reverse", { percent: 10 }, { controller: oldController });
        const oldExecutionId = oldTask.executionId;

        expect(oldController.signal.aborted).toBe(false);
        expect(oldTask.attemptId).toBe(1);

        // 启动同节点新任务（模拟快速连击或切换重跑）
        const newController = new AbortController();
        const newTask = startNodeTask(nodeId, "video-reverse", { percent: 0 }, { controller: newController });
        const newExecutionId = newTask.executionId;

        // 核心断言 1：旧任务的 controller 必须被立即 abort
        expect(oldController.signal.aborted).toBe(true);
        expect(newController.signal.aborted).toBe(false);
        expect(newExecutionId).not.toBe(oldExecutionId);
        expect(newTask.attemptId).toBe(2);

        // 核心断言 2：旧代次试图更新进度，必须被 Fencing 默默丢弃
        updateNodeTaskProgress(nodeId, { percent: 99, message: "旧任务回写" }, "旧文本", oldExecutionId);
        const currentTask = getNodeTask(nodeId);
        expect(currentTask?.progress?.percent).toBe(0);
        expect(currentTask?.streamedText).toBe("");

        // 核心断言 3：旧代次试图完成任务，必须被 Fencing 拒绝
        finishNodeTask(nodeId, oldExecutionId);
        expect(isNodeTaskRunning(nodeId)).toBe(true);
        expect(getNodeTask(nodeId)?.status).toBe("running");

        // 核心断言 4：新代次能够正常更新与完成
        updateNodeTaskProgress(nodeId, { percent: 100, message: "新任务完成" }, "新文本", newExecutionId);
        expect(getNodeTask(nodeId)?.progress?.percent).toBe(100);
        finishNodeTask(nodeId, newExecutionId);
        expect(getNodeTask(nodeId)?.status).toBe("completed");
    });

    it("代次隔离 Fencing: 旧任务被新任务抢占时必须原子触发 onAbortRefund 清算退款", () => {
        const nodeId = "test-fencing-refund-node";
        let refundCalled = false;
        const oldTask = startNodeTask(
            nodeId,
            "video-reverse",
            { percent: 15 },
            {
                onAbortRefund: () => {
                    refundCalled = true;
                },
            }
        );

        expect(refundCalled).toBe(false);

        // 新任务抢占触发熔断
        startNodeTask(nodeId, "video-reverse", { percent: 0 });

        expect(refundCalled).toBe(true);
    });

    it("cancelAllNodeTasks: 画布离开或批量销毁时全局熔断并退款", async () => {
        const node1 = "test-all-cancel-1";
        const node2 = "test-all-cancel-2";
        let refund1 = false;
        let refund2 = false;

        startNodeTask(node1, "video-reverse", { percent: 10 }, {
            onAbortRefund: () => { refund1 = true; },
        });
        startNodeTask(node2, "material-analysis", { percent: 20 }, {
            onAbortRefund: () => { refund2 = true; },
        });

        expect(isNodeTaskRunning(node1)).toBe(true);
        expect(isNodeTaskRunning(node2)).toBe(true);

        await cancelAllNodeTasks("测试全局熔断");

        expect(isNodeTaskRunning(node1)).toBe(false);
        expect(isNodeTaskRunning(node2)).toBe(false);
        expect(refund1).toBe(true);
        expect(refund2).toBe(true);
    });

    it("finishNodeTask: 任务完成时触发完成状态通知，且订阅者正确接收终态变更", () => {
        const nodeId = "test-finish-notification-node";
        startNodeTask(nodeId, "video-reverse", { percent: 50, message: "反推中" });
        updateNodeTaskStreamedText(nodeId, "实时文本输出");

        let lastSeenTask: any = undefined;
        const unsubscribe = subscribeNodeTask(nodeId, (t) => {
            lastSeenTask = t;
        });

        finishNodeTask(nodeId);

        expect(lastSeenTask).toBeDefined();
        expect(lastSeenTask?.status).toBe("completed");

        unsubscribe();
    });
});
