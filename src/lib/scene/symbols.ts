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

type Pt = readonly [number, number];

/** The sub-paths of a shape, in a 100 × 100 square. `close` closes each sub-path. */
function polyShape(id: string, label: string, fill: boolean, parts: Pt[][], close: boolean): SymbolShape {
  return {
    id,
    label,
    fill,
    ops: (x, y, s) => {
      const out: PathOp[] = [];
      for (const part of parts) {
        part.forEach(([px, py], i) => out.push([i ? 'L' : 'M', x + (px / 100) * s, y + (py / 100) * s]));
        if (close) out.push(['Z']);
      }
      return out;
    },
  };
}

const ring: SymbolShape = {
  id: 'ring',
  label: 'Ring',
  fill: false,
  ops: (x, y, s) => disc.ops(x + 0.035 * s, y + 0.035 * s, 0.93 * s),
};

const square28: Pt[] = [
  [28, 28],
  [72, 28],
  [72, 72],
  [28, 72],
];

const MORE: SymbolShape[] = [
  polyShape(
    'star',
    'Star',
    true,
    [
      [
        [50, 14],
        [60, 40],
        [88, 40],
        [66, 57],
        [74, 84],
        [50, 68],
        [26, 84],
        [34, 57],
        [12, 40],
        [40, 40],
      ],
    ],
    true,
  ),
  ring,
  {
    id: 'boxed-slash',
    label: 'Square with a line',
    fill: false,
    ops: (x, y, s) => [
      ...polyShape('', '', false, [square28], true).ops(x, y, s),
      ['M', x + 0.28 * s, y + 0.72 * s],
      ['L', x + 0.72 * s, y + 0.28 * s],
    ],
  },
  polyShape(
    'triangle-down',
    'Triangle down',
    true,
    [
      [
        [50, 80],
        [82, 22],
        [18, 22],
      ],
    ],
    true,
  ),
  polyShape(
    'hexagon',
    'Hexagon',
    true,
    [
      [
        [30, 18],
        [70, 18],
        [88, 50],
        [70, 82],
        [30, 82],
        [12, 50],
      ],
    ],
    true,
  ),
  polyShape(
    'three-rows',
    'Three lines',
    false,
    [30, 50, 70].map((v): Pt[] => [
      [18, v],
      [82, v],
    ]),
    false,
  ),
  polyShape(
    'three-columns',
    'Three columns',
    false,
    [30, 50, 70].map((v): Pt[] => [
      [v, 18],
      [v, 82],
    ]),
    false,
  ),
  polyShape(
    'triangle-outline',
    'Open triangle',
    false,
    [
      [
        [50, 20],
        [82, 78],
        [18, 78],
      ],
    ],
    true,
  ),
  polyShape(
    'bar',
    'Bar',
    false,
    [
      [
        [20, 50],
        [80, 50],
      ],
    ],
    false,
  ),
  polyShape(
    'square-in-square',
    'Two squares',
    false,
    [
      [
        [22, 22],
        [78, 22],
        [78, 78],
        [22, 78],
      ],
      [
        [36, 36],
        [64, 36],
        [64, 64],
        [36, 64],
      ],
    ],
    true,
  ),
  polyShape(
    'diamond-in-diamond',
    'Two diamonds',
    false,
    [
      [
        [50, 18],
        [82, 50],
        [50, 82],
        [18, 50],
      ],
      [
        [50, 36],
        [64, 50],
        [50, 64],
        [36, 50],
      ],
    ],
    true,
  ),
  polyShape(
    'chevron',
    'Chevron',
    false,
    [
      [
        [18, 80],
        [50, 20],
        [82, 80],
      ],
    ],
    false,
  ),
  polyShape(
    'bowtie',
    'Bow tie',
    true,
    [
      [
        [20, 20],
        [50, 50],
        [20, 80],
      ],
      [
        [80, 20],
        [50, 50],
        [80, 80],
      ],
    ],
    true,
  ),
  polyShape(
    'column',
    'Column',
    false,
    [
      [
        [50, 20],
        [50, 80],
      ],
    ],
    false,
  ),
];

/**
 * The chart symbols, in the order that the threads use them. No symbol is a single diagonal line,
 * because the symbol view draws the half stitches as diagonal lines.
 */
export const SYMBOLS: readonly SymbolShape[] = [cross, disc, triangle, square, plus, diamond, ...MORE];

/** The default symbol of a thread: thread 0 gets the cross, thread 1 the dot, and so on. */
export const symbolForThread = (thread: number): SymbolShape => SYMBOLS[thread % SYMBOLS.length]!;
