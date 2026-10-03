import { describe, expect, it } from 'vitest';
import { remapOverrides } from '../layout/remap.ts';
import { autocompleteQuery, motifSpans, tokenAt } from './editing.ts';

describe('text editing helpers', () => {
  const isMotif = (n: string) => n === 'heart-01';

  it('finds motif tokens and the token at the caret', () => {
    const spans = motifSpans('a :heart-01: b :nope:', isMotif);
    expect(spans).toEqual([{ start: 2, end: 12 }]);
    expect(tokenAt(spans, 12, 'before')).toEqual({ start: 2, end: 12 });
    expect(tokenAt(spans, 2, 'after')).toEqual({ start: 2, end: 12 });
    expect(tokenAt(spans, 5, 'before')).toBeNull();
  });

  it('reads the autocomplete query', () => {
    expect(autocompleteQuery('a :hea', 6)).toEqual({ start: 2, query: 'hea' });
    expect(autocompleteQuery('a :', 3)).toEqual({ start: 2, query: '' });
    expect(autocompleteQuery('10:3', 4)).toBeNull();
    expect(autocompleteQuery(':heart-01:', 10)).toBeNull();
  });

  it('moves the dot overrides with the text', () => {
    const ov = { '0:1:-2': true, '5:0:-3': false, '9:0:-1': true };
    // Insert "XX" at offset 3: the override at 0 stays, the ones at 5 and 9 move by 2.
    expect(remapOverrides('abc def ghi', 'abcXX def ghi', ov)).toEqual({
      '0:1:-2': true,
      '7:0:-3': false,
      '11:0:-1': true,
    });
    // Replace "def" (offsets 4..7): the override at 5 goes away.
    expect(remapOverrides('abc def ghi', 'abc xyz ghi', ov)).toEqual({ '0:1:-2': true, '9:0:-1': true });
  });
});
