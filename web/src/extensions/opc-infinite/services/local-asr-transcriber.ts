// @opc-feature: hypit [start]
/**
 * 本地字级 ASR 转写服务 (FunASR / Sherpa-ONNX)
 * 对应模型路径: D:\AI\opc\opc-Copilot\tools\sherpa-onnx-funasr-nano-2025-12-30
 * 支持毫秒级字词时间戳打标，并在本地不可用或失败时自动平滑回退至多模态大模型分析
 */

export type WordTimingItem = {
    word: string;
    startSec: number;
    endSec: number;
};

export type LocalAsrTranscribeResult = {
    success: boolean;
    text?: string;
    wordTimingsFormatted?: string;
    words?: WordTimingItem[];
    fallbackReason?: string;
    source?: "local-funasr" | "fallback-multimodal";
};

export const LOCAL_ASR_MODEL_LABEL = "FunASR-Nano (本地字级 ASR)";

/**
 * 格式化词级时间轴字符串 (如: "0.0s[熬夜] 0.6s[脸垮] 1.4s[姐妹]")
 */
export function formatWordTimings(words: WordTimingItem[]): string {
    if (!words || words.length === 0) return "";
    return words
        .map((w) => `${w.startSec.toFixed(1)}s[${w.word}]`)
        .join(" ");
}

/**
 * 检查本地 ASR 服务是否在运行且健康可用
 */
export async function checkLocalAsrHealthy(endpoint = "http://127.0.0.1:35006"): Promise<boolean> {
    try {
        if (typeof window !== "undefined") {
            const bridge = (window as unknown as { desktopBridge?: { fetchLocal?: (url: string) => Promise<{ ok: boolean }> } }).desktopBridge;
            if (bridge?.fetchLocal) {
                const localRes = await bridge.fetchLocal(`${endpoint}/health`);
                return Boolean(localRes?.ok);
            }
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1200);
        const resp = await fetch(`${endpoint}/health`, {
            method: "GET",
            signal: controller.signal,
        });
        clearTimeout(timer);
        return resp.ok;
    } catch {
        return false;
    }
}

/**
 * 执行本地字词级 ASR 转写
 * 优先调用本地 ASR 服务；若失败或未就绪，返回 fallbackReason，不抛出异常打断业务
 */
export async function transcribeWithLocalAsr(
    audioBlob: Blob,
    options: {
        endpoint?: string;
        language?: string;
        signal?: AbortSignal;
    } = {},
): Promise<LocalAsrTranscribeResult> {
    const endpoint = options.endpoint || "http://127.0.0.1:35006";

    // 1. 检查桌面壳环境下的直接 IPC 或 HTTP 端口
    if (typeof window !== "undefined") {
        const desktopBridge = (window as unknown as {
            desktopBridge?: {
                transcribeAsr?: (opts: { audioBuffer: Uint8Array; language?: string }) => Promise<any>;
            };
        }).desktopBridge;

        if (desktopBridge?.transcribeAsr) {
            try {
                const arrayBuf = await audioBlob.arrayBuffer();
                const ipcResult = await desktopBridge.transcribeAsr({
                    audioBuffer: new Uint8Array(arrayBuf),
                    language: options.language || "zh",
                });
                if (ipcResult?.success && ipcResult.words) {
                    return {
                        success: true,
                        text: ipcResult.text || "",
                        words: ipcResult.words,
                        wordTimingsFormatted: formatWordTimings(ipcResult.words),
                        source: "local-funasr",
                    };
                }
            } catch (ipcErr) {
                console.warn("[local-asr-transcriber] 桌面壳 IPC ASR 调用失败，尝试 HTTP 回环:", ipcErr);
            }
        }
    }

    // 2. 尝试本地 HTTP 服务
    try {
        const isHealthy = await checkLocalAsrHealthy(endpoint);
        if (!isHealthy) {
            return {
                success: false,
                fallbackReason: "本地 ASR 服务未启动或未检测到可用端口，自动平滑回退至多模态音画解析",
                source: "fallback-multimodal",
            };
        }

        const formData = new FormData();
        formData.append("file", audioBlob, "audio.wav");
        formData.append("language", options.language || "zh");
        formData.append("granularity", "word");

        const resp = await fetch(`${endpoint}/transcribe-timestamps`, {
            method: "POST",
            body: formData,
            signal: options.signal,
        });

        if (!resp.ok) {
            return {
                success: false,
                fallbackReason: `本地 ASR 返回状态异常 (HTTP ${resp.status})，平滑回退至多模态模型`,
                source: "fallback-multimodal",
            };
        }

        const data = await resp.json();
        const rawWords: Array<{ word: string; start: number; end: number }> = data.words || data.timestamps || [];
        const words: WordTimingItem[] = rawWords.map((w) => ({
            word: w.word,
            startSec: Number(w.start || 0),
            endSec: Number(w.end || 0),
        }));

        return {
            success: true,
            text: data.text || "",
            words,
            wordTimingsFormatted: formatWordTimings(words),
            source: "local-funasr",
        };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
            success: false,
            fallbackReason: `本地 ASR 连接异常 (${msg})，已平滑回退至多模态模型`,
            source: "fallback-multimodal",
        };
    }
}
// @opc-feature: hypit [end]
