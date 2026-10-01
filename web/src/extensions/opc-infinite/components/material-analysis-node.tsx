import { useEffect, useMemo, useRef, useState } from "react";
import { App, Modal, Progress, Switch, Tag, Tooltip, message as staticMessage } from "antd";
import { AlertCircle, Check, Copy, Download, FileAudio, FileImage, FileVideo, Info, LoaderCircle, Maximize2, Play, Plus, RefreshCw, ScanSearch, SlidersHorizontal, Sparkles, Trash2, Upload } from "lucide-react";
import { nanoid } from "nanoid";
import saveAs from "file-saver";

import { useUpstreamNodes, useDownstreamNodes, useCanvasGraphActions } from "@/components/canvas/canvas-node-graph-context";
import { useCanvasNodeActions } from "@/components/canvas/canvas-node-action-context";
import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CanvasNodeData } from "@/types/canvas";
import { CanvasNodeType } from "@/types/canvas";
import { useEffectiveConfig, useConfigStore } from "@/stores/use-config-store";
import { ModelPicker } from "@/components/model-picker";
import { FeatureCreditBadge } from "@/components/feature-credit-badge";
import { useFeatureCredit } from "@/hooks/use-feature-credit";
import { uploadImage } from "@/services/image-storage";
import { uploadMediaFile } from "@/services/file-storage";
import { resolveResourceUrl } from "@/services/api/resources";
import { analyzeCreationAssistantBatch, type AnalysisFile } from "@/services/creation-assistant-analysis";
import { prepareCreationAssistantVideos } from "@/services/creation-assistant-video-analysis";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import {
    CREATION_ASSISTANT_ANALYSIS_PLUGIN_ID,
    CREATION_ASSISTANT_ANALYSIS_NODE_TYPE,
    type MaterialAnalysisMeta,
} from "../services/creation-assistant-contracts";
import { MaterialAnalysisResultDialog } from "./material-analysis-result-dialog";
import { PromptEditorModal } from "./prompt-editor-modal";
import type { CreationAssistantFileSummary, CreationAssistantInsightSection } from "@/stores/use-creation-assistant-store";

type Props = {
    node: CanvasNodeData;
    theme: CanvasTheme;
};

export function MaterialAnalysisNodeContent({ node, theme }: Props) {
    const { message: appMessage } = App.useApp();
    const message = appMessage || staticMessage;
    const upstreamNodes = useUpstreamNodes(node.id);
    const downstreamNodes = useDownstreamNodes(node.id);
    const { connectNodes, disconnectNodes, hasConnection } = useCanvasGraphActions();
    const { updateMetadata } = useCanvasNodeActions();
    const config = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);

    const meta: MaterialAnalysisMeta = useMemo(() => {
        return (node.metadata?.materialAnalysis as MaterialAnalysisMeta) || {};
    }, [node.metadata?.materialAnalysis]);

    const [running, setRunning] = useState<boolean>(meta.status === "running");
    const [progress, setProgress] = useState<{ percent: number; message: string }>({ percent: 0, message: "就绪" });
    const [errorMsg, setErrorMsg] = useState<string>(meta.errorDetails || "");
    const [editorModalOpen, setEditorModalOpen] = useState(false);
    const [localSources, setLocalSources] = useState<NonNullable<MaterialAnalysisMeta["localSources"]>>(meta.localSources || []);
    const [autoConnectDownstream, setAutoConnectDownstream] = useState<boolean>(meta.autoConnectDownstream ?? false);

    const [customRules, setCustomRules] = useState<string>(meta.customRules || "");
    const [replacePrompt, setReplacePrompt] = useState<boolean>(Boolean(meta.replaceBuiltInPrompt));
    const [promptRules, setPromptRules] = useState<string>(meta.promptRules || "");
    const [promptModalOpen, setPromptModalOpen] = useState<boolean>(false);
    const [copied, setCopied] = useState<boolean>(false);

    const defaultModel = meta.model || config.textModel || config.model;
    const [selectedModel, setSelectedModel] = useState<string>(defaultModel);

    useEffect(() => {
        if (meta.model) setSelectedModel(meta.model);
    }, [meta.model]);

    const handleModelChange = (newModel: string) => {
        setSelectedModel(newModel);
        updateMetadata?.(node.id, {
            materialAnalysis: {
                ...meta,
                model: newModel,
            },
        });
    };

    const featureCredit = useFeatureCredit("material_analysis", selectedModel);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        setRunning(meta.status === "running");
        if (meta.errorDetails !== undefined) setErrorMsg(meta.errorDetails);
        if (meta.localSources) setLocalSources(meta.localSources);
        if (meta.autoConnectDownstream !== undefined) setAutoConnectDownstream(meta.autoConnectDownstream);
        if (meta.customRules !== undefined) setCustomRules(meta.customRules);
        if (meta.replaceBuiltInPrompt !== undefined) setReplacePrompt(Boolean(meta.replaceBuiltInPrompt));
        if (meta.promptRules !== undefined) setPromptRules(meta.promptRules);
    }, [meta]);

    const handleToggleAutoConnect = (checked: boolean) => {
        setAutoConnectDownstream(checked);
        updateMetadata?.(node.id, {
            materialAnalysis: {
                ...meta,
                autoConnectDownstream: checked,
            },
        });
        if (checked) {
            // 仅在用户主动开启时单次将上游素材连至下游，绝不在 useEffect 循环内强行重建
            if (connectNodes) {
                const mediaNodes = upstreamNodes.filter(
                    (u) => u.type === CanvasNodeType.Image || u.type === CanvasNodeType.Video || u.type === CanvasNodeType.Audio,
                );
                downstreamNodes.forEach((downstream) => {
                    mediaNodes.forEach((upstream) => {
                        if (upstream.id !== downstream.id && hasConnection && !hasConnection(upstream.id, downstream.id)) {
                            connectNodes(upstream.id, downstream.id);
                        }
                    });
                });
            }
            message.success("已将上游素材连接到下游");
        } else {
            message.info("已关闭下游素材自动连线");
        }
    };

    const handleDisconnectAllDownstream = () => {
        if (!disconnectNodes) return;
        const mediaNodes = upstreamNodes.filter(
            (u) => u.type === CanvasNodeType.Image || u.type === CanvasNodeType.Video || u.type === CanvasNodeType.Audio,
        );
        let count = 0;
        downstreamNodes.forEach((downstream) => {
            mediaNodes.forEach((upstream) => {
                if (hasConnection && hasConnection(upstream.id, downstream.id)) {
                    disconnectNodes(upstream.id, downstream.id);
                    count++;
                }
            });
        });
        setAutoConnectDownstream(false);
        updateMetadata?.(node.id, {
            materialAnalysis: {
                ...meta,
                autoConnectDownstream: false,
            },
        });
        if (count > 0) {
            message.success(`已取消 ${count} 条下游素材直连连线并关闭自动连线`);
        } else {
            message.info("当前下游没有建立素材直连连线，已关闭自动连线");
        }
    };

    // 解析上游媒体节点
    const upstreamMedia = useMemo(() => {
        const images: ReferenceImage[] = [];
        const videos: ReferenceVideo[] = [];
        const audios: ReferenceAudio[] = [];

        upstreamNodes.forEach((n) => {
            const mediaUrl = n.metadata?.content || (n.metadata?.storageKey ? resolveResourceUrl(n.metadata.storageKey) : "");
            if (n.type === CanvasNodeType.Image && mediaUrl) {
                images.push({
                    id: n.id,
                    name: n.title || `图片${images.length + 1}`,
                    type: n.metadata?.mimeType || "image/png",
                    url: mediaUrl,
                    dataUrl: mediaUrl,
                    storageKey: n.metadata?.storageKey,
                });
            } else if (n.type === CanvasNodeType.Video && mediaUrl) {
                videos.push({
                    id: n.id,
                    name: n.title || `视频${videos.length + 1}`,
                    type: n.metadata?.mimeType || "video/mp4",
                    url: mediaUrl,
                    storageKey: n.metadata?.storageKey,
                    bytes: n.metadata?.bytes || 0,
                    durationMs: n.metadata?.durationMs || 0,
                });
            } else if (n.type === CanvasNodeType.Audio && mediaUrl) {
                audios.push({
                    id: n.id,
                    name: n.title || `音频${audios.length + 1}`,
                    type: n.metadata?.mimeType || "audio/wav",
                    url: mediaUrl,
                    storageKey: n.metadata?.storageKey,
                    bytes: n.metadata?.bytes || 0,
                });
            }
        });

        return { images, videos, audios, total: images.length + videos.length + audios.length };
    }, [upstreamNodes]);

    const totalSourcesCount = upstreamMedia.total + localSources.length;

    const combinedSourceMediaList = useMemo(() => {
        const list: Array<{ id: string; name: string; kind: "image" | "video" | "audio"; url?: string; dataUrl?: string }> = [];
        upstreamMedia.images.forEach((img, idx) => {
            list.push({ id: img.id, name: img.name || `图片${idx + 1}`, kind: "image", url: img.url, dataUrl: img.dataUrl });
        });
        upstreamMedia.videos.forEach((vid) => {
            list.push({ id: vid.id, name: vid.name, kind: "video", url: vid.url });
        });
        upstreamMedia.audios.forEach((aud) => {
            list.push({ id: aud.id, name: aud.name, kind: "audio", url: aud.url });
        });
        localSources.forEach((src) => {
            list.push({ id: src.id, name: src.name, kind: src.kind, url: src.url, dataUrl: src.url });
        });
        return list;
    }, [upstreamMedia, localSources]);

    const handleSaveResult = (updated: {
        fileSummaries: CreationAssistantFileSummary[];
        insightSections: CreationAssistantInsightSection[];
        reportText: string;
    }) => {
        updateMetadata?.(node.id, {
            content: updated.reportText,
            prompt: updated.reportText,
            composerContent: updated.reportText,
            materialAnalysis: {
                ...meta,
                result: {
                    ...(meta.result || { version: "material-analysis-result.v1", generatedAt: Date.now(), sourceIds: [] }),
                    fileSummaries: updated.fileSummaries,
                    insightSections: updated.insightSections,
                },
                prompt: updated.reportText,
                content: updated.reportText,
                updatedAt: Date.now(),
            },
        });
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;

        const newSources: NonNullable<MaterialAnalysisMeta["localSources"]> = [...localSources];
        for (const file of files) {
            try {
                if (file.type.startsWith("image/")) {
                    const stored = await uploadImage(file);
                    newSources.push({
                        id: nanoid(),
                        name: file.name,
                        kind: "image",
                        storageKey: stored.storageKey,
                        url: stored.url,
                        mimeType: file.type,
                    });
                } else if (file.type.startsWith("video/")) {
                    const stored = await uploadMediaFile(file, "creation-assistant-source-video");
                    newSources.push({
                        id: nanoid(),
                        name: file.name,
                        kind: "video",
                        storageKey: stored.storageKey,
                        url: stored.url,
                        mimeType: file.type,
                        durationMs: stored.durationMs,
                    });
                } else if (file.type.startsWith("audio/")) {
                    const stored = await uploadMediaFile(file, "creation-assistant-source-audio");
                    newSources.push({
                        id: nanoid(),
                        name: file.name,
                        kind: "audio",
                        storageKey: stored.storageKey,
                        url: stored.url,
                        mimeType: file.type,
                    });
                }
            } catch (err) {
                message.error(`上传 ${file.name} 失败`);
            }
        }

        setLocalSources(newSources);
        updateMetadata?.(node.id, {
            materialAnalysis: {
                ...meta,
                localSources: newSources,
                updatedAt: Date.now(),
            },
        });
        event.target.value = "";
    };

    const removeLocalSource = (id: string) => {
        const next = localSources.filter((s) => s.id !== id);
        setLocalSources(next);
        updateMetadata?.(node.id, {
            materialAnalysis: {
                ...meta,
                localSources: next,
                updatedAt: Date.now(),
            },
        });
    };

    const runAnalysis = async () => {
        if (totalSourcesCount === 0) {
            message.warning("请先连接上游素材节点或上传本地素材文件");
            return;
        }

        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setRunning(true);
        setErrorMsg("");
        setProgress({ percent: 10, message: "正在整理素材列表..." });

        let deductedMicrocredits = 0;
        try {
            const deductRes = await featureCredit.deduct(selectedModel, "画布素材分析");
            deductedMicrocredits = deductRes.deductedMicrocredits;
        } catch (creditErr) {
            const msg = creditErr instanceof Error ? creditErr.message : "积分扣减失败";
            setErrorMsg(msg);
            setRunning(false);
            setProgress({ percent: 0, message: "积分不足" });
            return;
        }

        try {
            const analysisFiles: AnalysisFile[] = [];

            // 上游图片
            upstreamMedia.images.forEach((img, idx) => {
                analysisFiles.push({
                    id: img.id,
                    name: img.name && !img.name.startsWith("上游图片") ? img.name : `图片${idx + 1}`,
                    kind: "image",
                    item: img,
                });
            });

            // 上游视频
            upstreamMedia.videos.forEach((vid) => {
                analysisFiles.push({
                    id: vid.id,
                    name: vid.name,
                    kind: "video",
                    item: vid,
                });
            });

            // 上游音频
            upstreamMedia.audios.forEach((aud) => {
                analysisFiles.push({
                    id: aud.id,
                    name: aud.name,
                    kind: "audio",
                    item: aud,
                });
            });

            // 本地上传素材
            localSources.forEach((src) => {
                if (src.kind === "image") {
                    analysisFiles.push({
                        id: src.id,
                        name: src.name,
                        kind: "image",
                        item: { id: src.id, name: src.name, type: src.mimeType || "image/png", url: src.url || "", dataUrl: src.url || "", storageKey: src.storageKey },
                    });
                } else if (src.kind === "video") {
                    analysisFiles.push({
                        id: src.id,
                        name: src.name,
                        kind: "video",
                        item: { id: src.id, name: src.name, type: src.mimeType || "video/mp4", url: src.url || "", storageKey: src.storageKey, bytes: 0, durationMs: src.durationMs },
                    });
                } else {
                    analysisFiles.push({
                        id: src.id,
                        name: src.name,
                        kind: "audio",
                        item: { id: src.id, name: src.name, type: src.mimeType || "audio/wav", url: src.url || "", storageKey: src.storageKey, bytes: 0 },
                    });
                }
            });

            if (controller.signal.aborted) {
                if (deductedMicrocredits > 0) {
                    void featureCredit.refund(deductedMicrocredits, selectedModel, "素材分析取消退款");
                }
                return;
            }

            // 针对视频进行抽帧与音频准备
            const videoItems = analysisFiles.filter((f) => f.kind === "video").map((f) => f.item as ReferenceVideo);
            let videoAnalyses: any[] = [];
            if (videoItems.length > 0) {
                setProgress({ percent: 30, message: "正在对视频素材进行密集抽帧与特征提取..." });
                videoAnalyses = await prepareCreationAssistantVideos(videoItems);
            }

            if (controller.signal.aborted) {
                if (deductedMicrocredits > 0) {
                    void featureCredit.refund(deductedMicrocredits, selectedModel, "素材分析取消退款");
                }
                return;
            }

            setProgress({ percent: 65, message: "正在调用 AI 大模型进行商品洞察与逐秒拆解..." });

            const effectiveAnalysisModel = selectedModel || config.textModel || config.model;
            const result = await analyzeCreationAssistantBatch(
                { ...config, model: effectiveAnalysisModel, systemPrompt: "" },
                analysisFiles,
                videoAnalyses,
                {
                    customRules: customRules || undefined,
                    replaceBuiltInPrompt: replacePrompt,
                    promptRules: promptRules || undefined,
                },
            );

            if (controller.signal.aborted) {
                if (deductedMicrocredits > 0) {
                    void featureCredit.refund(deductedMicrocredits, selectedModel, "素材分析取消退款");
                }
                return;
            }

            setProgress({ percent: 100, message: "素材分析完成" });

            // 按照标准规范为素材生成 @图片N、@视频N、@音频N 引用代号
            const kindCounters: Record<string, number> = { image: 0, video: 0, audio: 0 };
            const refByFileId = new Map<string, string>();
            result.fileSummaries.forEach((s) => {
                const k = s.mediaType || "video";
                kindCounters[k] = (kindCounters[k] || 0) + 1;
                const prefix = k === "image" ? "图片" : k === "video" ? "视频" : "音频";
                refByFileId.set(s.fileId, `@${prefix}${kindCounters[k]}`);
            });

            // 构造纯文本摘要以供下游消费
            const summaryText = [
                "【素材分析报告】",
                `共分析 ${result.fileSummaries.length} 个素材文件：`,
                ...result.fileSummaries.map((s) => {
                    const refToken = refByFileId.get(s.fileId) || "";
                    const cleanSummary = (s.summary || "")
                        .replace(/\[[^\]]+?\.(?:png|jpe?g|webp|gif|mp4|webm|mp3|wav|m4a|aac)[^\]]*\]/gi, "")
                        .replace(/\[(?:产品图|图片|素材)[^\]]*\]/gi, "")
                        .replace(/\s{2,}/g, " ")
                        .trim();
                    return `${refToken} ${cleanSummary}`;
                }),
                "",
                "【商品核心洞察】",
                ...result.insightSections.map((sec) => {
                    const itemsText = sec.items
                        .map((it) => {
                            const refs = it.sourceFileIds?.map((id) => refByFileId.get(id)).filter(Boolean) || [];
                            const refSuffix = refs.length ? ` (依据素材: ${refs.join("、")})` : "";
                            return `  - ${it.text}${refSuffix}`;
                        })
                        .join("\n");
                    return `■ ${sec.title}：\n${itemsText}`;
                }),
            ].join("\n");

            updateMetadata?.(node.id, {
                content: summaryText,
                prompt: summaryText,
                composerContent: summaryText,
                materialAnalysis: {
                    ...meta,
                    model: selectedModel,
                    status: "success",
                    localSources,
                    customRules,
                    replaceBuiltInPrompt: replacePrompt,
                    promptRules,
                    result: {
                        version: "material-analysis-result.v1",
                        generatedAt: Date.now(),
                        sourceIds: analysisFiles.map((f) => f.id),
                        fileSummaries: result.fileSummaries,
                        insightSections: result.insightSections,
                    },
                    prompt: summaryText,
                    content: summaryText,
                    errorDetails: undefined,
                    updatedAt: Date.now(),
                },
            });

            message.success("素材分析完成！");
        } catch (error) {
            if (deductedMicrocredits > 0) {
                void featureCredit.refund(deductedMicrocredits, selectedModel, "素材分析失败退款");
            }
            if (controller.signal.aborted) return;
            const msg = error instanceof Error ? error.message : String(error);
            setErrorMsg(msg);
            updateMetadata?.(node.id, {
                materialAnalysis: {
                    ...meta,
                    status: "error",
                    errorDetails: msg,
                },
            });
        } finally {
            if (abortControllerRef.current === controller) {
                setRunning(false);
                abortControllerRef.current = null;
            }
        }
    };

    const downloadReportFile = () => {
        const text = node.metadata?.composerContent || node.metadata?.prompt || node.metadata?.content || meta.prompt || "";
        if (!text) {
            message.warning("暂无素材分析报告可下载");
            return;
        }
        const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
        saveAs(blob, `素材分析报告-${Date.now()}.md`);
        message.success("已下载素材分析报告 Markdown 文件");
    };

    const copyReport = async () => {
        const text = node.metadata?.composerContent || node.metadata?.prompt || node.metadata?.content || meta.prompt || "";
        if (!text) {
            message.warning("暂无素材分析报告可复制");
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            message.success("已复制素材分析报告全文");
        } catch {
            message.error("复制失败，请手动选择复制");
        }
    };

    const cancelAnalysis = () => {
        abortControllerRef.current?.abort();
        setRunning(false);
        setProgress({ percent: 0, message: "已取消" });
    };

    const exportJson = () => {
        if (!meta.result) {
            message.warning("暂无分析结果可导出");
            return;
        }
        const data = JSON.stringify(meta.result, null, 2);
        const blob = new Blob([data], { type: "application/json;charset=utf-8" });
        saveAs(blob, `素材分析报告-${Date.now()}.json`);
        message.success("已导出 JSON 文件");
    };

    const inputBaseStyle = {
        background: theme.node.fill,
        color: theme.node.text,
        borderColor: theme.node.stroke,
    };

    return (
        <div
            className="flex h-full min-h-0 w-full flex-col gap-3.5 overflow-y-auto rounded-[inherit] p-4 text-sm"
            style={{ background: theme.node.panel, color: theme.node.text }}
            data-canvas-no-zoom
            data-canvas-no-drag
            onWheel={(e) => e.stopPropagation()}
        >
            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,audio/*" onChange={handleFileUpload} className="hidden" />

            {/* 顶部标题栏 */}
            <div className="flex items-center justify-between border-b pb-2.5" style={{ borderColor: theme.node.stroke }}>
                <div className="flex items-center gap-2">
                    <ScanSearch className="size-5 text-amber-500" />
                    <span className="font-bold text-base">素材分析</span>
                </div>
                <Tag color={running ? "processing" : meta.status === "success" ? "success" : meta.status === "error" ? "error" : "default"} className="m-0 text-xs px-2.5 py-0.5">
                    {running ? "分析中" : meta.status === "success" ? "已完成" : meta.status === "error" ? "失败" : "就绪"}
                </Tag>
            </div>

            {/* 模型选择与积分徽标 */}
            <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span style={{ color: theme.node.muted }} className="shrink-0 text-xs font-medium">分析模型</span>
                    <ModelPicker
                        config={config}
                        value={selectedModel}
                        onChange={handleModelChange}
                        capability="text"
                        className="h-9 text-sm flex-1 min-w-0"
                    />
                </div>
                <FeatureCreditBadge scene="material_analysis" model={selectedModel} size="small" />
            </div>

            {/* 素材管理与下游连线控制（整合紧凑卡片） */}
            <div className="flex flex-col gap-2.5 rounded-xl border p-3 text-xs" style={inputBaseStyle}>
                <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs" style={{ color: theme.node.muted }}>
                        已连接素材 ({totalSourcesCount})
                    </span>
                    <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={running}
                        className="flex items-center gap-1.5 text-amber-500 hover:text-amber-600 disabled:opacity-50 cursor-pointer font-semibold text-xs"
                    >
                        <Plus className="size-3.5" />
                        <span>上传本地文件</span>
                    </button>
                </div>

                {/* 素材标签条 */}
                <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto thin-scrollbar">
                    {upstreamMedia.images.map((img, idx) => (
                        <Tag key={img.id} className="m-0 flex items-center gap-1.5 text-xs px-2 py-0.5" color="blue">
                            <FileImage className="size-3.5" />
                            <span>上游图片{idx + 1}</span>
                        </Tag>
                    ))}
                    {upstreamMedia.videos.map((vid) => (
                        <Tag key={vid.id} className="m-0 flex items-center gap-1.5 text-xs px-2 py-0.5" color="purple">
                            <FileVideo className="size-3.5" />
                            <span className="max-w-[130px] truncate">{vid.name}</span>
                        </Tag>
                    ))}
                    {upstreamMedia.audios.map((aud) => (
                        <Tag key={aud.id} className="m-0 flex items-center gap-1.5 text-xs px-2 py-0.5" color="green">
                            <FileAudio className="size-3.5" />
                            <span className="max-w-[130px] truncate">{aud.name}</span>
                        </Tag>
                    ))}
                    {localSources.map((src) => (
                        <Tag key={src.id} closable onClose={() => removeLocalSource(src.id)} className="m-0 flex items-center gap-1.5 text-xs px-2 py-0.5">
                            {src.kind === "image" ? <FileImage className="size-3.5" /> : src.kind === "video" ? <FileVideo className="size-3.5" /> : <FileAudio className="size-3.5" />}
                            <span className="max-w-[120px] truncate">{src.name}</span>
                        </Tag>
                    ))}
                    {totalSourcesCount === 0 ? (
                        <span className="text-xs text-neutral-400">暂无连接素材，请连线上游节点或上传文件</span>
                    ) : null}
                </div>

                {/* 底部自动连接控制 */}
                <div className="flex items-center justify-between pt-1.5 border-t border-stone-200/50 dark:border-stone-800/50">
                    <div className="flex items-center gap-2">
                        <Switch
                            size="default"
                            checked={autoConnectDownstream}
                            onChange={handleToggleAutoConnect}
                        />
                        <span className="text-xs text-stone-600 dark:text-stone-300 font-medium">自动连接素材到下游</span>
                        <Tooltip title="开启后，自动把当前分析的上游素材直连到所有下游节点，下游节点可直接引用素材画面并进行剧本/分镜创作">
                            <Info className="size-3.5 text-neutral-400 cursor-pointer" />
                        </Tooltip>
                    </div>
                    <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={handleDisconnectAllDownstream}
                        className="text-xs text-neutral-400 hover:text-rose-500 transition-colors cursor-pointer"
                    >
                        一键取消连线
                    </button>
                </div>
            </div>

            {/* 提示词编辑按钮（统一全宽卡片） */}
            <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setPromptModalOpen(true)}
                className="flex items-center justify-between rounded-xl border p-3 text-left transition-colors hover:border-amber-400 dark:hover:border-amber-600 cursor-pointer"
                style={inputBaseStyle}
            >
                <div className="flex items-center gap-2.5 min-w-0">
                    <SlidersHorizontal className="size-4 text-amber-500 shrink-0" />
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-stone-800 dark:text-stone-200">提示词编辑</span>
                            {replacePrompt ? (
                                <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400 font-medium">已替换提示词</span>
                            ) : customRules.trim() ? (
                                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">已补充提示词</span>
                            ) : (
                                <span className="text-xs" style={{ color: theme.node.muted }}>默认内置规范</span>
                            )}
                        </div>
                        <span className="truncate text-xs mt-0.5" style={{ color: theme.node.muted }}>
                            {replacePrompt
                                ? (promptRules.trim() || "未填写自定义 Prompt")
                                : (customRules.trim() || "点击补充个性化关注点或完全替换内置提示词")}
                        </span>
                    </div>
                </div>
                <span className="text-xs text-amber-500 font-semibold shrink-0 ml-2">编辑</span>
            </button>

            {/* 运行进度 */}
            {running ? (
                <div className="flex flex-col gap-2 rounded-xl border p-2.5 bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
                    <div className="flex items-center justify-between text-xs font-medium text-amber-700 dark:text-amber-300">
                        <span className="flex items-center gap-1.5">
                            <LoaderCircle className="size-3.5 animate-spin" />
                            <span>{progress.message}</span>
                        </span>
                        <span>{progress.percent}%</span>
                    </div>
                    <Progress percent={progress.percent} showInfo={false} strokeColor="#f59e0b" size="default" />
                </div>
            ) : null}

            {/* 错误信息 */}
            {errorMsg ? (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-rose-600 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-400">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    <span className="break-all text-xs">{errorMsg}</span>
                </div>
            ) : null}

            {/* 分析结果操作栏 (取消框内明文展示，统一为 放大/复制/下载) */}
            {(meta.result || node.metadata?.content || node.metadata?.prompt) ? (
                <div
                    className="flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs"
                    style={{ background: theme.node.fill, borderColor: theme.node.stroke }}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <Sparkles className="size-4 text-amber-500 shrink-0" />
                        <span className="truncate font-medium">素材洞察报告已就绪</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={() => setEditorModalOpen(true)}
                            className="flex items-center gap-1 hover:text-amber-500 transition-colors cursor-pointer"
                            title="放大展开编辑洞察报告"
                        >
                            <Maximize2 className="size-3.5" />
                            <span>放大</span>
                        </button>
                        <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={copyReport}
                            className="flex items-center gap-1 hover:text-amber-500 transition-colors cursor-pointer"
                            title="复制素材分析报告"
                        >
                            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                            <span>{copied ? "已复制" : "复制"}</span>
                        </button>
                        <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={downloadReportFile}
                            className="flex items-center gap-1 text-amber-500 font-medium hover:text-amber-600 transition-colors cursor-pointer"
                            title="下载报告"
                        >
                            <Download className="size-3.5" />
                            <span>下载</span>
                        </button>
                    </div>
                </div>
            ) : null}

            {/* 底部动作操作栏 */}
            <div className="mt-auto flex items-center justify-between pt-2.5">
                <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => {
                        setLocalSources([]);
                        updateMetadata?.(node.id, {
                            content: "",
                            prompt: "",
                            composerContent: "",
                            materialAnalysis: { status: "idle" },
                        });
                    }}
                    disabled={running}
                    className="flex h-9 items-center gap-1.5 rounded-lg border px-3.5 text-sm transition-colors hover:opacity-80 disabled:opacity-50 cursor-pointer"
                    style={inputBaseStyle}
                >
                    <RefreshCw className="size-3.5" />
                    <span>清空</span>
                </button>

                <div className="flex items-center gap-2">
                    {running ? (
                        <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={cancelAnalysis}
                            className="flex h-9 items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-4 text-sm text-rose-600 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-400 cursor-pointer"
                        >
                            <span>取消</span>
                        </button>
                    ) : (
                        <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={runAnalysis}
                            className="flex h-9 items-center gap-2 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-white shadow-sm transition-transform hover:bg-amber-600 active:scale-95 cursor-pointer"
                        >
                            <Play className="size-3.5 fill-current" />
                            <span>{meta.result ? "重新分析" : "开始分析"}</span>
                        </button>
                    )}
                </div>
            </div>

            {/* 素材分析结果弹窗 */}
            <MaterialAnalysisResultDialog
                open={editorModalOpen}
                onClose={() => setEditorModalOpen(false)}
                initialFileSummaries={meta.result?.fileSummaries || []}
                initialInsightSections={meta.result?.insightSections || []}
                sourceMediaList={combinedSourceMediaList}
                initialReportText={node.metadata?.composerContent || node.metadata?.prompt || node.metadata?.content || meta.prompt || ""}
                onSave={handleSaveResult}
            />

            {/* 提示词编辑弹窗 */}
            <PromptEditorModal
                open={promptModalOpen}
                onClose={() => setPromptModalOpen(false)}
                nodeTitle="素材分析"
                initialMode={replacePrompt ? "replace" : "supplement"}
                supplementPrompt={customRules}
                replacePrompt={promptRules}
                supplementPlaceholder="例如：&#10;1. 重点分析视频中人物的手部操作细节与道具受力反馈；&#10;2. 详细拆解 0-3 秒钩子画面与台词促转化机制；&#10;3. 输出换品后的具体商品拍摄建议..."
                replacePlaceholder="在此输入您的自定义系统提示词（将完全替换内置多模态分析与洞察提取规则）..."
                onSave={({ mode, supplementPrompt, replacePrompt: nextReplace }) => {
                    setCustomRules(supplementPrompt);
                    setPromptRules(nextReplace);
                    setReplacePrompt(mode === "replace");
                    updateMetadata?.(node.id, {
                        materialAnalysis: {
                            ...meta,
                            customRules: supplementPrompt,
                            promptRules: nextReplace,
                            replaceBuiltInPrompt: mode === "replace",
                            updatedAt: Date.now(),
                        },
                    });
                }}
            />
        </div>
    );
}
