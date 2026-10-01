import { App, Button, Descriptions, Drawer, Input, Select, Space, Tag, Tooltip, Upload } from "antd";
import { Switch } from "@/pages/admin/ui/controls";
import { AlipayCircleFilled, WechatFilled } from "@ant-design/icons";
import { ZHIFUFM_LOGO_SRC } from "@/components/payment-brand-icons";
import type { ColumnsType } from "antd/es/table";
import { CloudUpload, Download, ExternalLink, Layers, PlugZap, RefreshCw, Search, Settings2, ShieldCheck, Trash2, Upload as UploadIcon, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { PaginationBar } from "@/pages/admin/components/admin-ui";
import "@/lib/plugins/builtin";
import { EAGLE_PLUGIN_ID } from "@/lib/plugins/builtin/eagle";
import { RUNNINGHUB_PLUGIN_ID } from "@/lib/plugins/builtin/workflows";
import { isOfficialApplicationPluginId } from "@/lib/plugins/official-applications";
import { listRegisteredPlugins } from "@/lib/plugins/plugin-registry";
import type { PluginManifest, PluginManifestV2 } from "@/lib/plugins/plugin-types";
import { downloadPluginPackage, fetchAdminPlugins, setPluginPlatformAvailability, uninstallPlugin, uploadPlugin, type AdminPluginState, type BackendPlugin, type PluginManagement } from "@/services/api/plugins";
import { UploadPluginModal } from "@/pages/plugins/plugin-documentation-modals";

import { AdminPageFrame } from "../components/admin-shell";
import { AdminDataTable, AdminStatusBadge, AdminTableEmpty } from "../components/admin-ui";

type AdminPluginItem = {
    manifest: PluginManifest | PluginManifestV2;
    source: string;
    management: PluginManagement;
    status?: string;
    error?: string;
};

export default function AdminPluginsPage() {
    const { message, modal } = App.useApp();
    const [plugins, setPlugins] = useState<BackendPlugin[]>([]);
    const [states, setStates] = useState<Record<string, AdminPluginState>>({});
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState("");
    const [uploadOpen, setUploadOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [kind, setKind] = useState<"all" | "application" | "protocol" | "payment" | "uploaded">("all");
    const [availability, setAvailability] = useState<"all" | "available" | "unavailable">("all");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    // @opc-feature: admin-plugin-enhancements [start]
    const [selectedItem, setSelectedItem] = useState<AdminPluginItem | null>(null);
    // @opc-feature: admin-plugin-enhancements [end]

    const reload = async () => {
        setLoading(true);
        try {
            const result = await fetchAdminPlugins();
            setPlugins(result.plugins);
            setStates(result.states);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取插件管理数据失败");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void reload();
    }, []);

    const items = useMemo(() => mergePlugins(plugins), [plugins]);
    const filtered = useMemo(() => {
        const keyword = search.trim().toLocaleLowerCase();
        return items.filter((item) => {
            if (kind === "uploaded" && item.management.origin !== "uploaded") return false;
            if (kind !== "all" && kind !== "uploaded" && item.management.kind !== kind) return false;
            const available = states[item.manifest.id]?.platformAvailable ?? item.status === "enabled";
            if (availability === "available" && !available) return false;
            if (availability === "unavailable" && available) return false;
            if (!keyword) return true;
            return [item.manifest.name, item.manifest.id, item.manifest.description, item.manifest.author].filter(Boolean).join(" ").toLocaleLowerCase().includes(keyword);
        });
    }, [availability, items, kind, search, states]);

    useEffect(() => {
        setPage((current) => Math.min(current, Math.max(1, Math.ceil(filtered.length / pageSize))));
    }, [filtered.length, pageSize]);

    const changeAvailability = async (item: AdminPluginItem, available: boolean) => {
        setSavingId(item.manifest.id);
        try {
            const state = await setPluginPlatformAvailability(item.manifest.id, available);
            setStates((current) => ({ ...current, [item.manifest.id]: state }));
            message.success(`${item.manifest.name}${available ? "已开放" : "已停用"}`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "更新插件可用状态失败");
        } finally {
            setSavingId("");
        }
    };

    const upload = async (file: File) => {
        try {
            await uploadPlugin(file);
            setUploadOpen(false);
            message.success("自定义插件已安装");
            await reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "安装插件失败");
        }
    };

    // @opc-feature: admin-plugin-enhancements [start]
    const handleDownload = async (item: AdminPluginItem) => {
        try {
            message.loading({ content: `正在下载 ${item.manifest.name} 安装包...`, key: "download-plugin" });
            const defaultName = `${item.manifest.id}-v${item.manifest.version}.zhiying-plugin`;
            await downloadPluginPackage(item.manifest.id, defaultName);
            message.success({ content: `${item.manifest.name} 安装包下载已启动`, key: "download-plugin" });
        } catch (error) {
            message.error({ content: error instanceof Error ? error.message : "下载插件安装包失败", key: "download-plugin" });
        }
    };

    const handleUpdate = async (file: File) => {
        try {
            message.loading({ content: "正在更新插件包...", key: "upload-plugin" });
            const updated = await uploadPlugin(file);
            message.success({ content: "插件已成功更新至最新版本", key: "upload-plugin" });
            await reload();
            if (selectedItem) {
                setSelectedItem((prev) => (prev ? { ...prev, manifest: updated.manifest, status: updated.status } : null));
            }
        } catch (error) {
            message.error({ content: error instanceof Error ? error.message : "更新插件失败", key: "upload-plugin" });
            throw error;
        }
    };
    // @opc-feature: admin-plugin-enhancements [end]

    const remove = (item: AdminPluginItem) => {
        modal.confirm({
            title: `卸载 ${item.manifest.name}？`,
            content: "插件包、平台状态和所有用户的启用记录都会删除。此操作不可撤销。",
            okText: "确认卸载",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                try {
                    await uninstallPlugin(item.manifest.id);
                    message.success("自定义插件已卸载");
                    await reload();
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "卸载插件失败");
                    throw error;
                }
            },
        });
    };

    const applicationCount = items.filter((item) => item.management.kind === "application").length;
    const protocolCount = items.filter((item) => item.management.kind === "protocol").length;
    const paymentCount = items.filter((item) => item.management.kind === "payment").length;
    const unavailableCount = items.filter((item) => !(states[item.manifest.id]?.platformAvailable ?? item.status === "enabled")).length;
    const hasFilters = Boolean(search.trim() || kind !== "all" || availability !== "all");
    const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

    const columns: ColumnsType<AdminPluginItem> = [
        {
            title: "插件",
            key: "plugin",
            width: 410,
            render: (_, item) => (
                <div className="flex min-w-0 items-center gap-3">
                    <PluginBrandIcon pluginId={item.manifest.id} />
                    <div className="min-w-0">
                        <div className="flex min-w-0 items-baseline gap-2">
                            {/* @opc-feature: admin-plugin-enhancements [start] */}
                            <button
                                type="button"
                                className="truncate font-medium text-foreground hover:text-primary transition-colors text-left cursor-pointer"
                                title="点击查看详情与配置"
                                onClick={() => setSelectedItem(item)}
                            >
                                {item.manifest.name}
                            </button>
                            {/* @opc-feature: admin-plugin-enhancements [end] */}
                            <span className="shrink-0 text-xs text-foreground/42">v{item.manifest.version}</span>
                        </div>
                        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs">
                            <span className="max-w-44 shrink-0 truncate font-mono text-[11px] text-foreground/42" title={item.manifest.id}>
                                {item.manifest.id}
                            </span>
                            <span className="text-foreground/20" aria-hidden="true">
                                ·
                            </span>
                            <span className={`truncate ${item.error ? "text-status-error" : "text-foreground/52"}`} title={item.error || item.manifest.description || "未提供插件说明"}>
                                {item.error || item.manifest.description || "未提供插件说明"}
                            </span>
                        </div>
                    </div>
                </div>
            ),
        },
        {
            title: "类型",
            key: "type",
            width: 160,
            align: "center",
            render: (_, item) => (
                <div>
                    <AdminStatusBadge label={managementLabel(item.management)} tone={item.management.origin === "uploaded" ? "warning" : item.management.kind === "application" ? "info" : "neutral"} />
                    {!item.manifest.trusted ? (
                        <div className="mt-1.5">
                            <AdminStatusBadge label="来源未验证" tone="warning" />
                        </div>
                    ) : null}
                </div>
            ),
        },
        {
            title: "作用范围",
            key: "scope",
            width: 180,
            align: "center",
            render: (_, item) =>
                item.management.activationScope === "user" ? (
                    <div>
                        <div className="font-medium text-foreground/78">用户自主启用</div>
                        <div className="mt-1 inline-flex items-center gap-1 text-xs text-foreground/48">
                            <UsersRound className="size-3.5" aria-hidden="true" />
                            {states[item.manifest.id]?.enabledUserCount || 0} 位已启用
                        </div>
                    </div>
                ) : (
                    <div>
                        <div className="font-medium text-foreground/78">全局生效</div>
                        <div className="mt-1 text-xs text-foreground/48">管理员统一控制</div>
                    </div>
                ),
        },
        {
            title: "平台状态",
            key: "status",
            width: 170,
            align: "center",
            render: (_, item) => {
                const available = states[item.manifest.id]?.platformAvailable ?? item.status === "enabled";
                return (
                    <div className="flex items-center justify-center gap-3">
                        <AdminStatusBadge label={available ? "已开放" : "已停用"} tone={available ? "success" : "neutral"} />
                        <Switch
                            className="plugin-state-switch"
                            loading={savingId === item.manifest.id}
                            checked={available}
                            aria-label={`${item.manifest.name}，当前${available ? "平台开放，点击停用" : "平台停用，点击开放"}`}
                            onChange={(checked) => void changeAvailability(item, checked)}
                        />
                    </div>
                );
            },
        },
        // @opc-feature: admin-plugin-enhancements [start]
        {
            title: "操作",
            key: "actions",
            width: 120,
            align: "center",
            render: (_, item) => (
                <div className="flex items-center justify-center gap-1">
                    <Button
                        type="text"
                        size="small"
                        title="查看详情与配置"
                        aria-label={`查看 ${item.manifest.name} 详情与配置`}
                        icon={<Settings2 className="size-3.5 text-foreground/70 hover:text-foreground" aria-hidden="true" />}
                        onClick={() => setSelectedItem(item)}
                    />
                    {item.management.origin === "uploaded" ? (
                        <Button
                            type="text"
                            size="small"
                            title="下载插件包"
                            aria-label={`下载 ${item.manifest.name} 安装包`}
                            icon={<Download className="size-3.5 text-foreground/70 hover:text-foreground" aria-hidden="true" />}
                            onClick={() => void handleDownload(item)}
                        />
                    ) : null}
                    {item.management.origin === "uploaded" ? (
                        <Button
                            danger
                            type="text"
                            size="small"
                            title="卸载插件"
                            aria-label={`卸载 ${item.manifest.name}`}
                            icon={<Trash2 className="size-3.5" aria-hidden="true" />}
                            onClick={() => remove(item)}
                        />
                    ) : (
                        <span title="内置插件不可卸载">
                            <Button type="text" size="small" disabled aria-label={`${item.manifest.name}为内置插件，不可卸载`} icon={<Trash2 className="size-3.5" aria-hidden="true" />} />
                        </span>
                    )}
                </div>
            ),
        },
        // @opc-feature: admin-plugin-enhancements [end]
    ];

    return (
        <AdminPageFrame
            title="插件管理"
            description="管理平台级可用性、自定义插件安装与用户启用范围"
            actions={
                <>
                    <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void reload()}>
                        刷新
                    </Button>
                    <Button type="primary" icon={<CloudUpload className="size-4" />} onClick={() => setUploadOpen(true)}>
                        上传插件
                    </Button>
                </>
            }
        >
            <div className="my-4 grid min-h-16 grid-cols-2 divide-x divide-border/70 overflow-hidden rounded-lg border border-border/70 bg-card sm:grid-cols-5">
                <OverviewItem label="全部插件" value={items.length} />
                <OverviewItem label="官方应用" value={applicationCount} />
                <OverviewItem label="系统协议" value={protocolCount} />
                <OverviewItem label="支付协议" value={paymentCount} />
                <OverviewItem label="平台已停用" value={unavailableCount} tone={unavailableCount ? "warning" : "default"} />
            </div>
            <AdminDataTable
                toolbar={
                    <Input
                        className="app-list-search"
                        allowClear
                        prefix={<Search className="size-4 text-foreground/40" />}
                        value={search}
                        aria-label="搜索插件"
                        placeholder="搜索插件名称、ID 或作者"
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setPage(1);
                        }}
                    />
                }
                toolbarFilters={
                    <>
                        <Select
                            aria-label="筛选插件类型"
                            className="w-44"
                            value={kind}
                            onChange={(value) => {
                                setKind(value);
                                setPage(1);
                            }}
                            options={[
                                { value: "all", label: "全部类型" },
                                { value: "application", label: "官方应用插件" },
                                { value: "protocol", label: "系统协议插件" },
                                { value: "payment", label: "支付协议插件" },
                                { value: "uploaded", label: "上传的自定义插件" },
                            ]}
                        />
                        <Select
                            aria-label="筛选插件状态"
                            className="w-32"
                            value={availability}
                            onChange={(value) => {
                                setAvailability(value);
                                setPage(1);
                            }}
                            options={[
                                { value: "all", label: "全部状态" },
                                { value: "available", label: "平台开放" },
                                { value: "unavailable", label: "平台停用" },
                            ]}
                        />
                    </>
                }
                toolbarActive={hasFilters}
                onReset={() => {
                    setSearch("");
                    setKind("all");
                    setAvailability("all");
                    setPage(1);
                }}
                skeletonColumns={5}
                table={{ className: "app-data-table", size: "small", sticky: true, rowKey: (item) => item.manifest.id, loading, columns, dataSource: paginated, pagination: false, scroll: { x: 1120 } }}
                empty={<AdminTableEmpty filtered={hasFilters} title={hasFilters ? undefined : "还没有可管理的插件"} />}
                footer={
                    <PaginationBar
                        alwaysShow
                        current={page}
                        pageSize={pageSize}
                        total={filtered.length}
                        onChange={(nextPage, nextPageSize) => {
                            setPage(nextPageSize !== pageSize ? 1 : nextPage);
                            setPageSize(nextPageSize);
                        }}
                    />
                }
            />
            <UploadPluginModal open={uploadOpen} onClose={() => setUploadOpen(false)} onUpload={upload} />
            {/* @opc-feature: admin-plugin-enhancements [start] */}
            <PluginDetailDrawer
                open={Boolean(selectedItem)}
                item={selectedItem}
                state={selectedItem ? states[selectedItem.manifest.id] : undefined}
                saving={Boolean(selectedItem && savingId === selectedItem.manifest.id)}
                onClose={() => setSelectedItem(null)}
                onToggleAvailability={async (available) => {
                    if (selectedItem) await changeAvailability(selectedItem, available);
                }}
                onDownload={async () => {
                    if (selectedItem) await handleDownload(selectedItem);
                }}
                onUpdate={async (file) => {
                    await handleUpdate(file);
                }}
                onRemove={() => {
                    if (selectedItem) {
                        const target = selectedItem;
                        setSelectedItem(null);
                        remove(target);
                    }
                }}
            />
            {/* @opc-feature: admin-plugin-enhancements [end] */}
        </AdminPageFrame>
    );
}

function OverviewItem({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warning" }) {
    return (
        <div className="flex min-w-0 items-center gap-3 px-4 py-3">
            <div className={`text-xl font-semibold tabular-nums ${tone === "warning" ? "text-status-warning" : "text-foreground"}`}>{value}</div>
            <div className="truncate text-xs text-foreground/52">{label}</div>
        </div>
    );
}

function PluginBrandIcon({ pluginId }: { pluginId: string }) {
    if (pluginId === "official-payment-wechat-native") {
        return (
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#07c160]/10 text-[#07c160]">
                <WechatFilled className="text-lg" aria-hidden />
            </span>
        );
    }
    if (pluginId === "official-payment-alipay-page") {
        return (
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#1677ff]/10 text-[#1677ff]">
                <AlipayCircleFilled className="text-lg" aria-hidden />
            </span>
        );
    }
    if (pluginId === "official-payment-zhifufm") {
        return (
            <span className="grid size-9 shrink-0 place-items-center rounded-lg overflow-hidden border border-border/40 bg-card shadow-xs">
                <img src={ZHIFUFM_LOGO_SRC} alt="支付FM" className="size-full object-contain select-none pointer-events-none rounded-lg" />
            </span>
        );
    }
    return (
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground/65">
            <PlugZap className="size-4" aria-hidden="true" />
        </span>
    );
}

function mergePlugins(remote: BackendPlugin[]): AdminPluginItem[] {
    const byId = new Map<string, AdminPluginItem>();
    for (const plugin of listRegisteredPlugins()) {
        const application = isOfficialApplicationPluginId(plugin.manifest.id);
        byId.set(plugin.manifest.id, {
            manifest: plugin.manifest,
            source: plugin.source || "bundled",
            management: {
                origin: "official",
                kind: application ? "application" : "protocol",
                activationScope: application ? "user" : "system",
                configurationScope: application ? (plugin.manifest.id === EAGLE_PLUGIN_ID || plugin.manifest.id === RUNNINGHUB_PLUGIN_ID ? "user" : "none") : "system",
            },
        });
    }
    for (const plugin of remote) byId.set(plugin.manifest.id, plugin);
    return [...byId.values()].sort((left, right) => managementOrder(left.management) - managementOrder(right.management) || left.manifest.name.localeCompare(right.manifest.name, "zh-CN"));
}

function managementOrder(value: PluginManagement) {
    if (value.kind === "application") return 0;
    if (value.kind === "payment") return 1;
    if (value.origin === "official") return 2;
    return 3;
}

function managementLabel(value: PluginManagement) {
    if (value.origin === "uploaded") return "自定义插件";
    if (value.kind === "application") return "官方应用";
    return value.kind === "payment" ? "系统支付协议" : "系统协议";
}

// @opc-feature: admin-plugin-enhancements [start]
const permissionLabels: Record<string, string> = {
    "canvas.read": "读取画布",
    "canvas.write": "修改画布",
    "asset.read": "读取素材",
    "asset.search": "搜索素材",
    "asset.import": "导入素材",
    "asset.upload": "上传素材",
    "generation.run": "调用生成",
    "ai.text": "调用模型理解与对话",
    "media.read": "读取媒体内容",
    "external.open": "打开外部详情",
};

const surfaceLabels: Record<string, string> = {
    node: "画布节点",
    fullscreen: "全屏工作台",
    hybrid: "混合接入",
    "asset-source": "素材库",
};

type PluginDetailDrawerProps = {
    open: boolean;
    item: AdminPluginItem | null;
    state: AdminPluginState | undefined;
    saving: boolean;
    onClose: () => void;
    onToggleAvailability: (available: boolean) => Promise<void>;
    onDownload: () => Promise<void>;
    onUpdate: (file: File) => Promise<void>;
    onRemove: () => void;
};

function PluginDetailDrawer({
    open,
    item,
    state,
    saving,
    onClose,
    onToggleAvailability,
    onDownload,
    onUpdate,
    onRemove,
}: PluginDetailDrawerProps) {
    const navigate = useNavigate();
    if (!item) return null;
    const available = state?.platformAvailable ?? item.status === "enabled";
    const manifest = item.manifest;
    const isUploaded = item.management.origin === "uploaded";
    const contributes = manifest.contributes as {
        canvasNodes?: Array<{ id: string; label?: string; defaultSize?: { width: number; height: number } }>;
        providers?: Array<{ id: string; name?: string; capability?: string }>;
        paymentProviders?: Array<{ id: string; name?: string }>;
    } | undefined;
    const canvasNodes = contributes?.canvasNodes || [];
    const providers = contributes?.providers || [];
    const paymentProviders = contributes?.paymentProviders || [];

    return (
        <Drawer
            title={
                <div className="flex items-center gap-3">
                    <PluginBrandIcon pluginId={manifest.id} />
                    <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                            <span className="truncate font-semibold text-foreground">{manifest.name}</span>
                            <span className="shrink-0 text-xs text-foreground/45">v{manifest.version}</span>
                        </div>
                        <div className="font-mono text-xs text-foreground/40">{manifest.id}</div>
                    </div>
                </div>
            }
            open={open}
            onClose={onClose}
            width="min(640px, 92vw)"
            destroyOnClose
            rootClassName="admin-drawer"
            extra={
                <div className="flex items-center gap-2">
                    <AdminStatusBadge label={available ? "已开放" : "已停用"} tone={available ? "success" : "neutral"} />
                    <Switch
                        className="plugin-state-switch"
                        loading={saving}
                        checked={available}
                        aria-label={`${manifest.name}，当前${available ? "平台开放，点击停用" : "平台停用，点击开放"}`}
                        onChange={(checked) => void onToggleAvailability(checked)}
                    />
                </div>
            }
        >
            <div className="space-y-6">
                {/* 状态徽标与属性 */}
                <div className="flex flex-wrap items-center gap-2">
                    <AdminStatusBadge
                        label={managementLabel(item.management)}
                        tone={item.management.origin === "uploaded" ? "warning" : item.management.kind === "application" ? "info" : "neutral"}
                    />
                    {manifest.trusted ? (
                        <AdminStatusBadge label="可信插件" tone="success" />
                    ) : (
                        <AdminStatusBadge label="来源未验证" tone="warning" />
                    )}
                    <span className="text-xs text-foreground/45">
                        作用范围：{item.management.activationScope === "user" ? "用户自主启用" : "平台全局生效"}
                    </span>
                    {item.management.activationScope === "user" && state?.enabledUserCount ? (
                        <span className="text-xs text-foreground/45">（{state.enabledUserCount} 位用户已启用）</span>
                    ) : null}
                </div>

                {/* 描述 */}
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3.5 text-sm text-foreground/75 leading-relaxed">
                    {manifest.description || "未提供插件描述"}
                </div>

                {/* 基本元数据 */}
                <Descriptions title="基本信息" size="small" column={1} bordered>
                    <Descriptions.Item label="作者">{manifest.author || "官方"}</Descriptions.Item>
                    <Descriptions.Item label="API 版本">{manifest.apiVersion || "zhiying.plugin/v1"}</Descriptions.Item>
                    {manifest.surfaces?.length ? (
                        <Descriptions.Item label="宿主界面">
                            <Space wrap size={[4, 4]}>
                                {manifest.surfaces.map((s) => (
                                    <Tag key={s} className="m-0 text-xs">
                                        {surfaceLabels[s] || s}
                                    </Tag>
                                ))}
                            </Space>
                        </Descriptions.Item>
                    ) : null}
                    {isUploaded ? (
                        <>
                            <Descriptions.Item label="安装包文件">{item.source || `${manifest.id}.zhiying-plugin`}</Descriptions.Item>
                            {item.status ? <Descriptions.Item label="运行时状态">{item.status}</Descriptions.Item> : null}
                            {item.error ? (
                                <Descriptions.Item label="异常提示">
                                    <span className="text-status-error">{item.error}</span>
                                </Descriptions.Item>
                            ) : null}
                        </>
                    ) : null}
                </Descriptions>

                {/* 权限清单 */}
                <div>
                    <h4 className="mb-2 text-sm font-semibold text-foreground">声明权限 ({manifest.permissions?.length || 0})</h4>
                    {manifest.permissions?.length ? (
                        <div className="flex flex-wrap gap-2">
                            {manifest.permissions.map((perm) => (
                                <Tooltip key={perm} title={`权限代号：${perm}`}>
                                    <span className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-card px-2 py-1 text-xs text-foreground/80">
                                        <ShieldCheck className="size-3 text-primary/70" />
                                        <span>{permissionLabels[perm] || perm}</span>
                                    </span>
                                </Tooltip>
                            ))}
                        </div>
                    ) : (
                        <div className="text-xs text-foreground/40">该插件未声明额外敏感权限</div>
                    )}
                </div>

                {/* 贡献能力 */}
                <div>
                    <h4 className="mb-2 text-sm font-semibold text-foreground">贡献能力 (Contributions)</h4>
                    <div className="space-y-2">
                        {canvasNodes.map((node) => (
                            <div key={node.id} className="flex items-center justify-between rounded-md border border-border/60 bg-card/60 px-3 py-2 text-xs">
                                <div className="flex items-center gap-2">
                                    <Layers className="size-3.5 text-foreground/50" />
                                    <span className="font-medium text-foreground">{node.label || node.id}</span>
                                    <span className="text-foreground/40">({node.id})</span>
                                </div>
                                <span className="text-foreground/40">
                                    默认尺寸：{node.defaultSize ? `${node.defaultSize.width} × ${node.defaultSize.height}` : "-"}
                                </span>
                            </div>
                        ))}
                        {providers.map((prov) => (
                            <div key={prov.id} className="flex items-center justify-between rounded-md border border-border/60 bg-card/60 px-3 py-2 text-xs">
                                <div className="flex items-center gap-2">
                                    <PlugZap className="size-3.5 text-foreground/50" />
                                    <span className="font-medium text-foreground">{prov.name || prov.id}</span>
                                    <span className="text-foreground/40">({prov.id})</span>
                                </div>
                                <span className="text-foreground/40">{prov.capability}</span>
                            </div>
                        ))}
                        {paymentProviders.map((pay) => (
                            <div key={pay.id} className="flex items-center justify-between rounded-md border border-border/60 bg-card/60 px-3 py-2 text-xs">
                                <div className="flex items-center gap-2">
                                    <PlugZap className="size-3.5 text-foreground/50" />
                                    <span className="font-medium text-foreground">{pay.name || pay.id}</span>
                                    <span className="text-foreground/40">({pay.id})</span>
                                </div>
                                <span className="text-foreground/40">支付渠道</span>
                            </div>
                        ))}
                        {!canvasNodes.length && !providers.length && !paymentProviders.length ? (
                            <div className="text-xs text-foreground/40">暂无特殊声明节点或通道</div>
                        ) : null}
                    </div>
                </div>

                {/* 配置提示与快捷入口 */}
                {manifest.id === EAGLE_PLUGIN_ID ? (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5">
                        <div className="font-medium text-xs text-primary mb-1">Eagle 素材库配置</div>
                        <p className="text-xs text-foreground/70 mb-2">Eagle 本地 API 服务地址与归档目录在“插件中心”配置并生效。</p>
                        <Button
                            size="small"
                            type="link"
                            icon={<ExternalLink className="size-3.5" />}
                            className="p-0"
                            onClick={() => {
                                onClose();
                                navigate("/plugins");
                            }}
                        >
                            前往插件中心配置 Eagle
                        </Button>
                    </div>
                ) : manifest.id === RUNNINGHUB_PLUGIN_ID ? (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5">
                        <div className="font-medium text-xs text-primary mb-1">RunningHub 工作流配置</div>
                        <p className="text-xs text-foreground/70 mb-2">RunningHub API Key 及模型节点映射在系统设置中统一维护。</p>
                        <Button
                            size="small"
                            type="link"
                            icon={<ExternalLink className="size-3.5" />}
                            className="p-0"
                            onClick={() => {
                                onClose();
                                navigate("/settings?section=runninghub");
                            }}
                        >
                            前往工作流设置
                        </Button>
                    </div>
                ) : null}

                {/* 上传插件的运维动作：下载包、覆盖更新、卸载 */}
                {isUploaded ? (
                    <div className="rounded-lg border border-border/70 bg-card/80 p-4">
                        <h4 className="mb-3 text-sm font-semibold text-foreground">包管理与运维</h4>
                        <div className="flex flex-wrap items-center gap-3">
                            <Button
                                icon={<Download className="size-4" />}
                                onClick={() => void onDownload()}
                            >
                                下载安装包
                            </Button>
                            <Upload
                                accept=".zhiying-plugin,.yingce-plugin,.zip"
                                showUploadList={false}
                                maxCount={1}
                                beforeUpload={(file) => {
                                    void onUpdate(file);
                                    return false;
                                }}
                            >
                                <Button icon={<UploadIcon className="size-4" />}>
                                    更新插件包
                                </Button>
                            </Upload>
                            <Button
                                danger
                                icon={<Trash2 className="size-4" />}
                                onClick={onRemove}
                            >
                                卸载插件
                            </Button>
                        </div>
                        <p className="mt-2 text-xs text-foreground/45">
                            支持上传新版 .zhiying-plugin、.yingce-plugin 或 .zip 包原位热更新，不会清除现有用户的启用状态与平台配置。
                        </p>
                    </div>
                ) : null}
            </div>
        </Drawer>
    );
}
// @opc-feature: admin-plugin-enhancements [end]
