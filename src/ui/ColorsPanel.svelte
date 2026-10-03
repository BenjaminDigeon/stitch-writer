<script lang="ts">
  import { getContext } from 'svelte';
  import type { AppState } from '../lib/state/app.svelte.ts';
  import { MAX_COLORS, type ColorMode } from '../lib/layout/color.ts';
  import DmcCombobox from './DmcCombobox.svelte';

  const app = getContext<AppState>('app');

  const MODES: [ColorMode, string][] = [
    ['single', 'One color'],
    ['letter', 'Each letter'],
    ['word', 'Each word'],
    ['line', 'Each line'],
  ];

  const hasMotif = $derived(
    /:[a-z][a-z0-9-]*:/.test(app.doc.text) ||
      (app.chart.stats.threads[app.plan.accentThread] !== undefined &&
        !app.plan.textThreads.includes(app.plan.accentThread)),
  );
  const fmt = (n: number) => n.toLocaleString('en');
</script>

<details class="section" open>
  <summary>Colors</summary>
  <div class="rows">
    <fieldset class="mode">
      <legend class="label">Color the text</legend>
      <div class="segmented">
        {#each MODES as [v, name] (v)}
          <label>
            <input
              type="radio"
              name="color-mode"
              value={v}
              checked={app.doc.coloring.mode === v}
              onchange={() => app.setColorMode(v)}
            />
            <span>{name}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <ol class="palette" aria-label="Text colors">
      {#each app.doc.palette as id, i (i)}
        <li>
          <span class="num" aria-hidden="true">{i + 1}</span>
          <DmcCombobox label="Color {i + 1}" hideLabel value={id} onchange={(v) => app.setColor(i, v)} />
          <span class="count" title="{fmt(app.colorStitches[i] ?? 0)} stitches in this color"
            >{fmt(app.colorStitches[i] ?? 0)}</span
          >
          <button
            type="button"
            class="btn ghost icon"
            aria-label="Remove color {i + 1}"
            title="Remove this color"
            disabled={app.doc.palette.length <= 1}
            onclick={() => app.removeColor(i)}>×</button
          >
        </li>
      {/each}
    </ol>
    <button
      type="button"
      class="btn add"
      disabled={app.doc.palette.length >= MAX_COLORS}
      onclick={() => app.addColor()}>+ Add a color</button
    >
    <p class="hint">
      To color a part by hand, select it in the text box, or click its letters in the chart (Shift + click
      adds letters).
    </p>

    {#if hasMotif}
      <DmcCombobox label="Motif fill" value={app.doc.accent} onchange={(v) => (app.doc.accent = v)} />
    {/if}

    <fieldset class="mode">
      <legend class="label">Show</legend>
      <div class="segmented">
        {#each [['color', 'Color'], ['symbol', 'Symbols'], ['both', 'Both']] as const as [v, name] (v)}
          <label>
            <input
              type="radio"
              name="display"
              value={v}
              checked={app.doc.display === v}
              onchange={() => (app.doc.display = v)}
            />
            <span>{name}</span>
          </label>
        {/each}
      </div>
    </fieldset>
  </div>
</details>

<style>
  .section {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
  }

  summary {
    cursor: pointer;
    padding: 10px 12px;
    font-weight: 600;
    list-style-position: inside;
  }

  .rows {
    display: grid;
    gap: 12px;
    padding: 0 12px 12px;
  }

  .mode {
    display: grid;
    gap: 4px;
    min-width: 0;
    border: 0;
    margin: 0;
    padding: 0;
  }

  .mode .segmented {
    display: flex;
  }

  .mode .segmented label {
    flex: 1 1 0;
    min-width: 0;
  }

  .mode .segmented label :global(span) {
    width: 100%;
    padding: 0 4px;
    font-size: 12.5px;
    white-space: nowrap;
  }

  .palette {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .palette li {
    display: grid;
    grid-template-columns: 14px minmax(0, 1fr) auto 32px;
    align-items: center;
    gap: 6px;
  }

  .num {
    font-size: 12px;
    color: var(--muted);
    text-align: right;
  }

  .count {
    min-width: 32px;
    font-size: 12px;
    color: var(--muted);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .add {
    justify-self: start;
  }

  .hint {
    margin: -4px 0 0;
    font-size: 12px;
    color: var(--muted);
  }
</style>
