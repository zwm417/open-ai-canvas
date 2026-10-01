// @opc-feature: hypit [start]
import { useState } from "react";
import { App, Modal, Input, Popconfirm, message as staticMessage } from "antd";
import { User, Package, Home, Zap, GitFork, RefreshCw, X } from "lucide-react";
import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CreativeReplicationMasterSlots } from "../prompts/hypit-director-prompts";

export interface CreativeMasterSlotsBarProps {
    masterSlots: CreativeReplicationMasterSlots;
    onChangeMasterSlots: (slots: CreativeReplicationMasterSlots) => void;
    onHotSwap: (productNameSwap?: { oldName: string; newName: string; newSpoken?: string }) => void;
    onForkVariation?: () => void;
    onDeleteVariation?: (id: string) => void;
    variations?: Array<{ id: string; name: string }>;
    activeVariationId?: string;
    onSelectVariation?: (id: string) => void;
    hasShots: boolean;
    theme: CanvasTheme;
}

const COMMON_SCENE_OPTIONS = [
    "现代简约卧室 (暖木色调与自然窗光)",
    "明亮日式自然光浴室 (清爽洁净感)",
    "专业皮肤科诊疗室 (极简白色调与科技感)",
    "温馨生活化厨房与餐台",
    "户外阳光公园与自然绿意",
    "高端商务办公室与咖啡角",
];

export function CreativeMasterSlotsBar({
    masterSlots,
    onChangeMasterSlots,
    onHotSwap,
    onForkVariation,
    onDeleteVariation,
    variations,
    activeVariationId,
    onSelectVariation,
    hasShots,
    theme,
}: CreativeMasterSlotsBarProps) {
    const { message: appMessage } = App.useApp();
    const message = appMessage || staticMessage;
    const [editSlot, setEditSlot] = useState<"actor" | "product" | "scene" | null>(null);
    const [editForm, setEditForm] = useState<{ name: string; promptAnchor: string }>({ name: "", promptAnchor: "" });
    const [hotSwapModalOpen, setHotSwapModalOpen] = useState(false);
    const [oldProdName, setOldProdName] = useState("");
    const [newProdName, setNewProdName] = useState("");
    const [newSpoken, setNewSpoken] = useState("");

    const openEdit = (slotType: "actor" | "product" | "scene") => {
        const item = masterSlots[slotType];
        setEditForm({
            name: item?.name || "",
            promptAnchor: item?.promptAnchor || "",
        });
        setEditSlot(slotType);
    };

    const handleSaveSlot = () => {
        if (!editSlot) return;
        const updated = {
            ...masterSlots,
            [editSlot]: {
                ...masterSlots[editSlot],
                name: editForm.name.trim() || (editSlot === "actor" ? "出镜主角" : editSlot === "product" ? "商品" : "场景"),
                promptAnchor: editForm.promptAnchor.trim(),
            },
        };
        onChangeMasterSlots(updated);
        setEditSlot(null);
        message.success(`已更新${editSlot === "actor" ? "角色" : editSlot === "product" ? "商品" : "场景"}母版`);
    };

    const handleTriggerHotSwap = () => {
        if (!hasShots) {
            message.info("当前暂无分镜可快换，请先生成创意复刻分镜");
            return;
        }
        setOldProdName(masterSlots.product?.name || "");
        setNewProdName(masterSlots.product?.name || "");
        setNewSpoken("");
        setHotSwapModalOpen(true);
    };

    const confirmHotSwap = () => {
        setHotSwapModalOpen(false);
        const nameSwap =
            oldProdName.trim() && newProdName.trim() && oldProdName.trim() !== newProdName.trim()
                ? { oldName: oldProdName.trim(), newName: newProdName.trim(), newSpoken: newSpoken.trim() || undefined }
                : undefined;
        onHotSwap(nameSwap);
    };

    return (
        <div
            className="flex flex-col gap-2 rounded-lg border p-2.5 text-[11px] transition-all"
            style={{
                background: theme.node.panel,
                borderColor: theme.node.stroke,
            }}
        >
            {/* 顶栏：标题与变体管理 */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-medium text-stone-800 dark:text-stone-200">
                    <span className="flex items-center justify-center size-4 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Zap className="size-2.5" />
                    </span>
                    <span className="font-semibold">全局母版资产槽</span>
                    <span className="text-[10px] text-neutral-400">(换人 / 换品 / 换场景热插拔)</span>
                </div>

                <div className="flex items-center gap-1.5">
                    {variations && variations.length > 0 && (
                        <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 rounded p-0.5">
                            {variations.map((v, idx) => {
                                const isActive = activeVariationId === v.id;
                                const isDerived = idx > 0;
                                return (
                                    <div
                                        key={v.id}
                                        className={`group/var flex items-center rounded text-[10px] font-medium transition-colors ${
                                            isActive
                                                ? "bg-amber-500 text-white shadow-2xs"
                                                : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-black/5 dark:hover:bg-white/5"
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => onSelectVariation?.(v.id)}
                                            className="px-1.5 py-0.5 cursor-pointer truncate max-w-[120px]"
                                            title={`切换至 ${v.name}`}
                                        >
                                            {v.name}
                                        </button>
                                        {onDeleteVariation && isDerived && variations.length > 1 && (
                                            <Popconfirm
                                                title="删除版本变体"
                                                description={`确定删除「${v.name}」？此操作无法撤销。`}
                                                onConfirm={(e) => {
                                                    e?.stopPropagation();
                                                    onDeleteVariation(v.id);
                                                }}
                                                onCancel={(e) => e?.stopPropagation()}
                                                okText="删除"
                                                cancelText="取消"
                                                okButtonProps={{ danger: true, size: "small" }}
                                                cancelButtonProps={{ size: "small" }}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className={`mr-1 p-0.5 rounded-full cursor-pointer transition-all ${
                                                        isActive
                                                            ? "text-white/80 hover:text-white hover:bg-white/20"
                                                            : "text-stone-400 hover:text-rose-500 hover:bg-black/10 dark:hover:bg-white/10"
                                                    }`}
                                                    title={`删除「${v.name}」`}
                                                >
                                                    <X className="size-2.5" />
                                                </button>
                                            </Popconfirm>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {onForkVariation && (
                        <button
                            type="button"
                            onClick={onForkVariation}
                            className="inline-flex items-center gap-1 rounded border border-amber-300/80 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/40 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60 cursor-pointer transition-colors shadow-2xs"
                            title="派生一个保留当前分镜结构但可独立换皮的新变体"
                        >
                            <GitFork className="size-2.5" />
                            <span>派生新变体</span>
                        </button>
                    )}
                </div>
            </div>

            {/* 三大卡位：角色 / 商品 / 场景 */}
            <div className="grid grid-cols-3 gap-1.5">
                {/* 1. 全局角色 */}
                <div
                    onClick={() => openEdit("actor")}
                    className="flex flex-col gap-1 rounded border p-1.5 transition-all hover:border-amber-400 cursor-pointer bg-white/60 dark:bg-stone-900/60"
                    style={{ borderColor: theme.node.stroke }}
                    title="点击修改出镜主播设定与人设母图"
                >
                    <div className="flex items-center justify-between text-neutral-400 text-[10px]">
                        <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400 font-medium">
                            <User className="size-3" />
                            <span>👤 角色 (Actor)</span>
                        </span>
                        <span className="text-[9px] hover:text-amber-500">编辑</span>
                    </div>
                    <div className="font-semibold text-stone-800 dark:text-stone-200 truncate">
                        {masterSlots.actor?.name || "出镜主角"}
                    </div>
                    <div className="text-[9px] text-neutral-400 line-clamp-1">
                        {masterSlots.actor?.promptAnchor || "默认20多岁女性清纯主播"}
                    </div>
                </div>

                {/* 2. 全局商品 */}
                <div
                    onClick={() => openEdit("product")}
                    className="flex flex-col gap-1 rounded border p-1.5 transition-all hover:border-amber-400 cursor-pointer bg-white/60 dark:bg-stone-900/60"
                    style={{ borderColor: theme.node.stroke }}
                    title="点击修改商品品名与材质外观"
                >
                    <div className="flex items-center justify-between text-neutral-400 text-[10px]">
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                            <Package className="size-3" />
                            <span>📦 商品 (Product)</span>
                        </span>
                        <span className="text-[9px] hover:text-amber-500">编辑</span>
                    </div>
                    <div className="font-semibold text-stone-800 dark:text-stone-200 truncate">
                        {masterSlots.product?.name || "输入商品"}
                    </div>
                    <div className="text-[9px] text-neutral-400 line-clamp-1">
                        {masterSlots.product?.promptAnchor || "依据用户输入商品图锁定"}
                    </div>
                </div>

                {/* 3. 全局场景 */}
                <div
                    onClick={() => openEdit("scene")}
                    className="flex flex-col gap-1 rounded border p-1.5 transition-all hover:border-amber-400 cursor-pointer bg-white/60 dark:bg-stone-900/60"
                    style={{ borderColor: theme.node.stroke }}
                    title="点击修改生活化场景与双对比色调"
                >
                    <div className="flex items-center justify-between text-neutral-400 text-[10px]">
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                            <Home className="size-3" />
                            <span>🏠 场景 (Scene)</span>
                        </span>
                        <span className="text-[9px] hover:text-amber-500">编辑</span>
                    </div>
                    <div className="font-semibold text-stone-800 dark:text-stone-200 truncate">
                        {masterSlots.scene?.name || "极简生活场景"}
                    </div>
                    <div className="text-[9px] text-neutral-400 line-clamp-1">
                        {masterSlots.scene?.promptAnchor || "现代简约卧室 (暖木色调与窗光)"}
                    </div>
                </div>
            </div>

            {/* 极速热插拔执行按钮（台词与时序绝对冻结，大模型 0 介入） */}
            {hasShots && (
                <div className="flex items-center justify-between pt-1 border-t border-dashed" style={{ borderColor: theme.node.stroke }}>
                    <span className="text-[10px] text-stone-400">
                        ⚡ 修改母版后，可一键将新角色/新产品/新场景秒级穿透至所有分镜
                    </span>
                    <button
                        type="button"
                        onClick={handleTriggerHotSwap}
                        className="inline-flex items-center gap-1.5 rounded bg-gradient-to-r from-amber-500 to-orange-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-2xs hover:from-amber-600 hover:to-orange-600 active:scale-95 cursor-pointer transition-all"
                    >
                        <RefreshCw className="size-3" />
                        <span>1秒零重算资产快换</span>
                    </button>
                </div>
            )}

            {/* 槽位编辑弹窗 */}
            <Modal
                title={`编辑${editSlot === "actor" ? "全局角色" : editSlot === "product" ? "全局商品" : "全局场景"}母版`}
                open={Boolean(editSlot)}
                onOk={handleSaveSlot}
                onCancel={() => setEditSlot(null)}
                okText="保存母版"
                cancelText="取消"
                width={420}
            >
                <div className="flex flex-col gap-3 py-2 text-xs">
                    <div>
                        <div className="mb-1 font-medium text-stone-700 dark:text-stone-300">
                            {editSlot === "actor" ? "角色名称 / 称呼" : editSlot === "product" ? "商品品名" : "场景名称"}
                        </div>
                        <Input
                            value={editForm.name}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                            placeholder={editSlot === "actor" ? "例如：小美、职场御姐" : editSlot === "product" ? "例如：次抛玻尿酸、控油洗面奶" : "例如：日式浴室、自然阳光卧室"}
                        />
                    </div>
                    <div>
                        <div className="mb-1 font-medium text-stone-700 dark:text-stone-300">
                            Prompt 锚点描述
                        </div>
                        <Input.TextArea
                            rows={3}
                            value={editForm.promptAnchor}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, promptAnchor: e.target.value }))}
                            placeholder={
                                editSlot === "actor"
                                    ? "例如：A Chinese girl in her mid-twenties, exceptionally beautiful, very broad shoulders and excellent head-to-shoulder proportions..."
                                    : editSlot === "product"
                                      ? "例如：Minimalist white bottle packaging with metallic pump, fine matte texture, crystal clear liquid..."
                                      : "例如：Modern minimalist bedroom setting with natural window lighting, warm wood tones and terracotta accents..."
                            }
                        />
                    </div>
                    {editSlot === "scene" && (
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-neutral-400">常用场景快速套用：</span>
                            <div className="flex flex-wrap gap-1">
                                {COMMON_SCENE_OPTIONS.map((sc, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() =>
                                            setEditForm({
                                                name: sc.split(" (")[0],
                                                promptAnchor: sc,
                                            })
                                        }
                                        className="rounded border border-stone-200 dark:border-stone-700 px-1.5 py-0.5 text-[10px] text-stone-600 dark:text-stone-300 hover:border-amber-400 cursor-pointer"
                                    >
                                        {sc.split(" (")[0]}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </Modal>

            {/* 零重算换皮确认弹窗 */}
            <Modal
                title="⚡ 零重算资产快换确认"
                open={hotSwapModalOpen}
                onOk={confirmHotSwap}
                onCancel={() => setHotSwapModalOpen(false)}
                okText="立即穿透刷新分镜"
                cancelText="取消"
                width={440}
            >
                <div className="flex flex-col gap-2.5 py-2 text-xs">
                    <p className="text-stone-500 leading-relaxed">
                        系统将以当前母版槽设定的<strong>【角色、商品、场景】</strong>无缝穿透刷新所有分镜提示词与视觉锚点。
                        <br />
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            ✓ 台词字数、分镜秒数、字级时间戳与运镜轨迹 100% 保持冻结不动！
                            <br />✓ 大模型调用 Token 消耗 = 0！
                        </span>
                    </p>

                    <div className="rounded border border-amber-200/80 bg-amber-50/50 dark:border-amber-950 dark:bg-amber-950/20 p-2 flex flex-col gap-2">
                        <div className="font-semibold text-amber-800 dark:text-amber-200 text-[11px]">
                            台词品名智能替换 (Smart Product Token)：
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <span className="text-[10px] text-neutral-400">原品名 (分镜中将被替换)：</span>
                                <Input size="small" value={oldProdName} onChange={(e) => setOldProdName(e.target.value)} />
                            </div>
                            <div>
                                <span className="text-[10px] text-neutral-400">新品名 (替换后的品名)：</span>
                                <Input size="small" value={newProdName} onChange={(e) => setNewProdName(e.target.value)} />
                            </div>
                        </div>
                        <div>
                            <span className="text-[10px] text-neutral-400">新品朗读纠错 Dual-Text (选填，防TTS读错)：</span>
                            <Input
                                size="small"
                                value={newSpoken}
                                onChange={(e) => setNewSpoken(e.target.value)}
                                placeholder="例如：新品叫“次抛”，发音填“刺袍”"
                            />
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
// @opc-feature: hypit [end]
