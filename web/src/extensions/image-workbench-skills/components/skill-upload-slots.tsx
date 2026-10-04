// @opc-feature: image_workbench_skills [start]
import React, { useMemo, useRef, useState } from "react";
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
import { message, Tooltip, Popover, Image as AntdImage } from "antd";
import type { ActiveSlotFile, WorkbenchSkill } from "../types/skill-contract";
import { SlotOutlineIcon, SlotUploadBadge } from "./skill-icons";

interface SkillUploadSlotsProps {
    skill: WorkbenchSkill;
    slotFiles: Record<string, ActiveSlotFile | undefined>;
    slotFilesMap?: Record<string, ActiveSlotFile[]>; // 每个槽位全部素材（支持折叠）
    slotActiveIdMap?: Record<string, string | undefined>;
    onSetSlotFile: (slotId: string, file: File | Blob, name?: string) => void;
    onAddSlotFile?: (slotId: string, file: File | Blob, name?: string) => void;
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
    const [activeHoverSlotId, setActiveHoverSlotId] = useState<string | null>(null);

    const activePreviewFile = useMemo(() => {
        if (!previewSlotId) return null;
        const allFiles = slotFilesMap[previewSlotId] || (slotFiles[previewSlotId] ? [slotFiles[previewSlotId]!] : []);
        const activeFileId = slotActiveIdMap[previewSlotId] || allFiles[0]?.id;
        const primary = allFiles.find((f) => f.id === activeFileId) || allFiles[0];
        if (!primary) return null;
        return {
            url: primary.previewUrl || primary.dataUrl,
            name: primary.name,
        };
    }, [previewSlotId, slotFilesMap, slotFiles, slotActiveIdMap]);

    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const appendInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const replaceSpecificRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const replacingTargetRef = useRef<{ slotId: string; fileId: string } | null>(null);

    const handleFileSelect = (slotId: string, files: FileList | null) => {
        if (!files || !files.length) return;
        const file = files[0];
        if (!file.type.startsWith("image/")) {
            message.warning("请上传有效的图片文件");
            return;
        }
        onSetSlotFile(slotId, file);
    };

    const handleAppendFile = (slotId: string, files: FileList | null) => {
        if (!files || !files.length) return;
        const file = files[0];
        if (!file.type.startsWith("image/")) {
            message.warning("请上传有效的图片文件");
            return;
        }
        if (onAddSlotFile) {
            onAddSlotFile(slotId, file);
            message.success("已向该槽位追加合并素材");
        } else {
            onSetSlotFile(slotId, file);
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

            {/* 水平滑动卡槽区 */}
            <div className="hover-scrollbar hover-scrollbar-hint min-w-0 overflow-x-auto rounded-xl border border-dashed border-stone-200 dark:border-stone-800 p-2.5 transition-colors">
                <div className="flex min-w-max items-start gap-2">
                    {skill.uploadSlots.map((slot, index) => {
                        const slotAllFiles = slotFilesMap[slot.id] || (slotFiles[slot.id] ? [slotFiles[slot.id]!] : []);
                        const isMultiple = slotAllFiles.length > 1;
                        const activeFileId = slotActiveIdMap[slot.id] || slotAllFiles[0]?.id;
                        const primaryFile = slotAllFiles.find((f) => f.id === activeFileId) || slotAllFiles[0];

                        const isDragActive = dragActiveSlotId === slot.id;
                        const labelText = slot.label + (slot.optional && !slot.label.includes("可选") ? " (可选)" : "");

                        // 渲染折叠展开浮层内容
                        const renderCollapsedPopoverContent = () => (
                            <div className="flex flex-col gap-2 p-1 min-w-[260px] max-w-[380px]">
                                <div className="flex items-center justify-between border-b border-border/60 pb-1.5 text-xs">
                                    <div className="flex items-center gap-1.5 font-semibold text-foreground">
                                        <Layers className="size-3.5 text-amber-500" />
                                        <span>【{slot.label}】已合并 {slotAllFiles.length} 张素材</span>
                                    </div>
                                    <span className="text-[11px] text-muted-foreground">点击可设为主图</span>
                                </div>

                                <div className="flex items-center gap-2 overflow-x-auto py-1 thin-scrollbar">
                                    {slotAllFiles.map((file, fileIdx) => {
                                        const isMain = file.id === activeFileId;
                                        return (
                                            <div
                                                key={file.id}
                                                className={`group/card relative size-20 shrink-0 rounded-lg border-2 transition-all cursor-pointer overflow-hidden ${
                                                    isMain
                                                        ? "border-amber-500 shadow-sm shadow-amber-500/20 bg-amber-50/20"
                                                        : "border-border/80 hover:border-stone-400 bg-muted/40"
                                                }`}
                                                onClick={() => {
                                                    if (onSetSlotActiveFile) {
                                                        onSetSlotActiveFile(slot.id, file.id);
                                                        message.success(`已将【${file.name}】设为生效主图`);
                                                    }
                                                }}
                                            >
                                                <img
                                                    src={file.previewUrl || file.dataUrl}
                                                    alt={file.name}
                                                    className="size-full object-cover"
                                                />

                                                {/* 主图徽标 */}
                                                {isMain ? (
                                                    <span className="absolute left-1 top-1 flex items-center gap-0.5 rounded bg-amber-500/90 px-1 py-0.2 text-[9px] font-bold text-white shadow-xs">
                                                        <CheckCircle2 className="size-2.5" /> 主图
                                                    </span>
                                                ) : (
                                                    <span className="absolute left-1 top-1 grid size-4 place-items-center rounded bg-black/60 text-[9px] font-medium text-white">
                                                        {fileIdx + 1}
                                                    </span>
                                                )}

                                                {/* 悬停操作浮层 */}
                                                <div className="absolute inset-0 hidden items-center justify-center gap-1 bg-black/50 backdrop-blur-[1px] group-hover/card:flex">
                                                    <Tooltip title="查看大图" placement="top" mouseEnterDelay={0.15}>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setPreviewLargeUrl(file.previewUrl || file.dataUrl);
                                                            }}
                                                            className="grid size-6 place-items-center rounded-full bg-white/90 text-stone-800 shadow transition hover:bg-white cursor-pointer"
                                                            aria-label="查看大图"
                                                        >
                                                            <ZoomIn className="size-3" />
                                                        </button>
                                                    </Tooltip>
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
                                            </div>
                                        );
                                    })}

                                    {/* 向该槽位继续追加素材按钮 */}
                                    <Tooltip title="追加素材" placement="top" mouseEnterDelay={0.15}>
                                        <button
                                            type="button"
                                            onClick={() => appendInputRefs.current[slot.id]?.click()}
                                            className="flex size-20 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border hover:border-amber-500 hover:bg-amber-50/30 dark:hover:bg-amber-950/20 text-muted-foreground transition-all cursor-pointer"
                                            aria-label="向此槽位追加素材"
                                        >
                                            <Plus className="size-4" />
                                            <span className="text-[10px]">追加</span>
                                        </button>
                                    </Tooltip>
                                </div>
                            </div>
                        );

                        return (
                            <React.Fragment key={slot.id}>
                                {index > 0 && <span className="mx-1 mt-1 h-14 w-px shrink-0 bg-stone-200 dark:bg-stone-700" aria-hidden="true" />}

                                <div className="flex shrink-0 flex-col items-center gap-1 text-center text-[11px] text-stone-600 dark:text-stone-300 w-24">
                                    {slotAllFiles.length > 0 && primaryFile ? (
                                        isMultiple ? (
                                            /* 多素材折叠态展示 (Popover 悬停展开) */
                                            <Popover
                                                content={renderCollapsedPopoverContent()}
                                                trigger={["hover", "click"]}
                                                placement="bottom"
                                                mouseEnterDelay={0.12}
                                                mouseLeaveDelay={0.2}
                                            >
                                                <div
                                                    className="group relative size-16 shrink-0 cursor-pointer overflow-visible rounded-xl border border-stone-200 bg-stone-100 shadow-sm transition duration-150 hover:z-20 hover:-translate-y-1 hover:scale-105 dark:border-stone-700 dark:bg-stone-800"
                                                    onMouseEnter={() => setActiveHoverSlotId(slot.id)}
                                                    onMouseLeave={() => setActiveHoverSlotId(null)}
                                                >
                                                    {/* 立体层叠卡牌视觉效果 */}
                                                    <div className="absolute -inset-1 rounded-xl bg-stone-300/80 dark:bg-stone-700/80 rotate-3 scale-95 transition-transform" />
                                                    {slotAllFiles.length > 2 && (
                                                        <div className="absolute -inset-1.5 rounded-xl bg-stone-200/70 dark:bg-stone-800/70 -rotate-3 scale-90 transition-transform" />
                                                    )}

                                                    {/* 顶层主图 */}
                                                    <div className="relative size-full overflow-hidden rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-300 dark:border-stone-600">
                                                        <img
                                                            src={primaryFile.previewUrl || primaryFile.dataUrl}
                                                            alt={primaryFile.name}
                                                            className="size-full object-cover block"
                                                        />

                                                        {/* 左上角槽位序号 */}
                                                        <span className="absolute left-1 top-1 grid size-4.5 place-items-center rounded-full bg-black/70 text-[9px] font-semibold text-white">
                                                            {index + 1}
                                                        </span>

                                                        {/* 右上角折叠数量徽标 */}
                                                        <span className="absolute right-0.5 top-0.5 flex items-center gap-0.5 rounded-full bg-amber-500 px-1 py-0.2 text-[9px] font-bold text-white shadow-xs">
                                                            <Layers className="size-2.5" />
                                                            <span>{slotAllFiles.length}</span>
                                                        </span>

                                                        {/* 底部微型操作提示 */}
                                                        <div className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-[9px] text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-0.5">
                                                            <span>悬停展开</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </Popover>
                                        ) : (
                                            /* 单素材常规卡片展示 */
                                            <div
                                                className="group relative size-16 shrink-0 aspect-square min-w-16 min-h-16 max-w-16 max-h-16 cursor-pointer overflow-hidden rounded-xl border border-stone-200 bg-stone-100 shadow-sm transition duration-150 hover:z-20 hover:-translate-y-0.5 hover:shadow-md dark:border-stone-700 dark:bg-stone-800"
                                                onMouseEnter={() => setPreviewSlotId(slot.id)}
                                                onMouseLeave={() => setPreviewSlotId(null)}
                                                onClick={() => fileInputRefs.current[slot.id]?.click()}
                                            >
                                                <div className="relative size-full overflow-hidden rounded-xl">
                                                    <img
                                                        src={primaryFile.previewUrl || primaryFile.dataUrl}
                                                        alt={primaryFile.name}
                                                        className="size-full object-cover block"
                                                    />
                                                </div>
                                                <span className="absolute left-1 top-1 grid size-5 place-items-center rounded-full bg-black/65 text-[10px] font-semibold text-white">
                                                    {index + 1}
                                                </span>

                                                {/* 悬浮操作浮层 */}
                                                <div className="absolute inset-0 z-20 hidden items-center justify-center gap-1 rounded-xl bg-black/45 group-hover:flex">
                                                    <Tooltip title="替换图片" placement="top" mouseEnterDelay={0.15}>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                fileInputRefs.current[slot.id]?.click();
                                                            }}
                                                            className="grid size-7 place-items-center rounded-full bg-white/90 text-stone-800 shadow-sm transition hover:bg-white cursor-pointer"
                                                            aria-label="替换图片"
                                                        >
                                                            <RefreshCw className="size-3.5" />
                                                        </button>
                                                    </Tooltip>
                                                    <Tooltip title="删除素材" placement="top" mouseEnterDelay={0.15}>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onClearSlot(slot.id);
                                                                if (previewSlotId === slot.id) setPreviewSlotId(null);
                                                            }}
                                                            className="grid size-7 place-items-center rounded-full bg-white/90 text-red-600 shadow-sm transition hover:bg-white cursor-pointer"
                                                            aria-label="删除素材"
                                                        >
                                                            <Trash2 className="size-3.5" />
                                                        </button>
                                                    </Tooltip>
                                                </div>
                                            </div>
                                        )
                                    ) : (
                                        /* 空槽位上传入口 */
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
                                            title={labelText}
                                            aria-label={labelText}
                                        >
                                            <span
                                                className={`relative grid size-14 place-items-center rounded-lg border transition group-hover:-translate-y-0.5 group-hover:border-stone-300 group-hover:bg-stone-200 group-hover:text-stone-700 dark:group-hover:border-stone-500 dark:group-hover:bg-stone-700 dark:group-hover:text-stone-100 ${
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

                                    {/* 隐藏原生文件 Input：替换主图 */}
                                    <input
                                        ref={(el) => {
                                            fileInputRefs.current[slot.id] = el;
                                        }}
                                        type="file"
                                        accept="image/*"
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
                                        className="hidden"
                                        onChange={(e) => {
                                            handleAppendFile(slot.id, e.target.files);
                                            e.target.value = "";
                                        }}
                                    />

                                    <span className="max-w-full truncate leading-4 font-medium text-stone-500 dark:text-stone-400 flex items-center justify-center gap-1" title={labelText}>
                                        <span>{labelText}</span>
                                        {isMultiple && <span className="font-mono text-amber-500 font-bold">({slotAllFiles.length})</span>}
                                    </span>
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            {/* 隐藏原生文件 Input：替换特定文件 */}
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

            {/* 单素材悬停大图居中浮层 */}
            {activePreviewFile && (
                <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-max max-w-[min(90vw,36rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-black/[0.08] bg-white/95 p-2 shadow-2xl backdrop-blur-xl dark:border-white/[0.1] dark:bg-[#1c1c1e]/95">
                    <img
                        src={activePreviewFile.url}
                        alt={activePreviewFile.name}
                        className="block h-auto w-auto max-h-[min(70vh,36rem)] max-w-[min(90vw,36rem)] rounded-md object-contain"
                    />
                </div>
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
