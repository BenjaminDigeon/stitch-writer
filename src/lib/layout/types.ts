import type { HalfDir } from '../font/schema.ts';

/** A range of UTF-16 offsets in the source text (the same units as the textarea selection). */
export interface Span {
  start: number;
  end: number;
}

/** The position of a glyph inside a shaped word (OpenType fonts). */
export interface ShapedPos {
  /** Word number: no letter spacing is added between glyphs of the same word. */
  word: number;
  /** Pen position inside the word and advance, in cells. */
  x: number;
  advance: number;
  dy: number;
}

export type Token =
  | {
      k: 'glyph';
      key: string;
      src: Span;
      substitutedFrom?: string;
      substitutedTo?: string;
      shaped?: ShapedPos;
    }
  | { k: 'motif'; key: string; src: Span }
  | { k: 'space'; src: Span }
  | { k: 'newline'; src: Span }
  | { k: 'missing'; text: string; src: Span; motif?: boolean };

export type Align = 'left' | 'center' | 'right';
export type DotPolicy = 'auto' | 'all' | 'none';

export interface LayoutSettings {
  /** The space glyph to use: 1..4, as the four space keys of the reference site. */
  wordSpace: 1 | 2 | 3 | 4;
  /** Cells between two glyphs. null means the font default. */
  letterSpacing: number | null;
  /** Blank rows between two lines, in addition to the font line gap. */
  lineSpacing: number;
  align: Align;
  /** Blank cells around the design. */
  padding: number;
  ligatures: boolean;
  substitute: boolean;
  dots: DotPolicy;
}

export const DEFAULT_LAYOUT: Readonly<LayoutSettings> = Object.freeze({
  wordSpace: 1,
  letterSpacing: null,
  lineSpacing: 1,
  align: 'center',
  padding: 3,
  ligatures: false,
  substitute: true,
  dots: 'auto',
});

/** Dot overrides, keyed by `${srcStart}:${x}:${y}` (glyph-local cell of the dot). */
export type DotOverrides = Record<string, boolean>;

export interface Placement {
  token: number;
  key: string;
  kind: 'glyph' | 'motif' | 'missing';
  /** Chart cell coordinates of the glyph box (advance width × font frame). */
  x: number;
  y: number;
  width: number;
  height: number;
  src: Span;
  line: number;
}

export interface ResolvedDot {
  id: string;
  /** Chart cell coordinates. */
  x: number;
  y: number;
  thread: number;
  active: boolean;
  auto: boolean;
  overridden: boolean;
}

export interface ChartLine {
  /** Flat polyline in chart lattice coordinates. */
  pts: number[];
  thread: number;
}

export interface ChartKnot {
  x: number;
  y: number;
  thread: number;
}

/** A rectangle in chart lattice coordinates. x1 and y1 are exclusive cell edges. */
export interface LatticeRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ThreadStats {
  full: number;
  half: number;
  backstitches: number;
  /** Total backstitch length in cells. */
  backLength: number;
  knots: number;
}

export interface Chart {
  /** Size in cells, padding included. 0 × 0 when there is nothing to stitch. */
  width: number;
  height: number;
  /** One code per cell, row-major. See `cellCode`. */
  cells: Uint8Array;
  lines: ChartLine[];
  knots: ChartKnot[];
  dots: ResolvedDot[];
  placements: Placement[];
  /** The ink box of the design (without padding). */
  design: LatticeRect;
  /** The center of the design, in lattice coordinates (a .5 value is the middle of a cell). */
  center: { x: number; y: number };
  stats: { threads: Record<number, ThreadStats>; total: number };
  issues: {
    missing: { text: string; src: Span }[];
    substituted: { from: string; to: string; src: Span }[];
  };
}

/** The stitch in one chart cell. */
export interface CellStitch {
  thread: number;
  half?: HalfDir;
}

/** Encodes a stitch: 0 = empty, 1 + 3t = full, 2 + 3t = half '/', 3 + 3t = half '\'. */
export function cellCode(s: CellStitch): number {
  return 1 + 3 * s.thread + (s.half === '/' ? 1 : s.half === '\\' ? 2 : 0);
}

export function decodeCell(code: number): CellStitch | null {
  if (!code) return null;
  const thread = Math.floor((code - 1) / 3);
  const kind = (code - 1) % 3;
  return kind === 0 ? { thread } : { thread, half: kind === 1 ? '/' : '\\' };
}
