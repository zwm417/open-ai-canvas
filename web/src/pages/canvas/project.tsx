import { CanvasWorkspacePanel } from "@/components/canvas/canvas-workspace-panel";
import { isCanvasNodeGenerating } from "@/lib/canvas/canvas-node-task-state";
import { canCancelGenerationTask } from "@/lib/generation-task-display";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MouseEvent as ReactMouseEvent, SetStateAction } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router";
import { loadAssetsForUse } from "@/services/user-data-sync";
import { canvasAssetHandoffIds } from "@/lib/canvas/canvas-asset-handoff";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { uploadMediaFile } from "@/services/file-storage";
import { createCanvasGenerationLiveProjectAdapter, registerCanvasGenerationLiveProject } from "@/services/canvas-generation-consumer";
import { getActiveUserScope } from "@/lib/user-scope";
import { getResourceAccess, resolveResourceAccessURL, resourceFileUrl, resourceIdFromStorageKey, syncResourceToArkPrivateAsset } from "@/services/api/resources";
import { uploadImage } from "@/services/image-storage";
import { imageMetadata } from "@/lib/canvas/canvas-generation-task-sync";
import { isCanvasImageSourceNode } from "@/lib/canvas/canvas-image-source";
import { getCachedResourceBlob } from "@/services/resource-blob-cache";
import copyToClipboard from "copy-to-clipboard";
import { nanoid } from "nanoid";
import { canvasAppearanceBaseTheme, canvasAppearanceForTheme, DEFAULT_CANVAS_BACKGROUND_MODE, normalizeCanvasAppearance, resolveCanvasAppearance, writeCanvasAppearanceDefault, type CanvasAppearance } from "@/lib/canvas/canvas-appearance";
import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { persistCanvasMediaPerformanceMode, readCanvasMediaPerformanceMode } from "@/lib/canvas/canvas-performance-mode";
import { filterCanvasDisplayConnections, persistCanvasHideNodeConnections, readCanvasHideNodeConnections } from "@/lib/canvas/canvas-connection-visibility";
import { summarizeCanvasContext } from "@/lib/canvas/canvas-context-summary";
import { refreshCanvasCharacterReferenceNodes } from "@/lib/canvas/canvas-character-reference";
import { useAssetStore } from "@/stores/use-asset-store";
import { flushCanvasStorePersistence } from "@/stores/canvas/use-canvas-store";
import { ensureCanvasNodeAsset } from "@/services/project-asset-sync";
import { useCanvasThemeStore, useCanvasThemeScope } from "@/stores/canvas/use-canvas-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { App, Button } from "antd";
import { ArrowLeftRight } from "lucide-react";
import { AppModal } from "@/components/ui/product/app-modal";
import { getNodeSpec } from "@/constant/canvas";
import { CanvasConfigComposer } from "@/components/canvas/canvas-config-composer";
import { CanvasConfigNodePanel } from "@/components/canvas/canvas-config-node-panel";
import { CanvasCloudAgentPanel } from "@/components/canvas/canvas-cloud-agent-panel";
import { CanvasActiveTaskPanel } from "@/components/canvas/canvas-active-task-panel";
import { CanvasProjectSidebar } from "@/components/canvas/canvas-project-sidebar";
import { CanvasProjectAssetModal } from "@/components/canvas/canvas-project-asset-modal";
import { CanvasCharacterReferenceNodeContent } from "@/components/canvas/canvas-character-reference-node";
import { CanvasCharacterReferenceModal } from "@/components/canvas/canvas-character-reference-modal";
import { WorkspaceState } from "@/components/layout/workspace-state";
import { resolveProjectCanvasStyle } from "@/components/canvas/canvas-style-picker-modal";
import { createStyleProfileSnapshot, resolveStyleProfile, serializeStyleProfile } from "@/lib/canvas/style-profile";
import { CanvasNodeToolbar, CanvasNodeInfoModal } from "@/components/canvas/canvas-node-toolbar";
import { CanvasSubtitleDialog } from "@/components/canvas/canvas-subtitle-dialog";
import { CanvasVideoFrameDialog } from "@/components/canvas/canvas-video-frame-dialog";
import { CanvasVideoSegmentDialog } from "@/components/canvas/canvas-video-segment-dialog";
import { CanvasTimelineDialog } from "@/components/canvas/canvas-timeline-dialog";
import { syncNodeSubtitlesToTimeline } from "@/lib/timeline/timeline-build";
import { CanvasNodeAnglePanel } from "@/components/canvas/canvas-node-angle-dialog";
import { CanvasNodeLightingPanel } from "@/components/canvas/canvas-node-lighting-dialog";
import { CanvasTextEditorModal } from "@/components/canvas/canvas-text-editor-modal";
import { CanvasNodeSearchModal } from "@/components/canvas/canvas-node-search-modal";
import { CanvasStylePickerModal } from "@/components/canvas/canvas-style-picker-modal";
import { CanvasDirectorTemplateModal } from "@/components/canvas/director/canvas-director-template-modal";
import { CanvasFileDropOverlay } from "@/components/canvas/canvas-file-drop-overlay";
import { CanvasUploadModal } from "@/components/canvas/canvas-upload-modal";
import { CanvasPanoramaConfigModal } from "@/components/canvas/canvas-panorama-config-modal";
import { InfiniteCanvas } from "@/components/canvas/infinite-canvas";
import { Minimap } from "@/components/canvas/canvas-mini-map";
import { CanvasNodePromptPanel, type CanvasNodeGenerationMode } from "@/components/canvas/canvas-node-prompt-panel";
import { handleListGenerate } from "./list-mode-generator";
import { CanvasToolbar } from "@/components/canvas/canvas-toolbar";
import { useCanvasCreateCommands } from "@/components/canvas/use-canvas-create-commands";
import { AssetPickerModal } from "@/components/canvas/asset-picker-modal";
import { getProject } from "@/services/api/projects";
import { CanvasZoomControls } from "@/components/canvas/canvas-zoom-controls";
import { CanvasShareModal } from "@/components/canvas/canvas-share-modal";
import { CanvasScriptEditor, CanvasScriptNodeContent } from "@/components/canvas/canvas-script-node";
// @opc-feature: video-reverse-project-import [start]
import { VIDEO_REVERSE_NODE_TYPE } from "@/extensions/opc-infinite/services/video-reverse-contracts";
import {
    CREATION_ASSISTANT_ANALYSIS_NODE_TYPE,
    CREATION_ASSISTANT_REF_SCRIPT_NODE_TYPE,
} from "@/extensions/opc-infinite/services/creation-assistant-contracts";
// @opc-feature: video-reverse-project-import [end]
// @opc-feature: standard-batch-table-project-import [start]
import { STANDARD_BATCH_TABLE_NODE_TYPE } from "@/extensions/standard-batch-table/contracts";
import { StandardBatchTableNodeContent } from "@/extensions/standard-batch-table/components/standard-batch-table-node";
// @opc-feature: standard-batch-table-project-import [end]
// @opc-feature: creative-asset-table-project-import [start]
import { CREATIVE_ASSET_TABLE_NODE_TYPE } from "@/extensions/creative-asset-table/contracts";
// @opc-feature: creative-asset-table-project-import [end]
// @opc-feature: creative-voice-table-project-import [start]
import {
    CREATIVE_VOICE_TABLE_NODE_TYPE,
    CREATIVE_VOICE_REF_COLUMNS,
    CREATIVE_VOICE_TEXT_COLUMNS,
    type VoiceSlotMode,
} from "@/extensions/creative-voice-table/contracts";
import { CreativeVoiceTableNodeContent } from "@/extensions/creative-voice-table/components/creative-voice-table-node";
import { syncVoiceTableRowsToStoryboard } from "@/extensions/creative-voice-table/services/creative-voice-storyboard-sync";
import { syncMasterTableRowsToStoryboard } from "@/lib/canvas/creative-master-storyboard-sync";
import { resolveDualTextForSpeech, resolveDualTextForDisplay } from "@/extensions/opc-infinite/prompts/hypit-director-prompts";
// @opc-feature: creative-voice-table-project-import [end]
// @opc-feature: creative-storyboard-table-project-import [start]
import { CREATIVE_STORYBOARD_TABLE_NODE_TYPE } from "@/extensions/creative-storyboard-table/contracts";
// @opc-feature: creative-storyboard-table-project-import [end]
import {
    groupShotsIntoVideoSegments,
    buildShotReferenceScript,
    cleanCreativePromptText,
    formatShotTimeRange,
} from "@/lib/creation-assistant-segmentation";
import { resolveChannelVideoModelMaxDuration } from "@/lib/model-capabilities";
import { requestAudioGeneration, storeGeneratedAudio } from "@/services/api/audio";
import { CanvasBatchTableNodeContent } from "@/components/canvas/canvas-batch-table-node";
import { BatchGenerationSettingsDialog } from "@/components/canvas/batch-generation-settings-dialog";
import { batchReferenceColumns, batchReferenceHandleId, promoteLegacyBatchTableSize } from "@/lib/canvas/canvas-batch-table";
import { STORYBOARD_HEADER_HEIGHT, STORYBOARD_ROW_HEIGHT, storyboardMinNodeHeight, storyboardTableHeight } from "@/lib/canvas/canvas-storyboard-layout";
import { CanvasDirectorNodePanel } from "@/components/canvas/director/canvas-director-node-panel";
import { CanvasVersionCompareModal } from "@/components/canvas/canvas-version-compare-modal";
import { useFocusMode } from "@/hooks/use-focus-mode";
import { connectCanvasTextMention } from "@/lib/canvas/canvas-text-mention";
import { writeCanvasNodePrompt } from "@/lib/canvas/canvas-node-prompt";
import {
    applyCanvasConnectionPromptSync,
    buildCanvasAgentMentionReferences,
    canvasResourceMentionToken,
    buildCanvasNodeMentionReferenceMap,
    buildCanvasResourceReferences,
    getContextResourceNodes,
    normalizeCanvasNodeMentionTokens,
    reorderCanvasResourceConnections,
    replaceCanvasReferenceMentions,
    type CanvasResourceReference,
} from "@/lib/canvas/canvas-resource-references";
import { CanvasConnectionCreateMenu, CanvasNodePanelOverlay, type PendingConnectionCreate } from "@/components/canvas/canvas-workspace-overlays";
import { CanvasOverlayLayerContainer, CanvasOverlayLayerProvider } from "@/components/canvas/canvas-overlay-layer";
import { CanvasLeaferGraphicsLayer } from "@/components/canvas/canvas-leafer-graphics-layer";
import { CanvasFreeformEmptyState, CanvasLinkedProjectEmptyState, CanvasShortDramaEmptyState, CanvasShortDramaGuide, CanvasStoryInputNodeContent, CanvasStylePlaceholderNodeContent } from "@/components/canvas/canvas-short-drama-entry";
import { resolveCanvasEmptyStateKind } from "@/lib/canvas/canvas-starter";
import { failedImageBatchChildren, markImageBatchRetrying, reconcileImageBatchRoot, restoreUnsubmittedImageBatchChild } from "@/lib/canvas/canvas-image-batch-retry";
import { cinematicStoryboardColumns, createCanvasNode, getInputSummary, isHiddenBatchChild } from "@/lib/canvas/canvas-project-domain";
import { bindStoryboardKeyframes, storyboardKeyframeTime, storyboardRowsFromBatchTable } from "@/lib/canvas/canvas-batch-storyboard";
import { stampCanvasNodeChanges, updateCanvasNode, updateCanvasNodes } from "@/lib/canvas/canvas-node-timestamps";
import { canvasAssetHandoffAttempt, finalizeCanvasAssetHandoff, uninsertedCanvasAssetHandoffPayloads } from "@/lib/canvas/canvas-asset-handoff";
import { batchSourceRestriction } from "@/lib/canvas/canvas-batch-connection";
import { deriveStoryboardPipelineProgress } from "@/lib/canvas/canvas-storyboard-progress";
import { CanvasOperationChangeToast, CanvasMergeStatusToast, CanvasUploadStatusToast } from "./canvas-project-feedback";
import { backendProviderConfig, getGenerationCount } from "@/lib/canvas/canvas-project-generation";
import { cancelGenerationTask } from "@/services/api/task-center";
import { CanvasSyncStatus } from "./canvas-sync-status";
import { CanvasVersionHistory, useCanvasVersionHistory } from "./canvas-version-history";
import { CanvasVersionPreview } from "./canvas-version-preview";
import { CanvasTopBar } from "./canvas-project-top-bar";
import { LibTVImportDialog } from "./components/libtv-import-dialog";
import { TapNowImportDialog } from "./components/tapnow-import-dialog";
import { CanvasFocusModeBar } from "@/components/canvas/canvas-focus-mode-bar";
import { CanvasProjectContextMenu } from "./canvas-project-context-menu";
import { CanvasProjectMediaDialogs } from "./canvas-project-media-dialogs";
import { CanvasProjectSelectionToolbar } from "./canvas-project-selection-toolbar";
import { CanvasProjectStatusDialogs } from "./canvas-project-status-dialogs";
import { CanvasProjectWorldLayers } from "./canvas-project-world-layers";
import { CanvasNodeActionContext, type CanvasNodeActionContextValue } from "@/components/canvas/canvas-node-action-context";
import { bringCanvasNodeToFront, type CanvasNodeStackOrder } from "@/lib/canvas/canvas-node-stack-order";
import { AiArtCritiqueModal } from "@/components/canvas/art-critique/ai-art-critique-modal";
import { CanvasNodeGraphContext, type CanvasNodeGraphContextValue } from "@/components/canvas/canvas-node-graph-context";
import { CanvasRefreshShell } from "./canvas-refresh-shell";
import { queryGenerationTask } from "@/services/api/task-center";
import type { CanvasImageEmotionPayload } from "@/components/canvas/canvas-node-emotion-panel";
import { CanvasEmotionWorkspace } from "@/components/canvas/canvas-emotion-workspace";
import { removeCanvasDrawing } from "@/lib/canvas/canvas-drawing-storage";
import { useCanvasConnectionController } from "./use-canvas-connection-controller";
import { useCanvasOperationHistory } from "./use-canvas-operation-history";
import { useCanvasAssistantVisibility } from "./use-canvas-assistant-visibility";
import { useCanvasActiveTasks } from "./use-canvas-active-tasks";
import { useCanvasStyleWorkflow } from "./use-canvas-style-workflow";
import { useCanvasDirector } from "./use-canvas-director";
import { useCanvasGeneration } from "./use-canvas-generation";
import { useCanvasGenerationBatches } from "./use-canvas-generation-batches";
import { useCanvasBatchTable } from "./use-canvas-batch-table";
import { useCanvasGenerationExecutor, type CanvasNodeGenerationOptions } from "./use-canvas-generation-executor";
import { useCanvasGenerationRetry } from "./use-canvas-generation-retry";
import { useCanvasHistory } from "./use-canvas-history";
import { useCanvasKeyboard } from "./use-canvas-keyboard";
import { useCanvasMediaTools } from "./use-canvas-media-tools";
import { useCanvasNodeEditor } from "./use-canvas-node-editor";
import { useCanvasNodeOperations } from "./use-canvas-node-operations";
import { useCanvasProjectLifecycle } from "./use-canvas-project-lifecycle";
import { useCanvasRenderModel } from "./use-canvas-render-model";
import { useCanvasSelectionController } from "./use-canvas-selection-controller";
import { useCanvasShortDrama } from "./use-canvas-short-drama";
import { useCanvasStoryboard } from "./use-canvas-storyboard";
import { useCanvasUpload } from "./use-canvas-upload";
import { useCanvasTimelineAssetInsert } from "./use-canvas-timeline-asset-insert";
import { useCanvasViewportController } from "./use-canvas-viewport-controller";
import {
    CanvasNodeType,
    type CanvasAssistantSession,
    type CanvasBatchReferenceColumn,
    type CanvasBatchRow,
    type CanvasBatchTableData,
    type CanvasConnection,
    type CanvasFolderStyle,
    type CanvasFolderTheme,
    type CanvasNodeData,
    type CanvasNodeMetadata,
    type CanvasMediaPerformanceMode,
    type StoryboardColumn,
    type StoryboardShotCount,
    type StoryboardShotDuration,
    type CanvasWorkflowKind,
    type CanvasWorkspaceMode,
    type CanvasToolMode,
    type ContextMenuState,
    type Position,
    type ViewportTransform,
} from "@/types/canvas";
import type { ReferenceImage } from "@/types/image";
import { ART_CRITIQUE_NODE_TYPE } from "@/lib/art-critique/contracts";
// @opc-feature: opc-task-hub [start]
import { cancelAllNodeTasks, cancelNodeTask, isNodeTaskRunning } from "@/extensions/opc-infinite/services/opc-task-hub";
// @opc-feature: opc-task-hub [end]

const CanvasDirectorWorkbench = lazy(() => import("@/components/canvas/director/canvas-director-workbench").then((module) => ({ default: module.CanvasDirectorWorkbench })));
const CanvasDrawingEditorModal = lazy(() => import("@/components/canvas/canvas-drawing-editor-modal").then((module) => ({ default: module.CanvasDrawingEditorModal })));

const NODE_STATUS_SUCCESS = "success" as const;
const EMPTY_RESOURCE_REFERENCES: CanvasResourceReference[] = [];


async function copyImageToSystemClipboard(source: string, storageKey?: string) {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) throw new Error("当前浏览器不支持复制图片");
    if (typeof window !== "undefined") window.focus();

    const fetchPNG = async (): Promise<Blob> => {
        let sourceBlob: Blob | null = null;
        if (storageKey) {
            sourceBlob = await getCachedResourceBlob(storageKey).catch(() => null);
            // A resource-backed image must be read through the resource access
            // contract. Do not fall back to fetch(source) here: local/proxy
            // deliveries may require the session cookie and a separate API
            // origin, while CDN deliveries must omit that cookie.
            if (!sourceBlob) throw new Error("图片资源读取失败");
        }
        if (!sourceBlob) {
            const response = await fetch(source);
            if (!response.ok) throw new Error(`图片读取失败（HTTP ${response.status}）`);
            sourceBlob = await response.blob();
        }
        return sourceBlob.type === "image/png" ? sourceBlob : await convertClipboardImageToPNG(sourceBlob);
    };

    // 优先尝试将 Promise 直接传给 ClipboardItem（现代浏览器标准），在用户激活手势内立即声明写入，
    // 避免因 fetch / 格式转换耗时导致手势过期或窗口失焦抛出 "Document is not focused" 错误。
    try {
        const item = new ClipboardItem({ "image/png": fetchPNG() });
        await navigator.clipboard.write([item]);
        return;
    } catch {
        // 部分浏览器环境不支持延迟 Promise，回退到先取 Blob 再写入
    }

    const blob = await fetchPNG();
    if (typeof window !== "undefined") window.focus();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

async function convertClipboardImageToPNG(blob: Blob) {
    if (typeof createImageBitmap !== "function") throw new Error("当前浏览器无法转换这张图片的格式");
    const bitmap = await createImageBitmap(blob);
    try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("当前浏览器无法处理这张图片");
        context.drawImage(bitmap, 0, 0);
        return await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("图片格式转换失败"))), "image/png"));
    } finally {
        bitmap.close();
    }
}

function visibleGenerationBatch(node: CanvasNodeData) {
    const batches = node.metadata?.generationBatches || [];
    for (let index = batches.length - 1; index >= 0; index -= 1) {
        if (batches[index].status === "queued" || batches[index].status === "running") return batches[index];
    }
    return batches.at(-1);
}

export default function CanvasPage() {
    useCanvasThemeScope();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <CanvasRefreshShell />;

    return <InfiniteCanvasPage />;
}

function InfiniteCanvasPage() {
    // 命令式确认必须走 App.useApp().modal；静态 Modal.confirm 拿不到主题和 App 上下文。
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const params = useParams<{ id: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const projectId = params.id || "";
    const canvasStorageScope = getActiveUserScope();
    const containerRef = useRef<HTMLDivElement>(null);
    const didInitialCenterRef = useRef(false);
    const toolbarHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const assetHandoffRef = useRef("");

    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const assets = useAssetStore((state) => state.assets);
    const assetsHydrated = useAssetStore((state) => state.hydrated);
    const cleanupAssetImages = useAssetStore((state) => state.cleanupImages);
    const colorTheme = useCanvasThemeStore((state) => state.theme);
    const setTheme = useCanvasThemeStore((state) => state.setTheme);
    const theme = canvasThemes[colorTheme];
    const defaultDrawingEngine = useUserStore((state) => state.drawingEngine.defaultEngine);
    const shortDramaEnabled = useUserStore((state) => state.features.shortDramaEnabled);
    const directorOnboardingScope = useUserStore((state) => state.user?.id?.trim() || "");
    const nodesRef = useRef<CanvasNodeData[]>([]);
    const [nodes, setNodesState] = useState<CanvasNodeData[]>([]);
    const setNodes = useCallback<Dispatch<SetStateAction<CanvasNodeData[]>>>((value) => {
        if (typeof value === "function") {
            setNodesState((current) => {
                const next = stampCanvasNodeChanges(current, value(current));
                nodesRef.current = next;
                return next;
            });
            return;
        }
        const next = stampCanvasNodeChanges(nodesRef.current, value);
        nodesRef.current = next;
        setNodesState(next);
    }, []);
    const [nodeStackOrder, setNodeStackOrder] = useState<CanvasNodeStackOrder>([]);
    const bringNodeToFront = useCallback((nodeId: string) => {
        setNodeStackOrder((current) => bringCanvasNodeToFront(current, nodeId));
    }, []);
    const [connections, setConnections] = useState<CanvasConnection[]>([]);
    const [chatSessions, setChatSessions] = useState<CanvasAssistantSession[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, k: 1 });
    const [size, setSize] = useState({ width: 1200, height: 720 });
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [agentPrefillPrompt, setAgentPrefillPrompt] = useState("");
    const [isMiniMapOpen, setIsMiniMapOpen] = useState(false);
    const [canvasAppearance, setCanvasAppearance] = useState<CanvasAppearance>(() => canvasAppearanceForTheme(colorTheme));
    const [backgroundMode, setBackgroundMode] = useState<CanvasBackgroundMode>(DEFAULT_CANVAS_BACKGROUND_MODE);
    const [showImageInfo, setShowImageInfo] = useState(false);
    const [canvasTool, setCanvasTool] = useState<CanvasToolMode>("box-select");
    const [mediaPerformanceMode, setMediaPerformanceMode] = useState<CanvasMediaPerformanceMode>(readCanvasMediaPerformanceMode);
    const [hideNodeConnections, setHideNodeConnections] = useState(readCanvasHideNodeConnections);
    const [projectLoaded, setProjectLoaded] = useState(false);
    const workspaceMode: CanvasWorkspaceMode = "professional";
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [tapNowImportOpen, setTapNowImportOpen] = useState(false);
    const [nodeSearchOpen, setNodeSearchOpen] = useState(false);
    const [toolbarNodeId, setToolbarNodeId] = useState<string | null>(null);
    const [arkPrivateAssetUploadNodeId, setArkPrivateAssetUploadNodeId] = useState<string | null>(null);
    const [nodeImageSettingsOpen, setNodeImageSettingsOpen] = useState(false);
    const [dialogNodeId, setDialogNodeId] = useState<string | null>(null);
    const [textEditorNodeId, setTextEditorNodeId] = useState<string | null>(null);
    const [characterReferenceNodeId, setCharacterReferenceNodeId] = useState<string | null>(null);
    const [drawingNodeId, setDrawingNodeId] = useState<string | null>(null);
    const [stylePickerOpen, setStylePickerOpen] = useState(false);
    // 新建导演台镜头必须先选模板：null 表示未在选择中，undefined position 表示用画布中心。
    const [directorTemplateRequest, setDirectorTemplateRequest] = useState<{ position?: Position } | null>(null);
    const [infoNodeId, setInfoNodeId] = useState<string | null>(null);
    const [subtitleNodeId, setSubtitleNodeId] = useState<string | null>(null);
    const [timelineNodeId, setTimelineNodeId] = useState<string | null>(null);
    const [superResolveNodeId, setSuperResolveNodeId] = useState<string | null>(null);
    const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
    const [scriptEditorNodeId, setScriptEditorNodeId] = useState<string | null>(null);
    const [artCritiqueNodeId, setArtCritiqueNodeId] = useState<string | null>(null);
    const artCritiqueRunningRef = useRef(false);
    const [artCritiqueStartRequest, setArtCritiqueStartRequest] = useState<{ nodeId: string; id: string; restart: boolean } | null>(null);
    const [scriptScrollTopById, setScriptScrollTopById] = useState<Record<string, number>>({});
    const [directorNodeId, setDirectorNodeId] = useState<string | null>(null);
    const [versionCompareRootId, setVersionCompareRootId] = useState<string | null>(null);
    const [libTVImportOpen, setLibTVImportOpen] = useState(false);
    const [titleEditing, setTitleEditing] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");
    const [shortcutRequestNonce, setShortcutRequestNonce] = useState(0);
    const [cinematicAgentEntry, setCinematicAgentEntry] = useState(false);
    const { assistantOpen, closeAgent, openAgent: openAssistant } = useCanvasAssistantVisibility();
    const agentMentionReferences = useMemo(() => buildCanvasAgentMentionReferences(nodes), [nodes]);

    const { tasks: activeTasks } = useCanvasActiveTasks(projectId, projectLoaded);
    const { focusMode, enterFocusMode, exitFocusMode, toggleFocusMode } = useFocusMode();
    const [focusDockRevealed, setFocusDockRevealed] = useState(false);

    useEffect(() => {
        persistCanvasMediaPerformanceMode(mediaPerformanceMode);
    }, [mediaPerformanceMode]);

    useEffect(() => {
        persistCanvasHideNodeConnections(hideNodeConnections);
    }, [hideNodeConnections]);

    useEffect(() => {
        didInitialCenterRef.current = false;
        setNodeStackOrder([]);
    }, [projectId]);

    useEffect(() => {
        const nodeIds = new Set(nodes.map((node) => node.id));
        setNodeStackOrder((current) => {
            const next = current.filter((nodeId) => nodeIds.has(nodeId));
            return next.length === current.length ? current : next;
        });
    }, [nodes]);

    const connectionsRef = useRef(connections);
    const chatSessionsRef = useRef(chatSessions);
    const activeChatIdRef = useRef(activeChatId);
    const selectedNodeIdsRef = useRef(selectedNodeIds);
    const viewportRef = useRef(viewport);
    const [workspaceOpen, setWorkspaceOpen] = useState(false);
    const generateNodeRef = useRef<((nodeId: string, mode: CanvasNodeGenerationMode, prompt: string, options?: CanvasNodeGenerationOptions) => Promise<void>) | null>(null);

    useEffect(() => {
        if (!projectId) return;
        return registerCanvasGenerationLiveProject({
            scope: canvasStorageScope,
            projectId,
            adapter: createCanvasGenerationLiveProjectAdapter({ nodesRef, connectionsRef, chatSessionsRef, activeChatIdRef, setNodes, setConnections, setChatSessions, setActiveChatId }),
        });
    }, [canvasStorageScope, projectId]);

    const resolvedCanvasAppearance = useMemo(() => resolveCanvasAppearance(canvasAppearance, colorTheme), [canvasAppearance, colorTheme]);
    const applyCanvasAppearance = useCallback(
        (next: CanvasAppearance) => {
            const fallback = canvasAppearanceBaseTheme(next, colorTheme);
            const normalized = normalizeCanvasAppearance(next, fallback);
            setCanvasAppearance(normalized);
            setTheme(canvasAppearanceBaseTheme(normalized, fallback));
        },
        [colorTheme, setTheme],
    );
    const saveCanvasAppearanceDefault = useCallback(
        (next: CanvasAppearance) => {
            writeCanvasAppearanceDefault({ appearance: next, backgroundMode });
            message.success("已保存为当前账号在本机的新建画布默认外观");
        },
        [backgroundMode, message],
    );

    const { getHistoryCleanupContext, historyPausedRef, historyState, redoCanvas, resetHistory, undoCanvas } = useCanvasHistory({
        projectLoaded,
        nodes,
        connections,
        chatSessions,
        activeChatId,
        canvasAppearance,
        backgroundMode,
        showImageInfo,
        setNodes,
        setConnections,
        setChatSessions,
        setActiveChatId,
        applyCanvasAppearance,
        setBackgroundMode,
        setShowImageInfo,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
    });

    const cleanupCanvasFiles = useCallback(
        (extra?: unknown) => {
            cleanupAssetImages({ extra, ...getHistoryCleanupContext() });
        },
        [cleanupAssetImages, getHistoryCleanupContext],
    );

    const { loadError, retryLoad, addedSkills, agentCreatedNodes, clearCanvasFiles, createAndOpenProject, currentProject, deleteCurrentProject, renameCurrentProject, reloadLatestCanvasProject, restoreCanvasProjectVersion, saveCanvasProject, forceSaveCanvasProject, updateProject } = useCanvasProjectLifecycle({
        projectId,
        projectLoaded,
        nodes,
        connections,
        chatSessions,
        activeChatId,
        canvasAppearance,
        backgroundMode,
        showImageInfo,
        viewport,
        nodesRef,
        connectionsRef,
        chatSessionsRef,
        activeChatIdRef,
        viewportRef,
        historyPausedRef,
        setNodes,
        setConnections,
        setChatSessions,
        setActiveChatId,
        setCanvasAppearance,
        setBackgroundMode,
        setShowImageInfo,
        setViewport,
        setProjectLoaded,
        resetHistory,
        cleanupAssetImages,
        cleanupCanvasFiles,
    });

    const versions = useCanvasVersionHistory(projectId, restoreCanvasProjectVersion);
    const openVersions = () => { closeAgent(); setVersionCompareRootId(null); versions.show(); };
    const openAgent = useCallback(() => { versions.close(); openAssistant(); }, [versions.close, openAssistant]);

    const sendSelectionToAgent = useCallback((nodeId?: string) => {
        const ids = nodeId ? [nodeId] : Array.from(selectedNodeIdsRef.current);
        const references = ids.map((id) => agentMentionReferences.find((reference) => reference.nodeId === id)).filter((reference): reference is CanvasResourceReference => Boolean(reference));
        if (!references.length) return;
        setAgentPrefillPrompt(`${references.map(canvasResourceMentionToken).join(" ")} `);
        openAgent();
        setContextMenu(null);
    }, [agentMentionReferences, openAgent]);
    // 修复素材关联仍遵守当前画布版本，不能替用户确认覆盖云端的新内容。
    const confirmForceSaveCanvas = useCallback(() => {
        modal.confirm({
            title: "修复素材关联并保存？",
            content: "核对画布媒体与素材库的关联，补齐缺失素材后保存。若云端已有新版本，会保留本地草稿并提示加载最新版。",
            okText: "修复并保存",
            cancelText: "取消",
            onOk: () => forceSaveCanvasProject(),
        });
    }, [forceSaveCanvasProject, modal]);

    const applyLibTVImport = useCallback(
        async (importedNodes: CanvasNodeData[], importedConnections: CanvasConnection[]) => {
            const previousNodes = nodesRef.current;
            const previousConnections = connectionsRef.current;
            const nextNodes = [...nodesRef.current, ...importedNodes];
            const nextConnections = [...connectionsRef.current, ...importedConnections];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            const saved = await saveCanvasProject({ requireRemote: false });
            if (!saved) {
                nodesRef.current = previousNodes;
                connectionsRef.current = previousConnections;
                setNodes(previousNodes);
                setConnections(previousConnections);
                throw new Error("画布保存失败，已撤销本次 LibTV 导入");
            }
        },
        [saveCanvasProject, setConnections, setNodes],
    );
    const applyTapNowImport = useCallback(
        async (importedNodes: CanvasNodeData[], importedConnections: CanvasConnection[]) => {
            const previousNodes = nodesRef.current;
            const previousConnections = connectionsRef.current;
            const nextNodes = [...nodesRef.current, ...importedNodes];
            const nextConnections = [...connectionsRef.current, ...importedConnections];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            const saved = await saveCanvasProject({ requireRemote: false });
            if (!saved) {
                nodesRef.current = previousNodes;
                connectionsRef.current = previousConnections;
                setNodes(previousNodes);
                setConnections(previousConnections);
                throw new Error("画布保存失败，已撤销本次 TapNow 导入");
            }
        },
        [saveCanvasProject, setConnections, setNodes],
    );
    const linkedProjectId = shortDramaEnabled ? currentProject?.projectId || "" : "";
    const linkedProjectQuery = useQuery({ queryKey: ["project", linkedProjectId], queryFn: () => getProject(linkedProjectId), enabled: Boolean(linkedProjectId) });
    const refetchLinkedProject = linkedProjectQuery.refetch;
    const archiveNodesToLinkedFolder = useCallback(
        (folder: CanvasNodeData, droppedNodes: CanvasNodeData[]) => {
            const folderId = folder.metadata?.folder?.assetFolderId;
            const domainProjectId = folder.metadata?.folder?.projectId || linkedProjectId;
            if (!folderId || !domainProjectId || !droppedNodes.length) return;
            void Promise.all(droppedNodes.map((node) => ensureCanvasNodeAsset({ canvasId: projectId, domainProjectId, folderId, node, source: "canvas-manual" })))
                .then((results) => {
                    const archivedByNodeId = new Map(droppedNodes.map((node, index) => [node.id, { assetId: results[index].assetId, content: node.metadata?.content, previousAssetId: node.metadata?.assetId }]));
                    setNodes((current) =>
                        current.map((node) => {
                            const archived = archivedByNodeId.get(node.id);
                            if (!archived || node.metadata?.content !== archived.content || node.metadata?.assetId !== archived.previousAssetId) return node;
                            return { ...node, metadata: { ...node.metadata, assetId: archived.assetId } };
                        }),
                    );
                    void refetchLinkedProject();
                    message.success(`已归档到“${folder.title}”`);
                })
                .catch((error) => message.error(error instanceof Error ? error.message : "素材归档失败"));
        },
        [linkedProjectId, message, projectId, refetchLinkedProject, setNodes],
    );
    useEffect(() => {
        if (!projectLoaded || !linkedProjectQuery.data) return;
        setNodes((current) => refreshCanvasCharacterReferenceNodes(current, linkedProjectQuery.data.assets));
    }, [linkedProjectQuery.data, projectLoaded, setNodes]);
    const canvasContext = useMemo(() => summarizeCanvasContext(nodes, selectedNodeIds, linkedProjectQuery.data?.units), [linkedProjectQuery.data?.units, nodes, selectedNodeIds]);
    // 扩展节点（对比/图表/调色）要读自己的上游才能渲染，经 Context 下发；
    // 取上游复用 canvas-resource-references 的实现，别在这里另写一份。必须 memo——
    // 每帧新对象会让所有节点跟着重渲染，错题本里多条崩溃都出在画布高频更新。
    // @opc-feature: canvas-node-graph-downstream-actions [start]
    const nodeGraphContext = useMemo<CanvasNodeGraphContextValue>(
        () => ({
            getUpstreamNodes: (nodeId: string) => {
                return connections
                    .filter((connection) => connection.toNodeId === nodeId)
                    .map((connection) => nodes.find((node) => node.id === connection.fromNodeId))
                    .filter((node): node is CanvasNodeData => Boolean(node));
            },
            getDownstreamNodes: (nodeId: string) => {
                return connections
                    .filter((connection) => connection.fromNodeId === nodeId)
                    .map((connection) => nodes.find((node) => node.id === connection.toNodeId))
                    .filter((node): node is CanvasNodeData => Boolean(node));
            },
            connectNodes: (fromNodeId: string, toNodeId: string) => {
                setConnections((current) => {
                    if (current.some((c) => c.fromNodeId === fromNodeId && c.toNodeId === toNodeId)) {
                        return current;
                    }
                    return [...current, { id: nanoid(), fromNodeId, toNodeId }];
                });
            },
            disconnectNodes: (fromNodeId: string, toNodeId: string) => {
                setConnections((current) => current.filter((c) => !(c.fromNodeId === fromNodeId && c.toNodeId === toNodeId)));
            },
            hasConnection: (fromNodeId: string, toNodeId: string) => {
                return connections.some((c) => c.fromNodeId === fromNodeId && c.toNodeId === toNodeId);
            },
        }),
        [connections, nodes, setConnections],
    );
    // @opc-feature: canvas-node-graph-downstream-actions [end]

    const { applyGenerationTaskResult, bindGenerationTask, finishGenerationRequest, openNodeTaskDetails, runningNodeId, setRunningNodeId, setTaskDetail, startGenerationRequest, taskDetail, taskDetailLoading, taskDetailLogs } = useCanvasGeneration({
        projectId,
        domainProjectId: linkedProjectId,
        projectLoaded,
        nodes,
        nodesRef,
        setNodes,
    });

    const cancelCanvasTask = useCallback(
        (task: import("@/services/api/task-center").GenerationTask) => {
            if (!canCancelGenerationTask(task)) {
                message.info("第三方请求已提交，任务将继续创作，不能取消");
                return;
            }
            modal.confirm({
                title: "取消生成任务？",
                content: "任务会立即停止本地执行；如果已经提交到上游，系统会继续核对取消结果和积分状态。",
                okText: "取消任务",
                okButtonProps: { danger: true },
                cancelText: "继续等待",
                onOk: async () => {
                    const latestTask = taskDetail?.id === task.id ? taskDetail : task;
                    if (!canCancelGenerationTask(latestTask)) {
                        message.info("第三方请求已提交，任务将继续创作，不能取消");
                        return;
                    }
                    try {
                        const next = await cancelGenerationTask(task.id);
                        const node = nodesRef.current.find((item) => item.metadata?.taskId === task.id);
                        if (node) bindGenerationTask(node.id, next);
                        setTaskDetail((current) => (current?.id === task.id ? next : current));
                        await queryClient.invalidateQueries({ queryKey: ["canvas-active-tasks", projectId] });
                        message.success("任务已取消");
                    } catch (error) {
                        message.error(error instanceof Error ? error.message : "取消任务失败");
                    }
                },
            });
        },
        [bindGenerationTask, message, modal, nodesRef, projectId, queryClient, setTaskDetail, taskDetail],
    );

    useEffect(() => {
        const sessionId = searchParams.get("conversation");
        if (!projectLoaded || !sessionId) return;
        if (!chatSessions.some((session) => session.id === sessionId)) {
            message.warning("未找到要接续的会话，请从首页重新进入。");
        } else {
            activeChatIdRef.current = sessionId;
            setActiveChatId(sessionId);
            openAgent();
        }
        const next = new URLSearchParams(searchParams);
        next.delete("conversation");
        setSearchParams(next, { replace: true });
    }, [projectLoaded, chatSessions, searchParams, setSearchParams, openAgent, message]);

    useEffect(() => {
        if (!projectLoaded || searchParams.get("agent") !== "1") return;
        openAgent();
        const next = new URLSearchParams(searchParams);
        next.delete("agent");
        setSearchParams(next, { replace: true });
    }, [projectLoaded, searchParams, setSearchParams, openAgent]);

    // 沉浸专注进入时收起智能体与小地图、重置 Dock 唤出态；仅响应「进入」瞬间，避免关闭专注内主动唤出的面板。
    const prevFocusModeRef = useRef(focusMode);
    useEffect(() => {
        const enteredFocus = focusMode && !prevFocusModeRef.current;
        prevFocusModeRef.current = focusMode;
        if (!enteredFocus) return;
        closeAgent();
        setIsMiniMapOpen(false);
        setFocusDockRevealed(false);
    }, [closeAgent, focusMode]);

    useEffect(() => {
        if (!dialogNodeId) setNodeImageSettingsOpen(false);
    }, [dialogNodeId]);

    useLayoutEffect(() => {
        nodesRef.current = nodes;
        connectionsRef.current = connections;
        chatSessionsRef.current = chatSessions;
        activeChatIdRef.current = activeChatId;
        selectedNodeIdsRef.current = selectedNodeIds;
        viewportRef.current = viewport;
    }, [activeChatId, chatSessions, nodes, connections, selectedNodeIds, viewport]);

    useEffect(() => {
        if (!projectLoaded) return;
        const el = containerRef.current;
        if (!el) return;

        const updateSize = () => {
            const rect = el.getBoundingClientRect();
            setSize((current) => (current.width === rect.width && current.height === rect.height ? current : { width: rect.width, height: rect.height }));
            if (!didInitialCenterRef.current) {
                didInitialCenterRef.current = true;
                const current = viewportRef.current;
                if (current.x === 0 && current.y === 0 && current.k === 1) {
                    const centered = { x: rect.width / 2, y: rect.height / 2, k: 1 };
                    viewportRef.current = centered;
                    setViewport(centered);
                }
            }
        };

        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(el);
        return () => resizeObserver.disconnect();
    }, [projectLoaded]);

    // @opc-feature: opc-task-hub [start]
    useEffect(() => {
        return () => {
            void cancelAllNodeTasks("已离开当前画布，未完成的本地任务已中止并退款");
        };
    }, []);
    // @opc-feature: opc-task-hub [end]

    const {
        fitCanvasContent,
        fitCanvasSelection,
        focusCanvasImageNode,
        focusCanvasNode,
        getCanvasCenter,
        handleCanvasDoubleClick,
        handleViewportChange,
        handleViewportPreviewChange,
        previewViewport,
        screenToCanvas,
        setZoomScale,
        zoomCanvasIn,
        zoomCanvasOut,
        zoomToActualSize,
    } = useCanvasViewportController({
        agentCreatedNodes,
        containerRef,
        size,
        viewportRef,
        nodesRef,
        selectedNodeIdsRef,
        setViewport,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setDialogNodeId,
        setToolbarNodeId,
    });

    useEffect(() => {
        const project = linkedProjectQuery.data?.project;
        const preset = resolveProjectCanvasStyle(project?.stylePresetId, project?.styleProfileJson);
        if (!projectLoaded || !preset) return;
        const profile = resolveStyleProfile(project?.stylePresetId, project?.styleProfileJson, preset.profile || createStyleProfileSnapshot(preset));
        if (!profile) return;
        const current = nodesRef.current.find((node) => node.type === CanvasNodeType.Text && node.metadata?.workflowKind === "styleboard");
        const nextMetadata = {
            content: profile.prompt,
            prompt: profile.prompt,
            status: NODE_STATUS_SUCCESS,
            workflowKind: "styleboard" as const,
            workflowTitle: "项目画风",
            workflowDescription: profile.description,
            stylePresetId: profile.presetId,
            styleProfileJson: serializeStyleProfile(profile),
            fontSize: 14,
            locked: true,
        };
        if (current) {
            if (current.metadata?.stylePresetId === profile.presetId && current.metadata?.content === profile.prompt && current.metadata?.styleProfileJson === nextMetadata.styleProfileJson && current.metadata?.locked) return;
            setNodes((nodes) => nodes.map((node) => (node.id === current.id ? { ...node, title: `项目画风 · ${profile.title}`, metadata: { ...node.metadata, ...nextMetadata } } : node)));
            return;
        }
        const node = createCanvasNode(CanvasNodeType.Text, getCanvasCenter(), nextMetadata);
        node.title = `项目画风 · ${profile.title}`;
        node.width = 420;
        node.height = 240;
        setNodes((nodes) => [...nodes, node]);
    }, [getCanvasCenter, linkedProjectQuery.data?.project, projectLoaded, setNodes]);

    const {
        assetPickerOpen,
        closeUploadModal,
        closeAssetPicker,
        createVideoNodeFromBlob,
        fileDropActive,
        handleAssetsInsert,
        handleDrop,
        handleFileDragEnter,
        handleFileDragLeave,
        handleFileDragOver,
        handleImageInputChange,
        handleProjectAssetsInsert,
        handleProjectChapterInsert,
        handleUploadFiles,
        handleUploadRequest,
        imageInputRef,
        openAssetsAtPosition,
        pasteAssistantImage,
        pasteSystemClipboard,
        replaceNodeMedia,
        createFileNode,
        startUploadStatus,
        uploadModalOpen,
        uploadTimelineMedia,
        uploadStatus,
    } = useCanvasUpload({
        canvasId: projectId,
        domainProjectId: linkedProjectId,
        nodesRef,
        selectedNodeIdsRef,
        getCanvasCenter,
        screenToCanvas,
        setNodes,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setDialogNodeId,
    });
    const replaceCanvasNodeMedia = useCallback((node: CanvasNodeData) => handleUploadRequest(node.id), [handleUploadRequest]);
    const {
        timelineAddNodeRef,
        timelineMediaAddRef,
        assetInsertScope,
        projectAssetScope,
        projectAssetOpen,
        projectAssetInitialCategory,
        projectAssetInitialFolderId,
        projectAssetInsertPosition,
        handleLibraryAssetsInsert,
        handleTimelineProjectAssetsInsert,
        openProjectAssets,
        openCanvasAssetLibrary,
        openTimelineAssetLibrary,
        closeProjectAssets,
    } = useCanvasTimelineAssetInsert({
        linkedProjectId,
        refetchLinkedProject,
        handleAssetsInsert,
        handleProjectAssetsInsert,
        openAssetsAtPosition,
    });

    useEffect(() => {
        if (!projectLoaded || searchParams.get("mode") !== "handoff") return;
        void loadAssetsForUse(canvasAssetHandoffIds(searchParams)).catch((error) => message.error(error instanceof Error ? error.message : "转入素材读取失败"));
    }, [projectLoaded, searchParams, message]);

    useEffect(() => {
        if (!projectLoaded || !assetsHydrated || searchParams.get("mode") !== "handoff") return;
        const attempt = canvasAssetHandoffAttempt(assets, searchParams);
        const { assetIds, payloads } = attempt;
        if (!assetIds.length) return;
        const assetReadiness = assetIds
            .map((assetId) => {
                const asset = assets.find((candidate) => candidate.id === assetId);
                return `${assetId}:${asset?.kind || "missing"}`;
            })
            .join("|");
        const handoffKey = `${projectId}:${assetReadiness}`;
        if (assetHandoffRef.current === handoffKey) return;
        assetHandoffRef.current = handoffKey;

        if (attempt.kind === "retry") return;
        const pendingPayloads = uninsertedCanvasAssetHandoffPayloads(nodesRef.current, payloads);
        const persistHandoff = async (createdNodes: CanvasNodeData[]) => {
            const finalized = await finalizeCanvasAssetHandoff({
                searchParams,
                currentNodes: nodesRef.current,
                createdNodes,
                persist: async (nextNodes) => {
                    nodesRef.current = nextNodes;
                    updateProject(projectId, { nodes: nextNodes });
                    await flushCanvasStorePersistence();
                },
            });
            setSearchParams(finalized.searchParams, { replace: true });
        };
        const insertion = pendingPayloads.length ? handleProjectAssetsInsert(pendingPayloads) : Promise.resolve([] as CanvasNodeData[]);
        void insertion.then(persistHandoff).catch(() => {
            assetHandoffRef.current = "";
        });
    }, [assets, assetsHydrated, handleProjectAssetsInsert, message, nodesRef, projectId, projectLoaded, searchParams, setSearchParams, updateProject]);

    const {
        angleNodeId,
        lightingNodeId,
        emotionNodeId,
        annotationNodeId,
        annotationEditNodeId,
        createImageReversePromptNodes,
        openPortraitTextureEditor,
        cropImageNode,
        cropNodeId,
        closeFrameDialog,
        closeSegmentDialog,
        extractAudioFromVideo,
        extractVideoFrames,
        extractingVideoFramesNodeId,
        frameDialogNodeId,
        generateNineGridNode,
        generateAngleNode,
        generateLightingNode,
        openPanoramaConfig,
        createPanoramaViewerWithConfig,
        addPanoramaCaptureNode,
        panoramaConfigNodeId,
        setPanoramaConfigNodeId,
        generateEmotionNode,
        handleSegmentConfirm,
        maskEditImageNode,
        maskEditNodeId,
        imageEditNodeId,
        imageEditPreset,
        layerDecompositionNodeId,
        textEditNodeId,
        mergeSelectedVideos,
        mergeVideosByIds,
        mergeVideoProgress,
        saveAnnotatedImageNode,
        segmentDialogMode,
        segmentDialogNodeId,
        segmentRunningMode,
        setFrameDialogNodeId,
        setSegmentDialogNodeId,
        setAngleNodeId,
        setLightingNodeId,
        setEmotionNodeId,
        setAnnotationNodeId,
        setAnnotationEditNodeId,
        setCropNodeId,
        setMaskEditNodeId,
        setImageEditNodeId,
        setImageEditPreset,
        openBackgroundRemoval,
        openLayerDecomposition,
        decomposeImageLayers,
        setLayerDecompositionNodeId,
        setTextEditNodeId,
        openTextEditNode,
        openAnnotationEditNode,
        detectImageText,
        editTextImageNode,
        editAnnotatedImageNode,
        editImageNode,
        setUpscaleNodeId,
        splitImageNode,
        openVideoFrameExtractor,
        openVideoSegmentExtractor,
        upscaleImageNode,
        upscaleNodeId,
    } = useCanvasMediaTools({
        projectId,
        domainProjectId: linkedProjectId,
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        setContextMenu,
        setHoveredNodeId,
        setToolbarNodeId,
        setRunningNodeId,
        startUploadStatus,
        startGenerationRequest,
        finishGenerationRequest,
        bindGenerationTask,
    });

    const handleNodesDeleted = useCallback(
        (removedIds: Set<string>, nextNodes: CanvasNodeData[], removedNodes: CanvasNodeData[]) => {
            const clearDeletedId = (current: string | null) => (current && removedIds.has(current) ? null : current);
            setHoveredNodeId(clearDeletedId);
            setToolbarNodeId(clearDeletedId);
            setDialogNodeId(clearDeletedId);
            setTextEditorNodeId(clearDeletedId);
            setCharacterReferenceNodeId(clearDeletedId);
            setDrawingNodeId(clearDeletedId);
            setInfoNodeId(clearDeletedId);
            setSubtitleNodeId(clearDeletedId);
            setFrameDialogNodeId(clearDeletedId);
            setSegmentDialogNodeId(clearDeletedId);
            setCropNodeId(clearDeletedId);
            setMaskEditNodeId(clearDeletedId);
            setAnnotationNodeId(clearDeletedId);
            setUpscaleNodeId(clearDeletedId);
            setAngleNodeId(clearDeletedId);
            setLightingNodeId(clearDeletedId);
            setEmotionNodeId(clearDeletedId);
            setSuperResolveNodeId(clearDeletedId);
            setPreviewNodeId(clearDeletedId);
            setRunningNodeId(clearDeletedId);
            setScriptEditorNodeId(clearDeletedId);
            setArtCritiqueNodeId(clearDeletedId);
            setDirectorNodeId(clearDeletedId);
            setVersionCompareRootId(clearDeletedId);
            setScriptScrollTopById((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !removedIds.has(id))));
            setContextMenu((current) => (current?.type === "node" && removedIds.has(current.nodeId) ? null : current));
            const removedDrawingIds = removedNodes.flatMap((node) => (node.type === CanvasNodeType.Drawing && node.metadata?.drawingId ? [node.metadata.drawingId] : []));
            if (removedDrawingIds.length) {
                void Promise.all(removedDrawingIds.map((drawingId) => removeCanvasDrawing(projectId, drawingId))).catch(() => message.warning("绘图节点已删除，但本地绘图缓存清理失败"));
            }
            // @opc-feature: opc-task-hub [start]
            removedIds.forEach((deletedId) => {
                if (isNodeTaskRunning(deletedId)) {
                    void cancelNodeTask(deletedId, "节点已从画布删除");
                }
            });
            // @opc-feature: opc-task-hub [end]
            cleanupCanvasFiles({ projectId, nodes: nextNodes, chatSessions });
        },
        [
            chatSessions,
            cleanupCanvasFiles,
            message,
            projectId,
            setAngleNodeId,
            setAnnotationNodeId,
            setArtCritiqueNodeId,
            setCropNodeId,
            setEmotionNodeId,
            setFrameDialogNodeId,
            setLightingNodeId,
            setMaskEditNodeId,
            setSegmentDialogNodeId,
            setUpscaleNodeId,
            setRunningNodeId,
        ],
    );

    const {
        alignSelectedNodes,
        autoArrangeCanvasNodes,
        arrangeSelectedNodes,
        spreadSelectedNodes,
        copyNodesToClipboard,
        copySelectedNodes,
        createFolder,
        createNode,
        createReferenceGroup,
        createStoryboardGroup,
        deleteConnection,
        deleteNodes,
        duplicateNode,
        hasCopiedNodes,
        pasteCopiedNodes,
        restoreCopiedNodesFromText,
        releaseCopiedNodesPastePriority,
        setPrimaryVersion,
        shouldPreferCopiedNodes,
        toggleNodeLocked,
    } = useCanvasNodeOperations({
        projectId,
        defaultDrawingEngine,
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        getCanvasCenter,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setDialogNodeId,
        onNodesDeleted: handleNodesDeleted,
    });

    const handleReplaceNodeReference = useCallback(
        (targetNodeId: string, oldReference: { id: string; nodeId?: string; label?: string; title?: string }, sourceNodeId: string) => {
            const sourceNode = nodesRef.current.find((n) => n.id === sourceNodeId);
            if (!sourceNode || sourceNode.id === oldReference.nodeId) return;

            const previousNodes = nodesRef.current;
            const previousConnections = connectionsRef.current;

            const configNodeId = previousConnections.find((c) => c.fromNodeId === targetNodeId && previousNodes.find((n) => n.id === c.toNodeId)?.type === CanvasNodeType.Config)?.toNodeId;
            const receiverId = configNodeId || targetNodeId;

            let rewired = false;
            const nextConnections = previousConnections.map((c) => {
                if (!rewired && c.fromNodeId === oldReference.nodeId && (c.toNodeId === targetNodeId || c.toNodeId === configNodeId)) {
                    rewired = true;
                    return { ...c, fromNodeId: sourceNodeId };
                }
                return c;
            });

            if (!rewired) {
                nextConnections.push({
                    id: nanoid(),
                    fromNodeId: sourceNodeId,
                    toNodeId: receiverId,
                });
            }

            const nextReferencesMap = buildCanvasNodeMentionReferenceMap(previousNodes, nextConnections, previousNodes);
            const targetNextReferences = nextReferencesMap.get(targetNodeId) || [];
            const newRef = targetNextReferences.find((r) => r.nodeId === sourceNodeId);

            const targetNode = previousNodes.find((n) => n.id === targetNodeId);
            let nextNodes = previousNodes;
            if (targetNode && newRef) {
                const currentPrompt = targetNode.metadata?.composerContent ?? targetNode.metadata?.prompt ?? "";
                const replacementToken = `@${newRef.label}`;
                const updatedPrompt = replaceCanvasReferenceMentions(currentPrompt, oldReference, replacementToken, sourceNode.title ? sourceNode.title : newRef.label);

                nextNodes = previousNodes.map((n) => (n.id === targetNodeId ? writeCanvasNodePrompt(n, updatedPrompt) : n));
            }

            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            message.success(`已将参考图「${oldReference.label || "参考图"}」替换为「${sourceNode.title || "新图片"}」，提示词已同步更新`);
        },
        [connectionsRef, message, nodesRef, setConnections, setNodes],
    );

    const handleReplaceNodeReferenceFiles = useCallback(
        (_targetNodeId: string, oldReference: { id: string; nodeId?: string; label?: string; title?: string }, files: File[]) => {
            const file = files.find((f) => f.type.startsWith("image/"));
            if (!file || !oldReference.nodeId) return;
            void replaceNodeMedia(oldReference.nodeId, file).then((success: boolean) => {
                if (success) {
                    message.success("参考图片已替换");
                }
            });
        },
        [message, replaceNodeMedia],
    );

    // @opc-feature: batch-table-slot-connection [start]
    const assignBatchReferenceCellRef = useRef<((tableNodeId: string, rowId: string, columnIndex: number, referenceNodeId: string) => void) | null>(null);
    // @opc-feature: batch-table-slot-connection [end]

    const {
        cancelPendingConnectionCreate,
        closeConnectionCreateMenu,
        connectionTargetAnchorRatio,
        connectionTargetNodeId,
        connectionApproach,
        connectionReplaceHover,
        connectingParams,
        createConnectedNode,
        getConnectionCreateDisabledReason,
        handleConnectStart,
        handleConnectDrop,
        handleBatchConnectionTargetClick,
        batchConnectionPreview,
        beginBatchConnectionMode,
        startBatchConnection,
        mouseWorld,
        pendingConnectionCreate,
        setConnecting,
    } = useCanvasConnectionController({
        projectId,
        config: effectiveConfig,
        defaultDrawingEngine,
        nodesRef,
        connectionsRef,
        viewportRef,
        scriptScrollTopById,
        screenToCanvas,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setDialogNodeId,
        setDrawingNodeId,
        onReplaceReference: handleReplaceNodeReference,
        // @opc-feature: batch-table-slot-connection [start]
        onAssignBatchReference: (tableNodeId, rowId, columnIndex, referenceNodeId) => {
            assignBatchReferenceCellRef.current?.(tableNodeId, rowId, columnIndex, referenceNodeId);
        },
        // @opc-feature: batch-table-slot-connection [end]
    });

    const batchSourceNodeIds = useMemo(() => nodes.filter((node) => selectedNodeIds.has(node.id) && !batchSourceRestriction(node)).map((node) => node.id), [nodes, selectedNodeIds]);

    const handleCanvasSelectionStart = useCallback(() => {
        setContextMenu(null);
    }, []);

    const handleNodeInteractionStart = useCallback((selectionModifier: boolean) => {
        setContextMenu(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        if (selectionModifier) setDialogNodeId(null);
    }, []);

    const handleSelectedNodeClick = useCallback(
        (node: CanvasNodeData) => {
            // Selection is transient, but the LibTV-style paint order survives
            // deselection so a clicked lower node stays above its neighbours.
            if (node.type !== CanvasNodeType.Frame) bringNodeToFront(node.id);
            if (node.type === CanvasNodeType.Drawing) {
                setDialogNodeId(null);
                setDrawingNodeId(node.id);
            } else if (node.type === CanvasNodeType.Script) {
                setDialogNodeId(null);
            // @opc-feature: creative-tables-click-guard [start]
            } else if (
                node.type === CanvasNodeType.BatchTable ||
                node.type === STANDARD_BATCH_TABLE_NODE_TYPE ||
                node.type === CREATIVE_ASSET_TABLE_NODE_TYPE ||
                node.type === CREATIVE_VOICE_TABLE_NODE_TYPE ||
                node.type === CREATIVE_STORYBOARD_TABLE_NODE_TYPE ||
                node.type === CREATION_ASSISTANT_REF_SCRIPT_NODE_TYPE ||
                node.type === CREATION_ASSISTANT_ANALYSIS_NODE_TYPE ||
                node.type === VIDEO_REVERSE_NODE_TYPE ||
                Boolean(node.metadata?.batchTable)
            ) {
                setDialogNodeId(null);
            // @opc-feature: creative-tables-click-guard [end]
            } else if (node.type === CanvasNodeType.Text) {
                setDialogNodeId(node.id);
            } else if (node.type === CanvasNodeType.Frame) {
                setDialogNodeId((current) => (current === node.id ? current : null));
            } else if (node.type === ART_CRITIQUE_NODE_TYPE) {
                setDialogNodeId(null);
                setArtCritiqueNodeId(node.id);
            } else if (node.type === CanvasNodeType.Panorama) {
                // 全景节点是纯查看器，没有可编辑提示词，不弹提示词面板。
                setDialogNodeId(null);
            } else {
                // 选择参考媒体时保留当前工作流配置面板，避免点击图片后配置“返回/消失”。
                // 没有工作流配置面板时，媒体节点仍按原逻辑打开自己的面板。
                setDialogNodeId((current) => {
                    const currentNode = current ? nodesRef.current.find((item) => item.id === current) : undefined;
                    return currentNode?.type === CanvasNodeType.Config ? current : node.id;
                });
            }
        },
        [bringNodeToFront, nodesRef],
    );

    const handleNodeBringToFront = useCallback(
        (nodeId: string) => {
            const node = nodesRef.current.find((item) => item.id === nodeId);
            if (node && node.type !== CanvasNodeType.Frame) bringNodeToFront(nodeId);
        },
        [bringNodeToFront, nodesRef],
    );

    const handleNodeDragEnd = useCallback(
        (nodeId: string) => {
            const node = nodesRef.current.find((item) => item.id === nodeId);
            // @opc-feature: creative-tables-drag-guard [start]
            if (
                !node ||
                node.type === CanvasNodeType.Script ||
                node.type === CanvasNodeType.Drawing ||
                node.type === CanvasNodeType.Panorama ||
                node.type === ART_CRITIQUE_NODE_TYPE ||
                node.type === CanvasNodeType.BatchTable ||
                node.type === STANDARD_BATCH_TABLE_NODE_TYPE ||
                node.type === CREATIVE_ASSET_TABLE_NODE_TYPE ||
                node.type === CREATIVE_VOICE_TABLE_NODE_TYPE ||
                node.type === CREATIVE_STORYBOARD_TABLE_NODE_TYPE ||
                node.type === CREATION_ASSISTANT_REF_SCRIPT_NODE_TYPE ||
                node.type === CREATION_ASSISTANT_ANALYSIS_NODE_TYPE ||
                node.type === VIDEO_REVERSE_NODE_TYPE ||
                Boolean(node.metadata?.batchTable)
            ) {
                setDialogNodeId(null);
                return;
            }
            // @opc-feature: creative-tables-drag-guard [end]
            // A drag selects a new node even though it is not a click. Keep the
            // generation editor bound to the node most recently moved so a stale
            // panel from the previous node cannot reappear after mouse-up.
            setDialogNodeId(node.id);
        },
        [nodesRef],
    );

    const handleCanvasDeselect = useCallback(() => {
        setContextMenu(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
    }, []);

    const { alignmentGuides, cancelSelectionBox, deselectCanvas, dragPreview, frameDropTargetId, handleCanvasMouseDown, handleNodeMouseDown, isNodeDragging, nodeDraggingRef, selectionBoundsElementRef, selectionBox } = useCanvasSelectionController({
        containerRef,
        nodesRef,
        viewportRef,
        selectedNodeIdsRef,
        historyPausedRef,
        screenToCanvas,
        setNodes,
        setSelectedNodeIds,
        setSelectedConnectionId,
        cancelPendingConnectionCreate,
        onCanvasSelectionStart: handleCanvasSelectionStart,
        onNodeInteractionStart: handleNodeInteractionStart,
        onNodeBringToFront: handleNodeBringToFront,
        onNodeClick: handleSelectedNodeClick,
        onNodeDragEnd: handleNodeDragEnd,
        onBatchConnectionTarget: handleBatchConnectionTargetClick,
        onLinkedFolderDrop: archiveNodesToLinkedFolder,
        onDeselect: handleCanvasDeselect,
    });

    const keepNodeToolbar = useCallback(
        (nodeId: string) => {
            if (nodeDraggingRef.current || nodeImageSettingsOpen) return;
            if (toolbarHideTimerRef.current) {
                clearTimeout(toolbarHideTimerRef.current);
                toolbarHideTimerRef.current = null;
            }
            setToolbarNodeId(nodeId);
        },
        [nodeImageSettingsOpen],
    );

    const hideNodeToolbar = useCallback(() => {
        if (toolbarHideTimerRef.current) clearTimeout(toolbarHideTimerRef.current);
        toolbarHideTimerRef.current = setTimeout(() => {
            setToolbarNodeId(null);
            toolbarHideTimerRef.current = null;
        }, 120);
    }, []);

    const {
        collapsingBatchIds,
        downloadNodeImage,
        handleConfigNodeChange,
        handleFolderStyleChange,
        handleFolderThemeChange,
        handleFontSizeChange,
        handleNodeContentChange,
        handleNodePromptChange,
        handleNodeResize,
        handleNodeTitleChange,
        openingBatchIds,
        saveNodeAsset,
        setBatchPrimary,
        toggleBatchExpanded,
        toggleFrameCollapsed,
        toggleNodeFreeResize,
    } = useCanvasNodeEditor({
        canvasId: projectId,
        canvasTitle: currentProject?.title || "未命名画布",
        domainProjectId: linkedProjectId,
        nodesRef,
        setNodes,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        setToolbarNodeId,
        setHoveredNodeId,
    });

    const handleRemoveNodeReference = useCallback(
        (targetNodeId: string, reference: CanvasResourceReference) => {
            const referenceNodeId = reference.nodeId;
            if (!referenceNodeId) return;
            // 生成节点可能通过配置节点接收参考，只移除参考来源边，保留目标到配置节点的主链。
            const previousNodes = nodesRef.current;
            const previousConnections = connectionsRef.current;
            const configNodeId = previousConnections.find((connection) => {
                if (connection.fromNodeId !== targetNodeId) return false;
                return previousNodes.find((node) => node.id === connection.toNodeId)?.type === CanvasNodeType.Config;
            })?.toNodeId;
            const removedConnectionIds = new Set(previousConnections.filter((connection) => connection.fromNodeId === referenceNodeId && (connection.toNodeId === targetNodeId || connection.toNodeId === configNodeId)).map((connection) => connection.id));
            if (!removedConnectionIds.size) return;
            const nextConnections = previousConnections.filter((connection) => !removedConnectionIds.has(connection.id));
            const nextNodes = applyCanvasConnectionPromptSync(previousNodes, previousConnections, previousNodes, nextConnections);
            if (nextNodes !== previousNodes) {
                nodesRef.current = nextNodes;
                setNodes(nextNodes);
            }
            connectionsRef.current = nextConnections;
            setConnections(nextConnections);
            setSelectedConnectionId((current) => (current && removedConnectionIds.has(current) ? null : current));
        },
        [connectionsRef, nodesRef, setConnections, setNodes, setSelectedConnectionId],
    );

    const handleReorderNodeReferences = useCallback(
        (targetNodeId: string, orderedNodeIds: string[]) => {
            const previousNodes = nodesRef.current;
            const previousConnections = connectionsRef.current;
            const nextConnections = reorderCanvasResourceConnections(targetNodeId, orderedNodeIds, previousNodes, previousConnections);
            if (nextConnections === previousConnections) return;
            const nextNodes = applyCanvasConnectionPromptSync(previousNodes, previousConnections, previousNodes, nextConnections);
            if (nextNodes !== previousNodes) {
                nodesRef.current = nextNodes;
                setNodes(nextNodes);
            }
            connectionsRef.current = nextConnections;
            setConnections(nextConnections);
        },
        [connectionsRef, nodesRef, setConnections, setNodes],
    );

    const handleProjectFolderInsert = useCallback(
        (folderId: string) => {
            const folder = linkedProjectQuery.data?.assetFolders.find((item) => item.id === folderId);
            if (!folder || !linkedProjectId) throw new Error("素材文件夹已不存在，请刷新后重试");
            const style: CanvasFolderStyle = folder.style === "stacked" || folder.style === "midnight" || folder.style === "paper" || folder.style === "cinema" || folder.style === "compact" ? folder.style : "glass";
            const theme: CanvasFolderTheme = folder.theme === "obsidian" || folder.theme === "ember" || folder.theme === "pearl" ? folder.theme : "aurora";
            createFolder(projectAssetInsertPosition, { id: folder.id, projectId: linkedProjectId, title: folder.name, style, theme, createdAt: folder.createdAt });
        },
        [createFolder, linkedProjectId, linkedProjectQuery.data?.assetFolders, projectAssetInsertPosition],
    );

    const handleFrameToggle = useCallback(
        (nodeId: string) => {
            const node = nodesRef.current.find((item) => item.id === nodeId);
            const linkedFolderId = node?.metadata?.folder?.assetFolderId;
            if (linkedFolderId) {
                openProjectAssets("all", node ? { x: node.position.x + node.width + 40, y: node.position.y } : undefined, "canvas", linkedFolderId);
                return;
            }
            toggleFrameCollapsed(nodeId);
        },
        [nodesRef, openProjectAssets, toggleFrameCollapsed],
    );

    const linkedFolderPreviewNodesById = useMemo(() => {
        const result = new Map<string, CanvasNodeData[]>();
        const localById = new Map(assets.map((asset) => [asset.id, asset]));
        for (const asset of linkedProjectQuery.data?.assets || []) {
            if (!asset.folderId) continue;
            const local = localById.get(asset.id);
            const characterCover = asset.character?.representations.find((item) => item.role === "turnaround_sheet") || asset.character?.representations.find((item) => item.role === "primary") || asset.character?.representations[0];
            const type = asset.category === "character" || asset.mediaType === "image" ? CanvasNodeType.Image : asset.mediaType === "video" ? CanvasNodeType.Video : asset.mediaType === "audio" ? CanvasNodeType.Audio : CanvasNodeType.Text;
            const remoteResourceId = resourceIdFromStorageKey(asset.storageKey);
            const storageKey = characterCover
                ? `resource:${characterCover.resourceId}`
                : local?.kind === "image" || local?.kind === "video" || local?.kind === "audio"
                  ? local.data.storageKey
                  : remoteResourceId
                    ? asset.storageKey
                    : undefined;
            const content = characterCover
                ? resourceFileUrl(characterCover.resourceId)
                : local?.kind === "image"
                  ? local.data.dataUrl || local.coverUrl
                  : local?.kind === "video" || local?.kind === "audio"
                    ? local.data.url
                    : local?.kind === "text"
                      ? local.data.content
                      : remoteResourceId
                        ? resourceFileUrl(remoteResourceId)
                        : asset.previewText || "";
            const preview: CanvasNodeData = { id: asset.id, type, title: asset.title, position: { x: 0, y: 0 }, width: 240, height: 160, metadata: { assetId: asset.id, content, storageKey } };
            const current = result.get(asset.folderId) || [];
            current.push(preview);
            result.set(asset.folderId, current);
        }
        return result;
    }, [assets, linkedProjectQuery.data?.assets]);

    useEffect(() => {
        const folders = linkedProjectQuery.data?.assetFolders;
        if (!folders?.length) return;
        const byId = new Map(folders.map((folder) => [folder.id, folder]));
        setNodes((current) => {
            let changed = false;
            const next = current.map((node) => {
                const folderId = node.metadata?.folder?.assetFolderId;
                const folder = folderId ? byId.get(folderId) : undefined;
                if (!folder) return node;
                const style: CanvasFolderStyle = folder.style === "stacked" || folder.style === "midnight" || folder.style === "paper" || folder.style === "cinema" || folder.style === "compact" ? folder.style : "glass";
                const theme: CanvasFolderTheme = folder.theme === "obsidian" || folder.theme === "ember" || folder.theme === "pearl" ? folder.theme : "aurora";
                if (node.title === folder.name && node.metadata?.folder?.style === style && node.metadata?.folder?.theme === theme) return node;
                changed = true;
                return { ...node, title: folder.name, metadata: { ...node.metadata, folder: { ...node.metadata!.folder!, style, theme, themeCover: undefined } } };
            });
            return changed ? next : current;
        });
    }, [linkedProjectQuery.data?.assetFolders, setNodes]);

    const {
        activeDirectorScene,
        activeNodeId,
        activeScriptNode,
        activeStylePresetId,
        angleNode,
        lightingNode,
        emotionNode,
        annotationNode,
        batchChildCountById,
        batchMotionById,
        configInputsById,
        connectionLayerBounds,
        contextMenuNode,
        cropNode,
        displayConnections,
        frameChildrenById,
        infoNode,
        maskEditNode,
        imageEditNode,
        mentionReferencesByNodeId,
        nodeById,
        nodeRenderLODById,
        previewNode,
        reduceMediaEffects,
        relatedHighlight,
        resourceReferenceByNodeId,
        selectedNodeBounds,
        selectedVideoNodes,
        skillMentionReferences,
        superResolveNode,
        toolbarNode,
        upscaleNode,
        versionCompareNodes,
        visibleNodes,
    } = useCanvasRenderModel({
        nodes,
        connections,
        assets,
        viewport,
        viewportSize: size,
        mediaPerformanceMode,
        selectedNodeIds,
        hoveredNodeId,
        dragPreview,
        collapsingBatchIds,
        addedSkills,
        directorScenes: currentProject?.directorScenes,
        infoNodeId,
        cropNodeId,
        maskEditNodeId,
        imageEditNodeId,
        annotationNodeId,
        splitNodeId: null,
        upscaleNodeId,
        superResolveNodeId,
        angleNodeId,
        lightingNodeId,
        emotionNodeId,
        previewNodeId,
        contextMenu,
        versionCompareRootId,
        directorNodeId,
        scriptEditorNodeId,
        dialogNodeId,
    });

    const visibleDisplayConnections = useMemo(
        () => filterCanvasDisplayConnections(displayConnections, {
            enabled: hideNodeConnections,
            hoveredNodeId,
            selectedNodeIds,
            activeNodeId,
            selectedConnectionId,
        }),
        [activeNodeId, displayConnections, hideNodeConnections, hoveredNodeId, selectedConnectionId, selectedNodeIds],
    );
    useEffect(() => {
        setNodes((current) => {
            let changed = false;
            const next = current.map((node) => {
                const references = mentionReferencesByNodeId.get(node.id);
                const savedPrompt = node.metadata?.composerContent ?? node.metadata?.prompt;
                if (!references?.length || !savedPrompt?.includes("@[node:")) return node;
                const normalizedPrompt = normalizeCanvasNodeMentionTokens(savedPrompt, references);
                if (normalizedPrompt === savedPrompt) return node;
                changed = true;
                return {
                    ...node,
                    metadata: node.metadata?.composerContent !== undefined ? { ...node.metadata, composerContent: normalizedPrompt } : { ...node.metadata, prompt: normalizedPrompt },
                };
            });
            return changed ? next : current;
        });
    }, [mentionReferencesByNodeId, setNodes]);
    const dialogNode = dialogNodeId ? nodeById.get(dialogNodeId) || null : null;
    // dragPreview is published on the same pointer-down frame as isNodeDragging.
    // Treat either signal as moving so floating editors disappear before the
    // first preview transform is painted and never affect drag layout.
    const isCanvasNodeMoving = isNodeDragging || Boolean(dragPreview?.nodeIds.size);
    const subtitleNode = subtitleNodeId ? nodeById.get(subtitleNodeId) || null : null;
    const timelineNode = timelineNodeId ? nodeById.get(timelineNodeId) || null : null;
    const frameNode = frameDialogNodeId ? nodeById.get(frameDialogNodeId) || null : null;
    const segmentNode = segmentDialogNodeId ? nodeById.get(segmentDialogNodeId) || null : null;
    const textEditorNode = textEditorNodeId ? nodeById.get(textEditorNodeId) || null : null;
    const characterReferenceNode = characterReferenceNodeId ? nodeById.get(characterReferenceNodeId) || null : null;
    const drawingNode = drawingNodeId ? nodeById.get(drawingNodeId) || null : null;
    const artCritiqueNode = artCritiqueNodeId ? nodeById.get(artCritiqueNodeId) || null : null;
    const artCritiqueInputs = artCritiqueNode
        ? connections
              .filter((connection) => connection.toNodeId === artCritiqueNode.id)
              .sort((left, right) => left.id.localeCompare(right.id))
              .map((connection) => nodeById.get(connection.fromNodeId))
              .filter((node): node is CanvasNodeData => Boolean(node))
        : [];
    const pendingConnectionSourceNode = pendingConnectionCreate?.connection.handleType === "source" ? nodeById.get(pendingConnectionCreate.connection.nodeId) : null;
    const canCreateDrawingFromConnection = !pendingConnectionCreate?.batchSourceNodeIds?.length && pendingConnectionSourceNode?.type === CanvasNodeType.Image && Boolean(pendingConnectionSourceNode.metadata?.content);

    const openTextNodeEditor = useCallback((node: CanvasNodeData) => {
        if (node.type !== CanvasNodeType.Text) return;
        setSelectedNodeIds(new Set([node.id]));
        setSelectedConnectionId(null);
        setContextMenu(null);
        setDialogNodeId(null);
        setToolbarNodeId(null);
        if (node.metadata?.workflowKind === "character" && node.metadata.characterAssetId) {
            setCharacterReferenceNodeId(node.id);
            return;
        }
        setTextEditorNodeId(node.id);
    }, []);

    const openDrawingNode = useCallback((node: CanvasNodeData) => {
        if (node.type !== CanvasNodeType.Drawing) return;
        setSelectedNodeIds(new Set([node.id]));
        setSelectedConnectionId(null);
        setContextMenu(null);
        setDialogNodeId(null);
        setToolbarNodeId(null);
        setDrawingNodeId(node.id);
    }, []);

    const openArtCritique = useCallback((node: CanvasNodeData) => {
        if (node.type !== ART_CRITIQUE_NODE_TYPE) return;
        setSelectedNodeIds(new Set([node.id]));
        setSelectedConnectionId(null);
        setContextMenu(null);
        setDialogNodeId(null);
        setToolbarNodeId(null);
        setArtCritiqueNodeId(node.id);
    }, []);
    const duplicateNodeFromContent = useCallback((node: CanvasNodeData) => duplicateNode(node.id), [duplicateNode]);
    const deleteNodeFromContent = useCallback((node: CanvasNodeData) => deleteNodes(new Set([node.id])), [deleteNodes]);
    const updateNodeFromContent = useCallback((nodeId: string, update: (node: CanvasNodeData) => CanvasNodeData) => {
        setNodesState((current) => {
            const next = updateCanvasNode(current, nodeId, update);
            nodesRef.current = next;
            return next;
        });
    }, []);
    const pendingMediaUpdatesRef = useRef(new Map<string, (node: CanvasNodeData) => CanvasNodeData>());
    const mediaUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const updateMediaNodeFromContent = useCallback((nodeId: string, update: (node: CanvasNodeData) => CanvasNodeData) => {
        const previous = pendingMediaUpdatesRef.current.get(nodeId);
        pendingMediaUpdatesRef.current.set(nodeId, previous ? (node) => update(previous(node)) : update);
        if (mediaUpdateTimerRef.current) return;
        mediaUpdateTimerRef.current = setTimeout(() => {
            const updates = pendingMediaUpdatesRef.current;
            pendingMediaUpdatesRef.current = new Map();
            mediaUpdateTimerRef.current = null;
            if (!updates.size) return;
            setNodesState((current) => {
                const next = updateCanvasNodes(current, updates);
                nodesRef.current = next;
                return next;
            });
        }, 120);
    }, []);
    const updateNodeMetadataFromContent = useCallback(
        (nodeId: string, patch: CanvasNodeMetadata) => {
            updateNodeFromContent(nodeId, (node) => ({ ...node, metadata: { ...node.metadata, ...patch } }));
        },
        [updateNodeFromContent],
    );

    // @opc-feature: hypit [start]
    const createStoryboardBatchTable = useCallback(
        (params: {
            sourceNodeId: string;
            title?: string;
            storyboardRows: any[];
            assetSlots?: any[];
            options?: {
                enableVisual?: boolean;
                enableVoice?: boolean;
                enableVideo?: boolean;
                videoModel?: string;
                masterVisualAnchor?: string;
            };
            extraConnectNodeIds?: string[];
            masterSlots?: any;
            originalMasterSlots?: any;
            variations?: any[];
        }) => {
            const currentNodes = nodesRef.current;
            const currentConnections = connectionsRef.current;
            const sourceNode = currentNodes.find((n) => n.id === params.sourceNodeId);
            if (!sourceNode) {
                message.error("未找到源脚本节点");
                return;
            }

            const nodeById = new Map<string, CanvasNodeData>(currentNodes.map((n) => [n.id, n]));

            // 1. 优先定位源脚本下游已连接的批量表格（防止反复创建孤儿节点并确保连接无损延续）
            const downstreamConns = currentConnections.filter(
                (c) => c.fromNodeId === sourceNode.id && (c.relation === "batch-input" || !c.relation),
            );
            const isAnyTableType = (t?: string) =>
                t === CanvasNodeType.BatchTable ||
                t === STANDARD_BATCH_TABLE_NODE_TYPE ||
                t === CREATIVE_ASSET_TABLE_NODE_TYPE ||
                t === CREATIVE_VOICE_TABLE_NODE_TYPE ||
                t === CREATIVE_STORYBOARD_TABLE_NODE_TYPE;

            const downstreamBatchNodes = downstreamConns
                .map((c) => nodeById.get(c.toNodeId))
                .filter((n): n is CanvasNodeData => Boolean(n && isAnyTableType(n.type)));

            const metaTableIds = ((sourceNode.metadata?.refScript as any)?.generatedTableIds || {}) as {
                masterTableId?: string;
                voiceTableId?: string;
                storyboardTableId?: string;
            };

            const existingMasterNode =
                (metaTableIds.masterTableId ? nodeById.get(metaTableIds.masterTableId) : undefined) ||
                downstreamBatchNodes.find(
                    (n) => n.type === CREATIVE_ASSET_TABLE_NODE_TYPE || n.metadata?.batchTable?.contentKind === "master-slots" || n.title?.includes("创意资产表") || n.title?.includes("母版资产") || n.type === STANDARD_BATCH_TABLE_NODE_TYPE,
                ) ||
                currentNodes.find(
                    (n) =>
                        (n.type === CanvasNodeType.BatchTable || n.type === CREATIVE_ASSET_TABLE_NODE_TYPE || n.type === STANDARD_BATCH_TABLE_NODE_TYPE) &&
                        (n.title?.includes("创意资产表") || n.title?.includes("母版资产")) &&
                        metaTableIds.storyboardTableId &&
                        currentConnections.some((c) => c.fromNodeId === n.id && c.toNodeId === metaTableIds.storyboardTableId),
                );

            const existingVoiceNode =
                (metaTableIds.voiceTableId ? nodeById.get(metaTableIds.voiceTableId) : undefined) ||
                downstreamBatchNodes.find(
                    (n) => n.type === CREATIVE_VOICE_TABLE_NODE_TYPE || n.metadata?.batchTable?.contentKind === "voiceover" || n.title?.includes("创意配音") || n.title?.includes("配音"),
                ) ||
                currentNodes.find(
                    (n) => (n.type === CanvasNodeType.BatchTable || n.type === CREATIVE_VOICE_TABLE_NODE_TYPE) && (n.title?.includes("创意配音") || n.title?.includes("角色配音")),
                );

            const existingStoryboardNode =
                (metaTableIds.storyboardTableId ? nodeById.get(metaTableIds.storyboardTableId) : undefined) ||
                downstreamBatchNodes.find(
                    (n) =>
                        n.type === CREATIVE_STORYBOARD_TABLE_NODE_TYPE ||
                        n.metadata?.batchTable?.contentKind === "storyboard" ||
                        (!n.metadata?.batchTable?.contentKind &&
                            downstreamConns.some((c) => c.toNodeId === n.id && c.toHandleId === "batch-reference:ref-script")),
                );

            // 2. 递归向上追溯工作流中所有关联的媒体资产（脚本上游 + 现有配音表上游 + 现有资产表上游）
            const visited = new Set<string>();
            const mediaNodesMap = new Map<string, CanvasNodeData>();

            function traceUpstream(nodeId: string) {
                if (visited.has(nodeId)) return;
                visited.add(nodeId);

                const incoming = currentConnections.filter((c) => c.toNodeId === nodeId);
                for (const conn of incoming) {
                    const fromNode = nodeById.get(conn.fromNodeId);
                    if (!fromNode) continue;

                    const isMedia =
                        fromNode.type === CanvasNodeType.Image ||
                        fromNode.type === CanvasNodeType.Video ||
                        fromNode.type === CanvasNodeType.Audio ||
                        fromNode.type === "audio" ||
                        fromNode.metadata?.mimeType?.startsWith("image/") ||
                        fromNode.metadata?.mimeType?.startsWith("video/") ||
                        fromNode.metadata?.mimeType?.startsWith("audio/") ||
                        Boolean((fromNode.metadata as any)?.audioUrl) ||
                        Boolean(fromNode.metadata?.content && (fromNode.metadata?.storageKey || fromNode.type === "image" || fromNode.type === "video"));

                    if (isMedia) {
                        mediaNodesMap.set(fromNode.id, fromNode);
                    }

                    traceUpstream(fromNode.id);
                }
            }

            traceUpstream(params.sourceNodeId);
            if (existingVoiceNode) {
                traceUpstream(existingVoiceNode.id);
                // 深度采集创意配音表中已存在或连接的全部音频素材
                const voiceConns = currentConnections.filter((c) => c.toNodeId === existingVoiceNode.id);
                for (const vc of voiceConns) {
                    const fromNode = nodeById.get(vc.fromNodeId);
                    if (fromNode && (fromNode.type === CanvasNodeType.Audio || fromNode.type === "audio" || fromNode.metadata?.mimeType?.startsWith("audio/") || (fromNode.metadata as any)?.audioUrl)) {
                        mediaNodesMap.set(fromNode.id, fromNode);
                    }
                }
                const existingVoiceTable = existingVoiceNode.metadata?.batchTable;
                if (existingVoiceTable?.rows) {
                    for (const vr of existingVoiceTable.rows) {
                        for (const inputId of (vr.inputNodeIds || [])) {
                            if (inputId) {
                                const inputNode = nodeById.get(inputId);
                                if (inputNode) mediaNodesMap.set(inputNode.id, inputNode);
                            }
                        }
                        if (vr.outputNodeId) {
                            const outputNode = nodeById.get(vr.outputNodeId);
                            if (outputNode) mediaNodesMap.set(outputNode.id, outputNode);
                        }
                    }
                }
            }
            if (existingMasterNode) {
                traceUpstream(existingMasterNode.id);
                const masterConns = currentConnections.filter((c) => c.toNodeId === existingMasterNode.id);
                for (const mc of masterConns) {
                    const fromNode = nodeById.get(mc.fromNodeId);
                    if (fromNode) mediaNodesMap.set(fromNode.id, fromNode);
                }
                const existingMasterTable = existingMasterNode.metadata?.batchTable;
                if (existingMasterTable?.rows) {
                    for (const mr of existingMasterTable.rows) {
                        for (const inputId of (mr.inputNodeIds || [])) {
                            if (inputId) {
                                const inputNode = nodeById.get(inputId);
                                if (inputNode) mediaNodesMap.set(inputNode.id, inputNode);
                            }
                        }
                        if (mr.outputNodeId) {
                            const outputNode = nodeById.get(mr.outputNodeId);
                            if (outputNode) mediaNodesMap.set(outputNode.id, outputNode);
                        }
                    }
                }
            }
            if (existingStoryboardNode) {
                traceUpstream(existingStoryboardNode.id);
            }

            if (params.extraConnectNodeIds?.length) {
                for (const id of params.extraConnectNodeIds) {
                    const extraNode = nodeById.get(id);
                    if (extraNode) mediaNodesMap.set(extraNode.id, extraNode);
                }
            }

            const mediaNodes = Array.from(mediaNodesMap.values());

            function formatTimeSec(sec: number): string {
                const s = Math.max(0, Math.round(sec));
                const m = Math.floor(s / 60);
                const rem = s % 60;
                return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
            }

            function formatStoryboardTimeRange(shot: any): string {
                if (shot.timeRange && /^\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/.test(shot.timeRange)) {
                    return shot.timeRange;
                }
                const start = typeof shot.startSec === "number" ? shot.startSec : 0;
                const duration = typeof shot.durationSec === "number" ? shot.durationSec : (typeof shot.endSec === "number" ? Math.max(1, shot.endSec - start) : 4);
                const end = typeof shot.endSec === "number" ? shot.endSec : start + duration;
                return `${formatTimeSec(start)} - ${formatTimeSec(end)} (${Math.round(duration)}s)`;
            }

            const masterNodeId =
                existingMasterNode?.id ||
                (metaTableIds.masterTableId && nodeById.has(metaTableIds.masterTableId) ? metaTableIds.masterTableId : `batch-master-${nanoid()}`);
            const voiceNodeId =
                existingVoiceNode?.id ||
                (metaTableIds.voiceTableId && nodeById.has(metaTableIds.voiceTableId) ? metaTableIds.voiceTableId : `batch-voice-${nanoid()}`);
            const storyboardNodeId =
                existingStoryboardNode?.id ||
                (metaTableIds.storyboardTableId && nodeById.has(metaTableIds.storyboardTableId) ? metaTableIds.storyboardTableId : `batch-storyboard-${nanoid()}`);

            const baseTitle = params.title || "创意复刻";

            // ----------------------------------------------------
            // 3. 构建 表格 1:【母版资产创作表】(普通批量创作表)
            // ----------------------------------------------------
            // 查找上游关联节点（创意反推与素材分析）
            const directIncoming = currentConnections.filter((c) => c.toNodeId === sourceNode.id);
            const directUpstreamNodes = directIncoming
                .map((c) => nodeById.get(c.fromNodeId))
                .filter(Boolean) as CanvasNodeData[];
            const upstreamVideoReverse = directUpstreamNodes.find(
                (n) => n.type === VIDEO_REVERSE_NODE_TYPE || n.metadata?.videoReverse || n.title?.includes("视频反推"),
            );
            const upstreamAnalysis = directUpstreamNodes.find(
                (n) => n.type === CREATION_ASSISTANT_ANALYSIS_NODE_TYPE || n.metadata?.materialAnalysis || n.title?.includes("素材分析"),
            );

            const reverseMeta = (upstreamVideoReverse?.metadata?.videoReverse || {}) as any;
            const deconstruct = reverseMeta?.deconstruct;
            const originalMasterSlots =
                params.originalMasterSlots ||
                deconstruct?.originalMasterSlots ||
                reverseMeta?.originalMasterSlots ||
                deconstruct?.coreElements ||
                reverseMeta?.coreElements ||
                {};
            const shotManifest = deconstruct?.shotManifest || reverseMeta?.shotManifest || params.storyboardRows || [];
            const masterSlots = params.masterSlots || {};

            function isExplicitNone(val?: any): boolean {
                if (!val || typeof val !== "string") return true;
                const trimmed = val.trim();
                if (!trimmed) return true;
                const lower = trimmed.toLowerCase();
                return (
                    trimmed === "无" ||
                    trimmed === "无人物" ||
                    trimmed === "无出镜" ||
                    trimmed === "无商品" ||
                    trimmed === "无场景" ||
                    trimmed === "不涉及" ||
                    trimmed === "暂无" ||
                    trimmed === "无特定商品" ||
                    trimmed === "无特定角色" ||
                    trimmed === "-" ||
                    lower === "none" ||
                    lower === "null" ||
                    lower === "n/a" ||
                    trimmed.startsWith("主观第一人称") ||
                    trimmed.startsWith("第一人称视角（无出镜")
                );
            }

            interface DetectedSlotEntity {
                id: string;
                category: "character" | "product" | "scene";
                categoryEmoji: string;
                categoryLabel: "人物" | "商品" | "场景";
                name: string;
                visualDesc: string;
                promptTxt2Img: string;
                promptImg2Img: string;
                matchedMediaNodeId?: string;
            }

            const detectedEntities: DetectedSlotEntity[] = [];
            const slotMatchedAssetMap = new Map<string, string | null>();

            if (Array.isArray(params.assetSlots) && params.assetSlots.length > 0) {
                params.assetSlots.forEach((slot, idx) => {
                    const rawCat = String(slot.category || "character").toLowerCase();
                    const category: "character" | "product" | "scene" =
                        rawCat.includes("prod") || rawCat.includes("goods") || rawCat.includes("item") || rawCat.includes("商品")
                            ? "product"
                            : rawCat.includes("scene") || rawCat.includes("env") || rawCat.includes("bg") || rawCat.includes("场景")
                              ? "scene"
                              : "character";

                    const categoryEmoji = category === "character" ? "👤" : category === "product" ? "📦" : "🏠";
                    const categoryLabel = category === "character" ? "人物" : category === "product" ? "商品" : "场景";
                    const name = slot.name || (category === "character" ? "出镜主角" : category === "product" ? "核心商品" : "主体场景");
                    const visualDesc = slot.visualDesc || slot.desc || "";

                    const defaultTxt2Img =
                        category === "character"
                            ? `A photograph captured as a single frame from a video actually shot on an iPhone, with the texture of real iPhone footage. Real skin texture, natural soft lighting, coherent visual quality. A modern Asian person, exceptionally authentic, with very broad shoulders and excellent head-to-shoulder proportions. The face points straight toward the lens, natural posture. ${visualDesc}`
                            : category === "product"
                              ? `Commercial high-end still life photography of the product. Studio softbox lighting, pristine packaging, crisp label details, clean modern backdrop, realistic materials and specular highlights. ${visualDesc}`
                              : `A photograph captured as a single frame from real iPhone video footage. Natural ambient window lighting, clean spatial composition, lived-in modern realistic interior. ${visualDesc}`;

                    const isTurnaround = isTurnaroundAsset(undefined, visualDesc);
                    const defaultImg2Img =
                        category === "character"
                            ? (isTurnaround
                                ? `以参考图中的多视角角色设定板为100%视觉特征锚点。严格锁定五官相貌、脸型轮廓、发型发色与特定服饰特征，平视中性漫射柔光，高保真单人实拍写真定妆大片，真实皮肤微孔毛孔纹理，零过度磨皮，零AI塑料感。${visualDesc}`
                                : `多视角角色一致性设定板（正面、3/4侧面、正侧面、半身与全身）。中性极简纯色背景，影棚漫射柔光，平视镜头。严格保持参考图中的人物五官相貌、脸型轮廓、发型发色与神态气质高度一致，细腻真实皮肤纹理，写实实拍质感，零过度磨皮与零AI塑料感。${visualDesc}`)
                            : category === "product"
                              ? `专业商业静物棚拍摄影，多角度与微距特写展示。纯白纯净背景，标准柔和商业布光。基于参考图中的实物商品形态、包装结构、Logo标识与细节特征，消除杂乱反光，高光与材质反射自然，包装边缘与色彩高度保真。${visualDesc}`
                              : `空间环境优化升级，剔除画面中多余杂乱的人物、行人、多余杂物与视觉干扰。保留空间硬装结构，优化自然采光与通透色调，写实电影感摄影，打造纯净空间基底图。${visualDesc}`;

                    const entityId = slot.slotId || `${category}-${idx + 1}`;
                    slotMatchedAssetMap.set(entityId, slot.matchedAsset ?? null);

                    detectedEntities.push({
                        id: entityId,
                        category,
                        categoryEmoji,
                        categoryLabel,
                        name,
                        visualDesc,
                        promptTxt2Img: slot.promptTxt2Img || defaultTxt2Img,
                        promptImg2Img: slot.promptImg2Img || defaultImg2Img,
                    });
                });
            } else {
                // A. 人物 (Characters) - 支持 0..N
                const rawActor = originalMasterSlots.actor || originalMasterSlots.character || masterSlots.actor?.name || masterSlots.actor?.promptAnchor;
                const actorDesc = originalMasterSlots.actor || originalMasterSlots.character || masterSlots.actor?.promptAnchor || masterSlots.actor?.prompt;
                const actorVisualDesc = !isExplicitNone(actorDesc) ? String(actorDesc).trim() : "";

                const distinctCharacters: Array<{ name: string; desc: string }> = [];
                if (actorVisualDesc) {
                    const lines = actorVisualDesc
                        .split(/[\n;；]+/)
                        .map((l) => l.trim())
                        .filter((l) => !isExplicitNone(l) && l.length > 2);
                    if (lines.length > 1 && lines.some((l) => /主角|配角|主播|助播|人物|角色|演员|男|女/.test(l))) {
                        lines.forEach((line, idx) => {
                            const colonIdx = line.indexOf("：") !== -1 ? line.indexOf("：") : line.indexOf(":");
                            const name = colonIdx !== -1 ? line.slice(0, colonIdx).trim() : `出镜人物 ${idx + 1}`;
                            const desc = colonIdx !== -1 ? line.slice(colonIdx + 1).trim() : line;
                            distinctCharacters.push({ name: masterSlots.actor?.name || name, desc: desc || line });
                        });
                    } else {
                        distinctCharacters.push({
                            name: masterSlots.actor?.name || "出镜主角",
                            desc: actorVisualDesc,
                        });
                    }
                }

                if (Array.isArray(shotManifest)) {
                    for (const s of shotManifest) {
                        const charAnchor = s.characterAnchor || s.character;
                        const speaker = s.speaker;
                        const charName = charAnchor || (speaker && !isExplicitNone(speaker) && speaker !== "旁白" && speaker !== "解说" ? speaker : undefined);
                        if (charName && !isExplicitNone(charName)) {
                            const exists = distinctCharacters.some(
                                (c) => c.name === charName || c.desc.includes(charName) || charName.includes(c.name),
                            );
                            if (!exists && distinctCharacters.length < 4) {
                                distinctCharacters.push({
                                    name: charName,
                                    desc: s.characterAnchor || s.visualSubject || `${charName}，生活化自然妆造，平视镜头`,
                                });
                            }
                        }
                    }
                }

                distinctCharacters.forEach((char, idx) => {
                    const entityId = `actor-${idx + 1}`;
                    const name = char.name;
                    const visualDesc = char.desc || "亚洲干练职场女性，发型利落，职业西装，面部五官高度一致";
                    detectedEntities.push({
                        id: entityId,
                        category: "character",
                        categoryEmoji: "👤",
                        categoryLabel: "人物",
                        name,
                        visualDesc,
                        promptTxt2Img: `A photograph captured as a single frame from a video actually shot on an iPhone, with the texture of real iPhone footage. Real skin texture, natural soft lighting, coherent visual quality. A modern Asian person, exceptionally authentic, with very broad shoulders and excellent head-to-shoulder proportions. The face points straight toward the lens, natural posture. ${visualDesc}`,
                        promptImg2Img: isTurnaroundAsset(undefined, visualDesc)
                            ? `以参考图中的多视角角色设定板为100%视觉特征锚点。严格锁定五官相貌、脸型轮廓、发型发色与特定服饰特征，平视中性漫射柔光，高保真单人实拍写真定妆大片，真实皮肤微孔毛孔纹理，零过度磨皮，零AI塑料感。${visualDesc}`
                            : `多视角角色一致性设定板（正面、3/4侧面、正侧面、半身与全身）。中性极简纯色背景，影棚漫射柔光，平视镜头。严格保持参考图中的人物五官相貌、脸型轮廓、发型发色与神态气质高度一致，细腻真实皮肤纹理，写实实拍质感，零过度磨皮与零AI塑料感。${visualDesc}`,
                    });
                });

                // B. 商品 (Products) - 支持 0..N
                const rawProduct = originalMasterSlots.product || originalMasterSlots.focalObject || masterSlots.product?.name || masterSlots.product?.promptAnchor;
                const productDesc = originalMasterSlots.product || originalMasterSlots.focalObject || masterSlots.product?.promptAnchor || masterSlots.product?.prompt;
                const productVisualDesc = !isExplicitNone(productDesc) ? String(productDesc).trim() : "";

                const distinctProducts: Array<{ name: string; desc: string }> = [];
                if (productVisualDesc) {
                    const lines = productVisualDesc
                        .split(/[\n;；]+/)
                        .map((l) => l.trim())
                        .filter((l) => !isExplicitNone(l) && l.length > 2);
                    if (lines.length > 1 && lines.some((l) => /主推|赠品|商品|产品|道具|sku|瓶|盒|装/.test(l))) {
                        lines.forEach((line, idx) => {
                            const colonIdx = line.indexOf("：") !== -1 ? line.indexOf("：") : line.indexOf(":");
                            const name = colonIdx !== -1 ? line.slice(0, colonIdx).trim() : `核心商品 ${idx + 1}`;
                            const desc = colonIdx !== -1 ? line.slice(colonIdx + 1).trim() : line;
                            distinctProducts.push({ name: masterSlots.product?.name || name, desc: desc || line });
                        });
                    } else {
                        distinctProducts.push({
                            name: masterSlots.product?.name || "核心商品",
                            desc: productVisualDesc,
                        });
                    }
                }

                if (Array.isArray(shotManifest)) {
                    for (const s of shotManifest) {
                        const prodAnchor = s.productAnchor || s.focalAnchor || s.brollCoverSlot?.assetLabel;
                        if (prodAnchor && !isExplicitNone(prodAnchor)) {
                            const exists = distinctProducts.some(
                                (p) => p.name === prodAnchor || p.desc.includes(prodAnchor) || prodAnchor.includes(p.name),
                            );
                            if (!exists && distinctProducts.length < 4) {
                                distinctProducts.push({
                                    name: prodAnchor,
                                    desc: s.productAnchor || s.brollCoverSlot?.coverPrompt || `${prodAnchor} 实物特写，包装细节完整，材质反光真实`,
                                });
                            }
                        }
                    }
                }

                distinctProducts.forEach((prod, idx) => {
                    const entityId = `product-${idx + 1}`;
                    const name = prod.name;
                    const visualDesc = prod.desc || "核心卖点商品特写，商业静物摄影，包装细节完整，高光真实";
                    detectedEntities.push({
                        id: entityId,
                        category: "product",
                        categoryEmoji: "📦",
                        categoryLabel: "商品",
                        name,
                        visualDesc,
                        promptTxt2Img: `Commercial high-end still life photography of the product. Studio softbox lighting, pristine packaging, crisp label details, clean modern backdrop, realistic materials and specular highlights. ${visualDesc}`,
                        promptImg2Img: `专业商业静物棚拍摄影，多角度与微距特写展示。纯白纯净背景，标准柔和商业布光。基于参考图中的实物商品形态、包装结构、Logo标识与细节特征，消除杂乱反光，高光与材质反射自然，包装边缘与色彩高度保真。${visualDesc}`,
                    });
                });

                // C. 场景 (Scenes) - 支持 0..N
                const rawScene = originalMasterSlots.scene || masterSlots.scene?.name || masterSlots.scene?.promptAnchor;
                const sceneDesc = originalMasterSlots.scene || masterSlots.scene?.promptAnchor || masterSlots.scene?.prompt;
                const sceneVisualDesc = !isExplicitNone(sceneDesc) ? String(sceneDesc).trim() : "";

                const distinctScenes: Array<{ name: string; desc: string }> = [];
                if (sceneVisualDesc) {
                    const lines = sceneVisualDesc
                        .split(/[\n;；]+/)
                        .map((l) => l.trim())
                        .filter((l) => !isExplicitNone(l) && l.length > 2);
                    if (lines.length > 1 && lines.some((l) => /主景|副景|室内|室外|场景|环境|客厅|房间|背景/.test(l))) {
                        lines.forEach((line, idx) => {
                            const colonIdx = line.indexOf("：") !== -1 ? line.indexOf("：") : line.indexOf(":");
                            const name = colonIdx !== -1 ? line.slice(0, colonIdx).trim() : `主体场景 ${idx + 1}`;
                            const desc = colonIdx !== -1 ? line.slice(colonIdx + 1).trim() : line;
                            distinctScenes.push({ name: masterSlots.scene?.name || name, desc: desc || line });
                        });
                    } else {
                        distinctScenes.push({
                            name: masterSlots.scene?.name || "主体场景",
                            desc: sceneVisualDesc,
                        });
                    }
                }

                if (Array.isArray(shotManifest)) {
                    for (const s of shotManifest) {
                        const sceneAnchor = s.sceneAnchor || s.location;
                        if (sceneAnchor && !isExplicitNone(sceneAnchor)) {
                            const exists = distinctScenes.some(
                                (sc) => sc.name === sceneAnchor || sc.desc.includes(sceneAnchor) || sceneAnchor.includes(sc.name),
                            );
                            if (!exists && distinctScenes.length < 3) {
                                distinctScenes.push({
                                    name: sceneAnchor,
                                    desc: s.sceneAnchor || s.lightingTone || `${sceneAnchor} 环境，自然采光，电影感色调`,
                                });
                            }
                        }
                    }
                }

                distinctScenes.forEach((sc, idx) => {
                    const entityId = `scene-${idx + 1}`;
                    const name = sc.name;
                    const visualDesc = sc.desc || "现代极简采光室内，落地窗，柔和自然光，生活化空间质感";
                    detectedEntities.push({
                        id: entityId,
                        category: "scene",
                        categoryEmoji: "🏠",
                        categoryLabel: "场景",
                        name,
                        visualDesc,
                        promptTxt2Img: `A photograph captured as a single frame from real iPhone video footage. Natural ambient window lighting, clean spatial composition, lived-in modern realistic aesthetic. ${visualDesc}`,
                        promptImg2Img: `空间环境优化升级，剔除画面中多余杂乱的人物、行人、多余杂物与视觉干扰。保留空间硬装结构，优化自然采光与通透色调，写实电影感摄影，打造纯净空间基底图。${visualDesc}`,
                    });
                });

                // 若完全没有任何提取出的实体（0人物，0商品，0场景），兜底提供 1 项核心视觉母版行
                if (detectedEntities.length === 0) {
                    detectedEntities.push({
                        id: "slot-default",
                        category: "scene",
                        categoryEmoji: "🎬",
                        categoryLabel: "场景",
                        name: "核心视觉母版",
                        visualDesc: "全片基准视觉风格与美学调性，写实摄影质感",
                        promptTxt2Img: "A photograph captured as a single frame from real video footage. Natural soft lighting, cinematic atmosphere, clean composition.",
                        promptImg2Img: "空间环境优化升级，剔除画面中多余杂乱的人物、行人、多余杂物与视觉干扰。保留空间硬装结构，优化自然采光与通透色调，写实电影感摄影，打造纯净空间基底图。",
                    });
                }
            }

            // 筛选所有可用图片素材节点（直连或通过素材分析连入的素材）
            const imageMediaNodes = mediaNodes.filter(
                (n) =>
                    n.type === CanvasNodeType.Image ||
                    n.metadata?.mimeType?.startsWith("image/") ||
                    Boolean(n.metadata?.content && !n.metadata?.mimeType?.startsWith("video/") && !n.metadata?.mimeType?.startsWith("audio/")),
            );

            // 智能将素材插槽与可用图片节点进行匹配
            const assignedMediaIds = new Set<string>();
            for (let i = 0; i < detectedEntities.length; i++) {
                const entity = detectedEntities[i];
                let bestMatchId: string | undefined;

                const rawMatched = slotMatchedAssetMap.get(entity.id);
                // 1. 若大模型显式指定了 matchedAsset，优先依据该指示匹配
                if (rawMatched && typeof rawMatched === "string" && !isExplicitNone(rawMatched)) {
                    const trimmed = rawMatched.trim();
                    // 1.1 匹配 @图片N 或 图片N
                    const refMatch = trimmed.match(/@?图片\s*(\d+)/i);
                    if (refMatch) {
                        const index = parseInt(refMatch[1], 10) - 1;
                        if (index >= 0 && index < imageMediaNodes.length) {
                            bestMatchId = imageMediaNodes[index].id;
                        }
                    }

                    // 1.2 匹配 nodeId、storageKey 或 title
                    if (!bestMatchId) {
                        const foundByTitleOrId = imageMediaNodes.find(
                            (img) =>
                                img.id === trimmed ||
                                img.title === trimmed ||
                                (img.title && trimmed.toLowerCase().includes(img.title.toLowerCase())) ||
                                (img.title && img.title.toLowerCase().includes(trimmed.toLowerCase()))
                        );
                        if (foundByTitleOrId) {
                            bestMatchId = foundByTitleOrId.id;
                        }
                    }

                    // 1.3 匹配 upstreamAnalysis.fileSummaries 中的 fileId 或 name
                    if (!bestMatchId && upstreamAnalysis) {
                        const summaries = (upstreamAnalysis.metadata?.materialAnalysis as any)?.result?.fileSummaries || [];
                        const summaryMatch = summaries.find(
                            (s: any) =>
                                s.fileId === trimmed ||
                                s.name === trimmed ||
                                (s.name && trimmed.toLowerCase().includes(s.name.toLowerCase()))
                        );
                        if (summaryMatch) {
                            const imgNode = imageMediaNodes.find((img) => img.id === summaryMatch.fileId);
                            if (imgNode) bestMatchId = imgNode.id;
                        }
                    }
                }

                // 2. 若大模型显式指明该插槽无素材（null / "无" / ""），代表未连接素材，不强行关联图片，保持插槽为空
                const explicitlyEmpty = slotMatchedAssetMap.has(entity.id) && (rawMatched === null || rawMatched === undefined || isExplicitNone(rawMatched));

                // 3. 若非明确为空且尚未匹配成功，执行特征与语义兜底打分匹配
                if (!bestMatchId && !explicitlyEmpty) {
                    let highestScore = 0;
                    for (const img of imageMediaNodes) {
                        if (assignedMediaIds.has(img.id) && imageMediaNodes.length >= detectedEntities.length) continue;

                        const title = (img.title || "").toLowerCase();
                        const prompt = (img.metadata?.prompt || "").toLowerCase();
                        const fileSummary = ((upstreamAnalysis?.metadata?.materialAnalysis as any)?.result?.fileSummaries || []).find((s: any) => s.fileId === img.id);
                        const summary = (fileSummary?.summary || "").toLowerCase();
                        const combined = `${title} ${prompt} ${summary}`;

                        let score = 0;
                        if (entity.category === "product") {
                            if (/商品|产品|包装|实物|特写|瓶|盒|袋|罐|凝胶|膏|水|霜|液|服|鞋|包|机|product|item|goods|sku/.test(combined)) score += 30;
                            if (entity.name && combined.includes(entity.name.toLowerCase())) score += 50;
                        } else if (entity.category === "character") {
                            if (/人物|人像|主角|出镜|模特|演员|主播|肖像|头像|女|男|face|avatar|person|actor|character/.test(combined)) score += 30;
                            if (entity.name && combined.includes(entity.name.toLowerCase())) score += 50;
                        } else if (entity.category === "scene") {
                            if (/场景|背景|环境|室内|室外|客厅|房间|写字楼|会议室|展厅|街道|scene|background|bg|view/.test(combined)) score += 30;
                            if (entity.name && combined.includes(entity.name.toLowerCase())) score += 50;
                        }

                        const nameKeywords = entity.name.split(/[\s·,，_-]+/);
                        for (const kw of nameKeywords) {
                            if (kw.length >= 2 && combined.includes(kw.toLowerCase())) {
                                score += 25;
                            }
                        }

                        if (score > highestScore && score >= 20) {
                            highestScore = score;
                            bestMatchId = img.id;
                        }
                    }

                    // 兜底：若只有一个图片素材且当前只有一个商品（或角色），默认自动关联
                    if (!bestMatchId && imageMediaNodes.length === 1 && !assignedMediaIds.has(imageMediaNodes[0].id)) {
                        if (entity.category === "product" || (entity.category === "character" && !detectedEntities.some((e) => e.category === "product"))) {
                            bestMatchId = imageMediaNodes[0].id;
                        }
                    }
                }

                if (bestMatchId) {
                    entity.matchedMediaNodeId = bestMatchId;
                    assignedMediaIds.add(bestMatchId);
                }
            }

            // 辅助检测：判断某个参考素材节点或描述是否已经属于“三视图/四视图/多视角角色设定板”
            function isTurnaroundAsset(node?: CanvasNodeData, desc?: string): boolean {
                const combined = [
                    node?.title,
                    node?.metadata?.prompt,
                    desc,
                    (node?.metadata as any)?.fileName,
                ].filter(Boolean).join(" ").toLowerCase();

                return /三视图|四视图|多视角|设定图|设定板|转角|turnaround|character sheet|model sheet|multi-view|orthographic|四视|三视/.test(combined);
            }

            const masterRefColumns: CanvasBatchReferenceColumn[] = [
                { id: "ref-image", label: "参考图插槽" },
            ];
            const masterTextColumns = [
                { id: "col-slot-name", label: "资产名称与分类", type: "text" as const },
                { id: "col-visual-desc", label: "视觉外观特征", type: "text" as const },
            ];

            const existingMasterRows = existingMasterNode?.metadata?.batchTable?.rows || [];
            const masterRows: CanvasBatchRow[] = detectedEntities.map((entity, idx) => {
                const existingRow = existingMasterRows.find(
                    (r) => r.cells?.["col-slot-id"] === entity.id || r.id === `master-row-${entity.id}` || r.id?.includes(entity.id) || r.cells?.["col-slot-name"]?.includes(entity.name)
                ) || existingMasterRows[idx];

                const preservedOutputNodeId = existingRow?.outputNodeId && nodeById.has(existingRow.outputNodeId) ? existingRow.outputNodeId : undefined;
                const preservedInputNodeId = existingRow?.inputNodeIds?.[0] || entity.matchedMediaNodeId || "";

                const matchedMediaNode = preservedInputNodeId ? nodeById.get(preservedInputNodeId) : undefined;
                const isTurnaround = isTurnaroundAsset(matchedMediaNode, entity.visualDesc);

                let basePrompt = "";
                if (preservedInputNodeId) {
                    if (entity.category === "character" && isTurnaround) {
                        if (entity.promptImg2Img && !entity.promptImg2Img.includes("三视图设计") && !entity.promptImg2Img.includes("四视图设计")) {
                            basePrompt = entity.promptImg2Img;
                        } else {
                            basePrompt = `以参考图中的多视角角色设定板为100%视觉特征锚点。严格锁定五官相貌、脸型轮廓、发型发色、肤色质感、身材体态与特定服饰特征，保持三维空间特征绝对一致。平视中性漫射柔光，高清特写与全身实拍呈现，高保真单人定妆写真大片，真实皮肤微孔毛孔纹理，零过度磨皮，零AI塑料感。${entity.visualDesc}`;
                        }
                    } else {
                        basePrompt = entity.promptImg2Img;
                    }
                } else {
                    basePrompt = entity.promptTxt2Img;
                }

                const hasAsset = Boolean(preservedInputNodeId);
                const prompt = hasAsset ? (basePrompt.includes("@参考图") ? basePrompt : `@参考图1 ${basePrompt}`) : basePrompt;

                return {
                    id: existingRow?.id || `master-row-${entity.id}`,
                    enabled: true,
                    inputNodeIds: [preservedInputNodeId],
                    outputNodeId: preservedOutputNodeId,
                    prompt,
                    cells: {
                        "col-slot-id": entity.id,
                        "col-slot-name": `${entity.categoryEmoji} ${entity.name} (${entity.categoryLabel})`,
                        "col-visual-desc": entity.visualDesc,
                    },
                };
            });

            // 派生变体槽位
            if (Array.isArray(params.variations)) {
                params.variations.forEach((v: any, vIdx: number) => {
                    if (v.id === "v1" && !v.isCustom) return;
                    const vActorPrompt = v.masterSlots?.actor?.promptAnchor || v.masterSlots?.actor?.prompt;
                    if (vActorPrompt) {
                        masterRows.push({
                            id: `master-row-var-${v.id || vIdx}-actor`,
                            enabled: true,
                            inputNodeIds: [""],
                            prompt: vActorPrompt,
                            cells: {
                                "col-slot-id": `var-${v.id || vIdx}-actor`,
                                "col-slot-name": `👤 ${v.masterSlots?.actor?.name || `${v.name}-主角`} (人物变体)`,
                                "col-visual-desc": vActorPrompt,
                            },
                        });
                    }
                    const vProductPrompt = v.masterSlots?.product?.promptAnchor || v.masterSlots?.product?.prompt;
                    if (vProductPrompt) {
                        masterRows.push({
                            id: `master-row-var-${v.id || vIdx}-product`,
                            enabled: true,
                            inputNodeIds: [""],
                            prompt: vProductPrompt,
                            cells: {
                                "col-slot-id": `var-${v.id || vIdx}-product`,
                                "col-slot-name": `📦 ${v.masterSlots?.product?.name || `${v.name}-商品`} (商品变体)`,
                                "col-visual-desc": vProductPrompt,
                            },
                        });
                    }
                    const vScenePrompt = v.masterSlots?.scene?.promptAnchor || v.masterSlots?.scene?.prompt;
                    if (vScenePrompt) {
                        masterRows.push({
                            id: `master-row-var-${v.id || vIdx}-scene`,
                            enabled: true,
                            inputNodeIds: [""],
                            prompt: vScenePrompt,
                            cells: {
                                "col-slot-id": `var-${v.id || vIdx}-scene`,
                                "col-slot-name": `🏠 ${v.masterSlots?.scene?.name || `${v.name}-场景`} (场景变体)`,
                                "col-visual-desc": vScenePrompt,
                            },
                        });
                    }
                });
            }

            // ----------------------------------------------------
            // 4. 构建 表格 2:【创意配音】多维表格 (creative-voice)
            // ----------------------------------------------------
            const audioMediaNodes = mediaNodes.filter(
                (n) => n.type === CanvasNodeType.Audio || n.type === "audio" || Boolean(n.metadata?.mimeType?.startsWith("audio/")),
            );
            // 默认如果只提供了一个音色的话所有分镜的“参考音色”全部连线，如果没有就留空
            const singleVoiceNodeId = audioMediaNodes.length === 1 ? audioMediaNodes[0].id : (existingVoiceNode?.metadata?.batchTable?.rows?.[0]?.inputNodeIds?.[0] || "");

            const voiceRefColumns: CanvasBatchReferenceColumn[] = CREATIVE_VOICE_REF_COLUMNS;
            const voiceTextColumns = CREATIVE_VOICE_TEXT_COLUMNS;
            const existingVoiceRows = existingVoiceNode?.metadata?.batchTable?.rows || [];
            const voiceRows: CanvasBatchRow[] = (params.storyboardRows || []).map((shot: any, index: number) => {
                const lines = shot.lines || shot.dialogue || shot.plotDescription || shot.voiceLine || "";
                const speaker = shot.speaker || "旁白/主播";
                const tone = shot.voiceTone || shot.emotion || "热情亲和";

                const existingRow = existingVoiceRows[index];
                const preservedOutputNodeId = existingRow?.outputNodeId && nodeById.has(existingRow.outputNodeId) ? existingRow.outputNodeId : undefined;
                const preservedInputNodeIds = existingRow?.inputNodeIds?.length ? existingRow.inputNodeIds : [singleVoiceNodeId, ""];
                const preservedRewrite = existingRow?.cells?.["col-rewrite"] || "";

                return {
                    id: existingRow?.id || `voice-row-${shot.shotIndex || index + 1}-${nanoid(6)}`,
                    enabled: Boolean(lines),
                    inputNodeIds: preservedInputNodeIds,
                    outputNodeId: preservedOutputNodeId,
                    prompt: preservedRewrite || lines,
                    cells: {
                        "col-time": formatStoryboardTimeRange(shot),
                        "col-speaker": speaker,
                        "col-tone": tone,
                        "col-speaker-tone": `${speaker} | ${tone}`,
                        "col-lines": lines,
                        "col-rewrite": preservedRewrite,
                    },
                };
            });

            // ----------------------------------------------------
            // 5. 构建 表格 3:【创意分镜表】(storyboard)
            // ----------------------------------------------------
            // 提取目标视频模型上限时长并聚合视频段组
            const targetVideoModel = params.options?.videoModel || "kling-v1-6";
            const targetModelMaxDuration = resolveChannelVideoModelMaxDuration(effectiveConfig, targetVideoModel) || 10;
            const { annotatedShots } = groupShotsIntoVideoSegments(params.storyboardRows || [], targetModelMaxDuration);

            const storyboardRefColumns: CanvasBatchReferenceColumn[] = [
                { id: "ref-script", label: "参考脚本" },
                { id: "ref-master-slots", label: "创意资产" },
                { id: "ref-voiceover", label: "创意配音" },
            ];

            // 按用户要求：时间与镜头形态、首帧提示词，取消原来的“画面与核心对白”列和“绑定创意资产”列
            const storyboardTextColumns: Array<{ id: string; label: string; type: "text" }> = [
                { id: "col-time", label: "时间与镜头形态", type: "text" },
                { id: "col-image-prompt", label: "首帧提示词", type: "text" },
            ];

            // 提取原脚本公共描述内容（剔除逐镜头列表部分，保留总体基调）
            const rawRefScript = (
                (sourceNode.metadata?.refScript as any)?.directorOverview ||
                (sourceNode.metadata?.refScript as any)?.referenceScript ||
                (sourceNode.metadata?.content as string) ||
                ""
            ).trim();
            const cleanCommonOverview = rawRefScript.split(/##\s*(?:五|逐镜头|镜头清单|分镜清单)/)[0]?.trim() || rawRefScript.slice(0, 300);

            const storyboardRows: CanvasBatchRow[] = annotatedShots.map((annotatedShot, shotIdx) => {
                const shot = annotatedShot;
                const vRow = voiceRows[shotIdx];
                const rawLines = (vRow?.cells?.["col-rewrite"] || vRow?.cells?.["col-lines"] || shot.lines || shot.dialogue || shot.plotDescription || shot.voiceLine || "").trim();
                const lines = resolveDualTextForDisplay(rawLines);

                // 1. 第一列：该分镜参考脚本（代码拼接原脚本公共描述内容 + 该分镜描述内容）
                const shotRefScript = buildShotReferenceScript({
                    commonOverview: cleanCommonOverview,
                    shot,
                    shotIndex: shotIdx,
                });

                // 2. 第二列：关联创意资产（可能用到的素材均包含在内，支持多层叠放展示）
                const shotText = `${shot.characterAnchor || ""} ${shot.visualSubject || ""} ${shot.plotDescription || ""} ${shot.dialogue || ""} ${shot.imagePrompt || ""} ${shot.creativePrompt || ""}`;
                let matchedEntities: DetectedSlotEntity[] = [];
                if (Array.isArray(shot.targetSlots) && shot.targetSlots.length > 0) {
                    matchedEntities = detectedEntities.filter((e) =>
                        shot.targetSlots.includes(e.id) ||
                        shot.targetSlots.includes(e.name) ||
                        shot.targetSlots.includes(`@${e.name}`)
                    );
                }
                if (matchedEntities.length === 0) {
                    matchedEntities = detectedEntities.filter((e) => {
                        if (e.name && shotText.includes(e.name)) return true;
                        if (e.category === "character" && (shot.characterAnchor || /主角|人物|人像|演员|模特/.test(shotText) || shotText.includes("@出镜主角"))) return true;
                        if (e.category === "product" && (shot.productRef || /商品|产品|特写|包装|手持/.test(shotText) || shotText.includes("@核心商品"))) return true;
                        if (e.category === "scene" && (shot.sceneRef || /场景|环境|空镜|室内|室外/.test(shotText) || shotText.includes("@主体场景"))) return true;
                        return false;
                    });
                }
                const candidateEntities = matchedEntities.length > 0 ? matchedEntities : detectedEntities;
                const targetEntity = candidateEntities[0] || detectedEntities[0];
                const targetEntityId = targetEntity?.id || "actor-1";
                const targetEntityIds = candidateEntities.map((e) => e.id);

                // 自动替换与引用：新资产优先 > 原参考素材 > 空白插槽
                const existingMasterRow = existingMasterNode?.metadata?.batchTable?.rows?.find((r) =>
                    r.cells?.["col-slot-name"]?.includes(targetEntity?.name || "") || r.id?.includes(targetEntityId)
                );
                const assetNodeId = existingMasterRow?.outputNodeId || targetEntity?.matchedMediaNodeId || "";

                // 3. 第三列：关联创意配音（新生成音频 > 原参考音色 > 空白插槽）
                const hasRefVoice = Boolean(singleVoiceNodeId);
                const existingVoiceRow = existingVoiceNode?.metadata?.batchTable?.rows?.[shotIdx];
                const voiceAudioNodeId = existingVoiceRow?.outputNodeId || vRow?.outputNodeId || singleVoiceNodeId || "";

                // 4. 第四列：时间与镜头形态（带段组与分镜标识：段1-镜1）
                const timeAndLensValue = annotatedShot.segmentTimeAndLensLabel;

                // 5. 第五列：首帧提示词（优先使用大模型生成的自洽地道提示词，杜绝粗暴前后夹塞）
                let firstFramePrompt = (shot.imagePrompt || shot.keyframePrompt || "").trim();
                const primaryActor = detectedEntities.find((e) => e.category === "character")?.name || "出镜主角";
                const primaryProduct = detectedEntities.find((e) => e.category === "product")?.name || "核心商品";
                const primaryScene = detectedEntities.find((e) => e.category === "scene")?.name || "主体场景";

                const isCharInShot = !isExplicitNone(shot.characterAnchor) && !/无人物|无角色|空镜/.test(shot.characterAnchor || "") && (shot.characterAnchor || !shot.sceneRef);
                const isProductInShot = Boolean(
                    shot.productRef ||
                    shot.brollCoverSlot ||
                    /商品|产品|瓶|盒|装|特写|展示|手持|使用/.test(shotText)
                );

                // 若大模型未输出提示词，则提供结构完整自洽的 iPhone UGC 实拍英文提示词兜底
                if (!firstFramePrompt) {
                    const actorToken = isCharInShot ? `@${primaryActor}` : "";
                    const prodToken = isProductInShot ? `@${primaryProduct}` : "";
                    const subjectDesc = [actorToken, prodToken].filter(Boolean).join(" with ") || "@主体";
                    firstFramePrompt = `A photograph captured as a single frame from an iPhone video, natural soft lighting. ${subjectDesc} in @${primaryScene}, authentic skin pores and fine textures, photoreal and stable.`;
                }
                const cleanedFirstFramePrompt = cleanCreativePromptText(firstFramePrompt);

                // 6. 第六列：创意提示词（优先保留大模型生成的全息工程图纸，严禁输出任何 JSON）
                const rawCreativePrompt = (shot.creativePrompt || shot.motionPrompt || shot.videoMotionPrompt || (shot.camera ? `【运镜】${shot.camera}` : "")).trim();
                const voiceTag = voiceAudioNodeId ? "【声音参考】采用 @配音 播报" : (hasRefVoice ? "【声音参考】采用 @参考音色 播报" : "");
                let finalCreativePrompt = rawCreativePrompt;

                if (!finalCreativePrompt) {
                    const motionBase = (shot.motionPrompt || shot.videoMotionPrompt || (shot.camera ? `【运镜】${shot.camera}` : "")).trim();
                    const creativeParts: string[] = [];
                    if (cleanCommonOverview) {
                        creativeParts.push(`【全局基调】${cleanCommonOverview.slice(0, 120)}`);
                    }
                    if (motionBase) {
                        creativeParts.push(`【物理运镜与动效】${motionBase}`);
                    }
                    if (lines) {
                        if (isCharInShot) {
                            creativeParts.push(`【核心对白与视听】@出镜主角 面对镜头自然表达：“${lines}”`);
                        } else {
                            creativeParts.push(`【画外解说】“${lines}”`);
                        }
                    }
                    if (voiceTag) {
                        creativeParts.push(voiceTag);
                    }
                    if (shot.brollCoverSlot) {
                        const cs = shot.brollCoverSlot;
                        const dur = cs.coverDurationSec || cs.durationSec || 1.5;
                        const label = cs.assetLabel || cs.coverDescription || cs.targetWord || "切片";
                        const targetWord = cs.targetWord ? `“${cs.targetWord}”处覆盖 ` : "";
                        creativeParts.push(`【L-Cut磁吸覆层】[磁吸 ${dur}s] ${targetWord}${label}`);
                    }
                    finalCreativePrompt = creativeParts.join("\n\n");
                } else {
                    if (voiceTag && !finalCreativePrompt.includes("【声音参考】") && !finalCreativePrompt.includes("@参考音色") && !finalCreativePrompt.includes("@配音")) {
                        finalCreativePrompt = `${finalCreativePrompt}\n\n${voiceTag}`;
                    }
                }
                const cleanedCreativePrompt = cleanCreativePromptText(finalCreativePrompt);

                const cells: Record<string, string> = {
                    "col-ref-script": shotRefScript,
                    "col-asset-target": targetEntityId,
                    "col-asset-targets": JSON.stringify(targetEntityIds),
                    "col-time": timeAndLensValue,
                    "col-image-prompt": cleanedFirstFramePrompt,
                    "col-creative-prompt": cleanedCreativePrompt,
                };

                return {
                    id: `batch-row-${nanoid()}`,
                    enabled: true,
                    inputNodeIds: [sourceNode.id, assetNodeId, voiceAudioNodeId],
                    prompt: cleanedCreativePrompt,
                    cells,
                };
            });

            // ----------------------------------------------------
            // 6. 计算三大表格的空间坐标（优雅规避重叠）
            // ----------------------------------------------------
            const sourcePos = sourceNode.position;
            const sourceW = sourceNode.width || 690;

            const masterWidth = existingMasterNode?.width || 1560;
            const masterHeight = Math.max(460, 140 + masterRows.length * 124);
            const masterPos = existingMasterNode?.position || {
                x: sourcePos.x + sourceW + 80,
                y: sourcePos.y,
            };

            const voiceWidth = existingVoiceNode?.width || 1560;
            const voiceHeight = Math.max(480, 108 + voiceRows.length * 116);
            const voicePos = existingVoiceNode?.position || {
                x: sourcePos.x + sourceW + 80,
                y: sourcePos.y + masterHeight + 36,
            };

            const storyboardWidth = existingStoryboardNode?.width || 1680;
            const storyboardHeight = Math.max(520, 140 + storyboardRows.length * 135);
            const storyboardPos = existingStoryboardNode?.position || {
                x: sourcePos.x + sourceW + 80 + Math.max(masterWidth, voiceWidth) + 80,
                y: sourcePos.y,
            };

            // ----------------------------------------------------
            // 7. 组装节点数据
            // ----------------------------------------------------
            const masterTableData: CanvasBatchTableData = {
                ...(existingMasterNode?.metadata?.batchTable || {}),
                operation: "creative",
                concurrency: 6,
                aiGenerated: true,
                contentKind: "master-slots",
                storyboardTitle: `${baseTitle} - 创意资产表`,
                referenceColumns: masterRefColumns,
                textColumns: masterTextColumns,
                rows: masterRows,
            };
            const masterNode: CanvasNodeData = {
                id: masterNodeId,
                type: CREATIVE_ASSET_TABLE_NODE_TYPE,
                title: `${baseTitle} - 创意资产表`,
                position: masterPos,
                width: masterWidth,
                height: masterHeight,
                metadata: {
                    ...(existingMasterNode?.metadata || {}),
                    batchTable: masterTableData,
                    status: "idle",
                },
            };

            const voiceTableData: CanvasBatchTableData & { voiceSlotMode?: VoiceSlotMode } = {
                ...(existingVoiceNode?.metadata?.batchTable || {}),
                operation: "creative",
                concurrency: 6,
                aiGenerated: true,
                contentKind: "voiceover",
                voiceSlotMode: "all",
                storyboardTitle: `${baseTitle} - 创意配音`,
                referenceColumns: voiceRefColumns,
                textColumns: voiceTextColumns,
                rows: voiceRows,
            };
            const voiceNode: CanvasNodeData = {
                id: voiceNodeId,
                type: CREATIVE_VOICE_TABLE_NODE_TYPE,
                title: `${baseTitle} - 创意配音`,
                position: voicePos,
                width: voiceWidth,
                height: voiceHeight,
                metadata: {
                    ...(existingVoiceNode?.metadata || {}),
                    batchTable: voiceTableData,
                    status: "idle",
                },
            };

            const storyboardTitle = baseTitle.includes("创意分镜表") ? baseTitle : `${baseTitle} - 创意分镜表`;
            const storyboardTableData: CanvasBatchTableData = {
                ...(existingStoryboardNode?.metadata?.batchTable || {}),
                operation: "creative",
                concurrency: 10,
                aiGenerated: true,
                contentKind: "storyboard",
                storyboardTitle,
                referenceColumns: storyboardRefColumns,
                textColumns: storyboardTextColumns,
                rows: storyboardRows,
            };
            const storyboardNode: CanvasNodeData = {
                id: storyboardNodeId,
                type: CREATIVE_STORYBOARD_TABLE_NODE_TYPE,
                title: storyboardTitle,
                position: storyboardPos,
                width: storyboardWidth,
                height: storyboardHeight,
                metadata: {
                    ...(existingStoryboardNode?.metadata || {}),
                    batchTable: storyboardTableData,
                    status: "idle",
                    model: params.options?.videoModel,
                    size: "9:16",
                },
            };

            // ----------------------------------------------------
            // 8. 自动拓扑连线 (Auto-Wiring: 创意资产表+配音表 -> 分镜总装)
            // ----------------------------------------------------
            const targetConns: Array<{ from: string; to: string; toHandle: string }> = [
                // 1. 将所有匹配到素材的行，把对应素材图片连入创意资产表的参考图插槽
                ...Array.from(assignedMediaIds).map((imgId) => ({
                    from: imgId,
                    to: masterNodeId,
                    toHandle: "batch-reference:ref-image",
                })),
                // 2. 创意资产表接入分镜总装表的创意资产槽
                { from: masterNodeId, to: storyboardNodeId, toHandle: "batch-reference:ref-master-slots" },
                // 3. 编导脚本接入分镜表
                { from: sourceNode.id, to: storyboardNodeId, toHandle: "batch-reference:ref-script" },
                // 4. 若提供了唯一定位参考音色，连入创意配音表的参考音色槽
                ...(singleVoiceNodeId ? [{ from: singleVoiceNodeId, to: voiceNodeId, toHandle: "batch-reference:ref-voice" }] : []),
                // 5. 创意配音表接入分镜总装表
                { from: voiceNodeId, to: storyboardNodeId, toHandle: "batch-reference:ref-voiceover" },
                // 6. 额外媒体接入分镜总装表
                ...mediaNodes.map((m, i) => ({
                    from: m.id,
                    to: storyboardNodeId,
                    toHandle: `batch-reference:ref-asset-${i + 1}`,
                })),
            ];

            const connKey = (c: { fromNodeId: string; toNodeId: string; toHandleId?: string }) =>
                `${c.fromNodeId}->${c.toNodeId}:${c.toHandleId || ""}`;
            const existingConnKeys = new Set(currentConnections.map(connKey));

            const newConnsToAdd: CanvasConnection[] = [];
            for (const tc of targetConns) {
                const key = `${tc.from}->${tc.to}:${tc.toHandle}`;
                if (!existingConnKeys.has(key)) {
                    newConnsToAdd.push({
                        id: `conn-${nanoid()}`,
                        fromNodeId: tc.from,
                        fromHandleId: "output",
                        toNodeId: tc.to,
                        toHandleId: tc.toHandle,
                        relation: "batch-input",
                    });
                    existingConnKeys.add(key);
                }
            }

            // ----------------------------------------------------
            // 9. 提交更新并聚焦
            // ----------------------------------------------------
            const nodeMap = new Map(currentNodes.map((n) => [n.id, n]));
            nodeMap.set(masterNode.id, masterNode);
            nodeMap.set(voiceNode.id, voiceNode);
            nodeMap.set(storyboardNode.id, storyboardNode);

            const updatedSourceNode: CanvasNodeData = {
                ...sourceNode,
                metadata: {
                    ...sourceNode.metadata,
                    refScript: {
                        ...(sourceNode.metadata?.refScript || {}),
                        generatedTableIds: {
                            masterTableId: masterNodeId,
                            voiceTableId: voiceNodeId,
                            storyboardTableId: storyboardNodeId,
                        },
                    },
                },
            };
            nodeMap.set(sourceNode.id, updatedSourceNode);

            const nextNodes = Array.from(nodeMap.values());
            const nextConnections = [...currentConnections, ...newConnsToAdd];

            // 10. 自动同步创意资产表和创意配音表中已生成或配置的素材至分镜总装表
            const masterSyncRes = syncMasterTableRowsToStoryboard({
                masterNode,
                storyboardNode,
                nodes: nextNodes,
                connections: nextConnections,
            });
            const voiceSyncRes = syncVoiceTableRowsToStoryboard({
                voiceNode,
                storyboardNode: masterSyncRes.updatedStoryboardNode,
                nodes: nextNodes,
                connections: masterSyncRes.newConnections,
            });

            nodeMap.set(voiceSyncRes.updatedStoryboardNode.id, voiceSyncRes.updatedStoryboardNode);
            const finalNodes = Array.from(nodeMap.values());
            const finalConnections = voiceSyncRes.newConnections;

            setNodes(finalNodes);
            nodesRef.current = finalNodes;
            setConnections(finalConnections);
            connectionsRef.current = finalConnections;

            setSelectedNodeIds(new Set([storyboardNodeId]));
            selectedNodeIdsRef.current = new Set([storyboardNodeId]);
            setSelectedConnectionId(null);
            setDialogNodeId(null);
            focusCanvasNode(storyboardNodeId);

            message.success(
                existingStoryboardNode
                    ? `已同步更新创意复刻表格集群（创意资产表 + 创意配音 + 创意分镜表）！`
                    : `已生成创意复刻多维表格集群（创意资产表 + 创意配音 + 创意分镜表），已自动协同互联！`,
            );

            return {
                masterTableId: masterNodeId,
                voiceTableId: voiceNodeId,
                storyboardTableId: storyboardNodeId,
                storyboardId: storyboardNodeId,
            };
        },
        [focusCanvasNode, message, setConnections, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds],
    );
    // @opc-feature: hypit [end]

    const canvasNodeActions = useMemo<CanvasNodeActionContextValue>(
        () => ({
            upload: replaceCanvasNodeMedia,
            download: downloadNodeImage,
            duplicate: duplicateNodeFromContent,
            deleteNode: deleteNodeFromContent,
            updateMetadata: updateNodeMetadataFromContent,
            updateNode: updateNodeFromContent,
            updateMediaNode: updateMediaNodeFromContent,
            openArtCritique,
            addPanoramaCaptureNode,
            // @opc-feature: hypit [start]
            createStoryboardBatchTable,
            focusNode: focusCanvasNode,
            // @opc-feature: hypit [end]
        }),
        [addPanoramaCaptureNode, createStoryboardBatchTable, deleteNodeFromContent, downloadNodeImage, duplicateNodeFromContent, focusCanvasNode, openArtCritique, replaceCanvasNodeMedia, updateMediaNodeFromContent, updateNodeFromContent, updateNodeMetadataFromContent],
    );
    const { agentSnapshot, agentUndoCount, applyAgentOps, canUndoAgentOps, dismissLastAgentChange, lastAgentChange, undoAgentOps, viewLastAgentChange } = useCanvasOperationHistory({
        projectId,
        domainProjectId: currentProject?.projectId,
        projectTitle: currentProject?.title || "未命名画布",
        nodes,
        connections,
        selectedNodeIds,
        viewport,
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        viewportRef,
        generateNodeRef,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setViewport,
        setContextMenu,
        focusSelection: fitCanvasSelection,
    });

    const { selectCanvasStyle, applyCanvasStyleAsync, styleApplying } = useCanvasStyleWorkflow({
        canvasId: projectId,
        domainProjectId: currentProject?.projectId,
        nodesRef,
        selectedNodeIdsRef,
        getCanvasCenter,
        setNodes,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        setStylePickerOpen,
    });

    const { applyDirectorOutput, createDirectorShot, openDirectorWorkbench, saveDirectorScene } = useCanvasDirector({
        projectId,
        domainProjectId: currentProject?.projectId,
        directorNodeId,
        directorScenes: currentProject?.directorScenes || [],
        nodesRef,
        connectionsRef,
        getCanvasCenter,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDirectorNodeId,
        updateProject,
    });

    const {
        activateStep: activateShortDramaStep,
        createPipeline: createShortDramaPipeline,
        guideCollapsed: shortDramaGuideCollapsed,
        openStoryInput,
        progress: shortDramaProgress,
        setGuideCollapsed: setShortDramaGuideCollapsed,
        skipGuide: skipShortDramaGuide,
    } = useCanvasShortDrama({
        nodes,
        connections,
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        getCanvasCenter,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setStylePickerOpen,
        fitCanvasSelection,
        focusCanvasNode,
        openTextEditor: openTextNodeEditor,
    });

    const shortDramaGuide = shortDramaEnabled && !currentProject?.projectId && shortDramaProgress.active ? { progress: shortDramaProgress, collapsed: shortDramaGuideCollapsed, onToggle: () => setShortDramaGuideCollapsed((value) => !value) } : undefined;

    const clearCanvas = useCallback(() => {
        const drawingIds = nodesRef.current.flatMap((node) => (node.type === CanvasNodeType.Drawing && node.metadata?.drawingId ? [node.metadata.drawingId] : []));
        if (drawingIds.length) {
            void Promise.all(drawingIds.map((drawingId) => removeCanvasDrawing(projectId, drawingId))).catch(() => message.warning("画布已清空，但部分本地绘图缓存清理失败"));
        }
        setNodes([]);
        setConnections([]);
        setTextEditorNodeId(null);
        setDrawingNodeId(null);
        setInfoNodeId(null);
        setSubtitleNodeId(null);
        setCropNodeId(null);
        setMaskEditNodeId(null);
        setAnnotationNodeId(null);
        setAngleNodeId(null);
        setLightingNodeId(null);
        setEmotionNodeId(null);
        setPreviewNodeId(null);
        setRunningNodeId(null);
        setArtCritiqueNodeId(null);
        deselectCanvas();
        setClearConfirmOpen(false);
        clearCanvasFiles();
    }, [clearCanvasFiles, deselectCanvas, message, nodesRef, projectId, setEmotionNodeId]);

    useCanvasKeyboard({
        enabled: projectLoaded && !versions.preview,
        nodesRef,
        selectedNodeIdsRef,
        selectedConnectionId,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setShortcutRequestNonce,
        setInfoNodeId,
        setCropNodeId,
        setMaskEditNodeId,
        setAnnotationNodeId,
        saveCanvasProject,
        zoomToActualSize,
        fitCanvasContent,
        fitCanvasSelection,
        undoCanvas,
        redoCanvas,
        cancelSelectionBox,
        copySelectedNodes,
        pasteCopiedNodes,
        restoreCopiedNodesFromText,
        shouldPreferCopiedNodes,
        pasteSystemClipboard,
        deleteNodes,
        deleteConnection,
        deselectCanvas,
        zoomCanvasIn,
        zoomCanvasOut,
        focusMode,
        exitFocusMode,
        toggleFocusMode,
        onOpenSearch: () => setNodeSearchOpen(true),
        beginBatchConnection: () => beginBatchConnectionMode(Array.from(selectedNodeIdsRef.current)),
    });

    const handleAssistantSessionsChange = useCallback((sessions: CanvasAssistantSession[], activeId: string | null) => {
        chatSessionsRef.current = sessions;
        activeChatIdRef.current = activeId;
        setChatSessions(sessions);
        setActiveChatId(activeId);
    }, []);

    const startTitleEditing = useCallback(() => {
        setTitleDraft(currentProject?.title || "未命名画布");
        setTitleEditing(true);
    }, [currentProject?.title]);

    const finishTitleEditing = useCallback(() => {
        const nextTitle = titleDraft.trim();
        if (nextTitle) renameCurrentProject(nextTitle);
        setTitleEditing(false);
    }, [renameCurrentProject, titleDraft]);

    const pasteAtPosition = useCallback(
        (position: Position) => {
            if (shouldPreferCopiedNodes() && pasteCopiedNodes(position)) return;
            void (async () => {
                try {
                    // 标记写入成功时仍优先系统图片，兼容截图和从外部应用复制的媒体。
                    const handled = await pasteSystemClipboard(position);
                    if (!handled) pasteCopiedNodes(position);
                } catch {
                    if (!pasteCopiedNodes(position)) message.warning("无法读取剪贴板内容");
                }
            })();
        },
        [message, pasteCopiedNodes, pasteSystemClipboard, shouldPreferCopiedNodes],
    );

    const copyingNodeContentRef = useRef(false);
    const copyNodeContentToClipboard = useCallback(
        async (node: CanvasNodeData | null) => {
            if (copyingNodeContentRef.current) return;
            copyingNodeContentRef.current = true;
            releaseCopiedNodesPastePriority();
            if (!node) {
                copyingNodeContentRef.current = false;
                message.warning("没有可复制的内容");
                return;
            }

            try {
                const content = node.metadata?.content?.trim();
                const resourceId = resourceIdFromStorageKey(node.metadata?.storageKey);
                // Resource-backed media must use the central access contract. This keeps
                // copy operations on the configured CDN/OSS URL instead of copying the
                // platform file endpoint or a stale URL persisted in canvas metadata.
                const copySource = resourceId
                    ? resolveResourceAccessURL((await getResourceAccess(`resource:${resourceId}`, "copy")).url)
                    : content || "";
                if (!copySource) throw new Error("没有可复制的内容");
                if (node.type === CanvasNodeType.Image) {
                    try {
                        await copyImageToSystemClipboard(copySource, node.metadata?.storageKey);
                        message.success("图片已复制到剪贴板");
                        return;
                    } catch (imageErr) {
                        const fallbackUrl = new URL(copySource, window.location.href).toString();
                        if (navigator.clipboard?.writeText) {
                            await navigator.clipboard.writeText(fallbackUrl).catch(() => undefined);
                            message.info("由于浏览器未获得焦点，已为您复制图片地址");
                            return;
                        }
                        if (await copyToClipboard(fallbackUrl)) {
                            message.info("由于浏览器未获得焦点，已为您复制图片地址");
                            return;
                        }
                        throw imageErr;
                    }
                }

                if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(copySource);
                else if (!copyToClipboard(copySource)) throw new Error("当前浏览器不支持写入剪贴板");
                message.success(node.type === CanvasNodeType.Text ? "文本已复制" : "内容链接已复制");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "复制失败，请检查浏览器剪贴板权限");
            } finally {
                copyingNodeContentRef.current = false;
            }
        },
        [message, releaseCopiedNodesPastePriority],
    );

    const copyNodeMediaUrlToClipboard = useCallback(
        async (node: CanvasNodeData | null) => {
            releaseCopiedNodesPastePriority();
            try {
                const storageKey = node?.metadata?.storageKey;
                const content = node?.metadata?.content?.trim();
                const resourceId = resourceIdFromStorageKey(storageKey);
                const mediaPath = content && !content.startsWith("data:") && !content.startsWith("blob:") ? content : "";
                const mediaURL = resourceId
                    ? resolveResourceAccessURL((await getResourceAccess(`resource:${resourceId}`, "copy")).url)
                    : mediaPath ? new URL(mediaPath, window.location.href).toString() : "";
                if (!mediaURL) throw new Error("当前媒体只有本地内容，没有可复制的地址");
                if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(mediaURL);
                else if (!(await copyToClipboard(mediaURL))) throw new Error("当前浏览器不支持写入剪贴板");
                message.success(node?.type === CanvasNodeType.Video ? "视频地址已复制" : "图片地址已复制");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "媒体地址复制失败");
            }
        },
        [message, releaseCopiedNodesPastePriority],
    );

    const uploadNodeImageToArkPrivateAsset = useCallback(
        async (node: CanvasNodeData) => {
            if (node.type !== CanvasNodeType.Image || !node.metadata?.content) {
                message.warning("请选择一张可用图片后再上传");
                return;
            }
            if (arkPrivateAssetUploadNodeId === node.id) return;
            const feedbackKey = `ark-private-asset-${node.id}`;
            setArkPrivateAssetUploadNodeId(node.id);
            message.loading({ key: feedbackKey, content: "正在保存并上传到方舟素材库...", duration: 0 });
            try {
                let resourceID = resourceIdFromStorageKey(node.metadata.storageKey);
                let persistedNode = node;
                if (!resourceID) {
                    const uploaded = await uploadImage(node.metadata.content);
                    resourceID = resourceIdFromStorageKey(uploaded.storageKey);
                    if (!resourceID) throw new Error("图片未能保存到系统素材库，请检查对象存储配置后重试");
                    handleConfigNodeChange(node.id, imageMetadata(uploaded));
                    persistedNode = { ...node, metadata: { ...node.metadata, ...imageMetadata(uploaded) } };
                }
                const asset = await ensureCanvasNodeAsset({ canvasId: projectId, domainProjectId: currentProject?.projectId, node: persistedNode, source: "canvas-manual" });
                handleConfigNodeChange(node.id, { assetId: asset.assetId });
                await syncResourceToArkPrivateAsset(resourceID);
                message.success({ key: feedbackKey, content: "已同步到方舟素材库，Seedance 将自动复用该素材", duration: 4 });
            } catch (error) {
                message.error({ key: feedbackKey, content: error instanceof Error ? error.message : "上传到方舟素材库失败", duration: 5 });
            } finally {
                setArkPrivateAssetUploadNodeId((current) => (current === node.id ? null : current));
            }
        },
        [arkPrivateAssetUploadNodeId, currentProject?.projectId, handleConfigNodeChange, message, projectId],
    );

    const confirmUploadNodeImageToArkPrivateAsset = useCallback(
        (node: CanvasNodeData) => {
            modal.confirm({
                title: "上传到方舟素材库",
                content: "仅可上传你拥有肖像、版权或其他合法使用权的图片。方舟审核通过后，Seedance 会使用受控素材标识生成视频。",
                okText: "确认拥有使用权并上传",
                cancelText: "取消",
                onOk: () => uploadNodeImageToArkPrivateAsset(node),
            });
        },
        [modal, uploadNodeImageToArkPrivateAsset],
    );

    const handleCanvasContextMenu = useCallback(
        (event: ReactMouseEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest("[data-node-id],[data-connection-id]")) return;

            event.preventDefault();
            event.stopPropagation();
            if (target?.closest("[data-canvas-no-zoom],.ant-modal,.ant-popover,.ant-dropdown")) {
                setContextMenu(null);
                return;
            }

            closeConnectionCreateMenu();
            setContextMenu({ type: "canvas", x: event.clientX, y: event.clientY, position: screenToCanvas(event.clientX, event.clientY) });
        },
        [closeConnectionCreateMenu, screenToCanvas],
    );

    const handleNodeContextMenu = useCallback(
        (event: ReactMouseEvent, id: string) => {
            event.preventDefault();
            event.stopPropagation();
            setSelectedNodeIds((current) => {
                if (current.has(id) && current.size > 1) return current;
                return new Set([id]);
            });
            setSelectedConnectionId(null);
            closeConnectionCreateMenu();
            setToolbarNodeId(null);
            setDialogNodeId(null);
            setContextMenu({ type: "node", x: event.clientX, y: event.clientY, nodeId: id });
        },
        [closeConnectionCreateMenu],
    );

    const handleGenerateNode = useCanvasGenerationExecutor({
        projectId,
        domainProjectId: currentProject?.projectId,
        addedSkills,
        assets,
        nodesRef,
        connectionsRef,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        setRunningNodeId,
        startGenerationRequest,
        finishGenerationRequest,
        bindGenerationTask,
        applyGenerationTaskResult,
    });
    useEffect(() => {
        generateNodeRef.current = handleGenerateNode;
    }, [handleGenerateNode]);

    const { enqueueGenerationBatch, retryFailedBatchItems, stopRemainingBatchItems } = useCanvasGenerationBatches({
        projectId,
        projectLoaded,
        nodes,
        nodesRef,
        setNodes,
        handleGenerateNode,
    });

    const {
        addReferenceColumn: addBatchReferenceColumn,
        addRow: addBatchRow,
        batchGenDialogConfig,
        batchGenDialogConcurrency,
        batchGenDialogOpen,
        batchGenDialogRowCount,
        closeBatchGenDialog,
        confirmBatchGenDialog,
        fillRowsFromConnections,
        generateRows: generateBatchRows,
        generateVideoRows: generateBatchVideoRows,
        moveReferenceCell: moveBatchReferenceCell,
        // @opc-feature: batch-table-slot-operations [start]
        copyReferenceCell: copyBatchReferenceCell,
        assignReferenceCell: assignBatchReferenceCell,
        clearReferenceCell: clearBatchReferenceCell,
        // @opc-feature: batch-table-slot-operations [end]
        patchTable: patchBatchTable,
        removeReferenceColumn: removeBatchReferenceColumn,
        removeRow: removeBatchRow,
        reorderReferenceColumns: reorderBatchReferenceColumns,
        syncRowsFromConnections,
        updateRow: updateBatchRow,
    } = useCanvasBatchTable({
        nodesRef,
        connectionsRef,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        enqueueGenerationBatch,
    });

    // @opc-feature: batch-table-slot-connection [start]
    assignBatchReferenceCellRef.current = assignBatchReferenceCell;
    // @opc-feature: batch-table-slot-connection [end]

    useEffect(() => {
        if (!projectLoaded) return;
        setNodes((current) => {
            let changed = false;
            const next = current.map((node) => {
                const promoted = promoteLegacyBatchTableSize(node);
                if (promoted !== node) changed = true;
                return promoted;
            });
            return changed ? next : current;
        });
        nodesRef.current.filter((node) => node.type === CanvasNodeType.BatchTable || node.type === STANDARD_BATCH_TABLE_NODE_TYPE).forEach((node) => {
            syncRowsFromConnections(node.id, true);
        });
    }, [connections, projectLoaded, setNodes, syncRowsFromConnections]);

    const handleUploadBatchReference = useCallback(async (tableNodeId: string, rowId: string, columnIndex: number, file: File) => {
        const tableNode = nodesRef.current.find((item) => item.id === tableNodeId);
        const table = tableNode?.metadata?.batchTable;
        const row = table?.rows.find((item) => item.id === rowId);
        if (!tableNode || !table || !row) return;
        const existingId = row.inputNodeIds[columnIndex];
        const existingNode = existingId ? nodesRef.current.find((node) => node.id === existingId) : undefined;
        if (existingId && existingNode) {
            await replaceNodeMedia(existingId, file);
            return;
        }
        const rowIndex = table.rows.findIndex((item) => item.id === rowId);
        const uploadedNodeId = await createFileNode(file, {
            x: tableNode.position.x - 240,
            y: tableNode.position.y + 170 + Math.max(0, rowIndex) * 220,
        });
        if (!uploadedNodeId) return;
        const latestTableNode = nodesRef.current.find((item) => item.id === tableNodeId);
        const latestTable = latestTableNode?.metadata?.batchTable || table;
        const latestRow = latestTable.rows.find((item) => item.id === rowId) || row;
        const isCreativeVoice = latestTableNode?.type === CREATIVE_VOICE_TABLE_NODE_TYPE;
        const isVoiceAllMode = isCreativeVoice && columnIndex === 0 && (latestTable as any).voiceSlotMode === "all";

        if (isVoiceAllMode) {
            const nextRows = latestTable.rows.map((r) => {
                const inputNodeIds = Array.from({ length: Math.max(batchReferenceColumns(latestTable).length, columnIndex + 1) }, (_, index) => r.inputNodeIds[index] || "");
                inputNodeIds[columnIndex] = uploadedNodeId;
                return { ...r, inputNodeIds };
            });
            patchBatchTable(tableNodeId, { rows: nextRows });
        } else {
            const inputNodeIds = Array.from({ length: Math.max(batchReferenceColumns(latestTable).length, columnIndex + 1) }, (_, index) => latestRow.inputNodeIds[index] || "");
            inputNodeIds[columnIndex] = uploadedNodeId;
            updateBatchRow(tableNodeId, rowId, { inputNodeIds });
        }

        // @opc-feature: batch-table-slot-operations [start]
        // 自动连线：素材节点连向多维表格对应参考图列手柄
        const targetColumn = batchReferenceColumns(latestTable)[columnIndex];
        if (targetColumn) {
            const toHandleId = batchReferenceHandleId(targetColumn.id);
            setConnections((current) => {
                if (current.some((c) => c.fromNodeId === uploadedNodeId && c.toNodeId === tableNodeId && c.toHandleId === toHandleId)) {
                    return current;
                }
                return [...current, { id: nanoid(), fromNodeId: uploadedNodeId, toNodeId: tableNodeId, toHandleId }];
            });
        }
        // @opc-feature: batch-table-slot-operations [end]

        message.success(isVoiceAllMode ? "已上传并应用参考音色到全部分镜" : isCreativeVoice ? "已上传并填入声音素材" : `已上传并填入参考图 ${columnIndex + 1}`);
    }, [createFileNode, message, nodesRef, patchBatchTable, replaceNodeMedia, setConnections, updateBatchRow]);

    const { addScriptRow, createAndGenerateScriptVideos, createScriptActionBoards, createScriptImageNodes, createScriptVideoNodes, generateScriptImages, generateScriptRows, generateScriptVideos, removeScriptRow, replaceScriptRows, updateScriptRow } =
        useCanvasStoryboard({
            projectId,
            addedSkills,
            nodesRef,
            connectionsRef,
            setNodes,
            setConnections,
            setSelectedNodeIds,
            enqueueGenerationBatch,
        });

    const createStoryboardFromBatchTable = useCallback(async (tableNodeId: string) => {
        const tableNode = nodesRef.current.find((node) => node.id === tableNodeId && node.type === CanvasNodeType.BatchTable);
        const table = tableNode?.metadata?.batchTable;
        if (!tableNode || !table || table.contentKind !== "storyboard") return;
        const rows = storyboardRowsFromBatchTable(table);
        if (!rows.length) return message.warning("当前表格没有可用的分镜行");
        const sourceIds = Array.from(new Set([
            ...(table.storyboardSourceNodeIds || []),
            ...connectionsRef.current.filter((connection) => connection.toNodeId === tableNodeId && connection.relation !== "batch-output").map((connection) => connection.fromNodeId),
        ])).filter((id) => nodesRef.current.some((node) => node.id === id));
        const sourceVideo = sourceIds.map((id) => nodesRef.current.find((node) => node.id === id)).find((node): node is CanvasNodeData => node?.type === CanvasNodeType.Video);
        const keyframeTimesMs = rows.map(storyboardKeyframeTime).filter((value): value is number => value !== undefined);
        const useKeyframes = Boolean(sourceVideo && keyframeTimesMs.length);
        const scriptSpec = getNodeSpec(CanvasNodeType.Script);
        const scriptNode = createCanvasNode(CanvasNodeType.Script, {
            x: tableNode.position.x + tableNode.width + 160 + scriptSpec.width / 2,
            y: tableNode.position.y + Math.max(tableNode.height, scriptSpec.height) / 2,
        }, {
            storyboard: { rows, visibleColumns: cinematicStoryboardColumns(), referenceNodeIds: sourceIds },
            storyboardVideoInputMode: useKeyframes ? "keyframe" : "direct",
            workflowKind: "storyboard",
            workflowTitle: table.storyboardTitle || "视频脚本",
            composerContent: table.storyboardTitle || "来自多维表格的视频分镜脚本",
            status: "idle",
        });
        scriptNode.title = table.storyboardTitle || "视频脚本";
        const nextConnections = [
            ...connectionsRef.current,
            ...sourceIds.map((sourceId) => ({ id: nanoid(), fromNodeId: sourceId, toNodeId: scriptNode.id, toHandleId: "storyboard:context", relation: "storyboard-asset-reference" as const })),
        ];
        const nextNodes = [...nodesRef.current, scriptNode];
        nodesRef.current = nextNodes;
        connectionsRef.current = nextConnections;
        setNodes(nextNodes);
        setConnections(nextConnections);
        setSelectedNodeIds(new Set([scriptNode.id]));
        setDialogNodeId(null);
        if (sourceVideo && keyframeTimesMs.length) {
            const frameNodes = await extractVideoFrames(sourceVideo, { timesMs: keyframeTimesMs });
            if (frameNodes.length) {
                const withFrames = nodesRef.current.map((node) => node.id === scriptNode.id ? { ...node, metadata: { ...node.metadata, storyboard: { ...node.metadata?.storyboard, rows: bindStoryboardKeyframes(node.metadata?.storyboard?.rows || rows, frameNodes, sourceVideo.id), visibleColumns: cinematicStoryboardColumns(), referenceNodeIds: sourceIds } } } : node);
                nodesRef.current = withFrames;
                setNodes(withFrames);
                message.success(`已创建视频脚本并自动抽取 ${frameNodes.length} 个关键帧，点击“生成视频”继续`);
            } else {
                message.warning("视频脚本已创建，但关键帧抽取失败；请检查视频是否已保存或允许跨域读取");
            }
        } else {
            message.success(`已创建视频脚本：${rows.length} 个镜头`);
        }
    }, [connectionsRef, extractVideoFrames, message, nodesRef, setConnections, setDialogNodeId, setNodes, setSelectedNodeIds]);

    const handleRetryNode = useCanvasGenerationRetry({
        projectId,
        domainProjectId: currentProject?.projectId,
        addedSkills,
        assets,
        nodesRef,
        connectionsRef,
        setNodes,
        setRunningNodeId,
        startGenerationRequest,
        finishGenerationRequest,
        bindGenerationTask,
        applyGenerationTaskResult,
    });
    const reloadCanvasNodeResource = useCallback(
        async (node: CanvasNodeData) => {
            const taskId = node.metadata?.taskId;
            if (!taskId || !node.metadata?.resourceReloadAvailable) return;
            setNodes((current) => current.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: "loading", taskStage: "正在重新加载资源", errorDetails: undefined } } : item)));
            try {
                const task = await queryGenerationTask(taskId);
                if (task.status !== "succeeded") throw new Error("原生成任务尚未成功，无法重新加载资源");
                await applyGenerationTaskResult(node.id, task);
            } catch (error) {
                setNodes((current) =>
                    current.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: "error", errorDetails: error instanceof Error ? error.message : "资源重新加载失败", resourceReloadAvailable: true } } : item)),
                );
            }
        },
        [applyGenerationTaskResult, setNodes],
    );
    const reconcileImageBatchRootNode = useCallback(
        (rootId: string) => {
            setNodes((current) => {
                const root = current.find((item) => item.id === rootId);
                if (!root) return current;
                const reconciled = reconcileImageBatchRoot(root, current);
                return current.map((item) => (item.id === root.id ? reconciled : item));
            });
        },
        [setNodes],
    );
    const retryImageBatchChildren = useCallback(
        (rootId: string, children: CanvasNodeData[]) => {
            const childIds = children.map((child) => child.id);
            setNodes((current) => markImageBatchRetrying(rootId, childIds, current));
            void Promise.allSettled(
                children.map(async (child) => {
                    await handleRetryNode(child);
                    setNodes((current) => current.map((item) => (item.id === child.id ? restoreUnsubmittedImageBatchChild(item, child) : item)));
                }),
            ).finally(() => reconcileImageBatchRootNode(rootId));
        },
        [handleRetryNode, reconcileImageBatchRootNode, setNodes],
    );

    const generateImageFromTextNode = useCallback(
        (node: CanvasNodeData) => {
            const prompt = (node.metadata?.content || node.metadata?.prompt || "").trim();
            if (!prompt) {
                message.warning("文本节点为空，无法生图");
                return;
            }
            const sourceNode = nodesRef.current.find((item) => item.id === node.id);
            if (!sourceNode) return;
            const nodeSize = getNodeSpec(CanvasNodeType.Image);
            const imageNode = createCanvasNode(
                CanvasNodeType.Image,
                {
                    x: sourceNode.position.x + sourceNode.width + 96 + nodeSize.width / 2,
                    y: sourceNode.position.y + sourceNode.height / 2,
                },
                {
                    prompt: "@文本1",
                    composerContent: "@文本1",
                    model: effectiveConfig.imageModel || effectiveConfig.model,
                    size: effectiveConfig.size,
                    quality: effectiveConfig.quality,
                    transparentBackground: effectiveConfig.transparentBackground,
                    count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count),
                },
            );
            imageNode.title = "图片生成";
            const connection = { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: imageNode.id };
            const nextNodes = nodesRef.current.map((item) => (item.id === sourceNode.id ? { ...item, metadata: { ...item.metadata, content: prompt, richText: undefined, prompt, status: NODE_STATUS_SUCCESS } } : item)).concat(imageNode);
            const nextConnections = [...connectionsRef.current, connection];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            setSelectedNodeIds(new Set([imageNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(imageNode.id);
        },
        [effectiveConfig, message],
    );

    // @opc-feature: creative-asset-table-handlers [start]
    const handleSyncMasterToStoryboard = useCallback(
        (masterTableNodeId: string) => {
            const currentNodes = nodesRef.current;
            const currentConnections = connectionsRef.current;
            const masterNode = currentNodes.find((n) => n.id === masterTableNodeId);
            if (!masterNode) return;

            const downstreamStoryboardConn = currentConnections.find(
                (c) => c.fromNodeId === masterTableNodeId && (c.toHandleId === "batch-reference:ref-master-slots" || c.relation === "batch-input"),
            );
            const downstreamStoryboardNode = downstreamStoryboardConn
                ? currentNodes.find((n) => n.id === downstreamStoryboardConn.toNodeId)
                : currentNodes.find((n) => n.type === CREATIVE_STORYBOARD_TABLE_NODE_TYPE || n.metadata?.batchTable?.contentKind === "storyboard");

            if (!downstreamStoryboardNode) return;

            const { updatedStoryboardNode, newConnections } = syncMasterTableRowsToStoryboard({
                masterNode,
                storyboardNode: downstreamStoryboardNode,
                nodes: currentNodes,
                connections: currentConnections,
            });

            if (updatedStoryboardNode !== downstreamStoryboardNode) {
                const nextNodes = currentNodes.map((n) => (n.id === updatedStoryboardNode.id ? updatedStoryboardNode : n));
                nodesRef.current = nextNodes;
                setNodes(nextNodes);
            }
            if (newConnections !== currentConnections) {
                connectionsRef.current = newConnections;
                setConnections(newConnections);
            }
        },
        [connectionsRef, nodesRef, setConnections, setNodes],
    );
    // @opc-feature: creative-asset-table-handlers [end]

    // @opc-feature: creative-voice-table-handlers [start]
    const handleSyncVoiceToStoryboard = useCallback(
        (voiceTableNodeId: string) => {
            const currentNodes = nodesRef.current;
            const currentConnections = connectionsRef.current;
            const voiceNode = currentNodes.find((n) => n.id === voiceTableNodeId);
            if (!voiceNode) return;

            const downstreamStoryboardConn = currentConnections.find(
                (c) => c.fromNodeId === voiceTableNodeId && (c.toHandleId === "batch-reference:ref-voiceover" || c.relation === "batch-input"),
            );
            const downstreamStoryboardNode = downstreamStoryboardConn
                ? currentNodes.find((n) => n.id === downstreamStoryboardConn.toNodeId)
                : currentNodes.find((n) => n.metadata?.batchTable?.contentKind === "storyboard");

            if (!downstreamStoryboardNode) return;

            const { updatedStoryboardNode, newConnections } = syncVoiceTableRowsToStoryboard({
                voiceNode,
                storyboardNode: downstreamStoryboardNode,
                nodes: currentNodes,
                connections: currentConnections,
            });

            if (updatedStoryboardNode !== downstreamStoryboardNode) {
                const nextNodes = currentNodes.map((n) => (n.id === updatedStoryboardNode.id ? updatedStoryboardNode : n));
                nodesRef.current = nextNodes;
                setNodes(nextNodes);
            }
            if (newConnections !== currentConnections) {
                connectionsRef.current = newConnections;
                setConnections(newConnections);
            }
        },
        [connectionsRef, nodesRef, setConnections, setNodes],
    );

    const handleFillCreativeVoiceFromConnections = useCallback(
        (voiceTableNodeId: string) => {
            const currentNodes = nodesRef.current;
            const currentConnections = connectionsRef.current;
            const voiceNode = currentNodes.find((n) => n.id === voiceTableNodeId);
            const table = voiceNode?.metadata?.batchTable;
            if (!voiceNode || !table) return;

            const voiceConnections = currentConnections.filter((c) => c.toNodeId === voiceTableNodeId);
            const voiceNodeIds = voiceConnections
                .filter((c) => c.toHandleId === "batch-reference:ref-voice")
                .map((c) => c.fromNodeId);
            const toneNodeIds = voiceConnections
                .filter((c) => c.toHandleId === "batch-reference:ref-tone")
                .map((c) => c.fromNodeId);

            const isAllMode = (table as any).voiceSlotMode === "all";
            let changed = false;

            const nextRows = table.rows.map((row, index) => {
                const inputs = [...(row.inputNodeIds || ["", ""])];
                while (inputs.length < 2) inputs.push("");

                if (voiceNodeIds.length > 0) {
                    const assignedVoiceId = isAllMode ? voiceNodeIds[0] : (voiceNodeIds[index] || voiceNodeIds[0]);
                    if (inputs[0] !== assignedVoiceId) {
                        inputs[0] = assignedVoiceId;
                        changed = true;
                    }
                }

                if (toneNodeIds.length > 0) {
                    const assignedToneId = toneNodeIds[index] || toneNodeIds[0];
                    if (inputs[1] !== assignedToneId) {
                        inputs[1] = assignedToneId;
                        changed = true;
                    }
                }

                return { ...row, inputNodeIds: inputs };
            });

            if (changed) {
                patchBatchTable(voiceTableNodeId, { rows: nextRows });
                message.success("已从画布连线同步声音素材至分镜插槽");
                setTimeout(() => handleSyncVoiceToStoryboard(voiceTableNodeId), 0);
            } else {
                message.info("连线素材已与分镜插槽保持一致");
            }
        },
        [connectionsRef, handleSyncVoiceToStoryboard, message, nodesRef, patchBatchTable],
    );

    const handleGenerateCreativeVoice = useCallback(
        async (voiceTableNodeId: string, rowIds?: string[]) => {
            const currentNodes = nodesRef.current;
            const voiceNode = currentNodes.find((n) => n.id === voiceTableNodeId);
            const table = voiceNode?.metadata?.batchTable;
            if (!voiceNode || !table || !table.rows?.length) return;

            const targetRows = rowIds?.length
                ? table.rows.filter((r) => rowIds.includes(r.id))
                : table.rows.filter((r) => r.enabled);

            if (!targetRows.length) {
                message.warning("请选择需要生成配音的分镜行");
                return;
            }

            if (!effectiveConfig.baseUrl?.trim() || !effectiveConfig.apiKey?.trim()) {
                message.error("请先在系统设置中配置语音模型与 API 凭据");
                return;
            }

            message.loading({ content: `正在为 ${targetRows.length} 个分镜生成配音...`, key: `voice-gen-${voiceTableNodeId}` });

            let successCount = 0;
            let failCount = 0;

            for (let idx = 0; idx < targetRows.length; idx++) {
                const row = targetRows[idx];
                const textToSpeak = row.cells?.["col-rewrite"]?.trim() || row.cells?.["col-lines"]?.trim() || row.prompt?.trim();
                if (!textToSpeak) {
                    failCount++;
                    continue;
                }

                try {
                    const audioConfig = {
                        ...effectiveConfig,
                        model: effectiveConfig.audioModel || effectiveConfig.model,
                        audioInstructions: [effectiveConfig.audioInstructions, row.cells?.["col-tone"]].filter(Boolean).join("，"),
                    };
                    const spokenText = resolveDualTextForSpeech(textToSpeak);
                    const audioBlob = await requestAudioGeneration(audioConfig, spokenText);
                    const uploadedAudio = await storeGeneratedAudio(audioBlob, "mp3");

                    const existingAudioId = row.outputNodeId;
                    const existingAudioNode = existingAudioId ? nodesRef.current.find((n) => n.id === existingAudioId) : undefined;

                    let outputAudioId = existingAudioId;
                    if (existingAudioNode) {
                        const updatedNodes = nodesRef.current.map((n) =>
                            n.id === existingAudioId
                                ? {
                                      ...n,
                                      metadata: {
                                          ...n.metadata,
                                          content: uploadedAudio.url,
                                          storageKey: uploadedAudio.storageKey,
                                          mimeType: uploadedAudio.mimeType || "audio/mpeg",
                                          durationMs: uploadedAudio.durationMs,
                                          bytes: uploadedAudio.bytes,
                                          status: NODE_STATUS_SUCCESS,
                                      },
                                  }
                                : n,
                        );
                        nodesRef.current = updatedNodes;
                        setNodes(updatedNodes);
                    } else {
                        const newAudioId = `audio-${nanoid()}`;
                        outputAudioId = newAudioId;
                        const rowIndex = table.rows.findIndex((r) => r.id === row.id);
                        const newAudioNode: CanvasNodeData = {
                            id: newAudioId,
                            type: CanvasNodeType.Audio,
                            title: `${voiceNode.title || "配音"} - 镜头 ${rowIndex + 1}`,
                            position: {
                                x: voiceNode.position.x + voiceNode.width + 60,
                                y: voiceNode.position.y + 100 + Math.max(0, rowIndex) * 160,
                            },
                            width: 320,
                            height: 120,
                            metadata: {
                                content: uploadedAudio.url,
                                storageKey: uploadedAudio.storageKey,
                                mimeType: uploadedAudio.mimeType || "audio/mpeg",
                                durationMs: uploadedAudio.durationMs,
                                bytes: uploadedAudio.bytes,
                                status: NODE_STATUS_SUCCESS,
                            },
                        };

                        const nextNodes = [...nodesRef.current, newAudioNode];
                        nodesRef.current = nextNodes;
                        setNodes(nextNodes);
                    }

                    updateBatchRow(voiceTableNodeId, row.id, { outputNodeId: outputAudioId });
                    successCount++;
                } catch (err: any) {
                    console.error("生成音频失败:", err);
                    failCount++;
                }
            }

            handleSyncVoiceToStoryboard(voiceTableNodeId);

            if (successCount > 0) {
                message.success({
                    content: `配音生成完成：成功 ${successCount} 条${failCount > 0 ? `，失败 ${failCount} 条` : ""}！已自动同步分镜表`,
                    key: `voice-gen-${voiceTableNodeId}`,
                });
            } else {
                message.error({
                    content: "配音生成失败，请检查语音配置及网络",
                    key: `voice-gen-${voiceTableNodeId}`,
                });
            }
        },
        [effectiveConfig, handleSyncVoiceToStoryboard, message, nodesRef, setNodes, updateBatchRow],
    );
    // @opc-feature: creative-voice-table-handlers [end]

    const renderCanvasNodePanel = useCallback(
        (panelNode: CanvasNodeData) => {
            if (panelNode.type === CanvasNodeType.Script || panelNode.type === CanvasNodeType.Drawing) return null;
            // @opc-feature: video-reverse-panel-guard [start]
            if (panelNode.type === VIDEO_REVERSE_NODE_TYPE) return null;
            // @opc-feature: video-reverse-panel-guard [end]
            // @opc-feature: creative-tables-panel-guard [start]
            if (
                panelNode.type === CanvasNodeType.BatchTable ||
                panelNode.type === STANDARD_BATCH_TABLE_NODE_TYPE ||
                panelNode.type === CREATIVE_ASSET_TABLE_NODE_TYPE ||
                panelNode.type === CREATIVE_VOICE_TABLE_NODE_TYPE ||
                panelNode.type === CREATIVE_STORYBOARD_TABLE_NODE_TYPE ||
                panelNode.type === CREATION_ASSISTANT_REF_SCRIPT_NODE_TYPE ||
                panelNode.type === CREATION_ASSISTANT_ANALYSIS_NODE_TYPE ||
                Boolean(panelNode.metadata?.batchTable)
            ) return null;
            // @opc-feature: creative-tables-panel-guard [end]
            return panelNode.type === CanvasNodeType.Config ? (
                <CanvasConfigComposer
                    value={panelNode.metadata?.composerContent ?? panelNode.metadata?.prompt ?? ""}
                    inputs={configInputsById.get(panelNode.id) || []}
                    skillReferences={skillMentionReferences}
                    generationMode={panelNode.metadata?.generationMode}
                    metadata={panelNode.metadata}
                    workspaceMode={workspaceMode}
                    onChange={(composerContent) => handleConfigNodeChange(panelNode.id, { composerContent })}
                    onMetadataChange={(patch) => handleConfigNodeChange(panelNode.id, patch)}
                    onClose={() => setDialogNodeId(null)}
                />
            ) : (
                <CanvasNodePromptPanel
                    projectId={projectId}
                    node={panelNode}
                    isRunning={isCanvasNodeGenerating(panelNode, runningNodeId)}
                    mentionReferences={[
                        ...(mentionReferencesByNodeId.get(panelNode.id) || EMPTY_RESOURCE_REFERENCES),
                        ...buildCanvasResourceReferences(nodesRef.current, connectionsRef.current).filter((reference) => reference.kind === "text" && reference.nodeId !== panelNode.id && !(mentionReferencesByNodeId.get(panelNode.id) || []).some((active) => active.nodeId === reference.nodeId)),
                    ]}
                    onAddReference={(nodeId, reference) => {
                        if (reference.active || reference.assetId || reference.kind === "skill") return reference;
                        if (reference.kind !== "text" || !reference.nodeId || reference.nodeId === nodeId) return undefined;
                        try {
                            const linked = connectCanvasTextMention(nodesRef.current, connectionsRef.current, nodeId, reference.nodeId, nanoid());
                            nodesRef.current = linked.nodes;
                            connectionsRef.current = linked.connections;
                            setNodes(linked.nodes);
                            setConnections(linked.connections);
                            return linked.reference;
                        } catch (cause) {
                            message.warning(cause instanceof Error ? cause.message : "文本引用失败");
                            return undefined;
                        }
                    }}
                    onPromptChange={handleNodePromptChange}
                    onConfigChange={handleConfigNodeChange}
                    onGenerate={handleGenerateNode}
                    onRemoveReference={handleRemoveNodeReference}
                    onReorderReferences={handleReorderNodeReferences}
                    onReplaceReference={handleReplaceNodeReference}
                    onReplaceReferenceFiles={handleReplaceNodeReferenceFiles}
                    onClose={() => setDialogNodeId(null)}
                    onNodeMouseDown={handleNodeMouseDown}
                    workspaceMode={workspaceMode}
                    onImageSettingsOpenChange={(open) => {
                        setNodeImageSettingsOpen(open);
                        if (open) setToolbarNodeId(null);
                    }}
                    onListGenerate={(nodeId, listPrompt) => {
                        void handleListGenerate({
                            sourceNodeId: nodeId,
                            prompt: listPrompt,
                            nodes: nodesRef.current,
                            connections: connectionsRef.current,
                            config: effectiveConfig,
                            projectId,
                            setNodes,
                            setConnections,
                            setRunningNodeId,
                            setDialogNodeId,
                        });
                    }}
                />
            );
        },
        [
            configInputsById,
            effectiveConfig,
            handleConfigNodeChange,
            handleGenerateNode,
            handleNodePromptChange,
            handleRemoveNodeReference,
            handleReorderNodeReferences,
            handleReplaceNodeReference,
            handleReplaceNodeReferenceFiles,
            mentionReferencesByNodeId,
            message,
            projectId,
            runningNodeId,
            setConnections,
            setDialogNodeId,
            setNodes,
            setRunningNodeId,
            skillMentionReferences,
            workspaceMode,
        ],
    );

    // @opc-feature: batch-table-auto-height-handler [start]
    const handleTableAutoHeight = useCallback((nodeId: string, idealHeight: number) => {
        setNodes((current) => {
            const node = current.find((n) => n.id === nodeId);
            if (!node || node.metadata?.locked) return current;
            if (node.metadata?.manualSize) return current;
            if (Math.abs(node.height - idealHeight) < 4) return current;
            return current.map((n) => (n.id === nodeId ? { ...n, height: idealHeight } : n));
        });
    }, [setNodes]);

    const handleResetTableManualSize = useCallback((nodeId: string) => {
        setNodes((current) => {
            const node = current.find((n) => n.id === nodeId);
            if (!node) return current;
            return current.map((n) => (n.id === nodeId ? { ...n, metadata: { ...n.metadata, manualSize: false } } : n));
        });
    }, [setNodes]);
    // @opc-feature: batch-table-auto-height-handler [end]

    const renderCanvasNodeContent = useCallback(
        (contentNode: CanvasNodeData) => {
            if (contentNode.metadata?.workflowKind === "character" && contentNode.metadata.characterAssetId) {
                return <CanvasCharacterReferenceNodeContent node={contentNode} />;
            }
            if (contentNode.metadata?.workflowKind === "styleboard" && !contentNode.metadata.content) {
                return <CanvasStylePlaceholderNodeContent onChoose={() => setStylePickerOpen(true)} />;
            }
            if (contentNode.metadata?.workflowKind === "story_input") {
                return <CanvasStoryInputNodeContent node={contentNode} onEdit={() => openStoryInput(contentNode.id)} />;
            }
            // @opc-feature: creative-asset-table-render [start]
            if (contentNode.type === CREATIVE_ASSET_TABLE_NODE_TYPE) {
                return (
                    <CanvasBatchTableNodeContent
                        node={contentNode}
                        nodes={nodesRef.current}
                        connections={connections}
                        batch={visibleGenerationBatch(contentNode)}
                        theme={theme}
                        onPatchTable={(patch) => {
                            patchBatchTable(contentNode.id, patch);
                            setTimeout(() => handleSyncMasterToStoryboard(contentNode.id), 0);
                        }}
                        onAddRow={() => addBatchRow(contentNode.id)}
                        onRemoveRow={(rowId) => removeBatchRow(contentNode.id, rowId)}
                        onUpdateRow={(rowId, patch) => {
                            updateBatchRow(contentNode.id, rowId, patch);
                            setTimeout(() => handleSyncMasterToStoryboard(contentNode.id), 0);
                        }}
                        onFillRows={() => fillRowsFromConnections(contentNode.id)}
                        onGenerate={(rowIds) => {
                            void generateBatchRows(contentNode.id, rowIds);
                            setTimeout(() => handleSyncMasterToStoryboard(contentNode.id), 1200);
                        }}
                        onRetryItem={(batchId, itemId) => retryFailedBatchItems(contentNode.id, batchId, itemId)}
                        onAddReferenceColumn={() => addBatchReferenceColumn(contentNode.id)}
                        onRemoveReferenceColumn={() => removeBatchReferenceColumn(contentNode.id)}
                        onFocusOutput={(nodeId) => focusCanvasNode(nodeId)}
                        onReorderReferenceColumns={(fromColumnId, toColumnId) => reorderBatchReferenceColumns(contentNode.id, fromColumnId, toColumnId)}
                        onMoveReferenceCell={(sourceRowId, sourceColumnIndex, targetRowId, targetColumnIndex) => moveBatchReferenceCell(contentNode.id, sourceRowId, sourceColumnIndex, targetRowId, targetColumnIndex)}
                        onCopyReferenceCell={(sourceRowId, sourceColumnIndex, targetRowId, targetColumnIndex) => copyBatchReferenceCell(contentNode.id, sourceRowId, sourceColumnIndex, targetRowId, targetColumnIndex)}
                        onAssignReferenceNode={(rowId, columnIndex, referenceNodeId) => {
                            assignBatchReferenceCell(contentNode.id, rowId, columnIndex, referenceNodeId);
                            setTimeout(() => handleSyncMasterToStoryboard(contentNode.id), 0);
                        }}
                        onClearReferenceCell={(rowId, columnIndex) => {
                            clearBatchReferenceCell(contentNode.id, rowId, columnIndex);
                            setTimeout(() => handleSyncMasterToStoryboard(contentNode.id), 0);
                        }}
                        onUploadReference={(rowId, columnIndex, file) => {
                            void handleUploadBatchReference(contentNode.id, rowId, columnIndex, file);
                            setTimeout(() => handleSyncMasterToStoryboard(contentNode.id), 500);
                        }}
                        onConnectStart={(event, handleId) => handleConnectStart(event, contentNode.id, "target", handleId)}
                        onConnectDrop={(event, handleId) => handleConnectDrop(event, contentNode.id, handleId)}
                        onAutoHeightChange={(height) => handleTableAutoHeight(contentNode.id, height)}
                        onResetManualSize={() => handleResetTableManualSize(contentNode.id)}
                    />
                );
            }
            // @opc-feature: creative-asset-table-render [end]
            // @opc-feature: creative-storyboard-table-render [start]
            if (contentNode.type === CREATIVE_STORYBOARD_TABLE_NODE_TYPE) {
                return (
                    <CanvasBatchTableNodeContent
                        node={contentNode}
                        nodes={nodesRef.current}
                        connections={connections}
                        batch={visibleGenerationBatch(contentNode)}
                        theme={theme}
                        onPatchTable={(patch) => patchBatchTable(contentNode.id, patch)}
                        onAddRow={() => addBatchRow(contentNode.id)}
                        onRemoveRow={(rowId) => removeBatchRow(contentNode.id, rowId)}
                        onUpdateRow={(rowId, patch) => updateBatchRow(contentNode.id, rowId, patch)}
                        onFillRows={() => fillRowsFromConnections(contentNode.id)}
                        onGenerate={(rowIds) => void generateBatchRows(contentNode.id, rowIds)}
                        onGenerateVideos={(rowIds) => void generateBatchVideoRows(contentNode.id, rowIds)}
                        onCreateStoryboard={() => createStoryboardFromBatchTable(contentNode.id)}
                        onRetryItem={(batchId, itemId) => retryFailedBatchItems(contentNode.id, batchId, itemId)}
                        onAddReferenceColumn={() => addBatchReferenceColumn(contentNode.id)}
                        onRemoveReferenceColumn={() => removeBatchReferenceColumn(contentNode.id)}
                        onFocusOutput={(nodeId) => focusCanvasNode(nodeId)}
                        onReorderReferenceColumns={(fromColumnId, toColumnId) => reorderBatchReferenceColumns(contentNode.id, fromColumnId, toColumnId)}
                        onMoveReferenceCell={(sourceRowId, sourceColumnIndex, targetRowId, targetColumnIndex) => moveBatchReferenceCell(contentNode.id, sourceRowId, sourceColumnIndex, targetRowId, targetColumnIndex)}
                        onCopyReferenceCell={(sourceRowId, sourceColumnIndex, targetRowId, targetColumnIndex) => copyBatchReferenceCell(contentNode.id, sourceRowId, sourceColumnIndex, targetRowId, targetColumnIndex)}
                        onAssignReferenceNode={(rowId, columnIndex, referenceNodeId) => assignBatchReferenceCell(contentNode.id, rowId, columnIndex, referenceNodeId)}
                        onClearReferenceCell={(rowId, columnIndex) => clearBatchReferenceCell(contentNode.id, rowId, columnIndex)}
                        onUploadReference={(rowId, columnIndex, file) => { void handleUploadBatchReference(contentNode.id, rowId, columnIndex, file); }}
                        onConnectStart={(event, handleId) => handleConnectStart(event, contentNode.id, "target", handleId)}
                        onConnectDrop={(event, handleId) => handleConnectDrop(event, contentNode.id, handleId)}
                        onAutoHeightChange={(height) => handleTableAutoHeight(contentNode.id, height)}
                        onResetManualSize={() => handleResetTableManualSize(contentNode.id)}
                    />
                );
            }
            // @opc-feature: creative-storyboard-table-render [end]
            if (contentNode.type === CanvasNodeType.BatchTable) {
                return (
                    <CanvasBatchTableNodeContent
                        node={contentNode}
                        nodes={nodesRef.current}
                        connections={connections}
                        batch={visibleGenerationBatch(contentNode)}
                        theme={theme}
                        onPatchTable={(patch) => patchBatchTable(contentNode.id, patch)}
                        onAddRow={() => addBatchRow(contentNode.id)}
                        onRemoveRow={(rowId) => removeBatchRow(contentNode.id, rowId)}
                        onUpdateRow={(rowId, patch) => updateBatchRow(contentNode.id, rowId, patch)}
                        onFillRows={() => fillRowsFromConnections(contentNode.id)}
                        onGenerate={(rowIds) => void generateBatchRows(contentNode.id, rowIds)}
                        // @opc-feature: storyboard-batch-table-video-actions [start]
                        onGenerateVideos={contentNode.metadata?.batchTable?.contentKind === "storyboard" ? (rowIds) => void generateBatchVideoRows(contentNode.id, rowIds) : undefined}
                        onCreateStoryboard={contentNode.metadata?.batchTable?.contentKind === "storyboard" ? () => createStoryboardFromBatchTable(contentNode.id) : undefined}
                        // @opc-feature: storyboard-batch-table-video-actions [end]
                        onRetryItem={(batchId, itemId) => retryFailedBatchItems(contentNode.id, batchId, itemId)}
                        onAddReferenceColumn={() => addBatchReferenceColumn(contentNode.id)}
                        onRemoveReferenceColumn={() => removeBatchReferenceColumn(contentNode.id)}
                        onFocusOutput={(nodeId) => focusCanvasNode(nodeId)}
                        onReorderReferenceColumns={(fromColumnId, toColumnId) => reorderBatchReferenceColumns(contentNode.id, fromColumnId, toColumnId)}
                        onMoveReferenceCell={(sourceRowId, sourceColumnIndex, targetRowId, targetColumnIndex) => moveBatchReferenceCell(contentNode.id, sourceRowId, sourceColumnIndex, targetRowId, targetColumnIndex)}
                        onCopyReferenceCell={(sourceRowId, sourceColumnIndex, targetRowId, targetColumnIndex) => copyBatchReferenceCell(contentNode.id, sourceRowId, sourceColumnIndex, targetRowId, targetColumnIndex)}
                        onAssignReferenceNode={(rowId, columnIndex, referenceNodeId) => assignBatchReferenceCell(contentNode.id, rowId, columnIndex, referenceNodeId)}
                        onClearReferenceCell={(rowId, columnIndex) => clearBatchReferenceCell(contentNode.id, rowId, columnIndex)}
                        onUploadReference={(rowId, columnIndex, file) => { void handleUploadBatchReference(contentNode.id, rowId, columnIndex, file); }}
                        onConnectStart={(event, handleId) => handleConnectStart(event, contentNode.id, "target", handleId)}
                        onConnectDrop={(event, handleId) => handleConnectDrop(event, contentNode.id, handleId)}
                        onAutoHeightChange={(height) => handleTableAutoHeight(contentNode.id, height)}
                        onResetManualSize={() => handleResetTableManualSize(contentNode.id)}
                    />
                );
            }
            // @opc-feature: standard-batch-table-render [start]
            if (contentNode.type === STANDARD_BATCH_TABLE_NODE_TYPE) {
                return (
                    <StandardBatchTableNodeContent
                        node={contentNode}
                        nodes={nodesRef.current}
                        connections={connections}
                        batch={visibleGenerationBatch(contentNode)}
                        theme={theme}
                        onPatchTable={(patch) => patchBatchTable(contentNode.id, patch)}
                        onAddRow={() => addBatchRow(contentNode.id)}
                        onRemoveRow={(rowId) => removeBatchRow(contentNode.id, rowId)}
                        onUpdateRow={(rowId, patch) => updateBatchRow(contentNode.id, rowId, patch)}
                        onFillRows={() => fillRowsFromConnections(contentNode.id)}
                        onGenerate={(rowIds) => void generateBatchRows(contentNode.id, rowIds)}
                        onRetryItem={(batchId, itemId) => retryFailedBatchItems(contentNode.id, batchId, itemId)}
                        onAddReferenceColumn={() => addBatchReferenceColumn(contentNode.id)}
                        onRemoveReferenceColumn={() => removeBatchReferenceColumn(contentNode.id)}
                        onFocusOutput={(nodeId) => focusCanvasNode(nodeId)}
                        onReorderReferenceColumns={(fromColumnId, toColumnId) => reorderBatchReferenceColumns(contentNode.id, fromColumnId, toColumnId)}
                        onMoveReferenceCell={(sourceRowId, sourceColumnIndex, targetRowId, targetColumnIndex) => moveBatchReferenceCell(contentNode.id, sourceRowId, sourceColumnIndex, targetRowId, targetColumnIndex)}
                        onCopyReferenceCell={(sourceRowId, sourceColumnIndex, targetRowId, targetColumnIndex) => copyBatchReferenceCell(contentNode.id, sourceRowId, sourceColumnIndex, targetRowId, targetColumnIndex)}
                        onAssignReferenceNode={(rowId, columnIndex, referenceNodeId) => assignBatchReferenceCell(contentNode.id, rowId, columnIndex, referenceNodeId)}
                        onClearReferenceCell={(rowId, columnIndex) => clearBatchReferenceCell(contentNode.id, rowId, columnIndex)}
                        onUploadReference={(rowId, columnIndex, file) => { void handleUploadBatchReference(contentNode.id, rowId, columnIndex, file); }}
                        onConnectStart={(event, handleId) => handleConnectStart(event, contentNode.id, "target", handleId)}
                        onConnectDrop={(event, handleId) => handleConnectDrop(event, contentNode.id, handleId)}
                        onAutoHeightChange={(height) => handleTableAutoHeight(contentNode.id, height)}
                        onResetManualSize={() => handleResetTableManualSize(contentNode.id)}
                    />
                );
            }
            // @opc-feature: standard-batch-table-render [end]
            // @opc-feature: creative-voice-table-render [start]
            if (contentNode.type === CREATIVE_VOICE_TABLE_NODE_TYPE) {
                return (
                    <CreativeVoiceTableNodeContent
                        node={contentNode}
                        nodes={nodesRef.current}
                        connections={connections}
                        batch={visibleGenerationBatch(contentNode)}
                        theme={theme}
                        onPatchTable={(patch) => {
                            patchBatchTable(contentNode.id, patch);
                            setTimeout(() => handleSyncVoiceToStoryboard(contentNode.id), 0);
                        }}
                        onAddRow={() => addBatchRow(contentNode.id)}
                        onRemoveRow={(rowId) => removeBatchRow(contentNode.id, rowId)}
                        onUpdateRow={(rowId, patch) => {
                            updateBatchRow(contentNode.id, rowId, patch);
                            setTimeout(() => handleSyncVoiceToStoryboard(contentNode.id), 0);
                        }}
                        onFillRows={() => handleFillCreativeVoiceFromConnections(contentNode.id)}
                        onGenerateVoice={(rowIds) => void handleGenerateCreativeVoice(contentNode.id, rowIds)}
                        onFocusOutput={(nodeId) => focusCanvasNode(nodeId)}
                        onAssignReferenceNode={(rowId, columnIndex, referenceNodeId) => {
                            assignBatchReferenceCell(contentNode.id, rowId, columnIndex, referenceNodeId);
                            setTimeout(() => handleSyncVoiceToStoryboard(contentNode.id), 0);
                        }}
                        onClearReferenceCell={(rowId, columnIndex) => {
                            clearBatchReferenceCell(contentNode.id, rowId, columnIndex);
                            setTimeout(() => handleSyncVoiceToStoryboard(contentNode.id), 0);
                        }}
                        onCopyReferenceCell={(sourceRowId, sourceColumnIndex, targetRowId, targetColumnIndex) =>
                            copyBatchReferenceCell(contentNode.id, sourceRowId, sourceColumnIndex, targetRowId, targetColumnIndex)
                        }
                        onMoveReferenceCell={(sourceRowId, sourceColumnIndex, targetRowId, targetColumnIndex) =>
                            moveBatchReferenceCell(contentNode.id, sourceRowId, sourceColumnIndex, targetRowId, targetColumnIndex)
                        }
                        onUploadReference={(rowId, columnIndex, file) => {
                            void handleUploadBatchReference(contentNode.id, rowId, columnIndex, file);
                            setTimeout(() => handleSyncVoiceToStoryboard(contentNode.id), 500);
                        }}
                        onConnectStart={(event, handleId) => handleConnectStart(event, contentNode.id, "target", handleId)}
                        onConnectDrop={(event, handleId) => handleConnectDrop(event, contentNode.id, handleId)}
                        onAutoHeightChange={(height) => handleTableAutoHeight(contentNode.id, height)}
                        onResetManualSize={() => handleResetTableManualSize(contentNode.id)}
                    />
                );
            }
            // @opc-feature: creative-voice-table-render [end]
            if (contentNode.type === CanvasNodeType.Script) {
                const pipeline = deriveStoryboardPipelineProgress(contentNode, nodesRef.current, connectionsRef.current);
                return (
                    <CanvasScriptNodeContent
                        node={contentNode}
                        nodes={nodesRef.current}
                        batch={visibleGenerationBatch(contentNode)}
                        pipeline={pipeline}
                        scale={viewport.k}
                        mentionReferences={mentionReferencesByNodeId.get(contentNode.id) || EMPTY_RESOURCE_REFERENCES}
                        onOpen={() => setScriptEditorNodeId(contentNode.id)}
                        onCreateImageNodes={() => createScriptImageNodes(contentNode.id)}
                        onCreateVideoNodes={() => createScriptVideoNodes(contentNode.id)}
                        onGenerateImages={(rowIds) => void generateScriptImages(contentNode.id, rowIds)}
                        onGenerateVideos={(rowIds) => (contentNode.metadata?.storyboardVideoInputMode === "keyframe" ? void generateScriptVideos(contentNode.id, rowIds) : void createAndGenerateScriptVideos(contentNode.id, rowIds))}
                        onVideoInputModeChange={(storyboardVideoInputMode) => handleConfigNodeChange(contentNode.id, { storyboardVideoInputMode })}
                        onMergeVideos={() => void mergeVideosByIds(pipeline.successfulVideoNodeIds)}
                        onCreateActionBoards={() => void createScriptActionBoards(contentNode.id)}
                        onRetryBatch={(batchId) => retryFailedBatchItems(contentNode.id, batchId)}
                        onRetryBatchItem={(batchId, itemId) => retryFailedBatchItems(contentNode.id, batchId, itemId)}
                        onStopBatch={(batchId) => stopRemainingBatchItems(contentNode.id, batchId)}
                        onAddRow={() => addScriptRow(contentNode.id)}
                        onRemoveRow={(rowId) => removeScriptRow(contentNode.id, rowId)}
                        onUpdateRow={(rowId, patch) => updateScriptRow(contentNode.id, rowId, patch)}
                        onPromptChange={(composerContent) => handleConfigNodeChange(contentNode.id, { composerContent })}
                        onGenerateScript={(prompt) => void generateScriptRows(contentNode.id, prompt)}
                        onModelChange={(model) => handleConfigNodeChange(contentNode.id, { model })}
                        onShotDurationChange={(duration: StoryboardShotDuration) => handleConfigNodeChange(contentNode.id, { storyboardShotDuration: duration })}
                        onShotCountChange={(count: StoryboardShotCount) => handleConfigNodeChange(contentNode.id, { storyboardShotCount: count })}
                        workspaceMode={workspaceMode}
                        onComposerHeightChange={(height) => {
                            if (contentNode.metadata?.storyboardComposerHeight === height) return;
                            handleConfigNodeChange(contentNode.id, { storyboardComposerHeight: height });
                            const minHeight = storyboardMinNodeHeight(height);
                            if (contentNode.height < minHeight) handleNodeResize(contentNode.id, contentNode.width, minHeight);
                        }}
                        onConnectStart={(event, rowId, handleType) => handleConnectStart(event, contentNode.id, handleType, rowId === "context" ? "storyboard:context" : `row:${rowId}`)}
                        onScrollTopChange={(scrollTop) => setScriptScrollTopById((current) => (current[contentNode.id] === scrollTop ? current : { ...current, [contentNode.id]: scrollTop }))}
                    />
                );
            }
            if (contentNode.metadata?.directorSceneId) {
                return (
                    <CanvasDirectorNodePanel
                        node={contentNode}
                        scene={currentProject?.directorScenes?.find((scene) => scene.id === contentNode.metadata?.directorSceneId) || null}
                        readNodeContent={(nodeId) => (nodeId ? nodesRef.current.find((item) => item.id === nodeId)?.metadata?.content : undefined)}
                        professional={workspaceMode === "professional"}
                        onOpen={() => openDirectorWorkbench(contentNode.id)}
                    />
                );
            }
            return (
                <CanvasConfigNodePanel
                    node={contentNode}
                    isRunning={isCanvasNodeGenerating(contentNode, runningNodeId)}
                    inputSummary={getInputSummary(configInputsById.get(contentNode.id) || [])}
                    onConfigChange={handleConfigNodeChange}
                    onComposerToggle={() => setDialogNodeId((current) => (current === contentNode.id ? null : contentNode.id))}
                    onGenerate={(nodeId) => {
                        const target = nodesRef.current.find((item) => item.id === nodeId);
                        void handleGenerateNode(nodeId, target?.metadata?.generationMode || "image", target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "");
                    }}
                    workspaceMode={workspaceMode}
                />
            );
        },
        [
            addBatchReferenceColumn,
            addBatchRow,
            addScriptRow,
            configInputsById,
            connections,
            createAndGenerateScriptVideos,
            createScriptActionBoards,
            createStoryboardFromBatchTable,
            createScriptImageNodes,
            createScriptVideoNodes,
            currentProject?.directorScenes,
            fillRowsFromConnections,
            focusCanvasNode,
            generateBatchRows,
            generateScriptImages,
            generateScriptRows,
            generateScriptVideos,
            handleUploadBatchReference,
            moveBatchReferenceCell,
            handleConfigNodeChange,
            handleConnectDrop,
            handleConnectStart,
            handleGenerateNode,
            handleNodeResize,
            mentionReferencesByNodeId,
            mergeVideosByIds,
            openDirectorWorkbench,
            openStoryInput,
            patchBatchTable,
            removeBatchReferenceColumn,
            removeBatchRow,
            reorderBatchReferenceColumns,
            replaceCanvasNodeMedia,
            removeScriptRow,
            retryFailedBatchItems,
            runningNodeId,
            stopRemainingBatchItems,
            theme,
            updateBatchRow,
            updateScriptRow,
            handleTableAutoHeight,
            handleResetTableManualSize,
            handleSyncVoiceToStoryboard,
            handleSyncMasterToStoryboard,
            viewport.k,
            workspaceMode,
        ],
    );

    const handleCanvasNodeHoverStart = useCallback(
        (nodeId: string) => {
            if (nodeDraggingRef.current) return;
            setHoveredNodeId(nodeId);
            keepNodeToolbar(nodeId);
        },
        [keepNodeToolbar],
    );
    const handleCanvasNodeHoverEnd = useCallback(
        (nodeId: string) => {
            setHoveredNodeId((current) => (current === nodeId ? null : current));
            hideNodeToolbar();
        },
        [hideNodeToolbar],
    );
    const retryCanvasNode = useCallback(
        (node: CanvasNodeData) => {
            if (node.type === CanvasNodeType.Script) {
                const prompt = (node.metadata?.composerContent || node.metadata?.prompt || "").trim();
                if (!prompt) {
                    message.warning("分镜脚本缺少剧情内容，无法重试");
                    return;
                }
                void generateScriptRows(node.id, prompt);
                return;
            }
            if (node.type === CanvasNodeType.Image && node.metadata?.isBatchRoot) {
                const failedChildren = failedImageBatchChildren(node, nodesRef.current);
                if (!failedChildren.length) {
                    message.info("当前批次没有需要重试的失败图片");
                    return;
                }
                message.info(`正在重试 ${failedChildren.length} 个失败图片`);
                retryImageBatchChildren(node.id, failedChildren);
                return;
            }
            if (node.type === CanvasNodeType.Image && node.metadata?.batchRootId) {
                retryImageBatchChildren(node.metadata.batchRootId, [node]);
                return;
            }
            void handleRetryNode(node);
        },
        [generateScriptRows, handleRetryNode, message, nodesRef, retryImageBatchChildren],
    );
    const openCanvasNodeTaskDetails = useCallback(
        (node: CanvasNodeData) => {
            void openNodeTaskDetails(node);
        },
        [openNodeTaskDetails],
    );
    const openCanvasNodeVersions = useCallback((node: CanvasNodeData) => setVersionCompareRootId(node.metadata?.versionOfNodeId || node.id), []);
    const viewCanvasNodeImage = useCallback((node: CanvasNodeData) => setPreviewNodeId(node.id), []);
    const editCanvasDirector = useCallback((node: CanvasNodeData) => openDirectorWorkbench(node.id), [openDirectorWorkbench]);
    const locateProjectStyleNode = useCallback(() => {
        const styleNode = nodesRef.current.find((node) => node.type === CanvasNodeType.Text && node.metadata?.workflowKind === "styleboard");
        if (!styleNode) {
            message.info("项目画风节点正在同步，请稍后再试");
            return;
        }
        focusCanvasNode(styleNode.id);
    }, [focusCanvasNode, message, nodesRef]);
    const freeformCreateCommands = useCanvasCreateCommands({
        workspaceMode,
        isProjectLinked: Boolean(shortDramaEnabled && currentProject?.projectId),
        handlers: {
            onAddText: () => createNode(CanvasNodeType.Text),
            onAddImage: () => createNode(CanvasNodeType.Image),
            onAddVideo: () => createNode(CanvasNodeType.Video),
            onAddAudio: () => createNode(CanvasNodeType.Audio),
            onAddScript: () => createNode(CanvasNodeType.Script),
            onAddFrame: () => createNode(CanvasNodeType.Frame),
            onAddFolder: createFolder,
            onAddDrawing: () => createNode(CanvasNodeType.Drawing),
            onAddWorkflow: () => createNode(CanvasNodeType.Config),
            onAddExtensionNode: (type) => createNode(type),
            onChooseStyle: () => setStylePickerOpen(true),
            onOpenDirector: () => setDirectorTemplateRequest({}),
            onUpload: () => handleUploadRequest(),
            onOpenMyAssets: () => openCanvasAssetLibrary(),
            onOpenProjectCharacters: () => openProjectAssets("character"),
        },
    });
    const emptyStateKind = resolveCanvasEmptyStateKind({
        nodeCount: nodes.length,
        shortDramaEnabled,
        isProjectLinked: Boolean(currentProject?.projectId),
        starterMode: currentProject?.starterMode,
    });
    const emptyCanvasState =
        emptyStateKind === "freeform" ? (
            <CanvasFreeformEmptyState commands={freeformCreateCommands} />
        ) : emptyStateKind === "linked" ? (
            <CanvasLinkedProjectEmptyState
                projectName={linkedProjectQuery.data?.project.name || currentProject?.title || "项目画布"}
                hasChapter={Boolean(linkedProjectQuery.data?.units.length)}
                onAddFirstChapter={() => {
                    const first = linkedProjectQuery.data?.units.slice().sort((left, right) => left.position - right.position)[0];
                    if (first) void handleProjectChapterInsert({ id: first.id, projectId: linkedProjectId, title: first.title, position: first.position });
                }}
                onOpenAssets={() => openProjectAssets()}
                onAddText={() => createNode(CanvasNodeType.Text)}
            />
        ) : emptyStateKind === "guided" ? (
            <CanvasShortDramaEmptyState
                onCreatePipeline={createShortDramaPipeline}
                onOpenAgent={() => {
                    setCinematicAgentEntry(true);
                    openAgent();
                }}
                onStartFreeform={() => updateProject(projectId, { starterMode: "freeform" })}
                onUpload={() => handleUploadRequest()}
                onAddText={() => createNode(CanvasNodeType.Text)}
                onAddScript={() => createNode(CanvasNodeType.Script)}
            />
        ) : null;
    if (!projectLoaded && loadError)
        return (
            <main className="flex h-full flex-col items-center justify-center gap-4">
                <p role="alert">{loadError}</p>
                <Button onClick={retryLoad}>重新加载</Button>
                <Link to="/canvas">返回画布库</Link>
            </main>
        );
    if (!projectLoaded) return <CanvasRefreshShell />;

    return (
        <>
            <a
                href="#canvas-main"
                className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[var(--z-toast)] focus:rounded-md focus:border focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg"
            >
                跳转到画布主内容
            </a>
            <main id="canvas-main" tabIndex={-1} className={`relative flex h-full min-h-0 overflow-hidden outline-none ${!focusMode && !versions.preview ? `canvas-main-with-workspace ${workspaceOpen ? "canvas-workspace-expanded" : ""}` : ""}`} style={{ background: resolvedCanvasAppearance.background, color: theme.node.text }}>
                {!focusMode && !versions.preview ? <CanvasWorkspacePanel key={projectId} open={workspaceOpen} onOpen={() => setWorkspaceOpen(true)} onInsertAssets={handleProjectAssetsInsert} projectId={projectId} nodes={nodes} selectedNodeIds={selectedNodeIds} onClose={() => setWorkspaceOpen(false)} onAssets={() => openCanvasAssetLibrary()} onProjectAssets={currentProject?.projectId ? () => openProjectAssets() : undefined} onCancelTask={cancelCanvasTask} onFocus={nodeId => {
                    const target = nodeById.get(nodeId);
                    const parent = target?.parentId ? nodeById.get(target.parentId) : null;
                    if (parent?.metadata?.frame?.collapsed) toggleFrameCollapsed(parent.id);
                    const batchRoot = target?.metadata?.batchRootId ? nodeById.get(target.metadata.batchRootId) : null;
                    if (batchRoot && !batchRoot.metadata?.imageBatchExpanded) toggleBatchExpanded(batchRoot.id);
                    const selection = new Set([nodeId]); selectedNodeIdsRef.current = selection; setSelectedNodeIds(selection); setSelectedConnectionId(null); focusCanvasNode(nodeId);
                }} /> : null}
                {!workspaceOpen && !focusMode && !versions.preview && shortDramaEnabled && currentProject?.projectId ? (
                    <CanvasProjectSidebar projectId={currentProject.projectId} detail={linkedProjectQuery.data} onAddChapter={handleProjectChapterInsert} onLocateStyle={locateProjectStyleNode} onOpenAssets={() => openProjectAssets()} />
                ) : null}
                <CanvasOverlayLayerProvider>
                    <div className="canvas-editor-shell relative flex min-w-0 flex-1">
                    <section data-canvas-editor inert={Boolean(versions.preview)} style={{ visibility: versions.preview ? "hidden" : undefined, opacity: versions.preview ? 0 : undefined }} className="relative min-w-0 flex-1 flex flex-col min-h-0 overflow-hidden">
                        {!focusMode ? (
                            <CanvasTopBar
                                syncStatus={<CanvasSyncStatus projectId={projectId} onLoadLatest={reloadLatestCanvasProject} onOpenVersions={openVersions} />}
                                versionsOpen={versions.open}
                                onToggleVersions={() => { closeAgent(); setVersionCompareRootId(null); versions.toggle(); }}
                                title={currentProject?.title || "未命名画布"}
                                titleDraft={titleDraft}
                                isTitleEditing={titleEditing}
                                onTitleDraftChange={setTitleDraft}
                                onStartTitleEditing={startTitleEditing}
                                onFinishTitleEditing={finishTitleEditing}
                                onCancelTitleEditing={() => setTitleEditing(false)}
                                canUndo={historyState.canUndo}
                                canRedo={historyState.canRedo}
                                onCreateProject={createAndOpenProject}
                                onDeleteProject={deleteCurrentProject}
                                onSave={() => void saveCanvasProject()}
                                onForceSave={confirmForceSaveCanvas}
                                onImportImage={() => handleUploadRequest()}
                                onImportLibTV={() => setLibTVImportOpen(true)}
                                onImportTapNow={() => setTapNowImportOpen(true)}
                                onUndo={undoCanvas}
                                onRedo={redoCanvas}
                                onShare={() => setShareModalOpen(true)}
                                shortcutRequestNonce={shortcutRequestNonce}
                                mediaPerformanceMode={mediaPerformanceMode}
                                onMediaPerformanceModeChange={setMediaPerformanceMode}
                                onOpenSearch={() => setNodeSearchOpen(true)}
                                projectContext={
                                    shortDramaEnabled && currentProject?.projectId
                                        ? {
                                              ...canvasContext,
                                              projectId: currentProject.projectId,
                                              projectName: linkedProjectQuery.data?.project.name || currentProject.title,
                                          }
                                        : undefined
                                }
                                onEnterFocusMode={enterFocusMode}
                                shortDramaGuide={shortDramaGuide}
                            />
                        ) : null}

                        <CanvasNodeSearchModal
                            open={nodeSearchOpen}
                            nodes={nodes}
                            onClose={() => setNodeSearchOpen(false)}
                            onFocus={(nodeId) => {
                                const target = nodeById.get(nodeId);
                                const parent = target?.parentId ? nodeById.get(target.parentId) : null;
                                if (parent?.metadata?.frame?.collapsed) toggleFrameCollapsed(parent.id);
                                const batchRoot = target?.metadata?.batchRootId ? nodeById.get(target.metadata.batchRootId) : null;
                                if (batchRoot && !batchRoot.metadata?.imageBatchExpanded) toggleBatchExpanded(batchRoot.id);
                                const selection = new Set([nodeId]);
                                selectedNodeIdsRef.current = selection;
                                setSelectedNodeIds(selection);
                                setSelectedConnectionId(null);
                                focusCanvasNode(nodeId);
                            }}
                        />

                        {!focusMode && shortDramaGuide ? (
                            <CanvasShortDramaGuide progress={shortDramaGuide.progress} collapsed={shortDramaGuide.collapsed} onToggle={shortDramaGuide.onToggle} onSkip={skipShortDramaGuide} onStepClick={activateShortDramaStep} />
                        ) : null}

                        <CanvasShareModal projectId={projectId} open={shareModalOpen} onClose={() => setShareModalOpen(false)} beforeCreate={saveCanvasProject} />
                        <LibTVImportDialog open={libTVImportOpen} projectId={projectId} viewport={viewport} viewportSize={size} onClose={() => setLibTVImportOpen(false)} onApply={applyLibTVImport} />
                        <TapNowImportDialog open={tapNowImportOpen} projectId={projectId} viewport={viewport} viewportSize={size} onClose={() => setTapNowImportOpen(false)} onApply={applyTapNowImport} />

                        <CanvasStylePickerModal open={stylePickerOpen} value={activeStylePresetId} applying={styleApplying} onClose={() => setStylePickerOpen(false)} onSelect={selectCanvasStyle} />

                        <CanvasDirectorTemplateModal open={Boolean(directorTemplateRequest)} onClose={() => setDirectorTemplateRequest(null)} onSelect={(templateId) => createDirectorShot(templateId, directorTemplateRequest?.position)} />

                        <div className="relative flex min-h-0 min-w-0 flex-1">
                            <div className="relative min-w-0 flex-1 overflow-hidden">
                                <InfiniteCanvas
                                    interactive={!versions.preview}
                                    containerRef={containerRef}
                                    viewport={viewport}
                                    appearance={canvasAppearance}
                                    backgroundMode={backgroundMode}
                                    graphicsLayer={
                                        <CanvasLeaferGraphicsLayer
                                            containerRef={containerRef}
                                            viewport={viewport}
                                            theme={theme}
                                            displayConnections={visibleDisplayConnections}
                                            selectedConnectionId={selectedConnectionId}
                                            relatedConnectionIds={relatedHighlight.connectionIds}
                                            scriptScrollTopById={scriptScrollTopById}
                                            connectingParams={connectingParams}
                                            batchConnectionPreview={batchConnectionPreview}
                                            mouseWorld={mouseWorld}
                                            connectionTargetNodeId={connectionTargetNodeId}
                                            connectionTargetAnchorRatio={connectionTargetAnchorRatio}
                                            nodeById={nodeById}
                                            selectionBox={selectionBox}
                                            selectedNodeBounds={selectedNodeBounds}
                                            alignmentGuides={alignmentGuides}
                                        />
                                    }
                                    onViewportChange={handleViewportChange}
                                    onViewportPreviewChange={handleViewportPreviewChange}
                                    onCanvasMouseDown={handleCanvasMouseDown}
                                    boxSelectEnabled={canvasTool === "box-select"}
                                    onCanvasDoubleClick={handleCanvasDoubleClick}
                                    onCanvasDeselect={deselectCanvas}
                                    onContextMenu={handleCanvasContextMenu}
                                    onDrop={handleDrop}
                                    onFileDragEnter={handleFileDragEnter}
                                    onFileDragLeave={handleFileDragLeave}
                                    onFileDragOver={handleFileDragOver}
                                >
                                    <CanvasNodeActionContext.Provider value={canvasNodeActions}>
                                        <CanvasNodeGraphContext.Provider value={nodeGraphContext}>
                                            <CanvasProjectWorldLayers
                                                connectionApproach={connectionApproach}
                                                projectId={projectId}
                                                viewportScale={viewport.k}
                                                connectionLayerBounds={connectionLayerBounds}
                                                displayConnections={visibleDisplayConnections}
                                                selectedConnectionId={selectedConnectionId}
                                                relatedConnectionIds={relatedHighlight.connectionIds}
                                                scriptScrollTopById={scriptScrollTopById}
                                                connectingParams={connectingParams}
                                                mouseWorld={mouseWorld}
                                                connectionTargetNodeId={connectionTargetNodeId}
                                                nodeById={nodeById}
                                                visibleNodes={visibleNodes}
                                                nodeRenderLODById={nodeRenderLODById}
                                                nodeStackOrder={nodeStackOrder}
                                                frameChildrenById={frameChildrenById}
                                                linkedFolderPreviewNodesById={linkedFolderPreviewNodesById}
                                                dragPreview={dragPreview}
                                                selectedNodeIds={selectedNodeIds}
                                                frameDropTargetId={frameDropTargetId}
                                                relatedNodeIds={relatedHighlight.nodeIds}
                                                activeNodeId={activeNodeId}
                                                selectionBox={selectionBox}
                                                batchChildCountById={batchChildCountById}
                                                collapsingBatchIds={collapsingBatchIds}
                                                openingBatchIds={openingBatchIds}
                                                batchMotionById={batchMotionById}
                                                showImageInfo={showImageInfo}
                                                reduceMediaEffects={reduceMediaEffects}
                                                resourceReferenceByNodeId={resourceReferenceByNodeId}
                                                mentionReferencesByNodeId={mentionReferencesByNodeId}
                                                mediaEffectsDisabledNodeId={emotionNodeId}
                                                selectedNodeBounds={selectedNodeBounds}
                                                batchSourceNodeIds={batchSourceNodeIds}
                                                batchConnectionPreview={batchConnectionPreview}
                                                isNodeDragging={isNodeDragging}
                                                selectionBoundsElementRef={selectionBoundsElementRef}
                                                renderCanvasNodeContent={renderCanvasNodeContent}
                                                onConnectionSelect={(connectionId) => {
                                                    setSelectedConnectionId(connectionId);
                                                    setSelectedNodeIds(new Set());
                                                    setContextMenu(null);
                                                }}
                                                onConnectionContextMenu={(event, connectionId) => {
                                                    setSelectedConnectionId(connectionId);
                                                    setSelectedNodeIds(new Set());
                                                    closeConnectionCreateMenu();
                                                    setContextMenu({ type: "connection", x: event.clientX, y: event.clientY, connectionId });
                                                }}
                                                onNodeMouseDown={handleNodeMouseDown}
                                                // @opc-feature: canvas-video-keyboard-delete [start]
                                                onNodeSelect={(nodeId) => {
                                                    setSelectedNodeIds(new Set([nodeId]));
                                                    setSelectedConnectionId(null);
                                                }}
                                                // @opc-feature: canvas-video-keyboard-delete [end]
                                                onNodeHoverStart={handleCanvasNodeHoverStart}
                                                onNodeHoverEnd={handleCanvasNodeHoverEnd}
                                                onConnectStart={handleConnectStart}
                                                onNodeResize={handleNodeResize}
                                                onToggleFrame={handleFrameToggle}
                                                onFolderStyleChange={handleFolderStyleChange}
                                                onFolderThemeChange={handleFolderThemeChange}
                                                onNodeTitleChange={handleNodeTitleChange}
                                                onNodeContextMenu={handleNodeContextMenu}
                                                onNodeContentChange={handleNodeContentChange}
                                                onToggleBatch={toggleBatchExpanded}
                                                onSetBatchPrimary={setBatchPrimary}
                                                onRetry={retryCanvasNode}
                                                onReloadResource={reloadCanvasNodeResource}
                                                onOpenTaskDetails={openCanvasNodeTaskDetails}
                                                onOpenVersions={openCanvasNodeVersions}
                                                onViewImage={viewCanvasNodeImage}
                                                onReplaceMedia={replaceCanvasNodeMedia}
                                                onOpenTextEditor={openTextNodeEditor}
                                                onOpenDirector={editCanvasDirector}
                                                onOpenDrawing={openDrawingNode}
                                                onStartBatchConnection={startBatchConnection}
                                            />
                                        </CanvasNodeGraphContext.Provider>
                                    </CanvasNodeActionContext.Provider>
                                </InfiniteCanvas>

                                <CanvasActiveTaskPanel tasks={activeTasks} onCancelTask={cancelCanvasTask} topInset={focusMode ? "var(--space-3)" : "var(--canvas-topbar-offset)"} />

                                {focusMode ? (
                                    <CanvasFocusModeBar
                                        syncStatus={<CanvasSyncStatus projectId={projectId} onLoadLatest={reloadLatestCanvasProject} onOpenVersions={openVersions} />}
                                        versionsOpen={versions.open}
                                        onToggleVersions={() => { closeAgent(); versions.toggle(); }}
                                        dockRevealed={focusDockRevealed}
                                        zoomPercent={viewport.k}
                                        onToggleDock={() => setFocusDockRevealed((value) => !value)}
                                        onExit={exitFocusMode}
                                        onZoomIn={zoomCanvasIn}
                                        onZoomOut={zoomCanvasOut}
                                        onFit={fitCanvasContent}
                                    />
                                ) : null}

                                <CanvasFileDropOverlay active={fileDropActive} theme={theme} />

                                {emptyCanvasState}

                                {!focusMode || focusDockRevealed ? (
                                    <CanvasToolbar
                                        selectedCount={selectedNodeIds.size}
                                        workspaceMode={workspaceMode}
                                        canvasTool={canvasTool}
                                        onToolChange={setCanvasTool}
                                        isProjectLinked={Boolean(shortDramaEnabled && currentProject?.projectId)}
                                        canUndo={historyState.canUndo}
                                        canRedo={historyState.canRedo}
                                        appearance={canvasAppearance}
                                        backgroundMode={backgroundMode}
                                        showImageInfo={showImageInfo}
                                        onAddImage={() => createNode(CanvasNodeType.Image)}
                                        onAddVideo={() => createNode(CanvasNodeType.Video)}
                                        onAddAudio={() => createNode(CanvasNodeType.Audio)}
                                        onAddText={() => createNode(CanvasNodeType.Text)}
                                        onChooseStyle={() => setStylePickerOpen(true)}
                                        onAddScript={() => createNode(CanvasNodeType.Script)}
                                        onAddFrame={() => createNode(CanvasNodeType.Frame)}
                                        onAddFolder={createFolder}
                                        onAddDrawing={() => createNode(CanvasNodeType.Drawing)}
                                        onAddExtensionNode={(type) => createNode(type)}
                                        onAddWorkflow={() => createNode(CanvasNodeType.Config)}
                                        onOpenDirector={() => setDirectorTemplateRequest({})}
                                        onUndo={undoCanvas}
                                        onRedo={redoCanvas}
                                        onUpload={() => handleUploadRequest()}
                                        onDelete={() => deleteNodes(new Set(selectedNodeIds))}
                                        onClear={() => setClearConfirmOpen(true)}
                                        onDeselect={deselectCanvas}
                                        onAppearanceChange={applyCanvasAppearance}
                                        onSaveAppearanceDefault={saveCanvasAppearanceDefault}
                                        onBackgroundModeChange={setBackgroundMode}
                                        onShowImageInfoChange={setShowImageInfo}
                                        onOpenWorkspace={() => setWorkspaceOpen(value => !value)}
                                        onOpenMyAssets={() => {
                                            openCanvasAssetLibrary();
                                        }}
                                        onOpenProjectCharacters={() => openProjectAssets("character")}
                                    />
                                ) : null}
                            </div>

                            <div className={versions.open ? "hidden" : "contents"}>
                            <CanvasCloudAgentPanel canvasId={projectId} domainProjectId={currentProject?.projectId} canvasNodes={nodes} runningNodeId={runningNodeId} nodeCount={nodes.length} selectedNodeIds={Array.from(selectedNodeIds)} references={agentMentionReferences} prefillPrompt={agentPrefillPrompt} open={assistantOpen} onOpen={openAgent} onCollapse={closeAgent} onFocusNode={(nodeId) => {
                                if (!nodesRef.current.some((node) => node.id === nodeId)) { message.info("该节点已删除或尚未同步到画布"); return; }
                                focusCanvasNode(nodeId);
                            }} />
                            </div>
                        </div>

                        {angleNode?.metadata?.content ? (
                            <CanvasNodePanelOverlay
                                node={angleNode}
                                viewport={viewport}
                                containerRef={containerRef}
                                panelWidth={640}
                                panelHeight={540}
                                allowOverflow
                                dragOffset={dragPreview?.nodeIds.has(angleNode.id) ? { x: dragPreview.x, y: dragPreview.y } : null}
                                isDragging={isNodeDragging && Boolean(dragPreview?.nodeIds.has(angleNode.id))}
                            >
                                <CanvasNodeAnglePanel
                                    dataUrl={angleNode.metadata.content}
                                    onClose={() => setAngleNodeId(null)}
                                    onConfirm={(params) => {
                                        void generateAngleNode(angleNode, params);
                                    }}
                                />
                            </CanvasNodePanelOverlay>
                        ) : null}

                        {lightingNode?.metadata?.content ? (
                            <AppModal flush open centered title={null} closable={false} footer={null} width={720} onCancel={() => setLightingNodeId(null)}>
                                <CanvasNodeLightingPanel
                                    dataUrl={lightingNode.metadata.content}
                                    onClose={() => setLightingNodeId(null)}
                                    onConfirm={(options, prompt) => {
                                        generateLightingNode(lightingNode, options, prompt);
                                    }}
                                />
                            </AppModal>
                        ) : null}

                        {emotionNode?.metadata?.content && !isCanvasNodeMoving ? (
                            <CanvasEmotionWorkspace
                                node={emotionNode}
                                viewport={viewport}
                                containerRef={containerRef}
                                dragOffset={dragPreview?.nodeIds.has(emotionNode.id) ? { x: dragPreview.x, y: dragPreview.y } : null}
                                isDragging={isNodeDragging && Boolean(dragPreview?.nodeIds.has(emotionNode.id))}
                                onClose={() => setEmotionNodeId(null)}
                                onConfirm={(payload: CanvasImageEmotionPayload) => {
                                    void generateEmotionNode(emotionNode, payload);
                                }}
                            />
                        ) : null}

                        {dialogNode &&
                        !isCanvasImageSourceNode(dialogNode) &&
                        !dialogNode.metadata?.fileUpload &&
                        dialogNode.type !== CanvasNodeType.Script &&
                        dialogNode.type !== CanvasNodeType.BatchTable &&
                        // @opc-feature: standard-batch-table-dialog-guard [start]
                        dialogNode.type !== STANDARD_BATCH_TABLE_NODE_TYPE &&
                        // @opc-feature: standard-batch-table-dialog-guard [end]
                        // @opc-feature: creative-voice-table-dialog-guard [start]
                        dialogNode.type !== CREATIVE_VOICE_TABLE_NODE_TYPE &&
                        // @opc-feature: creative-voice-table-dialog-guard [end]
                        // @opc-feature: creative-tables-dialog-guard [start]
                        dialogNode.type !== CREATIVE_ASSET_TABLE_NODE_TYPE &&
                        dialogNode.type !== CREATIVE_STORYBOARD_TABLE_NODE_TYPE &&
                        dialogNode.type !== CREATION_ASSISTANT_REF_SCRIPT_NODE_TYPE &&
                        dialogNode.type !== CREATION_ASSISTANT_ANALYSIS_NODE_TYPE &&
                        dialogNode.type !== VIDEO_REVERSE_NODE_TYPE &&
                        !dialogNode.metadata?.batchTable &&
                        // @opc-feature: creative-tables-dialog-guard [end]
                        dialogNode.type !== CanvasNodeType.Drawing &&
                        dialogNode.type !== CanvasNodeType.Panorama &&
                        !selectionBox &&
                        !isCanvasNodeMoving ? (
                            <CanvasNodePanelOverlay
                                node={dialogNode}
                                viewport={viewport}
                                containerRef={containerRef}
                                allowOverflow={dialogNode.type !== CanvasNodeType.Config}
                                dragOffset={dragPreview?.nodeIds.has(dialogNode.id) ? { x: dragPreview.x, y: dragPreview.y } : null}
                                isDragging={isNodeDragging && Boolean(dragPreview?.nodeIds.has(dialogNode.id))}
                            >
                                {renderCanvasNodePanel(dialogNode)}
                            </CanvasNodePanelOverlay>
                        ) : null}

                        {pendingConnectionCreate ? (
                            <CanvasConnectionCreateMenu
                                pending={pendingConnectionCreate}
                                viewport={viewport}
                                viewportSize={size}
                                containerRef={containerRef}
                                canCreateDrawing={canCreateDrawingFromConnection}
                                getDisabledReason={(type) => getConnectionCreateDisabledReason(type, pendingConnectionCreate)}
                                onCreate={(type) => void createConnectedNode(type, pendingConnectionCreate)}
                                onClose={cancelPendingConnectionCreate}
                            />
                        ) : null}

                        {connectionReplaceHover ? (
                            <div
                                className="pointer-events-none fixed z-[var(--z-dialog-popover)] flex select-none items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur-md transition-all"
                                style={{
                                    left: connectionReplaceHover.clientX + 14,
                                    top: connectionReplaceHover.clientY + 14,
                                    transform: "translateY(-50%)",
                                }}
                            >
                                <ArrowLeftRight className="size-3 text-blue-400" />
                                {/* @opc-feature: batch-table-slot-connection [start] */}
                                <span>{connectionReplaceHover.actionText || "松开替换"}</span>
                                {/* @opc-feature: batch-table-slot-connection [end] */}
                                <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue-200">@{connectionReplaceHover.referenceLabel}</span>
                            </div>
                        ) : null}

                        {selectedNodeBounds && !selectionBox && !isCanvasNodeMoving ? (
                            <CanvasProjectSelectionToolbar
                                anchorRef={selectionBoundsElementRef}
                                containerRef={containerRef}
                                count={selectedNodeBounds.count}
                                selectedVideoCount={selectedVideoNodes.length}
                                mergingVideos={Boolean(mergeVideoProgress)}
                                onAlign={alignSelectedNodes}
                                onArrange={arrangeSelectedNodes}
                                onCreateStoryboard={createStoryboardGroup}
                                onCreateReferenceGroup={createReferenceGroup}
                                onBatchConnect={() => beginBatchConnectionMode(Array.from(selectedNodeIds))}
                                onMergeVideos={() => void mergeSelectedVideos()}
                                onSendSelectionToAgent={() => sendSelectionToAgent()}
                            />
                        ) : null}

                        {uploadStatus ? <CanvasUploadStatusToast status={uploadStatus} theme={theme} /> : null}
                        {mergeVideoProgress ? <CanvasMergeStatusToast progress={mergeVideoProgress} theme={theme} /> : null}
                        {lastAgentChange ? (
                            <CanvasOperationChangeToast
                                change={lastAgentChange}
                                theme={theme}
                                onView={viewLastAgentChange}
                                onUndo={() => {
                                    undoAgentOps();
                                }}
                                onClose={dismissLastAgentChange}
                            />
                        ) : null}

                        <CanvasNodeToolbar
                            node={isCanvasNodeMoving || nodeImageSettingsOpen || emotionNodeId || angleNodeId ? null : toolbarNode}
                            workspaceMode={workspaceMode}
                            viewport={viewport}
                            containerRef={containerRef}
                            onKeep={keepNodeToolbar}
                            onLeave={hideNodeToolbar}
                            onInfo={(node) => (node.metadata?.workflowKind === "character" && node.metadata.characterAssetId ? openTextNodeEditor(node) : setInfoNodeId(node.id))}
                            onEditText={openTextNodeEditor}
                            onDecreaseFont={(node) => handleFontSizeChange(node.id, Math.max(10, (node.metadata?.fontSize || 14) - 2))}
                            onIncreaseFont={(node) => handleFontSizeChange(node.id, Math.min(32, (node.metadata?.fontSize || 14) + 2))}
                            onToggleDialog={(node) => setDialogNodeId((current) => (current === node.id ? null : node.id))}
                            onGenerateImage={generateImageFromTextNode}
                            onUpload={(node) => handleUploadRequest(node.id)}
                            onDownload={downloadNodeImage}
                            onSaveAsset={(node) => void saveNodeAsset(node)}
                            onAnnotate={(node) => setAnnotationNodeId(node.id)}
                            onAnnotationEdit={openAnnotationEditNode}
                            onMaskEdit={(node) => setMaskEditNodeId(node.id)}
                            onRemoveBackground={openBackgroundRemoval}
                            onLayerDecomposition={openLayerDecomposition}
                            onTextEdit={openTextEditNode}
                            onEmotion={(node) => {
                                setDialogNodeId(null);
                                setEmotionNodeId((current) => (current === node.id ? null : node.id));
                            }}
                            onPortraitTexture={openPortraitTextureEditor}
                            onCrop={(node) => setCropNodeId(node.id)}
                            onSplit={(node, params) => void splitImageNode(node, params)}
                            onUpscale={(node) => setUpscaleNodeId(node.id)}
                            onSuperResolve={(node) => setSuperResolveNodeId(node.id)}
                            onAngle={(node) => {
                                setDialogNodeId(null);
                                setAngleNodeId((current) => (current === node.id ? null : node.id));
                            }}
                            onLighting={(node) => {
                                setDialogNodeId(null);
                                setLightingNodeId((current) => (current === node.id ? null : node.id));
                            }}
                            onPanorama={openPanoramaConfig}
                            onViewImage={(node) => setPreviewNodeId(node.id)}
                            onExtractVideoFrames={openVideoFrameExtractor}
                            onExtractAudioFromVideo={(node) => void extractAudioFromVideo(node)}
                            onTrimVideoSegments={openVideoSegmentExtractor}
                            onSubtitles={(node) => setSubtitleNodeId(node.id)}
                            onTimeline={(node) => setTimelineNodeId(node.id)}
                            extractingVideoFrames={toolbarNode?.id === extractingVideoFramesNodeId}
                            extractingAudio={segmentRunningMode === "audio"}
                            trimmingVideo={segmentRunningMode === "video"}
                            onNineGrid={(node, id, label, icon) => void generateNineGridNode(node, id, label, icon)}
                            onReversePrompt={createImageReversePromptNodes}
                            onRetry={retryCanvasNode}
                            onToggleFreeResize={(node) => toggleNodeFreeResize(node.id)}
                            onToggleLocked={(node) => toggleNodeLocked(node.id)}
                            onDelete={(node) => deleteNodes(new Set([node.id]))}
                        />

{isMiniMapOpen && !focusMode ? <Minimap nodes={nodes} viewport={viewport} viewportSize={size} canvasContainerRef={containerRef} onViewportPreviewChange={previewViewport} onViewportChange={handleViewportChange} /> : null}

                        {!focusMode ? (
                            <CanvasOverlayLayerContainer
                                overlayId="asset-tray"
                                fallbackZIndex="var(--z-panel)"
                                className="absolute bottom-[calc(var(--canvas-inset-y)+var(--space-16))] left-[var(--canvas-inset-x)] flex items-end gap-2 lg:bottom-[var(--canvas-inset-y)]"
                                onMouseDown={(event) => event.stopPropagation()}
                                onPointerDown={(event) => event.stopPropagation()}
                                onWheel={(event) => event.stopPropagation()}
                            >
                                <CanvasZoomControls
                                    scale={viewport.k}
                                    containerRef={containerRef}
                                    onScaleChange={setZoomScale}
                                    onFitContent={fitCanvasContent}
                                    onAutoArrange={autoArrangeCanvasNodes}
                                    hideNodeConnections={hideNodeConnections}
                                    onHideNodeConnectionsChange={setHideNodeConnections}
                                    isMiniMapOpen={isMiniMapOpen}
                                    onToggleMiniMap={() => setIsMiniMapOpen((value) => !value)}
                                    onOpenShortcuts={() => setShortcutRequestNonce((value) => value + 1)}
                                />
                            </CanvasOverlayLayerContainer>
                        ) : null}

                        <CanvasProjectContextMenu
                            menu={contextMenu}
                            node={contextMenuNode}
                            workspaceMode={workspaceMode}
                            isProjectLinked={Boolean(currentProject?.projectId)}
                            canUndo={historyState.canUndo}
                            canRedo={historyState.canRedo}
                            canPaste={hasCopiedNodes || Boolean(navigator.clipboard)}
                            selectedCount={selectedNodeIds.size}
                            screenToCanvas={screenToCanvas}
                            onClose={() => setContextMenu(null)}
                            onAddNode={(type, position) => createNode(type, position)}
                            onAddFolder={createFolder}
                            onChooseStyle={() => setStylePickerOpen(true)}
                            onOpenDirector={(position) => setDirectorTemplateRequest({ position })}
                            onUpload={(nodeId, position) => handleUploadRequest(nodeId, position)}
                            onOpenAssets={openCanvasAssetLibrary}
                            onOpenProjectCharacters={(position) => openProjectAssets("character", position)}
                            onUndo={undoCanvas}
                            onRedo={redoCanvas}
                            onPaste={pasteAtPosition}
                            onCopyNode={(nodeId) => copyNodesToClipboard(new Set([nodeId]))}
                            onCreateGenerationCopy={(nodeId) => duplicateNode(nodeId, "copy")}
                            onDuplicate={duplicateNode}
                            onDeleteNode={(nodeId) => deleteNodes(new Set([nodeId]))}
                            onDeleteConnection={deleteConnection}
                            onSaveAsset={(node) => {
                                void saveNodeAsset(node);
                            }}
                            onViewMedia={(node) => setPreviewNodeId(node.id)}
                            onEditText={openTextNodeEditor}
                            onOpenDrawing={openDrawingNode}
                            onGenerateImage={generateImageFromTextNode}
                            onCopyContent={(node) => {
                                void copyNodeContentToClipboard(node);
                            }}
                            onCopyMediaUrl={(node) => {
                                void copyNodeMediaUrlToClipboard(node);
                            }}
                            onUploadToArkPrivateAsset={confirmUploadNodeImageToArkPrivateAsset}
                            onSetAssetCategory={(nodeId, assetCategory) => handleConfigNodeChange(nodeId, { assetCategory })}
                            onToggleFrame={(node) => handleFrameToggle(node.id)}
                            onSpreadSelection={spreadSelectedNodes}
                            onCopySelection={copySelectedNodes}
                            onDeleteSelection={() => deleteNodes(selectedNodeIds)}
                            onSendToAgent={() => sendSelectionToAgent(contextMenu?.type === "node" && selectedNodeIds.size <= 1 ? contextMenu.nodeId : undefined)}
                        />

                        <CanvasUploadModal open={uploadModalOpen} onClose={closeUploadModal} onUpload={handleUploadFiles} />

                        <input ref={imageInputRef} type="file" accept="image/*,video/*,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav" className="hidden" onChange={handleImageInputChange} />

                        <CanvasNodeInfoModal node={infoNode} open={Boolean(infoNode)} onClose={() => setInfoNodeId(null)} onMetadataChange={handleConfigNodeChange} />

                        {subtitleNode ? (
                            <CanvasSubtitleDialog
                                node={subtitleNode}
                                open={Boolean(subtitleNode)}
                                projectId={projectId}
                                config={effectiveConfig}
                                onClose={() => setSubtitleNodeId(null)}
                                onSave={(nodeId, patch) => {
                                    handleConfigNodeChange(nodeId, patch);
                                    const currentTimeline = currentProject?.timeline;
                                    if (currentTimeline) {
                                        const next = syncNodeSubtitlesToTimeline(currentTimeline, nodeId, patch.subtitleEntries || []);
                                        if (next !== currentTimeline) updateProject(projectId, { timeline: next });
                                    }
                                }}
                            />
                        ) : null}

                        {frameNode ? <CanvasVideoFrameDialog node={frameNode} open={Boolean(frameNode)} onClose={closeFrameDialog} onConfirm={(params) => void extractVideoFrames(frameNode, params)} /> : null}

                        {segmentNode && segmentDialogMode ? (
                            <CanvasVideoSegmentDialog
                                node={segmentNode}
                                nodes={nodes}
                                connections={connections}
                                open={Boolean(segmentNode && segmentDialogMode)}
                                mode={segmentDialogMode}
                                config={effectiveConfig}
                                timeline={currentProject?.timeline || null}
                                onClose={closeSegmentDialog}
                                onConfirm={(params) => void handleSegmentConfirm(segmentNode, params)}
                            />
                        ) : null}

                        {timelineNode ? (
                            <CanvasTimelineDialog
                                node={timelineNode}
                                open={Boolean(timelineNode)}
                                nodes={nodes}
                                timeline={currentProject?.timeline || null}
                                onClose={() => setTimelineNodeId(null)}
                                onOpenSubtitleDialog={(subNodeId) => {
                                    setTimelineNodeId(null);
                                    setSubtitleNodeId(subNodeId);
                                }}
                                onSave={(next) => updateProject(projectId, { timeline: next })}
                                onSaveSubtitles={(subNodeId, entries) =>
                                    handleConfigNodeChange(subNodeId, {
                                        subtitleEntries: entries,
                                        ...(entries.length ? {} : { subtitleHighlights: [] }),
                                        subtitleUpdatedAt: new Date().toISOString(),
                                    })
                                }
                                onOpenAssetLibrary={openTimelineAssetLibrary}
                                onOpenProjectAssets={() => openProjectAssets("all", undefined, "timeline")}
                                onUploadLocalFiles={uploadTimelineMedia}
                                addNodeToTimelineRef={timelineAddNodeRef}
                                addMediaToTimelineRef={timelineMediaAddRef}
                                onCreateAssembledNode={createVideoNodeFromBlob}
                            />
                        ) : null}

                        <CanvasCharacterReferenceModal node={characterReferenceNode} open={Boolean(characterReferenceNode)} onClose={() => setCharacterReferenceNodeId(null)} />

                        <CanvasTextEditorModal
                            node={textEditorNode}
                            open={Boolean(textEditorNode)}
                            onClose={() => setTextEditorNodeId(null)}
                            onSave={(nodeId, title, content, richText) => {
                                setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, title, metadata: { ...node.metadata, content, richText } } : node)));
                            }}
                        />

                        {drawingNode ? (
                            <Suspense
                                fallback={
                                    <div className="fixed inset-0 z-[var(--z-toast)] grid place-items-center px-5" style={{ background: theme.canvas.background, color: theme.node.text }}>
                                        <WorkspaceState icon="loading" title="正在加载绘图编辑器" description="正在准备绘图画布。" />
                                    </div>
                                }
                            >
                                <CanvasDrawingEditorModal
                                    node={drawingNode}
                                    projectId={projectId}
                                    open={Boolean(drawingNode)}
                                    onClose={() => setDrawingNodeId(null)}
                                    onSaved={(nodeId, summary) => {
                                        setNodes((current) =>
                                            current.map((node) =>
                                                node.id === nodeId
                                                    ? {
                                                          ...node,
                                                          metadata: {
                                                              ...node.metadata,
                                                              drawingEngine: summary.engine,
                                                              drawingRevision: summary.revision,
                                                              drawingUpdatedAt: summary.updatedAt,
                                                              drawingShapeCount: summary.shapeCount,
                                                              drawingPageCount: summary.pageCount,
                                                          },
                                                      }
                                                    : node,
                                            ),
                                        );
                                        message.success("绘图已保存");
                                    }}
                                />
                            </Suspense>
                        ) : null}

                        <AiArtCritiqueModal
                            startRequestId={artCritiqueStartRequest && artCritiqueStartRequest.nodeId === artCritiqueNode?.id ? artCritiqueStartRequest.id : undefined}
                            restartRequested={artCritiqueStartRequest?.nodeId === artCritiqueNode?.id && artCritiqueStartRequest?.restart}
                            onRunningChange={(running) => {
                                artCritiqueRunningRef.current = running;
                            }}
                            node={artCritiqueNode}
                            upstreamNodes={artCritiqueInputs}
                            open={Boolean(artCritiqueNode)}
                            onClose={() => setArtCritiqueNodeId(null)}
                            onUpdateState={(nodeId, state) => handleConfigNodeChange(nodeId, { artCritique: state })}
                        />

                        <CanvasPanoramaConfigModal
                            open={Boolean(panoramaConfigNodeId)}
                            onCancel={() => setPanoramaConfigNodeId(null)}
                            onConfirm={(composedPrompt, config) => {
                                const node = nodes.find((n) => n.id === panoramaConfigNodeId);
                                if (node) {
                                    createPanoramaViewerWithConfig(node, composedPrompt, config);
                                }
                            }}
                            onCopyPrompt={(prompt) => {
                                void navigator.clipboard?.writeText(prompt).then(() => message.success("已复制全景提示词"));
                            }}
                            previewImageUrl={panoramaConfigNodeId ? nodes.find((n) => n.id === panoramaConfigNodeId)?.metadata?.content : undefined}
                            nodes={nodes}
                        />

                        <CanvasScriptEditor
                            node={activeScriptNode}
                            nodes={nodes}
                            open={Boolean(activeScriptNode)}
                            onClose={() => setScriptEditorNodeId(null)}
                            onUpdateRows={(rows) => activeScriptNode && replaceScriptRows(activeScriptNode.id, rows)}
                            onVisibleColumnsChange={(visibleColumns: StoryboardColumn[]) => {
                                if (!activeScriptNode || !visibleColumns.length) return;
                                setNodes((prev) =>
                                    prev.map((node) =>
                                        node.id === activeScriptNode.id
                                            ? { ...node, metadata: { ...node.metadata, storyboard: { rows: node.metadata?.storyboard?.rows || [], visibleColumns, referenceNodeIds: node.metadata?.storyboard?.referenceNodeIds || [] } } }
                                            : node,
                                    ),
                                );
                            }}
                            onGenerateImages={(rowIds) => activeScriptNode && void generateScriptImages(activeScriptNode.id, rowIds)}
                            onGenerateVideos={(rowIds) => {
                                if (!activeScriptNode) return;
                                if (activeScriptNode.metadata?.storyboardVideoInputMode === "keyframe") void generateScriptVideos(activeScriptNode.id, rowIds);
                                else void createAndGenerateScriptVideos(activeScriptNode.id, rowIds);
                            }}
                            onVideoInputModeChange={(storyboardVideoInputMode) => activeScriptNode && handleConfigNodeChange(activeScriptNode.id, { storyboardVideoInputMode })}
                        />

                        {directorNodeId && activeDirectorScene ? (
                            <Suspense
                                fallback={
                                    <div className="fixed inset-0 z-[var(--z-toast)] grid place-items-center px-5" style={{ background: theme.canvas.background, color: theme.node.text }}>
                                        <WorkspaceState icon="loading" title="正在加载 3D 导演台" description="准备场景、镜头与空间控制。" />
                                    </div>
                                }
                            >
                                <CanvasDirectorWorkbench
                                    open
                                    scene={activeDirectorScene}
                                    imageNodes={nodes.filter((node) => node.type === CanvasNodeType.Image && Boolean(node.metadata?.content))}
                                    onClose={() => setDirectorNodeId(null)}
                                    onChange={saveDirectorScene}
                                    onApply={applyDirectorOutput}
                                    onDeleteImageNode={(nodeId) => deleteNodes(new Set([nodeId]))}
                                    onFlush={() => flushCanvasStorePersistence()}
                                    onboardingScope={directorOnboardingScope}
                                />
                            </Suspense>
                        ) : null}

                        <CanvasVersionCompareModal
                            open={Boolean(versionCompareRootId)}
                            versions={versionCompareNodes}
                            onClose={() => setVersionCompareRootId(null)}
                            onSetPrimary={setPrimaryVersion}
                            onFocus={(nodeId) => {
                                setVersionCompareRootId(null);
                                focusCanvasNode(nodeId);
                            }}
                        />

                        <CanvasProjectMediaDialogs
                            cropNode={cropNode}
                            annotationNode={annotationNode}
                            annotationEditNode={annotationEditNodeId ? nodeById.get(annotationEditNodeId) || null : null}
                            maskEditNode={maskEditNode}
                            imageEditNode={imageEditNode}
                            layerDecompositionNode={layerDecompositionNodeId ? nodeById.get(layerDecompositionNodeId) || null : null}
                            textEditNode={textEditNodeId ? nodeById.get(textEditNodeId) || null : null}
                            imageEditPreset={imageEditPreset}
                            upscaleNode={upscaleNode}
                            onCloseCrop={() => setCropNodeId(null)}
                            onCloseAnnotation={() => setAnnotationNodeId(null)}
                            onCloseAnnotationEdit={() => setAnnotationEditNodeId(null)}
                            onCloseMaskEdit={() => setMaskEditNodeId(null)}
                            onCloseImageEdit={() => { setImageEditNodeId(null); setImageEditPreset(null); }}
                            onCloseLayerDecomposition={() => setLayerDecompositionNodeId(null)}
                            onCloseTextEdit={() => setTextEditNodeId(null)}
                            onCloseUpscale={() => setUpscaleNodeId(null)}
                            onCrop={(node, crop) => void cropImageNode(node, crop)}
                            onAnnotate={(node, dataUrl) => void saveAnnotatedImageNode(node, dataUrl)}
                            onAnnotationEdit={(node, payload) => void editAnnotatedImageNode(node, payload)}
                            onMaskEdit={(node, payload) => void maskEditImageNode(node, payload)}
                            onImageOperation={(node, payload) => void editImageNode(node, payload)}
                            onLayerDecomposition={(node, payload) => void decomposeImageLayers(node, payload)}
                            onDetectText={() => {
                                const node = textEditNodeId ? nodeById.get(textEditNodeId) : null;
                                return node ? detectImageText(node) : Promise.reject(new Error("图片节点已不存在"));
                            }}
                            onTextEdit={(node, payload) => void editTextImageNode(node, payload)}
                            onUpscale={(node, params) => void upscaleImageNode(node, params)}
                            config={effectiveConfig}
                        />

                        <CanvasProjectStatusDialogs
                            theme={theme}
                            task={taskDetail}
                            taskLogs={taskDetailLogs}
                            taskLoading={taskDetailLoading}
                            onCloseTask={() => setTaskDetail(null)}
                            onCancelTask={cancelCanvasTask}
                            superResolveNode={superResolveNode}
                            onCloseSuperResolve={() => setSuperResolveNodeId(null)}
                            previewNode={previewNode}
                            onClosePreview={() => setPreviewNodeId(null)}
                            clearConfirmOpen={clearConfirmOpen}
                            onCancelClear={() => setClearConfirmOpen(false)}
                            onConfirmClear={clearCanvas}
                        />

                        <BatchGenerationSettingsDialog
                            open={batchGenDialogOpen}
                            config={batchGenDialogConfig}
                            rowCount={batchGenDialogRowCount}
                            concurrency={batchGenDialogConcurrency}
                            onClose={closeBatchGenDialog}
                            onConfirm={confirmBatchGenDialog}
                        />

                        {
                            // @opc-feature: canvas-dialogs-lazy-mount [start]
                            assetPickerOpen ? <AssetPickerModal open={assetPickerOpen} multiple={assetInsertScope === "canvas"} onInsert={handleLibraryAssetsInsert} onClose={closeAssetPicker} /> : null
                        }
                        {
                            projectAssetOpen ? (
                                <CanvasProjectAssetModal
                                    open={projectAssetOpen}
                                    detail={linkedProjectQuery.data}
                                    initialCategory={projectAssetInitialCategory}
                                    initialFolderId={projectAssetInitialFolderId}
                                    onClose={closeProjectAssets}
                                    onInsert={handleTimelineProjectAssetsInsert}
                                    onInsertFolder={projectAssetScope === "canvas" ? handleProjectFolderInsert : undefined}
                                />
                            ) : null
                            // @opc-feature: canvas-dialogs-lazy-mount [end]
                        }
                    </section>
                    {versions.preview ? <CanvasVersionPreview key={versions.preview.key} preview={versions.preview} onReturn={versions.returnToCurrent} onShowVersions={versions.show} /> : null}
                    </div>
                </CanvasOverlayLayerProvider>
                <CanvasVersionHistory history={versions} />
            </main>
        </>
    );
}
