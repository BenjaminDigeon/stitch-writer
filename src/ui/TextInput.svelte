<script lang="ts">
  import { getContext, tick } from 'svelte';
  import type { AppState } from '../lib/state/app.svelte.ts';
  import { MAX_TEXT } from '../lib/state/doc.ts';
  import type { Span } from '../lib/layout/types.ts';
  import { MAX_COLORS, rangeAt, type ColorRange } from '../lib/layout/color.ts';
  import { contrastOn, hexToRgb, type Rgb } from '../lib/scene/types.ts';
  import { autocompleteQuery, motifSpans, tokenAround, tokenAt } from '../lib/text/editing.ts';
  import InsertPalette from './InsertPalette.svelte';

  const app = getContext<AppState>('app');

  let textarea: HTMLTextAreaElement | undefined = $state();
  let mirror: HTMLDivElement | undefined = $state();
  let paletteOpen = $state(false);
  let ac = $state<{ start: number; query: string } | null>(null);
  let acIndex = $state(0);
  let sel = $state<Span>({ start: 0, end: 0 });
  let focused = $state(false);

  const motifNames = $derived([...new Set([...(app.font?.motifs ?? []), ...app.motifs.keys()])]);
  const isMotif = (n: string) => motifNames.includes(n);
  const spans = $derived(motifSpans(app.doc.text, isMotif));
  const acMatches = $derived(ac ? motifNames.filter((n) => n.startsWith(ac!.query)).slice(0, 8) : []);

  interface Segment {
    text: string;
    cls?: string;
    title?: string;
    /** The color of the underline: the text color of these characters. */
    color?: string;
  }

  const rgbCss = ([r, g, b]: Rgb) => `rgb(${r} ${g} ${b})`;
  const colorHex = (i: number) => app.threads[app.plan.textThreads[i] ?? 0]?.hex ?? '#888888';

  /**
   * The text color of each character, or null when the text uses only one color. A character without
   * stitches (a space) has -1.
   */
  const charColors = $derived.by((): Int16Array | null => {
    const text = app.doc.text;
    const out = new Int16Array(text.length).fill(-1);
    for (const p of app.chart.placements)
      if (p.color >= 0) out.fill(p.color, p.src.start, Math.min(p.src.end, text.length));
    const used = new Set(out);
    used.delete(-1);
    return used.size > 1 ? out : null;
  });

  /** Text pieces for the mirror: plain, missing, replaced and motif ranges, with their colors. */
  const segments = $derived.by((): Segment[] => {
    const text = app.doc.text;
    const marks: { span: Span; cls: string; title?: string }[] = [
      ...app.chart.issues.missing.map((m) => ({
        span: m.src,
        cls: 'missing',
        title: `Not in ${app.font?.name ?? 'this font'}`,
      })),
      ...app.chart.issues.substituted.map((s) => ({
        span: s.src,
        cls: 'subst',
        title: `Stitched as “${s.to}”`,
      })),
      ...spans.map((s) => ({ span: s, cls: 'motif' })),
    ].sort((a, b) => a.span.start - b.span.start);
    // The mark of each character: the first mark that covers it.
    const markAt = new Int16Array(text.length).fill(-1);
    marks.forEach((m, i) => {
      for (let k = m.span.start; k < Math.min(m.span.end, text.length); k++)
        if (markAt[k] === -1) markAt[k] = i;
    });
    const colors = charColors;
    const colorAt = (k: number) => (colors ? colors[k]! : -1);
    const out: Segment[] = [];
    let i = 0;
    while (i < text.length) {
      const m = markAt[i]!;
      const c = colorAt(i);
      let j = i + 1;
      while (j < text.length && markAt[j] === m && colorAt(j) === c) j++;
      const mark = marks[m];
      out.push({
        text: text.slice(i, j),
        cls: mark?.cls,
        title: mark?.title,
        color: c >= 0 ? colorHex(c) : undefined,
      });
      i = j;
    }
    return out;
  });

  // Colors set by hand: the color bar opens when text is selected.
  const barOpen = $derived(focused && sel.end > sel.start);
  const selText = $derived(app.doc.text.slice(sel.start, sel.end).replace(/\s+/g, ' ').trim());
  /** The color set by hand on all the selection: an index, null for none, or undefined when mixed. */
  const selColor = $derived.by((): number | null | undefined => {
    const ranges = app.doc.colorRanges;
    const first = rangeAt(ranges, sel.start);
    if (first) return first.end >= sel.end ? first.color : undefined;
    return ranges.some((r) => r.start < sel.end && r.end > sel.start) ? undefined : null;
  });
  const mac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad)/.test(navigator.platform);
  const colorKeys = mac ? '⌘⌥' : 'Ctrl+Alt+';

  // Undo for the color changes. A step is valid only while the text is the same as when it was made,
  // so ⌘Z undoes the color changes and the text changes in the order that they happened.
  interface ColorStep {
    text: string;
    ranges: ColorRange[];
  }
  let undoSteps: ColorStep[] = [];
  let redoSteps: ColorStep[] = [];

  function paint(color: number | null) {
    const span = currentSelection();
    if (span.end <= span.start) return;
    undoSteps.push({ text: app.doc.text, ranges: $state.snapshot(app.doc.colorRanges) });
    if (undoSteps.length > 100) undoSteps.shift();
    redoSteps = [];
    app.paintText(span, color);
  }

  function addAndPaint() {
    const i = app.addColor(false);
    if (i !== null) paint(i);
  }

  function stepColor(from: ColorStep[], to: ColorStep[]): boolean {
    const step = from[from.length - 1];
    if (!step || step.text !== app.doc.text) return false;
    from.pop();
    to.push({ text: app.doc.text, ranges: $state.snapshot(app.doc.colorRanges) });
    app.doc.colorRanges = step.ranges;
    return true;
  }

  function currentSelection(): Span {
    return textarea ? { start: textarea.selectionStart, end: textarea.selectionEnd } : sel;
  }

  $effect(() => {
    const onchange = () => {
      if (document.activeElement === textarea) updateCaret();
    };
    document.addEventListener('selectionchange', onchange);
    return () => document.removeEventListener('selectionchange', onchange);
  });

  const missingCount = $derived(app.chart.issues.missing.length);
  const substCount = $derived(app.chart.issues.substituted.length);

  function syncScroll() {
    if (mirror && textarea) {
      mirror.scrollTop = textarea.scrollTop;
      mirror.scrollLeft = textarea.scrollLeft;
    }
  }

  function updateCaret() {
    if (!textarea) return;
    sel = { start: textarea.selectionStart, end: textarea.selectionEnd };
    app.caret = document.activeElement === textarea ? textarea.selectionStart : null;
    ac =
      textarea.selectionStart === textarea.selectionEnd
        ? autocompleteQuery(app.doc.text, textarea.selectionStart)
        : null;
    acIndex = 0;
  }

  function oninput(e: Event) {
    const ta = e.currentTarget as HTMLTextAreaElement;
    app.setText(ta.value, ta.selectionEnd);
    redoSteps = [];
    updateCaret();
  }

  /** Inserts text at the selection, with the native undo history when the browser supports it. */
  export async function insert(text: string, replace?: Span) {
    if (!textarea) return;
    textarea.focus();
    if (replace) textarea.setSelectionRange(replace.start, replace.end);
    const ok = document.execCommand?.('insertText', false, text);
    if (!ok) {
      const { selectionStart: s, selectionEnd: e } = textarea;
      textarea.setRangeText(text, s, e, 'end');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await tick();
    updateCaret();
  }

  /** Selects a part of the text. With `extend`, the selection grows to include it. */
  export function select(span: Span, extend = false) {
    if (!textarea) return;
    const start = extend ? Math.min(textarea.selectionStart, span.start) : span.start;
    const end = extend ? Math.max(textarea.selectionEnd, span.end) : span.end;
    textarea.focus();
    textarea.setSelectionRange(start, end);
    updateCaret();
  }

  export function openPalette() {
    paletteOpen = true;
  }

  function deleteRange(span: Span) {
    textarea!.setSelectionRange(span.start, span.end);
    const ok = document.execCommand?.('delete', false);
    if (!ok) {
      textarea!.setRangeText('', span.start, span.end, 'end');
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function chooseMotif(name: string) {
    if (!ac || !textarea) return;
    void insert(`:${name}:`, { start: ac.start, end: textarea.selectionStart });
    ac = null;
  }

  function onkeydown(e: KeyboardEvent) {
    const ta = textarea!;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.altKey && /^(Digit|Numpad)[0-9]$/.test(e.code)) {
      const n = Number(e.code.slice(-1));
      if (ta.selectionEnd > ta.selectionStart && n <= app.doc.palette.length) {
        e.preventDefault();
        paint(n === 0 ? null : n - 1);
      }
      return;
    }
    if (mod && !e.altKey && e.key.toLowerCase() === 'z') {
      if (e.shiftKey ? stepColor(redoSteps, undoSteps) : stepColor(undoSteps, redoSteps)) e.preventDefault();
      return;
    }
    if (ac && acMatches.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        acIndex = (acIndex + (e.key === 'ArrowDown' ? 1 : acMatches.length - 1)) % acMatches.length;
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        chooseMotif(acMatches[acIndex]!);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        ac = null;
        return;
      }
    }
    if (ta.selectionStart !== ta.selectionEnd || e.altKey || e.metaKey || e.ctrlKey) return;
    const caret = ta.selectionStart;
    if (e.key === 'Backspace') {
      const t = tokenAt(spans, caret, 'before') ?? tokenAround(spans, caret);
      if (t) {
        e.preventDefault();
        deleteRange(t);
      }
    } else if (e.key === 'Delete') {
      const t = tokenAt(spans, caret, 'after') ?? tokenAround(spans, caret);
      if (t) {
        e.preventDefault();
        deleteRange(t);
      }
    } else if (e.key === 'ArrowLeft' && !e.shiftKey) {
      const t = tokenAt(spans, caret, 'before') ?? tokenAround(spans, caret);
      if (t) {
        e.preventDefault();
        ta.setSelectionRange(t.start, t.start);
        updateCaret();
      }
    } else if (e.key === 'ArrowRight' && !e.shiftKey) {
      const t = tokenAt(spans, caret, 'after') ?? tokenAround(spans, caret);
      if (t) {
        e.preventDefault();
        ta.setSelectionRange(t.end, t.end);
        updateCaret();
      }
    }
  }

  const examples = ['Home sweet home', 'Happy birthday :heart-01:', 'Bonne fête Maman', 'Carpe diem'];
</script>

<div
  class="text-block"
  onfocusin={() => (focused = true)}
  onfocusout={(e) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) focused = false;
  }}
>
  <div class="head">
    <label for="stitch-text" class={barOpen ? 'visually-hidden' : 'label'}>Text to stitch</label>
    {#if barOpen}
      <div class="color-bar" role="toolbar" aria-label="Color of the selected text">
        <span class="what" title={selText}>Color of “{selText}”</span>
        <div class="swatches">
          {#each app.doc.palette as id, i (i)}
            {@const hex = colorHex(i)}
            <button
              type="button"
              class="swatch"
              style:background={hex}
              style:color={rgbCss(contrastOn(hexToRgb(hex)))}
              aria-pressed={selColor === i}
              aria-label="Color {i + 1}, DMC {id}"
              title="Color {i + 1}: DMC {id}{i < 9 ? ` (${colorKeys}${i + 1})` : ''}"
              onmousedown={(e) => e.preventDefault()}
              onclick={() => paint(i)}>{i < 9 ? i + 1 : ''}</button
            >
          {/each}
          <button
            type="button"
            class="swatch add"
            aria-label="Add a color for the selected text"
            title="Add a color"
            disabled={app.doc.palette.length >= MAX_COLORS}
            onmousedown={(e) => e.preventDefault()}
            onclick={addAndPaint}>+</button
          >
        </div>
        <button
          type="button"
          class="auto"
          aria-pressed={selColor === null}
          title="Automatic color ({colorKeys}0)"
          onmousedown={(e) => e.preventDefault()}
          onclick={() => paint(null)}>Auto</button
        >
      </div>
    {:else}
      <span class="count" class:near={app.doc.text.length > MAX_TEXT * 0.9}
        >{app.doc.text.length} / {MAX_TEXT}</span
      >
    {/if}
  </div>
  <div class="input-wrap">
    <div class="mirror" bind:this={mirror} aria-hidden="true">
      {#each segments as seg, i (i)}{#if seg.cls || seg.color}<mark
            class={seg.cls}
            class:colored={!!seg.color}
            style:--underline={seg.color}>{seg.text}</mark
          >{:else}{seg.text}{/if}{/each}&#8203;
    </div>
    <textarea
      id="stitch-text"
      bind:this={textarea}
      value={app.doc.text}
      {oninput}
      {onkeydown}
      onkeyup={updateCaret}
      onclick={updateCaret}
      onfocus={updateCaret}
      onblur={() => {
        app.caret = null;
        setTimeout(() => (ac = null), 150);
      }}
      onselect={updateCaret}
      onscroll={syncScroll}
      maxlength={MAX_TEXT}
      rows="5"
      spellcheck="false"
      autocapitalize="sentences"
      placeholder="Type your text here…"
      aria-describedby="text-notice"></textarea>
    {#if ac && acMatches.length}
      <ul class="autocomplete" role="listbox" aria-label="Motifs">
        {#each acMatches as name, i (name)}
          <li role="option" aria-selected={i === acIndex}>
            <button type="button" onmousedown={(e) => e.preventDefault()} onclick={() => chooseMotif(name)}
              >:{name}:</button
            >
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  <div class="tools">
    <button
      class="btn"
      type="button"
      onclick={() => (paletteOpen = !paletteOpen)}
      aria-expanded={paletteOpen}
    >
      <span aria-hidden="true">♥</span> Insert <kbd>⌘K</kbd>
    </button>
    {#if !app.doc.text}
      <div class="examples">
        {#each examples as ex (ex)}
          <button class="chip" type="button" onclick={() => insert(ex)}>{ex}</button>
        {/each}
      </div>
    {/if}
  </div>
  {#if paletteOpen}
    <InsertPalette oninsert={(s) => insert(s)} onclose={() => (paletteOpen = false)} />
  {/if}
  <p id="text-notice" class="notice" aria-live="polite">
    {#if missingCount}
      <span class="bad"
        >{missingCount} character{missingCount > 1 ? 's are' : ' is'} not in {app.font?.name}:
        {[...new Set(app.chart.issues.missing.map((m) => m.text))].join(' ')}</span
      >
    {/if}
    {#if substCount}
      <span class="sub"
        >{[...new Set(app.chart.issues.substituted.map((s) => `${s.from} → ${s.to}`))]
          .slice(0, 6)
          .join(', ')}</span
      >
    {/if}
  </p>
</div>

<style>
  .text-block {
    display: grid;
    gap: 6px;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    min-height: 30px;
  }

  .color-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-width: 0;
  }

  .what {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }

  .swatches {
    display: flex;
    gap: 4px;
    min-width: 0;
    overflow-x: auto;
    flex: 0 1 auto;
  }

  .swatch {
    flex: none;
    width: 24px;
    height: 24px;
    border: 1px solid rgb(0 0 0 / 25%);
    border-radius: 5px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  .swatch[aria-pressed='true'] {
    outline: 2px solid var(--text);
    outline-offset: 1px;
  }

  .swatch.add {
    background: var(--panel);
    color: var(--text);
    border-style: dashed;
  }

  .auto {
    flex: none;
    height: 24px;
    padding: 0 8px;
    border: 1px solid var(--line-strong);
    border-radius: 5px;
    background: var(--panel);
    font-size: 12px;
    cursor: pointer;
  }

  .auto[aria-pressed='true'] {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }

  .count {
    font-size: 11px;
    color: var(--muted);
  }

  .count.near {
    color: var(--warn);
    font-weight: 600;
  }

  .input-wrap {
    position: relative;
  }

  .mirror,
  textarea {
    font: 16px/1.5 var(--font);
    padding: 10px 12px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-sm);
    white-space: pre-wrap;
    overflow-wrap: break-word;
    word-break: normal;
    tab-size: 4;
    letter-spacing: normal;
  }

  .mirror {
    position: absolute;
    inset: 0;
    overflow: hidden;
    color: transparent;
    border-color: transparent;
    pointer-events: none;
    background: var(--panel);
  }

  .mirror mark {
    color: transparent;
    background: none;
    border-radius: 3px;
  }

  .mirror mark.missing {
    text-decoration: underline wavy var(--error);
    text-decoration-thickness: 1.5px;
    text-underline-offset: 3px;
    background: var(--error-soft);
  }

  .mirror mark.subst {
    text-decoration: underline dotted var(--warn);
    text-decoration-thickness: 2px;
    text-underline-offset: 3px;
  }

  .mirror mark.colored {
    border-bottom: 3px solid var(--underline);
    border-radius: 0;
  }

  .mirror mark.motif {
    background: var(--accent-soft);
    box-shadow: 0 0 0 1px var(--accent-soft);
  }

  textarea {
    position: relative;
    display: block;
    width: 100%;
    min-height: 120px;
    resize: vertical;
    background: transparent;
    color: var(--text);
  }

  textarea:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .autocomplete {
    position: absolute;
    z-index: 5;
    left: 8px;
    top: 100%;
    margin: 4px 0 0;
    padding: 4px;
    list-style: none;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow);
  }

  .autocomplete button {
    width: 100%;
    text-align: left;
    border: 0;
    background: none;
    padding: 4px 8px;
    border-radius: 4px;
    font-family: var(--mono);
    cursor: pointer;
  }

  .autocomplete li[aria-selected='true'] button {
    background: var(--accent-soft);
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .examples {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    border: 1px dashed var(--line-strong);
    background: none;
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 12px;
    cursor: pointer;
  }

  .chip:hover {
    border-style: solid;
  }

  .notice {
    margin: 0;
    display: grid;
    gap: 2px;
    font-size: 12px;
    min-height: 0;
  }

  .bad {
    color: var(--error);
  }

  .sub {
    color: var(--warn);
  }
</style>
