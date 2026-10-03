import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layout } from '../layout/layout.ts';
import { DEFAULT_LAYOUT } from '../layout/types.ts';
import { ACSF_FONTS } from './acsf.ts';
import { openFont } from './fontkit.ts';
import { detectTtfGrid, loadTtfFont, ttfToFontFile } from './ttf.ts';
import { validateFont } from './validate.ts';

const bytes = (file: string) =>
  new Uint8Array(readFileSync(new URL(`../../../public/${file}`, import.meta.url)));

describe('TTF grid fonts (ACSF)', () => {
  it.each(ACSF_FONTS.map((f) => [f.name, f.file]))('finds the grid of %s', (_name, file) => {
    const grid = detectTtfGrid(openFont(bytes(file)));
    expect(grid.pitch).toBeGreaterThan(grid.mark);
  });

  it('shapes a word with joins, and each glyph keeps its source span', () => {
    const f = ACSF_FONTS.find((x) => x.id === 'acsf-brave')!;
    const font = loadTtfFont(bytes(f.file), { id: f.id, name: f.name, license: 'OFL-1.1' });
    const chart = layout('brave', font, { ...DEFAULT_LAYOUT, padding: 0 });
    expect(chart.issues.missing).toEqual([]);
    expect(chart.width).toBe(22);
    expect(chart.placements.map((p) => p.src.start)).toEqual([0, 1, 2, 3, 4]);
  });

  it('gives each join the source span of the letter after it', () => {
    const f = ACSF_FONTS.find((x) => x.id === 'acsf-brave')!;
    const font = loadTtfFont(bytes(f.file), { id: f.id, name: f.name, license: 'OFL-1.1' });
    const starts = (text: string) =>
      layout(text, font, { ...DEFAULT_LAYOUT, padding: 0 }).placements.map((p) => p.src.start);
    // "E", join + "m", join + "m", "a": the joins come before their letter.
    expect(starts('Emma')).toEqual([0, 1, 1, 2, 2, 3]);
    expect(starts('anna')).toEqual([0, 1, 1, 2, 2, 3]);
  });

  it.each(ACSF_FONTS.map((f) => [f.name, f]))('maps each glyph of %s to its letter', (_name, f) => {
    const font = loadTtfFont(bytes(f.file), { id: f.id, name: f.name, license: 'OFL-1.1' });
    const text = 'Happy birthday Emma, the quick brown fox jumps over lazy dogs';
    const starts = layout(text, font, { ...DEFAULT_LAYOUT, padding: 0 }).placements.map((p) => p.src.start);
    const letters = [...text].flatMap((c, i) => (c === ' ' ? [] : [i]));
    expect([...new Set(starts)]).toEqual(letters);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('replaces a character that the font does not have', () => {
    const f = ACSF_FONTS[0]!;
    const font = loadTtfFont(bytes(f.file), { id: f.id, name: f.name, license: 'OFL-1.1' });
    const chart = layout('aŏb', font, { ...DEFAULT_LAYOUT, padding: 0 });
    expect(chart.issues.substituted[0]).toMatchObject({ from: 'ŏ', to: 'o' });
    expect(chart.issues.missing).toEqual([]);
  });

  it('converts a TTF font into an editable font file', () => {
    const f = ACSF_FONTS[1]!;
    const file = ttfToFontFile(bytes(f.file), { id: 'copy', name: 'Copy', license: 'OFL-1.1' });
    expect(validateFont(file)).toEqual([]);
    expect(Object.keys(file.glyphs).length).toBeGreaterThan(100);
    expect(file.glyphs.a?.rows?.length).toBeGreaterThan(2);
  });
});
