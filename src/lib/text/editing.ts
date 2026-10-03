import { MOTIF_TOKEN } from '../layout/tokenize.ts';
import type { Span } from '../layout/types.ts';

/** The motif tokens (":name:") of the text, when `isMotif` accepts the name. */
export function motifSpans(text: string, isMotif: (name: string) => boolean): Span[] {
  const out: Span[] = [];
  for (const m of text.matchAll(MOTIF_TOKEN)) {
    if (isMotif(m[1]!)) out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** The token that ends at the caret (for Backspace) or starts at the caret (for Delete). */
export function tokenAt(spans: readonly Span[], caret: number, side: 'before' | 'after'): Span | null {
  return spans.find((s) => (side === 'before' ? s.end === caret : s.start === caret)) ?? null;
}

/** The token that contains the caret strictly inside it. */
export function tokenAround(spans: readonly Span[], caret: number): Span | null {
  return spans.find((s) => s.start < caret && caret < s.end) ?? null;
}

/** The motif name that the user is typing at the caret (":hea|" gives "hea"), or null. */
export function autocompleteQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = /:([a-z][a-z0-9-]*)?$/.exec(before);
  if (!m) return null;
  const start = m.index;
  // A colon that closes a token (":heart-01:") does not start a new one.
  const prefix = before.slice(0, start);
  const opened = (prefix.match(/:[a-z][a-z0-9-]*$/) ?? null) !== null;
  if (opened) return null;
  return { start, query: m[1] ?? '' };
}
