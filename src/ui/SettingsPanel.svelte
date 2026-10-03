<script lang="ts">
  import { getContext } from 'svelte';
  import type { AppState } from '../lib/state/app.svelte.ts';
  import { FABRIC_PRESETS, formatSize } from '../lib/fabric/fabric.ts';
  import DmcCombobox from './DmcCombobox.svelte';

  const app = getContext<AppState>('app');
  const L = $derived(app.doc.layout);

  const hasAccent = $derived(
    app.chart.stats.threads[1] !== undefined || /:[a-z][a-z0-9-]*:/.test(app.doc.text),
  );
  const hasDots = $derived(app.chart.dots.length > 0);
  const letterDefault = $derived(app.font?.metrics.letterSpacing ?? 1);

  const presetId = $derived(
    FABRIC_PRESETS.find((p) => p.count === app.doc.fabric.count && p.overTwo === app.doc.fabric.overTwo)
      ?.id ?? 'custom',
  );

  function setPreset(id: string) {
    const p = FABRIC_PRESETS.find((x) => x.id === id);
    if (p) {
      app.doc.fabric.count = p.count;
      app.doc.fabric.overTwo = p.overTwo;
    }
  }

  const marginShown = $derived(
    app.doc.fabric.units === 'cm' ? app.doc.fabric.marginMm / 10 : app.doc.fabric.marginMm / 25.4,
  );
  function setMargin(v: number) {
    if (!Number.isFinite(v) || v < 0) return;
    app.doc.fabric.marginMm = app.doc.fabric.units === 'cm' ? v * 10 : v * 25.4;
  }

  const clampInt = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(v)));
</script>

<details class="section" open>
  <summary>Layout</summary>
  <div class="rows">
    <fieldset class="row">
      <legend class="label">Alignment</legend>
      <div class="segmented">
        {#each [['left', '⇤', 'Left'], ['centre', '↔', 'Centre'], ['right', '⇥', 'Right']] as const as [v, icon, name] (v)}
          <label title="{name} (⌘⇧{name[0]})">
            <input
              type="radio"
              name="align"
              value={v}
              checked={L.align === v}
              onchange={() => (app.doc.layout.align = v)}
            />
            <span>{icon}<span class="visually-hidden">{name}</span></span>
          </label>
        {/each}
      </div>
    </fieldset>
    <fieldset class="row">
      <legend class="label">Word space</legend>
      <div class="segmented">
        {#each [1, 2, 3, 4] as const as n (n)}
          <label>
            <input
              type="radio"
              name="wordspace"
              value={n}
              checked={L.wordSpace === n}
              onchange={() => (app.doc.layout.wordSpace = n)}
            />
            <span>{n}</span>
          </label>
        {/each}
      </div>
    </fieldset>
    <div class="row three">
      <label class="field">
        <span>Letters</span>
        <input
          type="number"
          min="0"
          max="10"
          value={L.letterSpacing ?? letterDefault}
          onchange={(e) => {
            const v = clampInt(e.currentTarget.valueAsNumber, 0, 10);
            app.doc.layout.letterSpacing = v === letterDefault ? null : v;
          }}
        />
      </label>
      <label class="field">
        <span>Line gap</span>
        <input
          type="number"
          min="0"
          max="20"
          value={L.lineSpacing}
          onchange={(e) => (app.doc.layout.lineSpacing = clampInt(e.currentTarget.valueAsNumber, 0, 20))}
        />
      </label>
      <label class="field">
        <span>Margin</span>
        <input
          type="number"
          min="0"
          max="50"
          value={L.padding}
          onchange={(e) => (app.doc.layout.padding = clampInt(e.currentTarget.valueAsNumber, 0, 50))}
        />
      </label>
    </div>
    <label class="check">
      <input
        type="checkbox"
        checked={L.substitute}
        onchange={(e) => (app.doc.layout.substitute = e.currentTarget.checked)}
      />
      Replace missing characters (é → e, ’ → ')
    </label>
    {#if app.font?.ligatures.length}
      <label class="check">
        <input
          type="checkbox"
          checked={L.ligatures}
          onchange={(e) => (app.doc.layout.ligatures = e.currentTarget.checked)}
        />
        Use the ligatures ({app.font.ligatures.join(', ')})
      </label>
    {/if}
    {#if hasDots}
      <label class="field">
        <span>Connector dots</span>
        <select
          value={L.dots}
          onchange={(e) => (app.doc.layout.dots = e.currentTarget.value as 'auto' | 'all' | 'none')}
        >
          <option value="auto">Automatic (click a dot in the chart to change it)</option>
          <option value="all">All</option>
          <option value="none">None</option>
        </select>
      </label>
    {/if}
  </div>
</details>

<details class="section" open>
  <summary>Threads</summary>
  <div class="rows">
    <DmcCombobox label="Text" value={app.doc.threads[0] ?? ''} onchange={(id) => (app.doc.threads[0] = id)} />
    {#if hasAccent}
      <DmcCombobox
        label="Accent (motifs)"
        value={app.doc.threads[1] ?? ''}
        onchange={(id) => (app.doc.threads[1] = id)}
      />
    {/if}
    <fieldset class="row">
      <legend class="label">Show</legend>
      <div class="segmented">
        {#each [['colour', 'Colour'], ['symbol', 'Symbols'], ['both', 'Both']] as const as [v, name] (v)}
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

<details class="section">
  <summary>Fabric</summary>
  <div class="rows">
    <label class="field">
      <span>Fabric</span>
      <select value={presetId} onchange={(e) => setPreset(e.currentTarget.value)}>
        {#each FABRIC_PRESETS as p (p.id)}
          <option value={p.id}>{p.label}</option>
        {/each}
        {#if presetId === 'custom'}<option value="custom">Custom ({app.doc.fabric.count} count)</option>{/if}
      </select>
    </label>
    <div class="row three">
      <label class="field">
        <span>Count</span>
        <input
          type="number"
          min="6"
          max="60"
          value={app.doc.fabric.count}
          onchange={(e) =>
            (app.doc.fabric.count = Math.max(6, Math.min(60, e.currentTarget.valueAsNumber || 14)))}
        />
      </label>
      <label class="field">
        <span>Margin ({app.doc.fabric.units})</span>
        <input
          type="number"
          min="0"
          step="0.5"
          value={Math.round(marginShown * 10) / 10}
          onchange={(e) => setMargin(e.currentTarget.valueAsNumber)}
        />
      </label>
      <fieldset class="field">
        <legend class="label">Units</legend>
        <div class="segmented">
          {#each ['cm', 'in'] as const as u (u)}
            <label>
              <input
                type="radio"
                name="units"
                value={u}
                checked={app.doc.fabric.units === u}
                onchange={() => (app.doc.fabric.units = u)}
              />
              <span>{u}</span>
            </label>
          {/each}
        </div>
      </fieldset>
    </div>
    <label class="check">
      <input
        type="checkbox"
        checked={app.doc.fabric.overTwo}
        onchange={(e) => (app.doc.fabric.overTwo = e.currentTarget.checked)}
      />
      Stitch over two threads (evenweave, linen)
    </label>
    {#if app.chart.width}
      <dl class="sizes">
        <dt>Design</dt>
        <dd>{formatSize(app.fabric.designMm, app.doc.fabric.units)}</dd>
        <dt>Cut the fabric</dt>
        <dd>{formatSize(app.fabric.cutMm, app.doc.fabric.units)}</dd>
      </dl>
    {/if}
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

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border: 0;
    margin: 0;
    padding: 0;
  }

  .row.three {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    align-items: end;
  }

  fieldset.field {
    border: 0;
    margin: 0;
    padding: 0;
  }

  .row.three input[type='number'] {
    width: 100%;
  }

  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 13px;
  }

  .sizes {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 12px;
    margin: 0;
    font-size: 13px;
  }

  .sizes dt {
    color: var(--muted);
  }

  .sizes dd {
    margin: 0;
    font-weight: 600;
  }
</style>
