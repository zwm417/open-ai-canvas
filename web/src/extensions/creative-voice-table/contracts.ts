import type { CanvasBatchReferenceColumn } from "@/types/canvas";

export const CREATIVE_VOICE_TABLE_PLUGIN_ID = "creative-voice-table";
export const CREATIVE_VOICE_TABLE_NODE_TYPE = "creative-voice-table:table";

export const CREATIVE_VOICE_TABLE_DEFAULT_SIZE = {
    width: 1560,
    height: 680,
} as const;

export const CREATIVE_VOICE_TABLE_MIN_SIZE = {
    width: 1080,
    height: 240,
} as const;

/**
 * 将时间字符串格式化为单框内换行展示：
 * 第一行：起止区间（如 "00:03 - 00:06"）
 * 第二行：时长标记（如 "(3s)"）
 */
export function formatVoiceTimeDisplay(val?: string): string {
    if (!val) return "";
    const trimmed = val.trim();
    if (!trimmed) return "";
    if (trimmed.includes("\n")) return trimmed;
    // 匹配如 "00:03 - 00:06 (3s)", "0:03-0:06 （3s）", "00:03 ~ 00:06 (3.5秒)"
    const matchWithParen = trimmed.match(/^((?:\d{1,2}:)?\d{1,2}:\d{2}\s*[-~至到]\s*(?:\d{1,2}:)?\d{1,2}:\d{2})\s*([（(][^）)]+[)）])$/);
    if (matchWithParen) {
        const timePart = matchWithParen[1].trim();
        const durationPart = matchWithParen[2].trim().replace(/^（/, "(").replace(/）$/, ")");
        return `${timePart}\n${durationPart}`;
    }
    // 匹配如 "00:03 - 00:06 3s", "0:03-0:06 3秒"
    const matchWithoutParen = trimmed.match(/^((?:\d{1,2}:)?\d{1,2}:\d{2}\s*[-~至到]\s*(?:\d{1,2}:)?\d{1,2}:\d{2})\s+(\d+(?:\.\d+)?\s*(?:s|秒))$/i);
    if (matchWithoutParen) {
        const timePart = matchWithoutParen[1].trim();
        const durationPart = matchWithoutParen[2].trim().replace(/秒$/i, "s");
        return `${timePart}\n(${durationPart})`;
    }
    return trimmed;
}

/**
 * 根据分镜行数估算创意配音多维表格自适应总高度
 */
export function calculateCreativeVoiceTableHeight(rowCount: number): number {
    const headerHeight = 48; // 表头工具栏
    const colHeaderHeight = 40; // 粘性表头
    const rowHeight = 116; // 每行平均高度
    const padding = 20; // 底部留白缓冲
    return Math.max(240, headerHeight + colHeaderHeight + Math.max(0, rowCount) * rowHeight + padding);
}

export const CREATIVE_VOICE_REF_COLUMNS: CanvasBatchReferenceColumn[] = [
    { id: "ref-voice", label: "参考音色" },
    { id: "ref-tone", label: "参考情绪" },
];

export const CREATIVE_VOICE_TEXT_COLUMNS = [
    { id: "col-time", label: "起止与时长", type: "text" as const },
    { id: "col-speaker-tone", label: "说话人与情绪", type: "text" as const },
    { id: "col-lines", label: "原文台词", type: "text" as const },
    { id: "col-rewrite", label: "改写文案", type: "text" as const },
];

export type VoiceSlotMode = "all" | "individual";

export interface CreativeVoiceTableMetadata {
    voiceSlotMode?: VoiceSlotMode;
    globalVoiceNodeId?: string;
    concurrency?: number;
}
