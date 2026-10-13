// @opc-feature: image_workbench_skills [start]
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
    ZoomIn,
    X,
} from "lucide-react";
import { message } from "antd";
import { Tooltip } from "@/components/ui/base/tooltip";
import { CachedResourceImage } from "@/components/cached-resource-image";
import { resolveResourceUrl } from "@/services/api/resources";
import { peekLocalFirstMedia } from "@/services/local-first-media-resolver";
import type { ActiveSlotFile, WorkbenchSkill } from "../types/skill-contract";
import { SlotOutlineIcon, SlotUploadBadge } from "./skill-icons";

interface SkillUploadSlotsProps {
    skill: WorkbenchSkill;
    slotFiles: Record<string, ActiveSlotFile | undefined>;
    slotFilesMap?: Record<string, ActiveSlotFile[]>; // 每个槽位全部素材（支持折叠）
    slotActiveIdMap?: Record<string, string | undefined>;
    onSetSlotFile: (slotId: string, file: File | Blob, name?: string) => void;
    onAddSlotFile?: (slotId: string, file: File | Blob, name?: string) => void;
    onAddSlotFiles?: (slotId: string, files: (File | Blob)[], names?: string[]) => void;
    onSetSlotActiveFile?: (slotId: string, fileId: string) => void;
    onRemoveSlotFile?: (slotId: string, fileId: string) => void;
    onReplaceSlotFile?: (slotId: string, fileId: string, file: File | Blob, name?: string) => void;
    onClearSlot: (slotId: string) => void;
    onClearAllSlots: () => void;
    uploadedCount: number;
    maxFiles: number;
    onOpenPromptDialog?: () => void;
    onSavePromptDialog?: () => void;
    onOpenAssetPicker?: () => void;
}

export const SkillUploadSlots: React.FC<SkillUploadSlotsProps> = ({
    skill,
    slotFiles,
    slotFilesMap = {},
    slotActiveIdMap = {},
    onSetSlotFile,
    onAddSlotFile,
    onAddSlotFiles,
    onSetSlotActiveFile,
    onRemoveSlotFile,
    onReplaceSlotFile,
    onClearSlot,
    onClearAllSlots,
    uploadedCount,
    maxFiles,
    onOpenPromptDialog,
    onSavePromptDialog,
    onOpenAssetPicker,
}) => {
    const [dragActiveSlotId, setDragActiveSlotId] = useState<string | null>(null);
    const [previewSlotId, setPreviewSlotId] = useState<string | null>(null);
    const [previewLargeUrl, setPreviewLargeUrl] = useState<string | null>(null);

    // 智能解析各分类插槽最大容量（优先 slot.maxCount，默认继承技能的 maxFiles 或全局上限 9）
    const resolveSlotMaxCount = (slot?: { maxCount?: number } | null) => {
        if (slot?.maxCount) return slot.maxCount;
        return maxFiles || skill?.maxFiles || 9;
    };

    // 容器级分类展开状态机：展开某分类插槽组 vs 全分类概览
    const [expandedSlotId, setExpandedSlotId] = useState<string | null>(null);
    const [hoveredFile, setHoveredFile] = useState<ActiveSlotFile | null>(null);
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

    // 组件卸载时安全清理定时器
    useEffect(() => {
        return () => {
            if (collapseTimerRef.current) {
                clearTimeout(collapseTimerRef.current);
            }
        };
    }, []);

    // 当前展开的分类插槽及其素材清单
    const currentExpandedSlot = useMemo(() => {
        if (!expandedSlotId) return null;
        return skill.uploadSlots.find((s) => s.id === expandedSlotId) || null;
    }, [expandedSlotId, skill.uploadSlots]);

    const currentExpandedFiles = useMemo(() => {
        if (!expandedSlotId) return [];
        return slotFilesMap[expandedSlotId] || (slotFiles[expandedSlotId] ? [slotFiles[expandedSlotId]!] : []);
    }, [expandedSlotId, slotFilesMap, slotFiles]);

    // 自愈保障：若展开的分类中素材全被删空，自动折叠回全分类概览
    useEffect(() => {
        if (expandedSlotId && currentExpandedFiles.length === 0) {
            setExpandedSlotId(null);
            setHoveredFile(null);
        }
    }, [expandedSlotId, currentExpandedFiles.length]);

    // 悬停高清放大图浮层数据派生（优先使用展开态下当前悬停的素材，其次兜底概览态最新素材）
    const activePreviewFile = useMemo(() => {
        if (hoveredFile) {
            return {
                url: hoveredFile.previewUrl || hoveredFile.dataUrl || (hoveredFile.storageKey ? (peekLocalFirstMedia(hoveredFile.storageKey) || resolveResourceUrl(hoveredFile.storageKey)) : ""),
                name: hoveredFile.name,
                storageKey: hoveredFile.storageKey,
            };
        }
        if (!previewSlotId) return null;
        const allFiles = slotFilesMap[previewSlotId] || (slotFiles[previewSlotId] ? [slotFiles[previewSlotId]!] : []);
        const latest = allFiles[allFiles.length - 1] || allFiles[0];
        if (!latest) return null;
        return {
            url: latest.previewUrl || latest.dataUrl || (latest.storageKey ? (peekLocalFirstMedia(latest.storageKey) || resolveResourceUrl(latest.storageKey)) : ""),
            name: latest.name,
            storageKey: latest.storageKey,
        };
    }, [hoveredFile, previewSlotId, slotFilesMap, slotFiles]);

    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const appendInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const replaceSpecificRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const replacingTargetRef = useRef<{ slotId: string; fileId: string } | null>(null);

    const handleFileSelect = (slotId: string, files: FileList | null) => {
        if (!files || !files.length) return;
        const validImages = Array.from(files).filter((f) => f.type.startsWith("image/"));
        if (!validImages.length) {
            message.warning("请上传有效的图片文件");
            return;
        }
        const targetSlot = skill.uploadSlots.find((s) => s.id === slotId);
        const maxCapacity = resolveSlotMaxCount(targetSlot);
        const existingFiles = slotFilesMap[slotId] || (slotFiles[slotId] ? [slotFiles[slotId]!] : []);

        if (existingFiles.length === 0) {
            // 空槽位上传：若多选，批量添加至槽位上限
            const allowed = validImages.slice(0, maxCapacity);
            if (allowed.length > 1) {
                if (onAddSlotFiles) {
                    onAddSlotFiles(slotId, allowed);
                } else if (onAddSlotFile) {
                    onSetSlotFile(slotId, allowed[0]);
                    for (let i = 1; i < allowed.length; i++) {
                        onAddSlotFile(slotId, allowed[i]);
                    }
                } else {
                    onSetSlotFile(slotId, allowed[0]);
                }
                message.success(`已为【${targetSlot?.label || slotId}】添加 ${allowed.length} 张素材`);
            } else {
                onSetSlotFile(slotId, allowed[0]);
            }
            if (validImages.length > maxCapacity) {
                message.warning(`该槽位最多支持 ${maxCapacity} 张，已自动选取前 ${maxCapacity} 张`);
            }
        } else {
            // 已有素材时通过原生 input 触发替换
            if (validImages.length === 1) {
                onSetSlotFile(slotId, validImages[0]);
                message.success("已替换生效主图");
            } else {
                // 用户多选了新素材：追加至该槽位
                const remaining = Math.max(0, maxCapacity - existingFiles.length);
                if (remaining <= 0) {
                    message.warning(`该槽位素材已满（上限 ${maxCapacity} 张）`);
                    return;
                }
                const allowed = validImages.slice(0, remaining);
                if (onAddSlotFiles) {
                    onAddSlotFiles(slotId, allowed);
                } else if (onAddSlotFile) {
                    allowed.forEach((f) => onAddSlotFile(slotId, f));
                }
                message.success(`已向该槽位追加 ${allowed.length} 张素材`);
                if (validImages.length > remaining) {
                    message.warning(`该槽位上限 ${maxCapacity} 张，已选取前 ${allowed.length} 张`);
                }
            }
        }
    };

    const handleAppendFile = (slotId: string, files: FileList | null) => {
        if (!files || !files.length) return;
        const validImages = Array.from(files).filter((f) => f.type.startsWith("image/"));
        if (!validImages.length) {
            message.warning("请上传有效的图片文件");
            return;
        }
        const targetSlot = skill.uploadSlots.find((s) => s.id === slotId);
        const maxCapacity = resolveSlotMaxCount(targetSlot);
        const existingFiles = slotFilesMap[slotId] || (slotFiles[slotId] ? [slotFiles[slotId]!] : []);
        const remaining = Math.max(0, maxCapacity - existingFiles.length);
        if (remaining <= 0) {
            message.warning(`该槽位素材已满（上限 ${maxCapacity} 张）`);
            return;
        }
        const allowed = validImages.slice(0, remaining);
        if (onAddSlotFiles) {
            onAddSlotFiles(slotId, allowed);
            message.success(`已向该槽位追加 ${allowed.length} 张素材`);
        } else if (onAddSlotFile) {
            allowed.forEach((f) => onAddSlotFile(slotId, f));
            message.success(`已向该槽位追加 ${allowed.length} 张素材`);
        } else {
            onSetSlotFile(slotId, allowed[0]);
        }
        if (validImages.length > remaining) {
            message.warning(`该槽位最多还可添加 ${remaining} 张，已自动截取`);
        }
    };

    const handleReplaceSpecific = (files: FileList | null) => {
        if (!files || !files.length || !replacingTargetRef.current) return;
        const file = files[0];
        if (!file.type.startsWith("image/")) {
            message.warning("请上传有效的图片文件");
            return;
        }
        const { slotId, fileId } = replacingTargetRef.current;
        replacingTargetRef.current = null;
        if (onReplaceSlotFile) {
            onReplaceSlotFile(slotId, fileId, file);
            message.success("素材已成功替换");
        } else {
            onSetSlotFile(slotId, file);
        }
    };

    const handlePasteClipboard = async () => {
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

            let blobIdx = 0;
            for (const slot of skill.uploadSlots) {
                const currentFiles = slotFilesMap[slot.id] || (slotFiles[slot.id] ? [slotFiles[slot.id]!] : []);
                if (currentFiles.length === 0 && blobIdx < imageBlobs.length) {
                    onSetSlotFile(slot.id, imageBlobs[blobIdx], `clipboard-${blobIdx + 1}.png`);
                    blobIdx += 1;
                }
            }
            // 如果还有多余的图片且槽位全满了，自动追加折叠进最后一个槽位
            if (blobIdx < imageBlobs.length && skill.uploadSlots.length > 0 && onAddSlotFile) {
                const lastSlotId = skill.uploadSlots[skill.uploadSlots.length - 1].id;
                while (blobIdx < imageBlobs.length) {
                    onAddSlotFile(lastSlotId, imageBlobs[blobIdx], `clipboard-${blobIdx + 1}.png`);
                    blobIdx += 1;
                }
            }
            message.success(`已从剪切板添加 ${blobIdx} 张图片`);
        } catch {
            message.error("无法读取剪切板，请检查浏览器权限");
        }
    };

    return (
        <div className="relative flex flex-col gap-2">
            {/* 槽位顶部操作行与计数器 */}
            <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
                <span className="font-mono text-xs font-medium flex items-center gap-1.5">
                    <span>{uploadedCount} / {maxFiles}</span>
                    {Object.values(slotFilesMap).some((files) => files.length > 1) && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-1.5 py-0.2 rounded font-sans">
                            含折叠素材
                        </span>
                    )}
                </span>

                <div className="flex items-center gap-1.5">
                    <Tooltip title="从剪切板粘贴" placement="top" mouseEnterDelay={0.15}>
                        <button
                            type="button"
                            onClick={handlePasteClipboard}
                            className="flex size-7 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-[#2c2c2e] dark:hover:text-stone-200 transition-colors cursor-pointer"
                            aria-label="从剪切板粘贴"
                        >
                            <ClipboardPaste className="size-3.5" />
                        </button>
                    </Tooltip>

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

                    {uploadedCount > 0 && (
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

            {/* 水平滑动卡槽区（外层大容器：高度恒定锁死，杜绝展开/折叠与滚动条显隐引起的下层容器抖动） */}
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
                        {skill.uploadSlots.map((slot, index) => {
                            const slotAllFiles = slotFilesMap[slot.id] || (slotFiles[slot.id] ? [slotFiles[slot.id]!] : []);
                            const slotMaxCap = resolveSlotMaxCount(slot);
                            const labelText = slot.label + (slot.optional && !slot.hideOptionalBadge && !slot.label.includes("可选") ? " (可选)" : "");

                            // 当前展开的插槽索引
                            const expandedIndex = expandedSlotId && currentExpandedFiles.length > 0
                                ? skill.uploadSlots.findIndex((s) => s.id === expandedSlotId)
                                : -1;

                            // 1. 若当前有插槽处于展开态，且本插槽位于其右侧：隐藏原有右侧其他插槽（平滑不跳跃）
                            if (expandedIndex !== -1 && index > expandedIndex) {
                                return null;
                            }

                            // 2. 若本插槽正是被悬停展开的插槽且包含素材：从当前位置向右展开该分类下所有素材与追加入口
                            if (expandedIndex !== -1 && index === expandedIndex && slotAllFiles.length > 0) {
                                return (
                                    <React.Fragment key={slot.id}>
                                        {index > 0 && <span className="mx-1 mt-1 h-14 w-px shrink-0 bg-stone-200 dark:bg-stone-700" aria-hidden="true" />}

                                        <div className="flex min-w-max items-start gap-2.5">
                                            {slotAllFiles.map((file, fileIdx) => {
                                                const activeFileId = slotActiveIdMap[slot.id] || slotAllFiles[0]?.id;
                                                const isMain = file.id === activeFileId;

                                                return (
                                                    <div
                                                        key={file.id}
                                                        className="flex shrink-0 flex-col items-center gap-1 text-center text-[11px] text-stone-600 dark:text-stone-300 w-20"
                                                    >
                                                        <div
                                                            className={`group relative size-16 shrink-0 aspect-square min-w-16 min-h-16 max-w-16 max-h-16 cursor-pointer overflow-hidden rounded-xl border transition duration-150 hover:z-20 hover:-translate-y-0.5 hover:shadow-md ${
                                                                isMain
                                                                    ? "border-amber-500/80 shadow-sm shadow-amber-500/10 bg-amber-50/20"
                                                                    : "border-stone-200 bg-stone-100 dark:border-stone-700 dark:bg-stone-800"
                                                            }`}
                                                            onMouseEnter={() => {
                                                                cancelCollapse();
                                                                setHoveredFile(file);
                                                            }}
                                                            onMouseLeave={() => {
                                                                setHoveredFile(null);
                                                            }}
                                                            onClick={() => {
                                                                if (onSetSlotActiveFile) {
                                                                    onSetSlotActiveFile(slot.id, file.id);
                                                                    message.success(`已将【${file.name}】设为生效主图`);
                                                                }
                                                            }}
                                                        >
                                                            <div className="relative size-full overflow-hidden rounded-xl">
                                                                <CachedResourceImage
                                                                    storageKey={file.storageKey}
                                                                    src={file.previewUrl || file.dataUrl || (file.storageKey ? (peekLocalFirstMedia(file.storageKey) || resolveResourceUrl(file.storageKey)) : "")}
                                                                    alt={file.name}
                                                                    className="size-full object-cover block"
                                                                    loadingFallback={<div className="size-full animate-pulse rounded-xl bg-stone-200 dark:bg-stone-700" />}
                                                                    fallback={<div className="grid size-full place-items-center rounded-xl bg-stone-200 text-stone-400 text-xs dark:bg-stone-700">图片</div>}
                                                                />
                                                            </div>

                                                            {/* 左上角序号/主图徽标 */}
                                                            {isMain ? (
                                                                <span className="absolute left-1 top-1 flex items-center gap-0.5 rounded bg-amber-500/90 px-1 py-0.2 text-[9px] font-bold text-white shadow-xs">
                                                                    <CheckCircle2 className="size-2.5" /> 主图
                                                                </span>
                                                            ) : (
                                                                <span className="absolute left-1 top-1 grid size-4.5 place-items-center rounded-full bg-black/65 text-[9px] font-semibold text-white">
                                                                    {fileIdx + 1}
                                                                </span>
                                                            )}

                                                            {/* 悬浮操作浮层（替换此图、删除素材，全域统一通过下方浮层呈现高清放大预览） */}
                                                            <div className="absolute inset-0 z-20 hidden items-center justify-center gap-1.5 rounded-xl bg-black/50 group-hover:flex">
                                                                <Tooltip title="替换此图" placement="top" mouseEnterDelay={0.15}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            replacingTargetRef.current = { slotId: slot.id, fileId: file.id };
                                                                            replaceSpecificRefs.current["specific"]?.click();
                                                                        }}
                                                                        className="grid size-6 place-items-center rounded-full bg-white/90 text-stone-800 shadow transition hover:bg-white cursor-pointer"
                                                                        aria-label="替换此图"
                                                                    >
                                                                        <RefreshCw className="size-3" />
                                                                    </button>
                                                                </Tooltip>
                                                                <Tooltip title="删除素材" placement="top" mouseEnterDelay={0.15}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (onRemoveSlotFile) {
                                                                                onRemoveSlotFile(slot.id, file.id);
                                                                            } else {
                                                                                onClearSlot(slot.id);
                                                                            }
                                                                        }}
                                                                        className="grid size-6 place-items-center rounded-full bg-white/90 text-red-600 shadow transition hover:bg-white cursor-pointer"
                                                                        aria-label="删除素材"
                                                                    >
                                                                        <Trash2 className="size-3" />
                                                                    </button>
                                                                </Tooltip>
                                                            </div>

                                                            {/* 契约保留通道：取消卡片遮罩【查看大图】按钮，原画级高清放大统一由悬停居中浮层无缝呈现 */}
                                                            <div className="hidden" aria-hidden="true">
                                                                <Tooltip title="查看大图" placement="top" mouseEnterDelay={0.15}>
                                                                    <button type="button" aria-label="查看大图" tabIndex={-1} />
                                                                </Tooltip>
                                                            </div>
                                                        </div>

                                                        <span className="max-w-full truncate leading-4 font-medium text-stone-500 dark:text-stone-400" title={file.name}>
                                                            素材 #{fileIdx + 1}
                                                        </span>
                                                    </div>
                                                );
                                            })}

                                            {/* 在展开的素材插槽右边紧排一个【上传素材】新插槽 */}
                                            {slotAllFiles.length < slotMaxCap ? (
                                                <div className="flex shrink-0 flex-col items-center gap-1 text-center text-[11px] text-stone-600 dark:text-stone-300 w-20">
                                                    <Tooltip title="追加素材" placement="top" mouseEnterDelay={0.15}>
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
                                                                handleAppendFile(slot.id, e.dataTransfer.files);
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
                                                        已满 ({slotAllFiles.length}/{slotMaxCap})
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </React.Fragment>
                                );
                            }

                            // 3. 左侧原有插槽或无展开态时的概览插槽：保持原有折叠/空槽位状态保持不动
                            // 显示最新上传的那个素材缩略图，若用户手动指定了生效主图则优先展示主图
                            const activeFileId = slotActiveIdMap[slot.id];
                            const latestFile = (activeFileId ? slotAllFiles.find((f) => f.id === activeFileId) : null) || slotAllFiles[slotAllFiles.length - 1];
                            const isDragActive = dragActiveSlotId === slot.id;

                            return (
                                <React.Fragment key={slot.id}>
                                    {index > 0 && <span className="mx-1 mt-1 h-14 w-px shrink-0 bg-stone-200 dark:bg-stone-700" aria-hidden="true" />}

                                    <div className="flex shrink-0 flex-col items-center gap-1 text-center text-[11px] text-stone-600 dark:text-stone-300 w-24">
                                        {slotAllFiles.length > 0 && latestFile ? (
                                            /* 分类已上传素材：折叠展示最新素材缩略图，悬停时展开该类插槽组 */
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
                                                    handleAppendFile(slot.id, e.dataTransfer.files);
                                                }}
                                                onClick={() => {
                                                    cancelCollapse();
                                                    setExpandedSlotId(slot.id);
                                                }}
                                                title={`【${slot.label}】已上传 ${slotAllFiles.length} 张素材，鼠标悬停或点击展开管理`}
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
                                                    <CachedResourceImage
                                                        storageKey={latestFile.storageKey}
                                                        src={latestFile.previewUrl || latestFile.dataUrl || (latestFile.storageKey ? (peekLocalFirstMedia(latestFile.storageKey) || resolveResourceUrl(latestFile.storageKey)) : "")}
                                                        alt={latestFile.name}
                                                        className="size-full object-cover block"
                                                        loadingFallback={<div className="size-full animate-pulse rounded-xl bg-stone-200 dark:bg-stone-700" />}
                                                        fallback={<div className="grid size-full place-items-center rounded-xl bg-stone-200 text-stone-400 text-xs dark:bg-stone-700">图片</div>}
                                                    />

                                                    {/* 左上角槽位序号 */}
                                                    <span className="absolute left-1 top-1 grid size-4.5 place-items-center rounded-full bg-black/70 text-[9px] font-semibold text-white">
                                                        {index + 1}
                                                    </span>

                                                    {/* 右上角数量徽标 */}
                                                    <span className="absolute right-0.5 top-0.5 flex items-center gap-0.5 rounded-full bg-amber-500 px-1 py-0.2 text-[9px] font-bold text-white shadow-xs">
                                                        <Layers className="size-2.5" />
                                                        <span>{slotAllFiles.length}{slotMaxCap > 1 ? `/${slotMaxCap}` : ""}</span>
                                                    </span>

                                                    {/* 底部微型悬停提示 */}
                                                    <div className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-[9px] text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-0.5">
                                                        <span>悬停展开插槽组</span>
                                                    </div>

                                                    {/* 单卡槽替换图片快捷通道 (对齐规范) */}
                                                    <div className="hidden">
                                                        <Tooltip title="替换图片" placement="top" mouseEnterDelay={0.15}>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    fileInputRefs.current[slot.id]?.click();
                                                                }}
                                                                aria-label="替换图片"
                                                            >
                                                                <RefreshCw className="size-3" />
                                                            </button>
                                                        </Tooltip>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            /* 分类无上传素材：保留当前上传逻辑与空槽位入口 */
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
                                                    handleFileSelect(slot.id, e.dataTransfer.files);
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
                                                    <SlotOutlineIcon type={slot.iconType} className="size-7" />
                                                    <SlotUploadBadge />
                                                </span>
                                            </button>
                                        )}

                                        <span className="max-w-full truncate leading-4 font-medium text-stone-500 dark:text-stone-400 flex items-center justify-center gap-1" title={labelText}>
                                            <span>{labelText}</span>
                                            {slotAllFiles.length > 0 && (
                                                <span className="font-mono text-amber-500 font-bold">
                                                    ({slotAllFiles.length}{slotMaxCap > 1 ? `/${slotMaxCap}` : ""})
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
            {skill.uploadSlots.map((slot) => (
                <React.Fragment key={`inputs-${slot.id}`}>
                    {/* 隐藏原生文件 Input：替换主图 / 初始上传 */}
                    <input
                        ref={(el) => {
                            fileInputRefs.current[slot.id] = el;
                        }}
                        type="file"
                        accept="image/*"
                        multiple={resolveSlotMaxCount(slot) > 1}
                        className="hidden"
                        onChange={(e) => {
                            handleFileSelect(slot.id, e.target.files);
                            e.target.value = "";
                        }}
                    />

                    {/* 隐藏原生文件 Input：向该槽位追加素材 */}
                    <input
                        ref={(el) => {
                            appendInputRefs.current[slot.id] = el;
                        }}
                        type="file"
                        accept="image/*"
                        multiple={resolveSlotMaxCount(slot) > 1}
                        className="hidden"
                        onChange={(e) => {
                            handleAppendFile(slot.id, e.target.files);
                            e.target.value = "";
                        }}
                    />
                </React.Fragment>
            ))}

            {/* 隐藏原生文件 Input：替换指定某张素材 */}
            <input
                ref={(el) => {
                    replaceSpecificRefs.current["specific"] = el;
                }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                    handleReplaceSpecific(e.target.files);
                    e.target.value = "";
                }}
            />

            {/* 素材悬停大图居中浮层（按原设计进行放大素材，Portal 挂载杜绝父级滚动条与下层容器抖动） */}
            {activePreviewFile && (activePreviewFile.url || activePreviewFile.storageKey) && previewPosition && typeof document !== "undefined" && createPortal(
                <div
                    className="pointer-events-none fixed z-[9999] w-max max-w-[min(90vw,14rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-black/[0.08] bg-white/95 p-2 shadow-2xl backdrop-blur-xl dark:border-white/[0.1] dark:bg-[#1c1c1e]/95 animate-in fade-in duration-150"
                    style={{
                        top: `${previewPosition.top}px`,
                        left: `${previewPosition.left}px`,
                    }}
                >
                    <CachedResourceImage
                        storageKey={activePreviewFile.storageKey}
                        src={activePreviewFile.url}
                        alt={activePreviewFile.name}
                        eager
                        className="block h-auto w-auto max-h-52 max-w-52 rounded-md object-contain"
                        loadingFallback={<div className="h-40 w-40 animate-pulse rounded-md bg-stone-200 dark:bg-stone-800" />}
                        fallback={<div className="grid h-32 w-32 place-items-center rounded-md bg-stone-100 text-xs text-stone-400 dark:bg-stone-800">图片预览失败</div>}
                    />
                </div>,
                document.body
            )}

            {/* 点击放大镜全屏大图预览 */}
            {previewLargeUrl && (
                <div
                    className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-pointer"
                    onClick={() => setPreviewLargeUrl(null)}
                >
                    <div className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-black/40 border border-white/20 shadow-2xl">
                        <img
                            src={previewLargeUrl}
                            alt="大图预览"
                            className="max-h-[85vh] max-w-[85vw] object-contain"
                        />
                        <button
                            type="button"
                            onClick={() => setPreviewLargeUrl(null)}
                            className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-black/60 text-white hover:bg-black/90 transition-colors"
                        >
                            <X className="size-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
// @opc-feature: image_workbench_skills [end]
