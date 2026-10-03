/**
 * The font file format. Extracted fonts, sample fonts and the glyph editor all use it.
 *
 * Coordinates are in cells. y = 0 is the baseline lattice line, and a negative y is above it.
 * Cell row r is the band between lattice lines r and r + 1, so the row that sits on the
 * baseline is r = -1.
 */

export const FONT_SCHEMA = 'stitch-writer/font';
export const FONT_VERSION = 1;

export type FontKind = 'cross' | 'backstitch' | 'mixed';
export type GlyphType = 'char' | 'ligature' | 'motif' | 'space';
export type HalfDir = '/' | '\\';

export interface FullSymbol {
  type: 'full';
  thread: number;
  /** An optional stitch is a connector dot. The layout engine decides whether to stitch it. */
  optional?: boolean;
}

export interface HalfSymbol {
  type: 'half';
  dir: HalfDir;
  thread: number;
}

export type SymbolDef = FullSymbol | HalfSymbol;

export interface GlyphLine {
  /** Flat polyline [x0, y0, x1, y1, ...] in lattice coordinates. Values are multiples of 0.5. */
  pts: number[];
  thread?: number;
}

export interface GlyphKnot {
  /** Lattice point (multiples of 0.5). */
  x: number;
  y: number;
  thread?: number;
}

export interface GlyphReview {
  status: 'ok' | 'warn' | 'fail';
  notes: string[];
}

export interface GlyphDef {
  type: GlyphType;
  /** Advance box width in cells. */
  width: number;
  /** Baseline-relative row of rows[0]. Required when `rows` is present. */
  top?: number;
  /**
   * x of the first character of each row. The default is 0. A negative value means that the
   * stitches go into the letter spacing on the left (the slash of "ø", for example).
   */
  left?: number;
  /** One string per cell row, all with the same length: '.' or a symbol key for each cell. */
  rows?: string[];
  lines?: GlyphLine[];
  /** French knots, on lattice points. */
  knots?: GlyphKnot[];
  label?: string;
  sourceFile?: string;
  review?: GlyphReview;
}

export interface FontMetrics {
  /** Rows above the baseline in the font frame. */
  ascent: number;
  /** Rows below the baseline in the font frame. */
  descent: number;
  xHeight: number;
  letterSpacing: number;
  lineGap: number;
}

export interface ThreadDef {
  id: string;
  name: string;
}

export interface FontSource {
  origin: 'imported' | 'handmade';
  url?: string;
  extractedAt?: string;
  basedOn?: string;
  licence: string;
}

export interface FontFile {
  schema: typeof FONT_SCHEMA;
  version: typeof FONT_VERSION;
  id: string;
  name: string;
  kind: FontKind;
  script?: boolean;
  metrics: FontMetrics;
  threads: ThreadDef[];
  symbols: Record<string, SymbolDef>;
  glyphs: Record<string, GlyphDef>;
  aliases?: Record<string, string>;
  connectors?: { connectivity: 4 | 8 };
  source: FontSource;
}

/** The symbol legend that the pipeline and the editor use by default. */
export const DEFAULT_SYMBOLS: Readonly<Record<string, SymbolDef>> = {
  X: { type: 'full', thread: 0 },
  O: { type: 'full', thread: 1 },
  o: { type: 'full', thread: 0, optional: true },
  '/': { type: 'half', dir: '/', thread: 0 },
  N: { type: 'half', dir: '\\', thread: 0 },
};

export const DEFAULT_THREADS: readonly ThreadDef[] = [
  { id: 'main', name: 'Main' },
  { id: 'accent', name: 'Accent' },
];

export const EMPTY_CELL = '.';

/** The key of the space glyph with a width of N cells, for N = 1..4. */
export const spaceKey = (n: number): string => `space-${n}`;
