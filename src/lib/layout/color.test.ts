import { describe, expect, it } from 'vitest';
import { makeFont } from '../font/test-fonts.ts';
import { rangeAt, threadPlan, tokenColors, type ColorMode, type ColorRange } from './color.ts';
import { layout } from './layout.ts';
import { tokenize } from './tokenize.ts';
import { DEFAULT_LAYOUT, decodeCell, type Chart, type Token } from './types.ts';

const font = makeFont({
  a: ['XX', 'XX'],
  b: ['X.', 'XX', 'XX'],
  'space-1': { rows: [], type: 'space', width: 0 },
  'heart-01': { rows: ['OO', 'OO'], type: 'motif' },
});

const colors = (text: string, mode: ColorMode, count: number, ranges: ColorRange[] = []) =>
  tokenColors(tokenize(text, font, { ligatures: false, substitute: true }), mode, ranges, count);

describe('tokenColors', () => {
  it('gives one color to all the text in "single" mode', () => {
    expect(colors('ab a', 'single', 3)).toEqual([0, 0, -1, 0]);
  });

  it('counts the letters, but not the spaces and the line breaks', () => {
    expect(colors('ab ab\nab', 'letter', 3)).toEqual([0, 1, -1, 2, 0, -1, 1, 2]);
  });

  it('counts the words, across the lines', () => {
    expect(colors('ab ab\nb', 'word', 2)).toEqual([0, 0, -1, 1, 1, -1, 0]);
  });

  it('counts only the lines that have stitches', () => {
    expect(colors('ab\n\nb\nab', 'line', 2)).toEqual([0, 0, -1, -1, 1, -1, 0, 0]);
  });

  it('counts a motif as one letter and one word', () => {
    expect(colors('a:heart-01:b', 'letter', 4)).toEqual([0, 1, 2]);
    expect(colors('ab:heart-01:ab', 'word', 4)).toEqual([0, 0, 1, 2, 2]);
  });

  it('gives no color to a missing character, and keeps it inside its word', () => {
    expect(colors('a✓b a', 'word', 3)).toEqual([0, -1, 0, -1, 1]);
  });

  it('gives one color to the glyphs of one character', () => {
    const tokens: Token[] = [
      { k: 'glyph', key: 'join', src: { start: 0, end: 1 } },
      { k: 'glyph', key: 'a', src: { start: 0, end: 1 } },
      { k: 'glyph', key: 'b', src: { start: 1, end: 2 } },
    ];
    expect(tokenColors(tokens, 'letter', [], 3)).toEqual([0, 0, 1]);
  });

  it('uses a color set by hand before the mode', () => {
    const ranges = [{ start: 1, end: 3, color: 2 }];
    expect(colors('abab', 'letter', 3, ranges)).toEqual([0, 2, 2, 0]);
    expect(colors('abab', 'single', 3, ranges)).toEqual([0, 2, 2, 0]);
  });

  it('ignores a color set by hand that is not in the list', () => {
    expect(colors('ab', 'single', 2, [{ start: 0, end: 1, color: 5 }])).toEqual([0, 0]);
  });
});

describe('rangeAt', () => {
  const ranges = [
    { start: 2, end: 4, color: 1 },
    { start: 6, end: 7, color: 0 },
  ];
  it('finds the range that contains an offset', () => {
    expect([0, 2, 3, 4, 6, 7].map((o) => rangeAt(ranges, o)?.color)).toEqual([
      undefined,
      1,
      1,
      undefined,
      0,
      undefined,
    ]);
  });
});

describe('threadPlan', () => {
  it('gives one chart thread to each different DMC number', () => {
    expect(threadPlan(['310', '321', '310'], '321')).toEqual({
      ids: ['310', '321'],
      textThreads: [0, 1, 0],
      accentThread: 1,
    });
    expect(threadPlan(['3750'], '899')).toEqual({ ids: ['3750', '899'], textThreads: [0], accentThread: 1 });
  });
});

describe('layout with colors', () => {
  const settings = { ...DEFAULT_LAYOUT, padding: 0, align: 'left' as const };
  const threadsIn = (chart: Chart) => {
    const used = new Set<number>();
    for (const code of chart.cells) if (code) used.add(decodeCell(code)!.thread);
    return [...used].sort();
  };

  it('keeps the font threads without color settings', () => {
    expect(threadsIn(layout('a:heart-01:', font, settings))).toEqual([0, 1]);
  });

  it('writes the thread of each letter, and the motif fill, into the cells', () => {
    const chart = layout('ab:heart-01:', font, settings, {}, undefined, {
      mode: 'letter',
      ranges: [],
      textThreads: [2, 0],
      accentThread: 1,
    });
    // a → color 0 (thread 2), b → color 1 (thread 0), the motif fill → thread 1.
    expect(threadsIn(chart)).toEqual([0, 1, 2]);
    expect(chart.stats.threads[2]!.full).toBe(4);
    expect(chart.stats.threads[0]!.full).toBe(5);
    expect(chart.stats.threads[1]!.full).toBe(4);
  });

  it('gives a connector dot the thread of its letter', () => {
    const script = makeFont(
      { u: ['X..X', 'X..X', '.XX.'], v: ['o.X', 'oX.', '.X.'] },
      { script: true, metrics: { ascent: 5, descent: 2, xHeight: 3, letterSpacing: 0, lineGap: 0 } },
    );
    const chart = layout('uv', script, settings, {}, undefined, {
      mode: 'letter',
      ranges: [],
      textThreads: [3, 4],
      accentThread: 5,
    });
    expect(chart.dots.map((d) => d.thread)).toEqual([4, 4]);
  });
});
