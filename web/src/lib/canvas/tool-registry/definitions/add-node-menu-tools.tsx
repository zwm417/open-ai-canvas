// @opc-feature: video-reverse-create-import [start]
import { VIDEO_REVERSE_NODE_TYPE, VIDEO_REVERSE_PLUGIN_ID } from "@/extensions/opc-infinite/services/video-reverse-contracts";
// @opc-feature: video-reverse-create-import [end]
// @opc-feature: creation-assistant-menu-import [start]
import {
    CREATION_ASSISTANT_ANALYSIS_NODE_TYPE,
    CREATION_ASSISTANT_ANALYSIS_PLUGIN_ID,
    CREATION_ASSISTANT_SCRIPT_NODE_TYPE,
    CREATION_ASSISTANT_SCRIPT_PLUGIN_ID,
    CREATION_ASSISTANT_REF_SCRIPT_NODE_TYPE,
    CREATION_ASSISTANT_REF_SCRIPT_PLUGIN_ID,
} from "@/extensions/opc-infinite/services/creation-assistant-contracts";
// @opc-feature: creation-assistant-menu-import [end]
// @opc-feature: creative-asset-table-create-import [start]
import { CREATIVE_ASSET_TABLE_NODE_TYPE } from "@/extensions/creative-asset-table/contracts";
// @opc-feature: creative-asset-table-create-import [end]
// @opc-feature: creative-voice-table-create-import [start]
import { CREATIVE_VOICE_TABLE_NODE_TYPE } from "@/extensions/creative-voice-table/contracts";
// @opc-feature: creative-voice-table-create-import [end]
// @opc-feature: creative-storyboard-table-create-import [start]
import { CREATIVE_STORYBOARD_TABLE_NODE_TYPE } from "@/extensions/creative-storyboard-table/contracts";
// @opc-feature: creative-storyboard-table-create-import [end]
import { Folder, FolderOpen, Layers3, Mic, Palette, Sparkles, Table2, UploadCloud, UserRound, Workflow } from "lucide-react";


import { getNodeIcon, getNodeLabel } from "@/lib/canvas/node-registry";
import { registerAddNodeMenuCommands, type AddNodeMenuCommand } from "@/lib/canvas/tool-registry";
import { CanvasNodeType } from "@/types/canvas";

/** 真正创建节点的命令，文案与图标统一取自节点注册表。 */
function nodeCommand(type: CanvasNodeType, rest: Omit<AddNodeMenuCommand, "id" | "label" | "icon" | "section"> & { label?: string }): AddNodeMenuCommand {
    return { id: type, label: rest.label ?? getNodeLabel(type), icon: getNodeIcon(type), section: "node", ...rest };
}

export const addNodeMenuCommands: AddNodeMenuCommand[] = [
    // 项目级动作不占用节点网格，创作节点保持统一排列。
    { id: "style", label: "项目画风", icon: <Palette />, section: "project", defaultOrder: 10, applicable: (ctx) => !ctx.isProjectLinked, run: (ctx) => ctx.handlers.onChooseStyle() },
    // 创作节点
    nodeCommand(CanvasNodeType.Text, { defaultOrder: 10, run: (ctx) => ctx.handlers.onAddText() }),
    nodeCommand(CanvasNodeType.Drawing, { defaultOrder: 20, run: (ctx) => ctx.handlers.onAddDrawing() }),
    nodeCommand(CanvasNodeType.Script, { badge: "核心", defaultOrder: 30, run: (ctx) => ctx.handlers.onAddScript() }),
    nodeCommand(CanvasNodeType.Frame, { defaultOrder: 40, applicable: (ctx) => ctx.workspaceMode !== "simple", run: (ctx) => ctx.handlers.onAddFrame() }),
    { id: "folder", label: "文件夹", icon: <Folder />, badge: "6 款", section: "node", defaultOrder: 45, run: (ctx) => ctx.handlers.onAddFolder() },
    nodeCommand(CanvasNodeType.Image, { defaultOrder: 50, run: (ctx) => ctx.handlers.onAddImage() }),
    nodeCommand(CanvasNodeType.Video, { defaultOrder: 60, run: (ctx) => ctx.handlers.onAddVideo() }),
    // @opc-feature: creative-asset-table-create-menu [start]
    {
        id: CREATIVE_ASSET_TABLE_NODE_TYPE,
        label: "创意资产表",
        icon: <Layers3 />,
        badge: "资产",
        section: "node",
        defaultOrder: 66,
        run: (ctx) => ctx.handlers.onAddExtensionNode(CREATIVE_ASSET_TABLE_NODE_TYPE),
    },
    // @opc-feature: creative-asset-table-create-menu [end]
    // @opc-feature: creative-voice-table-create-menu [start]
    {
        id: CREATIVE_VOICE_TABLE_NODE_TYPE,
        label: "创意配音",
        icon: <Mic />,
        badge: "配音",
        section: "node",
        defaultOrder: 66.3,
        run: (ctx) => ctx.handlers.onAddExtensionNode(CREATIVE_VOICE_TABLE_NODE_TYPE),
    },
    // @opc-feature: creative-voice-table-create-menu [end]
    // @opc-feature: creative-storyboard-table-create-menu [start]
    {
        id: CREATIVE_STORYBOARD_TABLE_NODE_TYPE,
        label: "创意分镜表",
        icon: <Table2 />,
        badge: "分镜",
        section: "node",
        defaultOrder: 66.6,
        run: (ctx) => ctx.handlers.onAddExtensionNode(CREATIVE_STORYBOARD_TABLE_NODE_TYPE),
    },
    // @opc-feature: creative-storyboard-table-create-menu [end]
    nodeCommand(CanvasNodeType.MediaConversion, { badge: "本地", defaultOrder: 65, run: (ctx) => ctx.handlers.onAddExtensionNode(CanvasNodeType.MediaConversion) }),

    // @opc-feature: video-reverse-create-menu [start]
    {
        id: VIDEO_REVERSE_NODE_TYPE,
        label: "视频反推",
        icon: <Sparkles />,
        badge: "AI",
        section: "node",
        defaultOrder: 67,
        applicable: (ctx) => !ctx.enabledPluginIds || ctx.enabledPluginIds.has(VIDEO_REVERSE_PLUGIN_ID),
        run: (ctx) => ctx.handlers.onAddExtensionNode(VIDEO_REVERSE_NODE_TYPE),
    },
    // @opc-feature: video-reverse-create-menu [end]
    // @opc-feature: creation-assistant-create-menu [start]
    {
        id: CREATION_ASSISTANT_ANALYSIS_NODE_TYPE,
        label: "素材分析",
        icon: <Sparkles />,
        badge: "AI",
        section: "node",
        defaultOrder: 68,
        applicable: (ctx) => !ctx.enabledPluginIds || ctx.enabledPluginIds.has(CREATION_ASSISTANT_ANALYSIS_PLUGIN_ID),
        run: (ctx) => ctx.handlers.onAddExtensionNode(CREATION_ASSISTANT_ANALYSIS_NODE_TYPE),
    },
    {
        id: CREATION_ASSISTANT_SCRIPT_NODE_TYPE,
        label: "配置生成脚本",
        icon: <Sparkles />,
        badge: "AI",
        section: "node",
        defaultOrder: 69,
        applicable: (ctx) => !ctx.enabledPluginIds || ctx.enabledPluginIds.has(CREATION_ASSISTANT_SCRIPT_PLUGIN_ID),
        run: (ctx) => ctx.handlers.onAddExtensionNode(CREATION_ASSISTANT_SCRIPT_NODE_TYPE),
    },
    {
        id: CREATION_ASSISTANT_REF_SCRIPT_NODE_TYPE,
        label: "参考生脚本",
        icon: <Sparkles />,
        badge: "AI",
        section: "node",
        defaultOrder: 70,
        applicable: (ctx) => !ctx.enabledPluginIds || ctx.enabledPluginIds.has(CREATION_ASSISTANT_REF_SCRIPT_PLUGIN_ID),
        run: (ctx) => ctx.handlers.onAddExtensionNode(CREATION_ASSISTANT_REF_SCRIPT_NODE_TYPE),
    },
    // @opc-feature: creation-assistant-create-menu [end]
    // 导演台落在节点分区，但它开的是导演工作台、不是某种画布节点，故不走注册表。
    { id: "director", label: "导演台", icon: <Layers3 />, badge: "3D", section: "node", defaultOrder: 70, applicable: (ctx) => ctx.workspaceMode !== "simple", run: (ctx) => ctx.handlers.onOpenDirector() },
    nodeCommand(CanvasNodeType.Audio, { defaultOrder: 80, applicable: (ctx) => ctx.workspaceMode !== "simple", run: (ctx) => ctx.handlers.onAddAudio() }),
    // 云端和本地工作流共用独立配置节点，不进入基础模型节点的渠道选择。
    { id: "workflow", label: "工作流", icon: <Workflow />, section: "workflow", defaultOrder: 10, applicable: (ctx) => ctx.workspaceMode !== "simple", run: (ctx) => ctx.handlers.onAddWorkflow() },
    // 导入资源
    { id: "upload", label: "上传文件", icon: <UploadCloud />, section: "resource", defaultOrder: 10, run: (ctx) => ctx.handlers.onUpload() },
    { id: "project-character", label: "添加角色卡", icon: <UserRound />, section: "resource", defaultOrder: 20, applicable: (ctx) => ctx.isProjectLinked, run: (ctx) => ctx.handlers.onOpenProjectCharacters() },
    { id: "assets", label: "素材库", icon: <FolderOpen />, section: "resource", defaultOrder: 30, applicable: (ctx) => !ctx.isProjectLinked, run: (ctx) => ctx.handlers.onOpenMyAssets() },
];

registerAddNodeMenuCommands(addNodeMenuCommands);
