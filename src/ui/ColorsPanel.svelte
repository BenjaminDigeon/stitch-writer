<script lang="ts">
  import { getContext, tick } from 'svelte';
  import type { AppState } from '../lib/state/app.svelte.ts';
  import { MAX_COLORS, type ColorMode } from '../lib/layout/color.ts';
  import { COLOR_PRESETS, type ColorPreset } from '../lib/layout/palette.ts';
  import DmcCombobox from './DmcCombobox.svelte';
  import { toast } from './Toasts.svelte';

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

  let list: HTMLOListElement | undefined = $state();

  /** Asks first when the color is set by hand on parts of the text. */
  function remove(i: number) {
    const parts = app.partsWithColor(i);
    if (
      parts &&
      !confirm(
        `Color ${i + 1} (DMC ${app.doc.palette[i]}) is set by hand on ${parts} part${parts > 1 ? 's' : ''} of the text. ` +
          `If you remove it, ${parts > 1 ? 'these parts get' : 'this part gets'} the automatic colors again. Remove it?`,
      )
    )
      return;
    app.removeColor(i);
  }

  function usePreset(preset: ColorPreset) {
    const undo = app.applyPreset(preset);
    toast(`The text colors are now “${preset.name}”.`, 'info', { label: 'Undo', run: undo });
  }

  async function move(from: number, to: number) {
    if (to < 0 || to >= app.doc.palette.length) return;
    app.moveColor(from, to);
    await tick();
    list?.querySelectorAll<HTMLButtonElement>('.handle')[to]?.focus();
  }

  // Drag to reorder: the handle follows the pointer, and the other rows make space.
  let drag = $state<{
    from: number;
    to: number;
    dy: number;
    startY: number;
    mids: number[];
    step: number;
  } | null>(null);

  function onHandleDown(e: PointerEvent, i: number) {
    if (e.button !== 0 || !list) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rects = [...list.children].map((row) => row.getBoundingClientRect());
    const next = rects[i + 1] ?? rects[i - 1];
    const step = next ? Math.abs(next.top - rects[i]!.top) : rects[i]!.height;
    drag = { from: i, to: i, dy: 0, startY: e.clientY, mids: rects.map((r) => r.top + r.height / 2), step };
  }

  function onHandleMove(e: PointerEvent) {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    const y = drag.mids[drag.from]! + dy;
    // The new index is the number of other rows whose middle is above the pointer.
    const from = drag.from;
    const to = drag.mids.filter((mid, k) => k !== from && mid < y).length;
    drag = { ...drag, dy, to };
  }

  function onHandleUp() {
    if (drag && drag.to !== drag.from) app.moveColor(drag.from, drag.to);
    drag = null;
  }

  function rowShift(i: number): string | undefined {
    if (!drag) return undefined;
    const { from, to, dy, step } = drag;
    if (i === from) return `translateY(${dy}px)`;
    if (from < to && i > from && i <= to) return `translateY(${-step}px)`;
    if (to < from && i >= to && i < from) return `translateY(${step}px)`;
    return undefined;
  }

  function onHandleKey(e: KeyboardEvent, i: number) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      void move(i, i + (e.key === 'ArrowUp' ? -1 : 1));
    }
  }
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

    <ol class="palette" aria-label="Text colors" bind:this={list} class:dragging={!!drag}>
      {#each app.doc.palette as id, i (i)}
        <li style:transform={rowShift(i)} class:lifted={drag?.from === i}>
          <button
            type="button"
            class="handle"
            aria-label="Move color {i + 1}"
            title="Drag to move this color, or use the arrow keys"
            disabled={app.doc.palette.length <= 1}
            onpointerdown={(e) => onHandleDown(e, i)}
            onpointermove={onHandleMove}
            onpointerup={onHandleUp}
            onpointercancel={() => (drag = null)}
            onkeydown={(e) => onHandleKey(e, i)}><span aria-hidden="true">⠿</span></button
          >
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
            onclick={() => remove(i)}>×</button
          >
        </li>
      {/each}
    </ol>
    <div class="add-row">
      <button
        type="button"
        class="btn add"
        disabled={app.doc.palette.length >= MAX_COLORS}
        onclick={() => app.addColor()}>+ Add a color</button
      >
      <span class="presets"
        ><span class="label">Presets:</span>
        {#each COLOR_PRESETS as preset, k (preset.id)}{#if k}<span class="sep" aria-hidden="true">·</span
            >{/if}<button
            type="button"
            class="link"
            title={preset.colors.map((c) => `DMC ${c}`).join(', ')}
            onclick={() => usePreset(preset)}>{preset.name}</button
          >{/each}</span
      >
    </div>
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
    grid-template-columns: 18px 14px minmax(0, 1fr) auto 32px;
    align-items: center;
    gap: 6px;
    background: var(--panel);
    border-radius: var(--radius-sm);
  }

  .palette.dragging li {
    transition: transform 0.15s ease;
  }

  .palette.dragging li.lifted {
    position: relative;
    z-index: 2;
    transition: none;
    box-shadow: var(--shadow);
  }

  .handle {
    width: 18px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--muted);
    font-size: 14px;
    cursor: grab;
    touch-action: none;
  }

  .handle:disabled {
    visibility: hidden;
  }

  .palette.dragging .handle {
    cursor: grabbing;
  }

  .add-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
  }

  .presets {
    font-size: 12px;
  }

  .presets .label {
    margin-right: 4px;
  }

  .sep {
    margin: 0 5px;
    color: var(--muted);
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
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

  .hint {
    margin: -4px 0 0;
    font-size: 12px;
    color: var(--muted);
  }
</style>
