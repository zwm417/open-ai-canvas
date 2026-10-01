import { registerPlugin } from "@/lib/plugins/plugin-registry";
import type { PluginManifest, RegisteredPlugin } from "@/lib/plugins/plugin-types";
import {
    CREATIVE_ASSET_REF_COLUMNS,
    CREATIVE_ASSET_TABLE_DEFAULT_SIZE,
    CREATIVE_ASSET_TABLE_MIN_SIZE,
    CREATIVE_ASSET_TABLE_NODE_TYPE,
    CREATIVE_ASSET_TABLE_PLUGIN_ID,
    CREATIVE_ASSET_TEXT_COLUMNS,
} from "./contracts";

const manifest: PluginManifest = {
    apiVersion: "zhiying.plugin/v1",
    id: CREATIVE_ASSET_TABLE_PLUGIN_ID,
    name: "创意资产表",
    version: "1.0.0",
    description: "专业创意资产表节点，提供人物、商品、场景等多类核心母版资产管理、多视角转化与图生图/文生图批量生产。",
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
                id: CREATIVE_ASSET_TABLE_NODE_TYPE,
                label: "创意资产表",
                defaultTitle: "创意资产表",
                defaultSize: CREATIVE_ASSET_TABLE_DEFAULT_SIZE,
                minSize: CREATIVE_ASSET_TABLE_MIN_SIZE,
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
                        concurrency: 6,
                        contentKind: "master-slots",
                        referenceColumns: CREATIVE_ASSET_REF_COLUMNS,
                        textColumns: CREATIVE_ASSET_TEXT_COLUMNS,
                        rows: [
                            {
                                id: "master-row-actor",
                                enabled: true,
                                inputNodeIds: [],
                                prompt: "A Chinese girl in her mid-twenties, exceptionally beautiful, four-view character turnaround (front view, side view, three-quarter view, back view), neutral gray background, ultra-realistic portrait, cinematic studio lighting, detailed hair and facial features, 8k resolution",
                                cells: {
                                    "col-slot-id": "actor",
                                    "col-asset-name": "出镜主角",
                                    "col-category": "actor",
                                    "col-prompt-anchor": "A Chinese girl in her mid-twenties, exceptionally beautiful, four-view turnaround (front, side, three-quarter, back), cinematic studio lighting",
                                    "col-ratio": "3:4",
                                },
                            },
                            {
                                id: "master-row-product",
                                enabled: true,
                                inputNodeIds: [],
                                prompt: "Commercial advertising product photography, multi-angle product showcase with rich macro details and realistic surface textures, on a clean pure white background, studio lighting, sharp focus, 8k resolution",
                                cells: {
                                    "col-slot-id": "product",
                                    "col-asset-name": "核心商品",
                                    "col-category": "product",
                                    "col-prompt-anchor": "Commercial product photography on pure white background, multi-angle view with rich macro details",
                                    "col-ratio": "1:1",
                                },
                            },
                            {
                                id: "master-row-scene",
                                enabled: true,
                                inputNodeIds: [],
                                prompt: "Modern minimalist interior living space with natural warm window sunlight, high-end architectural aesthetics, photorealistic depth of field, cinematic atmosphere, 8k resolution",
                                cells: {
                                    "col-slot-id": "scene",
                                    "col-asset-name": "主体场景",
                                    "col-category": "scene",
                                    "col-prompt-anchor": "Modern minimalist interior living space with natural warm window sunlight, cinematic atmosphere",
                                    "col-ratio": "16:9",
                                },
                            },
                        ],
                    },
                },
                renderer: "declarative",
                acceptsInputKind: "image",
                showOutputConnection: true,
            },
        ],
    },
};

export const creativeAssetTablePlugin: RegisteredPlugin = { manifest };

registerPlugin(creativeAssetTablePlugin);
