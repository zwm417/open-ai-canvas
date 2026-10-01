import { createContext, useContext } from "react";

import type { CanvasNodeData } from "@/types/canvas";

// 扩展节点（对比/图表/调色等）要读自己的上游才能工作，但节点经 CanvasProjectWorldLayers
// 渲染、CanvasNodeContentProps 里只有 node 本身，没有 nodes/connections。
// 与 canvas-node-action-context 同一个理由：通过 Context 注入，避免改动 world-layers 的透传链。
// 无 Provider 时静默降级为「没有上游」，节点自行显示空状态而不是崩。
export type CanvasNodeGraphContextValue = {
    getUpstreamNodes?: (nodeId: string) => CanvasNodeData[];
    // @opc-feature: canvas-node-graph-downstream-actions [start]
    getDownstreamNodes?: (nodeId: string) => CanvasNodeData[];
    connectNodes?: (fromNodeId: string, toNodeId: string) => void;
    disconnectNodes?: (fromNodeId: string, toNodeId: string) => void;
    hasConnection?: (fromNodeId: string, toNodeId: string) => boolean;
    // @opc-feature: canvas-node-graph-downstream-actions [end]
};

export const CanvasNodeGraphContext = createContext<CanvasNodeGraphContextValue>({});

/** 取该节点的直接上游素材节点；无 Provider 或无上游时返回空数组。 */
export function useUpstreamNodes(nodeId: string) {
    const { getUpstreamNodes } = useContext(CanvasNodeGraphContext);
    return getUpstreamNodes?.(nodeId) ?? [];
}

// @opc-feature: canvas-node-graph-downstream-actions [start]
/** 取该节点的直接下游节点；无 Provider 或无下游时返回空数组。 */
export function useDownstreamNodes(nodeId: string) {
    const { getDownstreamNodes } = useContext(CanvasNodeGraphContext);
    return getDownstreamNodes?.(nodeId) ?? [];
}

/** 供节点对图执行受控连线增删操作。 */
export function useCanvasGraphActions() {
    const { connectNodes, disconnectNodes, hasConnection } = useContext(CanvasNodeGraphContext);
    return { connectNodes, disconnectNodes, hasConnection };
}
// @opc-feature: canvas-node-graph-downstream-actions [end]
