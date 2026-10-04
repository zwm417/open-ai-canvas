// @opc-feature: hypit [start]
/**
 * 工业化短剧与广告创意管线：
 * 阶段一：创意反推 (Creative Reverse - 高精度镜头拆解与词级打标)
 * 阶段二：创意复刻 (Creative Replication - 编导分镜重构与多维表格映射)
 * 对齐工业级 Prompt Kit 规范 (iPhone UGC 四段式、Hygiene 画面防乱码字幕、词级微动作绑定与模型物理时长容量红线)
 */
import { http } from "@/services/api/request";
import { getVaultPromptSync, fetchVaultPrompt, VAULT_PROMPT_IDS } from "@/services/api/prompt-vault";

export type CreativeReplicationVideoModelOption = {
    value: string;
    label: string;
    defaultDuration: number;
    maxDuration: number;
    description?: string;
};

export type HypitVideoModelOption = CreativeReplicationVideoModelOption;

export const CREATIVE_REPLICATION_VIDEO_MODEL_OPTIONS: CreativeReplicationVideoModelOption[] = [
    { value: "kling-v1-6", label: "快手可灵 Kling (5s / 10s)", defaultDuration: 5, maxDuration: 10, description: "支持5秒或10秒，微动作自然" },
    { value: "minimax-video-01", label: "MiniMax 海螺 Hailuo (6s / 10s)", defaultDuration: 6, maxDuration: 10, description: "支持6秒或10秒，电影质感与光影" },
    { value: "cogvideox", label: "智谱清影 CogVideoX (5s / 10s)", defaultDuration: 5, maxDuration: 10, description: "支持5秒或10秒，稳定可控" },
    { value: "luma-dream-machine", label: "Luma Dream Machine (5s)", defaultDuration: 5, maxDuration: 5, description: "支持5秒，镜头冲击力强" },
    { value: "runway-gen3", label: "Runway Gen-3 Alpha (5s / 10s)", defaultDuration: 5, maxDuration: 10, description: "支持5秒或10秒，高写实运镜" },
    { value: "seedance-2-fast", label: "Seedance 2.0 Fast (5s - 15s)", defaultDuration: 5, maxDuration: 15, description: "支持5至15秒连续生成" },
    { value: "omni-flash", label: "Omni Flash (10s)", defaultDuration: 10, maxDuration: 10, description: "标准10秒长镜头" },
    { value: "custom-adaptive", label: "自适应分镜 (根据切点动态卡点)", defaultDuration: 4, maxDuration: 12, description: "基于镜头本身情绪起承转合设定" },
];

export const HYPIT_VIDEO_MODEL_OPTIONS = CREATIVE_REPLICATION_VIDEO_MODEL_OPTIONS;

export type CreativeReplicationShotType = "a-roll" | "b-roll" | "pov" | "l-cut" | "split";

export interface CreativeReplicationCoverSlot {
    targetWord: string;
    coverDurationSec: number;
    assetId?: string;
    assetLabel: string;
    coverPrompt?: string;
    active?: boolean;
}

export interface CreativeReplicationGhostSnap {
    targetWord: string;
    suggestedLabel: string;
    matchScore: number;
    reason?: string;
}

export interface CreativeReplicationShot {
    shotNumber: number;
    shotType: CreativeReplicationShotType;
    timeRange: string;
    startSec: number;
    endSec: number;
    durationSec: number;
    lines: string;
    spokenLines?: string;
    words?: string;
    characterAnchor?: string;
    productAnchor?: string;
    sceneAnchor?: string;
    imagePrompt: string;
    speaker?: string;
    voiceTone?: string;
    voiceLine?: string;
    camera?: string;
    visualAction?: string;
    soundFx?: string;
    motionPrompt: string;
    creativePrompt?: string;
    keyframePrompt?: string;
    videoMotionPrompt?: string;
    targetSlots?: string[];
    brollCoverSlot?: CreativeReplicationCoverSlot;
    ghostSnaps?: CreativeReplicationGhostSnap[];
}

export interface CreativeReplicationAssetSlot {
    slotId: string;
    category: "character" | "product" | "scene" | string;
    name: string;
    matchedAsset?: string | null;
    visualDesc: string;
    promptTxt2Img: string;
    promptImg2Img: string;
}

/**
 * 提取台词在 TTS 语音合成时的朗读文本：
 * 将 `<显示文本|朗读发音>` 语法转换为朗读发音（例如 `<¥19.9|十九块九>` -> `十九块九`）
 */
export function resolveDualTextForSpeech(text: string): string {
    if (!text || typeof text !== "string") return "";
    return text.replace(/<([^|>]+)\|([^>]+)>/g, "$2").trim();
}

/**
 * 提取台词在画面、字幕与提示词中的显示文本：
 * 将 `<显示文本|朗读发音>` 语法转换为显示文本（例如 `<¥19.9|十九块九>` -> `¥19.9`）
 */
export function resolveDualTextForDisplay(text: string): string {
    if (!text || typeof text !== "string") return "";
    return text.replace(/<([^|>]+)\|([^>]+)>/g, "$1").trim();
}

export interface MasterSlotItem {
    id?: string;
    name: string;
    imageUrl?: string;
    voiceReferenceId?: string;
    promptAnchor?: string;
}

export interface CreativeReplicationMasterSlots {
    actor: MasterSlotItem;
    product: MasterSlotItem;
    scene: MasterSlotItem;
}

export interface CreativeReplicationVariation {
    id: string;
    name: string;
    masterSlots: CreativeReplicationMasterSlots;
    shots: CreativeReplicationShot[];
}

/**
 * 动态从后端金库获取创意反推逐镜头全息解构系统提示词。
 * 核心资产物理存储于后端统一提示词金库 (backend/internal/custom/opc-vault/assets/creative-reverse.md)，
 * 避免在前端静态打包产物中泄漏商业机密。
 */
export async function fetchCreativeReversePrompt(): Promise<string> {
    return fetchVaultPrompt(VAULT_PROMPT_IDS.CREATIVE_REVERSE);
}

/**
 * 动态从后端金库获取创意复刻系统提示词。
 */
export async function fetchCreativeReplicationPrompt(): Promise<string> {
    return fetchVaultPrompt(VAULT_PROMPT_IDS.CREATIVE_REPLICATION);
}

export const CREATIVE_REVERSE_SHOT_DECONSTRUCTION_SYSTEM_PROMPT = getVaultPromptSync(VAULT_PROMPT_IDS.CREATIVE_REVERSE);
export const HYPIT_SHOT_DECONSTRUCTION_SYSTEM_PROMPT = CREATIVE_REVERSE_SHOT_DECONSTRUCTION_SYSTEM_PROMPT;

export const CREATIVE_REPLICATION_DIRECTOR_SYSTEM_PROMPT = getVaultPromptSync(VAULT_PROMPT_IDS.CREATIVE_REPLICATION);

export const HYPIT_CREATIVE_DIRECTOR_SYSTEM_PROMPT = CREATIVE_REPLICATION_DIRECTOR_SYSTEM_PROMPT;

/**
 * 健壮的 JSON 自动修复与容错解析器：
 * 1. 清理 Markdown 标记
 * 2. 消除尾逗号 (Trailing Commas)
 * 3. 修复字符串中未转义的换行与控制字符
 * 4. 兜底逐镜头正则提取 (Partial Shot Recovery)，保证即使末尾截断也不会丢失已生成镜头
 */
function enrichShotTiming(shot: any) {
    if (!shot || typeof shot !== "object") return;
    if (shot.timeRange && (shot.startSec === undefined || shot.endSec === undefined)) {
        const match = String(shot.timeRange).match(/(?:(\d+):)?(\d+(?:\.\d+)?)s?\s*[-~到至—]\s*(?:(\d+):)?(\d+(?:\.\d+)?)s?/);
        if (match) {
            const startM = match[1] ? parseFloat(match[1]) : 0;
            const startS = parseFloat(match[2]);
            const endM = match[3] ? parseFloat(match[3]) : 0;
            const endS = parseFloat(match[4]);
            const startSec = Math.round((startM * 60 + startS) * 10) / 10;
            const endSec = Math.round((endM * 60 + endS) * 10) / 10;
            shot.startSec = startSec;
            shot.endSec = endSec;
            if (shot.durationSec === undefined || shot.durationSec <= 0) {
                shot.durationSec = Math.max(0.1, Math.round((endSec - startSec) * 10) / 10);
            }
        } else if (shot.durationSec === undefined || shot.durationSec <= 0) {
            const durMatch = String(shot.timeRange).match(/\((\d+(?:\.\d+)?)\s*s\)/i);
            if (durMatch) {
                shot.durationSec = parseFloat(durMatch[1]);
            }
        }
    }
}

export function parseDirectorJson<T = any>(text: string): T | null {
    if (!text) return null;

    // 1. 尝试提取 json 代码块或大括号
    let rawJson = "";
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (jsonMatch && jsonMatch[1]) {
        rawJson = jsonMatch[1].trim();
    } else {
        const braceMatch = text.match(/\{[\s\S]*\}/);
        if (braceMatch) {
            rawJson = braceMatch[0].trim();
        }
    }

    if (!rawJson) return null;

    // 2. 清洗常见的大模型 JSON 瑕疵
    const sanitized = rawJson
        .replace(/,\s*([\]}])/g, "$1") // 移除尾逗号 ,} 或 ,]
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => (c === "\n" || c === "\r" || c === "\t" ? c : "")); // 移除非法控制字符

    try {
        const parsed = JSON.parse(sanitized);
        if (parsed && Array.isArray((parsed as any).shots)) {
            (parsed as any).shots.forEach(enrichShotTiming);
        }
        return parsed;
    } catch {
        // 如果依然失败，尝试修复字符串内部的直接换行
        try {
            const repairedNewlines = sanitized.replace(/(?<="[^"]*)\n(?=[^"]*")/g, "\\n");
            const parsed = JSON.parse(repairedNewlines);
            if (parsed && Array.isArray((parsed as any).shots)) {
                (parsed as any).shots.forEach(enrichShotTiming);
            }
            return parsed;
        } catch {
            // 尝试对意外截断未闭合的 shots 数组进行自动补全闭合
            if (sanitized.includes('"shots"') && !sanitized.trim().endsWith("}")) {
                const lastBrace = sanitized.lastIndexOf("}");
                if (lastBrace > 0) {
                    const candidate = sanitized.slice(0, lastBrace + 1) + "\n]}";
                    try {
                        const repaired = JSON.parse(candidate);
                        if (repaired && Array.isArray((repaired as any).shots)) {
                            (repaired as any).shots.forEach(enrichShotTiming);
                            return repaired as T;
                        }
                    } catch {
                        // 继续进入步骤 3 的正则部分挽救
                    }
                }
            }
        }
    }

    // 3. 终极兜底：逐镜头对象正则挽救 (Resilient Shot Recovery)
    try {
        const shotBlocks = text.match(/\{\s*"shotNumber"[\s\S]*?\}(?=\s*[,\]]|\s*$)/g);
        if (shotBlocks && shotBlocks.length > 0) {
            const recoveredShots: any[] = [];
            for (const block of shotBlocks) {
                try {
                    const cleanBlock = block.replace(/,\s*([\]}])/g, "$1");
                    const parsedShot = JSON.parse(cleanBlock);
                    if (parsedShot && (parsedShot.shotNumber || parsedShot.lines || parsedShot.imagePrompt)) {
                        enrichShotTiming(parsedShot);
                        recoveredShots.push(parsedShot);
                    }
                } catch {
                    // 忽略单个无法解析的损坏块
                }
            }
            if (recoveredShots.length > 0) {
                let recoveredAssetSlots: any[] | undefined;
                const slotsMatch = text.match(/"assetSlots"\s*:\s*(\[[^\]]*\])/);
                if (slotsMatch) {
                    try {
                        recoveredAssetSlots = JSON.parse(slotsMatch[1]);
                    } catch {}
                }
                let recoveredMasterSlots: any = undefined;
                const omsMatch = text.match(/"(?:originalMasterSlots|coreElements)"\s*:\s*(\{[^}]*\})/);
                if (omsMatch) {
                    try {
                        recoveredMasterSlots = JSON.parse(omsMatch[1]);
                    } catch {}
                }
                return {
                    title: "创意反推分镜表 (自动挽救)",
                    aspectRatio: "9:16",
                    assetSlots: recoveredAssetSlots,
                    originalMasterSlots: recoveredMasterSlots,
                    coreElements: recoveredMasterSlots,
                    shots: recoveredShots,
                } as unknown as T;
            }
        }
    } catch (e) {
        console.warn("Failed to rescue shots from broken JSON:", e);
    }

    return null;
}

export const parseHypitJson = parseDirectorJson;

/**
 * 零重算资产快换 (Zero-Recompute Hot-Swapping):
 * 纯客户端/本地毫秒级重构，大模型 Token 消耗 = 0。
 * 当用户在“三大全局母版资产槽”中更换角色、商品或场景时，
 * 保持全片台词、镜头时长、字级时间戳与运镜轨迹 100% 刚性冻结，
 * 仅安全替换 Prompt 中的主体锚点、视觉描述与台词品名变量。
 */
export function hotSwapStoryboardAssets(params: {
    shots: any[];
    oldSlots?: Partial<CreativeReplicationMasterSlots>;
    newSlots: Partial<CreativeReplicationMasterSlots>;
    productNameSwap?: { oldName: string; newName: string; newSpoken?: string };
}): any[] {
    if (!Array.isArray(params.shots) || params.shots.length === 0) return [];

    const { actor, product, scene } = params.newSlots;
    const { oldName, newName, newSpoken } = params.productNameSwap || {};

    return params.shots.map((shot) => {
        const nextShot = { ...shot };

        // 1. 如果换了角色 (Actor)
        if (actor) {
            if (actor.name && (!nextShot.speaker || nextShot.speaker === params.oldSlots?.actor?.name || nextShot.speaker === "出镜主角")) {
                nextShot.speaker = actor.name;
            }
            if (actor.promptAnchor) {
                const oldAnchor = params.oldSlots?.actor?.promptAnchor || shot.characterAnchor;
                nextShot.characterAnchor = actor.promptAnchor;
                // 若明确提供了旧锚点或分镜记录了角色锚点且原提示词命中，优先全局安全替换（不受 shotType 限制）
                if (oldAnchor && nextShot.imagePrompt && nextShot.imagePrompt.includes(oldAnchor)) {
                    nextShot.imagePrompt = nextShot.imagePrompt.replaceAll(oldAnchor, actor.promptAnchor);
                } else if (nextShot.imagePrompt && (nextShot.shotType === "a-roll" || !nextShot.shotType)) {
                    if (nextShot.imagePrompt.includes("\n\n")) {
                        const paragraphs = nextShot.imagePrompt.split("\n\n");
                        if (paragraphs.length >= 2) {
                            paragraphs[1] = actor.promptAnchor;
                            nextShot.imagePrompt = paragraphs.join("\n\n");
                        }
                    }
                }
            }
        }

        // 2. 如果换了商品 (Product)
        if (product) {
            if (product.promptAnchor) {
                const oldAnchor = params.oldSlots?.product?.promptAnchor || shot.productAnchor;
                nextShot.productAnchor = product.promptAnchor;
                // 若明确提供了旧商品锚点或分镜记录了商品锚点且原提示词命中，优先全局替换
                if (oldAnchor && nextShot.imagePrompt && nextShot.imagePrompt.includes(oldAnchor)) {
                    nextShot.imagePrompt = nextShot.imagePrompt.replaceAll(oldAnchor, product.promptAnchor);
                } else if (nextShot.imagePrompt && (nextShot.shotType === "b-roll" || nextShot.shotType === "l-cut")) {
                    if (nextShot.imagePrompt.includes("\n\n")) {
                        const paragraphs = nextShot.imagePrompt.split("\n\n");
                        if (paragraphs.length >= 3) {
                            paragraphs[2] = product.promptAnchor;
                            nextShot.imagePrompt = paragraphs.join("\n\n");
                        }
                    }
                }
            }
        }

        // 3. 如果换了品名变量替换 (Smart Product Token)
        if (oldName && newName && oldName.trim() !== newName.trim()) {
            const regex = new RegExp(oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
            if (nextShot.lines) {
                nextShot.lines = nextShot.lines.replace(regex, newName);
            }
            if (nextShot.voiceLine) {
                nextShot.voiceLine = nextShot.voiceLine.replace(regex, newName);
            }
            if (nextShot.words) {
                nextShot.words = nextShot.words.replace(regex, newName);
            }
            if (nextShot.imagePrompt) {
                nextShot.imagePrompt = nextShot.imagePrompt.replace(regex, newName);
            }
            if (nextShot.motionPrompt) {
                nextShot.motionPrompt = nextShot.motionPrompt.replace(regex, newName);
            }
            if (nextShot.creativePrompt) {
                nextShot.creativePrompt = nextShot.creativePrompt.replace(regex, newName);
            }
            if (newSpoken && nextShot.spokenLines) {
                nextShot.spokenLines = nextShot.spokenLines.replace(regex, `<${newName}|${newSpoken}>`);
            }
            if (nextShot.brollCoverSlot) {
                const cs = nextShot.brollCoverSlot;
                nextShot.brollCoverSlot = {
                    ...cs,
                    targetWord: cs.targetWord ? cs.targetWord.replace(regex, newName) : cs.targetWord,
                    assetLabel: cs.assetLabel ? cs.assetLabel.replace(regex, newName) : (cs.coverDescription ? cs.coverDescription.replace(regex, newName) : ""),
                    coverPrompt: cs.coverPrompt ? cs.coverPrompt.replace(regex, newName) : (cs.coverVisualPrompt ? cs.coverVisualPrompt.replace(regex, newName) : ""),
                    coverDescription: cs.coverDescription ? cs.coverDescription.replace(regex, newName) : (cs.assetLabel ? cs.assetLabel.replace(regex, newName) : ""),
                    coverVisualPrompt: cs.coverVisualPrompt ? cs.coverVisualPrompt.replace(regex, newName) : (cs.coverPrompt ? cs.coverPrompt.replace(regex, newName) : ""),
                };
            }
            if (Array.isArray(nextShot.ghostSnaps)) {
                nextShot.ghostSnaps = nextShot.ghostSnaps.map((gs: any) => ({
                    ...gs,
                    targetWord: gs.targetWord ? gs.targetWord.replace(regex, newName) : gs.targetWord,
                    suggestedLabel: gs.suggestedLabel ? gs.suggestedLabel.replace(regex, newName) : gs.suggestedLabel,
                    recommendedPrompt: gs.recommendedPrompt ? gs.recommendedPrompt.replace(regex, newName) : "",
                }));
            }
        }

        // 4. 如果换了场景 (Scene)
        if (scene && scene.promptAnchor) {
            const oldAnchor = params.oldSlots?.scene?.promptAnchor || shot.sceneAnchor;
            nextShot.sceneAnchor = scene.promptAnchor;
            if (nextShot.imagePrompt) {
                if (oldAnchor && nextShot.imagePrompt.includes(oldAnchor)) {
                    nextShot.imagePrompt = nextShot.imagePrompt.replaceAll(oldAnchor, scene.promptAnchor);
                } else if (nextShot.imagePrompt.includes("\n\n")) {
                    const paragraphs = nextShot.imagePrompt.split("\n\n");
                    if (paragraphs.length >= 3) {
                        paragraphs[paragraphs.length - 1] = scene.promptAnchor;
                        nextShot.imagePrompt = paragraphs.join("\n\n");
                    }
                }
            }
        }

        return nextShot;
    });
}

/**
 * 派生新版本变体 (Fork Variation):
 * 基于当前母版资产与分镜数据派生一个新变体分支，用于换品/换人/换场景的 AB 测。
 * 自动计算不重复的自增版本序号，彻底杜绝在多次派生与中间删除后的 ID 冲突。
 */
export function forkVariation(
    variations: CreativeReplicationVariation[],
    currentSlots: CreativeReplicationMasterSlots,
    currentShots: CreativeReplicationShot[]
): { nextVars: CreativeReplicationVariation[]; newVar: CreativeReplicationVariation } {
    const maxIdx = (variations || []).reduce((max, v) => {
        const num = parseInt(v.id.replace(/\D/g, ""), 10);
        return isNaN(num) ? max : Math.max(max, num);
    }, 0);
    const nextNum = maxIdx + 1;
    const newId = `v${nextNum}`;
    const newName = `版本 ${nextNum} (变体)`;
    const newVar: CreativeReplicationVariation = {
        id: newId,
        name: newName,
        masterSlots: JSON.parse(JSON.stringify(currentSlots || {})),
        shots: JSON.parse(JSON.stringify(currentShots || [])),
    };
    return {
        nextVars: [...(variations || []), newVar],
        newVar,
    };
}

/**
 * 删除版本变体 (Delete Variation):
 * 安全删除指定变体分支；若仅剩 1 个版本则静默保护不予删除；
 * 若删除的正是当前处于激活状态的变体，自动无缝平滑切回相邻版本或原版基准，避免状态脱靶。
 */
export function deleteVariation(
    variations: CreativeReplicationVariation[],
    varIdToDelete: string,
    currentActiveId: string
): {
    nextVars: CreativeReplicationVariation[];
    deletedVar: CreativeReplicationVariation | null;
    nextActiveId: string;
    switched: boolean;
} {
    if (!Array.isArray(variations) || variations.length <= 1) {
        return {
            nextVars: variations || [],
            deletedVar: null,
            nextActiveId: currentActiveId,
            switched: false,
        };
    }

    const targetIndex = variations.findIndex((v) => v.id === varIdToDelete);
    if (targetIndex === -1) {
        return {
            nextVars: variations,
            deletedVar: null,
            nextActiveId: currentActiveId,
            switched: false,
        };
    }

    const deletedVar = variations[targetIndex];
    const nextVars = variations.filter((v) => v.id !== varIdToDelete);

    let nextActiveId = currentActiveId;
    let switched = false;

    if (currentActiveId === varIdToDelete) {
        // 优先切回上一个版本，若无上一个则切至第一个版本
        const fallback = nextVars[Math.max(0, targetIndex - 1)] || nextVars[0];
        nextActiveId = fallback.id;
        switched = true;
    }

    return {
        nextVars,
        deletedVar,
        nextActiveId,
        switched,
    };
}

/**
 * 画面净化与内容脱敏：清除文本中的 JSON 代码块与裸 JSON，防止在用户端显示框中暴露底层分析 JSON
 */
export function stripJsonCodeBlocks(text: string): string {
    if (!text) return "";
    return text
        .replace(/```(?:json)?\s*[\s\S]*?```/gi, "")
        .replace(/\{\s*"title"[\s\S]*\}\s*$/gi, "")
        .trim();
}

/**
 * 从工业级全息 Markdown 文本中自动解析并提取结构化镜头列表 (CreativeReplicationShot[])
 * 完美支持纯 Markdown 格式的“逐镜头全息工程图纸”向下游多维表格与自动化管线流转
 * 具备多行缩进、子列表、段落自动聚合能力，杜绝“画面内容”因分项换行而解析为空
 */
export function parseMarkdownShots(text: string): CreativeReplicationShot[] {
    if (!text || typeof text !== "string") return [];
    const shots: CreativeReplicationShot[] = [];
    const shotRegex = /(?:^|\n)###\s*镜头\s*(\d+)\s*(?:\[([^\]]+)\])?\s*([^\n]*)/gi;
    const matches: { index: number; shotNumber: number; shotType: string; timeRange: string; fullMatch: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = shotRegex.exec(text)) !== null) {
        matches.push({
            index: m.index,
            shotNumber: parseInt(m[1], 10),
            shotType: m[2] ? m[2].trim().toLowerCase() : "a-roll",
            timeRange: m[3] ? m[3].trim() : "",
            fullMatch: m[0],
        });
    }
    if (matches.length === 0) return [];

    for (let i = 0; i < matches.length; i++) {
        const current = matches[i];
        const nextIndex = i + 1 < matches.length ? matches[i + 1].index : text.length;
        const block = text.slice(current.index + current.fullMatch.length, nextIndex).trim();

        const shot: any = {
            shotNumber: current.shotNumber,
            shotType: (current.shotType || "a-roll") as CreativeReplicationShotType,
            timeRange: current.timeRange,
            lines: "",
            imagePrompt: "",
            motionPrompt: "",
        };
        enrichShotTiming(shot);

        const lines = block.split(/\r?\n/);
        let currentKey: string | null = null;

        const assignProp = (key: string, val: string, isAppend: boolean) => {
            const cleanVal = val.trim();
            if (!cleanVal) return;
            if (/景别机位|景别|机位/.test(key)) {
                shot.camera = isAppend && shot.camera ? `${shot.camera} | ${cleanVal}` : cleanVal;
            } else if (/画面内容|画面/.test(key)) {
                shot.visualAction = isAppend && shot.visualAction ? `${shot.visualAction}；${cleanVal}` : cleanVal;
                shot.visualContent = shot.visualAction;
            } else if (/表演时序|微动作时序|微动作/.test(key)) {
                shot.performanceTiming = isAppend && shot.performanceTiming ? `${shot.performanceTiming} -> ${cleanVal}` : cleanVal;
            } else if (/物理反馈|力学/.test(key)) {
                shot.physicalFeedback = isAppend && shot.physicalFeedback ? `${shot.physicalFeedback}；${cleanVal}` : cleanVal;
            } else if (/原片台词|台词|对白/.test(key)) {
                shot.dialogue = isAppend && shot.dialogue ? `${shot.dialogue} ${cleanVal}` : cleanVal;
                shot.lines = shot.dialogue;
            } else if (/语言与语速|语调|语速/.test(key)) {
                shot.voiceTone = isAppend && shot.voiceTone ? `${shot.voiceTone} | ${cleanVal}` : cleanVal;
                const wtMatch = cleanVal.match(/时间轴[：:]\s*([^\s|]+(?:\s+\[[^\]]+\]|\s+\d+(?:\.\d+)?s\[[^\]]+\])*)/i) || cleanVal.match(/时间轴[：:]\s*([^|]+)/i);
                if (wtMatch) {
                    shot.wordTimings = wtMatch[1].trim();
                }
            } else if (/视听氛围|音效|光影/.test(key)) {
                shot.soundFx = isAppend && shot.soundFx ? `${shot.soundFx} · ${cleanVal}` : cleanVal;
            } else if (/剪辑与功能|剪辑|功能|叙事/.test(key)) {
                shot.narrativeFunction = isAppend && shot.narrativeFunction ? `${shot.narrativeFunction} · ${cleanVal}` : cleanVal;
            } else if (/吸睛钩子|钩子/.test(key)) {
                shot.hookType = isAppend && shot.hookType ? `${shot.hookType} · ${cleanVal}` : cleanVal;
            } else if (/置换锚点|核心锚点|锚点/.test(key)) {
                shot.focalAnchor = isAppend && shot.focalAnchor ? `${shot.focalAnchor} · ${cleanVal}` : cleanVal;
                shot.productAnchor = shot.focalAnchor;
            } else if (/转场/.test(key)) {
                shot.transition = isAppend && shot.transition ? `${shot.transition} · ${cleanVal}` : cleanVal;
            }
        };

        for (const line of lines) {
            const propMatch = line.match(/^-\s*\*\*([^*]+)\*\*[：:]\s*(.*)$/);
            if (propMatch) {
                currentKey = propMatch[1].trim();
                const val = propMatch[2].trim();
                assignProp(currentKey, val, false);
            } else if (currentKey && line.trim()) {
                const sub = line.trim().replace(/^[*•-]\s*/, "").replace(/^\d+[\.、]\s*/, "");
                if (sub) {
                    assignProp(currentKey, sub, true);
                }
            }
        }
        shots.push(shot);
    }
    return shots;
}

/**
 * 从全片 Markdown 文本中自动解析提取视听核心要素 (originalMasterSlots)
 */
export function parseMarkdownMasterSlots(text: string): {
    character?: string;
    actor?: string;
    focalObject?: string;
    product?: string;
    scene?: string;
} | undefined {
    if (!text || typeof text !== "string") return undefined;
    const slots: any = {};

    // 场域 / 空间
    const mScene = text.match(/-\s*\*\*(?:场景空间几何|场景空间|空间场域|场景|场域)\*\*[：:]\s*([^\n\r]+)/);
    if (mScene && mScene[1]) {
        slots.scene = mScene[1].trim();
    }

    // 商品 / 道具 / 核心客体
    const mProdBlock = text.match(/-\s*\*\*(?:陈设与道具资产清单|陈设与道具|焦点物品|核心商品|商品|道具)\*\*[：:]\s*([^\n\r]*)/);
    if (mProdBlock) {
        const sameLine = mProdBlock[1]?.trim();
        if (sameLine) {
            slots.product = sameLine;
            slots.focalObject = sameLine;
        } else {
            const afterIndex = (mProdBlock.index || 0) + mProdBlock[0].length;
            const rest = text.slice(afterIndex);
            const firstItemMatch = rest.match(/^\s*(?:[1-9][\.、]|\*|-)\s*([^\n\r]+)/);
            if (firstItemMatch && firstItemMatch[1]) {
                const prodVal = firstItemMatch[1].trim();
                slots.product = prodVal;
                slots.focalObject = prodVal;
            }
        }
    }

    // 人物 / 演员 / 表演主体
    const mCharBlock = text.match(/-\s*\*\*(?:主体\/人物|人物|演员|表演主体|表演时序轨迹)\*\*[：:]\s*([^\n\r]*)/);
    if (mCharBlock) {
        const sameLine = mCharBlock[1]?.trim();
        if (sameLine) {
            slots.character = sameLine;
            slots.actor = sameLine;
        } else {
            const afterIndex = (mCharBlock.index || 0) + mCharBlock[0].length;
            const rest = text.slice(afterIndex);
            const firstItemMatch = rest.match(/^\s*(?:[1-9][\.、]|\*|-)\s*([^\n\r]+)/);
            if (firstItemMatch && firstItemMatch[1]) {
                const charVal = firstItemMatch[1].trim();
                slots.character = charVal;
                slots.actor = charVal;
            }
        }
    }

    if (slots.scene || slots.product || slots.character) {
        return slots;
    }
    return undefined;
}

/**
 * 将结构化分镜列表转化为供用户展示与下游易读的中文 Markdown 分镜工程图纸
 * 智能将提取出的分镜 Markdown 无缝接到板块“逐镜头全息工程图纸”中，
 * 替换原有 JSON 代码块与提示词套话，并在无逐镜头板块时自动补全规范标题。
 */
export function formatShotManifestToReadableScript(
    shots?: any[],
    overviewText?: string,
    title = "创意反推分镜拆解表",
): string {
    // 0. 如果 overviewText 原生就是完整的人类可读 Markdown 图纸（包含逐镜头卡段 ### 镜头），且不含裸露的 ```json，优先直接返回原生文本，绝不进行二次重编译造成信息损失
    if (overviewText && typeof overviewText === "string" && !overviewText.includes("```json") && !overviewText.trim().startsWith("{")) {
        const hasMarkdownShots = /(?:^|\n)###\s*镜头\s*\d+/i.test(overviewText);
        if (hasMarkdownShots) {
            return overviewText.trim();
        }
    }

    // 1. 如果未传入分镜数组，或数组为空，但 overviewText 中含有内容，自动提取 shots
    let effectiveShots = Array.isArray(shots) ? [...shots] : [];
    if (effectiveShots.length === 0 && overviewText) {
        const parsed = parseDirectorJson<any>(overviewText);
        if (parsed && Array.isArray(parsed.shots) && parsed.shots.length > 0) {
            effectiveShots = parsed.shots;
        } else if (parsed && Array.isArray(parsed.shotManifest) && parsed.shotManifest.length > 0) {
            effectiveShots = parsed.shotManifest;
        } else {
            const mdShots = parseMarkdownShots(overviewText);
            if (mdShots.length > 0) {
                // 如果 overviewText 原生就是纯正且完整的 Markdown 分镜卡段，直接返回原文本，防止二次重序列化造成信息损失
                return overviewText.trim();
            }
        }
    }

    // 2. 将镜头列表格式化为高质量人类易读的 Markdown 文本
    const shotLines: string[] = [];
    if (effectiveShots.length > 0) {
        effectiveShots.forEach((shot: any, idx: number) => {
            const num = shot.shotNumber || idx + 1;
            const type = shot.shotType ? `[${shot.shotType.toUpperCase()}]` : "";
            const range = shot.timeRange || (shot.durationSec ? `${shot.durationSec}s` : (shot.startSec !== undefined && shot.endSec !== undefined ? `${shot.startSec}s - ${shot.endSec}s` : ""));
            shotLines.push(`\n### 镜头 ${num} ${type} ${range}`.trim());

            if (shot.camera || shot.scaleAndAngle || shot.cameraMovement || shot.visualSubject) {
                const cameraInfo = shot.camera || [shot.scaleAndAngle, shot.cameraMovement, shot.visualSubject].filter(Boolean).join(" | ");
                shotLines.push(`- **景别机位**：${cameraInfo}`);
            }
            if (shot.visualAction || shot.visualContent || shot.plotDescription) {
                shotLines.push(`- **画面内容**：${shot.visualAction || shot.visualContent || shot.plotDescription}`);
            }
            if (shot.performanceTiming) {
                shotLines.push(`- **微动作时序**：${shot.performanceTiming}`);
            }
            if (shot.physicalFeedback) {
                shotLines.push(`- **物理反馈与力学**：${shot.physicalFeedback}`);
            }
            if (shot.dialogue) {
                shotLines.push(`- **原片台词**：${shot.dialogue}`);
            }
            if (shot.voiceTone || shot.wordTimings || shot.speechRate || shot.stressWords) {
                const speechInfo = [
                    shot.wordTimings ? `时间轴: ${shot.wordTimings}` : "",
                    shot.voiceTone ? `语调: ${shot.voiceTone}` : "",
                    shot.speechRate ? `语速: ${shot.speechRate}` : "",
                    shot.stressWords ? `重音: ${shot.stressWords}` : "",
                ].filter(Boolean).join(" | ");
                shotLines.push(`- **语言与语速**：${speechInfo}`);
            }
            if (shot.emotionAndGaze || shot.emotion) {
                shotLines.push(`- **情绪与眼神**：${shot.emotionAndGaze || shot.emotion}`);
            }
            if (shot.soundFx || shot.lightingTone || shot.soundAndAtmosphere || shot.sfxCue || shot.soundAndBgm) {
                const aesthetic: string[] = [];
                if (shot.soundFx) aesthetic.push(`音效: ${shot.soundFx}`);
                if (shot.lightingTone) aesthetic.push(`光影: ${shot.lightingTone}`);
                if (shot.soundAndAtmosphere) aesthetic.push(`视听氛围: ${shot.soundAndAtmosphere}`);
                if (shot.sfxCue && !shot.soundAndAtmosphere && !shot.soundFx) aesthetic.push(`音效: ${shot.sfxCue}`);
                if (shot.soundAndBgm && !shot.soundAndAtmosphere && shot.soundAndBgm !== shot.sfxCue && shot.soundAndBgm !== shot.soundFx) aesthetic.push(`声音层: ${shot.soundAndBgm}`);
                shotLines.push(`- **视听氛围**：${aesthetic.join(" | ")}`);
            }
            if (shot.characterAnchor || shot.productAnchor || shot.focalAnchor || shot.sceneAnchor) {
                const anchors: string[] = [];
                if (shot.characterAnchor) anchors.push(`人物: ${shot.characterAnchor}`);
                if (shot.productAnchor) anchors.push(`商品: ${shot.productAnchor}`);
                else if (shot.focalAnchor) anchors.push(`核心客体: ${shot.focalAnchor}`);
                if (shot.sceneAnchor) anchors.push(`场景: ${shot.sceneAnchor}`);
                shotLines.push(`- **置换锚点**：${anchors.join(" | ")}`);
            }
            if (shot.hookType) {
                shotLines.push(`- **吸睛钩子**：${shot.hookType}`);
            }
            if (shot.narrativeFunction) {
                shotLines.push(`- **剪辑与叙事**：功能: ${shot.narrativeFunction}`);
            } else if (shot.transition) {
                shotLines.push(`- **剪辑与叙事**：转场: ${shot.transition}`);
            }
            // 兼容生图与视频模型提示词（如创意复刻分镜）
            if (shot.imagePrompt) {
                shotLines.push(`- **画面生图提示词**：${shot.imagePrompt}`);
            }
            if (shot.motionPrompt || shot.cameraPrompt) {
                shotLines.push(`- **动态运镜提示词**：${shot.motionPrompt || shot.cameraPrompt}`);
            }
            if (shot.lines && !shot.dialogue) {
                shotLines.push(`- **对白口播**：${shot.lines}`);
            }
        });
    }

    const formattedShotsText = shotLines.join("\n").trim();

    // 3. 如果没有 overviewText，直接返回标题与镜头列表
    if (!overviewText || !overviewText.trim()) {
        if (!formattedShotsText) return "";
        return `## ${title}\n\n${formattedShotsText}`.trim();
    }

    const rawOverview = overviewText.trim();

    // 4. 检查 overviewText 中是否已存在逐镜头板块（如 ## 三、逐镜头全息工程图纸 或 ## 六、逐镜头全息工程图纸）
    const shotSecMatch = rawOverview.match(/(?:^|\n)(##\s*(?:[一二三四五六七八九十\d]+[、\.\s]+)?逐镜头全息工程图纸[^\n]*)/i) ||
                         rawOverview.match(/(?:^|\n)(##\s*(?:三|3|五|5|六|6)[、\.\s][^\n]*)/i);

    if (shotSecMatch && shotSecMatch.index !== undefined) {
        const matchIndex = shotSecMatch.index + (shotSecMatch[0].startsWith("\n") ? 1 : 0);
        const beforeShotSec = rawOverview.slice(0, matchIndex).trim();
        const shotSecHeader = shotSecMatch[1].trim();
        const contentAfterShotSec = rawOverview.slice(matchIndex + shotSecMatch[0].trim().length).trim();

        // 若 overviewText 本身已包含原生 Markdown 镜头卡段（### 镜头...），且无外部传入的新分镜，完整保留原文本
        if (!formattedShotsText && contentAfterShotSec && /(?:^|\n)###\s*镜头/i.test(contentAfterShotSec)) {
            return rawOverview;
        }

        const resultParts: string[] = [];
        if (beforeShotSec) resultParts.push(beforeShotSec);
        resultParts.push(shotSecHeader);
        if (formattedShotsText) {
            resultParts.push(formattedShotsText);
        } else if (contentAfterShotSec) {
            resultParts.push(contentAfterShotSec);
        }

        return resultParts.join("\n\n").trim();
    }

    // 5. 如果没有逐镜头板块，清洗 overviewText 中的 JSON 块后将分镜内容接在最后
    const cleanOverview = stripJsonCodeBlocks(rawOverview).trim();
    if (!formattedShotsText) {
        return cleanOverview;
    }

    // 如果 overview 中包含一、二等板块，则自适应使用对应的接驳标题
    const hasSecTwo = /(?:##\s*(?:二|2)[、\.\s])/i.test(cleanOverview);
    const hasSecFour = /(?:##\s*(?:四|4)[、\.\s])/i.test(cleanOverview);
    const effectiveTitle = hasSecFour ? "五、逐镜头全息工程图纸" : (hasSecTwo ? "三、逐镜头全息工程图纸" : title);
    return `${cleanOverview}\n\n## ${effectiveTitle}\n\n${formattedShotsText}`.trim();
}

export function buildCreativeDirectorUserPrompt(params: {
    referenceScript?: string;
    refScript?: string;
    structuredShots?: any[];
    originalMasterSlots?: { actor?: string; product?: string; scene?: string };
    userRequirement?: string;
    masterSlots?: CreativeReplicationMasterSlots;
    productSellingPoints?: string;
    masterVisualAnchor?: string;
    motionStyle?: string;
    videoModel?: string;
    targetVideoModel?: string;
    enableVisual: boolean;
    enableVoice: boolean;
    enableVideo: boolean;
    customRules?: string;
    minDuration?: number;
    maxDuration?: number;
    mentionedAssets?: Array<{ label: string; title: string; kind: string; isDirectlyMentioned?: boolean }>;
    upstreamAnalysis?: any;
    fileSummaries?: any[];
    insightSections?: any[];
    connectedMediaFiles?: Array<{ id: string; name: string; kind?: string; url?: string; label?: string }>;
}): string {
    const parts: string[] = [];

    // 精准识别所选视频模型的物理秒数范围（优先使用渠道参数动态解析结果）
    const modelKey = params.videoModel || params.targetVideoModel || "kling-v1-6";
    const canonicalModel = modelKey.split("::").at(-1) || modelKey;
    const matchedModel = CREATIVE_REPLICATION_VIDEO_MODEL_OPTIONS.find(
        (m) => m.value === modelKey || m.value === canonicalModel
    );

    let minDuration = params.minDuration ?? (matchedModel ? matchedModel.defaultDuration : 4);
    let maxDuration = params.maxDuration ?? (matchedModel ? matchedModel.maxDuration : 10);
    let modelLabel = canonicalModel;

    parts.push("【参考视频 / 爆款分镜文案】");
    const scriptContent = (params.referenceScript || params.refScript || "").trim();
    parts.push(scriptContent || "（用户未提供明确参考文案，请按标准爆款短视频起承转合结构创作）");

    parts.push("\n【核心使命：1:1 完美复刻原视频 / 参考脚本视听效果】");
    parts.push("1. 完美复刻原片节奏骨架：分镜数量、各镜头的起止时间、单镜秒数、景别运镜（推拉摇移/手持呼吸）、切镜形态（A-roll、B-roll、L-cut、对比分屏）必须严格对齐原片；");
    parts.push("2. 完美复刻前 3 秒黄金双钩子：将原视频最具冲击力的视觉焦点 (Visual Hook) 与心理悬念 (Verbal Hook)，等价迁移至新商品/新角色设定中；");
    parts.push("3. 完美复刻动作时序与动力学：原片演员的微时序动作（起势 -> 接触 -> 定格）与物理受力反馈，精确对应到新商品与新角色交互上；");
    parts.push("4. 全源资产规划与逆向提取：若用户手动输入了参考脚本，请深度从脚本自然语言中逆向提取出全片所需的创意资产（出镜角色、推广商品、主要场景）。若用户指定了换品/换人，则进行对应置换；若未指定换品，则继承脚本原设定。");

    // 如果上游传递了高精度结构化镜头清单 (从创意反推继承)，将其以 1:1 结构化形式显式注入
    if (params.structuredShots && Array.isArray(params.structuredShots) && params.structuredShots.length > 0) {
        parts.push("\n【上游创意反推结构化镜头清单 (高精度参考事实，请 1:1 继承节奏与结构)】");
        params.structuredShots.forEach((s: any, idx: number) => {
            const num = s.shotNumber || idx + 1;
            const type = s.shotType ? `[${s.shotType.toUpperCase()}]` : "";
            const range = s.timeRange || (s.durationSec ? `${s.durationSec}s` : "");
            parts.push(`- 镜头${num} ${type} ${range}:`);
            if (s.hookType) parts.push(`  * 吸睛钩子: ${s.hookType}`);
            if (s.camera || s.scaleAndAngle || s.cameraMovement || s.visualSubject) {
                const cam = s.camera || [s.scaleAndAngle, s.cameraMovement, s.visualSubject].filter(Boolean).join(" | ");
                parts.push(`  * 景别运镜: ${cam}`);
            }
            if (s.visualAction || s.visualContent) parts.push(`  * 画面内容与微动作: ${s.visualAction || s.visualContent}`);
            if (s.performanceTiming) parts.push(`  * 动作微时序: ${s.performanceTiming}`);
            if (s.physicalFeedback) parts.push(`  * 物理反馈: ${s.physicalFeedback}`);
            if (s.dialogue) parts.push(`  * 原片台词: ${s.dialogue}`);
            if (s.wordTimings) parts.push(`  * 词级毫秒轴: ${s.wordTimings}`);
            if (s.voiceTone || s.emotion) parts.push(`  * 声音与情绪: ${s.voiceTone || s.emotion}`);
            if (s.soundFx || s.lightingTone || s.soundAndAtmosphere || s.sfxCue) {
                const aesthetic: string[] = [];
                if (s.soundFx) aesthetic.push(`音效: ${s.soundFx}`);
                if (s.lightingTone) aesthetic.push(`光影: ${s.lightingTone}`);
                if (s.soundAndAtmosphere) aesthetic.push(`视听: ${s.soundAndAtmosphere}`);
                if (s.sfxCue && !s.soundAndAtmosphere && !s.soundFx) aesthetic.push(`音效: ${s.sfxCue}`);
                parts.push(`  * 视听氛围: ${aesthetic.join(" | ")}`);
            }
            if (s.characterAnchor || s.focalAnchor || s.productAnchor || s.sceneAnchor) {
                const anchors = [
                    s.characterAnchor ? `人物: ${s.characterAnchor}` : "",
                    s.productAnchor ? `商品: ${s.productAnchor}` : (s.focalAnchor ? `客体: ${s.focalAnchor}` : ""),
                    s.sceneAnchor ? `场景: ${s.sceneAnchor}` : "",
                ].filter(Boolean).join(" | ");
                parts.push(`  * 置换锚点: ${anchors}`);
            }
            if (s.narrativeFunction) parts.push(`  * 叙事功能: ${s.narrativeFunction}`);
        });
    }

    // 如果上游反推提取了原片母版资产三要素基准 (参考视频原本的人物/商品/场景)，显式注入供模型对比置换
    if (params.originalMasterSlots) {
        const oms = params.originalMasterSlots;
        const omsLines: string[] = [];
        if (oms.actor?.trim()) omsLines.push(`- 👤 原片出镜主角基准: ${oms.actor.trim()}`);
        if (oms.product?.trim()) omsLines.push(`- 📦 原片推广商品基准: ${oms.product.trim()}`);
        if (oms.scene?.trim()) omsLines.push(`- 🏠 原片拍摄场景基准: ${oms.scene.trim()}`);
        if (omsLines.length > 0) {
            parts.push("\n【上游原片三要素基准 (参考视频原始设定，复刻时请精准置换为用户的新设定)】:");
            parts.push(...omsLines);
        }
    }

    // 显式注入三大全局母版资产设定 (角色 / 商品 / 场景)
    if (params.masterSlots) {
        const ms = params.masterSlots;
        const actor = ms.actor || (ms as any).character;
        const product = ms.product;
        const scene = ms.scene;
        const slotLines: string[] = [];
        if (actor?.promptAnchor?.trim() || actor?.name?.trim()) {
            slotLines.push(`- 👤 出镜角色 (Actor/Host) [${actor.name || "主角"}]: ${actor.promptAnchor || "默认形象"}`);
        }
        if (product?.promptAnchor?.trim() || product?.name?.trim()) {
            slotLines.push(`- 📦 商品设定 [${product.name || "输入商品"}]: ${product.promptAnchor || "以用户输入实物图为准"}`);
        }
        if (scene?.promptAnchor?.trim() || scene?.name?.trim()) {
            slotLines.push(`- 🏠 拍摄场景 [${scene.name || "默认场景"}]: ${scene.promptAnchor || "真实生活环境"}`);
        }
        if (slotLines.length > 0) {
            parts.push("\n【全局母版资产设定 (出镜角色 / 商品外观 / 场景基调)】:");
            parts.push(...slotLines);
        }
    }

    if (params.userRequirement?.trim()) {
        parts.push("\n【用户创作需求与换品设定】");
        parts.push(params.userRequirement.trim());
    }
    if (params.productSellingPoints?.trim() && !params.userRequirement?.includes(params.productSellingPoints.trim())) {
        parts.push("\n【换品核心卖点与利益点】");
        parts.push(params.productSellingPoints.trim());
    }
    if (params.enableVisual && params.masterVisualAnchor?.trim() && !params.userRequirement?.includes(params.masterVisualAnchor.trim())) {
        parts.push("\n【角色母图与视觉锚定设定】");
        parts.push(params.masterVisualAnchor.trim());
    }
    if (params.motionStyle?.trim() && !params.userRequirement?.includes(params.motionStyle.trim())) {
        parts.push("\n【运镜与物理微动作控制风格】");
        parts.push(params.motionStyle.trim());
    }

    // 识别 3 种素材输入情况：1、直接连接素材；2、通过“素材分析”接入；3、没有连接素材
    const analysisMeta = params.upstreamAnalysis?.metadata?.materialAnalysis as any;
    const fileSummaries = params.fileSummaries || analysisMeta?.result?.fileSummaries || [];
    const insightSections = params.insightSections || analysisMeta?.result?.insightSections || [];
    const hasUpstreamAnalysis = Boolean(
        (fileSummaries && fileSummaries.length > 0) || (insightSections && insightSections.length > 0)
    );

    const connectedMedia = [
        ...(params.mentionedAssets || []).filter((a) => a.kind === "image" || a.kind === "video" || a.kind === "audio"),
        ...(params.connectedMediaFiles || []).map((f) => ({
            label: f.label || `@${f.name}`,
            title: f.name,
            kind: f.kind || "image",
            isDirectlyMentioned: false,
        })),
    ];
    const seenMediaLabels = new Set<string>();
    const uniqueMedia = connectedMedia.filter((m) => {
        const key = `${m.label}-${m.title}`;
        if (seenMediaLabels.has(key)) return false;
        seenMediaLabels.add(key);
        return true;
    });
    const hasConnectedMedia = uniqueMedia.length > 0;

    // 情况 2：通过“素材分析”接入
    if (hasUpstreamAnalysis) {
        parts.push("\n【素材输入情况：通过上游“素材分析”接入】");
        parts.push("检测到上游已连接“素材分析”节点并产出了多模态深度洞察。请像“经典复刻”一样，将以下“素材分析”的资料与商品洞察作为本次“创意复刻”的重要输入依据：");
        if (uniqueMedia.length > 0) {
            parts.push("\n【素材引用表】:");
            uniqueMedia.forEach((m) => {
                parts.push(`- 引用标识：${m.label}（名称：${m.title}，类型：${m.kind === "image" ? "图片" : m.kind === "video" ? "视频" : "音频"}）`);
            });
        }
        if (fileSummaries.length > 0) {
            parts.push("\n【素材内容分析与总结】:");
            fileSummaries.forEach((f: any, idx: number) => {
                parts.push(`- 素材 ${idx + 1} (${f.name || f.fileId}): ${f.summary || "无详细描述"}`);
            });
        }
        if (insightSections.length > 0) {
            parts.push("\n【商品核心洞察与卖点】:");
            insightSections.forEach((s: any) => {
                const title = s.title || "核心洞察";
                const items = (s.items || []).map((it: any) => (typeof it === "string" ? it : it.text)).filter(Boolean);
                if (items.length > 0) {
                    parts.push(`* ${title}:`);
                    items.forEach((itemText: string) => parts.push(`  - ${itemText}`));
                }
            });
        }
        parts.push("\n【分析与资产匹配任务】:");
        parts.push("1. 依据素材内容分析与商品洞察，深度分析各个素材适合作为哪种核心资产（人物/商品/场景）；");
        parts.push("2. 将素材精准分配到最终 JSON 的 assetSlots 列表中，matchedAsset 填入对应的素材引用标识（例如 \"@图片1\"）；");
        parts.push("3. 对匹配到素材的插槽提供精细化的图生图母版转化 Prompt (promptImg2Img)；对未匹配到素材的插槽提供独立文生图 Prompt (promptTxt2Img) 并将 matchedAsset 置为 null。");
    } else if (hasConnectedMedia) {
        // 情况 1：直接连接素材
        parts.push("\n【素材输入情况：直接连接创作素材】");
        parts.push("检测到用户已直接连接了多模态素材（图片/视频/音频），但未经过上游“素材分析”节点。");
        parts.push("请像“素材分析”与“编导助手”一样，首先对用户提供的这些素材进行深度视觉与特征分析，并结合上游“创意反推”的原片三要素（人物、商品、场景），判断各个素材适合作为哪种核心资产：");
        parts.push("\n【可用素材清单】:");
        uniqueMedia.forEach((m) => {
            const visual = m.kind === "image" ? " (已作为视觉图像输入模型，请观察其实物外观与细节)" : "";
            parts.push(`- 引用标识：${m.label}（名称：${m.title}，类型：${m.kind === "image" ? "图片" : m.kind === "video" ? "视频" : "音频"}）${visual}`);
        });
        parts.push("\n【分析与资产匹配任务】:");
        parts.push("1. 观察并分析多模态素材的特征（人物外貌、商品包装/质感、场景空间）；");
        parts.push("2. 明确判断该素材适合作为哪类资产（\"character\" 角色 / \"product\" 商品 / \"scene\" 场景）；");
        parts.push("3. 将素材分配到最终 JSON 的 assetSlots 列表中，matchedAsset 填入对应的素材引用标识（例如 \"@图片1\"）；");
        parts.push("4. 若某插槽匹配到了素材，提供定制的 promptImg2Img（用于将该素材转化为多视角三视图、商业白底静物棚拍或纯净场景底图）；");
        parts.push("5. 若某类资产在素材中未找到对应图片，则该插槽的 matchedAsset 填 null，并提供自洽完整的实拍质感文生图 Prompt (promptTxt2Img)。");
    } else {
        // 情况 3：没有连接素材
        parts.push("\n【素材输入情况：未连接创作素材】");
        parts.push("当前用户未提供任何图片或实物素材，未连接“素材分析”节点。");
        parts.push("- 请 100% 依据上游“创意反推”提取出的原片三要素基准（人物形象、推广商品、空间场域），以及用户的创作需求，自主规划全片所需的创意资产槽位（人物、商品、场景）；");
        parts.push("- 在最终 JSON 的 assetSlots 列表中：");
        parts.push("  * matchedAsset: 全部设置为 null（代表该插槽为空，无参考图）；");
        parts.push("  * promptTxt2Img: 必须为每个资产输出独立完整、高写气质感的实拍文生图 Prompt（严格遵循 iPhone UGC 四段式规范），直接用于下游从零文生图；");
        parts.push("  * promptImg2Img: 留空或提供备用图生图转化指令。");
    }

    // 双模提示词规范（文生图 vs 图生图）
    parts.push("\n【创意资产表双模提示词规范（文生图 vs 图生图）】:");
    parts.push("根据每个资产插槽是否有参考图（matchedAsset 是否有值），分别生成两套高规格提示词：");
    parts.push("1. 无参考图插槽（matchedAsset 为 null）-> 采用 promptTxt2Img：");
    parts.push("   - 必须是自洽完整的英文实拍质感文生图 Prompt（严格采用 iPhone UGC 四段式结构：[Capture] + [Person/Subject] + [Shot] + [Setting]）；");
    parts.push("   - 人物角色：描述年龄、外貌、头肩比、发型发色、自然皮肤纹理、平视镜头与自然光影；");
    parts.push("   - 商品道具：描述产品形态外观、包装材质、反光高光与色彩细节；");
    parts.push("   - 场景环境：描述空间开阔度、自然光照方向、生活化陈设与写实电影感色调。");
    parts.push("2. 有参考图插槽（matchedAsset 为具体素材）-> 采用 promptImg2Img：");
    parts.push("   - 核心目标：根据素材真实类型执行多场景精准转化，打造最高标准母版资产：");
    parts.push("   - 人物 / 角色 (character)：");
    parts.push("     * 【若输入图已是多视角/四视图/角色设定板/立绘】：【绝对严禁再要求生成三视图】！必须执行【一致性基准锁定与母版定妆/写真精修 (Consistency Lock & Master Refinement)】：以参考图中的多视角角色设定板为 100% 视觉锚点，严格锁定五官相貌、脸型轮廓、发型发色、肤色质感、身材体态与特定服饰特征（如服装款式/色彩），生成标准高保真单人实拍写真/定妆照，平视镜头，真实皮肤微绒毛与毛孔纹理，自然光影，零过度磨皮，零 AI 塑料感；");
    parts.push("     * 【若输入图仅为普通单张生活照/自拍】：执行【多视角角色一致性设定板 (Turnaround Sheet)】：基于参考图提取角色特征，生成多视角三视图或四视图 (Turnaround Sheet: 正面、3/4侧面、正侧面、半身与全身)，极简浅灰纯色背景，影棚柔光，平视镜头，细腻真实皮肤纹理，零过度磨皮与零 AI 塑料感；");
    parts.push("   - 商品 / 产品 (product)：以参考图中的实物为 100% 外观锚点，精确保留外包装几何形态、材质细节与 Logo 标识，消除杂乱反光与背景噪点，商业棚拍布光，生成多视角商业静物摄影 / 专业白底棚拍图 (Multi-angle commercial studio shots / clean white background)；");
    parts.push("   - 场景 / 背景 (scene)：进行【空间环境优化升级与电影感空镜母版】。以参考图中的建筑空间为结构基准，彻底剔除画面中多余杂乱的人物、行人、多余杂物堆砌与非必要视觉干扰，保留硬装格局与透视线条，优化自然采光，打造纯净通透的空间基底图。");

    // 关键多模态视觉指引与绝对防串货红线
    const hasImageAssets = uniqueMedia.some((a) => a.kind === "image");
    if (hasImageAssets) {
        parts.push("\n【核心红线：输入商品图视觉主体唯一性（严防套用预设）】:");
        parts.push("- 本次请求中已直接向多模态视觉模型传入了用户商品/素材的实物图片。");
        parts.push("- 请仔细观察图片中的真实商品外观、材质形态、包装与使用场景（如私密用品、服饰鞋包、3C个护等）。");
        parts.push("- 所有分镜台词、画面 Prompt、手持微动作描述必须 100% 以图片中的真实商品为准，严禁凭空生成护肤品/精华/美妆等无关示例品类！");
    }

    parts.push(`\n【目标视频生成模型与镜头时长/台词容量红线】:`);
    parts.push(`- 选定模型: ${modelLabel} [${params.videoModel}]`);
    parts.push(`- 模型支持单镜头物理时长区间: ${minDuration} 秒 ~ ${maxDuration} 秒（单镜头物理上限为 ${maxDuration} 秒）`);
    parts.push(`- 镜头时长 1:1 继承法则与弹性规划: 每个镜头的起止时间与时长必须 100% 严格对齐上游输入的事实原分镜实际时长（处于 [${minDuration}s, ${maxDuration}s] 内时 100% 继承实际切点，超出则弹性截断至模型上限，严禁机械凑整为 .0 或 .5 秒）；若无上游切点，请在区间内弹性规划，绝对严禁所有镜头都机械固定为 5 秒！`);
    parts.push(`- 单镜头台词字数容量匹配: 单镜头台词字数上限 = 原分镜实际时长(秒) × 3.5~4.5 汉字（严禁超字，防止下游语音合成与视频生成时发生严重嘴瓢、音画失步）；`);
    parts.push(`- 默认画幅比例: 9:16 (标准竖屏实拍质感)`);

    parts.push("\n【启用通道】:");
    parts.push(`- 视觉生图 (首帧/iPhone UGC 四段式): ${params.enableVisual ? "启用" : "未启用"}`);
    parts.push(`- 角色配音 (台词/音色/情感/词级打标): ${params.enableVoice ? "启用" : "未启用"}`);
    parts.push(`- 视频分镜 (运镜/微动作/词级动作绑定/Hygiene防字幕): ${params.enableVideo ? "启用" : "未启用"}`);

    if (params.customRules?.trim()) {
        parts.push(`\n【用户补充要求】\n${params.customRules.trim()}`);
    }

    parts.push("\n【输出要求与物理隔离铁律】:");
    parts.push("1. 严禁在前面的 Markdown 综述中排版罗列逐镜头列表！Markdown 综述专职为《商业编导改编决策》（<= 300字，精炼陈述置换方案与钩子迁移）；");
    parts.push("2. 所有镜头的详细数据请且仅在文末的 JSON 代码块中输出一次，彻底消除双重输出导致的 Token 浪费与截断；");
    parts.push("3. 严格遵循 8 维高动态工程图纸规范，单镜头内必须设计多动作复合递进，杜绝无动效慢推定格画面。");
    return parts.join("\n");
}

export const buildHypitDirectorUserPrompt = buildCreativeDirectorUserPrompt;
// @opc-feature: hypit [end]


