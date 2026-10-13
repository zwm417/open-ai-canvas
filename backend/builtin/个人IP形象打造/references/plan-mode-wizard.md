# Personal IP Plan-Mode Wizard

## Operating Contract

- Ask exactly one question per assistant turn.
- Resolve exactly one Generation Profile field in each question.
- Use structured selectable questions when the host supports them.
- Offer 2-3 mutually exclusive choices when choices are useful.
- Put the recommended option first and label it recommended.
- Allow a free-form answer and accept `skip`, `unknown`, or `use default`.
- Never hide multiple questions in bullets or in an "also provide" clause.
- Inspect an uploaded image before asking the next question.
- Skip fields already confirmed or safely inferred.
- Do not call the image-generation tool during discovery.

## Generation Profile

Maintain this profile internally and update it after every answer:

```markdown
- IP type:
- Identity source / representative brief:
- Selected style preset:
- Enhanced traits:
- Palette direction:
- Character lock:
- Avoided elements:
- Prompt lock approval:
- Candidate numbered 3x2 overview:
- Selected candidate number:
- Optional cutout export:
- Final deliverables:
- Assumptions:
- Unknowns:
```

Mark each field as Confirmed, Inferred, Defaulted, or Unknown.

When style reference images are supplied, add a pending style-preset record containing the image roles, shared visual fingerprint, tags, best uses, and negative constraints. Do not generate an IP while this record is pending.

## Question Queue

Ask only the first unresolved material field.

### 1. IP Type

Ask which IP the user wants to create:

- 人物 IP（Recommended）— based on an authorized person source.
- 代表形象 IP — an original representative character for a person, team, brand, role, or concept.

### 1a. Source or Representative Brief

Ask only after IP type is confirmed:

- For 人物 IP: upload 1-3 clear authorized portraits, use a detailed appearance description, or use an existing approved IP image.
- For 代表形象 IP: provide a short brief covering what the character represents, audience, role, personality, and one visual memory point. Do not imply a real-person likeness without an authorized identity source.

### 2. Style

Read `style-presets.md` and show active presets as preview cards with the Chinese name, 3-5 tags, and best uses. Also show `自定义风格 — 上传你的风格参考图` as a task-scoped choice.

If the user selects 自定义风格, require at least one authorized style reference image, inspect it, and extract one shared fingerprint before the next question. Do not copy it into the skill folder unless the user explicitly asks to save it as a reusable preset.

### 3. Enhanced Traits

Ask for 3-5 visible features to strengthen in the IP, such as hairstyle, silhouette, outfit direction, role cue, personality, accessory, or pose energy. Keep them non-sensitive and free of third-party logos or copyrighted characters.

### 4. Palette Direction

Ask the user to choose the palette direction:

- Use the style's default palette (Recommended)
- Choose a custom palette by colors or mood
- Match an authorized palette reference

Record dominant, secondary, and accent colors plus saturation, temperature, and contrast.

### 5. Prompt Lock Approval

Build a compact prompt lock from the IP type, source or representative brief, selected style, enhanced traits, palette, composition, and negative constraints. Ask exactly one approval question before generation.

### 6. Six-Variant Preview Overview

After approval, generate one 3x2 preview overview containing exactly six variants that share the same prompt lock. Render host-rendered numeric badges on the same overview page in reading order: `1` top-left, `2` top-center, `3` top-right, `4` bottom-left, `5` bottom-center, `6` bottom-right. Do not require the image model to render numbers or captions in the artwork. Vary only creative interpretation, not the approved source/brief, style, enhanced traits, or palette.

### 7. Candidate Selection

Ask exactly one question: which cell number from `1` through `6` should be used? The selected cell becomes the approved character reference and locks identity, silhouette, outfit, palette, material, outline, and accessory placement.

### 7a. Optional Cutout Export

After a cell is selected, ask exactly one optional question: should the nine expressions also be exported as individual transparent-background cutouts? Default to no. If the user declines or skips, generate only the one 4x3 final delivery board with Chinese captions.

### 8. Final Deliverables

Generate a centered 1:1 formal avatar and one 3x3 expression-sticker source board from the selected candidate. Then compose one 4x3 final delivery board with the avatar panel on the left and the expression board on the right. Render Chinese captions on the final board: `正式头像`, `开心`, `大笑`, `生气`, `委屈`, `惊讶`, `困惑`, `得意`, `疲惫`, `喜爱`. Only when the user selects cutout export, also provide nine individual transparent-background stickers.

## Progress Response

After each answer, respond in this shape and ask no second question:

```markdown
已记录：
- [the single newly confirmed or inferred value]

下一问：
[exactly one question]
```

## Finalization

When IP type, source/brief, style, enhanced traits, and palette are resolved, present one compact generation plan containing the prompt lock, one numbered 3x2 preview overview, candidate-selection gate, optional cutout export, one 4x3 final delivery board, and quality checks.

If the host is in Plan Mode, wrap the final plan in `<proposed_plan>` tags and do not generate. If the host is not in Plan Mode, present the equivalent Generation Plan and ask exactly one approval question. Generate the one numbered 3x2 preview overview only after approval; generate the one 4x3 final delivery board only after the user selects a cell number and resolves the optional cutout choice.
