import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { Button, Dropdown, Modal, Popover, Switch, Tooltip, message } from "antd";
import { Copy, Layers, LoaderCircle, Maximize2, Mic, Music, Pause, Play, Plus, Rows3, Settings2, Sparkles, Trash2, Volume2, ZoomIn } from "lucide-react";

import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { getCanvasAudioPlaybackSnapshot, subscribeCanvasAudioNode, toggleCanvasAudio, type CanvasAudioSource } from "@/services/canvas-audio-playback";
import {
    CREATIVE_VOICE_REF_COLUMNS,
    CREATIVE_VOICE_TEXT_COLUMNS,
    formatVoiceTimeDisplay,
    type VoiceSlotMode,
} from "../contracts";
import {
    countScriptCharacters,
    rewriteVoiceScript,
} from "../services/voice-script-rewrite";
import { CreativeVoiceSlotCell } from "./creative-voice-slot-cell";
import { batchReferenceHandleId, BATCH_REFERENCE_HANDLE_GAP, BATCH_REFERENCE_HANDLE_TOP } from "@/lib/canvas/canvas-batch-table";
import type { CanvasTheme } from "@/lib/canvas-theme";
import {
    CanvasNodeType,
    type CanvasBatchRow,
    type CanvasBatchTableData,
    type CanvasConnection,
    type CanvasGenerationBatch,
    type CanvasNodeData,
} from "@/types/canvas";

export interface CreativeVoiceTableNodeContentProps {
    node: CanvasNodeData;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    batch?: CanvasGenerationBatch;
    theme: CanvasTheme;
    onPatchTable: (patch: Partial<CanvasBatchTableData & { voiceSlotMode?: VoiceSlotMode }>) => void;
    onAddRow: () => void;
    onRemoveRow: (rowId: string) => void;
    onUpdateRow: (rowId: string, patch: Partial<CanvasBatchRow>) => void;
    onFillRows: () => void;
    onGenerateVoice?: (rowIds?: string[]) => void;
    onFocusOutput?: (nodeId: string) => void;
    onAssignReferenceNode?: (rowId: string, columnIndex: number, referenceNodeId: string) => void;
    onClearReferenceCell?: (rowId: string, columnIndex: number) => void;
    onUploadReference?: (rowId: string, columnIndex: number, file: File) => void;
    onCopyReferenceCell?: (sourceRowId: string, sourceCol: number, targetRowId: string, targetCol: number) => void;
    onMoveReferenceCell?: (sourceRowId: string, sourceCol: number, targetRowId: string, targetCol: number) => void;
    onConnectStart: (event: ReactPointerEvent, handleId: string) => void;
    onConnectDrop?: (event: ReactPointerEvent, handleId: string) => void;
    onAutoHeightChange?: (height: number) => void;
    onResetManualSize?: () => void;
    readOnly?: boolean;
}

const CONCURRENCY_OPTIONS = [1, 3, 5, 10] as const;

export function CreativeVoiceTableNodeContent({
    node,
    nodes,
    connections,
    theme,
    onPatchTable,
    onAddRow,
    onRemoveRow,
    onUpdateRow,
    onFillRows,
    onGenerateVoice,
    onFocusOutput,
    onAssignReferenceNode,
    onClearReferenceCell,
    onUploadReference,
    onCopyReferenceCell,
    onMoveReferenceCell,
    onConnectStart,
    onConnectDrop,
    onAutoHeightChange,
    onResetManualSize,
    readOnly = false,
}: CreativeVoiceTableNodeContentProps) {
    const effectiveConfig = useEffectiveConfig();
    const table = (node.metadata?.batchTable || {
        operation: "creative",
        concurrency: 6,
        rows: [],
        contentKind: "creative-voice",
    }) as CanvasBatchTableData & { voiceSlotMode?: VoiceSlotMode };

    const voiceSlotMode: VoiceSlotMode = table.voiceSlotMode || "all";

    const nodeById = useMemo(() => new Map(nodes.map((item) => [item.id, item])), [nodes]);
    const availableMediaNodes = useMemo(
        () => nodes.filter((item) => item.id !== node.id && (item.type === CanvasNodeType.Audio || item.type === "audio" || item.type === CanvasNodeType.Image || item.type === CanvasNodeType.Video)),
        [node.id, nodes]
    );

    const [rewritingRowIds, setRewritingRowIds] = useState<Set<string>>(new Set());
    const [batchRewriting, setBatchRewriting] = useState(false);

    const [draggingCell, setDraggingCell] = useState<{ rowId: string; columnIndex: number } | null>(null);
    const [dragOverCell, setDragOverCell] = useState<{ rowId: string; columnIndex: number; isCopy: boolean } | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetRef = useRef<{ rowId: string; columnIndex: number } | null>(null);

    const pickAudioFile = (rowId: string, columnIndex: number) => {
        uploadTargetRef.current = { rowId, columnIndex };
        fileInputRef.current?.click();
    };

    // 模式切换：全部使用 vs 分镜使用
    const handleToggleVoiceSlotMode = (mode: VoiceSlotMode) => {
        onPatchTable({ voiceSlotMode: mode });
        message.info(mode === "all" ? "已切换为：全部分镜共用同一音色" : "已切换为：各分镜独立配置音色");
    };

    // 智能音色分配：如果在“全部使用”模式下配置了某个分镜的音色，自动广播给全部分镜
    const handleAssignVoiceReference = useCallback(
        (rowId: string, columnIndex: number, referenceNodeId: string) => {
            if (columnIndex === 0 && voiceSlotMode === "all") {
                // 广播到全部行
                const nextRows = table.rows.map((row) => {
                    const inputs = [...(row.inputNodeIds || [])];
                    while (inputs.length <= columnIndex) inputs.push("");
                    inputs[columnIndex] = referenceNodeId;
                    return { ...row, inputNodeIds: inputs };
                });
                onPatchTable({ rows: nextRows });
                message.success("已将该参考音色一键应用到全部分镜");
                return;
            }
            onAssignReferenceNode?.(rowId, columnIndex, referenceNodeId);
        },
        [onAssignReferenceNode, onPatchTable, table.rows, voiceSlotMode]
    );

    // 单行文案改写（严格 ±2 汉字硬核校验）
    const handleRewriteRow = async (row: CanvasBatchRow) => {
        const originalText = row.cells?.["col-lines"] || row.prompt || "";
        if (!originalText.trim()) {
            message.warning("原文台词为空，无法改写");
            return;
        }

        setRewritingRowIds((prev) => new Set(prev).add(row.id));
        try {
            const result = await rewriteVoiceScript({
                originalText,
                speaker: row.cells?.["col-speaker"] || "旁白/主播",
                tone: row.cells?.["col-tone"] || "自然亲和",
                config: effectiveConfig,
            });

            if (result.success && result.rewrittenText) {
                const nextCells = {
                    ...(row.cells || {}),
                    "col-rewrite": result.rewrittenText,
                };
                onUpdateRow(row.id, { cells: nextCells });
                message.success(`分镜文案改写完成（原文 ${result.originalCount} 字，改写后 ${result.newCount} 字，差 ${result.characterDiff > 0 ? `+${result.characterDiff}` : result.characterDiff} 字）`);
            } else {
                message.error(result.error || "文案改写失败，请重试");
            }
        } catch (err) {
            message.error(err instanceof Error ? err.message : "文案改写异常");
        } finally {
            setRewritingRowIds((prev) => {
                const next = new Set(prev);
                next.delete(row.id);
                return next;
            });
        }
    };

    // 批量全量改写分镜文案
    const handleBatchRewriteAll = async () => {
        const targets = table.rows.filter((r) => r.enabled && (r.cells?.["col-lines"] || r.prompt));
        if (!targets.length) {
            message.warning("没有可改写的分镜任务");
            return;
        }

        setBatchRewriting(true);
        let successCount = 0;
        try {
            for (const row of targets) {
                const originalText = row.cells?.["col-lines"] || row.prompt || "";
                if (!originalText.trim()) continue;

                const result = await rewriteVoiceScript({
                    originalText,
                    speaker: row.cells?.["col-speaker"] || "旁白/主播",
                    tone: row.cells?.["col-tone"] || "自然亲和",
                    config: effectiveConfig,
                });

                if (result.success && result.rewrittenText) {
                    onUpdateRow(row.id, {
                        cells: { ...(row.cells || {}), "col-rewrite": result.rewrittenText },
                    });
                    successCount += 1;
                }
            }
            message.success(`已完成 ${successCount} 个分镜文案的一键口播改写（字数均严控在 ±2 字以内）`);
        } finally {
            setBatchRewriting(false);
        }
    };

    const isDarkTheme = theme.canvas.background !== "#f0f0f0";
    const subtleSurface = isDarkTheme ? "rgba(255,255,255,.03)" : "rgba(0,0,0,.02)";
    const inputSurface = isDarkTheme ? "rgba(255,255,255,.05)" : "#fff";

    // 表格列网格模板：任务(56px) | 参考音色(110px) | 参考情绪(110px) | 起止与时长(108px) | 说话人与情绪(140px) | 原文台词(1.2fr) | 改写文案(1.4fr) | 生成结果(120px) | 操作(70px)
    const gridTemplateColumns = "56px 110px 110px 108px 140px minmax(200px, 1.2fr) minmax(240px, 1.4fr) 120px 70px";

    const completedCount = table.rows.filter((r) => r.outputNodeId && nodeById.has(r.outputNodeId)).length;
    const unfinishedReadyCount = table.rows.filter((r) => r.enabled && (!r.outputNodeId || !nodeById.has(r.outputNodeId))).length;

    const toolbarRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // 自适应内部页面总高度：测量工具栏 + 内容滚动高度并向上同步
    useLayoutEffect(() => {
        if (readOnly || node.metadata?.manualSize || !onAutoHeightChange) return;
        const scrollEl = scrollContainerRef.current;
        const toolbarEl = toolbarRef.current;
        if (!scrollEl) return;

        let rafId: number | null = null;
        const measureHeight = () => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                if (!scrollContainerRef.current) return;
                const toolbarHeight = toolbarRef.current?.offsetHeight || 48;
                const contentScrollHeight = scrollContainerRef.current.scrollHeight;
                const targetHeight = Math.max(240, toolbarHeight + contentScrollHeight + 4);
                if (Math.abs(node.height - targetHeight) >= 4) {
                    onAutoHeightChange(targetHeight);
                }
            });
        };

        measureHeight();
        const observer = new ResizeObserver(() => {
            measureHeight();
        });
        observer.observe(scrollEl);
        return () => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            observer.disconnect();
        };
    }, [node.height, node.metadata?.manualSize, table.rows.length, readOnly, onAutoHeightChange]);

    return (
        <div
            data-canvas-batch-table
            data-canvas-no-zoom
            data-canvas-wheel-scroll
            className="relative flex size-full flex-col select-none rounded-[inherit]"
            style={{ background: theme.node.fill, color: theme.node.text }}
            onWheel={(e) => e.stopPropagation()}
        >
            {/* 隐藏的本地音频文件上传选择器 */}
            {!readOnly && (
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
                    className="hidden"
                    onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        const target = uploadTargetRef.current;
                        event.currentTarget.value = "";
                        uploadTargetRef.current = null;
                        if (file && target) {
                            onUploadReference?.(target.rowId, target.columnIndex, file);
                        }
                    }}
                />
            )}

            {/* 左侧参考音频端口连线手柄 */}
            {!readOnly && (
                <div className="pointer-events-none absolute inset-y-0 -left-3 z-20 flex flex-col" style={{ top: `${BATCH_REFERENCE_HANDLE_TOP}px` }}>
                    {CREATIVE_VOICE_REF_COLUMNS.map((column, index) => {
                        const handleId = batchReferenceHandleId(column.id);
                        return (
                            <div
                                key={column.id}
                                style={{ height: `${BATCH_REFERENCE_HANDLE_GAP}px` }}
                                className="pointer-events-auto relative flex items-center"
                            >
                                <div
                                    data-handleid={handleId}
                                    className="group/handle relative -ml-1 grid size-5 place-items-center rounded-full border bg-purple-600 text-white shadow-sm transition-transform hover:scale-125 cursor-crosshair active:scale-95"
                                    style={{ borderColor: theme.node.stroke }}
                                    onPointerDown={(event) => onConnectStart(event, handleId)}
                                    onPointerUp={(event) => onConnectDrop?.(event, handleId)}
                                >
                                    <div className="size-2 rounded-full bg-white" />
                                    <div className="pointer-events-none absolute left-6 hidden rounded bg-stone-900/90 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-white group-hover/handle:block shadow">
                                        接入{column.label}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* 表头工具栏 */}
            <div ref={toolbarRef} className="shrink-0 overflow-hidden rounded-t-[inherit] border-b" style={{ borderColor: theme.node.stroke, background: subtleSurface }}>
                <div data-canvas-batch-drag className="flex h-12 cursor-grab items-center gap-2.5 px-3.5 active:cursor-grabbing">
                    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden" onPointerDown={(event) => event.stopPropagation()}>
                        {/* 节点专属紫色徽标 */}
                        <div className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-purple-500/15 px-2.5 text-xs font-semibold text-purple-600 dark:text-purple-400">
                            <Mic className="size-3.5" />
                            <span>创意配音</span>
                        </div>

                        {/* 手动拉伸高度后的自适应重置按钮 */}
                        {node.metadata?.manualSize && onResetManualSize && (
                            <Tooltip title="当前为手动拉伸高度，点击恢复根据内容自适应拉高">
                                <button
                                    type="button"
                                    onClick={onResetManualSize}
                                    className="flex h-7 items-center gap-1 rounded px-2 text-[11px] font-medium text-purple-600 dark:text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 transition-colors"
                                >
                                    <Maximize2 className="size-3" />
                                    <span>自适应高度</span>
                                </button>
                            </Tooltip>
                        )}

                        {/* 参考音色模式切换：全部使用 vs 分镜使用 */}
                        <div className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-2" style={{ background: theme.node.panel }}>
                            <span className="text-xs font-medium" style={{ color: theme.node.muted }}>音色应用模式:</span>
                            <div className="flex items-center rounded-md bg-black/5 dark:bg-white/10 p-0.5 text-xs">
                                <button
                                    type="button"
                                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                                        voiceSlotMode === "all" ? "bg-purple-600 text-white shadow-xs" : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                                    }`}
                                    onClick={() => handleToggleVoiceSlotMode("all")}
                                >
                                    全部使用 (全局统一)
                                </button>
                                <button
                                    type="button"
                                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                                        voiceSlotMode === "individual" ? "bg-purple-600 text-white shadow-xs" : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                                    }`}
                                    onClick={() => handleToggleVoiceSlotMode("individual")}
                                >
                                    分镜使用 (独立配置)
                                </button>
                            </div>
                        </div>

                        {/* 并发数选择 */}
                        <div className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs" style={{ background: theme.node.panel }}>
                            <span className="font-medium" style={{ color: theme.node.muted }}>并发</span>
                            <div className="flex items-center gap-0.5">
                                {CONCURRENCY_OPTIONS.map((val) => (
                                    <button
                                        key={val}
                                        type="button"
                                        className={`size-6 rounded text-center text-xs font-medium ${
                                            table.concurrency === val ? "bg-purple-600 text-white" : "hover:bg-black/5 dark:hover:bg-white/10 text-stone-500"
                                        }`}
                                        onClick={() => onPatchTable({ concurrency: val })}
                                    >
                                        {val}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <span className="shrink-0 text-xs tabular-nums" style={{ color: theme.node.muted }}>
                            完成配音 {completedCount}/{table.rows.length}
                        </span>
                    </div>

                    {/* 右侧动作操作栏 */}
                    {!readOnly && (
                        <div className="ml-auto flex shrink-0 items-center gap-2" onPointerDown={(event) => event.stopPropagation()}>
                            <Tooltip title="增量同步画布连线与素材">
                                <Button size="small" type="text" icon={<Rows3 className="size-3.5" />} onClick={onFillRows}>
                                    同步连线
                                </Button>
                            </Tooltip>
                            <Button size="small" type="text" icon={<Plus className="size-3.5" />} onClick={onAddRow}>
                                添加分镜
                            </Button>

                            {/* 一键改写全部分镜文案 */}
                            <Tooltip title="基于独立专业口播Prompt，一键改写全部分镜文案，字数严格在 ±2 汉字以内">
                                <Button
                                    size="small"
                                    icon={batchRewriting ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-amber-500" />}
                                    disabled={batchRewriting || !table.rows.length}
                                    onClick={handleBatchRewriteAll}
                                >
                                    {batchRewriting ? "正在改写文案..." : "✨ 全部改写文案"}
                                </Button>
                            </Tooltip>

                            {/* 一键生成配音 */}
                            <Button
                                size="small"
                                type="primary"
                                className="bg-purple-600 hover:bg-purple-500 text-white border-none shadow-sm"
                                icon={<Volume2 className="size-3.5" />}
                                disabled={!unfinishedReadyCount}
                                onClick={() => onGenerateVoice?.()}
                            >
                                合成配音音频{unfinishedReadyCount ? ` · ${unfinishedReadyCount}` : ""}
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* 表格内容区域 */}
            <div
                ref={scrollContainerRef}
                data-canvas-wheel-scroll
                data-canvas-no-drag
                className="thin-scrollbar min-h-0 flex-1 overflow-y-auto rounded-b-[inherit]"
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onWheel={(event) => event.stopPropagation()}
            >
                {/* 粘性表头 */}
                <div
                    className="sticky top-0 z-10 grid h-10 items-center border-b px-3 text-center text-xs font-semibold"
                    style={{ borderColor: theme.node.stroke, background: theme.node.panel, color: theme.node.muted, gridTemplateColumns }}
                >
                    <span className="min-w-0 truncate px-1">序号</span>
                    <div className="flex items-center justify-center gap-1 px-1">
                        <span className="min-w-0 truncate">参考音色</span>
                        {!readOnly && (
                            <Tooltip title={voiceSlotMode === "all" ? "当前：全部使用 (点击切换为分镜独立配置)" : "当前：分镜使用 (点击切换为全部分镜共用)"}>
                                <button
                                    type="button"
                                    className={`px-1 py-0.5 rounded text-[9px] font-normal transition-colors border leading-none ${
                                        voiceSlotMode === "all"
                                            ? "bg-purple-600/15 border-purple-500/40 text-purple-600 dark:text-purple-300"
                                            : "bg-black/5 dark:bg-white/10 border-stone-300 dark:border-stone-700 text-stone-500"
                                    }`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleVoiceSlotMode(voiceSlotMode === "all" ? "individual" : "all");
                                    }}
                                >
                                    {voiceSlotMode === "all" ? "全部" : "分镜"}
                                </button>
                            </Tooltip>
                        )}
                    </div>
                    <span className="min-w-0 truncate px-1">参考情绪</span>
                    <span className="min-w-0 truncate px-1">起止与时长</span>
                    <span className="min-w-0 truncate px-1">说话人与情绪</span>
                    <span className="min-w-0 truncate px-1">原文台词</span>
                    <span className="min-w-0 truncate px-1">改写文案 (±2字)</span>
                    <span className="min-w-0 truncate px-1 text-center">生成结果</span>
                    <span className="min-w-0 truncate px-1 text-center">操作</span>
                </div>

                {/* 行列表 */}
                {table.rows.length ? (
                    table.rows.map((row, index) => {
                        const originalLines = row.cells?.["col-lines"] || row.prompt || "";
                        const rewrittenLines = row.cells?.["col-rewrite"] || "";
                        const origCount = countScriptCharacters(originalLines);
                        const rewCount = countScriptCharacters(rewrittenLines);
                        const diff = rewCount - origCount;
                        const isRewriting = rewritingRowIds.has(row.id);

                        // 音色与情绪槽位的节点
                        const voiceNode = row.inputNodeIds?.[0] ? nodeById.get(row.inputNodeIds[0]) : undefined;
                        const toneNode = row.inputNodeIds?.[1] ? nodeById.get(row.inputNodeIds[1]) : undefined;
                        const toneText = row.cells?.["col-tone"] || "";

                        // 生成的成品配音输出节点
                        const outputAudioNode = row.outputNodeId ? nodeById.get(row.outputNodeId) : undefined;

                        return (
                            <div
                                key={row.id}
                                className="group grid items-center border-b px-3 py-3 transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.02]"
                                style={{ borderColor: theme.node.stroke, gridTemplateColumns, opacity: row.enabled ? 1 : 0.6 }}
                            >
                                {/* 1. 任务开关与序号 */}
                                <div className="flex items-center justify-center gap-1.5">
                                    {!readOnly && (
                                        <Switch
                                            size="small"
                                            checked={row.enabled}
                                            aria-label={`启用分镜 ${index + 1}`}
                                            onChange={(enabled) => onUpdateRow(row.id, { enabled })}
                                        />
                                    )}
                                    <span className="text-xs font-medium tabular-nums" style={{ color: theme.node.muted }}>
                                        {index + 1}
                                    </span>
                                </div>

                                {/* 2. 第一列插槽：“参考音色” */}
                                <div className="flex justify-center">
                                    <CreativeVoiceSlotCell
                                        node={voiceNode}
                                        tableNodeId={node.id}
                                        rowId={row.id}
                                        columnIndex={0}
                                        columnId="ref-voice"
                                        columnLabel="参考音色"
                                        rowLabel={`分镜 ${index + 1}`}
                                        label="参考音色"
                                        theme={theme}
                                        readOnly={readOnly}
                                        availableNodes={availableMediaNodes}
                                        isDraggingCell={draggingCell?.rowId === row.id && draggingCell.columnIndex === 0}
                                        isDragOver={dragOverCell?.rowId === row.id && dragOverCell.columnIndex === 0}
                                        isDragOverCopy={dragOverCell?.rowId === row.id && dragOverCell.columnIndex === 0 && dragOverCell.isCopy}
                                        onDragCellStart={(rId, colIdx) => setDraggingCell({ rowId: rId, columnIndex: colIdx })}
                                        onDragCellEnd={() => { setDraggingCell(null); setDragOverCell(null); }}
                                        onDragCellOver={(rId, colIdx, isCopy) => setDragOverCell({ rowId: rId, columnIndex: colIdx, isCopy })}
                                        onDragCellLeave={() => setDragOverCell(null)}
                                        onPickFile={() => pickAudioFile(row.id, 0)}
                                        onUploadFile={(file) => onUploadReference?.(row.id, 0, file)}
                                        onAssignReferenceNode={(refId) => handleAssignVoiceReference(row.id, 0, refId)}
                                        onCopyReferenceCell={onCopyReferenceCell}
                                        onMoveReferenceCell={onMoveReferenceCell}
                                        onClear={() => {
                                            if (voiceSlotMode === "all") {
                                                const nextRows = table.rows.map((r) => {
                                                    const nextInputs = [...(r.inputNodeIds || [])];
                                                    nextInputs[0] = "";
                                                    return { ...r, inputNodeIds: nextInputs };
                                                });
                                                onPatchTable({ rows: nextRows });
                                                message.success("已清除全部分镜参考音色");
                                            } else if (onClearReferenceCell) {
                                                onClearReferenceCell(row.id, 0);
                                            } else {
                                                const nextInputs = [...(row.inputNodeIds || [])];
                                                nextInputs[0] = "";
                                                onUpdateRow(row.id, { inputNodeIds: nextInputs });
                                            }
                                        }}
                                    />
                                </div>

                                {/* 3. 第二列插槽：“参考情绪” */}
                                <div className="flex justify-center">
                                    <CreativeVoiceSlotCell
                                        node={toneNode}
                                        tableNodeId={node.id}
                                        rowId={row.id}
                                        columnIndex={1}
                                        columnId="ref-tone"
                                        columnLabel="参考情绪"
                                        rowLabel={`分镜 ${index + 1}`}
                                        label="参考情绪"
                                        theme={theme}
                                        readOnly={readOnly}
                                        fallbackToneText={toneText}
                                        availableNodes={availableMediaNodes}
                                        isDraggingCell={draggingCell?.rowId === row.id && draggingCell.columnIndex === 1}
                                        isDragOver={dragOverCell?.rowId === row.id && dragOverCell.columnIndex === 1}
                                        isDragOverCopy={dragOverCell?.rowId === row.id && dragOverCell.columnIndex === 1 && dragOverCell.isCopy}
                                        onDragCellStart={(rId, colIdx) => setDraggingCell({ rowId: rId, columnIndex: colIdx })}
                                        onDragCellEnd={() => { setDraggingCell(null); setDragOverCell(null); }}
                                        onDragCellOver={(rId, colIdx, isCopy) => setDragOverCell({ rowId: rId, columnIndex: colIdx, isCopy })}
                                        onDragCellLeave={() => setDragOverCell(null)}
                                        onPickFile={() => pickAudioFile(row.id, 1)}
                                        onUploadFile={(file) => onUploadReference?.(row.id, 1, file)}
                                        onAssignReferenceNode={(refId) => onAssignReferenceNode?.(row.id, 1, refId)}
                                        onCopyReferenceCell={onCopyReferenceCell}
                                        onMoveReferenceCell={onMoveReferenceCell}
                                        onClear={() => {
                                            if (onClearReferenceCell) {
                                                onClearReferenceCell(row.id, 1);
                                            } else {
                                                const nextInputs = [...(row.inputNodeIds || [])];
                                                nextInputs[1] = "";
                                                onUpdateRow(row.id, { inputNodeIds: nextInputs });
                                            }
                                            message.success("已清除当前参考情绪音频");
                                        }}
                                    />
                                </div>

                                {/* 4. 起止与时长 (单框上下两行换行展示) */}
                                <div className="px-1 text-center">
                                    <textarea
                                        value={formatVoiceTimeDisplay(row.cells?.["col-time"])}
                                        readOnly={readOnly}
                                        rows={2}
                                        aria-label={`分镜 ${index + 1} 起止与时长`}
                                        className="w-full resize-none rounded border px-1 py-1.5 text-center font-mono text-xs leading-snug outline-none transition-colors focus:ring-1 focus:ring-purple-500/50"
                                        style={{
                                            background: inputSurface,
                                            borderColor: theme.node.stroke,
                                            color: theme.node.text,
                                            height: "48px",
                                        }}
                                        onChange={(e) => onUpdateRow(row.id, { cells: { ...(row.cells || {}), "col-time": e.target.value } })}
                                    />
                                </div>

                                {/* 5. 说话人与情绪 (合并列，上下两行展示) */}
                                <div className="flex flex-col gap-1.5 px-2">
                                    <div className="flex items-center gap-1">
                                        <span className="text-[11px] font-medium text-purple-600 dark:text-purple-400 shrink-0">👤 角色:</span>
                                        <input
                                            value={row.cells?.["col-speaker"] || ""}
                                            readOnly={readOnly}
                                            aria-label={`分镜 ${index + 1} 说话人角色`}
                                            className="h-6 min-w-0 flex-1 rounded border px-1.5 text-xs outline-none"
                                            style={{ background: inputSurface, borderColor: theme.node.stroke, color: theme.node.text }}
                                            onChange={(e) => {
                                                const speaker = e.target.value;
                                                const tone = row.cells?.["col-tone"] || "";
                                                onUpdateRow(row.id, {
                                                    cells: {
                                                        ...(row.cells || {}),
                                                        "col-speaker": speaker,
                                                        "col-speaker-tone": `${speaker} | ${tone}`,
                                                    },
                                                });
                                            }}
                                        />
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 shrink-0">🎭 情绪:</span>
                                        <input
                                            value={row.cells?.["col-tone"] || ""}
                                            readOnly={readOnly}
                                            aria-label={`分镜 ${index + 1} 情绪与语调`}
                                            className="h-6 min-w-0 flex-1 rounded border px-1.5 text-xs outline-none"
                                            style={{ background: inputSurface, borderColor: theme.node.stroke, color: theme.node.text }}
                                            onChange={(e) => {
                                                const tone = e.target.value;
                                                const speaker = row.cells?.["col-speaker"] || "";
                                                onUpdateRow(row.id, {
                                                    cells: {
                                                        ...(row.cells || {}),
                                                        "col-tone": tone,
                                                        "col-speaker-tone": `${speaker} | ${tone}`,
                                                    },
                                                });
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* 6. 原文台词 */}
                                <div className="px-2">
                                    <textarea
                                        value={originalLines}
                                        readOnly={readOnly}
                                        aria-label={`分镜 ${index + 1} 原文台词`}
                                        className="thin-scrollbar h-[110px] w-full resize-none rounded-lg border px-2.5 py-2 text-xs leading-relaxed outline-none focus-visible:ring-1"
                                        style={{ background: inputSurface, borderColor: theme.node.stroke, color: theme.node.text }}
                                        placeholder="填写原文分镜台词..."
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            onUpdateRow(row.id, {
                                                cells: { ...(row.cells || {}), "col-lines": val },
                                                prompt: val,
                                            });
                                        }}
                                    />
                                    <div className="mt-0.5 text-[10px] text-stone-400 text-right pr-1">
                                        原文 {origCount} 字
                                    </div>
                                </div>

                                {/* 7. 改写文案 (附带独立Prompt一键改写按钮，严格 ±2 字) */}
                                <div className="flex flex-col gap-1 px-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1">
                                            {rewrittenLines ? (
                                                <span
                                                    className={`rounded px-1.5 py-0.2 text-[10px] font-medium ${
                                                        Math.abs(diff) <= 2
                                                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                                    }`}
                                                >
                                                    改写 {rewCount} 字 (差 {diff > 0 ? `+${diff}` : diff} 字)
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-stone-400">未改写 (留空则使用原文)</span>
                                            )}
                                        </div>
                                        {!readOnly && (
                                            <Button
                                                size="small"
                                                className="h-6 px-2 text-[11px] border-purple-500/40 text-purple-600 hover:text-purple-700 hover:border-purple-600"
                                                icon={isRewriting ? <LoaderCircle className="size-3 animate-spin" /> : <Sparkles className="size-3 text-amber-500" />}
                                                disabled={isRewriting || !originalLines.trim()}
                                                onClick={() => handleRewriteRow(row)}
                                            >
                                                {isRewriting ? "改写中..." : "✨ 改写文案"}
                                            </Button>
                                        )}
                                    </div>
                                    <textarea
                                        value={rewrittenLines}
                                        readOnly={readOnly}
                                        aria-label={`分镜 ${index + 1} 改写文案`}
                                        className="thin-scrollbar h-[86px] w-full resize-none rounded-lg border px-2.5 py-2 text-xs leading-relaxed outline-none focus-visible:ring-1 focus-visible:ring-purple-500/50"
                                        style={{ background: inputSurface, borderColor: theme.node.stroke, color: theme.node.text }}
                                        placeholder="点击上方「改写文案」一键优化口播台词，或直接手动编辑..."
                                        onChange={(e) => onUpdateRow(row.id, { cells: { ...(row.cells || {}), "col-rewrite": e.target.value } })}
                                    />
                                </div>

                                {/* 8. 生成结果：音频播放卡片 */}
                                <div className="flex justify-center px-1">
                                    {outputAudioNode ? (
                                        <VoiceResultPlayer
                                            node={outputAudioNode}
                                            theme={theme}
                                            onFocus={() => {
                                                if (row.outputNodeId) onFocusOutput?.(row.outputNodeId);
                                            }}
                                        />
                                    ) : (
                                        <div className="flex size-20 flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-2 text-stone-400 text-center select-none">
                                            <Mic className="size-5 opacity-40 mb-1" />
                                            <span className="text-[10px]">待生成配音</span>
                                        </div>
                                    )}
                                </div>

                                {/* 9. 操作列：生成配音与删除 */}
                                {!readOnly && (
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <Tooltip title={outputAudioNode ? "重新合成配音音频" : "生成当前分镜配音音频"}>
                                            <Button
                                                type={outputAudioNode ? "default" : "primary"}
                                                size="small"
                                                className={`size-7 p-0 flex items-center justify-center ${
                                                    outputAudioNode
                                                        ? "border-purple-500/50 text-purple-600 hover:text-purple-700"
                                                        : "bg-purple-600 hover:bg-purple-500 text-white border-none shadow-sm"
                                                }`}
                                                icon={<Volume2 className="size-3.5" />}
                                                onClick={() => onGenerateVoice?.([row.id])}
                                            />
                                        </Tooltip>
                                        <Tooltip title="删除当前分镜行">
                                            <Button
                                                type="text"
                                                size="small"
                                                danger
                                                className="size-7 p-0 flex items-center justify-center opacity-60 hover:opacity-100"
                                                icon={<Trash2 className="size-3.5" />}
                                                onClick={() => onRemoveRow(row.id)}
                                            />
                                        </Tooltip>
                                    </div>
                                )}
                            </div>
                        );
                    })
                ) : (
                    <div className="grid min-h-44 place-items-center px-5 text-center">
                        <div className="flex max-w-sm flex-col items-center gap-2">
                            <div className="grid size-10 place-items-center rounded-xl bg-purple-500/10 text-purple-600">
                                <Mic className="size-5" />
                            </div>
                            <div className="font-medium">还没有配音任务</div>
                            <p className="m-0 leading-5 text-xs" style={{ color: theme.node.muted }}>
                                从左侧连接编导脚本生成，或点击下方添加第一条分镜。
                            </p>
                            {!readOnly && (
                                <Button size="small" icon={<Plus className="size-3.5" />} onClick={onAddRow}>
                                    添加第一条分镜
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function VoiceResultPlayer({
    node,
    theme,
    onFocus,
}: {
    node: CanvasNodeData;
    theme: CanvasTheme;
    onFocus: () => void;
}) {
    const subscribe = useCallback((listener: () => void) => subscribeCanvasAudioNode(node?.id, listener), [node?.id]);
    const getSnapshot = useCallback(() => getCanvasAudioPlaybackSnapshot(node?.id), [node?.id]);
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    const isPlaying = snapshot.phase === "playing";
    const isLoading = snapshot.phase === "loading";
    const durationMs = snapshot.durationMs || node.metadata?.durationMs || 0;

    const source: CanvasAudioSource = useMemo(
        () => ({
            nodeId: node.id,
            content: node.metadata?.content || "",
            storageKey: node.metadata?.storageKey,
            mimeType: node.metadata?.mimeType || "audio/mp3",
            durationMs,
        }),
        [durationMs, node.id, node.metadata?.content, node.metadata?.mimeType, node.metadata?.storageKey]
    );

    const formatTime = (ms: number) => {
        if (!Number.isFinite(ms) || ms <= 0) return "00:00";
        const sec = Math.floor(ms / 1000);
        return `${Math.floor(sec / 60).toString().padStart(2, "0")}:${(sec % 60).toString().padStart(2, "0")}`;
    };

    return (
        <div
            className="flex size-20 flex-col items-center justify-between rounded-xl bg-purple-950/80 border border-purple-500/40 p-1.5 text-white shadow-sm cursor-pointer hover:border-purple-400 transition-colors"
            onClick={onFocus}
        >
            <div className="flex w-full items-center justify-between text-[8px] text-purple-300">
                <span className="truncate max-w-[46px]">成品配音</span>
                <span>{durationMs ? formatTime(durationMs) : "--:--"}</span>
            </div>
            <button
                type="button"
                className={`grid size-7 place-items-center rounded-full shadow ${
                    isPlaying ? "bg-purple-500 text-white animate-pulse" : "bg-purple-600 hover:bg-purple-500 text-white"
                }`}
                onClick={(e) => {
                    e.stopPropagation();
                    void toggleCanvasAudio(source);
                }}
            >
                {isLoading ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                ) : isPlaying ? (
                    <Pause className="size-3.5 fill-white" />
                ) : (
                    <Play className="size-3.5 fill-white ml-0.5" />
                )}
            </button>
            <span className="text-[8px] text-purple-300/80 truncate">{isPlaying ? "正在播放" : "点击试听"}</span>
        </div>
    );
}
