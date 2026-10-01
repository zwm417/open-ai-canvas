import type { CanvasNodeData } from "@/types/canvas";
import { VIDEO_REVERSE_NODE_TYPE, type ReverseMeta } from "./video-reverse-contracts";
import {
    CREATION_ASSISTANT_ANALYSIS_NODE_TYPE,
    CREATION_ASSISTANT_SCRIPT_NODE_TYPE,
    CREATION_ASSISTANT_REF_SCRIPT_NODE_TYPE,
    type MaterialAnalysisMeta,
    type ConfigScriptMeta,
    type RefScriptMeta,
} from "./creation-assistant-contracts";

export type CustomNodeSummary = {
    kind: "video_reverse" | "material_analysis" | "config_script" | "ref_script";
    title: string;
    text: string;
    details?: Record<string, unknown>;
};

function previewText(str: unknown, maxLen = 300): string {
    if (typeof str !== "string" || !str.trim()) return "";
    const clean = str.trim();
    return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;
}

/**
 * 提取二次开发算子的高价值业务上下文投影。
 * 保持在 200~400 字符紧凑结构内，防止撑爆 Agent 上下文，同时保证 Agent 能准确理解分析与剧本结论。
 */
export function extractCustomNodeSummary(node: CanvasNodeData): CustomNodeSummary | undefined {
    if (!node || !node.type) return undefined;

    // 1. 视频反推算子
    if (node.type === VIDEO_REVERSE_NODE_TYPE) {
        const meta = (node.metadata?.videoReverse || {}) as ReverseMeta;
        const promptText = meta.prompt || meta.result?.prompt || node.metadata?.content || node.metadata?.prompt || "";
        if (!promptText && meta.status !== "success") {
            return {
                kind: "video_reverse",
                title: node.title || "视频反推",
                text: `[视频反推待执行] 状态: ${meta.status || "idle"}`,
            };
        }
        const shotInfo = meta.result?.submittedGridCount ? `，抽帧切片: ${meta.result.submittedGridCount}组` : "";
        const durationInfo = meta.result?.durationSec ? `，时长: ${Math.round(meta.result.durationSec)}秒` : "";
        return {
            kind: "video_reverse",
            title: node.title || "视频反推",
            text: `【视频反推分镜${durationInfo}${shotInfo}】\n${previewText(promptText, 350)}`,
            details: {
                durationSec: meta.result?.durationSec,
                frameCount: meta.result?.frameCount,
                notes: meta.result?.notes,
            },
        };
    }

    // 2. 素材分析算子
    if (node.type === CREATION_ASSISTANT_ANALYSIS_NODE_TYPE) {
        const meta = (node.metadata?.materialAnalysis || {}) as MaterialAnalysisMeta;
        const insights = meta.result?.insightSections || [];
        const summaries = meta.result?.fileSummaries || [];
        if (!insights.length && !summaries.length && meta.status !== "success") {
            return {
                kind: "material_analysis",
                title: node.title || "素材分析",
                text: `[素材分析待执行] 状态: ${meta.status || "idle"}`,
            };
        }

        const insightLines = insights
            .slice(0, 5)
            .map((item) => {
                const itemTexts = (item.items || []).map((it) => it.text).filter(Boolean).slice(0, 2).join("; ");
                return `${item.title}: ${previewText(itemTexts, 60)}`;
            })
            .join("\n");
        const summaryText = `【素材分析结论】已分析 ${summaries.length} 个素材，提炼核心商业洞察：\n${insightLines || previewText(node.metadata?.content, 300)}`;

        return {
            kind: "material_analysis",
            title: node.title || "素材分析",
            text: summaryText,
            details: {
                fileCount: summaries.length,
                insights: insights.map((i) => ({ title: i.title, itemsCount: (i.items || []).length })),
            },
        };
    }

    // 3. 配置生成脚本算子
    if (node.type === CREATION_ASSISTANT_SCRIPT_NODE_TYPE) {
        const meta = (node.metadata?.configScript || {}) as ConfigScriptMeta;
        const scriptText = meta.result?.script || meta.prompt || node.metadata?.content || node.metadata?.prompt || "";
        if (!scriptText && meta.status !== "success") {
            return {
                kind: "config_script",
                title: node.title || "配置生成脚本",
                text: `[配置脚本待生成] 预设: ${meta.businessScenario || "ecommerce"} / ${meta.scriptType || "smart"} (${meta.durationSec || 30}s)`,
            };
        }
        return {
            kind: "config_script",
            title: node.title || "配置生成脚本",
            text: `【配置成片剧本】(时长: ${meta.durationSec || 30}s, 类型: ${meta.scriptType || "smart"}, 风格: ${meta.shootingStyle || "smart"})\n${previewText(scriptText, 350)}`,
            details: {
                durationSec: meta.durationSec,
                scriptType: meta.scriptType,
                shootingStyle: meta.shootingStyle,
                platform: meta.primaryPlatform,
            },
        };
    }

    // 4. 参考生脚本算子
    if (node.type === CREATION_ASSISTANT_REF_SCRIPT_NODE_TYPE) {
        const meta = (node.metadata?.refScript || {}) as RefScriptMeta;
        const scriptText = meta.result?.script || meta.prompt || node.metadata?.content || node.metadata?.prompt || "";
        if (!scriptText && meta.status !== "success") {
            return {
                kind: "ref_script",
                title: node.title || "参考生脚本",
                text: `[参考脚本待生成] 目标时长: ${meta.durationSec || 30}s`,
            };
        }
        return {
            kind: "ref_script",
            title: node.title || "参考生脚本",
            text: `【参考复刻剧本】(目标时长: ${meta.durationSec || 30}s)\n${previewText(scriptText, 350)}`,
            details: {
                durationSec: meta.durationSec,
                notes: meta.additionalNotes,
            },
        };
    }

    return undefined;
}
