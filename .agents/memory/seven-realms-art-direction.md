---
name: Seven Realms art direction
description: The visual palette/lighting convention for the Blood & Ice ARPG and how to extend it
---

# Seven Realms — "Blood & Ice" art direction

The game is a frozen-realm ARPG, but the look is deliberately built on **warm-vs-cold
contrast**, not an all-cold palette. Cold base (slate-blue snow, teal ice, deep vignette)
punched through by **warm accents**: torch light pools, ember particles, crimson blood decals.

**Why:** the user steered the graphics toward a Diablo IV reference infographic, whose
whole premise is "tonos oscuros, fríos y cálidos para contrastar" (dark, cold AND warm
for contrast) with torch-lit dungeons and blood decals. A monochrome-cold scene reads flat;
the warm pools give depth and focal points.

**How to apply:** when adding new visual effects, keep the cold ambient base and reserve
warm hues (#ffb347 ember, #ff7020, torch orange, #5a0d0d / #3a0808 blood) for light sources,
fire, and gore. Additive (`globalCompositeOperation='lighter'`) for light glows; normal
alpha for blood/ground decals. All light/blood rendering lives in engine.ts draw helpers;
keep every helper wrapped in save/restore and reset composite op. Bound any accumulating
FX array (decals are capped; particles expire via life) so long runs don't leak.
