# What makes the reference work

Studied source: `vietnam-war-video-explainer` supplied by the user, including its HTML player, `core.js`, `assets.js`, `map.js`, `scenes.js`, `main.js`, `timings.js`, `narration.json`, audio builder and frame renderer. This is an analysis of techniques; it contains no copied project assets and does not establish the reference's historical accuracy. The reference is being actively edited; these notes describe the implementation inspected on 2026-09-26.

## Architecture to transfer

`core.js` separates easing, drawing and text helpers. Its `P(t,a,d)` converts time into clamped interval progress. `assets.js` composes silhouettes from simple geometry and animates their parts independently. `map.js` separates world coordinates from screen coordinates through a camera and computes positions along polylines by distance. `scenes.js` paints a complete frame from local time; individual chapters contain several distinct sub-shots. `main.js` composites adjacent scenes through an offscreen buffer and then draws consistent overlays. `build_audio.py` measures sentence audio, builds the authoritative timeline and resolves named events relative to sentences. `render.mjs` samples that exact same frame function at 30fps.

This division is conceptual, not a requirement to create seven files. Yap accepts one HTML/CSS/JS payload; organize its JavaScript into helpers, asset functions, scene functions and one compositor. Build objects once or draw only the active scene. For long videos, keep the source compact through reusable geometry helpers while giving chapters different staging and explanatory actions.

## Useful concrete sequences

- **Opening depth:** multiple jungle layers move at different speeds; subject helicopters have independent translation, bobbing and rotor phase. The title enters over a deliberately quiet part of the image. Transfer this to layers of clouds, a city, a circuit or any relevant environment—not mandatory military imagery.
- **Division:** clip a colored reveal inside a geographic outline, draw a dividing line, then introduce the two regions. Camera and fill changes make political division legible. Geographic coordinates need a trustworthy source; an abstract block is not an accurate map.
- **Domino analogy:** successive objects pivot at their base with staggered start times. The metaphor is the actual motion, not an icon with a text description. Distinguish an actor's theory from an asserted historical outcome.
- **Hidden systems:** a cross-section reveals tunnels in stages; chambers illuminate; figures traverse the connected paths. This transfers well to pipes, cells, networks and software internals.
- **Supply routes:** a path draws first; payload markers travel at approximately constant distance per second. Segment-length interpolation avoids acceleration artifacts on short segments.
- **Consequence:** an object reaches another object before the consequence begins. A gate pivots only after the tank reaches it. For technical topics, change the output after the input or connection arrives.
- **Variety:** map → physical analogy → quantitative chart → cross-section → newspaper illustration → scene reconstruction. The image changes because the explanation requires a different perspective.

## Things not to inherit blindly

The reference includes illustrative point clouds, hand-simplified geography, uncited numeric claims, dense cards and small landscape labels. Do not present procedural points as real event locations or inherit claims without verification. Named events with absolute second offsets can drift after speech changes; use actual timings. A long outro can miss a requested duration. Grain and flashes should be restrained. External Google fonts in its player are unavailable in Yap's isolated renderer. Its synthesized SFX and music system is separate from Yap's current ambient bed; do not promise that SFX are implemented merely because this skill describes visual timing.
