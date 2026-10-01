// @opc-feature: custom-node-execution-test [start]
import { describe, expect, it } from "bun:test";
import { isCustomPluginNode } from "@/extensions/opc-infinite/services/custom-node-executor";
import { extractCustomNodeSummary } from "@/extensions/opc-infinite/services/custom-node-context";
import { isOfficialApplicationPluginId } from "@/lib/plugins/official-applications";
import { isLocalOrPrivateUpstream } from "@/services/api/custom-channel-relay";
import {
    VIDEO_REVERSE_NODE_TYPE,
    VIDEO_REVERSE_PLUGIN_ID,
} from "@/extensions/opc-infinite/services/video-reverse-contracts";
import {
    CREATION_ASSISTANT_ANALYSIS_NODE_TYPE,
    CREATION_ASSISTANT_SCRIPT_NODE_TYPE,
    CREATION_ASSISTANT_REF_SCRIPT_NODE_TYPE,
    CREATION_ASSISTANT_ANALYSIS_PLUGIN_ID,
    CREATION_ASSISTANT_SCRIPT_PLUGIN_ID,
    CREATION_ASSISTANT_REF_SCRIPT_PLUGIN_ID,
} from "@/extensions/opc-infinite/services/creation-assistant-contracts";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

describe("custom plugin node executor and guardrail verification", () => {
    it("recognizes all 4 custom plugin node types in dispatcher", () => {
        expect(isCustomPluginNode(VIDEO_REVERSE_NODE_TYPE)).toBe(true);
        expect(isCustomPluginNode(CREATION_ASSISTANT_ANALYSIS_NODE_TYPE)).toBe(true);
        expect(isCustomPluginNode(CREATION_ASSISTANT_SCRIPT_NODE_TYPE)).toBe(true);
        expect(isCustomPluginNode(CREATION_ASSISTANT_REF_SCRIPT_NODE_TYPE)).toBe(true);

        expect(isCustomPluginNode(CanvasNodeType.Image)).toBe(false);
        expect(isCustomPluginNode(CanvasNodeType.Video)).toBe(false);
        expect(isCustomPluginNode(CanvasNodeType.Text)).toBe(false);
        expect(isCustomPluginNode(CanvasNodeType.Script)).toBe(false);
        expect(isCustomPluginNode("")).toBe(false);
        expect(isCustomPluginNode(undefined)).toBe(false);
    });

    it("treats custom plugins as official applications", () => {
        expect(isOfficialApplicationPluginId(VIDEO_REVERSE_PLUGIN_ID)).toBe(true);
        expect(isOfficialApplicationPluginId(CREATION_ASSISTANT_ANALYSIS_PLUGIN_ID)).toBe(true);
        expect(isOfficialApplicationPluginId(CREATION_ASSISTANT_SCRIPT_PLUGIN_ID)).toBe(true);
        expect(isOfficialApplicationPluginId(CREATION_ASSISTANT_REF_SCRIPT_PLUGIN_ID)).toBe(true);
    });

    it("extracts concise and bounded custom summaries for all custom node types", () => {
        // Video reverse node summary
        const reverseNode: CanvasNodeData = {
            id: "node_reverse_1",
            type: VIDEO_REVERSE_NODE_TYPE as any,
            title: "爆款参考视频反推",
            position: { x: 100, y: 100 },
            width: 460,
            height: 320,
            metadata: {
                status: "success",
                videoReverse: {
                    status: "success",
                    prompt: "镜头1: 全景运镜，主角出场；镜头2: 特写展示商品细节",
                    result: {
                        prompt: "镜头1: 全景运镜，主角出场；镜头2: 特写展示商品细节",
                        notes: ["运镜平稳", "配乐节奏快"],
                        durationSec: 15,
                        frameCount: 15,
                        submittedGridCount: 2,
                        omittedGridCount: 0,
                    },
                },
            },
        };
        const reverseSummary = extractCustomNodeSummary(reverseNode);
        expect(reverseSummary).toBeDefined();
        expect(reverseSummary?.kind).toBe("video_reverse");
        expect(reverseSummary?.text).toContain("视频反推分镜");
        expect(reverseSummary?.text).toContain("15秒");
        expect(reverseSummary?.details?.durationSec).toBe(15);

        // Material analysis node summary
        const analysisNode: CanvasNodeData = {
            id: "node_analysis_1",
            type: CREATION_ASSISTANT_ANALYSIS_NODE_TYPE as any,
            title: "商品素材分析",
            position: { x: 200, y: 100 },
            width: 460,
            height: 360,
            metadata: {
                status: "success",
                materialAnalysis: {
                    status: "success",
                    result: {
                        version: "material-analysis-result.v1",
                        generatedAt: Date.now(),
                        sourceIds: ["img1", "img2"],
                        fileSummaries: [
                            { id: "img1", name: "包装正面.png", kind: "image", summary: "商品外观" } as any,
                        ],
                        insightSections: [
                            { title: "核心卖点", items: [{ text: "轻量透气", basis: [] }] },
                            { title: "目标客群", items: [{ text: "年轻都市白领", basis: [] }] },
                        ],
                    },
                },
            },
        };
        const analysisSummary = extractCustomNodeSummary(analysisNode);
        expect(analysisSummary).toBeDefined();
        expect(analysisSummary?.kind).toBe("material_analysis");
        expect(analysisSummary?.text).toContain("素材分析结论");
        expect(analysisSummary?.text).toContain("核心卖点");
        expect(analysisSummary?.details?.fileCount).toBe(1);

        // Script generation node summary
        const scriptNode: CanvasNodeData = {
            id: "node_script_1",
            type: CREATION_ASSISTANT_SCRIPT_NODE_TYPE as any,
            title: "带货分镜脚本",
            position: { x: 300, y: 100 },
            width: 460,
            height: 360,
            metadata: {
                status: "success",
                configScript: {
                    status: "success",
                    businessScenario: "ecommerce",
                    scriptType: "smart",
                    durationSec: 30,
                    result: {
                        version: "config-script-result.v1",
                        script: "镜头1 (3s): 痛点开场\n镜头2 (5s): 核心卖点演示",
                        generatedAt: Date.now(),
                    },
                },
            },
        };
        const scriptSummary = extractCustomNodeSummary(scriptNode);
        expect(scriptSummary).toBeDefined();
        expect(scriptSummary?.kind).toBe("config_script");
        expect(scriptSummary?.text).toContain("痛点开场");

        // Ref script generation node summary
        const refScriptNode: CanvasNodeData = {
            id: "node_ref_script_1",
            type: CREATION_ASSISTANT_REF_SCRIPT_NODE_TYPE as any,
            title: "复刻对标脚本",
            position: { x: 400, y: 100 },
            width: 460,
            height: 360,
            metadata: {
                status: "success",
                refScript: {
                    status: "success",
                    businessScenario: "ecommerce",
                    result: {
                        version: "ref-script-result.v1",
                        script: "复刻镜头1 (2s): 快速切镜抓眼球",
                        generatedAt: Date.now(),
                    },
                },
            },
        };
        const refSummary = extractCustomNodeSummary(refScriptNode);
        expect(refSummary).toBeDefined();
        expect(refSummary?.kind).toBe("ref_script");
        expect(refSummary?.text).toContain("快速切镜抓眼球");
    });

    it("strictly isolates local private addresses vs public commercial endpoints (Guardrail 2)", () => {
        // Local private addresses (allowed for fetchLocal/direct local)
        expect(isLocalOrPrivateUpstream("http://127.0.0.1:8080/api")).toBe(true);
        expect(isLocalOrPrivateUpstream("http://localhost:11434/api/generate")).toBe(true);
        expect(isLocalOrPrivateUpstream("http://192.168.1.100:8000/v1")).toBe(true);
        expect(isLocalOrPrivateUpstream("http://10.0.0.5:8000/v1")).toBe(true);
        expect(isLocalOrPrivateUpstream("http://172.16.0.1:8000/v1")).toBe(true);
        expect(isLocalOrPrivateUpstream("http://test.local:8080")).toBe(true);
        expect(isLocalOrPrivateUpstream("http://service.internal:8080")).toBe(true);

        // Without protocol prefix
        expect(isLocalOrPrivateUpstream("127.0.0.1:11434")).toBe(true);
        expect(isLocalOrPrivateUpstream("localhost:1234")).toBe(true);
        expect(isLocalOrPrivateUpstream("192.168.1.50:8000")).toBe(true);

        // Public commercial endpoints (MUST go through backend secure gateway /api/ai/custom)
        expect(isLocalOrPrivateUpstream("https://api.deepseek.com/v1")).toBe(false);
        expect(isLocalOrPrivateUpstream("https://api.openai.com/v1")).toBe(false);
        expect(isLocalOrPrivateUpstream("https://ark.cn-beijing.volces.com/api/v3")).toBe(false);
        expect(isLocalOrPrivateUpstream("https://dashscope.aliyuncs.com/api/v1")).toBe(false);
        expect(isLocalOrPrivateUpstream("https://api.minimax.chat/v1")).toBe(false);
    });
});
// @opc-feature: custom-node-execution-test [end]
