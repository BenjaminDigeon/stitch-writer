import { fabricSize } from '../fabric/fabric.ts';
import type { Font, Glyph } from '../font/font.ts';
import { BUILTIN_FONTS, loadFontById, loadMotifLibrary, type FontEntry } from '../font/registry.ts';
import { customFontEntry, listCustomFonts } from '../font/custom-store.ts';
import { MAX_COLORS, threadPlan, type ColorMode, type ColorSettings } from '../layout/color.ts';
import { EMPTY_CHART, layout } from '../layout/layout.ts';
import type { Span } from '../layout/types.ts';
import { movedIndex, remapRangeColors, type ColorPreset } from '../layout/palette.ts';
import { paintRange, shiftRanges, textEdit } from '../layout/ranges.ts';
import { remapOverrides } from '../layout/remap.ts';
import type { Rgb } from '../scene/types.ts';
import { DMC_THREADS, threadById, type Thread } from '../threads/dmc.ts';
import { MAX_TEXT, newDoc, type Doc } from './doc.ts';

const FALLBACK_THREADS: readonly Thread[] = [
  DMC_THREADS.find((t) => t.id === '310')!,
  DMC_THREADS.find((t) => t.id === '321')!,
];

export type FontStatus = 'loading' | 'ready' | 'missing' | 'error';

/** The colors that "Add a color" offers, in order. Each one is easy to tell from the others. */
// prettier-ignore
export const SUGGESTED_COLORS: readonly string[] = [
  '3750', '3765', '3346', '783', '815', '333', '900', '434',
  '310', '3801', '995', '307', '702', '3607', '552', '958',
];

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

  /** The chart threads: one for each different DMC number of the text colors and the motif fill. */
  plan = $derived(threadPlan(this.doc.palette, this.doc.accent));

  colors = $derived.by((): ColorSettings => ({
    mode: this.doc.coloring.mode,
    ranges: this.doc.colorRanges,
    textThreads: this.plan.textThreads,
    accentThread: this.plan.accentThread,
  }));

  chart = $derived.by(() => {
    const font = this.font;
    if (!font) return EMPTY_CHART;
    return layout(this.doc.text, font, this.doc.layout, this.doc.dotOverrides, this.motifs, this.colors);
  });

  /** The DMC thread of each chart thread. */
  threads = $derived.by((): Thread[] =>
    this.plan.ids.map((id, i) => threadById(id) ?? FALLBACK_THREADS[i % 2]!),
  );

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

  /**
   * Changes the text. The dot overrides and the colors set by hand move with the text. `caret` is the
   * caret position after the change: it tells where the change is when the text repeats.
   */
  setText(next: string, caret?: number): void {
    const text = next.slice(0, MAX_TEXT);
    const prev = this.doc.text;
    if (text === prev) return;
    const ov = $state.snapshot(this.doc.dotOverrides);
    if (Object.keys(ov).length) this.doc.dotOverrides = remapOverrides(prev, text, ov);
    if (this.doc.colorRanges.length)
      this.doc.colorRanges = shiftRanges($state.snapshot(this.doc.colorRanges), textEdit(prev, text, caret));
    this.doc.text = text;
  }

  /** Gives a text color to a part of the text, or gives it back to the automatic colors (null). */
  paintText(span: Span, color: number | null): void {
    this.doc.colorRanges = paintRange($state.snapshot(this.doc.colorRanges), span.start, span.end, color);
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

  /** The stitches of each text color. */
  colorStitches = $derived.by((): number[] =>
    this.plan.textThreads.map((t) => {
      const s = this.chart.stats.threads[t];
      return s ? s.full + s.half + s.backstitches + s.knots : 0;
    }),
  );

  /**
   * Adds a text color: the first suggested color that the list does not have. Returns its index, or
   * null when the list is full. With `showAtOnce`, the second color also changes "One color" to
   * "Each letter", so that the new color shows at once.
   */
  addColor(showAtOnce = true): number | null {
    const palette = this.doc.palette;
    if (palette.length >= MAX_COLORS) return null;
    const used = new Set(palette.map((id) => id.toLowerCase()));
    const id = SUGGESTED_COLORS.find((c) => !used.has(c.toLowerCase())) ?? DMC_THREADS[palette.length]!.id;
    palette.push(id);
    if (showAtOnce && palette.length === 2 && this.doc.coloring.mode === 'single')
      this.doc.coloring.mode = 'letter';
    return palette.length - 1;
  }

  /** Removes a text color. The text that had this color by hand goes back to the automatic colors. */
  removeColor(index: number): void {
    const palette = this.doc.palette;
    if (palette.length <= 1 || index < 0 || index >= palette.length) return;
    palette.splice(index, 1);
    this.doc.colorRanges = remapRangeColors($state.snapshot(this.doc.colorRanges), (c) =>
      c === index ? null : c > index ? c - 1 : c,
    );
  }

  /** The number of parts of the text that have this color by hand. */
  partsWithColor(index: number): number {
    return this.doc.colorRanges.filter((r) => r.color === index).length;
  }

  /** Moves a text color in the list. The parts colored by hand keep their color. */
  moveColor(from: number, to: number): void {
    const palette = this.doc.palette;
    if (from === to || from < 0 || to < 0 || from >= palette.length || to >= palette.length) return;
    const [id] = palette.splice(from, 1);
    palette.splice(to, 0, id!);
    this.doc.colorRanges = remapRangeColors($state.snapshot(this.doc.colorRanges), (c) =>
      movedIndex(c, from, to),
    );
  }

  /**
   * Replaces the text colors with a preset. A part colored by hand keeps its color number when the
   * preset has it. "One color" changes to "Each letter", so that the colors show at once.
   * Returns a function that puts back the previous colors.
   */
  applyPreset(preset: ColorPreset): () => void {
    const before = {
      palette: $state.snapshot(this.doc.palette),
      ranges: $state.snapshot(this.doc.colorRanges),
      mode: this.doc.coloring.mode,
    };
    const count = preset.colors.length;
    this.doc.palette = [...preset.colors];
    this.doc.colorRanges = remapRangeColors(before.ranges, (c) => (c < count ? c : null));
    if (this.doc.coloring.mode === 'single') this.doc.coloring.mode = 'letter';
    return () => {
      this.doc.palette = before.palette;
      this.doc.colorRanges = before.ranges;
      this.doc.coloring.mode = before.mode;
    };
  }

  setColor(index: number, id: string): void {
    if (index >= 0 && index < this.doc.palette.length) this.doc.palette[index] = id;
  }

  setColorMode(mode: ColorMode): void {
    this.doc.coloring.mode = mode;
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
