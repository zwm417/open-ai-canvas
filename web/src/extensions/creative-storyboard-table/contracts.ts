import type { CanvasBatchReferenceColumn } from "@/types/canvas";

export const CREATIVE_STORYBOARD_TABLE_PLUGIN_ID = "creative-storyboard-table";
export const CREATIVE_STORYBOARD_TABLE_NODE_TYPE = "creative-storyboard-table:table";

export const CREATIVE_STORYBOARD_TABLE_DEFAULT_SIZE = {
    width: 1680,
    height: 720,
} as const;

export const CREATIVE_STORYBOARD_TABLE_MIN_SIZE = {
    width: 1080,
    height: 240,
} as const;

/**
 * 根据分镜任务行数估算创意分镜表自适应总高度
 */
export function calculateCreativeStoryboardTableHeight(rowCount: number): number {
    const headerHeight = 44; // 顶层工具栏
    const promptHeight = 36; // 全局提示词行
    const colHeaderHeight = 40; // 粘性表头
    const rowHeight = 135; // 每行平均高度
    const padding = 20; // 底部留白
    return Math.max(240, headerHeight + promptHeight + colHeaderHeight + Math.max(0, rowCount) * rowHeight + padding);
}

export const CREATIVE_STORYBOARD_REF_COLUMNS: CanvasBatchReferenceColumn[] = [
    { id: "ref-script", label: "参考脚本" },
    { id: "ref-master-slots", label: "创意资产" },
    { id: "ref-voiceover", label: "创意配音" },
];

export const CREATIVE_STORYBOARD_TEXT_COLUMNS = [
    { id: "col-time", label: "时间与镜头形态", type: "text" as const },
    { id: "col-image-prompt", label: "首帧提示词", type: "text" as const },
];
