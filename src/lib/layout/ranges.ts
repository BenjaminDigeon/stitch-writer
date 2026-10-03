import type { ColorRange } from './color.ts';

/** A change of the text: `removed` characters at `start` were replaced by `inserted` characters. */
export interface TextEdit {
  start: number;
  removed: number;
  inserted: number;
}

/** Sorts the ranges, removes the empty ones, and joins the ranges of the same color that touch. */
export function normalizeRanges(ranges: readonly ColorRange[]): ColorRange[] {
  const out: ColorRange[] = [];
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    if (r.end <= r.start) continue;
    const last = out[out.length - 1];
    if (last && last.end === r.start && last.color === r.color) last.end = r.end;
    else out.push({ ...r });
  }
  return out;
}

/**
 * Gives `color` to the text from `start` to `end`, or gives it back to the automatic colors when
 * `color` is null. A range that goes across the edges is cut in two.
 */
export function paintRange(
  ranges: readonly ColorRange[],
  start: number,
  end: number,
  color: number | null,
): ColorRange[] {
  const out: ColorRange[] = [];
  for (const r of ranges) {
    if (r.end <= start || r.start >= end) {
      out.push(r);
      continue;
    }
    if (r.start < start) out.push({ start: r.start, end: start, color: r.color });
    if (r.end > end) out.push({ start: end, end: r.end, color: r.color });
  }
  if (color !== null && end > start) out.push({ start, end, color });
  return normalizeRanges(out);
}

/**
 * Moves the ranges with a change of the text, as a word processor does:
 * - the removed text leaves its ranges, and a range that becomes empty goes away;
 * - new text inside a range, or just after it, takes its color;
 * - new text just before a range does not take its color.
 */
export function shiftRanges(ranges: readonly ColorRange[], edit: TextEdit): ColorRange[] {
  const { start: p, removed, inserted } = edit;
  const afterRemove = (x: number) => (x <= p ? x : x >= p + removed ? x - removed : p);
  const out: ColorRange[] = [];
  for (const r of ranges) {
    let s = afterRemove(r.start);
    let e = afterRemove(r.end);
    if (inserted > 0) {
      if (s < p && e >= p) e += inserted;
      else if (s >= p) {
        s += inserted;
        e += inserted;
      }
    }
    if (e > s) out.push({ start: s, end: e, color: r.color });
  }
  return normalizeRanges(out);
}

/**
 * Finds the change from `prev` to `next`. `caret` is the caret position after the change, at the end
 * of the new text. It tells where the change is when the text repeats ("a" typed after "a").
 */
export function textEdit(prev: string, next: string, caret?: number): TextEdit {
  const edit = (start: number, suffix: number): TextEdit => ({
    start,
    removed: prev.length - suffix - start,
    inserted: next.length - suffix - start,
  });
  const max = Math.min(prev.length, next.length);
  let start = 0;
  if (caret !== undefined && caret >= 0 && caret <= next.length && prev.endsWith(next.slice(caret))) {
    const suffix = next.length - caret;
    while (start < max - suffix && prev[start] === next[start]) start++;
    return edit(start, suffix);
  }
  while (start < max && prev[start] === next[start]) start++;
  let suffix = 0;
  while (suffix < max - start && prev[prev.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++;
  return edit(start, suffix);
}
