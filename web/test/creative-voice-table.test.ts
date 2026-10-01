import { describe, expect, it } from "bun:test";

import {
    CREATIVE_VOICE_REF_COLUMNS,
    CREATIVE_VOICE_TABLE_DEFAULT_SIZE,
    CREATIVE_VOICE_TABLE_MIN_SIZE,
    CREATIVE_VOICE_TABLE_NODE_TYPE,
    CREATIVE_VOICE_TABLE_PLUGIN_ID,
    CREATIVE_VOICE_TEXT_COLUMNS,
    formatVoiceTimeDisplay,
    calculateCreativeVoiceTableHeight,
} from "@/extensions/creative-voice-table/contracts";
import { getNodeDefinition, getNodeLabel } from "@/lib/canvas/node-registry";
import { createCanvasNode } from "@/lib/canvas/canvas-project-domain";
import { countScriptCharacters, enforceCharacterCountDifference } from "@/extensions/creative-voice-table/services/voice-script-rewrite";
import { syncVoiceTableRowsToStoryboard, stripVoicePromptTags } from "@/extensions/creative-voice-table/services/creative-voice-storyboard-sync";
import type { CanvasBatchRow, CanvasBatchTableData, CanvasNodeData } from "@/types/canvas";
import { CanvasNodeType } from "@/types/canvas";

// 引入插件注册
import "@/extensions/creative-voice-table/plugin";

describe("创意配音多维表格 (creative-voice-table) 规范与注册", () => {
    it("正确导出节点常量与插件 ID", () => {
        expect(CREATIVE_VOICE_TABLE_PLUGIN_ID).toBe("creative-voice-table");
        expect(CREATIVE_VOICE_TABLE_NODE_TYPE).toBe("creative-voice-table:table");
        expect(CREATIVE_VOICE_TABLE_DEFAULT_SIZE.width).toBe(1560);
        expect(CREATIVE_VOICE_TABLE_DEFAULT_SIZE.height).toBe(680);
        expect(CREATIVE_VOICE_TABLE_MIN_SIZE.width).toBe(1080);
        expect(CREATIVE_VOICE_TABLE_MIN_SIZE.height).toBe(240);
    });

    it("插件在节点注册表中成功注册且属性正确", () => {
        const def = getNodeDefinition(CREATIVE_VOICE_TABLE_NODE_TYPE);
        expect(def).toBeDefined();
        expect(def?.label).toBe("创意配音");
        expect(def?.defaultTitle).toBe("创意配音");
        expect(def?.defaultSize).toEqual(CREATIVE_VOICE_TABLE_DEFAULT_SIZE);
        expect(getNodeLabel(CREATIVE_VOICE_TABLE_NODE_TYPE)).toBe("创意配音");
    });

    it("列规范正确定义：参考音色、参考情绪插槽列与 4 项文本列", () => {
        expect(CREATIVE_VOICE_REF_COLUMNS).toEqual([
            { id: "ref-voice", label: "参考音色" },
            { id: "ref-tone", label: "参考情绪" },
        ]);
        expect(CREATIVE_VOICE_TEXT_COLUMNS).toEqual([
            { id: "col-time", label: "起止与时长", type: "text" },
            { id: "col-speaker-tone", label: "说话人与情绪", type: "text" },
            { id: "col-lines", label: "原文台词", type: "text" },
            { id: "col-rewrite", label: "改写文案", type: "text" },
        ]);
    });

    it("起止与时长格式化支持单框内换行展示区间与时长", () => {
        expect(formatVoiceTimeDisplay("00:03 - 00:06 (3s)")).toBe("00:03 - 00:06\n(3s)");
        expect(formatVoiceTimeDisplay("00:00 - 00:04 (4s)")).toBe("00:00 - 00:04\n(4s)");
        expect(formatVoiceTimeDisplay("00:03 - 00:06\n(3s)")).toBe("00:03 - 00:06\n(3s)");
        expect(formatVoiceTimeDisplay("00:03 - 00:06 3s")).toBe("00:03 - 00:06\n(3s)");
        expect(formatVoiceTimeDisplay("00:03 - 00:06")).toBe("00:03 - 00:06");
        expect(formatVoiceTimeDisplay("00:03 - 00:06 （3s）")).toBe("00:03 - 00:06\n(3s)");
        expect(formatVoiceTimeDisplay("0:03 - 0:06 (3s)")).toBe("0:03 - 0:06\n(3s)");
        expect(formatVoiceTimeDisplay("00:03 ~ 00:06 (3.5秒)")).toBe("00:03 ~ 00:06\n(3.5秒)");
        expect(formatVoiceTimeDisplay("00:03 - 00:06 3秒")).toBe("00:03 - 00:06\n(3s)");
        expect(formatVoiceTimeDisplay("")).toBe("");
    });

    it("自适应内部页面高度计算能正确根据行数拉高", () => {
        expect(calculateCreativeVoiceTableHeight(0)).toBe(240);
        expect(calculateCreativeVoiceTableHeight(1)).toBe(240);
        expect(calculateCreativeVoiceTableHeight(6)).toBeGreaterThanOrEqual(780);
    });

    it("createCanvasNode 能成功实例化创意配音多维表格节点并附带默认数据", () => {
        const center = { x: 900, y: 700 };
        const node = createCanvasNode(CREATIVE_VOICE_TABLE_NODE_TYPE, center);
        expect(node.type).toBe(CREATIVE_VOICE_TABLE_NODE_TYPE);
        expect(node.title).toBe("创意配音");
        expect(node.width).toBe(CREATIVE_VOICE_TABLE_DEFAULT_SIZE.width);
        expect(node.height).toBe(CREATIVE_VOICE_TABLE_DEFAULT_SIZE.height);
        expect(node.position.x).toBe(center.x - CREATIVE_VOICE_TABLE_DEFAULT_SIZE.width / 2);
        expect(node.position.y).toBe(center.y - CREATIVE_VOICE_TABLE_DEFAULT_SIZE.height / 2);
        expect(node.metadata?.batchTable).toBeDefined();
        expect(node.metadata?.batchTable?.operation).toBe("creative");
        expect(node.metadata?.batchTable?.contentKind).toBe("creative-voice");
        expect(node.metadata?.batchTable?.voiceSlotMode).toBe("all");
        expect(node.metadata?.batchTable?.concurrency).toBe(6);
        expect(node.metadata?.batchTable?.referenceColumns).toEqual(CREATIVE_VOICE_REF_COLUMNS);
        expect(node.metadata?.batchTable?.textColumns).toEqual(CREATIVE_VOICE_TEXT_COLUMNS);
    });

    it("正确计算创意配音多维表格连线手柄 Y 坐标与磁吸识别", () => {
        const { batchReferenceHandleY, batchReferenceHandleAtY, BATCH_REFERENCE_HANDLE_TOP, BATCH_REFERENCE_HANDLE_GAP } = require("@/lib/canvas/canvas-batch-table");
        const node = createCanvasNode(CREATIVE_VOICE_TABLE_NODE_TYPE, { x: 500, y: 400 });

        // 第 1 个参考列：参考音色
        const voiceHandleY = batchReferenceHandleY(node, "batch-reference:ref-voice");
        expect(voiceHandleY).toBe(node.position.y + BATCH_REFERENCE_HANDLE_TOP);

        // 第 2 个参考列：参考情绪
        const toneHandleY = batchReferenceHandleY(node, "batch-reference:ref-tone");
        expect(toneHandleY).toBe(node.position.y + BATCH_REFERENCE_HANDLE_TOP + BATCH_REFERENCE_HANDLE_GAP);

        // Y 轴磁吸反查
        const hitVoice = batchReferenceHandleAtY(node, voiceHandleY, 15);
        expect(hitVoice).toBe("batch-reference:ref-voice");
        const hitTone = batchReferenceHandleAtY(node, toneHandleY, 15);
        expect(hitTone).toBe("batch-reference:ref-tone");
    });
});

describe("创意配音台词改写与严格 ±2 字算法控制", () => {
    it("countScriptCharacters 准确统计有效汉字与字母数字数量并忽略标点", () => {
        expect(countScriptCharacters("你好，世界！")).toBe(4);
        expect(countScriptCharacters("抗老抗衰，一抹紧致！")).toBe(8);
        expect(countScriptCharacters("AI 科技 100% 震撼。")).toBe(9); // AI (2) + 科技 (2) + 100 (3) + 震撼 (2) = 9
    });

    it("enforceCharacterCountDifference 严格控制字数差在 ±2 字以内", () => {
        const original = "这款精华液能让你的肌肤立刻紧致细腻，重现年轻活力。";
        const origCount = countScriptCharacters(original);

        // 场景 A: 改写文案过长（多出 8 个字），算法自动修剪至 ±2 字
        const tooLong = "这款全新的高阶精华液能让你的面部肌肤立刻变得非常紧致水润细腻，彻底重现满满的年轻活力。";
        const adjustedLong = enforceCharacterCountDifference(tooLong, original);
        const diffLong = Math.abs(countScriptCharacters(adjustedLong) - origCount);
        expect(diffLong).toBeLessThanOrEqual(2);

        // 场景 B: 改写文案过短（少了 10 个字），算法平滑补齐至 ±2 字
        const tooShort = "精华能紧致肌肤。";
        const adjustedShort = enforceCharacterCountDifference(tooShort, original);
        const diffShort = Math.abs(countScriptCharacters(adjustedShort) - origCount);
        expect(diffShort).toBeLessThanOrEqual(2);

        // 场景 C: 改写文案恰好相差 1 字，算法原样保留核心表述
        const justFine = "这支精华液能让你的肌肤立刻紧绷细腻，重拾年轻状态。";
        const adjustedFine = enforceCharacterCountDifference(justFine, original);
        const diffFine = Math.abs(countScriptCharacters(adjustedFine) - origCount);
        expect(diffFine).toBeLessThanOrEqual(2);
    });
});

describe("创意配音与下游分镜表动态联动规则验证", () => {
    it("stripVoicePromptTags 能准确剥离已有的配音与音色情绪标签", () => {
        expect(stripVoicePromptTags("主角在阳光下微笑（配音采用 @配音）")).toBe("主角在阳光下微笑");
        expect(stripVoicePromptTags("商业静物特写（音色风格参考 @参考音色，情绪风格参考 @参考情绪）")).toBe("商业静物特写");
        expect(stripVoicePromptTags("@配音")).toBe("");
    });

    it("规则 1：生成新配音后，分镜表提示词自动注入 @配音 并连入音频节点", () => {
        const audioNodeId = "audio-node-123";
        const voiceNode: CanvasNodeData = {
            id: "voice-table-1",
            type: CREATIVE_VOICE_TABLE_NODE_TYPE,
            title: "创意复刻 - 创意配音",
            position: { x: 0, y: 0 },
            width: 1560,
            height: 680,
            metadata: {
                batchTable: {
                    operation: "creative",
                    rows: [
                        {
                            id: "row-1",
                            enabled: true,
                            inputNodeIds: ["ref-voice-node", ""],
                            prompt: "原句台词",
                            outputNodeId: audioNodeId,
                            cells: {
                                "col-lines": "原句台词",
                                "col-rewrite": "改写后的台词",
                            },
                        },
                    ],
                } as CanvasBatchTableData,
            },
        };

        const storyboardNode: CanvasNodeData = {
            id: "storyboard-table-1",
            type: CanvasNodeType.BatchTable,
            title: "创意复刻 - 爆款分镜",
            position: { x: 1700, y: 0 },
            width: 1560,
            height: 800,
            metadata: {
                batchTable: {
                    operation: "creative",
                    contentKind: "storyboard",
                    rows: [
                        {
                            id: "s-row-1",
                            enabled: true,
                            inputNodeIds: [""],
                            prompt: "女主面向镜头微笑",
                            cells: {
                                "col-lines": "原句台词",
                                "col-motion-prompt": "运镜缓慢推进",
                            },
                        },
                    ],
                } as CanvasBatchTableData,
            },
        };

        const audioNode: CanvasNodeData = {
            id: audioNodeId,
            type: CanvasNodeType.Audio,
            title: "生成音频 1",
            position: { x: 1600, y: 100 },
            width: 320,
            height: 120,
            metadata: { content: "https://example.com/audio.mp3" },
        };

        const { updatedStoryboardNode, newConnections } = syncVoiceTableRowsToStoryboard({
            voiceNode,
            storyboardNode,
            nodes: [voiceNode, storyboardNode, audioNode],
            connections: [],
        });

        const updatedRow = updatedStoryboardNode.metadata?.batchTable?.rows[0];
        // 规则 1 满足：提示词包含（配音采用 @配音）
        expect(updatedRow?.prompt).toContain("（配音采用 @配音）");
        expect(updatedRow?.cells?.["col-motion-prompt"]).toContain("（配音采用 @配音）");
        // 规则 4 满足：改写文案生效后，分镜表中台词自动同步替换
        expect(updatedRow?.cells?.["col-lines"]).toBe("改写后的台词");
        // 拓扑连接自动加入音频 -> 分镜表
        expect(newConnections.some((c) => c.fromNodeId === audioNodeId && c.toNodeId === storyboardNode.id && c.toHandleId === "batch-reference:ref-voiceover")).toBe(true);
    });

    it("规则 2：提供了参考音色/情绪但未生成配音时，分镜表自动 @参考音色 / @参考情绪", () => {
        const refVoiceNodeId = "ref-voice-node-456";
        const refToneNodeId = "ref-tone-node-789";
        const voiceNode: CanvasNodeData = {
            id: "voice-table-2",
            type: CREATIVE_VOICE_TABLE_NODE_TYPE,
            title: "创意配音",
            position: { x: 0, y: 0 },
            width: 1560,
            height: 680,
            metadata: {
                batchTable: {
                    operation: "creative",
                    rows: [
                        {
                            id: "row-1",
                            enabled: true,
                            inputNodeIds: [refVoiceNodeId, refToneNodeId],
                            prompt: "台词",
                            cells: { "col-lines": "台词" },
                        },
                    ],
                } as CanvasBatchTableData,
            },
        };

        const storyboardNode: CanvasNodeData = {
            id: "storyboard-table-2",
            type: CanvasNodeType.BatchTable,
            title: "分镜表",
            position: { x: 1700, y: 0 },
            width: 1560,
            height: 800,
            metadata: {
                batchTable: {
                    operation: "creative",
                    contentKind: "storyboard",
                    rows: [
                        {
                            id: "s-row-1",
                            enabled: true,
                            inputNodeIds: [""],
                            prompt: "男主奔跑",
                            cells: {},
                        },
                    ],
                } as CanvasBatchTableData,
            },
        };

        const refVoiceNode: CanvasNodeData = { id: refVoiceNodeId, type: CanvasNodeType.Audio, title: "音色参考", position: { x: 0, y: 0 }, width: 200, height: 100, metadata: {} };
        const refToneNode: CanvasNodeData = { id: refToneNodeId, type: CanvasNodeType.Audio, title: "情绪参考", position: { x: 0, y: 0 }, width: 200, height: 100, metadata: {} };

        const { updatedStoryboardNode } = syncVoiceTableRowsToStoryboard({
            voiceNode,
            storyboardNode,
            nodes: [voiceNode, storyboardNode, refVoiceNode, refToneNode],
            connections: [],
        });

        const updatedRow = updatedStoryboardNode.metadata?.batchTable?.rows[0];
        expect(updatedRow?.prompt).toContain("（音色风格参考 @参考音色，情绪风格参考 @参考情绪）");
    });

    it("规则 3：未提供任何参考声音时，分镜表不引用任何声音素材", () => {
        const voiceNode: CanvasNodeData = {
            id: "voice-table-3",
            type: CREATIVE_VOICE_TABLE_NODE_TYPE,
            title: "创意配音",
            position: { x: 0, y: 0 },
            width: 1560,
            height: 680,
            metadata: {
                batchTable: {
                    operation: "creative",
                    rows: [
                        {
                            id: "row-1",
                            enabled: true,
                            inputNodeIds: ["", ""],
                            prompt: "纯静音分镜",
                            cells: { "col-lines": "纯静音分镜" },
                        },
                    ],
                } as CanvasBatchTableData,
            },
        };

        const storyboardNode: CanvasNodeData = {
            id: "storyboard-table-3",
            type: CanvasNodeType.BatchTable,
            title: "分镜表",
            position: { x: 1700, y: 0 },
            width: 1560,
            height: 800,
            metadata: {
                batchTable: {
                    operation: "creative",
                    contentKind: "storyboard",
                    rows: [
                        {
                            id: "s-row-1",
                            enabled: true,
                            inputNodeIds: [""],
                            prompt: "城市空镜头（配音采用 @配音）",
                            cells: {},
                        },
                    ],
                } as CanvasBatchTableData,
            },
        };

        const { updatedStoryboardNode } = syncVoiceTableRowsToStoryboard({
            voiceNode,
            storyboardNode,
            nodes: [voiceNode, storyboardNode],
            connections: [],
        });

        const updatedRow = updatedStoryboardNode.metadata?.batchTable?.rows[0];
        expect(updatedRow?.prompt).toBe("城市空镜头");
        expect(updatedRow?.prompt).not.toContain("@配音");
        expect(updatedRow?.prompt).not.toContain("@参考音色");
    });

    it("规则 2 (单情绪参考)：仅提供参考情绪音频时，仅自动注入 @参考情绪，不出现 @参考音色", () => {
        const refToneNodeId = "ref-tone-only-123";
        const voiceNode: CanvasNodeData = {
            id: "voice-table-tone-only",
            type: CREATIVE_VOICE_TABLE_NODE_TYPE,
            title: "创意配音",
            position: { x: 0, y: 0 },
            width: 1560,
            height: 680,
            metadata: {
                batchTable: {
                    operation: "creative",
                    rows: [
                        {
                            id: "row-1",
                            enabled: true,
                            inputNodeIds: ["", refToneNodeId],
                            prompt: "台词",
                            cells: { "col-lines": "台词" },
                        },
                    ],
                } as CanvasBatchTableData,
            },
        };

        const storyboardNode: CanvasNodeData = {
            id: "storyboard-table-tone",
            type: CanvasNodeType.BatchTable,
            title: "分镜表",
            position: { x: 1700, y: 0 },
            width: 1560,
            height: 800,
            metadata: {
                batchTable: {
                    operation: "creative",
                    contentKind: "storyboard",
                    referenceColumns: [
                        { id: "ref-script", label: "编导脚本" },
                        { id: "ref-master-slots", label: "创意资产表" },
                        { id: "ref-voiceover", label: "创意配音" },
                    ],
                    rows: [
                        {
                            id: "s-row-1",
                            enabled: true,
                            inputNodeIds: ["", "", ""],
                            prompt: "画面展示",
                            cells: {},
                        },
                    ],
                } as CanvasBatchTableData,
            },
        };

        const refToneNode: CanvasNodeData = { id: refToneNodeId, type: CanvasNodeType.Audio, title: "情绪参考", position: { x: 0, y: 0 }, width: 200, height: 100, metadata: {} };

        const { updatedStoryboardNode } = syncVoiceTableRowsToStoryboard({
            voiceNode,
            storyboardNode,
            nodes: [voiceNode, storyboardNode, refToneNode],
            connections: [],
        });

        const updatedRow = updatedStoryboardNode.metadata?.batchTable?.rows[0];
        expect(updatedRow?.prompt).toContain("（情绪风格参考 @参考情绪）");
        expect(updatedRow?.prompt).not.toContain("@参考音色");
    });

    it("下发到分镜表插槽：生成的配音音频节点自动填入分镜表的创意配音插槽 (ref-voiceover)", () => {
        const audioNodeId = "audio-output-slot-test";
        const voiceNode: CanvasNodeData = {
            id: "voice-table-slot-sync",
            type: CREATIVE_VOICE_TABLE_NODE_TYPE,
            title: "创意配音",
            position: { x: 0, y: 0 },
            width: 1560,
            height: 680,
            metadata: {
                batchTable: {
                    operation: "creative",
                    rows: [
                        {
                            id: "row-1",
                            enabled: true,
                            inputNodeIds: ["", ""],
                            prompt: "台词",
                            outputNodeId: audioNodeId,
                            cells: { "col-lines": "台词" },
                        },
                    ],
                } as CanvasBatchTableData,
            },
        };

        const storyboardNode: CanvasNodeData = {
            id: "storyboard-slot-sync",
            type: CanvasNodeType.BatchTable,
            title: "分镜表",
            position: { x: 1700, y: 0 },
            width: 1560,
            height: 800,
            metadata: {
                batchTable: {
                    operation: "creative",
                    contentKind: "storyboard",
                    referenceColumns: [
                        { id: "ref-script", label: "编导脚本" },
                        { id: "ref-master-slots", label: "创意资产表" },
                        { id: "ref-voiceover", label: "创意配音" },
                    ],
                    rows: [
                        {
                            id: "s-row-1",
                            enabled: true,
                            inputNodeIds: ["script-1", "master-1", ""],
                            prompt: "分镜画面",
                            cells: {},
                        },
                    ],
                } as CanvasBatchTableData,
            },
        };

        const audioNode: CanvasNodeData = {
            id: audioNodeId,
            type: CanvasNodeType.Audio,
            title: "配音成品",
            position: { x: 0, y: 0 },
            width: 320,
            height: 120,
            metadata: {},
        };

        const { updatedStoryboardNode } = syncVoiceTableRowsToStoryboard({
            voiceNode,
            storyboardNode,
            nodes: [voiceNode, storyboardNode, audioNode],
            connections: [],
        });

        const updatedRow = updatedStoryboardNode.metadata?.batchTable?.rows[0];
        // 验证分镜表第三列 (ref-voiceover) 已填入生成的音频节点 ID
        expect(updatedRow?.inputNodeIds?.[2]).toBe(audioNodeId);
    });
});
