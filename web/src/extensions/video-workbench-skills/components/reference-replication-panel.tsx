// @opc-feature: reference-replication-panel [start]
import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
    UploadCloud,
    X,
    Plus,
    Film,
    Music2,
    ImagePlus,
    LoaderCircle,
    Sparkles,
} from "lucide-react";
import { Button, App } from "antd";
import type { VideoWorkbenchSkill } from "../types/video-skill-contract";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import { uploadImage } from "@/services/image-storage";
import { uploadMediaFile } from "@/services/file-storage";
import { primeResourceBlobCache } from "@/services/resource-blob-cache";
import { peekLocalFirstMedia } from "@/services/local-first-media-resolver";
import { resolveResourceUrl } from "@/services/api/resources";
import { CachedResourceImage } from "@/components/cached-resource-image";
import { nanoid } from "nanoid";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { resolveChannelVideoModelMaxDuration } from "@/lib/model-capabilities";
import { useDeepReplicationTaskStore } from "../stores/use-deep-replication-task-store";
import { ReplicationPromptReviewModal } from "./replication-prompt-review-modal";
import { captureVideoPoster } from "@/lib/video-poster";
import { trimVideoSegment } from "@/lib/canvas/canvas-video-segment";
import { CanvasPromptChipInput } from "@/components/canvas/canvas-prompt-chip-input";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import type { VideoTextReference } from "@/stores/use-video-workbench-store";
import {
    VideoWorkbenchSkillSlots,
    type VideoWorkbenchSlotConfig,
    type VideoWorkbenchSlotFile,
} from "./video-workbench-skill-slots";

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

    // 动态解析当前目标视频模型最大支持秒数（严禁硬编码 15s）
    const maxDurationSec = useMemo(() => {
        return resolveChannelVideoModelMaxDuration(effectiveConfig, targetModel) || 15;
    }, [effectiveConfig, targetModel]);

    // 提示词弹窗兼容函数
    const handleOpenPromptModal = onOpenPromptDialog || (onOpenPromptTemplate ? () => onOpenPromptTemplate("video") : undefined);
    const handleSavePromptModal = onSavePromptDialog || (onSaveAsTemplate && prompt.trim() ? () => onSaveAsTemplate(prompt.trim(), "video") : undefined);

    // 素材状态分类管理
    const [productImages, setProductImages] = useState<ReferenceImage[]>(() => initialImages || []);
    const [modelImages, setModelImages] = useState<ReferenceImage[]>([]);
    const [sceneImages, setSceneImages] = useState<ReferenceImage[]>([]);
    const [generalImages, setGeneralImages] = useState<ReferenceImage[]>([]);
    const [uploadedAudios, setUploadedAudios] = useState<ReferenceAudio[]>(() => initialAudios || []);

    // 保持与外部初始资产同步（例如通过资产库选取后回填）
    useEffect(() => {
        if (initialImages && initialImages.length > 0) {
            setProductImages(initialImages);
        }
    }, [initialImages]);

    useEffect(() => {
        if (initialAudios && initialAudios.length > 0) {
            setUploadedAudios(initialAudios);
        }
    }, [initialAudios]);

    // 中部参考视频
    const [referenceVideo, setReferenceVideo] = useState<ReferenceVideo | null>(() => initialVideos?.[0] || null);
    const [videoPoster, setVideoPoster] = useState<string>(() => initialVideos?.[0]?.posterUrl || "");
    const [videoDurationSec, setVideoDurationSec] = useState<number>(() =>
        initialVideos?.[0]?.durationMs ? Math.round(initialVideos[0].durationMs / 1000) : 0,
    );
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [isUploadingVideo, setIsUploadingVideo] = useState(false);
    const [videoUploadProgress, setVideoUploadProgress] = useState(0);
    const [videoUploadPhase, setVideoUploadPhase] = useState("");

    const videoInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (initialVideos && initialVideos.length > 0 && initialVideos[0]) {
            setReferenceVideo(initialVideos[0]);
            if (initialVideos[0].posterUrl) setVideoPoster(initialVideos[0].posterUrl);
            if (initialVideos[0].durationMs) setVideoDurationSec(Math.round(initialVideos[0].durationMs / 1000));
        }
    }, [initialVideos]);

    // 实时同步所有素材到上层 Draft（确保路径 A：用户输入后直接点击“立即生成视频”时素材已全部同步）
    const syncAllToDraft = useCallback(
        (
            currentPrompt: string,
            images: {
                products: ReferenceImage[];
                models: ReferenceImage[];
                scenes: ReferenceImage[];
                general?: ReferenceImage[];
            },
            audios: ReferenceAudio[],
            video: ReferenceVideo | null,
            duration?: number,
            silent: boolean = true,
        ) => {
            const combinedImages = [
                ...images.products,
                ...images.models,
                ...images.scenes,
                ...(images.general || []),
            ];
            onApply(currentPrompt, {
                images: combinedImages,
                audios,
                videos: video ? [video] : [],
                durationSec: duration || maxDurationSec,
                silent,
            });
        },
        [onApply, maxDurationSec],
    );

    // 插槽配置列表
    const replicationSlots: VideoWorkbenchSlotConfig[] = useMemo(
        () => [
            { id: "product", label: "添加商品", icon: <ImagePlus className="size-5" />, accept: "image/*", kind: "image", maxCount: 6 },
            { id: "model", label: "添加人物", icon: <ImagePlus className="size-5" />, accept: "image/*", kind: "image", maxCount: 6 },
            { id: "scene", label: "添加背景", icon: <ImagePlus className="size-5" />, accept: "image/*", kind: "image", maxCount: 6 },
            { id: "audio", label: "添加声音", icon: <Music2 className="size-5" />, accept: "audio/*", kind: "audio", maxCount: 3, optional: true },
            { id: "general", label: "添加参考", icon: <Plus className="size-5" />, accept: "image/*", kind: "image", maxCount: 6, optional: true },
        ],
        [],
    );

    // 聚合派生 slotFilesMap
    const slotFilesMap = useMemo<Record<string, VideoWorkbenchSlotFile[]>>(() => {
        return {
            product: productImages.map((p) => ({
                id: p.id,
                name: p.name,
                kind: "image",
                url: p.url,
                dataUrl: p.dataUrl,
                storageKey: p.storageKey,
            })),
            model: modelImages.map((m) => ({
                id: m.id,
                name: m.name,
                kind: "image",
                url: m.url,
                dataUrl: m.dataUrl,
                storageKey: m.storageKey,
            })),
            scene: sceneImages.map((s) => ({
                id: s.id,
                name: s.name,
                kind: "image",
                url: s.url,
                dataUrl: s.dataUrl,
                storageKey: s.storageKey,
            })),
            audio: uploadedAudios.map((a) => ({
                id: a.id,
                name: a.name,
                kind: "audio",
                url: a.url,
                storageKey: a.storageKey,
                durationMs: a.durationMs,
            })),
            general: generalImages.map((g) => ({
                id: g.id,
                name: g.name,
                kind: "image",
                url: g.url,
                dataUrl: g.dataUrl,
                storageKey: g.storageKey,
            })),
        };
    }, [productImages, modelImages, sceneImages, uploadedAudios, generalImages]);

    const totalCount = useMemo(() => {
        return (
            productImages.length +
            modelImages.length +
            sceneImages.length +
            generalImages.length +
            uploadedAudios.length
        );
    }, [productImages, modelImages, sceneImages, generalImages, uploadedAudios]);

    // 批量添加素材到指定插槽（全面接入多级缓存 L1 内存 -> L2 持久化 blob -> L3 远端）
    const handleAddSlotFiles = async (slotId: string, files: File[]) => {
        if (!files.length) return;

        if (slotId === "audio") {
            const added: ReferenceAudio[] = [];
            for (const file of files) {
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
                    } catch {}

                    if (audioDurationMs && (audioDurationMs < 2000 || audioDurationMs > maxDurationSec * 1000)) {
                        message.warning(`音频「${file.name}」时长为 ${Math.round(audioDurationMs / 1000)}s，建议在 2~${maxDurationSec} 秒之间`);
                    }

                    const uploaded = await uploadMediaFile(file, "audio-reference");
                    if (uploaded.storageKey) {
                        try {
                            await primeResourceBlobCache(uploaded.storageKey, file);
                        } catch {}
                    }
                    added.push({
                        id: nanoid(),
                        name: file.name,
                        type: "audio",
                        url: uploaded.url,
                        storageKey: uploaded.storageKey,
                        durationMs: audioDurationMs,
                    });
                } catch {
                    message.error(`音频上传失败: ${file.name}`);
                } finally {
                    hide();
                }
            }

            if (added.length > 0) {
                const nextAudios = [...uploadedAudios, ...added];
                setUploadedAudios(nextAudios);
                syncAllToDraft(
                    prompt,
                    { products: productImages, models: modelImages, scenes: sceneImages, general: generalImages },
                    nextAudios,
                    referenceVideo,
                    videoDurationSec || maxDurationSec,
                );
                message.success(`已添加 ${added.length} 条音频素材`);
            }
            return;
        }

        // 图片类上传
        const addedImages: ReferenceImage[] = [];
        for (const file of files) {
            const hide = message.loading(`正在上传 ${file.name}...`, 0);
            try {
                const uploaded = await uploadImage(file);
                if (uploaded.storageKey) {
                    try {
                        await primeResourceBlobCache(uploaded.storageKey, file);
                    } catch {}
                }
                const dataUrl = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve((reader.result as string) || "");
                    reader.readAsDataURL(file);
                });
                addedImages.push({
                    id: nanoid(),
                    name: file.name,
                    type: "image",
                    dataUrl,
                    url: uploaded.url,
                    storageKey: uploaded.storageKey,
                });
            } catch {
                message.error(`上传失败: ${file.name}`);
            } finally {
                hide();
            }
        }

        if (addedImages.length > 0) {
            let nextProducts = productImages;
            let nextModels = modelImages;
            let nextScenes = sceneImages;
            let nextGeneral = generalImages;

            if (slotId === "product") {
                nextProducts = [...productImages, ...addedImages];
                setProductImages(nextProducts);
            } else if (slotId === "model") {
                nextModels = [...modelImages, ...addedImages];
                setModelImages(nextModels);
            } else if (slotId === "scene") {
                nextScenes = [...sceneImages, ...addedImages];
                setSceneImages(nextScenes);
            } else {
                nextGeneral = [...generalImages, ...addedImages];
                setGeneralImages(nextGeneral);
            }

            syncAllToDraft(
                prompt,
                { products: nextProducts, models: nextModels, scenes: nextScenes, general: nextGeneral },
                uploadedAudios,
                referenceVideo,
                videoDurationSec || maxDurationSec,
            );
            message.success(`已添加 ${addedImages.length} 张图片素材`);
        }
    };

    // 替换指定素材
    const handleReplaceSlotFile = async (slotId: string, fileId: string, file: File) => {
        if (slotId === "audio") {
            const hide = message.loading(`正在替换音频 ${file.name}...`, 0);
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
                } catch {}

                const uploaded = await uploadMediaFile(file, "audio-reference");
                if (uploaded.storageKey) {
                    try {
                        await primeResourceBlobCache(uploaded.storageKey, file);
                    } catch {}
                }
                const updatedAudio: ReferenceAudio = {
                    id: fileId,
                    name: file.name,
                    type: "audio",
                    url: uploaded.url,
                    storageKey: uploaded.storageKey,
                    durationMs: audioDurationMs,
                };
                const nextAudios = uploadedAudios.map((a) => (a.id === fileId ? updatedAudio : a));
                setUploadedAudios(nextAudios);
                syncAllToDraft(
                    prompt,
                    { products: productImages, models: modelImages, scenes: sceneImages, general: generalImages },
                    nextAudios,
                    referenceVideo,
                    videoDurationSec || maxDurationSec,
                );
                message.success("音频已成功替换");
            } catch {
                message.error(`音频替换失败: ${file.name}`);
            } finally {
                hide();
            }
            return;
        }

        // 图片类替换
        const hide = message.loading(`正在替换 ${file.name}...`, 0);
        try {
            const uploaded = await uploadImage(file);
            if (uploaded.storageKey) {
                try {
                    await primeResourceBlobCache(uploaded.storageKey, file);
                } catch {}
            }
            const dataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve((reader.result as string) || "");
                reader.readAsDataURL(file);
            });
            const updatedImage: ReferenceImage = {
                id: fileId,
                name: file.name,
                type: "image",
                dataUrl,
                url: uploaded.url,
                storageKey: uploaded.storageKey,
            };

            let nextProducts = productImages;
            let nextModels = modelImages;
            let nextScenes = sceneImages;
            let nextGeneral = generalImages;

            if (slotId === "product") {
                nextProducts = productImages.map((p) => (p.id === fileId ? updatedImage : p));
                setProductImages(nextProducts);
            } else if (slotId === "model") {
                nextModels = modelImages.map((m) => (m.id === fileId ? updatedImage : m));
                setModelImages(nextModels);
            } else if (slotId === "scene") {
                nextScenes = sceneImages.map((s) => (s.id === fileId ? updatedImage : s));
                setSceneImages(nextScenes);
            } else {
                nextGeneral = generalImages.map((g) => (g.id === fileId ? updatedImage : g));
                setGeneralImages(nextGeneral);
            }

            syncAllToDraft(
                prompt,
                { products: nextProducts, models: nextModels, scenes: nextScenes, general: nextGeneral },
                uploadedAudios,
                referenceVideo,
                videoDurationSec || maxDurationSec,
            );
            message.success("素材已成功替换");
        } catch {
            message.error(`替换失败: ${file.name}`);
        } finally {
            hide();
        }
    };

    // 移除指定素材
    const handleRemoveSlotFile = (slotId: string, fileId: string) => {
        let nextProducts = productImages;
        let nextModels = modelImages;
        let nextScenes = sceneImages;
        let nextGeneral = generalImages;
        let nextAudios = uploadedAudios;

        if (slotId === "product") {
            nextProducts = productImages.filter((p) => p.id !== fileId);
            setProductImages(nextProducts);
        } else if (slotId === "model") {
            nextModels = modelImages.filter((m) => m.id !== fileId);
            setModelImages(nextModels);
        } else if (slotId === "scene") {
            nextScenes = sceneImages.filter((s) => s.id !== fileId);
            setSceneImages(nextScenes);
        } else if (slotId === "audio") {
            nextAudios = uploadedAudios.filter((a) => a.id !== fileId);
            setUploadedAudios(nextAudios);
        } else {
            nextGeneral = generalImages.filter((g) => g.id !== fileId);
            setGeneralImages(nextGeneral);
        }

        syncAllToDraft(
            prompt,
            { products: nextProducts, models: nextModels, scenes: nextScenes, general: nextGeneral },
            nextAudios,
            referenceVideo,
            videoDurationSec || maxDurationSec,
        );
    };

    // 清空全部素材
    const handleClearAllReferences = () => {
        setProductImages([]);
        setModelImages([]);
        setSceneImages([]);
        setGeneralImages([]);
        setUploadedAudios([]);
        syncAllToDraft(
            prompt,
            { products: [], models: [], scenes: [], general: [] },
            [],
            referenceVideo,
            videoDurationSec || maxDurationSec,
        );
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
                    if (uploaded.storageKey) {
                        try {
                            await primeResourceBlobCache(uploaded.storageKey, blob);
                        } catch {}
                    }
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
                    const nextProducts = [...productImages, newImg];
                    setProductImages(nextProducts);
                    syncAllToDraft(
                        prompt,
                        { products: nextProducts, models: modelImages, scenes: sceneImages, general: generalImages },
                        uploadedAudios,
                        referenceVideo,
                        videoDurationSec || maxDurationSec,
                    );
                    message.success("已成功从剪切板添加素材");
                    return;
                }
            }
            message.info("剪切板中未检测到图片素材");
        } catch {
            message.warning("无法读取剪切板，请直接点选上传");
        }
    };

    // 参考视频上传处理（客户端端侧 100% 截取，严禁服务器端转码消耗）
    const handleUploadVideo = async (file: File) => {
        setIsUploadingVideo(true);
        setVideoUploadProgress(10);
        setVideoUploadPhase("正在解析视频元数据...");
        try {
            const tempVideoUrl = URL.createObjectURL(file);
            let posterUrl = "";
            let posterBlob: Blob | undefined;
            try {
                const captured = await captureVideoPoster(tempVideoUrl);
                if (captured?.poster) {
                    posterBlob = captured.poster;
                    posterUrl = URL.createObjectURL(captured.poster);
                    setVideoPoster(posterUrl);
                }
            } catch {}

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

            // 动态依据所选生视频模型的生成时长上限截取（零云端算力消耗，100% 端侧本地执行）
            if (originalDurationSec > maxDurationSec) {
                setVideoUploadProgress(25);
                setVideoUploadPhase(`正在截取前 ${maxDurationSec} 秒动作参考片段...`);
                try {
                    const blobUrl = URL.createObjectURL(file);
                    const trimmedBlob = await trimVideoSegment(
                        { url: blobUrl },
                        { startMs: 0, endMs: Math.round(maxDurationSec * 1000) },
                        Math.round(originalDurationSec * 1000),
                    );
                    URL.revokeObjectURL(blobUrl);
                    if (trimmedBlob && trimmedBlob.size > 0) {
                        fileToUpload = new File(
                            [trimmedBlob],
                            `seedance_ref_${file.name.replace(/\.[^/.]+$/, "")}.mp4`,
                            { type: "video/mp4" },
                        );
                        finalDurationSec = maxDurationSec;
                        message.info(`参考视频超过 ${maxDurationSec} 秒，已为您自动截取前 ${maxDurationSec} 秒作为动作参考`);
                    }
                } catch (trimErr) {
                    console.warn(`[ReferenceReplicationPanel] 端侧自动裁剪 ${maxDurationSec}s 失败，保持原视频文件并交由应用层降级:`, trimErr);
                }
            }

            setVideoFile(fileToUpload);
            setVideoDurationSec(finalDurationSec);

            setVideoUploadProgress(35);
            setVideoUploadPhase("正在上传视频素材...");
            const uploaded = await uploadMediaFile(fileToUpload, "video-reference", (uploadedBytes, totalBytes) => {
                const pct = totalBytes > 0 ? Math.min(99, Math.round((uploadedBytes / totalBytes) * 100)) : 0;
                setVideoUploadProgress(pct);
            });
            if (uploaded.remoteUploadError) {
                throw new Error(uploaded.remoteUploadError);
            }

            // 多级缓存注入：视频源与视频海报
            if (uploaded.storageKey) {
                try {
                    await primeResourceBlobCache(uploaded.storageKey, fileToUpload);
                } catch {}
            }
            if (uploaded.preview?.storageKey && posterBlob) {
                try {
                    await primeResourceBlobCache(uploaded.preview.storageKey, posterBlob);
                } catch {}
            }

            const newRefVideo: ReferenceVideo = {
                id: nanoid(),
                name: fileToUpload.name,
                type: "video",
                url: uploaded.url,
                storageKey: uploaded.storageKey,
                posterUrl: uploaded.preview?.url || posterUrl || undefined,
                posterStorageKey: uploaded.preview?.storageKey || undefined,
                durationMs: Math.round(finalDurationSec * 1000) || 0,
            };
            setReferenceVideo(newRefVideo);

            syncAllToDraft(
                prompt,
                { products: productImages, models: modelImages, scenes: sceneImages, general: generalImages },
                uploadedAudios,
                newRefVideo,
                finalDurationSec,
            );
            setVideoUploadProgress(100);
            message.success("参考视频已上传并完成时序提取准备");
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : "视频上传失败，请重试";
            message.error(errMsg);
        } finally {
            setIsUploadingVideo(false);
            setVideoUploadProgress(0);
            setVideoUploadPhase("");
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
            { products: productImages, models: modelImages, scenes: sceneImages, general: generalImages },
            uploadedAudios,
            referenceVideo,
            taskStore.result?.recommendedDurationSec || videoDurationSec || maxDurationSec,
            false,
        );
        message.success("复刻提示词已成功应用到文本框，您可继续微调或直接点击【立即生成视频】");
    };

    // 构建用于 @ 触发与输入框缩略图 Chip 渲染的完整素材引用列表
    const replicationMentionReferences = useMemo<CanvasResourceReference[]>(() => {
        const list: CanvasResourceReference[] = [];

        // 1. 参考原片视频
        if (referenceVideo) {
            const durLabel = videoDurationSec > 0 ? ` · ${videoDurationSec}s` : "";
            const resolvedPoster = videoPoster || referenceVideo.posterUrl || (referenceVideo.storageKey ? (peekLocalFirstMedia(referenceVideo.storageKey) || resolveResourceUrl(referenceVideo.storageKey)) : "") || referenceVideo.url;
            list.push({
                id: referenceVideo.id,
                nodeId: referenceVideo.id,
                kind: "video",
                label: "@视频1",
                title: `参考原片${durLabel}`,
                previewUrl: resolvedPoster,
                storageKey: referenceVideo.posterStorageKey || referenceVideo.storageKey,
                mediaUrl: referenceVideo.url,
                active: true,
            });
        }

        // 2. 商品图片
        productImages.forEach((img, i) => {
            const num = i + 1;
            const pUrl = img.dataUrl || img.url || (img.storageKey ? (peekLocalFirstMedia(img.storageKey) || resolveResourceUrl(img.storageKey)) : "");
            list.push({
                id: img.id,
                nodeId: img.id,
                kind: "image",
                label: `@图片${num}（商品）`,
                title: `商品 · ${img.name}`,
                previewUrl: pUrl,
                storageKey: img.storageKey,
                active: true,
            });
            list.push({
                id: `${img.id}-alias`,
                nodeId: img.id,
                kind: "image",
                label: `@图片${num}`,
                title: `商品 · ${img.name}`,
                previewUrl: pUrl,
                storageKey: img.storageKey,
                active: true,
            });
        });

        // 3. 模特/人物图片
        const pCount = productImages.length;
        modelImages.forEach((img, i) => {
            const num = pCount + i + 1;
            const pUrl = img.dataUrl || img.url || (img.storageKey ? (peekLocalFirstMedia(img.storageKey) || resolveResourceUrl(img.storageKey)) : "");
            list.push({
                id: img.id,
                nodeId: img.id,
                kind: "image",
                label: `@图片${num}（人物）`,
                title: `人物 · ${img.name}`,
                previewUrl: pUrl,
                storageKey: img.storageKey,
                active: true,
            });
            list.push({
                id: `${img.id}-alias`,
                nodeId: img.id,
                kind: "image",
                label: `@图片${num}`,
                title: `人物 · ${img.name}`,
                previewUrl: pUrl,
                storageKey: img.storageKey,
                active: true,
            });
        });

        // 4. 场景/背景图片
        const pmCount = pCount + modelImages.length;
        sceneImages.forEach((img, i) => {
            const num = pmCount + i + 1;
            const pUrl = img.dataUrl || img.url || (img.storageKey ? (peekLocalFirstMedia(img.storageKey) || resolveResourceUrl(img.storageKey)) : "");
            list.push({
                id: img.id,
                nodeId: img.id,
                kind: "image",
                label: `@图片${num}（背景）`,
                title: `背景 · ${img.name}`,
                previewUrl: pUrl,
                storageKey: img.storageKey,
                active: true,
            });
            list.push({
                id: `${img.id}-alias`,
                nodeId: img.id,
                kind: "image",
                label: `@图片${num}`,
                title: `背景 · ${img.name}`,
                previewUrl: pUrl,
                storageKey: img.storageKey,
                active: true,
            });
        });

        // 5. 参考素材
        const pmsCount = pmCount + sceneImages.length;
        generalImages.forEach((img, i) => {
            const num = pmsCount + i + 1;
            const pUrl = img.dataUrl || img.url || (img.storageKey ? (peekLocalFirstMedia(img.storageKey) || resolveResourceUrl(img.storageKey)) : "");
            list.push({
                id: img.id,
                nodeId: img.id,
                kind: "image",
                label: `@图片${num}（参考）`,
                title: `参考 · ${img.name}`,
                previewUrl: pUrl,
                storageKey: img.storageKey,
                active: true,
            });
        });

        // 6. 参考音频
        uploadedAudios.forEach((aud, i) => {
            list.push({
                id: aud.id,
                nodeId: aud.id,
                kind: "audio",
                label: `@音频${i + 1}`,
                title: `音频 · ${aud.name}`,
                previewUrl: aud.url,
                storageKey: aud.storageKey,
                active: true,
            });
        });

        // 7. 灵感文档
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
    }, [referenceVideo, videoPoster, videoDurationSec, productImages, modelImages, sceneImages, generalImages, uploadedAudios, textReferences]);

    const isAssistantRunning = taskStore.status === "running";
    const isAssistantDone = taskStore.status === "completed" && Boolean(taskStore.result);

    return (
        <div className="relative flex flex-col rounded-2xl border border-black/[0.08] bg-white p-3.5 shadow-sm dark:border-white/[0.08] dark:bg-[#1c1c1e] transition-all">
            {/* 隐藏的视频文件输入 */}
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
                {/* 1. 素材卡槽区域：完全对齐【生图工作台】折叠/展开/放大交互与多级缓存规范 */}
                <VideoWorkbenchSkillSlots
                    slots={replicationSlots}
                    slotFilesMap={slotFilesMap}
                    onAddSlotFiles={handleAddSlotFiles}
                    onReplaceSlotFile={handleReplaceSlotFile}
                    onRemoveSlotFile={handleRemoveSlotFile}
                    onClearAllSlots={handleClearAllReferences}
                    onPasteClipboard={handlePasteFromClipboard}
                    onOpenPromptDialog={handleOpenPromptModal}
                    onSavePromptDialog={handleSavePromptModal}
                    onOpenAssetPicker={onOpenAssetPicker}
                    totalCount={totalCount}
                    maxTotalCount={15}
                />

                {/* 2. 中部参考视频区（组件内部展示进度条，多级缓存无缝对接） */}
                <div className="relative">
                    {referenceVideo && !isUploadingVideo ? (
                        <div className="group relative flex h-36 w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-stone-900 dark:border-stone-800">
                            <CachedResourceImage
                                storageKey={referenceVideo.posterStorageKey || referenceVideo.storageKey}
                                src={videoPoster || referenceVideo.posterUrl || (referenceVideo.storageKey ? (peekLocalFirstMedia(referenceVideo.storageKey) || resolveResourceUrl(referenceVideo.storageKey)) : "")}
                                alt="视频封面"
                                className="size-full object-contain opacity-80"
                                loadingFallback={<div className="size-full animate-pulse bg-stone-800" />}
                                fallback={<Film className="size-8 text-stone-500" />}
                            />
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
                                            { products: productImages, models: modelImages, scenes: sceneImages, general: generalImages },
                                            uploadedAudios,
                                            null,
                                            maxDurationSec,
                                        );
                                    }}
                                >
                                    移除
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div
                            onClick={() => {
                                if (!isUploadingVideo) {
                                    videoInputRef.current?.click();
                                }
                            }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                if (isUploadingVideo) return;
                                const f = e.dataTransfer.files?.[0];
                                if (f && f.type.startsWith("video/")) {
                                    void handleUploadVideo(f);
                                }
                            }}
                            className={`group flex h-36 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all ${
                                isUploadingVideo
                                    ? "border-amber-400 bg-amber-50/30 dark:border-amber-500/40 dark:bg-amber-950/20 cursor-default"
                                    : "border-stone-200 bg-stone-50/40 hover:border-amber-400 hover:bg-amber-50/20 dark:border-stone-800 dark:bg-[#1a1a1c] cursor-pointer"
                            }`}
                        >
                            {isUploadingVideo ? (
                                <div className="flex flex-col items-center justify-center px-4 w-full text-center">
                                    <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
                                        <LoaderCircle className="size-5 animate-spin" />
                                    </div>
                                    <div className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                                        {videoUploadPhase || "正在处理视频素材..."}
                                    </div>
                                    <div className="mt-2.5 flex items-center gap-2 w-48 max-w-full">
                                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
                                            <div
                                                className="h-full rounded-full bg-amber-500 transition-all duration-200"
                                                style={{ width: `${videoUploadProgress}%` }}
                                            />
                                        </div>
                                        <span className="text-[11px] font-mono font-medium text-amber-600 dark:text-amber-400 w-8 text-right">
                                            {videoUploadProgress}%
                                        </span>
                                    </div>
                                    <div className="mt-1 text-[10px] text-stone-400">
                                        正在就地处理，请稍候...
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="mb-1.5 flex size-10 items-center justify-center rounded-full bg-stone-100 text-stone-500 group-hover:bg-amber-100 group-hover:text-amber-600 dark:bg-stone-800 transition-colors">
                                        <UploadCloud className="size-5" />
                                    </div>
                                    <div className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                                        添加参考视频 (必选)
                                    </div>
                                    <div className="mt-0.5 text-[10px] text-stone-400">
                                        建议 2-{maxDurationSec} 秒（自动适配动作参考） · 支持 MP4、MOV、WebM
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* 3. 核心合并后的单一主输入框：支持常规复刻输入、@引用素材、模板库及复刻助手推演 */}
                <div className="relative rounded-xl border border-black/[0.08] bg-stone-50/50 p-3 dark:border-white/[0.08] dark:bg-[#232326]">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="font-semibold text-stone-700 dark:text-stone-200 flex items-center gap-1.5">
                            复刻要求与提示词
                        </span>
                        <div className="flex items-center gap-2">
                            {prompt.trim() && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onPromptChange?.("");
                                        syncAllToDraft(
                                            "",
                                            { products: productImages, models: modelImages, scenes: sceneImages, general: generalImages },
                                            uploadedAudios,
                                            referenceVideo,
                                            videoDurationSec || maxDurationSec,
                                        );
                                    }}
                                    className="text-[11px] text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors cursor-pointer"
                                >
                                    清空
                                </button>
                            )}
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
                                    { products: productImages, models: modelImages, scenes: sceneImages, general: generalImages },
                                    uploadedAudios,
                                    referenceVideo,
                                    videoDurationSec || maxDurationSec,
                                );
                            }}
                            showReferenceLabels
                            className="flex-1 min-h-[95px] !border-0 !p-0 !shadow-none !bg-transparent focus:!shadow-none text-xs leading-5 text-stone-900 dark:text-stone-100"
                            placeholder="输入复刻要求或补充说明：可要求保持原片动作与运镜，替换商品、人物、背景，也可输入 @ 快速关联并引用已上传素材呈现缩略图。输入后可直接点击页面下方【立即生成视频】，或点击下方【复刻助手】生成 Seedance-2.0 工业级复刻提示词。"
                            placeholderClassName="left-0 top-0 text-stone-400 dark:text-stone-500"
                        />
                    </div>

                    {/* 底栏控制行：左侧复刻助手 */}
                    <div className="mt-2 flex items-center justify-between border-t border-black/[0.04] pt-2 dark:border-white/[0.04]">
                        <div className="flex items-center gap-2">
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
                            <span className="text-[11px] text-stone-400">
                                {isAssistantDone
                                    ? "已完成 Seedance-2.0 专业复刻拆解"
                                    : "端侧硬件解构时空与运镜，推演状态并对齐素材"}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 复刻助手分析审核弹窗 */}
            <ReplicationPromptReviewModal
                open={taskStore.modalOpen}
                references={replicationMentionReferences}
                onClose={() => taskStore.setModalOpen(false)}
                onApply={handleApplyResultFromModal}
            />
        </div>
    );
};
// @opc-feature: reference-replication-panel [end]
