<script lang="ts">
  import { getContext } from 'svelte';
  import type { AppState } from '../lib/state/app.svelte.ts';
  import { FABRIC_PRESETS, formatSize } from '../lib/fabric/fabric.ts';

  const app = getContext<AppState>('app');
  const c = $derived(app.chart);
  const f = $derived(app.fabric);
  const fabricName = $derived(
    FABRIC_PRESETS.find(
      (p) => p.count === app.doc.fabric.count && p.overTwo === app.doc.fabric.overTwo,
    )?.label.replace(/ \(over two\)/, '') ?? `${app.doc.fabric.count} count`,
  );
  const fmt = (n: number) => n.toLocaleString('en');
</script>

<footer class="status" aria-live="polite">
  {#if c.width}
    <span><strong>{f.stitches.w} × {f.stitches.h}</strong> stitches</span>
    <span>{fmt(c.stats.total)} stitches to sew</span>
    <span><strong>{formatSize(f.designMm, app.doc.fabric.units)}</strong> on {fabricName}</span>
    <span>cut {formatSize(f.cutMm, app.doc.fabric.units)}</span>
  {:else}
    <span>No chart yet.</span>
  {/if}
</footer>

<style>
  .status {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 18px;
    padding: 6px 12px;
    border-top: 1px solid var(--line);
    background: var(--panel);
    color: var(--muted);
    font-size: 12px;
  }

  strong {
    color: var(--text);
  }
</style>
