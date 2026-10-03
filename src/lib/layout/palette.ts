import type { ColorRange } from './color.ts';
import { normalizeRanges } from './ranges.ts';

/** A ready-made list of text colors (DMC numbers). */
export interface ColorPreset {
  id: string;
  name: string;
  colors: readonly string[];
}

export const COLOR_PRESETS: readonly ColorPreset[] = [
  { id: 'rainbow', name: 'Rainbow', colors: ['666', '740', '444', '702', '996', '820', '553'] },
  { id: 'pastel', name: 'Pastel', colors: ['3326', '744', '368', '964', '3325', '210'] },
  { id: 'christmas', name: 'Christmas', colors: ['321', '699', '729', '498', '909'] },
];

/** The new index of the color at `index` when the color at `from` moves to `to`. */
export function movedIndex(index: number, from: number, to: number): number {
  if (index === from) return to;
  if (from < to && index > from && index <= to) return index - 1;
  if (to < from && index >= to && index < from) return index + 1;
  return index;
}

/** Changes the color of each range. A range whose color `map` gives as null goes away. */
export function remapRangeColors(
  ranges: readonly ColorRange[],
  map: (color: number) => number | null,
): ColorRange[] {
  const out: ColorRange[] = [];
  for (const r of ranges) {
    const color = map(r.color);
    if (color !== null) out.push({ ...r, color });
  }
  return normalizeRanges(out);
}
