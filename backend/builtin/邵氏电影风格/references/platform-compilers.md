# Shaw Midjourney V8.2 and ImageGen compilers

Both prompt families must describe the same frame and branch, but they are compiled natively rather than translated sentence by sentence.

## Midjourney V8.2

Use this priority:

`shot/crop -> subject count, scale, position, and direction -> dominant relation -> character/action -> costume and weapon attachment -> environment layers -> motion physics -> light/palette roles -> optical behavior -> one branch summary -> nearest drift exclusions -> parameters`

Rules:

- Open with geometry. Do not open with `beautiful`, `cinematic`, a demographic label, or the studio name.
- Use exact spatial verbs: occupies, recedes toward, crosses, trails behind, frames, divides, reflects across, dissolves into.
- When a solitary figure matters, state `one` or `a single` early.
- When a sword matters, state one sword and one scabbard as a physical relation; do not use a loose weapon noun list.
- Use branch mechanisms rather than a generic style tail. `Shaw Brothers-inspired` may appear once after the visible mechanisms.
- Negative clauses target the nearest drift only: extra figures, duplicate weapons, oversized portrait crop, magical portal, commercial poster, or effects-heavy xianxia.
- Do not automatically add cameras, lenses, film stocks, `masterpiece`, `8K`, `photorealistic`, `hyperrealistic`, or `--raw`.
- Include the intended `--ar` and end exactly with `--v 8.2`.
- Do not invent image URLs, `--sref`, `--oref`, profiles, codes, or seeds.

Ordinary frames usually need about 100–180 English words. A shorter prioritized prompt is better than an exhaustive inventory.

## ImageGen

Write native Chinese direction in this order:

1. ratio and still-image type;
2. shot size, viewpoint, subject count, scale, position, crop, and negative space;
3. subject action/state and decisive object or spatial relations;
4. selected Shaw branch mechanisms;
5. wardrobe/material and weapon attachment;
6. environment layers and motion physics;
7. light direction, palette roles, optical depth, and focal brightness;
8. must-preserve anchors, allowed variation, and concise negative constraints.

Do not include Midjourney syntax or claim recovered lens, exposure, LUT, seed, or camera metadata.

## Branch compilation checklist

### modern-lone-wuxia

- Is the environment structurally dominant in a wide shot?
- Is the person count exact and the figure scale protected?
- Is travel or stillness coupled to cloth, grass, water, rain, dust, or reflection?
- Are colors assigned roles rather than listed?
- Are duplicate weapons, extra companions, fantasy portals, and costume-poster drift addressed only when plausible?

### studio-classic

- Is the constructed set visible through staging, layered framing, painted depth, and controlled color?
- Does the set remain tactile rather than plastic or theme-park-like?
- Is theatrical light described geometrically?
- Are jewel-color accents bounded rather than flooding the frame?

### action-wuxia

- Are arena, opponent spacing, feet, weapon direction, and exits legible?
- Does each fighter own a clear weapon relation?
- Does blur or atmosphere preserve rather than obscure action continuity?
- Is the still one beat of choreography rather than a superhero poster?

## Pair audit

The pair passes only when:

1. both prompts agree on branch, ratio, subject count, scale, viewpoint, action, and dominant relation;
2. both preserve the same light map, palette roles, material family, and weapon rule;
3. Midjourney syntax is valid and ImageGen contains no Midjourney parameters;
4. neither introduces a conflicting companion, weapon, time, location, costume, set type, or light direction;
5. negative constraints target demonstrated or likely drift rather than becoming a generic ban list.

