import type { Font } from './font.ts';

/** Characters for the insert palette, in groups. The palette shows only those that the font has. */
export const CHARACTER_GROUPS: readonly { name: string; chars: string }[] = [
  { name: 'Punctuation', chars: `.,;:!?¡¿'’"-–()/\\&@*#%_~…` },
  { name: 'Symbols', chars: '+=×±°€$£©†♥' },
  { name: 'Accents', chars: 'àáâãäåæçèéêëìíîïñòóôõöøœšùúûüýÿžčďěňřťůőűŏņųūß' },
  { name: 'Capital accents', chars: 'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØŒŠÙÚÛÜÝŸŽČĎĚŇŘŤŮŐŰÐẞ' },
];

/** True when the font draws the character itself (without a replacement). */
export function fontHas(font: Font, ch: string): boolean {
  if (font.shaper) return font.shaper.supports(ch);
  const nfc = ch.normalize('NFC');
  return font.glyphs.has(ch) || font.glyphs.has(nfc) || font.aliases.has(nfc);
}
