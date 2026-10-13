# Shaw prompt-set manifest

Use this JSON shape for sets of three or more frames, reference synthesis, or drift repair.

```json
{
  "request": "一组雨后竹林里的孤独剑客",
  "mode": "modern-lone-wuxia",
  "ratio": "16:9",
  "series_dna": {
    "visual_thesis": "one sentence",
    "character_or_subject": "shared presence",
    "composition_grammar": "shared scale, placement and negative space",
    "style_mode_anchors": ["anchor one", "anchor two", "anchor three"],
    "palette_logic": "field, subject, highlight and accent roles",
    "lighting_logic": "direction and contrast architecture",
    "optical_treatment": "depth, grain, bloom, reflection and clarity",
    "emotional_tension": "shared contrast",
    "must_keep": ["anchor one", "anchor two"],
    "allowed_variables": ["shot", "viewpoint", "action"]
  },
  "frames": [
    {
      "id": "01",
      "title": "short title",
      "shot_role": "world/establishing",
      "subject_count": 1,
      "subject_scale": "12% of image height, full body",
      "weapon_rule": "exactly one plain sword contained by one dark wooden scabbard",
      "dominant_relation": "small traveler crosses beneath a much larger bamboo canopy",
      "variable_change": ["wide rear view", "wet bamboo path"],
      "continuity_anchors": ["one traveler", "one sword and one scabbard", "cold-mist palette"],
      "drift_risks": ["oversized portrait", "extra companion", "duplicate sword"],
      "midjourney_prompt": "English prompt --ar 16:9 --v 8.2",
      "imagegen_prompt": "中文提示词",
      "negative_constraints": ["nearest plausible drift"]
    }
  ]
}
```

Valid modes:

- `modern-lone-wuxia`
- `studio-classic`
- `action-wuxia`

Run:

```powershell
python scripts/audit_shaw_prompt_set.py prompt-set.json
```

The audit checks structure, modes, counts, continuity declarations, ratio agreement, exact Midjourney version endings, and absence of Midjourney syntax in ImageGen. It does not judge visual quality.

