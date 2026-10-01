# 影策 (media-lab) 时间线剪辑板块架构评估与待优化路线图

> **版本定位**：内部技术规划与架构沉淀文档  
> **关联模块**：`media-lab/web/src/lib/timeline/`、`web/src/lib/plugins/builtin/editor/`、`backend/internal/service/task_render.go`、`task_timeline.go`  
> **基准来源**：上游 `open-ai-canvas`（`ddcat-ai/open-ai-canvas`）架构决策集（ADR-0001 ~ ADR-0005）与本地多用户商业化高并发推演  
> **更新时间**：2026-09-08

---

## 1. 编写背景与策略定位

上游项目近期借鉴了开源桌面剪辑工具 Concat (WolfCut) 的理念，重构引入了一套全新的 **Web 端时间线视频剪辑器（Video Timeline Editor）**。

目前该系统在上游正处于 **M3（插件化与面板打磨）到 M4（导出与服务端任务串联）** 的快速迭代过渡期。为避免在底层契约不稳定时过早介入深度二次开发导致后续上游同步剧烈冲突，当前特制定以下协同策略：
1. **暂缓深层侵入式改写**：保持核心时间线状态机与渲染契约与上游官方演进同步；
2. **提前排查与技术储备**：全面审计上游当前的代码逻辑，客观推演未来在**云端商业化多用户高并发**场景下的性能与带宽瓶颈；
3. **分阶段优化储备**：明确待优化的关键清单与技术切入点，待上游协议相对稳定冻结后，按本路线图实施二次优化与商业化加固。

---

## 2. 上游剪辑板块代码逻辑全景分析

上游剪辑系统的核心架构可概括为 **“TS 时间线状态机驱动 + 微内核插件插槽 UI + 预览导出分层 + 服务端/客户端双轨任务”**。

```mermaid
graph TD
    subgraph 前端浏览器 (Client-Side)
        UI[编辑器插件面板 UI] --> Slots[宿主插槽容器 (EditorSlotRegistry)]
        Slots --> Store[Zustand EditorStore]
        Store --> StateMachine[TS 时间线状态机 (唯一真相源)]
        StateMachine --> IndexedDB[LocalForage 本地用户缓存]
        StateMachine --> Preview[预览监视器 (HTML5 Video + Canvas 0 算力)]
        StateMachine --> WASM[降级出口: 浏览器端 ffmpeg.wasm 本地压制]
        StateMachine --> RemoteReq[导出请求: POST /timeline/renders]
    end

    subgraph 云端服务器 (Server-Side)
        RemoteReq --> TaskWorker[Go 任务调度器 (Task Worker Coordinator)]
        TaskWorker --> MatSources[下载引用片段至临时工作区 (os.MkdirTemp)]
        MatSources --> FFprobe[ffprobe 探测媒体音画流]
        FFprobe --> RenderPlan[buildRenderFFmpegArgs 生成 FilterGraph]
        RenderPlan --> CPUFFmpeg[调用宿主机 ffmpeg 软编码压制]
        CPUFFmpeg --> MediaStorage[写入系统媒体资源库 Resource]
        
        ASRReq[转写请求: POST /timeline/transcriptions] --> Whisper[ffmpeg 抽 16k wav -> 本地 whisper.cpp HTTP]
    end
```

### 2.1 前端核心：TS 时间线状态机（唯一真相源）
- **核心目录**：`web/src/lib/timeline/`、`web/src/stores/editor/editor-store.ts`；
- **模型设计**：基于 `TimelineProject` v2 契约，支持视频轨、音频轨、字幕轨、文本轨等多轨管理，内部处理片段（Clip）的裁切（Trim）、间隙补黑场（Gap）、拼接对齐（Placement）与磁性吸附（Snap）；
- **操作可靠性**：采用命令模式（`editor-commands.ts`）与撤销/重做历史栈（`editor-history.ts`）；
- **本地化隔离**：草稿编辑实时持久化于客户端 `localforage`（IndexedDB），未触发导出或显式保存时，对后端数据库零 I/O 压力。

### 2.2 UI 架构：微内核插槽体系（ADR-0005）
整个编辑器界面由一组解耦的预设插件注入插槽实现（位于 `web/src/lib/plugins/builtin/editor/`）：
- `editor-timeline-panel.tsx`：多轨交互时间轴面板；
- `editor-preview-monitor.tsx`：视频播放预览监视器；
- `editor-asset-ingest.tsx`：项目资产/画布素材一键入轨；
- `editor-inspector.tsx`：选中片段属性检查器（音量、裁剪、位置）；
- `editor-transcription.tsx`：自动字幕与语音识别；
- `editor-export.tsx`：成片导出控制器；
- `editor-ai-assistant.tsx`：AI 辅助编导对话。

### 2.3 渲染管线：预览与导出分层解耦（ADR-0003）
- **实时交互预览（Preview）**：
  - **纯端侧近似渲染**：监视器仅由 `<video>` 播放当前片段的原始媒体文件（带 HTTP Range），配合 Canvas / CSS 滤镜叠加模拟，**预览过程 0 消耗服务器 GPU/CPU**；
- **成片导出合成（Export）—— 双轨机制**：
  - **主路径（服务端任务）**：前端提交时间线结构快照，Go 后端调用宿主机 `ffmpeg` 二进制完成硬件/软解重编码；
  - **降级路径（浏览器端本地导出）**：内置 `ffmpeg.wasm`，可在无云端后端或离线环境下由用户端本地压制输出。

### 2.4 语音能力：Whisper 自动转写服务（ADR-0004）
- **服务路径**：Go 后端 `task_timeline.go` 接收请求，利用本地 `ffmpeg` 将音视频提取为 16k 单声道 wav 文件，再通过 HTTP 调用本地私网部署的 `whisper.cpp` 引擎（由环境变量 `CANVAS_WHISPER_BASE_URL` 配置），生成 SRT 字幕写回时间线字幕轨。

---

## 3. 云端商业化多用户并发场景下的瓶颈与隐患评估

针对未来大规模商业化多用户并发场景，我们对上游当前实现进行了深度推演，梳理出以下 5 大核心隐患：

| 隐患维度 | 触发环节 | 现状机制与瓶颈细节 | 商业化并发风险等级 |
| :--- | :--- | :--- | :---: |
| **1. CPU 算力雪崩** | 服务端成片导出 (`task_render.go`) | 后端使用 `libx264 -preset veryfast` 纯 CPU 软编码。单路 1080P 导出将吃满 2~4 核 CPU；若 10 个用户同时点导出，服务器 CPU 瞬间达到 100%，引发主 Web API 假死与 504 报警。 | **极高（致命瓶颈）** |
| **2. 临时磁盘 I/O 击穿** | 素材拉取与导出落盘 (`materializeRenderSources`) | 导出前须将时间线涉及的所有素材通过 HTTP 读取落盘到宿主机的 `os.MkdirTemp`；并发大工程可能瞬间挤爆几百 GB 磁盘空间，并导致严重磁盘 I/O 等待。 | **高** |
| **3. 公网出网带宽过载** | 成片交付与素材分发 | 导出完成的成片（通常 100MB~500MB+）落盘于后端存储；多用户同时下载成片或拉取素材将直接打满云服务器公网网卡，产生高额带宽账单。 | **中高** |
| **4. 语音转写单点堵塞** | Whisper ASR 转写服务 (`task_timeline.go`) | 当前依赖单机配置的 `CANVAS_WHISPER_BASE_URL`；若转写与主服务同机，并发 ASR 将严重争抢 CPU/显存，且缺少分布式排队机制。 | **中** |
| **5. 前端长轴渲染卡顿** | 超长多片段时间线展示 (`editor-timeline-panel.tsx`) | 随着短剧/长视频片段增多（上百个片段切片），时间线 DOM 节点线性增长，缺乏虚拟列表滚动（Virtual List），低配电脑容易卡帧或掉帧。 | **中低** |

---

## 4. 后续二次优化与演进路线图 (Roadmap)

待上游时间线协议稳定后，我们计划按以下三个阶段实施二次优化与商业化加固：

### 阶段一：门禁隔离与端侧算力卸载（MVP 商业化最低成本落地）
> **目标**：在不增加昂贵云服务器硬件的前提下，确保系统在高并发下 100% 稳定，服务器 CPU/带宽消耗降低 80% 以上。

1. **默认开启端侧浏览器合成（Client-Side ffmpeg.wasm 优先）**：
   - 普通个人用户或低时长视频，默认直接在前端调用 `exportTimelineToMp4`（浏览器 WebAssembly 本地压制）；
   - 把高密度的视频拼接与编码计算**完全交由用户个人电脑硬件承担**，云端服务器在导出环节实现 **0 CPU 负载、0 临时磁盘读写、0 导出下行带宽**。
2. **服务端渲染严格并发限额门控（Concurrency Semaphore）**：
   - 在 Go 后端 `taskWorkerCoordinator` 中增加单机最大渲染并发配置（如 `MaxTimelineRenderConcurrency = 2`）；
   - 超出并发的任务进入数据库队列平滑等待，保证服务器始终预留出充足的 CPU 维持主业务 API 和大模型网关的高可用。
3. **对象存储直传与 CDN 分发（S3 / OSS / MinIO 预签名）**：
   - 素材与渲染结果接入云存储直传/直下机制，静态媒体流量由 CDN 边缘节点分流，彻底解耦云主机网卡流量。

### 阶段二：生产级计算集群与硬件加速（企业级高并发阶段）
> **目标**：为付费 VIP/企业级长视频提供秒级云端极速渲染。

1. **Web 服务与渲染 Worker 物理容器解耦**：
   - 遵循 `AGENTS.md` 生产规范，将 `media-lab` Web API 与后台渲染 Worker 拆分为独立容器；
   - 渲染 Worker 部署在独立的弹性计算节点上，无论导出负载多大，主站点绝不出现任何卡顿。
2. **接入 GPU 硬件编解码加速（NVENC / VAAPI）**：
   - 优化 `buildRenderFFmpegArgs`，探测服务器 GPU 环境；
   - 在搭载 NVIDIA 显卡的节点上启用 `-c:v h264_nvenc` 硬件编码，将 1080P 导出速度提升 5~10 倍，同时将 CPU 占用率压降至 5% 以下。
3. **云原生 Serverless 转码对接**：
   - 探索通过云函数（如阿里云 FC、AWS Lambda）按需拉起渲染实例，按秒计费，实现零服务器闲置成本的无限并发弹性伸缩。

### 阶段三：AI 深度集成与影视工作流协同（深度产品体验打磨）
> **目标**：将剪辑板块与生态内已有的影视短剧画布、CreatorOS 编导中枢无缝打通。

1. **画布短剧分镜一键转剪辑工程**：
   - 打通 `media-lab` 画布中的影视短剧生成节点与时间线剪辑器；
   - 用户生成的批量分镜图、AI 视频片段与旁白音频，支持一键生成初始化多轨剪辑工程（无需手动一张张拖放）。
2. **智能配音/音效/字幕三位一体流水线**：
   - 结合端侧 TTS 生成音轨，与 Whisper 生成的字幕轨道按毫秒级打点对齐；
   - 引入智能对齐算法，自动消除视频片段间的语音断点。
3. **超长工程虚拟滚动与音频波形按需采样**：
   - 在 `editor-timeline-panel.tsx` 中引入视口虚拟滚动（Virtual Track Rendering）；
   - 音频波形抽取改用 Web Worker 后台计算与分段按需缓存，保障上千个片段的工程在前端保持 60fps 丝滑拖拽。

---

## 5. 协同与二次开发实施铁律

在后续跟进上游与启动二次开发时，必须严格遵守以下工程准则：
1. **严格遵循隐式围栏规范**：任何侵入原生时间线核心文件（如 `editor-export.tsx`、`task_render.go`）的修改，必须成对使用 `// @opc-feature: timeline-...` 或 Go 的 `// @opc-adapter: timeline-...` 标签，并在提交前运行 `verify-opc-fences.ps1`；
2. **独立扩展目录隔离优先**：新增的定制面板、AI 剪辑辅助逻辑，优先置于 `web/src/extensions/timeline-enhancements/` 独立目录；
3. **单事实源 Git 治理**：所有优化纳入根目录单一 Monorepo 维护，禁止在 `media-lab` 内乱建独立仓库。
