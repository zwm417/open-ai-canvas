# media-lab 工作台核心资产防泄露与透明宏注入架构规范
## Commercial IP Protection & Transparent Macro Injection Architecture

> **文档版本**：v1.0.0  
> **生效范围**：`media-lab` 生图工作台、生视频工作台、4 个二开画布算子节点、后端 AI 中继网关  
> **归档位置**：`media-lab/docs/workbench-ip-protection-and-backend-macro-injection-spec.md`  
> **遵循规范**：严格遵循 `AGENTS.md` 规范 4.1（目录隔离优先）、4.2（隐式围栏）与 8.2（端侧重计算与服务端零转码）

---

## 一、 方案背景与核心商业痛点

### 1. 核心商业痛点分析
当前 `media-lab` 的生视频工作台、生图工作台及二开画布算子中，蕴含了高度精细化的工业级 Prompt 资产与商业打法：
- **生视频 617 行底座提示词**（`video-workbench-base-prompt.md`）：凝聚了世界顶级导演风格库（Spike Jonze、Gondry 等）、前 3 秒黄金留存钩子、认知失调与视觉反差机制、以及物理时长语速校验公式；
- **20+ 款短视频商业卡片的 5 维指引**（`video-skill-directions.ts`）：商业痛点、受众心理、转化驱动力、商业定位与创意禁忌；
- **生图 30+ 款卡片配方库**（`builtin-skills.ts`）：脸部三视图、模特换脸、商品白底图的核心 `instructions` 与 `avoid` 规避词库；
- **二开算子专用提示词**：视频反推拆解规则（`video-reverse-prompt.txt`）与多素材深度洞察提炼模板。

**现有前端组装模式的致命风险**：
1. **静态打包全裸露**：Vite 编译生产包时，所有 `.md`、`.txt` 与 TypeScript 源码字符串被打包进前端静态 JS，使用普通解包工具全文搜索即可瞬间提取；
2. **网络抓包秒泄露**：前端在浏览器内组装好完整提示词后，明文发送至中转网关。用户打开浏览器 F12 Network 控制台，即可直接复制全部底座词；
3. **自建 NewAPI 监听风险**：若直接明文发往用户自配的局域网 NewAPI，用户可在其 NewAPI 的日志控制台中直接截获完整提示词。

### 2. 核心设计原则
1. **端侧算力不减负**：浏览器端负责的 Canvas/WebCodecs 视频逐帧抽帧、网格拼版、本地 MP4 混剪保持 100% 留在端侧，确保云端服务器 0 算力负担；
2. **创意文学质感 0 妥协**：不为了防盗将 617 行精美艺术文学词降级压缩成干瘪的代码，确保顶级电影感与灵动创意 100% 完美发挥；
3. **前端轻量脱敏**：前端只传递轻量业务意图与槽位句柄，前端静态包与 F12 抓包 0 明文核心资产；
4. **服务端透明展开**：利用后端代理在出网前最后一刻透明还原完整提示词，前端流式通信栈与 UI 状态机 0 侵入。

---

## 二、 核心架构：透明宏注入技术 (Transparent Macro Injection)

### 1. 架构数据流全景图

```
 ┌─────────────────────────────────────────────────────────────┐
 │                      前端工作台 (浏览器环境)                   │
 │                                                             │
 │  1. 用户选择工作流卡片 (如: 痛点反转爆品流)                   │
 │  2. 前端组装器仅输出占位宏与用户实际输入：                     │
 │     "{{OPC_MACRO:director;skill=pain_point_turn;dur=30}}"    │
 │     + 用户补充描述 (@图片1 熬夜早起暗沉...)                   │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                │ (F12 抓包只能看到宏标记，0 泄露)
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │             Go 后端中继网关 (/api/ai/custom)                 │
 │                                                             │
 │  3. 进入 ExpandMacros() 宏拦截展开器                          │
 │  4. 内存提取 go:embed 固化的 617 行底座词与 5 维指引          │
 │  5. 执行动态拼装，将宏标记无缝替换为真实商业提示词             │
 └──────────────────────────────┬──────────────────────────────┘
                                │
         ┌──────────────────────┴──────────────────────┐
         ▼                                             ▼
【官方受控商业渠道 (SaaS)】                     【用户自建局域网 NewAPI】
- 由云端服务器直连大模型                        - 本地 Go 服务直接出网
- 全程不流经任何用户设备                        - 展开通用的标准分镜框架
- ★ 100% 绝对物理安全                          - ★ 兼顾可用性与核心资产保护
```

### 2. 宏标记协议契约 (Macro Protocol Specification)

宏标记采用 Mustache 风格的安全特征前缀，由前端组装器在 `systemPrompt` 或 `userMessage` 开头输出：

```text
{{OPC_MACRO:<domain>;<k1>=<v1>;<k2>=<v2>...}}
```

- **生视频编导助手宏**：
  ```text
  {{OPC_MACRO:video_director;skill=pain-point-turnaround;dur=30;lang=zh;model=seedance-2.0}}
  ```
- **二开带货分镜脚本生成宏**：
  ```text
  {{OPC_MACRO:creation_script;scenario=ecommerce;type=selling_point;style=live_action;dur=60}}
  ```
- **二开复刻对标脚本生成宏**：
  ```text
  {{OPC_MACRO:reference_script;scenario=ecommerce;target_dur=60;ref_dur=45}}
  ```
- **二开素材分析与结构契约宏**：
  ```text
  {{OPC_MACRO:material_analysis;mode=standard;schema=v1}}
  ```
- **二开视频反推规则宏**：
  ```text
  {{OPC_MACRO:video_reverse;mode=seconds_and_scene;grid=auto}}
  ```
- **生图配方优化宏**：
  ```text
  {{OPC_MACRO:image_optimize;skill=face-3views;model=flux-dev}}
  ```
- **生图卡片规范宏**：
  ```text
  {{OPC_MACRO:image_recipe;skill=product-hero}}
  ```
- **多模型提示词适配宏**：
  ```text
  {{OPC_MACRO:model_adaptation;target_model=seedream;mode=expand}}
  ```

---

## 三、 关键模块移至后端清单 (Asset Migration Matrix)

| 所属模块 | 原前端文件路径 | 移至后端的敏感资产与逻辑 | 前端保留的轻量资产 |
| :--- | :--- | :--- | :--- |
| **生视频工作台** | `web/.../video-workbench-skills/` | 1. 617 行短视频工业编导底座词 (`video-workbench-base-prompt.md`, 45.3 KB)<br>2. 20+ 款卡片的 5 维商业指引 (`video-skill-directions.ts`)<br>3. 4 大深度融合算法原则 | 1. 卡片 ID、中文名称、图标、分类<br>2. 副标题、UI 展示简介、快捷词标签 |
| **二开带货分镜算子 (`opc.config_script`)** | `web/src/lib/creation-assistant-skill-body.md` | 1. 61.4 KB 电商带货/本地生活分镜编导工业知识库 (`creation-assistant-skill-body.md`)<br>2. 钩子/痛点/价值/CTA 结构编排公式<br>3. 分镜时序与口播去AI味工业准则 | 1. 业务场景、拍摄方式、平台选择 UI 控件<br>2. 素材引用表解析器与时间轴分段计划器 |
| **二开复刻脚本算子 (`opc.ref_script`)** | `web/src/lib/creation-assistant-reference-script-body.md` | 1. 33.6 KB 爆款对标参考脚本拆解与同构换品复刻知识库 (`reference-script-body.md`)<br>2. 同比例时间轴拉伸缩放算法与情绪节点映射原则 | 1. 原参考脚本输入框与时长比率计算器<br>2. 换品/换人设补充描述表单 |
| **二开素材分析算子 (`opc.material_analysis`)** | `web/src/lib/creation-assistant-prompts.ts` | 1. 资深编导双阶段物理事实建档与商业标的洞察规则<br>2. 七大板块（商品名/类目/特性/卖点/场景/人群/痛点）归纳规范<br>3. 完整严密的数据契约 `ANALYSIS_JSON_SCHEMA` (约 6 KB) | 1. 文件清单 (`file_manifest`) 提取与前端校验<br>2. 洞察结果卡片折叠交互与局部微调面板 |
| **二开视频反推算子 (`opc.video_reverse`)** | `web/.../opc-infinite/prompts/` | 1. 100 行短视频工业级像素拆解作战手册 (`video-reverse-prompt.txt`, 6.7 KB)<br>2. 11 列逐秒镜头拆解矩阵与 A~E 类主体判断体系 | 1. 浏览器端 Canvas 抽帧引擎<br>2. ContactSheet 图像网格拼版算法 |
| **生图工作台** | `web/.../image-workbench-skills/` | 1. 30+ 款生图配方的核心指令 `instructions` (57 KB)<br>2. 独家负向规避词库 `avoid`<br>3. 生图 AI 提示词总监系统词 (`llm-prompt-optimizer.ts`) | 1. 槽位定义（`uploadSlots` 语义标签）<br>2. 示例封面图与多视角参考图 URL<br>3. 基础参数（推荐数量、宽高比例） |
| **模型适配引擎** | `web/src/lib/plugins/builtin/prompt-optimizer.ts` | 1. 覆盖 Gemini/OpenAI/Grok/即梦/可灵/Minimax/Runway 等 10+ 款模型的专属提示词结构与规避规则 (`ModelAdaptationProfile`)<br>2. 提示词导演系统指令 | 1. 模型选择器与模式切换控件 (expand/refine/style)<br>2. 差异对比与历史选择器 |
| **视频分段执行** | `web/src/services/video-segment-runner.ts` | 1. 多段物理时长切片规则与起止区间算术<br>2. 跨段首尾帧状态接续指令模板 (`buildVideoSegmentPrompt`) | 1. 批量任务状态调度与进度条展示<br>2. 浏览器端本地 `mergeVideos` 混剪 |

---

## 四、 双轨商业与安全策略（解决 NewAPI 抓包）

针对用户自备 API（BYOK / 局域网自建 NewAPI）与官方商用渠道，后端网关实施分级注入策略：

```
                             检测上游目标地址 Target URL
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
      【官方受控渠道 / 公网商用渠道】                   【用户私有地址 / 本地局域网 NewAPI】
 (如: api.deepseek.com / 官方专享渠道)          (如: 127.0.0.1 / 192.168.x.x / custom-host)
                 │                                               │
                 ▼                                               ▼
    展开 100% 完整商业底座配方                       展开公开标准影视分镜骨架
 - 617 行顶级电影感编导词                          - 通用起承转合与时间戳分镜要求
 - 20 款独家 5 维商业打法                          - 基础景别与技术指令
 - 享受巅峰级爆款成片效果                          - ★ 剔除独家商业机密与核心技巧库
```

### 1. 官方商用渠道（平台会员 / 算力点数）
- **链路特性**：请求由后端网关直连 AI 厂商公网 API，完全不经过任何用户的私有设备；
- **安全保障**：100% 注入完整原汁原味的 617 行顶级编导底座词，商业秘密被物理隔离在云端内网，泄露风险为 0；
- **商业价值**：作为商业软件的核心付费点，官方通道输出具有绝对碾压性的电影级质感。

### 2. 用户自建 NewAPI 渠道（免费 / 极客通道）
- **链路特性**：请求发往用户自建的内网服务器；
- **安全保障**：展开为**公开标准版编导提示词**（包含标准起承转合、时间戳与中文运镜格式约束，但剔除了独家导演风格、认知失调反差技巧与 5 维商业指引）；
- **用户体验**：用户的 NewAPI 能正常跑通分镜生成并返回可用脚本，但在 NewAPI 日志中永远只能抓到通用公开规则，无法窥探商业底牌。

---

## 五、 工程落地技术实现设计

### 1. 后端独立扩展专区设计
按照 `AGENTS.md` 规范 4.1，在 `media-lab/backend/internal/custom/` 下建立资产库：

```
media-lab/backend/internal/custom/promptvault/
├── embed.go                 # go:embed 静态资源打包（编译期直接打入可执行文件）
├── assets/
│   ├── base_director.md    # 原 617 行短视频工业编导底座词
│   ├── base_director_lite.md # 供第三方 NewAPI 使用的通用脱敏标准版
│   ├── video_reverse.txt   # 视频反推规则
│   └── image_optimizer.txt # 生图总监重塑提示词
├── directions.go            # 20+ 款短视频卡片的 5 维商业指引结构体
├── image_recipes.go         # 30+ 款生图配方的 instructions 与 avoid 规则表
└── expander.go              # 宏标记识别与内存替换引擎
```

### 2. 宏拦截展开器实现代码参考 (`expander.go`)

```go
package promptvault

import (
	"bytes"
	_ "embed"
	"net/url"
	"regexp"
	"strings"
)

//go:embed assets/base_director.md
var baseDirectorPrompt string

//go:embed assets/base_director_lite.md
var baseDirectorLitePrompt string

var macroRegex = regexp.MustCompile(`\{\{OPC_MACRO:([a-zA-Z0-9_-]+);([^}]+)\}\}`)

// ExpandMacros 在 HTTP 载荷发往上游大模型前，无缝完成宏展开
func ExpandMacros(body []byte, targetURL *url.URL) []byte {
	if !bytes.Contains(body, []byte("OPC_MACRO")) {
		return body // 无宏标记直接零开销放行
	}

	isPrivateUpstream := isPrivateHost(targetURL.Hostname())

	return macroRegex.ReplaceAllFunc(body, func(match []byte) []byte {
		sub := macroRegex.FindSubmatch(match)
		domain := string(sub[1])
		params := parseMacroParams(string(sub[2]))

		switch domain {
		case "video_director":
			return []byte(assembleDirectorPrompt(params, isPrivateUpstream))
		case "image_recipe":
			return []byte(assembleImageRecipe(params))
		case "image_optimize":
			return []byte(assembleImageOptimizer(params))
		default:
			return match
		}
	})
}
```

### 3. 原生文件侵入改动：`backend/internal/handler/custom_proxy.go`
严格使用隐式围栏标记包裹（改动仅 3 行）：

```go
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, requestLimit)
	body, err := io.ReadAll(c.Request.Body)
	if err != nil { ... }

	// @opc-adapter: prompt-vault-macro [start]
	body = promptvault.ExpandMacros(body, target)
	// @opc-adapter: prompt-vault-macro [end]

	upstreamReq, err := http.NewRequestWithContext(...)
```

### 4. 前端组装器瘦身改动：`video-workbench-prompt-assembler.ts`
在前端组装器中，不再读取本地 `.md` 文件，仅输出一行轻量宏标记：

```typescript
// @opc-feature: video-workbench-macro-prompt [start]
export function buildVideoWorkbenchPrompts(draft: VideoDraft, activeSkill?: VideoWorkbenchSkill | null): VideoWorkbenchPrompts {
    // 构造极简宏标记
    const macroToken = `{{OPC_MACRO:video_director;skill=${activeSkill?.id || "default"};dur=${draft.durationSec || 15};lang=${draft.targetLanguage || "zh"}}}`;
    
    // 纯粹拼接用户上下文与素材映射
    const dynamicContext = assembleUserDynamicContext(draft);
    
    return {
        systemPrompt: macroToken,
        userContent: dynamicContext,
    };
}
// @opc-feature: video-workbench-macro-prompt [end]
```

---

## 六、 部署与运行环境兼容性核查

| 部署场景 | 运行机制 | 商业安全表现 | 本地 API / NewAPI 兼容表现 |
| :--- | :--- | :--- | :--- |
| **云端 Docker 部署** | - Nginx 托管静态前端<br>- Go 后端运行在内网 Alpine 容器 | ★ 绝对物理隔离：用户拿不到后端镜像与二进制，抓包只看到宏 | - 云端官方模型流畅调用<br>- 用户公网 NewAPI 支持后端展开 |
| **本地电脑部署 (Desktop)** | - 单一 Go 原生二进制运行<br>- 剥离调试符号 (`-ldflags="-s -w"`) | ★ 机器码级防逆向：静态提取难度高，F12 浏览器抓包 0 泄露 | - 本地 Go 服务直接与 `127.0.0.1` 和 `192.168.x.x` 通信<br>- 彻底免疫浏览器 CORS 与 PNA 限制 |

---

## 七、 核心资产收敛与数据库对齐规范 (Database Alignment & Persistence Standards)

为了保证二开资产收敛到后端后，在**本地 SQLite** 与**云端 PostgreSQL** 两种数据库环境下恒定保持 100% 架构对齐，杜绝老用户版本升级时的“漏表/漏列/数据损坏”，必须严格落实以下六大数据库对齐铁律：

### 1. 双数据库驱动完全同构与平滑切换 (Dual Database Engine Parity)
- **零语法特异性**：所有新增或关联的 GORM 数据模型，必须 100% 同时兼容 `github.com/glebarez/sqlite`（本地纯 Go 驱动）与 `gorm.io/driver/postgres`（云端 PostgreSQL 驱动）；
- **标准字段类型约束**：
  - 严禁使用某一数据库专有的 DDL 语法（如 PostgreSQL 专有的 `jsonb` 复杂运算符、UUID 函数或 SQLite 专有的非标准类型）；
  - 主键一律采用 36 字节标准字符主键（`gorm:"primaryKey;size:36"`，如 `kernel.NewID()`）或标准整型；
  - 时间字段一律使用 `time.Time`，存储和计算严格采用 UTC 时区；
- **连接池差异化自动适配**：遵循 `database.ConfigurePool(db)` 规范，PostgreSQL 设置最大 30 连接，SQLite 设置最大 8 连接并强制启用 `_busy_timeout=5000&_journal_mode=WAL`。

### 2. 增量数据库版本迁移“三向核验”铁律 (Three-Way Migration Consistency Guardrail)
严格遵循 `AGENTS.md` 规范 4.5 项 4（增量数据库版本迁移漏表防范），若二开涉及新表持久化（如配方动态更新表、访问权限表）：
- **必须同步更新三处清单**：
  1. **全量初始化建表清单**：必须在 `media-lab/backend/internal/database/schema.go` 的 `Models()` 切片中显式注册新模型；
  2. **最新增量版本迁移流水线**：必须在 `media-lab/backend/internal/database/migrations.go` 中创建增量迁移版本（如 `migrateSchemaV16`），在事务中安全执行 `tx.AutoMigrate(&NewModel{})`；
  3. **SQLite $\to$ PostgreSQL 离线迁移核验器**：必须在 `media-lab/backend/cmd/migrate-sqlite-postgres/main.go` 的 `migrations()` 清单中显式加入 `migrateTable[NewModel]("table_name")`，保证单机版老数据一键上云核对时 0 漏表。

### 3. 多态存储与零 DDL 震荡原则 (Polymorphic Storage First)
- **草稿与多态扩展字段收敛**：
  - 生视频工作台草稿、生图工作台上传槽位参数、4 个二开画布算子生成的分析结果，**一律优先挂载在既有多态 JSON/TEXT 字段中**：
    - 画布项目：挂载在 `model.CanvasProject.Content` (TEXT/JSON)；
    - 生成记录：挂载在 `model.GenerationLog.ConfigJSON` 与 `PayloadJSON`；
- **业务收益**：当未来新增一款短视频卡片或调整一个参数时，**数据库 0 DDL 变动、0 增表风险**，彻底杜绝数据库迁移导致的服务中断。

### 4. 配方热加载与冷启动幂等播种体系 (Database Seeding & Hot-Reload Hierarchy)
商业配方与提示词金库采用**“三级加载与故障降级体系”**：
- **L1 内存缓存 (Memory Cache)**：进程内读写，微秒级响应；
- **L2 数据库动态覆盖 (Database Dynamic Override)**：
  - 若管理员在后台 Admin 面板动态调整了某个卡片的 5 维指引或补充提示词，优先读库生效，实现**免发版热更新**；
- **L3 go:embed 编译期固化 (Binary Hard-Fallback)**：
  - 当处于首次开箱、全新单机环境或数据库连接异常时，系统以 `//go:embed` 嵌入的底层资产为安全基底兜底运行，保证 100% 坚不可摧的高可用。
- **冷启动幂等播种**：在服务启动初始化阶段（`EnsureBuiltinSkills()` 与 `EnsureDefaultPromptTemplates()`），系统仅在数据库记录不存在时插入初始基准，绝不覆盖管理员已在线微调过的商业配方。

### 5. 生成历史“反向窃听”防范规范 (Anti-Leakage in Generation History)
- **安全盲区警示**：系统提供 `/api/generation-logs` 接口供用户在生图/生视频工作台查询历史记录，数据持久化于 `generation_logs` 表；
- **数据库防泄露铁律**：
  - 后端在向 `generation_logs` 写入记录时，`Prompt` 字段只允许保存**用户原始输入文字与宏标记标识（如 `{{OPC_MACRO:director;skill=...}}`）**；
  - **绝对禁止将服务端展开后的 617 行完整保密底座提示词回写到 `generation_logs.prompt` 或 `payload_json` 字段中**！
  - 彻底切断任何企图通过调用“历史记录读取 API”或逆向本地数据库反查完整商业提示词的攻击路径。

### 6. 运行时数据物理隔离规范 (Runtime Isolation)
- 严格遵循 `AGENTS.md` 规范 2.2：
  - 本地开发态与单机运行时，SQLite 数据库文件（`open_ai_canvas.db`）、日志与临时文件，**统一收敛存放于 `workspace-data/runtime/media-lab/` 或环境变量 `CANVAS_BACKEND_DATA_DIR`**；
  - **严禁**在 `media-lab/backend/` 或 `media-lab/web/` 等源码仓库内部生成任何临时数据库、缓存或垃圾日志文件，保持 Git 工作树恒定轻量。

---

## 八、 分阶段落地路线图 (Implementation Roadmap)

### Phase 1：后备金库建立与底座词迁入（预计 0.5 天）
- [ ] 创建 `media-lab/backend/internal/custom/promptvault/` 目录；
- [ ] 迁入 617 行 `base_director.md`，编写 `expander.go` 核心展开器；
- [ ] 在 `custom_proxy.go` 中添加围栏拦截代码，跑通 Go 单元测试。

### Phase 2：生视频工作台宏接入与前端脱敏（预计 0.5 天）
- [ ] 将 `video-skill-directions.ts` 迁至后端 `directions.go`；
- [ ] 改造 `video-workbench-prompt-assembler.ts` 输出宏标记；
- [ ] 从前端物理删除 `video-workbench-base-prompt.md`；
- [ ] 运行前端全量单测与 `verify-opc-fences.ps1` 围栏基准测试。

### Phase 3：生图配方与 4 大二开画布算子后端收敛（预计 1 天）
- [ ] 将生图 30 款技能的 `instructions` 与 `avoid` 移入后端 `image_recipes.go`；
- [ ] 前端 `builtin-skills.ts` 瘦身为纯展示元数据；
- [ ] 将二开带货分镜 61.4 KB 知识库 (`creation-assistant-skill-body.md`) 移入后端并挂接 `creation_script` 宏；
- [ ] 将二开复刻脚本 33.6 KB 知识库 (`creation-assistant-reference-script-body.md`) 移入后端并挂接 `reference_script` 宏；
- [ ] 将二开素材分析双阶段规则与 `ANALYSIS_JSON_SCHEMA` 移入后端并挂接 `material_analysis` 宏；
- [ ] 将二开视频反推规则 `video-reverse-prompt.txt` (6.7 KB) 移入后端并挂接 `video_reverse` 宏；
- [ ] 将模型适配规则库 (`prompt-optimizer.ts`) 移入后端；
- [ ] 验证端侧抽帧拼版与后端宏展开的端到端生成效果。

### Phase 4：双轨防线与安全交付验收（预计 0.5 天）
- [ ] 编写私有上游与公网商用上游的双轨分流测试用例；
- [ ] 在 DevTools 与本地代理抓包工具下进行全链路渗透核验；
- [ ] 提交 Monorepo 规范 Commit 并更新基准。
