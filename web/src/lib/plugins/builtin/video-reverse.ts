import { registerPlugin } from "@/lib/plugins/plugin-registry";
import type { PluginManifest, RegisteredPlugin } from "@/lib/plugins/plugin-types";
import { VIDEO_REVERSE_NODE_TYPE, VIDEO_REVERSE_PLUGIN_ID } from "@/extensions/opc-infinite/services/video-reverse-contracts";

const manifest: PluginManifest = {
    apiVersion: "zhiying.plugin/v1",
    id: VIDEO_REVERSE_PLUGIN_ID,
    name: "视频反推",
    version: "1.0.0",
    description: "基于浏览器本地硬件抽帧与多模态视觉大模型，对参考视频进行工业级逐秒分镜拆解、镜头运镜分析与台词复刻。",
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
                id: VIDEO_REVERSE_NODE_TYPE,
                label: "视频反推",
                defaultTitle: "视频反推",
                defaultSize: { width: 690, height: 540 },
                schema: { type: "object", properties: { videoReverse: { type: "object" } } },
                renderer: "declarative",
            },
        ],
    },
};

export const videoReversePlugin: RegisteredPlugin = { manifest };

registerPlugin(videoReversePlugin);
