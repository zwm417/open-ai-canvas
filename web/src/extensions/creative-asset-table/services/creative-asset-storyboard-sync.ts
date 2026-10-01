import { nanoid } from "nanoid";
import type { CanvasBatchRow, CanvasBatchTableData, CanvasConnection, CanvasNodeData } from "@/types/canvas";

export function syncMasterTableRowsToStoryboard({
    masterNode,
    storyboardNode,
    nodes,
    connections,
}: {
    masterNode: CanvasNodeData;
    storyboardNode: CanvasNodeData;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
}): {
    updatedStoryboardNode: CanvasNodeData;
    newConnections: CanvasConnection[];
} {
    const masterTable = masterNode.metadata?.batchTable as CanvasBatchTableData | undefined;
    const storyboardTable = storyboardNode.metadata?.batchTable as CanvasBatchTableData | undefined;

    if (!masterTable?.rows?.length || !storyboardTable?.rows?.length) {
        return { updatedStoryboardNode: storyboardNode, newConnections: connections };
    }

    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const masterColumnIndex = storyboardTable.referenceColumns?.findIndex(
        (c) => c.id === "ref-master-slots" || c.label?.includes("创意资产") || c.label?.includes("母版"),
    ) ?? -1;

    if (masterColumnIndex === -1) {
        return { updatedStoryboardNode: storyboardNode, newConnections: connections };
    }

    const masterRows = masterTable.rows;

    const nextStoryboardRows: CanvasBatchRow[] = storyboardTable.rows.map((sRow) => {
        const cells = { ...(sRow.cells || {}) };
        const targetEntityId = cells["col-asset-target"] || "";
        let targetEntityIds: string[] = [];
        try {
            if (cells["col-asset-targets"]) {
                targetEntityIds = JSON.parse(cells["col-asset-targets"]);
            }
        } catch {
            targetEntityIds = [];
        }

        // 查找此分镜对应的创意资产行
        let matchedMasterRow: CanvasBatchRow | undefined;
        if (targetEntityId) {
            matchedMasterRow = masterRows.find(
                (r) => r.cells?.["col-slot-id"] === targetEntityId || r.id === targetEntityId || r.id?.includes(targetEntityId) || r.cells?.["col-slot-name"]?.includes(targetEntityId),
            );
        }
        if (!matchedMasterRow && targetEntityIds.length > 0) {
            for (const tid of targetEntityIds) {
                matchedMasterRow = masterRows.find(
                    (r) => r.cells?.["col-slot-id"] === tid || r.id === tid || r.id?.includes(tid) || r.cells?.["col-slot-name"]?.includes(tid),
                );
                if (matchedMasterRow) break;
            }
        }
        if (!matchedMasterRow) {
            matchedMasterRow = masterRows.find((mRow) => {
                const name = mRow.cells?.["col-slot-name"] || "";
                return (
                    (targetEntityId?.includes("product") && name.includes("商品")) ||
                    (targetEntityId?.includes("scene") && name.includes("场景")) ||
                    (targetEntityId?.includes("actor") && name.includes("人物"))
                );
            });
        }
        if (!matchedMasterRow) {
            matchedMasterRow = masterRows[0];
        }

        // 核心替换规则：
        // 1. 若创意资产表生成了新资产（outputNodeId 存在且有效），优先使用新生成的资产素材
        // 2. 若用户只上传了参考素材（inputNodeIds[0] 存在且有效），使用原参考素材
        // 3. 若用户没有上传素材，保持空白插槽（保留分镜行上手动配置的插槽或置空）
        const generatedAssetNode = matchedMasterRow?.outputNodeId ? nodeById.get(matchedMasterRow.outputNodeId) : undefined;
        const refAssetNode = matchedMasterRow?.inputNodeIds?.[0] ? nodeById.get(matchedMasterRow.inputNodeIds[0]) : undefined;

        let effectiveNodeId = "";
        if (generatedAssetNode && (generatedAssetNode.metadata?.content || generatedAssetNode.metadata?.storageKey || generatedAssetNode.metadata?.previewContent)) {
            effectiveNodeId = generatedAssetNode.id;
        } else if (refAssetNode && (refAssetNode.metadata?.content || refAssetNode.metadata?.storageKey || refAssetNode.metadata?.previewContent)) {
            effectiveNodeId = refAssetNode.id;
        } else {
            effectiveNodeId = sRow.inputNodeIds?.[masterColumnIndex] || "";
        }

        const nextInputNodeIds = [...(sRow.inputNodeIds || [])];
        while (nextInputNodeIds.length <= masterColumnIndex) nextInputNodeIds.push("");
        nextInputNodeIds[masterColumnIndex] = effectiveNodeId;

        return {
            ...sRow,
            inputNodeIds: nextInputNodeIds,
            cells,
        };
    });

    const updatedStoryboardNode: CanvasNodeData = {
        ...storyboardNode,
        metadata: {
            ...storyboardNode.metadata,
            batchTable: {
                ...storyboardTable,
                rows: nextStoryboardRows,
            },
        },
    };

    // 同步生成的新资产图片节点到分镜总装表的拓扑连接
    const targetConns = [...connections];
    const existingConnKeys = new Set(targetConns.map((c) => `${c.fromNodeId}->${c.toNodeId}:${c.toHandleId || ""}`));

    masterRows.forEach((mRow) => {
        if (mRow.outputNodeId && nodeById.has(mRow.outputNodeId)) {
            const key = `${mRow.outputNodeId}->${storyboardNode.id}:batch-reference:ref-master-slots`;
            if (!existingConnKeys.has(key)) {
                targetConns.push({
                    id: `conn-asset-output-${nanoid()}`,
                    fromNodeId: mRow.outputNodeId,
                    fromHandleId: "output",
                    toNodeId: storyboardNode.id,
                    toHandleId: "batch-reference:ref-master-slots",
                    relation: "batch-input",
                });
                existingConnKeys.add(key);
            }
        }
    });

    return {
        updatedStoryboardNode,
        newConnections: targetConns,
    };
}
