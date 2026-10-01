# AGENTS.md

本文件是影策仓库中 AI、自动化工具和协作者的工作约定。用户当前任务优先于本文件；本文件优先于个人习惯。所有结论应能回溯到代码、配置、测试、日志或文档，不用历史印象替代现状。

## 1. 项目边界

智影（基于上游 `ddcat-ai/open-ai-canvas` 演进与本地二次开发）是面向 AI 影视与短剧创作的工作台，当前仍在快速开发。公开接口、数据结构和部署配置可能直接调整；除非任务明确要求，不为旧字段、旧 API 或旧数据增加兼容层。

仓库由几个边界清晰但可独立运行的单元组成：

| 单元 | 技术栈 | 入口 | 责任 |
| --- | --- | --- | --- |
| `web/` | Vite、React 19、TypeScript、React Router、Ant Design、Tailwind、Zustand、TanStack Query | `web/src/application.tsx`、`web/src/router.tsx` | 工作区 UI、画布交互、浏览器缓存、API 调用和模型协议适配 |
| `backend/` | Go 1.25、Gin、GORM、SQLite/PostgreSQL、Redis 协调 | `backend/cmd/server/main.go` | 登录、权限、业务 API、任务队列、资源、模型中转和后台管理 |
| `canvas-agent/` | Node.js 18+、TypeScript、Express、MCP SDK、Codex SDK | `canvas-agent/src/index.ts` | 本机 Agent、MCP、画布会话桥接和本地渠道 |
| `plugins/yingce/` | Codex App 插件清单和 skills | `.codex-plugin/plugin.json` | 将 Canvas Agent MCP 接入 Codex App |
| `docs/` | Next.js、Fumadocs、MDX | `docs/content/docs/` | 面向用户和开发者的专题文档；构建配置见 `docs/source.config.ts` |

根目录的 `Dockerfile` 构建前端静态镜像；`nginx.conf` 托管 SPA 并代理后端。`docker-compose.dev.yml` 是源码热更新开发编排，`docker-compose.local.yml` 是本地构建运行，`docker-compose.deploy.yml` 是 PostgreSQL + Redis 部署编排。

## 2. 开始工作前

1. 先读取任务涉及的入口、调用方、配置、锁文件和相邻测试；先理解现状，再决定是否抽象或重构。
2. 使用 `rg` / `rg --files` 搜索，优先并行读取相关文件。不要为了“统一风格”改动无关模块、依赖、格式或用户已有修改。
3. 先形成目标边界：页面负责什么、service 负责什么、handler/service/repository 如何分层、数据和错误如何流动。新增 helper 必须消除真实重复或隔离明确协议，不能只透传参数。
4. 检查 `git status --short`。不覆盖、不回滚、不清理非本次产生的变更；不使用 `git reset --hard`、`git checkout --` 或宽范围删除。
5. 手工编辑使用 `apply_patch`；默认使用 ASCII，业务中文或已有 Unicode 文件除外。注释只解释非直观算法、核心入口、安全边界和降级原因。

## 3. 目录职责和依赖方向

### 前端

- `web/src/pages/`：路由页面及页面私有 hook/组件；页面协调流程，不直接拼装后端协议。
- `web/src/layouts/`：路由级布局、全局浮层和页面壳；不要在页面重复设置全局 body 状态。
- `web/src/components/`：真实跨页面复用的 UI 或交互能力；页面私有组件留在页面目录。
- `web/src/services/api/`：业务 API、模型渠道协议、资源 API；不依赖 JSX、路由或 AntD 提示。
- `web/src/services/`：文件、媒体、同步、缓存和生成任务等跨页面副作用。
- `web/src/stores/`：跨页面状态和持久化配置；页面临时状态留在页面，媒体大对象不进 `localStorage`。
- `web/src/lib/`：纯函数、画布算法、协议转换、设计 token 和可独立测试的基础能力。
- `web/src/styles/globals.css`：变量、重置和必要的第三方覆盖；页面样式优先使用现有 token 或页面样式。

### 后端

- `backend/internal/handler/`：HTTP 入参、鉴权上下文、调用 service、返回统一响应；不放业务判断和数据库查询。
- `backend/internal/service/`：校验、权限、默认值、ID、时间、配额、幂等、任务编排和外部调用。
- `backend/internal/repository/`：GORM 查询和持久化；不承载业务策略。
- `backend/internal/model/`：结构、枚举和简单模型方法；不调用外部服务。
- `backend/internal/provider/`：模型供应商能力和协议实现。
- `backend/internal/database/`：数据库连接、迁移和连接池。
- `backend/cmd/`：可执行入口、迁移和启动配置；启动参数不得绕过数据目录约束。

调用链应保持为：`HTTP -> handler -> service -> repository/model -> database/resource`；需要模型上游时由 service 进入 `provider/outbound`。跨层调用必须有明确理由并补测试。

### Agent、插件和文档

- 修改 `canvas-agent/` 前先读 `canvas-agent/README.md`，它有独立的 Node 版本、构建、发布和 token 边界。
- 修改 `plugins/yingce/` 前先读插件 README、manifest 和对应 skill；不要把主应用的页面约定套到插件运行时。
- 修改 `docs/` 前确认内容属于专题文档，而不是把长篇说明重新复制到根 README。目录索引见 `docs/index.md`。

## 4. 前端 API 和状态合同

### 后端业务 JSON

业务 API 的唯一公共客户端是 `web/src/services/api/request.ts` 导出的 `apiClient` 和 `request<T>`：

- 复用现有 `axios.create`；不要新增 `httpClient`、平行响应解包器或业务模块自己的 axios 实例。
- `apiClient` 默认使用 `VITE_CANVAS_BACKEND_URL || "/api"` 和 `withCredentials: true`，登录 Cookie 不放进 URL。
- 后端成功响应为 `{ code: 0, data: T, msg: string }`；HTTP 200 不等于业务成功，`code !== 0` 必须抛错。
- API 模块定义并导出接口类型；页面和 React Query 直接接收解包后的 `data`，不重复访问 `.data.data`。
- 查询参数使用 `compactApiParams` / `serializeApiParams`；取消请求传递 `AbortSignal` 并保留取消语义。
- `FormData` 不手动设置 `Content-Type`，让 Axios 生成 boundary。写路径失败必须向上抛出，不能 `catch { return defaultValue }`。

### 模型渠道和流式请求

- 文本、图片、视频、音频模型请求统一经过 `web/src/services/api/custom-channel-relay.ts` 的 `channelRequest` 及其协议函数。
- 自定义渠道必须由登录态后端 `/api/ai/custom` 中转；重建 headers 时清除 `x-goog-api-key` 和旧的 `X-Canvas-Upstream-Headers`，不得把第三方密钥放入浏览器 URL。
- Provider 特有 payload、响应解包和状态机留在对应 `image.ts`、`video.ts`、`audio.ts`；不要塞进通用 `request.ts`。
- 原始 `fetch` 仅用于媒体 blob/data URL、资源、Worker/本地 Agent 或 SSE；必须检查 `response.ok`，传递正确的 `credentials` 和 `signal`。
- 文本任务 SSE 是 `GET /api/tasks/:id/text-events`，游标是递增事件 `id`；断线使用 `Last-Event-ID` 或 `?after=`，不能把任务 ID 当游标。
- 代理只对文本任务和明确的系统模型事件流路径关闭缓冲/缓存/gzip；不要给所有 `/api/` 请求复制长超时和 `proxy_buffering off`。

### 数据、缓存和写路径

- 画布、项目、任务、素材和大 JSON 使用带用户 scope 的 `localforage`；`localStorage` 只保存小型配置、当前 scope 或 UI 偏好。
- 用户切换时隔离 React Query、localforage 和资源缓存；不能让账号之间串数据。
- 后端不可用时的本地缓存是降级，不代表服务端已保存。UI 必须区分“本地缓存成功”和“服务端持久化成功”。
- 生成、激活、审批、权限、删除、上传、配额、账务和密钥相关操作属于强校验写路径；不使用空 ID、默认用户、默认权限或默认额度兜底。
- 素材删除必须先检查项目、画布、任务和其他业务引用；有引用则保留并返回来源，无引用才清理物理对象。物理删除失败不得删除素材记录。

## 5. 后端响应、权限和安全

- Gin 接口统一返回 `{ code, data, msg }`；失败时 HTTP status 和业务 `code` 都应表达真实失败，不把所有错误包装成 200。
- 所有对象读取、更新、删除都在 service 校验当前用户和资源归属；管理员权限在 service 校验，不依赖前端隐藏按钮。
- 默认拒绝本机、私网和链路本地上游。可信开发主机只能通过 `CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS` 精确放行；不要设置“允许全部私网”来绕过 SSRF 防护。
- 用户 API Key 保存在浏览器本地，任务创建时可能提交给自部署后端；只在可信部署和 HTTPS 下使用真实密钥。日志、错误上报、URL、localStorage 和持久任务正文不得写入敏感 URL、Cookie 或 API Key。
- 生产必须配置明确的 `CANVAS_CORS_ORIGINS`，保持 HTTPS，限制数据库、备份、数据目录和 `.settings-key` 权限；默认关闭公开注册。
- 数据库字段或表变化时同步更新 `docs/content/docs/backend/backend-database.mdx`，不能只改 GORM model。

## 6. 画布、UI 和设计系统

- 画布组件、状态、算法分别放在 `web/src/components/canvas/`、`web/src/stores/canvas/`、`web/src/lib/canvas/`。事件忽略选择器必须覆盖 modal、popover、dropdown 等浮层。
- 画布拖拽、连接、缩放和快捷键要考虑 pointer capture、滚轮冒泡、焦点以及 `data-canvas-no-zoom` / `data-canvas-wheel-scroll` 边界。
- 节点和对象名称要有可发现的铅笔入口并支持单击编辑；双击或右键不能是唯一入口。图片节点保持原始比例，面板不能长期遮挡主要画布空间。
- Ant Design 共性主题和控件状态集中在 `web/src/lib/app-theme.ts` / `AppProviders`。Modal 当前内容外壳是 `.ant-modal-container`，优先使用 `styles.container`、`styles.body` 和组件 class。
- 第三方覆盖限定在具体组件，不新增全局 `.ant-modal-*`、`.dark .ant-switch-*`、`.ant-checkbox-*` 或 Segmented 状态补丁。新增 CSS 前先搜索同名选择器，回到唯一源规则修改。
- 遵循 `docs/ui-design-system.md` 及项目三层 token：Primitive → Semantic → Component。inline style 优先引用 `var(--token-name)`，不要散落颜色、圆角、阴影和层级字面值。
- 主操作、普通选中、Checkbox/Radio、Switch 是不同颜色角色；持久切换使用 `aria-pressed`，`type="primary"` 只表示当前主要命令。尊重 `prefers-reduced-motion`，键盘导航保留 `:focus-visible`。
- **全局快捷键硬性规范**：
  - **`Esc` 键**：所有弹出页面、Modal、Drawer、浮层、下拉菜单及预览灯箱必须支持 `Esc` 快速关闭（多层浮层遵循 LIFO 栈式退出，并调用 `e.stopPropagation()` 防止事件穿透至底层画布）；
  - **`Ctrl+Z` 键**：核心画布操作、剧本分镜及混剪时间线必须支持步进撤销（输入框内优先原生撤销，全局触发状态机撤销）；
  - **`Ctrl+Y` / `Ctrl+Shift+Z` 键**：必须同时支持双键位重做/恢复，且行为与撤销栈严格对称。

## 7. 本地开发、部署和数据目录

- 先阅读 `.env.example` 和对应 Compose 文件。宿主机后端开发必须使用 Monorepo 根目录的 `workspace-data/runtime/media-lab`，通过 `CANVAS_BACKEND_DATA_DIR` 显式指定；不要把 `backend/data` 当作开发账号数据库。
- 构建缓存和 Go 缓存统一放在 `D:\AI\opc\build-temp\media-lab`；不要提交数据库、上传文件、`.env`、真实密钥、构建产物或编辑器配置。
- 宿主机开发：从 `media-lab/backend` 设置 `CANVAS_BACKEND_DATA_DIR=../../workspace-data/runtime/media-lab` 后运行 `go run ./cmd/server`，`web/` 使用 Bun 和 Vite。Docker 热更新使用 `docker-compose.dev.yml`；本地构建运行使用 `docker-compose.local.yml`。
- 生产 Compose 使用 `docker-compose.deploy.yml`（PostgreSQL、Redis、backend、web），源码构建可叠加 `docker-compose.build.yml`。公网只暴露 web 的 `3000`，backend `8080` 留在 Compose 网络内。
- 默认不启动 dev server；只有用户明确要求浏览器预览或联调时才启动，并先确认端口、数据目录和现有进程。
- 健康检查只能证明入口可用，不能替代登录、SSE、任务生成和资源访问验证。

## 8. 验证纪律

项目当前默认不自动运行语法检查、类型检查、测试或构建。用户明确要求验证，或改动风险需要验证时，按范围选择最小充分命令，并在交付中如实记录：

- 前端：`cd web && bun run build`；专项测试用 `bun test ...`。
- 后端：`cd backend && go test ./...`；涉及 PostgreSQL、资源、任务或权限时补对应集成/冒烟路径。
- Canvas Agent：`cd canvas-agent && npm test`，构建用 `npm run build`。
- 文档站：`cd docs && bun run types:check` 或 `bun run build`。
- UI 变更能浏览器验证时，检查关键路由、明暗主题、滚动、弹窗、空态和核心交互；不能验证时说明替代依据，不把静态阅读或 `git diff` 写成运行验证。

同类失败连续三次时停止盲试，记录现象、已排除项和新假设，再切换路径或请求用户决策。

## 9. 文档与交付

- 根 `README.md` 只保留项目定位、能力概览、快速开始、部署、安全和文档入口；详细专题写入 `docs/content/docs/`。
- 功能、代码地图、待办、待测试分别维护在 `docs/content/docs/overview/features.mdx`、`docs/content/docs/backend/code-map.mdx`、`docs/content/docs/progress/todo.mdx`、`docs/content/docs/progress/pending-test.mdx`。已实现但未由用户确认的变化先写入 `pending-test.mdx`。
- API、数据表、SSE、资源存储、部署或安全边界变化时同步对应专题文档；不要只改代码和根 README。
- 文档默认中文，不写过期日期，不公开密码、Token、Cookie、真实账号或机器敏感路径。命令、端口、环境变量必须以当前脚本和 Compose 为准。
- Git 提交说明使用 `<type>(<scope>): <业务模块> - <变更摘要>`，`type` 为 `feat|fix|refactor|perf|docs|test|build|ci|chore|revert`。

交付前至少检查：改动是否聚焦、调用方和类型是否同步、错误/权限/数据归属是否完整、必要文档是否同步、验证是否如实说明、是否留下密钥或本地数据。

## 10. 本地二次开发与上游围栏

- 本地扩展代码放在 `web/src/extensions/opc-infinite/`、`backend/internal/custom/opc-infinite/` 或 `plugin-packages/opc-infinite-*`；不得把旧项目目录整体覆盖到上游原生目录。
- 必须修改原生 TypeScript、React、CSS、Go 或脚本文件时，使用成对的 `@opc-feature` 或 `@opc-adapter` 围栏，围住完整的本地逻辑块；围栏不得嵌套，key 使用小写短名称。
- 上游同步前必须保证 `media-lab` 范围工作区干净，并运行 `scripts/verify-opc-fences.ps1`。同步脚本遇到上游变更触及带围栏文件时会跳过并报告，不得静默覆盖。
- 同步脚本默认不安装依赖、不构建、不暂存、不提交；只有显式 `-AutoCommit` 才允许提交，且 Git 范围只能是 `media-lab`。
- 运行数据和测试产物必须在 Monorepo 的 `workspace-data`，构建缓存和同步临时副本必须在 `D:\AI\opc\build-temp`。
- 独立插件统一遵循 `zhiying.plugin/v1` 标准置于 `plugin-packages/`，客户端密集型计算（如抽帧与多模态流）高频进度必须在组件局部 React State 内部节流驱动，严禁高频更新全局画布 Store。

### 10.1 上游更新同步实战避坑铁律与防回归核查规范

在跟进上游（`ddcat-ai/open-ai-canvas`）版本迭代并叠加本地二次开发时，必须汲取历次同步实战中的核心教训，严格落实以下 8 大防线与闭环验收清单：

1. **核心分发器与多态执行链防抹平铁律 (Silent Dispatcher & Branch Erasure Guardrail)**：
   - **痛点分析**：上游重构核心执行器、调度器或分发中心（如 `use-canvas-generation-executor.ts`、任务分发器）时，常重写内部 `switch-case` 或多态分流。若合并时仅保留了顶层 import 围栏，执行分支（如 `isCustomPluginNode(node.type)`、自定义生成流调用）会被上游原生代码静默覆盖。此时 TypeScript 编译 0 报错，但运行时所有本地自定义节点与插件生成任务全线静默失效；
   - **避坑铁律**：对所有核心分发器（Executor、Dispatcher、Controller、Router），合并时严禁只对齐围栏标记，必须逐行复核**多态分发调用链**是否完整落地，且必须有专门的集成或单元测试覆盖执行分支。

2. **桌面双通道路由与公网凭据外泄防线 (Desktop Dual-Routing & Credential Security Guardrail)**：
   - **痛点分析**：在支持桌面 Native Bridge（`window.desktopBridge.fetchLocal`）时，若对目标 URL 校验过宽，会导致公网商业 API（如 DeepSeek、OpenAI、阿里云、火山方舟）被错误分流至桌面桥接；更危险的是，若在中转失败时降级为浏览器端原生 `fetch` 直连公网，会导致商业 API Key 在前端网络请求中完全暴露且引发 CORS 失败；
   - **避坑铁律**：
     - `desktopBridge.fetchLocal` **仅且必须仅允许** 本地/私有网络（`127.0.0.1`、`localhost`、`10.x.x.x`、`192.168.x.x` 等）；
     - 公网商业渠道 **100% 必须且只能** 走后端安全代理网关（`/api/ai/custom`）；
     - 网关中转失败时 **绝对禁止** 浏览器端直连公网降级（Fail-closed 安全原则，彻底杜绝 Key 外泄）。

3. **上游单测静态源码契约与二开增强的相容规范 (Static Source Contract Drift Defense)**：
   - **痛点分析**：上游部分单测（如 `canvas-connection-create-menu.test.ts`）并非动态渲染测试，而是直接读取源码文本（`readFileSync`）并通过单行正则表达式（如 `/<ConnectionCreateOption [^\n]+/g`）断言固定匹配数量（如 `expected: 8`）。二次开发若为了支持自定义/置顶项而将原生代码重构为动态数组循环（`items.map(...)`）或多行格式化，会导致上游单测直接报 0 匹配失败；
   - **避坑铁律**：在扩展具备源码级单测断言的组件时，必须维持上游源码的物理声明契约（原生 8 项以单行声明完整保留，本地扩展与置顶逻辑通过独立组件或插槽增量渲染），实现业务扩展与上游官方单测 100% 双向兼容。

4. **增量数据库版本迁移漏表防范 (Incremental DB Migration Amnesia)**：
   - **痛点分析**：上游引入新数据模型（如 `GenerationLog` 等）时，通常在全量初始化（`initializeDatabaseSchema`）中注册建表，但在增量版本升级（如 `migrateSchemaV10`）中容易遗漏登记。导致全新部署测试正常，但老用户或已有数据库执行升级时因表不存在而触发运行时 SQL 崩溃；
   - **避坑铁律**：后端涉及 GORM 模型变更时，必须双向核验：`全量初始化建表清单` 与 `最新增量版本迁移清单` 必须 100% 同步包含所有新增 Model。

5. **官方插件同步精细化过滤与版本倒挂防范 (Plugin Sync Granular Filter & Version Inversion)**：
   - **痛点分析**：若同步脚本简单粗暴地将整个 `plugin-packages/` 目录全量排除，会导致上游新增或修复的官方核心插件（如 ComfyUI 等）被无声遗漏；若未校准源码目录 `manifest.json` 与已有 `.yingce-plugin` 构建产物的版本号，打包脚本执行时会导致低版本意外覆盖高版本（版本倒挂）；
   - **避坑铁律**：
     - 同步脚本必须采用精细化排除规则：仅排除本地特有前缀插件包（如 `opc-*`），官方原生插件包必须全量纳入同步比对；
     - 维护插件源码时必须保证 `manifest.json` 的版本号不低于已有发布分发包版本。

6. **隐式围栏的“结构性盲区”与三层验收铁律 (Fence Structural vs Semantic Gap)**：
   - **痛点分析**：`verify-opc-fences.ps1` 是纯文本结构层面的防线（检查标签配对与 Git 冲突标记），**无法检测围栏内部被上游上下文破坏的语义逻辑**（如上游重构了外部函数签名、删除了作用域变量、调整了解构字段等）。“围栏 100% 完整”绝不等于“业务逻辑完好”；
   - **避坑铁律**：上游同步合并后，严禁只看围栏校验通过就交付，必须严格通过三层质量门禁：
     1. **第 1 层（结构标记防线）**：运行 `scripts/verify-opc-fences.ps1`，确保围栏成对闭合且 0 冲突标记；
     2. **第 2 层（静态类型防线）**：运行 `bun run typecheck`（前端）与 `go vet ./...`（后端），确保符号、类型与调用签名 0 报错；
     3. **第 3 层（动态单测防线）**：运行核心测试套件，必须全绿通过：
        - `bun test test/canvas-connection-create-menu.test.ts`
        - `bun test agent-capabilities`
        - `bun test creative-agent`
        - `go test ./internal/protocol -count=1`
        - `go test ./internal/generation -count=1`

7. **协议状态码与 HTTP 错误契约对齐 (Protocol Status & Error Code Alignment)**：
   - **痛点分析**：上游在迭代中若微调了参数校验或鉴权失败的 HTTP 状态码（如从 400 Bad Request 调整为 422 Unprocessable Entity），若本地未同步跟进，会导致协议契约测试断言失败或前端通用拦截器逻辑错乱；
   - **避坑铁律**：Go 后端合并后强制运行协议契约测试（`go test ./internal/protocol -count=1`），保证前后端错误码映射与上游官方规范保持绝对一致。

8. **上游品牌防污染与用户/后台呈现对齐铁律 (Brand Guardrail & Upstream De-Pollution Defense)**：
   - **上游追踪不变**：上游仓库追踪路径保持不变，原本的上游依然为 `ddcat-ai/open-ai-canvas`，严禁在代码、User-Agent、同步配置或架构文档中私自篡改上游源仓标识；
   - **品牌呈现规范**：所有面向用户端（Web 界面、欢迎页、工作台、画布助手、登录注册、邮件、SEO、页脚版权、分享等）与管理后台（Admin Shell、系统设置、审计日志等）展示的品牌名称统一为中文**“智影”**与英文/标识/Slug/域名**“zhiying”**（如 `zhiying`、`ZHIYING STUDIO`、`canvas.zhiying.cc.cd` 等）；严禁在任何用户可见或管理员可见的页面、文案、邮件、公告、标题或默认设置中出现上游原生品牌或历史旧称；
   - **上游同步品牌检查与修改**：每次从上游（`ddcat-ai/open-ai-canvas`）拉取更新、执行合并（Merge/Rebase）时，必须将“品牌一致性与防污染核查”作为合并验收的必须步骤；逐行扫描合并引入的新增代码、页面、文案、配置；凡是新引入的、展示给用户或管理后台的品牌字眼，必须在合并后第一时间修改为“智影” / “zhiying”，并运行测试与核查。

## 11. 云端 Docker 部署与容器化架构标准

- **双层轻量容器架构**：
  - **前端容器 (`Dockerfile`)**：使用 `bun:1.3-alpine` 构建 Vite 纯静态产物，最终由 `nginx:1.27-alpine` 托管（对外暴露 3000 端口，内置 `/api` 反代到后端并负责客户端 SPA 路由兜底）；
  - **后端容器 (`backend/Dockerfile`)**：使用 `golang:1.25-alpine` 交叉编译轻量无依赖二进制程序，运行于 `alpine:3.22`（服务端口 8080 仅在 Docker 内部网络与 Nginx 互通，非 root 用户运行，内置 `/api/health/ready` 健康检查）。
- **生产集群编排规范 (`docker-compose.deploy.yml` / `docker-compose.server.yml`)**：
  - 核心拓扑由 `web` + `backend` + `postgres:17-alpine` + `redis:7.4-alpine` + `migrate` (`migrate-schema up`) 组成；
  - 数据库与媒体资产必须挂载持久化 Volume（PostgreSQL `/var/lib/postgresql/data`、Redis `/data`、后端素材 `/data`）；
  - 生产核心环境变量：`CANVAS_DATABASE_DRIVER=postgres`，`DATABASE_URL`，`REDIS_URL`，`CANVAS_SHUTDOWN_TIMEOUT=10m`，`CANVAS_CORS_ORIGINS`，`CANVAS_WORKER_CONCURRENCY`。
- **二次开发与新增模块云端适配铁律**：
  - **端侧/边缘计算优先 (Client-Side Edge Computing First)**：高算力、高密度的媒体处理（如逐帧抽帧、差异度对比、音频提取、网格拼版、本地视频切片）必须在客户端浏览器（Canvas / Web Audio / Blob API）完成，**严禁在云端服务器后端执行高并发视频重编码**，确保云服务器在低配场景下 CPU/GPU 零计算负载；
  - **网络流量极简化**：本地素材优先在前端提取有效特征/拼版后再上传，杜绝云端大体积无用视频传输；
  - **依赖零污染与鉴权收敛**：新增功能代码纯 TypeScript/Go 编写，不引入宿主机底层 C++/Python 依赖；AI 模型调用统一复用系统后端鉴权网关（`/api/image/question`、`/api/ai/custom`）。

---

## 12. 统一桌面端与内嵌远程网页架构规范 (Desktop Shell & Embedded Web Bridge)

未来统一桌面客户端（Electron / Tauri / WebView2 宿主容器）内嵌加载远程 Web 页面时，必须遵守以下核心架构准则：
- **智能双通道分流铁律 (Smart Dual-Routing)**：
  - **本地/私网渠道 (`127.0.0.1` / `localhost` / `10.x.x.x` / `192.168.x.x`)**：走桌面端原生桥接（`window.desktopBridge.fetchLocal`），绕过 Chromium 的 Mixed Content / CORS / PNA 拦截，严禁发往云端 `/api/ai/custom`，保证云端 100% 安全与零算力消耗；
  - **公网商业 API (`api.deepseek.com` / `api.openai.com` 等)**：继续走云端安全代理网关（`/api/ai/custom`），保护商业 API Key。
- **方案文档索引**：
  完整技术设计与迁移 Checklist 参见项目根目录：[`docs/desktop-embedded-web-bridge-architecture.md`](../docs/desktop-embedded-web-bridge-architecture.md)。

---

## 13. 商业化交付与极致流畅浏览性能规范 (Commercial-Grade Smooth Browsing & Zero-Server-Overhead Governance)

为确保未来商业化用户在独立安装部署（本地离线安装包、私有云自建、桌面客户端内嵌或商业 SaaS）后获得如丝般流畅的交互体验，同时最大化压缩云端/宿主服务器的算力负荷与网络带宽开销，所有涉及画册、灵感库、剧本分镜、画布多媒体节点与预览查看的代码开发，必须强制遵循以下规范：

### 13.1 商业化用户流畅体验基准（0ms 秒开与渐进式渲染）
1. **0ms 首帧渲染与零阻塞交互 (Zero Black Screen / Zero Spinner Blocking)**：
   - 严禁在大图预览、灯箱（Lightbox）、全屏画册及详情抽屉中使用全屏居中 Loading 菊花或纯黑/纯白遮罩遮挡画面；
   - 凡是在网格、卡片或页面中已完成加载的缩略图/封面，在用户触发点击预览的第 1 帧（0ms），必须作为底层基础图（Base Layer）无缝继承渲染，杜绝任何白屏或等待感；
   - 采用双层渐进加载机制（Base Thumbnail Layer + High-Res Progressive Overlay Layer），高保真大图后台异步就绪后，以 300ms 丝滑 Cross-fade 淡入替换；
   - 状态提示微型化：仅在画面角落浮现极小的半透明胶囊徽标（如 `⚡ 快速预览中 · 高清无缝载入`），绝对禁止遮挡画面主体。
2. **前后相邻素材双向智能预加载 (Bidirectional Smart Preloading)**：
   - 任何具备连续浏览能力的场景（如灵感预览弹窗、故事板镜头轮播、多视角画册、分镜时间线），弹窗开启后必须在后台自动预热 `[currentIndex - 2, currentIndex - 1, currentIndex + 1, currentIndex + 2]` 的相邻媒体；
   - 用户使用键盘左右方向键（`←` / `→`）或点击切换按钮时，必须达到 0 延迟原生幻灯片级秒切体验。
3. **鼠标悬停静默预热机制 (Hover Pre-warm)**：
   - 卡片与“点击预览查看”按钮在用户鼠标划入（`mouseenter`）的瞬间，后台即刻利用人眼到点击的 200~400ms 生理决策时间静默预加载大图，实现“点击即命中缓存”。

### 13.2 视频与富媒体解耦铁律（零并发网络阻塞与即时内存回收）
1. **首屏 0 KB 视频网络请求铁律**：
   - 任何列表、网格、瀑布流在首屏渲染时，**绝对严禁挂载 `<video preload="metadata">` 或 `<video preload="auto">`**；
   - 严禁并发触发浏览器的 Range 分段请求，防止耗尽浏览器对单一域名的 6 个 HTTP 连接池，进而导致页面主图片与核心业务 API 积压卡死；
   - 视频卡片首屏必须 100% 渲染轻量 WebP 封面海报图（辅以播放图标与时长角标），网络连接 100% 留给首屏管线。
2. **交互三阶段生命周期分离 (Three-Tier Video Lifecycle)**：
   - **阶段 1（首屏静态海报）**：0 视频流量，仅渲染 WebP 封面；
   - **阶段 2（防抖悬停微动效）**：鼠标悬停超过 220ms 防抖确认后，才按需挂载无声循环轻量视频，避免快速滚屏引发无谓请求；
   - **阶段 3（点击沉浸全屏播放）**：点击后弹出专业级播放器（支持拖动进度条、全屏、音量、工作台跳转）；
3. **解码器内存即时销毁**：
   - 鼠标一旦移出卡片，必须**立即销毁 `<video>` 标签并释放硬件解码器内存与显存**，恢复为静态轻量封面，严禁在后台隐蔽常驻播放。

### 13.3 极小化服务器算力与网络带宽开销铁律
1. **本地离线分发优先 (Local-First Edge Distribution)**：
   - 商业化安装包自带高质感离线资产包（WebP），优先直接映射到本地静态目录（`/images/inspirations/cache/*.webp`）；
   - 用户端请求直读本地磁盘（<20ms 响应），实现 0 云端带宽消耗、0 外部网络延迟；
2. **分辨率分级与 WebP 强制压缩红线**：
   - **网格缩略图**：严格限制在 480px 宽度以内、WebP 格式、质量 80，单图体积必须控制在 15~25KB（相较原始 PNG 压缩率 >95%）；
   - **预览大图**：严格限制在 1280px / 1440px 宽度以内、WebP 格式、质量 85，单图体积必须控制在 60~90KB；
   - **严禁生产加载原始大图**：严禁在生产端直接引入未压缩的 3MB~10MB 原始 PNG/JPEG 原图；
3. **全球边缘 CDN 与故障平滑降级**：
   - 任何不可本地化的公网远程素材，必须 100% 通过全球边缘 CDN（如 `wsrv.nl` / Cloudflare Edge）进行动态 WebP 切片；
   - 具备多级故障转移：L1 内存缓存 (0ms) -> L2 客户端持久缓存 (CacheStorage) -> L3 边缘 CDN 切片 -> 优雅回退美学蓝图卡片；
4. **云端服务器零重编码算力负担 (Zero Server-Side Transcoding)**：
   - 严禁在云端服务器后端执行高并发视频重编码、实时滤镜合成或动态图片缩放；
   - 音视频逐帧抽帧、波形提取、差异度比对、网格拼版、本地切片等重度计算，**必须全部在用户浏览器端（Canvas / Web Audio / Web Workers / Blob API）完成**；
   - 云服务器在 1 核 1G 或 2 核 2G 的最低配置下，必须保持 CPU/GPU 接近零计算负载。
5. **Nginx 静态强缓存配置标准**：
   - 生产环境 `nginx.conf` 必须对所有静态图片、视频及打包产物声明强缓存：
     `Cache-Control: public, max-age=2592000, immutable`（媒体资产 30 天，构建产物 1 年），彻底消除 304 轮询与重复请求开销。



