import type { TimedScene } from "./schema.js";

/** Runs in the render browser after authored animation; never uses wall time. */
export function applyPhotoMotion({
  time,
  duration,
  scenes,
}: {
  time: number;
  duration: number;
  scenes: TimedScene[];
}) {
  const modes = ["zoom-in", "pan-left", "zoom-out", "pan-right"];
  const images = Array.from(
    document.querySelectorAll<HTMLImageElement>(
      "#artboard img:not([data-clip-id])",
    ),
  ).filter((image) => {
    const src = image.getAttribute("src") || "";
    return (
      image.hasAttribute("data-photo-motion") ||
      /^\/?(?:visual-[a-f0-9]{64}|cafe\.png)$/.test(src) ||
      /^data:image\/(?:png|jpe?g|webp|avif);/i.test(src)
    );
  });
  for (const [index, image] of images.entries()) {
    const mode = image.dataset.photoMotion || modes[index % modes.length];
    if (mode === "none") {
      image.style.setProperty("object-view-box", "none");
      continue;
    }
    if (!modes.includes(mode))
      throw new Error(
        "Invalid data-photo-motion: use zoom-in, zoom-out, pan-left, pan-right or none.",
      );
    const placement = image.closest<HTMLElement>("[data-scene]");
    const sceneIndex = Number(placement?.dataset.scene);
    const scene = placement ? scenes[sceneIndex] : undefined;
    const offset = Number(image.dataset.offset || "0");
    if (
      (placement && (!Number.isInteger(sceneIndex) || !scene)) ||
      !Number.isFinite(offset) ||
      offset < 0 ||
      offset >= (scene?.duration ?? duration)
    )
      throw new Error(
        "Invalid photo placement: use a valid data-scene and data-offset within the shot duration.",
      );
    const progress = Math.max(
      0,
      Math.min(
        1,
        (time - (scene?.start ?? 0) - offset) /
          ((scene?.duration ?? duration) - offset),
      ),
    );
    // Crop the image contents, not its box: labels, border radius and authored
    // GSAP transforms stay in place, with no exposed edges or accumulating scale.
    let crop: string;
    if (mode === "zoom-in" || mode === "zoom-out") {
      const inset = 0.5 + 3.5 * (mode === "zoom-in" ? progress : 1 - progress);
      crop = `inset(${inset}%)`;
    } else {
      const left = 1 + 4 * (mode === "pan-left" ? progress : 1 - progress);
      crop = `inset(3% ${6 - left}% 3% ${left}%)`;
    }
    image.style.setProperty("object-view-box", crop);
  }
}
