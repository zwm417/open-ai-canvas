import { registerPlugin } from "@/lib/plugins/plugin-registry";
import type { PluginManifest, RegisteredPlugin } from "@/lib/plugins/plugin-types";
import {
    CREATION_ASSISTANT_REF_SCRIPT_NODE_TYPE,
    CREATION_ASSISTANT_REF_SCRIPT_PLUGIN_ID,
} from "@/extensions/opc-infinite/services/creation-assistant-contracts";

const manifest: PluginManifest = {
    apiVersion: "zhiying.plugin/v1",
    id: CREATION_ASSISTANT_REF_SCRIPT_PLUGIN_ID,
    name: "参考生脚本",
    version: "1.0.0",
    description: "参考视频生成提示词节点：结合爆款参考视频结构与素材洞察，智能替换生成视频提示词。",
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
                id: CREATION_ASSISTANT_REF_SCRIPT_NODE_TYPE,
                label: "参考生脚本",
                defaultTitle: "参考生脚本",
                defaultSize: { width: 690, height: 540 },
                schema: { type: "object", properties: { refScript: { type: "object" } } },
                renderer: "declarative",
            },
        ],
    },
};

export const creationAssistantRefScriptPlugin: RegisteredPlugin = { manifest };

registerPlugin(creationAssistantRefScriptPlugin);
