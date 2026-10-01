import { registerPlugin } from "@/lib/plugins/plugin-registry";
import type { PluginManifest, RegisteredPlugin } from "@/lib/plugins/plugin-types";
import {
    CREATIVE_VOICE_REF_COLUMNS,
    CREATIVE_VOICE_TABLE_DEFAULT_SIZE,
    CREATIVE_VOICE_TABLE_MIN_SIZE,
    CREATIVE_VOICE_TABLE_NODE_TYPE,
    CREATIVE_VOICE_TABLE_PLUGIN_ID,
    CREATIVE_VOICE_TEXT_COLUMNS,
} from "./contracts";

const manifest: PluginManifest = {
    apiVersion: "zhiying.plugin/v1",
    id: CREATIVE_VOICE_TABLE_PLUGIN_ID,
    name: "创意配音",
    version: "1.0.0",
    description: "专业创意配音节点，提供参考音色与参考情绪插槽、口播文案精准±2字改写、成品配音合成及与分镜总装表的动态联动。",
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
                id: CREATIVE_VOICE_TABLE_NODE_TYPE,
                label: "创意配音",
                defaultTitle: "创意配音",
                defaultSize: CREATIVE_VOICE_TABLE_DEFAULT_SIZE,
                minSize: CREATIVE_VOICE_TABLE_MIN_SIZE,
                schema: {
                    type: "object",
                    properties: {
                        batchTable: {
                            type: "object",
                            properties: {
                                operation: { type: "string" },
                                concurrency: { type: "number" },
                                voiceSlotMode: { type: "string" },
                                rows: { type: "array" },
                            },
                        },
                    },
                },
                defaultMetadata: {
                    batchTable: {
                        operation: "creative",
                        concurrency: 6,
                        contentKind: "creative-voice",
                        voiceSlotMode: "all",
                        referenceColumns: CREATIVE_VOICE_REF_COLUMNS,
                        textColumns: CREATIVE_VOICE_TEXT_COLUMNS,
                        rows: [
                            {
                                id: "voice-row-1",
                                enabled: true,
                                inputNodeIds: [],
                                prompt: "大太阳下骑车，这导航全反光！",
                                cells: {
                                    "col-time": "0-3s",
                                    "col-speaker": "出镜主角",
                                    "col-tone": "急促痛点 (焦虑眯眼)",
                                    "col-lines": "大太阳下骑车，这导航全反光！",
                                    "col-rewrite": "大热天顶着烈日骑车，屏幕反光完全看不清路！",
                                },
                            },
                            {
                                id: "voice-row-2",
                                enabled: true,
                                inputNodeIds: [],
                                prompt: "手机烫得直卡顿，差点走错路！",
                                cells: {
                                    "col-time": "3-6s",
                                    "col-speaker": "出镜主角",
                                    "col-tone": "无奈痛切 (警醒叹气)",
                                    "col-lines": "手机烫得直卡顿，差点走错路！",
                                    "col-rewrite": "机身烫到弹警告直发卡，险些错过路口！",
                                },
                            },
                            {
                                id: "voice-row-3",
                                enabled: true,
                                inputNodeIds: [],
                                prompt: "换上这个小头盔，直接给手机戴头盔！",
                                cells: {
                                    "col-time": "6-10s",
                                    "col-speaker": "出镜主角",
                                    "col-tone": "惊喜上扬 (自信展示)",
                                    "col-lines": "换上这个小头盔，直接给手机戴头盔！",
                                    "col-rewrite": "赶紧扣上这个小头盔支架，给手机撑把遮阳伞！",
                                },
                            },
                        ],
                    },
                },
                renderer: "declarative",
                acceptsInputKind: "audio",
                showOutputConnection: true,
            },
        ],
    },
};

export const creativeVoiceTablePlugin: RegisteredPlugin = { manifest };

registerPlugin(creativeVoiceTablePlugin);
