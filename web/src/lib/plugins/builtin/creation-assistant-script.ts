import { registerPlugin } from "@/lib/plugins/plugin-registry";
import type { PluginManifest, RegisteredPlugin } from "@/lib/plugins/plugin-types";
import {
    CREATION_ASSISTANT_SCRIPT_NODE_TYPE,
    CREATION_ASSISTANT_SCRIPT_PLUGIN_ID,
} from "@/extensions/opc-infinite/services/creation-assistant-contracts";

const manifest: PluginManifest = {
    apiVersion: "zhiying.plugin/v1",
    id: CREATION_ASSISTANT_SCRIPT_PLUGIN_ID,
    name: "配置生成脚本",
    version: "1.0.0",
    description: "短视频分镜提示词生成节点：结合素材分析洞察与视频模型能力，按场景、风格、平台智能生成分段视频提示词。",
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
                id: CREATION_ASSISTANT_SCRIPT_NODE_TYPE,
                label: "配置生成脚本",
                defaultTitle: "配置生成脚本",
                defaultSize: { width: 690, height: 540 },
                schema: { type: "object", properties: { configScript: { type: "object" } } },
                renderer: "declarative",
            },
        ],
    },
};

export const creationAssistantScriptPlugin: RegisteredPlugin = { manifest };

registerPlugin(creationAssistantScriptPlugin);
