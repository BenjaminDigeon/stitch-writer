import type { Font } from './font.ts';

/** Replacements for characters that the fonts usually do not have. A value can be several glyphs. */
export const SUBSTITUTIONS: Readonly<Record<string, string>> = {
  '’': "'",
  '‘': "'",
  '‚': ',',
  '′': "'",
  '`': "'",
  '´': "'",
  '"': "''",
  '“': "''",
  '”': "''",
  '„': ',,',
  '″': "''",
  '–': '-',
  '—': '-',
  '−': '-',
  '‐': '-',
  '…': '...',
  ß: 'ss',
  æ: 'ae',
  Æ: 'AE',
  œ: 'oe',
  Œ: 'OE',
  ø: 'o',
  Ø: 'O',
  ð: 'd',
  Ð: 'D',
  þ: 'th',
  Þ: 'TH',
  ł: 'l',
  Ł: 'L',
  đ: 'd',
  Đ: 'D',
  ı: 'i',
  '×': 'x',
  '¡': '!',
  '·': '.',
  '•': '.',
};

export interface Resolved {
  keys: string[];
  substituted: boolean;
}

const stripMarks = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');

function direct(g: string, font: Font): string | null {
  if (font.glyphs.has(g)) return g;
  const nfc = g.normalize('NFC');
  if (font.glyphs.has(nfc)) return nfc;
  const alias = font.aliases.get(g) ?? font.aliases.get(nfc);
  if (alias && font.glyphs.has(alias)) return alias;
  return null;
}

/** Replacement candidates for a grapheme, best first: the map, no accents, the other case. */
export function substituteCandidates(g: string): string[] {
  const nfc = g.normalize('NFC');
  const mapped = SUBSTITUTIONS[nfc];
  const stripped = stripMarks(nfc);
  const swap = (s: string) => (s === s.toUpperCase() ? s.toLowerCase() : s.toUpperCase());
  const out = [
    mapped ?? '',
    stripped,
    swap(nfc),
    swap(stripped),
    mapped ? swap(mapped) : '',
    mapped ? stripMarks(mapped) : '',
  ];
  return [...new Set(out.filter((c) => c && c !== g && c !== nfc))];
}

/** Finds the glyph keys for one grapheme. Returns null when the font cannot show it. */
export function resolveGlyph(g: string, font: Font, substitute: boolean): Resolved | null {
  const exact = direct(g, font);
  if (exact) return { keys: [exact], substituted: false };
  if (!substitute) return null;
  for (const c of substituteCandidates(g)) {
    const keys = [...c].map((p) => direct(p, font));
    if (keys.every((k): k is string => k !== null)) return { keys, substituted: true };
  }
  return null;
}
