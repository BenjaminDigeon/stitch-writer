import type { PathOp } from './types.ts';

/** A chart symbol drawn in a unit square (0..1). `fill` shapes are filled, the others are stroked. */
export interface SymbolShape {
  id: string;
  label: string;
  fill: boolean;
  ops: (x: number, y: number, s: number) => PathOp[];
}

const inset = 0.2;

const cross: SymbolShape = {
  id: 'cross',
  label: 'Cross',
  fill: false,
  ops: (x, y, s) => {
    const a = inset * s;
    return [
      ['M', x + a, y + a],
      ['L', x + s - a, y + s - a],
      ['M', x + s - a, y + a],
      ['L', x + a, y + s - a],
    ];
  },
};

const disc: SymbolShape = {
  id: 'disc',
  label: 'Dot',
  fill: true,
  ops: (x, y, s) => {
    // A circle of radius 0.28 s, as 4 Bézier curves.
    const r = 0.28 * s;
    const k = 0.5523 * r;
    const cx = x + s / 2;
    const cy = y + s / 2;
    return [
      ['M', cx + r, cy],
      ['C', cx + r, cy + k, cx + k, cy + r, cx, cy + r],
      ['C', cx - k, cy + r, cx - r, cy + k, cx - r, cy],
      ['C', cx - r, cy - k, cx - k, cy - r, cx, cy - r],
      ['C', cx + k, cy - r, cx + r, cy - k, cx + r, cy],
      ['Z'],
    ];
  },
};

const triangle: SymbolShape = {
  id: 'triangle',
  label: 'Triangle',
  fill: true,
  ops: (x, y, s) => [
    ['M', x + s / 2, y + inset * s],
    ['L', x + s - inset * s, y + s - inset * s],
    ['L', x + inset * s, y + s - inset * s],
    ['Z'],
  ],
};

const square: SymbolShape = {
  id: 'square',
  label: 'Square',
  fill: true,
  ops: (x, y, s) => [['R', x + 0.25 * s, y + 0.25 * s, 0.5 * s, 0.5 * s]],
};

const plus: SymbolShape = {
  id: 'plus',
  label: 'Plus',
  fill: false,
  ops: (x, y, s) => [
    ['M', x + s / 2, y + inset * s],
    ['L', x + s / 2, y + s - inset * s],
    ['M', x + inset * s, y + s / 2],
    ['L', x + s - inset * s, y + s / 2],
  ],
};

const diamond: SymbolShape = {
  id: 'diamond',
  label: 'Diamond',
  fill: true,
  ops: (x, y, s) => [
    ['M', x + s / 2, y + inset * s],
    ['L', x + s - inset * s, y + s / 2],
    ['L', x + s / 2, y + s - inset * s],
    ['L', x + inset * s, y + s / 2],
    ['Z'],
  ],
};

export const SYMBOLS: readonly SymbolShape[] = [cross, disc, triangle, square, plus, diamond];

/** The default symbol of a thread: thread 0 gets the cross, thread 1 the dot, and so on. */
export const symbolForThread = (thread: number): SymbolShape => SYMBOLS[thread % SYMBOLS.length]!;
