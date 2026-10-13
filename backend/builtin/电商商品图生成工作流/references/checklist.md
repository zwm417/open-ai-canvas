# Ecommerce Image Workflow Checklist

Run this before handoff. P0 items must pass for the output to be usable.

## P0 - must pass

- [ ] **Reference image exists.** The workflow used at least one real uploaded
  product image. If no image was available, the run stopped and asked the user
  to upload one.
- [ ] **Reference-product mode only.** The output is not a brief-only concept
  product. Any brief-only request was deferred.
- [ ] **One product.** The run targets one product, not a SKU family or mixed catalog.
- [ ] **Product fidelity lock appears in every prompt.** Each generated slot
  prompt preserves shape, silhouette, color, material, logo/label placement,
  visible construction details, and proportions.
- [ ] **No redesign.** Prompts do not add, remove, relocate, recolor, or restyle
  product features. Product edit requests that change the product itself are
  out of scope for this V1 workflow and should be deferred to a follow-up
  workflow.
- [ ] **Three-slot scope.** The set is limited to main, feature, and lifestyle
  unless the user explicitly requested fewer.
- [ ] **Native batch bridge only.** On a workflow canvas, all generator nodes
  were configured first and submitted through one `run-batch`; no provider API,
  upstream Open Design command, or direct 智影生图工作台 generation was called.
- [ ] **Batch limits are respected.** The batch contains no more than 200 unique
  node IDs and uses concurrency between 1 and 200.
- [ ] **Native billing is preserved.** Every item uses the generator send action,
  including membership checks, points billing, model parameters, provider
  routing, polling, and durable OSS persistence.
- [ ] **Reference node is reused.** The real product material appears once on
  canvas and connects to every applicable generator; it was not duplicated per
  slot. If no reference-capable model exists, the workflow stops.
- [ ] **No fabricated claims.** The feature image does not invent
  certifications, measurements, materials, ingredients, performance numbers,
  awards, or compliance promises.
- [ ] **No tiny rendered text dependency.** Prompts avoid relying on small
  in-image text for selling points; they leave clean label space when copy will
  be added later.
- [ ] **Manifest exists.** `image-manifest.json` records workflow name, mode,
  product name/label, reference images, slot ids, output filenames, aspects,
  and prompt summaries.
- [ ] **Gallery exists.** `ecommerce-gallery.html` shows the reference image
  first and the generated main, feature, and lifestyle slots.
- [ ] **Batch QA is complete.** All outputs were reviewed together. Accepted
  nodes were not rerun; only failed or non-compliant original nodes were updated
  and retried with `force: true`.

## P1 - should pass

- [ ] **Slot roles are visually distinct.** Main is a clean packshot, feature is
  detail/benefit focused, lifestyle is contextual.
- [ ] **Backgrounds are meaningfully distinct.** For creative multi-image sets,
  each background differs in at least three meaningful properties such as
  environment, surface, lighting, camera/depth, spatial structure, or props.
  Marketplace-mandated pure-white MAIN images remain compliant.
- [ ] **Backgrounds fit ecommerce use.** Main image uses white/off-white/light
  grey; feature and lifestyle avoid noisy backgrounds that hide product details.
- [ ] **Scale is plausible.** Product size and proportions remain credible across all slots.
- [ ] **Human interaction is controlled.** Hands/models do not hide the product
  or alter its construction.
- [ ] **File names are predictable.** Outputs use `<product-slug>-main.png`,
  `<product-slug>-feature.png`, and `<product-slug>-lifestyle.png` or similarly
  readable names.

## P2 - nice to have

- [ ] **Marketplace note included.** Handoff states that platform-specific
  crop/background/text rules remain a follow-up or human review step.
- [ ] **Variation path is clear.** Handoff suggests the next useful variant,
  such as a different lifestyle scene or a second feature focus.
