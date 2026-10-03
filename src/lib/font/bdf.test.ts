import { describe, expect, it } from 'vitest';
import { parseBdf } from './bdf.ts';
import { loadFont } from './font.ts';
import { validateFont } from './validate.ts';
import { layout } from '../layout/layout.ts';
import { DEFAULT_LAYOUT } from '../layout/types.ts';

const BDF = `STARTFONT 2.1
FONT -test-tiny
SIZE 5 75 75
FONTBOUNDINGBOX 4 6 0 -1
STARTPROPERTIES 3
FONT_ASCENT 5
FONT_DESCENT 1
COPYRIGHT "Public domain"
ENDPROPERTIES
CHARS 3
STARTCHAR space
ENCODING 32
DWIDTH 3 0
BBX 1 1 0 0
BITMAP
00
ENDCHAR
STARTCHAR A
ENCODING 65
DWIDTH 4 0
BBX 3 5 0 0
BITMAP
40
A0
E0
A0
A0
ENDCHAR
STARTCHAR g
ENCODING 103
DWIDTH 4 0
BBX 3 4 0 -1
BITMAP
60
A0
60
C0
ENDCHAR
ENDFONT
`;

describe('BDF import', () => {
  it('reads the glyphs, the baseline and the advance', () => {
    const f = parseBdf(BDF, { id: 'tiny' });
    expect(validateFont(f)).toEqual([]);
    expect(f.glyphs.A).toEqual({
      type: 'char',
      width: 4,
      top: -5,
      rows: ['.X..', 'X.X.', 'XXX.', 'X.X.', 'X.X.'],
    });
    // "g" goes 1 row below the baseline: its last row is row 0.
    expect(f.glyphs.g!.top).toBe(-3);
    expect(f.glyphs['space-1']).toEqual({ type: 'space', width: 3 });
    expect(f.metrics).toMatchObject({ ascent: 5, descent: 1, letterSpacing: 0 });
    expect(f.source.license).toBe('Public domain');
  });

  it('gives a usable font', () => {
    const font = loadFont(parseBdf(BDF, { id: 'tiny' }));
    const chart = layout('AgA', font, { ...DEFAULT_LAYOUT, padding: 0 });
    expect(chart.width).toBe(4 + 4 + 3);
    expect(chart.issues.missing).toEqual([]);
  });
});
