import {
  DEFAULT_SYMBOLS,
  DEFAULT_THREADS,
  FONT_SCHEMA,
  FONT_VERSION,
  spaceKey,
  type FontFile,
  type GlyphDef,
} from './schema.ts';
import { cellsToRows, normalizeGlyph, type SymbolCell } from './normalize.ts';

/**
 * Reads a BDF bitmap font (Glyph Bitmap Distribution Format 2.1) as a cross-stitch font:
 * one pixel is one full stitch. The advance (DWIDTH) includes the space between letters,
 * so the letter spacing of the result is 0.
 */
export function parseBdf(text: string, info: { id: string; name?: string }): FontFile {
  const lines = text.split(/\r?\n/);
  const props: Record<string, string> = {};
  let bbox = { w: 0, h: 0, x: 0, y: 0 };
  const glyphs: Record<string, GlyphDef> = {};
  let spaceWidth: number | null = null;
  let i = 0;
  const unquote = (v: string) => v.replace(/^"(.*)"$/, '$1');

  if (!/^STARTFONT\b/.test(lines[0] ?? ''))
    throw new Error('This file is not a BDF font (no STARTFONT line).');
  while (i < lines.length) {
    const line = lines[i++]!.trim();
    const [kw, ...rest] = line.split(/\s+/);
    if (kw === 'FONTBOUNDINGBOX') {
      const [w, h, x, y] = rest.map(Number);
      bbox = { w: w ?? 0, h: h ?? 0, x: x ?? 0, y: y ?? 0 };
    } else if (kw === 'STARTPROPERTIES') {
      while (i < lines.length && !lines[i]!.startsWith('ENDPROPERTIES')) {
        const m = /^(\S+)\s+(.*)$/.exec(lines[i++]!.trim());
        if (m) props[m[1]!] = unquote(m[2]!);
      }
    } else if (kw === 'STARTCHAR') {
      let enc = -1;
      let dwidth = bbox.w;
      let bbx = { ...bbox };
      const rows: string[] = [];
      while (i < lines.length) {
        const l = lines[i++]!.trim();
        const [k, ...v] = l.split(/\s+/);
        if (k === 'ENCODING') enc = Number(v[0]);
        else if (k === 'DWIDTH') dwidth = Number(v[0]);
        else if (k === 'BBX') {
          const [w, h, x, y] = v.map(Number);
          bbx = { w: w ?? 0, h: h ?? 0, x: x ?? 0, y: y ?? 0 };
        } else if (k === 'BITMAP') {
          while (i < lines.length && !lines[i]!.startsWith('ENDCHAR')) rows.push(lines[i++]!.trim());
        } else if (k === 'ENDCHAR') break;
      }
      if (enc === 32) spaceWidth = dwidth;
      if (enc < 33 || (enc >= 0x7f && enc < 0xa0)) continue;
      const cells: SymbolCell[] = [];
      rows.forEach((hex, r) => {
        const bits = hex
          .split('')
          .map((c) => parseInt(c, 16).toString(2).padStart(4, '0'))
          .join('');
        for (let x = 0; x < bbx.w; x++) {
          if (bits[x] === '1') cells.push({ x: bbx.x + x, y: -(bbx.y + bbx.h) + r, symbol: 'X' });
        }
      });
      const def: GlyphDef = { type: 'char', width: Math.max(0, dwidth) };
      const packed = cellsToRows(def.width, cells);
      if (packed) {
        def.top = packed.top;
        if (packed.left) def.left = packed.left;
        def.rows = packed.rows;
      }
      glyphs[String.fromCodePoint(enc)] = normalizeGlyph(def);
    }
  }
  if (!Object.keys(glyphs).length) throw new Error('The BDF font has no glyphs.');

  const ascent = Number(props.FONT_ASCENT ?? bbox.h + bbox.y);
  const descent = Number(props.FONT_DESCENT ?? -bbox.y);
  const xGlyph = glyphs.x;
  const xHeight = Number(
    props.X_HEIGHT ?? (xGlyph?.top !== undefined ? -xGlyph.top : Math.round(ascent / 2)),
  );
  const sw = spaceWidth ?? Math.max(1, Math.round(bbox.w / 2));
  for (let n = 1; n <= 4; n++) glyphs[spaceKey(n)] = { type: 'space', width: sw + n - 1 };

  const license =
    [props.COPYRIGHT, props.NOTICE].filter(Boolean).join(' ') || 'See the license of the BDF file.';
  return {
    schema: FONT_SCHEMA,
    version: FONT_VERSION,
    id: info.id,
    name: info.name ?? props.FAMILY_NAME ?? info.id,
    kind: 'cross',
    metrics: {
      ascent: Math.max(1, ascent),
      descent: Math.max(0, descent),
      xHeight: Math.max(1, xHeight),
      letterSpacing: 0,
      lineGap: 1,
    },
    threads: [...DEFAULT_THREADS],
    symbols: { ...DEFAULT_SYMBOLS },
    glyphs,
    source: { origin: 'imported', license },
  };
}
