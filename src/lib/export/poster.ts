import { formatSize, type FabricSettings, type FabricSize } from '../fabric/fabric.ts';
import type { Chart } from '../layout/types.ts';
import { buildChartLayer, printStyle, type RenderMode } from '../scene/chart-layer.ts';
import { approxMeasure, type Rgb, type SceneNode, type ScenePage } from '../scene/types.ts';
import type { Thread } from '../threads/dmc.ts';
import { describeRow, legendRows } from './legend.ts';

export interface PosterInput {
  chart: Chart;
  title: string;
  threads: readonly Thread[];
  threadColor: (t: number) => Rgb;
  mode: RenderMode;
  fabric: FabricSettings;
  fabricSize: FabricSize;
  /** Cell size in scene units (mm for SVG). */
  cell: number;
  legend: boolean;
}

/** One page with the whole chart, its axis numbers and (optionally) the thread legend. */
export function buildPoster(p: PosterInput): ScenePage {
  const s = p.cell;
  const label = Math.min(3, Math.max(1.6, s * 0.7));
  const left = label * 2 + 3;
  const top = label + 3;
  const pad = 4;
  const chartW = p.chart.width * s;
  const chartH = p.chart.height * s;
  const out: SceneNode[] = [];
  out.push({
    t: 'group',
    tx: pad + left,
    ty: pad + top,
    children: buildChartLayer(p.chart, printStyle(s, p.mode, p.threadColor)),
  });
  for (let v = 10; v <= p.chart.width; v += 10) {
    out.push({
      t: 'text',
      x: pad + left + v * s,
      y: pad + top - 1,
      text: String(v),
      size: label,
      anchor: 'middle',
      fill: [110, 110, 110],
    });
  }
  for (let v = 10; v <= p.chart.height; v += 10) {
    out.push({
      t: 'text',
      x: pad + left - 1,
      y: pad + top + v * s + label * 0.35,
      text: String(v),
      size: label,
      anchor: 'end',
      fill: [110, 110, 110],
    });
  }
  let y = pad + top + chartH + 6;
  let width = pad * 2 + left + chartW + 2;
  if (p.legend) {
    const size = 3.2;
    const rows = legendRows(p.chart, p.threads, p.fabric);
    out.push({ t: 'text', x: pad, y, text: p.title, size: 4, weight: 'bold' });
    y += 5;
    out.push({
      t: 'text',
      x: pad,
      y,
      text: `${p.fabricSize.stitches.w} × ${p.fabricSize.stitches.h} stitches · ${formatSize(p.fabricSize.designMm, p.fabric.units)} · fabric ${formatSize(p.fabricSize.cutMm, p.fabric.units)}`,
      size,
      fill: [90, 90, 90],
    });
    y += 5;
    for (const r of rows) {
      out.push({
        t: 'rect',
        x: pad,
        y: y - 3,
        w: 4,
        h: 4,
        fill: p.threadColor(r.thread),
        stroke: { color: [120, 120, 120], width: 0.15 },
      });
      const text = `DMC ${r.dmc.id} ${r.dmc.name}: ${describeRow(r, p.fabric.units)}`;
      out.push({ t: 'text', x: pad + 6, y, text, size });
      width = Math.max(width, pad * 2 + 6 + approxMeasure.width(text, size));
      y += 5.5;
    }
  }
  return { w: width, h: y + pad, children: out };
}
