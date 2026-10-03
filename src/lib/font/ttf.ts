import type { Font, Glyph, GlyphCell, Shaper, ShapedGlyph } from './font.ts';
import { openFont, type FkFont, type FkGlyph, type FkPathCommand } from './fontkit.ts';
import {
  DEFAULT_SYMBOLS,
  DEFAULT_THREADS,
  FONT_SCHEMA,
  FONT_VERSION,
  spaceKey,
  type FontFile,
  type GlyphDef,
} from './schema.ts';
import { cellsToRows, normaliseGlyph } from './normalise.ts';

/**
 * The grid of a cross-stitch TTF font. Each stitch is a shape of size `mark` inside a cell of size
 * `pitch` (font units). The shape starts at `offsetX`/`offsetY` inside its cell.
 */
export interface TtfGrid {
  pitch: number;
  mark: number;
  offsetX: number;
  offsetY: number;
}

type Point = [number, number];

/** Converts path commands to closed polygons. Curves are flattened. */
export function pathToPolygons(commands: readonly FkPathCommand[]): Point[][] {
  const out: Point[][] = [];
  let cur: Point[] = [];
  let pen: Point = [0, 0];
  const close = () => {
    if (cur.length > 2) out.push(cur);
    cur = [];
  };
  for (const c of commands) {
    const a = c.args;
    switch (c.command) {
      case 'moveTo':
        close();
        pen = [a[0]!, a[1]!];
        cur.push(pen);
        break;
      case 'lineTo':
        pen = [a[0]!, a[1]!];
        cur.push(pen);
        break;
      case 'quadraticCurveTo': {
        const [x0, y0] = pen;
        for (let t = 0.25; t <= 1; t += 0.25) {
          const u = 1 - t;
          cur.push([
            u * u * x0 + 2 * u * t * a[0]! + t * t * a[2]!,
            u * u * y0 + 2 * u * t * a[1]! + t * t * a[3]!,
          ]);
        }
        pen = [a[2]!, a[3]!];
        break;
      }
      case 'bezierCurveTo': {
        const [x0, y0] = pen;
        for (let t = 0.25; t <= 1; t += 0.25) {
          const u = 1 - t;
          cur.push([
            u * u * u * x0 + 3 * u * u * t * a[0]! + 3 * u * t * t * a[2]! + t * t * t * a[4]!,
            u * u * u * y0 + 3 * u * u * t * a[1]! + 3 * u * t * t * a[3]! + t * t * t * a[5]!,
          ]);
        }
        pen = [a[4]!, a[5]!];
        break;
      }
      case 'closePath':
        close();
        break;
    }
  }
  close();
  return out;
}

/** Nonzero winding test. */
export function insidePolygons(polys: readonly Point[][], x: number, y: number): boolean {
  let winding = 0;
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i]!;
      const [x2, y2] = poly[(i + 1) % poly.length]!;
      if (y1 <= y) {
        if (y2 > y && (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) > 0) winding++;
      } else if (y2 <= y && (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) < 0) winding--;
    }
  }
  return winding !== 0;
}

function bbox(poly: readonly Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of poly) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? 0;

function bestResidue(values: number[], pitch: number): { residue: number; score: number } {
  const counts = new Map<number, number>();
  for (const v of values) {
    const r = ((Math.round(v) % pitch) + pitch) % pitch;
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  let residue = 0;
  let best = -1;
  for (const [r, n] of counts) {
    // Count the neighbours too: a 1-unit tolerance for rounding in the font.
    const total = n + (counts.get((r + 1) % pitch) ?? 0) + (counts.get((r - 1 + pitch) % pitch) ?? 0);
    if (total > best) {
      best = total;
      residue = r;
    }
  }
  return { residue, score: values.length ? best / values.length : 0 };
}

/**
 * Finds the stitch grid of a cross-stitch TTF font from the contours of its letters: the stitch size
 * is the median square contour, and the pitch is the smallest value (≥ the stitch size) for which
 * almost all contours start on the same residue.
 */
export function detectTtfGrid(font: FkFont): TtfGrid {
  const contours: ReturnType<typeof bbox>[] = [];
  for (const ch of 'abcdeghmnopqsuvwxyzABCDEHMNOSUW0123456789') {
    const cp = ch.codePointAt(0)!;
    if (!font.hasGlyphForCodePoint(cp)) continue;
    for (const poly of pathToPolygons(font.glyphForCodePoint(cp).path.commands)) contours.push(bbox(poly));
  }
  const squares = contours.filter((c) => c.w > 0 && Math.abs(c.w - c.h) <= c.w * 0.1);
  if (squares.length < 10)
    throw new Error('This TTF font does not look like a grid-aligned cross-stitch font.');
  const mark = median(squares.map((c) => c.w));
  for (let pitch = Math.ceil(mark); pitch <= Math.ceil(mark * 3); pitch++) {
    const x = bestResidue(
      squares.map((c) => c.minX),
      pitch,
    );
    const y = bestResidue(
      squares.map((c) => c.minY),
      pitch,
    );
    if (x.score >= 0.9 && y.score >= 0.9) return { pitch, mark, offsetX: x.residue, offsetY: y.residue };
  }
  throw new Error('Could not find the stitch grid of this TTF font.');
}

/** The cells of one TTF glyph: a cell is stitched when the centre of its stitch shape is inside the outline. */
export function ttfGlyphCells(glyph: FkGlyph, grid: TtfGrid): GlyphCell[] {
  const polys = pathToPolygons(glyph.path.commands);
  if (!polys.length) return [];
  const b = glyph.path.bbox;
  const { pitch, mark, offsetX, offsetY } = grid;
  const cells: GlyphCell[] = [];
  const kx0 = Math.floor((b.minX - offsetX) / pitch) - 1;
  const kx1 = Math.ceil((b.maxX - offsetX) / pitch) + 1;
  const ky0 = Math.floor((b.minY - offsetY) / pitch) - 1;
  const ky1 = Math.ceil((b.maxY - offsetY) / pitch) + 1;
  for (let ky = ky0; ky <= ky1; ky++) {
    for (let kx = kx0; kx <= kx1; kx++) {
      const cx = offsetX + kx * pitch + mark / 2;
      const cy = offsetY + ky * pitch + mark / 2;
      // Font rows count up from the baseline; chart rows count down. Font row 0 is chart row -1.
      if (insidePolygons(polys, cx, cy)) cells.push({ x: kx, y: -(ky + 1), thread: 0 });
    }
  }
  return cells;
}

export interface TtfFontInfo {
  id: string;
  name: string;
  licence: string;
  url?: string;
}

function rowSpan(cells: GlyphCell[]): Glyph['rowSpan'] {
  if (!cells.length) return null;
  return { min: Math.min(...cells.map((c) => c.y)), max: Math.max(...cells.map((c) => c.y)) };
}

/**
 * Opens a grid-aligned cross-stitch TTF font. The glyphs are converted when they are first used,
 * and the text is shaped by the font's OpenType features (ligatures, contextual forms, kerning).
 */
export function loadTtfFont(bytes: Uint8Array, info: TtfFontInfo): Font {
  const fk = openFont(bytes);
  const grid = detectTtfGrid(fk);
  const glyphs = new Map<string, Glyph>();
  const cells = (g: FkGlyph): Glyph => {
    const key = `#${g.id}`;
    let out = glyphs.get(key);
    if (!out) {
      const c = ttfGlyphCells(g, grid);
      out = {
        key,
        type: 'char',
        width: Math.round(g.advanceWidth / grid.pitch),
        cells: c,
        lines: [],
        knots: [],
        rowSpan: rowSpan(c),
      };
      glyphs.set(key, out);
    }
    return out;
  };

  const spaceWidth = fk.hasGlyphForCodePoint(32)
    ? Math.round(fk.glyphForCodePoint(32).advanceWidth / grid.pitch)
    : 3;
  for (let n = 1; n <= 4; n++) {
    glyphs.set(spaceKey(n), {
      key: spaceKey(n),
      type: 'space',
      width: spaceWidth + n - 1,
      cells: [],
      lines: [],
      knots: [],
      rowSpan: null,
    });
  }

  const span = (ch: string) => {
    const cp = ch.codePointAt(0)!;
    return fk.hasGlyphForCodePoint(cp) ? rowSpan(cells(fk.glyphForCodePoint(cp)).cells) : null;
  };
  let ascent = 0;
  let descent = 0;
  for (const ch of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZÀÉÊÖÅçgjpqy') {
    const s = span(ch);
    if (!s) continue;
    ascent = Math.max(ascent, -s.min);
    descent = Math.max(descent, s.max + 1);
  }
  const xHeight = -(span('x')?.min ?? -Math.round(ascent / 2));

  const shaper: Shaper = {
    supports: (ch) => [...ch].every((c) => fk.hasGlyphForCodePoint(c.codePointAt(0)!)),
    shape(text) {
      const run = fk.layout(text);
      const out: ShapedGlyph[] = [];
      // Map each glyph back to the code point that it comes from. Contextual glyphs that fontkit inserts
      // (joins) carry the code point of their letter.
      const cps = [...text];
      const offsets: number[] = [];
      let o = 0;
      for (const c of cps) {
        offsets.push(o);
        o += c.length;
      }
      let cursor = 0;
      let last = 0;
      let pen = 0;
      run.glyphs.forEach((g, i) => {
        const pos = run.positions[i]!;
        const first = g.codePoints[0];
        if (first !== undefined && cursor < cps.length && cps[cursor]!.codePointAt(0) === first) {
          last = cursor;
          cursor += Math.max(1, g.codePoints.length);
        }
        const glyph = cells(g);
        out.push({
          key: glyph.key,
          x: Math.round((pen + pos.xOffset) / grid.pitch),
          dy: -Math.round(pos.yOffset / grid.pitch),
          advance: Math.round(pos.xAdvance / grid.pitch),
          srcIndex: offsets[last] ?? 0,
          missing: g.id === 0,
        });
        pen += pos.xAdvance;
      });
      return out;
    },
  };

  const file: FontFile = {
    schema: FONT_SCHEMA,
    version: FONT_VERSION,
    id: info.id,
    name: info.name,
    kind: 'cross',
    script: true,
    metrics: { ascent, descent, xHeight, letterSpacing: 0, lineGap: 0 },
    threads: [...DEFAULT_THREADS],
    symbols: { ...DEFAULT_SYMBOLS },
    glyphs: {},
    source: { origin: 'imported', url: info.url, licence: info.licence },
  };
  return {
    id: info.id,
    name: info.name,
    kind: 'cross',
    script: true,
    metrics: file.metrics,
    threads: file.threads,
    glyphs,
    aliases: new Map(),
    motifs: [],
    ligatures: [],
    connectivity: 4,
    origin: 'imported',
    licence: info.licence,
    file,
    shaper,
  };
}

/**
 * Converts a TTF grid font into an editable font file: one glyph for each character of the font.
 * The OpenType joins and ligatures are not kept: each letter keeps its basic form.
 */
export function ttfToFontFile(bytes: Uint8Array, info: TtfFontInfo): FontFile {
  const fk = openFont(bytes);
  const grid = detectTtfGrid(fk);
  const loaded = loadTtfFont(bytes, info);
  const glyphs: FontFile['glyphs'] = {};
  for (const cp of fk.characterSet) {
    if (cp < 33 || (cp >= 0x7f && cp < 0xa0)) continue;
    const g = fk.glyphForCodePoint(cp);
    const cells = ttfGlyphCells(g, grid).map((c) => ({ x: c.x, y: c.y, symbol: 'X' }));
    const width = Math.round(g.advanceWidth / grid.pitch);
    const packed = cellsToRows(width, cells);
    const def: GlyphDef = { type: 'char', width };
    if (packed) {
      def.top = packed.top;
      if (packed.left) def.left = packed.left;
      def.rows = packed.rows;
    }
    glyphs[String.fromCodePoint(cp)] = normaliseGlyph(def);
  }
  for (let n = 1; n <= 4; n++)
    glyphs[spaceKey(n)] = { type: 'space', width: loaded.glyphs.get(spaceKey(n))!.width };
  return { ...loaded.file, kind: 'cross', glyphs };
}
