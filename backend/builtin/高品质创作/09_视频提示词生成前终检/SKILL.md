---
name: ai-video-prompt-preflight
description: "AI Video Prompt Preflight for the final generation gate. Use as Primary when content is formed and the user asks whether it is ready to generate: feasibility, conflicts, asset readiness, timing/shot overload, continuity locks, model limits, retry risk, or “出片前检查/生成前看看/哪里会崩”. Do not use as independent aesthetic audit (belongs to cold-auditor)."
---

## 公共意图锁｜完整工具包路由先于专业执行

当10个 Skill 同时可用时，先按根目录 `ROUTING_CONTRACT.md` 的同一合同锁定：`真实交付目标 → 核心专业难点 → 唯一 Primary Skill → 必要 Collaborator → Finalizer/Validator`。

- **最终交付格式不自动决定Primary。** 用户说“视频Prompt”不代表06必然是Primary；如果核心仍需原创故事/表演/战斗/镜头/动作事实，先由对应专业Skill拥有Primary主权。
- **完整工具包没有全局固定流水线，但条件性依赖必须执行。** 高复杂度从零武戏由10先锁战斗设计；已有战法只修动作/VFX可由05主导；已有内容只修摄影由04主导；最终生成型视频Prompt若06可用则统一由06 Finalize。
- **07与09分工不同。** 07是独立作品/Prompt专业冷审；09是准备生成前的可行性与风险Preflight。
- **单独安装能力不受影响。** 只有完整工具包协作时执行上述主权裁决；专项Skill缺失时继续用Standalone Fallback完成任务。

## 最高品质默认合同｜Highest-Quality Default

- **智影默认只交付最高品质。** 用户不需要主动说“最高画质、顶级、电影级、极致”；只要当前任务允许视觉/声音/叙事质量判断，就默认在用户目标与平台硬约束内选择最高完成态。不得为了省字符、提效率、赶速度、轻量化或“普通任务”主动降质。
- **只有用户明确指定其它质量目标时才覆盖默认。** 例如用户明确要求低清草稿、快速预览、低成本风格、特定旧媒介质感或平台硬限制；即使如此，也是在该指定约束内做到最高完成度，而不是随意变差。
- **所有最终图像/视频生成 Prompt 默认必须写出一个具体摄影机型号或明确的成像摄影机先验。** 用户指定型号时原样保留；用户未指定时，由当前题材、媒介、光线、运动与观看尺度自动选择最合适的具体型号，禁止只写“电影摄影机 / cinema camera / 高端摄影机”。3D、动画或纯生成任务写成“某型号成像基底/虚拟摄影机先验”，不得冒充真实物理拍摄。只有用户明确要求不写摄影机型号时才省略。
- **摄影机型号必须有可见职责。** 至少对应动态范围/高光滚降、综合色彩、肤色/材质响应、低照度、运动成像、景深/焦外、大片幅尺度或其它当前任务真正可见结果之一；禁止只堆品牌名。

# AI Video Prompt Preflight
\n## Routing Boundary｜Preflight ≠ Independent Cold Audit

This skill is the **generation-readiness gate**. In the full 智影 toolkit, use `zhiying-independent-cold-auditor` as Primary for independent semantic/professional/render fulfillment audits; use this Preflight as Primary when the prompt is substantially formed and the question is whether it is safe/feasible/ready to generate, what references/assets are missing, where the model may fail, how to split, or how to control retries. If a final generation prompt is compiled by 06 and this skill is available, it can be used as the generation-preflight Validator without becoming the creative Primary.

## Highest-Quality Final Gate｜最高品质与摄影机型号终检

智影默认只交付最高品质。除非用户明确指定其它质量目标，Preflight不得以“更稳定、更短、更省算力”为理由建议把Hero材质、关键VFX内部结构、光照融合、主体清晰、时域身份或其它唯一高保真事实降档。对于最终图像/视频生成Prompt，若用户未明确要求省略，必须确认前台存在**具体摄影机型号/具体型号成像基底**，且至少承担一项可见成像职责；只写“电影摄影机/cinema camera”视为缺失。

## Bottom-Layer Reasoning

Apply the `think-one-step-further` mechanism as a lightweight check:

- Confirm this skill is solving the user's real intent, not only the surface request.
- Make the output immediately usable and name any unavoidable next action.
- Extract the reusable structure and, when aligned, propagate it to adjacent prompts, skills, checklists, or workflows.
- Add one guardrail for the most likely next failure while preserving this skill's primary workflow.

## Purpose

Use this skill as the final gate before generation. It catches contradictions, overloaded shots, missing locks, unclear reference roles, impossible timing, model-risk language, and likely drift before the user spends attempts.

Use it after structure, story, audiovisual grammar, continuity, art direction/aesthetic direction, action, rhythm, material/render realism, and model packaging.

## Reference Routing

Read only the file needed for the task:

- `references/preflight-checklist.md`: use for any final prompt check.
- `references/feasibility-and-splitting.md`: use for 10s+ videos, complex action, multi-shot sequences, transformations, or prompt overload.
- `references/failure-risk-matrix.md`: use to diagnose what is likely to fail and what to simplify.
- `references/retry-control.md`: use when preparing controlled next-round adjustments.

## Workflow

1. Identify the target model and generation mode if known.
   - For SD2 / Seedance-style workflows, classify the mode before approving the prompt: pure text, image-to-video, first/last frame, all-material/all-reference, multi-segment stitching, or prompt diagnosis.
   - If the user asks for directly copyable output, verify that the final answer has one standalone `完整可复制提示词` code block. Put only the model-ready prompt inside it, with negative constraints included; keep generation mode, asset table, and preflight notes outside that block.
   - For Liu's 15-second素材段 workflow, verify that the prompt has one main segment objective and 3-4 required state changes. If it tries to include a complete storyboard, multiple action chapters, transformation, fight, climax, and ending in one clip, mark it overloaded and reduce or split it.
2. Check reference roles:
   - identity, outfit, prop, vehicle, environment, style, pose, lighting.
3. Check asset readiness:
   - what already exists, what is required, what is optional, what must be generated first, and whether every asset has one clear control role.
4. Check research readiness for substantive prompts:
   - supplied/local truth was inspected; unresolved domain/reference/platform questions were researched; current model claims use official sources.
   - if the user supplied reference videos/links or asked for 拉片/整个都看, the reference was inspected or clearly access-limited, classified by whole-work grammar, and translated into prompt mechanisms before final wording.
   - if the prompt responds to repeated action, camera, or aesthetic failure, confirm that the next attempt is evidence-backed by output review, reference breakdown, or explicit user-provided successful examples rather than another intuition-only rewrite.
5. Check structure:
   - hook, build, turn, payoff; no repeated beat doing the same job.
   - distinguish the internal planning map from the literal generation prompt; do not require every planned cut to keep a hard timestamp.
   - for action-led clips, verify the first second is not wasted on a default static lineup, face-off, mutual stare, or slow preparation unless that standoff is the explicit hook.
6. Check temporal/emotional logic when relevant:
   - emotional or behavioral turns have a cause: past residue, present action, incoming pressure, and final consequence.
7. Check audiovisual grammar:
   - each visual beat has a shot function, shot size, camera position/angle, spatial path, axis or screen direction, continuity bridge, and reason to cut.
   - each emphasized transition has an outgoing source and an inherited incoming element—action, vector, shape, occlusion, material, light, or sound—and does not conceal required contact or consequence.
   - any effect/foreground wipe covers the subject only briefly; the incoming image immediately restores subject count, axis, geography, and the changed physical state.
   - when the prompt requests special storyboard expression, verify that multiple shots, scales, and special angles form one continuous action phrase; adjacent shots contrast in viewpoint but inherit action vector, phase, eye trace, axis, and geography.
   - verify action-camera coupling: performer pose/path motivates the camera, and camera behavior reveals or amplifies a real movement feature rather than manufacturing empty energy.
8. Check shot feasibility:
   - one main action per short shot, one main camera move per shot, clear timing.
   - verify duration at four levels: total clip duration, segment allocation, structural peak placement, and action-phase feasibility.
   - identify timing evidence: reviewed reference/output, animatic/edit map, external synchronization, or physical action budget.
   - assign timing confidence: high / medium / low.
   - if segment ranges are high-confidence, preserve them; if not, soften or remove them.
   - verify exact ranges sum to the requested duration, contain no accidental gaps/overlaps, and do not hold simple content too long or compress complex action below its physical needs.
   - distinguish segment ranges from individual shot durations; do not reject precise segment timing merely because internal cuts remain flexible.
   - verify the density curve: longer orientation, compressed escalation, brief peak, readable consequence. Reject equal-duration slicing unless synchronization or evidence requires it.
9. Check action physics when relevant:
   - before style names or special moves, verify the foundation: support, center path, distance/angle, setup, contact or near miss, reaction cost, braking/recovery, and changed end state;
   - each principal performer retains a primary named movement/martial basis when one is selected, with only the visible mechanics needed for differentiation, adaptation, or physical credibility;
   - event verbs inherit a recurring stance, body level, path geometry, support pattern, rhythm, and recovery signature;
   - actor strength relative to body/weapon/vehicle load;
   - center of mass and base/support path;
   - weapon length, grip, and mass distribution;
   - force chain and traction;
   - contact response, recoil, follow-through, braking, and stable end state.
   - for multiple action peaks, compare trajectory plane, weapon end/function, support state, body level, travel vector, braking method, and end guard; reject cosmetic variation around one repeated loop.
   - for tip-heavy/head-heavy weapons, every change of plane has a visible brake/catch and regrip or new guard. “Continuous momentum” must not override legal redirection.
   - for complex exchanges, assign camera tracking ownership: initiator during commitment, contact plane at impact, receiver or redirected path after force transfer.
   - for transformation, require a readable frontier with old state, active boundary, and completed new state; assign distinct exit/reveal/assembly behavior to each material.
10. Check continuity:
   - face, costume, prop, vehicle, world, color, lighting, direction, form state.
   - if body-proportion locks are used, verify they are appropriate for an adult character and do not conflict with age, identity, costume, action credibility, or safety boundaries.
11. Check aesthetic direction:
   - medium domain, style family, relevant industry control vocabulary, rendering hierarchy, color ownership, line/shape/texture logic, and forbidden style drift.
   - verify that a global visual master appears before detailed shot instructions and remains authoritative across all shots.
   - for high-energy action, verify that the master defines a limited camera family, shot-scale range, permitted animation exaggeration, physics contract, spatial locks, and targeted anti-chaos constraints.
   - verify that user-provided anchors were treated as a starting set, relevant missing lanes were considered, and any supplemented names add distinct compatible functions rather than duplicate the same style role.
   - verify that named director, studio, manga, game, martial-art, or cinematography anchors have explicit roles. Avoid name salad: 2-4 strong anchors with jobs are better than many unassigned names. Preserve the user's useful names, but assign each to a function such as shot geometry, impact pose, montage rhythm, material style, or action logic.
   - when the prompt is substantial, verify that `$creative-anchor-director` or an equivalent audit considered all relevant—not all possible—style, world, camera, animation/editing, movement/weapon/partner, and audio lanes.
12. Check music and sound when relevant:
   - dramatic function, cue in/out, sound focus, dialogue priority, ambience, foley/effects, music or silence, selective sync points, and audio assets.
13. Check material/light/render completeness:
   - visible materials, key/rim/bounce light direction, AO/contact shadows, PBR roughness/specular/metallic behavior when useful, anisotropic highlights when relevant, reflection/texture response, optical behavior, fake-look avoidance, and motion blur readability when relevant.
14. Check contradictions:
   - camera, style, lighting, weather, time, movement, prompt-negative conflict.
15. Check risk:
   - what is most likely to break, what evidence supports that risk, and whether it comes from the prompt/workflow, missing assets, or a verified model limitation.
   - whether specialist layers are organically linked: structure, reference continuity, audiovisual grammar, aesthetic anchors, action/rhythm, material/render, and platform packaging must serve the same event. If they read as independent pasted blocks or compete for control, rewrite before generation.
16. Return either:
   - pass with minor notes, or a simplified safer prompt.
17. When the prompt is about to be generated, hand the final prompt, reference-role map, model/mode, settings, and expected deliverable to `$creative-production-ledger` as one attempt. Do not record an earlier draft as the generation attempt.

## Hard-Fail Checks

Mark the prompt as "needs revision" if any of these appear:

- Reference roles are missing or ambiguous, especially in multi-reference / 全能参考 mode.
- The target generation mode is ambiguous even though the prompt depends on mode-specific behavior such as first/last frame, all-reference, multi-segment stitching, or image-to-video preservation.
- The user asked for a complete copyable prompt, but the model-ready prompt is not in its own standalone code block, or negative constraints are outside that block, or planning/preflight notes are mixed into the paste target.
- The paste-ready prompt contains agent-only self-check language, workflow explanations, internal production notes, nonexistent reference placeholders, excessive unassigned director/studio anchors, or long generic negative spam instead of generation-facing scene controls.
- The prompt depends on an identity, vehicle/prop, environment, first/last frame, or layout reference that is not available, while still being presented as ready to generate.
- A prompt applies adult body-proportion language such as hourglass figure, waist-hip ratio, lifted hips, or mature chest line to a minor, childlike, school-age, or ambiguous-age character.
- A substantial new prompt claims professional, historical, cultural, physical, musical, or current model accuracy without inspecting supplied truth or researching the unresolved knowledge gap.
- A prompt claims to follow a supplied reference video, external link, or the user's previous successful work, but that reference has not been inspected, role-classified, or access-limited honestly.
- The user asked to "整个都看" or "拉片", but the new prompt only cherry-picks current-project fragments without first considering the reference's whole aesthetic, camera, action, editing, effects, sound, and prompt grammar.
- A repeated action/camera/style failure gets another long prompt patch based mainly on adjectives or intuition, without output evidence, reference research, or a narrowed controlled variable.
- A standalone clip depends on prior history instead of defining the visible first-frame state.
- For Liu's paste-ready video prompts, the first visible state is written as a detached "first-frame state" block instead of being embedded in the opening event beat. Preferred order: reference locks -> global visual/material/light master -> global camera/storyboard master -> event beats, with "开场：第一帧就是..." inside the first event.
- The prompt puts long generic negative constraints ahead of actual control layers, or uses negative constraints as a substitute for reference-role clarity, material/light master, camera master, and event-state changes.
- A continuation prompt tries to hard-match the previous generated final frame instead of carrying only the story state and hiding inevitable visual drift with a different shot size, angle, insert, occlusion, foreground wipe, smoke/dust/sound bridge, impact bridge, or chosen reference transition.
- A continuation prompt opens with a shot that visually contradicts the previous segment, replays the previous ending, resets character/creature form state, or re-reveals an event that already happened, such as a monster that was already revealed emerging from smoke again.
- A paste-ready continuation prompt contains internal production/meta language such as "do not hard-match the previous final frame", "avoid mismatch", "do not replicate the previous composition", or "carry story state not exact frame". Rewrite those as concrete filmable shots: insert, angle change, occlusion, foreground wipe, smoke/dust/sound bridge, impact bridge, and visible current state.
- A paste-ready prompt contains conversation-dependent wording that a stateless generator cannot use cleanly, such as "延续前面片子", "上一段", "之前", "现在这个", "已经脱离", "不要像上次", or "本段". Rewrite them as direct visible scene/style/action facts and keep only targeted negatives for likely on-screen failures.
- An action-led short clip opens with characters standing still, facing off, posing, or slowly preparing without a clear ritual/standoff purpose, wasting the hook before any pressure, consequence, or near-contact appears.
- An emotion-driven prompt commands a naked transition such as "from happy to broken" without a temporal hinge or visible cues: past residue, present action, incoming pressure, and final consequence.
- A one-scene prompt has no fixed blocking: no stable left/right/foreground/background relationship for character, vehicle, prop, and main set piece.
- A fight prompt lists attacks but does not define starting distance or formation, defender responses, receiver displacement, or the changed state after each exchange.
- An action prompt relies on martial-art, weapon, director, studio, or VFX names while the basics are missing: support, center of mass path, distance/angle, contact/near miss, reaction, braking, recovery, or changed state.
- An action prompt lists only task verbs such as run, jump, climb, attack, block, and slash, but defines no movement/martial basis or recurring visible action grammar.
- A heavy, long, head-loaded, flexible, transformed, or superhuman weapon action has no actor-relative load, support, mass distribution, follow-through, braking, or recovery.
- A character's center of mass visibly leaves the support area without a step, slide, fall, brace, cable, wall, vehicle, powered assist, or airborne phase.
- Contact is represented only by sparks, particles, camera shake, or sound while bodies, weapons, stance, and spacing do not respond.
- A transformed weapon changes size or mass distribution but keeps the same grip, stance, acceleration, stopping distance, and recovery.
- A group-fight prompt asks all participants to attack simultaneously without relay order, foreground/midground/background ownership, or a funnel/triangle formation.
- A mounted, vehicle, animal, or giant-creature action merges carrier/body motion with the attack and provides no support, traction, gait, suspension, or environmental force response.
- A 10-15s prompt has only 2-3 repeated actions with no turn, new information, displacement, or payoff.
- Several segments use different names but repeat the same circular topology through footwork, blade path, body turn, camera orbit, and effects.
- A heavy weapon is required to preserve uninterrupted momentum while changing from horizontal sweep to vertical wheel or reverse direction without a brake, catch, plant, regrip, or new guard.
- Detailed shot instructions appear before any coherent global visual master, allowing later camera/action language to define an inconsistent default look.
- A substantial AI-video prompt has action, event, creature, vehicle, PV, transformation, or material beats but omits the global camera / shot-style master near the beginning. If Liu asks for 镜头、分镜、运镜、张力, or has recently corrected that camera style was forgotten, the prompt must state the camera family, named anchors with functions, special storyboard language, shot-scale range, transition logic, and proof jobs before timed beats. Generic "dynamic camera" is not enough.
- The global visual master is a long name/adjective dump with no stable medium, palette ownership, material-light system, or rendering hierarchy.
- A high-energy visual master says “free camera,” “unconventional,” “POV,” “many cuts,” or “extreme motion” without bounding the permitted moves or preserving axis, screen direction, target relation, geography, anatomy, and action causality.
- Named style anchors are listed without functional roles, conflict with each other, or are being used as a substitute for action causality and shot grammar.
- The prompt relies only on the few names the user happened to know even though camera, movement, weapon, partner, or sound identity remains generic and a well-matched anchor could compress the missing direction.
- Project-specific anchors from a previous job are reused as defaults despite a different genre, medium, movement system, or emotional goal.
- A multi-reference or SD2 all-reference prompt uses a whole long video/image set without role labels, time ranges, trim strategy, or "do not copy" boundaries, especially when only camera/action/style should be transferred.
- Exact shot timecodes are used without a timing audit, do not sum cleanly to total duration, create gaps/overlaps, stretch a simple gesture into an idle hold, or compress preload/action/reaction/recovery into an implausible interval.
- Exact segment ranges are presented with no evidence, timing rationale, physical budget, or prior result supporting that precision.
- A 10-15 second action prompt mechanically divides the runtime into equal action nodes despite uncertain topology, continuity, or model capacity.
- High-confidence segment timing is unnecessarily removed even though a reviewed reference, successful output, animatic, or edit map provides a reliable duration template.
- Adjacent beats repeat the same shot size, camera height, camera path, and action verb.
- “Multi-shot, multi-scale, special angles” produces disconnected coverage, repeated hero poses, or random camera teleportation rather than a continuous action phrase.
- The prompt calls for extreme character action and extreme camera motion independently, so neither has a readable causal relationship.
- A prompt has rich style/material/texture language but no clear audiovisual scaffold: no shot function, shot size, spatial path, axis/screen direction, continuity bridge, or cut reason.
- Camera instructions conflict: locked-off plus handheld plus orbit plus crash zoom in the same short beat.
- Transitions are generic templates—portal, glitch, flash, particles, or whip—without an outgoing source, inherited direction/shape/light/sound, or narrative/spatial job.
- A transition or effect is allowed to hide the performer, weapon, or environment for a sustained interval with no explicit re-entry state.
- A transformation changes the whole subject simultaneously, has no active frontier, or gives no material-specific rule for old surface withdrawal, internal reveal, new surface assembly, and final settling.
- Style says both "flat cartoon" and "realistic cinematic material" without defining a 3D cel-shaded / semi-real hybrid.
- A prompt asks for 风格化/高级感/画风 but has no medium domain, aesthetic family, color ownership, rendering hierarchy, or anti-cheapness constraints.
- A prompt uses industry terms such as editorial, couture, brutalist, letterpress, ergonomic, typographic grid, cinematic, documentary, dashboard, or data visualization as loose labels without visible industry-specific structure or behavior.
- The prompt asks for face close-up, vehicle stunt, city-scale wide shot, and complex transformation in one unsplit beat.
- Negative constraints are generic spam but do not target the actual risk: face drift, prop drift, vehicle deformation, background morphing, camera chaos, text artifacts.
- A visual prompt has no material/light realism layer: no clear visible materials, light direction, contact shadows, reflection/roughness/texture response, optical behavior, or fake-look avoidance.
- A prompt says only "cinematic", "high quality", "realistic", "8K", or "高级质感" without concrete material and light behavior.
- A prompt uses render terms such as AO, PBR, ray tracing, anisotropic highlights, SSS, GI, or volumetric light as a keyword dump without attaching them to visible surfaces, contact points, materials, or light sources.
- The prompt uses many shot changes in one room/location without saying inserts stay on the same axis and return to the same master position.
- A layout/blocking reference is supplied but its role is not isolated from identity, style, lighting, or material references.
- An abstract color-board/CAD reference is supplied but the prompt does not map colors/shapes to subjects, objects, set pieces, action path, or camera/view hints.
- A diagram reference with labels/arrows/grids is uploaded without saying not to copy the labels, arrows, grid, color blocks, or diagram style into the final video.
- A large or elongated object is controlled only by a point or vague phrase such as "near the character" without footprint, long-axis orientation, front/nose/end direction, and front/back layer.
- A prompt depends on occlusion or staging such as "object in front of subject" or "subject behind object" but does not explicitly lock foreground/midground/background hierarchy.
- The task requires audio but supplies only generic phrases such as "epic BGM", "cinematic music", or "strong sound effects" without cue function, timing, sound focus, or silence.

When a hard fail appears, rewrite the risky section instead of merely warning.

## Output Shape

```text
Preflight：
通过/需修改：
最大风险：
风险依据：
归因类型：提示词/素材/工作流/已验证模型限制/不确定
冲突项：
缺失锁定：
音乐与声音：
建议拆段：
修正版提示词：
下一轮只调：
```

## Quality Gate

- Are reference roles explicit?
- Is the generation mode explicit and compatible with the available assets?
- If the output is meant to be pasted directly, is `完整可复制提示词` a standalone code block containing only the model-ready prompt, with negative constraints included?
- Can the model know the first frame state?
- For action clips, is the first frame already in motion, pressure, aftermath, near-contact, or a purposeful standoff rather than a boring neutral lineup?
- If emotion changes, does the prompt include visible time-state cues rather than only emotion labels?
- Is each time segment visually different?
- What is the timing confidence and its evidence? Are exact segment ranges justified, and are total duration, peak location, content density, and physical action timing compatible?
- Are micro-shot timings being confused with useful macro-segment timing?
- Does shot density rise and release deliberately instead of remaining uniform?
- Does the global visual master appear before the detailed shot list and control every later beat?
- Does the global camera / shot-style master appear before timed beats when the task is action, monster, chase, PV, transformation, or otherwise camera-sensitive?
- For high-energy action, does the master preserve deliberate style names as compact anchors, avoid excessive name stacking, and add only the camera, composition, material, or physics clarification actually needed?
- If named anchors are used, what is each anchor doing?
- Does each beat have audiovisual grammar before material/style detail?
- If action weight matters, are support, mass distribution, contact response, and inertia resolution explicit?
- Before named style/action anchors, do the basic action mechanics stand on their own?
- Does every principal performer have a visually persistent action grammar, and do multiple performers remain distinct?
- If the prompt is substantial, did research materially inform the result?
- If external or user-made references were supplied, were they classified by scope and role before being used?
- If references are used, what exact role and segment does each reference own?
- If this is a retry after repeated failure, is the change evidence-backed and narrow enough to test?
- Is action readable and not overpacked?
- Does the camera instruction contradict itself?
- Does action-camera tracking ownership follow initiative and force transfer?
- Are style and realism level stable?
- Does the prompt include aesthetic direction when style matters?
- Are industry-specific terms tied to visible objects, layouts, construction details, materials, or motion rather than used as labels?
- Does the prompt include a material/light/render realism layer for every visual scene?
- Are render terms bound to visible surfaces and shot conditions rather than used as loose keywords?
- Are negative constraints specific, not generic spam?
- Does the same character/weapon keep a stable physical identity across shots?
- If audio matters, are music, dialogue, ambience, foley/effects, silence, and sync points intentionally prioritized?
- Is there a controlled retry variable?
- If using a layout board, are object footprints, front/back layers, long-axis orientations, facing/gaze directions, and action paths explicitly mapped?
- Are model-limit claims supported by current documentation or repeated inspected evidence rather than inferred from one overloaded prompt?

## Avoid

- Do not rewrite everything if one variable is the problem.
- Do not add more adjectives when the prompt is already overloaded.
- Do not hide feasibility problems to sound encouraging.
- Do not recommend multi-shot generation as one clip when splitting would clearly be safer.
- Do not label a likely prompt, reference, or workflow failure as a model limitation without evidence.
