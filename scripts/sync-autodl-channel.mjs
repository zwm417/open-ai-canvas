import fs from "fs";
import http from "http";
import path from "path";

// 默认读取用户指定的外部密钥配置文件（支持命令行参数传入不同路径）
const defaultEnvPath = process.argv[2] || "D:\\00\\智影测试api集中\\autodl中转-key.env";
const backendBaseUrl = process.env.APP_BACKEND_URL || "http://127.0.0.1:8080";
const sessionCookie = process.env.ADMIN_SESSION_COOKIE || "open_ai_canvas_session=test_admin_session.testtoken123456789012345678901234";

let apiKey = "";
let baseUrl = "https://autodl.art";

if (fs.existsSync(defaultEnvPath)) {
  const content = fs.readFileSync(defaultEnvPath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    line = line.trim();
    if (line.startsWith("OPENAI_API_KEY=")) {
      apiKey = line.substring("OPENAI_API_KEY=".length).trim();
    } else if (line.startsWith("post=")) {
      const urlStr = line.substring("post=".length).trim();
      try {
        const u = new URL(urlStr);
        baseUrl = u.origin;
      } catch (_) {}
    }
  });
} else {
  console.warn(`[Warn] 配置文件不存在: ${defaultEnvPath}，尝试从环境变量读取凭据`);
  apiKey = process.env.AUTODL_API_KEY || "";
  baseUrl = process.env.AUTODL_BASE_URL || "https://autodl.art";
}

if (!apiKey) {
  console.error("[Error] 未获取到有效 API Key (OPENAI_API_KEY / AUTODL_API_KEY)");
  console.error("请确认文件路径正确，或通过环境变量注入 AUTODL_API_KEY");
  process.exit(1);
}

console.log(`[Config] 动态加载配置成功:`);
console.log(` - 基础 API 地址: ${baseUrl}`);
console.log(` - API Key 长度: ${apiKey.length} 位 (预览: ${apiKey.slice(0, 6)}...${apiKey.slice(-4)})`);

function apiRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(backendBaseUrl);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 80,
        path: urlPath,
        method: method,
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (_) {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function makeVideoCapabilityConfig(cfg = {}) {
  const resolutions = cfg.resolutions || ["720p", "1080p"];
  const operations = cfg.operations || ["text_to_video", "image_to_video"];
  const defaultOperation = cfg.defaultOperation || (operations.includes("text_to_video") ? "text_to_video" : operations[0]);

  let duration;
  if (cfg.durationRange || cfg.selection === "range" || cfg.minDuration !== undefined) {
    const range = cfg.durationRange || {};
    const min = range.min ?? cfg.minDuration ?? 1;
    const max = range.max ?? cfg.maxDuration ?? 15;
    const step = range.step ?? cfg.step ?? 1;
    const defaultSec = cfg.defaultDuration || range.default || min || 5;
    duration = {
      default: defaultSec,
      selection: "range",
      min: min,
      max: max,
      step: step,
    };
  } else {
    const durations = cfg.durations || [5, 10, 15];
    duration = {
      default: cfg.defaultDuration || durations[0],
      selection: "enum",
      values: durations,
    };
  }

  return {
    version: 1,
    video: {
      defaultOperation: defaultOperation,
      defaultRatio: cfg.defaultRatio || (cfg.ratios ? cfg.ratios[0] : "9:16"),
      defaultResolution: cfg.defaultResolution || resolutions[0],
      duration: duration,
      generateAudio: {
        default: cfg.defaultGenerateAudio !== undefined ? cfg.defaultGenerateAudio : (cfg.generateAudio ?? false),
        supported: cfg.generateAudio ?? false,
      },
      operations: operations,
      ratios: cfg.ratios || ["9:16", "16:9", "1:1"],
      references: {
        maxAudioBytes: 15728640,
        maxAudioDurationSeconds: 15,
        maxAudios: cfg.maxAudios ?? 0,
        maxImageBytes: 31457280,
        maxImages: cfg.maxImages ?? 10,
        maxVideoBytes: 31457280,
        maxVideoDurationSeconds: 15,
        maxVideos: cfg.maxVideos ?? 0,
        minImages: cfg.minImages ?? 0,
        promptMaxChars: cfg.promptMaxChars || 10000,
      },
      resolutions: resolutions,
      watermark: {
        default: false,
        supported: false,
      },
    },
  };
}

/**
 * 权威 14 大 AutoDL ComfyUI 工作流模型定义清单
 * 价格单位：微信用点 (Microcredits，1 credit = 1,000,000 microcredits = 1 元人民币)
 * 全部按秒计费 (billingMode: "per_second")
 * 严格完全对齐本地官方文档：docs/01-api配置/08-autodl生视频h3/具体工作流参数
 */
const targetModels = [
  // ==================== 1. 文生视频 (3个，无音频，纯文生) ====================
  {
    modelKey: "autodl-minimax-h3-b99-001",
    providerModelKey: "minimax_h3_b99_001",
    displayName: "AutoDL H3 文生视频 (b99_001)",
    capability: "video",
    protocol: "autodl-comfyui",
    billingMode: "per_second",
    unitPriceMicrocredits: 50000, // 0.050/s
    priceConfigured: true,
    description: "MiniMax H3 文生视频，支持 736p，1~15秒时长",
    capabilityConfig: makeVideoCapabilityConfig({
      durationRange: { min: 1, max: 15, default: 5 },
      resolutions: ["736p竖", "736p横", "736p(1:1)"],
      defaultResolution: "736p竖",
      ratios: ["9:16", "16:9", "1:1"],
      operations: ["text_to_video"],
      minImages: 0,
      maxImages: 0,
      generateAudio: false,
      maxAudios: 0,
    }),
  },
  {
    modelKey: "autodl-minimax-h3-lightx2v-no-pic",
    providerModelKey: "minimax_h3_lightx2v_no_pic",
    displayName: "AutoDL H3 文生视频 (lightx2v)",
    capability: "video",
    protocol: "autodl-comfyui",
    billingMode: "per_second",
    unitPriceMicrocredits: 40000, // 480p: 0.030/s, 768p: 0.040/s
    priceConfigured: true,
    description: "MiniMax H3 轻量文生视频工作流，支持 480p/768p，1~15秒",
    capabilityConfig: makeVideoCapabilityConfig({
      durationRange: { min: 1, max: 15, default: 5 },
      resolutions: ["480p竖", "768p竖", "480p横", "768p横", "480p(1:1)", "768p(1:1)"],
      defaultResolution: "768p竖",
      ratios: ["9:16", "16:9", "1:1"],
      operations: ["text_to_video"],
      minImages: 0,
      maxImages: 0,
      generateAudio: false,
      maxAudios: 0,
    }),
  },
  {
    modelKey: "autodl-minimax-h3-z0901",
    providerModelKey: "minimax_h3_z0901",
    displayName: "AutoDL H3 文生视频 (高质量创意直出)",
    capability: "video",
    protocol: "autodl-comfyui",
    billingMode: "per_second",
    unitPriceMicrocredits: 70000, // 768p: 0.070/s, 1088p: 0.070/s, 1440p: 0.080/s
    priceConfigured: true,
    description: "MiniMax H3 高质量文生视频直出，支持 480p~1440p，一次采样高稳定性",
    capabilityConfig: makeVideoCapabilityConfig({
      durationRange: { min: 1, max: 15, default: 5 },
      resolutions: [
        "480p竖(480*864)",
        "480p横(864*480)",
        "768p竖(768*1376)",
        "768p横(1376*768)",
        "1088p竖(1088*1920)",
        "1088p横(1920*1088)",
        "1440p竖(1440*2560)",
        "1440p横(2560*1440)",
      ],
      defaultResolution: "768p竖(768*1376)",
      ratios: ["9:16", "16:9"],
      operations: ["text_to_video"],
      minImages: 0,
      maxImages: 0,
      generateAudio: false,
      maxAudios: 0,
    }),
  },

  // ==================== 2. 首尾帧生视频 (2个，严格2张图，无音频) ====================
  {
    modelKey: "autodl-minimax-h3-b99-002",
    providerModelKey: "minimax_h3_b99_002",
    displayName: "AutoDL H3 首尾帧生视频 (b99_002)",
    capability: "video",
    protocol: "autodl-comfyui",
    billingMode: "per_second",
    unitPriceMicrocredits: 50000, // 0.050/s
    priceConfigured: true,
    description: "MiniMax H3 首尾帧生视频，必须传入 2 张图片（首帧+尾帧），736p，1~15秒",
    capabilityConfig: makeVideoCapabilityConfig({
      durationRange: { min: 1, max: 15, default: 5 },
      resolutions: ["736p竖", "736p横", "736p(1:1)"],
      defaultResolution: "736p竖",
      ratios: ["9:16", "16:9", "1:1"],
      operations: ["image_to_video"],
      minImages: 2,
      maxImages: 2,
      generateAudio: false,
      maxAudios: 0,
    }),
  },
  {
    modelKey: "autodl-minimax-h3-lightx2v",
    providerModelKey: "minimax_h3_lightx2v",
    displayName: "AutoDL H3 首尾帧生视频 (lightx2v)",
    capability: "video",
    protocol: "autodl-comfyui",
    billingMode: "per_second",
    unitPriceMicrocredits: 40000, // 480p: 0.030/s, 768p: 0.040/s
    priceConfigured: true,
    description: "MiniMax H3 首尾帧生视频，必须传入 2 张图片（首帧+尾帧），480p/768p，1~10秒",
    capabilityConfig: makeVideoCapabilityConfig({
      durationRange: { min: 1, max: 10, default: 5 }, // 文档严格限制 1-10 秒
      resolutions: ["480p竖", "768p竖", "480p横", "768p横", "480p(1:1)", "768p(1:1)"],
      defaultResolution: "768p竖",
      ratios: ["9:16", "16:9", "1:1"],
      operations: ["image_to_video"],
      minImages: 2,
      maxImages: 2,
      generateAudio: false,
      maxAudios: 0,
    }),
  },

  // ==================== 3. 多图参考生视频 (4个，1~9张参考图，无音频) ====================
  {
    modelKey: "autodl-minimax-h3-lightx2v-v5",
    providerModelKey: "minimax_h3_lightx2v_v5",
    displayName: "AutoDL H3 多图参考生视频 (v5)",
    capability: "video",
    protocol: "autodl-comfyui",
    billingMode: "per_second",
    unitPriceMicrocredits: 40000, // 480p: 0.030/s, 768p: 0.040/s
    priceConfigured: true,
    description: "MiniMax H3 多图参考生视频，支持 1~9 张参考图，480p/768p/1080p，1~10秒",
    capabilityConfig: makeVideoCapabilityConfig({
      durationRange: { min: 1, max: 10, default: 5 }, // 文档严格限制 1-10 秒
      resolutions: ["480p竖", "768p竖", "1080p竖", "480p横", "768p横", "1080p横", "480p(1:1)", "768p(1:1)", "1080p(1:1)"],
      defaultResolution: "768p竖",
      ratios: ["9:16", "16:9", "1:1"],
      operations: ["image_to_video"],
      minImages: 1,
      maxImages: 9,
      generateAudio: false,
      maxAudios: 0,
    }),
  },
  {
    modelKey: "autodl-minimax-h3-lightx2v-v5-15s",
    providerModelKey: "minimax_h3_lightx2v_v5_15s",
    displayName: "AutoDL H3 多图参考生视频 (15秒)",
    capability: "video",
    protocol: "autodl-comfyui",
    billingMode: "per_second",
    unitPriceMicrocredits: 40000, // 480p: 0.030/s, 768p: 0.040/s
    priceConfigured: true,
    description: "MiniMax H3 多图参考生视频，支持 1~9 张参考图，480p/768p，1~15秒",
    capabilityConfig: makeVideoCapabilityConfig({
      durationRange: { min: 1, max: 15, default: 5 },
      resolutions: ["480p竖", "768p竖", "480p横", "768p横", "480p(1:1)", "768p(1:1)"],
      defaultResolution: "768p竖",
      ratios: ["9:16", "16:9", "1:1"],
      operations: ["image_to_video"],
      minImages: 1,
      maxImages: 9,
      generateAudio: false,
      maxAudios: 0,
    }),
  },
  {
    modelKey: "autodl-minimax-h3-b99-003-12s",
    providerModelKey: "minimax_h3_b99_003_12s",
    displayName: "AutoDL H3 多图参考生视频 (12秒)",
    capability: "video",
    protocol: "autodl-comfyui",
    billingMode: "per_second",
    unitPriceMicrocredits: 50000, // 736p: 0.050/s
    priceConfigured: true,
    description: "MiniMax H3 多图参考生视频，支持 1~9 张参考图，736p，1~12秒",
    capabilityConfig: makeVideoCapabilityConfig({
      durationRange: { min: 1, max: 12, default: 5 }, // 文档严格限制 1-12 秒
      resolutions: ["736p竖", "736p横", "736p(1:1)"],
      defaultResolution: "736p竖",
      ratios: ["9:16", "16:9", "1:1"],
      operations: ["image_to_video"],
      minImages: 1,
      maxImages: 9,
      generateAudio: false,
      maxAudios: 0,
    }),
  },
  {
    modelKey: "autodl-minimax-h3-z0902",
    providerModelKey: "minimax_h3_z0902",
    displayName: "AutoDL H3 六图生视频 (多图一致性创作)",
    capability: "video",
    protocol: "autodl-comfyui",
    billingMode: "per_second",
    unitPriceMicrocredits: 70000, // 768p: 0.070/s, 1088p: 0.070/s, 1440p: 0.080/s
    priceConfigured: true,
    description: "MiniMax H3 六图生视频，支持最多 6 张参考图，480p~1440p，1~15秒",
    capabilityConfig: makeVideoCapabilityConfig({
      durationRange: { min: 1, max: 15, default: 5 },
      resolutions: [
        "480p竖(480*864)",
        "480p横(864*480)",
        "768p竖(768*1376)",
        "768p横(1376*768)",
        "1088p竖(1088*1920)",
        "1088p横(1920*1088)",
        "1440p竖(1440*2560)",
        "1440p横(2560*1440)",
      ],
      defaultResolution: "768p竖(768*1376)",
      ratios: ["9:16", "16:9"],
      operations: ["image_to_video"],
      minImages: 1,
      maxImages: 6,
      generateAudio: false,
      maxAudios: 0,
    }),
  },

  // ==================== 4. 多图多音频生视频 (5个，含音频多模态) ====================
  {
    modelKey: "autodl-minimax-h3-image-audio-v2",
    providerModelKey: "minimax_h3_image_audio_to_video_v2",
    displayName: "AutoDL H3 多图多音频生视频",
    capability: "video",
    protocol: "autodl-comfyui",
    billingMode: "per_second",
    unitPriceMicrocredits: 40000, // 480p: 0.030/s, 768p: 0.040/s
    priceConfigured: true,
    description: "MiniMax H3 多图多音频生视频，支持最多 9 图 3 音频，480p/768p/1080p，1~10秒",
    capabilityConfig: makeVideoCapabilityConfig({
      durationRange: { min: 1, max: 10, default: 5 }, // 文档严格限制 1-10 秒
      resolutions: ["480p竖", "768p竖", "1080p竖", "480p横", "768p横", "1080p横"],
      defaultResolution: "768p竖",
      ratios: ["9:16", "16:9"],
      operations: ["image_to_video", "text_to_video"],
      minImages: 0,
      maxImages: 9,
      maxAudios: 3,
      generateAudio: true,
      defaultGenerateAudio: true,
    }),
  },
  {
    modelKey: "autodl-minimax-h3-image-audio-v2-15s",
    providerModelKey: "minimax_h3_image_audio_to_video_v2_15s",
    displayName: "AutoDL H3 多图多音频生视频 (15秒)",
    capability: "video",
    protocol: "autodl-comfyui",
    billingMode: "per_second",
    unitPriceMicrocredits: 40000, // 480p: 0.030/s, 768p: 0.040/s
    priceConfigured: true,
    description: "MiniMax H3 多图多音频生视频，支持最多 9 图 3 音频，480p/768p，1~15秒",
    capabilityConfig: makeVideoCapabilityConfig({
      durationRange: { min: 1, max: 15, default: 5 },
      resolutions: ["480p竖", "768p竖", "480p横", "768p横"],
      defaultResolution: "768p竖",
      ratios: ["9:16", "16:9"],
      operations: ["image_to_video", "text_to_video"],
      minImages: 0,
      maxImages: 9,
      maxAudios: 3,
      generateAudio: true,
      defaultGenerateAudio: true,
    }),
  },
  {
    modelKey: "autodl-minimax-h3-zm-u08",
    providerModelKey: "minimax_h3_zm_u08",
    displayName: "AutoDL H3 多图多音频生视频 (高速版)",
    capability: "video",
    protocol: "autodl-comfyui",
    billingMode: "per_second",
    unitPriceMicrocredits: 40000, // 480p: 0.030/s, 768p: 0.040/s
    priceConfigured: true,
    description: "MiniMax H3 多图多音频生视频高速版，支持最多 9 图 3 音频，480p/768p，1~15秒",
    capabilityConfig: makeVideoCapabilityConfig({
      durationRange: { min: 1, max: 15, default: 5 },
      resolutions: ["480p竖", "768p竖", "480p横", "768p横", "480p(1:1)", "768p(1:1)"],
      defaultResolution: "768p竖",
      ratios: ["9:16", "16:9", "1:1"],
      operations: ["image_to_video", "text_to_video"],
      minImages: 1, // 文档明确标明 ref_image_0 必填
      maxImages: 9,
      maxAudios: 3,
      generateAudio: true,
      defaultGenerateAudio: true,
    }),
  },
  {
    modelKey: "autodl-minimax-h3-zm-u24",
    providerModelKey: "minimax_h3_zm_u24",
    displayName: "AutoDL H3 多图多音频生视频 (升级画质)",
    capability: "video",
    protocol: "autodl-comfyui",
    billingMode: "per_second",
    unitPriceMicrocredits: 40000, // 480p: 0.030/s, 768p: 0.040/s
    priceConfigured: true,
    description: "MiniMax H3 多图多音频生视频升级画质，支持最多 9 图 3 音频，480p/768p，1~15秒",
    capabilityConfig: makeVideoCapabilityConfig({
      durationRange: { min: 1, max: 15, default: 5 },
      resolutions: ["480p竖", "768p竖", "480p横", "768p横", "480p(1:1)", "768p(1:1)"],
      defaultResolution: "768p竖",
      ratios: ["9:16", "16:9", "1:1"],
      operations: ["image_to_video", "text_to_video"],
      minImages: 1, // 文档明确标明 ref_image_0 必填
      maxImages: 9,
      maxAudios: 3,
      generateAudio: true,
      defaultGenerateAudio: true,
    }),
  },
  {
    modelKey: "autodl-minimax-h3-z0903",
    providerModelKey: "minimax_h3_z0903",
    displayName: "AutoDL H3 六图三音频生视频 (高质量音画融合)",
    capability: "video",
    protocol: "autodl-comfyui",
    billingMode: "per_second",
    unitPriceMicrocredits: 70000, // 768p: 0.070/s, 1088p: 0.070/s, 1440p: 0.080/s
    priceConfigured: true,
    description: "MiniMax H3 六图三音频高质量音画融合，支持 6 图 3 音频，480p~1440p，1~15秒",
    capabilityConfig: makeVideoCapabilityConfig({
      durationRange: { min: 1, max: 15, default: 5 },
      resolutions: [
        "480p竖(480*864)",
        "480p横(864*480)",
        "768p竖(768*1376)",
        "768p横(1376*768)",
        "1088p竖(1088*1920)",
        "1088p横(1920*1088)",
        "1440p竖(1440*2560)",
        "1440p横(2560*1440)",
      ],
      defaultResolution: "768p竖(768*1376)",
      ratios: ["9:16", "16:9"],
      operations: ["image_to_video", "text_to_video"],
      minImages: 1, // 文档明确标明 ref_image_0 必填
      maxImages: 6,
      maxAudios: 3,
      generateAudio: true,
      defaultGenerateAudio: true,
    }),
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

async function syncAutoDLChannel() {
  await backupCurrentModelLabels();

  console.log(`\n[1/3] 正在查询系统渠道...`);
  const listRes = await apiRequest("GET", "/api/admin/channels?page=1&pageSize=100");
  const channels = listRes.data?.data?.channels || [];
  let autodlChannel = channels.find((c) => c.name.toLowerCase().includes("autodl") || c.baseUrl.includes("autodl.art"));

  if (autodlChannel) {
    console.log(` -> 发现已存在 AutoDL 渠道 (ID: ${autodlChannel.id}, Name: ${autodlChannel.name})，正在同步更新凭据...`);
    const updateRes = await apiRequest("PATCH", `/api/admin/channels/${autodlChannel.id}`, {
      name: autodlChannel.name || "AutoDL ComfyUI",
      baseUrl: baseUrl,
      apiKey: apiKey,
      enabled: true,
    });
    if (updateRes.data?.code !== 0) {
      throw new Error(`更新渠道失败: ${JSON.stringify(updateRes.data)}`);
    }
    console.log(` -> 渠道配置更新成功！`);
  } else {
    console.log(` -> 未找到 AutoDL 渠道，正在创建系统渠道...`);
    const createRes = await apiRequest("POST", "/api/admin/channels", {
      name: "AutoDL ComfyUI",
      baseUrl: baseUrl,
      apiKey: apiKey,
      enabled: true,
    });
    if (createRes.data?.code !== 0) {
      throw new Error(`创建渠道失败: ${JSON.stringify(createRes.data)}`);
    }
    autodlChannel = createRes.data?.data?.channel;
    console.log(` -> 渠道创建成功！ID: ${autodlChannel.id}`);
  }

  console.log(`\n[2/3] 正在检查并同步全套 14 个 AutoDL 渠道模型配置...`);
  const modelsRes = await apiRequest("GET", `/api/admin/channels/${autodlChannel.id}/models`);
  const existingModels = modelsRes.data?.data?.models || [];

  const channelModelIds = {};
  for (const m of targetModels) {
    // 严格按 modelKey 精准比对，杜绝 providerModelKey 模糊匹配覆写
    const existing = existingModels.find((em) => em.modelKey === m.modelKey);
    if (existing) {
      const displayName = (existing.displayName && existing.displayName.trim())
        ? existing.displayName.trim()
        : (m.displayName || m.modelKey);

      const channelLabel = (existing.channelLabel && existing.channelLabel.trim())
        ? existing.channelLabel.trim()
        : (m.channelLabel || "AutoDL ComfyUI");

      const description = (existing.description && existing.description.trim())
        ? existing.description.trim()
        : (m.description || "");

      const billingMode = existing.billingMode || m.billingMode;
      const unitPriceMicrocredits = (existing.priceConfigured && existing.unitPriceMicrocredits !== undefined && existing.unitPriceMicrocredits !== null)
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

      console.log(` -> [无损保护] 更新现有渠道模型: ${m.modelKey} | 一级: "${payload.displayName}" | 二级: "${payload.channelLabel}" (ID: ${existing.id})`);
      const res = await apiRequest("PATCH", `/api/admin/channels/${autodlChannel.id}/models/${existing.id}`, payload);
      if (res.data?.code !== 0) {
        console.error(`     更新失败:`, res.data);
      }
      channelModelIds[m.modelKey] = existing.id;
    } else {
      const payload = {
        ...m,
        channelLabel: m.channelLabel || "AutoDL ComfyUI",
        priceConfigured: true,
        enabled: true,
      };
      console.log(` -> 创建新渠道模型: ${m.modelKey} (${payload.displayName})`);
      const res = await apiRequest("POST", `/api/admin/channels/${autodlChannel.id}/models`, payload);
      if (res.data?.code !== 0) {
        console.error(`     创建失败:`, res.data);
      } else {
        channelModelIds[m.modelKey] = res.data?.data?.model?.id;
      }
    }
  }

  console.log(`\n[3/3] 正在同步智能模型路由 (Logical Model Router)...`);
  const logicalList = await apiRequest("GET", "/api/admin/logical-models?page=1&pageSize=100");
  const logicalModels = logicalList.data?.data?.models || [];
  const existingLogical = logicalModels.find((lm) => lm.code === "autodl-minimax-h3");

  const logicalMutation = {
    code: "autodl-minimax-h3",
    name: "AutoDL MiniMax H3 智能视频",
    icon: "film",
    description: "AutoDL.Art MiniMax H3 智能分流：纯文本走文生，多图走多图参考；2张图时支持首尾帧/多图参考；含音频自动走音画融合",
    capability: "video",
    enabled: true,
    sortOrder: 10,
    pricePolicy: "unified",
    billingMode: "per_second",
    unitPriceMicrocredits: 40000,
    inputPriceMicrocredits: 0,
    outputPriceMicrocredits: 0,
    cachedPriceMicrocredits: 0,
    capabilitySpec: {
      version: 1,
      capability: "video",
      operations: ["text_to_video", "image_to_video"],
      inputs: {
        image: { min: 0, max: 9 },
        video: { min: 0, max: 0 },
        audio: { min: 0, max: 3 },
      },
      options: {
        videoSeconds: { min: 1, max: 15, step: 1 },
        vquality: { values: ["480p", "736p", "768p", "1080p"] },
        size: { values: ["16:9", "9:16", "1:1"] },
        videoGenerateAudio: { values: [true, false] },
      },
    },
    defaultOptions: {
      videoSeconds: 5,
      vquality: "768p",
      size: "16:9",
      videoGenerateAudio: false,
    },
    routes: [
      // 1. 文生视频路由 (输入 0 图，按优先级候选)
      { channelModelId: channelModelIds["autodl-minimax-h3-z0901"], enabled: true, priority: 100, weight: 100 },
      { channelModelId: channelModelIds["autodl-minimax-h3-lightx2v-no-pic"], enabled: true, priority: 90, weight: 100 },
      { channelModelId: channelModelIds["autodl-minimax-h3-b99-001"], enabled: true, priority: 80, weight: 100 },

      // 2. 首尾帧生视频路由 (输入恰好 2 图)
      { channelModelId: channelModelIds["autodl-minimax-h3-lightx2v"], enabled: true, priority: 100, weight: 100 },
      { channelModelId: channelModelIds["autodl-minimax-h3-b99-002"], enabled: true, priority: 90, weight: 100 },

      // 3. 多图参考生视频路由 (输入 1~9 图)
      { channelModelId: channelModelIds["autodl-minimax-h3-lightx2v-v5"], enabled: true, priority: 100, weight: 100 },
      { channelModelId: channelModelIds["autodl-minimax-h3-lightx2v-v5-15s"], enabled: true, priority: 95, weight: 100 },
      { channelModelId: channelModelIds["autodl-minimax-h3-z0902"], enabled: true, priority: 90, weight: 100 },
      { channelModelId: channelModelIds["autodl-minimax-h3-b99-003-12s"], enabled: true, priority: 80, weight: 100 },

      // 4. 多图多音频生视频路由 (输入包含音频)
      { channelModelId: channelModelIds["autodl-minimax-h3-z0903"], enabled: true, priority: 100, weight: 100 },
      { channelModelId: channelModelIds["autodl-minimax-h3-zm-u24"], enabled: true, priority: 95, weight: 100 },
      { channelModelId: channelModelIds["autodl-minimax-h3-zm-u08"], enabled: true, priority: 90, weight: 100 },
      { channelModelId: channelModelIds["autodl-minimax-h3-image-audio-v2-15s"], enabled: true, priority: 85, weight: 100 },
      { channelModelId: channelModelIds["autodl-minimax-h3-image-audio-v2"], enabled: true, priority: 80, weight: 100 },
    ].filter((r) => Boolean(r.channelModelId)),
  };

  if (existingLogical) {
    console.log(` -> 逻辑模型已存在 (ID: ${existingLogical.id})，更新路由与能力规格...`);
    const patchRes = await apiRequest("PATCH", `/api/admin/logical-models/${existingLogical.id}`, logicalMutation);
    if (patchRes.data?.code !== 0) {
      console.error(`     更新逻辑模型失败:`, patchRes.data);
    } else {
      console.log(` -> 逻辑模型更新成功！`);
    }
  } else {
    console.log(` -> 创建逻辑模型: autodl-minimax-h3...`);
    const postRes = await apiRequest("POST", "/api/admin/logical-models", logicalMutation);
    if (postRes.data?.code !== 0) {
      console.error(`     创建逻辑模型失败:`, postRes.data);
    } else {
      console.log(` -> 逻辑模型创建成功！`);
    }
  }

  console.log(`\n========================================`);
  console.log(`✓ AutoDL 渠道与全套 14 个模型配置已成功同步并生效！`);
  console.log(`========================================\n`);
}

syncAutoDLChannel().catch((err) => {
  console.error("[Fatal Error]", err);
  process.exit(1);
});
