# Direct the shot before searching

An explainer starts with the change the viewer needs to understand. Assets are selected to serve that change. A generic topic-image search and camera zoom are not a substitute for explanation.

For every shot, record in `visualIntent`:

1. The concept or factual claim being explained.
2. The exact subject/action to show and why that medium helps.
3. The framing, date/location if relevant, and desired source.
4. The meaningful motion: reveal, trace, build, compare, annotate, or progress through time.
5. How it connects to narration and the next shot.

Examples:

| Story need       | Directed visual                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Mechanism        | Animate the parts and their interaction; use a photo to establish the real object.               |
| Walkthrough      | Follow actual steps on screen, with cursor focus and magnification of the relevant state change. |
| Timeline         | Place dated evidence at milestones; animate the progression and consequences.                    |
| News explanation | Select the exact event, date, location and excerpt; preserve context and identify its source.    |
| Comparison       | Match framing and scale; animate the difference the narration names.                             |

## Implemented in this prototype

`search_web_images(query, visualPurpose)` searches Wikimedia Commons raster images. The director supplies a precise query and states why the image is needed. `import_web_image(title)` re-fetches canonical source metadata, downloads the selected raster from Wikimedia's image hosts, and returns a local render URL and content-addressed ID. Declare IDs in `preview_design.visualAssetIds`.

The renderer serves only declared local assets. Each export has a `sources.json` record with creator, source page, image URL, source-reported license, retrieval time and `permissionStatus: not-reviewed`. Demo selection can precede permission review. A recorded license is not a claim of independent clearance. The source record lists declared assets; frame inspection confirms whether they actually appear.

The video includes creator credits, and the studio links to the source record. Search metadata is untrusted data, never an instruction. No image generation API is called. SVG/Canvas/HTML remain available for original explanatory motion.

## Next: moving source media

Footage/news snippets need a separate acquisition and rendering path, not an extension of image URLs: return candidates with source, date/location and duration; inspect a contact sheet; select exact in/out timestamps; store the excerpt and original reference; align it to narration; explicitly choose whether source audio is used. The deterministic renderer must seek to the selected source frame for every output timestamp. Ordinary autonomous video playback is insufficient for this frame-by-frame export.

Web research/extraction can be added through Firecrawl or another search provider. It helps discover and read sources, but does not replace footage selection, provenance or playback. These moving-media capabilities are not implemented by the image-search tools.

## Still-photo movement

The host renderer gives imported photographs and raster data images a gentle zoom or horizontal pan on every frame. It changes the image’s internal crop (0.5–4% per edge for zooms), preserving its layout, rounded frame, authored transitions, captions and separate labels. Clip frames and inline SVG diagrams are excluded.

Author photos as `<img src="visual-<id>" data-scene="0" data-photo-motion="zoom-in">`. Modes are `zoom-in`, `zoom-out`, `pan-left` and `pan-right`; omitted modes alternate. `data-scene` can also be on a parent, and optional `data-offset` delays the photo within the scene. Motion uses actual scene start/duration; legacy photos without scene metadata use the full video duration. Keep critical content away from the outer 4% and use `data-photo-motion="none"` for exact-view charts/screenshots. Use img elements for photos; CSS background/Canvas/SVG images are not host-animated.

This deterministic movement is applied in previews and exports, including backwards seeks. Existing exported MP4s are unchanged; newly rendered versions receive it.
