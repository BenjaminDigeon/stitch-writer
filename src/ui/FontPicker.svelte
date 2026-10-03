<script lang="ts">
  import { getContext } from 'svelte';
  import type { AppState } from '../lib/state/app.svelte.ts';
  import type { Font } from '../lib/font/font.ts';
  import type { FontEntry } from '../lib/font/registry.ts';
  import { layout } from '../lib/layout/layout.ts';
  import { DEFAULT_LAYOUT } from '../lib/layout/types.ts';
  import ChartThumb from './ChartThumb.svelte';

  const app = getContext<AppState>('app');

  let open = $state(false);
  let root: HTMLDivElement | undefined = $state();
  let loaded = $state.raw<Map<string, Font | Error>>(new Map());

  const sample = $derived.by(() => {
    // Motifs look the same in every font: leave them out of the samples.
    const lines = app.doc.text.split('\n').map((l) => l.replace(/:[a-z][a-z0-9-]*:/g, '').trim());
    const first = lines.find((l) => l) ?? '';
    return first.length > 22 ? first.slice(0, 22).trimEnd() : first;
  });

  async function loadAll(entries: FontEntry[]) {
    const next = new Map(loaded);
    await Promise.all(
      entries.map(async (e) => {
        if (next.has(e.id)) return;
        try {
          next.set(e.id, await e.load());
        } catch (err) {
          next.set(e.id, err instanceof Error ? err : new Error(String(err)));
        }
        loaded = new Map(next);
      }),
    );
  }

  function toggle() {
    open = !open;
    if (open) void loadAll(app.allFonts);
  }

  function choose(id: string) {
    app.selectFont(id);
    open = false;
  }

  function onWindowClick(e: MouseEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      open = false;
      (root?.querySelector('.current') as HTMLElement | null)?.focus();
    }
  }

  const kindLabel = (f: Font) =>
    f.kind === 'cross' ? (f.script ? 'Script' : 'Cross') : f.kind === 'backstitch' ? 'Backstitch' : 'Mixed';

  function thumb(font: Font) {
    const text = sample || font.name.replace(/^ACSF /, '');
    return layout(
      text,
      font,
      { ...DEFAULT_LAYOUT, padding: 0, align: 'left', lineSpacing: 0 },
      {},
      app.motifs,
      // The sample is not at the offsets of the text, so the colors set by hand do not apply.
      { ...app.colors, ranges: [] },
    );
  }

  const groups = $derived([
    { name: 'Fonts', entries: app.allFonts.filter((f) => f.group === 'built-in') },
    { name: 'My fonts', entries: app.allFonts.filter((f) => f.group === 'custom') },
  ]);
</script>

<svelte:window onclick={onWindowClick} />

<div class="picker" bind:this={root} {onkeydown} role="presentation">
  <button class="btn current" onclick={toggle} aria-haspopup="listbox" aria-expanded={open}>
    <span class="label-sm">Font</span>
    <strong>{app.fontEntry?.name ?? app.doc.fontId}</strong>
    {#if app.fontStatus === 'loading'}<span class="spinner" aria-label="Loading"></span>{/if}
    <span aria-hidden="true">▾</span>
  </button>
  {#if open}
    <div class="menu" role="listbox" aria-label="Fonts">
      {#each groups as g (g.name)}
        {#if g.entries.length}
          <div class="group-name">{g.name}</div>
          {#each g.entries as e (e.id)}
            {@const f = loaded.get(e.id)}
            <button
              class="card"
              role="option"
              aria-selected={e.id === app.doc.fontId}
              onclick={() => choose(e.id)}
            >
              <div class="meta">
                <span class="name">{e.name}</span>
                {#if f && !(f instanceof Error)}
                  {@const c = thumb(f)}
                  <span class="badge">{kindLabel(f)}</span>
                  <span class="rows">{f.metrics.ascent + f.metrics.descent} rows</span>
                  {#if c.issues.missing.length}<span class="badge warn"
                      >{c.issues.missing.length} missing</span
                    >{/if}
                {/if}
              </div>
              <div class="thumb">
                {#if !f}
                  <div class="skeleton"></div>
                {:else if f instanceof Error}
                  <span class="error">Could not load: {f.message}</span>
                {:else}
                  <ChartThumb chart={thumb(f)} color={app.threadColor} height={36} maxWidth={300} />
                {/if}
              </div>
            </button>
          {/each}
        {/if}
      {/each}
      <p class="credit">
        The ACSF fonts are by P. Baudin, under the SIL Open Font License 1.1 (<a
          href="https://github.com/pbaudin/ACSF"
          target="_blank"
          rel="noreferrer">github.com/pbaudin/ACSF</a
        >).
      </p>
    </div>
  {/if}
</div>

<style>
  .picker {
    position: relative;
  }

  .current {
    gap: 8px;
  }

  @media (max-width: 480px) {
    .label-sm {
      display: none;
    }
  }

  .label-sm {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .menu {
    position: absolute;
    z-index: 20;
    top: calc(100% + 6px);
    left: 0;
    width: min(380px, calc(100vw - 24px));
    max-height: min(70vh, 640px);
    overflow: auto;
    padding: 6px;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  .group-name {
    font-size: 11px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 6px 8px 4px;
  }

  .card {
    display: grid;
    gap: 6px;
    width: 100%;
    padding: 8px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: none;
    text-align: left;
    cursor: pointer;
  }

  .card:hover {
    background: var(--panel-2);
  }

  .card[aria-selected='true'] {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .meta {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .name {
    font-weight: 600;
    margin-right: auto;
  }

  .badge {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--panel-2);
    color: var(--muted);
  }

  .badge.warn {
    background: var(--warn-soft);
    color: var(--warn);
  }

  .rows {
    font-size: 11px;
    color: var(--muted);
  }

  .thumb {
    min-height: 40px;
    display: flex;
    align-items: center;
    padding: 4px 6px;
    background: #fff;
    border-radius: 4px;
    overflow: hidden;
  }

  .skeleton {
    width: 70%;
    height: 24px;
    border-radius: 4px;
    background: linear-gradient(90deg, #eee, #f7f7f7, #eee);
    background-size: 200% 100%;
    animation: shimmer 1.2s infinite;
  }

  @keyframes shimmer {
    to {
      background-position: -200% 0;
    }
  }

  .error {
    color: var(--error);
    font-size: 12px;
  }

  .credit {
    margin: 6px 8px 4px;
    font-size: 11px;
    color: var(--muted);
  }

  .credit a {
    color: inherit;
  }

  .spinner {
    width: 12px;
    height: 12px;
    border: 2px solid var(--line-strong);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
