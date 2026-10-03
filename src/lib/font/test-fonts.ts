import { loadFont, type Font } from './font.ts';
import {
  DEFAULT_SYMBOLS,
  DEFAULT_THREADS,
  FONT_SCHEMA,
  FONT_VERSION,
  type FontFile,
  type GlyphDef,
} from './schema.ts';

/**
 * Builds a font for tests. Each glyph is row strings; the last row sits on the baseline row (-1)
 * unless `bottom` is given: { a: ['.X.', 'XXX'] } or { g: { rows: [...], bottom: 1 } }.
 */
export function makeFont(
  glyphs: Record<
    string,
    string[] | { rows: string[]; bottom?: number; type?: GlyphDef['type']; width?: number }
  >,
  options: Partial<Pick<FontFile, 'metrics' | 'script' | 'aliases'>> & { id?: string } = {},
): Font {
  const defs: Record<string, GlyphDef> = {};
  for (const [key, v] of Object.entries(glyphs)) {
    const spec = Array.isArray(v) ? { rows: v } : v;
    const bottom = spec.bottom ?? -1;
    const width = spec.width ?? [...(spec.rows[0] ?? '')].length;
    const def: GlyphDef = { type: spec.type ?? 'char', width };
    if (spec.rows.length) {
      def.rows = spec.rows;
      def.top = bottom - spec.rows.length + 1;
    }
    defs[key] = def;
  }
  const file: FontFile = {
    schema: FONT_SCHEMA,
    version: FONT_VERSION,
    id: options.id ?? 'test',
    name: 'Test',
    kind: 'cross',
    script: options.script,
    metrics: options.metrics ?? { ascent: 5, descent: 2, xHeight: 3, letterSpacing: 1, lineGap: 0 },
    threads: [...DEFAULT_THREADS],
    symbols: { ...DEFAULT_SYMBOLS },
    glyphs: defs,
    aliases: options.aliases,
    source: { origin: 'handmade', license: 'test' },
  };
  return loadFont(file);
}
