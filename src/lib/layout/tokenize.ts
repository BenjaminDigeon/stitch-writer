import type { Font, Shaper } from '../font/font.ts';
import { resolveGlyph, substituteCandidates } from '../font/fallback.ts';
import type { Span, Token } from './types.ts';

export interface TokenizeOptions {
  ligatures: boolean;
  substitute: boolean;
}

export const MOTIF_TOKEN = /:([a-z][a-z0-9-]*):/g;
/** A name that looks like a motif ("heart-07"). Such a name is flagged when the font does not have it. */
const MOTIF_LIKE = /^[a-z]+-\d+$/;
const SPACE = /^[\s\u00a0\u2000-\u200a\u202f\u205f\u3000]$/u;

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

interface Grapheme {
  text: string;
  start: number;
  end: number;
}

function graphemes(text: string, offset: number): Grapheme[] {
  const out: Grapheme[] = [];
  for (const s of segmenter.segment(text)) {
    out.push({ text: s.segment, start: offset + s.index, end: offset + s.index + s.segment.length });
  }
  return out;
}

const isNewline = (g: string) => g === '\n' || g === '\r\n' || g === '\r';
const isSpace = (g: string) => SPACE.test(g) || g === '\t';

/** Shaped path (OpenType fonts): each word is shaped as one run, so that the letters join. */
function tokenizeShaped(
  gs: Grapheme[],
  shaper: Shaper,
  o: TokenizeOptions,
  out: Token[],
  words: { n: number },
): void {
  let text = '';
  // For each UTF-16 unit of `text`: the source span and the original grapheme when it was replaced.
  let map: { src: Span; from?: string; to?: string }[] = [];
  const flush = () => {
    if (!text) return;
    const word = words.n++;
    for (const g of shaper.shape(text)) {
      const m = map[g.srcIndex] ?? map[map.length - 1]!;
      if (g.missing) continue;
      const token: Token = {
        k: 'glyph',
        key: g.key,
        src: m.src,
        shaped: { word, x: g.x, advance: g.advance, dy: g.dy },
      };
      if (m.from) {
        token.substitutedFrom = m.from;
        token.substitutedTo = m.to;
      }
      out.push(token);
    }
    text = '';
    map = [];
  };
  const append = (s: string, src: Span, from?: string) => {
    for (let i = 0; i < s.length; i++) map.push(from ? { src, from, to: s } : { src });
    text += s;
  };
  for (const g of gs) {
    const src: Span = { start: g.start, end: g.end };
    if (isNewline(g.text)) {
      flush();
      out.push({ k: 'newline', src });
    } else if (isSpace(g.text)) {
      flush();
      out.push({ k: 'space', src });
    } else if (/^\p{Cc}$/u.test(g.text)) {
      continue;
    } else if (shaper.supports(g.text)) {
      append(g.text, src);
    } else {
      const sub = o.substitute ? substituteCandidates(g.text).find((c) => shaper.supports(c)) : undefined;
      if (sub) append(sub, src, g.text);
      else {
        flush();
        out.push({ k: 'missing', text: g.text, src });
      }
    }
  }
  flush();
}

function tokenizePlain(
  text: string,
  offset: number,
  font: Font,
  o: TokenizeOptions,
  out: Token[],
  words: { n: number },
): void {
  const gs = graphemes(text, offset);
  if (font.shaper) return tokenizeShaped(gs, font.shaper, o, out, words);
  const maxLig = o.ligatures ? Math.max(0, ...font.ligatures.map((l) => [...l].length)) : 0;
  for (let i = 0; i < gs.length; i++) {
    const g = gs[i]!;
    const src: Span = { start: g.start, end: g.end };
    if (isNewline(g.text)) {
      out.push({ k: 'newline', src });
      continue;
    }
    if (isSpace(g.text)) {
      out.push({ k: 'space', src });
      continue;
    }
    if (/^\p{Cc}$/u.test(g.text)) continue;

    let matched = false;
    for (let n = Math.min(maxLig, gs.length - i); n >= 2; n--) {
      const seq = gs
        .slice(i, i + n)
        .map((x) => x.text)
        .join('')
        .normalize('NFC');
      if (font.ligatures.includes(seq)) {
        out.push({ k: 'glyph', key: seq, src: { start: g.start, end: gs[i + n - 1]!.end } });
        i += n - 1;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const r = resolveGlyph(g.text, font, o.substitute);
    if (!r) {
      out.push({ k: 'missing', text: g.text, src });
      continue;
    }
    for (const key of r.keys) {
      out.push(r.substituted ? { k: 'glyph', key, src, substitutedFrom: g.text } : { k: 'glyph', key, src });
    }
  }
}

/**
 * Splits the text into glyph, motif, space, newline and missing tokens. `motifs` adds motif names
 * that the font itself does not have (a shared motif library).
 */
export function tokenize(
  text: string,
  font: Font,
  o: TokenizeOptions,
  extraMotifs: Iterable<string> = [],
): Token[] {
  const out: Token[] = [];
  const motifs = new Set([...font.motifs, ...extraMotifs]);
  const words = { n: 0 };
  let last = 0;
  for (const m of text.matchAll(MOTIF_TOKEN)) {
    const name = m[1]!;
    const start = m.index;
    const end = start + m[0].length;
    if (motifs.has(name)) {
      tokenizePlain(text.slice(last, start), last, font, o, out, words);
      out.push({ k: 'motif', key: name, src: { start, end } });
      last = end;
    } else if (MOTIF_LIKE.test(name)) {
      tokenizePlain(text.slice(last, start), last, font, o, out, words);
      out.push({ k: 'missing', text: m[0], src: { start, end }, motif: true });
      last = end;
    }
  }
  tokenizePlain(text.slice(last), last, font, o, out, words);
  return out;
}

/** Motif tokens in the text, for the editor (atomic delete, highlight). */
export function motifRanges(text: string): Span[] {
  const out: Span[] = [];
  for (const m of text.matchAll(MOTIF_TOKEN)) out.push({ start: m.index, end: m.index + m[0].length });
  return out;
}
