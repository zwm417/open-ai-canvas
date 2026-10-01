import { useState } from "react";
import {
    Table,
    Button,
    Tag,
    Switch,
    Card,
    Drawer,
    Input,
    Select,
    Alert,
    message,
    Modal,
} from "antd";
import {
    PlugZap,
    Plus,
    Sparkles,
    CheckCircle2,
    AlertTriangle,
    FileCode,
    Cpu,
    ArrowRight,
    ShieldAlert,
} from "lucide-react";
import type { PluginProtocolItem } from "../types";
import { useModelRouterStore } from "../model-router-store";

export function PluginProtocolPanel() {
    const { plugins, togglePluginStatus, addPlugin, analyzePluginWithAI } = useModelRouterStore();
    const [drawerVisible, setDrawerVisible] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [rawSchemaInput, setRawSchemaInput] = useState("");
    const [pluginNameInput, setPluginNameInput] = useState("");
    const [analysisResult, setAnalysisResult] = useState<{
        differences: string[];
        canAutoRoute: boolean;
        suggestedGroup: string;
        suggestedFamily: string;
    } | null>(null);

    // 统计指标计算 (对齐 1.png 顶部统计卡片)
    const stats = {
        pluginVersion: "zhiying.plugin/v1",
        textCount: 3,
        imageCount: 18,
        videoCount: 24,
        enabledCount: plugins.filter((p) => p.status).length,
        disabledCount: plugins.filter((p) => !p.status).length,
    };

    // 触发一键 AI 分析 (Requirement 6)
    const handleRunAIAnalysis = async () => {
        if (!rawSchemaInput.trim()) {
            message.warning("请先粘贴或导入插件 API 契约协议内容");
            return;
        }
        setAnalyzing(true);
        try {
            const res = await analyzePluginWithAI(rawSchemaInput);
            setAnalysisResult(res);
            message.success("AI 协议差异分析完成！");
        } finally {
            setAnalyzing(false);
        }
    };

    // 一键归入小分组 (Requirement 6)
    const handleOneClickGroup = () => {
        if (!analysisResult) return;
        const newPlugin: PluginProtocolItem = {
            id: `plugin-${Date.now()}`,
            name: pluginNameInput.trim() || `定制插件协议-${Date.now().toString().slice(-4)}`,
            version: "v1.0.0",
            author: "AI 智能自动导入",
            capability: analysisResult.suggestedGroup === "生视频" ? "video" : "image",
            billingRule: analysisResult.suggestedGroup === "生视频" ? "按秒计费" : "按次计费",
            scope: "专项渠道",
            status: true,
            description: `通过 AI 差异分析自动归入【${analysisResult.suggestedGroup}】分组，已预置开关兜底规则。`,
            differencesFromStandard: analysisResult.differences,
            canAutoRouteBySwitch: true,
        };

        addPlugin(newPlugin);
        message.success(`插件【${newPlugin.name}】已成功归入【${analysisResult.suggestedGroup}】分组！`);
        setDrawerVisible(false);
        setRawSchemaInput("");
        setPluginNameInput("");
        setAnalysisResult(null);
    };

    return (
        <div className="space-y-5">
            {/* 顶部统计卡片组 (对齐 1.png 顶部架构) */}
            <div className="grid grid-cols-5 gap-3.5">
                <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
                    <span className="text-xs text-muted-foreground block">平台插件规范版本</span>
                    <span className="text-base font-bold font-mono text-primary mt-1 block">
                        {stats.pluginVersion}
                    </span>
                    <span className="text-[10px] text-emerald-500 font-medium">✓ 标准规范就绪</span>
                </div>
                <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
                    <span className="text-xs text-muted-foreground block">文本/思考协议数</span>
                    <span className="text-xl font-bold text-foreground mt-1 block">{stats.textCount}</span>
                    <span className="text-[10px] text-muted-foreground">支持流式/重写</span>
                </div>
                <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
                    <span className="text-xs text-muted-foreground block">生图片协议数</span>
                    <span className="text-xl font-bold text-cyan-500 mt-1 block">{stats.imageCount}</span>
                    <span className="text-[10px] text-muted-foreground">含 Inpaint/4K</span>
                </div>
                <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
                    <span className="text-xs text-muted-foreground block">生视频协议数</span>
                    <span className="text-xl font-bold text-purple-500 mt-1 block">{stats.videoCount}</span>
                    <span className="text-[10px] text-muted-foreground">全模态自适应</span>
                </div>
                <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
                    <span className="text-xs text-muted-foreground block">已启用 / 停用渠道</span>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xl font-bold text-emerald-500">{stats.enabledCount}</span>
                        <span className="text-xs text-muted-foreground">/</span>
                        <span className="text-sm font-semibold text-muted-foreground">{stats.disabledCount}</span>
                    </div>
                    <span className="text-[10px] text-emerald-500 font-medium">健康在线</span>
                </div>
            </div>

            {/* 列表头部与操作 */}
            <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                    <PlugZap className="size-5 text-primary" />
                    <div>
                        <h2 className="text-sm font-bold text-foreground">插件管理与渠道协议列表</h2>
                        <p className="text-xs text-muted-foreground">
                            查看已接入的系统协议与第三方插件渠道，支持一键 AI 分析并自动归入分组。
                        </p>
                    </div>
                </div>

                <Button
                    type="primary"
                    icon={<Plus className="size-4" />}
                    onClick={() => setDrawerVisible(true)}
                >
                    新增插件渠道 (AI 分析)
                </Button>
            </div>

            {/* 插件表格 (对齐 1.png) */}
            <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                <Table
                    rowKey="id"
                    dataSource={plugins}
                    pagination={false}
                    size="small"
                    columns={[
                        {
                            title: "插件名称",
                            dataIndex: "name",
                            key: "name",
                            render: (text, record: PluginProtocolItem) => (
                                <div>
                                    <span className="font-semibold text-xs text-foreground block">{text}</span>
                                    <span className="text-[10px] text-muted-foreground font-mono">{record.id}</span>
                                </div>
                            ),
                        },
                        {
                            title: "能力类别",
                            dataIndex: "capability",
                            key: "capability",
                            render: (cap) => (
                                <Tag color={cap === "video" ? "purple" : "cyan"} className="text-xs">
                                    {cap === "video" ? "生视频" : "生图片"}
                                </Tag>
                            ),
                        },
                        {
                            title: "计费规则",
                            dataIndex: "billingRule",
                            key: "billingRule",
                            render: (rule) => <Tag color="blue">{rule}</Tag>,
                        },
                        {
                            title: "作用范围",
                            dataIndex: "scope",
                            key: "scope",
                            render: (scope) => (
                                <Tag color={scope === "全量渠道" ? "green" : "orange"}>{scope}</Tag>
                            ),
                        },
                        {
                            title: "版本与维护者",
                            key: "version",
                            render: (_, record: PluginProtocolItem) => (
                                <span className="text-xs text-muted-foreground">
                                    {record.version} · {record.author}
                                </span>
                            ),
                        },
                        {
                            title: "平台状态",
                            dataIndex: "status",
                            key: "status",
                            render: (status, record: PluginProtocolItem) => (
                                <Switch
                                    size="small"
                                    checked={status}
                                    onChange={(checked) => togglePluginStatus(record.id, checked)}
                                    checkedChildren="启用"
                                    unCheckedChildren="停用"
                                />
                            ),
                        },
                        {
                            title: "操作",
                            key: "action",
                            render: (_, record: PluginProtocolItem) => (
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="small"
                                        icon={<Sparkles className="size-3 text-primary" />}
                                        onClick={() => {
                                            Modal.info({
                                                title: `${record.name} · 协议参数契约`,
                                                width: 600,
                                                content: (
                                                    <div className="space-y-2 mt-3 text-xs">
                                                        <p className="text-muted-foreground">{record.description}</p>
                                                        {record.differencesFromStandard && (
                                                            <div className="rounded bg-muted/40 p-2.5 space-y-1">
                                                                <span className="font-semibold block">协议格式差异说明：</span>
                                                                {record.differencesFromStandard.map((d, i) => (
                                                                    <div key={i} className="text-muted-foreground">
                                                                        • {d}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                        <div className="text-emerald-500 font-medium">
                                                            ✓ 支持根据 Switch 开关一键智能路由
                                                        </div>
                                                    </div>
                                                ),
                                            });
                                        }}
                                    >
                                        协议详情
                                    </Button>
                                </div>
                            ),
                        },
                    ]}
                />
            </div>

            {/* Requirement 6: 独立抽屉【新增插件渠道与一键 AI 分析匹配】 */}
            <Drawer
                open={drawerVisible}
                onClose={() => setDrawerVisible(false)}
                width={560}
                title={
                    <div className="flex items-center gap-2">
                        <Sparkles className="size-4 text-primary" />
                        <span className="text-sm font-bold">新增插件渠道 · 一键 AI 差异分析与自动归组</span>
                    </div>
                }
            >
                <div className="space-y-4 text-xs">
                    <Alert
                        type="info"
                        showIcon
                        message="读取插件契约后，AI 将自动分析与系统已有模型格式的差异。如果差异可通过开关矩阵一键兼容，即可直接归入对应子分组！"
                    />

                    <div>
                        <label className="text-xs font-semibold text-foreground mb-1 block">插件名称</label>
                        <Input
                            placeholder="如：豆包视频新接口插件 / Wan3 扩展渠道"
                            value={pluginNameInput}
                            onChange={(e) => setPluginNameInput(e.target.value)}
                        />
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-semibold text-foreground">
                                插件 API 契约协议内容 (JSON / Schema)
                            </label>
                            <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground">快速载入模板:</span>
                                <Button
                                    size="small"
                                    type="text"
                                    className="text-[10px] h-5 px-1 text-primary"
                                    onClick={() => {
                                        setPluginNameInput("豆包视频新接口插件");
                                        setRawSchemaInput(JSON.stringify({
                                            name: "doubao-video-plugin",
                                            version: "1.0.0",
                                            parameters: {
                                                prompt: "string",
                                                resolution: "1080p",
                                                aspect_ratio: "16:9",
                                                duration: 10,
                                                adaptive: true,
                                                fps: 24,
                                            },
                                        }, null, 2));
                                    }}
                                >
                                    豆包Seedance
                                </Button>
                                <Button
                                    size="small"
                                    type="text"
                                    className="text-[10px] h-5 px-1 text-primary"
                                    onClick={() => {
                                        setPluginNameInput("通义万相3.0插件");
                                        setRawSchemaInput(JSON.stringify({
                                            name: "wanx-3.0-plugin",
                                            version: "1.2.0",
                                            parameters: {
                                                prompt: "string",
                                                image_url: "string",
                                                size: "1280*720",
                                                duration: 5,
                                                base64_required: true,
                                            },
                                        }, null, 2));
                                    }}
                                >
                                    通义万相
                                </Button>
                            </div>
                        </div>
                        <Input.TextArea
                            rows={6}
                            placeholder='粘贴 JSON 或协议描述，例如：{"name": "my-video-api", "parameters": {"prompt": "string", "image_url": "string", "duration": 10, "adaptive": true}}'
                            value={rawSchemaInput}
                            onChange={(e) => setRawSchemaInput(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center justify-end">
                        <Button
                            type="primary"
                            icon={<Sparkles className="size-3.5" />}
                            loading={analyzing}
                            onClick={handleRunAIAnalysis}
                        >
                            ⚡ 一键 AI 差异分析匹配
                        </Button>
                    </div>

                    {/* AI 差异比对结果与一键归组 */}
                    {analysisResult && (
                        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-3 mt-4">
                            <div className="flex items-center justify-between border-b border-primary/20 pb-2">
                                <span className="font-semibold text-foreground flex items-center gap-1.5">
                                    <CheckCircle2 className="size-4 text-emerald-500" />
                                    AI 格式差异比对报告
                                </span>
                                <Tag color="purple">{analysisResult.suggestedGroup}</Tag>
                            </div>

                            <div className="space-y-1.5">
                                <span className="font-medium text-foreground block">检出的协议格式差异项：</span>
                                {analysisResult.differences.map((diff, idx) => (
                                    <div key={idx} className="flex items-start gap-1.5 text-muted-foreground">
                                        <span className="text-amber-500 font-bold">•</span>
                                        <span>{diff}</span>
                                    </div>
                                ))}
                            </div>

                            {/* 开关默认值与强制兜底保证说明 (Requirement 6) */}
                            <div className="rounded-lg bg-card/60 p-2.5 border border-border/80 text-[11px] space-y-1">
                                <div className="flex items-center gap-1 text-primary font-semibold">
                                    <ShieldAlert className="size-3.5" />
                                    开关默认值与后端安全兜底规则已自动就绪：
                                </div>
                                <p className="text-muted-foreground">
                                    已根据分析结果自动预置该渠道每个 Switch 的默认值。若管理员强制开启前端展示，用户选择非原生值时，出站将由后端自动替换为安全默认值，绝对防止上游报错。
                                </p>
                            </div>

                            <div className="flex items-center justify-end pt-2 border-t border-primary/20">
                                <Button
                                    type="primary"
                                    icon={<ArrowRight className="size-4" />}
                                    onClick={handleOneClickGroup}
                                >
                                    一键归入【{analysisResult.suggestedGroup}】分组
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </Drawer>
        </div>
    );
}
