// @opc-feature: model-smart-router [start]
import { useState, useEffect, useMemo } from "react";
import { Tabs, Button, App, Alert, Modal, Dropdown } from "antd";
import {
    Layers,
    Shuffle,
    PlugZap,
    RotateCcw,
    Server,
    RefreshCw,
    Sparkles,
    Radio,
    Zap,
    ExternalLink,
} from "lucide-react";
import { AdminPageFrame } from "../components/admin-shell";
import { ModelMatrixGrid } from "./components/model-matrix-grid";
import { ChannelModelAcquisitionPanel } from "./components/channel-model-acquisition-panel";
import { ModelTransferSortPanel } from "./components/model-transfer-sort-panel";
import { PluginProtocolPanel } from "./components/plugin-protocol-panel";
import { ChannelModelManager } from "../components/channel-model-manager";
import { DropdownMenu } from "@/components/ui/base/dropdown-menu";
import { useModelRouterStore } from "./model-router-store";
import { useUserStore } from "@/stores/use-user-store";
import { updateAdminFeatureAvailability } from "@/services/api/auth";
import { refreshSystemChannels } from "@/lib/user-session";

export function ModelRouterPage() {
    const [activeTab, setActiveTab] = useState<string>("matrix");
    const {
        loadAllData,
        isLoading,
        channels,
        managingChannelId,
        setManagingChannelId,
    } = useModelRouterStore();
    const { modal, message } = App.useApp();
    const features = useUserStore((state) => state.features);
    const isFrontendModelsEnabled = Boolean(features?.frontendModelsEnabled);
    const [switchingMode, setSwitchingMode] = useState(false);

    const managingChannel = useMemo(
        () => channels.find((c) => c.id === managingChannelId),
        [channels, managingChannelId]
    );

    useEffect(() => {
        void loadAllData();
    }, []);

    const handleRefresh = async () => {
        try {
            await loadAllData();
            message.success("已从数据库同步最新前台模型、渠道与价格配置！");
        } catch (err: any) {
            message.error(`同步失败：${err?.message || "网络异常"}`);
        }
    };

    const handleToggleMode = () => {
        if (isFrontendModelsEnabled) {
            modal.confirm({
                title: "确认切换回系统渠道直连模式？",
                content: (
                    <div className="space-y-2 text-xs leading-relaxed text-zinc-300">
                        <p>切换后，普通用户在前台将直接使用【系统渠道】中配置的模型列表；</p>
                        <p>智能模型中枢内已配置的候选池、矩阵与策略将完整保留在数据库中，您可以随时在此处一键切回智能分流。</p>
                    </div>
                ),
                okText: "确认切换为直连",
                cancelText: "取消",
                okButtonProps: { danger: true },
                onOk: async () => {
                    setSwitchingMode(true);
                    try {
                        const res = await updateAdminFeatureAvailability({ frontendModelsEnabled: false });
                        useUserStore.getState().setFeatures(res.features);
                        await refreshSystemChannels();
                        message.success("已成功切换为系统渠道直连模式！前台用户现已直通系统渠道。");
                    } catch (err: any) {
                        message.error(`切换模式失败：${err?.message || "网络异常"}`);
                    } finally {
                        setSwitchingMode(false);
                    }
                },
            });
        } else {
            modal.confirm({
                title: "确认启用前台模型智能分流模式？",
                content: (
                    <div className="space-y-2 text-xs leading-relaxed text-zinc-300">
                        <p>启用后，前台用户将优先使用智能模型中枢所配置的矩阵卡片与多路线自动调度；</p>
                        <p>同时，未配置前台模型的系统渠道（如智天下等纯文本对话模型）将自动无缝共存兜底，无需手动逐一迁移。</p>
                    </div>
                ),
                okText: "立即启用智能分流",
                cancelText: "取消",
                onOk: async () => {
                    setSwitchingMode(true);
                    try {
                        const res = await updateAdminFeatureAvailability({ frontendModelsEnabled: true });
                        useUserStore.getState().setFeatures(res.features);
                        await refreshSystemChannels();
                        message.success("已成功启用前台模型智能分流模式！");
                    } catch (err: any) {
                        message.error(`切换模式失败：${err?.message || "网络异常"}`);
                    } finally {
                        setSwitchingMode(false);
                    }
                },
            });
        }
    };

    return (
        <AdminPageFrame
            title="智能模型中枢与智能路由计费"
            description="独立前台模型映射、多维开关矩阵控制、时长阈值转一口价、AI 插件格式分析与三元联动计费"
            scroll
            actions={
                <div className="flex items-center gap-2.5 flex-wrap">
                    <div
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                            isFrontendModelsEnabled
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                        }`}
                    >
                        <span
                            className={`size-2 rounded-full ${
                                isFrontendModelsEnabled ? "bg-emerald-400 animate-pulse" : "bg-blue-400"
                            }`}
                        />
                        <span>
                            {isFrontendModelsEnabled ? "智能分流模式（前台模型生效）" : "直连模式（系统渠道直连）"}
                        </span>
                    </div>

                    <Button
                        size="small"
                        danger={isFrontendModelsEnabled}
                        type={isFrontendModelsEnabled ? "default" : "primary"}
                        loading={switchingMode}
                        onClick={handleToggleMode}
                        icon={isFrontendModelsEnabled ? <RotateCcw className="size-3.5" /> : <Sparkles className="size-3.5" />}
                    >
                        {isFrontendModelsEnabled ? "切回系统渠道直连" : "启用智能分流"}
                    </Button>

                    <Button
                        size="small"
                        icon={<RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />}
                        loading={isLoading}
                        onClick={handleRefresh}
                    >
                        同步中枢数据
                    </Button>

                    <DropdownMenu
                        placement="bottom end"
                        trigger={
                            <Button
                                size="small"
                                icon={<Server className="size-3.5 text-primary" />}
                            >
                                系统渠道模型管理 ↗
                            </Button>
                        }
                        items={channels.map((c) => ({
                            key: c.id,
                            label: `【${c.name}】模型管理`,
                            onClick: () => setManagingChannelId(c.id),
                        }))}
                        ariaLabel="系统渠道模型管理"
                    />
                </div>
            }
        >
            <div className="space-y-4">
                {!isFrontendModelsEnabled ? (
                    <Alert
                        type="info"
                        showIcon
                        icon={<Radio className="size-4 text-blue-400" />}
                        message="当前处于【系统渠道直连模式】"
                        description="前台创作台正直接使用系统渠道配置的模型。您在此处对智能模型中枢进行的配置会自动安全落库保存；如需让前台用户享用智能调度矩阵，请点击右上角“启用智能分流”。"
                        className="!bg-blue-950/20 !border-blue-500/30 !text-zinc-300"
                    />
                ) : (
                    <Alert
                        type="success"
                        showIcon
                        icon={<Zap className="size-4 text-emerald-400" />}
                        message="前台模型智能分流生效中 · 全能力自动继承已开启"
                        description="生图与生视频任务由智能模型中枢多路线自动路由调度；未前台化的纯文本对话模型（如智天下等）已自动无缝共存兜底，物理模型能力（蒙版重绘、高分辨率、多参考图）均已全自动继承。"
                        className="!bg-emerald-950/20 !border-emerald-500/30 !text-zinc-300"
                    />
                )}

                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    type="card"
                    items={[
                        {
                            key: "matrix",
                            label: (
                                <span className="flex items-center gap-2">
                                    <Layers className="size-4" /> 前端模型矩阵与快捷控制
                                </span>
                            ),
                            children: <ModelMatrixGrid />,
                        },
                        {
                            key: "acquisition",
                            label: (
                                <span className="flex items-center gap-2">
                                    <Server className="size-4" /> 渠道模型获取与双轨匹配
                                </span>
                            ),
                            children: <ChannelModelAcquisitionPanel />,
                        },
                        {
                            key: "sort",
                            label: (
                                <span className="flex items-center gap-2">
                                    <Shuffle className="size-4" /> 模型分组与前端排序 (穿梭框)
                                </span>
                            ),
                            children: <ModelTransferSortPanel />,
                        },
                        {
                            key: "plugins",
                            label: (
                                <span className="flex items-center gap-2">
                                    <PlugZap className="size-4" /> 插件与协议接入 (一键 AI 分析)
                                </span>
                            ),
                            children: <PluginProtocolPanel />,
                        },
                    ]}
                />
            </div>

            {/* 全局系统渠道模型管理直通弹窗 (就地打开配置能力与计费，关闭后即刻静默重刷) */}
            {managingChannel && (
                <Modal
                    open={Boolean(managingChannel)}
                    onCancel={() => {
                        setManagingChannelId(null);
                        void loadAllData();
                    }}
                    footer={null}
                    width={1120}
                    destroyOnClose
                    title={
                        <div className="flex items-center gap-2">
                            <Server className="size-4 text-primary" />
                            <span className="font-bold text-foreground">
                                系统渠道【{managingChannel.name}】模型管理
                            </span>
                        </div>
                    }
                >
                    <ChannelModelManager
                        channel={managingChannel}
                        onChanged={async () => {
                            await loadAllData();
                        }}
                    />
                </Modal>
            )}
        </AdminPageFrame>
    );
}

export default ModelRouterPage;
// @opc-feature: model-smart-router [end]
