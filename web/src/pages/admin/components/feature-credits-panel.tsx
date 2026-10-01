// @opc-feature: feature-credits [start]
import { useEffect, useState } from "react";
import { App, Button, Card, Form, Input, InputNumber, Radio, Switch, Tag, Tooltip } from "antd";
import { Coins, HelpCircle, RefreshCw, Save, Sparkles } from "lucide-react";

import {
    FEATURE_SCENE_DEFINITIONS,
    getAdminFeatureCredits,
    updateAdminFeatureCredits,
    type FeatureCreditItem,
    type FeatureCreditSettings,
} from "@/services/api/feature-credits";
import { ModelPicker } from "@/components/model-picker";
import { useEffectiveConfig } from "@/stores/use-config-store";

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

    const loadSettings = async () => {
        setLoading(true);
        try {
            const settings = await getAdminFeatureCredits();
            setCurrentSettings(settings);

            // Populate form values (convert microcredits to standard credits for display)
            const initialValues: Record<string, any> = {};
            FEATURE_SCENE_DEFINITIONS.forEach((def) => {
                const item = settings.features?.[def.scene] || {
                    scene: def.scene,
                    enabled: false,
                    mode: "fixed",
                    fixedMicrocredits: 0,
                    defaultModel: "",
                };
                initialValues[`${def.scene}_enabled`] = item.enabled;
                initialValues[`${def.scene}_mode`] = item.mode || "fixed";
                initialValues[`${def.scene}_credits`] = (item.fixedMicrocredits || 0) / 1_000_000;
                initialValues[`${def.scene}_defaultModel`] = item.defaultModel || "";
            });
            form.setFieldsValue(initialValues);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "获取功能积分配置失败");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadSettings();
    }, []);

    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            setSaving(true);
            const features: Record<string, FeatureCreditItem> = {};
            FEATURE_SCENE_DEFINITIONS.forEach((def) => {
                const enabled = Boolean(values[`${def.scene}_enabled`]);
                const mode = values[`${def.scene}_mode`] || "fixed";
                const credits = Number(values[`${def.scene}_credits`] || 0);
                const defaultModel = values[`${def.scene}_defaultModel`] || "";
                features[def.scene] = {
                    scene: def.scene,
                    enabled,
                    mode,
                    fixedMicrocredits: Math.round(credits * 1_000_000),
                    defaultModel,
                };
            });

            await updateAdminFeatureCredits({ features });
            message.success("功能积分配置已保存并即时生效");
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
            <div className="flex items-center justify-between border-b border-stone-200/80 pb-3 dark:border-stone-800/80">
                <div className="flex items-center gap-2">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                        <Coins className="size-4" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-stone-900 dark:text-stone-100">
                            功能积分扣减配置
                        </h3>
                        <p className="text-xs text-stone-500 dark:text-stone-400">
                            针对各个独立工作台与画布智能算子分别设定是否启用计费、扣减点数及默认功能模型
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
                        className="!bg-gradient-to-r !from-amber-500 !to-amber-600 !border-0 text-white font-medium"
                    >
                        保存配置
                    </Button>
                </div>
            </div>

            <Form form={form} layout="vertical" disabled={loading}>
                <div className="grid gap-3">
                    {FEATURE_SCENE_DEFINITIONS.map((def) => {
                        const enabledFieldName = `${def.scene}_enabled`;
                        const isCurrentEnabled = Form.useWatch(enabledFieldName, form);

                        return (
                            <Card
                                key={def.scene}
                                size="small"
                                className={`transition-all duration-200 ${
                                    isCurrentEnabled
                                        ? "border-amber-300/80 bg-amber-500/[0.02] dark:border-amber-700/60 dark:bg-amber-500/[0.03]"
                                        : "border-stone-200 dark:border-stone-800 bg-stone-50/40 dark:bg-stone-900/30"
                                }`}
                            >
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div className="flex-1 min-w-0 pr-4">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-semibold text-stone-900 dark:text-stone-100 text-sm">
                                                {def.title}
                                            </span>
                                            <Tag color={def.category === "workbench" ? "gold" : "purple"} className="text-[10px]">
                                                {def.category === "workbench" ? "独立工作台" : "画布智能算子"}
                                            </Tag>
                                            <code className="text-[10px] text-stone-400 bg-stone-100 dark:bg-stone-800 px-1 py-0.5 rounded">
                                                {def.scene}
                                            </code>
                                        </div>
                                        <p className="text-xs text-stone-500 dark:text-stone-400">
                                            {def.description}
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-4 border-t md:border-t-0 pt-2 md:pt-0 border-stone-200 dark:border-stone-800">
                                        {/* 启用开关 */}
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-stone-600 dark:text-stone-300 font-medium">启用计费</span>
                                            <Form.Item name={`${def.scene}_enabled`} valuePropName="checked" noStyle>
                                                <Switch size="small" />
                                            </Form.Item>
                                        </div>

                                        {/* 扣减固定积分值 */}
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-xs text-stone-600 dark:text-stone-300">扣减点数:</span>
                                            <Form.Item
                                                name={`${def.scene}_credits`}
                                                noStyle
                                                rules={[{ required: true, message: "请输入积分" }]}
                                            >
                                                <InputNumber
                                                    min={0}
                                                    max={100000}
                                                    precision={2}
                                                    size="small"
                                                    addonAfter="积分"
                                                    className="w-32"
                                                    disabled={!isCurrentEnabled}
                                                />
                                            </Form.Item>
                                        </div>

                                        {/* 计费模式 */}
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-xs text-stone-600 dark:text-stone-300">模式:</span>
                                            <Form.Item name={`${def.scene}_mode`} noStyle>
                                                <Radio.Group size="small" disabled={!isCurrentEnabled} optionType="button" buttonStyle="solid">
                                                    <Radio.Button value="fixed">固定积分</Radio.Button>
                                                    <Radio.Button value="model_price">模型定价</Radio.Button>
                                                </Radio.Group>
                                            </Form.Item>
                                        </div>

                                        {/* 默认模型 */}
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-xs text-stone-600 dark:text-stone-300">默认模型:</span>
                                            <Form.Item name={`${def.scene}_defaultModel`} noStyle>
                                                <div className="w-48">
                                                    <ModelPicker
                                                        config={config}
                                                        value={form.getFieldValue(`${def.scene}_defaultModel`)}
                                                        onChange={(val) => {
                                                            form.setFieldValue(`${def.scene}_defaultModel`, val);
                                                        }}
                                                        capability={def.capability}
                                                        placeholder="选择默认模型"
                                                        showSelectedPrice={false}
                                                    />
                                                </div>
                                            </Form.Item>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            </Form>
        </div>
    );
}
// @opc-feature: feature-credits [end]
