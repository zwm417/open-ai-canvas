import { nanoid } from "nanoid";
import type { CanvasBatchRow, CanvasBatchTableData, CanvasConnection, CanvasNodeData } from "@/types/canvas";

export const VOICE_PROMPT_TAG_REGEX = /[（(]?(?:配音采用\s*@配音|音色(?:风格)?参考\s*@参考音色[，,\s]*(?:情绪(?:风格)?参考\s*@参考情绪)?|情绪(?:风格)?参考\s*@参考情绪|@配音|@参考音色|@参考情绪)[)）]?/g;

export function stripVoicePromptTags(text: string): string {
    if (!text) return "";
    return text.replace(VOICE_PROMPT_TAG_REGEX, "").replace(/\s{2,}/g, " ").trim();
}

export function syncVoiceTableRowsToStoryboard({
    voiceNode,
    storyboardNode,
    nodes,
    connections,
}: {
    voiceNode: CanvasNodeData;
    storyboardNode: CanvasNodeData;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
}): {
    updatedStoryboardNode: CanvasNodeData;
    newConnections: CanvasConnection[];
} {
    const voiceTable = voiceNode.metadata?.batchTable as CanvasBatchTableData | undefined;
    const storyboardTable = storyboardNode.metadata?.batchTable as CanvasBatchTableData | undefined;

    if (!voiceTable?.rows?.length || !storyboardTable?.rows?.length) {
        return { updatedStoryboardNode: storyboardNode, newConnections: connections };
    }

    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const voiceColumnIndex = storyboardTable.referenceColumns?.findIndex(
        (c) => c.id === "ref-voiceover" || c.label?.includes("配音")
    ) ?? -1;

    const nextStoryboardRows: CanvasBatchRow[] = storyboardTable.rows.map((sRow, index) => {
        const vRow = voiceTable.rows[index];
        if (!vRow) return sRow;

        const cells = { ...(sRow.cells || {}) };

        // 4. “改写文案”生效后：作为配音合成文本，且下游分镜表中的口播/画外音台词自动同步替换
        const rewritten = vRow.cells?.["col-rewrite"]?.trim();
        const original = vRow.cells?.["col-lines"]?.trim() || "";
        const effectiveDialogue = rewritten || original;
        if (effectiveDialogue) {
            cells["col-lines"] = effectiveDialogue;
        }

        if (rewritten && original && rewritten !== original) {
            if (cells["col-creative-prompt"] && cells["col-creative-prompt"].includes(original)) {
                cells["col-creative-prompt"] = cells["col-creative-prompt"].replaceAll(original, rewritten);
            }
            if (sRow.prompt && sRow.prompt.includes(original)) {
                sRow.prompt = sRow.prompt.replaceAll(original, rewritten);
            }
        }

        // 1、2、3: 声音素材与 @ 提示词规则
        const hasSynthesizedAudio = Boolean(vRow.outputNodeId && nodeById.has(vRow.outputNodeId));
        const hasRefVoice = Boolean(vRow.inputNodeIds?.[0] && nodeById.has(vRow.inputNodeIds[0]));
        const hasRefTone = Boolean(vRow.inputNodeIds?.[1] && nodeById.has(vRow.inputNodeIds[1]));

        let promptCleaned = stripVoicePromptTags(sRow.prompt || "");
        let motionCleaned = stripVoicePromptTags(cells["col-motion-prompt"] || "");
        let creativeCleaned = stripVoicePromptTags(cells["col-creative-prompt"] || "");

        let nextPrompt = sRow.prompt || "";
        if (hasSynthesizedAudio) {
            // 规则 1：若最终生成了新配音：分镜表直接使用对应新配音音频节点，分镜提示词内自动使用 @配音 要求采用该成品配音
            const voiceTag = "（配音采用 @配音）";
            nextPrompt = promptCleaned ? `${promptCleaned} ${voiceTag}` : `@配音`;
            if (cells["col-motion-prompt"]) {
                cells["col-motion-prompt"] = `${motionCleaned} ${voiceTag}`;
            }
            if (cells["col-creative-prompt"]) {
                cells["col-creative-prompt"] = `${creativeCleaned} ${voiceTag}`;
            }
        } else if (hasRefVoice || hasRefTone) {
            // 规则 2：若输入了“参考音色”/“参考情绪”但未生成新配音：分镜表提示词内自动 @参考音色 / @参考情绪，要求大模型生视频时参考该音色风格
            let voiceTag = "";
            if (hasRefVoice && hasRefTone) {
                voiceTag = "（音色风格参考 @参考音色，情绪风格参考 @参考情绪）";
            } else if (hasRefVoice) {
                voiceTag = "（音色风格参考 @参考音色）";
            } else {
                voiceTag = "（情绪风格参考 @参考情绪）";
            }
            const defaultTag = hasRefVoice ? "@参考音色" : "@参考情绪";
            nextPrompt = promptCleaned ? `${promptCleaned} ${voiceTag}` : defaultTag;
            if (cells["col-motion-prompt"]) {
                cells["col-motion-prompt"] = `${motionCleaned} ${voiceTag}`;
            }
            if (cells["col-creative-prompt"]) {
                cells["col-creative-prompt"] = `${creativeCleaned} ${voiceTag}`;
            }
        } else {
            // 规则 3：若未上传任何参考声音：不引用任何声音素材
            nextPrompt = promptCleaned;
            if (cells["col-motion-prompt"]) {
                cells["col-motion-prompt"] = motionCleaned;
            }
            if (cells["col-creative-prompt"]) {
                cells["col-creative-prompt"] = creativeCleaned;
            }
        }

        // 同步插槽：将生成的配音节点（或参考音色）填入分镜表的创意配音插槽
        let inputNodeIds = sRow.inputNodeIds ? [...sRow.inputNodeIds] : [];
        if (voiceColumnIndex !== -1) {
            while (inputNodeIds.length <= voiceColumnIndex) inputNodeIds.push("");
            if (hasSynthesizedAudio && vRow.outputNodeId) {
                inputNodeIds[voiceColumnIndex] = vRow.outputNodeId;
            } else if (hasRefVoice && vRow.inputNodeIds?.[0]) {
                inputNodeIds[voiceColumnIndex] = vRow.inputNodeIds[0];
            } else {
                inputNodeIds[voiceColumnIndex] = "";
            }
        }

        return {
            ...sRow,
            prompt: nextPrompt,
            inputNodeIds,
            cells,
        };
    });

    const updatedStoryboardNode: CanvasNodeData = {
        ...storyboardNode,
        metadata: {
            ...storyboardNode.metadata,
            batchTable: {
                ...storyboardTable,
                rows: nextStoryboardRows,
            },
        },
    };

    // 同步生成的新配音音频节点到分镜总装表的拓扑连接
    const targetConns = [...connections];
    const existingConnKeys = new Set(targetConns.map((c) => `${c.fromNodeId}->${c.toNodeId}:${c.toHandleId || ""}`));

    voiceTable.rows.forEach((vRow) => {
        if (vRow.outputNodeId && nodeById.has(vRow.outputNodeId)) {
            const key = `${vRow.outputNodeId}->${storyboardNode.id}:batch-reference:ref-voiceover`;
            if (!existingConnKeys.has(key)) {
                targetConns.push({
                    id: `conn-voice-output-${nanoid()}`,
                    fromNodeId: vRow.outputNodeId,
                    fromHandleId: "output",
                    toNodeId: storyboardNode.id,
                    toHandleId: "batch-reference:ref-voiceover",
                    relation: "batch-input",
                });
                existingConnKeys.add(key);
            }
        }
    });

    return {
        updatedStoryboardNode,
        newConnections: targetConns,
    };
}
