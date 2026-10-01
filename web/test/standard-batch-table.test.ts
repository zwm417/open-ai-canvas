import { describe, expect, it } from "bun:test";

import { calculateStandardBatchTableHeight, STANDARD_BATCH_TABLE_DEFAULT_SIZE, STANDARD_BATCH_TABLE_MIN_SIZE, STANDARD_BATCH_TABLE_NODE_TYPE, STANDARD_BATCH_TABLE_PLUGIN_ID } from "@/extensions/standard-batch-table/contracts";
import { getNodeDefinition, getNodeLabel } from "@/lib/canvas/node-registry";
import { createCanvasNode } from "@/lib/canvas/canvas-project-domain";
import { CanvasNodeType } from "@/types/canvas";
// 引入插件注册
import "@/extensions/standard-batch-table/plugin";

describe("standard-batch-table 基准节点规范与注册", () => {
    it("正确导出节点常量与插件 ID", () => {
        expect(STANDARD_BATCH_TABLE_PLUGIN_ID).toBe("standard-batch-table");
        expect(STANDARD_BATCH_TABLE_NODE_TYPE).toBe("standard-batch-table:table");
        expect(STANDARD_BATCH_TABLE_DEFAULT_SIZE.width).toBe(1480);
        expect(STANDARD_BATCH_TABLE_DEFAULT_SIZE.height).toBe(640);
        expect(STANDARD_BATCH_TABLE_MIN_SIZE.width).toBe(1080);
        expect(STANDARD_BATCH_TABLE_MIN_SIZE.height).toBe(240);
    });

    it("自适应内部页面高度计算能正确根据行数拉高", () => {
        expect(calculateStandardBatchTableHeight(0)).toBe(240);
        expect(calculateStandardBatchTableHeight(1)).toBe(264);
        expect(calculateStandardBatchTableHeight(6)).toBeGreaterThanOrEqual(880);
    });

    it("插件在节点注册表中成功注册且不污染原生 CanvasNodeType", () => {
        const def = getNodeDefinition(STANDARD_BATCH_TABLE_NODE_TYPE);
        expect(def).toBeDefined();
        expect(def?.label).toBe("批量创作表");
        expect(def?.defaultTitle).toBe("批量创作表");
        expect(def?.defaultSize).toEqual(STANDARD_BATCH_TABLE_DEFAULT_SIZE);
        expect(getNodeLabel(STANDARD_BATCH_TABLE_NODE_TYPE)).toBe("批量创作表");

        // 原生 CanvasNodeType 依然保持原有“批量创作表”
        const builtinDef = getNodeDefinition(CanvasNodeType.BatchTable);
        expect(builtinDef).toBeDefined();
        expect(builtinDef?.label).toBe("批量创作表");
    });

    it("createCanvasNode 能成功实例化基础多维表格节点并附带默认数据", () => {
        const center = { x: 800, y: 600 };
        const node = createCanvasNode(STANDARD_BATCH_TABLE_NODE_TYPE, center);
        expect(node.type).toBe(STANDARD_BATCH_TABLE_NODE_TYPE);
        expect(node.title).toBe("批量创作表");
        expect(node.width).toBe(STANDARD_BATCH_TABLE_DEFAULT_SIZE.width);
        expect(node.height).toBe(STANDARD_BATCH_TABLE_DEFAULT_SIZE.height);
        expect(node.position.x).toBe(center.x - STANDARD_BATCH_TABLE_DEFAULT_SIZE.width / 2);
        expect(node.position.y).toBe(center.y - STANDARD_BATCH_TABLE_DEFAULT_SIZE.height / 2);
        expect(node.metadata?.batchTable).toBeDefined();
        expect(node.metadata?.batchTable?.operation).toBe("creative");
        expect(node.metadata?.batchTable?.concurrency).toBe(10);
        expect(node.metadata?.batchTable?.rows).toEqual([]);
    });

    it("正确计算基础多维表格连线手柄 Y 坐标与磁吸识别", () => {
        const { batchReferenceHandleY, batchReferenceHandleAtY, BATCH_REFERENCE_HANDLE_TOP, BATCH_REFERENCE_HANDLE_GAP } = require("@/lib/canvas/canvas-batch-table");
        const node = createCanvasNode(STANDARD_BATCH_TABLE_NODE_TYPE, { x: 400, y: 300 });

        // 测试第 1 个参考图手柄（默认参考图 1）
        const handle1Y = batchReferenceHandleY(node, "batch-reference:reference-1");
        expect(handle1Y).toBe(node.position.y + BATCH_REFERENCE_HANDLE_TOP);

        // 测试第 2 个参考图手柄（参考图 2）
        const handle2Y = batchReferenceHandleY(node, "batch-reference:reference-2");
        expect(handle2Y).toBe(node.position.y + BATCH_REFERENCE_HANDLE_TOP + BATCH_REFERENCE_HANDLE_GAP);

        // 测试连线靠近时的磁吸命中
        const snapHandle = batchReferenceHandleAtY(node, node.position.y + BATCH_REFERENCE_HANDLE_TOP + 4, 18);
        expect(snapHandle).toBe("batch-reference:reference-1");

        const snapHandle2 = batchReferenceHandleAtY(node, node.position.y + BATCH_REFERENCE_HANDLE_TOP + BATCH_REFERENCE_HANDLE_GAP - 2, 18);
        expect(snapHandle2).toBe("batch-reference:reference-2");
    });

    it("全局提示词覆盖与任务启用开关状态", () => {
        const { batchPromptForRow, batchRowReady } = require("@/lib/canvas/canvas-batch-table");
        const table = {
            operation: "creative" as const,
            concurrency: 10,
            globalPrompt: "统一写实风格商业大片",
            rows: [
                { id: "row-1", enabled: true, inputNodeIds: ["img-1"], prompt: "行独有提示词" },
                { id: "row-2", enabled: false, inputNodeIds: ["img-2"], prompt: "已停用行提示词" },
            ],
        };

        // 全局提示词优先于行提示词
        expect(batchPromptForRow(table, table.rows[0])).toBe("统一写实风格商业大片");

        // 全局提示词为空时回退到行提示词
        const tableWithoutGlobal = { ...table, globalPrompt: "  " };
        expect(batchPromptForRow(tableWithoutGlobal, table.rows[0])).toBe("行独有提示词");

        // row.enabled 为 false 时，batchRowReady 必须为 false
        const imgNode = createCanvasNode(CanvasNodeType.Image, { x: 0, y: 0 }, { content: "data:image/png;base64,abc" });
        const nodesMap = new Map([[imgNode.id, imgNode]]);
        expect(batchRowReady({ ...table.rows[1], inputNodeIds: [imgNode.id] }, table, nodesMap)).toBe(false);
    });

    it("添加节点菜单中包含独立升级的创意多维表格选项且已移除废弃的批量创作表", () => {
        const { addNodeMenuCommands } = require("@/lib/canvas/tool-registry/definitions/add-node-menu-tools");
        const { CREATIVE_ASSET_TABLE_NODE_TYPE } = require("@/extensions/creative-asset-table/contracts");
        const { CREATIVE_VOICE_TABLE_NODE_TYPE } = require("@/extensions/creative-voice-table/contracts");
        const { CREATIVE_STORYBOARD_TABLE_NODE_TYPE } = require("@/extensions/creative-storyboard-table/contracts");

        const standardCmd = addNodeMenuCommands.find((cmd: any) => cmd.id === STANDARD_BATCH_TABLE_NODE_TYPE);
        const legacyCmd = addNodeMenuCommands.find((cmd: any) => cmd.id === CanvasNodeType.BatchTable);
        const assetCmd = addNodeMenuCommands.find((cmd: any) => cmd.id === CREATIVE_ASSET_TABLE_NODE_TYPE);
        const voiceCmd = addNodeMenuCommands.find((cmd: any) => cmd.id === CREATIVE_VOICE_TABLE_NODE_TYPE);
        const storyboardCmd = addNodeMenuCommands.find((cmd: any) => cmd.id === CREATIVE_STORYBOARD_TABLE_NODE_TYPE);

        // 原批量创作表（本地增强）已按企业级演进规范彻底移除
        expect(standardCmd).toBeUndefined();
        expect(legacyCmd).toBeUndefined();

        // 升级为独立的三大节点插件
        expect(assetCmd).toBeDefined();
        expect(assetCmd.label).toBe("创意资产表");
        expect(assetCmd.badge).toBe("资产");

        expect(voiceCmd).toBeDefined();
        expect(voiceCmd.label).toBe("创意配音");
        expect(voiceCmd.badge).toBe("配音");

        expect(storyboardCmd).toBeDefined();
        expect(storyboardCmd.label).toBe("创意分镜表");
        expect(storyboardCmd.badge).toBe("分镜");
    });

    it("copyBatchReferenceCell 支持插槽间复制素材，复用已有素材节点 ID 且不破坏源单元格", () => {
        const { copyBatchReferenceCell } = require("@/lib/canvas/canvas-batch-table");
        const table = {
            operation: "creative" as const,
            concurrency: 10,
            rows: [
                { id: "row-1", enabled: true, inputNodeIds: ["node-img-original"], prompt: "第1行" },
                { id: "row-2", enabled: true, inputNodeIds: [], prompt: "第2行" },
            ],
        };

        // 从 row-1 的第 0 列复制到 row-2 的第 0 列
        const nextTable = copyBatchReferenceCell(table, "row-1", 0, "row-2", 0);
        expect(nextTable).not.toBeNull();
        if (!nextTable) return;

        // 源单元格保持不变
        expect(nextTable.rows[0].inputNodeIds[0]).toBe("node-img-original");
        // 目标单元格成功复用源节点 ID，未创建新节点
        expect(nextTable.rows[1].inputNodeIds[0]).toBe("node-img-original");
    });

    it("素材内部剪贴板能够正确暂存素材节点元数据并在粘贴时复用", () => {
        const { copyBatchReference, getBatchReferenceClipboard, clearBatchReferenceClipboard } = require("@/lib/canvas/batch-reference-clipboard");

        clearBatchReferenceClipboard();
        expect(getBatchReferenceClipboard()).toBeNull();

        copyBatchReference({
            nodeId: "node-img-123",
            title: "女主角模特图",
            previewUrl: "https://example.com/model.jpg",
            mimeType: "image/jpeg",
        });

        const copied = getBatchReferenceClipboard();
        expect(copied).not.toBeNull();
        expect(copied?.nodeId).toBe("node-img-123");
        expect(copied?.title).toBe("女主角模特图");

        clearBatchReferenceClipboard();
        expect(getBatchReferenceClipboard()).toBeNull();
    });

    it("Windows标准拖动: 鼠标左键长按拖动(Move)严格为单个插槽操作，绝不污染或广播整列", () => {
        const { moveBatchReferenceCell } = require("@/lib/canvas/canvas-batch-table");
        const table = {
            operation: "creative" as const,
            concurrency: 10,
            rows: [
                { id: "row-1", enabled: true, inputNodeIds: ["node-img-A"], prompt: "第1行" },
                { id: "row-2", enabled: true, inputNodeIds: [""], prompt: "第2行" },
                { id: "row-3", enabled: true, inputNodeIds: ["node-img-C"], prompt: "第3行" },
            ],
        };

        // 普通拖拽：从 row-1 移动到 row-2
        const nextTable = moveBatchReferenceCell(table, "row-1", 0, "row-2", 0);
        expect(nextTable).not.toBeNull();
        if (!nextTable) return;

        // 源插槽已移出（清空）
        expect(nextTable.rows[0].inputNodeIds[0]).toBe("");
        // 目标插槽已移入 node-img-A
        expect(nextTable.rows[1].inputNodeIds[0]).toBe("node-img-A");
        // 第3行严格保持不变，绝不发生整列广播或级联变动
        expect(nextTable.rows[2].inputNodeIds[0]).toBe("node-img-C");
    });

    it("Windows标准拖动: Ctrl+左键拖动(Copy)严格为单个插槽操作，源保留、目标复用同一nodeId且不影响其他行", () => {
        const { copyBatchReferenceCell } = require("@/lib/canvas/canvas-batch-table");
        const table = {
            operation: "creative" as const,
            concurrency: 10,
            rows: [
                { id: "row-1", enabled: true, inputNodeIds: ["node-img-A"], prompt: "第1行" },
                { id: "row-2", enabled: true, inputNodeIds: [""], prompt: "第2行" },
                { id: "row-3", enabled: true, inputNodeIds: ["node-img-C"], prompt: "第3行" },
            ],
        };

        // Ctrl+拖拽：从 row-1 复制到 row-2
        const nextTable = copyBatchReferenceCell(table, "row-1", 0, "row-2", 0);
        expect(nextTable).not.toBeNull();
        if (!nextTable) return;

        // 源插槽保持原有素材
        expect(nextTable.rows[0].inputNodeIds[0]).toBe("node-img-A");
        // 目标插槽填入并复用 node-img-A
        expect(nextTable.rows[1].inputNodeIds[0]).toBe("node-img-A");
        // 第3行严格保持不变
        expect(nextTable.rows[2].inputNodeIds[0]).toBe("node-img-C");
    });
});



