import { DEFAULT_FABRIC, type FabricSettings } from '../fabric/fabric.ts';
import { DEFAULT_FONT_ID } from '../font/registry.ts';
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

export type Doc = DocV1;

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
  display: 'colour',
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

export function newDoc(): Doc {
  const d = structuredClone(DEFAULTS_V1) as Doc;
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

/** Checks and clamps each field. An invalid field gets its default value. */
export function sanitizeDoc(raw: unknown, defaults: Doc = DEFAULTS_V1): Doc {
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
      align: oneOf(l.align, ['left', 'centre', 'right'] as const, d.layout.align),
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
    display: oneOf(r.display, ['colour', 'symbol', 'both'] as const, d.display),
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
