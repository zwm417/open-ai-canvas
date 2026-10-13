# Preflight Checklist

Use this for every final AI video prompt check.

## Reference Roles

Check:

- which image locks identity?
- which image locks outfit?
- which image locks prop/vehicle?
- which image locks scene?
- which image locks style?
- which image should be ignored for unrelated details?

Prompt block:

```text
@Image1 locks character identity and outfit. @Image2 locks vehicle design. @Image3 locks environment palette and architecture. Do not copy unrelated poses or backgrounds.
```

## First Frame State

State what exists at the start:

- current form
- location
- pose
- prop state
- weather/lighting
- action phase

Avoid relying on conversation history.

## Timing

First distinguish:

- total clip duration: hard requirement;
- structural timing: approximate hook/turn/peak/ending placement;
- physical timing: preload, action, consequence, braking, recovery;
- macro-segment duration: exact when timing confidence is high;
- individual shot duration: omit by default; hard-code only for synchronization or necessary edit control.

First determine timing evidence:

- reviewed reference footage or a successful previous output;
- animatic, storyboard timing, or edit map;
- music/dialogue/first-last-frame/edit synchronization;
- credible physical action-phase and content-density budget.

Then assign confidence:

- high: exact macro-segment ranges;
- medium: approximate ranges or proportions;
- low: causal order only.

For each exact segment, check:

- duration is enough for the action
- one main action per segment
- one dominant camera move per segment
- segment adds new information or pressure
- all intervals sum to total duration without accidental gaps or overlaps
- simple actions are not stretched into idle holds
- heavy or transforming actions are not compressed below their physical stages

Keep individual shot timing flexible unless a specific cut requires synchronization.

## Global Visual Master

Check that the prompt defines before detailed shots:

- medium and realism level;
- primary aesthetic family;
- palette ownership and forbidden drift;
- line/shape/silhouette language;
- material-light system;
- rendering hierarchy and optical character.

Local shots may vary scale and angle but must inherit this master.

## Action Physics

Check when the scene includes weapons, armor, robots, creatures, throws, collisions, transformations, vehicles, or superhuman force:

- actor strength is defined relative to the load;
- weapon length, grip, and mass distribution are stable;
- center of mass remains supported or a step/slide/brace/airborne phase is shown;
- force starts from a visible support chain;
- contact moves both systems or intentionally redirects one;
- follow-through, braking, and recovery fit the load;
- the environment reacts from a visible source;
- transformed forms receive new handling behavior;
- camera holds long enough to see support and consequence.

Prompt block:

```text
Action physics: [actor/load relation], [mass distribution], [support and center path],
[contact response], [follow-through/braking], [stable end state].
```

## Continuity Locks

Lock:

- face and age
- hair silhouette
- outfit structure
- prop/vehicle silhouette
- color ownership
- world material rules
- lighting direction
- screen direction

## Contradiction Scan

Look for:

- locked camera + handheld + orbit + zoom in same shot
- no camera movement + rapid tracking
- daylight + neon night + pitch-black rain alley
- realistic 3D + flat 2D manga + photoreal live action
- slow motion + extremely fast continuous action with many cuts
- negative prompt forbids something the positive prompt requires

## Keyword Contamination Scan

Check whether any current prompt word is likely to pull the model toward an unwanted association cluster. Do not check against a fixed example blacklist; infer the contaminating word from the current concept.

Risk signs:

- negative phrasing keeps a risky noun alive even while trying to remove it;
- a loaded activity, profession, genre, tool, or role label imports default props, costumes, locations, or screen-facing proof;
- an abstract verb requires invisible intent, attention, gaze, awareness, orientation, or interaction;
- a camera/shot label is asked for without visible proof through surfaces, scale, occlusion, or frame occupancy;
- the prompt asks the model to avoid an old failure by naming that failure.
- a context rewrite describes the old context in order to reject it, instead of stating the new current frame.

Repair before approval:

```text
Replace contaminated keywords with positive visible facts:
[who/what is visible] + [which side/surface is visible] + [what is hidden] + [contact/pose/path details]
Replace abstract actions with what the camera sees:
[visible body/object axis] + [target placement if needed] + [surface/edge/light proof]
Replace shot-size labels with frame occupancy and visible surfaces.
```

Approve only when the prompt describes the desired image directly rather than explaining which wrong image to avoid.

## Negative And Context Rewrite Gate

Before approving the final copyable prompt, inspect every negative clause and every "change from previous" phrase.

Reject or rewrite when:

- a negative names a target-irrelevant old subject, prop, location, costume, creature, style, palette, action mode, or camera setup;
- the prompt says the new shot is "not / no longer / different from" an old shot;
- the negative side contains more concrete nouns than the positive side;
- a correction phrase preserves the old failure as a salient concept.

Approve when:

- the positive prompt already states the new visible target state clearly;
- negatives only cover broad artifact classes, continuity drift, extra subjects, style drift, object morphing, camera randomness, or proven recurring failure modes;
- any old-context concern has been translated into a current positive lock.

## Minimal Negative Prompt

Negatives should target likely failures:

```text
no face drift, no outfit color change, no vehicle morphing, no extra riders, no random camera spin, no style shift, no full-frame blur, no teleporting between unrelated locations
```

For weighted action:

```text
no weightless weapon, no instant stop, no sliding feet without traction response,
no impact shown only by sparks or camera shake, no unchanged handling after transformation
```
