import { describe, expect, it } from 'vitest';
import { makeFont } from '../font/test-fonts.ts';
import { layout } from './layout.ts';
import { DEFAULT_LAYOUT } from './types.ts';

// A small joined script, drawn for this test. "u" exits at its top right; "v" has two entry dots.
const script = makeFont(
  {
    u: ['X..X', 'X..X', '.XX.'],
    n: ['X..X', 'X...', '.XX.'],
    v: ['o.X', 'oX.', '.X.'],
    w: ['.X.', 'oX.', '.X.'],
    z: ['XXX', '.X.', 'XXX'],
  },
  { script: true, metrics: { ascent: 5, descent: 2, xHeight: 3, letterSpacing: 0, lineGap: 0 } },
);
const s = { ...DEFAULT_LAYOUT, padding: 0, align: 'left' as const };

describe('connector dots', () => {
  it('stitches the smallest set of dots that joins two letters', () => {
    // u ends at (3, -3) and (3, -2); v starts at x = 4, with dots at (4, -3) and (4, -2), and its
    // body at (5, -2). The dot (4, -2) is enough.
    expect(
      layout('uv', script, s)
        .dots.filter((d) => d.active)
        .map((d) => d.id),
    ).toEqual(['1:0:-2']);
    // n ends only at (3, -3): both dots are needed to reach (5, -2).
    expect(layout('nv', script, s).dots.filter((d) => d.active)).toHaveLength(2);
  });

  it('uses no dot when the letters already touch', () => {
    const c = layout('zw', script, s);
    expect(c.dots.filter((d) => d.active)).toHaveLength(0);
  });

  it('keeps the dots off at the start of a word', () => {
    const c = layout('v', script, s);
    expect(c.dots).toHaveLength(2);
    expect(c.dots.every((d) => !d.active)).toBe(true);
  });

  it('follows the policy and the overrides', () => {
    expect(layout('v', script, { ...s, dots: 'all' }).dots.every((d) => d.active)).toBe(true);
    expect(layout('uv', script, { ...s, dots: 'none' }).dots.every((d) => !d.active)).toBe(true);
    const id = layout('uv', script, s).dots.find((d) => d.active)!.id;
    const c = layout('uv', script, s, { [id]: false });
    expect(c.dots.find((d) => d.id === id)).toMatchObject({ active: false, overridden: true, auto: true });
  });
});
