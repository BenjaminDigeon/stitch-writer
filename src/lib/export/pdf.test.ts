import { readFileSync } from 'node:fs';
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream, PDFDict } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { fabricSize, DEFAULT_FABRIC } from '../fabric/fabric.ts';
import { makeFont } from '../font/test-fonts.ts';
import { layout } from '../layout/layout.ts';
import { DEFAULT_LAYOUT, type Chart } from '../layout/types.ts';
import { pdfTextMeasure, renderPdf } from '../scene/pdf-backend.ts';
import { DMC_THREADS, type Thread } from '../threads/dmc.ts';
import { legendRows } from './legend.ts';
import { chartToOxs } from './oxs.ts';
import { buildPdfDocument } from './pdf-document.ts';
import { planTiles, type TilePlan } from './tiling.ts';

const fonts = {
  regular: new Uint8Array(
    readFileSync(new URL('../../assets/pdf-fonts/NotoSans-Regular.ttf', import.meta.url)),
  ),
  bold: new Uint8Array(readFileSync(new URL('../../assets/pdf-fonts/NotoSans-Bold.ttf', import.meta.url))),
};

const font = makeFont({
  a: ['XXX', 'X.X', 'XXX'],
  b: ['X..', 'XXX', 'X.X', 'XXX'],
  'heart-01': { rows: ['O.O', 'OOO', '.O.'], type: 'motif' },
});
const dmc = (ids: string[]) => ids.map((id) => DMC_THREADS.find((t) => t.id === id)!);
const threads = dmc(['310', '321']);
const tenThreads = dmc(['310', '321', '3750', '3765', '3346', '783', '815', '333', '900', '434']);

/** "ab ab ab ab ab" with one color for each letter, on the threads 0 to count - 1. */
const colorful = (count: number) =>
  layout('ab ab ab ab ab', font, DEFAULT_LAYOUT, {}, undefined, {
    mode: 'letter',
    ranges: [],
    textThreads: Array.from({ length: count }, (_, i) => i),
    accentThread: count,
  });

async function makePdf(text: string | Chart, cellMm: number, cover = true, list: Thread[] = threads) {
  const chart = typeof text === 'string' ? layout(text, font, DEFAULT_LAYOUT) : text;
  const plan = planTiles(
    chart,
    { paper: 'a4', orientation: 'portrait', cellMm, overlap: 2, marginMm: 10, snapTo10: false },
    cover ? 2 : 1,
  ) as TilePlan;
  const scene = buildPdfDocument(
    {
      chart,
      title: 'Test chart — Čeština ŏ',
      fontName: 'Test',
      threads: list,
      threadColor: (t) => list[t]!.rgb,
      mode: 'both',
      fabric: DEFAULT_FABRIC,
      fabricSize: fabricSize(chart.design, DEFAULT_FABRIC),
      fabricName: 'Aida 14',
      plan,
      cover,
      marginMm: 10,
      credits: ['Credit line'],
    },
    await pdfTextMeasure(fonts),
  );
  return { chart, plan, bytes: await renderPdf(scene, fonts) };
}

function contentOf(doc: PDFDocument, pageIndex: number): string {
  const page = doc.getPage(pageIndex);
  const contents = page.node.Contents();
  const streams = contents instanceof PDFRawStream ? [contents] : [];
  if (!streams.length && contents) {
    const arr = contents as unknown as { asArray(): unknown[] };
    for (const ref of arr.asArray()) streams.push(doc.context.lookup(ref as never) as PDFRawStream);
  }
  return streams.map((s) => new TextDecoder().decode(decodePDFRawStream(s).decode())).join('\n');
}

describe('PDF export', () => {
  it('makes a vector PDF with a cover and the chart pages', async () => {
    const { plan, bytes } = await makePdf('ab:heart-01: ab', 3);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(plan.tiles.length + 1);
    const [w, h] = [doc.getPage(1).getWidth(), doc.getPage(1).getHeight()];
    expect(Math.round(w)).toBe(595);
    expect(Math.round(h)).toBe(842);
    const ops = contentOf(doc, 1);
    expect(ops).toMatch(/ re\b/);
    expect(ops).toMatch(/ l\b/);
    expect(ops).toMatch(/\bf\b/);
    // No raster image anywhere in the file.
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      const dict = obj instanceof PDFRawStream ? obj.dict : obj instanceof PDFDict ? obj : null;
      expect(dict?.get(PDFName.of('Subtype'))?.toString()).not.toBe('/Image');
    }
  });

  it('cuts a long text into several pages', async () => {
    const { plan, bytes } = await makePdf('ab '.repeat(40) + '\n' + 'ba '.repeat(40), 5);
    expect(plan.tiles.length).toBeGreaterThan(1);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(plan.tiles.length + 1);
  });

  it('gives each color a legend row and an OXS palette entry', () => {
    const chart = colorful(5);
    expect(legendRows(chart, tenThreads, DEFAULT_FABRIC).map((r) => r.dmc.id)).toEqual([
      '310',
      '321',
      '3750',
      '3765',
      '3346',
    ]);
    const xml = chartToOxs(chart, tenThreads, 'Colors');
    expect(xml).toContain('palettecount="5"');
    expect((xml.match(/<palette_item /g) ?? []).length).toBe(6);
    expect(xml).toContain('number="DMC    3346"');
  });

  it('makes a PDF with a legend of 10 colors in two columns', async () => {
    const chart = colorful(10);
    expect(legendRows(chart, tenThreads, DEFAULT_FABRIC)).toHaveLength(10);
    const { plan, bytes } = await makePdf(chart, 3, true, tenThreads);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(plan.tiles.length + 1);
  });

  it('writes an OXS file with the palette and the stitches', () => {
    const chart = layout('a:heart-01:', font, DEFAULT_LAYOUT);
    const xml = chartToOxs(chart, threads, 'T & T');
    expect(xml).toContain('charttitle="T &amp; T"');
    expect(xml).toContain('number="DMC    310"');
    expect((xml.match(/<stitch /g) ?? []).length).toBe(
      chart.stats.threads[0]!.full + chart.stats.threads[1]!.full,
    );
  });
});
