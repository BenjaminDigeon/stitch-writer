import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { rangeAt, type ColorRange } from './color.ts';
import { normalizeRanges, paintRange, shiftRanges, textEdit } from './ranges.ts';

const r = (start: number, end: number, color: number): ColorRange => ({ start, end, color });

/** The ranges are sorted, do not overlap, are not empty, and stay inside a text of this length. */
function expectValid(ranges: ColorRange[], length: number) {
  ranges.forEach((x, i) => {
    expect(x.start).toBeGreaterThanOrEqual(0);
    expect(x.end).toBeGreaterThan(x.start);
    expect(x.end).toBeLessThanOrEqual(length);
    if (i > 0) expect(x.start).toBeGreaterThanOrEqual(ranges[i - 1]!.end);
  });
}

const textAndRanges = fc.string({ maxLength: 40 }).chain((text) =>
  fc.array(fc.tuple(fc.nat(text.length), fc.nat(text.length), fc.nat(5)), { maxLength: 6 }).map((list) => ({
    text,
    ranges: list.reduce<ColorRange[]>(
      (acc, [a, b, c]) => paintRange(acc, Math.min(a, b), Math.max(a, b), c),
      [],
    ),
  })),
);

describe('paintRange', () => {
  it('cuts a range in two around a new color', () => {
    expect(paintRange([r(0, 10, 1)], 3, 5, 2)).toEqual([r(0, 3, 1), r(3, 5, 2), r(5, 10, 1)]);
  });

  it('gives the text back to the automatic colors', () => {
    expect(paintRange([r(0, 10, 1)], 3, 5, null)).toEqual([r(0, 3, 1), r(5, 10, 1)]);
    expect(paintRange([r(2, 4, 1)], 0, 10, null)).toEqual([]);
  });

  it('joins the ranges of the same color that touch', () => {
    expect(paintRange([r(0, 3, 1)], 3, 6, 1)).toEqual([r(0, 6, 1)]);
  });

  it('keeps the ranges valid, and the painted text has the new color', () => {
    fc.assert(
      fc.property(textAndRanges, fc.nat(40), fc.nat(40), fc.option(fc.nat(5)), (t, a, b, c) => {
        const [s, e] = [Math.min(a, b, t.text.length), Math.min(Math.max(a, b), t.text.length)];
        const out = paintRange(t.ranges, s, e, c);
        expectValid(out, t.text.length);
        for (let i = 0; i < t.text.length; i++) {
          const want = i >= s && i < e ? c : (rangeAt(t.ranges, i)?.color ?? null);
          expect(rangeAt(out, i)?.color ?? null).toBe(want);
        }
      }),
    );
  });
});

describe('shiftRanges', () => {
  const ranges = [r(4, 8, 1)];
  it('grows a range when the new text is inside it or just after it', () => {
    expect(shiftRanges(ranges, { start: 6, removed: 0, inserted: 2 })).toEqual([r(4, 10, 1)]);
    expect(shiftRanges(ranges, { start: 8, removed: 0, inserted: 2 })).toEqual([r(4, 10, 1)]);
  });

  it('moves a range, without growing it, when the new text is just before it', () => {
    expect(shiftRanges(ranges, { start: 4, removed: 0, inserted: 2 })).toEqual([r(6, 10, 1)]);
    expect(shiftRanges(ranges, { start: 0, removed: 1, inserted: 0 })).toEqual([r(3, 7, 1)]);
  });

  it('makes a range shorter when some of it is deleted, and removes an empty range', () => {
    expect(shiftRanges(ranges, { start: 5, removed: 2, inserted: 0 })).toEqual([r(4, 6, 1)]);
    expect(shiftRanges(ranges, { start: 2, removed: 8, inserted: 0 })).toEqual([]);
  });

  it('gives the color of the range to the text that replaces a part of it', () => {
    expect(shiftRanges(ranges, { start: 5, removed: 2, inserted: 1 })).toEqual([r(4, 7, 1)]);
  });

  it('grows only the first of two ranges that touch', () => {
    expect(shiftRanges([r(0, 4, 1), r(4, 8, 2)], { start: 4, removed: 0, inserted: 1 })).toEqual([
      r(0, 5, 1),
      r(5, 9, 2),
    ]);
  });

  it('keeps the ranges valid after any edit', () => {
    fc.assert(
      fc.property(textAndRanges, fc.nat(40), fc.nat(40), fc.string({ maxLength: 8 }), (t, a, n, ins) => {
        const start = Math.min(a, t.text.length);
        const removed = Math.min(n, t.text.length - start);
        const next = t.text.slice(0, start) + ins + t.text.slice(start + removed);
        expectValid(shiftRanges(t.ranges, { start, removed, inserted: ins.length }), next.length);
      }),
    );
  });
});

describe('textEdit', () => {
  it('uses the caret to find where a repeated letter was typed', () => {
    expect(textEdit('aa', 'aaa', 2)).toEqual({ start: 1, removed: 0, inserted: 1 });
    expect(textEdit('aa', 'aaa')).toEqual({ start: 2, removed: 0, inserted: 1 });
    expect(textEdit('abc', 'ac', 1)).toEqual({ start: 1, removed: 1, inserted: 0 });
  });

  it('describes the change exactly', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 30 }),
        fc.nat(30),
        fc.nat(30),
        fc.string({ maxLength: 6 }),
        (prev, a, n, ins) => {
          const start = Math.min(a, prev.length);
          const removed = Math.min(n, prev.length - start);
          const next = prev.slice(0, start) + ins + prev.slice(start + removed);
          for (const caret of [undefined, start + ins.length]) {
            const e = textEdit(prev, next, caret);
            expect(
              prev.slice(0, e.start) +
                next.slice(e.start, e.start + e.inserted) +
                prev.slice(e.start + e.removed),
            ).toBe(next);
            if (caret !== undefined) expect(e.start + e.inserted).toBe(caret);
          }
        },
      ),
    );
  });
});

describe('normalizeRanges', () => {
  it('sorts, removes the empty ranges and joins the touching ranges of one color', () => {
    expect(normalizeRanges([r(5, 6, 1), r(0, 2, 1), r(2, 2, 3), r(2, 5, 1)])).toEqual([r(0, 6, 1)]);
  });
});
