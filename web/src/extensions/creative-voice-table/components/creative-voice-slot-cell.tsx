import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { Dropdown, Tooltip, message, type MenuProps } from "antd";
import { Copy, Layers, LoaderCircle, Mic, Music, Pause, Play, Trash2, Upload, Volume2 } from "lucide-react";

import { copyBatchReference, getBatchReferenceClipboard, useBatchReferenceClipboard } from "@/lib/canvas/batch-reference-clipboard";
import { IDLE_AUDIO_SNAPSHOT, getCanvasAudioPlaybackSnapshot, subscribeCanvasAudioNode, toggleCanvasAudio, type CanvasAudioSource } from "@/services/canvas-audio-playback";
import type { CanvasTheme } from "@/lib/canvas-theme";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export interface CreativeVoiceSlotCellProps {
    node?: CanvasNodeData;
    tableNodeId?: string;
    rowId: string;
    columnIndex: number;
    columnId: string;
    columnLabel: string;
    rowLabel: string;
    label: string;
    theme: CanvasTheme;
    readOnly?: boolean;
    availableNodes?: CanvasNodeData[];
    fallbackToneText?: string;
    isDraggingCell?: boolean;
    isDragOver?: boolean;
    isDragOverCopy?: boolean;
    onDragCellStart?: (rowId: string, columnIndex: number) => void;
    onDragCellEnd?: () => void;
    onDragCellOver?: (rowId: string, columnIndex: number, isCopy: boolean) => void;
    onDragCellLeave?: () => void;
    onPickFile: () => void;
    onUploadFile: (file: File) => void;
    onAssignReferenceNode?: (referenceNodeId: string) => void;
    onClear?: () => void;
    onCopyReferenceCell?: (sourceRowId: string, sourceCol: number, targetRowId: string, targetCol: number) => void;
    onMoveReferenceCell?: (sourceRowId: string, sourceCol: number, targetRowId: string, targetCol: number) => void;
}

function formatAudioTime(ms: number) {
    if (!Number.isFinite(ms) || ms <= 0) return "00:00";
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

export function CreativeVoiceSlotCell({
    node,
    tableNodeId,
    rowId,
    columnIndex,
    columnId,
    columnLabel,
    rowLabel,
    label,
    theme,
    readOnly = false,
    availableNodes = [],
    fallbackToneText,
    isDraggingCell,
    isDragOver,
    isDragOverCopy,
    onDragCellStart,
    onDragCellEnd,
    onDragCellOver,
    onDragCellLeave,
    onPickFile,
    onUploadFile,
    onAssignReferenceNode,
    onClear,
    onCopyReferenceCell,
    onMoveReferenceCell,
}: CreativeVoiceSlotCellProps) {
    const clipboardItem = useBatchReferenceClipboard((state) => state.clipboard);
    const isVoiceSlot = columnId === "ref-voice";

    const hasAudio = Boolean(
        node &&
        (node.type === CanvasNodeType.Audio ||
         node.type === "audio" ||
         node.metadata?.mimeType?.startsWith("audio/") ||
         node.metadata?.content ||
         node.metadata?.storageKey)
    );

    const subscribe = useCallback((listener: () => void) => {
        return subscribeCanvasAudioNode(node?.id, listener);
    }, [node?.id]);

    const getSnapshot = useCallback(() => {
        return getCanvasAudioPlaybackSnapshot(node?.id);
    }, [node?.id]);

    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const isPlaying = snapshot.phase === "playing";
    const isLoading = snapshot.phase === "loading";
    const durationMs = snapshot.durationMs || node?.metadata?.durationMs || 0;

    const audioSource: CanvasAudioSource | null = useMemo(() => {
        if (!node) return null;
        return {
            nodeId: node.id,
            content: node.metadata?.content || "",
            storageKey: node.metadata?.storageKey,
            mimeType: node.metadata?.mimeType || "audio/mp3",
            durationMs,
        };
    }, [durationMs, node]);

    const handleToggleAudio = useCallback((e: React.SyntheticEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (audioSource) {
            void toggleCanvasAudio(audioSource);
        }
    }, [audioSource]);

    const canvasMediaMenuItems: MenuProps["items"] = useMemo(() => {
        const audioNodes = availableNodes.filter(
            (n) => n.type === CanvasNodeType.Audio || n.type === "audio" || n.metadata?.mimeType?.startsWith("audio/")
        );
        const candidateNodes = audioNodes.length > 0 ? audioNodes : availableNodes;
        if (!candidateNodes || candidateNodes.length === 0) {
            return [
                {
                    key: "empty",
                    disabled: true,
                    label: <span className="text-xs text-stone-400">画布暂无可复用的音频素材节点</span>,
                },
            ];
        }
        return candidateNodes.slice(0, 20).map((mNode) => {
            const title = mNode.title || (mNode.type === "audio" ? "音频节点" : "素材节点");
            return {
                key: mNode.id,
                label: (
                    <div className="flex items-center gap-2 py-0.5 max-w-[200px]">
                        <div className="size-6 rounded bg-purple-950 flex items-center justify-center shrink-0 text-purple-300">
                            <Volume2 className="size-3" />
                        </div>
                        <div className="min-w-0 flex-1 flex flex-col">
                            <span className="truncate text-xs font-medium text-stone-900 dark:text-stone-100">{title}</span>
                            <span className="truncate text-[10px] text-stone-400">{mNode.type}</span>
                        </div>
                    </div>
                ),
                onClick: () => {
                    onAssignReferenceNode?.(mNode.id);
                    message.success(`已连接声音素材「${title}」到当前插槽`);
                },
            };
        });
    }, [availableNodes, onAssignReferenceNode]);

    const handleCopy = useCallback(() => {
        if (!node) return;
        copyBatchReference({
            nodeId: node.id,
            title: node.title || (isVoiceSlot ? "参考音色" : "参考情绪"),
            storageKey: node.metadata?.storageKey,
            mimeType: node.metadata?.mimeType || "audio/mp3",
        });
        message.success(`已复制 ${node.title || "声音素材"}，可在任意插槽按 Ctrl+V 或点击粘贴`);
    }, [isVoiceSlot, node]);

    const handlePaste = useCallback(async () => {
        if (readOnly) return;
        const copied = getBatchReferenceClipboard();
        if (copied?.nodeId) {
            onAssignReferenceNode?.(copied.nodeId);
            message.success(`已粘贴并复用声音素材：${copied.title || "参考音色"}`);
            return;
        }
        message.info("剪贴板中没有可粘贴的声音素材");
    }, [onAssignReferenceNode, readOnly]);

    return (
        <Tooltip title={hasAudio ? `${label} · ${node?.title || "音频"} (${isPlaying ? "点击暂停" : "点击试听"} · Ctrl+C 复制 / Backspace 清除)` : isVoiceSlot ? `${label} · 点击上传参考音色音频 (可 Ctrl+V 粘贴)` : fallbackToneText ? `${label} · 当前设置：${fallbackToneText} (点击可上传试听音频)` : `${label} · 点击上传参考情绪音频`}>
            <div
                role="button"
                tabIndex={0}
                data-batch-reference-cell
                data-table-node-id={tableNodeId}
                data-row-id={rowId}
                data-column-index={columnIndex}
                data-column-label={columnLabel}
                data-row-label={rowLabel}
                className={`group/cell relative box-border grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl border text-left cursor-pointer transition-all hover:shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50 ${
                    isDraggingCell ? "opacity-35 border-dashed border-purple-400 scale-95" : ""
                } ${
                    isDragOver
                        ? isDragOverCopy
                            ? "ring-2 ring-blue-500 border-blue-500 shadow-md scale-[1.03]"
                            : "ring-2 ring-purple-500 border-purple-500 shadow-md scale-[1.03]"
                        : ""
                }`}
                style={{
                    borderColor: hasAudio ? theme.node.stroke : "rgba(147, 51, 234, 0.25)",
                    background: hasAudio ? "linear-gradient(135deg, rgba(30, 27, 75, 0.95), rgba(49, 46, 129, 0.9))" : "rgba(147, 51, 234, 0.04)",
                }}
                draggable={!readOnly && hasAudio}
                onDragStart={(event) => {
                    if (!node || readOnly) {
                        event.preventDefault();
                        return;
                    }
                    event.dataTransfer.setData("application/x-canvas-node-id", node.id);
                    event.dataTransfer.setData("application/x-batch-cell", JSON.stringify({ rowId, columnIndex, nodeId: node.id }));
                    event.dataTransfer.effectAllowed = "copyMove";
                    onDragCellStart?.(rowId, columnIndex);
                }}
                onDragEnd={() => onDragCellEnd?.()}
                onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const isCopy = event.ctrlKey;
                    event.dataTransfer.dropEffect = isCopy ? "copy" : "move";
                    onDragCellOver?.(rowId, columnIndex, isCopy);
                }}
                onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                        onDragCellLeave?.();
                    }
                }}
                onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const isCopy = event.ctrlKey;
                    onDragCellEnd?.();
                    if (readOnly) return;
                    const internalNodeId = event.dataTransfer.getData("application/x-canvas-node-id");
                    const internalCellRaw = event.dataTransfer.getData("application/x-batch-cell");
                    if (internalCellRaw) {
                        try {
                            const sourceCell = JSON.parse(internalCellRaw);
                            if (sourceCell.rowId === rowId && sourceCell.columnIndex === columnIndex) return;
                            if (isCopy) {
                                onCopyReferenceCell?.(sourceCell.rowId, sourceCell.columnIndex, rowId, columnIndex);
                                message.success("已复制声音素材到目标插槽");
                            } else {
                                onMoveReferenceCell?.(sourceCell.rowId, sourceCell.columnIndex, rowId, columnIndex);
                                message.success("已移动声音素材到目标插槽");
                            }
                            return;
                        } catch {}
                    }
                    if (internalNodeId) {
                        onAssignReferenceNode?.(internalNodeId);
                        message.success("已填入声音素材");
                        return;
                    }
                    const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("audio/"));
                    if (file && !readOnly) onUploadFile(file);
                }}
                onClick={(e) => {
                    e.stopPropagation();
                    if (hasAudio) {
                        handleToggleAudio(e);
                    } else if (!readOnly) {
                        onPickFile();
                    }
                }}
                onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
                        event.preventDefault();
                        event.stopPropagation();
                        void handlePaste();
                        return;
                    }
                    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
                        if (hasAudio) {
                            event.preventDefault();
                            event.stopPropagation();
                            handleCopy();
                            return;
                        }
                    }
                    if (event.key === "Backspace" || event.key === "Delete") {
                        if (hasAudio && onClear) {
                            event.preventDefault();
                            event.stopPropagation();
                            onClear();
                            return;
                        }
                    }
                }}
            >
                {hasAudio ? (
                    <div className="relative flex size-full flex-col items-center justify-between p-2 text-white select-none">
                        <div className="flex w-full items-center justify-between">
                            <span className="text-[10px] font-medium text-purple-300 truncate max-w-[54px]">
                                {node?.title || (isVoiceSlot ? "音色" : "情绪")}
                            </span>
                            <span className="text-[9px] tabular-nums text-purple-400">
                                {durationMs ? formatAudioTime(durationMs) : "--:--"}
                            </span>
                        </div>

                        {/* 迷你音频试听播放按钮与波形动效 */}
                        <div className="flex flex-col items-center justify-center gap-1">
                            <button
                                type="button"
                                aria-label={isPlaying ? "暂停试听" : "播放试听"}
                                className={`grid size-8 place-items-center rounded-full transition-transform hover:scale-110 active:scale-95 shadow-md ${
                                    isPlaying ? "bg-purple-500 text-white animate-pulse" : "bg-purple-600/80 hover:bg-purple-600 text-white"
                                }`}
                                onClick={handleToggleAudio}
                            >
                                {isLoading ? (
                                    <LoaderCircle className="size-4 animate-spin" />
                                ) : isPlaying ? (
                                    <Pause className="size-4 fill-white" />
                                ) : (
                                    <Play className="size-4 fill-white ml-0.5" />
                                )}
                            </button>
                            <span className="text-[9px] text-purple-300/80">
                                {isPlaying ? "试听中..." : "点击试听"}
                            </span>
                        </div>

                        <span className="rounded px-1 text-[9px] font-semibold text-white/90 bg-black/50">
                            {label}
                        </span>
                    </div>
                ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center select-none">
                        {fallbackToneText ? (
                            <div className="flex flex-col items-center gap-1">
                                <span className="text-base">🎭</span>
                                <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 line-clamp-1 max-w-[80px]">
                                    {fallbackToneText}
                                </span>
                                <span className="text-[9px] text-stone-400">点击上传音频</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-1">
                                {isVoiceSlot ? <Mic className="size-5 text-purple-500 opacity-60" /> : <Music className="size-5 text-amber-500 opacity-60" />}
                                <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">
                                    {columnLabel}
                                </span>
                                <span className="text-[9px] text-stone-400">上传音频</span>
                            </div>
                        )}
                        <span className="absolute bottom-1 left-1.5 rounded px-1 text-[9px] font-medium text-stone-400 bg-stone-200/50 dark:bg-stone-800/50">
                            {label}
                        </span>
                    </div>
                )}

                {/* 悬浮操作栏 */}
                {!readOnly && (
                    <>
                        <div
                            className="absolute top-1 left-1 z-20 hidden group-hover/cell:flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <Dropdown menu={{ items: canvasMediaMenuItems, style: { maxHeight: "260px", overflowY: "auto" } }} trigger={["click"]} placement="bottomLeft">
                                <Tooltip title="从画布选用已有声音素材" placement="bottom">
                                    <button
                                        type="button"
                                        aria-label="从画布选用声音素材"
                                        className="grid size-6 place-items-center rounded-full bg-black/65 text-white/90 hover:text-white hover:bg-black/85 hover:scale-110 active:scale-95 shadow-sm border border-white/20 backdrop-blur-[2px] transition-all cursor-pointer"
                                    >
                                        <Layers className="size-3.5" />
                                    </button>
                                </Tooltip>
                            </Dropdown>
                            {hasAudio && (
                                <Tooltip title="复制声音素材 (可在任意插槽 Ctrl+V 粘贴)" placement="bottom">
                                    <button
                                        type="button"
                                        aria-label="复制声音素材"
                                        className="grid size-6 place-items-center rounded-full bg-black/65 text-white/90 hover:text-white hover:bg-black/85 hover:scale-110 active:scale-95 shadow-sm border border-white/20 backdrop-blur-[2px] transition-all cursor-pointer"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            handleCopy();
                                        }}
                                    >
                                        <Copy className="size-3.5" />
                                    </button>
                                </Tooltip>
                            )}
                        </div>

                        {hasAudio ? (
                            <div
                                className="absolute top-1 right-1 z-20 hidden group-hover/cell:flex"
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                            >
                                <Tooltip title="移除此音频 (清理连接)" placement="bottom">
                                    <button
                                        type="button"
                                        aria-label="移除声音素材"
                                        className="grid size-6 place-items-center rounded-full bg-red-500/85 text-white hover:bg-red-600 hover:scale-110 active:scale-95 shadow-sm border border-red-400/40 backdrop-blur-[2px] transition-all cursor-pointer"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            onClear?.();
                                        }}
                                    >
                                        <Trash2 className="size-3.5" />
                                    </button>
                                </Tooltip>
                            </div>
                        ) : (
                            <div className="absolute inset-x-1 bottom-1 z-20 flex items-center justify-center gap-1 opacity-0 transition-opacity group-hover/cell:opacity-100">
                                <button
                                    type="button"
                                    aria-label="上传音频"
                                    title="上传本地音频文件"
                                    className="flex h-6 flex-1 items-center justify-center gap-0.5 rounded bg-black/65 hover:bg-black/85 text-white px-1 text-[10px] font-medium shadow-sm border border-white/20 backdrop-blur-[2px] transition-all hover:scale-105 active:scale-95 cursor-pointer pointer-events-auto"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        onPickFile();
                                    }}
                                >
                                    <Upload className="size-3 shrink-0" />
                                    <span>上传</span>
                                </button>
                                <button
                                    type="button"
                                    aria-label="粘贴音频"
                                    title={clipboardItem?.nodeId ? `粘贴已复制素材 (${clipboardItem.title})` : "粘贴素材 (Ctrl+V)"}
                                    className="flex h-6 flex-1 items-center justify-center gap-0.5 rounded bg-purple-600/85 hover:bg-purple-600 text-white px-1 text-[10px] font-medium shadow-sm border border-purple-400/40 backdrop-blur-[2px] transition-all hover:scale-105 active:scale-95 cursor-pointer pointer-events-auto"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        void handlePaste();
                                    }}
                                >
                                    <span>粘贴</span>
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </Tooltip>
    );
}
