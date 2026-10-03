/**
 * Writes the two open sample fonts into src/fonts/samples/. The glyph art in this file is original
 * work and is dedicated to the public domain (CC0).
 *
 * Run: npm run fonts:samples
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { segmentsToPolylines, type LatticeSegment } from '../src/lib/font/polyline.ts';
import { normaliseGlyph, serializeFont } from '../src/lib/font/normalise.ts';
import { validateFont } from '../src/lib/font/validate.ts';
import {
  DEFAULT_SYMBOLS,
  DEFAULT_THREADS,
  FONT_SCHEMA,
  FONT_VERSION,
  spaceKey,
  type FontFile,
  type GlyphDef,
} from '../src/lib/font/schema.ts';

const OUT = fileURLToPath(new URL('../src/fonts/samples/', import.meta.url));
const LICENCE = 'CC0 1.0 — original sample font of Stitch Writer.';

/** Glyph art: the bottom row of `rows` is on row `bottom` (baseline row = -1). */
function art(rows: string, bottom = -1, type: GlyphDef['type'] = 'char', label?: string): GlyphDef {
  const lines = rows.trim().split(/\s+/);
  const width = lines[0]!.length;
  const def: GlyphDef = { type, width, top: bottom - lines.length + 1, rows: lines };
  if (label) def.label = label;
  return def;
}

const UPPER: Record<string, string> = {
  A: '.XXX. X...X X...X XXXXX X...X X...X X...X',
  B: 'XXXX. X...X X...X XXXX. X...X X...X XXXX.',
  C: '.XXX. X...X X.... X.... X.... X...X .XXX.',
  D: 'XXXX. X...X X...X X...X X...X X...X XXXX.',
  E: 'XXXXX X.... X.... XXXX. X.... X.... XXXXX',
  F: 'XXXXX X.... X.... XXXX. X.... X.... X....',
  G: '.XXX. X...X X.... X.XXX X...X X...X .XXXX',
  H: 'X...X X...X X...X XXXXX X...X X...X X...X',
  I: 'XXX .X. .X. .X. .X. .X. XXX',
  J: '..XXX ...X. ...X. ...X. ...X. X..X. .XX..',
  K: 'X...X X..X. X.X.. XX... X.X.. X..X. X...X',
  L: 'X.... X.... X.... X.... X.... X.... XXXXX',
  M: 'X...X XX.XX X.X.X X.X.X X...X X...X X...X',
  N: 'X...X X...X XX..X X.X.X X..XX X...X X...X',
  O: '.XXX. X...X X...X X...X X...X X...X .XXX.',
  P: 'XXXX. X...X X...X XXXX. X.... X.... X....',
  Q: '.XXX. X...X X...X X...X X.X.X X..X. .XX.X',
  R: 'XXXX. X...X X...X XXXX. X.X.. X..X. X...X',
  S: '.XXXX X.... X.... .XXX. ....X ....X XXXX.',
  T: 'XXXXX ..X.. ..X.. ..X.. ..X.. ..X.. ..X..',
  U: 'X...X X...X X...X X...X X...X X...X .XXX.',
  V: 'X...X X...X X...X X...X X...X .X.X. ..X..',
  W: 'X...X X...X X...X X.X.X X.X.X X.X.X .X.X.',
  X: 'X...X X...X .X.X. ..X.. .X.X. X...X X...X',
  Y: 'X...X X...X .X.X. ..X.. ..X.. ..X.. ..X..',
  Z: 'XXXXX ....X ...X. ..X.. .X... X.... XXXXX',
};

const DIGITS: Record<string, string> = {
  '0': '.XXX. X...X X..XX X.X.X XX..X X...X .XXX.',
  '1': '.X. XX. .X. .X. .X. .X. XXX',
  '2': '.XXX. X...X ....X ...X. ..X.. .X... XXXXX',
  '3': 'XXXX. ....X ....X .XXX. ....X ....X XXXX.',
  '4': '...X. ..XX. .X.X. X..X. XXXXX ...X. ...X.',
  '5': 'XXXXX X.... XXXX. ....X ....X X...X .XXX.',
  '6': '..XX. .X... X.... XXXX. X...X X...X .XXX.',
  '7': 'XXXXX ....X ...X. ..X.. .X... .X... .X...',
  '8': '.XXX. X...X X...X .XXX. X...X X...X .XXX.',
  '9': '.XXX. X...X X...X .XXXX ....X ...X. .XX..',
};

/** Lower case: [art, bottom row]. Letters with a descender end on row 1. */
const LOWER: Record<string, [string, number]> = {
  a: ['.XX. ...X .XXX X..X .XXX', -1],
  b: ['X... X... XXX. X..X X..X X..X XXX.', -1],
  c: ['.XXX X... X... X... .XXX', -1],
  d: ['...X ...X .XXX X..X X..X X..X .XXX', -1],
  e: ['.XX. X..X XXXX X... .XXX', -1],
  f: ['.XX X.. X.. XXX X.. X.. X..', -1],
  g: ['.XXX X..X X..X X..X .XXX ...X XXX.', 1],
  h: ['X... X... XXX. X..X X..X X..X X..X', -1],
  i: ['X . X X X X X', -1],
  j: ['..X ... ..X ..X ..X ..X ..X X.X .X.', 1],
  k: ['X... X... X..X X.X. XX.. X.X. X..X', -1],
  l: ['X. X. X. X. X. X. .X', -1],
  m: ['XX.X. X.X.X X.X.X X.X.X X.X.X', -1],
  n: ['XXX. X..X X..X X..X X..X', -1],
  o: ['.XX. X..X X..X X..X .XX.', -1],
  p: ['XXX. X..X X..X X..X XXX. X... X...', 1],
  q: ['.XXX X..X X..X X..X .XXX ...X ...X', 1],
  r: ['X.XX XX.. X... X... X...', -1],
  s: ['.XXX X... .XX. ...X XXX.', -1],
  t: ['.X. .X. XXX .X. .X. .X. ..X', -1],
  u: ['X..X X..X X..X X..X .XXX', -1],
  v: ['X...X X...X X...X .X.X. ..X..', -1],
  w: ['X...X X...X X.X.X X.X.X .X.X.', -1],
  x: ['X...X .X.X. ..X.. .X.X. X...X', -1],
  y: ['X..X X..X X..X X..X .XXX ...X XXX.', 1],
  z: ['XXXX ...X .XX. X... XXXX', -1],
  é: ['..X. .... .XX. X..X XXXX X... .XXX', -1],
  è: ['.X.. .... .XX. X..X XXXX X... .XXX', -1],
  ê: ['.XX. .... .XX. X..X XXXX X... .XXX', -1],
  à: ['.X.. .... .XX. ...X .XXX X..X .XXX', -1],
  ä: ['X..X .... .XX. ...X .XXX X..X .XXX', -1],
  ö: ['X..X .... .XX. X..X X..X X..X .XX.', -1],
  ü: ['X..X .... X..X X..X X..X X..X .XXX', -1],
  ç: ['.XXX X... X... X... .XXX ..X. .X..', 1],
};

const PUNCT: Record<string, [string, number]> = {
  '.': ['X', -1],
  ',': ['X X', 0],
  '!': ['X X X X X . X', -1],
  '?': ['.XXX. X...X ....X ...X. ..X.. ..... ..X..', -1],
  '-': ['XXX', -4],
  "'": ['X X', -6],
  ':': ['X . . . X', -1],
  ';': ['X . . . X X', 0],
  '+': ['.X. XXX .X.', -3],
  '=': ['XXX ... XXX', -3],
  '/': ['..X ..X .X. .X. .X. X.. X..', -1],
};

const MOTIFS: Record<string, [string, number, string]> = {
  'heart-01': ['.XX.XX. XOOXOOX XOOOOOX .XOOOX. ..XOX.. ...X...', -1, 'Heart 7×6'],
  'heart-02': ['.O.O. OOOOO .OOO. ..O..', -1, 'Heart 5×4'],
  'diamond-01': ['..O.. .OXO. OXXXO .OXO. ..O..', -1, 'Diamond 5×5'],
};

function spaces(): Record<string, GlyphDef> {
  const out: Record<string, GlyphDef> = {};
  for (let n = 1; n <= 4; n++) out[spaceKey(n)] = { type: 'space', width: n - 1 };
  return out;
}

function crossFont(): FontFile {
  const glyphs: Record<string, GlyphDef> = {};
  for (const [k, v] of Object.entries(LOWER)) glyphs[k] = art(v[0], v[1]);
  for (const [k, v] of Object.entries(UPPER)) glyphs[k] = art(v);
  for (const [k, v] of Object.entries(DIGITS)) glyphs[k] = art(v);
  for (const [k, v] of Object.entries(PUNCT)) glyphs[k] = art(v[0], v[1]);
  for (const [k, v] of Object.entries(MOTIFS)) glyphs[k] = art(v[0], v[1], 'motif', v[2]);
  Object.assign(glyphs, spaces());
  return {
    schema: FONT_SCHEMA,
    version: FONT_VERSION,
    id: 'sampler',
    name: 'Sampler',
    kind: 'cross',
    metrics: { ascent: 9, descent: 3, xHeight: 5, letterSpacing: 1, lineGap: 0 },
    threads: [...DEFAULT_THREADS],
    symbols: { ...DEFAULT_SYMBOLS },
    glyphs,
    source: { origin: 'handmade', licence: LICENCE },
  };
}

// A 16-segment design on a 4 × 6 cell box. Points: top row y=-6, middle y=-3, baseline y=0.
const P = {
  A: [0, -6],
  B: [2, -6],
  C: [4, -6],
  D: [0, -3],
  E: [2, -3],
  F: [4, -3],
  G: [0, 0],
  H: [2, 0],
  I: [4, 0],
} as const;
type PointName = keyof typeof P;
const SEG: Record<string, [PointName, PointName]> = {
  a1: ['A', 'B'],
  a2: ['B', 'C'],
  f: ['A', 'D'],
  h: ['A', 'E'],
  i: ['B', 'E'],
  j: ['C', 'E'],
  b: ['C', 'F'],
  g1: ['D', 'E'],
  g2: ['E', 'F'],
  e: ['D', 'G'],
  k: ['G', 'E'],
  l: ['E', 'H'],
  m: ['I', 'E'],
  c: ['F', 'I'],
  d1: ['G', 'H'],
  d2: ['H', 'I'],
};
const SEGMENT_GLYPHS: Record<string, string> = {
  A: 'a1 a2 b c f e g1 g2',
  B: 'a1 a2 b c d1 d2 i l g2',
  C: 'a1 a2 f e d1 d2',
  D: 'a1 a2 b c d1 d2 i l',
  E: 'a1 a2 f e g1 d1 d2',
  F: 'a1 a2 f e g1',
  G: 'a1 a2 f e d1 d2 c g2',
  H: 'f e b c g1 g2',
  I: 'a1 a2 i l d1 d2',
  J: 'b c d1 d2 e',
  K: 'f e g1 j m',
  L: 'f e d1 d2',
  M: 'f e h j b c',
  N: 'f e h m c b',
  O: 'a1 a2 b c d1 d2 e f',
  P: 'a1 a2 b f e g1 g2',
  Q: 'a1 a2 b c d1 d2 e f m',
  R: 'a1 a2 b f e g1 g2 m',
  S: 'a1 a2 f g1 g2 c d1 d2',
  T: 'a1 a2 i l',
  U: 'f e d1 d2 c b',
  V: 'f e k j',
  W: 'f e k m c b',
  X: 'h j k m',
  Y: 'h j l',
  Z: 'a1 a2 j k d1 d2',
  '0': 'a1 a2 b c d1 d2 e f j k',
  '1': 'b c',
  '2': 'a1 a2 b g1 g2 e d1 d2',
  '3': 'a1 a2 b g2 c d1 d2',
  '4': 'f g1 g2 b c',
  '5': 'a1 a2 f g1 g2 c d1 d2',
  '6': 'a1 a2 f e d1 d2 c g1 g2',
  '7': 'a1 a2 b c',
  '8': 'a1 a2 b c d1 d2 e f g1 g2',
  '9': 'a1 a2 b c d1 d2 f g1 g2',
  '-': 'g1 g2',
  '+': 'g1 g2 i l',
  '/': 'j k',
  '=': 'g1 g2 d1 d2',
};

function lineGlyph(names: string): GlyphDef {
  const segs: LatticeSegment[] = names.split(' ').map((n) => {
    const [p, q] = SEG[n]!;
    return { x1: P[p][0], y1: P[p][1], x2: P[q][0], y2: P[q][1] };
  });
  const xs = segs.flatMap((s) => [s.x1, s.x2]);
  const minX = Math.min(...xs);
  const width = Math.max(...xs) - minX;
  const shifted = segs.map((s) => ({ x1: s.x1 - minX, y1: s.y1, x2: s.x2 - minX, y2: s.y2 }));
  return { type: 'char', width, lines: segmentsToPolylines(shifted).map((pts) => ({ pts })) };
}

function lineFont(): FontFile {
  const glyphs: Record<string, GlyphDef> = {};
  for (const [k, v] of Object.entries(SEGMENT_GLYPHS)) glyphs[k] = lineGlyph(v);
  glyphs['.'] = { type: 'char', width: 1, lines: [{ pts: [0, -1, 1, -1, 1, 0, 0, 0, 0, -1] }] };
  glyphs["'"] = { type: 'char', width: 0, lines: [{ pts: [0, -6, 0, -5] }] };
  glyphs['!'] = {
    type: 'char',
    width: 1,
    lines: [{ pts: [0, -6, 0, -2] }, { pts: [0, -1, 1, -1, 1, 0, 0, 0, 0, -1] }],
  };
  for (const [k, v] of Object.entries(MOTIFS)) glyphs[k] = art(v[0], v[1], 'motif', v[2]);
  Object.assign(glyphs, spaces());
  return {
    schema: FONT_SCHEMA,
    version: FONT_VERSION,
    id: 'sampler-line',
    name: 'Sampler Line',
    kind: 'backstitch',
    metrics: { ascent: 8, descent: 2, xHeight: 3, letterSpacing: 1, lineGap: 0 },
    threads: [...DEFAULT_THREADS],
    symbols: { ...DEFAULT_SYMBOLS },
    glyphs,
    source: { origin: 'handmade', licence: LICENCE },
  };
}

for (const font of [crossFont(), lineFont()]) {
  font.glyphs = Object.fromEntries(Object.entries(font.glyphs).map(([k, g]) => [k, normaliseGlyph(g)]));
  const issues = validateFont(font);
  if (issues.length)
    throw new Error(`${font.id}:\n${issues.map((i) => `${i.path}: ${i.message}`).join('\n')}`);
  await writeFile(`${OUT}${font.id}.font.json`, serializeFont(font));
  console.log(`${font.id}: ${Object.keys(font.glyphs).length} glyphs`);
}
