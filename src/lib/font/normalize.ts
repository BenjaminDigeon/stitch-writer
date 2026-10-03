import { EMPTY_CELL, type FontFile, type GlyphDef, type GlyphLine } from './schema.ts';

/** A cell in glyph-local coordinates, with the symbol key that draws it. */
export interface SymbolCell {
  x: number;
  y: number;
  symbol: string;
}

/**
 * Converts a list of cells into trimmed row strings. The rows cover the advance box [0, width) and
 * any cells outside it. Returns null when there are no cells.
 */
export function cellsToRows(
  width: number,
  cells: readonly SymbolCell[],
): { top: number; left: number; rows: string[] } | null {
  if (cells.length === 0) return null;
  let top = Infinity;
  let bottom = -Infinity;
  let left = 0;
  let right = width - 1;
  for (const c of cells) {
    top = Math.min(top, c.y);
    bottom = Math.max(bottom, c.y);
    left = Math.min(left, c.x);
    right = Math.max(right, c.x);
  }
  const cols = Math.max(1, right - left + 1);
  const grid = Array.from({ length: bottom - top + 1 }, () => Array<string>(cols).fill(EMPTY_CELL));
  for (const c of cells) grid[c.y - top]![c.x - left] = c.symbol;
  return { top, left, rows: grid.map((r) => r.join('')) };
}

/** Converts row strings back into cells. */
export function rowsToCells(def: Pick<GlyphDef, 'top' | 'left' | 'rows'>): SymbolCell[] {
  const out: SymbolCell[] = [];
  const top = def.top ?? 0;
  const left = def.left ?? 0;
  def.rows?.forEach((row, r) => {
    [...row].forEach((symbol, i) => {
      if (symbol !== EMPTY_CELL) out.push({ x: left + i, y: top + r, symbol });
    });
  });
  return out;
}

function reversePolyline(pts: number[]): number[] {
  const out: number[] = [];
  for (let i = pts.length - 2; i >= 0; i -= 2) out.push(pts[i]!, pts[i + 1]!);
  return out;
}

const pointLess = (ax: number, ay: number, bx: number, by: number) => ay < by || (ay === by && ax < bx);

/** Puts polylines in a fixed order: each starts at its top-left end, sorted by (min y, min x). */
export function canonicalLines(lines: readonly GlyphLine[]): GlyphLine[] {
  const fixed = lines.map((l) => {
    const n = l.pts.length;
    const startFirst = !pointLess(l.pts[n - 2]!, l.pts[n - 1]!, l.pts[0]!, l.pts[1]!);
    const pts = startFirst ? [...l.pts] : reversePolyline(l.pts);
    return l.thread ? { pts, thread: l.thread } : { pts };
  });
  const key = (l: GlyphLine) => {
    let minY = Infinity;
    let minX = Infinity;
    for (let i = 0; i < l.pts.length; i += 2) {
      minX = Math.min(minX, l.pts[i]!);
      minY = Math.min(minY, l.pts[i + 1]!);
    }
    return [minY, minX, l.pts[1]!, l.pts[0]!, l.pts.length] as const;
  };
  return fixed.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i]! - kb[i]!;
    return 0;
  });
}

/** Trims empty rows, removes empty fields and orders the lines. The result is stable. */
export function normalizeGlyph(def: GlyphDef): GlyphDef {
  const out: GlyphDef = { type: def.type, width: def.width };
  const cells = rowsToCells(def);
  const rows = cellsToRows(def.width, cells);
  if (rows) {
    out.top = rows.top;
    if (rows.left !== 0) out.left = rows.left;
    out.rows = rows.rows;
  }
  if (def.lines?.length) out.lines = canonicalLines(def.lines);
  if (def.knots?.length) {
    out.knots = [...def.knots]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((k) => (k.thread ? { ...k } : { x: k.x, y: k.y }));
  }
  if (def.label) out.label = def.label;
  if (def.sourceFile) out.sourceFile = def.sourceFile;
  if (def.review) out.review = def.review;
  return out;
}

/** Writes a font file as JSON. Each row string is on its own line, and point lists stay on one line. */
export function serializeFont(file: FontFile): string {
  const json = JSON.stringify(file, null, 2);
  return (
    json.replace(
      /\[\s*(-?\d+(?:\.\d+)?(?:,\s*-?\d+(?:\.\d+)?)*)\s*\]/g,
      (_m, list: string) => `[${list.split(/,\s*/).join(', ')}]`,
    ) + '\n'
  );
}
