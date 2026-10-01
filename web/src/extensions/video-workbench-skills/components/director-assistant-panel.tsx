import React, { useState, useRef, useEffect } from "react";
import { ArrowUp, ChevronDown, ChevronUp, Image as ImageIcon, Mic, Sparkles, BookmarkPlus, X, Maximize2, LoaderCircle, Clapperboard, Check, ClipboardPaste, FolderPlus, Square, Trash2 } from "lucide-react";
import { Button, Modal, Tooltip, App } from "antd";
import type { VideoWorkbenchSkill } from "../types/video-skill-contract";
import { DirectorLanguageDurationPopover } from "./director-language-duration-popover";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio } from "@/types/media";
import type { VideoTextReference } from "@/stores/use-video-workbench-store";
import { uploadImage } from "@/services/image-storage";
import { uploadMediaFile } from "@/services/file-storage";
import { nanoid } from "nanoid";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { requestImageQuestion } from "@/services/api/image";
import { buildVideoWorkbenchPrompts } from "../services/video-workbench-prompt-assembler";
import { CanvasPromptChipInput } from "@/components/canvas/canvas-prompt-chip-input";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";

interface DirectorAssistantPanelProps {
    skill: VideoWorkbenchSkill | null;
    onExitDirector: () => void;
    onApplyScript: (script: string, meta?: { images?: ReferenceImage[]; audios?: ReferenceAudio[]; durationSec?: number }) => void;
    initialImages?: ReferenceImage[];
    initialAudios?: ReferenceAudio[];
    textReferences?: VideoTextReference[];
    onRemoveTextReference?: (id: string) => void;
    onOpenAssetPicker?: () => void;
    onOpenPromptDialog?: () => void;
    onSavePromptDialog?: () => void;
    onAddFromClipboard?: () => void;
    model?: string;
}

const DEFAULT_QUICK_PHRASES = [
    "直击产品核心痛点",
    "利用新奇场景开场",
    "制造强烈情绪反转",
    "用反常识观点开场",
    "真实痛点引出需求",
    "强烈对比突出差异",
];

export const DirectorAssistantPanel: React.FC<DirectorAssistantPanelProps> = ({
    skill,
    onExitDirector,
    onApplyScript,
    initialImages = [],
    initialAudios = [],
    textReferences = [],
    onRemoveTextReference,
    onOpenAssetPicker,
    onOpenPromptDialog,
    onSavePromptDialog,
    onAddFromClipboard,
    model,
}) => {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const [language, setLanguage] = useState<"zh" | "en">(skill?.defaultLanguage || "zh");
    const [durationSec, setDurationSec] = useState<number>(skill?.defaultDurationSec || 15);
    const [notes, setNotes] = useState<string>("");
    const abortControllerRef = useRef<AbortController | null>(null);
    const prevSkillIdRef = useRef<string | null | undefined>(undefined);
    useEffect(() => {
        if (prevSkillIdRef.current === undefined) {
            prevSkillIdRef.current = skill?.id || null;
            return;
        }
        if (prevSkillIdRef.current !== (skill?.id || null)) {
            prevSkillIdRef.current = skill?.id || null;
            // 切换卡片：清除输入框文字，保留已上传素材文件
            setNotes("");
            if (skill?.defaultDurationSec) {
                setDurationSec(skill.defaultDurationSec);
            }
            if (skill?.defaultLanguage) {
                setLanguage(skill.defaultLanguage);
            }
        }
    }, [skill?.id]);

    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
            }
        };
    }, []);

    const [uploadedImages, setUploadedImages] = useState<ReferenceImage[]>(initialImages);
    const [uploadedAudios, setUploadedAudios] = useState<ReferenceAudio[]>(initialAudios);

    useEffect(() => {
        if (initialImages && initialImages.length > 0) {
            setUploadedImages(initialImages);
        }
    }, [initialImages]);

    useEffect(() => {
        if (initialAudios && initialAudios.length > 0) {
            setUploadedAudios(initialAudios);
        }
    }, [initialAudios]);

    // 构建用于 @ 触发与输入框缩略图 Chip 渲染的素材引用列表
    const directorMentionReferences = React.useMemo<CanvasResourceReference[]>(() => {
        const list: CanvasResourceReference[] = [];

        // 1. 参考图片
        uploadedImages.forEach((img, i) => {
            list.push({
                id: img.id,
                nodeId: img.id,
                kind: "image",
                label: `@图片${i + 1}`,
                title: img.name || `参考图 ${i + 1}`,
                previewUrl: img.dataUrl || img.url,
                active: true,
            });
        });

        // 2. 参考音频
        uploadedAudios.forEach((aud, i) => {
            list.push({
                id: aud.id,
                nodeId: aud.id,
                kind: "audio",
                label: `@音频${i + 1}`,
                title: aud.name || `参考音频 ${i + 1}`,
                previewUrl: aud.url,
                active: true,
            });
        });

        // 3. 灵感文档
        textReferences.forEach((doc, i) => {
            list.push({
                id: doc.id,
                nodeId: doc.id,
                kind: "text",
                label: `@文档${i + 1}`,
                title: doc.name || `灵感 ${i + 1}`,
                text: doc.content,
                active: true,
            });
        });

        return list;
    }, [uploadedImages, uploadedAudios, textReferences]);

    // 从剪切板粘贴图片处理
    const handleAddFromClipboard = async () => {
        try {
            const items = await navigator.clipboard.read();
            const imageBlobs: Blob[] = [];
            for (const item of items) {
                const type = item.types.find((t) => t.startsWith("image/"));
                if (type) {
                    imageBlobs.push(await item.getType(type));
                }
            }
            if (!imageBlobs.length) {
                message.info("剪切板中没有检测到图片");
                return;
            }
            let addedCount = 0;
            for (let i = 0; i < imageBlobs.length; i++) {
                const blob = imageBlobs[i];
                const file = new File([blob], `clipboard-${Date.now()}-${i + 1}.png`, { type: blob.type });
                const res = await uploadImage(file);
                setUploadedImages((prev) => [
                    ...prev,
                    {
                        id: nanoid(),
                        name: file.name,
                        type: res.mimeType || file.type,
                        dataUrl: res.url,
                        storageKey: res.storageKey,
                        bytes: res.bytes || file.size,
                        width: res.width,
                        height: res.height,
                    },
                ]);
                addedCount++;
            }
            message.success(`已从剪切板添加 ${addedCount} 张图片`);
        } catch {
            if (onAddFromClipboard) {
                onAddFromClipboard();
            } else {
                message.error("无法读取剪切板，请检查浏览器权限");
            }
        }
    };

    // 生成与流式状态
    const [generating, setGenerating] = useState(false);
    const [thinkingText, setThinkingText] = useState("");
    const [thinkingExpanded, setThinkingExpanded] = useState(true);
    const [generatedScript, setGeneratedScript] = useState("");
    const [editorModalOpen, setEditorModalOpen] = useState(false);
    const [editingScript, setEditingScript] = useState("");

    const imageInputRef = useRef<HTMLInputElement>(null);
    const audioInputRef = useRef<HTMLInputElement>(null);

    const activePhrases = skill?.suggestedQuickPhrases?.length
        ? skill.suggestedQuickPhrases
        : DEFAULT_QUICK_PHRASES;

    // 点击快捷需求短句标签
    const handlePhraseClick = (phrase: string) => {
        setNotes((prev) => {
            const trimmed = prev.trim();
            if (!trimmed) return phrase;
            if (trimmed.includes(phrase)) return prev;
            return `${trimmed}，${phrase}`;
        });
    };

    // 上传图片处理
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || !files.length) return;
        const file = files[0];
        try {
            const res = await uploadImage(file);
            setUploadedImages((prev) => [
                ...prev,
                {
                    id: nanoid(),
                    name: file.name,
                    type: res.mimeType || file.type,
                    dataUrl: res.url,
                    storageKey: res.storageKey,
                    bytes: res.bytes || file.size,
                    width: res.width,
                    height: res.height,
                },
            ]);
            message.success("图片已添加");
        } catch (err) {
            message.error("图片上传失败");
        } finally {
            if (imageInputRef.current) imageInputRef.current.value = "";
        }
    };

    // 上传音频处理
    const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || !files.length) return;
        const file = files[0];
        try {
            const res = await uploadMediaFile(file, "audio-reference");
            setUploadedAudios((prev) => [
                ...prev,
                {
                    id: nanoid(),
                    url: res.url,
                    storageKey: res.storageKey,
                    name: file.name,
                    bytes: res.bytes || file.size,
                    type: res.mimeType || file.type,
                    durationMs: res.durationMs,
                },
            ]);
            message.success("声音已添加");
        } catch (err) {
            message.error("声音上传失败");
        } finally {
            if (audioInputRef.current) audioInputRef.current.value = "";
        }
    };

    const handleAbort = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setGenerating(false);
        message.info("已停止生成");
    };

    // 执行生成脚本（单请求端到端直出，实时解析思考推演与分镜）
    const handleGenerate = async () => {
        const targetModel = model || effectiveConfig.textModel || effectiveConfig.model;
        if (!isAiConfigReady(effectiveConfig, targetModel)) {
            message.warning("请先在全局设置中配置大模型 API Key 或模型渠道");
            return;
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;

        setGenerating(true);
        setThinkingText("");
        setGeneratedScript("");
        setThinkingExpanded(true);

        try {
            // 1. 组装单请求提示词 Bundle
            const inspirationPrompt = textReferences.length > 0
                ? textReferences.map((t) => (t.name ? `【${t.name}】\n${t.content}` : t.content)).join("\n\n")
                : undefined;

            const promptBundle = buildVideoWorkbenchPrompts({
                skillId: skill?.id || "custom",
                skillName: skill?.name || "综合视频创作",
                durationSec,
                videoModel: targetModel,
                uploadedImages,
                uploadedAudios,
                notes,
                inspirationPrompt,
                language,
            });

            // 2. 发起流式请求并实时解析
            let accumulated = "";

            await requestImageQuestion(
                {
                    ...effectiveConfig,
                    model: targetModel,
                    systemPrompt: promptBundle.systemPrompt,
                },
                [{ role: "user", content: [{ type: "text", text: promptBundle.userPrompt }] }],
                (chunk: string) => {
                    if (controller.signal.aborted) return;
                    accumulated += chunk;

                    // 实时流式分流：解析 <thinking> 与 正式分镜
                    const thinkingStart = accumulated.indexOf("<thinking>");
                    if (thinkingStart !== -1) {
                        const thinkingEnd = accumulated.indexOf("</thinking>");
                        if (thinkingEnd !== -1) {
                            const thinkingPart = accumulated.slice(thinkingStart + 10, thinkingEnd).trim();
                            const scriptPart = accumulated.slice(thinkingEnd + 11).trimStart();
                            setThinkingText(thinkingPart);
                            setGeneratedScript(scriptPart);
                        } else {
                            const thinkingPart = accumulated.slice(thinkingStart + 10).trimStart();
                            setThinkingText(thinkingPart);
                        }
                    } else {
                        setGeneratedScript(accumulated);
                    }
                },
                {
                    signal: controller.signal,
                    temperature: 0.85,
                    presence_penalty: 0.2,
                },
            );

            if (controller.signal.aborted) return;

            // 3. 最终收尾
            let finalScript = accumulated;
            const thinkingEnd = accumulated.indexOf("</thinking>");
            if (thinkingEnd !== -1) {
                finalScript = accumulated.slice(thinkingEnd + 11).trim();
            }
            setGeneratedScript(finalScript);
            message.success("分镜脚本生成完成！");
        } catch (err: unknown) {
            if (controller.signal.aborted) return;
            const errMsg = err instanceof Error ? err.message : String(err);
            message.error(`生成失败: ${errMsg}`);
        } finally {
            if (abortControllerRef.current === controller) {
                abortControllerRef.current = null;
                setGenerating(false);
            }
        }
    };

    const hasResult = Boolean(generatedScript.trim());

    return (
        <div className="relative flex flex-col flex-1 min-h-[560px] h-full justify-between">
            {/* 隐藏的上传 input */}
            <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
            />
            <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={handleAudioUpload}
            />

            {/* ══════════════════════════════════════════════════════════
                中间核心动态区域：
                未生成时展示「居中图标 + 标题 + 快捷短句」；
                生成时/生成后展示「思考折叠块 + 流式脚本 + 放大编辑按钮」
               ══════════════════════════════════════════════════════════ */}
            <div className="flex-1 flex flex-col items-center justify-center min-h-[160px] sm:min-h-[200px] p-2 sm:p-4">
                {!hasResult && !generating ? (
                    <div className="flex flex-col items-center text-center max-w-lg">
                        {/* 居中浅金质感图标 (待办/多媒体编导) */}
                        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400 shadow-2xs">
                            <Clapperboard className="size-7 stroke-[1.5]" />
                        </div>

                        {/* 居中标题 */}
                        <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
                            你想创作一条什么视频？
                        </h2>

                        {/* 快捷创作需求短句药丸标签组 */}
                        <div className="mt-5 flex flex-wrap justify-center gap-2 max-w-md">
                            {activePhrases.map((phrase, idx) => {
                                const isSelected = notes.includes(phrase);
                                return (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => handlePhraseClick(phrase)}
                                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-all cursor-pointer ${
                                            isSelected
                                                ? "border-amber-400/80 bg-amber-50 text-amber-900 font-semibold shadow-2xs dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-300"
                                                : "border-black/[0.08] bg-white text-stone-700 hover:border-amber-300 hover:bg-amber-50/40 dark:border-white/[0.08] dark:bg-[#202022] dark:text-stone-300 dark:hover:bg-[#28282a]"
                                        }`}
                                    >
                                        {phrase}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="w-full max-w-2xl flex flex-col gap-3 min-h-0 flex-1 overflow-y-auto thin-scrollbar p-2">
                        {/* 思考过程可折叠块 */}
                        {thinkingText && (
                            <div className="rounded-xl border border-black/[0.06] bg-stone-50/80 dark:border-white/[0.06] dark:bg-[#222225] p-3 text-xs">
                                <button
                                    type="button"
                                    onClick={() => setThinkingExpanded((prev) => !prev)}
                                    className="flex w-full items-center justify-between font-semibold text-stone-600 dark:text-stone-300 cursor-pointer"
                                >
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="size-3.5 text-amber-500" />
                                        <span>编导大模型思考过程</span>
                                        {generating && <LoaderCircle className="size-3 animate-spin text-stone-400" />}
                                    </div>
                                    {thinkingExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                                </button>
                                {thinkingExpanded && (
                                    <pre className="mt-2 text-stone-500 dark:text-stone-400 font-mono whitespace-pre-wrap leading-relaxed text-[11px]">
                                        {thinkingText}
                                    </pre>
                                )}
                            </div>
                        )}

                        {/* 分镜脚本输出区 */}
                        {generatedScript && (
                            <div className="relative flex-1 rounded-xl border border-black/[0.08] bg-white p-4 shadow-xs dark:border-white/[0.08] dark:bg-[#1e1e20]">
                                <div className="flex items-center justify-between pb-2 mb-2 border-b border-black/[0.04] dark:border-white/[0.04]">
                                    <span className="text-xs font-bold text-stone-800 dark:text-stone-200">
                                        分镜脚本生成结果
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            size="small"
                                            icon={<Maximize2 className="size-3" />}
                                            onClick={() => {
                                                setEditingScript(generatedScript);
                                                setEditorModalOpen(true);
                                            }}
                                        >
                                            放大编辑脚本
                                        </Button>
                                        <Button
                                            size="small"
                                            type="primary"
                                            onClick={() =>
                                                onApplyScript(generatedScript, {
                                                    images: uploadedImages,
                                                    audios: uploadedAudios,
                                                    durationSec,
                                                })
                                            }
                                        >
                                            应用脚本
                                        </Button>
                                    </div>
                                </div>
                                <pre className="font-sans text-xs text-stone-800 dark:text-stone-200 whitespace-pre-wrap leading-relaxed max-h-[240px] overflow-y-auto thin-scrollbar">
                                    {generatedScript}
                                </pre>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ══════════════════════════════════════════════════════════
                右下角 [ 退出编导 ] 按钮 (白底细边灰字高质感药丸按钮，杜绝黑底)
               ══════════════════════════════════════════════════════════ */}
            <div className="flex justify-end pr-2 pb-1.5">
                <button
                    type="button"
                    onClick={onExitDirector}
                    className="flex items-center justify-center rounded-lg border border-stone-200/90 bg-white/95 px-3.5 py-1 text-xs font-medium text-stone-700 shadow-2xs hover:border-stone-300 hover:bg-stone-50 active:scale-95 transition-all dark:border-stone-700 dark:bg-[#252528] dark:text-stone-200 dark:hover:bg-[#2c2c30] cursor-pointer"
                >
                    退出编导
                </button>
            </div>

            {/* ══════════════════════════════════════════════════════════
                底部输入框容器 (加大输入框，包含剪贴板、创作灵感、我的资产)
               ══════════════════════════════════════════════════════════ */}
            <div className="relative rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-[#1e1e20] focus-within:ring-1 focus-within:ring-amber-500/30">
                {/* 上部槽位：左侧添加图片与声音，右侧保留原有的三大操作按钮（剪切板、创作灵感、我的资产） */}
                <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-black/[0.04] dark:border-white/[0.04]">
                    <div className="flex items-center gap-3 overflow-x-auto thin-scrollbar">
                        {/* 添加图片槽 */}
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => imageInputRef.current?.click()}
                                className="group flex size-12 flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 hover:border-amber-400 bg-stone-50/60 hover:bg-amber-50/30 transition-all dark:border-stone-700 dark:bg-[#252528] cursor-pointer"
                            >
                                <ImageIcon className="size-4 text-stone-500 group-hover:text-amber-600 dark:text-stone-400" />
                                <span className="mt-0.5 text-[9px] text-stone-500">添加图片</span>
                            </button>
                            {uploadedImages.map((img) => (
                                <div key={img.id} className="relative size-12 rounded-xl overflow-hidden border border-black/[0.06] group">
                                    <img src={img.dataUrl} alt={img.name} className="size-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => setUploadedImages((prev) => prev.filter((i) => i.id !== img.id))}
                                        className="absolute inset-0 flex items-center justify-center bg-rose-600/80 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* 添加声音槽 */}
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => audioInputRef.current?.click()}
                                className="group flex size-12 flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 hover:border-amber-400 bg-stone-50/60 hover:bg-amber-50/30 transition-all dark:border-stone-700 dark:bg-[#252528] cursor-pointer"
                            >
                                <Mic className="size-4 text-stone-500 group-hover:text-amber-600 dark:text-stone-400" />
                                <span className="mt-0.5 text-[9px] text-stone-500">声音(可选)</span>
                            </button>
                            {uploadedAudios.map((aud) => (
                                <div key={aud.id} className="relative flex size-12 flex-col items-center justify-center rounded-xl bg-stone-100 dark:bg-[#2c2c2e] border border-black/[0.06] group text-[10px]">
                                    <span className="truncate max-w-[40px] font-mono text-[9px]">{aud.name}</span>
                                    <button
                                        type="button"
                                        onClick={() => setUploadedAudios((prev) => prev.filter((a) => a.id !== aud.id))}
                                        className="absolute inset-0 flex items-center justify-center bg-rose-600/80 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 右侧：项目原有的四大操作入口（从剪切板粘贴、提示词模板、保存为模板、查看我的资产） */}
                    <div className="flex items-center gap-1.5 shrink-0 self-start pt-1">
                        <Tooltip title="从剪切板粘贴" mouseEnterDelay={0.2}>
                            <Button
                                type="text"
                                size="small"
                                className="!h-7 !w-7 !p-0 !text-stone-400 hover:!text-stone-700 dark:hover:!text-stone-200"
                                icon={<ClipboardPaste className="size-3.5" />}
                                onClick={handleAddFromClipboard}
                            />
                        </Tooltip>
                        {onOpenPromptDialog && (
                            <Tooltip title="提示词模板" mouseEnterDelay={0.2}>
                                <Button
                                    type="text"
                                    size="small"
                                    className="!h-7 !w-7 !p-0 !text-stone-400 hover:!text-stone-700 dark:hover:!text-stone-200"
                                    icon={<Sparkles className="size-3.5 text-amber-500" />}
                                    onClick={onOpenPromptDialog}
                                />
                            </Tooltip>
                        )}
                        {onSavePromptDialog && (
                            <Tooltip title="保存为模板" mouseEnterDelay={0.2}>
                                <Button
                                    type="text"
                                    size="small"
                                    className="!h-7 !w-7 !p-0 !text-stone-400 hover:!text-stone-700 dark:hover:!text-stone-200"
                                    icon={<BookmarkPlus className="size-3.5 text-amber-500" />}
                                    onClick={onSavePromptDialog}
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
                        {(uploadedImages.length > 0 || uploadedAudios.length > 0) && (
                            <Tooltip title="清空素材" mouseEnterDelay={0.2}>
                                <Button
                                    type="text"
                                    size="small"
                                    className="!h-7 !w-7 !p-0 !text-stone-400 hover:!text-red-500 dark:hover:!text-red-400"
                                    icon={<Trash2 className="size-3.5" />}
                                    onClick={() => {
                                        setUploadedImages([]);
                                        setUploadedAudios([]);
                                    }}
                                />
                            </Tooltip>
                        )}
                    </div>
                </div>

                {/* 已引入的创作灵感胶囊展示（支持悬浮预览全文与一键移除） */}
                {textReferences.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pb-2.5 mb-2 border-b border-black/[0.04] dark:border-white/[0.04]">
                        <span className="text-[11px] font-medium text-stone-400 dark:text-stone-500 flex items-center gap-1 shrink-0 select-none">
                            <Sparkles className="size-3 text-amber-500" />
                            已引用灵感:
                        </span>
                        {textReferences.map((refItem) => (
                            <Tooltip
                                key={refItem.id}
                                title={
                                    <div className="max-w-xs text-xs space-y-1.5 p-0.5">
                                        <div className="font-semibold text-amber-400 flex items-center gap-1">
                                            <Sparkles className="size-3" />
                                            {refItem.name || "创作灵感"}
                                        </div>
                                        <div className="line-clamp-6 text-stone-200 leading-relaxed text-[11px]">
                                            {refItem.content}
                                        </div>
                                    </div>
                                }
                            >
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-400/15 dark:text-amber-300 border border-amber-500/20 shadow-2xs transition-colors hover:border-amber-500/40">
                                    <span className="max-w-[150px] truncate">{refItem.name || "参考灵感"}</span>
                                    {onRemoveTextReference && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onRemoveTextReference(refItem.id);
                                            }}
                                            className="ml-0.5 rounded-full p-0.5 text-amber-600 hover:bg-amber-500/20 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200 cursor-pointer transition-colors"
                                            title="移除此灵感"
                                        >
                                            <X className="size-3" />
                                        </button>
                                    )}
                                </span>
                            </Tooltip>
                        ))}
                    </div>
                )}

                {/* 补充输入框（支持输入 @ 弹出已上传素材选择并呈现缩略图 Chip，企业级流畅所见即所得） */}
                <div className="relative flex flex-col min-h-[220px] md:min-h-[260px] lg:min-h-[280px]">
                    <CanvasPromptChipInput
                        value={notes}
                        references={directorMentionReferences}
                        onChange={setNotes}
                        showReferenceLabels
                        placeholder={
                            skill?.placeholder ||
                            "分析素材，并生成脚本\n（可在此补充拍摄场景、演员人设、产品核心卖点、反转剧情、口播对白要求或指定镜头节奏；键入 @ 可引用已添加素材并呈现缩略图...支持大段分行描述）"
                        }
                        placeholderClassName="left-2 top-2 text-stone-400 dark:text-stone-500 whitespace-pre-line leading-7"
                        className="w-full flex-1 min-h-[200px] md:min-h-[240px] lg:min-h-[260px] !border-0 !bg-transparent p-2 text-[15px] leading-7 text-stone-900 dark:text-stone-100 !shadow-none focus:!shadow-none outline-none thin-scrollbar"
                    />
                </div>

                {/* 底栏控制行：左下角语言时长，右下角字数统计、清空、积分与发送按钮 */}
                <div className="mt-3 flex items-center justify-between border-t border-black/[0.04] pt-2.5 dark:border-white/[0.04]">
                    <DirectorLanguageDurationPopover
                        language={language}
                        durationSec={durationSec}
                        onLanguageChange={setLanguage}
                        onDurationChange={setDurationSec}
                    />

                    <div className="flex items-center gap-3">
                        {notes.length > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-stone-400">{notes.length} 字</span>
                                <button
                                    type="button"
                                    onClick={() => setNotes("")}
                                    className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors cursor-pointer"
                                >
                                    清空
                                </button>
                            </div>
                        )}
                        <span className="text-xs text-stone-400">✦ 已消耗 0 积分</span>
                        <button
                            type="button"
                            onClick={generating ? handleAbort : handleGenerate}
                            className="flex size-8.5 items-center justify-center rounded-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-2xs shadow-amber-500/20 transition-all active:scale-95 cursor-pointer"
                            title={generating ? "停止生成" : "生成分镜脚本"}
                        >
                            {generating ? (
                                <Square className="size-3.5 fill-current" />
                            ) : (
                                <ArrowUp className="size-4.5 stroke-[2.5]" />
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════
                放大编辑脚本弹窗
               ══════════════════════════════════════════════════════════ */}
            <Modal
                title="分镜脚本深度编辑"
                open={editorModalOpen}
                onCancel={() => setEditorModalOpen(false)}
                width={720}
                footer={[
                    <Button key="cancel" onClick={() => setEditorModalOpen(false)}>
                        取消
                    </Button>,
                    <Button
                        key="save"
                        onClick={() => {
                            setGeneratedScript(editingScript);
                            setEditorModalOpen(false);
                            message.success("脚本修改已保存");
                        }}
                    >
                        保存修改
                    </Button>,
                    <Button
                        key="apply"
                        type="primary"
                        onClick={() => {
                            setGeneratedScript(editingScript);
                            setEditorModalOpen(false);
                            onApplyScript(editingScript, {
                                images: uploadedImages,
                                audios: uploadedAudios,
                                durationSec,
                            });
                        }}
                    >
                        应用脚本
                    </Button>,
                ]}
            >
                <div className="flex flex-col gap-2 py-2">
                    <p className="text-xs text-stone-500">
                        您可以直接在下方逐字修改镜头画面描述、台词对白与时长参数，输入 @ 可快速引用素材缩略图，点击“应用脚本”即可将脚本填入视频创作台提示词输入框。
                    </p>
                    <div className="w-full rounded-xl border border-black/[0.08] bg-stone-50/50 p-3 dark:border-white/[0.08] dark:bg-[#1e1e20]">
                        <CanvasPromptChipInput
                            value={editingScript}
                            references={directorMentionReferences}
                            onChange={setEditingScript}
                            showReferenceLabels
                            className="min-h-[260px] max-h-[420px] font-mono text-xs leading-relaxed !border-0 !p-0 !shadow-none !bg-transparent focus:!shadow-none text-stone-900 dark:text-stone-100"
                            placeholder="请输入脚本内容..."
                        />
                    </div>
                </div>
            </Modal>
        </div>
    );
};
