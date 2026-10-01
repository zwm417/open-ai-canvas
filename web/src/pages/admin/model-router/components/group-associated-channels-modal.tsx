// @opc-feature: model-smart-router [start]
import { useState, useMemo } from "react";
import { Modal, Tabs, Tag, Button, Tooltip, Alert, message } from "antd";
import {
    Server,
    ExternalLink,
    Wrench,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    Clock,
    Zap,
    RefreshCw,
    Sliders,
    Coins,
} from "lucide-react";
import type { FrontendModelItem } from "../types";
import { getAssociatedChannels, type AssociatedChannelInfo, type AssociatedChannelRouteDetail } from "../model-router-adapter";
import { useModelRouterStore } from "../model-router-store";
import type { ModelChannel } from "@/stores/use-config-store";

interface GroupAssociatedChannelsModalProps {
    visible: boolean;
    model: FrontendModelItem | null;
    onClose: () => void;
    onConfigureChannelModel: (channel: ModelChannel, modelKey: string) => void;
    onOpenChannelManager: (channelId: string) => void;
}

export function GroupAssociatedChannelsModal({
    visible,
    model,
    onClose,
    onConfigureChannelModel,
    onOpenChannelManager,
}: GroupAssociatedChannelsModalProps) {
    if (!visible || !model) return null;

    const { channels, channelModels, testModelConnectivity } = useModelRouterStore();
    const [testingRouteId, setTestingRouteId] = useState<string | null>(null);
    const [routeLatencies, setRouteLatencies] = useState<Record<string, { status: "healthy" | "warning" | "error"; latencyMs: number }>>({});

    const associatedChannels = useMemo<AssociatedChannelInfo[]>(() => {
        return getAssociatedChannels(model, channels);
    }, [model, channels]);

    const [activeChannelId, setActiveChannelId] = useState<string>(() => {
        return associatedChannels[0]?.channelId || "";
    });

    const currentChannelInfo = useMemo(() => {
        const found = associatedChannels.find((c) => c.channelId === activeChannelId);
        return found || associatedChannels[0];
    }, [associatedChannels, activeChannelId]);

    const currentSysChannel = useMemo(() => {
        if (!currentChannelInfo) return undefined;
        return channels.find((c) => c.id === currentChannelInfo.channelId);
    }, [channels, currentChannelInfo]);

    // 获取当前渠道下与该前台模型匹配的渠道物理模型实体
    const matchedChannelModel = useMemo(() => {
        if (!currentChannelInfo) return undefined;
        const targetModelKey = currentChannelInfo.primaryUpstreamModel || currentChannelInfo.upstreamModels[0];
        return channelModels.find(
            (cm) => cm.channelId === currentChannelInfo.channelId && (cm.modelKey === targetModelKey || cm.providerModelKey === targetModelKey)
        );
    }, [channelModels, currentChannelInfo]);

    // 针对特定路线做测速
    const handleTestRoute = async (routeKey: string) => {
        setTestingRouteId(routeKey);
        try {
            const res = await testModelConnectivity(model.id);
            setRouteLatencies((prev) => ({
                ...prev,
                [routeKey]: { status: res.status, latencyMs: res.latencyMs },
            }));
            if (res.status === "healthy") {
                message.success(`连通测试通过！响应延时: ${res.latencyMs}ms`);
            } else {
                message.warning(`上游响应延迟过高 (${res.latencyMs}ms)`);
            }
        } catch (err: any) {
            setRouteLatencies((prev) => ({
                ...prev,
                [routeKey]: { status: "error", latencyMs: 0 },
            }));
            message.error(`连通测速失败：${err?.message || "网络异常"}`);
        } finally {
            setTestingRouteId(null);
        }
    };

    return (
        <Modal
            open={visible}
            onCancel={onClose}
            width={980}
            destroyOnClose
            title={
                <div className="flex items-center justify-between pr-8">
                    <div className="flex items-center gap-2">
                        <Server className="size-5 text-primary" />
                        <div>
                            <span className="font-bold text-base text-foreground">
                                【{model.displayName}】关联渠道模型统一管理
                            </span>
                            <span className="text-xs text-muted-foreground ml-2 font-normal">
                                (共 {associatedChannels.length} 个渠道来源)
                            </span>
                        </div>
                    </div>
                    <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground">
                        {model.id}
                    </code>
                </div>
            }
            footer={[
                <Button key="close" onClick={onClose}>
                    关闭
                </Button>,
            ]}
        >
            <div className="py-2 space-y-4">
                <Alert
                    type="info"
                    showIcon
                    className="text-xs py-2"
                    message="精准分流管理说明"
                    description={`该展示模型卡片聚合了 ${associatedChannels.length} 条物理渠道路线。下方标签页已按渠道来源明确切分，点击“配置此渠道模型”可直接针对该具体上游模型修改协议、能力画像与阶梯价格。`}
                />

                {associatedChannels.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground text-xs">
                        该模型分组尚未绑定任何渠道来源，请在【配置】弹窗中添加上游路线。
                    </div>
                ) : (
                    <Tabs
                        activeKey={activeChannelId || associatedChannels[0]?.channelId}
                        onChange={setActiveChannelId}
                        type="card"
                        className="associated-channels-tabs"
                        items={associatedChannels.map((ac) => {
                            const isP1 = ac.isPrimary;
                            const modelCode = ac.primaryUpstreamModel || ac.upstreamModels[0] || "未指定";
                            return {
                                key: ac.channelId,
                                label: (
                                    <div className="flex items-center gap-1.5 py-0.5">
                                        <Tag
                                            color={isP1 ? "blue" : "purple"}
                                            className="text-[10px] m-0 px-1 py-0 font-medium"
                                        >
                                            {isP1 ? "P1 主渠道" : "候选路线"}
                                        </Tag>
                                        <span className="font-semibold text-xs text-foreground">
                                            {ac.channelName}
                                        </span>
                                        <span className="text-[11px] font-mono text-muted-foreground">
                                            ({modelCode})
                                        </span>
                                    </div>
                                ),
                            };
                        })}
                    />
                )}

                {currentChannelInfo && (
                    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                        {/* 渠道基础信息与连通状态 */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-bold text-foreground">
                                        {currentChannelInfo.channelName}
                                    </h4>
                                    <Tag color={currentChannelInfo.isPrimary ? "blue" : "purple"} className="text-xs">
                                        {currentChannelInfo.isPrimary ? "主渠道主力提供方 (P1)" : "候选冗余路由"}
                                    </Tag>
                                    {(currentSysChannel?.apiFormat || currentSysChannel?.interfaceType) && (
                                        <Tag color="cyan" className="text-xs font-mono">
                                            {currentSysChannel?.apiFormat || currentSysChannel?.interfaceType}
                                        </Tag>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 font-mono">
                                    端点 BaseURL: {currentSysChannel?.baseUrl || "未配置或系统内置默认"}
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                {(() => {
                                    const testKey = currentChannelInfo.channelId;
                                    const testRes = routeLatencies[testKey];
                                    const status = testRes?.status || currentChannelInfo.status;
                                    const latency = testRes?.latencyMs ?? currentChannelInfo.lastLatencyMs;

                                    if (status === "healthy") {
                                        return (
                                            <span className="text-emerald-500 flex items-center gap-1 text-xs font-medium">
                                                <CheckCircle2 className="size-3.5" /> 连通良好 ({latency || 20}ms)
                                            </span>
                                        );
                                    }
                                    if (status === "warning") {
                                        return (
                                            <span className="text-amber-500 flex items-center gap-1 text-xs font-medium">
                                                <AlertTriangle className="size-3.5" /> 延迟较高 ({latency}ms)
                                            </span>
                                        );
                                    }
                                    if (status === "error") {
                                        return (
                                            <span className="text-red-500 flex items-center gap-1 text-xs font-medium">
                                                <XCircle className="size-3.5" /> 连通异常
                                            </span>
                                        );
                                    }
                                    return (
                                        <span className="text-muted-foreground flex items-center gap-1 text-xs">
                                            <Clock className="size-3.5" /> 待测速
                                        </span>
                                    );
                                })()}

                                <Button
                                    size="small"
                                    icon={<Zap className="size-3 text-amber-500" />}
                                    loading={testingRouteId === currentChannelInfo.channelId}
                                    onClick={() => handleTestRoute(currentChannelInfo.channelId)}
                                    className="text-xs"
                                >
                                    测速
                                </Button>
                            </div>
                        </div>

                        {/* 路线列表与模型规格详情 */}
                        <div className="space-y-3">
                            <h5 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                <Sliders className="size-3.5 text-primary" />
                                该渠道分配的上游模型清单与参数映射
                            </h5>

                            <div className="space-y-2">
                                {currentChannelInfo.routes.map((route, idx) => {
                                    const isEditingModel = matchedChannelModel?.modelKey === route.upstreamModelId;

                                    return (
                                        <div
                                            key={route.routeId || `${route.upstreamModelId}-${idx}`}
                                            className="rounded-lg border border-border/70 bg-muted/20 p-3 flex flex-wrap items-center justify-between gap-3"
                                        >
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <Tag color={route.sourceType === "primary" ? "blue" : "purple"} className="text-[10px] m-0">
                                                        {route.sourceType === "primary" ? "主力" : "候选"}
                                                    </Tag>
                                                    <span className="font-bold text-xs text-foreground font-mono">
                                                        {route.upstreamModelId}
                                                    </span>
                                                    <Tag color={route.protocolType === "plugin" ? "purple" : "blue"} className="text-[10px] m-0">
                                                        {route.protocolType === "plugin" ? "插件协议" : "系统协议"}
                                                    </Tag>
                                                </div>
                                                <div className="text-[11px] text-muted-foreground flex items-center gap-3">
                                                    <span>能力类型: {model.capability === "video" ? "生视频" : "生图片"}</span>
                                                    {matchedChannelModel && (
                                                        <span>
                                                            阶梯价格: {matchedChannelModel.priceTiers?.length || 0} 档
                                                        </span>
                                                    )}
                                                    {matchedChannelModel?.enabled !== undefined && (
                                                        <span>
                                                            渠道模型状态: {matchedChannelModel.enabled ? "已启用" : "已停用"}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <Button
                                                    size="small"
                                                    type="primary"
                                                    icon={<Wrench className="size-3" />}
                                                    onClick={() => {
                                                        if (currentSysChannel) {
                                                            onConfigureChannelModel(currentSysChannel, route.upstreamModelId);
                                                        } else {
                                                            message.warning("未检索到对应系统渠道实体");
                                                        }
                                                    }}
                                                    className="text-xs"
                                                >
                                                    配置此渠道模型
                                                </Button>

                                                <Button
                                                    size="small"
                                                    icon={<ExternalLink className="size-3" />}
                                                    onClick={() => onOpenChannelManager(currentChannelInfo.channelId)}
                                                    className="text-xs text-muted-foreground hover:text-primary"
                                                    title="打开该渠道全量模型管理列表"
                                                >
                                                    进入渠道模型库 ↗
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
// @opc-feature: model-smart-router [end]
