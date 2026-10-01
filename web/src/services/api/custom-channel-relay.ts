import { projectDesktopLocalChannelRuntime } from "@/lib/desktop-local-channel";
import { isSystemProxyBaseUrl, resolveBackendApiUrl, type AiConfig, type ChannelHeader } from "@/stores/use-config-store";

type RelayConfig = Pick<AiConfig, "baseUrl" | "apiKey" | "apiFormat"> & { allowLocalChannel?: boolean; headers?: ChannelHeader[] };

// @opc-feature: custom_channel_relay [start]
import { resolveVaultMacrosInBody, VAULT_PROMPT_MACRO_PREFIX } from "./prompt-vault";

export type ChannelRequest = {
    url: string;
    headers: Record<string, string>;
    credentials: RequestCredentials;
    directUrl: string;
    directHeaders: Record<string, string>;
};

export function isLocalOrPrivateUpstream(upstreamUrl: string, baseUrl?: string): boolean {
    const urls = [upstreamUrl, baseUrl].filter(Boolean) as string[];
    for (const item of urls) {
        try {
            const normalizedItem = item.includes("://") ? item : `http://${item}`;
            const parsed = new URL(normalizedItem);
            const host = parsed.hostname.trim().toLowerCase();
            if (!host) continue;
            if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
            if (host === "127.0.0.1" || host.startsWith("127.")) return true;
            if (host === "0.0.0.0" || host === "::1" || host === "[::1]") return true;
            if (host.startsWith("192.168.") || host.startsWith("10.")) return true;
            if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
            if (/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(host)) return true;
            if (/^169\.254\./.test(host)) return true;
            if (/^198\.(1[89])\./.test(host)) return true;
        } catch {
            // ignore parsing errors
        }
    }
    return false;
}

/** 自定义渠道经登录态后端中转，并在网络故障、代理重置或未登录态时自动优雅回退到原版直连模式。 */
export function channelRequest(config: RelayConfig, upstreamUrl: string, headers: HeadersInit = {}): ChannelRequest {
    const runtimeConfig = projectDesktopLocalChannelRuntime(config);
    const normalizedHeaders = new Headers(headers);
    if (isSystemProxyBaseUrl(runtimeConfig.baseUrl)) {
        const directHeaders = Object.fromEntries(normalizedHeaders.entries());
        return { url: upstreamUrl, headers: directHeaders, credentials: "include", directUrl: upstreamUrl, directHeaders };
    }

    const normalizedBaseUrl = requireHttpUrl(runtimeConfig.baseUrl, "当前模型渠道 Base URL");
    const normalizedUpstreamUrl = requireHttpUrl(upstreamUrl, "当前模型请求地址");

    // 构造前端直连 Header（原版 infinite-canvas 标准调用方式）
    const directHeaders = new Headers(headers);
    directHeaders.delete("X-Canvas-Upstream-Headers");
    directHeaders.delete("X-Canvas-Upstream-URL");
    directHeaders.delete("X-Canvas-Upstream-Format");
    directHeaders.delete("X-Canvas-Allow-Local-Channel");
    directHeaders.delete("X-Canvas-Upstream-Base-URL");
    directHeaders.delete("X-Canvas-System-Prompt-ID");
    if (runtimeConfig.apiFormat === "gemini") {
        if (runtimeConfig.apiKey?.trim()) directHeaders.set("x-goog-api-key", runtimeConfig.apiKey.trim());
        directHeaders.delete("Authorization");
    } else if (runtimeConfig.apiFormat === "claude") {
        if (runtimeConfig.apiKey?.trim()) directHeaders.set("x-api-key", runtimeConfig.apiKey.trim());
        directHeaders.set("anthropic-version", "2023-06-01");
        directHeaders.delete("Authorization");
    } else if (runtimeConfig.apiKey?.trim()) {
        directHeaders.set("Authorization", `Bearer ${runtimeConfig.apiKey.trim()}`);
    } else {
        directHeaders.delete("Authorization");
    }
    if (runtimeConfig.headers?.length) {
        runtimeConfig.headers.forEach((h) => {
            if (h.name && h.value) directHeaders.set(h.name, h.value);
        });
    }

    // 严格遵循 AGENTS.md 9.1 规范：本地/私网渠道 (127.0.0.1 / localhost / 10.x / 192.168.x 等)
    // 若未显式授权允许本地渠道中转，直接走前端/桌面端直连，严禁发往后端 /api/ai/custom，避免 SSRF 误杀与算力浪费。
    if (runtimeConfig.allowLocalChannel !== true && isLocalOrPrivateUpstream(normalizedUpstreamUrl, normalizedBaseUrl)) {
        const directHeadersObj = Object.fromEntries(directHeaders.entries());
        return {
            url: normalizedUpstreamUrl,
            headers: directHeadersObj,
            credentials: "omit",
            directUrl: normalizedUpstreamUrl,
            directHeaders: directHeadersObj,
        };
    }

    // 构造后端中转网关 Header
    normalizedHeaders.delete("X-Canvas-Upstream-Headers");
    normalizedHeaders.delete("x-goog-api-key");
    normalizedHeaders.set("Authorization", `Bearer ${runtimeConfig.apiKey}`);
    normalizedHeaders.set("X-Canvas-Upstream-URL", normalizedUpstreamUrl);
    normalizedHeaders.set("X-Canvas-Upstream-Format", runtimeConfig.apiFormat === "gemini" ? "gemini" : runtimeConfig.apiFormat === "claude" ? "claude" : "openai");
    if (runtimeConfig.allowLocalChannel === true) {
        normalizedHeaders.set("X-Canvas-Allow-Local-Channel", "1");
        normalizedHeaders.set("X-Canvas-Upstream-Base-URL", normalizedBaseUrl);
    } else {
        normalizedHeaders.delete("X-Canvas-Allow-Local-Channel");
        normalizedHeaders.delete("X-Canvas-Upstream-Base-URL");
    }
    if (runtimeConfig.headers?.length) normalizedHeaders.set("X-Canvas-Upstream-Headers", encodeChannelHeaders(runtimeConfig.headers));

    return {
        url: resolveBackendApiUrl("/api/ai/custom"),
        headers: Object.fromEntries(normalizedHeaders.entries()),
        credentials: "include",
        directUrl: normalizedUpstreamUrl,
        directHeaders: Object.fromEntries(directHeaders.entries()),
    };
}

/**
 * 智能双通道通道请求执行器 (遵循 AGENTS.md 9.1 规范)：
 * 1. 本地/私网渠道 (127.0.0.1 / localhost / 10.x / 192.168.x 等)：
 *    优先走桌面宿主原生桥接 (window.desktopBridge.fetchLocal)；
 *    无桌面桥接时直接在本地环境直连 (fetch directUrl)，严禁发往云端后端 /api/ai/custom 造成 SSRF 拦截或无用算力消耗。
 * 2. 公网商业渠道 (api.deepseek.com / api.openai.com 等)：
 *    必须走云端安全代理网关 `/api/ai/custom`，由后端转发以保护 API Key 不在前端外泄。
 *    严禁进入 desktopBridge.fetchLocal，网关失败时严禁降级浏览器直连 (杜绝商业 Key 泄露与 CORS 错误)。
 */
export async function executeChannelFetch(request: ChannelRequest, init: RequestInit = {}): Promise<Response> {
    const isLocal = isLocalOrPrivateUpstream(request.directUrl);

    // 1. 本地/私网渠道专用执行通道
    if (isLocal) {
        let localBody = init.body;
        if (typeof localBody === "string" && localBody.includes(VAULT_PROMPT_MACRO_PREFIX)) {
            localBody = (await resolveVaultMacrosInBody(localBody)) ?? localBody;
        }

        const desktopBridge = typeof window !== "undefined" ? (window as unknown as { desktopBridge?: { fetchLocal?: (urlOrOptions: any, init?: RequestInit) => Promise<any> } }).desktopBridge : undefined;
        if (desktopBridge?.fetchLocal && request.directUrl) {
            try {
                const bridgeRes = await (desktopBridge.fetchLocal.length <= 1 && typeof request.directUrl === "string"
                    ? desktopBridge.fetchLocal({
                          url: request.directUrl,
                          method: init.method || "GET",
                          headers: request.directHeaders,
                          body: localBody,
                      })
                    : desktopBridge.fetchLocal(request.directUrl, {
                          ...init,
                          headers: request.directHeaders,
                          body: localBody,
                      }));
                if (bridgeRes instanceof Response) return bridgeRes;
                if (bridgeRes && typeof bridgeRes.status === "number") {
                    const bodyInit = bridgeRes.status === 204 || bridgeRes.status === 304 ? null : bridgeRes.body;
                    return new Response(bodyInit, {
                        status: bridgeRes.status,
                        headers: bridgeRes.headers,
                    });
                }
                return bridgeRes;
            } catch (bridgeErr) {
                console.warn("[Channel] Desktop bridge fetchLocal failed, falling back to direct local fetch", bridgeErr);
            }
        }

        // 纯网页环境或原生桥接不可用时，直接本地 fetch（私网/本机地址不涉及商业 Key 外泄风险）
        return await fetch(request.directUrl || request.url, {
            ...init,
            headers: request.directHeaders || request.headers,
            body: localBody,
            credentials: "omit",
        });
    }

    // 2. 公网商业渠道专用执行通道
    // 保护 API Key 不在前端外泄，统一走后端安全代理网关 `/api/ai/custom`；网关报错时直接返回网关响应或抛出网络异常，绝不回退至浏览器直连
    return await fetch(request.url, {
        ...init,
        headers: request.headers,
        credentials: request.credentials,
    });
}
// @opc-feature: custom_channel_relay [end]

function requireHttpUrl(value: string, label: string) {
    const normalized = value.trim();
    let parsed: URL;
    try {
        parsed = new URL(normalized);
    } catch {
        throw new Error(`${label} 无效，请填写完整地址，例如：https://api.example.com/v1`);
    }
    if (!parsed.hostname || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
        throw new Error(`${label} 无效，请填写完整地址，例如：https://api.example.com/v1`);
    }
    return parsed.toString();
}

function encodeChannelHeaders(headers: ChannelHeader[]) {
    const bytes = new TextEncoder().encode(JSON.stringify(headers));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}
