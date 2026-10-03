<script lang="ts">
  import { getContext } from 'svelte';
  import type { AppState } from '../lib/state/app.svelte.ts';
  import { CHARACTER_GROUPS, fontHas } from '../lib/font/charset.ts';
  import { layout } from '../lib/layout/layout.ts';
  import { DEFAULT_LAYOUT } from '../lib/layout/types.ts';
  import ChartThumb from './ChartThumb.svelte';

  let { oninsert, onclose }: { oninsert: (text: string) => void; onclose: () => void } = $props();
  const app = getContext<AppState>('app');

  let tab = $state<'motifs' | 'chars'>('motifs');

  const motifs = $derived.by(() => {
    const font = app.font;
    if (!font) return [];
    const names = [...new Set([...font.motifs, ...app.motifs.keys()])];
    return names.map((name) => {
      const glyph = font.glyphs.get(name) ?? app.motifs.get(name);
      return {
        name,
        label: glyph?.label ?? name,
        chart: layout(`:${name}:`, font, { ...DEFAULT_LAYOUT, padding: 0 }, {}, app.motifs),
      };
    });
  });

  const groups = $derived(
    app.font
      ? CHARACTER_GROUPS.map((g) => ({
          name: g.name,
          chars: [...g.chars].filter((c) => fontHas(app.font!, c)),
        })).filter((g) => g.chars.length)
      : [],
  );

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="palette" role="region" aria-label="Insert" {onkeydown}>
  <div class="tabs" role="tablist">
    <button role="tab" aria-selected={tab === 'motifs'} onclick={() => (tab = 'motifs')}>Motifs</button>
    <button role="tab" aria-selected={tab === 'chars'} onclick={() => (tab = 'chars')}>Characters</button>
    <span class="spacer"></span>
    <button class="btn ghost icon" aria-label="Close" onclick={onclose}>×</button>
  </div>
  {#if tab === 'motifs'}
    <div class="grid">
      {#each motifs as m (m.name)}
        <button class="motif" title="{m.label} (:{m.name}:)" onclick={() => oninsert(`:${m.name}:`)}>
          <ChartThumb chart={m.chart} color={app.threadColor} height={34} maxWidth={60} />
          <span>{m.label}</span>
        </button>
      {:else}
        <p class="empty">No motifs.</p>
      {/each}
    </div>
    <p class="hint">Or type <code>:</code> and the start of a name, for example <code>:heart</code>.</p>
  {:else}
    {#each groups as g (g.name)}
      <div class="group">
        <span class="label">{g.name}</span>
        <div class="chars">
          {#each g.chars as c (c)}
            <button class="char" onclick={() => oninsert(c)} aria-label="Insert {c}">{c}</button>
          {/each}
        </div>
      </div>
    {:else}
      <p class="empty">This font has no extra characters.</p>
    {/each}
  {/if}
</div>

<style>
  .palette {
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--panel);
    box-shadow: var(--shadow);
    padding: 8px;
    display: grid;
    gap: 8px;
  }

  .tabs {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .tabs [role='tab'] {
    border: 0;
    background: none;
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--muted);
    font-weight: 600;
  }

  .tabs [role='tab'][aria-selected='true'] {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .spacer {
    flex: 1;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
    gap: 6px;
  }

  .motif {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 4px;
    min-height: 70px;
    padding: 6px;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: #fff;
    color: #555;
    font-size: 11px;
    cursor: pointer;
  }

  .motif:hover {
    border-color: var(--accent);
  }

  .group {
    display: grid;
    gap: 4px;
  }

  .chars {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .char {
    width: 30px;
    height: 30px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--panel);
    font-size: 15px;
    cursor: pointer;
  }

  .char:hover {
    border-color: var(--accent);
  }

  .hint,
  .empty {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }
</style>
