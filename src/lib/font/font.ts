import type { FontFile, FontKind, FontMetrics, GlyphType, HalfDir, ThreadDef } from './schema.ts';
import { EMPTY_CELL } from './schema.ts';

/** One stitched cell of a glyph, in glyph-local coordinates (x from the left, y baseline-relative). */
export interface GlyphCell {
  x: number;
  y: number;
  thread: number;
  half?: HalfDir;
  /** True for a connector dot. */
  optional?: boolean;
}

/** A backstitch polyline in glyph-local lattice coordinates. */
export interface GlyphPolyline {
  pts: number[];
  thread: number;
}

export interface GlyphKnotPoint {
  x: number;
  y: number;
  thread: number;
}

export interface Glyph {
  key: string;
  type: GlyphType;
  width: number;
  cells: GlyphCell[];
  lines: GlyphPolyline[];
  knots: GlyphKnotPoint[];
  label?: string;
  /** Smallest and largest occupied row (inclusive), or null for a glyph without stitches. */
  rowSpan: { min: number; max: number } | null;
}

/** One glyph of a shaped text run. */
export interface ShapedGlyph {
  /** Key in `Font.glyphs`. */
  key: string;
  /** Pen position from the start of the run, in cells. */
  x: number;
  /** Vertical offset in cells (positive = down). */
  dy: number;
  advance: number;
  /** UTF-16 index (in the shaped string) of the character that the glyph comes from. */
  srcIndex: number;
  /** True when the font has no glyph for the character. */
  missing: boolean;
}

/** Text shaping for fonts with contextual forms and kerning (OpenType). */
export interface Shaper {
  supports(grapheme: string): boolean;
  shape(text: string): ShapedGlyph[];
}

export interface Font {
  id: string;
  name: string;
  kind: FontKind;
  script: boolean;
  metrics: FontMetrics;
  threads: ThreadDef[];
  glyphs: ReadonlyMap<string, Glyph>;
  aliases: ReadonlyMap<string, string>;
  /** Keys of motif glyphs, in file order. */
  motifs: readonly string[];
  /** Keys of ligature glyphs, longest first. */
  ligatures: readonly string[];
  connectivity: 4 | 8;
  origin: 'imported' | 'handmade';
  licence: string;
  file: FontFile;
  /** Present for OpenType fonts. Then the glyphs map fills up when the text is shaped. */
  shaper?: Shaper;
}

function rowSpanOf(cells: GlyphCell[], lines: GlyphPolyline[], knots: GlyphKnotPoint[]): Glyph['rowSpan'] {
  let min = Infinity;
  let max = -Infinity;
  for (const c of cells) {
    min = Math.min(min, c.y);
    max = Math.max(max, c.y);
  }
  for (const k of knots) {
    min = Math.min(min, Math.ceil(k.y) - 1);
    max = Math.max(max, Math.floor(k.y));
  }
  for (const l of lines) {
    for (let i = 1; i < l.pts.length; i += 2) {
      const y = l.pts[i]!;
      // A lattice line at y touches the rows y - 1 and y.
      min = Math.min(min, Math.ceil(y) - 1);
      max = Math.max(max, Math.floor(y));
    }
  }
  return min <= max ? { min, max } : null;
}

/** Converts a validated font file into the runtime form. */
export function loadFont(file: FontFile): Font {
  const glyphs = new Map<string, Glyph>();
  const motifs: string[] = [];
  const ligatures: string[] = [];
  for (const [key, def] of Object.entries(file.glyphs)) {
    const cells: GlyphCell[] = [];
    const top = def.top ?? 0;
    const left = def.left ?? 0;
    def.rows?.forEach((row, r) => {
      const chars = [...row];
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i]!;
        if (ch === EMPTY_CELL) continue;
        const sym = file.symbols[ch];
        if (!sym) continue;
        const cell: GlyphCell = { x: left + i, y: top + r, thread: sym.thread };
        if (sym.type === 'half') cell.half = sym.dir;
        else if (sym.optional) cell.optional = true;
        cells.push(cell);
      }
    });
    const lines = (def.lines ?? []).map((l) => ({ pts: l.pts, thread: l.thread ?? 0 }));
    const knots = (def.knots ?? []).map((k) => ({ x: k.x, y: k.y, thread: k.thread ?? 0 }));
    glyphs.set(key, {
      key,
      type: def.type,
      width: def.width,
      cells,
      lines,
      knots,
      label: def.label,
      rowSpan: rowSpanOf(cells, lines, knots),
    });
    if (def.type === 'motif') motifs.push(key);
    if (def.type === 'ligature') ligatures.push(key);
  }
  ligatures.sort((a, b) => [...b].length - [...a].length);
  return {
    id: file.id,
    name: file.name,
    kind: file.kind,
    script: file.script ?? false,
    metrics: file.metrics,
    threads: file.threads,
    glyphs,
    aliases: new Map(Object.entries(file.aliases ?? {})),
    motifs,
    ligatures,
    connectivity: file.connectors?.connectivity ?? 4,
    origin: file.source.origin,
    licence: file.source.licence,
    file,
  };
}
