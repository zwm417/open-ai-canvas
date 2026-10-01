// @opc-feature: model-smart-router [start]
import { useState, useMemo, useEffect } from "react";
import {
    Input,
    Select,
    Button,
    Switch,
    Tag,
    Badge,
    Segmented,
    Tooltip,
    Modal,
    Popconfirm,
    Dropdown,
    message,
} from "antd";
import { DropdownMenu } from "@/components/ui/base/dropdown-menu";
import {
    Search,
    SlidersHorizontal,
    Settings,
    Layers,
    Server,
    Zap,
    ExternalLink,
    Timer,
    CheckCircle2,
    XCircle,
    Eye,
    EyeOff,
    Plus,
    Split,
    FolderPlus,
    Trash2,
    ChevronDown,
    Wrench,
} from "lucide-react";
import type { FrontendModelItem, CapabilityType, ProtocolType } from "../types";
import { useModelRouterStore } from "../model-router-store";
import { ModelEditModal } from "./model-edit-modal";
import { GroupAssociatedChannelsModal } from "./group-associated-channels-modal";
import { ChannelModelEditor } from "../../components/channel-model-editor";
import { resolveCapability, getAssociatedChannels } from "../model-router-adapter";
import { fetchPluginProviderCatalog } from "@/services/api/plugin-catalog";
import type { ModelProtocolDefinition } from "@/lib/model-protocols";
import type { ChannelModel } from "@/services/api/wallet";
import type { ModelChannel } from "@/stores/use-config-store";
import type { EditorSection } from "../../components/channel-model-editor-form";

export function ModelMatrixGrid() {
    const {
        models,
        families,
        channels,
        channelModels,
        managingChannelId,
        setManagingChannelId,
        loadAllData,
        addFamily,
        addModel,
        deleteModel,
        toggleModelEnabled,
        updateModel,
        testModelConnectivity,
        selectedCapability,
        setSelectedCapability,
        selectedProtocolType,
        setSelectedProtocolType,
        selectedFamily,
        setSelectedFamily,
        searchQuery,
        setSearchQuery,
    } = useModelRouterStore();

    const [editingModel, setEditingModel] = useState<FrontendModelItem | null>(null);
    const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
    const [testingId, setTestingId] = useState<string | null>(null);

    // 模型分组专属关联多渠道模型统一管理弹窗
    const [managingAssociatedChannelsModel, setManagingAssociatedChannelsModel] = useState<FrontendModelItem | null>(null);

    // 原生渠道模型配置编辑器弹窗状态 (实现精准直达编辑)
    const [editingChannelModelTarget, setEditingChannelModelTarget] = useState<{
        channel: ModelChannel;
        model: ChannelModel;
        initialSection?: EditorSection;
    } | null>(null);

    const [protocols, setProtocols] = useState<ModelProtocolDefinition[]>([]);
    const [protocolLoading, setProtocolLoading] = useState(false);
    const [protocolError, setProtocolError] = useState("");

    const loadProtocols = async () => {
        setProtocolLoading(true);
        setProtocolError("");
        try {
            const list = await fetchPluginProviderCatalog("admin.system-channel");
            setProtocols(list || []);
        } catch (err: any) {
            setProtocols([]);
            setProtocolError(err?.message || "无法读取协议目录");
        } finally {
            setProtocolLoading(false);
        }
    };

    useEffect(() => {
        void loadProtocols();
    }, []);

    const handleOpenChannelModelEditor = (channel: ModelChannel, modelKey: string, capability?: CapabilityType) => {
        const existingCM = channelModels.find(
            (cm) => cm.channelId === channel.id && (cm.modelKey === modelKey || cm.providerModelKey === modelKey)
        );
        const effectiveCap = capability || existingCM?.capability || "video";
        const matchingProto = protocols.find(
            (p) => p.capability === effectiveCap && p.enabled !== false
        )?.value;
        const defaultProto = matchingProto || (effectiveCap === "video" ? "newapi" : "openai-image");

        const modelToEdit: ChannelModel = existingCM || {
            id: "",
            channelId: channel.id,
            modelKey,
            providerModelKey: modelKey,
            displayName: modelKey,
            channelLabel: "",
            description: "",
            icon: "",
            capability: effectiveCap,
            protocol: defaultProto as any,
            enabled: true,
            billingMode: effectiveCap === "video" ? "per_second" : "fixed_request",
            unitPriceMicrocredits: 0,
            inputTokenPriceMicrocredits: 0,
            outputTokenPriceMicrocredits: 0,
            cachedTokenPriceMicrocredits: 0,
            priceConfigured: false,
            priceTiers: [],
            priceVersion: 1,
            createdAt: "",
            updatedAt: "",
        };

        setEditingChannelModelTarget({
            channel,
            model: modelToEdit,
        });
    };

    // 新增家族弹窗状态
    const [familyModalOpen, setFamilyModalOpen] = useState(false);
    const [newFamilyInput, setNewFamilyInput] = useState("");

    // 过滤后列表
    const filteredModels = useMemo(() => {
        return models.filter((m) => {
            const itemCap = resolveCapability(m.capability, m.code || m.id);
            if (selectedCapability !== "all" && itemCap !== selectedCapability) {
                return false;
            }
            if (selectedProtocolType !== "all" && m.primaryProtocolType !== selectedProtocolType) {
                return false;
            }
            if (selectedFamily !== "all" && m.family !== selectedFamily) {
                return false;
            }
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchName = m.displayName?.toLowerCase().includes(q) ?? false;
                const matchSub = m.subtitle?.toLowerCase().includes(q) ?? false;
                const matchChannel = m.sourceCard?.channelName?.toLowerCase().includes(q) ?? false;
                const matchFamily = m.family?.toLowerCase().includes(q) ?? false;
                if (!matchName && !matchSub && !matchChannel && !matchFamily) {
                    return false;
                }
            }
            return true;
        });
    }, [models, selectedCapability, selectedProtocolType, selectedFamily, searchQuery]);

    const handleRunQuickTest = async (modelId: string) => {
        setTestingId(modelId);
        try {
            const res = await testModelConnectivity(modelId);
            if (res.status === "healthy") {
                message.success(`连通实测通过！网络延迟: ${res.latencyMs}ms`);
            } else if (res.status === "warning") {
                message.warning(`连通提示：延迟较高 (${res.latencyMs}ms)${res.errorMessage ? ` · ${res.errorMessage}` : ""}`);
            } else {
                message.error(`连通实测未通过：${res.errorMessage || "上游未响应"}`);
            }
        } finally {
            setTestingId(null);
        }
    };

    const handleSaveNewFamily = () => {
        if (!newFamilyInput.trim()) {
            message.warning("请输入家族名称");
            return;
        }
        addFamily(newFamilyInput.trim());
        message.success(`模型家族【${newFamilyInput.trim()}】已创建`);
        setNewFamilyInput("");
        setFamilyModalOpen(false);
    };

    const handleDelete = async (modelId: string, modelName: string) => {
        try {
            await deleteModel(modelId);
            message.success(`已删除前台模型【${modelName}】`);
        } catch (err: any) {
            message.error(`删除失败：${err?.message || "网络异常"}`);
        }
    };

    return (
        <div className="space-y-4">
            {/* 顶层高阶筛选与快捷操作控制台 */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* 能力大类选择 */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">能力分类:</span>
                        <Segmented
                            size="small"
                            value={selectedCapability}
                            onChange={(val) => setSelectedCapability(val as any)}
                            options={[
                                { label: "全部模态", value: "all" },
                                { label: "生视频", value: "video" },
                                { label: "生图片", value: "image" },
                            ]}
                        />
                    </div>

                    {/* 协议类型选择 */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">协议通道:</span>
                        <Segmented
                            size="small"
                            value={selectedProtocolType}
                            onChange={(val) => setSelectedProtocolType(val as any)}
                            options={[
                                { label: "全部", value: "all" },
                                { label: "系统协议", value: "system" },
                                { label: "插件协议", value: "plugin" },
                            ]}
                        />
                    </div>

                    {/* 搜索框 */}
                    <div className="w-64">
                        <Input
                            size="small"
                            prefix={<Search className="size-3.5 text-muted-foreground" />}
                            placeholder="搜索模型名称、家族、代码..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            allowClear
                        />
                    </div>
                </div>

                {/* 第二行：家族选择胶囊条与快速创建 */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-foreground">模型家族:</span>
                        <Select
                            size="small"
                            className="w-44"
                            value={selectedFamily}
                            onChange={setSelectedFamily}
                            options={[
                                { value: "all", label: "全部模型家族" },
                                ...families.map((f) => ({ value: f, label: f })),
                            ]}
                        />
                        <Button
                            size="small"
                            type="dashed"
                            icon={<FolderPlus className="size-3" />}
                            onClick={() => setFamilyModalOpen(true)}
                        >
                            + 新增家族
                        </Button>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                            共 <strong>{filteredModels.length}</strong> 个真实展示模型
                        </span>
                        <Button
                            type="primary"
                            size="small"
                            icon={<Plus className="size-3.5" />}
                            onClick={() => {
                                setEditingModel(null);
                                setIsCreatingNew(true);
                            }}
                        >
                            + 新建展示模型
                        </Button>
                    </div>
                </div>
            </div>

            {/* 模型卡片矩阵展示 */}
            {filteredModels.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-12 text-center bg-card/40 flex flex-col items-center justify-center gap-3">
                    <Layers className="w-10 h-10 text-muted-foreground/40" />
                    <div className="text-sm text-muted-foreground">
                        {models.length === 0
                            ? "当前系统数据库暂无配置的前台展示模型，请新建模型或从渠道导入"
                            : "未检索到匹配的前端模型"}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            type="primary"
                            size="small"
                            icon={<Plus className="size-3.5" />}
                            onClick={() => {
                                setIsCreatingNew(true);
                                setEditingModel(null);
                            }}
                        >
                            新建展示模型
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {filteredModels.map((m) => {
                        const associatedChannels = getAssociatedChannels(m, channels);

                        return (
                        <div
                            key={m.id}
                            className={`rounded-xl border p-3.5 shadow-sm transition-all duration-200 flex flex-col justify-between ${
                                m.enabled
                                    ? "bg-card border-border hover:border-primary/50 hover:shadow-md"
                                    : "bg-muted/10 border-border/50 opacity-65"
                            }`}
                        >
                            <div>
                                {/* 卡片头部：状态开关与徽标 */}
                                <div className="flex items-center justify-between border-b border-border/60 pb-2 mb-2.5">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <Tag color="cyan" className="rounded-full text-[10px] m-0">
                                            {m.family}
                                        </Tag>
                                        {(() => {
                                            const cap = resolveCapability(m.capability, m.code || m.id);
                                            return (
                                                <Tag
                                                    color={cap === "video" ? "purple" : cap === "image" ? "cyan" : "default"}
                                                    className="rounded-full text-[10px] m-0 font-medium"
                                                >
                                                    {cap === "video" ? "生视频" : cap === "image" ? "生图片" : "纯文本"}
                                                </Tag>
                                            );
                                        })()}
                                        <Tag
                                            color={m.primaryProtocolType === "system" ? "blue" : "purple"}
                                            className="rounded-full text-[10px] m-0"
                                        >
                                            {m.primaryProtocolType === "system" ? "系统" : "插件"}
                                        </Tag>
                                        {m.candidateUpstreams && m.candidateUpstreams.length > 0 && (
                                            <Tag color="green" className="rounded-full text-[10px] m-0">
                                                {m.candidateUpstreams.length} 条供应线路
                                            </Tag>
                                        )}
                                        {(() => {
                                            const has4K = m.candidateUpstreams?.some((c) => c.supportedParameters?.includes("res_4k"));
                                            const has2K = m.candidateUpstreams?.some((c) => c.supportedParameters?.includes("res_2k"));
                                            if (has4K) {
                                                return (
                                                    <Tag color="gold" className="rounded-full text-[10px] m-0 font-bold border-amber-400">
                                                        ⚡ 4K 超清
                                                    </Tag>
                                                );
                                            }
                                            if (has2K) {
                                                return (
                                                    <Tag color="blue" className="rounded-full text-[10px] m-0 font-medium">
                                                        2K 高清
                                                    </Tag>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                        <Tooltip title={m.enabled ? "点击停用（前端将隐藏）" : "点击启用（前端将呈现）"}>
                                            <Switch
                                                size="small"
                                                checked={m.enabled}
                                                onChange={(checked) => {
                                                    void toggleModelEnabled(m.id, checked).catch((err: any) => {
                                                        message.error(`状态切换失败：${err?.message || "服务端错误"}`);
                                                    });
                                                }}
                                            />
                                        </Tooltip>
                                        <span className="text-xs font-semibold">
                                            {m.enabled ? (
                                                <span className="text-emerald-500 flex items-center gap-0.5">
                                                    <Eye className="size-3" /> 开启
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground flex items-center gap-0.5">
                                                    <EyeOff className="size-3" /> 关闭
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                </div>

                                {/* 模型主标识与副标题 */}
                                <div className="mb-2">
                                    <div className="flex items-center gap-1.5">
                                        <h3 className="font-bold text-sm text-foreground hover:text-primary transition-colors">
                                            {m.displayName}
                                        </h3>
                                        <code className="text-[11px] font-mono text-muted-foreground bg-muted/60 px-1 py-0.2 rounded">
                                            {m.id}
                                        </code>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                        {m.subtitle || "全模态高保真创作中枢"}
                                    </p>
                                </div>

                                {/* P1 主力来源卡片小视图 */}
                                <div className="rounded-lg bg-muted/30 border border-border/70 p-2 text-xs space-y-1 mb-2.5">
                                    <div className="flex items-center justify-between text-muted-foreground">
                                        <span className="text-[11px] flex items-center gap-1">
                                            <Server className="size-3 text-primary" /> 主渠道:
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-semibold text-foreground">
                                                {m.sourceCard.channelName || "系统默认"}
                                            </span>
                                            {associatedChannels.length > 1 && (
                                                <DropdownMenu
                                                    placement="bottom start"
                                                    trigger={
                                                        <Tag color="geekblue" className="text-[10px] cursor-pointer hover:opacity-80 m-0 px-1 py-0 flex items-center gap-0.5">
                                                            +{associatedChannels.length - 1}个来源 <ChevronDown className="size-2.5" />
                                                        </Tag>
                                                    }
                                                    items={associatedChannels.map((ac) => ({
                                                        key: ac.channelId,
                                                        label: (
                                                            <div className="flex items-center justify-between gap-3 text-xs py-0.5 min-w-[190px]">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="font-medium text-foreground">{ac.channelName}</span>
                                                                    {ac.isPrimary && <Tag color="blue" className="text-[10px] m-0 px-1 py-0">P1</Tag>}
                                                                </div>
                                                                <span className="text-muted-foreground font-mono text-[11px] truncate max-w-[120px]">
                                                                    {ac.upstreamModels[0] || ""}
                                                                </span>
                                                            </div>
                                                        ),
                                                        onClick: () => setManagingChannelId(ac.channelId),
                                                    }))}
                                                    ariaLabel="查看关联来源"
                                                />
                                            )}
                                            {m.sourceCard.channelId && (
                                                <Button
                                                    type="link"
                                                    size="small"
                                                    className="text-[10px] p-0 h-auto flex items-center gap-0.5 text-primary hover:underline"
                                                    onClick={() => setManagingChannelId(m.sourceCard.channelId)}
                                                    title={`直达主渠道【${m.sourceCard.channelName || "主力渠道"}】全量模型库`}
                                                >
                                                    主渠道管理 <ExternalLink className="size-2.5" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between text-muted-foreground font-mono">
                                        <span className="text-[11px]">上游代码:</span>
                                        <span className="text-primary truncate max-w-[170px]" title={m.sourceCard.upstreamModelId}>
                                            {m.sourceCard.upstreamModelId || "未指定"}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between pt-0.5">
                                        <span className="text-[10px] text-muted-foreground">连通状态:</span>
                                        <div className="flex items-center gap-1">
                                            {m.sourceCard.status === "healthy" && (
                                                <span className="text-emerald-500 flex items-center gap-0.5 text-[11px]">
                                                    <CheckCircle2 className="size-3" /> 正常 ({m.sourceCard.lastLatencyMs || 20}ms)
                                                </span>
                                            )}
                                            {m.sourceCard.status === "warning" && (
                                                <span className="text-amber-500 flex items-center gap-0.5 text-[11px]">
                                                    ⚠️ 延迟偏高 ({m.sourceCard.lastLatencyMs}ms)
                                                </span>
                                            )}
                                            {m.sourceCard.status === "error" && (
                                                <span className="text-red-500 flex items-center gap-0.5 text-[11px]">
                                                    <XCircle className="size-3" /> 连通异常
                                                </span>
                                            )}
                                            {(!m.sourceCard.status || m.sourceCard.status === "untested") && (
                                                <span className="text-muted-foreground text-[11px]">未实测</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* 候选池与支持参数指示 */}
                                <div className="space-y-1 mb-2">
                                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                        <span>候选物理路线 ({m.candidateUpstreams?.length || 0}条):</span>
                                        <span className="font-mono text-primary">
                                            {m.candidateUpstreams?.filter((c) => c.enabled).length || 0} 启用
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1 max-h-12 overflow-hidden">
                                        {m.candidateUpstreams && m.candidateUpstreams.length > 0 ? (
                                            m.candidateUpstreams.map((cand) => (
                                                <Tooltip
                                                    key={cand.id}
                                                    title={
                                                        cand.channelId
                                                            ? `点击配置【${cand.channelName || "该渠道"}】渠道模型 (${cand.upstreamModelId})`
                                                            : `${cand.channelName} · ${cand.upstreamModelId}`
                                                    }
                                                >
                                                    <Tag
                                                        color={cand.enabled ? "blue" : "default"}
                                                        className={`text-[10px] m-0 px-1.5 py-0 flex items-center gap-0.5 ${
                                                            cand.channelId
                                                                ? "cursor-pointer hover:border-primary hover:text-primary transition-colors select-none"
                                                                : ""
                                                        }`}
                                                        onClick={(e) => {
                                                            if (cand.channelId) {
                                                                e.stopPropagation();
                                                                const targetCh = channels.find((c) => c.id === cand.channelId);
                                                                if (targetCh && cand.upstreamModelId) {
                                                                    handleOpenChannelModelEditor(targetCh, cand.upstreamModelId, m.capability);
                                                                } else {
                                                                    setManagingChannelId(cand.channelId);
                                                                }
                                                            }
                                                        }}
                                                    >
                                                        <span>{cand.channelName} · {cand.upstreamModelId}</span>
                                                        {cand.channelId && <ExternalLink className="size-2.5 opacity-50 ml-0.5" />}
                                                    </Tag>
                                                </Tooltip>
                                            ))
                                        ) : (
                                            <span className="text-[11px] text-muted-foreground">暂无绑定供应线路</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* 卡片底部操作栏 */}
                            <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2 mt-2">
                                <div className="text-xs">
                                    <span className="text-muted-foreground text-[11px]">价格: </span>
                                    <span className="font-semibold text-foreground font-mono">
                                        {m.billing.unit === "second"
                                            ? `${m.billing.tiers[0]?.userPrice || m.billing.defaultPrice} 元/秒`
                                            : `${m.billing.defaultPrice} 元/次`}
                                    </span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    {(() => {
                                        if (associatedChannels.length > 1) {
                                            return (
                                                <DropdownMenu
                                                    placement="bottom start"
                                                    trigger={
                                                        <Button
                                                            size="small"
                                                            type="default"
                                                            className="text-xs flex items-center gap-1 border-primary/50 text-primary font-medium bg-primary/5 hover:bg-primary/10"
                                                            icon={<ExternalLink className="size-3" />}
                                                            title="该模型分组包含多个渠道来源，点击全景管理全部关联渠道模型，或通过下拉菜单直达配置"
                                                        >
                                                            <span>关联渠道模型 ({associatedChannels.length})</span>
                                                            <ChevronDown className="size-3 opacity-70" />
                                                        </Button>
                                                    }
                                                    items={[
                                                        ...associatedChannels.map((ac) => {
                                                            const targetChannel = channels.find((c) => c.id === ac.channelId);
                                                            const modelCode = ac.primaryUpstreamModel || ac.upstreamModels[0] || "";
                                                            return {
                                                                key: ac.channelId,
                                                                label: (
                                                                    <div className="flex flex-col py-1 min-w-[220px]">
                                                                        <div className="flex items-center justify-between gap-2">
                                                                            <span className="font-semibold text-foreground text-xs">
                                                                                {ac.channelName}
                                                                            </span>
                                                                            {ac.isPrimary ? (
                                                                                <Tag color="blue" className="text-[10px] m-0 px-1 py-0 font-medium">P1 主渠道</Tag>
                                                                            ) : (
                                                                                <Tag color="purple" className="text-[10px] m-0 px-1 py-0 font-medium">候选/备用</Tag>
                                                                            )}
                                                                        </div>
                                                                        {modelCode && (
                                                                            <span className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                                                                                上游模型: {modelCode}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                ),
                                                                onClick: () => {
                                                                    if (targetChannel && modelCode) {
                                                                        handleOpenChannelModelEditor(targetChannel, modelCode, m.capability);
                                                                    } else {
                                                                        setManagingChannelId(ac.channelId);
                                                                    }
                                                                },
                                                            };
                                                        }),
                                                        {
                                                            key: "divider-1",
                                                            divider: true,
                                                        },
                                                        {
                                                            key: "manage-all-associated",
                                                            label: (
                                                                <div className="flex items-center gap-1.5 py-0.5 text-xs text-primary font-medium">
                                                                    <Server className="size-3.5" />
                                                                    <span>综合管理全部 {associatedChannels.length} 个渠道来源...</span>
                                                                </div>
                                                            ),
                                                            onClick: () => setManagingAssociatedChannelsModel(m),
                                                        },
                                                    ]}
                                                    ariaLabel="关联渠道模型管理"
                                                />
                                            );
                                        }

                                        if (associatedChannels.length === 1) {
                                            const singleCh = associatedChannels[0];
                                            const targetChannel = channels.find((c) => c.id === singleCh.channelId);
                                            const targetModelKey = singleCh.primaryUpstreamModel || singleCh.upstreamModels[0] || "";

                                            return (
                                                <Button
                                                    size="small"
                                                    type="default"
                                                    className="text-xs flex items-center gap-1 border-primary/40 text-primary"
                                                    icon={<ExternalLink className="size-3" />}
                                                    onClick={() => {
                                                        if (targetChannel && targetModelKey) {
                                                            handleOpenChannelModelEditor(targetChannel, targetModelKey, m.capability);
                                                        } else {
                                                            setManagingChannelId(singleCh.channelId);
                                                        }
                                                    }}
                                                    title={`配置【${singleCh.channelName}】渠道模型 (${targetModelKey})`}
                                                >
                                                    <span>渠道模型 · {singleCh.channelName}</span>
                                                </Button>
                                            );
                                        }

                                        return (
                                            <Tooltip title="当前前台模型尚未关联任何物理渠道路线，请点击【配置】添加上游候选">
                                                <Button
                                                    size="small"
                                                    disabled
                                                    type="dashed"
                                                    className="text-xs flex items-center gap-1 text-muted-foreground/60"
                                                >
                                                    未关联渠道模型
                                                </Button>
                                            </Tooltip>
                                        );
                                    })()}
                                    <Button
                                        size="small"
                                        type="text"
                                        className="text-xs"
                                        loading={testingId === m.id}
                                        onClick={() => handleRunQuickTest(m.id)}
                                    >
                                        实测
                                    </Button>
                                    <Button
                                        size="small"
                                        type="primary"
                                        icon={<Settings className="size-3" />}
                                        onClick={() => {
                                            setIsCreatingNew(false);
                                            setEditingModel(m);
                                        }}
                                    >
                                        配置
                                    </Button>
                                    <Popconfirm
                                        title={`确认删除模型【${m.displayName}】吗？`}
                                        description="删除后将从数据库彻底移除该前台展示模型，不可恢复。"
                                        onConfirm={() => handleDelete(m.id, m.displayName)}
                                        okText="确认删除"
                                        cancelText="取消"
                                    >
                                        <Button
                                            size="small"
                                            danger
                                            type="text"
                                            icon={<Trash2 className="size-3" />}
                                        />
                                    </Popconfirm>
                                </div>
                            </div>
                        </div>
                    );
                })}
                </div>
            )}

            {/* 编辑或新建模型弹窗 */}
            {(editingModel || isCreatingNew) && (
                <ModelEditModal
                    visible={Boolean(editingModel || isCreatingNew)}
                    model={editingModel}
                    isNew={isCreatingNew}
                    onClose={() => {
                        setEditingModel(null);
                        setIsCreatingNew(false);
                    }}
                    onSave={async (updated) => {
                        try {
                            if (isCreatingNew) {
                                await addModel(updated);
                                message.success(`展示模型【${updated.displayName}】已成功落库创建！`);
                            } else {
                                await updateModel(updated);
                                message.success(`展示模型【${updated.displayName}】配置已成功保存！`);
                            }
                            setEditingModel(null);
                            setIsCreatingNew(false);
                        } catch (err: any) {
                            message.error(`保存失败：${err?.message || "服务端错误"}`);
                        }
                    }}
                />
            )}

            {/* 模型分组专属关联多渠道模型统一管理弹窗 */}
            <GroupAssociatedChannelsModal
                visible={Boolean(managingAssociatedChannelsModel)}
                model={managingAssociatedChannelsModel}
                onClose={() => setManagingAssociatedChannelsModel(null)}
                onConfigureChannelModel={(channel, modelKey) => {
                    handleOpenChannelModelEditor(channel, modelKey, managingAssociatedChannelsModel?.capability);
                }}
                onOpenChannelManager={(channelId) => {
                    setManagingAssociatedChannelsModel(null);
                    setManagingChannelId(channelId);
                }}
            />

            {/* 原生渠道模型配置编辑器弹窗 (支持在卡片上直接就地打开配置) */}
            {editingChannelModelTarget && (
                <ChannelModelEditor
                    channel={editingChannelModelTarget.channel}
                    editing={editingChannelModelTarget.model}
                    protocols={protocols}
                    protocolLoading={protocolLoading}
                    protocolError={protocolError}
                    onRetryProtocols={loadProtocols}
                    onClose={() => setEditingChannelModelTarget(null)}
                    onSaved={async () => {
                        message.success("系统原生渠道模型配置已成功保存！");
                        setEditingChannelModelTarget(null);
                        await loadAllData();
                    }}
                    initialSection={editingChannelModelTarget.initialSection}
                />
            )}

            {/* 新增家族弹窗 */}
            <Modal
                open={familyModalOpen}
                onCancel={() => setFamilyModalOpen(false)}
                title="新增模型家族分类"
                footer={[
                    <Button key="cancel" onClick={() => setFamilyModalOpen(false)}>
                        取消
                    </Button>,
                    <Button key="ok" type="primary" onClick={handleSaveNewFamily}>
                        创建家族
                    </Button>,
                ]}
            >
                <div className="space-y-2 py-3 text-xs">
                    <label className="font-semibold text-foreground block">输入新模型家族名称：</label>
                    <Input
                        placeholder="例如：快手可灵 Kling、Sora 2.0、FLUX 家族"
                        value={newFamilyInput}
                        onChange={(e) => setNewFamilyInput(e.target.value)}
                    />
                    <p className="text-muted-foreground text-[11px]">
                        创建后将自动加入家族选择下拉菜单与顶部全局筛选器中。
                    </p>
                </div>
            </Modal>

        </div>
    );
}
// @opc-feature: model-smart-router [end]
