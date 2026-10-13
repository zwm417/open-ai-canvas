// @opc-feature: video_workbench_skill_slots [start]
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    ClipboardPaste,
    Trash2,
    RefreshCw,
    FolderPlus,
    Sparkles,
    BookmarkPlus,
    Plus,
    CheckCircle2,
    Layers,
    Music2,
} from "lucide-react";
import { message } from "antd";
import { Tooltip } from "@/components/ui/base/tooltip";
import { CachedResourceImage } from "@/components/cached-resource-image";
import { resolveResourceUrl } from "@/services/api/resources";
import { peekLocalFirstMedia } from "@/services/local-first-media-resolver";
import { formatDuration } from "@/lib/image-utils";

export interface VideoWorkbenchSlotConfig {
    id: string;
    label: string;
    icon: React.ReactNode;
    accept: string;
    kind: "image" | "audio";
    maxCount: number;
    optional?: boolean;
}

export interface VideoWorkbenchSlotFile {
    id: string;
    name: string;
    kind: "image" | "audio";
    url?: string;
    dataUrl?: string;
    storageKey?: string;
    durationMs?: number;
}

export interface VideoWorkbenchSkillSlotsProps {
    slots: VideoWorkbenchSlotConfig[];
    slotFilesMap: Record<string, VideoWorkbenchSlotFile[]>;
    onAddSlotFiles: (slotId: string, files: File[]) => void;
    onReplaceSlotFile: (slotId: string, fileId: string, file: File) => void;
    onRemoveSlotFile: (slotId: string, fileId: string) => void;
    onClearAllSlots?: () => void;
    onPasteClipboard?: () => void;
    onOpenPromptDialog?: () => void;
    onSavePromptDialog?: () => void;
    onOpenAssetPicker?: () => void;
    totalCount?: number;
    maxTotalCount?: number;
    containerClassName?: string;
    hideTopBar?: boolean;
}

export const VideoWorkbenchSkillSlots: React.FC<VideoWorkbenchSkillSlotsProps> = ({
    slots,
    slotFilesMap,
    onAddSlotFiles,
    onReplaceSlotFile,
    onRemoveSlotFile,
    onClearAllSlots,
    onPasteClipboard,
    onOpenPromptDialog,
    onSavePromptDialog,
    onOpenAssetPicker,
    totalCount: explicitTotalCount,
    maxTotalCount = 15,
    containerClassName = "",
    hideTopBar = false,
}) => {
    const [dragActiveSlotId, setDragActiveSlotId] = useState<string | null>(null);

    // 计算总素材数量
    const calculatedTotalCount = useMemo(() => {
        if (typeof explicitTotalCount === "number") return explicitTotalCount;
        return Object.values(slotFilesMap).reduce((acc, files) => acc + (files?.length || 0), 0);
    }, [explicitTotalCount, slotFilesMap]);

    // 分类展开状态机
    const [expandedSlotId, setExpandedSlotId] = useState<string | null>(null);
    const [hoveredFile, setHoveredFile] = useState<VideoWorkbenchSlotFile | null>(null);
    const collapseTimerRef = useRef<NodeJS.Timeout | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [previewPosition, setPreviewPosition] = useState<{ top: number; left: number } | null>(null);

    // 监听素材悬停浮层坐标，通过 Portal 挂载到 body，彻底消除父容器滚动条与下层容器抖动
    useEffect(() => {
        if (!hoveredFile || !containerRef.current) {
            setPreviewPosition(null);
            return;
        }
        const updatePosition = () => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            setPreviewPosition({
                top: rect.bottom + 8,
                left: rect.left + rect.width / 2,
            });
        };
        updatePosition();
        window.addEventListener("scroll", updatePosition, true);
        window.addEventListener("resize", updatePosition);
        return () => {
            window.removeEventListener("scroll", updatePosition, true);
            window.removeEventListener("resize", updatePosition);
        };
    }, [hoveredFile]);

    const cancelCollapse = () => {
        if (collapseTimerRef.current) {
            clearTimeout(collapseTimerRef.current);
            collapseTimerRef.current = null;
        }
    };

    const scheduleCollapse = () => {
        cancelCollapse();
        collapseTimerRef.current = setTimeout(() => {
            setExpandedSlotId(null);
            setHoveredFile(null);
            collapseTimerRef.current = null;
        }, 240);
    };

    useEffect(() => {
        return () => {
            if (collapseTimerRef.current) {
                clearTimeout(collapseTimerRef.current);
            }
        };
    }, []);

    // 当前展开的插槽配置及其素材清单
    const currentExpandedSlot = useMemo(() => {
        if (!expandedSlotId) return null;
        return slots.find((s) => s.id === expandedSlotId) || null;
    }, [expandedSlotId, slots]);

    const currentExpandedFiles = useMemo(() => {
        if (!expandedSlotId) return [];
        return slotFilesMap[expandedSlotId] || [];
    }, [expandedSlotId, slotFilesMap]);

    // 自愈保障：若展开的分类中素材全被清空，自动折叠回全分类概览
    useEffect(() => {
        if (expandedSlotId && currentExpandedFiles.length === 0) {
            setExpandedSlotId(null);
            setHoveredFile(null);
        }
    }, [expandedSlotId, currentExpandedFiles.length]);

    // 悬停高清放大图浮层数据派生
    const activePreviewFile = useMemo(() => {
        if (hoveredFile) {
            return {
                url: hoveredFile.dataUrl || hoveredFile.url || (hoveredFile.storageKey ? (peekLocalFirstMedia(hoveredFile.storageKey) || resolveResourceUrl(hoveredFile.storageKey)) : ""),
                name: hoveredFile.name,
                storageKey: hoveredFile.storageKey,
                kind: hoveredFile.kind,
                durationMs: hoveredFile.durationMs,
            };
        }
        return null;
    }, [hoveredFile]);

    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const appendInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const replaceSpecificRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const replacingTargetRef = useRef<{ slotId: string; fileId: string } | null>(null);

    const handleFilesSelected = (slotId: string, fileList: FileList | null) => {
        if (!fileList || !fileList.length) return;
        const targetSlot = slots.find((s) => s.id === slotId);
        if (!targetSlot) return;

        const rawFiles = Array.from(fileList);
        const validFiles = rawFiles.filter((f) => {
            if (targetSlot.kind === "image") return f.type.startsWith("image/");
            if (targetSlot.kind === "audio") return f.type.startsWith("audio/");
            return f.type.startsWith("image/") || f.type.startsWith("audio/");
        });

        if (!validFiles.length) {
            message.warning(targetSlot.kind === "audio" ? "请上传有效的音频文件" : "请上传有效的图片文件");
            return;
        }

        const existing = slotFilesMap[slotId] || [];
        const remaining = Math.max(0, targetSlot.maxCount - existing.length);
        if (remaining <= 0) {
            message.warning(`【${targetSlot.label}】素材已满（上限 ${targetSlot.maxCount} 个）`);
            return;
        }

        const totalRemaining = Math.max(0, maxTotalCount - calculatedTotalCount);
        if (totalRemaining <= 0) {
            message.warning(`素材总数已达上限（最多 ${maxTotalCount} 个）`);
            return;
        }

        const effectiveLimit = Math.min(remaining, totalRemaining);
        const allowed = validFiles.slice(0, effectiveLimit);
        onAddSlotFiles(slotId, allowed);
        if (validFiles.length > effectiveLimit) {
            message.warning(`【${targetSlot.label}】本次仅可容纳 ${allowed.length} 个素材`);
        }
    };

    const handleReplaceSpecific = (fileList: FileList | null) => {
        if (!fileList || !fileList.length || !replacingTargetRef.current) return;
        const file = fileList[0];
        const { slotId, fileId } = replacingTargetRef.current;
        const targetSlot = slots.find((s) => s.id === slotId);
        replacingTargetRef.current = null;

        if (targetSlot?.kind === "image" && !file.type.startsWith("image/")) {
            message.warning("请上传有效的图片文件");
            return;
        }
        if (targetSlot?.kind === "audio" && !file.type.startsWith("audio/")) {
            message.warning("请上传有效的音频文件");
            return;
        }

        onReplaceSlotFile(slotId, fileId, file);
    };

    return (
        <div className={`relative flex flex-col gap-2 ${containerClassName}`}>
            {/* 顶部操作行与计数器 */}
            {!hideTopBar && (
                <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
                    <span className="font-mono text-xs font-medium flex items-center gap-1.5">
                        <span>素材数量 {calculatedTotalCount} / {maxTotalCount}</span>
                        {Object.values(slotFilesMap).some((files) => files.length > 1) && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-1.5 py-0.2 rounded font-sans">
                                含折叠素材
                            </span>
                        )}
                    </span>

                    <div className="flex items-center gap-1.5">
                        {onPasteClipboard && (
                            <Tooltip title="从剪切板粘贴" placement="top" mouseEnterDelay={0.15}>
                                <button
                                    type="button"
                                    onClick={onPasteClipboard}
                                    className="flex size-7 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-[#2c2c2e] dark:hover:text-stone-200 transition-colors cursor-pointer"
                                    aria-label="从剪切板粘贴"
                                >
                                    <ClipboardPaste className="size-3.5" />
                                </button>
                            </Tooltip>
                        )}

                        {onOpenPromptDialog && (
                            <Tooltip title="提示词模板" placement="top" mouseEnterDelay={0.15}>
                                <button
                                    type="button"
                                    onClick={onOpenPromptDialog}
                                    className="flex size-7 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-[#2c2c2e] dark:hover:text-stone-200 transition-colors cursor-pointer"
                                    aria-label="提示词模板"
                                >
                                    <Sparkles className="size-3.5 text-amber-500" />
                                </button>
                            </Tooltip>
                        )}

                        {onSavePromptDialog && (
                            <Tooltip title="保存为模板" placement="top" mouseEnterDelay={0.15}>
                                <button
                                    type="button"
                                    onClick={onSavePromptDialog}
                                    className="flex size-7 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-[#2c2c2e] dark:hover:text-stone-200 transition-colors cursor-pointer"
                                    aria-label="保存为模板"
                                >
                                    <BookmarkPlus className="size-3.5 text-amber-500" />
                                </button>
                            </Tooltip>
                        )}

                        {onOpenAssetPicker && (
                            <Tooltip title="查看我的资产" placement="top" mouseEnterDelay={0.15}>
                                <button
                                    type="button"
                                    onClick={onOpenAssetPicker}
                                    className="flex size-7 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-[#2c2c2e] dark:hover:text-stone-200 transition-colors cursor-pointer"
                                    aria-label="查看我的资产"
                                >
                                    <FolderPlus className="size-3.5" />
                                </button>
                            </Tooltip>
                        )}

                        {calculatedTotalCount > 0 && onClearAllSlots && (
                            <Tooltip title="清空素材" placement="top" mouseEnterDelay={0.15}>
                                <button
                                    type="button"
                                    onClick={onClearAllSlots}
                                    className="flex size-7 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-red-500 dark:hover:bg-[#2c2c2e] dark:hover:text-red-400 transition-colors cursor-pointer"
                                    aria-label="清空素材"
                                >
                                    <Trash2 className="size-3.5" />
                                </button>
                            </Tooltip>
                        )}
                    </div>
                </div>
            )}

            {/* 水平滑动卡槽区（外层大容器：高度恒定锁死为 116px，杜绝展开/折叠与滚动条显隐引起的下层容器抖动） */}
            <div
                ref={containerRef}
                className="hover-scrollbar hover-scrollbar-hint min-w-0 h-[116px] shrink-0 overflow-x-auto overflow-y-hidden rounded-xl border border-dashed border-stone-200 dark:border-stone-800 p-2.5 transition-colors relative [contain:paint_layout]"
                onMouseEnter={cancelCollapse}
                onMouseLeave={() => {
                    if (expandedSlotId) {
                        scheduleCollapse();
                    }
                }}
            >
                <div className="flex min-w-max items-start gap-2">
                    {slots.map((slot, index) => {
                        const slotAllFiles = slotFilesMap[slot.id] || [];
                        const labelText = slot.label;

                        // 当前展开的插槽索引
                        const expandedIndex = expandedSlotId && currentExpandedFiles.length > 0
                            ? slots.findIndex((s) => s.id === expandedSlotId)
                            : -1;

                        // 1. 若当前有插槽处于展开态，且本插槽位于其右侧：隐藏原有右侧其他插槽（平滑不跳跃）
                        if (expandedIndex !== -1 && index > expandedIndex) {
                            return null;
                        }

                        // 2. 若本插槽正是被悬停展开的插槽且包含素材：从当前位置向右平滑展开该分类下所有素材与追加入口
                        if (expandedIndex !== -1 && index === expandedIndex && slotAllFiles.length > 0) {
                            return (
                                <React.Fragment key={slot.id}>
                                    {index > 0 && <span className="mx-1 mt-1 h-14 w-px shrink-0 bg-stone-200 dark:bg-stone-700" aria-hidden="true" />}

                                    <div className="flex min-w-max items-start gap-2.5">
                                        {slotAllFiles.map((file, fileIdx) => (
                                            <div
                                                key={file.id}
                                                className="flex shrink-0 flex-col items-center gap-1 text-center text-[11px] text-stone-600 dark:text-stone-300 w-20"
                                            >
                                                <div
                                                    className="group relative size-16 shrink-0 aspect-square min-w-16 min-h-16 max-w-16 max-h-16 cursor-pointer overflow-hidden rounded-xl border border-stone-200 bg-stone-100 dark:border-stone-700 dark:bg-stone-800 transition duration-150 hover:z-20 hover:-translate-y-0.5 hover:shadow-md"
                                                    onMouseEnter={() => {
                                                        cancelCollapse();
                                                        setHoveredFile(file);
                                                    }}
                                                    onMouseLeave={() => {
                                                        setHoveredFile(null);
                                                    }}
                                                >
                                                    {file.kind === "image" ? (
                                                        <div className="relative size-full overflow-hidden rounded-xl">
                                                            <CachedResourceImage
                                                                storageKey={file.storageKey}
                                                                src={file.dataUrl || file.url || (file.storageKey ? (peekLocalFirstMedia(file.storageKey) || resolveResourceUrl(file.storageKey)) : "")}
                                                                alt={file.name}
                                                                className="size-full object-cover block"
                                                                loadingFallback={<div className="size-full animate-pulse rounded-xl bg-stone-200 dark:bg-stone-700" />}
                                                                fallback={<div className="grid size-full place-items-center rounded-xl bg-stone-200 text-stone-400 text-xs dark:bg-stone-700">图片</div>}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="relative flex size-full flex-col items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-300">
                                                            <Music2 className="size-5" />
                                                            {file.durationMs ? (
                                                                <span className="mt-0.5 text-[9px] font-mono opacity-80">
                                                                    {formatDuration(file.durationMs)}
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    )}

                                                    {/* 左上角序号角标 */}
                                                    <span className="absolute left-1 top-1 grid size-4.5 place-items-center rounded-full bg-black/65 text-[9px] font-semibold text-white">
                                                        {fileIdx + 1}
                                                    </span>

                                                    {/* 悬浮操作浮层（替换与删除按钮） */}
                                                    <div className="absolute inset-0 z-20 hidden items-center justify-center gap-1.5 rounded-xl bg-black/50 group-hover:flex">
                                                        <Tooltip title="替换此素材" placement="top" mouseEnterDelay={0.15}>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    replacingTargetRef.current = { slotId: slot.id, fileId: file.id };
                                                                    replaceSpecificRefs.current[slot.id]?.click();
                                                                }}
                                                                className="grid size-6 place-items-center rounded-full bg-white/90 text-stone-800 shadow transition hover:bg-white cursor-pointer"
                                                                aria-label="替换此素材"
                                                            >
                                                                <RefreshCw className="size-3" />
                                                            </button>
                                                        </Tooltip>
                                                        <Tooltip title="删除素材" placement="top" mouseEnterDelay={0.15}>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onRemoveSlotFile(slot.id, file.id);
                                                                }}
                                                                className="grid size-6 place-items-center rounded-full bg-white/90 text-red-600 shadow transition hover:bg-white cursor-pointer"
                                                                aria-label="删除素材"
                                                            >
                                                                <Trash2 className="size-3" />
                                                            </button>
                                                        </Tooltip>
                                                    </div>
                                                </div>

                                                <span className="max-w-full truncate leading-4 font-medium text-stone-500 dark:text-stone-400" title={file.name}>
                                                    素材 #{fileIdx + 1}
                                                </span>
                                            </div>
                                        ))}

                                        {/* 在展开的素材插槽右边紧排一个【上传素材】专属插槽 */}
                                        {slotAllFiles.length < slot.maxCount ? (
                                            <div className="flex shrink-0 flex-col items-center gap-1 text-center text-[11px] text-stone-600 dark:text-stone-300 w-20">
                                                <Tooltip title={`向【${slot.label}】追加素材`} placement="top" mouseEnterDelay={0.15}>
                                                    <button
                                                        type="button"
                                                        onClick={() => appendInputRefs.current[slot.id]?.click()}
                                                        onDragEnter={(e) => {
                                                            e.preventDefault();
                                                            setDragActiveSlotId(`append-${slot.id}`);
                                                        }}
                                                        onDragOver={(e) => {
                                                            e.preventDefault();
                                                            e.dataTransfer.dropEffect = "copy";
                                                        }}
                                                        onDragLeave={(e) => {
                                                            e.preventDefault();
                                                            setDragActiveSlotId(null);
                                                        }}
                                                        onDrop={(e) => {
                                                            e.preventDefault();
                                                            setDragActiveSlotId(null);
                                                            handleFilesSelected(slot.id, e.dataTransfer.files);
                                                        }}
                                                        className={`group relative flex size-16 shrink-0 aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed transition cursor-pointer ${
                                                            dragActiveSlotId === `append-${slot.id}`
                                                                ? "border-amber-500 bg-amber-50/50 dark:border-amber-400 dark:bg-amber-950/20"
                                                                : "border-stone-300 hover:border-amber-500 hover:bg-amber-50/20 dark:border-stone-700 dark:hover:border-amber-400 dark:hover:bg-amber-950/10 bg-transparent"
                                                        }`}
                                                        aria-label={`向【${slot.label}】上传素材`}
                                                    >
                                                        <Plus className="size-5 text-amber-500 group-hover:scale-110 transition-transform" />
                                                        <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">上传素材</span>
                                                    </button>
                                                </Tooltip>
                                                <span className="max-w-full truncate leading-4 font-medium text-stone-400 dark:text-stone-500">
                                                    上传素材
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="flex shrink-0 flex-col items-center gap-1 text-center text-[11px] text-stone-400 dark:text-stone-500 w-20">
                                                <div className="flex size-16 shrink-0 aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-stone-200 dark:border-stone-800 bg-stone-100/50 dark:bg-stone-900/40 text-stone-400">
                                                    <CheckCircle2 className="size-4 text-emerald-500" />
                                                    <span className="text-[10px]">已达上限</span>
                                                </div>
                                                <span className="max-w-full truncate leading-4">
                                                    已满 ({slotAllFiles.length}/{slot.maxCount})
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </React.Fragment>
                            );
                        }

                        // 3. 左侧原有插槽或无展开态时的概览插槽：保持原有折叠/空槽位状态保持不动
                        const latestFile = slotAllFiles[slotAllFiles.length - 1];
                        const isDragActive = dragActiveSlotId === slot.id;

                        return (
                            <React.Fragment key={slot.id}>
                                {index > 0 && <span className="mx-1 mt-1 h-14 w-px shrink-0 bg-stone-200 dark:bg-stone-700" aria-hidden="true" />}

                                <div className="flex shrink-0 flex-col items-center gap-1 text-center text-[11px] text-stone-600 dark:text-stone-300 w-24">
                                    {slotAllFiles.length > 0 && latestFile ? (
                                        /* 分类已上传素材：折叠展示最新素材缩略图，悬停时平滑展开该类插槽组 */
                                        <div
                                            className="group relative size-16 shrink-0 aspect-square min-w-16 min-h-16 max-w-16 max-h-16 cursor-pointer overflow-visible rounded-xl border border-stone-200 bg-stone-100 shadow-sm transition duration-150 hover:z-20 hover:-translate-y-1 hover:scale-105 dark:border-stone-700 dark:bg-stone-800"
                                            onMouseEnter={() => {
                                                cancelCollapse();
                                                setExpandedSlotId(slot.id);
                                                setHoveredFile(latestFile);
                                            }}
                                            onDragEnter={(e) => {
                                                e.preventDefault();
                                                cancelCollapse();
                                                setExpandedSlotId(slot.id);
                                            }}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                e.dataTransfer.dropEffect = "copy";
                                            }}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                cancelCollapse();
                                                handleFilesSelected(slot.id, e.dataTransfer.files);
                                            }}
                                            onClick={() => {
                                                cancelCollapse();
                                                setExpandedSlotId(slot.id);
                                            }}
                                            title={`【${slot.label}】已上传 ${slotAllFiles.length} 个素材，鼠标悬停展开`}
                                        >
                                            {/* 立体层叠卡牌视觉效果（仅当实际包含多张图时呈现） */}
                                            {slotAllFiles.length > 1 && (
                                                <div className="absolute -inset-1 rounded-xl bg-stone-300/80 dark:bg-stone-700/80 rotate-3 scale-95 transition-transform" />
                                            )}
                                            {slotAllFiles.length > 2 && (
                                                <div className="absolute -inset-1.5 rounded-xl bg-stone-200/70 dark:bg-stone-800/70 -rotate-3 scale-90 transition-transform" />
                                            )}

                                            {/* 顶层卡片：展示最新上传素材缩略图 */}
                                            <div className="relative size-full overflow-hidden rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-300 dark:border-stone-600">
                                                {latestFile.kind === "image" ? (
                                                    <CachedResourceImage
                                                        storageKey={latestFile.storageKey}
                                                        src={latestFile.dataUrl || latestFile.url || (latestFile.storageKey ? (peekLocalFirstMedia(latestFile.storageKey) || resolveResourceUrl(latestFile.storageKey)) : "")}
                                                        alt={latestFile.name}
                                                        className="size-full object-cover block"
                                                        loadingFallback={<div className="size-full animate-pulse rounded-xl bg-stone-200 dark:bg-stone-700" />}
                                                        fallback={<div className="grid size-full place-items-center rounded-xl bg-stone-200 text-stone-400 text-xs dark:bg-stone-700">图片</div>}
                                                    />
                                                ) : (
                                                    <div className="relative flex size-full flex-col items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-300">
                                                        <Music2 className="size-5" />
                                                        {latestFile.durationMs ? (
                                                            <span className="mt-0.5 text-[9px] font-mono opacity-80">
                                                                {formatDuration(latestFile.durationMs)}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                )}

                                                {/* 左上角槽位序号 */}
                                                <span className="absolute left-1 top-1 grid size-4.5 place-items-center rounded-full bg-black/70 text-[9px] font-semibold text-white">
                                                    {index + 1}
                                                </span>

                                                {/* 右上角数量徽标 */}
                                                <span className="absolute right-0.5 top-0.5 flex items-center gap-0.5 rounded-full bg-amber-500 px-1 py-0.2 text-[9px] font-bold text-white shadow-xs">
                                                    <Layers className="size-2.5" />
                                                    <span>{slotAllFiles.length}{slot.maxCount > 1 ? `/${slot.maxCount}` : ""}</span>
                                                </span>

                                                {/* 底部微型悬停提示 */}
                                                <div className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-[9px] text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-0.5">
                                                    <span>悬停展开插槽组</span>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        /* 分类无上传素材：空槽位入口 */
                                        <button
                                            type="button"
                                            onClick={() => fileInputRefs.current[slot.id]?.click()}
                                            onDragEnter={(e) => {
                                                e.preventDefault();
                                                setDragActiveSlotId(slot.id);
                                            }}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                e.dataTransfer.dropEffect = "copy";
                                            }}
                                            onDragLeave={(e) => {
                                                e.preventDefault();
                                                setDragActiveSlotId(null);
                                            }}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                setDragActiveSlotId(null);
                                                handleFilesSelected(slot.id, e.dataTransfer.files);
                                            }}
                                            className="group flex flex-col items-center gap-1 text-center transition cursor-pointer"
                                            aria-label={labelText}
                                        >
                                            <span
                                                className={`relative grid size-16 place-items-center rounded-xl border transition group-hover:-translate-y-0.5 group-hover:border-stone-300 group-hover:bg-stone-200 group-hover:text-stone-700 dark:group-hover:border-stone-500 dark:group-hover:bg-stone-700 dark:group-hover:text-stone-100 ${
                                                    isDragActive
                                                        ? "border-blue-500 bg-blue-50/50 dark:border-blue-400 dark:bg-blue-950/20"
                                                        : "border-stone-200 bg-stone-100 text-stone-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-500"
                                                }`}
                                            >
                                                {slot.icon}
                                                <span className="absolute bottom-1 right-1 grid size-4 place-items-center rounded-full bg-white/90 text-stone-600 shadow-2xs dark:bg-stone-700 dark:text-stone-200">
                                                    <Plus className="size-2.5" />
                                                </span>
                                            </span>
                                        </button>
                                    )}

                                    <span className="max-w-full truncate leading-4 font-medium text-stone-500 dark:text-stone-400 flex items-center justify-center gap-1" title={labelText}>
                                        <span>{labelText}</span>
                                        {slotAllFiles.length > 0 && (
                                            <span className="font-mono text-amber-500 font-bold">
                                                ({slotAllFiles.length}{slot.maxCount > 1 ? `/${slot.maxCount}` : ""})
                                            </span>
                                        )}
                                    </span>
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            {/* 隐藏原生文件 Input 集合 */}
            {slots.map((slot) => (
                <React.Fragment key={`inputs-${slot.id}`}>
                    {/* 初始上传 Input */}
                    <input
                        ref={(el) => {
                            fileInputRefs.current[slot.id] = el;
                        }}
                        type="file"
                        accept={slot.accept}
                        multiple={slot.maxCount > 1}
                        className="hidden"
                        onChange={(e) => {
                            handleFilesSelected(slot.id, e.target.files);
                            e.target.value = "";
                        }}
                    />

                    {/* 追加素材 Input */}
                    <input
                        ref={(el) => {
                            appendInputRefs.current[slot.id] = el;
                        }}
                        type="file"
                        accept={slot.accept}
                        multiple={slot.maxCount > 1}
                        className="hidden"
                        onChange={(e) => {
                            handleFilesSelected(slot.id, e.target.files);
                            e.target.value = "";
                        }}
                    />

                    {/* 替换特定素材 Input */}
                    <input
                        ref={(el) => {
                            replaceSpecificRefs.current[slot.id] = el;
                        }}
                        type="file"
                        accept={slot.accept}
                        className="hidden"
                        onChange={(e) => {
                            handleReplaceSpecific(e.target.files);
                            e.target.value = "";
                        }}
                    />
                </React.Fragment>
            ))}

            {/* 素材悬停大图居中浮层（统一放大规格：max-w-[min(90vw,14rem)]，容器 max-h-52 max-w-52，object-contain 保持原始画幅比例不失真） */}
            {activePreviewFile && previewPosition && typeof document !== "undefined" && createPortal(
                <div
                    className="pointer-events-none fixed z-[9999] w-max max-w-[min(90vw,14rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-black/[0.08] bg-white/95 p-2 shadow-2xl backdrop-blur-xl dark:border-white/[0.1] dark:bg-[#1c1c1e]/95 animate-in fade-in duration-150"
                    style={{
                        top: `${previewPosition.top}px`,
                        left: `${previewPosition.left}px`,
                    }}
                >
                    {activePreviewFile.kind === "image" ? (
                        <CachedResourceImage
                            storageKey={activePreviewFile.storageKey}
                            src={activePreviewFile.url}
                            alt={activePreviewFile.name}
                            eager
                            className="block h-auto w-auto max-h-52 max-w-52 rounded-md object-contain"
                            loadingFallback={<div className="h-40 w-40 animate-pulse rounded-md bg-stone-200 dark:bg-stone-800" />}
                            fallback={<div className="grid h-32 w-32 place-items-center rounded-md bg-stone-100 text-xs text-stone-400 dark:bg-stone-800">图片预览失败</div>}
                        />
                    ) : (
                        <div className="flex flex-col items-center gap-2 p-3 text-center min-w-[140px]">
                            <Music2 className="size-8 text-purple-500" />
                            <span className="text-xs font-semibold text-stone-800 dark:text-stone-200 max-w-[180px] truncate">
                                {activePreviewFile.name}
                            </span>
                            {activePreviewFile.durationMs ? (
                                <span className="text-[11px] font-mono text-stone-500 dark:text-stone-400">
                                    时长：{formatDuration(activePreviewFile.durationMs)}
                                </span>
                            ) : null}
                        </div>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
};
// @opc-feature: video_workbench_skill_slots [end]
