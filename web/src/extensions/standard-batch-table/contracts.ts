export const STANDARD_BATCH_TABLE_PLUGIN_ID = "standard-batch-table";
export const STANDARD_BATCH_TABLE_NODE_TYPE = "standard-batch-table:table";

export const STANDARD_BATCH_TABLE_DEFAULT_SIZE = {
    width: 1480,
    height: 640,
} as const;

export const STANDARD_BATCH_TABLE_MIN_SIZE = {
    width: 1080,
    height: 240,
} as const;

/**
 * 根据任务行数计算标准多维表格自适应总高度
 */
export function calculateStandardBatchTableHeight(rowCount: number): number {
    const headerHeight = 44; // 顶层工具栏
    const promptHeight = 36; // 全局提示词行
    const colHeaderHeight = 40; // 粘性表头
    const rowHeight = 124; // 每行平均高度
    const padding = 20; // 底部留白
    return Math.max(240, headerHeight + promptHeight + colHeaderHeight + Math.max(0, rowCount) * rowHeight + padding);
}
