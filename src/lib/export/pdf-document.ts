import { formatSize, type FabricSettings, type FabricSize } from '../fabric/fabric.ts';
import type { Chart } from '../layout/types.ts';
import { buildChartLayer, printStyle, type RenderMode } from '../scene/chart-layer.ts';
import { symbolForThread } from '../scene/symbols.ts';
import {
  BLACK,
  contrastOn,
  type PathOp,
  type Rgb,
  type SceneDoc,
  type SceneNode,
  type ScenePage,
  type TextMeasure,
} from '../scene/types.ts';
import type { Thread } from '../threads/dmc.ts';
import { describeRow, legendRows, type LegendRow } from './legend.ts';
import type { Tile, TilePlan } from './tiling.ts';

export interface PdfInput {
  chart: Chart;
  title: string;
  fontName: string;
  fontCredit?: string;
  threads: readonly Thread[];
  threadColor: (t: number) => Rgb;
  mode: RenderMode;
  fabric: FabricSettings;
  fabricSize: FabricSize;
  fabricName: string;
  plan: TilePlan;
  cover: boolean;
  marginMm: number;
  credits: string[];
}

const GRAY: Rgb = [110, 110, 110];
/** The most legend rows in one column. More rows go in two columns. */
const LEGEND_ONE_COLUMN = 8;
const LIGHT: Rgb = [235, 235, 235];
const PT = 25.4 / 72;

function fitText(
  m: TextMeasure,
  text: string,
  size: number,
  maxW: number,
  weight: 'regular' | 'bold' = 'regular',
): string {
  if (m.width(text, size, weight) <= maxW) return text;
  let t = text;
  while (t.length > 1 && m.width(`${t}…`, size, weight) > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

function chartPage(input: PdfInput, tile: Tile, total: number, m: TextMeasure): ScenePage {
  const { plan, chart } = input;
  const { page, area, gutters: g, cellMm: s } = plan;
  const M = input.marginMm;
  const out: SceneNode[] = [];
  const pageLabel = `Page ${tile.page} of ${total}`;
  const titleSize = 10 * PT;
  const small = 7.5 * PT;

  // Header: title, page number, cell ranges and a small map of the pages.
  const mapW = plan.nx * 3.2;
  out.push({
    t: 'text',
    x: M,
    y: M + 4,
    text: fitText(m, input.title, titleSize, page.w - 2 * M - 40, 'bold'),
    size: titleSize,
    weight: 'bold',
  });
  out.push({ t: 'text', x: page.w - M, y: M + 4, text: pageLabel, size: titleSize, anchor: 'end' });
  out.push({
    t: 'text',
    x: M,
    y: M + 9,
    text: `Columns ${tile.x0 + 1}–${tile.x1} · Rows ${tile.y0 + 1}–${tile.y1}`,
    size: small,
    fill: GRAY,
  });
  if (plan.tiles.length > 1) {
    const mapX = page.w - M - mapW;
    for (const t of plan.tiles) {
      out.push({
        t: 'rect',
        x: mapX + t.col * 3.2,
        y: M + 6 + t.row * 2.2,
        w: 3,
        h: 2,
        fill: t === tile ? input.threadColor(0) : LIGHT,
        stroke: { color: GRAY, width: 0.1 },
      });
    }
  }

  // The chart region, clipped to the tile.
  const w = (tile.x1 - tile.x0) * s;
  const h = (tile.y1 - tile.y0) * s;
  const inner: SceneNode[] = [];
  if (tile.overlapLeft)
    inner.push({ t: 'rect', x: tile.x0 * s, y: tile.y0 * s, w: tile.overlapLeft * s, h, fill: LIGHT });
  if (tile.overlapTop)
    inner.push({ t: 'rect', x: tile.x0 * s, y: tile.y0 * s, w, h: tile.overlapTop * s, fill: LIGHT });
  inner.push(...buildChartLayer(chart, printStyle(s, input.mode, input.threadColor), tile));
  const dash = { color: [90, 90, 90] as Rgb, width: 0.3, dash: [1, 0.8] };
  if (tile.overlapLeft)
    inner.push({
      t: 'line',
      x1: (tile.x0 + tile.overlapLeft) * s,
      y1: tile.y0 * s,
      x2: (tile.x0 + tile.overlapLeft) * s,
      y2: tile.y1 * s,
      stroke: dash,
    });
  if (tile.overlapTop)
    inner.push({
      t: 'line',
      x1: tile.x0 * s,
      y1: (tile.y0 + tile.overlapTop) * s,
      x2: tile.x1 * s,
      y2: (tile.y0 + tile.overlapTop) * s,
      stroke: dash,
    });
  out.push({
    t: 'group',
    tx: area.x - tile.x0 * s,
    ty: area.y - tile.y0 * s,
    clip: { x: tile.x0 * s, y: tile.y0 * s, w, h },
    children: inner,
  });

  // Axis numbers on each 10th line (global numbers, so that the pages fit together).
  for (let v = Math.ceil(tile.x0 / 10) * 10; v <= tile.x1; v += 10) {
    if (v === 0) continue;
    out.push({
      t: 'text',
      x: area.x + (v - tile.x0) * s,
      y: area.y - 1,
      text: String(v),
      size: g.label,
      anchor: 'middle',
      fill: GRAY,
    });
  }
  for (let v = Math.ceil(tile.y0 / 10) * 10; v <= tile.y1; v += 10) {
    if (v === 0) continue;
    out.push({
      t: 'text',
      x: area.x - 1,
      y: area.y + (v - tile.y0) * s + g.label * 0.35,
      text: String(v),
      size: g.label,
      anchor: 'end',
      fill: GRAY,
    });
  }

  // Center arrows in the gutters.
  const arrow: Rgb = [200, 30, 60];
  const cx = chart.center.x;
  const cy = chart.center.y;
  if (cx >= tile.x0 && cx <= tile.x1) {
    const x = area.x + (cx - tile.x0) * s;
    out.push({
      t: 'path',
      ops: [
        ['M', x - 1.2, area.y - g.top + 0.2],
        ['L', x + 1.2, area.y - g.top + 0.2],
        ['L', x, area.y - g.top + 2],
        ['Z'],
      ],
      fill: arrow,
    });
    out.push({
      t: 'path',
      ops: [
        ['M', x - 1.2, area.y + h + 2.6],
        ['L', x + 1.2, area.y + h + 2.6],
        ['L', x, area.y + h + 0.8],
        ['Z'],
      ],
      fill: arrow,
    });
  }
  if (cy >= tile.y0 && cy <= tile.y1) {
    const y = area.y + (cy - tile.y0) * s;
    out.push({
      t: 'path',
      ops: [
        ['M', area.x - g.left + 0.2, y - 1.2],
        ['L', area.x - g.left + 0.2, y + 1.2],
        ['L', area.x - g.left + 2, y],
        ['Z'],
      ],
      fill: arrow,
    });
    out.push({
      t: 'path',
      ops: [
        ['M', area.x + w + 2.6, y - 1.2],
        ['L', area.x + w + 2.6, y + 1.2],
        ['L', area.x + w + 0.8, y],
        ['Z'],
      ],
      fill: arrow,
    });
  }

  // Footer.
  const fy = page.h - M - 1;
  const note =
    tile.overlapLeft || tile.overlapTop ? 'Gray rows and columns repeat from the page before. ' : '';
  out.push({ t: 'text', x: M, y: fy, text: `${note}Print at 100 % (actual size).`, size: small, fill: GRAY });
  out.push({
    t: 'text',
    x: page.w - M,
    y: fy,
    text: 'Stitch Writer',
    size: small,
    fill: GRAY,
    anchor: 'end',
  });
  return { w: page.w, h: page.h, children: out };
}

function legendSwatch(
  x: number,
  y: number,
  size: number,
  thread: number,
  input: PdfInput,
  kind: 'cell' | 'line' | 'knot',
): SceneNode[] {
  const color = input.threadColor(thread);
  const out: SceneNode[] = [
    { t: 'rect', x, y, w: size, h: size, fill: [255, 255, 255], stroke: { color: GRAY, width: 0.15 } },
  ];
  if (kind === 'line') {
    out.push({
      t: 'line',
      x1: x + 0.8,
      y1: y + size - 0.8,
      x2: x + size - 0.8,
      y2: y + 0.8,
      stroke: { color, width: 0.6, cap: 'round' },
    });
    return out;
  }
  if (kind === 'knot') {
    out.push({ t: 'circles', r: size * 0.25, centers: [x + size / 2, y + size / 2], fill: color });
    return out;
  }
  if (input.mode !== 'symbol') out.push({ t: 'rect', x, y, w: size, h: size, fill: color });
  if (input.mode !== 'color') {
    const shape = symbolForThread(thread);
    const ink = input.mode === 'both' ? contrastOn(color) : BLACK;
    const ops: PathOp[] = shape.ops(x, y, size);
    out.push(
      shape.fill
        ? { t: 'path', ops, fill: ink }
        : { t: 'path', ops, stroke: { color: ink, width: size * 0.09, cap: 'round' } },
    );
  }
  return out;
}

function infoPage(input: PdfInput, m: TextMeasure, withTitle: boolean): ScenePage {
  const { plan, chart } = input;
  const W = plan.orientation === 'portrait' ? plan.page.w : plan.page.h;
  const H = plan.orientation === 'portrait' ? plan.page.h : plan.page.w;
  const M = input.marginMm;
  const out: SceneNode[] = [];
  let y = M;

  if (withTitle) {
    y += 8;
    out.push({
      t: 'text',
      x: M,
      y,
      text: fitText(m, input.title, 20 * PT, W - 2 * M, 'bold'),
      size: 20 * PT,
      weight: 'bold',
    });
    y += 6;
    out.push({
      t: 'text',
      x: M,
      y,
      text: `${input.fontName} · cross-stitch chart · made with Stitch Writer`,
      size: 9 * PT,
      fill: GRAY,
    });
    y += 10;
  } else {
    y += 6;
    out.push({ t: 'text', x: M, y, text: 'Threads and pages', size: 14 * PT, weight: 'bold' });
    y += 8;
  }

  // Facts.
  const f = input.fabricSize;
  const units = input.fabric.units;
  const facts: [string, string][] = [
    [
      'Chart',
      `${f.stitches.w} × ${f.stitches.h} stitches (${chart.width} × ${chart.height} cells with the margin)`,
    ],
    [
      'Design size',
      `${formatSize(f.designMm, 'cm')}  ·  ${formatSize(f.designMm, 'in')}  on ${input.fabricName}`,
    ],
    [
      'Cut the fabric',
      `${formatSize(f.cutMm, units)} (${formatSize({ w: input.fabric.marginMm, h: input.fabric.marginMm }, units).split(' × ')[0]} ${units} margin on each side)`,
    ],
    ['Stitches', chart.stats.total.toLocaleString('en')],
    ['Chart pages', `${plan.tiles.length} (${plan.nx} × ${plan.ny}), ${plan.cellMm.toFixed(1)} mm per cell`],
    ['Start', 'at the center of the fabric: the red arrows show the center of the chart.'],
  ];
  const size = 9 * PT;
  for (const [k, v] of facts) {
    out.push({ t: 'text', x: M, y, text: k, size, weight: 'bold' });
    out.push({ t: 'text', x: M + 30, y, text: fitText(m, v, size, W - 2 * M - 30), size });
    y += 5;
  }

  // Calibration ruler: 50 mm.
  y += 4;
  const ticks: PathOp[] = [
    ['M', M, y],
    ['L', M + 50, y],
  ];
  for (let i = 0; i <= 50; i += 5) ticks.push(['M', M + i, y], ['L', M + i, y - (i % 10 === 0 ? 2.5 : 1.3)]);
  out.push({ t: 'path', ops: ticks, stroke: { color: BLACK, width: 0.25 } });
  out.push({
    t: 'text',
    x: M + 54,
    y: y + 0.2,
    text: '50 mm. Measure this line to check that the print is at 100 %.',
    size: 8 * PT,
    fill: GRAY,
  });
  y += 9;

  // Thread legend.
  out.push({ t: 'text', x: M, y, text: 'Threads', size: 11 * PT, weight: 'bold' });
  y += 3;
  const rows = legendRows(chart, input.threads, input.fabric);
  const swatches = (r: LegendRow, x: number, ry: number) => {
    const kind = r.full || r.half ? 'cell' : r.backstitches ? 'line' : 'knot';
    out.push(...legendSwatch(x, ry, 5, r.thread, input, kind));
    if ((r.full || r.half) && r.backstitches)
      out.push(...legendSwatch(x + 6, ry, 5, r.thread, input, 'line'));
  };
  if (rows.length <= LEGEND_ONE_COLUMN) {
    for (const r of rows) {
      swatches(r, M, y);
      out.push({ t: 'text', x: M + 13, y: y + 3.6, text: `DMC ${r.dmc.id}`, size, weight: 'bold' });
      out.push({ t: 'text', x: M + 32, y: y + 3.6, text: r.dmc.name, size });
      out.push({
        t: 'text',
        x: M + 80,
        y: y + 3.6,
        text: fitText(m, describeRow(r, units), size, W - 2 * M - 80),
        size,
        fill: GRAY,
      });
      y += 7;
    }
  } else {
    // Two columns. Each row has the thread on one line and the stitch counts on the next line.
    const gap = 6;
    const colW = (W - 2 * M - gap) / 2;
    const perColumn = Math.ceil(rows.length / 2);
    const small = 7.5 * PT;
    rows.forEach((r, i) => {
      const x = M + (i < perColumn ? 0 : colW + gap);
      const ry = y + (i % perColumn) * 9;
      swatches(r, x, ry);
      out.push({ t: 'text', x: x + 13, y: ry + 2.6, text: `DMC ${r.dmc.id}`, size, weight: 'bold' });
      out.push({ t: 'text', x: x + 30, y: ry + 2.6, text: fitText(m, r.dmc.name, size, colW - 30), size });
      out.push({
        t: 'text',
        x: x + 13,
        y: ry + 6.4,
        text: fitText(m, describeRow(r, units), small, colW - 13),
        size: small,
        fill: GRAY,
      });
    });
    y += perColumn * 9 + 2;
  }
  out.push({
    t: 'text',
    x: M,
    y: y + 1,
    text: 'Use 2 strands for cross stitches on Aida 14 to 16, and 1 strand for backstitches.',
    size: 8 * PT,
    fill: GRAY,
  });
  y += 9;

  // Page assembly map.
  if (plan.tiles.length > 1 || withTitle) {
    out.push({
      t: 'text',
      x: M,
      y,
      text: plan.tiles.length > 1 ? 'How the pages fit together' : 'The chart',
      size: 11 * PT,
      weight: 'bold',
    });
    y += 3;
    const boxW = W - 2 * M;
    const boxH = Math.min(90, H - M - 22 - y);
    if (boxH > 20) {
      const k = Math.min(boxW / chart.width, boxH / chart.height);
      const thumb = buildChartLayer(chart, {
        ...printStyle(k, 'color', input.threadColor),
        minor: { color: [255, 255, 255], width: 0 },
        major: { color: [200, 200, 200], width: 0.1 },
        backWidth: Math.max(0.2, k * 0.2),
      });
      const children: SceneNode[] = [
        ...thumb.filter((n) => !(n.t === 'path' && n.className === 'grid-minor')),
      ];
      if (plan.tiles.length > 1) {
        for (const t of plan.tiles) {
          const x0 = t.x0 + t.overlapLeft;
          const y0 = t.y0 + t.overlapTop;
          children.push({
            t: 'rect',
            x: x0 * k,
            y: y0 * k,
            w: (t.x1 - x0) * k,
            h: (t.y1 - y0) * k,
            stroke: { color: [200, 30, 60], width: 0.35 },
          });
          children.push({
            t: 'text',
            x: (x0 + t.x1) * 0.5 * k,
            y: (y0 + t.y1) * 0.5 * k + 1.5,
            text: String(t.page),
            size: 12 * PT,
            weight: 'bold',
            anchor: 'middle',
            fill: [200, 30, 60],
          });
        }
      }
      out.push({ t: 'group', tx: M + (boxW - chart.width * k) / 2, ty: y, children });
    }
  }

  // Credits.
  let cy = H - M - 1 - (input.credits.length - 1) * 3.2;
  for (const line of input.credits) {
    out.push({ t: 'text', x: M, y: cy, text: fitText(m, line, 7 * PT, W - 2 * M), size: 7 * PT, fill: GRAY });
    cy += 3.2;
  }
  return { w: W, h: H, children: out };
}

/** The pages of the PDF: a cover with the legend (first or last), then the chart pages. */
export function buildPdfDocument(input: PdfInput, measure: TextMeasure): SceneDoc {
  const total = input.plan.tiles.length + 1;
  const pages = input.plan.tiles.map((t) => chartPage(input, t, total, measure));
  const info = infoPage(input, measure, input.cover);
  return { title: input.title, pages: input.cover ? [info, ...pages] : [...pages, info] };
}
