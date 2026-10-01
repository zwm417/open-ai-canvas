export type CapabilityType = "video" | "image" | "text" | "audio";

export type ProtocolType = "system" | "plugin";

export type BillingUnit = "count" | "second" | "token";

export type SwitchCategory = "resolution" | "aspect_ratio" | "reference" | "duration" | "output" | "advanced";

/** 上游候选物理模型结构 (添加到分组卡片后参与候选池) */
export interface UpstreamCandidateModel {
    id: string; // 唯一候选记录 ID，如 "cand-yunzhi-3.0"
    channelId: string;
    channelName: string;
    upstreamModelId: string; // 上游物理模型代码，如 "seedance-2.5-3.0"
    channelModelId?: string; // 关联的真实系统渠道模型 ID (ChannelModel.id)
    channelProtocol?: string; // 底层系统渠道物理协议 (如 "newapi", "volcengine-jimeng-video", "openai-image")
    protocolType: ProtocolType;
    protocolId?: string; // 绑定的具体插件协议 ID (1对1绑定)
    endpoint: string;
    authType: "Bearer Token" | "Raw Token" | "Custom Header";
    extractPath: string;
    timeoutSeconds: number;
    enabled: boolean; // 勾选进入候选池：勾选后该模型所能提供的参数在前端看板上高亮
    supportedParameters: string[]; // 该模型支持的参数 key 列表，如 ["res_480p", "res_720p", "res_1080p", "ratio_16_9", "first_frame"]
    status: "untested" | "healthy" | "warning" | "error";
    lastLatencyMs?: number;
    lastTestedAt?: string;
    errorMessage?: string;
    sampleRequestFormat?: string; // 原上游提供的请求参考格式 (JSON)
    parameterSpecs?: {
        maxResolution?: string;
        durationRange?: string;
        aspectRatios?: string[];
        modalities?: string[];
        notes?: string;
    };
}

/** 同参数多模型优选路由映射表: parameterKey -> [upstreamCandidateId, ...] 或单选映射 */
export type ParameterPriorityMap = Record<string, string[]>;

/** 唯一来源信息卡片数据结构 (保留前版) */
export interface ChannelSourceCard {
    channelId: string;
    channelName: string;
    channelProtocol?: string; // 底层系统渠道物理协议
    protocolType: ProtocolType;
    protocolId?: string;
    upstreamModelId: string;
    endpoint: string;
    authType: "Bearer Token" | "Raw Token" | "Custom Header";
    extractPath: string;
    timeoutSeconds: number;
    status: "healthy" | "warning" | "error" | "untested";
    lastLatencyMs?: number;
    lastTestedAt?: string;
    errorMessage?: string;
    sampleRequestFormat?: string;
}

/** 开关控制矩阵特性项 (常规前端展示参数看板，标明系统默认与适用家族) */
export interface SwitchFeatureItem {
    key: string;
    label: string; // 严格限制在 6 个字内，直接使用原生简单参数名，如 "480p"、"720p"、"16:9"、"生成声音"
    description: string;
    category?: SwitchCategory;
    channelDefault: boolean; // 渠道原生默认值
    forcedEnabled: boolean;  // 管理员是否强制开启展示给前端
    showInFrontend?: boolean; // 后台设置：前台是否展示此参数 (默认 true)
    preferredCandidateId?: string; // 指定优先路由模型 ID，"default" 为走默认优先级
    fallbackValue: string;   // 强制开启出站时的安全兜底默认值
    isSystemDefault?: boolean; // 是否为当前系统已有的默认前端展示参数
    applicableFamilies?: string[]; // 适用的模型家族清单
}

/** 参数条件分流路由规则 */
export interface ConditionalRouteRule {
    id: string;
    name: string;
    conditionType: "resolution" | "duration_gte" | "input_modality" | "aspect_ratio";
    conditionValue: string;
    targetChannelId: string;
    targetChannelName: string;
    targetModelId: string;
    overridePrice?: number;
    description?: string;
    enabled: boolean;
}

/** 时长阈值转一口价规则 */
export interface DurationThresholdRule {
    enabled: boolean;
    thresholdSeconds: number;
    targetChannelId: string;
    targetChannelName: string;
    targetModelId: string;
    unitPrice: number;
}

/** 秒数控制与最大秒数路由配置 */
export interface DurationSettings {
    minSeconds: number;                  // 单次请求最小秒数 (如 2)
    maxSeconds: number;                  // 单次请求最大秒数 (如 15)
    isLocked: boolean;                   // 是否锁定固定秒数
    lockedSeconds: number;               // 锁定固定秒数值 (如 5)
    maxDurationRouteEnabled: boolean;    // 达到最大秒数开关
    maxDurationTargetCandidateId?: string; // 达到最大秒数时路由到的特定上游模型 ID
}

/** 参数叠加费用项 (在分辨率基准价格之上，勾选特定参数时叠加额外成本) */
export interface BillingSurchargeItem {
    id: string;
    parameterKey: string;                // 关联参数键，如 "audio_generation"、"multi_ref"、"max_duration"
    parameterLabel: string;              // 参数名称，如 "生成声音"、"多图参考"、"超长/达到最大秒数"
    additionalCost: number;              // 叠加成本 (¥/秒 或 ¥/次)
    enabled: boolean;                    // 是否启用该叠加项
}

/** 分辨率细分计费规格 (各分辨率为基准行，右侧支持配置匹配其他参数与对应叠加费用) */
export interface ResolutionBillingTier {
    id?: string;
    resolution: string;                  // 如 "480p", "720p", "1080p", "768p", "2k"
    aspectRatio?: string;
    upstreamCost: number;                // 上游基础成本
    matchedParameterKey?: string;        // 其他参数列: "none" | "audio_generation" | "multi_ref" | "max_duration" | "audio_lip_sync" 等
    matchedParameterLabel?: string;      // 其他参数名称: 如 "生成声音"、"多图参考"
    surchargeCost?: number;              // 对应叠加费用列 (¥)
    markupRatio: number;                 // 定价倍率
    userPrice: number;                   // 用户价格: (upstreamCost + (surchargeCost || 0)) * markupRatio
    isDefault?: boolean;                 // 兼容老数据
}

/** 前端展示模型标准定义 */
export interface FrontendModelItem {
    id: string;                          // 唯一模型 ID，如 "seedance-2.5"
    code?: string;                       // 后端唯一模型标识码 (如 "seedance-2.5-video")
    displayName: string;                 // 前端显示名称
    subtitle: string;                    // 模型副标题说明 (15~120字)
    showSubtitle: boolean;               // 是否在前端展示副标题
    capability: CapabilityType;          // 能力类别
    family: string;                      // 家族归属，如 "字节 Seedance", "MiniMax H3"
    group: string;                       // 所属分组，如 "生视频", "生图片"
    iconUrl?: string;
    iconEmoji?: string;
    enabled: boolean;                    // 前端展示启用/停用总开关
    sortOrder: number;                   // 排序序号
    
    // P1 主力渠道与来源卡片
    primaryChannelId: string;
    primaryProtocolType: ProtocolType;
    sourceCard: ChannelSourceCard;
    fallbackChannels: Array<{
        channelId: string;
        channelName: string;
        upstreamModelId: string;
        priority: number;
    }>;

    // 上游物理模型候选池：添加进此卡片的所有上游模型
    candidateUpstreams: UpstreamCandidateModel[];

    // 默认优先级顺序列表: [candidateId, ...]，排在前面代表默认优先级高
    defaultCandidatePriority?: string[];

    // 同参数多模型优选路由映射表 (如 1080P 同时有多个模型支持时，指定优先选择哪一个)
    parameterPriorities: ParameterPriorityMap;

    // 前端常规参数全景开关看板
    switchMatrix: SwitchFeatureItem[];

    // 秒数范围与最大秒数路由
    durationSettings?: DurationSettings;

    // 参数条件多上游智能分流表 (兼容字段)
    conditionalRoutes: ConditionalRouteRule[];

    // 时长阈值转一口价路由
    durationThresholdRule: DurationThresholdRule;

    // 计费配置
    billing: {
        pricingMode?: "unified" | "matrix";  // "unified" 统一计费(一口价) | "matrix" 多规格矩阵计费
        unit: BillingUnit;
        defaultCost: number;
        defaultRatio: number;
        defaultPrice: number;
        tiers: ResolutionBillingTier[];
        surcharges?: BillingSurchargeItem[];
    };
}

/** 插件协议定义 */
export interface PluginProtocolItem {
    id: string;
    name: string;
    version: string;
    author: string;
    capability: CapabilityType;
    billingRule: "按秒计费" | "按次计费" | "Token计费";
    scope: "全量渠道" | "专项渠道";
    status: boolean;
    description: string;
    rawSchema?: string;
    differencesFromStandard?: string[];
    canAutoRouteBySwitch: boolean;
}

/** 渠道可获取模型元信息 (供获取模型与参数说明中心使用) */
export interface ChannelAvailableModel {
    id: string;
    channelId: string;
    channelName: string;
    modelKey: string; // 如 "seedance-2.5-3.0"
    displayName: string;
    capability: CapabilityType;
    protocol: string;
    endpoint: string;
    authType: "Bearer Token" | "Raw Token" | "Custom Header";
    extractPath: string;
    supportedParameters: string[];
    parameterSpecs: {
        maxResolution: string;
        durationRange?: string;
        aspectRatios: string[];
        modalities: string[];
        notes: string;
    };
}
