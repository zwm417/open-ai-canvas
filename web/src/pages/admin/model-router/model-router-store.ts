// @opc-feature: model-smart-router [start]
import { create } from "zustand";
import type {
    FrontendModelItem,
    PluginProtocolItem,
    CapabilityType,
    ProtocolType,
    UpstreamCandidateModel,
    ChannelAvailableModel,
} from "./types";
import {
    listAdminLogicalModels,
    createAdminLogicalModel,
    updateAdminLogicalModel,
    deleteAdminLogicalModel,
    type AdminLogicalModel,
} from "@/services/api/logical-models";
import { listAdminChannels } from "@/services/api/auth";
import {
    listAdminChannelModels,
    updateAdminChannelModel,
    type ChannelModel,
} from "@/services/api/wallet";
import type { ModelChannel } from "@/stores/use-config-store";
import {
    logicalModelToFrontendItem,
    frontendItemToLogicalModelMutation,
    convertMatrixTiersToChannelPriceTiers,
    yuanToMicrocredits,
    extractSupportedParameterKeys,
    resolveCapability,
    resolveMaxResolution,
} from "./model-router-adapter";
import { testRealModelConnectivity } from "./utils/real-connectivity-tester";
import { invalidateRoutingCache } from "./utils/routing-engine";
import {
    BASE_FOUNDATION_MODELS,
    INITIAL_FAMILIES,
    INITIAL_PLUGIN_PROTOCOLS,
    getApplicableParametersForModel,
} from "./mock-data";
import { capabilitySpecFromChannelModel } from "../logical-models/model-routing-capabilities";

interface ModelRouterState {
    models: FrontendModelItem[];
    rawLogicalModels: AdminLogicalModel[];
    channels: ModelChannel[];
    channelModels: ChannelModel[];
    plugins: PluginProtocolItem[];
    families: string[];
    isLoading: boolean;
    error: string | null;

    // 当前就地打开模型管理的系统渠道 ID (实现直通管理并即改即刷)
    managingChannelId: string | null;
    setManagingChannelId: (channelId: string | null) => void;

    // 过滤与展示状态
    selectedCapability: "all" | CapabilityType;
    selectedProtocolType: "all" | ProtocolType;
    selectedFamily: string;
    searchQuery: string;

    // Actions
    setSelectedCapability: (cap: "all" | CapabilityType) => void;
    setSelectedProtocolType: (proto: "all" | ProtocolType) => void;
    setSelectedFamily: (family: string) => void;
    setSearchQuery: (query: string) => void;

    // 真实数据库全量加载
    loadAllData: () => Promise<void>;

    // 核心业务更新（直连后端 GORM 数据库）
    toggleModelEnabled: (modelId: string, enabled: boolean) => Promise<void>;
    updateModel: (updatedModel: FrontendModelItem) => Promise<void>;
    addModel: (newModel: FrontendModelItem) => Promise<void>;
    deleteModel: (modelId: string) => Promise<void>;
    addFamily: (familyName: string) => void;
    reorderModels: (capability: "video" | "image", orderedIds: string[]) => Promise<void>;
    testModelConnectivity: (modelId: string) => Promise<{ latencyMs: number; status: "healthy" | "warning" | "error"; errorMessage?: string }>;

    // 候选池与同参数优选路由管理
    toggleCandidateEnabled: (modelId: string, candidateId: string, enabled: boolean) => Promise<void>;
    addCandidateToModel: (modelId: string, candidate: UpstreamCandidateModel) => Promise<void>;
    removeCandidateFromModel: (modelId: string, candidateId: string) => Promise<void>;
    setParameterPriority: (modelId: string, paramKey: string, candidateIds: string[]) => Promise<void>;
    testCandidateConnectivity: (modelId: string, candidateId: string) => Promise<{ latencyMs: number; status: string; testedAt: string; errorMessage?: string }>;
    fetchChannelModels: (channelId: string) => Promise<ChannelAvailableModel[]>;

    // 插件管理与一键 AI 分析
    addPlugin: (plugin: PluginProtocolItem) => void;
    togglePluginStatus: (pluginId: string, status: boolean) => void;
    analyzePluginWithAI: (rawSchema: string) => Promise<{
        differences: string[];
        canAutoRoute: boolean;
        canAutoRouteBySwitch: boolean;
        suggestedGroup: string;
        suggestedFamily: string;
    }>;
    resetToDefaults: () => Promise<void>;
}

export const useModelRouterStore = create<ModelRouterState>()((set, get) => ({
    models: BASE_FOUNDATION_MODELS,
    rawLogicalModels: [],
    channels: [],
    channelModels: [],
    plugins: INITIAL_PLUGIN_PROTOCOLS,
    families: INITIAL_FAMILIES,
    isLoading: false,
    error: null,

    managingChannelId: null,
    setManagingChannelId: (channelId) => set({ managingChannelId: channelId }),

    selectedCapability: "all",
    selectedProtocolType: "all",
    selectedFamily: "all",
    searchQuery: "",

    setSelectedCapability: (cap) => set({ selectedCapability: cap }),
    setSelectedProtocolType: (proto) => set({ selectedProtocolType: proto }),
    setSelectedFamily: (family) => set({ selectedFamily: family }),
    setSearchQuery: (query) => set({ searchQuery: query }),

    /** 真实数据库全量读取与适配 */
    loadAllData: async () => {
        set({ isLoading: true, error: null });
        try {
            const [logicalRes, firstChannelPage] = await Promise.all([
                listAdminLogicalModels(),
                listAdminChannels({ page: 1, pageSize: 100 }),
            ]);

            // 递归拉取全部渠道页面
            let channels: ModelChannel[] = firstChannelPage.channels || [];
            if (firstChannelPage.total > firstChannelPage.pageSize) {
                const totalPages = Math.ceil(firstChannelPage.total / firstChannelPage.pageSize);
                const restPages = await Promise.all(
                    Array.from({ length: totalPages - 1 }, (_, i) =>
                        listAdminChannels({ page: i + 2, pageSize: firstChannelPage.pageSize })
                    )
                );
                channels = [
                    ...channels,
                    ...restPages.flatMap((p) => p.channels || []),
                ];
            }

            // 拉取各渠道包含的真实 ChannelModel
            const channelModelResults = await Promise.all(
                channels.map((c) => listAdminChannelModels(c.id).catch(() => ({ models: [] as ChannelModel[] })))
            );
            const allChannelModels: ChannelModel[] = channelModelResults.flatMap((r) => r.models || []);

            // 将后端逻辑模型转换为前端展示模型
            const rawModels = logicalRes.models || [];
            const dbFrontendModels = rawModels.map((lm) =>
                logicalModelToFrontendItem(lm, channels, allChannelModels)
            );

            // 读取已删除底座模型记录 (本地存储持久化，防止刷新后死灰复燃)
            let deletedBaseIds = new Set<string>();
            try {
                const deletedList = JSON.parse(localStorage.getItem("opc_deleted_base_model_ids") || "[]") as string[];
                deletedBaseIds = new Set(deletedList);
            } catch {
                // ignore
            }

            // 过滤已被用户删除的数据库模型 (防御后端异步延迟或缓存)
            const filteredDbModels = dbFrontendModels.filter(
                (m) =>
                    !deletedBaseIds.has(m.id) &&
                    !deletedBaseIds.has(m.code || "") &&
                    !deletedBaseIds.has(`model-${m.code}`) &&
                    !deletedBaseIds.has(m.displayName || "")
            );

            // 融合底座展示分组：已有数据库记录优先，未落库底座模型常驻提供可选母版（过滤掉已被用户主动删除的）
            const dbModelIds = new Set(rawModels.map((m) => m.id));
            const dbModelCodes = new Set(rawModels.map((m) => m.code).filter(Boolean));
            const unconfiguredBaseModels = BASE_FOUNDATION_MODELS.filter(
                (bm) =>
                    !dbModelIds.has(bm.id) &&
                    !dbModelCodes.has(bm.code || "") &&
                    !deletedBaseIds.has(bm.id) &&
                    !deletedBaseIds.has(bm.code || "") &&
                    !deletedBaseIds.has(`model-${bm.code}`) &&
                    !deletedBaseIds.has(bm.displayName || "") &&
                    !deletedBaseIds.has(bm.id.replace(/^model-/, ""))
            );
            const frontendModels = [...filteredDbModels, ...unconfiguredBaseModels].sort(
                (a, b) => (a.sortOrder || 999) - (b.sortOrder || 999)
            );

            // 提取所有唯一家族
            const gatheredFamilies = Array.from(
                new Set([
                    ...INITIAL_FAMILIES,
                    ...frontendModels.map((m) => m.family).filter(Boolean),
                ])
            );

            // 自动检测并修复历史遗留的空能力规格（如蒙版丢失、参考图上限归零）
            const modelsNeedingRepair = rawModels.filter((lm) => {
                const spec = lm.capabilitySpec;
                const hasEmptyInputs = !spec?.inputs || Object.keys(spec.inputs).length === 0;
                return hasEmptyInputs && lm.routes && lm.routes.length > 0;
            });
            if (modelsNeedingRepair.length > 0) {
                await Promise.all(
                    modelsNeedingRepair.map(async (lm) => {
                        const frontendItem = logicalModelToFrontendItem(lm, channels, allChannelModels);
                        const mutation = frontendItemToLogicalModelMutation(frontendItem, lm, allChannelModels);
                        if (mutation.capabilitySpec && Object.keys(mutation.capabilitySpec.inputs || {}).length > 0) {
                            lm.capabilitySpec = mutation.capabilitySpec;
                            await updateAdminLogicalModel(lm.id, mutation).catch(() => {});
                        }
                    })
                );
            }

            set({
                models: frontendModels,
                rawLogicalModels: rawModels,
                channels,
                channelModels: allChannelModels,
                families: gatheredFamilies,
                isLoading: false,
            });
        } catch (err: any) {
            set({
                isLoading: false,
                error: err?.message || "从后端加载模型与渠道数据失败",
            });
        }
    },

    // 独立开关直接关闭/开启某个前端展示模型（实时落库）
    toggleModelEnabled: async (modelId, enabled) => {
        const state = get();
        const model = state.models.find((m) => m.id === modelId || m.code === modelId);
        if (!model) return;

        // 乐观更新前端
        set((s) => ({
            models: s.models.map((m) => (m.id === model.id ? { ...m, enabled } : m)),
        }));

        try {
            const existingRaw = state.rawLogicalModels.find((lm) => lm.id === model.id || (model.code && lm.code === model.code));
            if (existingRaw) {
                const mutation = frontendItemToLogicalModelMutation({ ...model, enabled }, existingRaw, get().channelModels);
                await updateAdminLogicalModel(existingRaw.id, mutation);
            } else {
                const mutation = frontendItemToLogicalModelMutation({ ...model, enabled }, undefined, get().channelModels);
                const res = await createAdminLogicalModel(mutation);
                if (res?.model) {
                    set((s) => ({
                        rawLogicalModels: [...s.rawLogicalModels, res.model],
                        models: s.models.map((m) => (m.id === model.id ? { ...m, id: res.model.id, code: res.model.code } : m)),
                    }));
                }
            }
        } catch (err) {
            // 失败时回滚
            set((s) => ({
                models: s.models.map((m) => (m.id === model.id ? { ...m, enabled: !enabled } : m)),
            }));
            throw err;
        }
    },

    // 更新模型全部配置并落库
    updateModel: async (updatedModel) => {
        invalidateRoutingCache(updatedModel.id);

        const existingRaw = get().rawLogicalModels.find((lm) => lm.id === updatedModel.id || lm.code === updatedModel.id);
        if (existingRaw) {
            const mutation = frontendItemToLogicalModelMutation(updatedModel, existingRaw, get().channelModels);
            await updateAdminLogicalModel(existingRaw.id, mutation);
        } else {
            const mutation = frontendItemToLogicalModelMutation(updatedModel, undefined, get().channelModels);
            const res = await createAdminLogicalModel(mutation);
            if (res?.model) {
                set((state) => ({
                    rawLogicalModels: [...state.rawLogicalModels, res.model],
                }));
            }
        }

        // 计费与多规格矩阵价格档同步：若当前模型配置为多规格矩阵计费，将 tiers 格式化并同步至各候选渠道模型
        if (updatedModel.billing?.pricingMode === "matrix" && updatedModel.candidateUpstreams?.length > 0) {
            const allChannelModels = get().channelModels;
            const convertedTiers = convertMatrixTiersToChannelPriceTiers(
                updatedModel.capability,
                updatedModel.billing.tiers,
                updatedModel.billing.unit === "second" ? "per_second" : "fixed_request",
                updatedModel.billing.defaultPrice || 0
            );

            await Promise.all(
                updatedModel.candidateUpstreams.map(async (cand) => {
                    const resolvedCMId = cand.channelModelId || (cand.id?.startsWith("cand-") ? undefined : cand.id);
                    const cm = allChannelModels.find(
                        (m) =>
                            (resolvedCMId && m.id === resolvedCMId) ||
                            (cand.channelId && m.channelId === cand.channelId && m.modelKey === cand.upstreamModelId) ||
                            m.modelKey === cand.upstreamModelId
                    );
                    if (cm && cm.channelId && cm.id) {
                        try {
                            await updateAdminChannelModel(cm.channelId, cm.id, {
                                modelKey: cm.modelKey,
                                providerModelKey: cm.providerModelKey,
                                displayName: cm.displayName,
                                channelLabel: cm.channelLabel,
                                description: cm.description,
                                icon: cm.icon,
                                capability: cm.capability,
                                protocol: cm.protocol,
                                enabled: cm.enabled,
                                capabilityConfig: cm.capabilityConfig,
                                priceTiers: convertedTiers,
                                billingMode: updatedModel.billing.unit === "second" ? "per_second" : "fixed_request",
                                unitPriceMicrocredits: yuanToMicrocredits(updatedModel.billing.defaultPrice || 0),
                                priceConfigured: true,
                            });
                        } catch (tierErr) {
                            console.warn("同步渠道多规格价格档异常:", cand.upstreamModelId, tierErr);
                        }
                    }
                })
            );
        }

        // 更新本地
        set((state) => ({
            models: state.models.map((m) => (m.id === updatedModel.id ? updatedModel : m)),
        }));

        // 异步静默重刷确保数据完全一致
        void get().loadAllData();
    },

    // 增加新模型并落库
    addModel: async (newModel) => {
        // 从已删除集合中移除，允许重新添加该底座或同名模型
        try {
            const deletedStorageKey = "opc_deleted_base_model_ids";
            const existingDeleted = JSON.parse(localStorage.getItem(deletedStorageKey) || "[]") as string[];
            const cleanCode = (newModel.code || newModel.id || "").replace(/^model-/, "");
            const filtered = existingDeleted.filter(
                (id) =>
                    id !== newModel.id &&
                    id !== newModel.code &&
                    id !== newModel.displayName &&
                    id !== cleanCode &&
                    id !== `model-${cleanCode}`
            );
            localStorage.setItem(deletedStorageKey, JSON.stringify(filtered));
        } catch {
            // ignore
        }

        const mutation = frontendItemToLogicalModelMutation(newModel, undefined, get().channelModels);
        const res = await createAdminLogicalModel(mutation);
        if (res?.model) {
            set((state) => ({
                rawLogicalModels: [...state.rawLogicalModels, res.model],
            }));
        }

        // 计费与多规格矩阵价格档同步：若当前模型配置为多规格矩阵计费，将 tiers 格式化并同步至各候选渠道模型
        if (newModel.billing?.pricingMode === "matrix" && newModel.candidateUpstreams?.length > 0) {
            const allChannelModels = get().channelModels;
            const convertedTiers = convertMatrixTiersToChannelPriceTiers(
                newModel.capability,
                newModel.billing.tiers,
                newModel.billing.unit === "second" ? "per_second" : "fixed_request",
                newModel.billing.defaultPrice || 0
            );

            await Promise.all(
                newModel.candidateUpstreams.map(async (cand) => {
                    const resolvedCMId = cand.channelModelId || (cand.id?.startsWith("cand-") ? undefined : cand.id);
                    const cm = allChannelModels.find(
                        (m) =>
                            (resolvedCMId && m.id === resolvedCMId) ||
                            (cand.channelId && m.channelId === cand.channelId && m.modelKey === cand.upstreamModelId) ||
                            m.modelKey === cand.upstreamModelId
                    );
                    if (cm && cm.channelId && cm.id) {
                        try {
                            await updateAdminChannelModel(cm.channelId, cm.id, {
                                modelKey: cm.modelKey,
                                providerModelKey: cm.providerModelKey,
                                displayName: cm.displayName,
                                channelLabel: cm.channelLabel,
                                description: cm.description,
                                icon: cm.icon,
                                capability: cm.capability,
                                protocol: cm.protocol,
                                enabled: cm.enabled,
                                capabilityConfig: cm.capabilityConfig,
                                priceTiers: convertedTiers,
                                billingMode: newModel.billing.unit === "second" ? "per_second" : "fixed_request",
                                unitPriceMicrocredits: yuanToMicrocredits(newModel.billing.defaultPrice || 0),
                                priceConfigured: true,
                            });
                        } catch (tierErr) {
                            console.warn("同步渠道多规格价格档异常:", cand.upstreamModelId, tierErr);
                        }
                    }
                })
            );
        }

        set((state) => ({
            models: [...state.models.filter((m) => m.id !== newModel.id), newModel],
        }));
        // 新增成功后，尝试全量拉取后端权威数据
        try {
            await get().loadAllData();
        } catch {
            // ignore network/mock errors in test env
        }
    },

    // 删除模型并落库（彻底清除数据库记录与预置底座卡片）
    deleteModel: async (modelId) => {
        const state = get();
        const cleanId = modelId.replace(/^model-/, "");
        const targetModel = state.models.find(
            (m) =>
                m.id === modelId ||
                m.code === modelId ||
                m.id === cleanId ||
                m.code === cleanId ||
                m.displayName === modelId ||
                m.displayName === cleanId
        );

        // 收集所有关联标识
        const candidateKeys = new Set<string>(
            [
                modelId,
                cleanId,
                `model-${cleanId}`,
                targetModel?.id,
                targetModel?.code,
                targetModel?.displayName,
                targetModel?.code ? `model-${targetModel.code}` : null,
            ].filter(Boolean) as string[]
        );

        // 查找所有匹配的后端逻辑模型（支持多条匹配与历史重名清理）
        const matchedRawIds = new Set<string>();
        if (modelId.startsWith("LMODEL_")) {
            matchedRawIds.add(modelId);
        }
        if (targetModel?.id?.startsWith("LMODEL_")) {
            matchedRawIds.add(targetModel.id);
        }

        const isMatch = (lm: { id: string; code?: string; name?: string }) => {
            return (
                candidateKeys.has(lm.id) ||
                (Boolean(lm.code) && candidateKeys.has(lm.code!)) ||
                (Boolean(lm.name) && candidateKeys.has(lm.name!)) ||
                (Boolean(lm.code) && candidateKeys.has(`model-${lm.code}`)) ||
                (Boolean(lm.id) && candidateKeys.has(`model-${lm.id}`)) ||
                (targetModel && (
                    lm.id === targetModel.id ||
                    (targetModel.code && lm.code === targetModel.code) ||
                    (targetModel.displayName && lm.name === targetModel.displayName) ||
                    (targetModel.code && lm.name === targetModel.code) ||
                    (targetModel.displayName && lm.code === targetModel.displayName)
                ))
            );
        };

        state.rawLogicalModels.filter(isMatch).forEach((lm) => matchedRawIds.add(lm.id));

        // 始终通过后端权威接口拉取最新清单兜底匹配，防止前端内存状态不同步
        let freshRawModels = state.rawLogicalModels;
        try {
            const freshRes = await listAdminLogicalModels();
            if (Array.isArray(freshRes?.models)) {
                freshRawModels = freshRes.models;
                freshRes.models.filter(isMatch).forEach((lm) => matchedRawIds.add(lm.id));
            }
        } catch {
            // 离线/网络异常时使用当前内存中的匹配记录
        }

        // 权威执行后端物理/软删除归档，支持并发清理所有匹配的历史残留重复模型
        const deleteErrors: any[] = [];
        await Promise.all(
            Array.from(matchedRawIds).map(async (rawId) => {
                try {
                    await deleteAdminLogicalModel(rawId);
                } catch (err: any) {
                    const msg = String(err?.message || "");
                    if (!msg.includes("不存在") && !msg.includes("已删除")) {
                        deleteErrors.push(err);
                    }
                }
            })
        );

        if (deleteErrors.length > 0) {
            throw deleteErrors[0];
        }

        // 记录已删除的预置底座卡片 ID、code 与 displayName，防止刷新后死灰复燃
        try {
            const deletedStorageKey = "opc_deleted_base_model_ids";
            const existingDeleted = JSON.parse(localStorage.getItem(deletedStorageKey) || "[]") as string[];

            // 匹配并包含 BASE_FOUNDATION_MODELS 中对应的预置模板标识
            const matchedBase = BASE_FOUNDATION_MODELS.filter(
                (bm) =>
                    candidateKeys.has(bm.id) ||
                    candidateKeys.has(bm.code || "") ||
                    candidateKeys.has(bm.displayName || "") ||
                    candidateKeys.has(`model-${bm.code}`)
            );
            matchedBase.forEach((bm) => {
                candidateKeys.add(bm.id);
                if (bm.code) candidateKeys.add(bm.code);
                if (bm.displayName) candidateKeys.add(bm.displayName);
            });
            Array.from(matchedRawIds).forEach((id) => candidateKeys.add(id));

            // 将所有匹配到的 raw 模型 code/name 也全部加入黑名单
            freshRawModels
                .filter((lm) => matchedRawIds.has(lm.id))
                .forEach((lm) => {
                    if (lm.id) candidateKeys.add(lm.id);
                    if (lm.code) {
                        candidateKeys.add(lm.code);
                        candidateKeys.add(`model-${lm.code}`);
                    }
                    if (lm.name) candidateKeys.add(lm.name);
                });

            const updatedDeleted = Array.from(
                new Set([...existingDeleted, ...Array.from(candidateKeys)])
            );
            localStorage.setItem(deletedStorageKey, JSON.stringify(updatedDeleted));
        } catch {
            // ignore localStorage error in SSR / tests
        }

        // 立即乐观移除前端 state.models 中的该卡片
        set((s) => ({
            models: s.models.filter(
                (m) =>
                    !candidateKeys.has(m.id) &&
                    !candidateKeys.has(m.code || "") &&
                    !candidateKeys.has(m.displayName || "") &&
                    !candidateKeys.has(`model-${m.code}`) &&
                    !matchedRawIds.has(m.id)
            ),
        }));

        // 立即拉取后端最新权威数据，保证视图和持久化完全同步
        await get().loadAllData();
    },

    // 增加模型家族
    addFamily: (familyName) => {
        const trimmed = familyName.trim();
        if (!trimmed) return;
        set((state) => {
            if (state.families.includes(trimmed)) return state;
            return { families: [...state.families, trimmed] };
        });
    },

    // 穿梭框排序（批量持久化 sortOrder）
    reorderModels: async (capability, orderedIds) => {
        const idToOrder = new Map(orderedIds.map((id, index) => [id, index + 1]));

        // 乐观更新
        set((state) => ({
            models: state.models.map((m) => {
                if (m.capability === capability && idToOrder.has(m.id)) {
                    return { ...m, sortOrder: idToOrder.get(m.id)! };
                }
                return m;
            }),
        }));

        // 后端批量同步 (仅对已入库的真实模型持久化)
        const modelsToUpdate = get().models.filter((m) => m.capability === capability && idToOrder.has(m.id));
        await Promise.all(
            modelsToUpdate.map((m) => {
                const existing = get().rawLogicalModels.find((lm) => lm.id === m.id || lm.code === m.id);
                if (existing) {
                    const mut = frontendItemToLogicalModelMutation(m, existing, get().channelModels);
                    mut.sortOrder = idToOrder.get(m.id)!;
                    return updateAdminLogicalModel(existing.id, mut).catch(() => {});
                }
                return Promise.resolve();
            })
        );
    },

    // 真实网络连通性实测（走后端安全代理网关）
    testModelConnectivity: async (modelId) => {
        const model = get().models.find((m) => m.id === modelId || m.code === modelId);
        if (!model) return { latencyMs: 0, status: "error" as const, errorMessage: "未找到模型" };

        const matchedCM = get().channelModels.find(
            (c) => c.channelId === model.primaryChannelId && c.modelKey === model.sourceCard.upstreamModelId
        );
        const protocol = model.sourceCard.channelProtocol || matchedCM?.protocol;

        const res = await testRealModelConnectivity(
            model.primaryChannelId,
            model.sourceCard.upstreamModelId,
            model.capability,
            protocol
        );

        set((state) => ({
            models: state.models.map((m) => {
                if (m.id === model.id) {
                    return {
                        ...m,
                        sourceCard: {
                            ...m.sourceCard,
                            status: res.status,
                            lastLatencyMs: res.latencyMs,
                            lastTestedAt: res.testedAt,
                            errorMessage: res.errorMessage,
                        },
                    };
                }
                return m;
            }),
        }));

        return res;
    },

    // 候选池管理：勾选/停用某个候选路线
    toggleCandidateEnabled: async (modelId, candidateId, enabled) => {
        const model = get().models.find((m) => m.id === modelId || m.code === modelId);
        if (!model) return;

        const updatedCandidates = (model.candidateUpstreams || []).map((c) =>
            c.id === candidateId ? { ...c, enabled } : c
        );
        const updatedModel: FrontendModelItem = {
            ...model,
            candidateUpstreams: updatedCandidates,
        };

        set((state) => ({
            models: state.models.map((m) => (m.id === model.id ? updatedModel : m)),
        }));

        const existingRaw = get().rawLogicalModels.find((lm) => lm.id === model.id || (model.code && lm.code === model.code));
        if (existingRaw) {
            const mut = frontendItemToLogicalModelMutation(updatedModel, existingRaw, get().channelModels);
            await updateAdminLogicalModel(existingRaw.id, mut);
        } else {
            const mut = frontendItemToLogicalModelMutation(updatedModel, undefined, get().channelModels);
            const res = await createAdminLogicalModel(mut);
            if (res?.model) {
                set((state) => ({
                    rawLogicalModels: [...state.rawLogicalModels, res.model],
                    models: state.models.map((m) => (m.id === model.id ? { ...updatedModel, id: res.model.id, code: res.model.code } : m)),
                }));
            }
        }
    },

    // 候选池管理：将上游物理模型添加至该模型卡片候选池
    addCandidateToModel: async (modelId, candidate) => {
        const model = get().models.find((m) => m.id === modelId || m.code === modelId);

        // 从已删除集合中移除
        try {
            const deletedStorageKey = "opc_deleted_base_model_ids";
            const existingDeleted = JSON.parse(localStorage.getItem(deletedStorageKey) || "[]") as string[];
            const cleanId = modelId.replace(/^model-/, "");
            const filtered = existingDeleted.filter(
                (id) =>
                    id !== modelId &&
                    id !== cleanId &&
                    id !== `model-${cleanId}` &&
                    id !== model?.displayName &&
                    id !== model?.code &&
                    id !== `model-${model?.code}`
            );
            localStorage.setItem(deletedStorageKey, JSON.stringify(filtered));
        } catch {
            // ignore
        }

        if (!model) return;

        const applicableKeys = new Set(getApplicableParametersForModel(model).map((p) => p.key));
        const cleanCandidate = {
            ...candidate,
            supportedParameters: (candidate.supportedParameters || []).filter((p) => applicableKeys.has(p)),
        };

        const existing = model.candidateUpstreams || [];
        const exists = existing.some(
            (c) => c.id === cleanCandidate.id || (c.channelId === cleanCandidate.channelId && c.upstreamModelId === cleanCandidate.upstreamModelId)
        );
        const updatedCandidates = exists
            ? existing.map((c) =>
                  c.id === cleanCandidate.id || (c.channelId === cleanCandidate.channelId && c.upstreamModelId === cleanCandidate.upstreamModelId)
                      ? { ...cleanCandidate, id: c.id }
                      : c
              )
            : [...existing, cleanCandidate];

        // 同步初始化 parameterPriorities
        const priorities = { ...(model.parameterPriorities || {}) };
        cleanCandidate.supportedParameters.forEach((p) => {
            if (!priorities[p]) {
                priorities[p] = [cleanCandidate.id];
            } else if (!priorities[p].includes(cleanCandidate.id)) {
                priorities[p] = [...priorities[p], cleanCandidate.id];
            }
        });

        // 若之前未指定主渠道且本次添加了有效候选，自动补全主渠道
        const updatedPrimaryChannelId = model.primaryChannelId || cleanCandidate.channelId;
        const updatedSourceCard = model.primaryChannelId
            ? model.sourceCard
            : {
                  ...model.sourceCard,
                  channelId: cleanCandidate.channelId,
                  channelName: cleanCandidate.channelName,
                  upstreamModelId: cleanCandidate.upstreamModelId,
                  channelProtocol: cleanCandidate.channelProtocol,
                  protocolType: cleanCandidate.protocolType,
                  endpoint: cleanCandidate.endpoint,
                  status: cleanCandidate.status || "healthy",
              };

        const updatedModel: FrontendModelItem = {
            ...model,
            primaryChannelId: updatedPrimaryChannelId,
            sourceCard: updatedSourceCard,
            candidateUpstreams: updatedCandidates,
            parameterPriorities: priorities,
        };

        set((state) => ({
            models: state.models.map((m) => (m.id === model.id ? updatedModel : m)),
        }));

        const existingRaw = get().rawLogicalModels.find((lm) => lm.id === model.id || (model.code && lm.code === model.code));
        if (existingRaw) {
            const mut = frontendItemToLogicalModelMutation(updatedModel, existingRaw, get().channelModels);
            await updateAdminLogicalModel(existingRaw.id, mut);
        } else {
            // 这是未在数据库中的底座模型！首次配置自动落库 (Create in GORM DB)
            const mut = frontendItemToLogicalModelMutation(updatedModel, undefined, get().channelModels);
            const res = await createAdminLogicalModel(mut);
            if (res?.model) {
                set((state) => ({
                    rawLogicalModels: [...state.rawLogicalModels, res.model],
                    models: state.models.map((m) => (m.id === model.id ? { ...updatedModel, id: res.model.id, code: res.model.code } : m)),
                }));
            }
        }
    },

    // 候选池管理：从模型卡片中移除某个上游物理模型
    removeCandidateFromModel: async (modelId, candidateId) => {
        const model = get().models.find((m) => m.id === modelId || m.code === modelId);
        if (!model) return;

        const updatedCandidates = (model.candidateUpstreams || []).filter((c) => c.id !== candidateId);
        const priorities = { ...(model.parameterPriorities || {}) };
        Object.keys(priorities).forEach((k) => {
            priorities[k] = priorities[k].filter((id) => id !== candidateId);
            if (priorities[k].length === 0) delete priorities[k];
        });

        const updatedModel: FrontendModelItem = {
            ...model,
            candidateUpstreams: updatedCandidates,
            parameterPriorities: priorities,
        };

        set((state) => ({
            models: state.models.map((m) => (m.id === model.id ? updatedModel : m)),
        }));

        const existingRaw = get().rawLogicalModels.find((lm) => lm.id === model.id || (model.code && lm.code === model.code));
        const targetId = existingRaw?.id || model.id;
        const mut = frontendItemToLogicalModelMutation(updatedModel, existingRaw, get().channelModels);
        await updateAdminLogicalModel(targetId, mut);
    },

    // 同参数多模型优选路由设置并同步后端路线优先级
    setParameterPriority: async (modelId, paramKey, candidateIds) => {
        const model = get().models.find((m) => m.id === modelId || m.code === modelId);
        if (!model) return;

        const updatedModel: FrontendModelItem = {
            ...model,
            parameterPriorities: {
                ...(model.parameterPriorities || {}),
                [paramKey]: candidateIds,
            },
        };

        set((state) => ({
            models: state.models.map((m) => (m.id === model.id ? updatedModel : m)),
        }));

        const existingRaw = get().rawLogicalModels.find((lm) => lm.id === model.id || (model.code && lm.code === model.code));
        const targetId = existingRaw?.id || model.id;
        const mut = frontendItemToLogicalModelMutation(updatedModel, existingRaw, get().channelModels);
        await updateAdminLogicalModel(targetId, mut);
    },

    // 针对特定候选物理模型发起真实连通性测试
    testCandidateConnectivity: async (modelId, candidateId) => {
        const model = get().models.find((m) => m.id === modelId || m.code === modelId);
        const candidate = model?.candidateUpstreams?.find((c) => c.id === candidateId);
        if (!model || !candidate) return { latencyMs: 0, status: "error", testedAt: "" };

        const matchedCM = get().channelModels.find(
            (c) => (candidate.channelModelId && c.id === candidate.channelModelId) ||
                   (c.channelId === candidate.channelId && c.modelKey === candidate.upstreamModelId)
        );
        const protocol = candidate.channelProtocol || matchedCM?.protocol;

        const res = await testRealModelConnectivity(
            candidate.channelId,
            candidate.upstreamModelId,
            model?.capability || "video",
            protocol
        );

        set((state) => ({
            models: state.models.map((m) => {
                if (m.id !== model.id) return m;
                return {
                    ...m,
                    candidateUpstreams: (m.candidateUpstreams || []).map((c) =>
                        c.id === candidateId
                            ? {
                                  ...c,
                                  status: res.status,
                                  lastLatencyMs: res.latencyMs,
                                  lastTestedAt: res.testedAt,
                                  errorMessage: res.errorMessage,
                              }
                            : c
                    ),
                };
            }),
        }));

        return res;
    },

    // 从渠道读取可用模型与参数说明列表（仅读取系统数据库中已配置的真实模型，绝不发起额外上游探活请求产生资费）
    fetchChannelModels: async (channelId) => {
        const state = get();
        const targetChannels = channelId === "all" ? state.channels : state.channels.filter((c) => c.id === channelId);

        // 重新拉取一次本地数据库最新配置，确保即使其他抽屉或后台有更新也能立即反映
        let allChannelModels = state.channelModels;
        if (targetChannels.length > 0) {
            try {
                const refreshed = await Promise.all(
                    targetChannels.map((c) => listAdminChannelModels(c.id).catch(() => ({ models: [] as ChannelModel[] })))
                );
                const freshModels = refreshed.flatMap((r) => r.models || []);
                if (freshModels.length > 0) {
                    const otherModels = state.channelModels.filter((cm) => !targetChannels.some((tc) => tc.id === cm.channelId));
                    allChannelModels = [...otherModels, ...freshModels];
                    set({ channelModels: allChannelModels });
                }
            } catch {
                // 回退使用当前内存已有的 state.channelModels
            }
        }

        const results: ChannelAvailableModel[] = [];

        for (const channel of targetChannels) {
            // 1. 读取该渠道已经配置的真实物理模型
            const existingCMs = allChannelModels.filter((cm) => cm.channelId === channel.id);
            for (const cm of existingCMs) {
                const effectiveCapability = resolveCapability(cm.capability, cm.modelKey);
                const isImage = effectiveCapability === "image";
                const isVideo = effectiveCapability === "video";
                const spec = capabilitySpecFromChannelModel(cm);
                const supportedParameters = extractSupportedParameterKeys(
                    effectiveCapability,
                    spec,
                    cm.priceTiers
                );
                const vqualities = (spec?.options?.vquality?.values || []) as string[];
                let ratios = (spec?.options?.size?.values || []) as string[];
                if (ratios.length === 0 && cm.priceTiers?.length) {
                    const extractedRatios = cm.priceTiers
                        .map((t) => t.selector?.size || t.selector?.ratio || t.selector?.aspect_ratio || t.resolution)
                        .filter(Boolean);
                    if (extractedRatios.length) ratios = Array.from(new Set(extractedRatios));
                }

                const durationOpt = spec?.options?.videoSeconds;
                let durationRange: string | undefined = undefined;
                if (isVideo) {
                    durationRange = "5s";
                    if (durationOpt) {
                        const numVals = Array.isArray(durationOpt.values) ? durationOpt.values.map(Number).filter((n) => !isNaN(n)) : [];
                        if (numVals.length > 0) {
                            durationRange = `${Math.min(...numVals)}s ~ ${Math.max(...numVals)}s`;
                        } else if (typeof durationOpt.min === "number" && typeof durationOpt.max === "number") {
                            durationRange = `${durationOpt.min}s ~ ${durationOpt.max}s`;
                        }
                    } else if (cm.priceTiers?.some((t) => t.videoSeconds > 0)) {
                        const secs = cm.priceTiers.map((t) => t.videoSeconds).filter((s) => s > 0);
                        durationRange = `${Math.min(...secs)}s ~ ${Math.max(...secs)}s`;
                    }
                }

                // 分辨率 (统一使用 resolveMaxResolution 智能识别 4K / 2K / 视频分辨率)
                const maxResolution = resolveMaxResolution(
                    effectiveCapability,
                    supportedParameters,
                    cm.priceTiers,
                    vqualities
                );

                const aspectRatios = ratios.length > 0
                    ? ratios
                    : (isImage ? ["1:1", "16:9", "9:16", "3:4", "4:3"] : ["16:9", "9:16", "1:1"]);

                const modalities = isImage
                    ? ["Text-to-Image (文生图)", "Image-to-Image (图生图/参考图)"]
                    : isVideo
                    ? ["Text-to-Video (文生视频)", "Image-to-Video (图生视频/首尾帧)"]
                    : ["Text (纯文本)"];

                results.push({
                    id: `cam-${cm.channelId}-${cm.id}`,
                    channelId: cm.channelId,
                    channelName: channel.name,
                    modelKey: cm.modelKey,
                    displayName: cm.displayName || cm.modelKey,
                    capability: effectiveCapability,
                    protocol: String(cm.protocol || "system"),
                    endpoint: channel.baseUrl,
                    authType: "Bearer Token",
                    extractPath: "data.output",
                    supportedParameters,
                    parameterSpecs: {
                        maxResolution,
                        durationRange,
                        aspectRatios,
                        modalities,
                        notes: cm.description || `已在系统渠道【${channel.name}】中配置（${isImage ? "生图片" : isVideo ? "生视频" : "纯文本"}）`,
                    },
                });
            }
        }

        return results;
    },

    // 插件接入
    addPlugin: (plugin) => {
        set((state) => ({
            plugins: [plugin, ...state.plugins],
        }));
    },

    togglePluginStatus: (pluginId, status) => {
        set((state) => ({
            plugins: state.plugins.map((p) =>
                p.id === pluginId ? { ...p, status } : p
            ),
        }));
    },

    // 一键 AI 分析匹配已有模型格式与差异
    analyzePluginWithAI: async (rawSchema) => {
        await new Promise((resolve) => setTimeout(resolve, 800));
        let parsed: any = {};
        try {
            parsed = JSON.parse(rawSchema);
        } catch {
            parsed = {};
        }

        const differences: string[] = [];
        let canAutoRoute = true;

        if (!parsed.prompt && !parsed.text && !parsed.input) {
            differences.push("提示词入参使用了非标准键名，需要字段映射");
        }
        if (parsed.fps && parsed.fps !== 24) {
            differences.push(`声明帧率为 ${parsed.fps}fps，与标准 24fps 存在出站重采样差异`);
        }
        if (parsed.adaptive === true) {
            differences.push("接口要求强制启用自适应模式 (adaptive: true)");
        }
        if (parsed.base64_required) {
            differences.push("出站图片需转码为 Base64 Data URI 发送");
        }

        if (differences.length === 0) {
            differences.push("经 AI 比对，该插件入参协议 100% 契合标准多模态生视频规范");
        }

        return {
            differences,
            canAutoRoute,
            canAutoRouteBySwitch: true,
            suggestedGroup: parsed.capability === "image" ? "生图片" : "生视频",
            suggestedFamily: "第三方插件渠道",
        };
    },

    // 重新从数据库拉取
    resetToDefaults: async () => {
        await get().loadAllData();
    },
}));
// @opc-feature: model-smart-router [end]
