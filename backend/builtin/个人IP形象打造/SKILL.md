---
name: 个人IP形象打造
description: 基于用户肖像照片和精选风格预设，打造连贯一致的个人IP形象、角色三视图、数字分身、表情包与贴纸套件。遵循计划模式向导锁定风格与特征锚点。
metadata:
  version: "1.0.0"
  author: 智影
  owner: yingce-system
  skillId: "zy-personal-ip-gen"
  tag: creative
  sortWeight: 780
  source: 3
---

# 个人IP形象打造

## Core Rule

Start with a Plan-Mode-style wizard and ask exactly one material question per assistant turn. Do not generate an image until the user has selected a preset style, the generation profile is complete, and the user has approved the final generation plan.

Treat the selected preset as the style source of truth. Separate identity features from style features before generating. Preserve the person's recognizable anchors while transferring only the preset's approved visual language.

Do not store user portraits inside this skill. Use only images supplied by the user or images the user is authorized to use. Do not infer sensitive attributes such as ethnicity, religion, health, sexuality, or politics from appearance.

## Load References

- Read `references/intake-and-style.md` whenever reference images are supplied, their roles are unclear, inputs conflict, or a text-only brief is incomplete.
- Always read `references/plan-mode-wizard.md` before asking intake questions.
- Always read `references/style-presets.md` before presenting or applying preset styles.
- Read `references/prompt-patterns.md` before every image-generation call.
- Read `references/qa-and-deliverables.md` before generating derivative views or delivering a complete package.

## Style Preset Intake

When the user supplies a group of style reference images, treat them as style references unless the user explicitly labels an image as an identity source or an existing IP. Inspect the group before asking the next question and extract one shared style fingerprint; do not copy the depicted person, character, props, text, logo, watermark, or composition.

For a new preset:

1. Confirm that the images are authorized style references and group the supplied images into one preset.
2. Record line, shape, proportion, rendering/material, palette, lighting, texture, composition, background, sticker-outline behavior, tags, best uses, and negative constraints.
3. Ask exactly one question for the user's Chinese display name, then derive a stable lowercase hyphenated preset ID.
4. Ask for explicit authorization before copying the reference assets to `assets/style-presets/<preset-id>/`.
5. Show the proposed preset entry and ask whether it should be `active` or `draft`; only `active` presets appear in user selection.
6. If an existing preset is materially similar, flag it and let the user choose merge or create-new. Never silently overwrite a preset.

Do not generate an IP image during preset intake. A preset becomes a style authority only after its entry and status are confirmed.

## Custom Style Mode

Offer `自定义风格` as a separate style choice alongside active presets. When selected, the user must provide at least one authorized style reference image. Inspect the supplied image or image group, classify it as a style reference, and extract a concrete style fingerprint before asking the next wizard question.

Custom Style Mode is task-scoped by default: use the reference only for the current generation plan and do not copy it into the skill folder or add it to the active catalog. If the user explicitly asks to reuse it later, switch to the Style Preset Intake flow, request authorization to store the assets, assign a stable ID, and ask whether the resulting entry should be `active` or `draft`.

Ignore the reference's depicted character, identity, logo, watermark, text, props, and composition unless the user separately requests those elements. The custom reference is a style authority, not an identity source.

## Workflow

1. Identify the IP mode first, with exactly one question.
   - `人物 IP`: derive an IP from an authorized person source. On the next turn, collect 1-3 clear portraits or a detailed text description and preserve visible, non-sensitive identity anchors.
   - `代表形象 IP`: create an original character that represents a person, team, brand, role, or concept. On the next turn, collect the representative brief; do not imply a real-person likeness without an authorized identity source.

2. Resolve the style.
   - Present active preset cards with a preview image, Chinese name, 3-5 tags, and best uses, plus `自定义风格 — 上传你的风格参考图`.
   - The chosen preset or authorized task-scoped reference is the style authority. Never invent, substitute, or copy a reference character, logo, watermark, text, pose, or composition.

3. Collect enhanced traits.
   - Ask for 3-5 visible traits to amplify, such as hairstyle, silhouette, outfit direction, occupation cue, personality, accessory, or pose energy.
   - Treat the answer as refinements to the identity/representative brief and selected style; never infer sensitive attributes or reproduce protected branding.

4. Collect palette direction.
   - Ask the user to choose a compatible palette direction or to use the selected style's default palette.
   - Record dominant, secondary, accent, saturation, temperature, and contrast in the character lock.

5. Build and show the prompt lock.
   - Include IP mode, identity anchors or representative brief, style fingerprint, enhanced traits, palette, composition, and negative constraints.
   - Ask one approval question before candidate generation. Do not generate images before approval.

6. Generate one 3x2 preview overview containing exactly six character variants.
   - Create one 3x2 preview overview from the same prompt lock. Preserve the source/representative brief, style, enhanced traits, and palette across all cells; vary only the creative interpretation of silhouette, pose, outfit, accessory emphasis, or expression.
   - Render host-rendered numeric badges on the same overview page after image generation: `1` top-left, `2` top-center, `3` top-right, `4` bottom-left, `5` bottom-center, `6` bottom-right. Do not ask the image model to render the numbers.
   - Ask the user to choose exactly one candidate number. Do not generate final deliverables until a number is selected.

7. Lock the selected candidate and generate final deliverables.
   - Use the selected preview as the primary identity reference.
   - Generate a centered 1:1 formal avatar and a 3x3 expression-sticker source board. Keep face, hairstyle, silhouette, outfit, palette, material, outline treatment, and accessory placement identical; change only expression and gesture in the board.
   - Compose one 4x3 final delivery board: a formal avatar panel on the left and the 3x3 expression board on the right. Host-render Chinese captions for `正式头像` and the nine expressions: `开心`, `大笑`, `生气`, `委屈`, `惊讶`, `困惑`, `得意`, `疲惫`, `喜爱`.
   - Offer one optional transparent-background cutout export after candidate selection. If the user declines or skips it, deliver the one 4x3 final delivery board with Chinese captions only. If selected, also export nine individual transparent-background expression stickers.
   - Provide the reusable prompt lock and compact character handoff.

8. Respect the image tool's staged behavior.
   - When the image tool returns one image per call, create the one 3x2 preview overview, formal avatar, expression-board source, and one 4x3 final delivery board across turns without losing the cell mapping or selected reference.
   - After an image-generation call, follow the tool's output rules. On the next turn, continue from the latest accepted candidate without redoing approved work.

## Quality Gates

- `人物 IP` preserves the supplied person's visible anchors; `代表形象 IP` remains original and accurately expresses its approved representative brief without implying an unauthorized likeness.
- The output matches the selected style's visual grammar, not merely its broad genre name, and uses the approved palette direction.
- One 3x2 preview overview contains exactly six distinct variants with host-rendered numeric badges `1` through `6` on the same page; the underlying generated artwork contains no generated numbering, watermarks, fake logos, or copied characters.
- One 4x3 final delivery board contains the selected formal avatar and a 3x3 expression board with host-rendered Chinese captions; all panels preserve one locked character identity with no extra limbs, duplicate accessories, or unrelated characters.
- Transparent-background cutout export is optional and is claimed only after verifying an alpha channel on every individual sticker.
- Expressions remain readable at small sticker size and differ through face and gesture, not costume redesign.
- Regenerate only the failed preview or final asset when consistency drifts.
