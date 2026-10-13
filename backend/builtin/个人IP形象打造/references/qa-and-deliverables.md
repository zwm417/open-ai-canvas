# QA and Deliverables

## Default Package

- One approved prompt lock.
- One 3x2 preview overview containing six candidates with host-rendered numeric badges (`1` through `6`).
- One 1:1 formal-avatar source asset and one 3x3 expression-sticker source board.
- One 4x3 final delivery board that places the avatar and expression board on the same page with host-rendered Chinese captions.
- Optional transparent-background cutout export containing nine individual expression stickers, only when selected.
- One written handoff: IP type, character name, one-line positioning, 3-5 personality keywords, visual memory point, palette, and reusable prompt lock.

## IP Mode QA

- 人物 IP keeps at least three visible, authorized identity anchors; no sensitive or unsupported personal claims appear in the written handoff.
- 代表形象 IP matches the approved representative brief, audience, role, and visual memory point while remaining original and not implying an unauthorized person's likeness.

## Prompt and Style QA

- The prompt lock contains IP mode, source/brief, style fingerprint, enhanced traits, palette direction, composition, and negative constraints.
- Line, shape, proportion, rendering, palette, light, texture, and composition follow the selected style reference.
- The output does not carry over reference character identity, branding, watermark, signature, text, or scene.

## Candidate Preview QA

- Deliver one 3x2 preview overview with exactly six equally sized cells and host-rendered numeric badges on the same page: `1` top-left, `2` top-center, `3` top-right, `4` bottom-left, `5` bottom-center, `6` bottom-right.
- Never depend on generated in-image numbering; the underlying overview artwork contains no captions, watermarks, logos, or accidental text.
- Every cell preserves the prompt lock; only silhouette, outfit emphasis, accessory emphasis, pose, expression, or composition may vary.
- Cells are meaningfully distinct and none has missing or extra limbs, duplicate accessories, merged fingers, inconsistent scale, or unrelated characters.

## Final Delivery Board QA

- The user-selected overview cell is the sole primary reference for the final avatar and expression board.
- Deliver one 4x3 final delivery board with the formal avatar panel on the left and the 3x3 expression board on the right.
- Host-render these Chinese captions on the final board: `正式头像`, `开心`, `大笑`, `生气`, `委屈`, `惊讶`, `困惑`, `得意`, `疲惫`, `喜爱`. Do not rely on model-generated Chinese text.
- Face, hair, silhouette, outfit cut, footwear, palette, material, outline, and accessory placement match the selected candidate across every panel.
- The 1:1 avatar is centered, readable at small size, and free of generated text, watermarks, logos, and unrelated characters.

## Expression-Board and Cutout QA

- The 3x3 board contains Happy, Laughing, Angry, Aggrieved, Surprised, Confused, Proud, Tired, and Love.
- Expressions are recognizable at approximately 256 px and change through face and gesture rather than costume redesign.
- Cells have equal spacing and preserve the selected character's identity, style, and palette.
- When cutout export is not selected, deliver the one 4x3 final delivery board with Chinese captions and no individual sticker files.
- When cutout export is selected, deliver nine square expression stickers with verified alpha channels; otherwise state that clean white backgrounds were used.

## Failure Handling

- If a preview cell drifts, regenerate the complete 3x2 overview with the full prompt lock and the same ordered cell focuses.
- If the final avatar or expression board drifts, attach the selected candidate again and restate the changed locked details.
- If one board cell fails, regenerate only the failed expression rather than replacing approved assets.
- If a numeric badge or Chinese caption is wrong, recompose the overview or final delivery board with host rendering; do not regenerate the approved character artwork.
