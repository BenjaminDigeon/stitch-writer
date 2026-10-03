import { describe, expect, it } from 'vitest';
import { setCell, shiftGlyph, toggleKnot, toggleSegment, resizeGlyph } from './edit.ts';
import type { GlyphDef } from './schema.ts';

const empty: GlyphDef = { type: 'char', width: 3 };

describe('glyph edits', () => {
  it('paints and erases cells', () => {
    let g = setCell(empty, 1, -2, 'X');
    g = setCell(g, 0, -1, 'O');
    expect(g).toMatchObject({ top: -2, rows: ['.X.', 'O..'] });
    g = setCell(g, 1, -2, null);
    expect(g).toMatchObject({ top: -1, rows: ['O..'] });
    expect(setCell(g, 0, -1, null)).toEqual({ type: 'char', width: 3 });
  });

  it('keeps cells outside the advance box with a left offset', () => {
    const g = setCell(empty, -1, -1, '/');
    expect(g).toMatchObject({ left: -1, rows: ['/...'] });
  });

  it('toggles backstitch segments and joins them into polylines', () => {
    let g = toggleSegment(empty, { x1: 0, y1: -3, x2: 0, y2: 0 });
    g = toggleSegment(g, { x1: 0, y1: 0, x2: 2, y2: 0 });
    expect(g.lines).toEqual([{ pts: [0, -3, 0, 0, 2, 0] }]);
    g = toggleSegment(g, { x1: 2, y1: 0, x2: 0, y2: 0 });
    expect(g.lines).toEqual([{ pts: [0, -3, 0, 0] }]);
  });

  it('toggles knots, shifts and resizes', () => {
    let g = toggleKnot(empty, 1.5, -4);
    expect(g.knots).toEqual([{ x: 1.5, y: -4 }]);
    g = setCell(g, 0, -1, 'X');
    g = shiftGlyph(g, 1, -1);
    expect(g).toMatchObject({ top: -2, rows: ['.X.'], knots: [{ x: 2.5, y: -5 }] });
    expect(toggleKnot(g, 2.5, -5).knots).toBeUndefined();
    expect(resizeGlyph(g, 5).width).toBe(5);
  });
});
