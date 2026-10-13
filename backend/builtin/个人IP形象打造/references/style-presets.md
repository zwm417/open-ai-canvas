# Style Preset Catalog

## Catalog Rule

Present only presets marked `active`. Never invent missing presets or use a generic fallback without telling the user. Store preset reference images under `assets/style-presets/<preset-id>/` only when the user explicitly authorizes adding them to the skill.

Each preset must include:

- Stable lowercase hyphenated preset ID.
- Chinese display name.
- Status: active or draft.
- One or more relative reference asset paths.
- Best uses.
- Complete style fingerprint covering line, shape, proportion, rendering, palette, lighting, texture, composition, background, and sticker-outline behavior.
- Identity-preservation rules.
- Elements to ignore from the reference.
- Negative constraints.

## Active Presets

### caihui-feng — 彩绘风

- Status: active
- Reference assets:
  - `assets/style-presets/caihui-feng/reference-01.png`
  - `assets/style-presets/caihui-feng/reference-02.png`
  - `assets/style-presets/caihui-feng/reference-03.png`
- Preview asset: `assets/style-presets/caihui-feng/reference-01.png`
- Tags: 彩绘卡通、暖色纸张、圆润角色、柔和表情
- Best uses: personal IP avatars, character sheets, chat stickers, expression packs, cozy social content
- Line: organic dark-brown contour, medium-to-thick rounded outline, occasional softer interior marks, no hard geometric vector edges.
- Shape: rounded chibi silhouette, oversized head, simplified facial features, compact limbs, soft hair masses, readable expressive eyes.
- Proportion: approximately 1:2 to 1:3 head-to-body ratio for full-body characters; portrait variants may use a larger head while retaining the same compact silhouette.
- Rendering/material: hand-painted digital illustration with watercolor, gouache, crayon, and colored-pencil cues; visible paper grain; matte pigment rather than glossy 3D or flat vector fill.
- Palette: warm cream and off-white bases; chocolate and chestnut browns; terracotta, peach, muted coral, muted sage, ochre, and soft orange accents; low-to-medium saturation and gentle contrast.
- Lighting: soft diffuse studio light, minimal cast shadow, warm ambient glow, no sharp rim light or dramatic cinematic contrast.
- Texture: fine paper grain, lightly uneven pigment, soft color transitions, subtle dry-brush edges, restrained speckles.
- Composition: centered character, generous whitespace, simple uncluttered framing, optional small decorative marks or soft ground shape; no complex scene required.
- Background: warm cream, paper white, or very pale neutral wash; keep the background quiet enough for the silhouette to read.
- Sticker outline: preserve the organic dark-brown contour; use a cream or white sticker border only when needed for separation, never a glossy heavy die-cut effect.
- Preserve from identity reference: the person's face shape, hairstyle, eyewear, facial hair, signature clothing cues, body proportion, and one memorable accessory when visible and authorized.
- Ignore from style reference: the depicted characters' identities, exact hair/face combinations, clothing text such as `FLOKIDA`, cats, props, decorative symbols, and the original poses or compositions.
- Negative constraints: no photorealism, no hard 3D plastic, no neon palette, no complex background, no copied character, no logos, no watermarks, no accidental text, no extra characters unless requested.

### xian-tiao-feng — 线条风

- Status: active
- Reference assets:
  - `assets/style-presets/xian-tiao-feng/reference-01.png`
  - `assets/style-presets/xian-tiao-feng/reference-02.png`
- Preview asset: `assets/style-presets/xian-tiao-feng/reference-01.png`
- Tags: 黑白线稿、极简五官、手绘人物、表情优先
- Best uses: expressive social avatars, simple chat stickers, editorial profile illustrations, minimalist personal identity
- Line: thin black hand-drawn contour with occasional solid black hair or clothing masses; uneven organic pen marks, no polished vector strokes.
- Shape: minimal oval and elongated face shapes, simplified hair blocks, intentionally quirky facial-feature placement, clear expressive silhouettes.
- Proportion: portrait-first and head-led; full-body variants retain a simple long-limbed, low-detail silhouette rather than realistic anatomy.
- Rendering/material: monochrome ink drawing on a clean paper-like ground; flat fills only where they improve the graphic rhythm.
- Palette: black and off-white only; use contrast rather than color, with no colored accents unless the user explicitly requests a restrained adaptation.
- Lighting: no rendered lighting; form is conveyed through line, negative space, and solid black shapes.
- Texture: subtle pen-and-paper irregularity, otherwise clean and uncluttered.
- Composition: centered head or bust, ample whitespace, direct readable face, optional simple sticker-like grouping; do not copy reference grids.
- Background: pure white, warm off-white, or transparent-looking plain background.
- Sticker outline: black contour is the illustration boundary; avoid glossy die-cut borders.
- Preserve from identity reference: face shape, hairstyle, glasses, facial hair, signature clothing cue, body proportion, and one memorable accessory when visible and authorized.
- Ignore from style reference: depicted people, exact facial combinations, the English heading, reference layouts, and every original pose.
- Negative constraints: no photorealism, no 3D rendering, no detailed scenery, no color-heavy palette, no logos, no watermark, no text, no copied character.

### 3d-feng — 3D风

- Status: active
- Reference assets:
  - `assets/style-presets/3d-feng/reference-01.png`
  - `assets/style-presets/3d-feng/reference-02.png`
  - `assets/style-presets/3d-feng/reference-03.png`
- Preview asset: `assets/style-presets/3d-feng/reference-01.png`
- Tags: 3D卡通、潮流配饰、毛线材质、棚拍肖像
- Best uses: polished social avatars, creator personas, fashion-forward representative characters, promotional profile art
- Line: no ink outline; forms are defined by sculpted edges, soft occlusion, controlled highlights, and selective dark lash or hair accents.
- Shape: stylized 3D human character with large expressive eyes, smooth rounded facial planes, dimensional hair, and clearly modeled accessories.
- Proportion: portrait variants use an oversized eye-to-face scale; full-body variants retain a compact stylized 1:3 to 1:4 head-to-body ratio.
- Rendering/material: high-fidelity stylized 3D with soft skin, glossy hair, knit fabric, metallic hardware, and tactile accessory materials.
- Palette: bold but coordinated fashion colors, including lime, violet, pink, blue, and black; palette may be adapted to the approved user direction without losing high color clarity.
- Lighting: soft studio key light with gentle fill, crisp but restrained highlights, shallow depth cues, and a clean editorial finish.
- Texture: visible knit loops, fabric weave, hair strands, polished metal, and subtle skin detail; avoid photoreal pores.
- Composition: centered close-up or upper-body portrait, direct gaze, clean gradient or solid studio backdrop, accessories readable but not crowded.
- Background: saturated blue, pink, yellow, or another approved smooth studio gradient.
- Sticker outline: none by default; rely on lighting and background contrast for separation.
- Preserve from identity reference: recognizable face shape, hairstyle, eyewear, facial hair, clothing cues, body proportion, and one authorized signature accessory.
- Ignore from style reference: Nike and other logos, badges, written slogans, barcodes, exact hats, exact piercings, depicted people, and original layouts.
- Negative constraints: no logos, no trademarked patches, no readable text, no watermark, no copied character, no photoreal person, no cluttered background.

### illustration-feng — 插画风

- Status: active
- Reference assets:
  - `assets/style-presets/illustration-feng/reference-01.png`
  - `assets/style-presets/illustration-feng/reference-02.png`
  - `assets/style-presets/illustration-feng/reference-03.png`
  - `assets/style-presets/illustration-feng/reference-04.png`
- Preview asset: `assets/style-presets/illustration-feng/reference-01.png`
- Tags: 平面插画、色块光影、时尚肖像、鲜明背景
- Best uses: editorial profile portraits, social content covers, character cards, modern brand personas
- Line: clean tapered dark contours and selective interior lines; some elements use line-free color boundaries for a graphic result.
- Shape: stylized 2D portraits with expressive eyes, simplified features, bold hair masses, elongated necks or gently exaggerated proportions when appropriate.
- Proportion: portrait-first with a readable head-and-shoulders silhouette; full-body adaptations remain graphic and slim rather than anatomically realistic.
- Rendering/material: flat digital illustration with layered color blocks, soft painted gradients, and occasional fine paper grain.
- Palette: high-clarity color families such as saffron yellow, warm cream, terracotta, chocolate brown, sky blue, navy, coral, and pale pink; adapt to the approved palette direction.
- Lighting: graphic plane-based shading with clear warm/cool separation, no realistic specular rendering.
- Texture: restrained digital paint or paper grain; clean enough to read at avatar size.
- Composition: centered portrait or half-body, solid or gently graded background field, deliberate negative space, editorial crop.
- Background: saturated single-color field, pale cream, or smooth blue gradient.
- Sticker outline: minimal or absent; use the outer silhouette and color contrast instead of a die-cut border.
- Preserve from identity reference: face shape, hairstyle, glasses, facial hair, signature clothing cue, body proportion, and one memorable accessory when visible and authorized.
- Ignore from style reference: watermarks, platform marks, artist credits, the cat, exact people, exact outfits, text, and original compositions.
- Negative constraints: no 3D plastic, no photorealism, no copied character, no logo, no watermark, no readable text, no overly detailed scenery.

### figure-feng — 手办风

- Status: active
- Reference assets:
  - `assets/style-presets/figure-feng/reference-01.png`
  - `assets/style-presets/figure-feng/reference-02.png`
  - `assets/style-presets/figure-feng/reference-03.png`
  - `assets/style-presets/figure-feng/reference-04.png`
- Preview asset: `assets/style-presets/figure-feng/reference-01.png`
- Tags: 收藏手办、哑光树脂、全身展示、柔和棚拍
- Best uses: full-body IP figures, collectible-character concepts, product-ready character previews, display-oriented avatars
- Line: no drawn outline; use sculpted edges, shallow seams, material separation, and carefully modeled garment folds.
- Shape: collectible figurine silhouette with an enlarged head, rounded facial features, compact limbs, stylized hair volume, and readable outfit layers.
- Proportion: approximately 1:3 to 1:4 head-to-body ratio with a stable standing or dynamic display pose.
- Rendering/material: matte PVC, resin, clay, or vinyl figurine finish with soft diffuse highlights and manufactured-sculpture detail.
- Palette: user-approved coordinated costume colors with clear material separation; keep saturation controlled enough for a premium display-object feel.
- Lighting: high-key softbox studio light, gentle grounded shadow, diffuse reflections, no dramatic cinematic contrast.
- Texture: molded hair strands, fabric folds, subtle sculpt seams, matte plastic or resin, and limited soft-touch finish.
- Composition: centered full-body figure, clean display pose, generous whitespace, accurate visible footwear and accessories.
- Background: white, pale gray, or very light neutral studio sweep.
- Sticker outline: none; the figurine is separated through soft shadow and studio contrast.
- Preserve from identity reference: recognizable face shape, hairstyle, eyewear, facial hair, signature clothing cues, body proportion, and one memorable accessory when visible and authorized.
- Ignore from style reference: exact uniforms, badges, school emblems, character designs, flame motifs, specific pets, and original poses or outfits.
- Negative constraints: no logo, no watermark, no readable text, no copied character, no photoreal person, no busy scenery, no malformed limbs or duplicate accessories.

### User Selection Card

Output one card for every active preset in catalog order. Do not show only an example card or skip a preset. Each card must include its preview, Chinese name, tags, and best uses:

```markdown
### <Chinese display name>
![preview](<Preview asset>)
<Tags>
适用：<Best uses>
```

Do not expose the full technical fingerprint until the user selects the preset or asks for details.

### Task-scoped Custom Style

Always include this non-persistent option after the active preset cards:

```markdown
### 自定义风格
上传你自己的风格参考图
本次任务专属 · 不自动保存到预设目录 · 需要至少 1 张授权图片
```

When selected, inspect the user-provided image or image group and use the extracted fingerprint as the style authority for the current plan only. Do not list it under `Active Presets`, do not create a preset ID, and do not copy the image into this skill unless the user explicitly requests reusable storage.

## New Preset Intake

For a newly supplied group of style images:

1. Treat the group as one candidate preset unless the user requests separate styles.
2. Inspect the images and write one shared fingerprint using every field in the preset template.
3. Ask the user for the Chinese display name as a single question, then derive a stable lowercase hyphenated ID.
4. Ask for explicit authorization before copying the reference assets to `assets/style-presets/<preset-id>/`.
5. Flag materially similar active presets and let the user choose merge or create-new.
6. Write `Status: draft` until the user confirms activation; only active entries appear in selection cards.

## Preset Template

```markdown
### <preset-id> — <Chinese display name>

- Status: active
- Reference assets: `assets/style-presets/<preset-id>/<file>`
- Best uses:
- Line:
- Shape:
- Proportion:
- Rendering/material:
- Palette:
- Lighting:
- Texture:
- Composition:
- Background:
- Sticker outline:
- Preserve from identity reference:
- Ignore from style reference:
- Negative constraints:
```
