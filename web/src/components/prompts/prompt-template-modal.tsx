// @opc-feature: creative-prompt-templates [start]
import { useState, useMemo, useEffect } from "react";
import { Modal, Input, Button, Tabs, Tag, message, Popconfirm, Select } from "antd";
import { Tooltip } from "@/components/ui/base/tooltip";
import { 
    Sparkles, 
    ImageIcon, 
    Video, 
    Clapperboard, 
    Search, 
    Plus, 
    Copy, 
    Check, 
    Pencil, 
    Trash2, 
    Save, 
    CornerDownLeft,
    CheckCircle2
} from "lucide-react";
import { 
    type CreativePromptKind, 
    type CreativePromptTemplate,
    fetchCreativePromptTemplates, 
    saveCreativePromptTemplate, 
    deleteCreativePromptTemplate,
    loadCachedTemplates
} from "@/services/api/creative-prompt-templates";

export type { CreativePromptKind, CreativePromptTemplate };

export interface PromptTemplateModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** 优先选中的子板块，匹配调用方输入框（生图->image, 生视频->video, 短剧/节点->drama） */
    defaultKind?: CreativePromptKind;
    /** 选用模板后的回调 */
    onSelect?: (content: string, template?: CreativePromptTemplate) => void;
    /** 初始模式：'select' 浏览选用模式，'save' 直接作为保存当前输入框为模板模式 */
    initialMode?: "select" | "save";
    /** 当从输入框点击“保存为模板”时传入的初始正文 */
    prefillContent?: string;
}

export function PromptTemplateModal({
    open,
    onOpenChange,
    defaultKind = "image",
    onSelect,
    initialMode = "select",
    prefillContent = "",
}: PromptTemplateModalProps) {
    const [activeKind, setActiveKind] = useState<CreativePromptKind>(defaultKind);
    const [searchQuery, setSearchQuery] = useState("");
    const [templates, setTemplates] = useState<CreativePromptTemplate[]>(() => loadCachedTemplates());
    const [loading, setLoading] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // 表单状态（新建 / 编辑 / 保存为模板）
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
    const [formKind, setFormKind] = useState<CreativePromptKind>(defaultKind);
    const [formName, setFormName] = useState("");
    const [formCategory, setFormCategory] = useState("");
    const [formTags, setFormTags] = useState("");
    const [formContent, setFormContent] = useState("");
    const [saving, setSaving] = useState(false);

    // 当弹窗打开时同步状态
    useEffect(() => {
        if (!open) {
            setIsFormOpen(false);
            setEditingTemplateId(null);
            setSearchQuery("");
            return;
        }

        const targetKind = defaultKind || "image";
        setActiveKind(targetKind);
        setFormKind(targetKind);

        // 如果是直接保存模式
        if (initialMode === "save") {
            setIsFormOpen(true);
            setEditingTemplateId(null);
            const kindText = targetKind === "image" ? "生图" : targetKind === "video" ? "生视频" : "短剧";
            const dateStr = new Date().toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
            setFormName(`${kindText}提示词 ${dateStr}`);
            setFormCategory(targetKind === "image" ? "改图提示词" : targetKind === "video" ? "生视频提示词" : "短剧分镜");
            setFormTags("自定义");
            setFormContent(prefillContent || "");
        } else {
            setIsFormOpen(false);
        }

        // 异步刷新
        setLoading(true);
        fetchCreativePromptTemplates("all")
            .then((list) => setTemplates(list))
            .finally(() => setLoading(false));
    }, [open, defaultKind, initialMode, prefillContent]);

    // 过滤列表
    const filteredTemplates = useMemo(() => {
        let list = templates.filter((item) => item.kind === activeKind);
        const query = searchQuery.trim().toLowerCase();
        if (!query) return list;
        return list.filter((item) => {
            const nameMatch = item.name.toLowerCase().includes(query);
            const contentMatch = item.content.toLowerCase().includes(query);
            const categoryMatch = item.category?.toLowerCase().includes(query);
            const tagsMatch = item.tags?.toLowerCase().includes(query);
            return nameMatch || contentMatch || categoryMatch || tagsMatch;
        });
    }, [templates, activeKind, searchQuery]);

    // 复制功能
    const handleCopy = (e: React.MouseEvent, item: CreativePromptTemplate) => {
        e.stopPropagation();
        navigator.clipboard.writeText(item.content);
        setCopiedId(item.id);
        message.success(`已复制提示词：${item.name}`);
        setTimeout(() => setCopiedId(null), 1800);
    };

    // 选用功能
    const handleApply = (item: CreativePromptTemplate) => {
        if (onSelect) {
            onSelect(item.content, item);
            message.success(`已应用模板：${item.name}`);
        }
        onOpenChange(false);
    };

    // 键盘 Esc 监听规范 (对齐 AGENTS.md 5.1 LIFO 栈式关闭与防穿透)
    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                if (isFormOpen) {
                    setIsFormOpen(false);
                } else {
                    onOpenChange(false);
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown, true);
        return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, [open, isFormOpen, onOpenChange]);

    // 打开编辑模式（内置模板自动作为副本新建，自定义模板支持直接修改）
    const handleOpenEdit = (e: React.MouseEvent, item: CreativePromptTemplate) => {
        e.stopPropagation();
        if (item.isBuiltin) {
            setEditingTemplateId(null);
            setFormKind(item.kind);
            setFormName(`${item.name} (自定义副本)`);
            setFormCategory(item.category || "自定义");
            setFormTags(item.tags || "自定义");
            setFormContent(item.content);
        } else {
            setEditingTemplateId(item.id);
            setFormKind(item.kind);
            setFormName(item.name);
            setFormCategory(item.category || "");
            setFormTags(item.tags || "");
            setFormContent(item.content);
        }
        setIsFormOpen(true);
    };

    // 打开新建模式
    const handleOpenCreate = () => {
        setEditingTemplateId(null);
        setFormKind(activeKind);
        const kindText = activeKind === "image" ? "生图" : activeKind === "video" ? "生视频" : "短剧";
        setFormName(`新建${kindText}模板`);
        setFormCategory(activeKind === "image" ? "改图提示词" : activeKind === "video" ? "生视频提示词" : "短剧分镜");
        setFormTags("自定义");
        setFormContent("");
        setIsFormOpen(true);
    };

    // 提交保存
    const handleSubmitSave = async () => {
        if (!formName.trim()) {
            message.warning("请输入模板名称");
            return;
        }
        if (!formContent.trim()) {
            message.warning("请输入模板正文内容");
            return;
        }

        setSaving(true);
        try {
            const saved = await saveCreativePromptTemplate({
                id: editingTemplateId || undefined,
                kind: formKind,
                name: formName.trim(),
                category: formCategory.trim() || "自定义",
                tags: formTags.trim() || "自定义",
                content: formContent.trim(),
            });
            message.success(editingTemplateId ? "模板修改成功" : "模板创建成功");
            // 更新当前列表
            setTemplates((prev) => {
                const idx = prev.findIndex((t) => t.id === saved.id);
                if (idx >= 0) {
                    const copy = [...prev];
                    copy[idx] = saved;
                    return copy;
                }
                return [saved, ...prev];
            });
            setIsFormOpen(false);
            setActiveKind(formKind);
        } catch (err: any) {
            message.error(err?.message || "保存失败");
        } finally {
            setSaving(false);
        }
    };

    // 删除模板
    const handleDelete = async (e: React.MouseEvent | undefined, id: string) => {
        e?.stopPropagation();
        try {
            await deleteCreativePromptTemplate(id);
            setTemplates((prev) => prev.filter((t) => t.id !== id));
            message.success("模板已删除");
        } catch (err: any) {
            message.error(err?.message || "删除失败");
        }
    };

    return (
        <Modal
            title={
                <div className="flex items-center justify-between pr-8">
                    <div className="flex items-center gap-2.5 text-base font-semibold">
                        <div className="grid size-7 place-items-center rounded-lg bg-amber-500/10 text-amber-500">
                            <Sparkles className="size-4" />
                        </div>
                        <div className="flex flex-col">
                            <span className="leading-tight">提示词模板库</span>
                            <span className="text-[11px] font-normal text-muted-foreground">
                                覆盖生图、生视频与短剧的高质感提示词资产，支持随时应用与自定义管理
                            </span>
                        </div>
                    </div>
                    {!isFormOpen && (
                        <Button
                            type="primary"
                            size="small"
                            icon={<Plus className="size-3.5" />}
                            onClick={handleOpenCreate}
                            className="bg-amber-600 hover:!bg-amber-500 text-xs font-medium"
                        >
                            新建模板
                        </Button>
                    )}
                </div>
            }
            open={open}
            onCancel={() => {
                setIsFormOpen(false);
                onOpenChange(false);
            }}
            footer={null}
            width={860}
            destroyOnClose
            centered
            className="creative-prompt-templates-modal"
            styles={{
                body: {
                    maxHeight: "75vh",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                }
            }}
        >
            {isFormOpen ? (
                /* ─── 新建 / 编辑 / 保存为模板表单界面 ─── */
                <div className="flex flex-col gap-4 py-2" onKeyDown={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between border-b pb-3 border-neutral-200 dark:border-neutral-800">
                        <span className="text-sm font-semibold flex items-center gap-2">
                            <Save className="size-4 text-amber-500" />
                            {editingTemplateId ? "编辑提示词模板" : initialMode === "save" ? "保存当前输入为模板" : "新建提示词模板"}
                        </span>
                        <Button size="small" type="text" onClick={() => setIsFormOpen(false)}>
                            返回列表
                        </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">归属子板块</label>
                            <Select
                                value={formKind}
                                onChange={setFormKind}
                                options={[
                                    { value: "image", label: "生图提示词（改图/控图）" },
                                    { value: "video", label: "生视频提示词（换头/商品/时序）" },
                                    { value: "drama", label: "短剧提示词（设定图/多机位/分镜）" },
                                ]}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">模板标题</label>
                            <Input
                                placeholder="例如：产品一致性故事板、生视频换模特"
                                value={formName}
                                onChange={(e) => setFormName(e.target.value)}
                                maxLength={60}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">分类标签</label>
                            <Input
                                placeholder="例如：改图提示词、生视频提示词、短剧分镜"
                                value={formCategory}
                                onChange={(e) => setFormCategory(e.target.value)}
                                maxLength={30}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">检索关键词 (逗号隔开)</label>
                            <Input
                                placeholder="例如：电商,换装,一致性"
                                value={formTags}
                                onChange={(e) => setFormTags(e.target.value)}
                                maxLength={60}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">提示词内容 (完整正文)</label>
                            <span className="text-[11px] text-neutral-400">{formContent.length} 字符</span>
                        </div>
                        <Input.TextArea
                            rows={8}
                            placeholder="输入或粘贴提示词正文，可包含 @图片、@视频 等占位符..."
                            value={formContent}
                            onChange={(e) => setFormContent(e.target.value)}
                            className="font-mono text-xs leading-relaxed"
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-2">
                        <Button onClick={() => setIsFormOpen(false)}>取消</Button>
                        <Button
                            type="primary"
                            loading={saving}
                            onClick={handleSubmitSave}
                            className="bg-amber-600 hover:!bg-amber-500 font-medium"
                        >
                            保存模板
                        </Button>
                    </div>
                </div>
            ) : (
                /* ─── 模板卡片浏览与选用界面 ─── */
                <div className="flex flex-col gap-3 py-1 flex-1 min-h-0" onKeyDown={(e) => e.stopPropagation()}>
                    {/* 3 个子板块顶部导航 */}
                    <div className="flex items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-2">
                        <Tabs
                            activeKey={activeKind}
                            onChange={(key) => setActiveKind(key as CreativePromptKind)}
                            className="flex-1 !mb-0"
                            items={[
                                {
                                    key: "image",
                                    label: (
                                        <span className="flex items-center gap-1.5 text-xs font-medium px-1">
                                            <ImageIcon className="size-4 text-emerald-500" />
                                            <span>生图提示词</span>
                                            <span className="ml-1 rounded-full bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.2 text-[10px] text-neutral-500">
                                                {templates.filter((t) => t.kind === "image").length}
                                            </span>
                                        </span>
                                    ),
                                },
                                {
                                    key: "video",
                                    label: (
                                        <span className="flex items-center gap-1.5 text-xs font-medium px-1">
                                            <Video className="size-4 text-indigo-500" />
                                            <span>生视频提示词</span>
                                            <span className="ml-1 rounded-full bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.2 text-[10px] text-neutral-500">
                                                {templates.filter((t) => t.kind === "video").length}
                                            </span>
                                        </span>
                                    ),
                                },
                                {
                                    key: "drama",
                                    label: (
                                        <span className="flex items-center gap-1.5 text-xs font-medium px-1">
                                            <Clapperboard className="size-4 text-amber-500" />
                                            <span>短剧提示词</span>
                                            <span className="ml-1 rounded-full bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.2 text-[10px] text-neutral-500">
                                                {templates.filter((t) => t.kind === "drama").length}
                                            </span>
                                        </span>
                                    ),
                                },
                            ]}
                        />
                        <div className="w-64">
                            <Input
                                size="small"
                                prefix={<Search className="size-3.5 opacity-50" />}
                                placeholder="搜索标题、内容或标签..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                allowClear
                                className="text-xs rounded-lg"
                            />
                        </div>
                    </div>

                    {/* 模版卡片网格列表 (参考 video-work 卡片设计) */}
                    <div className="flex-1 overflow-y-auto max-h-[56vh] pr-1.5 thin-scrollbar">
                        {filteredTemplates.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-2">
                                {filteredTemplates.map((item) => {
                                    const isCopied = copiedId === item.id;
                                    const tagList = item.tags ? item.tags.split(/[,，\s]+/).filter(Boolean) : [];

                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => handleApply(item)}
                                            className="group relative flex flex-col justify-between rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/70 p-3.5 hover:border-amber-500/60 dark:hover:border-amber-500/60 hover:shadow-md hover:shadow-amber-500/5 transition-all duration-200 cursor-pointer text-left"
                                        >
                                            {/* 顶部标题栏与工具栏 */}
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex flex-col min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-xs text-neutral-900 dark:text-neutral-100 truncate">
                                                            {item.name}
                                                        </span>
                                                        {item.isBuiltin ? (
                                                            <span className="shrink-0 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                                                内置
                                                            </span>
                                                        ) : (
                                                            <span className="shrink-0 text-[10px] font-medium text-sky-600 dark:text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded">
                                                                自定义
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-1 mt-1">
                                                        {item.category && (
                                                            <span className="text-[10px] text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
                                                                {item.category}
                                                            </span>
                                                        )}
                                                        {tagList.slice(0, 3).map((tag, i) => (
                                                            <span key={i} className="text-[10px] text-neutral-400">
                                                                #{tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* 悬停操作工具组（复制、编辑、删除） */}
                                                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                                    <Tooltip title="复制正文">
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            className="!h-6 !w-6 !p-0 text-neutral-500 hover:text-amber-600 hover:bg-amber-500/10"
                                                            icon={isCopied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                                                            onClick={(e) => handleCopy(e, item)}
                                                        />
                                                    </Tooltip>
                                                    <Tooltip title={item.isBuiltin ? "基于内置模板创建自定义副本" : "编辑修改模板"}>
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            className="!h-6 !w-6 !p-0 text-neutral-500 hover:text-amber-600 hover:bg-amber-500/10"
                                                            icon={<Pencil className="size-3" />}
                                                            onClick={(e) => handleOpenEdit(e, item)}
                                                        />
                                                    </Tooltip>
                                                    {!item.isBuiltin && (
                                                        <Popconfirm
                                                            title="确定删除此模板吗？"
                                                            onConfirm={(e) => handleDelete(e, item.id)}
                                                            okText="删除"
                                                            cancelText="取消"
                                                            okButtonProps={{ danger: true, size: "small" }}
                                                            cancelButtonProps={{ size: "small" }}
                                                        >
                                                            <Tooltip title="删除模板">
                                                                <Button
                                                                    type="text"
                                                                    size="small"
                                                                    className="!h-6 !w-6 !p-0 text-neutral-400 hover:text-rose-600 hover:bg-rose-500/10"
                                                                    icon={<Trash2 className="size-3" />}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                            </Tooltip>
                                                        </Popconfirm>
                                                    )}
                                                </div>
                                            </div>

                                            {/* 正文多行预览 */}
                                            <div className="mt-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-950/60 p-2.5 border border-neutral-100 dark:border-neutral-850">
                                                <p className="text-[11px] font-mono leading-relaxed text-neutral-600 dark:text-neutral-400 line-clamp-4 whitespace-pre-wrap select-none">
                                                    {item.content}
                                                </p>
                                            </div>

                                            {/* 底部点击应用提示 */}
                                            <div className="mt-2 flex items-center justify-between text-[10px] text-neutral-400 pt-1">
                                                <span className="flex items-center gap-1 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                                                    <CornerDownLeft className="size-3" />
                                                    点击直接选用并填充到输入框
                                                </span>
                                                <span className="text-[10px] opacity-60">
                                                    {item.content.length} 字
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-16 text-center text-neutral-400">
                                <Sparkles className="size-8 opacity-20 mb-2" />
                                <p className="text-xs">未找到匹配的提示词模板</p>
                                <Button
                                    size="small"
                                    type="link"
                                    className="text-xs text-amber-500 hover:text-amber-400"
                                    onClick={handleOpenCreate}
                                >
                                    立即新建一个
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Modal>
    );
}
// @opc-feature: creative-prompt-templates [end]
