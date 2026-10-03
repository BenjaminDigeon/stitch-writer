import { spaceKey } from '../font/schema.ts';
import type { Font, Glyph } from '../font/font.ts';
import { DEFAULT_COLORS, tokenColors, type ColorSettings } from './color.ts';
import { resolveConnectors, type PlacedGlyph } from './connectors.ts';
import { tokenize } from './tokenize.ts';
import {
  cellCode,
  type Chart,
  type ChartKnot,
  type ChartLine,
  type DotOverrides,
  type LayoutSettings,
  type Placement,
  type ResolvedDot,
  type ShapedPos,
  type ThreadStats,
  type Token,
} from './types.ts';

/** The width of the placeholder box for a character that the font does not have. */
export const MISSING_WIDTH = 3;

interface Item {
  token: number;
  kind: 'glyph' | 'motif' | 'space' | 'missing';
  glyph: Glyph | null;
  width: number;
  key: string;
  src: Token['src'];
  x: number;
  shaped?: ShapedPos;
}

interface Line {
  items: Item[];
  width: number;
  /** Rows above and below the baseline that the line uses (the font frame, or more for big motifs). */
  above: number;
  below: number;
}

export const EMPTY_CHART: Chart = Object.freeze({
  width: 0,
  height: 0,
  cells: new Uint8Array(0),
  lines: [],
  knots: [],
  dots: [],
  placements: [],
  design: { x0: 0, y0: 0, x1: 0, y1: 0 },
  center: { x: 0, y: 0 },
  stats: { threads: {}, total: 0 },
  issues: { missing: [], substituted: [] },
}) as Chart;

const emptyStats = (): ThreadStats => ({ full: 0, half: 0, backstitches: 0, backLength: 0, knots: 0 });

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** The number of backstitches in a straight segment: one per lattice step. */
export function backstitchCount(dx: number, dy: number): number {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Number.isInteger(ax) && Number.isInteger(ay)) return Math.max(1, gcd(ax, ay));
  return Math.max(1, gcd(Math.round(ax * 2), Math.round(ay * 2)));
}

function splitLines(
  tokens: Token[],
  font: Font,
  s: LayoutSettings,
  motifs: ReadonlyMap<string, Glyph>,
): Line[] {
  const lines: Line[] = [];
  let items: Item[] = [];
  const flush = () => {
    lines.push({ items, width: 0, above: font.metrics.ascent, below: font.metrics.descent });
    items = [];
  };
  tokens.forEach((t, i) => {
    if (t.k === 'newline') return flush();
    if (t.k === 'space') {
      const g = font.glyphs.get(spaceKey(s.wordSpace)) ?? null;
      items.push({
        token: i,
        kind: 'space',
        glyph: g,
        width: g ? g.width : s.wordSpace,
        key: ' ',
        src: t.src,
        x: 0,
      });
      return;
    }
    if (t.k === 'missing') {
      items.push({
        token: i,
        kind: 'missing',
        glyph: null,
        width: MISSING_WIDTH,
        key: t.text,
        src: t.src,
        x: 0,
      });
      return;
    }
    const g = (t.k === 'motif' ? (font.glyphs.get(t.key) ?? motifs.get(t.key)) : font.glyphs.get(t.key))!;
    const item: Item = { token: i, kind: t.k, glyph: g, width: g.width, key: t.key, src: t.src, x: 0 };
    if (t.k === 'glyph' && t.shaped) {
      item.shaped = t.shaped;
      item.width = t.shaped.advance;
    }
    items.push(item);
  });
  flush();
  return lines;
}

const NO_MOTIFS: ReadonlyMap<string, Glyph> = new Map();

/**
 * Turns the text into a chart: glyph placement, alignment, colors, connector dots and stitch counts.
 * `motifs` is a shared motif library for the motif names that the font does not have.
 * `colors` gives the chart thread of each stitch. The default keeps the font threads.
 */
export function layout(
  text: string,
  font: Font,
  s: LayoutSettings,
  overrides: DotOverrides = {},
  motifs: ReadonlyMap<string, Glyph> = NO_MOTIFS,
  colors: ColorSettings = DEFAULT_COLORS,
): Chart {
  const tokens = tokenize(text, font, s, motifs.keys());
  const issues: Chart['issues'] = { missing: [], substituted: [] };
  for (const t of tokens) {
    if (t.k === 'missing') issues.missing.push({ text: t.text, src: t.src });
    if (t.k === 'glyph' && t.substitutedFrom) {
      const last = issues.substituted[issues.substituted.length - 1];
      if (last && last.src.start === t.src.start) {
        if (!t.substitutedTo) last.to += t.key;
      } else {
        issues.substituted.push({ from: t.substitutedFrom, to: t.substitutedTo ?? t.key, src: t.src });
      }
    }
  }
  if (!tokens.some((t) => t.k === 'glyph' || t.k === 'motif' || t.k === 'missing'))
    return { ...EMPTY_CHART, issues };

  const ls = s.letterSpacing ?? font.metrics.letterSpacing;
  const lines = splitLines(tokens, font, s, motifs);

  // The chart thread of a stitch: font thread 0 takes the color of its letter, and the other font
  // threads take the motif fill.
  const tokenColor = tokenColors(tokens, colors.mode, colors.ranges, colors.textThreads.length);
  const threadOf = (token: number, fontThread: number): number =>
    fontThread === 0
      ? (colors.textThreads[tokenColor[token] ?? 0] ?? colors.textThreads[0] ?? 0)
      : colors.accentThread;

  // Pass 1: horizontal placement and the vertical extent of each line. The advance is fixed, except
  // inside a shaped word, where the font gives the positions (joins and kerning).
  for (const line of lines) {
    let x = 0;
    let end = 0;
    let word: number | null = null;
    let wordStart = 0;
    line.items.forEach((it, i) => {
      if (it.shaped && it.shaped.word === word) {
        it.x = wordStart + it.shaped.x;
        x = it.x + it.shaped.advance;
      } else {
        if (i > 0) x += ls;
        if (it.shaped) {
          word = it.shaped.word;
          wordStart = x;
          it.x = x + it.shaped.x;
        } else {
          word = null;
          it.x = x;
        }
        x = it.x + it.width;
      }
      if (it.kind !== 'space') end = x;
      const span = it.glyph?.rowSpan;
      if (span && it.kind !== 'space') {
        const dy = it.shaped?.dy ?? 0;
        line.above = Math.max(line.above, -(span.min + dy));
        line.below = Math.max(line.below, span.max + dy + 1);
      }
    });
    line.width = end;
  }
  const maxWidth = Math.max(...lines.map((l) => l.width));
  const gap = font.metrics.lineGap + s.lineSpacing;

  // Pass 2: alignment and baselines (in chart coordinates before the padding).
  const placed: { line: Line; offset: number; baseline: number }[] = [];
  let top = 0;
  for (const line of lines) {
    const free = maxWidth - line.width;
    const offset = s.align === 'left' ? 0 : s.align === 'right' ? free : Math.floor(free / 2);
    placed.push({ line, offset, baseline: top + line.above });
    top += line.above + line.below + gap;
  }

  // Connector dots, per line.
  const dots: ResolvedDot[] = [];
  for (const p of placed) {
    const run: PlacedGlyph[] = [];
    let joins = false;
    for (const it of p.line.items) {
      if (it.kind === 'glyph' && it.glyph) {
        run.push({
          glyph: it.glyph,
          x: p.offset + it.x,
          baseline: p.baseline,
          srcStart: it.src.start,
          joinsPrevious: joins,
          threadOf: (t) => threadOf(it.token, t),
        });
        joins = true;
      } else {
        joins = false;
      }
    }
    dots.push(...resolveConnectors(run, s.dots, overrides, font.connectivity));
  }
  const activeDots = new Set(dots.filter((d) => d.active).map((d) => d.id));

  // Collect the stitches in pre-padding coordinates and find the ink box.
  type RawCell = { x: number; y: number; code: number; thread: number; half: boolean };
  const raw: RawCell[] = [];
  const lineList: ChartLine[] = [];
  const knotList: ChartKnot[] = [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const grow = (ax: number, ay: number, bx: number, by: number) => {
    x0 = Math.min(x0, ax);
    y0 = Math.min(y0, ay);
    x1 = Math.max(x1, bx);
    y1 = Math.max(y1, by);
  };
  const placementsRaw: (Placement & { baseline: number })[] = [];
  for (const p of placed) {
    for (const it of p.line.items) {
      if (it.kind === 'space') continue;
      const gx = p.offset + it.x;
      placementsRaw.push({
        token: it.token,
        key: it.key,
        kind: it.kind === 'missing' ? 'missing' : it.kind,
        x: gx,
        y: p.baseline - p.line.above,
        width: it.width,
        height: p.line.above + p.line.below,
        src: it.src,
        line: placed.indexOf(p),
        baseline: p.baseline,
      });
      if (it.kind === 'missing') {
        grow(gx, p.baseline - font.metrics.xHeight, gx + it.width, p.baseline);
        continue;
      }
      const g = it.glyph!;
      const base = p.baseline + (it.shaped?.dy ?? 0);
      for (const c of g.cells) {
        if (c.optional && !activeDots.has(`${it.src.start}:${c.x}:${c.y}`)) continue;
        const cx = gx + c.x;
        const cy = base + c.y;
        const thread = threadOf(it.token, c.thread);
        raw.push({ x: cx, y: cy, code: cellCode({ thread, half: c.half }), thread, half: !!c.half });
        grow(cx, cy, cx + 1, cy + 1);
      }
      for (const l of g.lines) {
        const pts = l.pts.map((v, i) => (i % 2 === 0 ? v + gx : v + base));
        for (let i = 0; i < pts.length; i += 2) grow(pts[i]!, pts[i + 1]!, pts[i]!, pts[i + 1]!);
        lineList.push({ pts, thread: threadOf(it.token, l.thread) });
      }
      for (const k of g.knots) {
        knotList.push({ x: k.x + gx, y: k.y + base, thread: threadOf(it.token, k.thread) });
        grow(k.x + gx, k.y + base, k.x + gx, k.y + base);
      }
    }
  }
  if (!Number.isFinite(x0)) {
    // Only spaces with no ink: keep a box around the placeholders.
    x0 = 0;
    y0 = 0;
    x1 = maxWidth;
    y1 = top;
  }

  const pad = Math.max(0, Math.floor(s.padding));
  const ox = -Math.floor(x0) + pad;
  const oy = -Math.floor(y0) + pad;
  const width = Math.ceil(x1) - Math.floor(x0) + 2 * pad;
  const height = Math.ceil(y1) - Math.floor(y0) + 2 * pad;
  const cells = new Uint8Array(width * height);
  const threads: Record<number, ThreadStats> = {};
  const statsFor = (t: number) => (threads[t] ??= emptyStats());
  for (const c of raw) cells[(c.y + oy) * width + (c.x + ox)] = c.code;
  for (let i = 0; i < cells.length; i++) {
    const code = cells[i]!;
    if (!code) continue;
    const t = Math.floor((code - 1) / 3);
    if ((code - 1) % 3 === 0) statsFor(t).full++;
    else statsFor(t).half++;
  }
  const lines2 = lineList.map((l) => ({
    thread: l.thread,
    pts: l.pts.map((v, i) => v + (i % 2 === 0 ? ox : oy)),
  }));
  for (const l of lines2) {
    const st = statsFor(l.thread);
    for (let i = 2; i < l.pts.length; i += 2) {
      const dx = l.pts[i]! - l.pts[i - 2]!;
      const dy = l.pts[i + 1]! - l.pts[i - 1]!;
      st.backstitches += backstitchCount(dx, dy);
      st.backLength += Math.hypot(dx, dy);
    }
  }
  const knots2 = knotList.map((k) => ({ ...k, x: k.x + ox, y: k.y + oy }));
  for (const k of knots2) statsFor(k.thread).knots++;
  const total = Object.values(threads).reduce((n, t) => n + t.full + t.half + t.backstitches + t.knots, 0);
  const design = { x0: x0 + ox, y0: y0 + oy, x1: x1 + ox, y1: y1 + oy };

  return {
    width,
    height,
    cells,
    lines: lines2,
    knots: knots2,
    dots: dots.map((d) => ({ ...d, x: d.x + ox, y: d.y + oy })),
    placements: placementsRaw.map(({ baseline: _b, ...p }) => ({ ...p, x: p.x + ox, y: p.y + oy })),
    design,
    center: { x: (design.x0 + design.x1) / 2, y: (design.y0 + design.y1) / 2 },
    stats: { threads, total },
    issues,
  };
}
