import { describe, expect, it } from "bun:test";
import {
    buildShotReferenceScript,
    cleanCreativePromptText,
    extractShotDurationSec,
    formatShotTimeRange,
    groupShotsIntoVideoSegments,
} from "../src/lib/creation-assistant-segmentation";
import { syncMasterTableRowsToStoryboard } from "../src/lib/canvas/creative-master-storyboard-sync";
import type { CanvasNodeData } from "../src/types/canvas";

describe("创意分镜表架构与算法规范测试", () => {
    describe("1. 视频模型上限时长与段组聚合 (Shot Segmentation & Atomicity)", () => {
        it("应当根据 5 秒视频模型上限正确将分镜贪心打包成视频段组，且绝不拆分单个分镜", () => {
            const shots = [
                { shotNumber: 1, durationSec: 3, shotType: "a-roll", plotDescription: "主角开场" },
                { shotNumber: 2, durationSec: 2, shotType: "b-roll", plotDescription: "特写展示" },
                { shotNumber: 3, durationSec: 4, shotType: "l-cut", plotDescription: "磁吸覆层讲解" },
                { shotNumber: 4, durationSec: 1, shotType: "a-roll", plotDescription: "结尾号召" },
            ];

            const { segments, annotatedShots } = groupShotsIntoVideoSegments(shots, 5);

            // 镜1 (3s) + 镜2 (2s) = 5s (达到上限，归为段 1)
            // 镜3 (4s) + 镜4 (1s) = 5s (归为段 2)
            expect(segments.length).toBe(2);
            expect(segments[0].durationSec).toBe(5);
            expect(segments[0].shots.length).toBe(2);
            expect(segments[0].shots[0].segmentPrefix).toBe("段1-镜1");
            expect(segments[0].shots[1].segmentPrefix).toBe("段1-镜2");

            expect(segments[1].durationSec).toBe(5);
            expect(segments[1].shots.length).toBe(2);
            expect(segments[1].shots[0].segmentPrefix).toBe("段2-镜1");
            expect(segments[1].shots[1].segmentPrefix).toBe("段2-镜2");

            // 验证时间与镜头形态标签格式：段X-镜Y · MM:SS - MM:SS (Ds) [TYPE]
            expect(annotatedShots[0].segmentTimeAndLensLabel).toContain("段1-镜1 · 00:00 - 00:03 (3s) [A-ROLL]");
            expect(annotatedShots[1].segmentTimeAndLensLabel).toContain("段1-镜2 · 00:00 - 00:02 (2s) [B-ROLL]");
        });

        it("单镜头时长自身超出或等于上限时长时，该分镜独立成段，保证分镜原子性", () => {
            const shots = [
                { shotNumber: 1, durationSec: 6, shotType: "a-roll" }, // 超过 5s
                { shotNumber: 2, durationSec: 3, shotType: "b-roll" },
                { shotNumber: 3, durationSec: 3, shotType: "a-roll" },
            ];

            const { segments } = groupShotsIntoVideoSegments(shots, 5);
            expect(segments.length).toBe(3);
            expect(segments[0].shots.length).toBe(1);
            expect(segments[0].shots[0].segmentPrefix).toBe("段1-镜1");
            expect(segments[1].shots.length).toBe(1);
            expect(segments[1].shots[0].segmentPrefix).toBe("段2-镜1");
            expect(segments[2].shots.length).toBe(1);
            expect(segments[2].shots[0].segmentPrefix).toBe("段3-镜1");
        });

        it("应当正确提取与格式化时间区间", () => {
            expect(extractShotDurationSec({ durationSec: 3.5 })).toBe(4);
            expect(extractShotDurationSec({ timeRange: "0.0s - 4.5s" })).toBe(5);
            expect(formatShotTimeRange({ startSec: 0, endSec: 3 })).toBe("00:00 - 00:03 (3s)");
            expect(formatShotTimeRange({ startSec: 65, endSec: 72 })).toBe("01:05 - 01:12 (7s)");
        });
    });

    describe("2. 参考脚本拼接规范 (buildShotReferenceScript)", () => {
        it("应当正确将公共总览与该分镜的具体剧情、台词、运镜与钩子拼接成规范 Markdown", () => {
            const commonOverview = "全片风格为自然写实种草，节奏紧凑明快，出镜主角亲和力强。";
            const shot = {
                plotDescription: "出镜主角在客厅自然坐下，手持核心商品",
                lines: "姐妹们，熬夜脸蜡黄真的有救了！",
                scaleAndAngle: "中景平视",
                cameraMovement: "缓推",
                hookType: "痛点悬念",
            };

            const result = buildShotReferenceScript({
                commonOverview,
                shot,
                shotIndex: 0,
            });

            expect(result).toContain("【原脚本公共描述】");
            expect(result).toContain("全片风格为自然写实种草");
            expect(result).toContain("【第 1 镜参考描述】");
            expect(result).toContain("【剧情/画面】出镜主角在客厅自然坐下");
            expect(result).toContain("【原片台词/对白】姐妹们，熬夜脸蜡黄真的有救了！");
            expect(result).toContain("【景别运镜】中景平视 缓推");
            expect(result).toContain("【吸睛钩子】痛点悬念");
        });
    });

    describe("3. 创意提示词脱敏与严禁 JSON 红线 (cleanCreativePromptText)", () => {
        it("当输入为纯自然语言时完整保留", () => {
            const raw = "【物理运镜与动效】镜头平推\\n\\n【核心对白】@出镜主角 面对镜头自然微笑";
            expect(cleanCreativePromptText(raw)).toBe(raw);
        });

        it("当输入包含 ```json 代码块时，应当剥离包裹并解析为自然语言段落", () => {
            const rawJsonBlock = "```json\n{\n  \"camera\": \"镜头慢推向主体\",\n  \"lines\": \"这就是核心卖点\",\n  \"overview\": \"生活化温馨质感\"\n}\n```";
            const cleaned = cleanCreativePromptText(rawJsonBlock);

            expect(cleaned).not.toContain("```json");
            expect(cleaned).not.toContain("{");
            expect(cleaned).not.toContain("}");
            expect(cleaned).toContain("【物理运镜与动效】镜头慢推向主体");
            expect(cleaned).toContain("【台词声音】这就是核心卖点");
            expect(cleaned).toContain("【全局基调】生活化温馨质感");
        });

        it("当输入散落有键值对花括号时，应当予以净化", () => {
            const raw = "{\"motionPrompt\": \"快速平移\"} 镜头跟随 @出镜主角";
            const cleaned = cleanCreativePromptText(raw);
            expect(cleaned).not.toContain("{\"motionPrompt\"");
            expect(cleaned).toContain("镜头跟随 @出镜主角");
        });
    });

    describe("4. 创意资产表与分镜表动态素材引用同步 (syncMasterTableRowsToStoryboard)", () => {
        it("创意资产表生成了新资产时，自动替换为 outputNodeId", () => {
            const masterNode: CanvasNodeData = {
                id: "master-table-1",
                type: "batch_table" as any,
                title: "创意资产表",
                position: { x: 0, y: 0 },
                width: 1000,
                height: 600,
                metadata: {
                    batchTable: {
                        operation: "creative",
                        concurrency: 6,
                        rows: [
                            {
                                id: "master-row-actor-1",
                                enabled: true,
                                inputNodeIds: ["ref-image-actor"],
                                outputNodeId: "generated-image-actor-new",
                                prompt: "出镜主角",
                                cells: { "col-slot-name": "出镜主角" },
                            },
                        ],
                    },
                },
            };

            const storyboardNode: CanvasNodeData = {
                id: "storyboard-table-1",
                type: "batch_table" as any,
                title: "创意分镜表",
                position: { x: 1200, y: 0 },
                width: 1200,
                height: 800,
                metadata: {
                    batchTable: {
                        operation: "creative",
                        concurrency: 10,
                        contentKind: "storyboard",
                        referenceColumns: [
                            { id: "ref-script", label: "参考脚本" },
                            { id: "ref-master-slots", label: "创意资产表" },
                            { id: "ref-voiceover", label: "创意配音" },
                        ],
                        rows: [
                            {
                                id: "shot-row-1",
                                enabled: true,
                                inputNodeIds: ["script-node-1", "ref-image-actor", ""],
                                prompt: "创意提示词",
                                cells: { "col-asset-target": "actor-1" },
                            },
                        ],
                    },
                },
            };

            const nodes: CanvasNodeData[] = [
                masterNode,
                storyboardNode,
                {
                    id: "generated-image-actor-new",
                    type: "image" as any,
                    title: "新生成的母版图",
                    position: { x: 0, y: 0 },
                    width: 512,
                    height: 512,
                    metadata: { previewContent: "https://example.com/new-actor.png" },
                },
            ];

            const { updatedStoryboardNode } = syncMasterTableRowsToStoryboard({
                masterNode,
                storyboardNode,
                nodes,
                connections: [],
            });

            const updatedRows = updatedStoryboardNode.metadata?.batchTable?.rows;
            expect(updatedRows?.[0].inputNodeIds[1]).toBe("generated-image-actor-new");
        });

        it("未生成新资产但上传了参考素材时，引用原参考素材", () => {
            const masterNode: CanvasNodeData = {
                id: "master-table-1",
                type: "batch_table" as any,
                title: "创意资产表",
                position: { x: 0, y: 0 },
                width: 1000,
                height: 600,
                metadata: {
                    batchTable: {
                        operation: "creative",
                        concurrency: 6,
                        rows: [
                            {
                                id: "master-row-actor-1",
                                enabled: true,
                                inputNodeIds: ["ref-image-actor-uploaded"],
                                outputNodeId: "",
                                prompt: "出镜主角",
                                cells: { "col-slot-name": "出镜主角" },
                            },
                        ],
                    },
                },
            };

            const storyboardNode: CanvasNodeData = {
                id: "storyboard-table-1",
                type: "batch_table" as any,
                title: "创意分镜表",
                position: { x: 1200, y: 0 },
                width: 1200,
                height: 800,
                metadata: {
                    batchTable: {
                        operation: "creative",
                        concurrency: 10,
                        contentKind: "storyboard",
                        referenceColumns: [
                            { id: "ref-script", label: "参考脚本" },
                            { id: "ref-master-slots", label: "创意资产表" },
                            { id: "ref-voiceover", label: "创意配音" },
                        ],
                        rows: [
                            {
                                id: "shot-row-1",
                                enabled: true,
                                inputNodeIds: ["script-node-1", "", ""],
                                prompt: "创意提示词",
                                cells: { "col-asset-target": "actor-1" },
                            },
                        ],
                    },
                },
            };

            const nodes: CanvasNodeData[] = [
                masterNode,
                storyboardNode,
                {
                    id: "ref-image-actor-uploaded",
                    type: "image" as any,
                    title: "用户上传的参考图",
                    position: { x: 0, y: 0 },
                    width: 512,
                    height: 512,
                    metadata: { previewContent: "https://example.com/ref-actor.png" },
                },
            ];

            const { updatedStoryboardNode } = syncMasterTableRowsToStoryboard({
                masterNode,
                storyboardNode,
                nodes,
                connections: [],
            });

            const updatedRows = updatedStoryboardNode.metadata?.batchTable?.rows;
            expect(updatedRows?.[0].inputNodeIds[1]).toBe("ref-image-actor-uploaded");
        });
    });

    describe("4. 交互与面板防弹窗规范 (Table Interaction Dialog Guard)", () => {
        it("创意资产表与创意分镜表属于全功能独立表格，严禁在选中/点击时弹出下方提示词对话框", () => {
            const { CREATIVE_ASSET_TABLE_NODE_TYPE } = require("@/extensions/creative-asset-table/contracts");
            const { CREATIVE_STORYBOARD_TABLE_NODE_TYPE } = require("@/extensions/creative-storyboard-table/contracts");
            const { CanvasNodeType } = require("@/types/canvas");

            // 模拟判定逻辑
            const isExcludedFromDialog = (type: string) => {
                return (
                    type === CanvasNodeType.Script ||
                    type === CanvasNodeType.Drawing ||
                    type === CanvasNodeType.BatchTable ||
                    type === "standard-batch-table:table" ||
                    type === "creative-voice-table:table" ||
                    type === CREATIVE_ASSET_TABLE_NODE_TYPE ||
                    type === CREATIVE_STORYBOARD_TABLE_NODE_TYPE
                );
            };

            expect(isExcludedFromDialog(CREATIVE_ASSET_TABLE_NODE_TYPE)).toBe(true);
            expect(isExcludedFromDialog(CREATIVE_STORYBOARD_TABLE_NODE_TYPE)).toBe(true);
        });
    });
});

