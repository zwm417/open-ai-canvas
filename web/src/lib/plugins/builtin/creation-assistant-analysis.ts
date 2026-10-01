import { registerPlugin } from "@/lib/plugins/plugin-registry";
import type { PluginManifest, RegisteredPlugin } from "@/lib/plugins/plugin-types";
import {
    CREATION_ASSISTANT_ANALYSIS_NODE_TYPE,
    CREATION_ASSISTANT_ANALYSIS_PLUGIN_ID,
} from "@/extensions/opc-infinite/services/creation-assistant-contracts";

const manifest: PluginManifest = {
    apiVersion: "zhiying.plugin/v1",
    id: CREATION_ASSISTANT_ANALYSIS_PLUGIN_ID,
    name: "素材分析",
    version: "1.0.0",
    description: "多模态素材分析中枢：支持多图、多视频、多音频的批量特征提取、一句话总结与 7 大商品核心洞察构建。",
    author: "opc-Copilot",
    surfaces: ["node"],
    permissions: [
        "canvas.read",
        "canvas.write",
        "media.read",
        "ai.text",
    ],
    trusted: true,
    runtime: { backend: "trusted-backend", web: "declarative" },
    contributes: {
        canvasNodes: [
            {
                id: CREATION_ASSISTANT_ANALYSIS_NODE_TYPE,
                label: "素材分析",
                defaultTitle: "素材分析",
                defaultSize: { width: 690, height: 540 },
                schema: { type: "object", properties: { materialAnalysis: { type: "object" } } },
                renderer: "declarative",
            },
        ],
    },
};

export const creationAssistantAnalysisPlugin: RegisteredPlugin = { manifest };

registerPlugin(creationAssistantAnalysisPlugin);
