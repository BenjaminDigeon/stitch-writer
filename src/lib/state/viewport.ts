/** Screen transform of the preview: screen = chart × scale + (tx, ty). Scale is pixels per cell. */
export interface Viewport {
  scale: number;
  tx: number;
  ty: number;
}

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 80;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Zooms by `factor` and keeps the screen point (px, py) on the same chart point. */
export function zoomAt(v: Viewport, factor: number, px: number, py: number): Viewport {
  const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
  const k = scale / v.scale;
  return { scale, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k };
}

/** Fits the content in the view, centred, with a margin. `offset` moves the view origin (rulers). */
export function fitViewport(
  content: { w: number; h: number },
  view: { w: number; h: number },
  pad = 24,
  maxScale = 28,
  offset = 0,
): Viewport {
  const scale = clamp(
    Math.min((view.w - 2 * pad) / content.w, (view.h - 2 * pad) / content.h, maxScale),
    MIN_SCALE,
    MAX_SCALE,
  );
  return {
    scale,
    tx: offset + (view.w - content.w * scale) / 2,
    ty: offset + (view.h - content.h * scale) / 2,
  };
}
