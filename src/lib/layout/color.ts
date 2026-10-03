import type { Token } from './types.ts';

/** How the automatic colors go through the text colors. */
export type ColorMode = 'single' | 'letter' | 'word' | 'line';

export const COLOR_MODES: readonly ColorMode[] = ['single', 'letter', 'word', 'line'];

/** The most text colors that a document can have. */
export const MAX_COLORS = 16;

/** A part of the text with a color set by hand. `color` is an index in the text colors. */
export interface ColorRange {
  start: number;
  end: number;
  color: number;
}

/** The color settings that the layout uses. */
export interface ColorSettings {
  mode: ColorMode;
  /** Sorted by `start`, with no overlap. */
  ranges: readonly ColorRange[];
  /** The chart thread of each text color. */
  textThreads: readonly number[];
  /** The chart thread of the font accent thread (font thread 1 and up): the motif fill. */
  accentThread: number;
}

/** One text color on thread 0 and the accent on thread 1: the chart threads are the font threads. */
export const DEFAULT_COLORS: ColorSettings = Object.freeze({
  mode: 'single',
  ranges: [],
  textThreads: [0],
  accentThread: 1,
});

/** The range that contains `offset`, or undefined. `ranges` must be sorted and must not overlap. */
export function rangeAt(ranges: readonly ColorRange[], offset: number): ColorRange | undefined {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = ranges[mid]!;
    if (offset < r.start) hi = mid - 1;
    else if (offset >= r.end) lo = mid + 1;
    else return r;
  }
  return undefined;
}

/**
 * Gives the text color (an index in the text colors) of each token. A token without stitches
 * (space, line break, missing character) gets -1.
 *
 * - "letter" counts the characters that have stitches. The glyphs of one character (a join and
 *   its letter, or a replaced character) share one color.
 * - "word" counts the groups of characters between spaces and line breaks. A motif is one word.
 * - "line" counts the lines that have stitches.
 *
 * The count goes on across words and lines. A color set by hand wins over the mode.
 */
export function tokenColors(
  tokens: readonly Token[],
  mode: ColorMode,
  ranges: readonly ColorRange[],
  count: number,
): number[] {
  const n = Math.max(1, count);
  const out: number[] = [];
  let letter = -1;
  let word = -1;
  let line = -1;
  let inWord = false;
  let lineHasStitches = false;
  let lastStart = -1;
  for (const t of tokens) {
    if (t.k === 'newline') {
      inWord = false;
      lineHasStitches = false;
      out.push(-1);
      continue;
    }
    if (t.k === 'space') {
      inWord = false;
      out.push(-1);
      continue;
    }
    if (t.k === 'missing') {
      out.push(-1);
      continue;
    }
    if (!lineHasStitches) {
      line++;
      lineHasStitches = true;
    }
    if (t.k === 'motif') {
      word++;
      letter++;
      inWord = false;
    } else {
      if (!inWord) word++;
      inWord = true;
      if (t.src.start !== lastStart) letter++;
    }
    lastStart = t.src.start;
    const manual = rangeAt(ranges, t.src.start);
    if (manual && manual.color < n) {
      out.push(manual.color);
      continue;
    }
    const index = mode === 'letter' ? letter : mode === 'word' ? word : mode === 'line' ? line : 0;
    out.push(index % n);
  }
  return out;
}

/** The chart threads of a document: one for each different DMC number. */
export interface ThreadPlan {
  /** The DMC number of each chart thread: the text colors in order, then the motif fill. */
  ids: string[];
  textThreads: number[];
  accentThread: number;
}

/** Gives one chart thread to each different DMC number, so a color that is used twice gets one legend row. */
export function threadPlan(palette: readonly string[], accent: string): ThreadPlan {
  const ids: string[] = [];
  const threadOf = (id: string) => {
    const key = id.trim().toLowerCase();
    const i = ids.findIndex((x) => x.trim().toLowerCase() === key);
    if (i >= 0) return i;
    ids.push(id);
    return ids.length - 1;
  };
  const textThreads = palette.map(threadOf);
  return { ids, textThreads, accentThread: threadOf(accent) };
}
