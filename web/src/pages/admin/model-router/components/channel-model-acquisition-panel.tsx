// @opc-feature: model-smart-router [start]
import { useState, useMemo, useEffect } from "react";
import {
    Select,
    Button,
    Input,
    Tag,
    Modal,
    Checkbox,
    Tooltip,
    Segmented,
    Radio,
    message,
} from "antd";
import {
    RefreshCw,
    Search,
    Info,
    Plus,
    CheckCircle2,
    Layers,
    Server,
    ExternalLink,
    Zap,
    Sliders,
    Film,
    Image as ImageIcon,
    Check,
    Wrench,
    Sparkles,
    Edit3,
} from "lucide-react";
import type { ChannelAvailableModel, FrontendModelItem, UpstreamCandidateModel, CapabilityType } from "../types";
import { useModelRouterStore } from "../model-router-store";
import { ChannelModelEditor } from "@/pages/admin/components/channel-model-editor";
import type { EditorSection } from "@/pages/admin/components/channel-model-editor-form";
import type { ModelProtocolDefinition } from "@/lib/model-protocols";
import { fetchPluginProviderCatalog } from "@/services/api/plugin-catalog";
import { createAdminChannelModel, updateAdminChannelModel, type ChannelModel } from "@/services/api/wallet";
import { updateAdminChannel } from "@/services/api/auth";
import { defaultModelCapabilityConfig } from "@/lib/model-capabilities";
import { extractSupportedParameterKeys, resolveCapability } from "../model-router-adapter";
import { capabilitySpecFromChannelModel } from "../../logical-models/model-routing-capabilities";
import { COMPREHENSIVE_IMAGE_SWITCHES, COMPREHENSIVE_VIDEO_SWITCHES } from "../mock-data";
import type { ModelChannel } from "@/stores/use-config-store";

export function ChannelModelAcquisitionPanel() {
    const {
        models,
        channels,
        channelModels: storeChannelModels,
        families,
        fetchChannelModels,
        addCandidateToModel,
        addModel,
        loadAllData,
        setManagingChannelId,
    } = useModelRouterStore();

    const [selectedChannel, setSelectedChannel] = useState<string>("all");
    const [selectedCapability, setSelectedCapability] = useState<"all" | CapabilityType>("all");
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [isFetching, setIsFetching] = useState<boolean>(false);
    const [channelModels, setChannelModels] = useState<ChannelAvailableModel[]>([]);

    // 参数说明详情弹窗状态
    const [specModalModel, setSpecModalModel] = useState<ChannelAvailableModel | null>(null);

    // 快捷添加到分组卡片弹窗状态
    const [targetModelModalOpen, setTargetModelModalOpen] = useState<boolean>(false);
    const [pendingModel, setPendingModel] = useState<ChannelAvailableModel | null>(null);
    const [quickAddMode, setQuickAddMode] = useState<"create_new" | "bind_existing">("create_new");
    const [newModelDisplayName, setNewModelDisplayName] = useState<string>("");
    const [newModelSubtitle, setNewModelSubtitle] = useState<string>("");
    const [newModelFamily, setNewModelFamily] = useState<string>("");
    const [inlineBaseSearch, setInlineBaseSearch] = useState<string>("");
    const [selectedFrontendModelId, setSelectedFrontendModelId] = useState<string>("");
    const [enableImmediately, setEnableImmediately] = useState<boolean>(true);
    const [modalCapabilityFilter, setModalCapabilityFilter] = useState<"matched" | "all" | "video" | "image">("matched");

    // 系统原有配置方式（ChannelModelEditor）弹窗状态
    const [editorOpen, setEditorOpen] = useState<boolean>(false);
    const [editorTargetChannel, setEditorTargetChannel] = useState<ModelChannel | null>(null);
    const [editorEditingModel, setEditorEditingModel] = useState<ChannelModel | null>(null);
    const [editorInitialSection, setEditorInitialSection] = useState<EditorSection>("identity");

    // 原生配置保存成功后的“匹配至模型中枢”弹窗状态
    const [postSaveMatchModalOpen, setPostSaveMatchModalOpen] = useState<boolean>(false);
    const [savedChannelModel, setSavedChannelModel] = useState<ChannelModel | null>(null);
    const [matchTargetModelId, setMatchTargetModelId] = useState<string>("");
    const [autoCreateFrontendModel, setAutoCreateFrontendModel] = useState<boolean>(false);

    // 协议清单加载
    const [protocols, setProtocols] = useState<ModelProtocolDefinition[]>([]);
    const [protocolLoading, setProtocolLoading] = useState<boolean>(false);
    const [protocolError, setProtocolError] = useState<string>("");

    const loadProtocols = async () => {
        setProtocolLoading(true);
        setProtocolError("");
        try {
            const list = await fetchPluginProviderCatalog("admin.system-channel");
            setProtocols(list || []);
        } catch (err: any) {
            setProtocols([]);
            setProtocolError(err?.message || "无法读取协议目录");
        } finally {
            setProtocolLoading(false);
        }
    };

    const loadModels = async (chId: string) => {
        setIsFetching(true);
        try {
            const list = await fetchChannelModels(chId);
            setChannelModels(list);
        } finally {
            setIsFetching(false);
        }
    };

    useEffect(() => {
        void loadModels("all");
        void loadProtocols();
    }, []);

    const handleManualFetch = async () => {
        setIsFetching(true);
        const chName = channels.find((c) => c.id === selectedChannel)?.name || "全部渠道";
        message.loading({ content: `正在从渠道【${chName}】拉取最新可用模型与参数说明...`, key: "fetch-ch" });
        try {
            const list = await fetchChannelModels(selectedChannel);
            setChannelModels(list);
            message.success({ content: `获取完成！共探测到 ${list.length} 个可用物理模型与参数规格！`, key: "fetch-ch" });
        } catch (err: any) {
            message.error({ content: `从渠道拉取失败：${err?.message || "网络异常"}`, key: "fetch-ch" });
        } finally {
            setIsFetching(false);
        }
    };

    // 过滤后的模型清单
    const filteredModels = useMemo(() => {
        return channelModels.filter((m) => {
            if (selectedChannel !== "all" && m.channelId !== selectedChannel) return false;
            const itemCap = resolveCapability(m.capability, m.modelKey);
            if (selectedCapability !== "all" && itemCap !== selectedCapability) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchKey = m.modelKey.toLowerCase().includes(q);
                const matchName = m.displayName.toLowerCase().includes(q);
                const matchChannel = m.channelName.toLowerCase().includes(q);
                if (!matchKey && !matchName && !matchChannel) return false;
            }
            return true;
        });
    }, [channelModels, selectedChannel, selectedCapability, searchQuery]);

    // 弹窗内能力分类统计
    const modalCapabilityCounts = useMemo(() => {
        const targetCap = pendingModel ? resolveCapability(pendingModel.capability, pendingModel.modelKey) : "video";
        let matched = 0;
        let video = 0;
        let image = 0;
        for (const m of models) {
            const cap = resolveCapability(m.capability, m.id);
            if (cap === "video") video++;
            if (cap === "image") image++;
            if (cap === targetCap) matched++;
        }
        return {
            matchedCount: matched,
            totalCount: models.length,
            videoCount: video,
            imageCount: image,
        };
    }, [models, pendingModel]);

    // 切换弹窗内前台模型能力范围
    const handleModalFilterChange = (val: "matched" | "all" | "video" | "image") => {
        setModalCapabilityFilter(val);
        const targetCap = pendingModel ? resolveCapability(pendingModel.capability, pendingModel.modelKey) : "video";
        const isStillValid = models.some((m) => {
            if (m.id !== selectedFrontendModelId) return false;
            const cap = resolveCapability(m.capability, m.id);
            if (val === "all") return true;
            if (val === "matched") return cap === targetCap;
            if (val === "video") return cap === "video";
            if (val === "image") return cap === "image";
            return true;
        });

        if (!isStillValid) {
            const firstAvailable = models.find((m) => {
                const cap = resolveCapability(m.capability, m.id);
                if (val === "all") return true;
                if (val === "matched") return cap === targetCap;
                if (val === "video") return cap === "video";
                if (val === "image") return cap === "image";
                return true;
            });
            if (firstAvailable) {
                setSelectedFrontendModelId(firstAvailable.id);
            }
        }
    };

    // 绑定已有底座模式下的即时搜索与能力过滤结果（平铺可视化卡片专用）
    const filteredBaseModels = useMemo(() => {
        if (!pendingModel) return [];
        const targetCap = resolveCapability(pendingModel.capability, pendingModel.modelKey);
        const query = inlineBaseSearch.trim().toLowerCase();

        return models.filter((m) => {
            const cap = resolveCapability(m.capability, m.id);
            if (modalCapabilityFilter === "matched" && cap !== targetCap) return false;
            if (modalCapabilityFilter === "video" && cap !== "video") return false;
            if (modalCapabilityFilter === "image" && cap !== "image") return false;

            if (query) {
                const matchText = `${m.displayName} ${m.id} ${m.family} ${m.group} ${m.subtitle || ""}`.toLowerCase();
                if (!matchText.includes(query)) return false;
            }
            return true;
        });
    }, [models, pendingModel, modalCapabilityFilter, inlineBaseSearch]);

    // 构造按基础模型家族/厂商分组的下拉选项 (OptGroup 结构化展示)
    const groupedTargetModelOptions = useMemo(() => {
        if (!pendingModel) return [];
        const targetCap = resolveCapability(pendingModel.capability, pendingModel.modelKey);

        const filteredList = models.filter((m) => {
            const cap = resolveCapability(m.capability, m.id);
            if (modalCapabilityFilter === "all") return true;
            if (modalCapabilityFilter === "matched") return cap === targetCap;
            if (modalCapabilityFilter === "video") return cap === "video";
            if (modalCapabilityFilter === "image") return cap === "image";
            return true;
        });

        const groupsMap = new Map<string, FrontendModelItem[]>();
        for (const m of filteredList) {
            const fam = m.family || "其他基础模型分组";
            if (!groupsMap.has(fam)) {
                groupsMap.set(fam, []);
            }
            groupsMap.get(fam)!.push(m);
        }

        const result: Array<{
            label: string;
            title?: string;
            options: Array<{
                value: string;
                label: string;
                filterText: string;
            }>;
        }> = [];

        for (const [family, familyModels] of groupsMap.entries()) {
            const isVideoFam = familyModels.some((m) => resolveCapability(m.capability, m.id) === "video");
            const famIcon = isVideoFam ? "🎬" : "🎨";
            result.push({
                label: `${famIcon} ${family} (${familyModels.length} 个前台底座)`,
                title: family,
                options: familyModels.map((m) => {
                    const cap = resolveCapability(m.capability, m.id);
                    const routeCount = m.candidateUpstreams?.length || 0;
                    const routeText = routeCount > 0 ? ` [${routeCount}线路]` : " [底座]";
                    return {
                        value: m.id,
                        filterText: `${m.displayName} ${m.id} ${m.family} ${m.group} ${m.subtitle || ""} ${cap}`,
                        label: `${m.displayName}${m.subtitle ? ` · ${m.subtitle}` : ""}${routeText}`,
                    };
                }),
            });
        }

        return result;
    }, [models, pendingModel, modalCapabilityFilter]);

    // 系统原有配置保存成功后的匹配分组选项
    const postSaveGroupedOptions = useMemo(() => {
        if (!savedChannelModel) return [];
        const savedCap = resolveCapability(savedChannelModel.capability, savedChannelModel.modelKey);
        let filtered = models.filter((m) => resolveCapability(m.capability, m.id) === savedCap);
        if (filtered.length === 0) {
            // 当无强匹配能力底座时（如文本/多模态），平滑展示全部前台底座，避免选项为空
            filtered = models;
        }
        const groupsMap = new Map<string, FrontendModelItem[]>();
        for (const m of filtered) {
            const fam = m.family || "其他基础模型分组";
            if (!groupsMap.has(fam)) groupsMap.set(fam, []);
            groupsMap.get(fam)!.push(m);
        }
        return Array.from(groupsMap.entries()).map(([family, fModels]) => {
            const isVideoFam = fModels.some((m) => resolveCapability(m.capability, m.id) === "video");
            const famIcon = isVideoFam ? "🎬" : "🎨";
            return {
                label: `${famIcon} ${family} (${fModels.length} 个前台底座)`,
                options: fModels.map((m) => ({
                    value: m.id,
                    label: `${m.displayName} (${m.subtitle ? m.subtitle + " · " : ""}${m.family})`,
                })),
            };
        });
    }, [models, savedChannelModel]);

    // 打开快捷添加到分组卡片弹窗
    const handleOpenAddToCardModal = (cam: ChannelAvailableModel) => {
        setPendingModel(cam);
        const camCap = resolveCapability(cam.capability, cam.modelKey);

        // 推导智能预填家族
        let inferredFamily = "其他基础模型分组";
        const k = cam.modelKey.toLowerCase();
        if (k.includes("seedance")) inferredFamily = "字节 Seedance";
        else if (k.includes("seedream")) inferredFamily = "字节 Seedream";
        else if (k.includes("gpt-image") || k.includes("dall-e")) inferredFamily = "GPT Image 2";
        else if (k.includes("minimax") || k.includes("h3")) inferredFamily = "MiniMax H3";
        else if (k.includes("wan")) inferredFamily = "通义万相";
        else if (k.includes("grok")) inferredFamily = "xAI Grok";
        else if (k.includes("gemini") || k.includes("omni")) inferredFamily = "Google Omni";
        else if (k.includes("kling")) inferredFamily = "快手可灵 Kling";
        else if (k.includes("cog")) inferredFamily = "智谱 CogVideo";
        else if (k.includes("luma")) inferredFamily = "Luma Dream";
        else if (k.includes("runway")) inferredFamily = "Runway Gen-3";
        else if (k.includes("midjourney")) inferredFamily = "Midjourney";
        else if (k.includes("nanobanana")) inferredFamily = "谷歌 nanobanana";
        else if (k.includes("sora")) inferredFamily = "OpenAI Sora";
        else if (cam.modelKey) {
            inferredFamily = cam.modelKey.split(/[-_.]/)[0].toUpperCase();
        }

        setQuickAddMode("create_new");
        setNewModelDisplayName(cam.displayName || cam.modelKey);
        setNewModelSubtitle(
            cam.parameterSpecs?.notes?.slice(0, 35) ||
            (camCap === "video" ? "全模态高保真影视创作通道" : "商业广告级超写实生图通道")
        );
        setNewModelFamily(inferredFamily);
        setInlineBaseSearch("");

        const matchedModels = models.filter((fm) => resolveCapability(fm.capability, fm.id) === camCap);

        // 如果存在同类型推荐匹配底座，优先选中推荐匹配；如果为纯文本/多模态模型无预置专项底座，智能平滑回退到全部底座(42)，杜绝空选项
        if (matchedModels.length > 0) {
            setModalCapabilityFilter("matched");
        } else {
            setModalCapabilityFilter("all");
        }

        const candidatePool = matchedModels.length > 0 ? matchedModels : models;
        const matchingFrontend = candidatePool.find(
            (fm) =>
                fm.id.toLowerCase().includes(cam.modelKey.toLowerCase()) ||
                cam.modelKey.toLowerCase().includes(fm.id.toLowerCase())
        );
        const fallbackFirst = candidatePool[0] || models[0];
        setSelectedFrontendModelId(matchingFrontend?.id || fallbackFirst?.id || "");
        setEnableImmediately(true);
        setTargetModelModalOpen(true);
    };

    // 确认快捷添加至前端展示模型分组卡片
    const handleConfirmAddToCard = async () => {
        if (!pendingModel) return;

        // 如果所属渠道尚未启用且本次勾选了立即启用，自动激活该系统渠道
        const targetChannel = channels.find((c) => c.id === pendingModel.channelId);
        if (targetChannel && targetChannel.enabled === false && enableImmediately) {
            try {
                await updateAdminChannel(targetChannel.id, { enabled: true });
            } catch (chErr) {
                console.warn("Auto enable system channel returned:", chErr);
            }
        }

        // 查找或生成关联的 channelModelId
        let existingCM = storeChannelModels.find(
            (cm) => cm.channelId === pendingModel.channelId && cm.modelKey === pendingModel.modelKey
        );

        const defaultProtocol = pendingModel.protocol.includes("插件")
            ? "custom"
            : (pendingModel.capability === "video" ? "newapi" : "openai-image");
        const effectiveCap = resolveCapability(pendingModel.capability, pendingModel.modelKey);
        const targetCapConfig = defaultModelCapabilityConfig(defaultProtocol, pendingModel.modelKey);

        const defaultTiers: Array<{
            selector: Record<string, string>;
            resolution: string;
            videoSeconds: number;
            providerModelKey: string;
            billingMode: "fixed_request" | "per_second" | "token";
            unitPriceMicrocredits: number;
            inputTokenPriceMicrocredits: number;
            outputTokenPriceMicrocredits: number;
            cachedTokenPriceMicrocredits: number;
            priceConfigured: boolean;
            enabled: boolean;
        }> = [
            {
                selector: {},
                resolution: "*",
                videoSeconds: 0,
                providerModelKey: pendingModel.modelKey,
                billingMode: effectiveCap === "video" ? "per_second" : "fixed_request",
                unitPriceMicrocredits: 0,
                inputTokenPriceMicrocredits: 0,
                outputTokenPriceMicrocredits: 0,
                cachedTokenPriceMicrocredits: 0,
                priceConfigured: true,
                enabled: true,
            },
        ];

        if (!existingCM) {
            // 如果该物理渠道模型在数据库中尚未入库，预先创建 ChannelModel，保证 GORM 路由外键有效性
            try {
                const created = await createAdminChannelModel(pendingModel.channelId, {
                    modelKey: pendingModel.modelKey,
                    providerModelKey: pendingModel.modelKey,
                    displayName: pendingModel.displayName || pendingModel.modelKey,
                    channelLabel: "",
                    description: pendingModel.parameterSpecs?.notes || "",
                    icon: "",
                    capability: effectiveCap,
                    protocol: defaultProtocol,
                    enabled: true,
                    billingMode: effectiveCap === "video" ? "per_second" : "fixed_request",
                    unitPriceMicrocredits: 0,
                    inputTokenPriceMicrocredits: 0,
                    outputTokenPriceMicrocredits: 0,
                    cachedTokenPriceMicrocredits: 0,
                    priceConfigured: true,
                    priceTiers: defaultTiers,
                    capabilityConfig: targetCapConfig,
                });
                existingCM = created?.model;
                await loadAllData();
            } catch (createErr: any) {
                console.warn("Auto create channel model before routing returned:", createErr);
            }
        } else if (
            !existingCM.capabilityConfig ||
            !existingCM.protocol ||
            !existingCM.capability ||
            (enableImmediately && !existingCM.enabled) ||
            !existingCM.priceConfigured
        ) {
            // 如果渠道模型已存在但在数据库中未配置能力参数、未启用或未配置价格，自动为其补齐默认能力配置与价格并激活持久化，彻底杜绝报错
            try {
                const updated = await updateAdminChannelModel(pendingModel.channelId, existingCM.id, {
                    modelKey: existingCM.modelKey || pendingModel.modelKey,
                    providerModelKey: existingCM.providerModelKey || pendingModel.modelKey,
                    displayName: existingCM.displayName || pendingModel.displayName || pendingModel.modelKey,
                    channelLabel: existingCM.channelLabel || "",
                    description: existingCM.description || pendingModel.parameterSpecs?.notes || "",
                    icon: existingCM.icon || "",
                    capability: existingCM.capability || effectiveCap,
                    protocol: existingCM.protocol || defaultProtocol,
                    enabled: enableImmediately ? true : (existingCM.enabled ?? true),
                    billingMode: existingCM.billingMode || (effectiveCap === "video" ? "per_second" : "fixed_request"),
                    unitPriceMicrocredits: existingCM.unitPriceMicrocredits || 0,
                    inputTokenPriceMicrocredits: existingCM.inputTokenPriceMicrocredits || 0,
                    outputTokenPriceMicrocredits: existingCM.outputTokenPriceMicrocredits || 0,
                    cachedTokenPriceMicrocredits: existingCM.cachedTokenPriceMicrocredits || 0,
                    priceConfigured: true,
                    priceTiers: existingCM.priceTiers && existingCM.priceTiers.length > 0 ? existingCM.priceTiers : defaultTiers,
                    capabilityConfig: existingCM.capabilityConfig || targetCapConfig,
                });
                if (updated?.model) {
                    existingCM = updated.model;
                }
                await loadAllData();
            } catch (updateErr: any) {
                console.warn("Auto patch channel model capabilityConfig returned:", updateErr);
            }
        }

        const newCandidate: UpstreamCandidateModel = {
            id: existingCM?.id || `cand-${pendingModel.channelId}-${pendingModel.modelKey}-${Date.now().toString().slice(-4)}`,
            channelId: pendingModel.channelId,
            channelName: pendingModel.channelName,
            upstreamModelId: pendingModel.modelKey,
            channelModelId: existingCM?.id,
            channelProtocol: existingCM?.protocol,
            protocolType: pendingModel.protocol.includes("插件") ? "plugin" : "system",
            endpoint: pendingModel.endpoint,
            authType: pendingModel.authType,
            extractPath: pendingModel.extractPath,
            timeoutSeconds: 300,
            enabled: enableImmediately,
            supportedParameters: pendingModel.supportedParameters,
            status: "untested",
            parameterSpecs: pendingModel.parameterSpecs,
        };

        // 模式 A：一键新建专属前台展示模型并激活
        if (quickAddMode === "create_new") {
            const cap = resolveCapability(pendingModel.capability, pendingModel.modelKey);
            const cleanKey = pendingModel.modelKey.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
            let cleanCode = cleanKey;
            if (models.some((m) => m.code?.toLowerCase() === cleanCode.toLowerCase() || m.id?.toLowerCase() === cleanCode.toLowerCase())) {
                cleanCode = `${cleanKey}-${Date.now().toString().slice(-4)}`;
            }
            const newModelId = `model-${cleanCode}`;
            const finalDisplayName = newModelDisplayName.trim() || pendingModel.displayName || pendingModel.modelKey;
            const finalFamily = newModelFamily.trim() || "自定义模型";

            const newFrontendModel: FrontendModelItem = {
                id: newModelId,
                code: cleanCode,
                displayName: finalDisplayName,
                subtitle: newModelSubtitle.trim() || (cap === "video" ? "全模态高保真视频" : "超写实高清生图"),
                showSubtitle: Boolean(newModelSubtitle.trim()),
                capability: cap,
                family: finalFamily,
                group: cap === "video" ? "生视频" : "生图片",
                iconUrl: "",
                enabled: true,
                sortOrder: 1, // 新建模型置顶排序
                primaryChannelId: pendingModel.channelId,
                primaryProtocolType: pendingModel.protocol.includes("插件") ? "plugin" : "system",
                sourceCard: {
                    channelId: pendingModel.channelId,
                    channelName: pendingModel.channelName,
                    channelProtocol: existingCM?.protocol,
                    protocolType: pendingModel.protocol.includes("插件") ? "plugin" : "system",
                    upstreamModelId: pendingModel.modelKey,
                    endpoint: pendingModel.endpoint,
                    authType: pendingModel.authType,
                    extractPath: pendingModel.extractPath,
                    timeoutSeconds: 300,
                    status: "untested",
                },
                fallbackChannels: [],
                candidateUpstreams: [newCandidate],
                parameterPriorities: (newCandidate.supportedParameters || []).reduce(
                    (acc, p) => ({ ...acc, [p]: [newCandidate.id] }),
                    {} as Record<string, string[]>
                ),
                switchMatrix: cap === "image" ? COMPREHENSIVE_IMAGE_SWITCHES : COMPREHENSIVE_VIDEO_SWITCHES,
                conditionalRoutes: [],
                durationThresholdRule: {
                    enabled: false,
                    thresholdSeconds: 10,
                    targetChannelId: "",
                    targetChannelName: "",
                    targetModelId: "",
                    unitPrice: 0,
                },
                billing: {
                    unit: cap === "video" ? "second" : "count",
                    defaultCost: 0,
                    defaultRatio: 1.6,
                    defaultPrice: 0,
                    tiers: [],
                },
            };

            try {
                await addModel(newFrontendModel);
                message.success(
                    `🎉 已成功创建前台展示模型【${finalDisplayName}】，并已将渠道模型关联为第一激活线路！`
                );
                setTargetModelModalOpen(false);
            } catch (err: any) {
                message.error(`创建前台展示模型失败：${err?.message || "服务端错误"}`);
            }
            return;
        }

        // 模式 B：关联绑定至已有前台展示模型底座
        if (!selectedFrontendModelId) {
            message.warning("请选择要绑定的目标前台展示模型底座");
            return;
        }

        const targetFrontend = models.find((m) => m.id === selectedFrontendModelId);
        if (!targetFrontend) {
            message.error("未找到目标前端展示模型");
            return;
        }

        try {
            await addCandidateToModel(selectedFrontendModelId, newCandidate);
            message.success(
                `已将上游模型 [${pendingModel.displayName}] 成功加入前端模型【${targetFrontend.displayName}】候选路线！`
            );
            setTargetModelModalOpen(false);
        } catch (err: any) {
            message.error(`添加至候选路线失败：${err?.message || "服务端错误"}`);
        }
    };

    // 将画幅比例与像素尺寸分离分类（避免 30+ 规格混杂显示）
    const classifyAspectRatios = (aspectRatios: string[] = []) => {
        const standardRatios: string[] = [];
        const pixelSizes: string[] = [];
        aspectRatios.forEach((r) => {
            if (/^\d+:\d+$/.test(r) || r === "auto") {
                standardRatios.push(r);
            } else {
                pixelSizes.push(r);
            }
        });
        return { standardRatios, pixelSizes };
    };

    // 打开系统原生渠道模型配置编辑器（新特性：使用原有配置方式，支持直达指定标签页）
    const handleOpenOriginalConfigModal = (cam: ChannelAvailableModel, section: EditorSection = "identity") => {
        const targetChannel = channels.find((c) => c.id === cam.channelId);
        if (!targetChannel) {
            message.warning("未找到该物理模型所属的系统渠道，请先在【系统渠道】页面添加该渠道");
            return;
        }

        // 查找是否在系统渠道模型库中已存在该模型
        const existingCM = storeChannelModels.find(
            (cm) => cm.channelId === cam.channelId && cm.modelKey === cam.modelKey
        );

        // 查找或推断有效的默认协议，避免传入无效协议导致协议选择器报错
        const effectiveCap = resolveCapability(cam.capability, cam.modelKey);
        const matchingProto = protocols.find(
            (p) => p.capability === effectiveCap && p.enabled !== false
        )?.value;
        const defaultProto = matchingProto || (effectiveCap === "video" ? "newapi" : "openai-image");

        const modelToEdit: ChannelModel = existingCM || {
            id: "",
            channelId: targetChannel.id,
            modelKey: cam.modelKey,
            providerModelKey: cam.modelKey,
            displayName: cam.displayName || cam.modelKey,
            channelLabel: "",
            description: cam.parameterSpecs?.notes || "",
            icon: "",
            capability: effectiveCap,
            protocol: defaultProto as any,
            enabled: true,
            billingMode: effectiveCap === "video" ? "per_second" : "fixed_request",
            unitPriceMicrocredits: 0,
            inputTokenPriceMicrocredits: 0,
            outputTokenPriceMicrocredits: 0,
            cachedTokenPriceMicrocredits: 0,
            priceConfigured: false,
            priceTiers: [],
            priceVersion: 1,
            createdAt: "",
            updatedAt: "",
        };

        setEditorTargetChannel(targetChannel);
        setEditorEditingModel(modelToEdit);
        setEditorInitialSection(section);
        setEditorOpen(true);
    };

    // 系统原有配置保存成功后的回调处理
    const handleOriginalConfigSaved = async () => {
        message.success("系统原有渠道模型配置已成功保存！");
        await loadAllData();
        await loadModels(selectedChannel);

        // 获取刚刚保存的模型
        if (editorEditingModel && editorTargetChannel) {
            const refreshedStore = useModelRouterStore.getState();
            const newlySaved = refreshedStore.channelModels.find(
                (cm) => cm.channelId === editorTargetChannel.id && cm.modelKey === editorEditingModel.modelKey
            ) || editorEditingModel;

            setSavedChannelModel(newlySaved);
            // 自动推荐匹配的前台模型
            const matchingFrontend = refreshedStore.models.find(
                (fm) => fm.capability === newlySaved.capability && (fm.id.includes(newlySaved.modelKey) || newlySaved.modelKey.includes(fm.id))
            );
            setMatchTargetModelId(matchingFrontend?.id || refreshedStore.models[0]?.id || "");
            setAutoCreateFrontendModel(!matchingFrontend);
            setPostSaveMatchModalOpen(true);
        }
    };

    // 确认将新配置好的渠道模型匹配绑定至智能模型中枢
    const handleConfirmPostSaveMatch = async () => {
        if (!savedChannelModel) return;

        try {
            let targetFrontendId = matchTargetModelId;

            const targetChannel = channels.find((c) => c.id === savedChannelModel.channelId);
            const cand: UpstreamCandidateModel = {
                id: savedChannelModel.id || `cand-${savedChannelModel.channelId}-${savedChannelModel.modelKey}`,
                channelId: savedChannelModel.channelId,
                channelName: targetChannel?.name || "系统渠道",
                upstreamModelId: savedChannelModel.modelKey,
                channelModelId: savedChannelModel.id,
                channelProtocol: savedChannelModel.protocol,
                protocolType: String(savedChannelModel.protocol).includes("plugin") ? "plugin" : "system",
                endpoint: targetChannel?.baseUrl || "",
                authType: "Bearer Token",
                extractPath: "data.output",
                timeoutSeconds: 300,
                enabled: true,
                supportedParameters: extractSupportedParameterKeys(
                    (savedChannelModel.capability || "video") as CapabilityType,
                    capabilitySpecFromChannelModel(savedChannelModel)
                ),
                status: "untested",
            };

            // 如果选择了自动新建对应展示模型
            if (autoCreateFrontendModel || !targetFrontendId) {
                const cap = resolveCapability(savedChannelModel.capability, savedChannelModel.modelKey);
                const cleanKey = savedChannelModel.modelKey.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
                let cleanCode = cleanKey;
                if (models.some((m) => m.code?.toLowerCase() === cleanCode.toLowerCase() || m.id?.toLowerCase() === cleanCode.toLowerCase())) {
                    cleanCode = `${cleanKey}-${Date.now().toString().slice(-4)}`;
                }
                const newModelId = `model-${cleanCode}`;
                const newFrontendModel: FrontendModelItem = {
                    id: newModelId,
                    code: cleanCode,
                    displayName: savedChannelModel.displayName || savedChannelModel.modelKey,
                    subtitle: savedChannelModel.description || (cap === "video" ? "全模态高保真视频" : "超写实高清生图"),
                    showSubtitle: Boolean(savedChannelModel.description),
                    capability: cap,
                    family: savedChannelModel.modelKey.split(/[-_.]/)[0].toUpperCase(),
                    group: cap === "video" ? "生视频" : "生图片",
                    iconUrl: savedChannelModel.icon || "",
                    enabled: true,
                    sortOrder: 1,
                    primaryChannelId: savedChannelModel.channelId,
                    primaryProtocolType: (String(savedChannelModel.protocol).includes("plugin") ? "plugin" : "system") as any,
                    sourceCard: {
                        channelId: savedChannelModel.channelId,
                        channelName: targetChannel?.name || "",
                        channelProtocol: savedChannelModel.protocol,
                        protocolType: (String(savedChannelModel.protocol).includes("plugin") ? "plugin" : "system") as any,
                        upstreamModelId: savedChannelModel.modelKey,
                        endpoint: targetChannel?.baseUrl || "",
                        authType: "Bearer Token",
                        extractPath: "data.output",
                        timeoutSeconds: 300,
                        status: "untested",
                    },
                    fallbackChannels: [],
                    candidateUpstreams: [cand],
                    defaultCandidatePriority: [cand.id],
                    parameterPriorities: (cand.supportedParameters || []).reduce(
                        (acc, p) => ({ ...acc, [p]: [cand.id] }),
                        {} as Record<string, string[]>
                    ),
                    switchMatrix: cap === "image" ? COMPREHENSIVE_IMAGE_SWITCHES : COMPREHENSIVE_VIDEO_SWITCHES,
                    conditionalRoutes: [],
                    durationThresholdRule: {
                        enabled: false,
                        thresholdSeconds: 10,
                        targetChannelId: "",
                        targetChannelName: "",
                        targetModelId: "",
                        unitPrice: 0,
                    },
                    billing: {
                        unit: savedChannelModel.billingMode === "per_second" ? "second" : "count",
                        defaultCost: 0,
                        defaultRatio: 1.6,
                        defaultPrice: 0,
                        tiers: [],
                    },
                };

                await addModel(newFrontendModel);
            } else {
                await addCandidateToModel(targetFrontendId, cand);
            }

            message.success(`已成功将渠道模型【${savedChannelModel.displayName}】匹配绑定至智能模型中枢！看板参数已实时激活！`);
            setPostSaveMatchModalOpen(false);
        } catch (err: any) {
            message.error(`匹配至智能模型中枢失败：${err?.message || "系统异常"}`);
        }
    };

    // 检查某个渠道模型已经被添加到哪些前端展示模型中
    const getAddedFrontendModels = (channelId: string, modelKey: string) => {
        return models.filter((fm) =>
            fm.candidateUpstreams?.some(
                (c) => c.channelId === channelId && (c.upstreamModelId === modelKey || c.channelModelId === modelKey)
            )
        );
    };

    return (
        <div className="space-y-4">
            {/* 顶层控制与点击获取模型操作栏 */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Server className="size-5 text-primary" />
                        <div>
                            <h2 className="text-sm font-bold text-foreground">
                                渠道模型获取与双轨匹配中枢
                            </h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                从真实系统渠道拉取最新可用模型与参数说明，支持快捷入池，或使用系统原有配置方式（协议、能力画像、多档位计费表格）深度配置后匹配至智能模型中枢。
                            </p>
                        </div>
                    </div>

                    {/* 核心主按钮：点击获取模型 */}
                    <div className="flex items-center gap-2">
                        <Button
                            type="primary"
                            size="middle"
                            icon={<RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />}
                            loading={isFetching}
                            onClick={handleManualFetch}
                            className="font-bold shadow-sm"
                        >
                            🔄 点击从渠道获取/同步模型
                        </Button>
                    </div>
                </div>

                {/* 筛选与搜索工具条 */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/60">
                    <div className="flex items-center gap-3 flex-wrap">
                        {/* 渠道选择 */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-foreground">选择渠道:</span>
                            <Select
                                size="small"
                                className="w-56"
                                value={selectedChannel}
                                onChange={(val) => {
                                    setSelectedChannel(val);
                                    void loadModels(val);
                                }}
                                options={[
                                    { value: "all", label: "全部系统渠道" },
                                    ...channels.map((c) => ({ value: c.id, label: c.name })),
                                ]}
                            />
                            {selectedChannel !== "all" && (
                                <Button
                                    size="small"
                                    type="link"
                                    className="text-xs p-0 flex items-center gap-1 text-primary"
                                    onClick={() => setManagingChannelId(selectedChannel)}
                                >
                                    <ExternalLink className="size-3" />
                                    管理该渠道模型 ↗
                                </Button>
                            )}
                        </div>

                        {/* 能力类型筛选 */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-foreground">能力类型:</span>
                            <Segmented
                                size="small"
                                value={selectedCapability}
                                onChange={(val) => setSelectedCapability(val as any)}
                                options={[
                                    { label: "全部能力", value: "all" },
                                    { label: "生视频", value: "video" },
                                    { label: "生图片", value: "image" },
                                ]}
                            />
                        </div>
                    </div>

                    {/* 搜索框 */}
                    <div className="w-64">
                        <Input
                            size="small"
                            prefix={<Search className="size-3.5 text-muted-foreground" />}
                            placeholder="搜索模型代码、名称或渠道..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            allowClear
                        />
                    </div>
                </div>
            </div>

            {/* 模型列表呈现 */}
            {filteredModels.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-12 text-center bg-card/40 flex flex-col items-center justify-center gap-3">
                    <Server className="w-10 h-10 text-muted-foreground/40" />
                    <div className="text-sm text-muted-foreground">未检索到匹配的渠道物理模型</div>
                    <Button type="primary" size="small" onClick={handleManualFetch}>
                        从渠道获取最新模型
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {filteredModels.map((cam) => {
                        const addedTo = getAddedFrontendModels(cam.channelId, cam.modelKey);
                        const isAdded = addedTo.length > 0;
                        const isAlreadyInChannel = storeChannelModels.some(
                            (cm) => cm.channelId === cam.channelId && cm.modelKey === cam.modelKey
                        );

                        return (
                            <div
                                key={cam.id}
                                className="rounded-xl border border-border bg-card p-4 shadow-sm hover:border-primary/50 hover:shadow-md transition-all flex flex-col justify-between"
                            >
                                <div>
                                    {/* 卡片头部：渠道与协议 */}
                                    <div className="flex items-center justify-between border-b border-border/60 pb-2 mb-2.5">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <Tag
                                                color="blue"
                                                className="rounded-full text-[10px] m-0 font-medium cursor-pointer hover:opacity-80 transition-opacity"
                                                title={`点击直接打开【${cam.channelName}】的模型管理`}
                                                onClick={() => setManagingChannelId(cam.channelId)}
                                            >
                                                {cam.channelName} ↗
                                            </Tag>
                                            {(() => {
                                                const cap = resolveCapability(cam.capability, cam.modelKey);
                                                return (
                                                    <Tag
                                                        color={cap === "video" ? "purple" : cap === "image" ? "cyan" : "default"}
                                                        className="rounded-full text-[10px] m-0 font-medium"
                                                    >
                                                        {cap === "video" ? "生视频" : cap === "image" ? "生图片" : "纯文本"}
                                                    </Tag>
                                                );
                                            })()}
                                            {isAlreadyInChannel ? (
                                                <Tag color="green" className="text-[10px] m-0">
                                                    已配价格档
                                                </Tag>
                                            ) : (
                                                <Tag color="orange" className="text-[10px] m-0">
                                                    待配系统价格
                                                </Tag>
                                            )}
                                        </div>

                                        {isAdded && (
                                            <Tooltip title={`已加入前台模型：${addedTo.map((f) => f.displayName).join("、")}`}>
                                                <Tag color="success" className="rounded-full text-[10px] m-0 flex items-center gap-1">
                                                    <Check className="size-2.5" /> 已接入中枢
                                                </Tag>
                                            </Tooltip>
                                        )}
                                    </div>

                                    {/* 模型名称与代码 */}
                                    <div className="mb-2">
                                        <h3 className="font-bold text-sm text-foreground">
                                            {cam.displayName}
                                        </h3>
                                        <code className="text-xs font-mono text-primary font-semibold bg-muted/60 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                                            {cam.modelKey}
                                        </code>
                                    </div>

                                    {/* 参数特性摘要 */}
                                    {(() => {
                                        const cap = resolveCapability(cam.capability, cam.modelKey);
                                        return (
                                            <div className="rounded-lg bg-muted/20 p-2 text-xs space-y-1 mb-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-muted-foreground text-[11px]">
                                                        {cap === "image" ? "最大规格/画质:" : "最高分辨率:"}
                                                    </span>
                                                    <span className="font-semibold text-foreground font-mono">
                                                        {cam.parameterSpecs.maxResolution}
                                                    </span>
                                                </div>
                                                {cap === "video" && cam.parameterSpecs.durationRange ? (
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-muted-foreground text-[11px]">支持时长:</span>
                                                        <span className="text-foreground">{cam.parameterSpecs.durationRange}</span>
                                                    </div>
                                                ) : cap === "image" ? (
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-muted-foreground text-[11px]">生成模式:</span>
                                                        <span className="text-foreground font-medium text-[11px]">文生图 · 图生图</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-muted-foreground text-[11px]">模型类型:</span>
                                                        <span className="text-foreground font-medium text-[11px]">纯文本/对话</span>
                                                    </div>
                                                )}
                                                {(() => {
                                                    const { standardRatios, pixelSizes } = classifyAspectRatios(cam.parameterSpecs.aspectRatios);
                                                    return (
                                                        <div className="space-y-0.5 pt-0.5 border-t border-border/40">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-muted-foreground text-[11px]">支持画幅:</span>
                                                                <span
                                                                    className="text-foreground text-[11px] font-medium truncate max-w-[200px]"
                                                                    title={cam.parameterSpecs.aspectRatios.join(", ")}
                                                                >
                                                                    {standardRatios.length > 0 ? standardRatios.join(", ") : "自适应"}
                                                                </span>
                                                            </div>
                                                            {pixelSizes.length > 0 && (
                                                                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                                                    <span>预设像素规格:</span>
                                                                    <span className="font-mono">{pixelSizes.length} 档 (1K/2K/4K)</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        );
                                    })()}

                                    {/* 支持参数标签列表 */}
                                    <div className="mb-3">
                                        <div className="text-[11px] text-muted-foreground mb-1">
                                            支持特性 ({cam.supportedParameters.length} 项):
                                        </div>
                                        <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                                            {cam.supportedParameters.map((p) => (
                                                <Tag key={p} className="text-[10px] m-0 px-1 py-0">
                                                    {p}
                                                </Tag>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* 底部操作栏：查看说明 & 双轨匹配按钮 */}
                                <div className="pt-2.5 border-t border-border/60 space-y-2">
                                    <div className="flex items-center justify-between gap-1.5">
                                        <Button
                                            size="small"
                                            icon={<Info className="size-3.5" />}
                                            onClick={() => setSpecModalModel(cam)}
                                            className="text-xs"
                                        >
                                            参数说明
                                        </Button>

                                        <Button
                                            size="small"
                                            icon={<Server className="size-3.5" />}
                                            onClick={() => setManagingChannelId(cam.channelId)}
                                            className="text-xs text-muted-foreground hover:text-primary"
                                        >
                                            渠道模型 ↗
                                        </Button>

                                        <Button
                                            size="small"
                                            icon={<Plus className="size-3.5" />}
                                            onClick={() => handleOpenAddToCardModal(cam)}
                                            className="text-xs"
                                        >
                                            快捷加入
                                        </Button>
                                    </div>

                                    {/* 核心新功能：使用系统原有配置方式导入并匹配 */}
                                    <Button
                                        size="small"
                                        type="primary"
                                        icon={<Wrench className="size-3.5" />}
                                        onClick={() => handleOpenOriginalConfigModal(cam)}
                                        className="w-full text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500"
                                    >
                                        🛠️ 原有方式配置并匹配至中枢
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* 模型具体参数规格说明弹窗 */}
            <Modal
                open={Boolean(specModalModel)}
                onCancel={() => setSpecModalModel(null)}
                title={
                    <div className="flex items-center gap-2">
                        <Info className="size-4 text-primary" />
                        <span className="font-bold">
                            渠道模型具体参数规格说明 · [{specModalModel?.channelName}] {specModalModel?.displayName}
                        </span>
                    </div>
                }
                width={680}
                footer={[
                    <Button
                        key="edit-capabilities"
                        type="primary"
                        icon={<Edit3 className="size-3.5" />}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                        onClick={() => {
                            const modelToEdit = specModalModel;
                            setSpecModalModel(null);
                            if (modelToEdit) {
                                handleOpenOriginalConfigModal(modelToEdit, "capabilities");
                            }
                        }}
                    >
                        ✏️ 修改参数规格与画幅
                    </Button>,
                    <Button
                        key="original"
                        icon={<Wrench className="size-3.5" />}
                        onClick={() => {
                            const modelToAdd = specModalModel;
                            setSpecModalModel(null);
                            if (modelToAdd) handleOpenOriginalConfigModal(modelToAdd, "identity");
                        }}
                    >
                        使用系统原有方式配置并匹配
                    </Button>,
                    <Button
                        key="manage-channel"
                        icon={<Server className="size-3.5" />}
                        onClick={() => {
                            const chId = specModalModel?.channelId;
                            setSpecModalModel(null);
                            if (chId) setManagingChannelId(chId);
                        }}
                    >
                        渠道模型管理 ↗
                    </Button>,
                    <Button key="close" onClick={() => setSpecModalModel(null)}>
                        关闭
                    </Button>,
                ]}
            >
                {specModalModel && (() => {
                    const { standardRatios, pixelSizes } = classifyAspectRatios(specModalModel.parameterSpecs.aspectRatios);
                    const modalCap = resolveCapability(specModalModel.capability, specModalModel.modelKey);
                    return (
                        <div className="space-y-3.5 text-xs py-2">
                            <div className="grid grid-cols-2 gap-3 bg-muted/30 p-3 rounded-xl border border-border">
                                <div>
                                    <span className="text-muted-foreground block text-[11px] mb-0.5">物理模型代码 (Upstream ID):</span>
                                    <code className="font-bold font-mono text-primary text-xs">{specModalModel.modelKey}</code>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[11px] mb-0.5">所属渠道服务商:</span>
                                    <span className="font-bold text-foreground text-xs">{specModalModel.channelName}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[11px] mb-0.5">
                                        {modalCap === "image" ? "最大输出规格/画质:" : "最大支持分辨率:"}
                                    </span>
                                    <span className="font-bold text-foreground text-xs font-mono">{specModalModel.parameterSpecs.maxResolution}</span>
                                </div>
                                {modalCap === "video" && specModalModel.parameterSpecs.durationRange ? (
                                    <div>
                                        <span className="text-muted-foreground block text-[11px] mb-0.5">成片时长范围:</span>
                                        <span className="font-bold text-foreground text-xs">{specModalModel.parameterSpecs.durationRange}</span>
                                    </div>
                                ) : (
                                    <div>
                                        <span className="text-muted-foreground block text-[11px] mb-0.5">计费结算类型:</span>
                                        <span className="font-bold text-foreground text-xs text-primary">按次扣点 (支持多档尺寸价格)</span>
                                    </div>
                                )}
                            </div>

                            {/* 来源依据与自定义修改说明提示卡片 */}
                            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 text-xs space-y-1.5">
                                <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold text-xs">
                                    <Info className="size-3.5" />
                                    <span>参数与画幅规格来源依据说明</span>
                                </div>
                                <p className="text-muted-foreground text-[11px] leading-relaxed m-0">
                                    1. <strong>上游接口规范</strong>：标准 OpenAI 格式接口（<code>/v1/models</code>）仅返回物理模型 ID（如 <code>{specModalModel.modelKey}</code>），上游协议本身不包含画幅与分辨率元数据。<br />
                                    2. <strong>系统规格矩阵</strong>：系统根据通用生图模型规范，默认预置了 <strong>{standardRatios.length} 种常用画幅比例</strong> 以及对应 1K/2K/4K 阶梯的 <strong>{pixelSizes.length} 档像素预设</strong>。<br />
                                    3. <strong>支持自由修改</strong>：点击下方【<strong>✏️ 修改参数规格与画幅</strong>】即可自定义该模型支持的比例与分辨率，修改后立即在系统生图组件与调度路由中生效。
                                </p>
                            </div>

                            {/* 结构化画幅比例展示 */}
                            <div className="space-y-2">
                                <div>
                                    <span className="text-muted-foreground block text-[11px] mb-1 font-semibold">
                                        常用画幅比例 ({standardRatios.length} 种):
                                    </span>
                                    <div className="flex gap-1.5 flex-wrap">
                                        {standardRatios.map((r) => (
                                            <Tag key={r} color="cyan" className="font-mono">{r}</Tag>
                                        ))}
                                    </div>
                                </div>

                                {pixelSizes.length > 0 && (
                                    <div>
                                        <span className="text-muted-foreground block text-[11px] mb-1 font-semibold">
                                            预设像素分辨率规格 ({pixelSizes.length} 档 · 1K/2K/4K):
                                        </span>
                                        <div className="flex gap-1.5 flex-wrap max-h-24 overflow-y-auto p-1.5 bg-muted/20 rounded-lg border border-border/50">
                                            {pixelSizes.map((r) => (
                                                <Tag key={r} color="geekblue" className="font-mono text-[10px] m-0.5">{r}</Tag>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div>
                                <span className="text-muted-foreground block text-[11px] mb-1 font-semibold">支持多模态输入方式:</span>
                                <div className="flex gap-1.5 flex-wrap">
                                    {specModalModel.parameterSpecs.modalities.map((m) => {
                                        return (
                                            <Tag key={m} color={modalCap === "image" ? "green" : modalCap === "video" ? "purple" : "blue"}>{m}</Tag>
                                        );
                                    })}
                                </div>
                            </div>

                            <div>
                                <span className="text-muted-foreground block text-[11px] mb-1 font-semibold">接口请求端点与提取路径:</span>
                                <div className="bg-muted p-2.5 rounded-lg space-y-1 font-mono text-[11px]">
                                    <div><span className="text-muted-foreground">Endpoint: </span><span className="text-foreground break-all">{specModalModel.endpoint}</span></div>
                                    <div><span className="text-muted-foreground">Auth: </span><span className="text-foreground">{specModalModel.authType}</span></div>
                                    <div><span className="text-muted-foreground">Extract: </span><span className="text-foreground">{specModalModel.extractPath}</span></div>
                                </div>
                            </div>

                            <div>
                                <span className="text-muted-foreground block text-[11px] mb-1 font-semibold">官方详细说明与生产备注:</span>
                                <p className="text-muted-foreground leading-relaxed bg-muted/20 p-2.5 rounded-lg border border-border/60 m-0">
                                    {specModalModel.parameterSpecs.notes}
                                </p>
                            </div>
                        </div>
                    );
                })()}
            </Modal>

            {/* 快捷添加到前端展示模型分组卡片弹窗 */}
            <Modal
                open={targetModelModalOpen}
                onCancel={() => setTargetModelModalOpen(false)}
                title={
                    <div className="flex items-center gap-2">
                        {quickAddMode === "create_new" ? (
                            <Sparkles className="size-4 text-amber-500" />
                        ) : (
                            <Plus className="size-4 text-primary" />
                        )}
                        <span className="font-bold">
                            {quickAddMode === "create_new"
                                ? "快捷创建并激活前台模型"
                                : "快捷添加到前台模型候选路线"}
                        </span>
                    </div>
                }
                width={660}
                onOk={handleConfirmAddToCard}
                okText={quickAddMode === "create_new" ? "✨ 立即创建并激活模型" : "确认添加至路线"}
                cancelText="取消"
            >
                {pendingModel && (
                    <div className="space-y-4 text-xs py-2">
                        {/* 当前选中的上游物理模型信息横幅 */}
                        <div className="rounded-xl bg-muted/40 p-3 border border-border/80 space-y-1.5">
                            <span className="text-[11px] text-muted-foreground block font-medium">
                                当前选中的渠道物理模型：
                            </span>
                            <div className="flex items-center gap-2 flex-wrap">
                                <Tag color="blue" className="text-xs m-0 font-medium">
                                    {pendingModel.channelName}
                                </Tag>
                                <span className="font-bold text-foreground text-xs">
                                    {pendingModel.displayName}
                                </span>
                                <code className="text-primary font-mono text-xs font-bold bg-primary/10 px-1.5 py-0.5 rounded">
                                    {pendingModel.modelKey}
                                </code>
                                {(() => {
                                    const cap = resolveCapability(pendingModel.capability, pendingModel.modelKey);
                                    const color = cap === "video" ? "purple" : cap === "image" ? "cyan" : "blue";
                                    const label = cap === "video" ? "生视频" : cap === "image" ? "生图片" : "文本/多模态";
                                    return (
                                        <Tag color={color} className="text-xs m-0 font-medium">
                                            {label}
                                        </Tag>
                                    );
                                })()}
                                {pendingModel.parameterSpecs?.maxResolution && (
                                    <Tag className="text-[11px] m-0 bg-muted text-muted-foreground font-mono">
                                        {pendingModel.parameterSpecs.maxResolution}
                                    </Tag>
                                )}
                            </div>
                        </div>

                        {/* 两种操作模式切换卡片（独立网格卡片，杜绝 antd radio button 浮动与高度塌陷重叠） */}
                        <div className="space-y-2">
                            <label className="font-semibold text-foreground block text-xs">
                                选择快捷入池模式：
                            </label>
                            <div className="grid grid-cols-2 gap-3 w-full">
                                <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setQuickAddMode("create_new")}
                                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setQuickAddMode("create_new")}
                                    className={`relative p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
                                        quickAddMode === "create_new"
                                            ? "border-amber-500 bg-amber-500/10 shadow-sm ring-2 ring-amber-500/30"
                                            : "border-border/80 bg-background hover:bg-muted/40 hover:border-border"
                                    }`}
                                >
                                    <div>
                                        <div className="flex items-center justify-between gap-1 w-full mb-1">
                                            <span className="font-bold text-xs flex items-center gap-1.5 text-foreground">
                                                <Sparkles className="size-3.5 text-amber-500 shrink-0" />
                                                模式 A：一键新建专属前台模型
                                            </span>
                                            <Tag color="gold" className="text-[10px] m-0 px-1.5 py-0 leading-tight shrink-0 font-medium">
                                                推荐
                                            </Tag>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground leading-normal m-0">
                                            自动在前台看板创建对应卡片，并将当前渠道模型直接绑定为第一激活路线。
                                        </p>
                                    </div>
                                    <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                        <div className={`size-3.5 rounded-full border flex items-center justify-center ${
                                            quickAddMode === "create_new" ? "border-amber-500 bg-amber-500 text-white" : "border-muted-foreground/40"
                                        }`}>
                                            {quickAddMode === "create_new" && <div className="size-1.5 rounded-full bg-white" />}
                                        </div>
                                        <span>{quickAddMode === "create_new" ? "已选择此模式" : "点击选择模式 A"}</span>
                                    </div>
                                </div>

                                <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setQuickAddMode("bind_existing")}
                                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setQuickAddMode("bind_existing")}
                                    className={`relative p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
                                        quickAddMode === "bind_existing"
                                            ? "border-primary bg-primary/10 shadow-sm ring-2 ring-primary/30"
                                            : "border-border/80 bg-background hover:bg-muted/40 hover:border-border"
                                    }`}
                                >
                                    <div>
                                        <div className="flex items-center justify-between gap-1 w-full mb-1">
                                            <span className="font-bold text-xs flex items-center gap-1.5 text-foreground">
                                                <Layers className="size-3.5 text-primary shrink-0" />
                                                模式 B：关联绑定至已有底座
                                            </span>
                                            <Tag color="blue" className="text-[10px] m-0 px-1.5 py-0 leading-tight shrink-0 font-medium">
                                                底座
                                            </Tag>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground leading-normal m-0">
                                            作为一条候选或备份线路，挂载到系统已有的 42 个基础展示模型底座中。
                                        </p>
                                    </div>
                                    <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-primary">
                                        <div className={`size-3.5 rounded-full border flex items-center justify-center ${
                                            quickAddMode === "bind_existing" ? "border-primary bg-primary text-white" : "border-muted-foreground/40"
                                        }`}>
                                            {quickAddMode === "bind_existing" && <div className="size-1.5 rounded-full bg-white" />}
                                        </div>
                                        <span>{quickAddMode === "bind_existing" ? "已选择此模式" : "点击选择模式 B"}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 模式 A：一键新建专属前台展示模型 */}
                        {quickAddMode === "create_new" && (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-3">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-foreground block">
                                        前台模型展示名称：
                                    </label>
                                    <Input
                                        size="middle"
                                        value={newModelDisplayName}
                                        onChange={(e) => setNewModelDisplayName(e.target.value)}
                                        placeholder="如 gpt-image-2 或 GPT-Image-2 (官方写实)"
                                    />
                                    <span className="text-[11px] text-muted-foreground block">
                                        前端用户在灵感库、编导画布与看板上看到的模型名称
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-foreground block">
                                            归属厂商家族：
                                        </label>
                                        <Select
                                            className="w-full"
                                            size="middle"
                                            value={newModelFamily}
                                            onChange={setNewModelFamily}
                                            showSearch
                                            getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
                                            options={Array.from(new Set([...families, "GPT Image 2", "字节 Seedance", "字节 Seedream", "MiniMax H3", "通义万相", "xAI Grok", "Google Omni", "其他基础模型分组"])).map((f) => ({
                                                label: f,
                                                value: f,
                                            }))}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-foreground block">
                                            模型特性描述 (副标题)：
                                        </label>
                                        <Input
                                            size="middle"
                                            value={newModelSubtitle}
                                            onChange={(e) => setNewModelSubtitle(e.target.value)}
                                            placeholder="如 商业广告级 4K 超写实 · 官方通道"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 模式 B：关联绑定至已有前台模型底座 */}
                        {quickAddMode === "bind_existing" && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <label className="font-semibold text-foreground block">
                                        选择要添加到的目标前台模型底座：
                                    </label>
                                    <div className="flex items-center gap-1">
                                        <span className="text-[11px] text-muted-foreground mr-1">底座范围:</span>
                                        <Segmented
                                            size="small"
                                            value={modalCapabilityFilter}
                                            onChange={(val) => handleModalFilterChange(val as any)}
                                            options={[
                                                {
                                                    label: `🌟 推荐匹配 (${modalCapabilityCounts.matchedCount})`,
                                                    value: "matched",
                                                    disabled: modalCapabilityCounts.matchedCount === 0,
                                                },
                                                { label: `📦 全部底座 (${modalCapabilityCounts.totalCount})`, value: "all" },
                                                { label: `🎬 视频 (${modalCapabilityCounts.videoCount})`, value: "video" },
                                                { label: `🎨 图片 (${modalCapabilityCounts.imageCount})`, value: "image" },
                                            ]}
                                        />
                                    </div>
                                </div>

                                {/* 平铺内联可视化卡片列表（零弹层、零遮挡、零抖动，100% 可见可点） */}
                                <div className="rounded-xl border border-border bg-card p-3 space-y-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                                            <Layers className="size-3.5 text-primary" />
                                            直接从下方底座列表中点击卡片选中：
                                        </span>
                                        <span className="text-[11px] text-muted-foreground">
                                            已筛选 <strong className="text-foreground">{filteredBaseModels.length}</strong> 个底座
                                        </span>
                                    </div>

                                    {/* 即时搜索框 */}
                                    <Input
                                        size="small"
                                        allowClear
                                        prefix={<Search className="size-3.5 text-muted-foreground mr-1" />}
                                        placeholder="即时过滤底座名称、厂商家族（输入 gpt、wan、seedance 等）..."
                                        value={inlineBaseSearch}
                                        onChange={(e) => setInlineBaseSearch(e.target.value)}
                                        className="text-xs"
                                    />

                                    {/* 内联滚动卡片列表 */}
                                    <div className="max-h-[210px] overflow-y-auto space-y-1.5 pr-1 -mr-1">
                                        {filteredBaseModels.length === 0 ? (
                                            <div className="py-6 text-center text-xs text-muted-foreground">
                                                未找到匹配的前台底座，可尝试切换上方筛选标签或搜索关键字
                                            </div>
                                        ) : (
                                            filteredBaseModels.map((m) => {
                                                const isSelected = selectedFrontendModelId === m.id;
                                                const cap = resolveCapability(m.capability, m.id);
                                                const routeCount = m.candidateUpstreams?.length || 0;
                                                return (
                                                    <div
                                                        key={m.id}
                                                        onClick={() => setSelectedFrontendModelId(m.id)}
                                                        className={`cursor-pointer rounded-lg border p-2 transition-all flex items-center justify-between gap-3 ${
                                                            isSelected
                                                                ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30"
                                                                : "border-border/60 bg-muted/20 hover:border-primary/40 hover:bg-muted/40"
                                                        }`}
                                                    >
                                                        <div className="min-w-0 flex-1 space-y-0.5">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`font-bold text-xs ${isSelected ? "text-primary" : "text-foreground"}`}>
                                                                    {m.displayName}
                                                                </span>
                                                                <Tag color={cap === "video" ? "purple" : "cyan"} className="text-[10px] m-0 px-1 py-0">
                                                                    {cap === "video" ? "视频" : "图片"}
                                                                </Tag>
                                                                <Tag className="text-[10px] m-0 px-1 py-0 bg-muted text-muted-foreground border-border/50">
                                                                    {m.family}
                                                                </Tag>
                                                            </div>
                                                            {m.subtitle && (
                                                                <p className="text-[11px] text-muted-foreground truncate">
                                                                    {m.subtitle}
                                                                </p>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-2 shrink-0">
                                                            {routeCount > 0 ? (
                                                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                                                    {routeCount}条线路
                                                                </span>
                                                            ) : (
                                                                <span className="text-[10px] text-muted-foreground/80 font-mono bg-muted px-1.5 py-0.5 rounded">
                                                                    基础底座
                                                                </span>
                                                            )}
                                                            {isSelected ? (
                                                                <div className="size-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                                                                    <Check className="size-2.5 stroke-[3]" />
                                                                </div>
                                                            ) : (
                                                                <div className="size-4 rounded-full border border-border flex items-center justify-center text-transparent" />
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>

                                {/* 下拉备选 Select（增加 getPopupContainer 与 virtual={false} 防抖动防失焦） */}
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                        <span>也可以从下拉列表中快速选取：</span>
                                        <span>当前选定: <strong className="text-primary">{models.find((m) => m.id === selectedFrontendModelId)?.displayName || "未选择"}</strong></span>
                                    </div>
                                    <div className="relative w-full">
                                        <Select
                                            className="w-full"
                                            size="middle"
                                            value={selectedFrontendModelId}
                                            onChange={setSelectedFrontendModelId}
                                            showSearch
                                            placeholder="请选择或搜索目标前台展示模型底座..."
                                            filterOption={(input, option) => {
                                                const text = (option as any)?.filterText || (option as any)?.label || "";
                                                return String(text).toLowerCase().includes(input.toLowerCase());
                                            }}
                                            options={groupedTargetModelOptions}
                                            getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
                                            placement="bottomLeft"
                                            popupMatchSelectWidth={true}
                                            virtual={false}
                                            dropdownStyle={{ maxHeight: 260 }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 立即启用选项 */}
                        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3">
                            <Checkbox
                                checked={enableImmediately}
                                onChange={(e) => setEnableImmediately(e.target.checked)}
                            >
                                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                    立即勾选启用（该模型支持的参数规格将在看板上立即激活变绿）
                                </span>
                            </Checkbox>
                        </div>
                    </div>
                )}
            </Modal>

            {/* 系统原生渠道模型配置编辑器（ChannelModelEditor 原汁原味） */}
            {editorOpen && editorTargetChannel && (
                <ChannelModelEditor
                    channel={editorTargetChannel}
                    editing={editorEditingModel}
                    protocols={protocols}
                    protocolLoading={protocolLoading}
                    protocolError={protocolError}
                    onRetryProtocols={loadProtocols}
                    onClose={() => setEditorOpen(false)}
                    onSaved={handleOriginalConfigSaved}
                    initialSection={editorInitialSection}
                />
            )}

            {/* 原生配置保存成功后的“匹配至智能模型中枢”向导弹窗 */}
            <Modal
                open={postSaveMatchModalOpen}
                onCancel={() => setPostSaveMatchModalOpen(false)}
                title={
                    <div className="flex items-center gap-2">
                        <Sparkles className="size-4 text-emerald-500" />
                        <span className="font-bold">
                            渠道模型配置已落库 · 匹配至智能模型中枢
                        </span>
                    </div>
                }
                width={580}
                onOk={handleConfirmPostSaveMatch}
                okText="立即绑定并激活中枢路线"
                cancelText="暂不匹配"
            >
                {savedChannelModel && (
                    <div className="space-y-4 text-xs py-3">
                        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 space-y-1">
                            <span className="text-[11px] text-emerald-700 dark:text-emerald-300 font-bold block">
                                ✅ 渠道物理模型已使用系统原有配置方式成功落库！
                            </span>
                            <div className="flex items-center gap-2 text-foreground">
                                <span>模型标识: <strong>{savedChannelModel.modelKey}</strong></span>
                                <span>·</span>
                                <span>能力: <strong>{savedChannelModel.capability}</strong></span>
                                <span>·</span>
                                <span>价格档位: <strong>{savedChannelModel.priceTiers?.length || 0} 个</strong></span>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="font-semibold text-foreground block mb-1">
                                    匹配方式选择:
                                </label>
                                <div className="space-y-2">
                                    <Checkbox
                                        checked={autoCreateFrontendModel}
                                        onChange={(e) => setAutoCreateFrontendModel(e.target.checked)}
                                    >
                                        <span className="text-xs font-semibold text-foreground">
                                            一键为此渠道模型新建专属前台展示模型 (推荐)
                                        </span>
                                    </Checkbox>

                                    {!autoCreateFrontendModel && (
                                        <div className="ml-6 space-y-1">
                                            <span className="text-[11px] text-muted-foreground block">
                                                或者选择匹配至已有的前台模型作为候选路线：
                                            </span>
                                            <div className="relative w-full">
                                                <Select
                                                    className="w-full"
                                                    size="middle"
                                                    value={matchTargetModelId}
                                                    onChange={setMatchTargetModelId}
                                                    showSearch
                                                    placeholder="选择匹配的目标前台模型底座..."
                                                    options={postSaveGroupedOptions}
                                                    getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
                                                    placement="bottomLeft"
                                                    popupMatchSelectWidth={true}
                                                    virtual={false}
                                                    dropdownStyle={{ maxHeight: 360 }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <p className="text-[11px] text-muted-foreground bg-muted/30 p-2.5 rounded-lg border border-border">
                                💡 绑定后，该渠道物理模型将作为智能模型中枢的合法供应路线，其所支持的分辨率、时长规格及价格将立即在参数看板上呈现，并在用户生图/生视频时参与调度分流。
                            </p>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
// @opc-feature: model-smart-router [end]
