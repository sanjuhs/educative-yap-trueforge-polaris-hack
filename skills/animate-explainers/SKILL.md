---
name: animate-explainers
description: Design and implement narration-driven explainer animations with purposeful camera motion, procedural illustrations, causal diagrams and distinct shots. Use when authoring or improving code-rendered educational videos, including Educative Yap designs.
---

# Animate explainers

Make the explanation visible. Start with a finished narration about the requested subject, then assign a visible action to each explanatory beat. Learn from the reference project's timing and composition techniques, not its historical claims, war imagery, palette or fixed chapter order. Choose a visual language appropriate to the topic.

## Direct the sequence

For each beat, specify: **what the viewer learns → concrete objects → visible transformation → camera/composition → timed reveal → resulting state**. Put this compact shot plan in `visualIntent` when using Yap. “A beautiful dynamic diagram” is insufficient. “A CSS rule connects to three matching buttons; their fills change together while unmatched buttons remain gray” explains a mechanism.

Use scene-specific artwork. A route can trace while objects traverse it; a cutaway can uncover hidden components; a diagram can assemble and then operate; a chart can build from verified values; a camera can pull out to reveal a larger relationship. Retain an object's identity across shots where useful. Do not spend most of the screen on a permanent title, header and repeated card layout. Let the explanatory image dominate and move or retire labels as understanding develops.

Alternate compositions when the concept changes: close detail → environment → cutaway → process → consequence. Within a shot, stage two or three meaningful actions instead of revealing everything immediately. An action should establish, change, or explain something. Parallax, grain and drifting backgrounds support this; they do not count as the explanation. Prefer a few convincing objects to many generic rectangles. Use quiet holds when viewers need to understand a complex state.

## Motion that carries meaning

- **Depth:** separate foreground, subject and background; give layers different translation speeds and contrast. Camera position and scale must remain continuous unless deliberately cutting. Pan toward the next object or zoom into the mechanism being discussed.
- **Physical action:** animate parts as well as the whole object—a walking figure has a gait, a wheel turns as a vehicle moves, a hinge rotates around its attachment. For nonphysical topics animate state transitions: DOM creation, packet delivery, selector matches, energy transfer.
- **Causal reveals:** trace a path before moving its payload; animate an input before the output changes; show a failed connection actually stop. Label what symbols mean, without treating icon counts as measured quantities.
- **Transitions:** prefer match cuts or a 0.3–0.6s blend of complete outgoing/incoming scenes. Avoid briefly exposing all scene layers, or letting a photograph or clip vanish into an empty box. The next visual must take over when a clip ends.
- **Typography:** use short labels beside the relevant object. Animate a title once, then give space back to the explanation. Do not use paragraph cards as the principal visual. Maintain readable contrast and clear caption/credit areas.

## Make timing deterministic

Use a pure frame function or a paused GSAP timeline. Every frame must work when requested out of order. Derive movement from local scene time, never accumulated frame counts, wall clocks, timers, or mutable random state. Reset Canvas transforms, alpha, compositing and the background every frame; balance every save/restore. Cache static geometry, not time-dependent state. Seed any procedural variation with stable object IDs; prefer fixed data when the host prohibits randomness.

A reusable timing primitive, not a scene template:

```js
const clamp01 = x => Math.max(0, Math.min(1, x));
const progress = (t, start, span) => clamp01((t - start) / Math.max(.001, span));
const easeOut = p => 1 - (1 - p) ** 3;
// local = time - scene.start; use scene.duration from the host.
// Reveal path over one interval, then move the payload over the next.
const reveal = easeOut(progress(local, scene.duration * .10, scene.duration * .25));
const travel = easeOut(progress(local, scene.duration * .35, scene.duration * .45));
```

Anchor important changes to narration. Use actual sentence timings when available. In Yap, each scene supplies measured `start` and `duration`; use one sentence or a tightly related beat per scene for reliable alignment. Within-scene fractions are approximate, not word-level alignment. Never copy the reference's absolute timestamps into a new narration.

## Duration and host contract

Build the requested amount of content. A 5–10s video demonstrates one idea; a multi-minute video needs chapters, examples and consequences, not stretched short-video scenes. Plan roughly 2.1 spoken words per second, accounting for short pauses, then use measured audio timing. When a target is supplied, aim within ±6s. Keep motion responsive to each scene's actual duration.

In Educative Yap, author `motion.html/css/javascript`; define `window.renderFrame(time, duration, scenes)` on a 1080×1920 artboard. Use available GSAP, Canvas or SVG. No external scripts, fonts, network calls, timers or generated captions/audio. Imported image and clip IDs must match the tool results exactly. Host captions and credits occupy the lower area: keep important artwork above y=1650 unless the presenter layout specifies a smaller area. Frame a vertical composition intentionally; do not crop a landscape scene and lose its subject. Preserve uploaded presenter narration and duration.

## Review the moving result

Check whether the narration actually answers the brief. Inspect frames at each major composition change and near transitions, not only the title. Compare two times inside a shot: has the visual explanation advanced? Check backwards seeking and the final frame. Confirm that paths, labels, subjects and captions do not overlap unintentionally. Stills cannot prove good motion; scrub or play the rendered result when possible. Repair concrete problems before exporting. Preview critiques and timing tolerance are checks, not proof of factual accuracy.

For deeper implementation examples from the studied project, read [references/reference-analysis.md](references/reference-analysis.md). Do not copy its unverified figures or illustrative geographic points as historical evidence.
