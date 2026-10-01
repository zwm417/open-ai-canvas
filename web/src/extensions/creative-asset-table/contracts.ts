import type { CanvasBatchReferenceColumn } from "@/types/canvas";

export const CREATIVE_ASSET_TABLE_PLUGIN_ID = "creative-asset-table";
export const CREATIVE_ASSET_TABLE_NODE_TYPE = "creative-asset-table:table";

export const CREATIVE_ASSET_TABLE_DEFAULT_SIZE = {
    width: 1560,
    height: 680,
} as const;

export const CREATIVE_ASSET_TABLE_MIN_SIZE = {
    width: 1080,
    height: 240,
} as const;

/**
 * 根据资产任务行数估算创意资产表自适应总高度
 */
export function calculateCreativeAssetTableHeight(rowCount: number): number {
    const headerHeight = 44; // 顶层工具栏
    const promptHeight = 36; // 全局提示词行
    const colHeaderHeight = 40; // 粘性表头
    const rowHeight = 124; // 每行平均高度
    const padding = 20; // 底部留白
    return Math.max(240, headerHeight + promptHeight + colHeaderHeight + Math.max(0, rowCount) * rowHeight + padding);
}

export const CREATIVE_ASSET_REF_COLUMNS: CanvasBatchReferenceColumn[] = [
    { id: "ref-image", label: "参考图插槽" },
];

export const CREATIVE_ASSET_TEXT_COLUMNS = [
    { id: "col-slot-name", label: "资产名称与分类", type: "text" as const },
    { id: "col-visual-desc", label: "视觉外观特征", type: "text" as const },
];
