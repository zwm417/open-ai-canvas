import { useState } from "react";
import { Button, Input, InputNumber, Select, Tag, Tooltip, message } from "antd";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Server, ShieldCheck, Zap, Clock } from "lucide-react";
import type { ChannelSourceCard } from "../types";
import { useModelRouterStore } from "../model-router-store";

interface ModelSourceCardProps {
    card: ChannelSourceCard;
    modelId: string;
    onChange?: (updatedCard: ChannelSourceCard) => void;
    compact?: boolean;
}

export function ModelSourceCardView({ card, modelId, onChange, compact = false }: ModelSourceCardProps) {
    const { testModelConnectivity } = useModelRouterStore();
    const [testing, setTesting] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [draftCard, setDraftCard] = useState<ChannelSourceCard>(card);

    const handleRunTest = async () => {
        setTesting(true);
        try {
            const res = await testModelConnectivity(modelId);
            if (res.status === "healthy") {
                message.success(`连通测试通过！响应时延: ${res.latencyMs}ms`);
            } else {
                message.warning(`上游响应延迟过高 (${res.latencyMs}ms)，请留意波动`);
            }
        } finally {
            setTesting(false);
        }
    };

    const handleSaveEdit = () => {
        onChange?.(draftCard);
        setIsEditing(false);
        message.success("来源信息卡片已更新");
    };

    return (
        <div className="rounded-xl border border-border/80 bg-muted/20 p-4 shadow-sm backdrop-blur-sm transition-all hover:border-border">
            {/* 头部标题与协议来源徽标 */}
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2">
                    <Server className="size-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">协议详细信息 (来源卡片)</span>
                    <Tag color={card.protocolType === "system" ? "blue" : "purple"} className="rounded-full px-2 py-0.5 text-xs">
                        {card.protocolType === "system" ? "系统协议 (Built-in)" : "插件协议 (zhiying.plugin/v1)"}
                    </Tag>
                </div>
                <div className="flex items-center gap-2">
                    {card.status === "untested" && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
                            <Clock className="size-3.5" /> 待测速
                        </span>
                    )}
                    {card.status === "healthy" && (
                        <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
                            <CheckCircle2 className="size-3.5" /> 正常在线
                        </span>
                    )}
                    {card.status === "warning" && (
                        <span className="flex items-center gap-1 text-xs text-amber-500 font-medium">
                            <AlertTriangle className="size-3.5" /> 延迟较高
                        </span>
                    )}
                    {card.status === "error" && (
                        <span className="flex items-center gap-1 text-xs text-destructive font-medium">
                            <XCircle className="size-3.5" /> 异常未连通
                        </span>
                    )}
                </div>
            </div>

            {/* 卡片核心字段内容 */}
            {!isEditing ? (
                <div className="mt-3 space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <span className="text-muted-foreground">渠道名称: </span>
                            <span className="font-medium text-foreground">{card.channelName}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">物理模型代码: </span>
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{card.upstreamModelId}</code>
                        </div>
                    </div>

                    <div>
                        <span className="text-muted-foreground">接口端点: </span>
                        <Tooltip title={card.endpoint}>
                            <span className="truncate font-mono text-[11px] text-muted-foreground/90 block max-w-[280px]">
                                {card.endpoint}
                            </span>
                        </Tooltip>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                            <span className="text-muted-foreground">鉴权模式: </span>
                            <span className="font-medium text-foreground">{card.authType}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">成片提取路径: </span>
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{card.extractPath}</code>
                        </div>
                    </div>

                    {card.lastLatencyMs && (
                        <div className="flex items-center justify-between rounded bg-muted/40 px-2.5 py-1.5 mt-2">
                            <span className="text-muted-foreground">最近测速: {card.lastTestedAt || "未知"}</span>
                            <span className="font-mono font-semibold text-emerald-500">{card.lastLatencyMs} ms</span>
                        </div>
                    )}

                    {/* 操作按钮组 */}
                    <div className="mt-3 flex items-center justify-end gap-2 pt-2 border-t border-border/50">
                        <Button size="small" onClick={() => setIsEditing(true)}>
                            人工复核修改
                        </Button>
                        <Button
                            size="small"
                            type="primary"
                            icon={<RefreshCw className={`size-3.5 ${testing ? "animate-spin" : ""}`} />}
                            loading={testing}
                            onClick={handleRunTest}
                        >
                            测试连通性
                        </Button>
                    </div>
                </div>
            ) : (
                /* 人工复核修改表单 */
                <div className="mt-3 space-y-2.5 text-xs">
                    <div>
                        <label className="text-muted-foreground mb-1 block">渠道服务商名称</label>
                        <Input
                            size="small"
                            value={draftCard.channelName}
                            onChange={(e) => setDraftCard({ ...draftCard, channelName: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="text-muted-foreground mb-1 block">上游物理模型代码 (Upstream Model ID)</label>
                        <Input
                            size="small"
                            value={draftCard.upstreamModelId}
                            onChange={(e) => setDraftCard({ ...draftCard, upstreamModelId: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="text-muted-foreground mb-1 block">请求接口端点 URL</label>
                        <Input
                            size="small"
                            value={draftCard.endpoint}
                            onChange={(e) => setDraftCard({ ...draftCard, endpoint: e.target.value })}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-muted-foreground mb-1 block">鉴权格式</label>
                            <Select
                                size="small"
                                className="w-full"
                                value={draftCard.authType}
                                onChange={(val) => setDraftCard({ ...draftCard, authType: val })}
                                options={[
                                    { value: "Bearer Token", label: "Bearer Token" },
                                    { value: "Raw Token", label: "Raw Token (无Bearer)" },
                                    { value: "Custom Header", label: "Custom Header" },
                                ]}
                            />
                        </div>
                        <div>
                            <label className="text-muted-foreground mb-1 block">超时阈值 (秒)</label>
                            <InputNumber
                                size="small"
                                className="w-full"
                                value={draftCard.timeoutSeconds}
                                onChange={(val) => setDraftCard({ ...draftCard, timeoutSeconds: val || 300 })}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-muted-foreground mb-1 block">成片提取 JSONPath 路径</label>
                        <Input
                            size="small"
                            value={draftCard.extractPath}
                            onChange={(e) => setDraftCard({ ...draftCard, extractPath: e.target.value })}
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                        <Button size="small" onClick={() => setIsEditing(false)}>
                            取消
                        </Button>
                        <Button size="small" type="primary" onClick={handleSaveEdit}>
                            保存修改
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
