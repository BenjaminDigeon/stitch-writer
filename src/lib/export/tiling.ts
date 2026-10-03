import type { PdfSettings } from '../state/doc.ts';

export const PAPER = {
  a4: { w: 210, h: 297 },
  letter: { w: 215.9, h: 279.4 },
} as const;

export const HEADER_MM = 13;
export const FOOTER_MM = 7;

export interface Tile {
  index: number;
  /** 1-based page number in the document. */
  page: number;
  col: number;
  row: number;
  /** Cell range: x0/y0 inclusive, x1/y1 exclusive. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  overlapLeft: number;
  overlapTop: number;
}

export interface Gutters {
  left: number;
  top: number;
  right: number;
  bottom: number;
  label: number;
}

export interface TilePlan {
  page: { w: number; h: number };
  orientation: 'portrait' | 'landscape';
  /** The chart area of a page, in mm, after the margins, the header, the footer and the gutters. */
  area: { x: number; y: number; w: number; h: number };
  gutters: Gutters;
  cellMm: number;
  colsPerPage: number;
  rowsPerPage: number;
  nx: number;
  ny: number;
  tiles: Tile[];
}

export type PlanResult = TilePlan | { error: 'cell-too-large' };

/** The size of the axis labels and the room around the chart for the labels and the center arrows. */
export function gutters(cellMm: number): Gutters {
  const label = Math.min(3, Math.max(1.8, cellMm * 0.7));
  return { label, left: label * 0.6 * 3 + 2, top: label + 2.5, right: 4, bottom: 4 };
}

function pageSize(paper: PdfSettings['paper'], orientation: 'portrait' | 'landscape') {
  const p = PAPER[paper];
  return orientation === 'portrait' ? { w: p.w, h: p.h } : { w: p.h, h: p.w };
}

function axis(total: number, perPage: number, overlap: number, snapTo10: boolean) {
  let step = perPage - overlap;
  if (snapTo10 && step >= 10) step = Math.floor(step / 10) * 10;
  const span = step + overlap;
  const n = total <= span ? 1 : 1 + Math.ceil((total - span) / step);
  return { step, span, n };
}

function planFor(
  chart: { width: number; height: number },
  o: Pick<PdfSettings, 'paper' | 'cellMm' | 'overlap' | 'marginMm' | 'snapTo10'>,
  orientation: 'portrait' | 'landscape',
  firstPage: number,
): PlanResult {
  const page = pageSize(o.paper, orientation);
  const g = gutters(o.cellMm);
  const area = {
    x: o.marginMm + g.left,
    y: o.marginMm + HEADER_MM + g.top,
    w: page.w - 2 * o.marginMm - g.left - g.right,
    h: page.h - 2 * o.marginMm - HEADER_MM - FOOTER_MM - g.top - g.bottom,
  };
  const cols = Math.floor(area.w / o.cellMm + 1e-9);
  const rows = Math.floor(area.h / o.cellMm + 1e-9);
  if (cols <= o.overlap || rows <= o.overlap || cols < 1 || rows < 1) return { error: 'cell-too-large' };
  const X = axis(chart.width, cols, o.overlap, o.snapTo10);
  const Y = axis(chart.height, rows, o.overlap, o.snapTo10);
  const tiles: Tile[] = [];
  for (let row = 0; row < Y.n; row++) {
    for (let col = 0; col < X.n; col++) {
      const x0 = col * X.step;
      const y0 = row * Y.step;
      tiles.push({
        index: tiles.length,
        page: firstPage + tiles.length,
        col,
        row,
        x0,
        y0,
        x1: Math.min(x0 + X.span, chart.width),
        y1: Math.min(y0 + Y.span, chart.height),
        overlapLeft: col > 0 ? o.overlap : 0,
        overlapTop: row > 0 ? o.overlap : 0,
      });
    }
  }
  return {
    page,
    orientation,
    area,
    gutters: g,
    cellMm: o.cellMm,
    colsPerPage: X.span,
    rowsPerPage: Y.span,
    nx: X.n,
    ny: Y.n,
    tiles,
  };
}

/** Cuts the chart into pages. "auto" takes the orientation with fewer pages (then the less unused paper). */
export function planTiles(
  chart: { width: number; height: number },
  o: Pick<PdfSettings, 'paper' | 'orientation' | 'cellMm' | 'overlap' | 'marginMm' | 'snapTo10'>,
  firstPage = 1,
): PlanResult {
  if (o.orientation !== 'auto') return planFor(chart, o, o.orientation, firstPage);
  const p = planFor(chart, o, 'portrait', firstPage);
  const l = planFor(chart, o, 'landscape', firstPage);
  if ('error' in p) return l;
  if ('error' in l) return p;
  if (p.tiles.length !== l.tiles.length) return p.tiles.length < l.tiles.length ? p : l;
  const waste = (t: TilePlan) => t.nx * t.colsPerPage * t.ny * t.rowsPerPage - chart.width * chart.height;
  return waste(l) < waste(p) ? l : p;
}

/** The largest cell size (0.1 mm steps, from 0.5 mm to 8 mm) that puts the whole chart on one page. */
export function cellForOnePage(
  chart: { width: number; height: number },
  o: Pick<PdfSettings, 'paper' | 'orientation' | 'overlap' | 'marginMm'>,
): number {
  for (let c = 80; c >= 5; c--) {
    const plan = planTiles(chart, { ...o, cellMm: c / 10, snapTo10: false });
    if (!('error' in plan) && plan.tiles.length === 1) return c / 10;
  }
  return 0.5;
}
