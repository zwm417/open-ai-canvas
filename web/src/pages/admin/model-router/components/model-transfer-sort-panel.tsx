import { useState, useMemo } from "react";
import {
    Input,
    Select,
    Button,
    Switch,
    Tag,
    Badge,
    Card,
    Tooltip,
    message,
} from "antd";
import {
    ArrowUp,
    ArrowDown,
    ChevronRight,
    ChevronLeft,
    GripVertical,
    Search,
    Trash2,
    CheckCircle2,
    Layers,
    Shuffle,
} from "lucide-react";
import type { FrontendModelItem, CapabilityType } from "../types";
import { useModelRouterStore } from "../model-router-store";
import { resolveCapability } from "../model-router-adapter";

export function ModelTransferSortPanel() {
    const { models, reorderModels, channels } = useModelRouterStore();
    const [activeCapability, setActiveCapability] = useState<"video" | "image">("video");
    const [selectedChannel, setSelectedChannel] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [groupEnabled, setGroupEnabled] = useState<boolean>(true);

    // 当前大类下已按当前 sortOrder 排序的模型
    const orderedModels = useMemo(() => {
        return models
            .filter((m) => resolveCapability(m.capability, m.code || m.id) === activeCapability)
            .sort((a, b) => a.sortOrder - b.sortOrder);
    }, [models, activeCapability]);

    // 本地编辑态的已选模型 ID 序列
    const [selectedIds, setSelectedIds] = useState<string[]>(() =>
        orderedModels.map((m) => m.id)
    );

    // 左侧选中的候选池模型 ID
    const [checkedLeftIds, setCheckedLeftIds] = useState<string[]>([]);
    // 右侧选中的模型 ID
    const [checkedRightIds, setCheckedRightIds] = useState<string[]>([]);

    // 当切换视频/图片时同步已选列表
    const handleTabChange = (cap: "video" | "image") => {
        setActiveCapability(cap);
        const nextList = models
            .filter((m) => resolveCapability(m.capability, m.code || m.id) === cap)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((m) => m.id);
        setSelectedIds(nextList);
        setCheckedLeftIds([]);
        setCheckedRightIds([]);
    };

    // 左侧可选模型（剔除已在右侧的模型，并按渠道与搜索过滤）
    const availablePool = useMemo(() => {
        return models
            .filter((m) => resolveCapability(m.capability, m.code || m.id) === activeCapability)
            .filter((m) => !selectedIds.includes(m.id))
            .filter((m) => selectedChannel === "all" || m.primaryChannelId === selectedChannel)
            .filter(
                (m) =>
                    !searchQuery ||
                    m.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    m.family.toLowerCase().includes(searchQuery.toLowerCase())
            );
    }, [models, activeCapability, selectedIds, selectedChannel, searchQuery]);

    // 右侧已选模型的对象列表
    const selectedModelObjects = useMemo(() => {
        const map = new Map(models.map((m) => [m.id, m]));
        return selectedIds.map((id) => map.get(id)).filter(Boolean) as FrontendModelItem[];
    }, [models, selectedIds]);

    // 穿梭操作：移到右侧
    const handleMoveToRight = () => {
        if (checkedLeftIds.length === 0) return;
        setSelectedIds([...selectedIds, ...checkedLeftIds]);
        setCheckedLeftIds([]);
    };

    // 穿梭操作：移出右侧
    const handleMoveToLeft = () => {
        if (checkedRightIds.length === 0) return;
        setSelectedIds(selectedIds.filter((id) => !checkedRightIds.includes(id)));
        setCheckedRightIds([]);
    };

    // 顺序微调：上移
    const handleMoveUp = (index: number) => {
        if (index <= 0) return;
        const next = [...selectedIds];
        const temp = next[index];
        next[index] = next[index - 1];
        next[index - 1] = temp;
        setSelectedIds(next);
    };

    // 顺序微调：下移
    const handleMoveDown = (index: number) => {
        if (index >= selectedIds.length - 1) return;
        const next = [...selectedIds];
        const temp = next[index];
        next[index] = next[index + 1];
        next[index + 1] = temp;
        setSelectedIds(next);
    };

    // 移除单项
    const handleRemoveOne = (id: string) => {
        setSelectedIds(selectedIds.filter((item) => item !== id));
    };

    // 保存排序
    const handleSaveOrder = () => {
        reorderModels(activeCapability, selectedIds);
        message.success(`【${activeCapability === "video" ? "生视频" : "生图片"}】前端展示排序已保存生效`);
    };

    return (
        <div className="space-y-4">
            {/* 顶部分组选择与切换 */}
            <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                    <Layers className="size-5 text-primary" />
                    <div>
                        <h2 className="text-sm font-bold text-foreground">模型分组穿梭框与前端展示排序</h2>
                        <p className="text-xs text-muted-foreground">
                            对齐参考设计：左侧可选模型池（按渠道筛选），右侧通过上下箭头调整前端创作端真实展示次序。
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        type={activeCapability === "video" ? "primary" : "default"}
                        size="small"
                        onClick={() => handleTabChange("video")}
                    >
                        生视频分组 ({models.filter((m) => m.capability === "video").length})
                    </Button>
                    <Button
                        type={activeCapability === "image" ? "primary" : "default"}
                        size="small"
                        onClick={() => handleTabChange("image")}
                    >
                        生图片分组 ({models.filter((m) => m.capability === "image").length})
                    </Button>
                </div>
            </div>

            {/* 核心穿梭框布局 (对齐 2.png) */}
            <div className="grid grid-cols-12 gap-4 items-center">
                {/* 左列：可选模型池 */}
                <div className="col-span-5 rounded-xl border border-border bg-card p-3.5 shadow-sm flex flex-col h-[520px]">
                    <div className="flex items-center justify-between border-b border-border pb-2.5 mb-2.5">
                        <span className="text-xs font-bold text-foreground">
                            可选模型池 ({availablePool.length})
                        </span>
                        <Tag color="default" className="text-[10px]">待添加</Tag>
                    </div>

                    {/* 筛选与搜索 */}
                    <div className="space-y-2 mb-2.5">
                        <Select
                            size="small"
                            className="w-full"
                            value={selectedChannel}
                            onChange={setSelectedChannel}
                            options={[
                                { value: "all", label: "全部渠道" },
                                ...channels.map((c) => ({ value: c.id, label: c.name })),
                            ]}
                        />
                        <Input
                            size="small"
                            prefix={<Search className="size-3 text-muted-foreground" />}
                            placeholder="搜索模型名称或家族..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* 可选模型列表 */}
                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                        {availablePool.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                                暂无匹配模型或已全量添加
                            </div>
                        ) : (
                            availablePool.map((m) => {
                                const isChecked = checkedLeftIds.includes(m.id);
                                return (
                                    <div
                                        key={m.id}
                                        onClick={() => {
                                            setCheckedLeftIds(
                                                isChecked
                                                    ? checkedLeftIds.filter((id) => id !== m.id)
                                                    : [...checkedLeftIds, m.id]
                                            );
                                        }}
                                        className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                                            isChecked
                                                ? "border-primary bg-primary/10 text-primary font-medium"
                                                : "border-border/60 hover:bg-muted/30"
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => {}}
                                                className="rounded text-primary"
                                            />
                                            <span className="font-medium">{m.displayName}</span>
                                        </div>
                                        <Tag color="cyan" className="text-[10px] m-0">
                                            {m.family}
                                        </Tag>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* 中间：穿梭操作按钮 */}
                <div className="col-span-2 flex flex-col items-center justify-center gap-3">
                    <Button
                        type="primary"
                        icon={<ChevronRight className="size-4" />}
                        disabled={checkedLeftIds.length === 0}
                        onClick={handleMoveToRight}
                    >
                        加入分组
                    </Button>
                    <Button
                        icon={<ChevronLeft className="size-4" />}
                        disabled={checkedRightIds.length === 0}
                        onClick={handleMoveToLeft}
                    >
                        移出分组
                    </Button>
                </div>

                {/* 右列：已选模型展示序列 (支持上下微调排序) */}
                <div className="col-span-5 rounded-xl border border-border bg-card p-3.5 shadow-sm flex flex-col h-[520px]">
                    <div className="flex items-center justify-between border-b border-border pb-2.5 mb-2.5">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-foreground">
                                已选展示模型 ({selectedModelObjects.length})
                            </span>
                            <span className="text-[10px] text-muted-foreground">（按序号由上至下展示）</span>
                        </div>
                        <Tag color="green" className="text-[10px]">生效中</Tag>
                    </div>

                    {/* 已选模型排序列表 */}
                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                        {selectedModelObjects.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                                列表为空，请从左侧添加模型
                            </div>
                        ) : (
                            selectedModelObjects.map((m, index) => {
                                const isChecked = checkedRightIds.includes(m.id);
                                return (
                                    <div
                                        key={m.id}
                                        className={`flex items-center justify-between p-2 rounded-lg border text-xs transition-colors ${
                                            isChecked
                                                ? "border-primary bg-primary/10"
                                                : "border-border/60 hover:bg-muted/30"
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={(e) => {
                                                    setCheckedRightIds(
                                                        e.target.checked
                                                            ? [...checkedRightIds, m.id]
                                                            : checkedRightIds.filter((id) => id !== m.id)
                                                    );
                                                }}
                                                className="rounded text-primary"
                                            />
                                            <span className="w-5 font-mono text-center font-bold text-muted-foreground text-[11px]">
                                                {index + 1}
                                            </span>
                                            <GripVertical className="size-3.5 text-muted-foreground cursor-grab" />
                                            <div>
                                                <span className="font-semibold text-foreground block">
                                                    {m.displayName}
                                                </span>
                                                {m.showSubtitle && m.subtitle && (
                                                    <span className="text-[10px] text-muted-foreground truncate block max-w-[150px]">
                                                        {m.subtitle}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1">
                                            <Tooltip title="向上移动一位">
                                                <Button
                                                    size="small"
                                                    type="text"
                                                    disabled={index === 0}
                                                    icon={<ArrowUp className="size-3" />}
                                                    onClick={() => handleMoveUp(index)}
                                                />
                                            </Tooltip>
                                            <Tooltip title="向下移动一位">
                                                <Button
                                                    size="small"
                                                    type="text"
                                                    disabled={index === selectedModelObjects.length - 1}
                                                    icon={<ArrowDown className="size-3" />}
                                                    onClick={() => handleMoveDown(index)}
                                                />
                                            </Tooltip>
                                            <Tooltip title="从分组中移除">
                                                <Button
                                                    size="small"
                                                    type="text"
                                                    danger
                                                    icon={<Trash2 className="size-3" />}
                                                    onClick={() => handleRemoveOne(m.id)}
                                                />
                                            </Tooltip>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* 底部控制栏 */}
            <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/20 p-3.5 mt-2">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">启用该分组:</span>
                    <Switch
                        checked={groupEnabled}
                        onChange={setGroupEnabled}
                        checkedChildren="开"
                        unCheckedChildren="关"
                    />
                    <span className="text-xs text-muted-foreground ml-2">
                        关闭后整个【{activeCapability === "video" ? "生视频" : "生图片"}】模块将在前端导航中隐藏。
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <Button onClick={() => handleTabChange(activeCapability)}>重置未保存次序</Button>
                    <Button type="primary" onClick={handleSaveOrder}>
                        保存当前展示排序
                    </Button>
                </div>
            </div>
        </div>
    );
}
