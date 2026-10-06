// @opc-feature: depth-video [start]
// 深度视频执行 Hook：桌面桥接驱动的本机推理状态机。
// 提交（占位节点+连线即时上屏）→ 顶部进度条（media-lab 本地长任务既有交互惯例）
// → 完成回填（产物经既有 uploadMediaFile 幂等上传回云端资源库）→ 失败重试 → 刷新重连恢复。
// 高频进度事件只驱动顶部进度条与局部状态，不触碰全局画布 store（节流铁律）。

import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { App } from "antd";
import { nanoid } from "nanoid";

import { NODE_DEFAULT_SIZE } from "@/constant/canvas";
import { createCanvasNode } from "@/lib/canvas/canvas-project-domain";
import { videoMetadata } from "@/lib/canvas/canvas-generation-task-sync";
import { resolveMediaUrl, uploadMediaFile } from "@/services/file-storage";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";
import type { StartCanvasUploadStatus } from "@/pages/canvas/use-canvas-upload";

import { ensureDepthVideoCapabilityProbe, getDepthVideoCapability } from "./capability-store";
import { getDepthVideoBridge } from "./bridge";
import { markDepthJobActive, markDepthJobSettled } from "./job-registry";
import { DEPTH_TOTAL_STEPS, depthStageStep } from "./stage-steps";

const NODE_STATUS_LOADING = "loading" as const;
const NODE_STATUS_SUCCESS = "success" as const;
const NODE_STATUS_ERROR = "error" as const;
const NODE_STATUS_IDLE = "idle" as const;

const MAX_INPUT_BYTES = 200 * 1024 * 1024;
const MAX_DURATION_MS = 15_500;

type UseDepthVideoOptions = {
    projectId: string;
    domainProjectId?: string;
    nodesRef: { current: CanvasNodeData[] };
    connectionsRef: { current: CanvasConnection[] };
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setHoveredNodeId: Dispatch<SetStateAction<string | null>>;
    setToolbarNodeId: Dispatch<SetStateAction<string | null>>;
    startUploadStatus: StartCanvasUploadStatus;
    persistMediaNodes: (mediaNodes: CanvasNodeData[]) => Promise<Map<string, string>>;
};

type DepthJobContext = {
    sourceNodeId: string;
    childNodeId: string;
};

export function useDepthVideo({
    projectId,
    domainProjectId,
    nodesRef,
    connectionsRef,
    setNodes,
    setConnections,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setHoveredNodeId,
    setToolbarNodeId,
    startUploadStatus,
    persistMediaNodes,
}: UseDepthVideoOptions) {
    const { message } = App.useApp();
    // 通过 ref 持有最新上下文，保证桥接事件订阅只建立一次
    const optionsRef = useRef({ projectId, domainProjectId, persistMediaNodes });
    optionsRef.current = { projectId, domainProjectId, persistMediaNodes };
    const jobContextsRef = useRef(new Map<string, DepthJobContext>());
    const progressHandlesRef = useRef(new Map<string, ReturnType<StartCanvasUploadStatus>>());
    const bufferedEventsRef = useRef(new Map<string, Array<{ stage?: string; progress?: number }>>());
    const recoveryUnsubscribersRef = useRef<Array<() => void>>([]);

    const setChildNodeState = useCallback((childNodeId: string, metadata: CanvasNodeData["metadata"]) => {
        setNodes((current) => current.map((item) => (item.id === childNodeId ? { ...item, metadata } : item)));
    }, [setNodes]);

    // 幂等能力探测（挂载一次；纯浏览器立即降级隐藏入口）
    useEffect(() => {
        void ensureDepthVideoCapabilityProbe();
    }, []);

    // 桥接事件订阅：进度 → 顶部进度条；终态 → 产物回填/失败落账
    useEffect(() => {
        const bridge = getDepthVideoBridge();
        if (!bridge) return;
        const unsubscribe = bridge.onJobEvent((event) => {
            const context = jobContextsRef.current.get(event.jobId);
            if (event.kind === "progress") {
                if (context) {
                    // 占位节点已被用户删除：立即取消本机作业，避免推理白跑
                    if (!nodesRef.current.some((item) => item.id === context.childNodeId)) {
                        void bridge.cancel(event.jobId);
                        return;
                    }
                    progressHandlesRef.current.get(event.jobId)?.update(event.stage || "处理中", depthStageStep(event.stage));
                } else {
                    // start 尚未返回（事件先于 invoke 应答）：缓冲，待映射后回放
                    const buffer = bufferedEventsRef.current.get(event.jobId) || [];
                    buffer.push({ stage: event.stage, progress: event.progress });
                    bufferedEventsRef.current.set(event.jobId, buffer);
                }
                return;
            }
            if (!context) return;
            const handle = progressHandlesRef.current.get(event.jobId);
            jobContextsRef.current.delete(event.jobId);
            progressHandlesRef.current.delete(event.jobId);
            markDepthJobSettled(context.sourceNodeId);
            if (event.kind === "completed") {
                void (async () => {
                    try {
                        const childNode = nodesRef.current.find((item) => item.id === context.childNodeId);
                        if (!childNode) {
                            await bridge.cleanup(event.jobId);
                            handle?.done("源节点已删除，深度任务已取消");
                            return;
                        }
                        handle?.update("上传深度视频", DEPTH_TOTAL_STEPS);
                        const output = await bridge.readOutput(event.jobId);
                        const uploaded = await uploadMediaFile(new Blob([output.buffer], { type: "video/mp4" }), "video");
                        const finalNode: CanvasNodeData = {
                            ...childNode,
                            metadata: {
                                ...videoMetadata(uploaded),
                                depthSourceNodeId: childNode.metadata?.depthSourceNodeId,
                                depthDevice: output.meta.device,
                                prompt: childNode.metadata?.prompt,
                                status: NODE_STATUS_SUCCESS,
                            },
                        };
                        setNodes((current) => current.map((item) => (item.id === context.childNodeId ? finalNode : item)));
                        await optionsRef.current.persistMediaNodes([finalNode]);
                        handle?.done("深度视频已生成");
                        await bridge.cleanup(event.jobId);
                    } catch (error) {
                        const details = error instanceof Error ? error.message : "深度视频回填失败";
                        handle?.fail(details);
                        message.error(details);
                        setChildNodeState(context.childNodeId, { ...nodesRef.current.find((item) => item.id === context.childNodeId)?.metadata, status: NODE_STATUS_ERROR, errorDetails: details });
                        await bridge.cleanup(event.jobId).catch(() => undefined);
                    }
                })();
                return;
            }
            if (event.kind === "failed") {
                const details = event.error || "深度推理失败";
                handle?.fail(details);
                message.error(details);
                setChildNodeState(context.childNodeId, { ...nodesRef.current.find((item) => item.id === context.childNodeId)?.metadata, status: NODE_STATUS_ERROR, errorDetails: details });
                void bridge.cleanup(event.jobId).catch(() => undefined);
                return;
            }
            // cancelled
            handle?.done("深度任务已取消");
            setChildNodeState(context.childNodeId, { ...nodesRef.current.find((item) => item.id === context.childNodeId)?.metadata, status: NODE_STATUS_IDLE });
            void bridge.cleanup(event.jobId).catch(() => undefined);
        });
        return unsubscribe;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [message, nodesRef, setChildNodeState, setNodes]);

    // 刷新重连恢复：挂载后等待画布节点水化，扫描未完成的深度占位节点
    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const attempt = () => {
            if (cancelled) return;
            const nodes = nodesRef.current;
            if (!nodes.length) {
                timer = setTimeout(attempt, 500);
                return;
            }
            const pendingDepthNodes = nodes.filter((item) => item.metadata?.depthSourceNodeId && item.metadata?.status === NODE_STATUS_LOADING);
            if (!pendingDepthNodes.length) return;
            void (async () => {
                const bridge = getDepthVideoBridge();
                if (!bridge) return;
                let active: Array<{ jobId: string }> = [];
                try {
                    active = await bridge.listActive();
                } catch {
                    return;
                }
                if (cancelled) return;
                const activeIds = new Set(active.map((item) => item.jobId));
                for (const node of pendingDepthNodes) {
                    // 无 jobId（提交与落账之间刷新）：无法重连，按会话中断落账
                    if (!node.metadata?.depthJobId) {
                        setNodes((current) => current.map((item) => (
                            item.id === node.id
                                ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: "本机深度组件会话已中断，请重新生成" } }
                                : item
                        )));
                        continue;
                    }
                    const jobId = String(node.metadata?.depthJobId);
                    const sourceNodeId = String(node.metadata?.depthSourceNodeId);
                    if (activeIds.has(jobId)) {
                        // 页面刷新后作业仍在跑：重建进度条并补挂上下文
                        jobContextsRef.current.set(jobId, { sourceNodeId, childNodeId: node.id });
                        markDepthJobActive(sourceNodeId, jobId);
                        const handle = startUploadStatus("深度视频", "分析视频", DEPTH_TOTAL_STEPS);
                        progressHandlesRef.current.set(jobId, handle);
                        const buffered = bufferedEventsRef.current.get(jobId);
                        bufferedEventsRef.current.delete(jobId);
                        recoveryUnsubscribersRef.current.push(bridge.onProgress((event) => {
                            if (event.jobId !== jobId) return;
                            handle.update(event.stage || "处理中", depthStageStep(event.stage));
                        }));
                        for (const bufferedEvent of buffered || []) {
                            handle.update(bufferedEvent.stage || "处理中", depthStageStep(bufferedEvent.stage));
                        }
                    } else {
                        setNodes((current) => current.map((item) => (
                            item.id === node.id
                                ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: "本机深度组件会话已中断，请重新生成" } }
                                : item
                        )));
                    }
                }
            })();
        };
        timer = setTimeout(attempt, 600);
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
            for (const unsubscribe of recoveryUnsubscribersRef.current) {
                try { unsubscribe(); } catch { /* 桥接已销毁时忽略 */ }
            }
            recoveryUnsubscribersRef.current = [];
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodesRef, setNodes, startUploadStatus]);

    const runDepthVideo = useCallback(async (node: CanvasNodeData) => {
        const bridge = getDepthVideoBridge();
        const capability = getDepthVideoCapability();
        if (!bridge || !capability.supported) {
            message.warning(capability.reason || "深度视频仅支持智影桌面端，请先安装本机深度组件");
            return;
        }
        // 深度结果节点自身触发 = 失败重试：定位源视频节点，复用同一占位节点
        const isRetryOnDepthNode = Boolean(node.metadata?.depthSourceNodeId);
        const sourceNode = isRetryOnDepthNode
            ? nodesRef.current.find((item) => item.id === node.metadata?.depthSourceNodeId)
            : node;
        const childNode = isRetryOnDepthNode ? node : null;
        const sourceNodeId = sourceNode?.id || "";
        if (!sourceNode) {
            message.error("原始视频已丢失，无法重新生成深度视频");
            return;
        }
        if (!sourceNode.metadata?.content && !sourceNode.metadata?.storageKey) {
            message.warning("视频节点为空，无法生成深度视频");
            return;
        }
        if (sourceNode.metadata?.durationMs && sourceNode.metadata.durationMs > MAX_DURATION_MS) {
            message.warning("深度视频暂只支持 15 秒以内的视频，请先使用「截取片段」缩短");
            return;
        }
        if (childNode && childNode.metadata?.status === NODE_STATUS_LOADING) {
            message.warning("该视频正在进行深度处理");
            return;
        }
        setHoveredNodeId(null);
        setToolbarNodeId(null);

        const progress = startUploadStatus("深度视频", "读取视频资源", DEPTH_TOTAL_STEPS);
        let childNodeId = childNode?.id || "";
        try {
            // 1. 读取源视频字节（命中本地优先缓存则 0 下载）
            const resolved = await resolveMediaUrl(sourceNode.metadata?.storageKey, sourceNode.metadata?.content || "");
            const url = resolved || sourceNode.metadata?.content || "";
            if (!url) throw new Error("无法解析视频资源地址");
            const response = await fetch(url);
            if (!response.ok) throw new Error(`视频资源读取失败（HTTP ${response.status}）`);
            const blob = await response.blob();
            if (blob.size > MAX_INPUT_BYTES) throw new Error("视频体积超过本机处理上限（200MB）");

            // 2. 占位节点 + 连线即时上屏（重试时复用原节点）
            if (childNodeId) {
                setNodes((current) => current.map((item) => (item.id === childNodeId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined } } : item)));
            } else {
                const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Video];
                const created = createCanvasNode(
                    CanvasNodeType.Video,
                    { x: sourceNode.position.x + sourceNode.width + 96 + spec.width / 2, y: sourceNode.position.y + sourceNode.height / 2 },
                    {
                        prompt: `为「${sourceNode.title || "视频"}」生成深度参考视频`,
                        status: NODE_STATUS_LOADING,
                        depthSourceNodeId: sourceNodeId,
                    },
                );
                created.title = `${sourceNode.title || "视频"} · 深度视频`;
                childNodeId = created.id;
                const nextNodes = [...nodesRef.current, created];
                const nextConnections = [...connectionsRef.current, { id: nanoid(), fromNodeId: sourceNodeId, toNodeId: childNodeId }];
                nodesRef.current = nextNodes;
                connectionsRef.current = nextConnections;
                setNodes(nextNodes);
                setConnections(nextConnections);
                setSelectedNodeIds(new Set([childNodeId]));
                setSelectedConnectionId(null);
            }
            progress.update("检查深度组件", 2);

            // 3. 占住防重复闸门后提交；事件先于应答到达时走缓冲回放
            markDepthJobActive(sourceNodeId, "pending");
            const { jobId, queuePosition } = await bridge.start({ video: new Uint8Array(await blob.arrayBuffer()), fileName: `${sourceNodeId}.mp4` });
            markDepthJobActive(sourceNodeId, jobId);
            jobContextsRef.current.set(jobId, { sourceNodeId, childNodeId });
            setNodes((current) => current.map((item) => (item.id === childNodeId ? { ...item, metadata: { ...item.metadata, depthJobId: jobId } } : item)));
            if (queuePosition > 0) {
                progress.update(`排队等待深度组件（第 ${queuePosition} 位）`, 2);
            }
            const buffered = bufferedEventsRef.current.get(jobId);
            bufferedEventsRef.current.delete(jobId);
            progressHandlesRef.current.set(jobId, progress);
            for (const bufferedEvent of buffered || []) {
                progress.update(bufferedEvent.stage || "处理中", depthStageStep(bufferedEvent.stage));
            }
        } catch (error) {
            const details = error instanceof Error ? error.message : "深度视频任务提交失败";
            progress.fail(details);
            message.error(details);
            markDepthJobSettled(sourceNodeId);
            if (childNodeId) {
                setNodes((current) => current.map((item) => (item.id === childNodeId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: details } } : item)));
            }
        }
    }, [connectionsRef, message, nodesRef, setChildNodeState, setConnections, setHoveredNodeId, setSelectedConnectionId, setSelectedNodeIds, setNodes, setToolbarNodeId, startUploadStatus]);

    return useMemo(() => ({ runDepthVideo }), [runDepthVideo]);
}
// @opc-feature: depth-video [end]
