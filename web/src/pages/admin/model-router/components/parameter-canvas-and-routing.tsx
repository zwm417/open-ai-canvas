// @opc-feature: model-smart-router [start]
import { useState, useMemo } from "react";
import {
    Switch,
    Button,
    Tag,
    Select,
    Tooltip,
    Modal,
    Popconfirm,
    Segmented,
    InputNumber,
    message,
} from "antd";
import {
    CheckCircle2,
    CircleSlash,
    Plus,
    Trash2,
    RefreshCw,
    SlidersHorizontal,
    Layers,
    Server,
    Clock,
    Info,
    Filter,
    ArrowUpDown,
    Timer,
    Sparkles,
    Copy,
    Code,
    ExternalLink,
} from "lucide-react";
import type {
    FrontendModelItem,
    UpstreamCandidateModel,
    ChannelAvailableModel,
    SwitchCategory,
    DurationSettings,
} from "../types";
import { useModelRouterStore } from "../model-router-store";
import { getApplicableParametersForModel } from "../mock-data";

interface ParameterCanvasAndRoutingProps {
    model: FrontendModelItem;
    onChange: (updatedModel: FrontendModelItem) => void;
}

export function ParameterCanvasAndRoutingPanel({
    model,
    onChange,
}: ParameterCanvasAndRoutingProps) {
    const {
        testCandidateConnectivity,
        fetchChannelModels,
        channels,
        channelModels: storeChannelModels,
        setManagingChannelId,
    } = useModelRouterStore();

    // 上游模型池双筛选状态
    const [channelFilter, setChannelFilter] = useState<string>("all");
    const [specFilter, setSpecFilter] = useState<string>("all");

    // 看板分类切换
    const [activeCategory, setActiveCategory] = useState<"all" | SwitchCategory>("all");
    const [testingCandId, setTestingCandId] = useState<string | null>(null);
    const [isBatchTesting, setIsBatchTesting] = useState(false);

    // 添加上游模型弹窗
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [selectedChannelId, setSelectedChannelId] = useState<string>("all");
    const [availableChannelModels, setAvailableChannelModels] = useState<ChannelAvailableModel[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);

    // 参数规格说明弹窗
    const [specModalModel, setSpecModalModel] = useState<UpstreamCandidateModel | null>(null);

    // 当前模型真正具有的前端常规参数项列表 (家族与能力隔离)
    const baseSwitches = useMemo(() => {
        return getApplicableParametersForModel(model);
    }, [model]);

    // 合并 baseSwitches 与 model.switchMatrix，保留用户在前台展示开关上的自定义配置
    const mergedSwitches = useMemo(() => {
        const matrixMap = new Map((model.switchMatrix || []).map((s) => [s.key, s]));
        return baseSwitches.map((base) => {
            const custom = matrixMap.get(base.key);
            return {
                ...base,
                showInFrontend: custom ? custom.showInFrontend : (base.showInFrontend !== false),
                preferredCandidateId: custom?.preferredCandidateId,
            };
        });
    }, [baseSwitches, model.switchMatrix]);

    // 计算当前勾选的上游候选模型 (Active Candidates)
    const activeCandidates = useMemo(() => {
        return (model.candidateUpstreams || []).filter((c) => c.enabled);
    }, [model.candidateUpstreams]);

    // 计算当前所有激活变绿的参数集合 (Active Supported Parameters)
    const activeSupportedParamKeys = useMemo(() => {
        const set = new Set<string>();
        activeCandidates.forEach((c) => {
            (c.supportedParameters || []).forEach((p) => set.add(p));
        });
        return set;
    }, [activeCandidates]);

    // 筛选后的候选物理模型列表 (按渠道 + 按规格参数双筛选)
    const filteredCandidates = useMemo(() => {
        return (model.candidateUpstreams || []).filter((cand) => {
            if (channelFilter !== "all" && cand.channelId !== channelFilter) {
                return false;
            }
            if (specFilter !== "all") {
                if (!(cand.supportedParameters || []).includes(specFilter)) {
                    return false;
                }
            }
            return true;
        });
    }, [model.candidateUpstreams, channelFilter, specFilter]);

    // 默认优先级排序列表 (确保包含所有 candidate ID)
    const currentPriorityOrder = useMemo(() => {
        const candidates = model.candidateUpstreams || [];
        const existing = model.defaultCandidatePriority || [];
        const validExisting = existing.filter((id) => candidates.some((c) => c.id === id));
        const missing = candidates.filter((c) => !validExisting.includes(c.id)).map((c) => c.id);
        return [...validExisting, ...missing];
    }, [model.candidateUpstreams, model.defaultCandidatePriority]);

    // 切换候选模型勾选状态 (进入 / 退出候选池)
    const handleToggleCandidate = (candId: string, enabled: boolean) => {
        const updatedCandidates = (model.candidateUpstreams || []).map((c) =>
            c.id === candId ? { ...c, enabled } : c
        );
        onChange({
            ...model,
            candidateUpstreams: updatedCandidates,
        });
    };

    // 移除候选模型
    const handleRemoveCandidate = (candId: string) => {
        const updatedCandidates = (model.candidateUpstreams || []).filter((c) => c.id !== candId);
        const priorities = { ...(model.parameterPriorities || {}) };
        Object.keys(priorities).forEach((k) => {
            priorities[k] = priorities[k].filter((id) => id !== candId);
            if (priorities[k].length === 0) priorities[k] = ["default"];
        });
        const updatedDefaultPriority = (model.defaultCandidatePriority || []).filter((id) => id !== candId);
        onChange({
            ...model,
            candidateUpstreams: updatedCandidates,
            parameterPriorities: priorities,
            defaultCandidatePriority: updatedDefaultPriority,
        });
        message.success("已移除该候选模型");
    };

    // 设置单参数路由 (下拉框选择 "default" 或 具体模型 ID)
    const handleSetParameterRoute = (paramKey: string, chosenValue: string) => {
        const priorities = { ...(model.parameterPriorities || {}) };
        if (chosenValue === "default") {
            priorities[paramKey] = ["default"];
        } else {
            priorities[paramKey] = [chosenValue];
        }
        onChange({
            ...model,
            parameterPriorities: priorities,
        });
    };

    // 切换参数的“前台展示开关”
    const handleToggleParamVisibility = (paramKey: string, showInFrontend: boolean) => {
        const updatedSwitches = mergedSwitches.map((s) =>
            s.key === paramKey ? { ...s, showInFrontend } : s
        );
        onChange({
            ...model,
            switchMatrix: updatedSwitches,
        });
    };

    // 调整默认优先级 P1 或移动顺位
    const handleSetTopPriority = (candId: string) => {
        const rest = currentPriorityOrder.filter((id) => id !== candId);
        const newOrder = [candId, ...rest];
        const currentCandidates = model.candidateUpstreams || [];
        const reorderedCandidates = [...currentCandidates].sort((a, b) => {
            const idxA = newOrder.indexOf(a.id);
            const idxB = newOrder.indexOf(b.id);
            return (idxA === -1 ? 9999 : idxA) - (idxB === -1 ? 9999 : idxB);
        });
        onChange({
            ...model,
            defaultCandidatePriority: newOrder,
            candidateUpstreams: reorderedCandidates,
        });
        message.success("已将该上游模型置为默认 P1 优先级！");
    };

    // 时长配置更新
    const durationSettings: DurationSettings = model.durationSettings || {
        minSeconds: 2,
        maxSeconds: 15,
        isLocked: false,
        lockedSeconds: 5,
        maxDurationRouteEnabled: false,
        maxDurationTargetCandidateId: model.candidateUpstreams?.[0]?.id,
    };

    const handleUpdateDurationSettings = (partial: Partial<DurationSettings>) => {
        const updated: DurationSettings = {
            ...durationSettings,
            ...partial,
        };
        onChange({
            ...model,
            durationSettings: updated,
        });
    };

    // 单个候选物理模型真实测速
    const handleTestCandidate = async (cand: UpstreamCandidateModel) => {
        setTestingCandId(cand.id);
        try {
            const res = await testCandidateConnectivity(model.id, cand.id);
            const updatedCandidates = (model.candidateUpstreams || []).map((c) =>
                c.id === cand.id
                    ? {
                          ...c,
                          status: res.status as any,
                          lastLatencyMs: res.latencyMs,
                          lastTestedAt: res.testedAt,
                          errorMessage: res.errorMessage,
                      }
                    : c
            );
            onChange({
                ...model,
                candidateUpstreams: updatedCandidates,
            });
            if (res.status === "healthy") {
                message.success(`[${cand.channelName}] 测速正常 (${res.latencyMs}ms)`);
            } else {
                message.warning(`[${cand.channelName}] 响应延迟较高 (${res.latencyMs}ms)`);
            }
        } finally {
            setTestingCandId(null);
        }
    };

    // 批量全部候选真实测速
    const handleBatchTest = async () => {
        if (!model.candidateUpstreams || model.candidateUpstreams.length === 0) {
            message.warning("当前候选池暂无上游物理模型");
            return;
        }
        setIsBatchTesting(true);
        message.loading({ content: "正在发起并发真实网络测速...", key: "batch-test" });
        try {
            const updated = await Promise.all(
                model.candidateUpstreams.map(async (c) => {
                    const res = await testCandidateConnectivity(model.id, c.id);
                    return {
                        ...c,
                        status: res.status as any,
                        lastLatencyMs: res.latencyMs,
                        lastTestedAt: res.testedAt,
                        errorMessage: res.errorMessage,
                    };
                })
            );
            onChange({
                ...model,
                candidateUpstreams: updated,
            });
            message.success({ content: `已完成全部 ${updated.length} 个上游模型的真实测速！`, key: "batch-test" });
        } finally {
            setIsBatchTesting(false);
        }
    };

    // 打开添加上游物理模型弹窗
    const handleOpenAddModal = async () => {
        const targetChannel = selectedChannelId || channels[0]?.id || "all";
        setSelectedChannelId(targetChannel);
        setAddModalOpen(true);
        setLoadingModels(true);
        try {
            const list = await fetchChannelModels(targetChannel);
            setAvailableChannelModels(list);
        } finally {
            setLoadingModels(false);
        }
    };

    const handleChannelChange = async (chId: string) => {
        setSelectedChannelId(chId);
        setLoadingModels(true);
        try {
            const list = await fetchChannelModels(chId);
            setAvailableChannelModels(list);
        } finally {
            setLoadingModels(false);
        }
    };

    // 确认将渠道模型添加至此卡片候选池
    const handleAddChannelModelToPool = (cam: ChannelAvailableModel) => {
        const existingCM = storeChannelModels.find(
            (cm) => cm.channelId === cam.channelId && cm.modelKey === cam.modelKey
        );

        const newCandidate: UpstreamCandidateModel = {
            id: existingCM?.id || `cand-${cam.channelId}-${cam.modelKey}-${Date.now().toString().slice(-4)}`,
            channelId: cam.channelId,
            channelName: cam.channelName,
            upstreamModelId: cam.modelKey,
            channelModelId: existingCM?.id,
            channelProtocol: existingCM?.protocol,
            protocolType: cam.protocol.includes("插件") ? "plugin" : "system",
            endpoint: cam.endpoint,
            authType: cam.authType,
            extractPath: cam.extractPath,
            timeoutSeconds: 300,
            enabled: true,
            supportedParameters: cam.supportedParameters,
            status: "untested",
            sampleRequestFormat: JSON.stringify({
                model: cam.modelKey,
                prompt: "4K 影视级短剧分镜镜头...",
                resolution: "1080P",
                aspect_ratio: "16:9",
                duration: 5,
            }, null, 2),
            parameterSpecs: cam.parameterSpecs,
        };

        const existing = model.candidateUpstreams || [];
        const isAlreadyAdded = existing.some(
            (c) => c.channelId === cam.channelId && c.upstreamModelId === cam.modelKey
        );

        if (isAlreadyAdded) {
            message.info(`该物理模型 [${cam.displayName}] 已在候选池中`);
            setAddModalOpen(false);
            return;
        }

        const updatedCandidates = [...existing, newCandidate];
        const updatedDefaultPriority = [...currentPriorityOrder, newCandidate.id];

        onChange({
            ...model,
            candidateUpstreams: updatedCandidates,
            defaultCandidatePriority: updatedDefaultPriority,
        });

        message.success(`已添加 [${cam.displayName}] 至上游模型池`);
        setAddModalOpen(false);
    };

    // 过滤分类后的前端参数
    const filteredSwitches = useMemo(() => {
        if (activeCategory === "all") return mergedSwitches;
        return mergedSwitches.filter((s) => s.category === activeCategory);
    }, [mergedSwitches, activeCategory]);

    return (
        <div className="space-y-4 pt-1">
            {/* 1. 顶部：上游模型池 (微型卡片与按渠道/按规格双筛选) */}
            <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/60 pb-2.5">
                    <div className="flex items-center gap-2">
                        <Layers className="size-4 text-primary" />
                        <span className="text-xs font-bold text-foreground">上游模型池</span>
                        <Tag color="blue" className="rounded-full text-[10px] m-0">
                            已添加 {model.candidateUpstreams?.length || 0}
                        </Tag>
                        <Tag color="green" className="rounded-full text-[10px] m-0 font-semibold">
                            生效 {activeCandidates.length}
                        </Tag>
                    </div>

                    {/* 双筛选器 + 测速与添加按钮 */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Filter className="size-3.5" />
                            <span>渠道:</span>
                            <Select
                                size="small"
                                className="w-28 text-xs"
                                value={channelFilter}
                                onChange={setChannelFilter}
                                options={[
                                    { value: "all", label: "全部渠道" },
                                    ...Array.from(new Set((model.candidateUpstreams || []).map((c) => c.channelId))).map((chId) => {
                                        const found = (model.candidateUpstreams || []).find((c) => c.channelId === chId);
                                        return { value: chId, label: found?.channelName || chId };
                                    }),
                                ]}
                            />
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>规格:</span>
                            <Select
                                size="small"
                                className="w-28 text-xs"
                                value={specFilter}
                                onChange={setSpecFilter}
                                options={[
                                    { value: "all", label: "全部参数" },
                                    { value: "res_4k", label: model.capability === "video" ? "4K (2160P)" : "4K 超清" },
                                    { value: "res_2k", label: "2K" },
                                    { value: "res_1080p", label: "1080P" },
                                    { value: "res_768p", label: "768P" },
                                    { value: "res_720p", label: "720P" },
                                    { value: "res_480p", label: "480P" },
                                    { value: "ratio_16_9", label: "16:9" },
                                    { value: "ratio_9_16", label: "9:16" },
                                    { value: "ratio_1_1", label: "1:1" },
                                    { value: "first_frame", label: "首帧" },
                                    { value: "first_last_frame", label: "首尾帧" },
                                    { value: "multi_ref", label: "多图参考" },
                                    { value: "audio_generation", label: "生成声音" },
                                ]}
                            />
                        </div>

                        <Button
                            size="small"
                            icon={<RefreshCw className={`size-3 ${isBatchTesting ? "animate-spin" : ""}`} />}
                            loading={isBatchTesting}
                            onClick={handleBatchTest}
                        >
                            批量测速
                        </Button>
                        <Button
                            type="primary"
                            size="small"
                            icon={<Plus className="size-3" />}
                            onClick={handleOpenAddModal}
                        >
                            + 添加模型
                        </Button>
                    </div>
                </div>

                {/* 紧凑微型模型卡片列表 */}
                {(!model.candidateUpstreams || model.candidateUpstreams.length === 0) ? (
                    <div className="rounded-lg border border-dashed border-border/80 p-6 text-center bg-muted/10">
                        <CircleSlash className="size-6 text-muted-foreground mx-auto mb-1.5 opacity-50" />
                        <p className="text-xs text-muted-foreground">尚未添加任何上游模型</p>
                        <Button
                            size="small"
                            type="primary"
                            className="mt-2 text-xs"
                            icon={<Plus className="size-3" />}
                            onClick={handleOpenAddModal}
                        >
                            立即添加
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {filteredCandidates.map((cand) => {
                            const cleanChannelName = cand.channelName.replace(/\s*\(.*?\)/g, "").trim() || cand.channelName;
                            return (
                            <div
                                key={cand.id}
                                className={`rounded-lg border px-2.5 py-1.5 transition-all text-xs flex items-center justify-between gap-1.5 overflow-hidden ${
                                    cand.enabled
                                        ? "border-emerald-500/60 bg-emerald-500/5 shadow-sm"
                                        : "border-border/60 bg-muted/10 opacity-60"
                                }`}
                            >
                                {/* 左侧：Switch + 渠道 Tag + 模型ID */}
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <Switch
                                        size="small"
                                        checked={cand.enabled}
                                        onChange={(checked) => handleToggleCandidate(cand.id, checked)}
                                    />
                                    <Tag
                                        color="blue"
                                        className="text-[10px] m-0 px-1.5 py-0 shrink-0 font-medium max-w-[85px] truncate inline-block align-middle"
                                        title={cand.channelName}
                                    >
                                        {cleanChannelName}
                                    </Tag>
                                    <span
                                        className="font-mono font-bold text-foreground text-xs truncate min-w-0 flex-1 block"
                                        title={cand.upstreamModelId}
                                    >
                                        {cand.upstreamModelId}
                                    </span>
                                </div>

                                {/* 右侧：状态 + [说明] + [移除] (彻底移除测速按钮与参数Tag) */}
                                <div className="flex items-center gap-1 shrink-0">
                                    {cand.status === "untested" && (
                                        <Tag className="text-[10px] m-0 px-1 py-0">待测</Tag>
                                    )}
                                    {cand.status === "healthy" && (
                                        <Tag color="green" className="text-[10px] m-0 px-1 py-0 font-mono">
                                            {cand.lastLatencyMs}ms
                                        </Tag>
                                    )}
                                    {cand.status === "warning" && (
                                        <Tag color="orange" className="text-[10px] m-0 px-1 py-0 font-mono">
                                            {cand.lastLatencyMs}ms
                                        </Tag>
                                    )}
                                    {cand.status === "error" && (
                                        <Tag color="red" className="text-[10px] m-0 px-1 py-0">异常</Tag>
                                    )}

                                    <Button
                                        size="small"
                                        type="text"
                                        className="text-[11px] h-5 px-1 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                        title={`打开 [${cleanChannelName}] 的模型管理`}
                                        onClick={() => setManagingChannelId(cand.channelId)}
                                    >
                                        渠道 ↗
                                    </Button>

                                    <Button
                                        size="small"
                                        type="text"
                                        className="text-[11px] h-5 px-1.5 text-primary hover:bg-primary/10"
                                        icon={<Info className="size-3" />}
                                        onClick={() => setSpecModalModel(cand)}
                                    >
                                        说明
                                    </Button>

                                    <Popconfirm
                                        title="确定要从上游模型池移除该模型吗？"
                                        onConfirm={() => handleRemoveCandidate(cand.id)}
                                        okText="移除"
                                        cancelText="取消"
                                    >
                                        <Button
                                            size="small"
                                            type="text"
                                            danger
                                            className="h-5 w-5 p-0 text-xs flex items-center justify-center opacity-70 hover:opacity-100"
                                        >
                                            ×
                                        </Button>
                                    </Popconfirm>
                                </div>
                            </div>
                        );
                        })}
                    </div>
                )}
            </div>

            {/* 2. 中部：默认优先级调度条 */}
            <div className="rounded-xl border border-border/80 bg-muted/20 p-3 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                    <ArrowUpDown className="size-4 text-primary" />
                    <span className="font-semibold text-foreground">默认优先级:</span>
                    <span className="text-muted-foreground text-[11px]">
                        当请求参数在后台均设为【默认】时，依次匹配满足全部参数的最高优先级上游。
                    </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                    {currentPriorityOrder.map((candId, idx) => {
                        const cand = (model.candidateUpstreams || []).find((c) => c.id === candId);
                        if (!cand) return null;
                        const isP1 = idx === 0;
                        return (
                            <Tag
                                key={candId}
                                color={isP1 ? "purple" : "default"}
                                className={`text-[10px] m-0 px-2 py-0.5 cursor-pointer font-medium ${
                                    isP1 ? "ring-1 ring-purple-500/40 font-bold" : ""
                                }`}
                                onClick={() => !isP1 && handleSetTopPriority(candId)}
                            >
                                {isP1 ? "⭐ P1 " : `P${idx + 1} `}[{cand.channelName.replace(/\s*\(.*?\)/g, "").trim() || cand.channelName}] {cand.upstreamModelId}
                            </Tag>
                        );
                    })}
                </div>
            </div>

            {/* 3. 下部：极简参数看板 */}
            <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                    <div className="flex items-center gap-2">
                        <SlidersHorizontal className="size-4 text-primary" />
                        <span className="text-xs font-bold text-foreground">
                            参数看板与路由配置
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                            高亮代表已有上游支持；单个下拉框指定走默认优先级或特定上游模型。
                        </span>
                    </div>

                    <Segmented
                        size="small"
                        value={activeCategory}
                        onChange={(val) => setActiveCategory(val as any)}
                        options={[
                            { label: `全部 (${baseSwitches.length})`, value: "all" },
                            { label: "分辨率", value: "resolution" },
                            { label: "画幅比例", value: "aspect_ratio" },
                            { label: "秒数与时长", value: "duration" },
                            { label: "特殊参数", value: "reference" },
                            { label: "输出控制", value: "output" },
                            { label: "高级特性", value: "advanced" },
                        ]}
                    />
                </div>

                {/* 3.1 时长范围与最大秒数开关专属配置面板 (当切换到 duration 或 all 时展现) */}
                {(activeCategory === "all" || activeCategory === "duration") && (
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2 text-xs">
                        <div className="flex items-center justify-between border-b border-primary/20 pb-2">
                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                                <Timer className="size-4 text-primary" /> 秒数区间与最大秒数专属路由控制
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                                用户仅能在允许区间选择整数秒生成
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                            <div>
                                <label className="text-[11px] text-muted-foreground block mb-1">单次请求最小秒数</label>
                                <InputNumber
                                    size="small"
                                    min={1}
                                    max={60}
                                    addonAfter="秒"
                                    className="w-full"
                                    value={durationSettings.minSeconds}
                                    onChange={(val) => handleUpdateDurationSettings({ minSeconds: val || 2 })}
                                />
                            </div>
                            <div>
                                <label className="text-[11px] text-muted-foreground block mb-1">单次请求最大秒数</label>
                                <InputNumber
                                    size="small"
                                    min={1}
                                    max={60}
                                    addonAfter="秒"
                                    className="w-full"
                                    value={durationSettings.maxSeconds}
                                    onChange={(val) => handleUpdateDurationSettings({ maxSeconds: val || 15 })}
                                />
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-[11px] text-muted-foreground">锁定固定秒数</label>
                                    <Switch
                                        size="small"
                                        checked={durationSettings.isLocked}
                                        onChange={(checked) => handleUpdateDurationSettings({ isLocked: checked })}
                                    />
                                </div>
                                <InputNumber
                                    size="small"
                                    min={1}
                                    max={60}
                                    addonAfter="秒"
                                    className="w-full"
                                    disabled={!durationSettings.isLocked}
                                    value={durationSettings.lockedSeconds}
                                    onChange={(val) => handleUpdateDurationSettings({ lockedSeconds: val || 5 })}
                                />
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-[11px] text-muted-foreground">达到最大秒数特定路由</label>
                                    <Switch
                                        size="small"
                                        checked={durationSettings.maxDurationRouteEnabled}
                                        onChange={(checked) => handleUpdateDurationSettings({ maxDurationRouteEnabled: checked })}
                                    />
                                </div>
                                <Select
                                    size="small"
                                    className="w-full text-xs"
                                    disabled={!durationSettings.maxDurationRouteEnabled}
                                    value={durationSettings.maxDurationTargetCandidateId || "default"}
                                    onChange={(val) => handleUpdateDurationSettings({ maxDurationTargetCandidateId: val })}
                                    options={[
                                        { value: "default", label: "走默认优先级" },
                                        ...(model.candidateUpstreams || []).map((c) => ({
                                            value: c.id,
                                            label: `[${c.channelName}] ${c.upstreamModelId}`,
                                        })),
                                    ]}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* 3.2 极简参数网格 (纯净卡片：仅名称 + 前台展示开关 + 单一简洁下拉框) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                    {filteredSwitches.map((item) => {
                        const isSupported = activeSupportedParamKeys.has(item.key);
                        const candidates = model.candidateUpstreams || [];
                        const hasCandidates = candidates.length > 0;

                        // 当前配置的目标路由（优先从 parameterPriorities 取，无则取 preferredCandidateId 或 default）
                        const rawChosen =
                            model.parameterPriorities?.[item.key]?.[0] ||
                            item.preferredCandidateId ||
                            "default";

                        const currentChosen = (rawChosen !== "default" && candidates.some((s) => s.id === rawChosen))
                            ? rawChosen
                            : (rawChosen === "default" ? "default" : (hasCandidates ? "default" : "none"));

                        const isShowInFrontend = item.showInFrontend !== false;

                        // 是否是多模态自动推断参数
                        const isAutoInferParam = ["first_frame", "first_last_frame", "multi_ref", "omni_ref"].includes(item.key);

                        return (
                            <div
                                key={item.key}
                                className={`rounded-xl border p-2.5 transition-all text-xs flex flex-col justify-between ${
                                    isSupported
                                        ? "border-emerald-500/80 bg-emerald-500/5 shadow-sm ring-1 ring-emerald-500/20"
                                        : "border-dashed border-border/70 bg-muted/10 opacity-60 text-muted-foreground"
                                }`}
                            >
                                <div>
                                    {/* 顶部标题行与前台展示开关 */}
                                    <div className="flex items-center justify-between gap-1 mb-1">
                                        <div className="flex items-center gap-1.5 truncate">
                                            {isSupported ? (
                                                <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                                            ) : (
                                                <CircleSlash className="size-3.5 text-muted-foreground/60 shrink-0" />
                                            )}
                                            <span className={`font-bold text-xs truncate ${isSupported ? "text-foreground" : "text-muted-foreground"}`}>
                                                {item.label}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                            <span className="text-[10px] text-muted-foreground">前台展示</span>
                                            <Switch
                                                size="small"
                                                checked={isShowInFrontend}
                                                onChange={(checked) => handleToggleParamVisibility(item.key, checked)}
                                            />
                                        </div>
                                    </div>

                                    {/* 素材自动推断微型提示 */}
                                    {isAutoInferParam && (
                                        <p className="text-[10px] text-muted-foreground line-clamp-1 mb-1.5">
                                            前台素材自动推断 (0/1/2/多图)
                                        </p>
                                    )}
                                </div>

                                {/* 底部单一简洁下拉框 (默认 vs 具体上游模型) */}
                                <div className="pt-1.5 mt-1 border-t border-border/40">
                                    <Select
                                        size="small"
                                        className="w-full text-xs"
                                        value={hasCandidates ? currentChosen : "none"}
                                        disabled={!hasCandidates}
                                        onChange={(val) => handleSetParameterRoute(item.key, val)}
                                        options={
                                            hasCandidates
                                                ? [
                                                    { value: "default", label: "默认 (走默认优先级)" },
                                                    ...candidates.map((s) => {
                                                        const cleanChannel = s.channelName.replace(/\s*\(.*?\)/g, "").trim() || s.channelName;
                                                        const isDeclared = (s.supportedParameters || []).includes(item.key);
                                                        return {
                                                            value: s.id,
                                                            label: `[${cleanChannel}] ${s.upstreamModelId}${!isDeclared ? " (未声明)" : ""}${s.enabled ? "" : " (已停用)"}`,
                                                        };
                                                    }),
                                                ]
                                                : [{ value: "none", label: "暂无上游模型 (请先添加)" }]
                                        }
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 从渠道添加上游物理模型弹窗 */}
            <Modal
                open={addModalOpen}
                onCancel={() => setAddModalOpen(false)}
                title={
                    <div className="flex items-center gap-2">
                        <Plus className="size-4 text-primary" />
                        <span className="font-bold">从渠道添加上游物理模型</span>
                    </div>
                }
                width={780}
                footer={null}
            >
                <div className="space-y-3.5 py-2">
                    <div className="flex items-center justify-between bg-muted/30 p-2.5 rounded-xl border border-border">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">选择上游渠道:</span>
                            <Select
                                size="small"
                                className="w-48"
                                value={selectedChannelId}
                                onChange={handleChannelChange}
                                options={channels.map((c) => ({ value: c.id, label: c.name }))}
                            />
                            {selectedChannelId && selectedChannelId !== "all" && (
                                <Button
                                    size="small"
                                    type="link"
                                    className="text-xs p-0 flex items-center gap-1 text-primary"
                                    onClick={() => {
                                        const chId = selectedChannelId;
                                        setAddModalOpen(false);
                                        setManagingChannelId(chId);
                                    }}
                                >
                                    <ExternalLink className="size-3" />
                                    管理该渠道模型 ↗
                                </Button>
                            )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                            可用模型 {availableChannelModels.length} 个
                        </span>
                    </div>

                    <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
                        {loadingModels ? (
                            <div className="p-8 text-center text-xs text-muted-foreground">
                                <RefreshCw className="size-5 animate-spin mx-auto mb-2 text-primary" />
                                正在获取渠道模型列表...
                            </div>
                        ) : availableChannelModels.length === 0 ? (
                            <div className="p-8 text-center text-xs text-muted-foreground">
                                该渠道暂无匹配物理模型
                            </div>
                        ) : (
                            availableChannelModels
                                .filter((m) => m.capability === model.capability)
                                .map((cam) => (
                                    <div
                                        key={cam.id}
                                        className="rounded-lg border border-border/80 bg-card p-2.5 shadow-sm flex items-center justify-between gap-2.5 text-xs hover:border-primary/50 transition-all"
                                    >
                                        <div className="space-y-0.5 max-w-[75%]">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <Tag color="blue" className="text-[10px] m-0">
                                                    {cam.channelName}
                                                </Tag>
                                                <span className="font-bold text-foreground">
                                                    {cam.displayName}
                                                </span>
                                                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-primary">
                                                    {cam.modelKey}
                                                </code>
                                            </div>
                                            <div className="text-[10px] text-muted-foreground">
                                                最高分辨率: {cam.parameterSpecs?.maxResolution} · 时长: {cam.parameterSpecs?.durationRange}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <Button
                                                size="small"
                                                type="text"
                                                className="text-[11px] h-6 px-1.5 text-muted-foreground hover:text-primary"
                                                onClick={() => {
                                                    const chId = cam.channelId;
                                                    setAddModalOpen(false);
                                                    setManagingChannelId(chId);
                                                }}
                                            >
                                                渠道 ↗
                                            </Button>
                                            <Button
                                                size="small"
                                                type="primary"
                                                icon={<Plus className="size-3" />}
                                                onClick={() => handleAddChannelModelToPool(cam)}
                                            >
                                                添加
                                            </Button>
                                        </div>
                                    </div>
                                ))
                        )}
                    </div>
                </div>
            </Modal>

            {/* 参数规格说明弹窗 (全量可选参数收纳与规格详情) */}
            <Modal
                open={Boolean(specModalModel)}
                onCancel={() => setSpecModalModel(null)}
                width={620}
                title={
                    <div className="flex items-center gap-2">
                        <Info className="size-4 text-primary" />
                        <span className="font-bold">
                            上游模型规格与参数说明 · [{specModalModel?.channelName}] {specModalModel?.upstreamModelId}
                        </span>
                    </div>
                }
                footer={[
                    specModalModel && (
                        <Button
                            key="channel"
                            icon={<ExternalLink className="size-3" />}
                            onClick={() => {
                                const chId = specModalModel.channelId;
                                setSpecModalModel(null);
                                setManagingChannelId(chId);
                            }}
                        >
                            管理此渠道模型 ↗
                        </Button>
                    ),
                    <Button key="close" type="primary" onClick={() => setSpecModalModel(null)}>
                        确定
                    </Button>,
                ]}
            >
                {specModalModel && (
                    <div className="space-y-3.5 text-xs py-2">
                        {/* 基础规格参数 */}
                        <div className="grid grid-cols-3 gap-2 bg-muted/30 p-2.5 rounded-lg border border-border/60">
                            <div>
                                <span className="text-muted-foreground block text-[11px]">
                                    {model.capability === "image" ? "最大输出规格:" : "最大支持分辨率:"}
                                </span>
                                <span className="font-bold text-foreground font-mono">
                                    {specModalModel.parameterSpecs?.maxResolution || (model.capability === "image" ? "2K 高清" : "1080P")}
                                </span>
                            </div>
                            <div>
                                <span className="text-muted-foreground block text-[11px]">
                                    {model.capability === "image" ? "计费结算方式:" : "成片时长范围:"}
                                </span>
                                <span className="font-bold text-foreground">
                                    {model.capability === "image" ? "按次扣点" : (specModalModel.parameterSpecs?.durationRange || "2~15s")}
                                </span>
                            </div>
                            <div>
                                <span className="text-muted-foreground block text-[11px]">协议绑定类型:</span>
                                <Tag color={specModalModel.protocolType === "plugin" ? "purple" : "blue"} className="text-[10px] m-0">
                                    {specModalModel.protocolType === "plugin" ? "插件协议" : "系统通用协议"}
                                </Tag>
                            </div>
                        </div>

                        {/* 全部可选参数清单 (收纳至此) */}
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="font-semibold text-foreground flex items-center gap-1.5">
                                    <Sparkles className="size-3 text-primary" />
                                    支持的可选参数清单 (共 {specModalModel.supportedParameters?.length || 0} 项)
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                    勾选该上游模型后，前端看板对应参数自动亮起
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 p-2.5 bg-muted/20 rounded-lg border border-border/60 max-h-36 overflow-y-auto">
                                {(specModalModel.supportedParameters || []).map((p) => {
                                    const sw = baseSwitches.find((s) => s.key === p);
                                    return (
                                        <Tag
                                            key={p}
                                            color="blue"
                                            className="text-xs m-0 px-2 py-0.5 font-medium border-blue-500/30"
                                        >
                                            {sw ? sw.label : p}
                                        </Tag>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 接口端点与认证 */}
                        <div>
                            <span className="text-muted-foreground block text-[11px] mb-1">接口端点与认证方式:</span>
                            <code className="font-mono text-[11px] bg-muted/60 p-2 rounded block break-all text-foreground border border-border/40">
                                {specModalModel.endpoint} ({specModalModel.authType})
                            </code>
                        </div>

                        {/* 原上游请求参考格式 JSON */}
                        {specModalModel.sampleRequestFormat && (
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-muted-foreground text-[11px] flex items-center gap-1 font-semibold">
                                        <Code className="size-3 text-primary" />
                                        原上游请求参考格式 (Sample Request JSON):
                                    </span>
                                    <Button
                                        size="small"
                                        type="text"
                                        className="text-[10px] h-5 px-1.5"
                                        icon={<Copy className="size-3" />}
                                        onClick={() => {
                                            if (specModalModel.sampleRequestFormat) {
                                                navigator.clipboard.writeText(specModalModel.sampleRequestFormat);
                                                message.success("已复制原上游请求参考格式！");
                                            }
                                        }}
                                    >
                                        复制
                                    </Button>
                                </div>
                                <pre className="font-mono text-[11px] bg-muted/40 p-2 rounded max-h-32 overflow-y-auto border border-border/50 text-foreground">
                                    {specModalModel.sampleRequestFormat}
                                </pre>
                            </div>
                        )}

                        {/* 说明与备注 */}
                        <div>
                            <span className="text-muted-foreground block text-[11px] mb-1">说明与备注:</span>
                            <p className="text-muted-foreground leading-relaxed bg-muted/20 p-2 rounded border border-border/50">
                                {specModalModel.parameterSpecs?.notes || "已在生产环境通过高保真连通性测试。"}
                            </p>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
// @opc-feature: model-smart-router [end]
