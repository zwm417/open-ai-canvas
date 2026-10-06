// @opc-feature: depth-video [start]
// 深度视频工具定义：经工具注册表追加注册，挂载在视频节点 primary 工具栏
// 原「字幕」位置（字幕已移入「更多」菜单）。纯浏览器环境由能力快照隐藏入口。

import { Mountain } from "lucide-react";

import { registerToolbarTools, type ToolContext, type ToolDefinition } from "@/lib/canvas/tool-registry";
import { CanvasNodeType } from "@/types/canvas";

import { getDepthVideoCapability } from "./capability-store";
import { isDepthJobActive } from "./job-registry";

function hasMediaPayload(ctx: ToolContext) {
    return Boolean(ctx.nodeMetadata?.content || ctx.nodeMetadata?.storageKey || ctx.nodeMetadata?.previewContent);
}

const depthVideoTool: ToolDefinition = {
    id: "depthVideo",
    toolbar: "node-hover",
    category: "node-state",
    label: (ctx) => (ctx.nodeMetadata?.depthSourceNodeId ? "重新生成深度视频" : "生成本地深度动作参考视频"),
    displayLabel: "深度视频",
    icon: <Mountain className="size-3.5" />,
    defaultVisible: true,
    defaultOrder: 46,
    nodeToolbar: { group: "primary", order: 20, description: "本机生成近白远黑的深度参考视频；仅支持 15 秒以内的视频" },
    applicable: (ctx) => ctx.node?.type === CanvasNodeType.Video && hasMediaPayload(ctx) && ctx.workspaceMode !== "simple" && getDepthVideoCapability().supported,
    disabled: (ctx) => ctx.trimmingVideo || ctx.extractingAudio || Boolean(ctx.nodeMetadata?.depthSourceNodeId && ctx.nodeMetadata?.status === "loading") || isDepthJobActive(ctx.node?.id || ""),
    run: (ctx) => ctx.handlers.onNodeDepthVideo(ctx.node!),
};

registerToolbarTools([depthVideoTool]);
// @opc-feature: depth-video [end]
