import type { Chart } from '../layout/types.ts';
import { decodeCell } from '../layout/types.ts';
import type { Thread } from '../threads/dmc.ts';

/**
 * Writes the chart in the Open Cross Stitch format (OXS 1.0, https://www.ursasoftware.com/OXSFormat/).
 * Pattern Maker, MacStitch, WinStitch, KXStitch and other programs can open it.
 * Coordinates: x = column, y = row, from the top-left cell. Backstitch and knot points use stitch
 * units on the hole grid (the corners of the cells), as the format describes.
 */
export function chartToOxs(chart: Chart, threads: readonly Thread[], title: string, author = ''): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const used = Object.keys(chart.stats.threads)
    .map(Number)
    .sort((a, b) => a - b);
  // Palette index 0 is the cloth. The threads follow, in order.
  const index = new Map(used.map((t, i) => [t, i + 1]));
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<chart>');
  lines.push('<format comments01="Written by Stitch Writer" />');
  lines.push(
    `<properties oxsversion="1.0" software="Stitch Writer" software_version="1" chartheight="${chart.height}" chartwidth="${chart.width}" charttitle="${esc(title)}" author="${esc(author)}" copyright="" instructions="" stitchesperinch="14" stitchesperinch_y="14" palettecount="${used.length}" />`,
  );
  lines.push('<palette>');
  lines.push(
    '<palette_item index="0" number="cloth" name="cloth" color="FFFFFF" printcolor="FFFFFF" blendcolor="nil" comments="" strands="2" symbol="0" dashpattern="" bsstrands="0" bscolor="000000" />',
  );
  for (const t of used) {
    const th = threads[t] ?? threads[0]!;
    const hex = th.hex.replace('#', '').toUpperCase();
    lines.push(
      `<palette_item index="${index.get(t)}" number="DMC    ${esc(th.id)}" name="${esc(th.name)}" color="${hex}" printcolor="${hex}" blendcolor="nil" comments="" strands="2" symbol="${t + 1}" dashpattern="" bsstrands="1" bscolor="${hex}" />`,
    );
  }
  lines.push('</palette>');
  lines.push('<fullstitches>');
  const partials: string[] = [];
  for (let y = 0; y < chart.height; y++) {
    for (let x = 0; x < chart.width; x++) {
      const c = decodeCell(chart.cells[y * chart.width + x]!);
      if (!c) continue;
      const p = index.get(c.thread) ?? 1;
      if (!c.half) lines.push(`<stitch x="${x}" y="${y}" palindex="${p}" />`);
      else
        partials.push(
          `<partstitch x="${x}" y="${y}" palindex1="${p}" palindex2="0" direction="${c.half === '/' ? 3 : 4}" />`,
        );
    }
  }
  lines.push('</fullstitches>');
  lines.push('<partstitches>', ...partials, '</partstitches>');
  lines.push('<backstitches>');
  let seq = 1;
  for (const l of chart.lines) {
    const p = index.get(l.thread) ?? 1;
    for (let i = 2; i < l.pts.length; i += 2) {
      lines.push(
        `<backstitch x1="${l.pts[i - 2]}" y1="${l.pts[i - 1]}" x2="${l.pts[i]}" y2="${l.pts[i + 1]}" palindex="${p}" objecttype="backstitch" sequence="${seq++}" />`,
      );
    }
  }
  lines.push('</backstitches>');
  lines.push('<ornaments_inc_knots_and_beads>');
  for (const k of chart.knots) {
    lines.push(`<object x1="${k.x}" y1="${k.y}" palindex="${index.get(k.thread) ?? 1}" objecttype="knot" />`);
  }
  lines.push('</ornaments_inc_knots_and_beads>');
  lines.push('<commentboxes></commentboxes>');
  lines.push('</chart>');
  return lines.join('\n') + '\n';
}
