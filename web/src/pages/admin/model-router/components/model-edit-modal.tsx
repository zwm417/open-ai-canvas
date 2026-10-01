// @opc-feature: model-smart-router [start]
import { useState, useEffect, useMemo } from "react";
import {
    Modal,
    Tabs,
    Input,
    Radio,
    Select,
    Checkbox,
    Switch,
    Button,
    Tag,
    InputNumber,
    Segmented,
    Tooltip,
    message,
    Popconfirm,
} from "antd";
import {
    Layers,
    Sliders,
    Coins,
    TrendingUp,
    CheckCircle2,
    Plus,
    Trash2,
    Server,
    Sparkles,
    Copy,
    Code,
} from "lucide-react";
import type {
    FrontendModelItem,
    ResolutionBillingTier,
    BillingSurchargeItem,
    ProtocolType,
    BillingUnit,
    UpstreamCandidateModel,
    PluginProtocolItem,
} from "../types";
import { ModelSourceCardView } from "./model-source-card";
import { ParameterCanvasAndRoutingPanel } from "./parameter-canvas-and-routing";
import { useModelRouterStore } from "../model-router-store";
import { standardVideoBillingTiers, DEFAULT_VIDEO_SURCHARGES, getApplicableParametersForModel } from "../mock-data";

interface ModelEditModalProps {
    visible: boolean;
    model: FrontendModelItem | null;
    isNew?: boolean;
    onClose: () => void;
    onSave: (model: FrontendModelItem) => void;
}

export function ModelEditModal({ visible, model, isNew = false, onClose, onSave }: ModelEditModalProps) {
    if (!visible) return null;

    const { plugins, addPlugin, channels } = useModelRouterStore();

    const PARAM_OPTIONS = [
        { value: "none", label: "无 (基础画面)" },
        { value: "audio_generation", label: "生成声音 (+音频伴生)" },
        { value: "audio_lip_sync", label: "音频对口型" },
        { value: "multi_ref", label: "多图参考" },
        { value: "first_last_frame", label: "首尾帧" },
        { value: "omni_ref", label: "全能参考" },
        { value: "max_duration", label: "达到最大秒数" },
        { value: "video_continuation", label: "视频续写" },
        { value: "video_editing", label: "视频编辑" },
    ];

    // 默认空模型模板（动态基于系统真实渠道）
    const createEmptyModel = (): FrontendModelItem => {
        const firstCh = channels[0];
        const chId = firstCh?.id || "default";
        const chName = firstCh?.name || "系统渠道";
        const endpoint = firstCh?.baseUrl || "";

        return {
            id: `model-${Date.now().toString().slice(-6)}`,
            displayName: "新展示模型",
            subtitle: "全模态高保真创作中枢",
            showSubtitle: true,
            capability: "video",
            family: "通用家族",
            group: "生视频",
            enabled: true,
            sortOrder: 99,
            primaryChannelId: chId,
            primaryProtocolType: "system",
            sourceCard: {
                channelId: chId,
                channelName: chName,
                protocolType: "system",
                upstreamModelId: "upstream-model-key",
                endpoint,
                authType: "Bearer Token",
                extractPath: "data.output",
                timeoutSeconds: 300,
                status: "untested",
            },
            fallbackChannels: [],
            candidateUpstreams: [],
            parameterPriorities: {},
            defaultCandidatePriority: [],
            switchMatrix: getApplicableParametersForModel({ capability: "video" } as any),
            conditionalRoutes: [],
            durationSettings: {
                minSeconds: 2,
                maxSeconds: 15,
                isLocked: false,
                lockedSeconds: 5,
                maxDurationRouteEnabled: false,
            },
            durationThresholdRule: {
                enabled: false,
                thresholdSeconds: 30,
                targetChannelId: "",
                targetChannelName: "",
                targetModelId: "",
                unitPrice: 0,
            },
            billing: {
                unit: "second",
                defaultCost: 0,
                defaultRatio: 1.6,
                defaultPrice: 0,
                tiers: standardVideoBillingTiers,
                surcharges: DEFAULT_VIDEO_SURCHARGES,
            },
        };
    };

    const [formState, setFormState] = useState<FrontendModelItem>(() => (model ? JSON.parse(JSON.stringify(model)) : createEmptyModel()));
    const [activeTab, setActiveTab] = useState("routing");

    // 动态计算“其他参数列 (匹配条件)”可选参数：从前面 Tab 1 真实开启的参数中提取 (不包含第一列已有的分辨率)
    const applicableParamOptions = useMemo(() => {
        const baseOptions = [{ value: "none", label: "无 (基础画面 / 默认)" }];
        const switches = formState.switchMatrix && formState.switchMatrix.length > 0
            ? formState.switchMatrix
            : getApplicableParametersForModel(formState);
        
        // 排除分辨率类参数（分辨率已作为表格第一列主基准），仅提取用户开启或系统支持的参数
        const filtered = switches.filter((s) => {
            if (s.category === "resolution" || s.key.startsWith("res_")) return false;
            return s.forcedEnabled !== false || s.channelDefault || s.showInFrontend !== false;
        });

        const paramItems = filtered.map((s) => ({
            value: s.key,
            label: s.label || s.key,
        }));

        return [...baseOptions, ...paramItems];
    }, [formState.switchMatrix, formState.capability]);

    // 动态计算“规格 / 分辨率”下拉选项：生图片 vs 生视频 (支持统一计费选项)
    const resolutionOptions = useMemo(() => {
        const base = formState.capability === "image"
            ? [
                { value: "1k", label: "1K 标清 (1024x1024)" },
                { value: "2k", label: "2K 高清 (2048x2048)" },
                { value: "4k", label: "4K 超清 (4096x4096)" },
                { value: "1024x1024", label: "1024x1024" },
                { value: "2048x2048", label: "2048x2048" },
                { value: "4096x4096", label: "4096x4096" },
            ]
            : [
                { value: "480p", label: "480P" },
                { value: "720p", label: "720P" },
                { value: "1080p", label: "1080P" },
                { value: "768p", label: "768P" },
                { value: "2k", label: "2K" },
                { value: "4k", label: "4K" },
            ];
        return [{ value: "unified", label: "统一计费" }, ...base];
    }, [formState.capability]);

    // 来源卡片选择的组内具体上游模型 ID
    const [selectedCandidateId, setSelectedCandidateId] = useState<string>(() => {
        return formState.candidateUpstreams?.[0]?.id || "";
    });

    // 新增叠加费用输入状态
    const [newSurchargeKey, setNewSurchargeKey] = useState("audio_generation");
    const [newSurchargeLabel, setNewSurchargeLabel] = useState("生成声音");
    const [newSurchargeCost, setNewSurchargeCost] = useState(0.01);

    useEffect(() => {
        if (model) {
            const copy = JSON.parse(JSON.stringify(model));
            if (!copy.billing.surcharges) {
                copy.billing.surcharges = copy.capability === "video" ? DEFAULT_VIDEO_SURCHARGES : [];
            }
            if (!copy.billing.pricingMode) {
                copy.billing.pricingMode = copy.billing.tiers && copy.billing.tiers.length > 1 ? "matrix" : "unified";
            }
            setFormState(copy);
            if (copy.candidateUpstreams && copy.candidateUpstreams.length > 0) {
                setSelectedCandidateId(copy.candidateUpstreams[0].id);
            }
        } else {
            setFormState(createEmptyModel());
        }
    }, [model, visible]);

    // 当前选中的组内候选模型
    const currentCandidate = useMemo<UpstreamCandidateModel | undefined>(() => {
        const found = (formState.candidateUpstreams || []).find((c) => c.id === selectedCandidateId);
        return found || formState.candidateUpstreams?.[0];
    }, [formState.candidateUpstreams, selectedCandidateId]);

    // 更新当前选中的候选模型
    const handleUpdateCandidate = (partial: Partial<UpstreamCandidateModel>) => {
        if (!currentCandidate) return;
        const updatedCandidates = (formState.candidateUpstreams || []).map((c) =>
            c.id === currentCandidate.id ? { ...c, ...partial } : c
        );
        // 如果是主力模型，同步更新 sourceCard
        let updatedSourceCard = formState.sourceCard;
        if (currentCandidate.channelId === formState.primaryChannelId) {
            updatedSourceCard = {
                ...formState.sourceCard,
                ...partial,
            };
        }
        setFormState({
            ...formState,
            candidateUpstreams: updatedCandidates,
            sourceCard: updatedSourceCard,
        });
    };

    // 统一计价状态与历史多规格矩阵暂存
    const isUnifiedPricing = formState.billing.pricingMode === "unified" || (formState.billing.tiers.length === 1 && formState.billing.tiers[0]?.resolution === "unified");
    const [savedMatrixTiers, setSavedMatrixTiers] = useState<ResolutionBillingTier[] | null>(null);

    const handleToggleUnifiedPricing = (checked: boolean) => {
        if (checked) {
            const currentTiers = formState.billing.tiers || [];
            if (currentTiers.length > 1 || (currentTiers[0] && currentTiers[0].resolution !== "unified")) {
                setSavedMatrixTiers(JSON.parse(JSON.stringify(currentTiers)));
            }
            const isImage = formState.capability === "image";
            const defaultCost = formState.billing.defaultCost || (isImage ? 0.02 : 0.03);
            const defaultRatio = formState.billing.defaultRatio || 1.8;
            const defaultPrice = formState.billing.defaultPrice || Number((defaultCost * defaultRatio).toFixed(4));

            const unifiedTier: ResolutionBillingTier = {
                id: "tier-unified",
                resolution: "unified",
                upstreamCost: defaultCost,
                matchedParameterKey: "none",
                matchedParameterLabel: "无 (基础画面 / 默认)",
                surchargeCost: 0,
                markupRatio: defaultRatio,
                userPrice: defaultPrice,
            };

            setFormState({
                ...formState,
                billing: {
                    ...formState.billing,
                    pricingMode: "unified",
                    defaultCost,
                    defaultRatio,
                    defaultPrice,
                    tiers: [unifiedTier],
                },
            });
            message.success("已开启统一计价，规格已自动设为“统一计费”，参数列为“无”");
        } else {
            const isImage = formState.capability === "image";
            const defaultImageTiers: ResolutionBillingTier[] = [
                { id: "tier-1k", resolution: "1k", upstreamCost: 0.01, matchedParameterKey: "none", matchedParameterLabel: "无 (基础画面 / 默认)", surchargeCost: 0, markupRatio: 1.8, userPrice: 0.018 },
                { id: "tier-2k", resolution: "2k", upstreamCost: 0.02, matchedParameterKey: "none", matchedParameterLabel: "无 (基础画面 / 默认)", surchargeCost: 0, markupRatio: 1.8, userPrice: 0.036 },
                { id: "tier-4k", resolution: "4k", upstreamCost: 0.04, matchedParameterKey: "none", matchedParameterLabel: "无 (基础画面 / 默认)", surchargeCost: 0, markupRatio: 1.8, userPrice: 0.072 },
            ];
            const restoredTiers = savedMatrixTiers && savedMatrixTiers.length > 0
                ? savedMatrixTiers
                : (isImage ? defaultImageTiers : standardVideoBillingTiers);

            setFormState({
                ...formState,
                billing: {
                    ...formState.billing,
                    pricingMode: "matrix",
                    tiers: JSON.parse(JSON.stringify(restoredTiers)),
                },
            });
            message.info("已关闭统一计价，已恢复为之前的多规格矩阵设置");
        }
    };

    // 规格与参数行联动计算: (上游成本 + 对应叠加费用) * 定价倍率 = 用户价格
    const handleTierChange = (
        index: number,
        field: "resolution" | "cost" | "paramKey" | "surcharge" | "ratio" | "price",
        val: any
    ) => {
        const updated = { ...formState };
        const tiers = [...updated.billing.tiers];
        const tier = { ...tiers[index] };

        if (field === "resolution") {
            tier.resolution = val;
        } else if (field === "cost") {
            tier.upstreamCost = Number(val || 0);
            const surcharge = Number(tier.surchargeCost || 0);
            tier.userPrice = Number(((tier.upstreamCost + surcharge) * tier.markupRatio).toFixed(4));
            if (isUnifiedPricing) {
                updated.billing.defaultCost = tier.upstreamCost;
                updated.billing.defaultPrice = tier.userPrice;
            }
        } else if (field === "paramKey") {
            tier.matchedParameterKey = val;
            const opt = applicableParamOptions.find((p) => p.value === val);
            tier.matchedParameterLabel = opt ? opt.label : val;
            if (val === "none") {
                tier.surchargeCost = 0;
            } else if (!tier.surchargeCost) {
                tier.surchargeCost = formState.capability === "image" ? 0.005 : 0.01;
            }
            const surcharge = Number(tier.surchargeCost || 0);
            tier.userPrice = Number(((tier.upstreamCost + surcharge) * tier.markupRatio).toFixed(4));
        } else if (field === "surcharge") {
            tier.surchargeCost = Number(val || 0);
            tier.userPrice = Number(((tier.upstreamCost + tier.surchargeCost) * tier.markupRatio).toFixed(4));
        } else if (field === "ratio") {
            tier.markupRatio = Number(val || 1);
            const surcharge = Number(tier.surchargeCost || 0);
            tier.userPrice = Number(((tier.upstreamCost + surcharge) * tier.markupRatio).toFixed(4));
            if (isUnifiedPricing) {
                updated.billing.defaultRatio = tier.markupRatio;
                updated.billing.defaultPrice = tier.userPrice;
            }
        } else if (field === "price") {
            tier.userPrice = Number(val || 0);
            const effectiveCost = tier.upstreamCost + Number(tier.surchargeCost || 0);
            tier.markupRatio = effectiveCost > 0 ? Number((tier.userPrice / effectiveCost).toFixed(4)) : 1;
            if (isUnifiedPricing) {
                updated.billing.defaultPrice = tier.userPrice;
                updated.billing.defaultRatio = tier.markupRatio;
            }
        }

        tiers[index] = tier;
        updated.billing.tiers = tiers;
        setFormState(updated);
    };

    const handleAddTierRow = () => {
        const isImage = formState.capability === "image";
        const defaultRes = isImage ? "1k" : "720p";
        const defaultCost = isImage ? 0.02 : 0.03;
        const newTier: ResolutionBillingTier = {
            id: `tier-${Date.now().toString().slice(-4)}`,
            resolution: defaultRes,
            upstreamCost: defaultCost,
            matchedParameterKey: "none",
            matchedParameterLabel: "无 (基础画面 / 默认)",
            surchargeCost: 0,
            markupRatio: 1.8,
            userPrice: Number((defaultCost * 1.8).toFixed(4)),
        };
        setFormState({
            ...formState,
            billing: {
                ...formState.billing,
                tiers: [...formState.billing.tiers, newTier],
            },
        });
        message.success("已新增一条规格计费行");
    };

    const handleDeleteTierRow = (index: number) => {
        if (formState.billing.tiers.length <= 1) {
            message.warning("至少保留一条计费规格行");
            return;
        }
        const tiers = formState.billing.tiers.filter((_, idx) => idx !== index);
        setFormState({
            ...formState,
            billing: {
                ...formState.billing,
                tiers,
            },
        });
        message.success("已删除该规格计费行");
    };

    // 新增插件协议弹窗状态
    const [newPluginModalOpen, setNewPluginModalOpen] = useState(false);
    const [newPluginName, setNewPluginName] = useState("");
    const [newPluginId, setNewPluginId] = useState("");
    const [newPluginDesc, setNewPluginDesc] = useState("");
    const [newPluginBillingRule, setNewPluginBillingRule] = useState<"按秒计费" | "按次计费" | "Token计费">("按秒计费");

    const handleOpenNewPluginModal = () => {
        const chName = currentCandidate?.channelName || "新渠道";
        const chId = (currentCandidate?.channelId || "custom").toLowerCase().replace(/[^a-z0-9]/g, "");
        setNewPluginName(`${chName} 专用协议`);
        setNewPluginId(`plugin-${chId}-${Date.now().toString().slice(-4)}`);
        setNewPluginDesc(`为上游渠道 [${chName}] 提供非标准 JSON 字段双向转换与参数对齐`);
        setNewPluginBillingRule("按秒计费");
        setNewPluginModalOpen(true);
    };

    const handleConfirmCreatePlugin = () => {
        if (!newPluginName.trim()) {
            message.warning("请输入协议名称");
            return;
        }
        const newPlugin: PluginProtocolItem = {
            id: newPluginId.trim() || `plugin-${Date.now().toString().slice(-6)}`,
            name: newPluginName.trim(),
            version: "1.0.0",
            author: "系统管理员",
            capability: formState.capability,
            billingRule: newPluginBillingRule,
            scope: "专项渠道",
            status: true,
            description: newPluginDesc.trim(),
            canAutoRouteBySwitch: true,
        };
        addPlugin(newPlugin);
        handleUpdateCandidate({
            protocolType: "plugin",
            protocolId: newPlugin.id,
        });
        message.success(`已创建新协议【${newPlugin.name}】并与当前模型 1:1 绑定成功！`);
        setNewPluginModalOpen(false);
    };

    const handleSave = () => {
        onSave(formState);
        message.success(`模型【${formState.displayName}】配置已成功保存！`);
        onClose();
    };

    return (
        <Modal
            open={visible}
            onCancel={onClose}
            width={1280}
            style={{ top: 20 }}
            title={
                <div className="flex items-center justify-between pr-8">
                    <div className="flex items-center gap-2.5">
                        <span className="text-base font-bold text-foreground">
                            {isNew ? "新建展示模型与路由配置" : `模型配置 · ${formState.displayName}`}
                        </span>
                        <Tag color={formState.capability === "video" ? "purple" : "cyan"} className="rounded-full px-2 py-0 text-xs font-semibold">
                            {formState.capability === "video" ? "生视频" : "生图片"}
                        </Tag>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">模型唯一标识:</span>
                        <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground font-semibold">{formState.id}</code>
                    </div>
                </div>
            }
            footer={
                <div className="flex items-center justify-between px-2 py-1">
                    <div className="flex items-center gap-2.5">
                        <span className="text-xs font-semibold text-foreground">前台总开关:</span>
                        <Switch
                            size="small"
                            checked={formState.enabled}
                            onChange={(checked) => setFormState({ ...formState, enabled: checked })}
                            checkedChildren="启用"
                            unCheckedChildren="停用"
                        />
                    </div>
                    <div className="flex items-center gap-2.5">
                        <Button size="small" onClick={onClose}>取消</Button>
                        <Button type="primary" size="small" onClick={handleSave}>
                            {isNew ? "创建模型并生效" : "保存全量配置"}
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="max-h-[calc(85vh-120px)] overflow-y-auto px-1 py-1">
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={[
                        // Tab 1: 参数看板与上游模型池
                        {
                            key: "routing",
                            label: (
                                <span className="flex items-center gap-1.5 text-xs font-semibold">
                                    <Sliders className="size-3.5" /> 参数看板与上游模型池
                                </span>
                            ),
                            children: (
                                <ParameterCanvasAndRoutingPanel
                                    model={formState}
                                    onChange={setFormState}
                                />
                            ),
                        },

                        // Tab 2: 模型信息与来源卡片 (组内模型下拉联动 + 协议1对1绑定 + 原上游请求JSON格式)
                        {
                            key: "info",
                            label: (
                                <span className="flex items-center gap-1.5 text-xs font-semibold">
                                    <Layers className="size-3.5" /> 模型来源与协议绑定
                                </span>
                            ),
                            children: (
                                <div className="grid grid-cols-12 gap-5 pt-2">
                                    {/* 左侧：模型基本信息与上游具体模型选择 */}
                                    <div className="col-span-7 space-y-4">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-xs font-semibold text-foreground mb-1 block">模型唯一 ID</label>
                                                <Input
                                                    size="small"
                                                    disabled={!isNew}
                                                    value={formState.id}
                                                    onChange={(e) => setFormState({ ...formState, id: e.target.value })}
                                                    className="font-mono text-xs"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-semibold text-foreground mb-1 block">前台展示名称</label>
                                                <Input
                                                    size="small"
                                                    value={formState.displayName}
                                                    onChange={(e) => setFormState({ ...formState, displayName: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        {/* 副标题 */}
                                        <div className="rounded-lg border border-border bg-muted/10 p-2.5">
                                            <div className="flex items-center justify-between mb-1">
                                                <label className="text-xs font-semibold text-foreground">前台副标题说明</label>
                                                <Checkbox
                                                    checked={formState.showSubtitle}
                                                    onChange={(e) => setFormState({ ...formState, showSubtitle: e.target.checked })}
                                                >
                                                    <span className="text-xs text-muted-foreground">在名称下方展示</span>
                                                </Checkbox>
                                            </div>
                                            <Input
                                                size="small"
                                                maxLength={100}
                                                value={formState.subtitle}
                                                placeholder="面向创作者的简明说明..."
                                                onChange={(e) => setFormState({ ...formState, subtitle: e.target.value })}
                                            />
                                        </div>

                                        {/* 组内上游模型选择下拉框 (Requirement 6) */}
                                        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    <Server className="size-4 text-primary" />
                                                    <span className="text-xs font-bold text-foreground">
                                                        组内上游模型选择与协议联动
                                                    </span>
                                                </div>
                                                <Select
                                                    size="small"
                                                    className="w-64 text-xs font-mono"
                                                    value={selectedCandidateId}
                                                    onChange={setSelectedCandidateId}
                                                    options={(formState.candidateUpstreams || []).map((c) => ({
                                                        value: c.id,
                                                        label: `[${c.channelName}] ${c.upstreamModelId}`,
                                                    }))}
                                                />
                                            </div>

                                            {currentCandidate && (
                                                <div className="space-y-3 text-xs">
                                                    {/* 插件协议绑定 (1对1) */}
                                                    <div>
                                                        <div className="flex items-center justify-between mb-1">
                                                            <label className="text-[11px] font-semibold text-muted-foreground block">
                                                                当前上游模型绑定的协议规范 (1 对 1 绑定):
                                                            </label>
                                                            <span className="text-[10px] text-muted-foreground">
                                                                若无合适协议可点击接入并立即一对一绑定
                                                            </span>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1 border border-border/50 rounded-lg bg-card/60">
                                                            <div
                                                                className={`p-2 rounded border cursor-pointer text-xs transition-colors flex items-center justify-between ${
                                                                    currentCandidate.protocolType === "system"
                                                                        ? "border-primary bg-primary/10 text-primary font-semibold"
                                                                        : "border-border/60 hover:bg-muted/40"
                                                                }`}
                                                                onClick={() => handleUpdateCandidate({ protocolType: "system", protocolId: undefined })}
                                                            >
                                                                <span>系统通用协议 (Built-in)</span>
                                                                {currentCandidate.protocolType === "system" && <CheckCircle2 className="size-3.5" />}
                                                            </div>

                                                            {plugins.map((p) => (
                                                                <div
                                                                    key={p.id}
                                                                    className={`p-2 rounded border cursor-pointer text-xs transition-colors flex items-center justify-between ${
                                                                        currentCandidate.protocolType === "plugin" && currentCandidate.protocolId === p.id
                                                                            ? "border-primary bg-primary/10 text-primary font-semibold"
                                                                            : "border-border/60 hover:bg-muted/40"
                                                                    }`}
                                                                    onClick={() => handleUpdateCandidate({ protocolType: "plugin", protocolId: p.id })}
                                                                >
                                                                    <div className="truncate">
                                                                        <Tag color="purple" className="text-[10px] m-0 px-1 py-0">插件</Tag>
                                                                        <span className="ml-1">{p.name}</span>
                                                                    </div>
                                                                    {currentCandidate.protocolType === "plugin" && currentCandidate.protocolId === p.id && (
                                                                        <CheckCircle2 className="size-3.5 shrink-0" />
                                                                    )}
                                                                </div>
                                                            ))}

                                                            <div
                                                                className="p-2 rounded border border-dashed border-primary/50 hover:border-primary cursor-pointer text-xs text-primary flex items-center justify-center gap-1 hover:bg-primary/5 transition-colors"
                                                                onClick={handleOpenNewPluginModal}
                                                            >
                                                                <Plus className="size-3.5" />
                                                                <span>+ 接入新协议 (1:1 绑定)</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* 原上游提供的请求参考格式 JSON */}
                                                    <div>
                                                        <div className="flex items-center justify-between mb-1">
                                                            <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                                                                <Code className="size-3.5 text-primary" />
                                                                原上游请求参考格式 (Sample Request JSON)
                                                            </label>
                                                            <Button
                                                                size="small"
                                                                type="text"
                                                                className="text-[10px] h-5 px-1"
                                                                icon={<Copy className="size-3" />}
                                                                onClick={() => {
                                                                    if (currentCandidate.sampleRequestFormat) {
                                                                        navigator.clipboard.writeText(currentCandidate.sampleRequestFormat);
                                                                        message.success("已复制请求参考格式！");
                                                                    }
                                                                }}
                                                            >
                                                                复制
                                                            </Button>
                                                        </div>
                                                        <Input.TextArea
                                                            rows={6}
                                                            className="font-mono text-[11px] bg-card text-foreground"
                                                            value={currentCandidate.sampleRequestFormat || "{\n  \"model\": \"upstream-model-id\",\n  \"prompt\": \"...\",\n  \"duration\": 5\n}"}
                                                            onChange={(e) => handleUpdateCandidate({ sampleRequestFormat: e.target.value })}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* 右侧：所选模型的来源信息卡片 */}
                                    <div className="col-span-5">
                                        {currentCandidate ? (
                                            <ModelSourceCardView
                                                card={{
                                                    channelId: currentCandidate.channelId,
                                                    channelName: currentCandidate.channelName,
                                                    protocolType: currentCandidate.protocolType,
                                                    protocolId: currentCandidate.protocolId,
                                                    upstreamModelId: currentCandidate.upstreamModelId,
                                                    endpoint: currentCandidate.endpoint,
                                                    authType: currentCandidate.authType,
                                                    extractPath: currentCandidate.extractPath,
                                                    timeoutSeconds: currentCandidate.timeoutSeconds,
                                                    status: currentCandidate.status,
                                                    lastLatencyMs: currentCandidate.lastLatencyMs,
                                                    lastTestedAt: currentCandidate.lastTestedAt,
                                                    errorMessage: currentCandidate.errorMessage,
                                                    sampleRequestFormat: currentCandidate.sampleRequestFormat,
                                                }}
                                                modelId={formState.id}
                                                onChange={(updatedCard) => {
                                                    handleUpdateCandidate({
                                                        channelName: updatedCard.channelName,
                                                        upstreamModelId: updatedCard.upstreamModelId,
                                                        endpoint: updatedCard.endpoint,
                                                        authType: updatedCard.authType,
                                                        extractPath: updatedCard.extractPath,
                                                        timeoutSeconds: updatedCard.timeoutSeconds,
                                                    });
                                                }}
                                            />
                                        ) : (
                                            <div className="p-8 text-center text-xs text-muted-foreground">
                                                请先在左侧选择上游模型
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ),
                        },

                        // Tab 3: 独立计费方式与多规格矩阵 (支持统一计费一口价 vs 多规格矩阵切换)
                        {
                            key: "billing",
                            label: (
                                <span className="flex items-center gap-1.5 text-xs font-semibold">
                                    <Coins className="size-3.5" /> 独立计费与多规格矩阵
                                </span>
                            ),
                            children: (
                                <div className="grid grid-cols-12 gap-5 pt-2">
                                    {/* 左侧：计费配置主区域 */}
                                    <div className="col-span-8 space-y-3.5">
                                        {/* 顶层计费模式与单位切换栏 */}
                                        <div className="flex items-center justify-between rounded-xl border border-border p-2.5 bg-muted/20">
                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-semibold text-foreground">统一计价:</span>
                                                    <Switch
                                                        size="small"
                                                        checked={isUnifiedPricing}
                                                        onChange={handleToggleUnifiedPricing}
                                                        checkedChildren="开启"
                                                        unCheckedChildren="关闭"
                                                    />
                                                </div>

                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-xs font-semibold text-foreground">计费单位:</span>
                                                    <Segmented
                                                        size="small"
                                                        value={formState.billing.unit}
                                                        onChange={(val) =>
                                                            setFormState({
                                                                ...formState,
                                                                billing: {
                                                                    ...formState.billing,
                                                                    unit: val as BillingUnit,
                                                                },
                                                            })
                                                        }
                                                        options={
                                                            formState.capability === "image"
                                                                ? [{ label: "按次计费", value: "count" }]
                                                                : [
                                                                      { label: "按秒计费", value: "second" },
                                                                      { label: "按次计费", value: "count" },
                                                                      { label: "Token 计费", value: "token" },
                                                                  ]
                                                        }
                                                    />
                                                </div>
                                            </div>
                                            <span className="text-[11px] text-muted-foreground">
                                                公式：(上游成本 + 对应叠加费用) × 定价倍率 = 用户最终价格
                                            </span>
                                        </div>

                                        {/* 计费表格容器 (常驻展示) */}
                                        <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
                                            <div className="flex items-center justify-between p-2.5 bg-muted/30 border-b border-border">
                                                <div className="flex items-center gap-2">
                                                    <Coins className="size-4 text-primary" />
                                                    <span className="text-xs font-bold text-foreground">
                                                        {formState.capability === "image" ? "图片分辨率与参数叠加费用矩阵" : "视频分辨率规格与参数叠加费用矩阵"}
                                                    </span>
                                                    {isUnifiedPricing ? (
                                                        <Tag color="purple" className="text-[10px] m-0">
                                                            统一计价生效中
                                                        </Tag>
                                                    ) : (
                                                        <Tag color="blue" className="text-[10px] m-0">
                                                            共 {formState.billing.tiers.length} 条计费规则
                                                        </Tag>
                                                    )}
                                                </div>
                                                {!isUnifiedPricing && (
                                                    <Button
                                                        type="primary"
                                                        size="small"
                                                        icon={<Plus className="size-3" />}
                                                        onClick={handleAddTierRow}
                                                    >
                                                        + 添加规格行
                                                    </Button>
                                                )}
                                            </div>

                                            <div className="overflow-x-auto">
                                                <table className="w-full text-xs text-left">
                                                    <thead className="bg-muted/40 text-muted-foreground border-b border-border text-[11px]">
                                                        <tr>
                                                            <th className="py-2 px-2.5 font-semibold">
                                                                {isUnifiedPricing
                                                                    ? "计费规格"
                                                                    : formState.capability === "image"
                                                                    ? "图片分辨率"
                                                                    : "视频清晰度 / 规格"}
                                                            </th>
                                                            <th className="py-2 px-2.5 font-semibold">上游成本 (¥)</th>
                                                            <th className="py-2 px-2.5 font-semibold">
                                                                其他参数列 (匹配条件)
                                                                <Tooltip title="动态识别前台参数看板中已开启的特性；请求命中时自动执行合并计费">
                                                                    <span className="text-primary ml-1 cursor-pointer">ℹ</span>
                                                                </Tooltip>
                                                            </th>
                                                            <th className="py-2 px-2.5 font-semibold">对应叠加费用 (¥)</th>
                                                            <th className="py-2 px-2.5 font-semibold">定价倍率 (x)</th>
                                                            <th className="py-2 px-2.5 font-semibold">用户最终价格</th>
                                                            <th className="py-2 px-2.5 font-semibold text-center w-12">操作</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-border/60">
                                                        {formState.billing.tiers.map((tier, idx) => (
                                                            <tr
                                                                key={tier.id || `${tier.resolution}-${tier.matchedParameterKey || "none"}-${idx}`}
                                                                className="hover:bg-muted/20 transition-colors"
                                                            >
                                                                {/* 规格 / 分辨率 */}
                                                                <td className="py-1.5 px-2.5">
                                                                    <Select
                                                                        size="small"
                                                                        className="w-32 text-xs font-mono font-bold"
                                                                        value={tier.resolution}
                                                                        disabled={isUnifiedPricing}
                                                                        onChange={(val) => handleTierChange(idx, "resolution", val)}
                                                                        options={resolutionOptions}
                                                                    />
                                                                </td>

                                                                {/* 上游基础成本 */}
                                                                <td className="py-1.5 px-2.5">
                                                                    <InputNumber
                                                                        size="small"
                                                                        className="w-24 font-mono text-xs"
                                                                        step={0.005}
                                                                        precision={4}
                                                                        min={0}
                                                                        value={tier.upstreamCost}
                                                                        onChange={(val) => handleTierChange(idx, "cost", val)}
                                                                    />
                                                                </td>

                                                                {/* 其他参数列 (动态真实识别前面打开的参数) */}
                                                                <td className="py-1.5 px-2.5">
                                                                    <Select
                                                                        size="small"
                                                                        className="w-40 text-xs"
                                                                        value={tier.matchedParameterKey || "none"}
                                                                        disabled={isUnifiedPricing}
                                                                        onChange={(val) => handleTierChange(idx, "paramKey", val)}
                                                                        options={applicableParamOptions}
                                                                    />
                                                                </td>

                                                                {/* 对应叠加费用列 */}
                                                                <td className="py-1.5 px-2.5">
                                                                    <InputNumber
                                                                        size="small"
                                                                        className="w-24 font-mono text-xs text-amber-500 font-semibold"
                                                                        step={0.005}
                                                                        precision={4}
                                                                        min={0}
                                                                        disabled={isUnifiedPricing}
                                                                        value={tier.surchargeCost || 0}
                                                                        onChange={(val) => handleTierChange(idx, "surcharge", val)}
                                                                    />
                                                                </td>

                                                                {/* 定价倍率 */}
                                                                <td className="py-1.5 px-2.5">
                                                                    <InputNumber
                                                                        size="small"
                                                                        className="w-20 font-mono text-xs"
                                                                        step={0.1}
                                                                        precision={2}
                                                                        min={0.1}
                                                                        value={tier.markupRatio}
                                                                        onChange={(val) => handleTierChange(idx, "ratio", val)}
                                                                    />
                                                                </td>

                                                                {/* 用户最终价格 */}
                                                                <td className="py-1.5 px-2.5">
                                                                    <InputNumber
                                                                        size="small"
                                                                        className="w-24 font-bold font-mono text-xs text-primary"
                                                                        step={0.01}
                                                                        precision={4}
                                                                        min={0}
                                                                        value={tier.userPrice}
                                                                        onChange={(val) => handleTierChange(idx, "price", val)}
                                                                    />
                                                                </td>

                                                                {/* 操作 */}
                                                                <td className="py-1.5 px-2.5 text-center">
                                                                    <Button
                                                                        size="small"
                                                                        type="text"
                                                                        danger
                                                                        disabled={isUnifiedPricing}
                                                                        className="text-xs h-6 px-1"
                                                                        icon={<Trash2 className="size-3" />}
                                                                        onClick={() => handleDeleteTierRow(idx)}
                                                                    />
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 右侧：实时测算卡片 */}
                                    <div className="col-span-4 space-y-3">
                                        <div className="rounded-xl border border-border bg-muted/20 p-3.5 space-y-3">
                                            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground border-b border-border/60 pb-2">
                                                <TrendingUp className="size-4 text-emerald-500" />
                                                <span>{isUnifiedPricing ? "统一计费出片毛利测算" : "多规格出片费用与毛利测算"}</span>
                                            </div>

                                            <div className="space-y-2 text-xs max-h-[420px] overflow-y-auto pr-1">
                                                {formState.billing.tiers.map((tier, tIdx) => {
                                                    const unitCost = tier.upstreamCost + (tier.surchargeCost || 0);
                                                    const unitPrice = tier.userPrice;
                                                    const unitProfit = unitPrice - unitCost;
                                                    const margin = unitPrice > 0 ? ((unitProfit / unitPrice) * 100).toFixed(1) : "0";

                                                    return (
                                                        <div key={tIdx} className="rounded bg-card p-2 border border-border/60">
                                                            <div className="flex items-center justify-between font-semibold">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="font-mono text-foreground font-bold">
                                                                        {tier.resolution === "unified" ? "统一计费" : tier.resolution}
                                                                    </span>
                                                                    {tier.resolution !== "unified" && (
                                                                        tier.matchedParameterKey && tier.matchedParameterKey !== "none" ? (
                                                                            <Tag color="orange" className="text-[10px] m-0 px-1 py-0">
                                                                                +{tier.matchedParameterLabel}
                                                                            </Tag>
                                                                        ) : (
                                                                            <Tag color="default" className="text-[10px] m-0 px-1 py-0">
                                                                                基础画面
                                                                            </Tag>
                                                                        )
                                                                    )}
                                                                </div>
                                                                <span className="font-mono text-primary font-bold">
                                                                    ¥{unitPrice.toFixed(4)} / {formState.billing.unit === "second" ? "秒" : "次"}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
                                                                <span>成本: ¥{unitCost.toFixed(4)}</span>
                                                                <span className="text-emerald-500 font-medium">毛利率: {margin}%</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ),
                        },
                    ]}
                />
            </div>

            {/* 新增并 1:1 绑定插件协议弹窗 */}
            <Modal
                open={newPluginModalOpen}
                onCancel={() => setNewPluginModalOpen(false)}
                title={
                    <div className="flex items-center gap-2">
                        <Sparkles className="size-4 text-purple-500" />
                        <span className="font-bold text-sm">
                            新增插件协议并与模型 1:1 绑定
                        </span>
                    </div>
                }
                footer={[
                    <Button key="cancel" size="small" onClick={() => setNewPluginModalOpen(false)}>
                        取消
                    </Button>,
                    <Button key="confirm" type="primary" size="small" onClick={handleConfirmCreatePlugin}>
                        确认创建并绑定
                    </Button>,
                ]}
            >
                <div className="space-y-3 text-xs py-2">
                    <div>
                        <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                            协议名称:
                        </label>
                        <Input
                            size="small"
                            value={newPluginName}
                            onChange={(e) => setNewPluginName(e.target.value)}
                            placeholder="如：即梦 Seedance 专线转换协议"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                                协议唯一标识 (ID):
                            </label>
                            <Input
                                size="small"
                                className="font-mono text-xs"
                                value={newPluginId}
                                onChange={(e) => setNewPluginId(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                                计费规则模式:
                            </label>
                            <Select
                                size="small"
                                className="w-full text-xs"
                                value={newPluginBillingRule}
                                onChange={setNewPluginBillingRule}
                                options={[
                                    { value: "按秒计费", label: "按秒计费" },
                                    { value: "按次计费", label: "按次计费" },
                                    { value: "Token计费", label: "Token 计费" },
                                ]}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                            协议说明与描述:
                        </label>
                        <Input.TextArea
                            rows={3}
                            value={newPluginDesc}
                            onChange={(e) => setNewPluginDesc(e.target.value)}
                            placeholder="描述该插件协议适用的渠道、入参转换逻辑与返回格式提取规则..."
                        />
                    </div>
                    <div className="p-2 rounded bg-purple-500/10 border border-purple-500/30 text-[11px] text-purple-700 dark:text-purple-300">
                        提示：创建后将自动完成与上游模型 <strong>[{currentCandidate?.channelName}] {currentCandidate?.upstreamModelId}</strong> 的 1:1 绑定。
                    </div>
                </div>
            </Modal>
        </Modal>
    );
}
// @opc-feature: model-smart-router [end]
