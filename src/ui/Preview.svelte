<script lang="ts">
  import { getContext } from 'svelte';
  import type { Attachment } from 'svelte/attachments';
  import type { AppState } from '../lib/state/app.svelte.ts';
  import type { Placement, Span } from '../lib/layout/types.ts';
  import { buildChartLayer, type ChartStyle } from '../lib/scene/chart-layer.ts';
  import { renderSvgFragment } from '../lib/scene/svg-backend.ts';
  import { fitViewport, zoomAt, type Viewport } from '../lib/state/viewport.ts';

  let { onselectrange, loading = false }: { onselectrange: (span: Span) => void; loading?: boolean } =
    $props();
  const app = getContext<AppState>('app');

  let w = $state(0);
  let h = $state(0);
  let vp = $state<Viewport>({ scale: 12, tx: 0, ty: 0 });
  let follow = $state(true);
  let hover = $state<Placement | null>(null);

  const chart = $derived(app.chart);
  const RULER = 20;

  const style = $derived<ChartStyle>({
    cell: 1,
    mode: app.doc.display,
    threadColour: app.threadColour,
    minor: { color: [205, 205, 205], width: 1, nonScaling: true },
    major: { color: [120, 120, 120], width: 1.5, nonScaling: true },
    border: { color: [60, 60, 60], width: 2, nonScaling: true },
    backWidth: 0.18,
    symbolWidth: 0.12,
    inactiveDots: [200, 200, 200],
  });
  const markup = $derived(chart.width ? renderSvgFragment(buildChartLayer(chart, style)) : '');

  $effect(() => {
    if (follow && w && h && chart.width)
      vp = fitViewport({ w: chart.width, h: chart.height }, { w: w - RULER, h: h - RULER }, 24, 28, RULER);
  });

  const caretPlacement = $derived.by(() => {
    const c = app.caret;
    if (c === null) return null;
    return (
      chart.placements.find((p) => p.src.start <= c && c < p.src.end) ??
      chart.placements.findLast((p) => p.src.end === c) ??
      null
    );
  });

  const lod = $derived(vp.scale < 3.5 ? 'lod-far' : vp.scale < 7 ? 'lod-mid' : '');

  function toChart(clientX: number, clientY: number, el: Element) {
    const r = el.getBoundingClientRect();
    return { x: (clientX - r.left - vp.tx) / vp.scale, y: (clientY - r.top - vp.ty) / vp.scale };
  }

  function placementAt(x: number, y: number): Placement | null {
    return (
      chart.placements.find(
        (p) => x >= p.x && x < p.x + Math.max(1, p.width) && y >= p.y && y < p.y + p.height,
      ) ?? null
    );
  }

  function zoom(factor: number, px = (w + RULER) / 2, py = (h + RULER) / 2) {
    follow = false;
    vp = zoomAt(vp, factor, px, py);
  }

  function fit() {
    follow = true;
  }

  // Pointer interaction: drag to pan, two pointers to pinch.
  const pointers = new Map<number, { x: number; y: number }>();
  let moved = false;
  let pinchDist = 0;

  function onpointerdown(e: PointerEvent) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  }

  function onpointermove(e: PointerEvent) {
    const el = e.currentTarget as Element;
    const prev = pointers.get(e.pointerId);
    if (!prev) {
      const p = toChart(e.clientX, e.clientY, el);
      hover = placementAt(p.x, p.y);
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (Math.abs(dx) + Math.abs(dy) > 0) moved = true;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const r = el.getBoundingClientRect();
      if (pinchDist) zoom(dist / pinchDist, (a!.x + b!.x) / 2 - r.left, (a!.y + b!.y) / 2 - r.top);
      pinchDist = dist;
    } else {
      follow = false;
      vp = { ...vp, tx: vp.tx + dx, ty: vp.ty + dy };
    }
  }

  function onpointerup(e: PointerEvent) {
    const wasClick = pointers.size === 1 && !moved;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (!wasClick) return;
    const p = toChart(e.clientX, e.clientY, e.currentTarget as Element);
    const dot = chart.dots.find((d) => Math.abs(d.x + 0.5 - p.x) < 0.6 && Math.abs(d.y + 0.5 - p.y) < 0.6);
    if (dot) {
      app.toggleDot(dot.id);
      return;
    }
    const hit = placementAt(p.x, p.y);
    if (hit && matchMedia('(pointer: fine)').matches) onselectrange(hit.src);
  }

  const wheel: Attachment<HTMLDivElement> = (el) => {
    const onwheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoom(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
      else {
        follow = false;
        vp = {
          ...vp,
          tx: vp.tx - (e.shiftKey ? e.deltaY : e.deltaX),
          ty: vp.ty - (e.shiftKey ? 0 : e.deltaY),
        };
      }
    };
    el.addEventListener('wheel', onwheel, { passive: false });
    return () => el.removeEventListener('wheel', onwheel);
  };

  const resize: Attachment<HTMLDivElement> = (el) => {
    const ro = new ResizeObserver(([entry]) => {
      w = entry!.contentRect.width;
      h = entry!.contentRect.height;
    });
    ro.observe(el);
    return () => ro.disconnect();
  };

  function onkeydown(e: KeyboardEvent) {
    const step = 40;
    const keys: Record<string, () => void> = {
      '+': () => zoom(1.25),
      '=': () => zoom(1.25),
      '-': () => zoom(0.8),
      '0': () => {
        follow = false;
        vp = zoomAt(vp, 12 / vp.scale, (w + RULER) / 2, (h + RULER) / 2);
      },
      f: fit,
      ArrowLeft: () => ((follow = false), (vp = { ...vp, tx: vp.tx + step })),
      ArrowRight: () => ((follow = false), (vp = { ...vp, tx: vp.tx - step })),
      ArrowUp: () => ((follow = false), (vp = { ...vp, ty: vp.ty + step })),
      ArrowDown: () => ((follow = false), (vp = { ...vp, ty: vp.ty - step })),
    };
    const run = keys[e.key];
    if (run && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      run();
    }
  }

  // Rulers: a label on each 10th line, or on each 50th / 100th line when the zoom is small.
  const rulerStep = $derived(vp.scale * 10 >= 26 ? 10 : vp.scale * 50 >= 26 ? 50 : 100);
  const xTicks = $derived.by(() => {
    const out: { v: number; px: number }[] = [];
    for (let v = 0; v <= chart.width; v += rulerStep) {
      const px = vp.tx + v * vp.scale;
      if (px >= RULER - 1 && px <= w + RULER) out.push({ v, px });
    }
    return out;
  });
  const yTicks = $derived.by(() => {
    const out: { v: number; px: number }[] = [];
    for (let v = 0; v <= chart.height; v += rulerStep) {
      const px = vp.ty + v * vp.scale;
      if (px >= RULER - 1 && px <= h + RULER) out.push({ v, px });
    }
    return out;
  });

  const totalStitches = $derived(chart.stats.total);
  const ariaLabel = $derived(
    chart.width ? `Chart, ${chart.width} by ${chart.height} cells, ${totalStitches} stitches` : 'Empty chart',
  );
</script>

<div class="preview {lod}" class:busy={loading} {@attach resize} {@attach wheel}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="canvas"
    role="img"
    aria-label={ariaLabel}
    tabindex="0"
    {onkeydown}
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointerleave={() => (hover = null)}
    onpointercancel={(e) => pointers.delete(e.pointerId)}
  >
    {#if chart.width}
      <svg width={w} height={h} class="chart">
        <g transform="translate({vp.tx} {vp.ty}) scale({vp.scale})">
          <rect x="0" y="0" width={chart.width} height={chart.height} fill="var(--fabric)" />
          <!-- eslint-disable-next-line svelte/no-at-html-tags -- the markup comes from our SVG back end, which escapes all text -->
          {@html markup}
          {#if caretPlacement}
            <rect
              class="caret-box"
              x={caretPlacement.x - 0.15}
              y={caretPlacement.y - 0.15}
              width={Math.max(1, caretPlacement.width) + 0.3}
              height={caretPlacement.height + 0.3}
              vector-effect="non-scaling-stroke"
            />
          {/if}
          {#if hover && hover !== caretPlacement}
            <rect
              class="hover-box"
              x={hover.x}
              y={hover.y}
              width={Math.max(1, hover.width)}
              height={hover.height}
              vector-effect="non-scaling-stroke"
            />
          {/if}
          {#each chart.placements.filter((p) => p.kind === 'missing') as p (p.token)}
            <rect
              class="missing-box"
              x={p.x}
              y={p.y + 1}
              width={p.width}
              height={p.height - 2}
              vector-effect="non-scaling-stroke"
            />
          {/each}
        </g>
        <!-- Centre arrows, at the edges of the chart. -->
        <g class="centre-marks">
          {#each [vp.ty - 2, vp.ty + chart.height * vp.scale + 2] as y, i (i)}
            <path d="M{vp.tx + chart.centre.x * vp.scale - 6} {y + (i ? 9 : -9)}h12l-6 {i ? -8 : 8}z" />
          {/each}
          {#each [vp.tx - 2, vp.tx + chart.width * vp.scale + 2] as x, i (i)}
            <path d="M{x + (i ? 9 : -9)} {vp.ty + chart.centre.y * vp.scale - 6}v12l{i ? -8 : 8} -6z" />
          {/each}
        </g>
      </svg>
      <div class="ruler top" aria-hidden="true">
        {#each xTicks as t (t.v)}<span style:left="{t.px}px">{t.v}</span>{/each}
      </div>
      <div class="ruler left" aria-hidden="true">
        {#each yTicks as t (t.v)}<span style:top="{t.px}px">{t.v}</span>{/each}
      </div>
    {:else}
      <div class="empty">
        {#if loading}
          <p>Loading the font…</p>
        {:else if app.fontStatus === 'error'}
          <p class="error">The font could not load: {app.fontError}</p>
        {:else}
          <p class="big">Start typing to make your chart</p>
          <p>The chart updates at each key. Use <kbd>⌘K</kbd> to insert hearts and special characters.</p>
        {/if}
      </div>
    {/if}
  </div>
  {#if chart.width}
    <div class="zoom" role="toolbar" aria-label="Zoom">
      <button class="btn icon" onclick={() => zoom(0.8)} aria-label="Zoom out" title="Zoom out (-)">−</button>
      <button class="btn pct" onclick={fit} title="Fit (F)"
        >{follow ? 'Fit' : `${Math.round((vp.scale / 12) * 100)}%`}</button
      >
      <button class="btn icon" onclick={() => zoom(1.25)} aria-label="Zoom in" title="Zoom in (+)">+</button>
    </div>
  {/if}
</div>

<style>
  .preview {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background:
      linear-gradient(var(--bg), var(--bg)) padding-box,
      var(--bg);
  }

  .preview.busy .chart {
    opacity: 0.55;
    transition: opacity 0.2s;
  }

  .canvas {
    position: absolute;
    inset: 0;
    touch-action: none;
    cursor: grab;
  }

  .canvas:active {
    cursor: grabbing;
  }

  .canvas:focus-visible {
    outline-offset: -3px;
  }

  .chart {
    display: block;
  }

  :global(.lod-mid [class^='symbol-']),
  :global(.lod-far [class^='symbol-']),
  :global(.lod-far .grid-minor) {
    display: none;
  }

  .caret-box {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
  }

  .hover-box {
    fill: rgb(163 51 95 / 6%);
    stroke: var(--accent);
    stroke-width: 1;
    stroke-dasharray: 4 3;
  }

  .missing-box {
    fill: var(--error-soft);
    stroke: var(--error);
    stroke-width: 1.5;
    stroke-dasharray: 3 3;
  }

  .centre-marks path {
    fill: var(--accent);
  }

  .ruler {
    position: absolute;
    pointer-events: none;
    font: 10px/1 var(--mono);
    color: var(--muted);
    background: color-mix(in srgb, var(--bg) 85%, transparent);
  }

  .ruler.top {
    top: 0;
    left: 0;
    right: 0;
    height: 20px;
  }

  .ruler.left {
    top: 0;
    left: 0;
    bottom: 0;
    width: 20px;
  }

  .ruler.top span {
    position: absolute;
    top: 5px;
    transform: translateX(-50%);
  }

  .ruler.left span {
    position: absolute;
    left: 2px;
    transform: translateY(-50%);
    width: 16px;
    text-align: center;
    font-size: 9px;
  }

  .empty {
    display: grid;
    place-content: center;
    height: 100%;
    text-align: center;
    color: var(--muted);
    padding: 24px;
  }

  .empty .big {
    font-size: 18px;
    color: var(--text);
    margin-bottom: 4px;
  }

  .empty .error {
    color: var(--error);
  }

  .zoom {
    position: absolute;
    right: 12px;
    bottom: 12px;
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: var(--radius);
    background: var(--panel);
    box-shadow: var(--shadow);
  }

  .zoom .pct {
    min-width: 58px;
    justify-content: center;
  }
</style>
