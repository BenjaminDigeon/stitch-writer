<script lang="ts">
  import { getContext, tick } from 'svelte';
  import type { AppState } from '../lib/state/app.svelte.ts';
  import { MAX_TEXT } from '../lib/state/doc.ts';
  import type { Span } from '../lib/layout/types.ts';
  import { autocompleteQuery, motifSpans, tokenAround, tokenAt } from '../lib/text/editing.ts';
  import InsertPalette from './InsertPalette.svelte';

  const app = getContext<AppState>('app');

  let textarea: HTMLTextAreaElement | undefined = $state();
  let mirror: HTMLDivElement | undefined = $state();
  let paletteOpen = $state(false);
  let ac = $state<{ start: number; query: string } | null>(null);
  let acIndex = $state(0);

  const motifNames = $derived([...new Set([...(app.font?.motifs ?? []), ...app.motifs.keys()])]);
  const isMotif = (n: string) => motifNames.includes(n);
  const spans = $derived(motifSpans(app.doc.text, isMotif));
  const acMatches = $derived(ac ? motifNames.filter((n) => n.startsWith(ac!.query)).slice(0, 8) : []);

  interface Segment {
    text: string;
    cls?: string;
    title?: string;
  }

  /** Text pieces for the mirror: plain, missing, replaced and motif ranges. */
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
    const out: Segment[] = [];
    let pos = 0;
    for (const m of marks) {
      if (m.span.start < pos) continue;
      if (m.span.start > pos) out.push({ text: text.slice(pos, m.span.start) });
      out.push({ text: text.slice(m.span.start, m.span.end), cls: m.cls, title: m.title });
      pos = m.span.end;
    }
    if (pos < text.length) out.push({ text: text.slice(pos) });
    return out;
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
    app.caret = document.activeElement === textarea ? textarea.selectionStart : null;
    ac =
      textarea.selectionStart === textarea.selectionEnd
        ? autocompleteQuery(app.doc.text, textarea.selectionStart)
        : null;
    acIndex = 0;
  }

  function oninput(e: Event) {
    app.setText((e.currentTarget as HTMLTextAreaElement).value);
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

  export function select(span: Span) {
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(span.start, span.end);
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

<div class="text-block">
  <div class="head">
    <label for="stitch-text" class="label">Text to stitch</label>
    <span class="count" class:near={app.doc.text.length > MAX_TEXT * 0.9}
      >{app.doc.text.length} / {MAX_TEXT}</span
    >
  </div>
  <div class="input-wrap">
    <div class="mirror" bind:this={mirror} aria-hidden="true">
      {#each segments as seg, i (i)}{#if seg.cls}<mark class={seg.cls}>{seg.text}</mark
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
    align-items: baseline;
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
