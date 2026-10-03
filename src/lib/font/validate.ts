import { EMPTY_CELL, FONT_SCHEMA, FONT_VERSION, type FontFile } from './schema.ts';

export interface ValidationIssue {
  path: string;
  message: string;
}

const GLYPH_TYPES = new Set(['char', 'ligature', 'motif', 'space']);
const KINDS = new Set(['cross', 'backstitch', 'mixed']);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isHalfStep = (v: number) => Number.isFinite(v) && Number.isInteger(v * 2);

/** How far (in cells) stitches can go outside the advance box. */
const MAX_OVERHANG = 4;

/** Checks the structure of a font file. An empty result means that the file is valid. */
export function validateFont(raw: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fail = (path: string, message: string) => issues.push({ path, message });

  if (!isObject(raw)) return [{ path: '', message: 'The font file must be a JSON object.' }];
  if (raw.schema !== FONT_SCHEMA) fail('schema', `Expected "${FONT_SCHEMA}".`);
  if (raw.version !== FONT_VERSION) fail('version', `Expected ${FONT_VERSION}.`);
  if (typeof raw.id !== 'string' || !/^[a-z0-9][a-z0-9:_-]*$/.test(raw.id))
    fail('id', 'Use lowercase letters, digits, "-", "_" or ":".');
  if (typeof raw.name !== 'string' || !raw.name.trim()) fail('name', 'The name is empty.');
  if (!KINDS.has(raw.kind as string)) fail('kind', 'Expected cross, backstitch or mixed.');

  const m = raw.metrics;
  if (!isObject(m)) fail('metrics', 'Missing metrics.');
  else {
    for (const k of ['ascent', 'descent', 'xHeight', 'letterSpacing', 'lineGap']) {
      if (!isInt(m[k]) || (m[k] as number) < 0) fail(`metrics.${k}`, 'Expected an integer of 0 or more.');
    }
  }

  if (!Array.isArray(raw.threads) || raw.threads.length === 0)
    fail('threads', 'Expected at least one thread.');
  const threadCount = Array.isArray(raw.threads) ? raw.threads.length : 0;

  const symbols = isObject(raw.symbols) ? raw.symbols : {};
  if (!isObject(raw.symbols)) fail('symbols', 'Missing symbol legend.');
  for (const [key, sym] of Object.entries(symbols)) {
    if ([...key].length !== 1 || key === EMPTY_CELL)
      fail(`symbols.${key}`, 'A symbol key is one character, not ".".');
    if (!isObject(sym)) {
      fail(`symbols.${key}`, 'Expected an object.');
      continue;
    }
    if (sym.type !== 'full' && sym.type !== 'half') fail(`symbols.${key}.type`, 'Expected full or half.');
    if (sym.type === 'half' && sym.dir !== '/' && sym.dir !== '\\')
      fail(`symbols.${key}.dir`, 'Expected "/" or "\\".');
    if (!isInt(sym.thread) || sym.thread < 0 || sym.thread >= threadCount)
      fail(`symbols.${key}.thread`, 'Unknown thread.');
  }

  if (!isObject(raw.glyphs)) {
    fail('glyphs', 'Missing glyphs.');
    return issues;
  }
  for (const [key, g] of Object.entries(raw.glyphs)) {
    const p = `glyphs[${JSON.stringify(key)}]`;
    if (!isObject(g)) {
      fail(p, 'Expected an object.');
      continue;
    }
    if (!GLYPH_TYPES.has(g.type as string)) fail(`${p}.type`, 'Unknown glyph type.');
    if (!isInt(g.width) || g.width < 0) {
      fail(`${p}.width`, 'Expected an integer of 0 or more.');
      continue;
    }
    const width = g.width;
    if (g.rows !== undefined) {
      if (!Array.isArray(g.rows)) fail(`${p}.rows`, 'Expected an array of strings.');
      else {
        if (!isInt(g.top)) fail(`${p}.top`, 'A glyph with rows needs an integer "top".');
        if (g.left !== undefined && !isInt(g.left)) fail(`${p}.left`, 'Expected an integer.');
        const rowLength = typeof g.rows[0] === 'string' ? [...g.rows[0]].length : 0;
        g.rows.forEach((row, r) => {
          if (typeof row !== 'string') return fail(`${p}.rows[${r}]`, 'Expected a string.');
          const chars = [...row];
          if (chars.length !== rowLength)
            fail(`${p}.rows[${r}]`, `Length ${chars.length}, expected ${rowLength}.`);
          for (const ch of chars) {
            if (ch !== EMPTY_CELL && !(ch in symbols)) fail(`${p}.rows[${r}]`, `Unknown symbol "${ch}".`);
          }
        });
      }
    }
    if (g.lines !== undefined) {
      if (!Array.isArray(g.lines)) fail(`${p}.lines`, 'Expected an array.');
      else {
        g.lines.forEach((line, i) => {
          const lp = `${p}.lines[${i}]`;
          if (!isObject(line) || !Array.isArray(line.pts)) return fail(lp, 'Expected { pts: number[] }.');
          const pts = line.pts as unknown[];
          if (pts.length < 4 || pts.length % 2 !== 0) fail(`${lp}.pts`, 'Expected at least 2 points.');
          pts.forEach((v, j) => {
            if (typeof v !== 'number' || !isHalfStep(v))
              return fail(`${lp}.pts[${j}]`, 'Expected a multiple of 0.5.');
            if (j % 2 === 0 && (v < -MAX_OVERHANG || v > width + MAX_OVERHANG)) {
              fail(`${lp}.pts[${j}]`, `x is too far outside [0, ${width}].`);
            }
          });
          if (line.thread !== undefined && (!isInt(line.thread) || line.thread >= threadCount)) {
            fail(`${lp}.thread`, 'Unknown thread.');
          }
        });
      }
    }
    if (g.knots !== undefined) {
      if (!Array.isArray(g.knots)) fail(`${p}.knots`, 'Expected an array.');
      else {
        g.knots.forEach((k, i) => {
          if (
            !isObject(k) ||
            typeof k.x !== 'number' ||
            typeof k.y !== 'number' ||
            !isHalfStep(k.x) ||
            !isHalfStep(k.y)
          ) {
            fail(`${p}.knots[${i}]`, 'Expected { x, y } with multiples of 0.5.');
          }
        });
      }
    }
  }
  return issues;
}

/** Parses and validates a font file. It throws an error with all issues if the file is not valid. */
/**
 * Reads the older form of a font file. Older files have the field `source.licence` (British
 * spelling): it becomes `source.license`.
 */
export function upgradeFontFile<T>(raw: T): T {
  if (!raw || typeof raw !== 'object') return raw;
  const source = (raw as { source?: unknown }).source;
  if (!source || typeof source !== 'object') return raw;
  const { licence, ...rest } = source as Record<string, unknown>;
  if (typeof licence !== 'string' || 'license' in rest) return raw;
  return { ...raw, source: { ...rest, license: licence } };
}

export function parseFontFile(input: unknown): FontFile {
  const raw = upgradeFontFile(input);
  const issues = validateFont(raw);
  if (issues.length) {
    const list = issues
      .slice(0, 20)
      .map((i) => `${i.path}: ${i.message}`)
      .join('\n');
    throw new Error(`The font file is not valid:\n${list}`);
  }
  return raw as FontFile;
}
