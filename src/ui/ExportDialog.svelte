<script lang="ts">
  import { getContext } from 'svelte';
  import type { AppState } from '../lib/state/app.svelte.ts';
  import { FABRIC_PRESETS } from '../lib/fabric/fabric.ts';
  import { cellForOnePage, planTiles } from '../lib/export/tiling.ts';
  import { download, slug, svgToPng } from '../lib/export/download.ts';
  import { buildPoster } from '../lib/export/poster.ts';
  import { chartToOxs } from '../lib/export/oxs.ts';
  import { renderSvgDocument } from '../lib/scene/svg-backend.ts';
  import { DMC_CREDIT } from '../lib/threads/dmc.ts';
  import { toast } from './Toasts.svelte';

  const app = getContext<AppState>('app');

  let dialog: HTMLDialogElement | undefined = $state();
  let tab = $state<'pdf' | 'svg' | 'png' | 'oxs'>('pdf');
  let busy = $state(false);
  let svgCell = $state(3);
  let pngCell = $state(20);
  let legend = $state(true);

  export function open() {
    if (!app.chart.width) return;
    dialog?.showModal();
  }

  const P = $derived(app.doc.pdf);
  const defaultTitle = $derived(
    app.doc.text
      .split('\n')
      .find((l) => l.trim())
      ?.trim()
      .replace(/:[a-z][a-z0-9-]*:/g, '')
      .trim() || 'Cross-stitch chart',
  );
  const title = $derived(P.title ?? defaultTitle);
  const plan = $derived(planTiles({ width: app.chart.width, height: app.chart.height }, P, P.cover ? 2 : 1));
  const fabricName = $derived(
    FABRIC_PRESETS.find((p) => p.count === app.doc.fabric.count && p.overTwo === app.doc.fabric.overTwo)
      ?.label ?? `${app.doc.fabric.count}-count fabric`,
  );

  const summary = $derived.by(() => {
    if ('error' in plan) return 'The cells are too large for the page.';
    const n = plan.tiles.length;
    const parts = [`${n} chart page${n > 1 ? 's' : ''}`];
    if (n > 1) parts.push(`${plan.nx} × ${plan.ny}`);
    parts.push(`${plan.colsPerPage} × ${plan.rowsPerPage} cells per page`, plan.orientation);
    return `${P.cover ? 'Cover + ' : ''}${parts.join(' · ')}${P.cover ? '' : ' + legend page'}`;
  });

  function credits(): string[] {
    const out = [];
    if (app.font?.origin === 'imported' && app.font.license)
      out.push(`Font: ${app.font.name}. ${app.font.license}`);
    out.push(
      `${DMC_CREDIT}. DMC is a trademark of its owner. The colors on screen and on paper are approximations.`,
    );
    out.push('Made with Stitch Writer. Text font: Noto Sans (SIL Open Font License 1.1).');
    return out;
  }

  async function makePdf(): Promise<Blob> {
    if ('error' in plan) throw new Error('The cells are too large for the page.');
    const [{ renderPdf, pdfTextMeasure }, { buildPdfDocument }, { loadPdfFonts }] = await Promise.all([
      import('../lib/scene/pdf-backend.ts'),
      import('../lib/export/pdf-document.ts'),
      import('../lib/export/pdf-assets.ts'),
    ]);
    const fonts = await loadPdfFonts();
    const measure = await pdfTextMeasure(fonts);
    const scene = buildPdfDocument(
      {
        chart: app.chart,
        title,
        fontName: app.font?.name ?? '',
        threads: app.threads,
        threadColor: app.threadColor,
        mode: app.doc.display,
        fabric: app.doc.fabric,
        fabricSize: app.fabric,
        fabricName,
        plan,
        cover: P.cover,
        marginMm: P.marginMm,
        credits: credits(),
      },
      measure,
    );
    const bytes = await renderPdf(scene, fonts, {
      subject: `Cross-stitch chart, ${app.chart.width} × ${app.chart.height} cells`,
    });
    return new Blob([bytes as BlobPart], { type: 'application/pdf' });
  }

  async function run(job: () => Promise<void>) {
    busy = true;
    try {
      await job();
    } catch (e) {
      toast(`Export failed: ${e instanceof Error ? e.message : String(e)}`, 'warn');
    } finally {
      busy = false;
    }
  }

  const downloadPdf = () => run(async () => download(await makePdf(), `${slug(title)}.pdf`));
  const openPdf = () =>
    run(async () => {
      // Open the tab now: a browser blocks a tab that opens after a delay.
      const w = window.open('', '_blank');
      const blob = await makePdf();
      if (!w) return download(blob, `${slug(title)}.pdf`);
      const url = URL.createObjectURL(blob);
      w.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 120_000);
    });

  function poster(cell: number) {
    return buildPoster({
      chart: app.chart,
      title,
      threads: app.threads,
      threadColor: app.threadColor,
      mode: app.doc.display,
      fabric: app.doc.fabric,
      fabricSize: app.fabric,
      cell,
      legend,
    });
  }

  const downloadSvg = () =>
    run(async () => download(renderSvgDocument(poster(svgCell)), `${slug(title)}.svg`, 'image/svg+xml'));
  const pngSize = $derived.by(() => {
    const page = poster(1);
    return { w: Math.round(page.w * pngCell), h: Math.round(page.h * pngCell) };
  });
  const pngTooBig = $derived(pngSize.w * pngSize.h > 40_000_000 || pngSize.w > 16000 || pngSize.h > 16000);
  const downloadPng = () =>
    run(async () => {
      const page = poster(1);
      const svg = renderSvgDocument(page, { unit: 'px' });
      download(await svgToPng(svg, pngSize.w, pngSize.h), `${slug(title)}.png`);
    });
  const downloadOxs = () =>
    run(async () =>
      download(chartToOxs(app.chart, app.threads, title), `${slug(title)}.oxs`, 'application/xml'),
    );

  function fitOnePage() {
    app.doc.pdf.cellMm = cellForOnePage({ width: app.chart.width, height: app.chart.height }, P);
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="export-title"
  class="export"
  onclick={(e) => e.target === dialog && !busy && dialog?.close()}
>
  <div class="body">
    <header>
      <h2 id="export-title">Export the chart</h2>
      <form method="dialog">
        <button class="btn ghost icon" aria-label="Close" disabled={busy}>×</button>
      </form>
    </header>

    <div class="tabs" role="tablist">
      {#each [['pdf', 'PDF'], ['svg', 'SVG'], ['png', 'PNG'], ['oxs', 'OXS']] as const as [id, name] (id)}
        <button role="tab" aria-selected={tab === id} onclick={() => (tab = id)}>{name}</button>
      {/each}
    </div>

    {#if tab === 'pdf'}
      <p class="lead">A vector PDF to print: every line and cell stays sharp at any size.</p>
      <div class="grid">
        <label class="field">
          <span>Title</span>
          <input
            type="text"
            value={title}
            oninput={(e) =>
              (app.doc.pdf.title = e.currentTarget.value === defaultTitle ? null : e.currentTarget.value)}
          />
        </label>
        <div class="two">
          <fieldset class="field">
            <legend class="label">Paper</legend>
            <div class="segmented">
              {#each [['a4', 'A4'], ['letter', 'Letter']] as const as [v, n] (v)}
                <label
                  ><input
                    type="radio"
                    name="paper"
                    checked={P.paper === v}
                    onchange={() => (app.doc.pdf.paper = v)}
                  /><span>{n}</span></label
                >
              {/each}
            </div>
          </fieldset>
          <fieldset class="field">
            <legend class="label">Orientation</legend>
            <div class="segmented">
              {#each [['auto', 'Auto'], ['portrait', 'Portrait'], ['landscape', 'Landscape']] as const as [v, n] (v)}
                <label
                  ><input
                    type="radio"
                    name="orient"
                    checked={P.orientation === v}
                    onchange={() => (app.doc.pdf.orientation = v)}
                  /><span>{n}</span></label
                >
              {/each}
            </div>
          </fieldset>
        </div>
        <div class="field">
          <label for="cell-size" class="label">Cell size: {P.cellMm.toFixed(1)} mm</label>
          <div class="slider">
            <input
              id="cell-size"
              type="range"
              min="1"
              max="8"
              step="0.1"
              value={P.cellMm}
              oninput={(e) => (app.doc.pdf.cellMm = e.currentTarget.valueAsNumber)}
            />
            <button class="btn" onclick={fitOnePage}>Fit on one page</button>
          </div>
        </div>
        <div class="two">
          <label class="field">
            <span>Overlap between pages (cells)</span>
            <input
              type="number"
              min="0"
              max="10"
              value={P.overlap}
              onchange={(e) =>
                (app.doc.pdf.overlap = Math.max(
                  0,
                  Math.min(10, Math.round(e.currentTarget.valueAsNumber || 0)),
                ))}
            />
          </label>
          <label class="field">
            <span>Page margin (mm)</span>
            <input
              type="number"
              min="5"
              max="25"
              value={P.marginMm}
              onchange={(e) =>
                (app.doc.pdf.marginMm = Math.max(5, Math.min(25, e.currentTarget.valueAsNumber || 10)))}
            />
          </label>
        </div>
        <label class="check"
          ><input
            type="checkbox"
            checked={P.snapTo10}
            onchange={(e) => (app.doc.pdf.snapTo10 = e.currentTarget.checked)}
          /> Cut the pages on the 10-cell lines</label
        >
        <label class="check"
          ><input
            type="checkbox"
            checked={P.cover}
            onchange={(e) => (app.doc.pdf.cover = e.currentTarget.checked)}
          /> Cover page (sizes, threads, page map) at the start</label
        >
        <fieldset class="field">
          <legend class="label">Show</legend>
          <div class="segmented">
            {#each [['color', 'Color'], ['symbol', 'Symbols (black and white)'], ['both', 'Both']] as const as [v, n] (v)}
              <label
                ><input
                  type="radio"
                  name="pdfmode"
                  checked={app.doc.display === v}
                  onchange={() => (app.doc.display = v)}
                /><span>{n}</span></label
              >
            {/each}
          </div>
        </fieldset>
      </div>
      <div class="plan" aria-live="polite">
        {#if !('error' in plan) && plan.tiles.length > 1}
          <svg
            viewBox="0 0 {app.chart.width} {app.chart.height}"
            width="120"
            height={Math.max(20, (120 * app.chart.height) / app.chart.width)}
            aria-hidden="true"
          >
            <rect
              width={app.chart.width}
              height={app.chart.height}
              fill="#fff"
              stroke="#999"
              vector-effect="non-scaling-stroke"
            />
            {#each plan.tiles as t (t.index)}
              <rect
                x={t.x0 + t.overlapLeft}
                y={t.y0 + t.overlapTop}
                width={t.x1 - t.x0 - t.overlapLeft}
                height={t.y1 - t.y0 - t.overlapTop}
                fill="none"
                stroke="var(--accent)"
                vector-effect="non-scaling-stroke"
              />
            {/each}
          </svg>
        {/if}
        <span class:bad={'error' in plan}>{summary}</span>
      </div>
      <footer>
        <button class="btn" onclick={openPdf} disabled={busy || 'error' in plan}>Open to print</button>
        <button class="btn primary" onclick={downloadPdf} disabled={busy || 'error' in plan}
          >{busy ? 'Making the PDF…' : 'Download PDF'}</button
        >
      </footer>
    {:else if tab === 'svg'}
      <p class="lead">
        One SVG page with the full chart. The size is in millimeters, so it prints at the correct size from a
        vector editor.
      </p>
      <div class="grid">
        <label class="field"
          ><span>Cell size: {svgCell.toFixed(1)} mm</span><input
            type="range"
            min="1"
            max="8"
            step="0.1"
            bind:value={svgCell}
          /></label
        >
        <label class="check"
          ><input type="checkbox" bind:checked={legend} /> Add the title and the thread legend</label
        >
      </div>
      <footer><button class="btn primary" onclick={downloadSvg} disabled={busy}>Download SVG</button></footer>
    {:else if tab === 'png'}
      <p class="lead">An image, to share or to look at on a phone. Use the PDF to print.</p>
      <div class="grid">
        <label class="field"
          ><span>{pngCell} pixels per cell ({pngSize.w} × {pngSize.h} px)</span><input
            type="range"
            min="6"
            max="40"
            step="1"
            bind:value={pngCell}
          /></label
        >
        <label class="check"
          ><input type="checkbox" bind:checked={legend} /> Add the title and the thread legend</label
        >
        {#if pngTooBig}<p class="bad">
            The image is too large for the browser. Use fewer pixels per cell.
          </p>{/if}
      </div>
      <footer>
        <button class="btn primary" onclick={downloadPng} disabled={busy || pngTooBig}>Download PNG</button>
      </footer>
    {:else}
      <p class="lead">
        OXS (Open Cross Stitch) is an open XML format. Pattern Maker, MacStitch, WinStitch, KXStitch and other
        programs can open the chart with its threads, half stitches, backstitches and French knots.
      </p>
      <footer><button class="btn primary" onclick={downloadOxs} disabled={busy}>Download OXS</button></footer>
    {/if}
  </div>
</dialog>

<style>
  .export {
    width: min(560px, calc(100vw - 24px));
  }

  .body {
    display: grid;
    gap: 14px;
    padding: 16px 18px 18px;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  h2 {
    margin: 0;
    font-size: 17px;
  }

  .tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--line);
  }

  .tabs button {
    border: 0;
    background: none;
    padding: 6px 12px;
    font-weight: 600;
    color: var(--muted);
    border-bottom: 2px solid transparent;
    cursor: pointer;
  }

  .tabs button[aria-selected='true'] {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  .lead {
    margin: 0;
    color: var(--muted);
  }

  .grid {
    display: grid;
    gap: 12px;
  }

  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
  }

  .field input[type='text'] {
    width: 100%;
  }

  .slider {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .slider input {
    flex: 1;
  }

  .check {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .plan {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    background: var(--panel-2);
    font-weight: 600;
  }

  .bad {
    color: var(--error);
    margin: 0;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  @media (max-width: 520px) {
    .two {
      grid-template-columns: 1fr;
    }
  }
</style>
