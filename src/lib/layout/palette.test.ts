import { describe, expect, it } from 'vitest';
import { threadById } from '../threads/dmc.ts';
import { MAX_COLORS } from './color.ts';
import { COLOR_PRESETS, movedIndex, remapRangeColors } from './palette.ts';

describe('color presets', () => {
  it.each(COLOR_PRESETS.map((p) => [p.name, p]))('%s uses known and different DMC colors', (_n, p) => {
    expect(p.colors.length).toBeLessThanOrEqual(MAX_COLORS);
    expect(new Set(p.colors).size).toBe(p.colors.length);
    for (const id of p.colors) expect(threadById(id), id).toBeDefined();
  });
});

describe('movedIndex', () => {
  it('moves one color and shifts the colors between', () => {
    // [a, b, c, d]: b moves to the end → [a, c, d, b].
    expect([0, 1, 2, 3].map((i) => movedIndex(i, 1, 3))).toEqual([0, 3, 1, 2]);
    // d moves to the start → [d, a, b, c].
    expect([0, 1, 2, 3].map((i) => movedIndex(i, 3, 0))).toEqual([1, 2, 3, 0]);
    expect([0, 1, 2].map((i) => movedIndex(i, 1, 1))).toEqual([0, 1, 2]);
  });
});

describe('remapRangeColors', () => {
  it('changes the colors, removes the ranges of a removed color and joins the ranges', () => {
    const ranges = [
      { start: 0, end: 2, color: 0 },
      { start: 2, end: 4, color: 1 },
      { start: 5, end: 6, color: 2 },
    ];
    expect(remapRangeColors(ranges, (c) => (c === 2 ? null : 0))).toEqual([{ start: 0, end: 4, color: 0 }]);
  });
});
