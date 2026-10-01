import { nanoid } from "nanoid";

import { NODE_DEFAULT_SIZE } from "@/constant/canvas";
import { workflowStarterPrompt } from "@/lib/prompts";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata } from "@/types/canvas";
import { createShortDramaPipeline } from "./canvas-short-drama";
import { createStoryboardRow } from "@/lib/canvas/canvas-project-domain";
import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasAgentOp, CanvasAgentSnapshot } from "./canvas-agent-ops";
// @opc-feature: custom-workflow-kinds [start]
import { VIDEO_REVERSE_NODE_TYPE } from "@/extensions/opc-infinite/services/video-reverse-contracts";
import {
    CREATION_ASSISTANT_ANALYSIS_NODE_TYPE,
    CREATION_ASSISTANT_SCRIPT_NODE_TYPE,
    CREATION_ASSISTANT_REF_SCRIPT_NODE_TYPE,
} from "@/extensions/opc-infinite/services/creation-assistant-contracts";
// @opc-feature: custom-workflow-kinds [end]

export type CanvasWorkflowNodeKind =
    | "text"
    | "script"
    | "styleboard"
    | "story_input"
    | "image"
    | "video"
    | "audio"
    | "character_cards"
    | "character_three_view"
    | "storyboard_video"
    // @opc-feature: custom-workflow-kinds [start]
    | "material_analysis"
    | "config_script"
    | "ref_script"
    | "video_reverse";
    // @opc-feature: custom-workflow-kinds [end]

export type CanvasWorkflowNodeInput = {
    ref: string;
    kind: CanvasWorkflowNodeKind;
    title: string;
    content?: string;
    prompt?: string;
    description?: string;
    shots?: Array<{ durationSeconds: number; videoMotionPrompt: string; dialogue?: string }>;
    referenceRefs?: string[];
    /** Existing canvas node ids returned by canvas_find_nodes/canvas_get_context. */
    referenceNodeIds?: string[];
    runGeneration?: boolean;
    width?: number;
    height?: number;
};

export type CanvasWorkflowInput = {
    title?: string;
    description?: string;
    nodes: CanvasWorkflowNodeInput[];
    edges?: Array<{ from: string; to: string }>;
    direction?: "horizontal" | "vertical";
    start?: { x: number; y: number };
    gap?: number;
    autoRun?: boolean;
};

// @opc-feature: custom-workflow-kinds [start]
const WORKFLOW_KINDS = new Set<CanvasWorkflowNodeKind>([
    "character_cards",
    "character_three_view",
    "storyboard_video",
    "material_analysis",
    "config_script",
    "ref_script",
    "video_reverse",
]);
// @opc-feature: custom-workflow-kinds [end]

const DEFAULT_GAP = 120;
const WORKFLOW_PREFIX = "agent-workflow";

export function buildCanvasWorkflowOps(input: CanvasWorkflowInput, snapshot: CanvasAgentSnapshot, config: AiConfig, identityPrefix?: string): CanvasAgentOp[] {
    if (!Array.isArray(input.nodes) || input.nodes.length === 0) throw new Error("工作流至少需要一个节点");
    const refs = new Set<string>();
    input.nodes.forEach((node) => {
        if (!node.ref.trim()) throw new Error("工作流节点 ref 不能为空");
        if (refs.has(node.ref)) throw new Error(`工作流节点 ref「${node.ref}」重复`);
        refs.add(node.ref);
        if (!node.title.trim()) throw new Error(`工作流节点「${node.ref}」缺少标题`);
        const type = nodeTypeForWorkflowKind(node.kind);
        // @opc-feature: custom-workflow-kinds [start]
        const isCustomKind = ["material_analysis", "config_script", "ref_script", "video_reverse"].includes(node.kind);
        if (![CanvasNodeType.Text, CanvasNodeType.Script].includes(type) && !isCustomKind && !(node.prompt || node.content || workflowPrompt(node.kind, node.title, input)).trim()) {
            throw new Error(`媒体工作流节点「${node.title}」缺少 prompt/content，不能创建空资源节点`);
        }
        // @opc-feature: custom-workflow-kinds [end]
        for (const referenceRef of node.referenceRefs || []) {
            if (!refs.has(referenceRef) && !input.nodes.some((candidate) => candidate.ref === referenceRef)) {
                throw new Error(`节点「${node.ref}」引用了不存在的节点「${referenceRef}」`);
            }
        }
        for (const referenceNodeId of node.referenceNodeIds || []) {
            if (!snapshot.nodes.some((candidate) => candidate.id === referenceNodeId)) throw new Error(`节点「${node.title}」引用的现有节点「${referenceNodeId}」不存在`);
        }
    });

    const direction = input.direction || "horizontal";
    const gap = Math.max(48, input.gap ?? DEFAULT_GAP);
    const positions = layoutWorkflowNodes(input.nodes, snapshot, direction, gap, input.start);
    const prefix = identityPrefix || WORKFLOW_PREFIX;
    const ids = new Map(input.nodes.map((node) => [node.ref, identityPrefix ? `${identityPrefix}:node:${encodeURIComponent(node.ref)}` : `${prefix}-${slug(node.ref)}-${nanoid(8)}`]));
    const ops: CanvasAgentOp[] = [];

    input.nodes.forEach((node, index) => {
        const id = ids.get(node.ref)!;
        const type = nodeTypeForWorkflowKind(node.kind);
        const size = nodeSize(type, node.kind, node.width, node.height);
        const position = positions[index];
        const prompt = node.prompt || node.content || workflowPrompt(node.kind, node.title, input);
        const metadata: CanvasNodeMetadata = {
            content: node.content || (node.kind === "text" ? node.prompt || "" : ""),
            composerContent: prompt || undefined,
            prompt: prompt || undefined,
            workflowKind: workflowKindForNode(node.kind),
            workflowTitle: input.title,
            workflowDescription: node.description || input.description,
            status: type === CanvasNodeType.Text || type === CanvasNodeType.Script ? "success" : "idle",
            generationMode: generationModeForNode(type),
            model: generationModelForNode(type, config),
            ...(node.kind === "character_three_view" ? { characterView: "multi" } : {}),
            ...(node.referenceRefs?.length || node.referenceNodeIds?.length ? {
                referenceNodeIds: [
                    ...(node.referenceRefs || []).map((ref) => ids.get(ref)).filter((id): id is string => Boolean(id)),
                    ...(node.referenceNodeIds || []),
                ],
            } : {}),
        };
        if (["styleboard", "story_input", "script"].includes(node.kind)) {
            const template = createShortDramaPipeline({ x: 0, y: 0 });
            const source = template.nodes[node.kind === "styleboard" ? 0 : node.kind === "story_input" ? 1 : 2];
            Object.assign(metadata, source.metadata, { content: node.kind === "styleboard" ? "" : node.content || "", composerContent: prompt });
            if (node.kind === "script") {
                if (!node.shots?.length) throw new Error("创建分镜工作流必须提供非空 shots，请把镜头逐行填写 durationSeconds、videoMotionPrompt、dialogue，不能仅写正文");
                if (node.shots && (!Array.isArray(node.shots) || node.shots.length > 100)) throw new Error("分镜最多 100 行");
                metadata.storyboard = { ...source.metadata!.storyboard!, rows: (node.shots || []).map((shot, rowIndex) => {
                    if (!Number.isFinite(shot.durationSeconds) || shot.durationSeconds <= 0 || typeof shot.videoMotionPrompt !== "string" || !shot.videoMotionPrompt.trim()) throw new Error("每条分镜需要有效时长和视频提示词");
                    return createStoryboardRow(rowIndex + 1, { id: `${id}:shot:${rowIndex + 1}`, durationSeconds: shot.durationSeconds, videoMotionPrompt: shot.videoMotionPrompt, dialogue: typeof shot.dialogue === "string" ? shot.dialogue : "" });
                }) };
            }
        }
        ops.push({ type: "add_node", id, nodeType: type, title: node.title, position, width: size.width, height: size.height, metadata });
    });

    const edges = input.edges !== undefined ? input.edges : input.nodes.slice(0, -1).map((node, index) => ({ from: node.ref, to: input.nodes[index + 1].ref }));
    const edgeKeys = new Set<string>();
    for (const edge of edges) {
        if (!ids.has(edge.from) || !ids.has(edge.to)) throw new Error(`工作流连线引用不存在的节点：${edge.from} → ${edge.to}`);
        if (edge.from === edge.to) throw new Error(`工作流不能连接节点自身：${edge.from}`);
        const key = `${edge.from}\0${edge.to}`;
        if (edgeKeys.has(key)) continue;
        edgeKeys.add(key);
        ops.push({ type: "connect_nodes", fromNodeId: ids.get(edge.from)!, toNodeId: ids.get(edge.to)!, ...(input.nodes.find((node) => node.ref === edge.to)?.kind === "script" ? { toHandleId: "storyboard:context" } : {}) });
    }
    for (const node of input.nodes) {
        for (const referenceRef of node.referenceRefs || []) {
            const key = `${referenceRef}\0${node.ref}`;
            if (edgeKeys.has(key)) continue;
            edgeKeys.add(key);
            ops.push({ type: "connect_nodes", fromNodeId: ids.get(referenceRef)!, toNodeId: ids.get(node.ref)!, ...(node.kind === "script" ? { toHandleId: "storyboard:context" } : {}) });
        }
        for (const referenceNodeId of node.referenceNodeIds || []) {
            const key = `${referenceNodeId}\0${node.ref}`;
            if (edgeKeys.has(key)) continue;
            edgeKeys.add(key);
            ops.push({ type: "connect_nodes", fromNodeId: referenceNodeId, toNodeId: ids.get(node.ref)!, ...(node.kind === "script" ? { toHandleId: "storyboard:context" } : {}) });
        }
    }
    const targetIds = input.nodes.map((node) => ids.get(node.ref)!);
    ops.push({ type: "select_nodes", ids: targetIds });
    if (input.autoRun || input.nodes.some((node) => node.runGeneration)) {
        input.nodes.forEach((node) => {
            const type = nodeTypeForWorkflowKind(node.kind);
            const shouldRun = input.autoRun === true || node.runGeneration === true;
            if (shouldRun && generationModeForNode(type)) ops.push({ type: "run_generation", nodeId: ids.get(node.ref)!, mode: generationModeForNode(type)!, prompt: node.prompt || node.content || workflowPrompt(node.kind, node.title, input) || undefined });
        });
    }
    return identityPrefix ? ops.map((op) => op.type === "connect_nodes" ? { ...op, id: `${identityPrefix}:edge:${encodeURIComponent(op.fromNodeId)}:${encodeURIComponent(op.toNodeId)}` } : op) : ops;
}

function workflowPrompt(kind: CanvasWorkflowNodeKind, title: string, input: CanvasWorkflowInput) {
    const workflowTitle = (input.title || input.description || "当前创作项目").trim();
    if (kind === "character_cards" || kind === "character_three_view" || kind === "storyboard_video") {
        return workflowStarterPrompt(kind, title, workflowTitle);
    }
    // @opc-feature: custom-workflow-kinds [start]
    if (kind === "material_analysis") return `请分析上游素材文件，提炼商品核心定位与7大商业洞察。`;
    if (kind === "config_script") return `请基于上游素材分析结论，生成带有时长切片与素材引用的分镜成片剧本。`;
    if (kind === "ref_script") return `请参考上游视频反推的分镜结构与运镜节奏，结合素材卖点生成复刻新剧本。`;
    if (kind === "video_reverse") return `请对参考视频逐秒抽帧与多模态拆解，输出分镜、运镜与台词。`;
    // @opc-feature: custom-workflow-kinds [end]
    return "";
}

export function looksLikeWorkflowRequest(value: string) {
    return /流水线|工作流|工作流图|管线|节点图|连线|pipeline|workflow/i.test(value);
}

export function isWorkflowNodeKind(kind: string): kind is CanvasWorkflowNodeKind {
    return WORKFLOW_KINDS.has(kind as CanvasWorkflowNodeKind);
}

function layoutWorkflowNodes(nodes: CanvasWorkflowNodeInput[], snapshot: CanvasAgentSnapshot, direction: "horizontal" | "vertical", gap: number, start?: { x: number; y: number }) {
    const maxX = snapshot.nodes.reduce((max, node) => Math.max(max, node.position.x + node.width), 0);
    const maxY = snapshot.nodes.reduce((max, node) => Math.max(max, node.position.y + node.height), 0);
    const origin = start || { x: snapshot.nodes.length ? maxX + 160 : 80, y: snapshot.nodes.length ? Math.max(80, maxY - 520) : 80 };
    let cursor = { ...origin };
    return nodes.map((node) => {
        const type = nodeTypeForWorkflowKind(node.kind);
        const size = nodeSize(type, node.kind, node.width, node.height);
        const position = { ...cursor };
        if (direction === "vertical") cursor = { x: origin.x, y: cursor.y + size.height + gap };
        else cursor = { x: cursor.x + size.width + gap, y: origin.y };
        return position;
    });
}

function nodeTypeForWorkflowKind(kind: CanvasWorkflowNodeKind) {
    // @opc-feature: custom-workflow-kinds [start]
    if (kind === "material_analysis") return CREATION_ASSISTANT_ANALYSIS_NODE_TYPE as any;
    if (kind === "config_script") return CREATION_ASSISTANT_SCRIPT_NODE_TYPE as any;
    if (kind === "ref_script") return CREATION_ASSISTANT_REF_SCRIPT_NODE_TYPE as any;
    if (kind === "video_reverse") return VIDEO_REVERSE_NODE_TYPE as any;
    // @opc-feature: custom-workflow-kinds [end]
    if (kind === "script") return CanvasNodeType.Script;
    if (kind === "image" || kind === "character_cards" || kind === "character_three_view") return CanvasNodeType.Image;
    if (kind === "video" || kind === "storyboard_video") return CanvasNodeType.Video;
    if (kind === "audio") return CanvasNodeType.Audio;
    return CanvasNodeType.Text;
}

function nodeSize(type: CanvasNodeType, kind: CanvasWorkflowNodeKind, width?: number, height?: number) {
    // @opc-feature: custom-workflow-kinds [start]
    if (kind === "material_analysis" || kind === "config_script" || kind === "ref_script" || kind === "video_reverse") {
        return { width: width || 690, height: height || 540 };
    }
    // @opc-feature: custom-workflow-kinds [end]
    const defaults = NODE_DEFAULT_SIZE[type];
    const preferred = kind === "character_cards" || kind === "character_three_view"
        ? { width: 560, height: 380 }
        : kind === "storyboard_video"
            ? { width: 640, height: 360 }
            : defaults;
    return { width: width || preferred.width, height: height || preferred.height };
}

function workflowKindForNode(kind: CanvasWorkflowNodeKind): CanvasNodeMetadata["workflowKind"] {
    if (kind === "character_cards") return "character";
    if (kind === "character_three_view") return "character";
    if (kind === "storyboard_video") return "storyboard";
    if (kind === "script") return "script";
    return "free";
}

function generationModeForNode(type: CanvasNodeType) {
    if (type === CanvasNodeType.Image) return "image" as const;
    if (type === CanvasNodeType.Video) return "video" as const;
    if (type === CanvasNodeType.Audio) return "audio" as const;
    return undefined;
}

function generationModelForNode(type: CanvasNodeType, config: AiConfig) {
    const mode = generationModeForNode(type);
    if (!mode) return undefined;
    return mode === "image" ? config.imageModel : mode === "video" ? config.videoModel : config.audioModel;
}

function slug(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "node";
}

export function workflowNodeIdsFromOps(ops: CanvasAgentOp[]) {
    return ops.filter((op): op is Extract<CanvasAgentOp, { type: "add_node" }> => op.type === "add_node" && Boolean(op.id)).map((op) => op.id!);
}
