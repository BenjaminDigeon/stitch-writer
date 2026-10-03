import type { Glyph, GlyphCell } from '../font/font.ts';
import type { DotOverrides, DotPolicy, ResolvedDot } from './types.ts';

/** A glyph placed on a line, with its chart offset and source start (for override keys). */
export interface PlacedGlyph {
  glyph: Glyph;
  /** Chart x of the glyph origin and chart y of its baseline. */
  x: number;
  baseline: number;
  srcStart: number;
  /** False after a space, a motif or anything else that is not a letter of the same word. */
  joinsPrevious: boolean;
}

const isLetter = (g: Glyph) => (g.type === 'char' || g.type === 'ligature') && /\p{L}/u.test(g.key);

const dotId = (p: PlacedGlyph, c: GlyphCell) => `${p.srcStart}:${c.x}:${c.y}`;

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function bodyCells(p: PlacedGlyph): string[] {
  return p.glyph.cells.filter((c) => !c.optional).map((c) => cellKey(p.x + c.x, p.baseline + c.y));
}

/** True when a cell of `a` connects to a cell of `b` through the cells of `open`. */
function connects(a: string[], b: Set<string>, open: Set<string>, connectivity: 4 | 8): boolean {
  const seen = new Set(a);
  const queue = [...a];
  const steps =
    connectivity === 4
      ? [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]
      : [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ];
  while (queue.length) {
    const cur = queue.pop()!;
    const [x, y] = cur.split(',').map(Number) as [number, number];
    for (const [dx, dy] of steps) {
      const k = cellKey(x + dx!, y + dy!);
      if (seen.has(k)) continue;
      if (b.has(k)) return true;
      if (open.has(k)) {
        seen.add(k);
        queue.push(k);
      }
    }
  }
  return false;
}

function subsets<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let mask = 0; mask < 1 << items.length; mask++) {
    out.push(items.filter((_, i) => mask & (1 << i)));
  }
  return out.sort((a, b) => a.length - b.length);
}

/**
 * Decides which connector dots to stitch. For each pair of joined letters, it takes the smallest set of
 * candidate dots (the exit dots of the left letter and the entry dots of the right letter) that connects
 * the two letters. The dots at the start and at the end of a word stay off.
 */
export function resolveConnectors(
  run: readonly PlacedGlyph[],
  policy: DotPolicy,
  overrides: DotOverrides,
  connectivity: 4 | 8,
): ResolvedDot[] {
  const auto = new Set<string>();
  for (let i = 1; i < run.length; i++) {
    const L = run[i - 1]!;
    const R = run[i]!;
    if (!R.joinsPrevious || !isLetter(L.glyph) || !isLetter(R.glyph)) continue;
    const exits = L.glyph.cells
      .filter((c) => c.optional && c.x >= L.glyph.width / 2)
      .map((c) => ({ p: L, c }));
    const entries = R.glyph.cells
      .filter((c) => c.optional && c.x < R.glyph.width / 2)
      .map((c) => ({ p: R, c }));
    const candidates = [...exits, ...entries];
    if (!candidates.length) continue;
    const left = bodyCells(L);
    const right = new Set(bodyCells(R));
    const exitRows = L.glyph.cells.filter((c) => !c.optional && c.x === L.glyph.width - 1).map((c) => c.y);
    const exitRow = exitRows.length ? Math.min(...exitRows) : 0;
    const ordered = subsets(candidates).sort((a, b) => {
      if (a.length !== b.length) return a.length - b.length;
      const da = a.reduce((s, d) => s + Math.abs(d.c.y - exitRow), 0);
      const db = b.reduce((s, d) => s + Math.abs(d.c.y - exitRow), 0);
      return da - db;
    });
    for (const set of ordered) {
      const open = new Set([
        ...left,
        ...right,
        ...set.map((d) => cellKey(d.p.x + d.c.x, d.p.baseline + d.c.y)),
      ]);
      if (connects(left, right, open, connectivity)) {
        for (const d of set) auto.add(dotId(d.p, d.c));
        break;
      }
    }
  }

  const out: ResolvedDot[] = [];
  for (const p of run) {
    for (const c of p.glyph.cells) {
      if (!c.optional) continue;
      const id = dotId(p, c);
      const isAuto = policy === 'all' ? true : policy === 'none' ? false : auto.has(id);
      const ov = overrides[id];
      out.push({
        id,
        x: p.x + c.x,
        y: p.baseline + c.y,
        thread: c.thread,
        auto: isAuto,
        active: ov ?? isAuto,
        overridden: ov !== undefined,
      });
    }
  }
  return out;
}
