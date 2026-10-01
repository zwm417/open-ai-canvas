// @opc-feature: prompt-vault-client [start]
import { http } from "@/services/api/request";

export const HEADER_CANVAS_SYSTEM_PROMPT_ID = "X-Canvas-System-Prompt-ID";
export const VAULT_PROMPT_MACRO_PREFIX = "__VAULT_PROMPT__:";

export const VAULT_PROMPT_IDS = {
    CREATIVE_REVERSE: "creative-reverse",
    CREATIVE_REPLICATION: "creative-replication",
    CREATION_ASSISTANT: "creation-assistant",
    CREATION_ASSISTANT_REFERENCE: "creation-assistant-reference",
    VIDEO_WORKBENCH: "video-workbench",
    VIDEO_REVERSE_CLASSIC: "video-reverse-classic",
    SEEDANCE_REPLICATION: "seedance-replication",
} as const;

export type VaultPromptID = (typeof VAULT_PROMPT_IDS)[keyof typeof VAULT_PROMPT_IDS] | string;

const _promptCache = new Map<string, string>();

/**
 * 在测试/单测环境自适应从本地金库目录直读，避免单测强依赖后端服务存活
 */
function tryLoadPromptFromLocalDisk(promptId: string): string {
    if (typeof window !== "undefined") return "";
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g = globalThis as any;
        if (g?.process?.versions?.bun || g?.process?.versions?.node) {
            const req = typeof require !== "undefined" ? require : undefined;
            if (req) {
                const fs = req("fs");
                const path = req("path");
                const filenameMap: Record<string, string> = {
                    "creative-reverse": "creative-reverse.md",
                    "creative-reverse-deconstruct": "creative-reverse.md",
                    "creative-replication": "creative-replication.md",
                    "creative-replication-director": "creative-replication.md",
                    "creation-assistant": "creation-assistant.md",
                    "creation-assistant-reference": "creation-assistant-reference.md",
                    "video-workbench": "video-workbench.md",
                    "video-reverse-classic": "video-reverse-classic.md",
                    "video-reverse": "video-reverse-classic.md",
                    "seedance-replication": "seedance-replication.md",
                };
                const fn = filenameMap[promptId] || `${promptId}.md`;
                const candidates = [
                    path.resolve(__dirname, "../../../../backend/internal/custom/opc-vault/assets", fn),
                    path.resolve(__dirname, "../../../../../backend/internal/custom/opc-vault/assets", fn),
                    path.resolve(process.cwd(), "backend/internal/custom/opc-vault/assets", fn),
                    path.resolve(process.cwd(), "media-lab/backend/internal/custom/opc-vault/assets", fn),
                ];
                for (const p of candidates) {
                    if (fs.existsSync(p)) {
                        return fs.readFileSync(p, "utf-8").trim();
                    }
                }
            }
        }
    } catch {
        // ignore
    }
    return "";
}

/**
 * 动态从服务端提示词金库安全拉取提示词。
 * 具备 0ms 内存缓存、容错回退与单测自适应探测。
 */
export async function fetchVaultPrompt(promptId: VaultPromptID): Promise<string> {
    const normId = promptId.trim().toLowerCase();
    if (_promptCache.has(normId)) {
        return _promptCache.get(normId)!;
    }

    // 1. 本地单测/Node环境直读探测
    const diskContent = tryLoadPromptFromLocalDisk(normId);
    if (diskContent) {
        _promptCache.set(normId, diskContent);
        return diskContent;
    }

    // 2. 浏览器环境下通过安全 API 获取（包含历史兼容端点与多级降级自愈）
    const candidateUrls = [
        `/prompts/${encodeURIComponent(normId)}`,
    ];
    if (normId === "creative-reverse" || normId === "creative-reverse-deconstruct") {
        candidateUrls.push("/prompts/creative-reverse-deconstruct");
    } else if (normId === "video-reverse" || normId === "video-reverse-classic") {
        candidateUrls.push("/prompts/video-reverse-classic");
    }

    for (const url of candidateUrls) {
        try {
            const res = await http.get<{ id?: string; prompt?: string }>(url);
            if (res?.prompt) {
                _promptCache.set(normId, res.prompt);
                return res.prompt;
            }
        } catch {
            // 继续尝试候选路径
        }
    }

    // 3. 网络故障或后端未及时热更时，兜底回退为服务端宏占位符（由安全代理网关在请求外发时进行零泄露注入）
    const fallbackMacro = getVaultMacro(normId);
    return _promptCache.get(normId) || fallbackMacro;
}

/**
 * 同步安全获取提示词：
 * - 在单元测试/Node/Bun环境下，直接命中本地磁盘金库并返回完整正文；
 * - 在浏览器内存已缓存时，返回真实正文；
 * - 在浏览器未预热且为公网商业渠道时，返回标准服务端宏占位符（如 __VAULT_PROMPT__:creation-assistant），
 *   由后端代理网关在请求外发前完成零泄露自动注入。
 */
export function getVaultPromptSync(promptId: VaultPromptID): string {
    const normId = promptId.trim().toLowerCase();
    if (_promptCache.has(normId)) {
        return _promptCache.get(normId)!;
    }

    const diskContent = tryLoadPromptFromLocalDisk(normId);
    if (diskContent) {
        _promptCache.set(normId, diskContent);
        return diskContent;
    }

    // 浏览器生产环境静默预热
    void fetchVaultPrompt(promptId);

    // 未就绪前默认返回宏，服务端网关执行零泄露动态注入
    return getVaultMacro(promptId);
}

/**
 * 生成服务端安全宏占位符
 */
export function getVaultMacro(promptId: VaultPromptID): string {
    return `${VAULT_PROMPT_MACRO_PREFIX}${promptId.trim()}`;
}

export type PreparedPromptOptions = {
    promptId: VaultPromptID;
    userCustomNotes?: string;
    isLocalChannel?: boolean;
};

export type PreparedPromptResult = {
    systemPrompt: string;
    headers?: Record<string, string>;
};

/**
 * 智能提示词编织与零泄露执行规划：
 * 1. 本地/私网渠道 (Local/LAN)：前端拉取完整正文发送至本地 Ollama/vLLM；
 * 2. 公网商业渠道 (Cloud/Relay)：前端仅传输宏标记与请求头，由后端代理网关安全注入，杜绝前端明文泄露。
 */
export async function preparePromptForExecution(options: PreparedPromptOptions): Promise<PreparedPromptResult> {
    const { promptId, userCustomNotes, isLocalChannel } = options;
    const notes = userCustomNotes?.trim();

    if (isLocalChannel) {
        const fullPrompt = await fetchVaultPrompt(promptId);
        const combined = notes ? `${fullPrompt}\n\n【用户特别要求】\n${notes}` : fullPrompt;
        return {
            systemPrompt: combined,
        };
    }

    // 公网商业渠道：采用宏标记与请求头双保险，实现 0 KB 核心提示词传输
    const macro = getVaultMacro(promptId);
    const combinedSystemPrompt = notes ? `${macro}\n\n【用户特别要求】\n${notes}` : macro;

    return {
        systemPrompt: combinedSystemPrompt,
        headers: {
            [HEADER_CANVAS_SYSTEM_PROMPT_ID]: promptId,
        },
    };
}

/**
 * 预热提示词金库：在应用初始化或空闲时并发拉取高频提示词，填充内存缓存
 */
export async function prewarmPromptVault(): Promise<void> {
    const defaultIds = Object.values(VAULT_PROMPT_IDS);
    await Promise.allSettled(defaultIds.map((id) => fetchVaultPrompt(id)));
}

/**
 * 解析并递归替换 HTTP Request Body 中的金库宏（__VAULT_PROMPT__:<id>）。
 * 专为本地私网/桌面直连通道（Local/LAN Ollama/vLLM）设计：
 * - 针对 JSON 请求体，解析为对象树进行精确字段遍历与转义替换，杜绝原始文本注入导致的非法 JSON 破坏；
 * - 针对非 JSON 纯文本请求体，进行安全正则全局替换；
 * - 针对非字符串体或无宏请求，0ms 立即放行。
 */
export async function resolveVaultMacrosInBody(body: BodyInit | null | undefined): Promise<BodyInit | null | undefined> {
    if (!body || typeof body !== "string") {
        return body;
    }
    if (!body.includes(VAULT_PROMPT_MACRO_PREFIX)) {
        return body;
    }

    const MACRO_REGEX = /__VAULT_PROMPT__:([a-zA-Z0-9_-]+)/g;

    const replaceMacrosInString = async (str: string): Promise<string> => {
        if (!str.includes(VAULT_PROMPT_MACRO_PREFIX)) return str;
        const matches = [...str.matchAll(MACRO_REGEX)];
        if (matches.length === 0) return str;

        let result = str;
        for (const match of matches) {
            const fullMacro = match[0];
            const promptId = match[1];
            const realPrompt = await fetchVaultPrompt(promptId);
            if (realPrompt) {
                result = result.split(fullMacro).join(realPrompt);
            }
        }
        return result;
    };

    try {
        const parsed = JSON.parse(body);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const traverse = async (node: any): Promise<any> => {
            if (typeof node === "string") {
                return await replaceMacrosInString(node);
            }
            if (Array.isArray(node)) {
                for (let i = 0; i < node.length; i++) {
                    node[i] = await traverse(node[i]);
                }
                return node;
            }
            if (node !== null && typeof node === "object") {
                for (const key of Object.keys(node)) {
                    node[key] = await traverse(node[key]);
                }
                return node;
            }
            return node;
        };

        const resolved = await traverse(parsed);
        return JSON.stringify(resolved);
    } catch {
        return await replaceMacrosInString(body);
    }
}

/**
 * 清除内存缓存（用于热更或单测重置）
 */
export function clearPromptCache(): void {
    _promptCache.clear();
}
// @opc-feature: prompt-vault-client [end]
