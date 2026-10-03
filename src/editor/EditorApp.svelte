<script lang="ts">
  import { onMount } from 'svelte';
  import { EditorState, type Tool } from './editor-state.svelte.ts';
  import GlyphCanvas from './GlyphCanvas.svelte';
  import ChartThumb from '../ui/ChartThumb.svelte';
  import { BUILTIN_FONTS } from '../lib/font/registry.ts';
  import { CHARACTER_GROUPS } from '../lib/font/charset.ts';
  import { clearGlyph, resizeGlyph, shiftGlyph } from '../lib/font/edit.ts';
  import { layout } from '../lib/layout/layout.ts';
  import { DEFAULT_LAYOUT } from '../lib/layout/types.ts';
  import { download } from '../lib/export/download.ts';
  import type { Rgb } from '../lib/scene/types.ts';

  const ed = new EditorState();
  onMount(() => {
    void ed.init();
    const flush = () => ed.flushSave();
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  });

  const colour = (t: number): Rgb => (t === 1 ? [224, 90, 122] : [56, 76, 94]);

  const TOOLS: { id: Tool; label: string; key: string; hint: string }[] = [
    { id: 'X', label: '✕ Stitch', key: 'b', hint: 'Full stitch, main thread (B)' },
    { id: 'O', label: '■ Accent', key: 'a', hint: 'Full stitch, accent thread (A)' },
    { id: '/', label: '╱ Half', key: 'h', hint: 'Half stitch / (H, again for \\)' },
    { id: 'N', label: '╲ Half', key: 'h', hint: 'Half stitch \\' },
    { id: 'o', label: '◌ Dot', key: 'd', hint: 'Connector dot: stitched only to join two letters (D)' },
    {
      id: 'line',
      label: '— Backstitch',
      key: 'l',
      hint: 'Drag from a corner to a corner. Shift: half cells (L)',
    },
    { id: 'knot', label: '● Knot', key: 'k', hint: 'French knot on a corner (K)' },
    { id: 'erase', label: '⌫ Erase', key: 'e', hint: 'Erase cells (E)' },
  ];

  const ORDER = [
    ...'abcdefghijklmnopqrstuvwxyz',
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    ...'0123456789',
    ...CHARACTER_GROUPS.flatMap((g) => [...g.chars]),
  ];
  const rank = (k: string) => {
    const i = ORDER.indexOf(k);
    return i >= 0 ? i : k.startsWith('space-') ? 10000 : 5000;
  };

  const keys = $derived(
    ed.file ? Object.keys(ed.file.glyphs).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)) : [],
  );
  const missingBasics = $derived(
    ed.file
      ? [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?'].filter(
          (c) => !ed.file!.glyphs[c],
        )
      : [],
  );

  let newKey = $state('');
  let fileInput: HTMLInputElement | undefined = $state();
  let duplicateId = $state('');

  const preview = $derived(
    ed.font
      ? layout(ed.sample, ed.font, { ...DEFAULT_LAYOUT, padding: 1, lineSpacing: 1 }, {}, ed.motifs)
      : null,
  );

  function glyphThumb(key: string) {
    if (!ed.font) return null;
    const g = ed.font.glyphs.get(key);
    if (!g || g.type === 'space') return null;
    return layout(
      g.type === 'motif' ? `:${key}:` : key,
      ed.font,
      { ...DEFAULT_LAYOUT, padding: 0, substitute: false },
      {},
      ed.motifs,
    );
  }

  function addGlyph() {
    const k = newKey.trim();
    if (!k) return;
    const motif =
      /^[a-z][a-z0-9-]*-\d+$/.test(k) ||
      (k.length > 2 && /^[a-z][a-z0-9-]+$/.test(k) && !['ij', 'IJ'].includes(k));
    const key = motif ? k : [...k][0]!;
    ed.addGlyph(key, motif ? 'motif' : k === 'ij' || k === 'IJ' ? 'ligature' : 'char');
    newKey = '';
  }

  function onkeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    )
      return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) ed.redo();
      else ed.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      ed.redo();
      return;
    }
    if (mod) return;
    if (e.key === '[' && ed.glyph) ed.edit((d) => resizeGlyph(d, d.width - 1));
    else if (e.key === ']' && ed.glyph) ed.edit((d) => resizeGlyph(d, d.width + 1));
    else if (e.key === 'h') ed.tool = ed.tool === '/' ? 'N' : '/';
    else {
      const t = TOOLS.find((x) => x.key === e.key && x.id !== 'N');
      if (t) ed.tool = t.id;
    }
  }

  function exportFont() {
    const out = ed.exportJson();
    if (out) download(out.text, out.name, 'application/json');
  }

  async function onfile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (f) await ed.importFile(f);
    (e.currentTarget as HTMLInputElement).value = '';
  }

  async function confirmDelete() {
    if (!ed.fontId) return;
    const name = ed.records.find((r) => r.id === ed.fontId)?.name ?? 'this font';
    if (confirm(`Delete “${name}”? This cannot be undone. Export it first if you want a backup.`))
      await ed.deleteCurrent();
  }

  const statusText = $derived(
    { idle: '', saving: 'Saving…', saved: 'Saved in this browser', error: 'Not saved' }[ed.status],
  );
</script>

<svelte:window {onkeydown} />

<div class="shell">
  <header class="topbar">
    <a class="back" href="./index.html" title="Back to the writer">← Stitch Writer</a>
    <h1>Font editor</h1>
    <select
      class="fontsel"
      value={ed.fontId ?? ''}
      onchange={(e) => ed.open(e.currentTarget.value)}
      aria-label="My fonts"
      disabled={!ed.records.length}
    >
      {#if !ed.records.length}<option value="">No font yet</option>{/if}
      {#each ed.records as r (r.id)}
        <option value={r.id}>{r.name}{r.type === 'ttf' ? ' (TTF)' : ''}</option>
      {/each}
    </select>
    <button class="btn" onclick={() => ed.newFont()}>New font</button>
    <select
      class="btn"
      value={duplicateId}
      onchange={(e) => {
        const v = e.currentTarget.value;
        duplicateId = '';
        if (v) void ed.duplicate(v);
      }}
      aria-label="Duplicate a built-in font"
    >
      <option value="">Duplicate…</option>
      {#each BUILTIN_FONTS as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
    </select>
    <button class="btn" onclick={() => fileInput?.click()}>Import…</button>
    <input bind:this={fileInput} type="file" accept=".json,.bdf,.ttf,.otf" hidden onchange={onfile} />
    <div class="spacer"></div>
    <span class="status" class:error={ed.status === 'error'}>{statusText}</span>
    <button class="btn" onclick={() => ed.undo()} disabled={!ed.canUndo} title="Undo (⌘Z)">↶</button>
    <button class="btn" onclick={() => ed.redo()} disabled={!ed.canRedo} title="Redo (⌘⇧Z)">↷</button>
    <button class="btn" onclick={exportFont} disabled={!ed.file}>Export .font.json</button>
    <button class="btn ghost" onclick={confirmDelete} disabled={!ed.fontId}>Delete</button>
  </header>

  {#if ed.message}
    <div class="message" role="status">
      <span>{ed.message}</span>
      <button class="btn ghost icon" aria-label="Close" onclick={() => (ed.message = null)}>×</button>
    </div>
  {/if}

  {#if !ed.records.length}
    <section class="empty">
      <h2>Make your own cross-stitch font</h2>
      <p>Start from a blank font, duplicate a built-in font, or import a font file:</p>
      <ul>
        <li><strong>.font.json</strong>: a Stitch Writer font (the export of this editor).</li>
        <li>
          <strong>.bdf</strong>: a bitmap font. Each pixel becomes a cross stitch. Many open and public-domain
          pixel fonts use this format.
        </li>
        <li>
          <strong>.ttf / .otf</strong>: a cross-stitch font whose stitches are on a grid (as the ACSF fonts).
          Its joins and ligatures are kept.
        </li>
      </ul>
      <p>The fonts stay in this browser. Export them to keep a backup.</p>
      <div class="actions">
        <button class="btn primary" onclick={() => ed.newFont()}>New font</button>
        <button class="btn" onclick={() => fileInput?.click()}>Import a file…</button>
      </div>
    </section>
  {:else if ed.ttf}
    <section class="empty">
      <h2>{ed.ttf.name}</h2>
      <p>
        This is a TTF font. The writer uses it with its joins and ligatures. You cannot change a TTF font
        here.
      </p>
      <p class="muted">{ed.ttf.licence}</p>
      <div class="actions">
        <button class="btn" onclick={() => ed.convertTtf()}>Make an editable copy (without the joins)</button>
      </div>
    </section>
  {:else if ed.file}
    <main class="layout">
      <aside class="glyphs">
        <form
          class="add"
          onsubmit={(e) => {
            e.preventDefault();
            addGlyph();
          }}
        >
          <input
            type="text"
            bind:value={newKey}
            placeholder="Add: a character or a motif name"
            aria-label="New glyph"
          />
          <button class="btn">Add</button>
        </form>
        <div class="grid">
          {#each keys as k (k)}
            {@const thumb = glyphThumb(k)}
            <button
              class="tile"
              class:selected={k === ed.glyphKey}
              onclick={() => (ed.glyphKey = k)}
              title={k}
            >
              <span class="thumb"
                >{#if thumb}<ChartThumb chart={thumb} {colour} height={28} maxWidth={44} />{/if}</span
              >
              <span class="key"
                >{k.startsWith('space-') ? `␣${k.slice(6)}` : k.length > 3 ? k.slice(0, 7) : k}</span
              >
            </button>
          {/each}
        </div>
        {#if missingBasics.length}
          <p class="label">Not in the font yet</p>
          <div class="missing">
            {#each missingBasics as c (c)}
              <button class="chip" onclick={() => ed.addGlyph(c)}>{c}</button>
            {/each}
          </div>
        {/if}
      </aside>

      <section class="center">
        <div class="toolbar" role="toolbar" aria-label="Tools">
          {#each TOOLS as t (t.id)}
            <button
              class="btn"
              class:active={ed.tool === t.id}
              onclick={() => (ed.tool = t.id)}
              title={t.hint}
              aria-pressed={ed.tool === t.id}>{t.label}</button
            >
          {/each}
        </div>
        {#if ed.glyph && ed.glyphKey}
          <div class="glyph-head">
            <strong class="glyph-name">“{ed.glyphKey}”</strong>
            <span class="label">{ed.glyph.type}</span>
            <label class="inline"
              >Width <button
                class="btn icon"
                onclick={() => ed.edit((d) => resizeGlyph(d, d.width - 1))}
                title="Narrower ([)">−</button
              ><span class="num">{ed.glyph.width}</span><button
                class="btn icon"
                onclick={() => ed.edit((d) => resizeGlyph(d, d.width + 1))}
                title="Wider (])">+</button
              ></label
            >
            <span class="inline"
              >Move
              <button
                class="btn icon"
                onclick={() => ed.edit((d) => shiftGlyph(d, -1, 0))}
                aria-label="Move left">←</button
              >
              <button
                class="btn icon"
                onclick={() => ed.edit((d) => shiftGlyph(d, 1, 0))}
                aria-label="Move right">→</button
              >
              <button
                class="btn icon"
                onclick={() => ed.edit((d) => shiftGlyph(d, 0, -1))}
                aria-label="Move up">↑</button
              >
              <button
                class="btn icon"
                onclick={() => ed.edit((d) => shiftGlyph(d, 0, 1))}
                aria-label="Move down">↓</button
              >
            </span>
            <label class="inline"
              >Neighbour <input type="text" maxlength="2" bind:value={ed.neighbours} class="tiny" /></label
            >
            <span class="spacer"></span>
            <button class="btn ghost" onclick={() => ed.edit(clearGlyph)}>Clear</button>
            <button class="btn ghost" onclick={() => ed.glyphKey && ed.removeGlyph(ed.glyphKey)}
              >Remove glyph</button
            >
          </div>
          {#if ed.glyph.type !== 'space'}
            <div class="canvas-wrap"><GlyphCanvas state={ed} file={ed.file} glyph={ed.glyph} /></div>
          {:else}
            <p class="muted">A space has no stitches: only its width counts.</p>
          {/if}
          <p class="legend muted">
            <span class="sw base"></span> baseline <span class="sw xh"></span> x-height
            <span class="sw adv"></span> advance box (the space for the letter). Grey cells: the neighbour letter,
            with the letter spacing.
          </p>
        {:else}
          <p class="muted">Select a glyph on the left, or add one.</p>
        {/if}
      </section>

      <aside class="props">
        <h2>Font</h2>
        <label class="field"
          ><span>Name</span><input type="text" bind:value={ed.file.name} oninput={() => ed.touch()} /></label
        >
        <div class="metrics">
          <label class="field"
            ><span>Rows above the baseline</span><input
              type="number"
              min="1"
              max="40"
              bind:value={ed.file.metrics.ascent}
              oninput={() => ed.touch()}
            /></label
          >
          <label class="field"
            ><span>Rows below</span><input
              type="number"
              min="0"
              max="20"
              bind:value={ed.file.metrics.descent}
              oninput={() => ed.touch()}
            /></label
          >
          <label class="field"
            ><span>x-height</span><input
              type="number"
              min="1"
              max="30"
              bind:value={ed.file.metrics.xHeight}
              oninput={() => ed.touch()}
            /></label
          >
          <label class="field"
            ><span>Letter spacing</span><input
              type="number"
              min="0"
              max="10"
              bind:value={ed.file.metrics.letterSpacing}
              oninput={() => ed.touch()}
            /></label
          >
        </div>
        <label class="check"
          ><input
            type="checkbox"
            checked={!!ed.file.script}
            onchange={(e) => {
              ed.file!.script = e.currentTarget.checked || undefined;
              ed.touch();
            }}
          /> Joined letters (connector dots)</label
        >
        <label class="field"
          ><span>Licence and author</span><textarea
            rows="3"
            bind:value={ed.file.source.licence}
            oninput={() => ed.touch()}></textarea></label
        >
        {#if ed.file.source.basedOn}<p class="muted">Based on {ed.file.source.basedOn}.</p>{/if}

        <h2>Preview</h2>
        <textarea rows="2" bind:value={ed.sample} aria-label="Preview text"></textarea>
        <div class="preview">
          {#if preview}<ChartThumb chart={preview} {colour} height={160} maxWidth={300} />{/if}
        </div>
        {#if preview?.issues.missing.length}
          <p class="bad">Missing: {[...new Set(preview.issues.missing.map((m) => m.text))].join(' ')}</p>
        {/if}
        <p class="muted">Open the writer and pick this font in “My fonts” to use it.</p>
      </aside>
    </main>
  {/if}
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .topbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--panel);
    border-bottom: 1px solid var(--line);
  }

  .back {
    color: var(--muted);
    text-decoration: none;
  }

  h1 {
    font-size: 16px;
    margin: 0 8px 0 0;
  }

  h2 {
    font-size: 14px;
    margin: 8px 0 0;
  }

  .fontsel {
    min-width: 180px;
  }

  .spacer {
    flex: 1;
  }

  .status {
    font-size: 12px;
    color: var(--muted);
  }

  .status.error,
  .bad {
    color: var(--error);
  }

  .message {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 12px;
    background: var(--warn-soft);
    border-bottom: 1px solid var(--line);
    white-space: pre-wrap;
  }

  .empty {
    max-width: 640px;
    margin: 40px auto;
    padding: 24px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .layout {
    flex: 1;
    display: grid;
    grid-template-columns: 260px 1fr 300px;
    min-height: 0;
  }

  .glyphs,
  .props {
    overflow: auto;
    padding: 12px;
    background: var(--panel);
    display: grid;
    align-content: start;
    gap: 10px;
  }

  .glyphs {
    border-right: 1px solid var(--line);
  }

  .props {
    border-left: 1px solid var(--line);
  }

  .add {
    display: flex;
    gap: 6px;
  }

  .add input {
    flex: 1;
    min-width: 0;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(54px, 1fr));
    gap: 4px;
  }

  .tile {
    display: grid;
    justify-items: center;
    gap: 2px;
    padding: 4px 2px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: #fff;
    color: #333;
    cursor: pointer;
  }

  .tile.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }

  .thumb {
    height: 30px;
    display: flex;
    align-items: center;
  }

  .key {
    font-size: 11px;
    font-family: var(--mono);
  }

  .missing {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .chip {
    border: 1px dashed var(--line-strong);
    background: none;
    border-radius: 4px;
    min-width: 24px;
    cursor: pointer;
  }

  .center {
    overflow: auto;
    padding: 12px 16px;
    display: grid;
    align-content: start;
    gap: 12px;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .toolbar .active {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }

  .glyph-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .glyph-name {
    font-size: 20px;
  }

  .inline {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .num {
    min-width: 22px;
    text-align: center;
    font-weight: 600;
  }

  .tiny {
    width: 40px;
  }

  .canvas-wrap {
    overflow: auto;
  }

  .legend {
    font-size: 12px;
  }

  .sw {
    display: inline-block;
    width: 16px;
    height: 0;
    border-top: 2px solid;
    vertical-align: middle;
    margin-left: 8px;
  }

  .sw.base {
    border-color: #c0392b;
  }

  .sw.xh {
    border-color: #2e86de;
    border-top-style: dashed;
  }

  .sw.adv {
    border-color: #a3335f;
    border-top-style: dashed;
  }

  .metrics {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .metrics input,
  .props textarea,
  .props input[type='text'] {
    width: 100%;
  }

  .props textarea {
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-sm);
    padding: 6px 8px;
    background: var(--panel);
    resize: vertical;
  }

  .check {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .preview {
    background: #fff;
    border-radius: var(--radius-sm);
    padding: 8px;
    min-height: 60px;
    overflow: auto;
  }

  .muted {
    color: var(--muted);
    margin: 0;
  }

  @media (max-width: 1000px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
</style>
