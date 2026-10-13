// @opc-feature: feature-credits [start]
import { useEffect, useMemo, useState } from "react";
import { App, Button, Card, Form, InputNumber, Radio, Select, Switch, Tag, Alert, Tooltip } from "antd";
import { Coins, RefreshCw, Save, Sparkles, Search, Sliders, CheckCircle2, Zap, Layers, Bot } from "lucide-react";

import {
    FEATURE_SCENE_DEFINITIONS,
    getAdminFeatureCredits,
    updateAdminFeatureCredits,
    type FeatureCreditItem,
    type FeatureCreditSettings,
    type FeatureSceneMeta,
} from "@/services/api/feature-credits";
import { useEffectiveConfig, selectableModelsByCapability, modelDisplayName, type ModelCapability } from "@/stores/use-config-store";

export function FeatureCreditsPanel({
    onSaved,
}: {
    onSaved?: () => void;
}) {
    const { message } = App.useApp();
    const config = useEffectiveConfig();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [currentSettings, setCurrentSettings] = useState<FeatureCreditSettings | null>(null);

    // 系统已配置的文本/多模态模型选项
    const configuredTextModels = useMemo(() => {
        const models = selectableModelsByCapability(config, "text");
        if (models.length > 0) return Array.from(new Set(models));
        // 兜底常用预设
        const fallbacks = [config.textModel, config.model, "gemini-2.5-flash", "gemini-2.5-pro", "deepseek-chat"].filter(Boolean) as string[];
        return Array.from(new Set(fallbacks));
    }, [config]);

    const [selectedModel, setSelectedModel] = useState<string>(() => {
        return config.textModel || config.model || "gemini-2.5-flash";
    });

    const getModelLabel = (modelKey: string) => {
        return modelDisplayName(config, modelKey);
    };

    const [searching, setSearching] = useState(false);
    const [detectedCount, setDetectedCount] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState<"multiplier" | "all">("multiplier");

    // 动态从后端配置中枢自省场景列表，若尚未加载则降级使用本地静态定义
    const allScenes = useMemo<FeatureSceneMeta[]>(() => {
        return currentSettings?.sceneCatalog && currentSettings.sceneCatalog.length > 0
            ? currentSettings.sceneCatalog
            : FEATURE_SCENE_DEFINITIONS;
    }, [currentSettings]);

    // 筛选支持大模型文本/多模态调用的功能板块
    const textScenes = useMemo(() => {
        return allScenes.filter((def) => def.capability === "text");
    }, [allScenes]);

    const [localModelSceneMultipliers, setLocalModelSceneMultipliers] = useState<Record<string, Record<string, number>>>({});

    const getModelsForCapability = (capability: string) => {
        const list = selectableModelsByCapability(config, capability as ModelCapability);
        if (list.length > 0) return Array.from(new Set(list));
        if (capability === "text") {
            return Array.from(new Set([config.textModel, config.model, "gemini-2.5-flash", "gemini-2.5-pro", "deepseek-chat"].filter(Boolean) as string[]));
        }
        if (capability === "image") {
            return Array.from(new Set([config.imageModel, config.model, "flux-1-schnell", "flux-1-dev"].filter(Boolean) as string[]));
        }
        if (capability === "video") {
            return Array.from(new Set([config.videoModel, config.model, "cogvideox-flash"].filter(Boolean) as string[]));
        }
        return [];
    };

    const populateFormFromSettings = (
        settings: FeatureCreditSettings,
        modelKey: string,
        multipliersMap?: Record<string, Record<string, number>>,
        scenesList?: FeatureSceneMeta[],
    ) => {
        const scenes = scenesList || (settings.sceneCatalog && settings.sceneCatalog.length > 0 ? settings.sceneCatalog : FEATURE_SCENE_DEFINITIONS);
        const initialValues: Record<string, any> = {};
        const sourceMultipliers = multipliersMap || settings.modelSceneMultipliers || {};
        scenes.forEach((def) => {
            const item = settings.features?.[def.scene] || {
                scene: def.scene,
                enabled: false,
                mode: def.capability === "text" ? "token_multiplier" : "fixed",
                fixedMicrocredits: 0,
                multiplierBasisPoints: 10_000,
                defaultModel: "",
            };

            // 优先读取该模型在当前场景下的专属倍率，若未配置则读取场景默认倍率
            const modelOverrideBps = sourceMultipliers[modelKey]?.[def.scene];
            const effectiveBps = modelOverrideBps && modelOverrideBps > 0
                ? modelOverrideBps
                : (item.multiplierBasisPoints || 10_000);

            initialValues[`${def.scene}_enabled`] = item.enabled;
            initialValues[`${def.scene}_mode`] = item.mode || (def.capability === "text" ? "token_multiplier" : "fixed");
            initialValues[`${def.scene}_multiplier`] = effectiveBps / 10_000;
            initialValues[`${def.scene}_credits`] = (item.fixedMicrocredits || 0) / 1_000_000;
            initialValues[`${def.scene}_defaultModel`] = item.defaultModel || undefined;
        });
        form.setFieldsValue(initialValues);
    };

    const loadSettings = async () => {
        setLoading(true);
        try {
            const settings = await getAdminFeatureCredits();
            setCurrentSettings(settings);
            const initialMultipliers = settings.modelSceneMultipliers || {};
            setLocalModelSceneMultipliers(initialMultipliers);
            const scenes = settings.sceneCatalog && settings.sceneCatalog.length > 0
                ? settings.sceneCatalog
                : FEATURE_SCENE_DEFINITIONS;
            populateFormFromSettings(settings, selectedModel, initialMultipliers, scenes);
            const matchedTextCount = scenes.filter((s) => s.capability === "text").length;
            setDetectedCount(matchedTextCount);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "获取功能积分配置失败");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadSettings();
    }, []);

    // 切换大模型时：先保存当前模型在各板块的倍率，再平滑载入新模型的倍率；同时完整保留已编辑的场景开关/模式/固定点数
    const handleModelChange = (nextModel: string) => {
        const values = form.getFieldsValue();
        const updated = { ...localModelSceneMultipliers };
        if (!updated[selectedModel]) {
            updated[selectedModel] = {};
        }
        textScenes.forEach((def) => {
            const mult = Number(values[`${def.scene}_multiplier`] || 1.0);
            updated[selectedModel][def.scene] = Math.round(mult * 10_000);
        });
        setLocalModelSceneMultipliers(updated);
        setSelectedModel(nextModel);

        // 仅平滑更新倍率输入框，绝不重置用户在表单上已编辑的场景通用开关、计费模式或固定点数
        const nextFields: Record<string, number> = {};
        textScenes.forEach((def) => {
            const modelOverrideBps = updated[nextModel]?.[def.scene]
                ?? currentSettings?.modelSceneMultipliers?.[nextModel]?.[def.scene];
            const effectiveBps = modelOverrideBps && modelOverrideBps > 0
                ? modelOverrideBps
                : (currentSettings?.features?.[def.scene]?.multiplierBasisPoints || 10_000);
            nextFields[`${def.scene}_multiplier`] = effectiveBps / 10_000;
        });
        form.setFieldsValue(nextFields);
    };

    // 一键动态识别适用功能板块
    const handleOneClickSearch = () => {
        setSearching(true);
        const count = textScenes.length;
        setDetectedCount(count);
        setActiveTab("multiplier");
        setSearching(false);
        message.success(`动态识别完成！已识别到 ${count} 个支持使用「${getModelLabel(selectedModel)}」的大模型功能板块`);
    };

    // 快速预设倍率（同时同步 AntD 表单与本地状态缓存）
    const setPresetMultiplier = (scene: string, multiplier: number) => {
        form.setFieldValue(`${scene}_multiplier`, multiplier);
        form.setFieldValue(`${scene}_mode`, "token_multiplier");
        setLocalModelSceneMultipliers((prev) => {
            const next = { ...prev };
            if (!next[selectedModel]) next[selectedModel] = {};
            next[selectedModel][scene] = Math.round(multiplier * 10_000);
            return next;
        });
    };

    // 批量阶梯定价（同时同步 AntD 表单与本地状态缓存）
    const applyBatchMultiplier = (multiplier: number) => {
        const nextFields: Record<string, any> = {};
        const multiplierBps = Math.round(multiplier * 10_000);
        const nextModelMultipliers: Record<string, number> = {};

        textScenes.forEach((def) => {
            nextFields[`${def.scene}_multiplier`] = multiplier;
            nextFields[`${def.scene}_mode`] = "token_multiplier";
            nextFields[`${def.scene}_enabled`] = true;
            nextModelMultipliers[def.scene] = multiplierBps;
        });
        form.setFieldsValue(nextFields);

        setLocalModelSceneMultipliers((prev) => ({
            ...prev,
            [selectedModel]: {
                ...(prev[selectedModel] || {}),
                ...nextModelMultipliers,
            },
        }));

        message.success(`已将识别到的 ${textScenes.length} 个功能板块倍率统一设置为 ${multiplier}x 并启用`);
    };

    const getCategoryBadge = (category: string) => {
        switch (category) {
            case "video_workbench":
                return (
                    <Tag color="volcano" className="text-[10px] m-0">
                        🎬 生视频工作台
                    </Tag>
                );
            case "creation_assistant":
                return (
                    <Tag color="orange" className="text-[10px] m-0">
                        💡 创作助手 (生视频)
                    </Tag>
                );
            case "image_workbench":
                return (
                    <Tag color="green" className="text-[10px] m-0">
                        🎨 生图工作台
                    </Tag>
                );
            case "canvas_table":
            case "voice":
                return (
                    <Tag color="purple" className="text-[10px] m-0">
                        📊 画布多维表格
                    </Tag>
                );
            case "canvas":
                return (
                    <Tag color="geekblue" className="text-[10px] m-0">
                        🧩 画布智能节点
                    </Tag>
                );
            default:
                return (
                    <Tag color="gold" className="text-[10px] m-0">
                        ⚡ 独立业务板块
                    </Tag>
                );
        }
    };

    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            setSaving(true);

            const features: Record<string, FeatureCreditItem> = {};
            const modelSceneMultipliers: Record<string, Record<string, number>> = {
                ...localModelSceneMultipliers,
            };

            if (!modelSceneMultipliers[selectedModel]) {
                modelSceneMultipliers[selectedModel] = {};
            }

            allScenes.forEach((def) => {
                const enabled = Boolean(values[`${def.scene}_enabled`]);
                const mode = values[`${def.scene}_mode`] || (def.capability === "text" ? "token_multiplier" : "fixed");
                const credits = Number(values[`${def.scene}_credits`] || 0);
                const multiplier = Number(values[`${def.scene}_multiplier`] || 1.0);
                const defaultModel = values[`${def.scene}_defaultModel`] || "";
                const multiplierBps = Math.round(multiplier * 10_000);

                features[def.scene] = {
                    scene: def.scene,
                    enabled,
                    mode,
                    fixedMicrocredits: Math.round(credits * 1_000_000),
                    multiplierBasisPoints: multiplierBps,
                    defaultModel,
                };

                // 若为文本模型场景，保存当前模型针对该场景的专属倍率映射
                if (def.capability === "text") {
                    modelSceneMultipliers[selectedModel][def.scene] = multiplierBps;
                }
            });

            const newSettings: FeatureCreditSettings = {
                features,
                modelSceneMultipliers,
            };

            await updateAdminFeatureCredits(newSettings);
            message.success(`「${getModelLabel(selectedModel)}」与功能板块计费配置已保存并即时生效`);
            onSaved?.();
            void loadSettings();
        } catch (error) {
            if (error && typeof error === "object" && "errorFields" in error) {
                return;
            }
            message.error(error instanceof Error ? error.message : "保存功能积分配置失败");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* 顶栏控制台 */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200/80 pb-3 dark:border-stone-800/80">
                <div className="flex items-center gap-2.5">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                        <Coins className="size-5" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                            功能板块大模型倍率与积分计费
                            <Tag color="gold" className="text-[10px] m-0 font-normal">
                                场景倍率计费
                            </Tag>
                        </h3>
                        <p className="text-xs text-stone-500 dark:text-stone-400">
                            针对画布二开节点、多维表格、创作助手及原生工作台配置大模型专属倍率与积分规则，未配置场景自动执行原系统保底计费
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        icon={<RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />}
                        onClick={loadSettings}
                        disabled={loading || saving}
                    >
                        刷新
                    </Button>
                    <Button
                        type="primary"
                        icon={<Save className="size-3.5" />}
                        onClick={handleSave}
                        loading={saving}
                        className="!bg-gradient-to-r !from-amber-500 !to-amber-600 !border-0 text-white font-medium shadow-sm hover:!opacity-95"
                    >
                        保存配置
                    </Button>
                </div>
            </div>

            {/* 核心检索与配置器：大模型下拉框 + 一键检索适用板块 */}
            <Card
                size="small"
                className="border-amber-300/70 bg-gradient-to-br from-amber-50/40 via-amber-500/[0.02] to-transparent dark:border-amber-800/60 dark:from-amber-950/20 dark:via-transparent"
            >
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                            <Bot className="size-4 text-amber-600 dark:text-amber-400" />
                            <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                                选择大模型配置特定场景倍率
                            </span>
                            <span className="text-xs text-stone-400">
                                (从系统已配置的模型中选取)
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5">
                            <Select
                                value={selectedModel}
                                onChange={handleModelChange}
                                className="w-64 sm:w-80"
                                placeholder="选择系统已配置的大模型"
                                options={configuredTextModels.map((m) => ({
                                    value: m,
                                    label: (
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium text-stone-800 dark:text-stone-200">
                                                {getModelLabel(m)}
                                            </span>
                                            <code className="text-[10px] text-stone-400 ml-2">
                                                {m}
                                            </code>
                                        </div>
                                    ),
                                }))}
                            />
                            <Button
                                type="primary"
                                icon={<Search className="size-3.5" />}
                                onClick={handleOneClickSearch}
                                loading={searching}
                                className="!bg-amber-600 !border-amber-600 text-white font-medium"
                            >
                                一键识别适用功能板块
                            </Button>
                        </div>
                    </div>

                    {detectedCount !== null && (
                        <div className="flex items-center gap-2 bg-amber-100/70 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 px-3 py-2 rounded-lg border border-amber-300/60 dark:border-amber-700/60 text-xs">
                            <CheckCircle2 className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
                            <span>
                                动态识别到 <strong>{detectedCount}</strong> 个支持「<strong>{getModelLabel(selectedModel)}</strong>」的功能场景，可在下方快速调整倍率
                            </span>
                        </div>
                    )}
                </div>
            </Card>

            {/* 标签栏：大模型适用功能板块 vs 全部工作台一览 */}
            <div className="flex items-center gap-2 border-b border-stone-200 dark:border-stone-800 pb-1">
                <button
                    type="button"
                    onClick={() => setActiveTab("multiplier")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                        activeTab === "multiplier"
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-b-2 border-amber-500 font-semibold"
                            : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                    }`}
                >
                    <Zap className="size-3.5" />
                    检索匹配板块 (文本与多模态大模型场景倍率 · {textScenes.length})
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("all")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                        activeTab === "all"
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-b-2 border-amber-500 font-semibold"
                            : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                    }`}
                >
                    <Layers className="size-3.5" />
                    全部系统功能板块清单 ({allScenes.length})
                </button>
            </div>

            <Form form={form} layout="vertical" disabled={loading} preserve={true}>
                {/* 选项卡1：大模型专属场景倍率配置区 */}
                {activeTab === "multiplier" && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/60 px-3.5 py-2 rounded-lg text-xs text-amber-900 dark:text-amber-200">
                            <Sparkles className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                            <span>
                                当前正在为「<strong>{getModelLabel(selectedModel)}</strong>」设置各板块计费倍率。系统将按 <strong>模型基础单价 × 场景倍率</strong> 自动结算。
                            </span>
                        </div>

                        {/* 批量阶梯定价快捷栏 */}
                        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-stone-100/80 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 text-xs">
                            <div className="flex items-center gap-2">
                                <Sliders className="size-3.5 text-amber-600 dark:text-amber-400" />
                                <span className="font-semibold text-stone-800 dark:text-stone-200">
                                    批量快捷设倍率:
                                </span>
                                <span className="text-stone-500 dark:text-stone-400">
                                    一键应用至全部 {textScenes.length} 个功能板块
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {[
                                    { label: "1.0x 标准平价", val: 1.0 },
                                    { label: "1.2x 微利服务", val: 1.2 },
                                    { label: "1.5x 商业推荐", val: 1.5 },
                                    { label: "2.0x 算力高阶", val: 2.0 },
                                    { label: "2.5x 深度推演", val: 2.5 },
                                ].map((tier) => (
                                    <Button
                                        key={tier.val}
                                        size="small"
                                        onClick={() => applyBatchMultiplier(tier.val)}
                                        className="text-xs"
                                    >
                                        {tier.label}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-2xs">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                    <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50/90 dark:bg-stone-850/90 text-stone-600 dark:text-stone-300 font-medium">
                                        <th className="py-2.5 px-4 min-w-[200px]">功能板块</th>
                                        <th className="py-2.5 px-3 w-20 text-center">状态</th>
                                        <th className="py-2.5 px-3 w-44">计费模式</th>
                                        <th className="py-2.5 px-3 min-w-[260px]">倍率 / 扣点配置</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60">
                                    {textScenes.map((def) => {
                                        const presets = def.recommendedMultipliers && def.recommendedMultipliers.length > 0
                                            ? def.recommendedMultipliers.map((m) => ({ label: `${m}x`, val: m }))
                                            : [
                                                { label: "1.0x", val: 1.0 },
                                                { label: "1.2x", val: 1.2 },
                                                { label: "1.5x", val: 1.5 },
                                                { label: "2.0x", val: 2.0 },
                                            ];

                                        return (
                                            <Form.Item
                                                key={def.scene}
                                                noStyle
                                                shouldUpdate={(prev, curr) =>
                                                    prev[`${def.scene}_enabled`] !== curr[`${def.scene}_enabled`] ||
                                                    prev[`${def.scene}_mode`] !== curr[`${def.scene}_mode`] ||
                                                    prev[`${def.scene}_multiplier`] !== curr[`${def.scene}_multiplier`]
                                                }
                                            >
                                                {({ getFieldValue }) => {
                                                    const isCurrentEnabled = Boolean(getFieldValue(`${def.scene}_enabled`));
                                                    const currentMode = getFieldValue(`${def.scene}_mode`) || "token_multiplier";
                                                    const currentMultiplier = Number(getFieldValue(`${def.scene}_multiplier`) || 1.0);

                                                    return (
                                                        <tr className={`transition-colors ${isCurrentEnabled ? "hover:bg-amber-50/20 dark:hover:bg-amber-950/10" : "bg-stone-50/40 dark:bg-stone-900/40 opacity-60"}`}>
                                                            {/* 功能板块名称与分类 */}
                                                            <td className="py-2.5 px-4">
                                                                <div className="flex items-center gap-2">
                                                                    <span
                                                                        className="font-medium text-stone-900 dark:text-stone-100 cursor-default"
                                                                        title={def.description}
                                                                    >
                                                                        {def.title}
                                                                    </span>
                                                                    {getCategoryBadge(def.category)}
                                                                </div>
                                                            </td>

                                                            {/* 状态开关 */}
                                                            <td className="py-2.5 px-3 text-center">
                                                                <Form.Item name={`${def.scene}_enabled`} valuePropName="checked" noStyle>
                                                                    <Switch size="small" />
                                                                </Form.Item>
                                                            </td>

                                                            {/* 计费模式 */}
                                                            <td className="py-2.5 px-3">
                                                                <Form.Item name={`${def.scene}_mode`} noStyle>
                                                                    <Radio.Group size="small" disabled={!isCurrentEnabled} optionType="button" buttonStyle="solid">
                                                                        <Radio.Button value="token_multiplier">Token倍率</Radio.Button>
                                                                        <Radio.Button value="fixed">固定积分</Radio.Button>
                                                                    </Radio.Group>
                                                                </Form.Item>
                                                            </td>

                                                            {/* 倍率 / 扣点配置 */}
                                                            <td className="py-2.5 px-3">
                                                                {currentMode === "token_multiplier" ? (
                                                                    <div className="flex items-center gap-2">
                                                                        <Form.Item
                                                                            name={`${def.scene}_multiplier`}
                                                                            noStyle
                                                                            rules={[{ required: true, message: "请输入倍率" }]}
                                                                        >
                                                                            <InputNumber
                                                                                min={0.1}
                                                                                max={50}
                                                                                step={0.1}
                                                                                precision={1}
                                                                                size="small"
                                                                                addonAfter="倍"
                                                                                className="w-20 font-bold text-amber-600 dark:text-amber-400"
                                                                                disabled={!isCurrentEnabled}
                                                                            />
                                                                        </Form.Item>
                                                                        <div className="flex items-center gap-1">
                                                                            {presets.map((preset) => (
                                                                                <button
                                                                                    key={preset.val}
                                                                                    type="button"
                                                                                    disabled={!isCurrentEnabled}
                                                                                    onClick={() => setPresetMultiplier(def.scene, preset.val)}
                                                                                    className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors cursor-pointer ${
                                                                                        Math.abs(currentMultiplier - preset.val) < 0.05
                                                                                            ? "bg-amber-500 text-white border-amber-500 font-semibold"
                                                                                            : "bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700"
                                                                                    }`}
                                                                                >
                                                                                    {preset.label}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <Form.Item
                                                                        name={`${def.scene}_credits`}
                                                                        noStyle
                                                                        rules={[{ required: true, message: "请输入积分" }]}
                                                                        preserve={true}
                                                                    >
                                                                        <InputNumber
                                                                            min={0}
                                                                            max={100000}
                                                                            precision={2}
                                                                            size="small"
                                                                            addonAfter="积分"
                                                                            className="w-28"
                                                                            disabled={!isCurrentEnabled}
                                                                        />
                                                                    </Form.Item>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                }}
                                            </Form.Item>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* 选项卡2：全部功能板块一览（包含生图/生视频工作台） */}
                {activeTab === "all" && (
                    <div className="space-y-3">
                        <div className="text-xs text-stone-500 dark:text-stone-400">
                            配置各独立工作台与画布功能的计费模式、固定点数及默认调用模型：
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-2xs">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                    <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50/90 dark:bg-stone-850/90 text-stone-600 dark:text-stone-300 font-medium">
                                        <th className="py-2.5 px-4 min-w-[200px]">功能板块</th>
                                        <th className="py-2.5 px-3 w-16 text-center">类型</th>
                                        <th className="py-2.5 px-3 w-16 text-center">状态</th>
                                        <th className="py-2.5 px-3 w-56">计费模式</th>
                                        <th className="py-2.5 px-3 w-36">扣费规则 / 点数</th>
                                        <th className="py-2.5 px-3 w-48">默认绑定模型</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60">
                                    {allScenes.map((def) => {
                                        const isText = def.capability === "text";
                                        const sceneModels = getModelsForCapability(def.capability);

                                        return (
                                            <Form.Item
                                                key={def.scene}
                                                noStyle
                                                shouldUpdate={(prev, curr) =>
                                                    prev[`${def.scene}_enabled`] !== curr[`${def.scene}_enabled`] ||
                                                    prev[`${def.scene}_mode`] !== curr[`${def.scene}_mode`]
                                                }
                                            >
                                                {({ getFieldValue }) => {
                                                    const isCurrentEnabled = Boolean(getFieldValue(`${def.scene}_enabled`));
                                                    const currentMode = getFieldValue(`${def.scene}_mode`) || (isText ? "token_multiplier" : "fixed");

                                                    return (
                                                        <tr className={`transition-colors ${isCurrentEnabled ? "hover:bg-amber-50/20 dark:hover:bg-amber-950/10" : "bg-stone-50/40 dark:bg-stone-900/40 opacity-60"}`}>
                                                            {/* 功能板块名称与分类 */}
                                                            <td className="py-2.5 px-4">
                                                                <div className="flex items-center gap-2">
                                                                    <span
                                                                        className="font-medium text-stone-900 dark:text-stone-100 cursor-default"
                                                                        title={def.description}
                                                                    >
                                                                        {def.title}
                                                                    </span>
                                                                    {getCategoryBadge(def.category)}
                                                                </div>
                                                            </td>

                                                            {/* 类型 */}
                                                            <td className="py-2.5 px-3 text-center">
                                                                <Tag
                                                                    color={isText ? "blue" : def.capability === "video" ? "volcano" : "cyan"}
                                                                    className="text-[10px] m-0"
                                                                >
                                                                    {isText ? "文本" : def.capability === "video" ? "视频" : "图片"}
                                                                </Tag>
                                                            </td>

                                                            {/* 状态开关 */}
                                                            <td className="py-2.5 px-3 text-center">
                                                                <Form.Item name={`${def.scene}_enabled`} valuePropName="checked" noStyle>
                                                                    <Switch size="small" />
                                                                </Form.Item>
                                                            </td>

                                                            {/* 计费模式 */}
                                                            <td className="py-2.5 px-3">
                                                                <Form.Item name={`${def.scene}_mode`} noStyle>
                                                                    <Radio.Group size="small" disabled={!isCurrentEnabled} optionType="button" buttonStyle="solid">
                                                                        {isText && <Radio.Button value="token_multiplier">Token倍率</Radio.Button>}
                                                                        <Radio.Button value="fixed">固定积分</Radio.Button>
                                                                        <Radio.Button value="model_price">模型定价</Radio.Button>
                                                                    </Radio.Group>
                                                                </Form.Item>
                                                            </td>

                                                            {/* 扣费规则 / 点数 */}
                                                            <td className="py-2.5 px-3">
                                                                {currentMode === "fixed" ? (
                                                                    <Form.Item
                                                                        name={`${def.scene}_credits`}
                                                                        noStyle
                                                                        rules={[{ required: true, message: "请输入积分" }]}
                                                                        preserve={true}
                                                                    >
                                                                        <InputNumber
                                                                            min={0}
                                                                            max={100000}
                                                                            precision={2}
                                                                            size="small"
                                                                            addonAfter="积分"
                                                                            className="w-28"
                                                                            disabled={!isCurrentEnabled}
                                                                        />
                                                                    </Form.Item>
                                                                ) : currentMode === "token_multiplier" ? (
                                                                    <span
                                                                        className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/60 px-2 py-0.5 rounded"
                                                                        title="在【检索匹配板块】中精细配置模型专属倍率"
                                                                    >
                                                                        Token倍率
                                                                    </span>
                                                                ) : (
                                                                    <span
                                                                        className="text-[11px] text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded"
                                                                        title="跟随系统渠道/前台目录中的模型单价扣点"
                                                                    >
                                                                        按模型单价
                                                                    </span>
                                                                )}
                                                            </td>

                                                            {/* 默认绑定模型 */}
                                                            <td className="py-2.5 px-3">
                                                                <Form.Item name={`${def.scene}_defaultModel`} noStyle preserve={true}>
                                                                    <Select
                                                                        size="small"
                                                                        className="w-40 sm:w-44"
                                                                        placeholder="跟随全局默认"
                                                                        allowClear
                                                                        disabled={!isCurrentEnabled}
                                                                        options={sceneModels.map((m) => ({
                                                                            value: m,
                                                                            label: (
                                                                                <div className="flex items-center justify-between">
                                                                                    <span className="truncate">{modelDisplayName(config, m) || m}</span>
                                                                                </div>
                                                                            ),
                                                                        }))}
                                                                    />
                                                                </Form.Item>
                                                            </td>
                                                        </tr>
                                                    );
                                                }}
                                            </Form.Item>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </Form>
        </div>
    );
}
// @opc-feature: feature-credits [end]
