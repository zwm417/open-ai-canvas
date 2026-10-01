import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const ADMIN_SESSION_COOKIE = "open_ai_canvas_session=test_admin_session.testtoken123456789012345678901234";
const BACKEND_BASE_URL = "http://127.0.0.1:8080";

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf-8");
  const result = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      result[k] = v;
    }
  }
  return result;
}

function apiRequest(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const url = new URL(urlPath, BACKEND_BASE_URL);

    const headers = {
      Cookie: ADMIN_SESSION_COOKIE,
      "Content-Type": "application/json",
    };
    if (payload) {
      headers["Content-Length"] = Buffer.byteLength(payload);
    }

    const req = http.request(
      url,
      {
        method,
        headers,
      },
      (res) => {
        let respBody = "";
        res.on("data", (chunk) => {
          respBody += chunk;
        });
        res.on("end", () => {
          try {
            const data = JSON.parse(respBody);
            resolve({ status: res.statusCode, data });
          } catch {
            resolve({ status: res.statusCode, raw: respBody });
          }
        });
      }
    );

    req.on("error", (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

function makeVideoCapabilityConfig(overrides = {}) {
  const durations = overrides.durations || [5, 10];
  const defaultDuration = overrides.defaultDuration || durations[0] || 5;
  const resolutions = overrides.resolutions || ["720p"];
  const defaultResolution = overrides.defaultResolution || resolutions[0] || "720p";
  const ratios = overrides.ratios || overrides.aspectRatios || ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
  const defaultRatio = overrides.defaultRatio || overrides.defaultAspectRatio || "16:9";
  const operations = overrides.operations || ["text_to_video", "image_to_video", "reference_to_video"];
  const defaultOperation = overrides.defaultOperation || operations[0] || "text_to_video";

  return {
    version: 1,
    video: {
      references: {
        promptMaxChars: overrides.promptMaxChars || 5000,
        minImages: overrides.minImages !== undefined ? overrides.minImages : 0,
        maxImages: overrides.maxImages !== undefined ? overrides.maxImages : 10,
        maxImageBytes: overrides.maxImageBytes || 10485760,
        maxVideos: overrides.maxVideos !== undefined ? overrides.maxVideos : 3,
        maxVideoBytes: overrides.maxVideoBytes || 209715200,
        maxVideoDuration: overrides.maxVideoDuration || 15,
        maxAudios: overrides.maxAudios !== undefined ? overrides.maxAudios : 3,
        maxAudioBytes: overrides.maxAudioBytes || 15728640,
        maxAudioDuration: overrides.maxAudioDuration || 15,
      },
      duration: overrides.durationSelection === "range"
        ? {
            selection: "range",
            min: overrides.minDuration || 4,
            max: overrides.maxDuration || 15,
            step: overrides.durationStep || 1,
            default: defaultDuration,
          }
        : {
            selection: "enum",
            values: durations,
            default: defaultDuration,
          },
      ratios: ratios,
      defaultRatio: defaultRatio,
      resolutions: resolutions,
      defaultResolution: defaultResolution,
      generateAudio: {
        supported: overrides.generateAudio !== undefined ? overrides.generateAudio : false,
        default: overrides.defaultGenerateAudio !== undefined ? overrides.defaultGenerateAudio : false,
      },
      watermark: {
        supported: overrides.watermark !== undefined ? overrides.watermark : false,
        default: false,
      },
      operations: operations,
      defaultOperation: defaultOperation,
    },
  };
}

function makeImageCapabilityConfig(overrides = {}) {
  const sizes = overrides.sizes || [
    "auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "21:9", "9:16",
    "1024x1024", "1360x1024", "1024x1360", "1536x1024", "1024x1536", "1024x1280", "1280x1024", "2048x878", "1824x1024", "1024x1824",
    "2048x2048", "2304x1728", "1728x2304", "2496x1664", "1664x2496", "1792x2240", "2240x1792", "3136x1344", "2752x1536", "1536x2752",
    "2880x2880", "3264x2448", "2448x3264", "3504x2336", "2336x3504", "2560x3200", "3200x2560", "3808x1632", "3840x2160", "2160x3840"
  ];
  const defaultSize = overrides.defaultSize || sizes[0] || "1024x1024";
  const qualities = overrides.qualities || ["auto", "low", "medium", "high"];
  const defaultQuality = overrides.defaultQuality || qualities[0] || "auto";

  return {
    version: 1,
    image: {
      references: {
        promptMaxChars: overrides.promptMaxChars || 32000,
        maxImages: overrides.maxImages !== undefined ? overrides.maxImages : 10,
        maxImageBytes: overrides.maxImageBytes || 10485760,
        maskSupported: overrides.maskSupported !== undefined ? overrides.maskSupported : true,
      },
      size: {
        parameter: overrides.parameter || "size",
        values: sizes,
        default: defaultSize,
        allowCustom: overrides.allowCustom !== undefined ? overrides.allowCustom : true,
      },
      quality: {
        supported: overrides.qualitySupported !== undefined ? overrides.qualitySupported : true,
        values: qualities,
        default: defaultQuality,
      },
      transparentBackground: {
        supported: overrides.transparentBackground !== undefined ? overrides.transparentBackground : true,
        default: false,
      },
      responseFormat: {
        supported: true,
      },
      outputFormat: {
        supported: true,
      },
      maxOutputs: overrides.maxOutputs || 1,
    },
  };
}

const channelConfigs = [
  // ================= 1. 影策 =================
  {
    envFile: "D:\\00\\智影测试api集中\\影策中转-key.env",
    channelName: "yingce",
    defaultBaseUrl: "https://api.ddcat.pronhubcn.com/v1",
    match: (c) => c.name === "yingce" || c.baseUrl.includes("pronhubcn.com"),
    models: [
      {
        modelKey: "gpt-image-2",
        providerModelKey: "gpt-image-2",
        displayName: "gpt-image-2",
        channelLabel: "OpenAI",
        capability: "image",
        protocol: "openai-image",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 200000,
        description: "影策中转标准生图模型",
        capabilityConfig: makeImageCapabilityConfig(),
      },
      {
        modelKey: "gpt-image-2-4k",
        providerModelKey: "gpt-image-2-4k",
        displayName: "gpt-image-2-4k",
        channelLabel: "OpenAI",
        capability: "image",
        protocol: "openai-image",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 400000,
        description: "影策中转 4K 高清生图模型",
        capabilityConfig: makeImageCapabilityConfig({
          sizes: ["2048x2048", "3840x2160"],
          defaultSize: "3840x2160",
          qualities: ["hd"],
          defaultQuality: "hd",
        }),
      },
      {
        modelKey: "gpt-image-2-adobe",
        providerModelKey: "gpt-image-2-adobe",
        displayName: "gpt-image-2-adobe渠道",
        channelLabel: "AdobeFirefly",
        capability: "image",
        protocol: "openai-image",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 25000,
        description: "影策中转 AdobeFirefly 渠道",
        capabilityConfig: makeImageCapabilityConfig(),
      },
      {
        modelKey: "gpt-image-2.5",
        providerModelKey: "gpt-image-2.5",
        displayName: "gpt-image-2.5",
        channelLabel: "OpenAI",
        capability: "image",
        protocol: "openai-image",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 300000,
        description: "影策中转 2.5 代升级版模型",
        capabilityConfig: makeImageCapabilityConfig(),
      },
      {
        modelKey: "gpt-image-2.5-4k",
        providerModelKey: "gpt-image-2.5-4k",
        displayName: "gpt-image-2.5（4k）",
        channelLabel: "OpenAI",
        capability: "image",
        protocol: "openai-image",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 35000,
        description: "影策中转 2.5 4K 高清版",
        capabilityConfig: makeImageCapabilityConfig({
          sizes: ["2048x2048", "3840x2160"],
          defaultSize: "3840x2160",
          qualities: ["hd"],
          defaultQuality: "hd",
        }),
      },
      {
        modelKey: "gpt-image-2.5-adobe",
        providerModelKey: "gpt-image-2.5-adobe",
        displayName: "gpt-image-2.5-adobe",
        channelLabel: "OpenAI",
        capability: "image",
        protocol: "openai-image",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 40000,
        description: "影策中转 2.5 Adobe 渠道",
        capabilityConfig: makeImageCapabilityConfig(),
      },
      {
        modelKey: "nano-banana-pro",
        providerModelKey: "nano-banana-pro",
        displayName: "nanobanana-2-pro",
        channelLabel: "NanoBanana",
        capability: "image",
        protocol: "openai-image",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 70000,
        description: "影策中转 NanoBanana Pro",
        capabilityConfig: makeImageCapabilityConfig(),
      },
      {
        modelKey: "nano-banana2",
        providerModelKey: "nano-banana2",
        displayName: "nanobanana-2",
        channelLabel: "NanoBanana",
        capability: "image",
        protocol: "openai-image",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 60000,
        description: "影策中转 NanoBanana 2",
        capabilityConfig: makeImageCapabilityConfig(),
      },
    ],
  },

  // ================= 2. 万有引力 (lxmone) =================
  {
    envFile: "D:\\00\\智影测试api集中\\万有引力中转-key.env",
    channelName: "万有引力 (lxmone)",
    defaultBaseUrl: "https://lxmone.xyz/v1",
    match: (c) => c.name.includes("万有引力") || c.name.toLowerCase().includes("lxmone") || c.baseUrl.includes("lxmone.xyz"),
    models: [
      {
        modelKey: "lxmone-sd-2.5",
        providerModelKey: "sd-2.5",
        displayName: "Seedance 2.5",
        channelLabel: "万有引力 (30秒·¥1.5)",
        capability: "video",
        protocol: "lxmone-sd-videos",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 1500000,
        description: "万有引力 SD-2.5 固定规格视频，固定30秒，720P，一口价 ¥1.5/条",
        capabilityConfig: makeVideoCapabilityConfig({
          durations: [30],
          defaultDuration: 30,
          resolutions: ["720p"],
          defaultResolution: "720p",
          maxImages: 10,
          maxVideos: 0,
          maxAudios: 3,
          generateAudio: true,
          defaultGenerateAudio: true,
          operations: ["image_to_video", "reference_to_video", "text_to_video"],
          defaultOperation: "image_to_video",
        }),
      },
      {
        modelKey: "lxmone-sd-mini",
        providerModelKey: "sd-mini",
        displayName: "Seedance 2.0 Mini",
        channelLabel: "万有引力 (¥1.0/次)",
        capability: "video",
        protocol: "lxmone-sd-mini-videos",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 1000000,
        description: "万有引力 Seedance Mini 视频，720P 4–12秒，最多9张参考图、0参考视频、3段参考音频，不限制人脸，一口价 ¥1.00/次",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 4,
          maxDuration: 12,
          defaultDuration: 6,
          resolutions: ["720p"],
          defaultResolution: "720p",
          maxImages: 9,
          maxVideos: 0,
          maxAudios: 3,
          generateAudio: true,
        }),
      },
      {
        modelKey: "lxmone-wan3.0-video",
        providerModelKey: "wan3.0-video",
        displayName: "Wan 3.0",
        channelLabel: "标准版 (万有引力)",
        capability: "video",
        protocol: "lxmone-wan-videos",
        billingMode: "per_second",
        unitPriceMicrocredits: 100000,
        description: "通义万相 3.0 标准版，多模态参考生视频",
        capabilityConfig: makeVideoCapabilityConfig({
          durations: [5, 10],
          resolutions: ["480p", "720p", "1080p"],
        }),
      },
      {
        modelKey: "lxmone-wan3.0-video-prime",
        providerModelKey: "wan3.0-video-prime",
        displayName: "Wan 3.0",
        channelLabel: "Prime旗舰 (万有引力)",
        capability: "video",
        protocol: "lxmone-wan-videos",
        billingMode: "per_second",
        unitPriceMicrocredits: 150000,
        description: "通义万相 3.0 Prime 旗舰高画质版",
        capabilityConfig: makeVideoCapabilityConfig({
          durations: [5, 10],
          resolutions: ["480p", "720p", "1080p"],
          defaultResolution: "1080p",
        }),
      },
      {
        modelKey: "lxmone-wan3.0-video-s",
        providerModelKey: "wan3.0-video-s",
        displayName: "Wan 3.0",
        channelLabel: "S渠道 (万有引力)",
        capability: "video",
        protocol: "lxmone-wan-channel-s",
        billingMode: "per_second",
        unitPriceMicrocredits: 100000,
        description: "Wan 3.0 原生 S 渠道，结构化 input.media 传参",
        capabilityConfig: makeVideoCapabilityConfig({
          durations: [5, 10],
          resolutions: ["480p", "720p", "1080p"],
        }),
      },
      {
        modelKey: "lxmone-grok-imagine-video",
        providerModelKey: "grok-imagine-video",
        displayName: "Grok Imagine Video 1.5",
        channelLabel: "万有引力",
        capability: "video",
        protocol: "lxmone-grok-videos",
        billingMode: "per_second",
        unitPriceMicrocredits: 120000,
        description: "xAI Grok Imagine 电影写实质感视频生成",
        capabilityConfig: makeVideoCapabilityConfig({
          durations: [5, 10, 15],
          resolutions: ["480p", "720p"],
        }),
      },
      {
        modelKey: "lxmone-minimax-h3-max",
        providerModelKey: "minimax-h3-max",
        displayName: "MiniMax-H3",
        channelLabel: "万有引力 Max",
        capability: "video",
        protocol: "lxmone-h3-max-videos",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 900000,
        description: "MiniMax H3 Max 影视级生成通道",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 1,
          maxDuration: 15,
          defaultDuration: 5,
          resolutions: ["720p"],
        }),
      },
      {
        modelKey: "seedance2.5-c",
        providerModelKey: "seedance2.5-c",
        displayName: "Seedance 2.5",
        channelLabel: "万有引力 满血特惠",
        capability: "video",
        protocol: "lxmone-seedance-videos",
        billingMode: "per_second",
        unitPriceMicrocredits: 400000,
        description: "万有引力 Seedance 2.5 933满血特惠通道，支持9图+3视频+3音频全模态参考，每秒 ¥0.40",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 4,
          maxDuration: 30,
          defaultDuration: 10,
          resolutions: ["720p", "1080p"],
          defaultResolution: "720p",
          maxImages: 9,
          maxVideos: 3,
          maxAudios: 3,
          generateAudio: true,
          operations: ["text_to_video", "image_to_video", "reference_to_video"],
          defaultOperation: "text_to_video",
        }),
      },
    ],
  },

  // ================= 3. 欢乐马 ManjuAI =================
  {
    envFile: "D:\\00\\智影测试api集中\\欢乐马中转-key.env",
    channelName: "ManjuAI (欢乐马 & WAN 3.0)",
    defaultBaseUrl: "https://api.manjuai.top/v1",
    match: (c) => c.name.includes("欢乐马") || c.name.toLowerCase().includes("manjuai") || c.baseUrl.includes("manjuai.top"),
    models: [
      {
        modelKey: "happyhorse-1.1-t2v",
        providerModelKey: "happyhorse-1.1-t2v",
        displayName: "HappyHorse 1.1",
        channelLabel: "文生视频",
        capability: "video",
        protocol: "newapi-channel-2",
        billingMode: "per_second",
        unitPriceMicrocredits: 70000,
        description: "HappyHorse 1.1 纯文本生成视频",
        capabilityConfig: makeVideoCapabilityConfig({
          durations: [5, 10],
          resolutions: ["720p", "1080p"],
          operations: ["text_to_video"],
          minImages: 0,
          maxImages: 0,
        }),
      },
      {
        modelKey: "happyhorse-1.1-i2v",
        providerModelKey: "happyhorse-1.1-i2v",
        displayName: "HappyHorse 1.1",
        channelLabel: "图生视频",
        capability: "video",
        protocol: "newapi-channel-2",
        billingMode: "per_second",
        unitPriceMicrocredits: 70000,
        description: "HappyHorse 1.1 单图生视频",
        capabilityConfig: makeVideoCapabilityConfig({
          durations: [5, 10],
          resolutions: ["720p", "1080p"],
          operations: ["image_to_video"],
          minImages: 1,
          maxImages: 1,
        }),
      },
      {
        modelKey: "happyhorse-1.1-r2v",
        providerModelKey: "happyhorse-1.1-r2v",
        displayName: "HappyHorse 1.1",
        channelLabel: "参考生视频",
        capability: "video",
        protocol: "newapi-channel-2",
        billingMode: "per_second",
        unitPriceMicrocredits: 80000,
        description: "HappyHorse 1.1 多参考图/视频生视频",
        capabilityConfig: makeVideoCapabilityConfig({
          durations: [5, 10],
          resolutions: ["720p", "1080p"],
          maxImages: 5,
        }),
      },
      {
        modelKey: "happyhorse-1.0-video-edit",
        providerModelKey: "happyhorse-1.0-video-edit",
        displayName: "HappyHorse 1.0",
        channelLabel: "视频编辑",
        capability: "video",
        protocol: "newapi-channel-2",
        billingMode: "per_second",
        unitPriceMicrocredits: 60000,
        description: "HappyHorse 1.0 视频编辑",
        capabilityConfig: makeVideoCapabilityConfig({
          durations: [5, 10],
          resolutions: ["720p", "1080p"],
          maxVideos: 1,
        }),
      },
      {
        modelKey: "manjuai-wan3.0-video",
        providerModelKey: "wan3.0-video",
        displayName: "Wan 3.0",
        channelLabel: "ManjuAI 视频",
        capability: "video",
        protocol: "newapi-channel-2",
        billingMode: "per_second",
        unitPriceMicrocredits: 100000,
        description: "通义万相 3.0 综合版，480P: 0.10/s, 720P: 0.12/s, 1080P: 0.16/s",
        capabilityConfig: makeVideoCapabilityConfig({
          durations: [5, 10],
          resolutions: ["480p", "720p", "1080p"],
        }),
      },
      {
        modelKey: "manjuai-wan3.0-video-prime",
        providerModelKey: "wan3.0-video-prime",
        displayName: "Wan 3.0",
        channelLabel: "ManjuAI Prime旗舰",
        capability: "video",
        protocol: "newapi-channel-2",
        billingMode: "per_second",
        unitPriceMicrocredits: 150000,
        description: "通义万相 3.0 Prime 旗舰版",
        capabilityConfig: makeVideoCapabilityConfig({
          durations: [5, 10],
          resolutions: ["480p", "720p", "1080p"],
          defaultResolution: "1080p",
        }),
      },
      {
        modelKey: "manjuai-minimax-h3-r2v",
        providerModelKey: "minimax-h3-r2v",
        displayName: "MiniMax-H3",
        channelLabel: "ManjuAI 参考生视频 (¥0.90/次)",
        capability: "video",
        protocol: "newapi-channel-2",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 900000,
        description: "MiniMax H3 多媒体参考生视频，单次固定 ¥0.90",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 1,
          maxDuration: 15,
          defaultDuration: 5,
          resolutions: ["720p"],
          maxImages: 9,
          maxVideos: 3,
          maxAudios: 3,
        }),
      },
      {
        modelKey: "manjuai-minimax-h3-t2v",
        providerModelKey: "minimax-h3-t2v",
        displayName: "MiniMax-H3",
        channelLabel: "ManjuAI 文生视频 (¥0.90/次)",
        capability: "video",
        protocol: "newapi-channel-2",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 900000,
        description: "MiniMax H3 纯文生视频，单次固定 ¥0.90",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 1,
          maxDuration: 15,
          defaultDuration: 5,
          resolutions: ["720p"],
          operations: ["text_to_video"],
          minImages: 0,
          maxImages: 0,
        }),
      },
    ],
  },

  // ================= 4. NewToken 3.6折特惠 (720P专属) =================
  {
    envFile: "D:\\00\\智影测试api集中\\newtoken中转-key.env",
    channelName: "NewToken Seedance (3.6折特惠·720P)",
    defaultBaseUrl: "https://www.newtoken.club/v1",
    overrideKey: "sk-NeYyCPWRrzu6QWpPp5m8uG48etGMvWfQTSCum1s6rpXFsS13",
    match: (c) => c.name.includes("3.6折") || c.name.includes("newtoken-mini"),
    models: [
      {
        modelKey: "newtoken-36-seedance-mini-token",
        providerModelKey: "doubao-seedance-2-0-mini-260615",
        displayName: "Seedance 2.0 Mini",
        channelLabel: "官方任务 (Token结算·3.6折)",
        capability: "video",
        protocol: "volcengine-ark-video",
        billingMode: "token",
        unitPriceMicrocredits: 8280000,
        description: "火山原生任务协议，纯 Token 结算，3.6折特惠，固定 720P",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 4,
          maxDuration: 12,
          defaultDuration: 6,
          resolutions: ["720p"],
          defaultResolution: "720p",
          maxImages: 9,
          maxVideos: 0,
          maxAudios: 3,
        }),
      },
      {
        modelKey: "newtoken-36-sd20-mini-official",
        providerModelKey: "sd2.0-720p-mini-official",
        displayName: "Seedance 2.0 Mini",
        channelLabel: "官方兼容 (混合计费·3.6折)",
        capability: "video",
        protocol: "seedance-videos-compatible",
        billingMode: "token",
        unitPriceMicrocredits: 8280000,
        description: "OpenAI 兼容 /v1/videos 端点，无参考视频按秒，有参考视频按 Token 结算",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 4,
          maxDuration: 12,
          defaultDuration: 6,
          resolutions: ["720p"],
          defaultResolution: "720p",
        }),
      },
      {
        modelKey: "newtoken-36-video-ultra-mini",
        providerModelKey: "video-ultra-720p-mini",
        displayName: "Seedance 2.0 Mini",
        channelLabel: "极速按秒 (¥0.036/s)",
        capability: "video",
        protocol: "seedance-videos-compatible",
        billingMode: "per_second",
        unitPriceMicrocredits: 36000,
        description: "纯按秒计费极速通道，不支持参考视频，固定 720P 极速生成",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 4,
          maxDuration: 12,
          defaultDuration: 6,
          resolutions: ["720p"],
          defaultResolution: "720p",
          maxVideos: 0,
        }),
      },
    ],
  },

  // ================= 5. NewToken 5折全套 (官方旗舰) =================
  {
    envFile: "D:\\00\\智影测试api集中\\newtoken中转-key.env",
    channelName: "NewToken Seedance (5折全套·官方旗舰)",
    defaultBaseUrl: "https://www.newtoken.club/v1",
    overrideKey: "sk-WF6RHOpihDQLovjqhgLE99NCkWg8oGI5AWZS4eq4C3srBxDx",
    match: (c) => c.name.includes("5折") || c.name.includes("newtoken-official"),
    models: [
      {
        modelKey: "newtoken-50-sd20-token",
        providerModelKey: "doubao-seedance-2-0-260128",
        displayName: "Seedance 2.0",
        channelLabel: "官方任务 (Token结算·5折)",
        capability: "video",
        protocol: "volcengine-ark-video",
        billingMode: "token",
        unitPriceMicrocredits: 23000000,
        description: "火山原生任务协议，全模态参考生视频，纯 Token 结算，720P",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 4,
          maxDuration: 15,
          defaultDuration: 6,
          resolutions: ["720p"],
          defaultResolution: "720p",
          maxImages: 9,
          maxVideos: 3,
          maxAudios: 3,
        }),
      },
      {
        modelKey: "newtoken-50-sd25-token",
        providerModelKey: "doubao-seedance-2-5-260628",
        displayName: "Seedance 2.5",
        channelLabel: "官方任务 (Token结算·5折)",
        capability: "video",
        protocol: "volcengine-ark-video",
        billingMode: "token",
        unitPriceMicrocredits: 35000000,
        description: "火山原生任务协议，支持最长 30 秒长视频与全模态参考，纯 Token 结算，720P",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 4,
          maxDuration: 30,
          defaultDuration: 10,
          resolutions: ["720p"],
          defaultResolution: "720p",
          maxImages: 9,
          maxVideos: 10,
          maxAudios: 3,
        }),
      },
      {
        modelKey: "newtoken-50-sd20-720p-official",
        providerModelKey: "sd2.0-720p-official",
        displayName: "Seedance 2.0",
        channelLabel: "官方兼容 720P (5折)",
        capability: "video",
        protocol: "seedance-videos-compatible",
        billingMode: "token",
        unitPriceMicrocredits: 23000000,
        description: "OpenAI 兼容 /v1/videos 端点，无参考视频按秒，有参考视频按 Token 二次多退少补",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 4,
          maxDuration: 15,
          defaultDuration: 6,
          resolutions: ["720p"],
          defaultResolution: "720p",
        }),
      },
      {
        modelKey: "newtoken-50-sd20-1080p-official",
        providerModelKey: "sd2.0-1080p-official",
        displayName: "Seedance 2.0",
        channelLabel: "官方兼容 1080P (5折)",
        capability: "video",
        protocol: "seedance-videos-compatible",
        billingMode: "token",
        unitPriceMicrocredits: 25500000,
        description: "OpenAI 兼容 /v1/videos 端点，1080P 高保真高清输出，支持参考视频 Token 结算",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 4,
          maxDuration: 15,
          defaultDuration: 6,
          resolutions: ["1080p"],
          defaultResolution: "1080p",
        }),
      },
      {
        modelKey: "newtoken-50-sd25-720p-official",
        providerModelKey: "sd2.5-720p-official",
        displayName: "Seedance 2.5",
        channelLabel: "官方兼容 720P (5折)",
        capability: "video",
        protocol: "seedance-videos-compatible",
        billingMode: "token",
        unitPriceMicrocredits: 35000000,
        description: "Seedance 2.5 30秒长镜头，OpenAI 兼容 /v1/videos 端点，支持参考视频 Token 结算",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 4,
          maxDuration: 30,
          defaultDuration: 10,
          resolutions: ["720p"],
          defaultResolution: "720p",
        }),
      },
      {
        modelKey: "newtoken-50-sd25-1080p-official",
        providerModelKey: "sd2.5-1080p-official",
        displayName: "Seedance 2.5",
        channelLabel: "官方兼容 1080P (5折)",
        capability: "video",
        protocol: "seedance-videos-compatible",
        billingMode: "token",
        unitPriceMicrocredits: 38500000,
        description: "Seedance 2.5 1080P 旗舰画质，30秒超长连续运镜，支持参考视频 Token 结算",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 4,
          maxDuration: 30,
          defaultDuration: 10,
          resolutions: ["1080p"],
          defaultResolution: "1080p",
        }),
      },
      {
        modelKey: "newtoken-50-video-ultra-720p",
        providerModelKey: "video-ultra-720p",
        displayName: "Seedance 2.0",
        channelLabel: "纯按秒 720P (¥0.05/s)",
        capability: "video",
        protocol: "seedance-videos-compatible",
        billingMode: "per_second",
        unitPriceMicrocredits: 50000,
        description: "纯按秒扣费通道，不支持参考视频，固定 720P 极速生成",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 4,
          maxDuration: 15,
          defaultDuration: 6,
          resolutions: ["720p"],
          defaultResolution: "720p",
          maxVideos: 0,
        }),
      },
      {
        modelKey: "newtoken-50-video-ultra25-720p",
        providerModelKey: "video-ultra2.5-720p",
        displayName: "Seedance 2.5",
        channelLabel: "纯按秒 720P (¥0.06/s)",
        capability: "video",
        protocol: "seedance-videos-compatible",
        billingMode: "per_second",
        unitPriceMicrocredits: 60000,
        description: "纯按秒扣费通道，支持最长 30 秒长视频，不支持参考视频",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 4,
          maxDuration: 30,
          defaultDuration: 10,
          resolutions: ["720p"],
          defaultResolution: "720p",
          maxVideos: 0,
        }),
      },
      {
        modelKey: "newtoken-50-gpt-image2-2k",
        providerModelKey: "gpt-image2-2k",
        displayName: "GPT Image 2",
        channelLabel: "NewToken 2K (5折)",
        capability: "image",
        protocol: "openai-image",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 200000,
        description: "OpenAI 标准同步高清生图，支持 2K 分辨率与参考图",
        capabilityConfig: makeImageCapabilityConfig({
          sizes: ["1024x1024", "2048x2048"],
          defaultSize: "2048x2048",
        }),
      },
      {
        modelKey: "newtoken-50-gpt-image2-4k",
        providerModelKey: "gpt-image2-4k",
        displayName: "GPT Image 2 4K",
        channelLabel: "NewToken 4K (5折)",
        capability: "image",
        protocol: "openai-image",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 350000,
        description: "OpenAI 标准同步超高清生图，支持 4K 分辨率",
        capabilityConfig: makeImageCapabilityConfig({
          sizes: ["2048x2048", "3840x2160"],
          defaultSize: "3840x2160",
          qualities: ["hd"],
          defaultQuality: "hd",
        }),
      },
    ],
  },

  // ================= 6. NewToken 6折全套 (NSFW专属) =================
  {
    envFile: "D:\\00\\智影测试api集中\\newtoken中转-key.env",
    channelName: "NewToken Seedance (6折全套·NSFW专属)",
    defaultBaseUrl: "https://www.newtoken.club/v1",
    overrideKey: "sk-Gel9JkZTXRmSrgKIBE1ztGZ3StL8sJGIkOPnwWB9MnHn0OI0",
    match: (c) => (!c.name.includes("3.6") && c.name.includes("6折")) || c.name.toLowerCase().includes("nsfw"),
    models: [
      {
        modelKey: "newtoken-60-sd20-token",
        providerModelKey: "doubao-seedance-2-0-260128",
        displayName: "Seedance 2.0",
        channelLabel: "官方任务 (Token结算·6折NSFW)",
        capability: "video",
        protocol: "volcengine-ark-video",
        billingMode: "token",
        unitPriceMicrocredits: 27600000,
        description: "火山原生任务协议，NSFW 通道，纯 Token 结算，720P",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 4,
          maxDuration: 15,
          defaultDuration: 6,
          resolutions: ["720p"],
          defaultResolution: "720p",
          maxImages: 9,
          maxVideos: 3,
          maxAudios: 3,
        }),
      },
      {
        modelKey: "newtoken-60-sd25-token",
        providerModelKey: "doubao-seedance-2-5-260628",
        displayName: "Seedance 2.5",
        channelLabel: "官方任务 (Token结算·6折NSFW)",
        capability: "video",
        protocol: "volcengine-ark-video",
        billingMode: "token",
        unitPriceMicrocredits: 42000000,
        description: "火山原生任务协议，NSFW 通道，30 秒长视频，纯 Token 结算",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 4,
          maxDuration: 30,
          defaultDuration: 10,
          resolutions: ["720p"],
          defaultResolution: "720p",
          maxImages: 9,
          maxVideos: 10,
          maxAudios: 3,
        }),
      },
      {
        modelKey: "newtoken-60-sd20-720p-official",
        providerModelKey: "sd2.0-720p-official",
        displayName: "Seedance 2.0",
        channelLabel: "官方兼容 720P (6折NSFW)",
        capability: "video",
        protocol: "seedance-videos-compatible",
        billingMode: "token",
        unitPriceMicrocredits: 27600000,
        description: "OpenAI 兼容端点，NSFW 通道，无视频按秒，有视频按 Token",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 4,
          maxDuration: 15,
          defaultDuration: 6,
          resolutions: ["720p"],
          defaultResolution: "720p",
        }),
      },
      {
        modelKey: "newtoken-60-sd20-1080p-official",
        providerModelKey: "sd2.0-1080p-official",
        displayName: "Seedance 2.0",
        channelLabel: "官方兼容 1080P (6折NSFW)",
        capability: "video",
        protocol: "seedance-videos-compatible",
        billingMode: "token",
        unitPriceMicrocredits: 30600000,
        description: "OpenAI 兼容端点，NSFW 1080P 输出，支持参考视频 Token 结算",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 4,
          maxDuration: 15,
          defaultDuration: 6,
          resolutions: ["1080p"],
          defaultResolution: "1080p",
        }),
      },
      {
        modelKey: "newtoken-60-sd25-720p-official",
        providerModelKey: "sd2.5-720p-official",
        displayName: "Seedance 2.5",
        channelLabel: "官方兼容 720P (6折NSFW)",
        capability: "video",
        protocol: "seedance-videos-compatible",
        billingMode: "token",
        unitPriceMicrocredits: 42000000,
        description: "Seedance 2.5 30秒长镜头，NSFW 通道，支持参考视频 Token 结算",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 4,
          maxDuration: 30,
          defaultDuration: 10,
          resolutions: ["720p"],
          defaultResolution: "720p",
        }),
      },
      {
        modelKey: "newtoken-60-sd25-1080p-official",
        providerModelKey: "sd2.5-1080p-official",
        displayName: "Seedance 2.5",
        channelLabel: "官方兼容 1080P (6折NSFW)",
        capability: "video",
        protocol: "seedance-videos-compatible",
        billingMode: "token",
        unitPriceMicrocredits: 46200000,
        description: "Seedance 2.5 1080P 旗舰画质，30秒连续运镜，NSFW 通道",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 4,
          maxDuration: 30,
          defaultDuration: 10,
          resolutions: ["1080p"],
          defaultResolution: "1080p",
        }),
      },
      {
        modelKey: "newtoken-60-video-ultra-720p",
        providerModelKey: "video-ultra-720p",
        displayName: "Seedance 2.0",
        channelLabel: "纯按秒 720P (¥0.06/s·NSFW)",
        capability: "video",
        protocol: "seedance-videos-compatible",
        billingMode: "per_second",
        unitPriceMicrocredits: 60000,
        description: "纯按秒扣费通道，NSFW 通道，不支持参考视频，720P 极速生成",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 4,
          maxDuration: 15,
          defaultDuration: 6,
          resolutions: ["720p"],
          defaultResolution: "720p",
          maxVideos: 0,
        }),
      },
      {
        modelKey: "newtoken-60-video-ultra25-720p",
        providerModelKey: "video-ultra2.5-720p",
        displayName: "Seedance 2.5",
        channelLabel: "纯按秒 720P (¥0.072/s·NSFW)",
        capability: "video",
        protocol: "seedance-videos-compatible",
        billingMode: "per_second",
        unitPriceMicrocredits: 72000,
        description: "纯按秒扣费通道，NSFW 通道，支持最长 30 秒长视频",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 4,
          maxDuration: 30,
          defaultDuration: 10,
          resolutions: ["720p"],
          defaultResolution: "720p",
          maxVideos: 0,
        }),
      },
      {
        modelKey: "newtoken-60-gpt-image2-2k",
        providerModelKey: "gpt-image2-2k",
        displayName: "GPT Image 2",
        channelLabel: "NewToken 2K (6折NSFW)",
        capability: "image",
        protocol: "openai-image",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 240000,
        description: "OpenAI 标准同步高清生图，NSFW 通道，支持 2K 分辨率",
        capabilityConfig: makeImageCapabilityConfig({
          sizes: ["1024x1024", "2048x2048"],
          defaultSize: "2048x2048",
        }),
      },
      {
        modelKey: "newtoken-60-gpt-image2-4k",
        providerModelKey: "gpt-image2-4k",
        displayName: "GPT Image 2 4K",
        channelLabel: "NewToken 4K (6折NSFW)",
        capability: "image",
        protocol: "openai-image",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 420000,
        description: "OpenAI 标准同步超高清生图，NSFW 通道，支持 4K 分辨率",
        capabilityConfig: makeImageCapabilityConfig({
          sizes: ["2048x2048", "3840x2160"],
          defaultSize: "3840x2160",
          qualities: ["hd"],
          defaultQuality: "hd",
        }),
      },
    ],
  },

  // ================= 7. 恐龙生图 5 大分组 =================
  // 7.1 恐龙生图 (基础质量·通用)
  {
    envFile: "D:\\00\\智影测试api集中\\恐龙中转-key.env",
    channelName: "恐龙生图 (基础质量·通用)",
    defaultBaseUrl: "https://api.klong.lat/v1",
    overrideKey: "sk-oQV7GnpYFFylhp0k9iZkywmDsp0f3ZKlErCJtNVKKr3CSJlc",
    match: (c) => c.name.includes("基础质量") || (c.name.includes("恐龙") && c.name.includes("基础")),
    models: [
      {
        modelKey: "klong-base-gpt-image-2",
        providerModelKey: "gpt-image-2",
        displayName: "GPT Image 2",
        channelLabel: "恐龙基础质量",
        capability: "image",
        protocol: "openai-image",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 150000,
        description: "恐龙 API 基础质量通用通道，所有模型同一个 key",
        capabilityConfig: makeImageCapabilityConfig({
          sizes: ["1024x1024", "2048x2048"],
        }),
      },
    ],
  },
  // 7.2 恐龙生图 (高质量·原生2K/超分4K·Max)
  {
    envFile: "D:\\00\\智影测试api集中\\恐龙中转-key.env",
    channelName: "恐龙生图 (高质量·原生2K/超分4K·Max)",
    defaultBaseUrl: "https://api.klong.lat/v1",
    overrideKey: "sk-DGrhzzmcQ3jpWiQFRUsDr1gn8w5C8JD1cKWv23yRNcoJZjb5",
    match: (c) => c.name.includes("原生2K") || c.name.includes("超分4K") || c.name.includes("2K/超分4K"),
    models: [
      {
        modelKey: "klong-2k-max-gpt-image-2",
        providerModelKey: "gpt-image-2",
        displayName: "GPT Image 2",
        channelLabel: "恐龙原生2K·超分4K Max",
        capability: "image",
        protocol: "openai-image",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 250000,
        description: "高质量 gpt-image-2 专属原生 2K，超分 4K 质量参数支持 max",
        capabilityConfig: makeImageCapabilityConfig({
          sizes: ["2048x2048", "3840x2160"],
          qualities: ["max"],
          defaultSize: "2048x2048",
          defaultQuality: "max",
        }),
      },
    ],
  },
  // 7.3 恐龙生图 (高质量·原生4K·High)
  {
    envFile: "D:\\00\\智影测试api集中\\恐龙中转-key.env",
    channelName: "恐龙生图 (高质量·原生4K·High)",
    defaultBaseUrl: "https://api.klong.lat/v1",
    overrideKey: "sk-8H1wKs4MRqPFjNsiRynW5kmGEvAFqidEXWfZ4zqQCKxYbAEP",
    match: (c) => c.name.includes("原生4K·High") || c.name.includes("原生4K"),
    models: [
      {
        modelKey: "klong-4k-high-gpt-image-2",
        providerModelKey: "gpt-image-2",
        displayName: "GPT Image 2 4K",
        channelLabel: "恐龙原生4K High",
        capability: "image",
        protocol: "openai-image",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 300000,
        description: "高质量 gpt-image-2 专属原生 4K，质量参数支持 high",
        capabilityConfig: makeImageCapabilityConfig({
          sizes: ["3840x2160"],
          qualities: ["high"],
          defaultSize: "3840x2160",
          defaultQuality: "high",
        }),
      },
    ],
  },
  // 7.4 恐龙生图 (官Key全档位·1K/2K/4K)
  {
    envFile: "D:\\00\\智影测试api集中\\恐龙中转-key.env",
    channelName: "恐龙生图 (官Key全档位·1K/2K/4K)",
    defaultBaseUrl: "https://api.klong.lat/v1",
    overrideKey: "sk-1j1kZ5FRJDltH3Zg0j66avtaWcRa4QeUDM5JFF1sntyTzFAQ",
    match: (c) => c.name.includes("官Key") || (c.name.includes("恐龙") && c.name.includes("全档位")) || c.name === "恐龙生图 API",
    models: [
      {
        modelKey: "klong-official-gpt-image-2",
        providerModelKey: "gpt-image-2",
        displayName: "GPT Image 2",
        channelLabel: "恐龙官Key全质量",
        capability: "image",
        protocol: "openai-image",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 200000,
        description: "高质量 gpt-image-2 专属，官 Key 支持 1K/2K/4K，质量参数支持 low, medium, high, xhigh, max",
        capabilityConfig: makeImageCapabilityConfig({
          sizes: ["1024x1024", "2048x2048", "3840x2160"],
          qualities: ["low", "medium", "high", "xhigh", "max"],
        }),
      },
    ],
  },
  // 7.5 恐龙生图 (香蕉2 & 大香蕉 & 4K)
  {
    envFile: "D:\\00\\智影测试api集中\\恐龙中转-key.env",
    channelName: "恐龙生图 (香蕉2 & 大香蕉 & 4K)",
    defaultBaseUrl: "https://api.klong.lat/v1",
    overrideKey: "sk-RkTvQOcJFNTJ4L1DDuCPtFT89TDy44h06no0nKklTvyPQ2n0",
    match: (c) => c.name.includes("香蕉"),
    models: [
      {
        modelKey: "klong-nano-banana-2",
        providerModelKey: "nano-banana-2",
        displayName: "Nano Banana 2",
        channelLabel: "恐龙香蕉2",
        capability: "image",
        protocol: "openai-image",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 250000,
        description: "高质量香蕉 2，支持 1K/2K/4K",
        capabilityConfig: makeImageCapabilityConfig({
          sizes: ["1024x1024", "2048x2048", "3840x2160"],
        }),
      },
      {
        modelKey: "klong-big-banana",
        providerModelKey: "big-banana",
        displayName: "Big Banana",
        channelLabel: "恐龙大香蕉",
        capability: "image",
        protocol: "openai-image",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 250000,
        description: "高质量大香蕉，支持 1K/2K/4K",
        capabilityConfig: makeImageCapabilityConfig({
          sizes: ["1024x1024", "2048x2048", "3840x2160"],
        }),
      },
      {
        modelKey: "klong-banana-gpt-image-2",
        providerModelKey: "gpt-image-2",
        displayName: "GPT Image 2 4K",
        channelLabel: "恐龙香蕉组",
        capability: "image",
        protocol: "openai-image",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 250000,
        description: "香蕉组专属 GPT-Image-2 4K high 通道",
        capabilityConfig: makeImageCapabilityConfig({
          sizes: ["3840x2160"],
          qualities: ["high"],
          defaultSize: "3840x2160",
          defaultQuality: "high",
        }),
      },
    ],
  },

  // ================= 8. 熊猫生图 2 大分组 =================
  // 8.1 熊猫生图 (Adobe 原生 Image 2 4K)
  {
    envFile: "D:\\00\\智影测试api集中\\熊猫中转-key.env",
    channelName: "熊猫生图 (Adobe 原生 Image 2 4K)",
    defaultBaseUrl: "https://api.pandatk.com/v1",
    overrideKey: "sk-d64ce20f8ce21252816535f2e1f4c4a553c427bd655cc486b4bd41582711b26b",
    match: (c) => c.name.includes("Adobe") || (c.name.includes("熊猫") && c.name.includes("原生") && !c.name.includes("官逆")),
    models: [
      {
        modelKey: "panda-adobe-image-2-4k",
        providerModelKey: "image-2-4k",
        displayName: "Image 2 4K",
        channelLabel: "熊猫 Adobe 原生",
        capability: "image",
        protocol: "openai-image",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 350000,
        description: "熊猫中转 Adobe 原生 Image 2 4K 高清生图",
        capabilityConfig: makeImageCapabilityConfig({
          sizes: ["2048x2048", "3840x2160"],
          qualities: ["high"],
          defaultSize: "3840x2160",
          defaultQuality: "high",
        }),
      },
    ],
  },
  // 8.2 熊猫生图 (官逆原生 Image 2.5 4K)
  {
    envFile: "D:\\00\\智影测试api集中\\熊猫中转-key.env",
    channelName: "熊猫生图 (官逆原生 Image 2.5 4K)",
    defaultBaseUrl: "https://api.pandatk.com/v1",
    overrideKey: "sk-b989d6d1615b6acb39a1e0dbb8b846c5f1fe3724eab57ed221b980aa9c8927ce",
    match: (c) => c.name.includes("官逆") || (c.name.includes("熊猫") && c.name.includes("2.5")) || c.name === "熊猫生图 API",
    models: [
      {
        modelKey: "panda-guanni-image-2.5-4k",
        providerModelKey: "image-2.5-1-4k",
        displayName: "Image 2.5 4K",
        channelLabel: "熊猫 官逆原生",
        capability: "image",
        protocol: "openai-image",
        billingMode: "fixed_request",
        unitPriceMicrocredits: 350000,
        description: "熊猫中转官逆原生 Image 2.5 1-4K 高清生图，质量最高到 high",
        capabilityConfig: makeImageCapabilityConfig({
          sizes: ["2048x2048", "3840x2160"],
          qualities: ["high"],
          defaultSize: "3840x2160",
          defaultQuality: "high",
        }),
      },
    ],
  },

  // ================= 9. DMC (MiniMax-H3) =================
  {
    envFile: "D:\\00\\智影测试api集中\\DMC-minimax-h3-key.env",
    channelName: "DMC (MiniMax H3)",
    defaultBaseUrl: "https://dmc.cc",
    match: (c) => c.name.includes("DMC") || c.baseUrl.includes("dmc.cc"),
    models: [
      {
        modelKey: "dmc-minimax-h3",
        providerModelKey: "MiniMax-H3",
        displayName: "MiniMax-H3",
        channelLabel: "MiniMax-H3-满血",
        capability: "video",
        protocol: "dmc-h3",
        billingMode: "per_second",
        unitPriceMicrocredits: 60000,
        description: "DMC MiniMax H3 异步视频生成，支持 768P、1–15秒、首尾帧/多模态参考，每秒 ¥0.06",
        capabilityConfig: makeVideoCapabilityConfig({
          durationSelection: "range",
          minDuration: 1,
          maxDuration: 15,
          defaultDuration: 5,
          resolutions: ["768P"],
          defaultResolution: "768P",
          ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"],
          defaultRatio: "16:9",
          operations: ["text_to_video", "image_to_video", "reference_to_video"],
          defaultOperation: "text_to_video",
          promptMaxChars: 7000,
          maxImages: 9,
          maxVideos: 3,
          maxAudios: 3,
          generateAudio: false,
        }),
      },
    ],
  },
];

async function backupCurrentModelLabels() {
  try {
    const listRes = await apiRequest("GET", "/api/admin/channels?page=1&pageSize=100");
    const channels = listRes.data?.data?.channels || [];
    const snapshot = [];

    for (const ch of channels) {
      const modelsRes = await apiRequest("GET", `/api/admin/channels/${ch.id}/models`);
      const models = modelsRes.data?.data?.models || [];
      for (const m of models) {
        snapshot.push({
          channelId: ch.id,
          channelName: ch.name,
          modelId: m.id,
          modelKey: m.modelKey,
          providerModelKey: m.providerModelKey,
          displayName: m.displayName,
          channelLabel: m.channelLabel,
          description: m.description,
          billingMode: m.billingMode,
          unitPriceMicrocredits: m.unitPriceMicrocredits,
          priceConfigured: m.priceConfigured,
          enabled: m.enabled,
        });
      }
    }

    if (snapshot.length > 0) {
      // 兼容直接在 media-lab 目录或根目录下执行
      const backupDir = path.resolve(
        process.cwd(),
        fs.existsSync(path.resolve(process.cwd(), "workspace-data"))
          ? "workspace-data/runtime/media-lab/backups"
          : "../workspace-data/runtime/media-lab/backups"
      );
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupFile = path.join(backupDir, `model_labels_backup_${timestamp}.json`);
      fs.writeFileSync(backupFile, JSON.stringify(snapshot, null, 2), "utf-8");
      console.log(`[Backup] 成功创建渠道模型元数据自动快照: ${backupFile} (共 ${snapshot.length} 个模型)`);
    }
  } catch (err) {
    console.warn(`[Backup] 自动快照记录提示 (不阻断主流程):`, err.message);
  }
}

async function main() {
  const force = process.argv.includes("--force") || process.argv.includes("-f");

  console.log("==================================================");
  console.log("智影测试渠道批量同步工具 (Non-Destructive Sync)");
  if (force) {
    console.log("模式: 【强制重置模式 (--force)】- 将全量覆写已有名称与标签");
  } else {
    console.log("模式: 【无损保护模式 (默认)】");
    console.log("  * [渠道名称]: 优先保留已有自定义渠道名，不强制覆写");
    console.log("  * [一级目录]: 优先保留已有模型展示名 (displayName)");
    console.log("  * [二级目录]: 优先保留已有渠道标签 (channelLabel)，空值则智能补全");
    console.log("  * [计费配置]: 优先保留已有计费模式与配置价格");
  }
  console.log("==================================================\n");

  // 1. 运行前自动创建冷备份快照
  await backupCurrentModelLabels();

  const listRes = await apiRequest("GET", "/api/admin/channels?page=1&pageSize=100");
  const existingChannels = listRes.data?.data?.channels || [];

  const claimedChannelIds = new Set();

  for (const cfg of channelConfigs) {
    let key = cfg.overrideKey;
    let baseUrl = cfg.defaultBaseUrl;

    if (!key) {
      const parsed = parseEnvFile(cfg.envFile);
      key = parsed.OPENAI_API_KEY || parsed.API_KEY || "";
      if (parsed.OPENAI_BASE_URL) baseUrl = parsed.OPENAI_BASE_URL;
    }

    if (!key) {
      console.warn(`[Skip] 无法从 ${cfg.envFile} 解析到有效 API Key，跳过 ${cfg.channelName}`);
      continue;
    }

    console.log(`\n--------------------------------------------------`);
    console.log(`[Channel] 处理渠道: ${cfg.channelName}`);
    console.log(` - BaseUrl: ${baseUrl}`);
    console.log(` - Key: ${key.slice(0, 6)}...${key.slice(-4)}`);

    let targetChannel = existingChannels.find((c) => !claimedChannelIds.has(c.id) && cfg.match(c));

    if (targetChannel) {
      claimedChannelIds.add(targetChannel.id);
      const channelName = (!force && targetChannel.name && targetChannel.name.trim())
        ? targetChannel.name.trim()
        : cfg.channelName;
      console.log(` -> 发现已有渠道 (ID: ${targetChannel.id}, Name: "${channelName}")，更新凭据...`);
      const updateRes = await apiRequest("PATCH", `/api/admin/channels/${targetChannel.id}`, {
        name: channelName,
        baseUrl: baseUrl,
        apiKey: key,
        enabled: targetChannel.enabled !== undefined ? targetChannel.enabled : true,
      });
      if (updateRes.data?.code !== 0) {
        console.error(`更新渠道失败:`, updateRes.data);
        continue;
      }
    } else {
      console.log(` -> 创建新系统渠道: ${cfg.channelName}...`);
      const createRes = await apiRequest("POST", "/api/admin/channels", {
        name: cfg.channelName,
        baseUrl: baseUrl,
        apiKey: key,
        enabled: true,
      });
      if (createRes.data?.code !== 0) {
        console.error(`创建渠道失败:`, createRes.data);
        continue;
      }
      targetChannel = createRes.data?.data?.channel;
      claimedChannelIds.add(targetChannel.id);
    }

    // 同步渠道模型
    console.log(` -> 检查并同步 ${cfg.models.length} 个渠道模型...`);
    const modelsRes = await apiRequest("GET", `/api/admin/channels/${targetChannel.id}/models`);
    const existingModels = modelsRes.data?.data?.models || [];

    for (const m of cfg.models) {
      // 必须严格按 modelKey 比对，严禁根据 providerModelKey 模糊匹配，防止多规格模型误匹配覆写
      const existing = existingModels.find((em) => em.modelKey === m.modelKey);
      if (existing) {
        // 无损保护策略
        const displayName = (!force && existing.displayName && existing.displayName.trim())
          ? existing.displayName.trim()
          : (m.displayName || m.modelKey);

        const channelLabel = (!force && existing.channelLabel && existing.channelLabel.trim())
          ? existing.channelLabel.trim()
          : (m.channelLabel || "");

        const description = (!force && existing.description && existing.description.trim())
          ? existing.description.trim()
          : (m.description || "");

        const billingMode = (!force && existing.billingMode) ? existing.billingMode : m.billingMode;
        const unitPriceMicrocredits = (!force && existing.priceConfigured && existing.unitPriceMicrocredits !== undefined && existing.unitPriceMicrocredits !== null)
          ? existing.unitPriceMicrocredits
          : m.unitPriceMicrocredits;

        const payload = {
          ...m,
          displayName,
          channelLabel,
          description,
          billingMode,
          unitPriceMicrocredits,
          priceConfigured: existing.priceConfigured !== undefined ? existing.priceConfigured : true,
          enabled: existing.enabled !== undefined ? existing.enabled : true,
        };

        const tag = force ? "[强制覆写]" : "[无损保护]";
        console.log(`   * ${tag} 模型: ${m.modelKey} | 一级: "${payload.displayName}" | 二级: "${payload.channelLabel}" (ID: ${existing.id})`);
        const res = await apiRequest("PATCH", `/api/admin/channels/${targetChannel.id}/models/${existing.id}`, payload);
        if (res.data?.code !== 0) {
          console.error(`     更新失败:`, res.data);
        }
      } else {
        const payload = {
          ...m,
          displayName: m.displayName || m.modelKey,
          channelLabel: m.channelLabel || "",
          priceConfigured: true,
          enabled: true,
        };
        console.log(`   + [新建模型] 模型: ${m.modelKey} | 一级: "${payload.displayName}" | 二级: "${payload.channelLabel}"`);
        const res = await apiRequest("POST", `/api/admin/channels/${targetChannel.id}/models`, payload);
        if (res.data?.code !== 0) {
          console.error(`     创建失败:`, res.data);
        }
      }
    }
  }

  console.log("\n==================================================");
  console.log("✓ 全部测试渠道与多分组模型配置批量同步完成！");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("执行出错:", err);
  process.exit(1);
});
