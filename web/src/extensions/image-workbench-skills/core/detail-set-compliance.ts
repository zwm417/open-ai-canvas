// @opc-feature: detail_set_workflow [start]
// 广告法违禁词扫描（四类词表移植自 clipforge ad-compliance，warn-only 不阻断）
// 策略：包含匹配 + 子串折叠去重 + high 严重度优先

export type DetailSetViolationCategory = "绝对化用语" | "医疗/虚假功效" | "需认证宣称" | "虚假紧迫";

export type DetailSetAdViolation = {
    term: string;
    category: DetailSetViolationCategory;
    severity: "high" | "med";
    suggestion: string;
};

const DETAIL_SET_AD_RULES: Array<{ category: DetailSetViolationCategory; severity: "high" | "med"; suggestion: string; terms: string[] }> = [
    {
        category: "绝对化用语",
        severity: "high",
        suggestion: "《广告法》第 9 条禁用绝对化用语，改为「之一 / 较 / 更 / 深受喜爱」等相对表述",
        terms: ["最佳", "最好", "最优", "最强", "最高级", "国家级", "世界级", "顶级", "顶尖", "极致", "100%", "百分百", "绝对", "万能", "史上最", "无敌", "销量第一", "全网第一", "排名第一", "行业第一", "独一无二", "领导品牌", "王牌", "首选品牌", "最低价", "全网最低", "史上最低", "历史最低", "销量冠军", "第一品牌"],
    },
    {
        category: "医疗/虚假功效",
        severity: "high",
        suggestion: "普通商品不得宣称医疗/治疗/根治等功效，删除或改为真实体验描述",
        terms: ["根治", "包治", "治愈", "药到病除", "立竿见影", "三天见效", "七天见效", "永不复发", "彻底根除", "疗效", "抗癌", "消炎", "杀菌", "处方药", "药妆", "医学级", "医疗级", "特效药"],
    },
    {
        category: "需认证宣称",
        severity: "med",
        suggestion: "「纯天然/有机/零添加」需权威认证或检测依据，无依据请删除",
        terms: ["纯天然", "零添加", "无添加", "有机食品", "100%天然"],
    },
    {
        category: "虚假紧迫",
        severity: "med",
        suggestion: "虚假限时限量属平台违规营销；若非真实可举证的活动请删除",
        terms: ["最后一天", "仅此一天", "错过不再有", "马上涨价", "明天恢复原价", "最后几件", "最后几单"],
    },
];

const DETAIL_SET_AD_TERMS = DETAIL_SET_AD_RULES.flatMap((rule) =>
    rule.terms.map((term) => ({ term, category: rule.category, severity: rule.severity, suggestion: rule.suggestion })),
).sort((a, b) => b.term.length - a.term.length);

export function checkDetailSetAdCompliance(text: string): DetailSetAdViolation[] {
    if (!text) return [];
    const found: DetailSetAdViolation[] = [];
    let covered = "";
    for (const rule of DETAIL_SET_AD_TERMS) {
        if (!text.includes(rule.term)) continue;
        if (covered.includes(rule.term)) continue;
        found.push(rule);
        covered += rule.term;
    }
    return found.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}

/** 广告法违禁词安全平滑替换字典（长词优先替换，用于自动脱敏净化） */
const DETAIL_SET_AD_REPLACEMENTS: Array<{ term: string; replaceWith: string }> = [
    { term: "全网第一", replaceWith: "领航之作" },
    { term: "销量第一", replaceWith: "热销之选" },
    { term: "排名第一", replaceWith: "前沿甄选" },
    { term: "行业第一", replaceWith: "行业前沿" },
    { term: "第一品牌", replaceWith: "知名品牌" },
    { term: "第一", replaceWith: "领航" },
    { term: "全网最低", replaceWith: "超值特惠" },
    { term: "史上最低", replaceWith: "惊喜特惠" },
    { term: "历史最低", replaceWith: "限时优选" },
    { term: "最低价", replaceWith: "优惠价" },
    { term: "顶级", replaceWith: "高阶" },
    { term: "顶尖", replaceWith: "卓越" },
    { term: "最佳", replaceWith: "优选" },
    { term: "最好", replaceWith: "优良" },
    { term: "最优", replaceWith: "优选" },
    { term: "最强", replaceWith: "强劲" },
    { term: "最高级", replaceWith: "典范级" },
    { term: "独一无二", replaceWith: "匠心独具" },
    { term: "100%", replaceWith: "高纯度" },
    { term: "百分百", replaceWith: "高纯净" },
    { term: "根治", replaceWith: "深层修护" },
    { term: "包治", replaceWith: "周全呵护" },
    { term: "治愈", replaceWith: "修护舒缓" },
    { term: "立竿见影", replaceWith: "卓效显现" },
    { term: "药到病除", replaceWith: "温和调理" },
    { term: "三天见效", replaceWith: "润泽焕新" },
    { term: "七天见效", replaceWith: "周周焕新" },
    { term: "永不复发", replaceWith: "持久维稳" },
    { term: "彻底根除", replaceWith: "深入净澈" },
    { term: "医学级", replaceWith: "实验室级" },
    { term: "医疗级", replaceWith: "专业护研" },
    { term: "纯天然", replaceWith: "天然植萃" },
    { term: "零添加", replaceWith: "纯净精简" },
    { term: "无添加", replaceWith: "精简配方" },
    { term: "最后一天", replaceWith: "限时特惠" },
    { term: "马上涨价", replaceWith: "抢鲜体验" },
].sort((a, b) => b.term.length - a.term.length);

/** 自动将文案中的违规绝对化用语替换为合规的高转化商用词 */
export function sanitizeDetailSetAdText(text: string): string {
    if (!text || typeof text !== "string") return "";
    let sanitized = text;
    for (const item of DETAIL_SET_AD_REPLACEMENTS) {
        if (sanitized.includes(item.term)) {
            sanitized = sanitized.split(item.term).join(item.replaceWith);
        }
    }
    return sanitized;
}
// @opc-feature: detail_set_workflow [end]
