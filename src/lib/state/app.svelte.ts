import { fabricSize } from '../fabric/fabric.ts';
import type { Font, Glyph } from '../font/font.ts';
import { BUILTIN_FONTS, loadFontById, loadMotifLibrary, type FontEntry } from '../font/registry.ts';
import { customFontEntry, listCustomFonts } from '../font/custom-store.ts';
import { EMPTY_CHART, layout } from '../layout/layout.ts';
import { remapOverrides } from '../layout/remap.ts';
import type { Rgb } from '../scene/types.ts';
import { DMC_THREADS, threadById, type Thread } from '../threads/dmc.ts';
import { MAX_TEXT, newDoc, type Doc } from './doc.ts';

const FALLBACK_THREADS: readonly Thread[] = [
  DMC_THREADS.find((t) => t.id === '310')!,
  DMC_THREADS.find((t) => t.id === '321')!,
];

export type FontStatus = 'loading' | 'ready' | 'missing' | 'error';

/** The state of the writer page. One instance, shared through the Svelte context. */
export class AppState {
  doc = $state<Doc>(newDoc());
  font = $state.raw<Font | null>(null);
  fontStatus = $state<FontStatus>('loading');
  fontError = $state<string | null>(null);
  motifs = $state.raw<ReadonlyMap<string, Glyph>>(new Map());
  customFonts = $state.raw<FontEntry[]>([]);
  /** The caret offset in the text, for the preview highlight. */
  caret = $state<number | null>(null);

  chart = $derived.by(() => {
    const font = this.font;
    if (!font) return EMPTY_CHART;
    return layout(this.doc.text, font, this.doc.layout, this.doc.dotOverrides, this.motifs);
  });

  /** The DMC thread of each font thread. */
  threads = $derived.by((): Thread[] => {
    const ids = this.doc.threads;
    const count = Math.max(2, ids.length);
    return Array.from({ length: count }, (_, i) => threadById(ids[i] ?? '') ?? FALLBACK_THREADS[i % 2]!);
  });

  threadColor = $derived.by(() => {
    const list = this.threads;
    return (t: number): Rgb => (list[t] ?? list[0]!).rgb;
  });

  fabric = $derived(fabricSize(this.chart.design, this.doc.fabric));

  get allFonts(): FontEntry[] {
    return [...BUILTIN_FONTS, ...this.customFonts];
  }

  get fontEntry(): FontEntry | undefined {
    return this.allFonts.find((f) => f.id === this.doc.fontId);
  }

  setText(next: string): void {
    const text = next.slice(0, MAX_TEXT);
    const prev = this.doc.text;
    if (text === prev) return;
    const ov = $state.snapshot(this.doc.dotOverrides);
    if (Object.keys(ov).length) this.doc.dotOverrides = remapOverrides(prev, text, ov);
    this.doc.text = text;
  }

  toggleDot(id: string): void {
    const dot = this.chart.dots.find((d) => d.id === id);
    if (!dot) return;
    const next = { ...$state.snapshot(this.doc.dotOverrides) };
    // Cycle: auto → the opposite of auto → back to auto.
    if (next[id] === undefined) next[id] = !dot.auto;
    else delete next[id];
    this.doc.dotOverrides = next;
  }

  replaceDoc(doc: Doc): void {
    this.doc = doc;
  }

  private loadSeq = 0;

  /** Loads the font of the document. The previous chart stays until the new font is ready. */
  async loadFont(id: string = this.doc.fontId): Promise<void> {
    const seq = ++this.loadSeq;
    this.fontStatus = 'loading';
    this.fontError = null;
    try {
      const [font, motifs] = await Promise.all([
        loadFontById(id, this.customFonts),
        this.motifs.size ? this.motifs : loadMotifLibrary(),
      ]);
      if (seq !== this.loadSeq) return;
      this.motifs = motifs;
      if (!font) {
        this.fontStatus = 'missing';
        return;
      }
      this.font = font;
      this.fontStatus = 'ready';
    } catch (e) {
      if (seq !== this.loadSeq) return;
      this.fontStatus = 'error';
      this.fontError = e instanceof Error ? e.message : String(e);
    }
  }

  /** Reads the fonts of the font editor (IndexedDB). Reloads the current font when it changed. */
  async refreshCustomFonts(changedId?: string): Promise<void> {
    try {
      this.customFonts = (await listCustomFonts()).map(customFontEntry);
    } catch {
      this.customFonts = [];
    }
    if (changedId && changedId === this.doc.fontId) await this.loadFont(changedId);
  }

  selectFont(id: string): void {
    if (id === this.doc.fontId && this.fontStatus === 'ready') return;
    this.doc.fontId = id;
    this.doc.dotOverrides = {};
    void this.loadFont(id);
  }
}
