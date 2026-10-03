import { DEFAULT_FABRIC, type FabricSettings } from '../fabric/fabric.ts';
import { DEFAULT_FONT_ID } from '../font/registry.ts';
import { COLOR_MODES, MAX_COLORS, type ColorMode, type ColorRange } from '../layout/color.ts';
import { DEFAULT_LAYOUT, type DotOverrides, type LayoutSettings } from '../layout/types.ts';
import type { RenderMode } from '../scene/chart-layer.ts';
import { DEFAULT_THREAD_IDS } from '../threads/dmc.ts';

export interface PdfSettings {
  paper: 'a4' | 'letter';
  orientation: 'auto' | 'portrait' | 'landscape';
  cellMm: number;
  overlap: number;
  marginMm: number;
  snapTo10: boolean;
  cover: boolean;
  /** null: the first line of the text. */
  title: string | null;
}

export interface DocV1 {
  v: 1;
  text: string;
  fontId: string;
  layout: LayoutSettings;
  dotOverrides: DotOverrides;
  /** DMC numbers, one for each font thread: [main, accent]. */
  threads: string[];
  display: RenderMode;
  fabric: FabricSettings;
  pdf: PdfSettings;
}

export interface DocV2 {
  v: 2;
  text: string;
  fontId: string;
  layout: LayoutSettings;
  dotOverrides: DotOverrides;
  /** The text colors: DMC numbers, 1 to 16. Color 1 is the default text color. */
  palette: string[];
  /** The fill of the motifs (the accent thread of the font): a DMC number. */
  accent: string;
  coloring: { mode: ColorMode };
  /** The colors set by hand. Sorted, with no overlap. `color` is an index in `palette`. */
  colorRanges: ColorRange[];
  display: RenderMode;
  fabric: FabricSettings;
  pdf: PdfSettings;
}

export type Doc = DocV2;

export const MAX_TEXT = 2000;

const defaultPaper = (): 'a4' | 'letter' => {
  const lang = typeof navigator === 'undefined' ? '' : navigator.language;
  return /^(en-US|en-CA|es-MX|fr-CA)$/i.test(lang) ? 'letter' : 'a4';
};

/** The defaults of version 1. They must never change: share links store only the differences. */
export const DEFAULTS_V1: Readonly<DocV1> = Object.freeze({
  v: 1,
  text: '',
  fontId: DEFAULT_FONT_ID,
  layout: { ...DEFAULT_LAYOUT },
  dotOverrides: {},
  threads: [DEFAULT_THREAD_IDS.main, DEFAULT_THREAD_IDS.accent],
  display: 'color',
  fabric: { ...DEFAULT_FABRIC },
  pdf: {
    paper: 'a4',
    orientation: 'auto',
    cellMm: 3,
    overlap: 2,
    marginMm: 10,
    snapTo10: false,
    cover: true,
    title: null,
  },
} satisfies DocV1);

/** The defaults of version 2. They must never change: share links store only the differences. */
export const DEFAULTS_V2: Readonly<DocV2> = Object.freeze({
  v: 2,
  text: '',
  fontId: DEFAULT_FONT_ID,
  layout: { ...DEFAULT_LAYOUT },
  dotOverrides: {},
  palette: [DEFAULT_THREAD_IDS.main],
  accent: DEFAULT_THREAD_IDS.accent,
  coloring: { mode: 'single' },
  colorRanges: [],
  display: 'color',
  fabric: { ...DEFAULT_FABRIC },
  pdf: { ...DEFAULTS_V1.pdf },
} satisfies DocV2);

export function newDoc(): Doc {
  const d = structuredClone(DEFAULTS_V2) as Doc;
  d.pdf.paper = defaultPaper();
  return d;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number, min: number, max: number, int = false) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return d;
  const c = Math.min(max, Math.max(min, v));
  return int ? Math.round(c) : c;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T =>
  list.includes(v as T) ? (v as T) : d;
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

/**
 * Checks and clamps each field of a document of version 1 or 2. An invalid field gets its default
 * value. A document of version 1 becomes a document of version 2.
 */
export function sanitizeDoc(raw: unknown): Doc {
  if (isObj(raw) && raw.v === 2) return sanitizeDocV2(raw);
  return migrateV1(sanitizeDocV1(raw));
}

/**
 * A document of version 1 has two threads: the text and the accent. The text thread becomes the
 * only text color, and the accent stays the motif fill.
 */
export function migrateV1(d: DocV1): DocV2 {
  return sanitizeDocV2({
    ...d,
    v: 2,
    palette: [d.threads[0] ?? DEFAULTS_V2.palette[0]!],
    accent: d.threads[1] ?? DEFAULTS_V2.accent,
    coloring: { mode: 'single' },
    colorRanges: [],
  });
}

const dmcId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9 -]{1,12}$/.test(v);

/** Sorts the ranges, clips them to the text, and removes the empty parts and the overlaps. */
function sanitizeRanges(raw: unknown, textLength: number, colors: number): ColorRange[] {
  if (!Array.isArray(raw)) return [];
  const isInt = (v: unknown): v is number => Number.isInteger(v);
  const list = raw
    .filter(
      (r): r is ColorRange =>
        isObj(r) && isInt(r.start) && isInt(r.end) && isInt(r.color) && r.color >= 0 && r.color < colors,
    )
    .map((r) => ({ start: Math.max(0, r.start), end: Math.min(textLength, r.end), color: r.color }))
    .sort((a, b) => a.start - b.start);
  const out: ColorRange[] = [];
  for (const r of list) {
    const last = out[out.length - 1];
    const start = last ? Math.max(r.start, last.end) : r.start;
    if (start >= r.end) continue;
    if (last && last.end === start && last.color === r.color) last.end = r.end;
    else out.push({ start, end: r.end, color: r.color });
  }
  return out;
}

function sanitizeDocV2(r: Record<string, unknown>): DocV2 {
  const d = DEFAULTS_V2;
  const base = sanitizeDocV1(r, { ...DEFAULTS_V1, threads: [d.palette[0]!, d.accent] });
  const palette =
    Array.isArray(r.palette) && r.palette.length > 0 && r.palette.every(dmcId)
      ? (r.palette as string[]).slice(0, MAX_COLORS)
      : [...d.palette];
  const c = isObj(r.coloring) ? r.coloring : {};
  return {
    v: 2,
    text: base.text,
    fontId: base.fontId,
    layout: base.layout,
    dotOverrides: base.dotOverrides,
    palette,
    accent: dmcId(r.accent) ? r.accent : d.accent,
    coloring: { mode: oneOf(c.mode, COLOR_MODES, d.coloring.mode) },
    colorRanges: sanitizeRanges(r.colorRanges, base.text.length, palette.length),
    display: base.display,
    fabric: base.fabric,
    pdf: base.pdf,
  };
}

/**
 * Checks and clamps each field of a document of version 1. The British values of older documents
 * ("centre", "colour") become "center" and "color".
 */
export function sanitizeDocV1(raw: unknown, defaults: DocV1 = DEFAULTS_V1): DocV1 {
  const r = isObj(raw) ? raw : {};
  const l = isObj(r.layout) ? r.layout : {};
  const f = isObj(r.fabric) ? r.fabric : {};
  const p = isObj(r.pdf) ? r.pdf : {};
  const d = defaults;
  const overrides: DotOverrides = {};
  if (isObj(r.dotOverrides)) {
    for (const [k, v] of Object.entries(r.dotOverrides))
      if (/^\d+:-?\d+:-?\d+$/.test(k) && typeof v === 'boolean') overrides[k] = v;
  }
  return {
    v: 1,
    text: typeof r.text === 'string' ? r.text.slice(0, MAX_TEXT) : d.text,
    fontId: typeof r.fontId === 'string' && r.fontId ? r.fontId : d.fontId,
    layout: {
      wordSpace: num(l.wordSpace, d.layout.wordSpace, 1, 4, true) as 1 | 2 | 3 | 4,
      letterSpacing:
        l.letterSpacing === null ? null : num(l.letterSpacing, d.layout.letterSpacing ?? 0, 0, 10, true),
      lineSpacing: num(l.lineSpacing, d.layout.lineSpacing, 0, 20, true),
      align: oneOf(
        l.align === 'centre' ? 'center' : l.align,
        ['left', 'center', 'right'] as const,
        d.layout.align,
      ),
      padding: num(l.padding, d.layout.padding, 0, 50, true),
      ligatures: bool(l.ligatures, d.layout.ligatures),
      substitute: bool(l.substitute, d.layout.substitute),
      dots: oneOf(l.dots, ['auto', 'all', 'none'] as const, d.layout.dots),
    },
    dotOverrides: overrides,
    threads:
      Array.isArray(r.threads) && r.threads.every((t) => typeof t === 'string')
        ? (r.threads as string[]).slice(0, 8)
        : [...d.threads],
    display: oneOf(
      r.display === 'colour' ? 'color' : r.display,
      ['color', 'symbol', 'both'] as const,
      d.display,
    ),
    fabric: {
      count: num(f.count, d.fabric.count, 6, 60),
      overTwo: bool(f.overTwo, d.fabric.overTwo),
      marginMm: num(f.marginMm, d.fabric.marginMm, 0, 500),
      units: oneOf(f.units, ['cm', 'in'] as const, d.fabric.units),
    },
    pdf: {
      paper: oneOf(p.paper, ['a4', 'letter'] as const, d.pdf.paper),
      orientation: oneOf(p.orientation, ['auto', 'portrait', 'landscape'] as const, d.pdf.orientation),
      cellMm: num(p.cellMm, d.pdf.cellMm, 0.5, 10),
      overlap: num(p.overlap, d.pdf.overlap, 0, 10, true),
      marginMm: num(p.marginMm, d.pdf.marginMm, 5, 25),
      snapTo10: bool(p.snapTo10, d.pdf.snapTo10),
      cover: bool(p.cover, d.pdf.cover),
      title: typeof p.title === 'string' ? p.title.slice(0, 200) : null,
    },
  };
}
