---
name: 电商商品图生成工作流
description: 基于真实商品参考图生成忠实的电商主图、卖点图、场景图和详情页视觉。支持白底图、场景图、细节质感图与多角度拆解。
metadata:
  version: "1.0.0"
  author: 智影
  owner: yingce-system
  skillId: "zy-ecom-image-workflow"
  tag: ecommerce
  sortWeight: 810
  source: 3
---

# 电商商品图生成工作流

## 身份与使命

你是**商品影像导演**。基于真实商品参考图锁定 SKU 身份，先配置整套主图、卖点图和场景图，再批量生成、统一验收，并只重做不合格槽位。

## 使用边界

- 用于商品主图、卖点图、场景图和小型电商套图。
- 没有真实商品参考图时停止；不凭描述补造产品。
- Amazon 专用 Listing 规则转到 `amazon-listing-images`；页面代码转到 `product-page-design`。

## 执行工作流

1. 确认真正可用的商品参考图。
2. 提取形状、颜色、材质、Logo、标签、结构和比例身份锁。
3. 按实际需求规划独立图片槽位，不为了凑数扩张套图。
4. 在工作流画布先复用商品素材并创建全部生成器，再通过原生 `run-batch` 并发生成；最大 200 个任务、最大 200 并发。
5. 等整批结束后统一检查商品一致性、背景差异、声明依据和渠道裁切，只重跑失败或不合格的原节点。

## 确认与回退

- 参考图缺失、商品结构看不清或卖点没有依据时暂停确认。
- 模型不支持参考图时停止，不声称已保证商品一致性。
- 某张图失败只更新并重做该槽位；已通过槽位不得重跑。商品身份变化时回退所有受影响图片。
- 任一任务返回积分不足或会员限制时停止尚未启动的任务并终止本回合，不得换模型或供应商绕过限制。

## 领域检查

- 商品外形、颜色、材质、Logo、标签和配件与参考一致。
- 每张图只承担一个主要购买问题。
- 创意套图每张背景至少改变三个有意义属性，不能只换颜色。
- 平台强制白底 MAIN 图优先合规，背景差异应用于辅图。
- 未生成认证、尺寸、性能或成分等无依据声明。

Create a compact ecommerce image set from real product reference imagery.
This V1 skill is intentionally narrow: it supports **reference-product mode
only**. If the user only describes a product and does not provide a product
photo, ask for one and stop. Do not create a brief-only concept product in
this version.

## Resource map

```text
ecommerce-image-workflow/
|-- SKILL.md
|-- assets/
|   `-- example.html
`-- references/
    `-- checklist.md
```

## What this skill produces

By default, generate three ecommerce-ready image assets for one product:

1. **Main image** - clean product-first packshot on white or soft neutral
   background.
2. **Feature image** - one selling point shown clearly with controlled callout
   space, without relying on tiny unreadable in-image text.
3. **Lifestyle image** - product shown in a plausible use context while keeping
   the product faithful to the reference.

Also create:

- `image-manifest.json` describing reference inputs, slots, prompts, outputs,
  aspect ratios, and fidelity notes.
- `ecommerce-gallery.html` as a small preview gallery linking the generated
  files and summarizing the image roles.

## Input contract

Required:

- At least one uploaded product reference image in the active project.

Ask only for missing essentials:

- Product name or short label if it is not obvious.
- Main selling point if the feature image cannot be inferred safely.
- Target marketplace or aspect only if the user asks for platform-specific
  framing.

Do not ask broad discovery questions. Keep the workflow moving.

## Workflow

### Step 0 - Confirm reference-product mode

Before planning, verify that the current project includes a real product
reference image.

If no product image is available, reply:

> Please upload at least one product reference image first. This V1 workflow
> preserves a real product from reference photos; brief-only concept generation
> is deferred to a later version.

Then stop.

### Step 1 - Extract product identity anchors

Inspect the reference image and write a short internal identity lock:

- Product category and form factor.
- Shape and silhouette.
- Primary colors and materials.
- Logo, label, pattern, fasteners, ports, straps, handles, or other fixed
  details.
- Scale cues and proportions.
- What must not change.

Use these anchors in every generation prompt.

### Step 2 - Build a three-slot shot plan

Create a compact shot plan before dispatch:

| Slot | Default aspect | Goal |
|---|---:|---|
| main | 1:1 | Product-first marketplace image on white or soft neutral background |
| feature | 4:5 | One clear selling point with close-up detail or simple callout space |
| lifestyle | 4:5 | Realistic use context with the product still visually faithful |

If the project metadata provides `imageAspect`, use it when the user expects a
single aspect across the set. Otherwise use the slot defaults above.

### Step 3 - Compose prompts with a fidelity lock

Every prompt must include this product fidelity instruction near the top:

```text
Preserve the exact product identity from the reference image: shape,
silhouette, color, material, logo/label placement, visible construction
details, and proportions. Do not redesign the product. Do not add, remove,
or relocate product features.
```

Then add slot-specific instructions:

#### Main image prompt

- Product centered and fully visible.
- White, off-white, or very light grey background.
- Soft studio lighting with clean shadow.
- No props unless the user asked for them.
- No in-frame marketing text.
- When the user requests multiple creative main-image variants, give every
  image a visibly different background concept. Vary at least three of:
  environment, surface/material, lighting direction or time, camera/depth,
  spatial structure, and supporting props. A palette-only change is not enough.
- Exception: a marketplace MAIN slot that mandates pure white must follow the
  current marketplace rule. Apply background diversity to its secondary images,
  not by violating the MAIN requirement.

#### Feature image prompt

- Focus on one user-provided or safely inferred feature.
- Use close-up composition, cutaway-style crop, or clean negative space for
  later designer-added labels.
- Keep the product visually balanced in the frame. If no explicit callout
  structure is being generated, center the product. If label space is needed,
  offset the product only slightly and make the empty space feel intentional.
- Do not invent certifications, performance numbers, materials, or claims.
- Avoid tiny rendered text; leave label space instead.

#### Lifestyle image prompt

- Use a realistic environment matched to the product category.
- Keep the product the focal point.
- Show human interaction only if it helps explain use and does not obscure the
  product.
- Preserve product scale and structure.

### Step 4 - Configure the whole canvas set, then dispatch one native batch

When Workflow Project ID and Canvas Session ID are available, use
`canvas_command.py`. Do not call provider APIs, an upstream Open Design command,
or `智影媒体服务调度器` from the workflow canvas.

1. Run `snapshot` and select only an enabled reference-capable image model.
2. Reuse the existing product image node. Connect that same node to every
   generator that needs the product reference; do not duplicate the material.
3. Create or update all slot generators before starting any generation. Keep
   each final provider prompt visible in the generator input, together with its
   model, aspect, resolution, preset, camera, and model-specific parameters.
4. Submit all independent slots through one all-settled `run-batch` command:

```json
// 智影电商工作台批量声明式生成 payload (生图工作台 / 画布 generationItems)
{
  "mode": "image",
  "concurrency": 10,
  "items": [
    {"nodeId": "MAIN_01", "prompt": "主图白底合规提示词...", "aspectRatio": "1:1", "modelId": "gpt-image-2.5"},
    {"nodeId": "INFO_02", "prompt": "卖点信息图提示词...", "aspectRatio": "1:1", "modelId": "gpt-image-2.5"},
    {"nodeId": "SCENE_03", "prompt": "生活使用场景图提示词...", "aspectRatio": "1:1", "modelId": "flux-1-dev"},
    {"nodeId": "DETAIL_04", "prompt": "材质微距细节图提示词...", "aspectRatio": "1:1", "modelId": "gpt-image-2.5"},
    {"nodeId": "SIZE_05", "prompt": "尺寸与包装规范图提示词...", "aspectRatio": "1:1", "modelId": "gpt-image-2.5"},
    {"nodeId": "COMPARE_06", "prompt": "竞品对比优势图提示词...", "aspectRatio": "1:1", "modelId": "gpt-image-2.5"}
  ]
}
```

`items` may contain at most 200 unique node IDs. `concurrency` is clamped to
1-200 and never exceeds the item count. Each item invokes the same native
generator send action used by the canvas, so membership checks, points billing,
model parameters, provider routing, polling, and durable OSS result placement
remain authoritative.

Wait for the complete batch before quality review. A successful submission is
not a finished image; only accept a slot after its original node contains a
public output URL.

If no workflow canvas bridge is available, use the installed 智影
`智影生图工作台` as the fallback and never call a supplier directly:

```yaml
# 智影生图工作台单卡提示词规范
image_slot_task:
  workbench: "智影生图工作台 (/image)"
  aspect_ratio: "1:1 (电商方形) / 3:4 (社媒种草)"
  reference_images: ["PRODUCT_REFERENCE"]
  prompt: "FULL_SLOT_PROMPT"
  model: "gpt-image-2.5"
```

If the active image model cannot use references, stop and explain that this
workflow needs a reference-capable image path for product fidelity.

### Step 4.1 - Review the batch and retry only rejected slots

Compare all outputs together for product identity, role separation, crop,
claims, and background diversity. Mark each node `accept` or `retry`.

- Never rerun an accepted node.
- For a rejected node, update its prompt/model/parameters first and reuse the
  same generator node.
- Submit only rejected node IDs in a new `run-batch`, with `force: true` on each
  deliberate retry.
- A single supplier failure must not cancel unrelated successful slots.
- An insufficient-points or membership denial stops unlaunched work and the
  current 智影 turn.

### Step 5 - Write `image-manifest.json`

After generation, create a project file named `image-manifest.json`:

```json
{
  "workflow": "ecommerce-image-workflow",
  "mode": "reference-product",
  "productName": "Example product",
  "referenceImages": ["reference-product.png"],
  "fidelityNotes": [
    "Preserve product identity, color, material, construction, and proportions.",
    "Do not treat these outputs as platform-compliance proof without human review."
  ],
  "slots": [
    {
      "id": "main",
      "role": "marketplace packshot",
      "aspect": "1:1",
      "outputUrl": "https://example.invalid/example-product-main.png",
      "promptSummary": "Centered product-first packshot on a clean neutral background."
    },
    {
      "id": "feature",
      "role": "single feature highlight",
      "aspect": "4:5",
      "outputUrl": "https://example.invalid/example-product-feature.png",
      "promptSummary": "Close-up or negative-space composition for one verified selling point."
    },
    {
      "id": "lifestyle",
      "role": "usage context",
      "aspect": "4:5",
      "outputUrl": "https://example.invalid/example-product-lifestyle.png",
      "promptSummary": "Realistic scene with the product as the focal point."
    }
  ]
}
```

Keep the manifest honest. If a detail is unknown, write `null` or a short note
instead of inventing claims.

### Step 6 - Write `ecommerce-gallery.html`

Create a simple single-file HTML gallery that:

- Shows the reference image first.
- Shows the three generated slots with their role names.
- Lists product-fidelity notes.
- Links to `image-manifest.json` and the returned media URLs.
- Uses system fonts only; no CDN imports.

### Step 7 - Hand off

Reply with:

- The generated media URLs.
- A one-sentence summary of the fidelity lock used.
- A reminder that marketplace-specific compliance, final text overlays, and
  claim/legal review remain human review steps.

Do not emit an `<artifact>` tag.

## Hard rules

- V1 requires real product reference imagery. No brief-only concept products.
- One product per run.
- Default to exactly three slots: main, feature, lifestyle.
- Preserve the product; do not redesign it.
- Do not invent claims, certifications, measurements, ingredients, or
  performance data.
- On the workflow canvas, prepare every node first and use native `run-batch`;
  maximum 200 tasks and 200 concurrent native sends.
- Preserve native membership checks, points billing, model parameters, provider
  routing, polling, and OSS persistence; do not call provider APIs directly.
- Review the whole batch together and retry only failed or non-compliant
  original nodes with a revised configuration and `force: true`.
- Multi-image creative sets must use visibly different backgrounds. Change at
  least three meaningful background properties, not only color.
- Always create `image-manifest.json` after generation.
- Run `references/checklist.md` before handoff.

## Source and modifications

Adapted for 智影 from `nexu-io/open-design`,
`skills/ecommerce-image-workflow` (Apache License 2.0). 智影 changed the
frontmatter, media dispatcher, output recording, and multi-image background
quality contract.
