import { backstitchLengthMm, type FabricSettings } from '../fabric/fabric.ts';
import type { Chart } from '../layout/types.ts';
import type { Thread } from '../threads/dmc.ts';

export interface LegendRow {
  thread: number;
  dmc: Thread;
  full: number;
  half: number;
  backstitches: number;
  backLengthMm: number;
  knots: number;
}

/** One row for each thread that the chart uses. */
export function legendRows(chart: Chart, threads: readonly Thread[], fabric: FabricSettings): LegendRow[] {
  return Object.entries(chart.stats.threads)
    .map(([t, s]) => ({
      thread: Number(t),
      dmc: threads[Number(t)] ?? threads[0]!,
      full: s.full,
      half: s.half,
      backstitches: s.backstitches,
      backLengthMm: backstitchLengthMm(s.backLength, fabric),
      knots: s.knots,
    }))
    .filter((r) => r.full + r.half + r.backstitches + r.knots > 0)
    .sort((a, b) => a.thread - b.thread);
}

/** "245 cross stitches, 12 half stitches, 3 backstitches (1.8 cm)". */
export function describeRow(r: LegendRow, units: 'cm' | 'in'): string {
  const parts: string[] = [];
  const plural = (n: number, w: string) => `${n.toLocaleString('en')} ${w}${n === 1 ? '' : 'es'}`;
  if (r.full) parts.push(plural(r.full, 'cross stitch'));
  if (r.half) parts.push(plural(r.half, 'half stitch'));
  if (r.backstitches) {
    const len =
      units === 'cm' ? `${(r.backLengthMm / 10).toFixed(1)} cm` : `${(r.backLengthMm / 25.4).toFixed(1)} in`;
    parts.push(
      `${r.backstitches.toLocaleString('en')} backstitch${r.backstitches === 1 ? '' : 'es'} (${len})`,
    );
  }
  if (r.knots) parts.push(`${r.knots} French knot${r.knots === 1 ? '' : 's'}`);
  return parts.join(', ');
}
