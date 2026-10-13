# Reference and drift-repair protocol

Use when at least one reference image, source prompt, or failed generated image is supplied.

## Inspect each input independently

For every image record:

- stable label or filename;
- `inspected: true` only after viewing the actual artwork;
- source dimensions, artwork bounds, ratio, and excluded UI/text overlays;
- whole-frame summary and decisive evidence regions;
- primary roles: identity, character design, pose, composition, style, palette, material, lighting, or negative example;
- allowed and forbidden transfers;
- unresolved uncertainty.

The user's role assignment is authoritative. Select one primary image per role by default and do not average conflicts.

## Prompt-to-image comparison

Compare source intent and candidate in eight lanes. Score internally `0`, `1`, or `2`:

1. composition/viewpoint — count, crop, scale, position, direction, negative space;
2. character construction — pose, gaze, expression, hair, hands, scene role;
3. branch fidelity — modern lone-wuxia, studio classic, or action-wuxia mechanisms;
4. signature silhouette — dominant masses and movement path;
5. material/attachment — fabric topology, horse/boat/weapon relations;
6. lighting/tone — direction, hardness, fill, brightest region, highlight behavior;
7. palette distribution — field, subject, highlight, and sparse accent roles;
8. background/depth — layers, atmospheric recession, local versus global blur.

Treat any Tier-1 failure in lanes 1–4 as repair-worthy even when the image is attractive.

## Report the smallest repair

For each failed lane state:

1. source fact;
2. candidate deviation;
3. likely cause: `prompt_caused`, `reference_role_caused`, `model_variance`, or `uncertain`;
4. smallest correction;
5. passing anchors that must remain unchanged.

Do not rewrite a whole prompt to fix one scale, count, weapon, light, or crop problem.

## Known Shaw-set failure patterns

- `small lone traveler` becomes a centered half-body hero -> move exact subject scale and placement into the opening.
- one sword becomes two or more -> compile `one sword -> contained by -> one scabbard` and forbid extras.
- solitary traveler gains a companion -> state exact count and treat prior extra person as a negative example.
- root or rock arch becomes a portal -> define it as non-magical natural framing with landscape visible through it.
- historical studio mode becomes outdoor prestige photography -> restore crafted set layers, painted depth, controlled color fields, and theatrical light.
- modern lone-wuxia becomes generic xianxia -> remove magic light, flying fabric, ornate costume, fantasy architecture, and effects language.
- environmental wide becomes portrait blur -> protect full-body share, foreground/subject/background layers, and distant clarity before facial detail.

If strict visual fidelity is requested, recommend using the approved original as an Image Prompt for composition/content and, when appropriate, a Style Reference for treatment. Never imply that text alone guarantees reconstruction.

