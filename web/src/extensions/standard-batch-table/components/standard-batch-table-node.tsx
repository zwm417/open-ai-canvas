import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Button, Dropdown, Modal, Switch, Tooltip, message, type MenuProps } from "antd";
import { ArrowLeftRight, ClipboardPaste, Copy, FileText, Image as ImageIcon, Layers, LoaderCircle, Maximize2, Minus, Play, Plus, Rows3, Trash2, Upload, ZoomIn } from "lucide-react";

import { copyBatchReference, getBatchReferenceClipboard, useBatchReferenceClipboard } from "@/lib/canvas/batch-reference-clipboard";

import { CachedResourceImage } from "@/components/cached-resource-image";
import { peekCachedResourceObjectUrl } from "@/services/resource-blob-cache";
import { resolveResourceUrl } from "@/services/api/resources";
import { canvasNodeVideoPreviewUrl } from "@/lib/canvas/canvas-media-preview";
import { resolveImageUrl } from "@/services/image-storage";
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
    batchRowReady as rowReady,
} from "@/lib/canvas/canvas-batch-table";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import type { CanvasTheme } from "@/lib/canvas-theme";
import {
    CanvasNodeType,
    type CanvasBatchOperation,
    type CanvasBatchRow,
    type CanvasBatchTableData,
    type CanvasConnection,
    type CanvasGenerationBatch,
    type CanvasGenerationBatchItem,
    type CanvasNodeData,
} from "@/types/canvas";

type ReferenceCell = { rowId: string; columnIndex: number };

export type StandardBatchTableNodeContentProps = {
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
    onAutoHeightChange?: (height: number) => void;
    onResetManualSize?: () => void;
    readOnly?: boolean;
};

const OPERATION_OPTIONS = [
    { value: "try_on", label: "批量换装" },
    { value: "creative", label: "创意生图" },
] satisfies Array<{ value: CanvasBatchOperation; label: string }>;

const CONCURRENCY_OPTIONS = [1, 5, 10] as const;

export function StandardBatchTableNodeContent({
    node,
    nodes,
    connections,
    batch,
    theme,
    onPatchTable,
    onAddRow,
    onRemoveRow,
    onUpdateRow,
    onFillRows,
    onGenerate,
    onAddReferenceColumn,
    onRemoveReferenceColumn,
    onReorderReferenceColumns,
    onMoveReferenceCell,
    // @opc-feature: batch-table-slot-operations [start]
    onCopyReferenceCell,
    onAssignReferenceNode,
    onClearReferenceCell,
    // @opc-feature: batch-table-slot-operations [end]
    onUploadReference,
    onFocusOutput,
    onConnectStart,
    onConnectDrop,
    onAutoHeightChange,
    onResetManualSize,
    readOnly = false,
}: StandardBatchTableNodeContentProps) {
    const table = node.metadata?.batchTable || { operation: "try_on" as const, concurrency: 10, rows: [] };
    const referenceColumns = batchReferenceColumns(table);
    const globalPrompt = table.globalPrompt || "";
    const hasGlobalPrompt = Boolean(globalPrompt.trim());
    const nodeById = useMemo(() => new Map(nodes.map((item) => [item.id, item])), [nodes]);
    const batchItemByRowId = useMemo(() => new Map((batch?.items || []).map((item) => [item.rowId, item])), [batch?.items]);
    const connectedImageCount = useMemo(
        () => new Set(connections.filter((c) => c.toNodeId === node.id && c.relation !== "batch-output").map((c) => c.fromNodeId)).size,
        [connections, node.id],
    );
    const completed = table.rows.filter((row) => hasNodeMedia(row.outputNodeId ? nodeById.get(row.outputNodeId) : undefined)).length;
    const unfinishedReadyCount = table.rows.filter((row) => rowReady(row, table, nodeById) && !hasNodeMedia(row.outputNodeId ? nodeById.get(row.outputNodeId) : undefined)).length;

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

    const gridTemplateColumns = `72px repeat(${referenceColumns.length}, 116px) minmax(260px, 1fr) 120px 96px`;
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
    const subtleSurface = `color-mix(in srgb, ${theme.node.text} 4%, transparent)`;
    const inputSurface = theme.node.panel;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetRef = useRef<ReferenceCell | null>(null);

    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
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
        <div
            data-canvas-batch-table
            data-canvas-no-zoom
            data-canvas-wheel-scroll
            className="relative flex h-full w-full flex-col overflow-visible text-xs"
            style={{ color: theme.node.text }}
        >
            {!readOnly ? (
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        const target = uploadTargetRef.current;
                        event.currentTarget.value = "";
                        uploadTargetRef.current = null;
                        if (file && target) onUploadReference?.(target.rowId, target.columnIndex, file);
                    }}
                />
            ) : null}
            {!readOnly ? (
                <BatchReferenceHandles
                    columns={referenceColumns}
                    theme={theme}
                    onConnectStart={onConnectStart}
                    onConnectDrop={onConnectDrop}
                />
            ) : null}

            {/* 表头工具栏 */}
            <div ref={toolbarRef} className="shrink-0 overflow-hidden rounded-t-[inherit] border-b" style={{ borderColor: theme.node.stroke, background: subtleSurface }}>
                <div data-canvas-batch-drag className="flex h-11 cursor-grab items-center gap-2 px-3 active:cursor-grabbing">
                    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden" onPointerDown={(event) => event.stopPropagation()}>
                        <BatchChoiceGroup
                            ariaLabel="批量任务类型"
                            theme={theme}
                            disabled={readOnly}
                            options={OPERATION_OPTIONS}
                            value={table.operation}
                            onChange={(operation) => onPatchTable({ operation: operation as CanvasBatchOperation })}
                        />
                        {/* 手动拉伸高度后的自适应重置按钮 */}
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
                        <div className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2" style={{ background: theme.node.panel }}>
                            <span className="font-medium" style={{ color: theme.node.muted }}>并发</span>
                            <BatchChoiceGroup
                                ariaLabel="并发数"
                                theme={theme}
                                disabled={readOnly}
                                compact
                                options={CONCURRENCY_OPTIONS.map((value) => ({ value, label: String(value) }))}
                                value={table.concurrency}
                                onChange={(concurrency) => onPatchTable({ concurrency: Number(concurrency) })}
                            />
                        </div>
                        <div className="flex h-8 shrink-0 items-center gap-0.5 rounded-lg px-2" style={{ background: theme.node.panel, color: theme.node.muted }}>
                            <span className="pr-1">{referenceColumns.length}/{MAX_BATCH_REFERENCE_COLUMNS} 组参考</span>
                            {!readOnly ? (
                                <>
                                    <Tooltip title={referenceColumns.length <= MIN_BATCH_REFERENCE_COLUMNS ? "至少保留 1 组参考图" : "减少一组参考图"}>
                                        <button
                                            type="button"
                                            aria-label="减少一组参考图"
                                            className="grid size-5 place-items-center rounded-md transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-1 dark:hover:bg-white/10"
                                            style={{ color: theme.node.text }}
                                            disabled={referenceColumns.length <= MIN_BATCH_REFERENCE_COLUMNS}
                                            onClick={onRemoveReferenceColumn}
                                        >
                                            <Minus className="size-3.5" />
                                        </button>
                                    </Tooltip>
                                    <Tooltip title={referenceColumns.length >= MAX_BATCH_REFERENCE_COLUMNS ? `最多支持 ${MAX_BATCH_REFERENCE_COLUMNS} 组参考图` : `新增参考图 ${referenceColumns.length + 1}`}>
                                        <button
                                            type="button"
                                            aria-label={`新增参考图 ${referenceColumns.length + 1}`}
                                            className="grid size-5 place-items-center rounded-md transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-1 dark:hover:bg-white/10"
                                            style={{ color: theme.node.text }}
                                            disabled={referenceColumns.length >= MAX_BATCH_REFERENCE_COLUMNS}
                                            onClick={onAddReferenceColumn}
                                        >
                                            <Plus className="size-3.5" />
                                        </button>
                                    </Tooltip>
                                </>
                            ) : null}
                        </div>
                        <span className="shrink-0 tabular-nums" style={{ color: theme.node.muted }}>
                            已连 {connectedImageCount} · 完成 {completed}/{table.rows.length}
                        </span>
                    </div>
                    {!readOnly ? (
                        <div className="ml-auto flex shrink-0 items-center gap-1.5" onPointerDown={(event) => event.stopPropagation()}>
                            <Tooltip title="增量同步画布连线，不会删除已有任务行">
                                <Button size="small" type="text" icon={<Rows3 className="size-3.5" />} onClick={onFillRows}>
                                    同步连线
                                </Button>
                            </Tooltip>
                            <Button size="small" type="text" icon={<Plus className="size-3.5" />} onClick={onAddRow}>
                                添加任务
                            </Button>
                            <Button
                                size="small"
                                type="primary"
                                icon={<Play className="size-3.5" />}
                                disabled={!unfinishedReadyCount}
                                onClick={() => onGenerate()}
                            >
                                生成未完成项{unfinishedReadyCount ? ` · ${unfinishedReadyCount}` : ""}
                            </Button>
                        </div>
                    ) : null}
                </div>
                {/* 全局提示词行 */}
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
                </div>
            </div>

            {/* 表格内容区 */}
            <div
                ref={scrollContainerRef}
                data-canvas-wheel-scroll
                data-canvas-no-drag
                className="thin-scrollbar min-h-0 flex-1 overflow-y-auto rounded-b-[inherit]"
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onWheel={(event) => event.stopPropagation()}
            >
                <div
                    className="sticky top-0 z-10 grid h-10 items-center border-b px-3 text-center text-sm font-semibold"
                    style={{ borderColor: theme.node.stroke, background: theme.node.panel, color: theme.node.muted, gridTemplateColumns }}
                >
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
                    <span className="min-w-0 truncate px-1">任务提示词</span>
                    <span className="min-w-0 truncate px-1 text-center">生成结果</span>
                    <span className="min-w-0 truncate px-1 text-center">操作</span>
                </div>

                {table.rows.length ? (
                    table.rows.map((row, index) => {
                        const output = row.outputNodeId ? nodeById.get(row.outputNodeId) : undefined;
                        const item = batchItemByRowId.get(row.id);
                        const isRowEnabled = row.enabled !== false;
                        const status = isRowEnabled ? rowStatus(item, output) : { label: "已停用", tone: "idle" as const, loading: false, retryable: false };
                        const ready = rowReady({ ...row, enabled: isRowEnabled }, table, nodeById);
                        const hasImageOutput = Boolean(output && hasNodeMedia(output));
                        const references = batchRowMentionReferences(row, referenceColumns, nodeById);
                        const effectivePrompt = batchPromptForRow(table, row);
                        const disabledReason = status.loading
                            ? "当前任务正在生成"
                            : !isRowEnabled
                              ? "请先启用这一行"
                              : !effectivePrompt.trim()
                                ? "请填写任务提示词"
                                : table.operation === "try_on" && row.inputNodeIds.filter(Boolean).length < 2
                                  ? "批量换装至少需要两张参考图"
                                  : !ready
                                    ? "请补齐有效参考图"
                                    : "";

                        return (
                            <div
                                key={row.id}
                                className="group grid items-center border-b px-3.5 py-3.5 transition-colors hover:bg-black/[.025] dark:hover:bg-white/[.025]"
                                style={{ borderColor: theme.node.stroke, gridTemplateColumns, opacity: isRowEnabled ? 1 : 0.58 }}
                            >
                                <div className="flex items-center justify-center gap-1.5">
                                    {!readOnly ? (
                                        <Switch
                                            size="small"
                                            checked={isRowEnabled}
                                            aria-label={`启用任务 ${index + 1}`}
                                            onChange={(enabled) => onUpdateRow(row.id, { enabled })}
                                        />
                                    ) : null}
                                    <span className="text-sm font-medium tabular-nums" style={{ color: theme.node.muted }}>{index + 1}</span>
                                </div>
                                {referenceColumns.map((column, columnIndex) => (
                                    <div key={column.id} className="flex justify-center">
                                        <StandardReferenceThumbnail
                                            node={nodeById.get(row.inputNodeIds[columnIndex])}
                                            label={batchReferenceMentionToken(columnIndex)}
                                            theme={theme}
                                            readOnly={readOnly}
                                            rowId={row.id}
                                            columnIndex={columnIndex}
                                            tableNodeId={node.id}
                                            columnLabel={column.label}
                                            rowLabel={`第 ${index + 1} 行`}
                                            availableNodes={availableMediaNodes}
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
                                            onPreview={(url) => setPreviewImageUrl(url)}
                                            // @opc-feature: batch-table-slot-operations [start]
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
                                                const targetNode = nodeById.get(row.inputNodeIds[columnIndex]);
                                                if (!targetNode) return;
                                                let mediaUrl = (targetNode.metadata?.previewContent || targetNode.metadata?.content || "") as string;
                                                if (!mediaUrl && targetNode.metadata?.storageKey) {
                                                    mediaUrl = await resolveImageUrl(targetNode.metadata.storageKey);
                                                }
                                                copyBatchReference({
                                                    nodeId: targetNode.id,
                                                    title: targetNode.title,
                                                    previewUrl: mediaUrl,
                                                    storageKey: targetNode.metadata?.storageKey,
                                                    mimeType: targetNode.metadata?.mimeType,
                                                });
                                                try {
                                                    let copiedAsBlob = false;
                                                    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write && mediaUrl) {
                                                        try {
                                                            const res = await fetch(mediaUrl);
                                                            if (res.ok) {
                                                                const blob = await res.blob();
                                                                const type = blob.type.startsWith("image/") ? blob.type : "image/png";
                                                                await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
                                                                copiedAsBlob = true;
                                                            }
                                                        } catch {}
                                                    }
                                                    if (!copiedAsBlob && navigator.clipboard?.writeText && mediaUrl) {
                                                        await navigator.clipboard.writeText(mediaUrl);
                                                    }
                                                } catch {}
                                                message.success(`已复制 ${targetNode.title || "素材"}，可在任意插槽按 Ctrl+V 或点击粘贴`);
                                            }}
                                            // @opc-feature: batch-table-slot-operations [end]
                                        />
                                    </div>
                                ))}
                                <div className="min-w-0 pr-3">
                                    <CanvasResourceMentionTextarea
                                        value={row.prompt}
                                        references={references}
                                        includeAssetLibrary
                                        readOnly={readOnly}
                                        sendOnEnter={false}
                                        mentionMenuWidth={320}
                                        aria-label={`任务 ${index + 1} 提示词`}
                                        placeholder={hasGlobalPrompt ? "已使用全局提示词，可在此填写行级覆盖" : "输入 @ 引用本行参考图或素材库..."}
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
                                <div className="flex h-24 min-h-24 items-center justify-center">
                                    <StandardResultThumbnail
                                        output={output}
                                        status={status}
                                        theme={theme}
                                        onFocus={() => {
                                            if (row.outputNodeId) onFocusOutput?.(row.outputNodeId);
                                        }}
                                    />
                                </div>
                                {!readOnly ? (
                                    <div className="flex items-center justify-center gap-1.5">
                                        <Tooltip title={hasImageOutput ? "重新生成图片" : "生成图片"}>
                                            <Button
                                                type={hasImageOutput ? "default" : "primary"}
                                                size="small"
                                                className="w-7 h-7 p-0 flex items-center justify-center border-blue-500/40 text-blue-500 hover:text-blue-600 hover:border-blue-500"
                                                disabled={Boolean(disabledReason)}
                                                icon={status.loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                                                onClick={() => onGenerate([row.id])}
                                            />
                                        </Tooltip>
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
                            <div className="grid size-10 place-items-center rounded-xl" style={{ background: theme.accent.primarySoft, color: theme.node.text }}>
                                <Rows3 className="size-5" />
                            </div>
                            <div className="font-medium">还没有批量任务</div>
                            <p className="m-0 leading-5" style={{ color: theme.node.muted }}>
                                把图片连接到左侧参考图端口后同步连线，或先添加一行手工配置。
                            </p>
                            {!readOnly ? (
                                <Button size="small" icon={<Plus className="size-3.5" />} onClick={onAddRow}>
                                    添加第一条任务
                                </Button>
                            ) : null}
                        </div>
                    </div>
                )}
            </div>

            {/* 图片预览模态框 */}
            <Modal
                open={Boolean(previewImageUrl)}
                title="参考图放大预览"
                footer={null}
                onCancel={() => setPreviewImageUrl(null)}
                width={720}
                centered
                destroyOnClose
            >
                <div className="flex justify-center items-center bg-black/5 rounded-lg overflow-hidden max-h-[70vh] p-2">
                    {previewImageUrl ? (
                        <img src={previewImageUrl} alt="参考图预览" className="max-h-[65vh] max-w-full object-contain rounded" />
                    ) : null}
                </div>
            </Modal>
        </div>
    );
}

function BatchChoiceGroup({
    ariaLabel,
    options,
    value,
    onChange,
    theme,
    compact = false,
    disabled = false,
}: {
    ariaLabel: string;
    options: Array<{ value: string | number; label: string }>;
    value: string | number;
    onChange: (value: string | number) => void;
    theme: CanvasTheme;
    compact?: boolean;
    disabled?: boolean;
}) {
    return (
        <div role="group" aria-label={ariaLabel} className="flex shrink-0 items-center rounded-lg p-0.5" style={{ background: theme.node.panel }}>
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        disabled={disabled}
                        className={`rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${compact ? "min-w-7 px-1.5 py-1 text-[10px]" : "px-2.5 py-1.5 text-[11px]"}`}
                        style={{ background: selected ? theme.accent.primary : "transparent", color: selected ? theme.accent.onPrimary : theme.node.muted }}
                        onClick={() => onChange(option.value)}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}

function BatchReferenceHandles({
    columns,
    theme,
    onConnectStart,
    onConnectDrop,
}: {
    columns: ReturnType<typeof batchReferenceColumns>;
    theme: CanvasTheme;
    onConnectStart: (event: ReactPointerEvent, handleId: string) => void;
    onConnectDrop?: (event: ReactPointerEvent, handleId: string) => void;
}) {
    const commonStyle = { left: 0, width: 36, height: 36, transform: "translate(-50%, -50%)", transformOrigin: "center" };
    return (
        <>
            {columns.map((column, index) => (
                <BatchReferenceHandle
                    key={column.id}
                    column={column}
                    index={index}
                    theme={theme}
                    commonStyle={commonStyle}
                    onConnectStart={onConnectStart}
                    onConnectDrop={onConnectDrop}
                />
            ))}
        </>
    );
}

function BatchReferenceHandle({
    column,
    index,
    theme,
    commonStyle,
    onConnectStart,
    onConnectDrop,
}: {
    column: { id: string; label: string };
    index: number;
    theme: CanvasTheme;
    commonStyle: { left: number; width: number; height: number; transform: string; transformOrigin: string };
    onConnectStart: (event: ReactPointerEvent, handleId: string) => void;
    onConnectDrop?: (event: ReactPointerEvent, handleId: string) => void;
}) {
    const [hovered, setHovered] = useState(false);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const handleId = batchReferenceHandleId(column.id);
    const reset = useCallback(() => {
        setHovered(false);
        setOffset({ x: 0, y: 0 });
    }, []);
    const update = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const dx = event.clientX - (bounds.left + bounds.width / 2);
        const dy = event.clientY - (bounds.top + bounds.height / 2);
        const limit = 10;
        setOffset({ x: Math.max(-limit, Math.min(limit, dx)), y: Math.max(-limit, Math.min(limit, dy)) });
    }, []);
    return (
        <Tooltip title={`连接到${column.label}`} placement="left">
            <button
                type="button"
                aria-label={`${column.label}连线点`}
                className="group absolute z-[var(--node-z-handle)] grid place-items-center rounded-full outline-none"
                style={{ ...commonStyle, top: BATCH_REFERENCE_HANDLE_TOP + index * BATCH_REFERENCE_HANDLE_GAP, cursor: "crosshair" }}
                onPointerEnter={(event) => {
                    setHovered(true);
                    update(event);
                }}
                onPointerMove={update}
                onPointerLeave={reset}
                onPointerDown={(event) => {
                    event.stopPropagation();
                    onConnectStart(event, handleId);
                }}
                onPointerUp={(event) => {
                    event.stopPropagation();
                    onConnectDrop?.(event, handleId);
                }}
            >
                <span
                    className="grid size-[18px] place-items-center rounded-full border text-[8px] font-semibold shadow-sm transition-transform duration-100 group-hover:scale-125 group-focus-visible:scale-125"
                    style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${hovered ? 1.06 : 1})`, background: theme.node.panel, borderColor: theme.accent.primary, color: theme.accent.primary }}
                >
                    {index + 1}
                </span>
            </button>
        </Tooltip>
    );
}

function batchRowMentionReferences(
    row: CanvasBatchRow,
    columns: ReturnType<typeof batchReferenceColumns>,
    nodeById: Map<string, CanvasNodeData>,
): CanvasResourceReference[] {
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

function StandardReferenceThumbnail({
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
    onPickFile,
    onUploadFile,
    onPointerDown,
    onPreview,
    onClear,
    onCopy,
    // @opc-feature: batch-table-slot-operations [start]
    isDragOver,
    isDragOverCopy,
    onDragCellStart,
    onDragCellEnd,
    onDragCellOver,
    onDragCellLeave,
    onAssignReferenceNode,
    onCopyReferenceCell,
    onMoveReferenceCell,
    // @opc-feature: batch-table-slot-operations [end]
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
    isDraggingCell: boolean;
    onPickFile: () => void;
    onUploadFile: (file: File) => void;
    onPointerDown: (event: ReactPointerEvent) => void;
    onPreview: (url: string) => void;
    onClear?: () => void;
    onCopy?: () => void;
    // @opc-feature: batch-table-slot-operations [start]
    isDragOver?: boolean;
    isDragOverCopy?: boolean;
    onDragCellStart?: (rowId: string, columnIndex: number) => void;
    onDragCellEnd?: () => void;
    onDragCellOver?: (rowId: string, columnIndex: number, isCopy: boolean) => void;
    onDragCellLeave?: () => void;
    onAssignReferenceNode?: (referenceNodeId: string) => void;
    onCopyReferenceCell?: (sourceRowId: string, sourceCol: number, targetRowId: string, targetCol: number) => void;
    onMoveReferenceCell?: (sourceRowId: string, sourceCol: number, targetRowId: string, targetCol: number) => void;
    // @opc-feature: batch-table-slot-operations [end]
}) {
    const clipboardItem = useBatchReferenceClipboard((state) => state.clipboard);
    const filled = Boolean(node && hasNodeMedia(node));
    const mediaUrl = (node?.metadata?.previewContent || node?.metadata?.content || "") as string;
    const fallback = <EmptyThumbnail theme={theme} />;

    // @opc-feature: batch-table-slot-canvas-picker [start]
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
    // @opc-feature: batch-table-slot-canvas-picker [end]

    const handlePreview = async () => {
        if (!filled) {
            if (!readOnly) onPickFile();
            return;
        }
        let url = mediaUrl;
        if (!url && node?.metadata?.storageKey) {
            url = await resolveImageUrl(node.metadata.storageKey);
        }
        if (url) onPreview(url);
    };

    // @opc-feature: batch-table-slot-operations [start]
    const handlePaste = useCallback(async () => {
        if (readOnly) return;
        const copied = getBatchReferenceClipboard();
        if (copied?.nodeId) {
            onAssignReferenceNode?.(copied.nodeId);
            message.success(`已粘贴并复用素材：${copied.title || "参考图"}`);
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
    // @opc-feature: batch-table-slot-operations [end]

    return (
        <Tooltip title={filled ? `${label} · ${node?.title || "图片"} (点击放大查看 · Ctrl+C 复制 / Backspace 清除)` : `${label} · 点击上传或拖入图片 (可 Ctrl+V 粘贴)`}>
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
                onClick={(event) => {
                    event.stopPropagation();
                    void handlePreview();
                }}
                // @opc-feature: batch-table-slot-operations [start]
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
                        void handlePreview();
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
                // @opc-feature: batch-table-slot-operations [end]
            >
                {filled ? (
                    <CachedResourceImage
                        eager
                        draggable={false}
                        src={mediaUrl}
                        storageKey={node?.metadata?.storageKey}
                        alt={node?.title || "参考图"}
                        className="block size-full max-h-full max-w-full object-cover select-none pointer-events-none"
                        fallback={fallback}
                    />
                ) : fallback}
                <span
                    className="absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 text-xs font-semibold text-white shadow-sm pointer-events-none transition-opacity group-hover/cell:opacity-0"
                    style={{ background: "rgba(0,0,0,.72)" }}
                >
                    {label}
                </span>
                {!readOnly && !filled && (
                    <>
                        {/* @opc-feature: batch-table-slot-canvas-picker [start] */}
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
                        {/* @opc-feature: batch-table-slot-canvas-picker [end] */}
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
                            {/* @opc-feature: batch-table-slot-canvas-picker [start] */}
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
                            {/* @opc-feature: batch-table-slot-canvas-picker [end] */}
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
                        <div
                            className="absolute top-1 right-1 z-20 hidden group-hover/cell:flex"
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <Tooltip title="移除素材 (同步清理连线)" placement="bottom">
                                <button
                                    type="button"
                                    aria-label="移除素材"
                                    className="grid size-6 place-items-center rounded-full bg-red-500/85 text-white hover:bg-red-600 hover:scale-110 active:scale-95 shadow-sm border border-red-400/40 backdrop-blur-[2px] transition-all cursor-pointer"
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
                        </div>
                    </>
                )}
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

function StandardResultThumbnail({
    output,
    status,
    theme,
    onFocus,
}: {
    output?: CanvasNodeData;
    status: ReturnType<typeof rowStatus>;
    theme: CanvasTheme;
    onFocus: () => void;
}) {
    const filled = Boolean(output && hasNodeMedia(output));
    const tone = statusColor(status.tone, theme.node.stroke);
    const title = filled ? `${status.label} · 点击定位到画布图片节点` : status.label;
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
                    <CachedResourceImage
                        eager
                        src={mediaUrl}
                        storageKey={output.metadata?.storageKey}
                        alt="生成结果"
                        className="block size-full max-h-full max-w-full object-cover"
                        fallback={<EmptyThumbnail theme={theme} compact />}
                    />
                ) : (
                    <EmptyThumbnail theme={theme} compact />
                )}
                {status.loading ? (
                    <span className="absolute inset-0 grid place-items-center bg-black/35">
                        <LoaderCircle className="size-5 animate-spin" style={{ color: tone }} />
                    </span>
                ) : null}
                <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full" style={{ background: tone }} />
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
    return (
        <div
            className="grid shrink-0 place-items-center rounded-xl border border-dashed size-full"
            style={{ borderColor: theme.node.stroke, color: theme.node.placeholder, background: `color-mix(in srgb, ${theme.node.text} 3%, transparent)` }}
        >
            {compact ? (
                <ImageIcon className="size-6" />
            ) : (
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
    if (item && ["waiting", "submitting", "queued", "running"].includes(item.status)) {
        return {
            label: item.status === "waiting" ? "等待中" : item.status === "submitting" ? "正在提交" : item.status === "queued" ? "已排队" : "生成中",
            tone: "loading",
            loading: true,
            retryable: false,
        };
    }
    if (output?.metadata?.status === "error") return { label: output.metadata.errorDetails || "生成失败", tone: "error", loading: false, retryable: false };
    return { label: "待生成", tone: "idle", loading: false, retryable: false };
}
