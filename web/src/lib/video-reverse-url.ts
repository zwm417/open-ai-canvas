export function extractHttpUrl(value: string): URL {
    const text = String(value || "").trim();
    const match = text.match(/https?:\/\/[^\s"'<>，。；;、）》)\]}]+/i);
    if (!match?.[0]) throw new Error("视频链接必须以 http:// 或 https:// 开头");
    const candidate = match[0].replace(/[，。；;、）》)\]}]+$/g, "");
    try {
        const url = new URL(candidate);
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
        return url;
    } catch {
        throw new Error("视频链接必须以 http:// 或 https:// 开头");
    }
}
