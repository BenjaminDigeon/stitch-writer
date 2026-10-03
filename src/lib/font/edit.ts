import { cellsToRows, normaliseGlyph, rowsToCells } from './normalise.ts';
import { segmentsToPolylines, type LatticeSegment } from './polyline.ts';
import type { GlyphDef } from './schema.ts';

/** Pure edits of a glyph. Each function returns a new, normalised glyph. */

const key = (x: number, y: number) => `${x},${y}`;

export function cellMap(def: GlyphDef): Map<string, string> {
  return new Map(rowsToCells(def).map((c) => [key(c.x, c.y), c.symbol]));
}

function withCells(def: GlyphDef, map: Map<string, string>): GlyphDef {
  const cells = [...map].map(([k, symbol]) => {
    const [x, y] = k.split(',').map(Number) as [number, number];
    return { x, y, symbol };
  });
  const packed = cellsToRows(def.width, cells);
  const { top: _t, left: _l, rows: _r, ...rest } = def;
  return normaliseGlyph(
    packed ? { ...rest, top: packed.top, left: packed.left || undefined, rows: packed.rows } : rest,
  );
}

export function setCell(def: GlyphDef, x: number, y: number, symbol: string | null): GlyphDef {
  const map = cellMap(def);
  if (symbol) map.set(key(x, y), symbol);
  else map.delete(key(x, y));
  return withCells(def, map);
}

/** The straight segments of the glyph lines. */
export function segmentsOf(def: GlyphDef): LatticeSegment[] {
  const out: LatticeSegment[] = [];
  for (const l of def.lines ?? []) {
    for (let i = 2; i < l.pts.length; i += 2)
      out.push({ x1: l.pts[i - 2]!, y1: l.pts[i - 1]!, x2: l.pts[i]!, y2: l.pts[i + 1]! });
  }
  return out;
}

const sameSeg = (a: LatticeSegment, b: LatticeSegment) =>
  (a.x1 === b.x1 && a.y1 === b.y1 && a.x2 === b.x2 && a.y2 === b.y2) ||
  (a.x1 === b.x2 && a.y1 === b.y2 && a.x2 === b.x1 && a.y2 === b.y1);

function withSegments(def: GlyphDef, segs: LatticeSegment[]): GlyphDef {
  const lines = segmentsToPolylines(segs).map((pts) => ({ pts }));
  const { lines: _l, ...rest } = def;
  return normaliseGlyph(lines.length ? { ...rest, lines } : rest);
}

/** Adds the segment, or removes it when the glyph already has it. */
export function toggleSegment(def: GlyphDef, seg: LatticeSegment): GlyphDef {
  if (seg.x1 === seg.x2 && seg.y1 === seg.y2) return def;
  const segs = segmentsOf(def);
  const i = segs.findIndex((s) => sameSeg(s, seg));
  if (i >= 0) segs.splice(i, 1);
  else segs.push(seg);
  return withSegments(def, segs);
}

export function toggleKnot(def: GlyphDef, x: number, y: number): GlyphDef {
  const knots = [...(def.knots ?? [])];
  const i = knots.findIndex((k) => k.x === x && k.y === y);
  if (i >= 0) knots.splice(i, 1);
  else knots.push({ x, y });
  const { knots: _k, ...rest } = def;
  return normaliseGlyph(knots.length ? { ...rest, knots } : rest);
}

export function shiftGlyph(def: GlyphDef, dx: number, dy: number): GlyphDef {
  const map = new Map(
    [...cellMap(def)].map(([k, s]) => {
      const [x, y] = k.split(',').map(Number) as [number, number];
      return [key(x + dx, y + dy), s] as const;
    }),
  );
  const moved = withCells(def, map);
  const segs = segmentsOf(def).map((s) => ({ x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy }));
  const knots = (def.knots ?? []).map((k) => ({ ...k, x: k.x + dx, y: k.y + dy }));
  const withLines = withSegments(moved, segs);
  const { knots: _k, ...rest } = withLines;
  return normaliseGlyph(knots.length ? { ...rest, knots } : rest);
}

export function resizeGlyph(def: GlyphDef, width: number): GlyphDef {
  return normaliseGlyph({ ...def, width: Math.max(0, Math.min(60, Math.round(width))) });
}

export function clearGlyph(def: GlyphDef): GlyphDef {
  return { type: def.type, width: def.width, ...(def.label ? { label: def.label } : {}) };
}
