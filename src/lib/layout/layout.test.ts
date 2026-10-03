import { describe, expect, it } from 'vitest';
import { makeFont } from '../font/test-fonts.ts';
import { layout } from './layout.ts';
import { tokenize } from './tokenize.ts';
import { DEFAULT_LAYOUT, decodeCell, type Chart, type LayoutSettings } from './types.ts';

const font = makeFont({
  a: ['XX', 'XX'],
  b: ['X.', 'XX', 'XX'],
  g: { rows: ['XX', 'XX', '.X'], bottom: 0 },
  e: ['X'],
  é: ['X', '.', 'X'],
  "'": { rows: ['X'], bottom: -3 },
  'space-1': { rows: [], type: 'space', width: 0 },
  'space-2': { rows: [], type: 'space', width: 1 },
  'heart-01': { rows: ['OO', 'OO', 'OO', 'OO', 'OO', 'OO', 'OO'], type: 'motif' },
});

const settings = (s: Partial<LayoutSettings> = {}): LayoutSettings => ({
  ...DEFAULT_LAYOUT,
  padding: 0,
  align: 'left',
  ...s,
});

function ascii(chart: Chart): string[] {
  const rows: string[] = [];
  for (let y = 0; y < chart.height; y++) {
    let r = '';
    for (let x = 0; x < chart.width; x++) {
      const c = decodeCell(chart.cells[y * chart.width + x]!);
      r += !c ? '.' : c.half ? c.half : c.thread === 1 ? 'O' : 'X';
    }
    rows.push(r);
  }
  return rows;
}

describe('tokenize', () => {
  const o = { ligatures: false, substitute: true };

  it('keeps "10:30" as text and reads a motif token', () => {
    const t = tokenize('a:heart-01:a', font, o);
    expect(t.map((x) => x.k)).toEqual(['glyph', 'motif', 'glyph']);
    expect(tokenize('a:b:a', font, o).map((x) => x.k)).toEqual([
      'glyph',
      'missing',
      'glyph',
      'missing',
      'glyph',
    ]);
  });

  it('flags an unknown motif name', () => {
    const t = tokenize(':heart-99:', font, o);
    expect(t).toEqual([{ k: 'missing', text: ':heart-99:', src: { start: 0, end: 10 }, motif: true }]);
  });

  it('keeps the source spans of combining characters', () => {
    const t = tokenize('éa', font, o);
    expect(t[0]).toMatchObject({ k: 'glyph', key: 'é', src: { start: 0, end: 2 } });
    expect(t[1]).toMatchObject({ key: 'a', src: { start: 2, end: 3 } });
  });

  it('replaces characters that the font does not have', () => {
    expect(tokenize('’', font, o)[0]).toMatchObject({ k: 'glyph', key: "'", substitutedFrom: '’' });
    expect(tokenize('ê', font, o)[0]).toMatchObject({ key: 'e', substitutedFrom: 'ê' });
    expect(tokenize('A', font, o)[0]).toMatchObject({ key: 'a', substitutedFrom: 'A' });
    expect(tokenize('ê', font, { ...o, substitute: false })[0]).toMatchObject({ k: 'missing' });
  });
});

describe('layout', () => {
  it('returns an empty chart for empty or blank text', () => {
    expect(layout('', font, settings()).width).toBe(0);
    expect(layout('  \n ', font, settings()).width).toBe(0);
  });

  it('puts letter spacing between glyphs and uses the space glyph', () => {
    // a(2) + 1 + b(2) = 5; with space-1 (width 0): a + 1 + 0 + 1 + b = 6.
    expect(layout('ab', font, settings()).width).toBe(5);
    expect(layout('a b', font, settings()).width).toBe(6);
    expect(layout('a b', font, settings({ wordSpace: 2 })).width).toBe(7);
    expect(layout('ab', font, settings({ letterSpacing: 0 })).width).toBe(4);
  });

  it('aligns lines and counts stitches', () => {
    const c = layout('a\naba', font, settings({ align: 'center', lineSpacing: 0 }));
    expect(c.width).toBe(8);
    expect(c.stats.threads[0]!.full).toBe(4 + 4 + 5 + 4);
    const rows = ascii(c);
    expect(rows[0]).toBe('...XX...');
  });

  it('places descenders below the baseline and grows a line for a tall motif', () => {
    const c = layout('ag', font, settings());
    expect(ascii(c)).toEqual(['XX.XX', 'XX.XX', '....X']);
    const m = layout('a:heart-01:', font, settings());
    expect(m.height).toBe(7);
    expect(m.stats.threads[1]!.full).toBe(14);
  });

  it('reports missing and replaced characters with their spans', () => {
    const c = layout('a✓ê', font, settings());
    expect(c.issues.missing).toEqual([{ text: '✓', src: { start: 1, end: 2 } }]);
    expect(c.issues.substituted).toEqual([{ from: 'ê', to: 'e', src: { start: 2, end: 3 } }]);
  });

  it('adds padding around the design and centers it', () => {
    const c = layout('a', font, settings({ padding: 3 }));
    expect([c.width, c.height]).toEqual([8, 8]);
    expect(c.design).toEqual({ x0: 3, y0: 3, x1: 5, y1: 5 });
    expect(c.center).toEqual({ x: 4, y: 4 });
  });
});
