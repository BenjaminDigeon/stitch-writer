import type { DotOverrides } from './types.ts';

/**
 * Moves the dot overrides with the text. The overrides before the edit stay, the overrides after the
 * edit move by the length difference, and the overrides inside the edited range are removed.
 */
export function remapOverrides(prev: string, next: string, ov: DotOverrides): DotOverrides {
  const keys = Object.keys(ov);
  if (!keys.length || prev === next) return ov;
  let p = 0;
  const max = Math.min(prev.length, next.length);
  while (p < max && prev[p] === next[p]) p++;
  let s = 0;
  while (s < max - p && prev[prev.length - 1 - s] === next[next.length - 1 - s]) s++;
  const delta = next.length - prev.length;
  const out: DotOverrides = {};
  for (const k of keys) {
    const [startStr, ...rest] = k.split(':');
    const start = Number(startStr);
    if (start < p) out[k] = ov[k]!;
    else if (start >= prev.length - s) out[[start + delta, ...rest].join(':')] = ov[k]!;
  }
  return out;
}
