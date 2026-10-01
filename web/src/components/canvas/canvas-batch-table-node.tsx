import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Button, Dropdown, Modal, Switch, Tooltip, message, type MenuProps } from "antd";
import { ArrowLeftRight, BookmarkPlus, ClipboardPaste, Copy, ExternalLink, Film, FileText, Image as ImageIcon, Layers, LoaderCircle, Maximize2, Mic, Minus, Pause, Play, Plus, Rows3, Sparkles, Trash2, Upload, User, Video, Volume2, ZoomIn } from "lucide-react";

import { copyBatchReference, getBatchReferenceClipboard, useBatchReferenceClipboard } from "@/lib/canvas/batch-reference-clipboard";

import { CachedResourceImage } from "@/components/cached-resource-image";
// @opc-feature: creative-prompt-templates [start]
import { PromptTemplateModal } from "@/components/prompts/prompt-template-modal";
// @opc-feature: creative-prompt-templates [end]
// @opc-feature: batch-table-mention-preview [start]
import { peekCachedResourceObjectUrl } from "@/services/resource-blob-cache";
import { resolveResourceUrl } from "@/services/api/resources";
import { canvasNodeVideoPreviewUrl } from "@/lib/canvas/canvas-media-preview";
// @opc-feature: batch-table-mention-preview [end]
import { useCanvasNodeActions } from "./canvas-node-action-context";
import { CREATIVE_VOICE_TABLE_NODE_TYPE } from "@/extensions/creative-voice-table/contracts";
import { IDLE_AUDIO_SNAPSHOT, getCanvasAudioPlaybackSnapshot, subscribeCanvasAudioNode, toggleCanvasAudio } from "@/services/canvas-audio-playback";
import { CanvasResourceMentionTextarea } from "@/components/canvas/canvas-resource-mention-textarea";
import {
    BATCH_REFERENCE_HANDLE_GAP,
    BATCH_REFERENCE_HANDLE_TOP,
    MAX_BATCH_REFERENCE_COLUMNS,
    MIN_BATCH_REFERENCE_COLUMNS,
    batchPromptForRow,
    batchReferenceColumns,
    batchReferenceHandleId,
    batchReferenceMentionToken,
    batchTextColumns,
    batchRowReady as rowReady,
} from "@/lib/canvas/canvas-batch-table";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import type { CanvasTheme } from "@/lib/canvas-theme";
import { CanvasNodeType, type CanvasBatchOperation, type CanvasBatchRow, type CanvasBatchTableData, type CanvasConnection, type CanvasGenerationBatch, type CanvasGenerationBatchItem, type CanvasNodeData } from "@/types/canvas";

type ReferenceCell = { rowId: string; columnIndex: number };
type PreviewModalState = {
    open: boolean;
    title: string;
    type: "script" | "video" | "image";
    content: string;
    url?: string;
    rowId?: string;
};

type Props = {
    node: CanvasNodeData;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    batch?: CanvasGenerationBatch;
    theme: CanvasTheme;
    onPatchTable: (patch: Partial<CanvasBatchTableData>) => void;
    onAddRow: () => void;
    onRemoveRow: (rowId: string) => void;
    onUpdateRow: (rowId: string, patch: Partial<CanvasBatchRow>) => void;
    onFillRows: () => void;
    onGenerate: (rowIds?: string[]) => void;
    onGenerateVideos?: (rowIds?: string[]) => void;
    onCreateStoryboard?: () => void;
    onRetryItem: (batchId: string, itemId: string) => void;
    onAddReferenceColumn: () => void;
    onRemoveReferenceColumn?: () => void;
    onFocusOutput?: (nodeId: string) => void;
    onReorderReferenceColumns?: (fromColumnId: string, toColumnId: string) => void;
    onMoveReferenceCell?: (sourceRowId: string, sourceColumnIndex: number, targetRowId: string, targetColumnIndex: number) => void;
    // @opc-feature: batch-table-slot-operations [start]
    onCopyReferenceCell?: (sourceRowId: string, sourceColumnIndex: number, targetRowId: string, targetColumnIndex: number) => void;
    onAssignReferenceNode?: (rowId: string, columnIndex: number, referenceNodeId: string) => void;
    onClearReferenceCell?: (rowId: string, columnIndex: number) => void;
    // @opc-feature: batch-table-slot-operations [end]
    onUploadReference?: (rowId: string, columnIndex: number, file: File) => void;
    onConnectStart: (event: ReactPointerEvent, handleId: string) => void;
    onConnectDrop?: (event: ReactPointerEvent, handleId: string) => void;
    // @opc-feature: batch-table-auto-height [start]
    onAutoHeightChange?: (height: number) => void;
    onResetManualSize?: () => void;
    // @opc-feature: batch-table-auto-height [end]
    readOnly?: boolean;
};

const OPERATION_OPTIONS = [
    { value: "try_on", label: "批量换装" },
    { value: "creative", label: "创意生图" },
] satisfies Array<{ value: CanvasBatchOperation; label: string }>;

const CONCURRENCY_OPTIONS = [1, 5, 10] as const;

export function CanvasBatchTableNodeContent({ node, nodes, connections, batch, theme, onPatchTable, onAddRow, onRemoveRow, onUpdateRow, onFillRows, onGenerate, onGenerateVideos, onCreateStoryboard, onRetryItem, onAddReferenceColumn, onRemoveReferenceColumn, onReorderReferenceColumns, onMoveReferenceCell, onCopyReferenceCell, onAssignReferenceNode, onClearReferenceCell, onUploadReference, onFocusOutput, onConnectStart, onConnectDrop, onAutoHeightChange, onResetManualSize, readOnly = false }: Props) {
    const table = node.metadata?.batchTable || { operation: "try_on" as const, concurrency: 10, rows: [] };
    // @opc-feature: storyboard-clean-reference-columns [start]
    const isStoryboardTable = table.contentKind === "storyboard" || Boolean(node.title?.includes("创意分镜表"));
    const rawReferenceColumns = batchReferenceColumns(table);
    const referenceColumns = useMemo(() => {
        if (isStoryboardTable) {
            return rawReferenceColumns.filter((col) => !col.id.startsWith("ref-asset-"));
        }
        return rawReferenceColumns;
    }, [isStoryboardTable, rawReferenceColumns]);
    // @opc-feature: storyboard-clean-reference-columns [end]
    const textColumns = batchTextColumns(table);
    const globalPrompt = table.globalPrompt || "";
    const hasGlobalPrompt = Boolean(globalPrompt.trim());
    // @opc-feature: creative-prompt-templates [start]
    const [promptTemplateModalOpen, setPromptTemplateModalOpen] = useState(false);
    const [promptTemplateModalMode, setPromptTemplateModalMode] = useState<"select" | "save">("select");
    // @opc-feature: creative-prompt-templates [end]
    const nodeById = useMemo(() => new Map(nodes.map((item) => [item.id, item])), [nodes]);
    const batchItemByRowId = useMemo(() => new Map((batch?.items || []).map((item) => [item.rowId, item])), [batch?.items]);
    const connectedImageCount = useMemo(() => new Set(connections.filter((connection) => connection.toNodeId === node.id && connection.relation !== "batch-output").map((connection) => connection.fromNodeId)).size, [connections, node.id]);

    const toolbarRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // @opc-feature: batch-table-auto-height [start]
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
                const toolbarHeight = toolbarRef.current?.offsetHeight || 80;
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
    // @opc-feature: batch-table-auto-height [end]
    const completed = table.rows.filter((row) => hasNodeMedia(row.outputNodeId ? nodeById.get(row.outputNodeId) : undefined) || hasNodeMedia(row.videoOutputNodeId ? nodeById.get(row.videoOutputNodeId) : undefined)).length;
    const unfinishedReadyCount = table.rows.filter((row) => rowReady(row, table, nodeById) && !hasNodeMedia(row.outputNodeId ? nodeById.get(row.outputNodeId) : undefined)).length;
    const textColumnsTemplate = textColumns
        .map((col) => (col.id === "col-time" || col.label === "时间区间" || col.label === "时间与镜头形态" ? "152px" : "minmax(180px, 0.75fr)"))
        .join(" ");
    // @opc-feature: storyboard-video-controls-guard [start]
    const isStoryboard = isStoryboardTable;
    const showVideoButtons = Boolean(isStoryboard && onGenerateVideos);
    const resultColWidth = showVideoButtons ? "224px" : "120px";
    const actionColWidth = showVideoButtons ? "132px" : "96px";
    // @opc-feature: storyboard-video-controls-guard [end]
    const gridTemplateColumns = `72px repeat(${referenceColumns.length}, 116px) ${textColumns.length ? `${textColumnsTemplate} ` : ""}minmax(260px, 1fr) ${resultColWidth} ${actionColWidth}`;
    // @opc-feature: batch-table-slot-canvas-picker [start]
    const availableMediaNodes = useMemo(() => {
        return nodes.filter((n) => {
            if (n.id === node.id) return false;
            if (n.type === CanvasNodeType.BatchTable || n.type === "standard_batch_table") return false;
            return (
                n.type === CanvasNodeType.Image ||
                n.type === CanvasNodeType.Video ||
                n.type === CanvasNodeType.Text ||
                n.type === CanvasNodeType.Script ||
                Boolean(n.metadata?.previewContent || n.metadata?.content || n.metadata?.storageKey)
            );
        });
    }, [nodes, node.id]);
    // @opc-feature: batch-table-slot-canvas-picker [end]
    const { focusNode } = useCanvasNodeActions();
    const subtleSurface = `color-mix(in srgb, ${theme.node.text} 4%, transparent)`;
    const inputSurface = theme.node.panel;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetRef = useRef<ReferenceCell | null>(null);

    // @opc-feature: storyboard-slot-dynamic-resolution [start]
    const connectedMasterNode = useMemo(() => {
        const conn = connections.find(
            (c) => c.toNodeId === node.id && (c.toHandleId === "batch-reference:ref-master-slots" || c.toHandleId === "ref-master-slots"),
        );
        if (conn) {
            const found = nodeById.get(conn.fromNodeId);
            if (found) return found;
        }
        return nodes.find(
            (n) => n.id !== node.id && n.type === CanvasNodeType.BatchTable && n.metadata?.batchTable?.contentKind === "master-slots",
        );
    }, [connections, node.id, nodeById, nodes]);

    const connectedVoiceNode = useMemo(() => {
        const conn = connections.find(
            (c) => c.toNodeId === node.id && (c.toHandleId === "batch-reference:ref-voiceover" || c.toHandleId === "ref-voiceover"),
        );
        if (conn) {
            const found = nodeById.get(conn.fromNodeId);
            if (found) return found;
        }
        return nodes.find(
            (n) => n.id !== node.id && (n.type === CREATIVE_VOICE_TABLE_NODE_TYPE || n.metadata?.batchTable?.contentKind === "voiceover"),
        );
    }, [connections, node.id, nodeById, nodes]);

    const connectedScriptNode = useMemo(() => {
        const conn = connections.find(
            (c) => c.toNodeId === node.id && (c.toHandleId === "batch-reference:ref-script" || c.toHandleId === "ref-script"),
        );
        if (conn) {
            const found = nodeById.get(conn.fromNodeId);
            if (found) return found;
        }
        return nodes.find(
            (n) => n.id !== node.id && (n.type === "creation_assistant_script" || n.type === "ref_script" || n.type === CanvasNodeType.Script),
        );
    }, [connections, node.id, nodeById, nodes]);
    // @opc-feature: storyboard-slot-dynamic-resolution [end]

    const [previewModal, setPreviewModal] = useState<PreviewModalState>({
        open: false,
        title: "",
        type: "script",
        content: "",
    });
    const [editableScriptText, setEditableScriptText] = useState("");
    const handleOpenPreview = useCallback((modal: PreviewModalState) => {
        setPreviewModal(modal);
        setEditableScriptText(modal.content || "");
    }, []);
    const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
    const [draggingCell, setDraggingCell] = useState<ReferenceCell | null>(null);
    const [dragOverCell, setDragOverCell] = useState<{ rowId: string; columnIndex: number; isCopy: boolean } | null>(null);
    const suppressClickRef = useRef(false);

    const pickReferenceFile = (rowId: string, columnIndex: number) => {
        if (readOnly) return;
        if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
        }
        uploadTargetRef.current = { rowId, columnIndex };
        fileInputRef.current?.click();
    };

    return (
        <div data-canvas-batch-table data-canvas-no-zoom data-canvas-wheel-scroll className="relative flex h-full w-full flex-col overflow-visible text-xs" style={{ color: theme.node.text }}>
            {!readOnly ? <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                const target = uploadTargetRef.current;
                event.currentTarget.value = "";
                uploadTargetRef.current = null;
                if (file && target) onUploadReference?.(target.rowId, target.columnIndex, file);
            }} /> : null}
            {!readOnly ? <BatchReferenceHandles columns={referenceColumns} theme={theme} onConnectStart={onConnectStart} onConnectDrop={onConnectDrop} /> : null}

            <div ref={toolbarRef} className="shrink-0 overflow-hidden rounded-t-[inherit] border-b" style={{ borderColor: theme.node.stroke, background: subtleSurface }}>
                <div data-canvas-batch-drag className="flex h-11 cursor-grab items-center gap-2 px-3 active:cursor-grabbing">
                    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden" onPointerDown={(event) => event.stopPropagation()}>
                        {table.contentKind === "master-slots" ? (
                            <div className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                                <User className="size-3.5" />
                                <span>创意资产表</span>
                            </div>
                        ) : table.contentKind === "voiceover" ? (
                            <div className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-purple-500/10 px-2.5 text-xs font-semibold text-purple-600 dark:text-purple-400">
                                <Mic className="size-3.5" />
                                <span>角色配音表</span>
                            </div>
                        ) : table.contentKind === "storyboard" ? (
                            <div className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-blue-500/10 px-2.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                                <Film className="size-3.5" />
                                <span>创意分镜表</span>
                            </div>
                        ) : (
                            <BatchChoiceGroup ariaLabel="批量任务类型" theme={theme} disabled={readOnly} options={OPERATION_OPTIONS} value={table.operation} onChange={(operation) => onPatchTable({ operation: operation as CanvasBatchOperation })} />
                        )}
                        {/* @opc-feature: batch-table-auto-height-reset [start] */}
                        {node.metadata?.manualSize && onResetManualSize && (
                            <Tooltip title="当前为手动拉伸高度，点击恢复根据内容自适应拉高">
                                <button
                                    type="button"
                                    onClick={onResetManualSize}
                                    className="flex h-7 items-center gap-1 rounded px-2 text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                                >
                                    <Maximize2 className="size-3" />
                                    <span>自适应高度</span>
                                </button>
                            </Tooltip>
                        )}
                        {/* @opc-feature: batch-table-auto-height-reset [end] */}
                        <div className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2" style={{ background: theme.node.panel }}>
                            <span className="font-medium" style={{ color: theme.node.muted }}>并发</span>
                            <BatchChoiceGroup ariaLabel="并发数" theme={theme} disabled={readOnly} compact options={CONCURRENCY_OPTIONS.map((value) => ({ value, label: String(value) }))} value={table.concurrency} onChange={(concurrency) => onPatchTable({ concurrency: Number(concurrency) })} />
                        </div>
                        <div className="flex h-8 shrink-0 items-center gap-0.5 rounded-lg px-2" style={{ background: theme.node.panel, color: theme.node.muted }}>
                            <span className="pr-1">{referenceColumns.length}/{MAX_BATCH_REFERENCE_COLUMNS} 组参考</span>
                            {!readOnly ? (
                                <>
                                    <Tooltip title={referenceColumns.length <= MIN_BATCH_REFERENCE_COLUMNS ? "至少保留 1 组参考图" : "减少一组参考图"}>
                                        <button type="button" aria-label="减少一组参考图" className="grid size-5 place-items-center rounded-md transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-1 dark:hover:bg-white/10" style={{ color: theme.node.text }} disabled={referenceColumns.length <= MIN_BATCH_REFERENCE_COLUMNS} onClick={onRemoveReferenceColumn}>
                                            <Minus className="size-3.5" />
                                        </button>
                                    </Tooltip>
                                    <Tooltip title={referenceColumns.length >= MAX_BATCH_REFERENCE_COLUMNS ? `最多支持 ${MAX_BATCH_REFERENCE_COLUMNS} 组参考图` : `新增参考图 ${referenceColumns.length + 1}`}>
                                        <button type="button" aria-label={`新增参考图 ${referenceColumns.length + 1}`} className="grid size-5 place-items-center rounded-md transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-1 dark:hover:bg-white/10" style={{ color: theme.node.text }} disabled={referenceColumns.length >= MAX_BATCH_REFERENCE_COLUMNS} onClick={onAddReferenceColumn}>
                                            <Plus className="size-3.5" />
                                        </button>
                                    </Tooltip>
                                </>
                            ) : null}
                        </div>
                        <span className="shrink-0 tabular-nums" style={{ color: theme.node.muted }}>已连 {connectedImageCount} · 完成 {completed}/{table.rows.length}</span>
                    </div>
                    {!readOnly ? (
                        <div className="ml-auto flex shrink-0 items-center gap-1.5" onPointerDown={(event) => event.stopPropagation()}>
                            <Tooltip title="增量同步画布连线，不会删除已有任务行">
                                <Button size="small" type="text" icon={<Rows3 className="size-3.5" />} onClick={onFillRows}>同步连线</Button>
                            </Tooltip>
                            <Button size="small" type="text" icon={<Plus className="size-3.5" />} onClick={onAddRow}>添加任务</Button>
                            {table.contentKind === "storyboard" && onCreateStoryboard ? <Button size="small" icon={<Film className="size-3.5" />} onClick={onCreateStoryboard}>创建视频脚本</Button> : null}
                            {/* @opc-feature: storyboard-video-controls-guard [start] */}
                            {showVideoButtons ? (
                                <div className="flex items-center gap-1.5">
                                    <Button size="small" icon={<ImageIcon className="size-3.5 text-blue-500" />} disabled={!unfinishedReadyCount} onClick={() => onGenerate()}>
                                        生成首帧图{unfinishedReadyCount ? ` · ${unfinishedReadyCount}` : ""}
                                    </Button>
                                    <Button size="small" type="primary" className="bg-violet-600 hover:bg-violet-500 text-white border-none shadow-sm" icon={<Film className="size-3.5" />} disabled={!table.rows.length} onClick={() => onGenerateVideos?.()}>
                                        生成镜头视频
                                    </Button>
                                </div>
                            ) : (
                                <Button size="small" type="primary" icon={<Play className="size-3.5" />} disabled={!unfinishedReadyCount} onClick={() => onGenerate()}>
                                    {table.contentKind === "master-slots" ? "生成创意资产" : table.contentKind === "voiceover" ? "合成配音音频" : "生成未完成项"}{unfinishedReadyCount ? ` · ${unfinishedReadyCount}` : ""}
                                </Button>
                            )}
                            {/* @opc-feature: storyboard-video-controls-guard [end] */}
                        </div>
                    ) : null}
                </div>
                <div className="flex h-9 items-center gap-2 border-t px-3" style={{ borderColor: theme.node.stroke }}>
                    <span className="shrink-0 font-medium" style={{ color: theme.node.muted }}>全局提示词</span>
                    <input
                        value={globalPrompt}
                        readOnly={readOnly}
                        placeholder="填写后覆盖各任务提示词，留空则使用每行自己的提示词"
                        aria-label="全局提示词"
                        className="h-8 min-w-0 flex-1 rounded-md border px-3 text-sm outline-none"
                        style={{ background: inputSurface, borderColor: theme.node.stroke, color: theme.node.text }}
                        onChange={(event) => onPatchTable({ globalPrompt: event.target.value })}
                    />
                    {/* @opc-feature: creative-prompt-templates [start] */}
                    <Tooltip title="打开提示词模板库">
                        <button
                            type="button"
                            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
                            style={{ color: theme.node.text }}
                            onClick={() => {
                                setPromptTemplateModalMode("select");
                                setPromptTemplateModalOpen(true);
                            }}
                        >
                            <Sparkles className="size-3 text-amber-500" />
                            <span className="text-[var(--fs-tiny)]">模板库</span>
                        </button>
                    </Tooltip>
                    <Tooltip title="将全局提示词保存为模板">
                        <button
                            type="button"
                            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
                            style={{ color: theme.node.text }}
                            onClick={() => {
                                setPromptTemplateModalMode("save");
                                setPromptTemplateModalOpen(true);
                            }}
                        >
                            <BookmarkPlus className="size-3 text-amber-500" />
                            <span className="text-[var(--fs-tiny)]">存为模板</span>
                        </button>
                    </Tooltip>
                    {/* @opc-feature: creative-prompt-templates [end] */}
                </div>
            </div>

            {/* @opc-feature: batch-table-scroll-container [start] */}
            <div
                ref={scrollContainerRef}
                data-canvas-wheel-scroll
                data-canvas-no-drag
                className="thin-scrollbar min-h-0 flex-1 overflow-y-auto rounded-b-[inherit]"
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onWheel={(event) => event.stopPropagation()}
            >
            {/* @opc-feature: batch-table-scroll-container [end] */}
                <div className="sticky top-0 z-10 grid h-10 items-center border-b px-3 text-center text-sm font-semibold" style={{ borderColor: theme.node.stroke, background: theme.node.panel, color: theme.node.muted, gridTemplateColumns }}>
                    <span className="min-w-0 truncate px-1">任务</span>
                    {referenceColumns.map((column) => (
                        <span
                            key={column.id}
                            draggable={!readOnly}
                            title={column.label}
                            className="min-w-0 cursor-grab truncate px-1 active:cursor-grabbing"
                            style={{ opacity: draggingColumnId === column.id ? 0.45 : 1 }}
                            onDragStart={(event) => {
                                setDraggingColumnId(column.id);
                                event.dataTransfer.setData("application/x-batch-column", column.id);
                                event.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => setDraggingColumnId(null)}
                            onDragOver={(event) => {
                                if (event.dataTransfer.types.includes("application/x-batch-column")) {
                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = "move";
                                }
                            }}
                            onDrop={(event) => {
                                event.preventDefault();
                                const columnId = event.dataTransfer.getData("application/x-batch-column") || draggingColumnId;
                                if (columnId && columnId !== column.id) onReorderReferenceColumns?.(columnId, column.id);
                                setDraggingColumnId(null);
                            }}
                        >
                            {column.label}
                        </span>
                    ))}
                    {textColumns.map((column) => <span key={column.id} className="min-w-0 truncate px-1" title={column.label}>{column.label}</span>)}
                    <span className="min-w-0 truncate px-1">
                        {table.contentKind === "storyboard"
                            ? "创意提示词"
                            : table.contentKind === "master-slots"
                              ? "母版视觉Prompt"
                              : table.contentKind === "voiceover"
                                ? "配音播报文本"
                                : "任务提示词"}
                    </span>
                    <span className="min-w-0 truncate px-1 text-center">生成结果</span>
                    <span className="min-w-0 truncate px-1 text-center">操作</span>
                </div>

                {table.rows.length ? (
                    table.rows.map((row, index) => {
                        const output = row.outputNodeId ? nodeById.get(row.outputNodeId) : undefined;
                        const videoOutput = row.videoOutputNodeId ? nodeById.get(row.videoOutputNodeId) : undefined;
                        const item = batchItemByRowId.get(row.id);
                        const status = row.enabled ? rowStatus(item, output) : { label: "已停用", tone: "idle" as const, loading: false, retryable: false };
                        const ready = rowReady(row, table, nodeById);
                        const hasImageOutput = Boolean(output && hasNodeMedia(output));
                        const hasVideoOutput = Boolean(videoOutput && hasNodeMedia(videoOutput));
                        const baseReferences = batchRowMentionReferences(row, referenceColumns, nodeById);
                        // @opc-feature: storyboard-mention-enriched-references [start]
                        const rowReferences = (() => {
                            if (!isStoryboard) return baseReferences;
                            const additionalRefs: CanvasResourceReference[] = [];
                            const seenTokens = new Set<string>();
                            baseReferences.forEach((r) => {
                                if (r.mentionToken) seenTokens.add(r.mentionToken);
                            });

                            // 1. 创意资产表中的所有实体槽位（主角、商品、场景等）
                            if (connectedMasterNode) {
                                const masterTable = connectedMasterNode.metadata?.batchTable as CanvasBatchTableData | undefined;
                                (masterTable?.rows || []).forEach((mRow) => {
                                    const rawName = mRow.cells?.["col-slot-name"] || "";
                                    const isActor = rawName.includes("人物") || rawName.includes("角色") || mRow.id.includes("actor");
                                    const isProduct = rawName.includes("商品") || rawName.includes("产品") || mRow.id.includes("product");
                                    const isScene = rawName.includes("场景") || rawName.includes("背景") || mRow.id.includes("scene");
                                    const cleanedName = rawName.replace(/^[\p{Emoji}\s]+/u, "").replace(/\s*\([^)]*\)$/, "").trim();
                                    const generatedNode = mRow.outputNodeId ? nodeById.get(mRow.outputNodeId) : undefined;
                                    const refNode = mRow.inputNodeIds?.[0] ? nodeById.get(mRow.inputNodeIds[0]) : undefined;
                                    const isGenerated = Boolean(generatedNode && hasNodeMedia(generatedNode));
                                    const activeNode = (isGenerated ? generatedNode : refNode) || generatedNode || refNode;
                                    const storageKey = activeNode?.metadata?.storageKey;
                                    const memoryUrl = storageKey ? peekCachedResourceObjectUrl(storageKey) : "";
                                    const rawUrl = activeNode?.metadata?.previewContent || activeNode?.metadata?.content;
                                    const previewUrl = memoryUrl || rawUrl || (storageKey ? resolveResourceUrl(storageKey) : undefined);
                                    const kind = isActor ? ("character" as const) : ("image" as const);

                                    const addRefWithToken = (tokenName: string) => {
                                        const token = `@${tokenName}`;
                                        if (seenTokens.has(token)) return;
                                        seenTokens.add(token);
                                        additionalRefs.push({
                                            id: `master:${mRow.id}:${tokenName}`,
                                            nodeId: activeNode?.id || connectedMasterNode.id,
                                            kind,
                                            label: tokenName,
                                            title: `${rawName || tokenName} · 创意资产素材`,
                                            previewUrl,
                                            storageKey,
                                            mentionToken: token,
                                            active: true,
                                        });
                                    };

                                    if (cleanedName) addRefWithToken(cleanedName);
                                    if (isActor) addRefWithToken("出镜主角");
                                    if (isProduct) addRefWithToken("核心商品");
                                    if (isScene) addRefWithToken("主体场景");
                                });
                            }

                            // 2. 直连或可用的媒体素材（图片/视频）
                            availableMediaNodes.forEach((mNode, idx) => {
                                const isVideo = mNode.type === CanvasNodeType.Video || Boolean(mNode.metadata?.mimeType?.startsWith("video/"));
                                const storageKey = mNode.metadata?.storageKey;
                                const memoryUrl = storageKey ? peekCachedResourceObjectUrl(storageKey) : "";
                                const rawUrl = mNode.metadata?.previewContent || mNode.metadata?.content;
                                const previewUrl = memoryUrl || rawUrl || (storageKey ? resolveResourceUrl(storageKey) : undefined);
                                const name = mNode.title || (isVideo ? `视频${idx + 1}` : `图片${idx + 1}`);
                                const token = `@${name}`;
                                if (!seenTokens.has(token)) {
                                    seenTokens.add(token);
                                    additionalRefs.push({
                                        id: `media:${mNode.id}`,
                                        nodeId: mNode.id,
                                        kind: isVideo ? "video" : "image",
                                        label: name,
                                        title: `${name} · 素材`,
                                        previewUrl,
                                        storageKey,
                                        mentionToken: token,
                                        active: true,
                                    });
                                }
                            });

                            // 3. 创意配音
                            if (connectedVoiceNode) {
                                const token = "@参考音色";
                                if (!seenTokens.has(token)) {
                                    seenTokens.add(token);
                                    additionalRefs.push({
                                        id: `voice:${connectedVoiceNode.id}`,
                                        nodeId: connectedVoiceNode.id,
                                        kind: "audio",
                                        label: "参考音色",
                                        title: "参考音色 · 创意配音素材",
                                        mentionToken: token,
                                        active: true,
                                    });
                                }
                            }

                            return [...additionalRefs, ...baseReferences];
                        })();
                        // @opc-feature: storyboard-mention-enriched-references [end]
                        const effectivePrompt = batchPromptForRow(table, row);
                        const disabledReason = status.loading ? "当前任务正在生成" : !row.enabled ? "请先启用这一行" : !effectivePrompt.trim() ? "请填写任务提示词" : table.operation === "try_on" && row.inputNodeIds.filter(Boolean).length < 2 ? "批量换装至少需要两张参考图" : !ready ? "请补齐有效参考图" : "";
                        return (
                            <div key={row.id} className="group grid items-center border-b px-3.5 py-3.5 transition-colors hover:bg-black/[.025] dark:hover:bg-white/[.025]" style={{ borderColor: theme.node.stroke, gridTemplateColumns, opacity: row.enabled ? 1 : 0.58 }}>
                                <div className="flex items-center justify-center gap-1.5">
                                    {!readOnly ? <Switch size="small" checked={row.enabled} aria-label={`启用任务 ${index + 1}`} onChange={(enabled) => onUpdateRow(row.id, { enabled })} /> : null}
                                    <span className="text-sm font-medium tabular-nums" style={{ color: theme.node.muted }}>{index + 1}</span>
                                </div>
                                {referenceColumns.map((column, columnIndex) => {
                                    // @opc-feature: storyboard-slot-dynamic-resolution [start]
                                    let cellNode = nodeById.get(row.inputNodeIds[columnIndex]);
                                    let jumpTargetNodeId: string | undefined;
                                    let jumpTooltip: string | undefined;
                                    let overrideScriptContent: string | undefined;
                                    let stackedAssets: StackedAssetItem[] = [];

                                    if (isStoryboard) {
                                        if (column.id === "ref-script" || columnIndex === 0) {
                                            overrideScriptContent = row.cells?.["col-ref-script"];
                                            if (!cellNode && connectedScriptNode) {
                                                cellNode = connectedScriptNode;
                                            }
                                            if (connectedScriptNode) {
                                                jumpTargetNodeId = connectedScriptNode.id;
                                                jumpTooltip = "点击跳转至「分镜脚本」";
                                            }
                                        } else if (column.id === "ref-master-slots" || columnIndex === 1) {
                                            if (connectedMasterNode) {
                                                jumpTargetNodeId = connectedMasterNode.id;
                                                jumpTooltip = "点击跳转至「创意资产表」";
                                                const masterTable = connectedMasterNode.metadata?.batchTable as CanvasBatchTableData | undefined;
                                                const targetEntityIdsRaw = row.cells?.["col-asset-targets"];
                                                let targetEntityIds: string[] = [];
                                                try {
                                                    if (targetEntityIdsRaw) targetEntityIds = JSON.parse(targetEntityIdsRaw);
                                                } catch {}

                                                const allMasterRows = masterTable?.rows || [];
                                                const matchedMasterRows = allMasterRows.filter((mRow) => {
                                                    if (targetEntityIds.length > 0) {
                                                        return targetEntityIds.some((tId) => mRow.id.includes(tId) || (mRow.cells?.["col-slot-name"] || "").includes(tId));
                                                    }
                                                    return true;
                                                });
                                                const effectiveMasterRows = matchedMasterRows.length > 0 ? matchedMasterRows : allMasterRows;

                                                stackedAssets = effectiveMasterRows.map((mRow) => {
                                                    const slotName = mRow.cells?.["col-slot-name"] || "创意资产";
                                                    const isActor = slotName.includes("人物") || slotName.includes("角色") || mRow.id.includes("actor");
                                                    const isProduct = slotName.includes("商品") || slotName.includes("产品") || mRow.id.includes("product");
                                                    const isScene = slotName.includes("场景") || slotName.includes("背景") || mRow.id.includes("scene");
                                                    const categoryEmoji = isActor ? "👤" : isProduct ? "📦" : isScene ? "🏠" : "🎨";
                                                    const cleanedName = slotName.replace(/^[\p{Emoji}\s]+/u, "").replace(/\s*\([^)]*\)$/, "").trim() || "资产";
                                                    const generatedNode = mRow.outputNodeId ? nodeById.get(mRow.outputNodeId) : undefined;
                                                    const refNode = mRow.inputNodeIds?.[0] ? nodeById.get(mRow.inputNodeIds[0]) : undefined;
                                                    const isGenerated = Boolean(generatedNode && hasNodeMedia(generatedNode));
                                                    const activeNode = (isGenerated ? generatedNode : refNode) || generatedNode || refNode;
                                                    const storageKey = activeNode?.metadata?.storageKey;
                                                    const memoryUrl = storageKey ? peekCachedResourceObjectUrl(storageKey) : "";
                                                    const rawUrl = activeNode?.metadata?.previewContent || activeNode?.metadata?.content;
                                                    const imageUrl = memoryUrl || rawUrl || (storageKey ? resolveResourceUrl(storageKey) : undefined);
                                                    return {
                                                        id: mRow.id,
                                                        name: cleanedName,
                                                        categoryEmoji,
                                                        node: activeNode,
                                                        imageUrl,
                                                        isGenerated,
                                                    };
                                                });

                                                if (stackedAssets.length > 0) {
                                                    cellNode = stackedAssets[0].node;
                                                }
                                            }
                                        } else if (column.id === "ref-voiceover" || columnIndex === 2) {
                                            if (connectedVoiceNode) {
                                                jumpTargetNodeId = connectedVoiceNode.id;
                                                jumpTooltip = "点击跳转至「创意配音」";
                                                const voiceTable = connectedVoiceNode.metadata?.batchTable as CanvasBatchTableData | undefined;
                                                const voiceRow = voiceTable?.rows?.[index];
                                                const generatedAudio = voiceRow?.outputNodeId ? nodeById.get(voiceRow.outputNodeId) : undefined;
                                                const refTimbre = voiceRow?.inputNodeIds?.[0] ? nodeById.get(voiceRow.inputNodeIds[0]) : undefined;
                                                if (generatedAudio && (generatedAudio.metadata?.content || generatedAudio.metadata?.storageKey || generatedAudio.metadata?.previewContent)) {
                                                    cellNode = generatedAudio;
                                                } else if (refTimbre && (refTimbre.metadata?.content || refTimbre.metadata?.storageKey || refTimbre.metadata?.previewContent)) {
                                                    cellNode = refTimbre;
                                                }
                                            }
                                        }
                                    }
                                    // @opc-feature: storyboard-slot-dynamic-resolution [end]

                                    return (
                                        <div key={column.id} className="flex justify-center">
                                            {stackedAssets.length > 1 ? (
                                                <StackedAssetThumbnail
                                                    assets={stackedAssets}
                                                    theme={theme}
                                                    readOnly={readOnly}
                                                    rowId={row.id}
                                                    tableNodeId={node.id}
                                                    onJumpToTarget={jumpTargetNodeId ? () => focusNode?.(jumpTargetNodeId!) : undefined}
                                                    jumpTooltip={jumpTooltip}
                                                    onPreview={(url, title) => handleOpenPreview({ open: true, title, type: "image", content: "", url })}
                                                />
                                            ) : (
                                                <ReferenceThumbnail
                                                    node={cellNode}
                                                    label={batchReferenceMentionToken(columnIndex)}
                                                    theme={theme}
                                                    readOnly={readOnly}
                                                    rowId={row.id}
                                                    columnIndex={columnIndex}
                                                    tableNodeId={node.id}
                                                    columnLabel={column.label}
                                                    rowLabel={`第 ${index + 1} 行`}
                                                    availableNodes={availableMediaNodes}
                                                    overrideScriptContent={overrideScriptContent}
                                                    onJumpToTarget={jumpTargetNodeId ? () => focusNode?.(jumpTargetNodeId!) : undefined}
                                                    jumpTooltip={jumpTooltip}
                                                    isDraggingCell={draggingCell?.rowId === row.id && draggingCell.columnIndex === columnIndex}
                                                    isDragOver={dragOverCell?.rowId === row.id && dragOverCell.columnIndex === columnIndex}
                                                    isDragOverCopy={dragOverCell?.rowId === row.id && dragOverCell.columnIndex === columnIndex && dragOverCell.isCopy}
                                                    onDragCellStart={(rId, colIdx) => setDraggingCell({ rowId: rId, columnIndex: colIdx })}
                                                    onDragCellEnd={() => { setDraggingCell(null); setDragOverCell(null); }}
                                                    onDragCellOver={(rId, colIdx, isCopy) => setDragOverCell({ rowId: rId, columnIndex: colIdx, isCopy })}
                                                    onDragCellLeave={() => setDragOverCell(null)}
                                                    onPickFile={() => pickReferenceFile(row.id, columnIndex)}
                                                    onUploadFile={(file) => onUploadReference?.(row.id, columnIndex, file)}
                                                    onPointerDown={(event) => event.stopPropagation()}
                                                    onPreview={handleOpenPreview}
                                                    // @opc-feature: canvas-batch-table-cell-actions [start]
                                                    onAssignReferenceNode={(referenceNodeId) => onAssignReferenceNode?.(row.id, columnIndex, referenceNodeId)}
                                                    onCopyReferenceCell={onCopyReferenceCell}
                                                    onMoveReferenceCell={onMoveReferenceCell}
                                                    onClear={() => {
                                                        if (onClearReferenceCell) {
                                                            onClearReferenceCell(row.id, columnIndex);
                                                        } else {
                                                            const nextInputs = [...(row.inputNodeIds || [])];
                                                            while (nextInputs.length <= columnIndex) nextInputs.push("");
                                                            nextInputs[columnIndex] = "";
                                                            onUpdateRow(row.id, { inputNodeIds: nextInputs });
                                                        }
                                                        message.success(`已清除 ${batchReferenceMentionToken(columnIndex)} 素材`);
                                                    }}
                                                    onCopy={async () => {
                                                        const targetNode = cellNode || nodeById.get(row.inputNodeIds[columnIndex]);
                                                        if (!targetNode) return;
                                                        const isNodeAudio = Boolean(targetNode.type === CanvasNodeType.Audio || targetNode.type === "audio" || targetNode.metadata?.mimeType?.startsWith("audio/"));
                                                        const isNodeText = !isNodeAudio && Boolean(targetNode.type === CanvasNodeType.Text || targetNode.type === "text" || targetNode.type === "ref_script" || targetNode.type === "video_reverse" || (Boolean(targetNode.metadata?.content || targetNode.metadata?.prompt) && !targetNode.metadata?.mimeType?.startsWith("image/")));
                                                        const isNodeVideo = Boolean(targetNode.type === CanvasNodeType.Video || targetNode.type === "video" || targetNode.metadata?.mimeType?.startsWith("video/"));
                                                        const textContent = (overrideScriptContent || targetNode.metadata?.content || targetNode.metadata?.prompt || targetNode.title || "") as string;
                                                        const targetMediaUrl = (targetNode.metadata?.previewContent || targetNode.metadata?.content || "") as string;

                                                        copyBatchReference({
                                                            nodeId: targetNode.id,
                                                            title: targetNode.title,
                                                            previewUrl: targetMediaUrl,
                                                            storageKey: targetNode.metadata?.storageKey,
                                                            mimeType: targetNode.metadata?.mimeType,
                                                        });

                                                        try {
                                                            if (isNodeText && textContent) {
                                                                await navigator.clipboard.writeText(textContent);
                                                                message.success(`已复制文案，可在任意插槽按 Ctrl+V 或点击粘贴`);
                                                                return;
                                                            }
                                                            if (targetMediaUrl) {
                                                                let copiedAsBlob = false;
                                                                if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write && !isNodeVideo && !isNodeAudio) {
                                                                    try {
                                                                        const res = await fetch(targetMediaUrl);
                                                                        if (res.ok) {
                                                                            const blob = await res.blob();
                                                                            const type = blob.type.startsWith("image/") ? blob.type : "image/png";
                                                                            await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
                                                                            copiedAsBlob = true;
                                                                        }
                                                                    } catch {}
                                                                }
                                                                if (!copiedAsBlob && navigator.clipboard?.writeText) {
                                                                    await navigator.clipboard.writeText(targetMediaUrl);
                                                                }
                                                            }
                                                        } catch {}
                                                        message.success(`已复制 ${targetNode.title || "素材"}，可在任意插槽按 Ctrl+V 或点击粘贴`);
                                                    }}
                                                    // @opc-feature: canvas-batch-table-cell-actions [end]
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                                {textColumns.map((column, columnIndex) => (
                                    <div key={column.id} className="min-w-0 px-2">
                                        {table.aiGenerated ? (
                                            column.id === "col-image-prompt" ? (
                                                <CanvasResourceMentionTextarea
                                                    value={row.cells?.[column.id] || ""}
                                                    references={rowReferences}
                                                    includeAssetLibrary
                                                    readOnly={readOnly}
                                                    sendOnEnter={false}
                                                    mentionMenuWidth={340}
                                                    aria-label={`任务 ${index + 1} ${column.label}`}
                                                    placeholder="输入 @ 引用创意资产或素材库..."
                                                    containerClassName="h-[120px]"
                                                    className="thin-scrollbar h-full w-full overflow-y-auto rounded-lg border px-3 py-2 text-sm leading-5 outline-none transition-shadow focus-visible:ring-2"
                                                    style={{ background: inputSurface, borderColor: theme.node.stroke, color: theme.node.text }}
                                                    onChange={(val) => onUpdateRow(row.id, { cells: { ...row.cells, [column.id]: val } })}
                                                    onWheel={(event) => event.stopPropagation()}
                                                />
                                            ) : (
                                                <textarea
                                                    aria-label={`任务 ${index + 1} ${column.label}`}
                                                    value={row.cells?.[column.id] || ""}
                                                    readOnly={readOnly}
                                                    className="thin-scrollbar h-[120px] w-full resize-none rounded-lg border px-2.5 py-2 text-sm outline-none focus-visible:ring-2"
                                                    style={{ background: inputSurface, borderColor: theme.node.stroke, color: theme.node.text }}
                                                    onChange={(event) => onUpdateRow(row.id, { cells: { ...row.cells, [column.id]: event.target.value } })}
                                                />
                                            )
                                        ) : <span>{nodeById.get(row.textNodeIds?.[columnIndex] || "")?.metadata?.content || ""}</span>}
                                    </div>
                                ))}
                                <div className="min-w-0 pr-3">
                                    <CanvasResourceMentionTextarea
                                        value={row.prompt}
                                        references={rowReferences}
                                        includeAssetLibrary
                                        readOnly={readOnly}
                                        sendOnEnter={false}
                                        mentionMenuWidth={340}
                                        aria-label={`任务 ${index + 1} 提示词`}
                                        placeholder={hasGlobalPrompt ? "已使用全局提示词，可在此填写行级覆盖" : "输入 @ 引用本行参考图/视频/脚本或素材库..."}
                                        containerClassName="h-[120px]"
                                        className="thin-scrollbar h-full w-full overflow-y-auto rounded-lg border px-3 py-2 text-sm leading-5 outline-none transition-shadow focus-visible:ring-2"
                                        style={{ background: inputSurface, borderColor: theme.node.stroke, color: theme.node.text }}
                                        onChange={(prompt) => onUpdateRow(row.id, { prompt })}
                                        onSubmit={!readOnly && ready && !status.loading ? () => onGenerate([row.id]) : undefined}
                                        onWheel={(event) => event.stopPropagation()}
                                    />
                                    <div className="mt-1 truncate px-0.5 text-xs" style={{ color: theme.node.faint }}>
                                        {readOnly ? "输入 @ 引用素材" : "输入 @ 引用素材 · ⌘/Ctrl + Enter 生图"}
                                    </div>
                                </div>
                                <div className="flex h-24 min-h-24 items-center justify-center gap-2">
                                    {output ? (
                                        <ResultThumbnail
                                            output={output}
                                            badgeText="首帧图"
                                            status={status}
                                            theme={theme}
                                            onFocus={() => { if (row.outputNodeId) onFocusOutput?.(row.outputNodeId); }}
                                        />
                                    ) : null}
                                    {videoOutput ? (
                                        <ResultThumbnail
                                            output={videoOutput}
                                            badgeText="视频"
                                            isVideo
                                            status={status}
                                            theme={theme}
                                            onFocus={() => { if (row.videoOutputNodeId) onFocusOutput?.(row.videoOutputNodeId); }}
                                        />
                                    ) : null}
                                    {!output && !videoOutput ? (
                                        <ResultThumbnail
                                            output={undefined}
                                            status={status}
                                            theme={theme}
                                            onFocus={() => {}}
                                        />
                                    ) : null}
                                </div>
                                {!readOnly ? (
                                    <div className="flex items-center justify-center gap-1.5">
                                        {/* @opc-feature: storyboard-video-controls-guard [start] */}
                                        <Tooltip title={isStoryboard ? (hasImageOutput ? "重新生成首帧分镜图" : "生成分镜首帧图") : (hasImageOutput ? "重新生成图片" : "生成图片")}>
                                            <Button
                                                type={hasImageOutput ? "default" : "primary"}
                                                size="small"
                                                className="w-7 h-7 p-0 flex items-center justify-center border-blue-500/40 text-blue-500 hover:text-blue-600 hover:border-blue-500"
                                                disabled={Boolean(disabledReason)}
                                                icon={status.loading ? <LoaderCircle className="size-3.5 animate-spin" /> : (isStoryboard ? <ImageIcon className="size-3.5" /> : <Play className="size-3.5" />)}
                                                onClick={() => onGenerate([row.id])}
                                            />
                                        </Tooltip>
                                        {showVideoButtons ? (
                                            <Tooltip title={hasVideoOutput ? "重新生成镜头视频" : "生成镜头视频"}>
                                                <Button
                                                    type="primary"
                                                    size="small"
                                                    className="w-7 h-7 p-0 flex items-center justify-center bg-violet-600 hover:bg-violet-500 text-white border-none shadow-sm"
                                                    disabled={!row.enabled}
                                                    icon={<Film className="size-3.5" />}
                                                    onClick={() => onGenerateVideos?.([row.id])}
                                                />
                                            </Tooltip>
                                        ) : null}
                                        {/* @opc-feature: storyboard-video-controls-guard [end] */}
                                        <Tooltip title="删除这一行">
                                            <Button
                                                type="text"
                                                size="small"
                                                className="w-7 h-7 p-0 flex items-center justify-center opacity-60 transition-opacity group-hover:opacity-100"
                                                danger
                                                icon={<Trash2 className="size-3.5" />}
                                                onClick={() => onRemoveRow(row.id)}
                                            />
                                        </Tooltip>
                                    </div>
                                ) : <span />}
                            </div>
                        );
                    })
                ) : (
                    <div className="grid min-h-44 place-items-center px-5 text-center">
                        <div className="flex max-w-sm flex-col items-center gap-2">
                            <div className="grid size-10 place-items-center rounded-xl" style={{ background: theme.accent.primarySoft, color: theme.node.text }}><Rows3 className="size-5" /></div>
                            <div className="font-medium">还没有批量任务</div>
                            <p className="m-0 leading-5" style={{ color: theme.node.muted }}>把图片连接到左侧参考图端口后同步连线，或先添加一行手工配置。</p>
                            {!readOnly ? <Button size="small" icon={<Plus className="size-3.5" />} onClick={onAddRow}>添加第一条任务</Button> : null}
                        </div>
                    </div>
                )}
            </div>

            <Modal
                open={previewModal.open}
                title={previewModal.title}
                footer={null}
                onCancel={() => setPreviewModal((p) => ({ ...p, open: false }))}
                width={previewModal.type === "script" ? 680 : 800}
                centered
                destroyOnClose
            >
                {previewModal.type === "script" ? (
                    <div className="flex flex-col gap-3">
                        <textarea
                            value={editableScriptText}
                            onChange={(e) => setEditableScriptText(e.target.value)}
                            rows={14}
                            readOnly={readOnly}
                            className="thin-scrollbar w-full resize-none rounded-lg border p-3 text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-blue-500 font-mono"
                            style={{ background: inputSurface, borderColor: theme.node.stroke, color: theme.node.text }}
                            placeholder="查看或修改该分镜参考脚本内容..."
                        />
                        <div className="flex items-center justify-between pt-1">
                            <span className="text-xs opacity-75" style={{ color: theme.node.muted }}>
                                {editableScriptText.length} 字 · 点击保存修改将同步更新该分镜的参考脚本插槽
                            </span>
                            <div className="flex items-center gap-2">
                                <Button size="small" onClick={() => setPreviewModal((p) => ({ ...p, open: false }))}>
                                    关闭
                                </Button>
                                {!readOnly && previewModal.rowId ? (
                                    <Button
                                        size="small"
                                        type="primary"
                                        onClick={() => {
                                            if (previewModal.rowId) {
                                                const targetRow = table.rows.find((r) => r.id === previewModal.rowId);
                                                onUpdateRow(previewModal.rowId, {
                                                    cells: {
                                                        ...(targetRow?.cells || {}),
                                                        "col-ref-script": editableScriptText,
                                                    },
                                                });
                                                message.success("已保存该分镜参考脚本修改！");
                                            }
                                            setPreviewModal((p) => ({ ...p, open: false }));
                                        }}
                                    >
                                        保存修改
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                ) : previewModal.type === "video" ? (
                    <div className="flex justify-center items-center bg-black/90 rounded-lg overflow-hidden max-h-[70vh]">
                        <video src={previewModal.url} controls autoPlay className="max-h-[65vh] max-w-full rounded" />
                    </div>
                ) : (
                    <div className="flex justify-center items-center bg-black/5 rounded-lg overflow-hidden max-h-[70vh]">
                        <img src={previewModal.url} alt={previewModal.title} className="max-h-[65vh] max-w-full object-contain rounded" />
                    </div>
                )}
            </Modal>
            {/* @opc-feature: creative-prompt-templates [start] */}
            <PromptTemplateModal
                open={promptTemplateModalOpen}
                onOpenChange={setPromptTemplateModalOpen}
                defaultKind={isStoryboardTable ? "drama" : node.metadata?.generationMode === "video" ? "video" : "image"}
                initialMode={promptTemplateModalMode}
                prefillContent={globalPrompt}
                onSelect={(text) => onPatchTable({ globalPrompt: text })}
            />
            {/* @opc-feature: creative-prompt-templates [end] */}
        </div>
    );
}

function BatchChoiceGroup({ ariaLabel, options, value, onChange, theme, compact = false, disabled = false }: { ariaLabel: string; options: Array<{ value: string | number; label: string }>; value: string | number; onChange: (value: string | number) => void; theme: CanvasTheme; compact?: boolean; disabled?: boolean }) {
    return (
        <div role="group" aria-label={ariaLabel} className="flex shrink-0 items-center rounded-lg p-0.5" style={{ background: theme.node.panel }}>
            {options.map((option) => {
                const selected = option.value === value;
                return <button key={option.value} type="button" aria-pressed={selected} disabled={disabled} className={`rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${compact ? "min-w-7 px-1.5 py-1 text-[10px]" : "px-2.5 py-1.5 text-[11px]"}`} style={{ background: selected ? theme.accent.primary : "transparent", color: selected ? theme.accent.onPrimary : theme.node.muted }} onClick={() => onChange(option.value)}>{option.label}</button>;
            })}
        </div>
    );
}

function BatchReferenceHandles({ columns, theme, onConnectStart, onConnectDrop }: { columns: ReturnType<typeof batchReferenceColumns>; theme: CanvasTheme; onConnectStart: (event: ReactPointerEvent, handleId: string) => void; onConnectDrop?: (event: ReactPointerEvent, handleId: string) => void }) {
    const commonStyle = { left: 0, width: 36, height: 36, transform: "translate(-50%, -50%)", transformOrigin: "center" };
    return <>{columns.map((column, index) => <BatchReferenceHandle key={column.id} column={column} index={index} theme={theme} commonStyle={commonStyle} onConnectStart={onConnectStart} onConnectDrop={onConnectDrop} />)}</>;
}

function BatchReferenceHandle({ column, index, theme, commonStyle, onConnectStart, onConnectDrop }: { column: { id: string; label: string }; index: number; theme: CanvasTheme; commonStyle: { left: number; width: number; height: number; transform: string; transformOrigin: string }; onConnectStart: (event: ReactPointerEvent, handleId: string) => void; onConnectDrop?: (event: ReactPointerEvent, handleId: string) => void }) {
    const [hovered, setHovered] = useState(false);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const handleId = batchReferenceHandleId(column.id);
    const reset = useCallback(() => { setHovered(false); setOffset({ x: 0, y: 0 }); }, []);
    const update = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const dx = event.clientX - (bounds.left + bounds.width / 2);
        const dy = event.clientY - (bounds.top + bounds.height / 2);
        const limit = 10;
        setOffset({ x: Math.max(-limit, Math.min(limit, dx)), y: Math.max(-limit, Math.min(limit, dy)) });
    }, []);
    return (
        <Tooltip title={`连接到${column.label}`} placement="left">
            <button type="button" aria-label={`${column.label}连线点`} className="group absolute z-[var(--node-z-handle)] grid place-items-center rounded-full outline-none" style={{ ...commonStyle, top: BATCH_REFERENCE_HANDLE_TOP + index * BATCH_REFERENCE_HANDLE_GAP, cursor: "crosshair" }} onPointerEnter={(event) => { setHovered(true); update(event); }} onPointerMove={update} onPointerLeave={reset} onPointerDown={(event) => { event.stopPropagation(); onConnectStart(event, handleId); }} onPointerUp={(event) => { event.stopPropagation(); onConnectDrop?.(event, handleId); }}>
                <span className="grid size-[18px] place-items-center rounded-full border text-[8px] font-semibold shadow-sm transition-transform duration-100 group-hover:scale-125 group-focus-visible:scale-125" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${hovered ? 1.06 : 1})`, background: theme.node.panel, borderColor: theme.accent.primary, color: theme.accent.primary }}>{index + 1}</span>
            </button>
        </Tooltip>
    );
}

// @opc-feature: batch-table-mention-preview [start]
function batchRowMentionReferences(row: CanvasBatchRow, columns: ReturnType<typeof batchReferenceColumns>, nodeById: Map<string, CanvasNodeData>): CanvasResourceReference[] {
    return columns.flatMap((column, index) => {
        const source = nodeById.get(row.inputNodeIds[index]);
        if (!source) return [];
        const isVideo = source.type === CanvasNodeType.Video || source.type === "video" || Boolean(source.metadata?.mimeType?.startsWith("video/"));
        const isText = source.type === CanvasNodeType.Text || source.type === "text" || source.type === "ref_script" || source.type === "video_reverse";
        const kind = isVideo ? ("video" as const) : isText ? ("text" as const) : ("image" as const);
        const text = isText ? (source.metadata?.content || source.metadata?.prompt || source.title || "") : undefined;
        const storageKey = source.metadata?.storageKey;
        const memoryUrl = storageKey ? peekCachedResourceObjectUrl(storageKey) : "";
        const rawMediaUrl = source.metadata?.workflowKind === "character"
            ? source.metadata.characterCoverUrl
            : isVideo
              ? canvasNodeVideoPreviewUrl(source)
              : source.metadata?.previewContent || source.metadata?.content;
        const previewUrl = memoryUrl || rawMediaUrl || (storageKey ? resolveResourceUrl(storageKey) : undefined);
        const previewStorageKey = isVideo ? ((source.metadata as any)?.previewStorageKey || storageKey) : undefined;
        const slotLabel = isVideo ? `视频${index + 1}` : isText ? `脚本${index + 1}` : `参考图${index + 1}`;
        return [{
            id: `${row.id}:${column.id}:${source.id}`,
            nodeId: source.id,
            kind,
            label: slotLabel,
            title: `${slotLabel} · ${column.label || (isVideo ? "视频" : isText ? "脚本" : "图片")}`,
            previewUrl,
            storageKey,
            previewStorageKey,
            text,
            active: true,
            sourceType: source.type,
            mentionToken: batchReferenceMentionToken(index),
        }];
    });
}
// @opc-feature: batch-table-mention-preview [end]

// @opc-feature: canvas-batch-table-cell-actions [start]
function ReferenceThumbnail({
    node,
    label,
    theme,
    readOnly,
    rowId,
    columnIndex,
    tableNodeId,
    columnLabel,
    rowLabel,
    availableNodes,
    isDraggingCell,
    isDragOver,
    isDragOverCopy,
    onDragCellStart,
    onDragCellEnd,
    onDragCellOver,
    onDragCellLeave,
    onPickFile,
    onUploadFile,
    onPointerDown,
    onPreview,
    onClear,
    onCopy,
    onAssignReferenceNode,
    onCopyReferenceCell,
    onMoveReferenceCell,
    overrideScriptContent,
    onJumpToTarget,
    jumpTooltip,
}: {
    node?: CanvasNodeData;
    label: string;
    theme: CanvasTheme;
    readOnly: boolean;
    rowId: string;
    columnIndex: number;
    tableNodeId: string;
    columnLabel?: string;
    rowLabel?: string;
    availableNodes?: CanvasNodeData[];
    overrideScriptContent?: string;
    onJumpToTarget?: () => void;
    jumpTooltip?: string;
    isDraggingCell: boolean;
    isDragOver?: boolean;
    isDragOverCopy?: boolean;
    onDragCellStart?: (rowId: string, columnIndex: number) => void;
    onDragCellEnd?: () => void;
    onDragCellOver?: (rowId: string, columnIndex: number, isCopy: boolean) => void;
    onDragCellLeave?: () => void;
    onPickFile: () => void;
    onUploadFile: (file: File) => void;
    onPointerDown: (event: ReactPointerEvent) => void;
    onPreview: (modal: PreviewModalState) => void;
    onClear?: () => void;
    onCopy?: () => void;
    onAssignReferenceNode?: (referenceNodeId: string) => void;
    onCopyReferenceCell?: (sourceRowId: string, sourceCol: number, targetRowId: string, targetCol: number) => void;
    onMoveReferenceCell?: (sourceRowId: string, sourceCol: number, targetRowId: string, targetCol: number) => void;
}) {
    const clipboardItem = useBatchReferenceClipboard((state) => state.clipboard);
    const filled = Boolean(node && hasNodeMedia(node));
    const isVideo = Boolean(node && (node.type === CanvasNodeType.Video || node.type === "video" || node.metadata?.mimeType?.startsWith("video/")));
    const isAudio = Boolean(node && (node.type === CanvasNodeType.Audio || node.type === "audio" || node.metadata?.mimeType?.startsWith("audio/")));
    const isText = Boolean(node && !isVideo && !isAudio && (node.type === CanvasNodeType.Text || node.type === "text" || node.type === "ref_script" || node.type === "video_reverse" || (Boolean(node.metadata?.content || node.metadata?.prompt) && !node.metadata?.mimeType?.startsWith("image/"))));
    const scriptContent = (node?.metadata?.content || node?.metadata?.prompt || node?.title || "") as string;
    const mediaUrl = (node?.metadata?.previewContent || node?.metadata?.content || "") as string;
    const posterUrl = (node?.metadata?.previewContent || (node?.metadata?.mimeType?.startsWith("image/") ? node?.metadata?.content : "")) as string;
    const fallback = <EmptyThumbnail theme={theme} />;

    const audioSnapshot = useSyncExternalStore(
        (onStoreChange) => subscribeCanvasAudioNode(node?.id, onStoreChange),
        () => getCanvasAudioPlaybackSnapshot(node?.id),
        () => IDLE_AUDIO_SNAPSHOT,
    );
    const isPlayingAudio = audioSnapshot.phase === "playing";
    const isLoadingAudio = audioSnapshot.phase === "loading";

    const handleToggleAudio = useCallback(async (e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (!node) return;
        const targetMediaUrl = (node.metadata?.previewContent || node.metadata?.content || "") as string;
        await toggleCanvasAudio({
            nodeId: node.id,
            content: targetMediaUrl,
            storageKey: node.metadata?.storageKey,
            mimeType: node.metadata?.mimeType || "audio/mp3",
        });
    }, [node]);

    const canvasMediaMenuItems: MenuProps["items"] = useMemo(() => {
        if (!availableNodes || availableNodes.length === 0) {
            return [
                {
                    key: "empty",
                    disabled: true,
                    label: <span className="text-xs text-stone-400">画布暂无可复用的素材节点</span>,
                },
            ];
        }
        return availableNodes.slice(0, 20).map((mNode) => {
            const title = mNode.title || (mNode.type === "image" ? "图片节点" : mNode.type === "video" ? "视频节点" : mNode.type === "text" ? "文本节点" : "素材节点");
            const mediaThumb = (mNode.metadata?.previewContent || mNode.metadata?.content) as string;
            const isVid = mNode.type === "video" || mNode.metadata?.mimeType?.startsWith("video/");
            const isTxt = mNode.type === "text" || mNode.type === "ref_script" || mNode.type === "video_reverse";
            return {
                key: mNode.id,
                label: (
                    <div className="flex items-center gap-2 py-0.5 max-w-[200px]">
                        {mediaThumb && !isVid && !isTxt ? (
                            <img src={mediaThumb} alt="" className="size-6 object-cover rounded shrink-0 border border-white/10" />
                        ) : (
                            <div className="size-6 rounded bg-stone-800 flex items-center justify-center shrink-0 text-white/70">
                                {isVid ? <Play className="size-3 fill-current" /> : isTxt ? <FileText className="size-3" /> : <ImageIcon className="size-3" />}
                            </div>
                        )}
                        <div className="min-w-0 flex-1 flex flex-col">
                            <span className="truncate text-xs font-medium text-stone-900 dark:text-stone-100">{title}</span>
                            <span className="truncate text-[10px] text-stone-400">{mNode.type}</span>
                        </div>
                    </div>
                ),
                onClick: () => {
                    onAssignReferenceNode?.(mNode.id);
                    message.success(`已连接素材「${title}」到当前插槽`);
                },
            };
        });
    }, [availableNodes, onAssignReferenceNode]);

    const handlePaste = useCallback(async () => {
        if (readOnly) return;
        const copied = getBatchReferenceClipboard();
        if (copied?.nodeId) {
            onAssignReferenceNode?.(copied.nodeId);
            message.success(`已粘贴并复用素材：${copied.title || "参考素材"}`);
            return;
        }
        try {
            if (navigator.clipboard?.read) {
                const items = await navigator.clipboard.read();
                for (const item of items) {
                    const imageType = item.types.find((type) => type.startsWith("image/"));
                    if (imageType) {
                        const blob = await item.getType(imageType);
                        const file = new File([blob], `pasted-${Date.now()}.${imageType.split("/")[1] || "png"}`, { type: imageType });
                        onUploadFile(file);
                        return;
                    }
                }
            }
        } catch {}
        message.info("剪贴板中没有可粘贴的素材");
    }, [onAssignReferenceNode, onUploadFile, readOnly]);

    const cellTooltip = filled
        ? `${label} · ${node?.title || (isAudio ? "配音音频" : isVideo ? "视频" : isText ? "参考脚本" : "图片")} (${isAudio ? (isPlayingAudio ? "点击暂停" : "点击试听") : "点击放大查看"} · Ctrl+C 复制 / Backspace 清除)`
        : `${label} · 点击上传或拖入图片 (可 Ctrl+V 粘贴)`;

    return (
        <Tooltip title={cellTooltip}>
            <div
                role="button"
                tabIndex={0}
                data-batch-reference-cell
                data-table-node-id={tableNodeId}
                data-row-id={rowId}
                data-column-index={columnIndex}
                data-column-label={columnLabel}
                data-row-label={rowLabel}
                className={`group/cell relative box-border grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl border text-left cursor-pointer transition-all hover:shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
                    isDraggingCell ? "opacity-35 border-dashed border-sky-400 scale-95" : ""
                } ${
                    isDragOver
                        ? isDragOverCopy
                            ? "ring-2 ring-blue-500 border-blue-500 shadow-md scale-[1.03]"
                            : "ring-2 ring-emerald-500 border-emerald-500 shadow-md scale-[1.03]"
                        : ""
                }`}
                style={{ borderColor: filled ? theme.node.stroke : "transparent" }}
                onPointerDown={onPointerDown}
                draggable={!readOnly && filled}
                onDragStart={(event) => {
                    if (!node || readOnly) {
                        event.preventDefault();
                        return;
                    }
                    event.dataTransfer.setData("application/x-canvas-node-id", node.id);
                    event.dataTransfer.setData("application/x-batch-cell", JSON.stringify({
                        rowId,
                        columnIndex,
                        nodeId: node.id,
                    }));
                    event.dataTransfer.effectAllowed = "copyMove";
                    onDragCellStart?.(rowId, columnIndex);
                }}
                onDragEnd={() => {
                    onDragCellEnd?.();
                }}
                onClick={(event) => {
                    event.stopPropagation();
                    if (filled && node) {
                        if (isAudio) {
                            void handleToggleAudio();
                        } else if (isText) {
                            onPreview({
                                open: true,
                                title: `${label} · ${node.title || "参考脚本"}`,
                                type: "script",
                                content: overrideScriptContent || scriptContent,
                                rowId,
                            });
                        } else if (isVideo) {
                            onPreview({
                                open: true,
                                title: `${label} · ${node.title || "参考视频"}`,
                                type: "video",
                                content: "",
                                url: mediaUrl,
                            });
                        } else {
                            onPreview({
                                open: true,
                                title: `${label} · ${node.title || "参考图片"}`,
                                type: "image",
                                content: "",
                                url: mediaUrl,
                            });
                        }
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
                        if (filled && onCopy) {
                            event.preventDefault();
                            event.stopPropagation();
                            onCopy();
                            return;
                        }
                    }
                    if (event.key === "Backspace" || event.key === "Delete") {
                        if (filled && onClear) {
                            event.preventDefault();
                            event.stopPropagation();
                            onClear();
                            return;
                        }
                    }
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        if (filled && node) {
                            if (isAudio) {
                                void handleToggleAudio();
                            } else if (isText) {
                                onPreview({
                                    open: true,
                                    title: `${label} · ${node.title || "参考脚本"}`,
                                    type: "script",
                                    content: overrideScriptContent || scriptContent,
                                    rowId,
                                });
                            } else if (isVideo) {
                                onPreview({
                                    open: true,
                                    title: `${label} · ${node.title || "参考视频"}`,
                                    type: "video",
                                    content: "",
                                    url: mediaUrl,
                                });
                            } else {
                                onPreview({
                                    open: true,
                                    title: `${label} · ${node.title || "参考图片"}`,
                                    type: "image",
                                    content: "",
                                    url: mediaUrl,
                                });
                            }
                        } else if (!readOnly) {
                            onPickFile();
                        }
                    }
                }}
                onPaste={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void handlePaste();
                }}
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
                                message.success(`已复制素材到目标插槽（复用节点）`);
                            } else {
                                onMoveReferenceCell?.(sourceCell.rowId, sourceCell.columnIndex, rowId, columnIndex);
                                message.success(`已移动素材到目标插槽`);
                            }
                            return;
                        } catch {}
                    }
                    if (internalNodeId) {
                        onAssignReferenceNode?.(internalNodeId);
                        message.success(`已填入素材`);
                        return;
                    }
                    const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/"));
                    if (file && !readOnly) onUploadFile(file);
                }}
            >
                {filled ? (
                    isAudio ? (
                        <div className="relative size-full p-2 bg-gradient-to-br from-violet-950/95 via-purple-900/80 to-slate-950 text-white flex flex-col justify-between overflow-hidden select-none">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1">
                                    <Volume2 className={`size-3.5 ${isPlayingAudio ? "text-violet-400 animate-pulse" : "text-violet-300"}`} />
                                    <span className="text-[10px] font-semibold text-violet-200">配音音频</span>
                                </div>
                            </div>
                            <div className="flex flex-col items-center justify-center my-auto">
                                <button
                                    type="button"
                                    onClick={handleToggleAudio}
                                    className={`grid size-9 place-items-center rounded-full transition-transform hover:scale-110 active:scale-95 shadow-lg cursor-pointer ${
                                        isPlayingAudio ? "bg-amber-500 text-stone-900" : "bg-violet-600 hover:bg-violet-500 text-white"
                                    }`}
                                    title={isPlayingAudio ? "点击暂停" : "点击试听"}
                                >
                                    {isLoadingAudio ? (
                                        <LoaderCircle className="size-4 animate-spin" />
                                    ) : isPlayingAudio ? (
                                        <Pause className="size-4 fill-current" />
                                    ) : (
                                        <Play className="size-4 fill-current ml-0.5" />
                                    )}
                                </button>
                                <span className="text-[9px] mt-1 text-violet-200/80 font-mono">
                                    {isPlayingAudio ? "播放中..." : "点击试听"}
                                </span>
                            </div>
                            <div className="text-[9px] truncate text-violet-300/70 text-center">
                                {node?.title || "分镜配音"}
                            </div>
                        </div>
                    ) : isText ? (
                        <div className="relative size-full p-2 bg-amber-500/10 text-stone-800 dark:text-stone-200 flex flex-col justify-between overflow-hidden select-none pointer-events-none">
                            <div className="flex items-center gap-1.5">
                                <FileText className="size-4 text-amber-500 shrink-0" />
                                <span className="text-[11px] font-semibold truncate text-amber-600 dark:text-amber-400">参考脚本</span>
                            </div>
                            <div className="text-[11px] leading-snug line-clamp-3 select-none opacity-85 break-all">
                                {overrideScriptContent || scriptContent || "空文案"}
                            </div>
                            <div className="flex items-center justify-end text-[9px] text-amber-500/80">
                                <ZoomIn className="size-3.5" />
                            </div>
                        </div>
                    ) : isVideo ? (
                        <div className="relative size-full bg-slate-900 flex items-center justify-center overflow-hidden select-none pointer-events-none">
                            {posterUrl ? (
                                <CachedResourceImage eager draggable={false} src={posterUrl} storageKey={node?.metadata?.storageKey} alt="视频封面" className="block size-full object-cover opacity-80" fallback={<div className="size-full bg-slate-900" />} />
                            ) : mediaUrl ? (
                                <video src={mediaUrl} muted preload="metadata" className="block size-full object-cover opacity-80" />
                            ) : null}
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="grid size-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm">
                                    <Play className="size-4 fill-white ml-0.5" />
                                </span>
                            </div>
                        </div>
                    ) : (
                        <CachedResourceImage eager draggable={false} src={mediaUrl} storageKey={node?.metadata?.storageKey} alt={node?.title || "参考图"} className="block size-full max-h-full max-w-full object-cover select-none pointer-events-none" fallback={fallback} />
                    )
                ) : fallback}
                <span className="absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 text-xs font-semibold text-white shadow-sm pointer-events-none transition-opacity group-hover/cell:opacity-0" style={{ background: "rgba(0,0,0,.72)" }}>{label}</span>
                {!readOnly && !filled && (
                    <>
                        <div
                            className="absolute top-1 left-1 z-20 hidden group-hover/cell:flex items-center"
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <Dropdown menu={{ items: canvasMediaMenuItems, style: { maxHeight: "280px", overflowY: "auto" } }} trigger={["click"]} placement="bottomLeft">
                                <Tooltip title="从画布选用已有素材" placement="bottom">
                                    <button
                                        type="button"
                                        aria-label="从画布选用素材"
                                        className="grid size-6 place-items-center rounded-full bg-black/65 text-white/90 hover:text-white hover:bg-black/85 hover:scale-110 active:scale-95 shadow-sm border border-white/20 backdrop-blur-[2px] transition-all cursor-pointer"
                                    >
                                        <Layers className="size-3.5" />
                                    </button>
                                </Tooltip>
                            </Dropdown>
                        </div>
                        <div className="absolute inset-x-1.5 bottom-1.5 z-20 flex items-center justify-center gap-1 opacity-0 transition-opacity group-hover/cell:opacity-100">
                            <button
                                type="button"
                                aria-label="上传素材"
                                title="上传本地素材"
                                className="flex h-6.5 flex-1 items-center justify-center gap-1 rounded bg-black/65 hover:bg-black/85 text-white/90 hover:text-white px-1.5 text-[11px] font-medium shadow-sm border border-white/20 backdrop-blur-[2px] transition-all hover:scale-105 active:scale-95 cursor-pointer pointer-events-auto"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    onPickFile();
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                            >
                                <Upload className="size-3.5 shrink-0" />
                                <span>上传</span>
                            </button>
                            <button
                                type="button"
                                aria-label="粘贴素材"
                                title={clipboardItem?.nodeId ? `粘贴已复制素材 (${clipboardItem.title || "参考图"})` : "粘贴素材 (Ctrl+V)"}
                                className="flex h-6.5 flex-1 items-center justify-center gap-1 rounded bg-blue-600/85 hover:bg-blue-600 text-white px-1.5 text-[11px] font-medium shadow-sm border border-blue-400/40 backdrop-blur-[2px] transition-all hover:scale-105 active:scale-95 cursor-pointer pointer-events-auto"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    void handlePaste();
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                            >
                                <ClipboardPaste className="size-3.5 shrink-0" />
                                <span>粘贴</span>
                            </button>
                        </div>
                    </>
                )}
                {!readOnly && filled && (
                    <>
                        <div
                            className="absolute top-1 left-1 z-20 hidden group-hover/cell:flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <Dropdown menu={{ items: canvasMediaMenuItems, style: { maxHeight: "280px", overflowY: "auto" } }} trigger={["click"]} placement="bottomLeft">
                                <Tooltip title="从画布替换素材" placement="bottom">
                                    <button
                                        type="button"
                                        aria-label="从画布替换素材"
                                        className="grid size-6 place-items-center rounded-full bg-black/65 text-white/90 hover:text-white hover:bg-black/85 hover:scale-110 active:scale-95 shadow-sm border border-white/20 backdrop-blur-[2px] transition-all cursor-pointer"
                                    >
                                        <Layers className="size-3.5" />
                                    </button>
                                </Tooltip>
                            </Dropdown>
                            <Tooltip title="复制素材引用 (可在任意插槽按 Ctrl+V 或点击粘贴)" placement="bottom">
                                <button
                                    type="button"
                                    aria-label="复制素材"
                                    className="grid size-6 place-items-center rounded-full bg-black/65 text-white/90 hover:text-white hover:bg-black/85 hover:scale-110 active:scale-95 shadow-sm border border-white/20 backdrop-blur-[2px] transition-all cursor-pointer"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        onCopy?.();
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                >
                                    <Copy className="size-3.5" />
                                </button>
                            </Tooltip>
                            {clipboardItem?.nodeId && clipboardItem.nodeId !== node?.id && (
                                <Tooltip title={`粘贴替换为剪贴板素材 (${clipboardItem.title || "已复制素材"})`} placement="bottom">
                                    <button
                                        type="button"
                                        aria-label="粘贴替换素材"
                                        className="grid size-6 place-items-center rounded-full bg-blue-600/85 text-white hover:bg-blue-600 hover:scale-110 active:scale-95 shadow-sm border border-blue-400/40 backdrop-blur-[2px] transition-all cursor-pointer"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            void handlePaste();
                                        }}
                                        onPointerDown={(e) => e.stopPropagation()}
                                    >
                                        <ClipboardPaste className="size-3.5" />
                                    </button>
                                </Tooltip>
                            )}
                        </div>
                    </>
                )}
                <div
                    className="absolute top-1 right-1 z-20 flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    {onJumpToTarget && (
                        <Tooltip title={jumpTooltip || "跳转"} placement="bottom">
                            <button
                                type="button"
                                aria-label={jumpTooltip || "跳转"}
                                className="grid size-6 place-items-center rounded-full bg-black/65 text-white/90 hover:text-white hover:bg-black/85 hover:scale-110 active:scale-95 shadow-sm border border-white/20 backdrop-blur-[2px] transition-all cursor-pointer"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onJumpToTarget();
                                }}
                            >
                                <ExternalLink className="size-3" />
                            </button>
                        </Tooltip>
                    )}
                    {!readOnly && filled && (
                        <Tooltip title="移除素材 (同步清理连线)" placement="bottom">
                            <button
                                type="button"
                                aria-label="移除素材"
                                className="hidden group-hover/cell:grid size-6 place-items-center rounded-full bg-red-500/85 text-white hover:bg-red-600 hover:scale-110 active:scale-95 shadow-sm border border-red-400/40 backdrop-blur-[2px] transition-all cursor-pointer"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    onClear?.();
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                            >
                                <Trash2 className="size-3.5" />
                            </button>
                        </Tooltip>
                    )}
                </div>
                {isDragOver && (
                    <div
                        className={`absolute inset-x-1.5 bottom-1.5 z-30 flex items-center justify-center gap-1 rounded py-1 text-xs font-medium text-white shadow-md pointer-events-none ${
                            isDragOverCopy ? "bg-blue-600/95" : "bg-emerald-600/95"
                        }`}
                    >
                        {isDragOverCopy ? <Copy className="size-3.5" /> : <ArrowLeftRight className="size-3.5" />}
                        <span>{isDragOverCopy ? "复制到此" : "移动到此"}</span>
                    </div>
                )}
            </div>
        </Tooltip>
    );
}
// @opc-feature: canvas-batch-table-cell-actions [end]

// @opc-feature: storyboard-stacked-asset-cell [start]
type StackedAssetItem = {
    id: string;
    name: string;
    categoryEmoji: string;
    node?: CanvasNodeData;
    imageUrl?: string;
    isGenerated?: boolean;
};

function StackedAssetThumbnail({
    assets,
    theme,
    onJumpToTarget,
    jumpTooltip,
    onPreview,
}: {
    assets: StackedAssetItem[];
    theme: CanvasTheme;
    readOnly?: boolean;
    rowId?: string;
    tableNodeId?: string;
    onJumpToTarget?: () => void;
    jumpTooltip?: string;
    onPreview?: (url: string, title: string) => void;
}) {
    const primaryAsset = assets[0];
    const previewUrl = primaryAsset?.imageUrl || assets.find((a) => a.imageUrl)?.imageUrl;

    const tooltipContent = (
        <div className="flex flex-col gap-1.5 py-1 min-w-[170px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 pb-1 text-[11px] font-semibold text-white/90">
                <span>关联创意资产 ({assets.length})</span>
                <span className="text-[10px] text-emerald-400 font-medium">多层叠放</span>
            </div>
            <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto thin-scrollbar">
                {assets.map((asset, i) => (
                    <div
                        key={asset.id || i}
                        className="flex items-center gap-2 text-xs rounded p-1 hover:bg-white/10 transition-colors cursor-pointer"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (asset.imageUrl && onPreview) {
                                onPreview(asset.imageUrl, `${asset.categoryEmoji} ${asset.name}`);
                            }
                        }}
                    >
                        <div className="size-6 rounded border border-white/20 overflow-hidden bg-black/40 flex items-center justify-center shrink-0">
                            {asset.imageUrl ? (
                                <img src={asset.imageUrl} alt="" className="size-full object-cover" />
                            ) : (
                                <span className="text-xs">{asset.categoryEmoji}</span>
                            )}
                        </div>
                        <span className="truncate flex-1 text-white/90 text-[11px]">{asset.name}</span>
                        <span className={`text-[9px] px-1 py-0.5 rounded shrink-0 font-medium ${asset.isGenerated ? "bg-emerald-500/25 text-emerald-300" : asset.imageUrl ? "bg-blue-500/25 text-blue-300" : "bg-white/10 text-white/50"}`}>
                            {asset.isGenerated ? "新生成" : asset.imageUrl ? "参考图" : "待生成"}
                        </span>
                    </div>
                ))}
            </div>
            <div className="border-t border-white/10 pt-1 text-[10px] text-white/40 text-center">
                点击放大主图 · 右上角 ↗ 跳转资产表
            </div>
        </div>
    );

    return (
        <Tooltip title={tooltipContent} placement="top" arrow={false}>
            <div
                className="relative size-20 shrink-0 cursor-pointer group/stack flex items-center justify-center select-none"
                onClick={(e) => {
                    e.stopPropagation();
                    if (previewUrl && onPreview) {
                        onPreview(previewUrl, `${primaryAsset?.categoryEmoji || "🎨"} ${primaryAsset?.name || "创意资产"}`);
                    }
                }}
            >
                {/* 第三层（背底卡片，若资产 >= 3 项） */}
                {assets.length >= 3 && (
                    <div
                        className="absolute size-14 rounded-xl border overflow-hidden shadow-sm transition-all duration-300 pointer-events-none group-hover/stack:rotate-[-10deg] group-hover/stack:-translate-x-2 group-hover/stack:translate-y-2"
                        style={{
                            transform: "rotate(-6deg) translate(-4px, 4px) scale(0.88)",
                            borderColor: "rgba(255, 255, 255, 0.16)",
                            backgroundColor: "rgba(15, 23, 42, 0.75)",
                            zIndex: 10,
                        }}
                    >
                        {assets[2]?.imageUrl ? (
                            <img src={assets[2].imageUrl} alt="" className="size-full object-cover opacity-80" />
                        ) : (
                            <div className="size-full flex flex-col items-center justify-center bg-black/50 text-[10px]">
                                <span className="text-sm">{assets[2]?.categoryEmoji || "🏠"}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* 第二层（中间卡片，若资产 >= 2 项） */}
                {assets.length >= 2 && (
                    <div
                        className="absolute size-14 rounded-xl border overflow-hidden shadow transition-all duration-300 pointer-events-none group-hover/stack:rotate-[8deg] group-hover/stack:translate-x-2 group-hover/stack:translate-y-1"
                        style={{
                            transform: "rotate(4deg) translate(4px, 3px) scale(0.94)",
                            borderColor: "rgba(255, 255, 255, 0.25)",
                            backgroundColor: "rgba(15, 23, 42, 0.85)",
                            zIndex: 20,
                        }}
                    >
                        {assets[1]?.imageUrl ? (
                            <img src={assets[1].imageUrl} alt="" className="size-full object-cover opacity-90" />
                        ) : (
                            <div className="size-full flex flex-col items-center justify-center bg-black/40 text-[10px]">
                                <span className="text-sm">{assets[1]?.categoryEmoji || "📦"}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* 第一层（正面主卡片） */}
                <div
                    className="relative size-14 rounded-xl border-2 overflow-hidden shadow-md transition-all duration-300 group-hover/stack:scale-105 group-hover/stack:rotate-0"
                    style={{
                        borderColor: theme.accent.primary,
                        backgroundColor: theme.node.panel,
                        zIndex: 30,
                    }}
                >
                    {primaryAsset?.imageUrl ? (
                        <img src={primaryAsset.imageUrl} alt="" className="size-full object-cover" />
                    ) : (
                        <div className="size-full flex flex-col items-center justify-center bg-black/40 text-[10px]">
                            <span className="text-base">{primaryAsset?.categoryEmoji || "👤"}</span>
                            <span className="truncate px-1 text-[9px] opacity-75">{primaryAsset?.name || "主资产"}</span>
                        </div>
                    )}
                </div>

                {/* 右下角叠放资产数量徽标 */}
                <div className="absolute -bottom-1 -right-1 z-40 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold shadow-md bg-emerald-600/90 hover:bg-emerald-600 text-white border border-emerald-400/40 backdrop-blur-[2px] pointer-events-none">
                    <Layers className="size-2.5 shrink-0" />
                    <span>{assets.length} 资产</span>
                </div>

                {/* 右上角跳转创意资产表按钮 */}
                {onJumpToTarget && (
                    <div
                        className="absolute -top-1.5 -right-1.5 z-50 flex items-center"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <Tooltip title={jumpTooltip || "跳转至创意资产表"} placement="bottom">
                            <button
                                type="button"
                                aria-label={jumpTooltip || "跳转"}
                                className="grid size-5.5 place-items-center rounded-full bg-black/75 text-white/90 hover:text-white hover:bg-black/90 hover:scale-110 active:scale-95 shadow-sm border border-white/20 backdrop-blur-[2px] transition-all cursor-pointer"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onJumpToTarget();
                                }}
                            >
                                <ExternalLink className="size-2.5" />
                            </button>
                        </Tooltip>
                    </div>
                )}
            </div>
        </Tooltip>
    );
}
// @opc-feature: storyboard-stacked-asset-cell [end]

function ResultThumbnail({ output, status, theme, onFocus, badgeText, isVideo = false }: { output?: CanvasNodeData; status: ReturnType<typeof rowStatus>; theme: CanvasTheme; onFocus: () => void; badgeText?: string; isVideo?: boolean }) {
    const filled = Boolean(output && hasNodeMedia(output));
    const tone = statusColor(status.tone, theme.node.stroke);
    const title = filled ? `${status.label} · 点击定位到画布${isVideo ? "视频" : "图片"}节点` : status.label;
    const mediaUrl = output?.metadata?.previewContent || output?.metadata?.content;
    return (
        <Tooltip title={title}>
            <button
                type="button"
                aria-label={title}
                disabled={!output}
                className="relative box-border grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl border-2"
                style={{ borderColor: tone, cursor: output ? "pointer" : "default" }}
                onClick={(event) => {
                    event.stopPropagation();
                    if (output) onFocus();
                }}
            >
                {filled && output ? (
                    isVideo ? (
                        <div className="relative size-full bg-slate-900 flex items-center justify-center overflow-hidden">
                            {output.metadata?.previewContent ? (
                                <CachedResourceImage eager src={output.metadata.previewContent} storageKey={output.metadata?.storageKey} alt="视频生成结果" className="block size-full object-cover" fallback={<div className="size-full bg-slate-900" />} />
                            ) : mediaUrl ? (
                                <video src={mediaUrl} muted preload="metadata" className="block size-full object-cover" />
                            ) : null}
                            <span className="absolute inset-0 grid place-items-center bg-black/30">
                                <Play className="size-5 fill-white text-white ml-0.5" />
                            </span>
                        </div>
                    ) : (
                        <CachedResourceImage eager src={mediaUrl} storageKey={output.metadata?.storageKey} alt="生成结果" className="block size-full max-h-full max-w-full object-cover" fallback={<EmptyThumbnail theme={theme} compact />} />
                    )
                ) : <EmptyThumbnail theme={theme} compact />}
                {status.loading ? <span className="absolute inset-0 grid place-items-center bg-black/35"><LoaderCircle className="size-5 animate-spin" style={{ color: tone }} /></span> : null}
                <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full" style={{ background: tone }} />
                {badgeText && filled ? (
                    <span className="absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-xs font-semibold text-white shadow-sm" style={{ background: isVideo ? "rgba(124,58,237,0.85)" : "rgba(37,99,235,0.85)" }}>
                        {badgeText}
                    </span>
                ) : null}
            </button>
        </Tooltip>
    );
}

function statusColor(tone: RowStatusTone, fallback: string) {
    if (tone === "success") return "var(--status-success)";
    if (tone === "error") return "var(--status-error)";
    if (tone === "loading") return "var(--status-loading)";
    return fallback;
}

function EmptyThumbnail({ theme, compact = false }: { theme: CanvasTheme; compact?: boolean }): ReactNode {
    const sizeClass = "size-full";
    return (
        <div
            className={`grid shrink-0 place-items-center rounded-xl border border-dashed ${sizeClass}`}
            style={{ borderColor: theme.node.stroke, color: theme.node.placeholder, background: `color-mix(in srgb, ${theme.node.text} 3%, transparent)` }}
        >
            {compact ? <ImageIcon className="size-6" /> : (
                <span className="flex flex-col items-center gap-1">
                    <Upload className="size-6" />
                    <span className="text-xs leading-none">上传</span>
                </span>
            )}
        </div>
    );
}

function hasNodeMedia(node?: CanvasNodeData) {
    if (!node) return false;
    return Boolean(node.metadata?.content || node.metadata?.storageKey || node.metadata?.previewContent || node.metadata?.prompt);
}

type RowStatusTone = "success" | "error" | "loading" | "idle";
type RowStatus = { label: string; tone: RowStatusTone; loading: boolean; retryable: boolean };

function rowStatus(item: CanvasGenerationBatchItem | undefined, output: CanvasNodeData | undefined): RowStatus {
    if (hasNodeMedia(output)) return { label: "生成完成", tone: "success", loading: false, retryable: false };
    if (item?.status === "failed") return { label: item.errorDetails || "生成失败", tone: "error", loading: false, retryable: true };
    if (item?.status === "cancelled") return { label: "已停止", tone: "error", loading: false, retryable: false };
    if (item && ["waiting", "submitting", "queued", "running"].includes(item.status)) return { label: item.status === "waiting" ? "等待中" : item.status === "submitting" ? "正在提交" : item.status === "queued" ? "已排队" : "生成中", tone: "loading", loading: true, retryable: false };
    if (output?.metadata?.status === "error") return { label: output.metadata.errorDetails || "生成失败", tone: "error", loading: false, retryable: false };
    return { label: "待生成", tone: "idle", loading: false, retryable: false };
}
