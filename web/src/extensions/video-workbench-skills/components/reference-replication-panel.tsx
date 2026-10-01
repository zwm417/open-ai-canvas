// @opc-feature: reference-replication-panel [start]
import React, { useState, useRef, useCallback, useMemo } from "react";
import {
    Sparkles,
    UploadCloud,
    X,
    Plus,
    Film,
    Music2,
    ImagePlus,
    Package,
    User,
    Image as ImageIcon,
    FileText,
    BookmarkPlus,
    LoaderCircle,
    CheckCircle2,
    RefreshCw,
    Trash2,
    ClipboardPaste,
    FolderPlus,
} from "lucide-react";
import { Button, Tooltip, App } from "antd";
import type { VideoWorkbenchSkill } from "../types/video-skill-contract";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import { uploadImage } from "@/services/image-storage";
import { uploadMediaFile } from "@/services/file-storage";
import { nanoid } from "nanoid";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { useDeepReplicationTaskStore } from "../stores/use-deep-replication-task-store";
import { ReplicationPromptReviewModal } from "./replication-prompt-review-modal";
import { captureVideoPoster } from "@/lib/video-poster";
import { trimVideoSegment } from "@/lib/canvas/canvas-video-segment";
import { formatDuration } from "@/lib/image-utils";
import { CanvasPromptChipInput } from "@/components/canvas/canvas-prompt-chip-input";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import type { VideoTextReference } from "@/stores/use-video-workbench-store";

interface ReferenceReplicationPanelProps {
    skill: VideoWorkbenchSkill | null;
    onExit: () => void;
    onApply: (
        prompt: string,
        meta?: {
            images?: ReferenceImage[];
            audios?: ReferenceAudio[];
            videos?: ReferenceVideo[];
            durationSec?: number;
            silent?: boolean;
        },
    ) => void;
    initialImages?: ReferenceImage[];
    initialAudios?: ReferenceAudio[];
    initialVideos?: ReferenceVideo[];
    textReferences?: VideoTextReference[];
    targetModel?: string;
    prompt?: string;
    onPromptChange?: (prompt: string) => void;
    onOpenPromptTemplate?: (kind: "video" | "image" | "drama") => void;
    onSaveAsTemplate?: (content: string, kind: "video" | "image" | "drama") => void;
    onOpenPromptDialog?: () => void;
    onSavePromptDialog?: () => void;
    onOpenAssetPicker?: () => void;
    onAddFromClipboard?: () => void;
}

// 扁平展示素材项
interface WorkbenchReferenceItem {
    id: string;
    name: string;
    kind: "image" | "audio" | "video";
    category: "product" | "model" | "scene" | "audio" | "general";
    url?: string;
    dataUrl?: string;
    storageKey?: string;
    durationMs?: number;
}

export const ReferenceReplicationPanel: React.FC<ReferenceReplicationPanelProps> = ({
    skill,
    onExit,
    onApply,
    initialImages = [],
    initialAudios = [],
    initialVideos = [],
    textReferences = [],
    targetModel,
    prompt = "",
    onPromptChange,
    onOpenPromptTemplate,
    onSaveAsTemplate,
    onOpenPromptDialog,
    onSavePromptDialog,
    onOpenAssetPicker,
    onAddFromClipboard,
}) => {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const taskStore = useDeepReplicationTaskStore();

    // 提示词弹窗兼容函数
    const handleOpenPromptModal = onOpenPromptDialog || (onOpenPromptTemplate ? () => onOpenPromptTemplate("video") : undefined);
    const handleSavePromptModal = onSavePromptDialog || (onSaveAsTemplate && prompt.trim() ? () => onSaveAsTemplate(prompt.trim(), "video") : undefined);

    // 素材状态分类管理
    const [productImages, setProductImages] = useState<ReferenceImage[]>(() => initialImages || []);
    const [modelImages, setModelImages] = useState<ReferenceImage[]>([]);
    const [sceneImages, setSceneImages] = useState<ReferenceImage[]>([]);
    const [uploadedAudios, setUploadedAudios] = useState<ReferenceAudio[]>(() => initialAudios || []);

    // 中部参考视频
    const [referenceVideo, setReferenceVideo] = useState<ReferenceVideo | null>(() => initialVideos?.[0] || null);
    const [videoPoster, setVideoPoster] = useState<string>(() => initialVideos?.[0]?.posterUrl || "");
    const [videoDurationSec, setVideoDurationSec] = useState<number>(() =>
        initialVideos?.[0]?.durationMs ? Math.round(initialVideos[0].durationMs / 1000) : 0,
    );
    const [videoFile, setVideoFile] = useState<File | null>(null);

    // 替换目标记录
    const replaceTargetRef = useRef<{ id: string; category: "product" | "model" | "scene" | "audio" } | null>(null);

    // 隐藏的文件上传 input 引用
    const productInputRef = useRef<HTMLInputElement>(null);
    const modelInputRef = useRef<HTMLInputElement>(null);
    const sceneInputRef = useRef<HTMLInputElement>(null);
    const audioInputRef = useRef<HTMLInputElement>(null);
    const generalInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);

    // 实时同步所有素材到上层 Draft（确保路径 A：用户输入后直接点击“立即生成视频”时素材已全部同步）
    const syncAllToDraft = useCallback(
        (
            currentPrompt: string,
            images: { products: ReferenceImage[]; models: ReferenceImage[]; scenes: ReferenceImage[] },
            audios: ReferenceAudio[],
            video: ReferenceVideo | null,
            duration?: number,
            silent: boolean = true,
        ) => {
            const combinedImages = [...images.products, ...images.models, ...images.scenes];
            onApply(currentPrompt, {
                images: combinedImages,
                audios,
                videos: video ? [video] : [],
                durationSec: duration || 10,
                silent,
            });
        },
        [onApply],
    );

    // 辅助上传图片处理（支持新增与就地替换）
    const handleUploadImages = async (
        e: React.ChangeEvent<HTMLInputElement>,
        category: "product" | "model" | "scene",
    ) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const replaceTarget = replaceTargetRef.current;
        replaceTargetRef.current = null;

        const newImages: ReferenceImage[] = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const hide = message.loading(`正在上传 ${file.name}...`, 0);
            try {
                const uploaded = await uploadImage(file);
                const dataUrl = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve((reader.result as string) || "");
                    reader.readAsDataURL(file);
                });
                newImages.push({
                    id: nanoid(),
                    name: file.name,
                    type: "image",
                    dataUrl,
                    url: uploaded.url,
                    storageKey: uploaded.storageKey,
                });
            } catch (err) {
                message.error(`上传失败: ${file.name}`);
            } finally {
                hide();
            }
        }

        if (newImages.length > 0) {
            let nextProducts = productImages;
            let nextModels = modelImages;
            let nextScenes = sceneImages;

            if (replaceTarget && newImages.length === 1) {
                // 替换模式
                const replacement = newImages[0];
                if (replaceTarget.category === "product") {
                    nextProducts = productImages.map((p) => (p.id === replaceTarget.id ? replacement : p));
                    setProductImages(nextProducts);
                } else if (replaceTarget.category === "model") {
                    nextModels = modelImages.map((m) => (m.id === replaceTarget.id ? replacement : m));
                    setModelImages(nextModels);
                } else if (replaceTarget.category === "scene") {
                    nextScenes = sceneImages.map((s) => (s.id === replaceTarget.id ? replacement : s));
                    setSceneImages(nextScenes);
                }
            } else {
                // 追加模式
                if (category === "product") {
                    nextProducts = [...productImages, ...newImages];
                    setProductImages(nextProducts);
                } else if (category === "model") {
                    nextModels = [...modelImages, ...newImages];
                    setModelImages(nextModels);
                } else if (category === "scene") {
                    nextScenes = [...sceneImages, ...newImages];
                    setSceneImages(nextScenes);
                }
            }

            syncAllToDraft(
                prompt,
                { products: nextProducts, models: nextModels, scenes: nextScenes },
                uploadedAudios,
                referenceVideo,
                videoDurationSec || 10,
            );
        }
        e.target.value = "";
    };

    // 辅助上传音频处理（支持新增与就地替换）
    const handleUploadAudios = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const replaceTarget = replaceTargetRef.current;
        replaceTargetRef.current = null;

        const newAudios: ReferenceAudio[] = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const hide = message.loading(`正在上传音频 ${file.name}...`, 0);
            try {
                let audioDurationMs: number | undefined;
                try {
                    const tempAudio = new Audio();
                    const aUrl = URL.createObjectURL(file);
                    tempAudio.src = aUrl;
                    await new Promise<void>((resolve) => {
                        tempAudio.onloadedmetadata = () => resolve();
                        tempAudio.onerror = () => resolve();
                    });
                    if (tempAudio.duration && Number.isFinite(tempAudio.duration)) {
                        audioDurationMs = Math.round(tempAudio.duration * 1000);
                    }
                    URL.revokeObjectURL(aUrl);
                } catch {
                    // ignore
                }

                if (audioDurationMs && (audioDurationMs < 2000 || audioDurationMs > 15000)) {
                    message.warning(`音频「${file.name}」时长为 ${Math.round(audioDurationMs / 1000)}s，Seedance 规范建议在 2~15 秒之间`);
                }

                const uploaded = await uploadMediaFile(file, "audio-reference");
                newAudios.push({
                    id: nanoid(),
                    name: file.name,
                    type: "audio",
                    url: uploaded.url,
                    storageKey: uploaded.storageKey,
                    durationMs: audioDurationMs,
                });
            } catch (err) {
                message.error(`音频上传失败: ${file.name}`);
            } finally {
                hide();
            }
        }

        if (newAudios.length > 0) {
            let nextAudios = uploadedAudios;
            if (replaceTarget && newAudios.length === 1) {
                nextAudios = uploadedAudios.map((a) => (a.id === replaceTarget.id ? newAudios[0] : a));
            } else {
                nextAudios = [...uploadedAudios, ...newAudios];
            }
            setUploadedAudios(nextAudios);
            syncAllToDraft(
                prompt,
                { products: productImages, models: modelImages, scenes: sceneImages },
                nextAudios,
                referenceVideo,
                videoDurationSec || 10,
            );
        }
        e.target.value = "";
    };

    // 通用添加文件处理（图片或音频）
    const handleUploadGeneral = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.type.startsWith("image/")) {
                const hide = message.loading(`正在上传 ${file.name}...`, 0);
                try {
                    const uploaded = await uploadImage(file);
                    const dataUrl = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve((reader.result as string) || "");
                        reader.readAsDataURL(file);
                    });
                    const newImg: ReferenceImage = {
                        id: nanoid(),
                        name: file.name,
                        type: "image",
                        dataUrl,
                        url: uploaded.url,
                        storageKey: uploaded.storageKey,
                    };
                    setProductImages((prev) => {
                        const next = [...prev, newImg];
                        syncAllToDraft(
                            prompt,
                            { products: next, models: modelImages, scenes: sceneImages },
                            uploadedAudios,
                            referenceVideo,
                            videoDurationSec || 10,
                        );
                        return next;
                    });
                } catch {
                    message.error(`上传失败: ${file.name}`);
                } finally {
                    hide();
                }
            } else if (file.type.startsWith("audio/")) {
                const hide = message.loading(`正在上传音频 ${file.name}...`, 0);
                try {
                    const uploaded = await uploadMediaFile(file, "audio-reference");
                    const newAudio: ReferenceAudio = {
                        id: nanoid(),
                        name: file.name,
                        type: "audio",
                        url: uploaded.url,
                        storageKey: uploaded.storageKey,
                    };
                    setUploadedAudios((prev) => {
                        const next = [...prev, newAudio];
                        syncAllToDraft(
                            prompt,
                            { products: productImages, models: modelImages, scenes: sceneImages },
                            next,
                            referenceVideo,
                            videoDurationSec || 10,
                        );
                        return next;
                    });
                } catch {
                    message.error(`音频上传失败: ${file.name}`);
                } finally {
                    hide();
                }
            }
        }
        e.target.value = "";
    };

    // 参考视频上传处理
    const handleUploadVideo = async (file: File) => {
        const hide = message.loading(`正在解析参考视频 ${file.name}...`, 0);
        try {
            const tempVideoUrl = URL.createObjectURL(file);
            let posterUrl = "";
            try {
                const captured = await captureVideoPoster(tempVideoUrl);
                if (captured?.poster) {
                    posterUrl = URL.createObjectURL(captured.poster);
                    setVideoPoster(posterUrl);
                }
            } catch {
                // ignore
            }

            const tempVideo = document.createElement("video");
            tempVideo.preload = "metadata";
            tempVideo.src = tempVideoUrl;
            await new Promise<void>((resolve) => {
                tempVideo.onloadedmetadata = () => resolve();
                tempVideo.onerror = () => resolve();
            });

            const originalDurationSec = tempVideo.duration || 0;
            URL.revokeObjectURL(tempVideoUrl);

            if (originalDurationSec < 2) {
                message.warning("视频时长过短（建议在 2 秒以上）");
            }

            let fileToUpload: File = file;
            let finalDurationSec = originalDurationSec;

            if (originalDurationSec > 15) {
                try {
                    const blobUrl = URL.createObjectURL(file);
                    const trimmedBlob = await trimVideoSegment(
                        { url: blobUrl },
                        { startMs: 0, endMs: 15000 },
                        Math.round(originalDurationSec * 1000),
                    );
                    URL.revokeObjectURL(blobUrl);
                    if (trimmedBlob && trimmedBlob.size > 0) {
                        fileToUpload = new File(
                            [trimmedBlob],
                            `seedance_ref_${file.name.replace(/\.[^/.]+$/, "")}.mp4`,
                            { type: "video/mp4" },
                        );
                        finalDurationSec = 15;
                        message.info("参考视频超过 15 秒，已为您自动截取前 15 秒作为 Seedance 动作参考");
                    }
                } catch (trimErr) {
                    console.warn("[ReferenceReplicationPanel] 端侧自动裁剪 15s 失败，保持原视频文件并交由应用层降级:", trimErr);
                }
            }

            setVideoFile(fileToUpload);
            setVideoDurationSec(finalDurationSec);

            const uploaded = await uploadMediaFile(fileToUpload, "video-reference");
            const newRefVideo: ReferenceVideo = {
                id: nanoid(),
                name: fileToUpload.name,
                type: "video",
                url: uploaded.url,
                storageKey: uploaded.storageKey,
                posterUrl: posterUrl || undefined,
                durationMs: Math.round(finalDurationSec * 1000) || 0,
            };
            setReferenceVideo(newRefVideo);

            syncAllToDraft(
                prompt,
                { products: productImages, models: modelImages, scenes: sceneImages },
                uploadedAudios,
                newRefVideo,
                finalDurationSec,
            );
            message.success("参考视频已上传并完成时序提取准备");
        } catch (err) {
            message.error("视频上传失败，请重试");
        } finally {
            hide();
        }
    };

    // 移除单个素材
    const handleRemoveReference = (item: WorkbenchReferenceItem) => {
        if (item.category === "product") {
            setProductImages((prev) => {
                const next = prev.filter((p) => p.id !== item.id);
                syncAllToDraft(prompt, { products: next, models: modelImages, scenes: sceneImages }, uploadedAudios, referenceVideo, videoDurationSec || 10);
                return next;
            });
        } else if (item.category === "model") {
            setModelImages((prev) => {
                const next = prev.filter((m) => m.id !== item.id);
                syncAllToDraft(prompt, { products: productImages, models: next, scenes: sceneImages }, uploadedAudios, referenceVideo, videoDurationSec || 10);
                return next;
            });
        } else if (item.category === "scene") {
            setSceneImages((prev) => {
                const next = prev.filter((s) => s.id !== item.id);
                syncAllToDraft(prompt, { products: productImages, models: modelImages, scenes: next }, uploadedAudios, referenceVideo, videoDurationSec || 10);
                return next;
            });
        } else if (item.category === "audio") {
            setUploadedAudios((prev) => {
                const next = prev.filter((a) => a.id !== item.id);
                syncAllToDraft(prompt, { products: productImages, models: modelImages, scenes: sceneImages }, next, referenceVideo, videoDurationSec || 10);
                return next;
            });
        }
    };

    // 触发替换
    const handleTriggerReplace = (item: WorkbenchReferenceItem) => {
        replaceTargetRef.current = { id: item.id, category: item.category as any };
        if (item.category === "product") {
            productInputRef.current?.click();
        } else if (item.category === "model") {
            modelInputRef.current?.click();
        } else if (item.category === "scene") {
            sceneInputRef.current?.click();
        } else if (item.category === "audio") {
            audioInputRef.current?.click();
        }
    };

    // 清空全部素材
    const handleClearAllReferences = () => {
        setProductImages([]);
        setModelImages([]);
        setSceneImages([]);
        setUploadedAudios([]);
        syncAllToDraft(prompt, { products: [], models: [], scenes: [] }, [], referenceVideo, videoDurationSec || 10);
    };

    // 从剪切板粘贴素材
    const handlePasteFromClipboard = async () => {
        if (onAddFromClipboard) {
            onAddFromClipboard();
            return;
        }
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const type = item.types.find((t) => t.startsWith("image/"));
                if (type) {
                    const blob = await item.getType(type);
                    const file = new File([blob], `clipboard-${Date.now()}.png`, { type });
                    const uploaded = await uploadImage(file);
                    const dataUrl = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve((reader.result as string) || "");
                        reader.readAsDataURL(file);
                    });
                    const newImg: ReferenceImage = {
                        id: nanoid(),
                        name: file.name,
                        type: "image",
                        dataUrl,
                        url: uploaded.url,
                        storageKey: uploaded.storageKey,
                    };
                    setProductImages((prev) => {
                        const next = [...prev, newImg];
                        syncAllToDraft(prompt, { products: next, models: modelImages, scenes: sceneImages }, uploadedAudios, referenceVideo, videoDurationSec || 10);
                        return next;
                    });
                    message.success("已成功从剪切板添加素材");
                    return;
                }
            }
            message.info("剪切板中未检测到图片素材");
        } catch {
            message.warning("无法读取剪切板，请直接点选上传");
        }
    };

    // 路径 B：点击“复刻助手”启动后台分析或查看已有进度/结果
    const handleTriggerReplicationAssistant = async () => {
        if (taskStore.status === "running") {
            taskStore.setModalOpen(true);
            return;
        }

        if (taskStore.status === "completed" && taskStore.result) {
            taskStore.setModalOpen(true);
            return;
        }

        if (!referenceVideo && !videoFile) {
            message.warning("请先添加参考视频（必选）");
            return;
        }

        await taskStore.startTask({
            videoSource: videoFile || referenceVideo!.url,
            productImages,
            modelImages,
            sceneImages,
            audioFiles: uploadedAudios,
            supplementaryNotes: prompt,
            effectiveConfig,
            targetModel,
        });
    };

    // 在弹窗中点击“立即应用”将结果回填到当前主输入框
    const handleApplyResultFromModal = (editedPrompt: string) => {
        onPromptChange?.(editedPrompt);
        syncAllToDraft(
            editedPrompt,
            { products: productImages, models: modelImages, scenes: sceneImages },
            uploadedAudios,
            referenceVideo,
            taskStore.result?.recommendedDurationSec || videoDurationSec || 10,
            false,
        );
        message.success("复刻提示词已成功应用到文本框，您可继续微调或直接点击【立即生成视频】");
    };

    // 扁平合并所有素材项，对齐基础“生成视频工作台”
    const allReferenceItems: WorkbenchReferenceItem[] = [
        ...productImages.map((p) => ({
            id: p.id,
            name: p.name,
            kind: "image" as const,
            category: "product" as const,
            dataUrl: p.dataUrl,
            url: p.url,
            storageKey: p.storageKey,
        })),
        ...modelImages.map((m) => ({
            id: m.id,
            name: m.name,
            kind: "image" as const,
            category: "model" as const,
            dataUrl: m.dataUrl,
            url: m.url,
            storageKey: m.storageKey,
        })),
        ...sceneImages.map((s) => ({
            id: s.id,
            name: s.name,
            kind: "image" as const,
            category: "scene" as const,
            dataUrl: s.dataUrl,
            url: s.url,
            storageKey: s.storageKey,
        })),
        ...uploadedAudios.map((a) => ({
            id: a.id,
            name: a.name,
            kind: "audio" as const,
            category: "audio" as const,
            url: a.url,
            storageKey: a.storageKey,
            durationMs: a.durationMs,
        })),
    ];

    const totalCount = allReferenceItems.length;

    // 构建用于 @ 触发与输入框缩略图 Chip 渲染的完整素材引用列表
    const replicationMentionReferences = useMemo<CanvasResourceReference[]>(() => {
        const list: CanvasResourceReference[] = [];

        // 1. 参考原片视频
        if (referenceVideo) {
            list.push({
                id: referenceVideo.id,
                nodeId: referenceVideo.id,
                kind: "video",
                label: "@视频1",
                title: `参考原片 · ${referenceVideo.name}`,
                previewUrl: videoPoster || referenceVideo.url,
                mediaUrl: referenceVideo.url,
                active: true,
            });
        }

        // 2. 商品图片（首选规范标签 @图片1（商品），同时包含通用别名 @图片1）
        productImages.forEach((img, i) => {
            const num = i + 1;
            list.push({
                id: img.id,
                nodeId: img.id,
                kind: "image",
                label: `@图片${num}（商品）`,
                title: `商品 · ${img.name}`,
                previewUrl: img.dataUrl || img.url,
                active: true,
            });
            list.push({
                id: `${img.id}-alias`,
                nodeId: img.id,
                kind: "image",
                label: `@图片${num}`,
                title: `商品 · ${img.name}`,
                previewUrl: img.dataUrl || img.url,
                active: true,
            });
        });

        // 3. 模特/人物图片
        const pCount = productImages.length;
        modelImages.forEach((img, i) => {
            const num = pCount + i + 1;
            list.push({
                id: img.id,
                nodeId: img.id,
                kind: "image",
                label: `@图片${num}（人物）`,
                title: `人物 · ${img.name}`,
                previewUrl: img.dataUrl || img.url,
                active: true,
            });
            list.push({
                id: `${img.id}-alias`,
                nodeId: img.id,
                kind: "image",
                label: `@图片${num}`,
                title: `人物 · ${img.name}`,
                previewUrl: img.dataUrl || img.url,
                active: true,
            });
        });

        // 4. 场景/背景图片
        const pmCount = pCount + modelImages.length;
        sceneImages.forEach((img, i) => {
            const num = pmCount + i + 1;
            list.push({
                id: img.id,
                nodeId: img.id,
                kind: "image",
                label: `@图片${num}（背景）`,
                title: `背景 · ${img.name}`,
                previewUrl: img.dataUrl || img.url,
                active: true,
            });
            list.push({
                id: `${img.id}-alias`,
                nodeId: img.id,
                kind: "image",
                label: `@图片${num}`,
                title: `背景 · ${img.name}`,
                previewUrl: img.dataUrl || img.url,
                active: true,
            });
        });

        // 5. 参考音频
        uploadedAudios.forEach((aud, i) => {
            list.push({
                id: aud.id,
                nodeId: aud.id,
                kind: "audio",
                label: `@音频${i + 1}`,
                title: `音频 · ${aud.name}`,
                previewUrl: aud.url,
                active: true,
            });
        });

        // 6. 灵感文档
        (textReferences || []).forEach((doc, i) => {
            list.push({
                id: doc.id,
                nodeId: doc.id,
                kind: "text",
                label: `@文档${i + 1}`,
                title: doc.name,
                text: doc.content,
                active: true,
            });
        });

        return list;
    }, [referenceVideo, videoPoster, productImages, modelImages, sceneImages, uploadedAudios, textReferences]);

    const isAssistantRunning = taskStore.status === "running";
    const isAssistantDone = taskStore.status === "completed" && Boolean(taskStore.result);

    return (
        <div className="relative flex flex-col rounded-2xl border border-black/[0.08] bg-white p-3.5 shadow-sm dark:border-white/[0.08] dark:bg-[#1c1c1e] transition-all">
            {/* 隐藏的文件输入组件 */}
            <input
                ref={productInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => handleUploadImages(e, "product")}
            />
            <input
                ref={modelInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => handleUploadImages(e, "model")}
            />
            <input
                ref={sceneInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => handleUploadImages(e, "scene")}
            />
            <input
                ref={audioInputRef}
                type="file"
                multiple
                accept="audio/*"
                className="hidden"
                onChange={handleUploadAudios}
            />
            <input
                ref={generalInputRef}
                type="file"
                multiple
                accept="image/*,audio/*"
                className="hidden"
                onChange={handleUploadGeneral}
            />
            <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUploadVideo(f);
                    e.target.value = "";
                }}
            />

            {/* 顶部标题与退出卡片按钮 */}
            <div className="mb-3 flex items-center justify-between border-b border-black/[0.05] pb-2.5 dark:border-white/[0.05]">
                <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Film className="size-4" />
                    </span>
                    <div>
                        <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                            {skill?.name || "深度复刻"}
                            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                Seedance-2.0
                            </span>
                        </h3>
                        <p className="text-[11px] text-stone-400">
                            {skill?.subtitle || "解构原片，精准换人换品换背景"}
                        </p>
                    </div>
                </div>
                <Button
                    size="small"
                    type="text"
                    icon={<X className="size-4" />}
                    onClick={onExit}
                    className="!text-stone-400 hover:!text-stone-600"
                >
                    退出工作流
                </Button>
            </div>

            <div className="space-y-3">
                {/* 1. 素材卡槽区域：完全对齐基础“生成视频工作台”结构与交互 */}
                <div className="relative min-w-0 shrink-0">
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
                            素材数量 {totalCount} / 15
                        </span>
                        <div className="flex items-center gap-1.5">
                            <Tooltip title="从剪切板粘贴" mouseEnterDelay={0.2}>
                                <Button
                                    type="text"
                                    size="small"
                                    className="!h-7 !w-7 !p-0 !text-stone-400 hover:!text-stone-700 dark:hover:!text-stone-200"
                                    icon={<ClipboardPaste className="size-3.5" />}
                                    onClick={handlePasteFromClipboard}
                                />
                            </Tooltip>
                            {handleOpenPromptModal && (
                                <Tooltip title="提示词模板" mouseEnterDelay={0.2}>
                                    <Button
                                        type="text"
                                        size="small"
                                        className="!h-7 !w-7 !p-0 !text-stone-400 hover:!text-stone-700 dark:hover:!text-stone-200"
                                        icon={<Sparkles className="size-3.5 text-amber-500" />}
                                        onClick={handleOpenPromptModal}
                                    />
                                </Tooltip>
                            )}
                            {handleSavePromptModal && (
                                <Tooltip title="保存为模板" mouseEnterDelay={0.2}>
                                    <Button
                                        type="text"
                                        size="small"
                                        className="!h-7 !w-7 !p-0 !text-stone-400 hover:!text-stone-700 dark:hover:!text-stone-200"
                                        icon={<BookmarkPlus className="size-3.5 text-amber-500" />}
                                        onClick={handleSavePromptModal}
                                    />
                                </Tooltip>
                            )}
                            {onOpenAssetPicker && (
                                <Tooltip title="查看我的资产" mouseEnterDelay={0.2}>
                                    <Button
                                        type="text"
                                        size="small"
                                        className="!h-7 !w-7 !p-0 !text-stone-400 hover:!text-stone-700 dark:hover:!text-stone-200"
                                        icon={<FolderPlus className="size-3.5" />}
                                        onClick={onOpenAssetPicker}
                                    />
                                </Tooltip>
                            )}
                            {totalCount > 0 && (
                                <Tooltip title="清空素材" mouseEnterDelay={0.2}>
                                    <Button
                                        type="text"
                                        size="small"
                                        className="!h-7 !w-7 !p-0 !text-stone-400 hover:!text-red-500 dark:hover:!text-red-400"
                                        icon={<Trash2 className="size-3.5" />}
                                        onClick={handleClearAllReferences}
                                    />
                                </Tooltip>
                            )}
                        </div>
                    </div>

                    <div className="hover-scrollbar hover-scrollbar-hint min-w-0 overflow-x-auto rounded-xl border border-dashed border-stone-200 p-2.5 transition-colors dark:border-stone-800">
                        {totalCount === 0 ? (
                            // 空态：横向展示标准卡槽按钮序列（带竖分割线）
                            <div className="flex min-w-max items-start gap-2">
                                <PanelUploadSlot
                                    icon={<ImagePlus className="size-5" />}
                                    label="添加商品"
                                    onClick={() => productInputRef.current?.click()}
                                />
                                <PanelUploadDivider />
                                <PanelUploadSlot
                                    icon={<ImagePlus className="size-5" />}
                                    label="添加人物"
                                    onClick={() => modelInputRef.current?.click()}
                                />
                                <PanelUploadDivider />
                                <PanelUploadSlot
                                    icon={<ImagePlus className="size-5" />}
                                    label="添加背景"
                                    onClick={() => sceneInputRef.current?.click()}
                                />
                                <PanelUploadDivider />
                                <PanelUploadSlot
                                    icon={<Music2 className="size-5" />}
                                    label="添加声音"
                                    onClick={() => audioInputRef.current?.click()}
                                />
                                <PanelUploadSlot
                                    compact
                                    icon={<Plus className="size-5" />}
                                    label="添加参考"
                                    onClick={() => generalInputRef.current?.click()}
                                />
                            </div>
                        ) : (
                            // 已有素材态：横向展示尺寸为 size-16 的 ReferenceTile 序列
                            <div className="flex min-w-max items-center gap-2">
                                {allReferenceItems.map((item, index) => (
                                    <PanelReferenceTile
                                        key={item.id}
                                        item={item}
                                        index={index}
                                        onReplace={() => handleTriggerReplace(item)}
                                        onRemove={() => handleRemoveReference(item)}
                                    />
                                ))}
                                <PanelUploadSlot
                                    compact
                                    icon={<Plus className="size-5" />}
                                    label="添加参考"
                                    onClick={() => generalInputRef.current?.click()}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* 2. 中部参考视频区（紧凑优化高度，点击或拖拽上传，支持时长解析与封面捕获） */}
                <div className="relative">
                    {referenceVideo ? (
                        <div className="group relative flex h-36 w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-stone-900 dark:border-stone-800">
                            {videoPoster ? (
                                <img src={videoPoster} alt="视频封面" className="size-full object-contain opacity-80" />
                            ) : (
                                <Film className="size-8 text-stone-500" />
                            )}
                            <div className="absolute left-2.5 bottom-2.5 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
                                <Film className="size-3 text-amber-400" />
                                <span className="max-w-[200px] truncate">{referenceVideo.name}</span>
                                {videoDurationSec > 0 && <span className="text-stone-300">· {Math.round(videoDurationSec)}s</span>}
                            </div>
                            <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                    size="small"
                                    className="!bg-black/60 !text-white !border-white/20 hover:!bg-black/80 text-xs"
                                    onClick={() => videoInputRef.current?.click()}
                                >
                                    更换
                                </Button>
                                <Button
                                    size="small"
                                    danger
                                    className="!bg-rose-600/80 !text-white hover:!bg-rose-700 text-xs"
                                    onClick={() => {
                                        setReferenceVideo(null);
                                        setVideoFile(null);
                                        setVideoPoster("");
                                        setVideoDurationSec(0);
                                        syncAllToDraft(
                                            prompt,
                                            { products: productImages, models: modelImages, scenes: sceneImages },
                                            uploadedAudios,
                                            null,
                                            10,
                                        );
                                    }}
                                >
                                    移除
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div
                            onClick={() => videoInputRef.current?.click()}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                const f = e.dataTransfer.files?.[0];
                                if (f && f.type.startsWith("video/")) {
                                    void handleUploadVideo(f);
                                }
                            }}
                            className="group flex h-36 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-stone-200 bg-stone-50/40 hover:border-amber-400 hover:bg-amber-50/20 dark:border-stone-800 dark:bg-[#1a1a1c] transition-all cursor-pointer"
                        >
                            <div className="mb-1.5 flex size-10 items-center justify-center rounded-full bg-stone-100 text-stone-500 group-hover:bg-amber-100 group-hover:text-amber-600 dark:bg-stone-800 transition-colors">
                                <UploadCloud className="size-5" />
                            </div>
                            <div className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                                添加参考视频 (必选)
                            </div>
                            <div className="mt-0.5 text-[10px] text-stone-400">
                                建议 2-15 秒（自动适配 Seedance 动作参考） · 支持 MP4、MOV、WebM
                            </div>
                        </div>
                    )}
                </div>

                {/* 3. 核心合并后的单一主输入框：支持常规复刻输入、@引用素材、模板库及复刻助手推演 */}
                <div className="relative rounded-xl border border-black/[0.08] bg-stone-50/50 p-3 dark:border-white/[0.08] dark:bg-[#232326]">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="font-semibold text-stone-700 dark:text-stone-200 flex items-center gap-1.5">
                            <Sparkles className="size-3.5 text-amber-500" />
                            复刻要求与提示词
                        </span>
                        <div className="flex items-center gap-2">
                            {isAssistantRunning ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 animate-pulse">
                                    <LoaderCircle className="size-3 animate-spin" />
                                    复刻助手正在后台分析中...
                                </span>
                            ) : isAssistantDone ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                    <CheckCircle2 className="size-3" />
                                    已完成分析推演
                                </span>
                            ) : null}
                            <span className="text-[10px] text-stone-400">
                                {prompt.length} / 10000
                            </span>
                        </div>
                    </div>

                    <div className="relative min-h-[105px] flex flex-col">
                        <CanvasPromptChipInput
                            value={prompt}
                            references={replicationMentionReferences}
                            onChange={(val) => {
                                onPromptChange?.(val);
                                syncAllToDraft(
                                    val,
                                    { products: productImages, models: modelImages, scenes: sceneImages },
                                    uploadedAudios,
                                    referenceVideo,
                                    videoDurationSec || 10,
                                );
                            }}
                            showReferenceLabels
                            className="flex-1 min-h-[95px] !border-0 !p-0 !shadow-none !bg-transparent focus:!shadow-none text-xs leading-5 text-stone-900 dark:text-stone-100"
                            placeholder="输入复刻要求或补充说明：可要求保持原片动作与运镜，替换商品、人物、背景，也可输入 @ 快速关联并引用已上传素材呈现缩略图。输入后可直接点击页面下方【立即生成视频】，或点击下方【复刻助手】生成 Seedance-2.0 工业级复刻提示词。"
                            placeholderClassName="left-0 top-0 text-stone-400 dark:text-stone-500"
                        />
                    </div>

                    {/* 底栏控制行：左侧复刻助手；右侧清空（左下角的“@引用素材”已彻底删除） */}
                    <div className="mt-2 flex items-center justify-between border-t border-black/[0.04] pt-2 dark:border-white/[0.04]">
                        <div className="flex items-center gap-2">
                            {/* 路径 B 触发按钮：复刻助手 */}
                            <button
                                type="button"
                                onClick={() => void handleTriggerReplicationAssistant()}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-2xs backdrop-blur-md transition-all active:scale-95 cursor-pointer ${
                                    isAssistantRunning
                                        ? "border-amber-400 bg-amber-100/60 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                                        : isAssistantDone
                                        ? "border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                                        : "border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-amber-700 hover:border-amber-400 hover:from-amber-500/20 hover:to-orange-500/20 hover:text-amber-800 dark:border-amber-400/30 dark:from-amber-500/15 dark:to-orange-500/15 dark:text-amber-300"
                                }`}
                            >
                                {isAssistantRunning ? (
                                    <LoaderCircle className="size-3.5 animate-spin text-amber-600 dark:text-amber-400" />
                                ) : (
                                    <Sparkles className="size-3.5 text-amber-500 dark:text-amber-400" />
                                )}
                                <span>
                                    {isAssistantRunning
                                        ? "查看分析进度..."
                                        : isAssistantDone
                                        ? "查看复刻分析结果"
                                        : "复刻助手"}
                                </span>
                            </button>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-stone-400">
                            {prompt.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onPromptChange?.("");
                                        syncAllToDraft(
                                            "",
                                            { products: productImages, models: modelImages, scenes: sceneImages },
                                            uploadedAudios,
                                            referenceVideo,
                                            videoDurationSec || 10,
                                        );
                                    }}
                                    className="hover:text-stone-600 dark:hover:text-stone-200 transition-colors cursor-pointer"
                                >
                                    清空
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 复刻助手分析进度与结果一体化弹窗（不可取消，后台执行，跨页面不中断） */}
            <ReplicationPromptReviewModal
                open={taskStore.modalOpen}
                initialPrompt={taskStore.draftPrompt || taskStore.result?.prompt || ""}
                onClose={() => taskStore.setModalOpen(false)}
                onApply={handleApplyResultFromModal}
                references={replicationMentionReferences}
            />
        </div>
    );
};

// 基础卡槽按钮组件（100% 对齐基础生成视频工作台 UploadSlot）
function PanelUploadSlot({
    icon,
    label,
    onClick,
    compact = false,
}: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    compact?: boolean;
}) {
    return (
        <button
            type="button"
            className={`group flex shrink-0 flex-col items-center gap-1 text-center text-[11px] transition text-stone-600 hover:text-stone-950 dark:text-stone-300 dark:hover:text-white cursor-pointer ${
                compact ? "w-16" : "w-[4.5rem]"
            }`}
            onClick={onClick}
            title={label}
            aria-label={label}
        >
            <span className="grid size-14 place-items-center rounded-lg border border-stone-200 bg-stone-100 text-stone-400 transition group-hover:-translate-y-0.5 group-hover:border-stone-300 group-hover:bg-stone-200 group-hover:text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-500 dark:group-hover:border-stone-500 dark:group-hover:bg-stone-700 dark:group-hover:text-stone-100">
                {icon}
            </span>
            <span className="max-w-full truncate leading-4">{label}</span>
        </button>
    );
}

// 基础卡槽分割线组件（100% 对齐基础生成视频工作台 UploadDivider）
function PanelUploadDivider() {
    return <span className="mx-1 mt-1 h-14 w-px shrink-0 bg-stone-200 dark:bg-stone-700" aria-hidden="true" />;
}

// 基础已上传素材卡片组件（100% 对齐基础生成视频工作台 ReferenceTile）
function PanelReferenceTile({
    item,
    index,
    onReplace,
    onRemove,
}: {
    item: WorkbenchReferenceItem;
    index: number;
    onReplace: () => void;
    onRemove: () => void;
}) {
    return (
        <div
            className="group relative size-16 shrink-0 aspect-square min-w-16 min-h-16 max-w-16 max-h-16 cursor-pointer overflow-hidden rounded-xl border border-stone-200 bg-stone-100 shadow-sm transition duration-150 hover:z-20 hover:-translate-y-0.5 hover:shadow-md dark:border-stone-700 dark:bg-stone-800"
            tabIndex={0}
            role="button"
            aria-label={item.name}
        >
            {item.kind === "image" ? (
                <div className="relative size-full overflow-hidden rounded-xl">
                    <img
                        src={item.dataUrl || item.url}
                        alt={item.name}
                        className="size-full object-cover block"
                    />
                </div>
            ) : (
                <div className="relative flex size-full flex-col items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-300">
                    <Music2 className="size-5" />
                    {item.durationMs ? (
                        <span className="mt-0.5 text-[9px] font-mono opacity-80">
                            {formatDuration(item.durationMs)}
                        </span>
                    ) : null}
                </div>
            )}

            {/* 左上角序号角标 */}
            <span className="absolute left-1 top-1 z-5 grid size-5 place-items-center rounded-full bg-black/65 text-[10px] font-semibold text-white">
                {index + 1}
            </span>

            {/* 悬停浮层：替换与删除 */}
            <div className="absolute inset-0 z-20 hidden items-center justify-center gap-1 rounded-xl bg-black/45 group-hover:flex group-focus:flex">
                <Tooltip title="替换素材">
                    <button
                        type="button"
                        className="grid size-7 place-items-center rounded-full bg-white/90 text-stone-800 shadow-sm transition hover:bg-white cursor-pointer"
                        onClick={(e) => {
                            e.stopPropagation();
                            onReplace();
                        }}
                        title="替换素材"
                        aria-label="替换素材"
                    >
                        <RefreshCw className="size-3.5" />
                    </button>
                </Tooltip>
                <Tooltip title="移除素材">
                    <button
                        type="button"
                        className="grid size-7 place-items-center rounded-full bg-white/90 text-red-600 shadow-sm transition hover:bg-white cursor-pointer"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove();
                        }}
                        title="移除素材"
                        aria-label="移除素材"
                    >
                        <Trash2 className="size-3.5" />
                    </button>
                </Tooltip>
            </div>
        </div>
    );
}
// @opc-feature: reference-replication-panel [end]
