import { registerPlugin } from "@/lib/plugins/plugin-registry";
import type { PluginManifest, RegisteredPlugin } from "@/lib/plugins/plugin-types";
import {
    STANDARD_BATCH_TABLE_DEFAULT_SIZE,
    STANDARD_BATCH_TABLE_MIN_SIZE,
    STANDARD_BATCH_TABLE_NODE_TYPE,
    STANDARD_BATCH_TABLE_PLUGIN_ID,
} from "./contracts";

const manifest: PluginManifest = {
    apiVersion: "zhiying.plugin/v1",
    id: STANDARD_BATCH_TABLE_PLUGIN_ID,
    name: "批量创作表",
    version: "1.0.0",
    description: "标准批量创作表基准节点，基于上游纯净能力，提供排队列多任务批量生图、全局参数协同、拖拽交换与素材悬浮复制/删除管理。",
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
                id: STANDARD_BATCH_TABLE_NODE_TYPE,
                label: "批量创作表",
                defaultTitle: "批量创作表",
                defaultSize: STANDARD_BATCH_TABLE_DEFAULT_SIZE,
                minSize: STANDARD_BATCH_TABLE_MIN_SIZE,
                schema: {
                    type: "object",
                    properties: {
                        batchTable: {
                            type: "object",
                            properties: {
                                operation: { type: "string" },
                                concurrency: { type: "number" },
                                rows: { type: "array" },
                            },
                        },
                    },
                },
                defaultMetadata: {
                    batchTable: {
                        operation: "creative",
                        concurrency: 10,
                        rows: [],
                    },
                },
                renderer: "declarative",
                acceptsInputKind: "image",
            },
        ],
    },
};

export const standardBatchTablePlugin: RegisteredPlugin = { manifest };

registerPlugin(standardBatchTablePlugin);
