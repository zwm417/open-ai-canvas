// @opc-feature: creative_inspirations [start]
import { message } from "antd";
import type { NavigateFunction } from "react-router";
import { flushCanvasStorePersistence } from "@/stores/canvas/use-canvas-store";
import { createCanvasProjectWithRemoteSync } from "@/services/user-data-sync";
import { createCanvasNode } from "@/lib/canvas/canvas-project-domain";
import { CanvasNodeType } from "@/types/canvas";
import type { PromptPresetItem } from "./prompt-data";

/**
 * 将灵感预设一键导入至自由画布
 * 1. 自动新建专属画布项目（标题为：灵感 · {preset.title}）
 * 2. 创建图片/视频节点，自动注入灵感素材、正向提示词、负向提示词、推荐画幅与时长
 * 3. 立即触发本地持久化与云端同步，确保数据 100% 落盘
 * 4. 丝滑跳转至全新画布工作区
 */
export async function applyPromptToCanvas(preset: PromptPresetItem, navigate: NavigateFunction) {
    try {
        const isVideo = preset.kind === "video";
        const nodeType = isVideo ? CanvasNodeType.Video : CanvasNodeType.Image;
        const coverUrl = preset.previewImage || preset.previewThumbnail || preset.remoteBackupUrl || "";
        const videoUrl = preset.previewVideo || "";
        const contentUrl = isVideo ? (videoUrl || coverUrl) : coverUrl;

        // 画布中心坐标定位（居中显示）
        const centerPosition = { x: 500, y: 350 };

        const newNode = createCanvasNode(nodeType, centerPosition, {
            content: contentUrl,
            prompt: preset.positivePrompt,
            composerContent: preset.positivePrompt,
            status: "idle",
            size: preset.recommendedParams?.aspectRatio || (isVideo ? "16:9" : "1:1"),
            ...(preset.recommendedParams?.model ? { model: preset.recommendedParams.model } : {}),
            ...(isVideo ? {
                videoPreview: coverUrl ? { content: coverUrl } : undefined,
                previewContent: coverUrl || undefined,
                seconds: String(preset.recommendedParams?.duration || 5),
                generationMode: "video",
                videoEditOperation: "text_to_video",
            } : {
                previewContent: preset.previewThumbnail || coverUrl || undefined,
                generationType: "generation",
            }),
        });

        newNode.title = preset.title || (isVideo ? "视频灵感" : "图片灵感");

        const projectTitle = preset.title ? `灵感 · ${preset.title}` : (isVideo ? "灵感视频画布" : "灵感创作画布");
        const { id: newProjectId } = await createCanvasProjectWithRemoteSync(projectTitle, undefined, {
            nodes: [newNode],
        });

        await flushCanvasStorePersistence();

        if (typeof document !== "undefined") {
            message.success(`已新建画布「${projectTitle}」并导入灵感素材`);
        }
        navigate(`/canvas/${newProjectId}`);
    } catch (error) {
        console.error("添加灵感至新画布失败:", error);
        if (typeof document !== "undefined") {
            message.error("创建画布并导入灵感失败，请重试");
        }
    }
}
// @opc-feature: creative_inspirations [end]
