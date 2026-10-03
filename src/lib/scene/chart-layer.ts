import { decodeCell, type Chart } from '../layout/types.ts';
import { symbolForThread } from './symbols.ts';
import { BLACK, contrastOn, luminance, type PathOp, type Rgb, type SceneNode, type Stroke } from './types.ts';

export type RenderMode = 'colour' | 'symbol' | 'both';

export interface ChartStyle {
  /** The size of one cell in scene units. */
  cell: number;
  mode: RenderMode;
  threadColour: (thread: number) => Rgb;
  minor: Stroke;
  major: Stroke;
  border: Stroke;
  /** Backstitch line width in scene units (or pixels when `nonScaling`). */
  backWidth: number;
  nonScaling?: boolean;
  /** Symbol line width in scene units. */
  symbolWidth: number;
  /** Preview only: show the connector dots that are off, as faint marks. */
  inactiveDots?: Rgb;
  centreLines?: Stroke;
}

/** A range of cells: x0 and y0 inclusive, x1 and y1 exclusive. */
export interface CellRegion {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The chart style for print: line widths in millimetres. */
export function printStyle(cell: number, mode: RenderMode, threadColour: (t: number) => Rgb): ChartStyle {
  return {
    cell,
    mode,
    threadColour,
    minor: { color: [150, 150, 150], width: 0.1 },
    major: { color: [40, 40, 40], width: 0.3 },
    border: { color: [0, 0, 0], width: 0.4 },
    backWidth: Math.max(0.35, 0.2 * cell),
    symbolWidth: Math.max(0.12, 0.09 * cell),
  };
}

export const fullRegion = (chart: Chart): CellRegion => ({ x0: 0, y0: 0, x1: chart.width, y1: chart.height });

const MAJOR_EVERY = 10;
const HALF_BAND = 0.32;

/**
 * Draws a chart (or a region of it) in global chart coordinates multiplied by `style.cell`.
 * A page that shows a region translates and clips the result.
 */
export function buildChartLayer(
  chart: Chart,
  style: ChartStyle,
  region: CellRegion = fullRegion(chart),
): SceneNode[] {
  const s = style.cell;
  const out: SceneNode[] = [];
  const r = {
    x0: Math.max(0, region.x0),
    y0: Math.max(0, region.y0),
    x1: Math.min(chart.width, region.x1),
    y1: Math.min(chart.height, region.y1),
  };
  if (r.x1 <= r.x0 || r.y1 <= r.y0) return out;

  // Full stitches: horizontal runs, one path per thread. Half stitches: one band path per thread.
  const runs = new Map<number, PathOp[]>();
  const halves = new Map<number, PathOp[]>();
  const fulls = new Map<number, number[]>();
  const halfCells: { x: number; y: number; thread: number; dir: string }[] = [];
  for (let y = r.y0; y < r.y1; y++) {
    let runStart = -1;
    let runThread = -1;
    const flush = (end: number) => {
      if (runStart < 0) return;
      const ops = runs.get(runThread) ?? [];
      ops.push(['R', runStart * s, y * s, (end - runStart) * s, s]);
      runs.set(runThread, ops);
      runStart = -1;
    };
    for (let x = r.x0; x < r.x1; x++) {
      const c = decodeCell(chart.cells[y * chart.width + x]!);
      const fullThread = c && !c.half ? c.thread : -1;
      if (fullThread !== runThread || fullThread < 0) {
        flush(x);
        if (fullThread >= 0) {
          runStart = x;
          runThread = fullThread;
        } else runThread = -1;
      }
      if (c && !c.half) {
        const list = fulls.get(c.thread) ?? [];
        list.push(x, y);
        fulls.set(c.thread, list);
      }
      if (c?.half) {
        halfCells.push({ x, y, thread: c.thread, dir: c.half });
        const ops = halves.get(c.thread) ?? [];
        const b = HALF_BAND * s;
        const [x0, y0, x1, y1] = [x * s, y * s, (x + 1) * s, (y + 1) * s];
        if (c.half === '/')
          ops.push(
            ['M', x0, y1 - b],
            ['L', x1 - b, y0],
            ['L', x1, y0],
            ['L', x1, y0 + b],
            ['L', x0 + b, y1],
            ['L', x0, y1],
            ['Z'],
          );
        else
          ops.push(
            ['M', x0, y0],
            ['L', x0 + b, y0],
            ['L', x1, y1 - b],
            ['L', x1, y1],
            ['L', x1 - b, y1],
            ['L', x0, y0 + b],
            ['Z'],
          );
        halves.set(c.thread, ops);
      }
    }
    flush(r.x1);
  }

  const showColour = style.mode !== 'symbol';
  if (showColour) {
    for (const [t, ops] of runs) {
      const color = style.threadColour(t);
      // A very light thread gets an outline, so that it shows on white fabric.
      const stroke: Stroke | undefined =
        luminance(color) > 0.85
          ? { color: [150, 150, 150], width: style.minor.width, nonScaling: style.nonScaling }
          : undefined;
      out.push({ t: 'path', ops, fill: color, stroke, className: `thread-${t}` });
    }
    for (const [t, ops] of halves)
      out.push({ t: 'path', ops, fill: style.threadColour(t), className: `half-${t}` });
  }

  // Grid: minor lines on each cell edge, major lines on each 10th edge (global, so that pages agree).
  const minor: PathOp[] = [];
  const major: PathOp[] = [];
  for (let x = r.x0; x <= r.x1; x++) {
    (x % MAJOR_EVERY === 0 ? major : minor).push(['M', x * s, r.y0 * s], ['L', x * s, r.y1 * s]);
  }
  for (let y = r.y0; y <= r.y1; y++) {
    (y % MAJOR_EVERY === 0 ? major : minor).push(['M', r.x0 * s, y * s], ['L', r.x1 * s, y * s]);
  }
  out.push({ t: 'path', ops: minor, stroke: style.minor, className: 'grid-minor' });
  out.push({ t: 'path', ops: major, stroke: style.major, className: 'grid-major' });
  out.push({ t: 'rect', x: 0, y: 0, w: chart.width * s, h: chart.height * s, stroke: style.border });

  // Symbols.
  if (style.mode !== 'colour') {
    for (const [t, cells] of fulls) {
      const shape = symbolForThread(t);
      const ops: PathOp[] = [];
      for (let i = 0; i < cells.length; i += 2) ops.push(...shape.ops(cells[i]! * s, cells[i + 1]! * s, s));
      const color = style.mode === 'both' ? contrastOn(style.threadColour(t)) : BLACK;
      out.push(
        shape.fill
          ? { t: 'path', ops, fill: color, className: `symbol-${t}` }
          : {
              t: 'path',
              ops,
              stroke: { color, width: style.symbolWidth, cap: 'round' },
              className: `symbol-${t}`,
            },
      );
    }
    for (const h of halfCells) {
      const color = style.mode === 'both' ? contrastOn(style.threadColour(h.thread)) : BLACK;
      const [x0, y0, x1, y1] = [h.x * s, h.y * s, (h.x + 1) * s, (h.y + 1) * s];
      const ops: PathOp[] =
        h.dir === '/'
          ? [
              ['M', x0 + 0.2 * s, y1 - 0.2 * s],
              ['L', x1 - 0.2 * s, y0 + 0.2 * s],
            ]
          : [
              ['M', x0 + 0.2 * s, y0 + 0.2 * s],
              ['L', x1 - 0.2 * s, y1 - 0.2 * s],
            ];
      out.push({ t: 'path', ops, stroke: { color, width: style.symbolWidth * 1.4, cap: 'round' } });
    }
  }

  if (style.centreLines) {
    const cx = chart.centre.x * s;
    const cy = chart.centre.y * s;
    out.push({
      t: 'path',
      ops: [
        ['M', cx, 0],
        ['L', cx, chart.height * s],
        ['M', 0, cy],
        ['L', chart.width * s, cy],
      ],
      stroke: style.centreLines,
      className: 'centre',
    });
  }

  // Backstitch, French knots, and the connector dots that are off (preview).
  const back = new Map<number, PathOp[]>();
  for (const l of chart.lines) {
    const ops = back.get(l.thread) ?? [];
    ops.push(['M', l.pts[0]! * s, l.pts[1]! * s]);
    for (let i = 2; i < l.pts.length; i += 2) ops.push(['L', l.pts[i]! * s, l.pts[i + 1]! * s]);
    back.set(l.thread, ops);
  }
  for (const [t, ops] of back) {
    out.push({
      t: 'path',
      ops,
      stroke: {
        color: style.threadColour(t),
        width: style.backWidth,
        cap: 'round',
        join: 'round',
        nonScaling: style.nonScaling,
      },
      className: `back-${t}`,
    });
  }
  const knots = new Map<number, number[]>();
  for (const k of chart.knots) {
    const list = knots.get(k.thread) ?? [];
    list.push(k.x * s, k.y * s);
    knots.set(k.thread, list);
  }
  for (const [t, centres] of knots)
    out.push({ t: 'circles', r: 0.28 * s, centres, fill: style.threadColour(t), className: `knot-${t}` });
  if (style.inactiveDots) {
    const centres: number[] = [];
    for (const d of chart.dots) if (!d.active) centres.push((d.x + 0.5) * s, (d.y + 0.5) * s);
    if (centres.length)
      out.push({ t: 'circles', r: 0.18 * s, centres, fill: style.inactiveDots, className: 'dot-off' });
  }
  return out;
}
