import { imageToDataUrl } from "@/services/image-storage";
import { requestImageQuestion, type AiTextMessage } from "@/services/api/image";
import { buildCreationAssistantAnalysisPrompt, type CreationAssistantManifestItem } from "@/lib/creation-assistant-prompts";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import type { CreationAssistantFileSummary, CreationAssistantInsightSection } from "@/stores/use-creation-assistant-store";
import type { CreationAssistantVideoAnalysis } from "@/stores/use-creation-assistant-store";

export type AnalysisFile = { id: string; name: string; kind: "image"; item: ReferenceImage } | { id: string; name: string; kind: "video"; item: ReferenceVideo } | { id: string; name: string; kind: "audio"; item: ReferenceAudio };

// @opc-feature: creation_assistant_original_logic [start]
export async function analyzeCreationAssistantBatch(
    config: AiConfig,
    files: AnalysisFile[],
    videoAnalyses: CreationAssistantVideoAnalysis[] = [],
    options?: {
        customRules?: string;
        replaceBuiltInPrompt?: boolean;
        promptRules?: string;
    },
) {
    const manifest: CreationAssistantManifestItem[] = files.map((file, index) => ({ fileId: file.id, order: index + 1, name: file.name, mediaType: file.kind }));
    const content: AiTextMessage["content"] = [{ type: "text", text: buildCreationAssistantAnalysisPrompt(manifest, options) }];
    for (const file of files) {
        content.push({ type: "text", text: `当前素材 fileId=${file.id}，order=${manifest.find((item) => item.fileId === file.id)?.order}，文件名=${file.name}，媒体类型=${file.kind}。以下媒体内容只对应这一项。` });
        if (file.kind === "image") {
            content.push({ type: "image_url", image_url: { url: await imageToDataUrl(file.item) } });
        } else if (file.kind === "video") {
            const analysis = videoAnalyses.find((item) => item.videoId === file.id);
            const sheets = analysis?.sheets || [];
            if (sheets.length) {
                for (const sheet of sheets) content.push({ type: "image_url", image_url: { url: await imageToDataUrl({ storageKey: sheet.storageKey, url: sheet.url }) } });
                content.push({ type: "text", text: `视频已转换为 ${sheets.length} 张按时间顺序排列的抽帧总拼图；请基于拼图分析画面变化、镜头结构和节奏，不要把总拼图当作独立商品素材。` });
            } else {
                content.push({ type: "text", text: "视频抽帧总拼图暂不可用；不得仅凭文件名推断视频内容。" });
            }
            if (analysis?.audio?.url) {
                content.push({ type: "input_audio", input_audio: { data: await mediaUrlToBase64(analysis.audio.url), format: audioFormat(analysis.audio.mimeType, `${file.name}.wav`) } });
                content.push({ type: "text", text: "以上音频是该视频分离出的完整音轨。请识别其中可听到的人声、口播、音乐、环境声和节奏，并与抽帧总拼图结合分析；音频不是独立素材，不要单独生成 fileSummary。" });
            } else {
                content.push({ type: "text", text: "该视频没有可用的分离音频；不要仅凭文件名推断声音内容。" });
            }
        } else {
            content.push({ type: "input_audio", input_audio: { data: await mediaUrlToBase64(file.item.url), format: audioFormat(file.item.type, file.name) } });
            content.push({ type: "text", text: "以上是当前音频素材本身。请识别可听到的人声、口播、音乐、环境声和节奏，并将可核验的听觉内容写入这一文件的一句 summary。" });
        }
    }
    const raw = await requestImageQuestion(config, [{ role: "user", content }], () => undefined);
    return normalizeAnalysisResponse(raw, manifest);
}

async function mediaUrlToBase64(url: string) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`读取音频失败（HTTP ${response.status}）`);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunkSize, bytes.length)));
    return btoa(binary);
}

function audioFormat(mimeType: string, name: string) {
    const mime = mimeType.toLowerCase();
    if (mime.includes("wav")) return "wav";
    if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
    if (mime.includes("ogg") || mime.includes("opus")) return "ogg";
    const extension = name.split(".").pop()?.toLowerCase();
    return extension === "m4a" || extension === "mp4" ? "m4a" : extension || "wav";
}

function normalizeAnalysisResponse(raw: string, manifest: Array<{ fileId: string; order: number; name: string; mediaType: string }>) {
    const parsed = parseJson(raw);
    const sourceSummaries = Array.isArray(parsed?.fileSummaries) ? parsed.fileSummaries : [];
    const fileSummaries: CreationAssistantFileSummary[] = manifest.map((file) => {
        const item = sourceSummaries.find((candidate) => candidate?.fileId === file.fileId || Number(candidate?.order) === file.order) || {};
        return {
            fileId: file.fileId,
            order: file.order,
            name: file.name,
            mediaType: file.mediaType as CreationAssistantFileSummary["mediaType"],
            summary: typeof item.summary === "string" && item.summary.trim() ? item.summary.trim() : "未返回文件总结",
            confidence: typeof item.confidence === "number" ? item.confidence : 0,
            riskFlags: Array.isArray(item.riskFlags) ? item.riskFlags : [],
        };
    });
    const rawSections = [...(Array.isArray(parsed?.productInsights?.sections) ? parsed.productInsights.sections : []), ...(Array.isArray(parsed?.productInsights?.extensionSections) ? parsed.productInsights.extensionSections : [])];
    const insightSections: CreationAssistantInsightSection[] = rawSections.map((section, index) => ({
        sectionKey: typeof section?.sectionKey === "string" ? section.sectionKey : `extension_${index + 1}`,
        title: typeof section?.title === "string" ? section.title : "扩展洞察",
        sectionType: section?.sectionType === "extension" ? "extension" : "core",
        order: Number(section?.order) || index + 1,
        items: Array.isArray(section?.items)
            ? section.items.map((item, itemIndex) => ({
                  itemId: `assistant-item-${index + 1}-${itemIndex + 1}`,
                  text: typeof item?.text === "string" ? item.text : "",
                  sourceFileIds: Array.isArray(item?.sourceFileIds) ? item.sourceFileIds : [],
                  confidence: typeof item?.confidence === "number" ? item.confidence : 0,
                  riskFlags: Array.isArray(item?.riskFlags) ? item.riskFlags : [],
              }))
            : [],
    }));
    return { fileSummaries, insightSections };
}

type ParsedAnalysis = {
    fileSummaries?: Array<{ fileId?: string; order?: number; summary?: string; confidence?: number; riskFlags?: string[] }>;
    productInsights?: {
        sections?: Array<{ sectionKey?: string; title?: string; sectionType?: string; order?: number; items?: Array<{ text?: string; sourceFileIds?: string[]; confidence?: number; riskFlags?: string[] }> }>;
        extensionSections?: Array<{ sectionKey?: string; title?: string; sectionType?: string; order?: number; items?: Array<{ text?: string; sourceFileIds?: string[]; confidence?: number; riskFlags?: string[] }> }>;
    };
};

function parseJson(raw: string): ParsedAnalysis {
    const text = raw
        .trim()
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "");
    try {
        return JSON.parse(text);
    } catch {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start >= 0 && end > start) {
            try {
                return JSON.parse(text.slice(start, end + 1));
            } catch {
                return {};
            }
        }
        return {};
    }
}
// @opc-feature: creation_assistant_original_logic [end]
