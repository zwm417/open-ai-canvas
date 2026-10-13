---
name: SaaS产品演示宣传片
description: 使用 Remotion 制作 20–45 秒商用 SaaS 产品宣传片。用于新功能发布、官网 Hero 视频、社媒展示；覆盖分镜脚本、页面录屏动效、运镜与配乐卡点。
metadata:
  version: "1.0.0"
  author: 智影
  owner: yingce-system
  skillId: "zy-saas-product-demo"
  tag: ecommerce
  sortWeight: 810
  source: 3
---

# SaaS产品演示宣传片

你是**商用 SaaS 产品宣传片导演与 视听动效与视频制作导演**。使用真实、已脱敏的产品素材、品牌系统、参考片风格拆解和节拍分析，交付可发布、可复现的产品宣传成片。

## 使用边界

- 用于 20–45 秒 SaaS 产品片、功能发布片、应用演示、品牌 launch film 和横竖版社媒宣传片。
- 真实可运行产品优先使用实际页面截图；只有产品尚无界面且用户确认时，才使用明确标注的示意 UI。
- 任何 AI 生图、AI 生视频或 AI 音频补充素材必须通过智影原生工作台与画布链路，禁止直连外部供应商 API、SDK、CLI 或供应商密钥。
- 在智影环境中不得运行本 Skill 自带的 Gemini API/CLI 直连脚本；参考片分析使用项目现有理解能力、浏览器只读检查或人工拆解。此规则覆盖下方旧版参考中的 Gemini 直连说明。

## 执行工作流

1. 收集真实产品入口、交付平台、时长画幅、Logo、品牌色、字体、卖点证据、可选配乐和参考片。
2. 提取产品设计系统，完成四幕脚本、逐屏文案、参考片导演拆解与镜头规格。
3. 在分镜阶段确定声音意图及字幕原文/起止时间；用户提供指定配乐，或原生背景音乐验收不合格需要替换时，再分析 BGM 节拍并把场景边界、点击和卡片落点对齐到节拍网格。
4. 若需要 AI 补充素材，只使用系统媒体桥：

```yaml
# 智影原生工作台生成任务规范
image_generation:
  workbench: "智影生图工作台 (/image) 或 画布生图节点"
  prompt: "完整自包含关键帧提示词（含主体、场景、构图、光影材质）"
  recommended_models: ["gpt-image-2.5", "flux-1-schnell", "flux-1-dev"]
video_generation:
  workbench: "智影生视频工作台 (/video) 或 画布视频节点"
  prompt: "逐镜头运镜与动作提示词（包含机位轨迹、动态物理、光影变化）"
  recommended_models: ["seedance-2.5", "minimax-h3"]
  duration: "3-15s (根据叙事节拍，Seedance 2.5 最长支持 30s)"
  generate_audio: true # 开启原生音画同步（对白、音效与音乐）
```

5. 以 Remotion 分镜头实现，先渲染独立场景静帧，再渲染整片；检查真实页面、点击位置、品牌文案、节拍和安全区。
6. 交付 MP4、封面和可重渲染工程；需要横竖双版时共享内容事实但分别排版，不做简单裁切。

## 确认与回退

- 用户已明确“一键成片”、交付规格和可用素材时直接执行，不重复询问已知信息。
- 需要捏造 UI、卖点、客户数据、评价、价格或效果承诺时必须停下确认，不得自行补全商业事实。
- 智影工作台 或 Remotion 失败时保留已完成资产并报告具体阶段；禁止改用外部供应商绕过系统链路。

## 领域检查

- 核验截图来自当前产品、敏感数据已脱敏、Logo/颜色/字体/URL 与品牌事实一致。
- 核验每个镜头只有一个主要信息任务，点击光标落在正确控件，运动与节拍有因果关系。
- 核验移动端安全区、字幕可读性、音乐授权、CTA 和所有产品主张。
- 最终必须检查关键静帧、完整播放、音画同步和导出参数，不能只以源码完成代替成片验收。

End-to-end workflow for shipping an audible, beat-aware SaaS product film in Remotion. Covers native-audio AI inserts, beat-locked horizontal demos, vertical reels, and films with collage b-roll layers; silent output is not the default production path.

The skill is opinionated about three things: **assets**, **vibe**, **beats**. Skip any one and you produce a generic Canva-style motion graphics reel that looks like every other SaaS demo. The discipline is what makes the difference.

These are *strong recommendations* rather than hard rules. Most productions follow them; some break them with intent (e.g. voice-over-driven films where beat-sync would fight the VO). When you break a rule, do it knowingly.

---

## Prerequisites

Before starting, verify these are in place. The first one is genuinely required; the others are strong recommendations with documented fallbacks.

1. **Remotion installed** (required). `@remotion/cli` 4.0.x + `@remotion/google-fonts` + React 19. See `references/project-scaffold.md` for the exact minimal `package.json` / `tsconfig.json` / `remotion.config.ts` - never run `npx create-video` inside an existing git repo (it blocks on an arrow-key prompt).

2. **Super Powers plugin (strongly recommended, not required).** When available, this skill orchestrates `superpowers:using-superpowers`, `superpowers:brainstorming` (with visual companion), `superpowers:writing-plans`, and `superpowers:subagent-driven-development`. They give you HTML mockups in the browser for layout decisions, formal plan documents, and the implementer + reviewer subagent loop.

   **If superpowers isn't installed**, the skill still works - the workflow becomes more conversational and a bit slower. Brainstorming becomes inline dialogue (no browser companion); plans are written directly in the chat; scenes are implemented inline rather than via dispatched subagents. The three pillars (assets / vibe / beats) plus b-roll, schematic UI, click positioning, writing style, and the scripts in `scripts/` all work the same. Don't decline the work because of a missing plugin - adapt and proceed.

3. **Python 3 + librosa available.** Beat detection runs `scripts/detect-beats.py` which imports `librosa`. If not installed, run `pip install --break-system-packages librosa numpy soundfile` and tell the user - don't do it silently.

4. **For reference-video analysis (Pillar 2):** use the current 智影 智影/browser
   understanding path. If direct video inspection is unavailable, use ffmpeg to extract a
   representative frame/contact sheet and analyze it locally. Do not request provider keys or
   run the disabled external-provider wrapper. See `references/reference-video-vibe.md` for the
   directorial breakdown schema.

Run `references/prereq-check.md` as your first move in a new session.

---

## The three pillars

These are the high-leverage activities. Skipping one to "save time" almost always costs more time downstream.

### Pillar 1 - Asset intake onboarding

Before anything else, run the structured questionnaire in `assets/prompt-templates/asset-intake-questionnaire.md`. It asks for:

- Aspect ratio (16:9 horizontal, 9:16 vertical, or both in parallel - see `references/vertical-port.md` if both)
- Duration in seconds (20-45s recommended)
- Logo - SVG preferred. If PNG-only, capture native dimensions to prevent pixelation when scaled up.
- Brand hex colors (primary accent + 3-6 supporting pastels)
- Font stack (all must be on Google Fonts)
- Copy / script - prefer a user-supplied draft over generating one. If they have no script, see `references/script-development.md`.
- Voiceover (optional)
- Soundtrack file - optional. Native-audio video generation remains the default; use a supplied or authorized replacement track only when the brief requires a specific score or the generated background music fails review.

Reference `references/asset-intake.md` for the full intake flow including the partial-asset minimum-viable set, naming hygiene on copy-in, and the asset-upscaling pixelation check.

### Pillar 2 - Reference-video vibe workflow

Before writing scenes, ask the user for **2-3 YouTube reference videos** whose vibe they want. Then produce a director's breakdown for each.

Use the 智影 path described in `references/reference-video-vibe.md`: inspect the video with
the current 智影/browser capability, or extract representative frames with ffmpeg and analyze
the contact sheet locally. Save the resulting breakdown to `references/vibe-<slug>.md` in the
working project. Never ask for or use a supplier API key.

The **directorial verb vocabulary** (push-through, whip-pan, V-cut pull-back, ink-mask, match-cut zoom) is the most load-bearing output - it gives you specific motion primitives to build around.

### Pillar 3 - Native audio and conditional soundtrack beat-sync

Every AI-generated clip must carry synchronized native sound from the storyboard. When a user-supplied score is mandatory, or native background music fails review and needs replacement, scene boundaries should land on snares (the rhetorical "drum hit" feel) and internal events should land on kicks or snares.

The replacement/specified-soundtrack pipeline (skip when the accepted native soundtrack is retained):

1. Run `scripts/detect-beats.py <soundtrack.mp3> --fps 30 --out beats.json`. Emits BPM, first-kick frame, snare timestamps + frames.
2. Ingest into a single timing constants object (see `assets/code-templates/theme-v2.ts`). Every scene `<Sequence from={...} durationInFrames={...}>` pulls from this.
3. After Phase 6 (scenes built), run `scripts/align-internal-events.py` against beats.json + a list of in-scene events to nudge them onto nearest beats within ±6 frames. This is the second-highest-leverage iteration after the initial render - the audience feels off-beat internal events as "rhythm sometimes off" without being able to point at why.
4. Use `isSnare(n)` / `isKick(n)` helpers to assert in dev mode.
5. Run `scripts/check-typing-budget.py` against any TypedText/TypedChars to verify it fits within scene duration. Cuts off-screen typing before it ships.

Full math, helpers, internal-event alignment, and the typing-budget check in `references/beat-sync.md`.

---

## Adjacent capabilities - when the basics aren't enough

These cover situations beyond the standard "all-motion-graphics, just-record-a-screenshot" SaaS demo. Read the relevant reference when the user's situation needs it.

### Script development - when the user has no script

Most users come in with a vague product idea, not a finished screen-by-screen. `references/script-development.md` walks through a structured dialogue flow that produces a 4-act outline + locked screen-by-screen + locked-copy reference page, ready to feed into the spec doc.

### B-roll integration - when the film uses live-action or collage layers

If the user has stock footage, collage clips, or any video they want as a backdrop layer, use `references/b-roll-integration.md` and the `BRollLayer` template. B-roll can be a full-opacity backdrop or a low-opacity texture; the primitive handles trim, fade, blend modes, and fps-correct timing.

(Previous versions of this skill recommended sending live-action work to Premiere/DaVinci. That's wrong when the b-roll is being used as a *layer* under motion graphics - Remotion handles this well and keeping the production in one tool is a productivity win.)

### Schematic UI fidelity - when the product has no real UI to record

If the product is a Chrome extension, an API, or early-stage and there's no real product UI to screenshot, `references/schematic-ui-fidelity.md` covers how to invent schematic UIs that read as polished without infringing on real platforms (LinkedIn, Gmail, Slack). Three reference patterns: profile card, email composer, API panel - code templates in `assets/code-templates/Schematic*.tsx`.

### Click positioning - the #1 iteration churn pain point

Cursor clicks missing buttons is the most common user complaint across productions. `references/click-positioning.md` covers three approaches (refs, computed-position constants, debug overlay) - pick one upfront. The cost of getting this wrong is multiple full re-render cycles per scene.

### Writing style - keep AI-tells out of user-facing copy

Em-dashes, curly quotes, and certain phrasing tics scream "AI-generated." `references/writing-style.md` is the default style guide with a pre-render grep check that catches these. If the user has their own brand-voice guide, prefer that.

---

## Ideal sequence

The full end-to-end flow. See `references/ideal-sequence.md` for the annotated version with rationale.

1. **Gather inputs first, write code last.** Run the asset intake questionnaire.
2. **Develop the script** if the user doesn't have one - `references/script-development.md`.
3. **Produce reference-video breakdowns** with 智影 智影/browser inspection or local ffmpeg frame extraction.
4. **Detect beats and write the timing constants object.** `scripts/detect-beats.py` → `theme-v2.ts`. Every scene start derives from beats.
5. **Scaffold Remotion manually.** Minimal `package.json` / `tsconfig.json` / `remotion.config.ts`. Never `npx create-video` inside a git repo.
6. **Register per-scene debug compositions in Root.tsx.** Essential speed-up. Scrubbing one 5-second scene is 30x faster than the full master.
7. **Load every font at `Root.tsx` top level** with `subsets: ["latin"]`.
8. **Use hyphens in composition IDs** (`v2-Scene06`, never `v2_Scene06`).
9. **Invoke `superpowers:brainstorming` with visual companion** for style/layout decisions. HTML mockups beat prose every time.
10. **Write the spec doc.** `docs/superpowers/specs/YYYY-MM-DD-<name>-design.md`. Include a schematic-UI fidelity section if any are needed.
11. **Self-review the spec, then user-approves it.** No code until green light.
12. **Invoke `superpowers:writing-plans`.** Plan-template hygiene check before dispatching (see `references/project-scaffold.md`).
13. **Build animation primitives first** (TypedText, MaskReveal, PopIn, Cursor, ZoomPunch, FloatingElements, BRollLayer, Counter, IceCrack as needed). Then schematic UI cards. Then scenes. Then master.
14. **Invoke `superpowers:subagent-driven-development`.** Cap subagent batches at 3-4 files per dispatch - larger batches sometimes run out of context mid-task. See `references/iteration-playbook.md`.
15. **Spot-render Scene 1 alone.** Establish the style. Get user approval before the rest.
16. **Iterate in waves.** Cap each wave at 5-8 fixes. Run the internal-event alignment pass once after the baseline render - that single pass tightens the rhythm noticeably.
17. **Master-render at publish quality.** `--crf=14 --image-format=png` (HD) or `--crf=15 --image-format=png --scale=2` (4K). See `references/render-export.md`.
18. **Spot-check against the beat map at 0.5x speed.**

---

## References index

The `references/` directory contains the depth. Load only what you need for the current phase.

- `ideal-sequence.md` - the full annotated flow, with rationale
- `prereq-check.md` - what to verify before starting
- `asset-intake.md` - full intake flow, partial-asset fallback, asset upscaling check, naming hygiene
- `script-development.md` - screen-by-screen methodology when the user has no script
- `reference-video-vibe.md` - 智影-safe reference-video analysis and director-breakdown schema
- `beat-sync.md` - beat-grid math, scene-boundary rule, internal-event alignment, typing-budget check
- `project-scaffold.md` - minimal Remotion setup, commit checklist, plan-template hygiene, .gitignore essentials
- `animation-patterns.md` - TypedText, MaskReveal, PopIn, ZoomPunch, FloatingElements, plus extensions
- `b-roll-integration.md` - `BRollLayer` patterns, opacity/blend treatments, render perf
- `schematic-ui-fidelity.md` - designing fake UI that reads as polished
- `click-positioning.md` - three approaches to keep cursor clicks landing on the right targets
- `writing-style.md` - em-dashes and other AI-tells to avoid in on-screen copy
- `cursor-math.md` - hotspot offset, keypoints, scale-ratio transform
- `iteration-playbook.md` - wave structure, batch reviews, subagent batching, Studio hot-reload restarts
- `render-export.md` - HD/4K render commands, CRF rationale
- `gotchas.md` - composition ID underscores, font warnings, italic loading, MaskReveal scale footgun
- `vertical-port.md` - 9:16 reel porting discipline

## Assets

- `assets/prompt-templates/` - fill-in templates for asset intake, spec docs, beat sheets
- `assets/code-templates/` - battle-tested components (theme constants, easings, Cursor, MaskReveal, TypedText, PopIn, ZoomPunch, FloatingElements, BRollLayer, Counter, IceCrack, SchematicProfileCard, SchematicEmailComposer, SchematicApiPanel, Act2Master, Act2MasterVertical)

## Scripts

- `scripts/detect-beats.py` - librosa-powered beat tracking. Emits BPM, first kick, snare/kick frames at target fps.
- `scripts/analyze-reference-video.sh` - disabled guard that prevents direct provider calls; use `scripts/reference-video-prompt.md` only as a breakdown checklist.
- `scripts/align-internal-events.py` - beat-align in-scene events within ±tolerance frames.
- `scripts/check-typing-budget.py` - verify TypedText/TypedChars fits in scene duration before render.

---

## When the skill should NOT be used

- **Existing Remotion project deep iteration.** If the user is 20+ commits into a film and asking for wave N+1 tweaks, don't re-run intake. Load `references/iteration-playbook.md` and `references/beat-sync.md` and go.
- **Non-SaaS demos.** Event recap, testimonial montage, tutorial screencast - the beat-sync + product-UI-card patterns don't apply cleanly.
- **Documentary or talking-head footage as the subject.** This skill handles b-roll as a *layer* under motion graphics. If live-action is the subject of the film (interviews, unboxing, walkthroughs), use a non-linear editor like Premiere, DaVinci, or Final Cut.
- **Voiceover-first videos.** If the script drives pacing, the beat-grid system fights the VO. Skill will fall back to frame-budget mode without beat-sync - tell the user explicitly.

---

## Output contract

A successful run produces:

- A working Remotion project with a master composition and per-scene debug compositions registered.
- `docs/superpowers/specs/YYYY-MM-DD-<name>-design.md` (spec) and `docs/superpowers/plans/YYYY-MM-DD-<name>.md` (plan).
- `references/vibe-<name>.md` for each reference video (in the user's repo, not this skill's).
- `beats.json` + `theme-v2.ts` timing constants wired into scenes (committed).
- HD MP4 (1920x1080 or 1080x1920, CRF 14).
- Optional 4K MP4 (`--scale=2`, CRF 15).
- Thumbnail JPG at an expressive frame.

The user should be able to re-render any scene independently, edit a single timing constant to re-flow the whole film, and confidently ship to LinkedIn / Instagram / YouTube Shorts without a second pass.
## 场景空场硬规则

- 所有场景主图和场景参考图必须是干净空场：不得出现角色、人物、动物、吉祥物、身体局部、角色倒影或角色影子。
- 场景资产只锁定空间拓扑、建筑、家具、中性道具、材质、天气、时间和基础光线；角色只能在分镜/关键帧阶段按镜头需要加入。
- 发现表演主体时拒绝并重做该场景图，不得批准或导入分镜。

## 统一原生有声视频协议

- 每次视频生成都必须选择支持原生同步声音的模型和模式，并向原生生成器传入 `generateAudio=true`；默认禁止先生成无声视频再靠后期补齐声音。
- 在分镜脚本阶段确定每镜的对白或旁白、人声表演、环境声、动作拟音、音乐意图，以及需要展示时的字幕原文、开始时间和结束时间；逐镜提示词和视频节点必须携带这些数据。
- 若当前模型或模式不支持原生有声，提交前自动切换到兼容模型或模式；不得以静音结果冒充完成。
- 后期只负责最终剪辑和拼接，或原生背景音乐明显不符合成片时的替换与调整；字幕文本与时间轴不得到后期才临时编写。
