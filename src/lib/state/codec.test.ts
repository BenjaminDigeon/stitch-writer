import { describe, expect, it } from 'vitest';
import { decodeDoc, diffDoc, encodeDoc } from './codec.ts';
import { DEFAULTS_V1, DEFAULTS_V2, migrateV1, sanitizeDoc, sanitizeDocV1, type Doc } from './doc.ts';

const doc = (patch: (d: Doc) => void): Doc => {
  const d = structuredClone(DEFAULTS_V2) as Doc;
  patch(d);
  return d;
};

describe('share link codec', () => {
  it('stores only the fields that differ from the defaults', () => {
    const d = doc((x) => {
      x.text = 'Hello';
      x.layout.align = 'left';
      x.coloring.mode = 'word';
    });
    expect(diffDoc(d)).toEqual({ text: 'Hello', layout: { align: 'left' }, coloring: { mode: 'word' } });
  });

  it('round-trips a document', async () => {
    const d = doc((x) => {
      x.text = 'Bonne fête ♥\nEmma :heart-01:';
      x.fontId = 'acsf-gallant';
      x.palette = ['310', '321', '3750'];
      x.accent = '321';
      x.coloring.mode = 'letter';
      x.colorRanges = [{ start: 0, end: 5, color: 2 }];
      x.dotOverrides = { '3:0:-2': false };
      x.pdf.paper = 'letter';
    });
    const s = await encodeDoc(d);
    expect(s).toMatch(/^2\.[A-Za-z0-9_-]+$/);
    const r = await decodeDoc(s);
    expect(r).toEqual({ ok: true, doc: d });
  });

  it('rejects a newer version and corrupt data', async () => {
    expect(await decodeDoc('3.abc')).toEqual({ ok: false, reason: 'newer-version' });
    expect(await decodeDoc('0.abc')).toEqual({ ok: false, reason: 'corrupt' });
    expect(await decodeDoc('2.@@@')).toEqual({ ok: false, reason: 'corrupt' });
    expect(await decodeDoc('2.AAAA')).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('opens a link of version 1 (fixed fixtures)', async () => {
    const plain = await decodeDoc('1.q1YqSa0oUbJS8kjNyclXKM8vyklRqgUA');
    expect(plain.ok && plain.doc).toMatchObject({
      v: 2,
      text: 'Hello world',
      palette: ['3750'],
      accent: '899',
    });

    // {"text":"Hi Emma","threads":["310","321"],"layout":{"align":"left"}}
    const r = await decodeDoc(
      '1.q1YqSa0oUbJS8shUcM3NTVTSUSrJKEpNTClWsopWMjY0AAoYGxkqxeoo5SRW5pcClVYrJeZkpucB9eSkppUo1dYCAA',
    );
    expect(r.ok && r.doc).toMatchObject({
      v: 2,
      text: 'Hi Emma',
      palette: ['310'],
      accent: '321',
      coloring: { mode: 'single' },
      colorRanges: [],
      layout: { align: 'left' },
    });
  });

  it('reads the British values of older documents', () => {
    // Other defaults, so that the result does not come from the defaults.
    const defaults = {
      ...DEFAULTS_V1,
      display: 'both' as const,
      layout: { ...DEFAULTS_V1.layout, align: 'left' as const },
    };
    const d = sanitizeDocV1({ layout: { align: 'centre' }, display: 'colour' }, defaults);
    expect([d.layout.align, d.display]).toEqual(['center', 'color']);
    const v2 = sanitizeDoc({ v: 2, layout: { align: 'centre' }, display: 'colour' });
    expect([v2.layout.align, v2.display]).toEqual(['center', 'color']);
  });

  it('clamps invalid fields', () => {
    const d = sanitizeDoc({ v: 2, text: 42, layout: { wordSpace: 9, align: 'up' }, pdf: { cellMm: -1 } });
    expect(d.text).toBe('');
    expect(d.layout.wordSpace).toBe(4);
    expect(d.layout.align).toBe(DEFAULTS_V2.layout.align);
    expect(d.pdf.cellMm).toBe(0.5);
  });

  it('checks the colors', () => {
    const d = sanitizeDoc({
      v: 2,
      text: 'abcdefgh',
      palette: Array.from({ length: 20 }, (_, i) => String(300 + i)),
      accent: '<b>',
      coloring: { mode: 'rainbow' },
      colorRanges: [
        { start: 4, end: 12, color: 1 },
        { start: 0, end: 2, color: 0 },
        { start: 1, end: 3, color: 2 },
        { start: 3, end: 3, color: 0 },
        { start: 0, end: 1, color: 99 },
        { start: 'a', end: 2, color: 0 },
      ],
    });
    expect(d.palette).toHaveLength(16);
    expect(d.accent).toBe(DEFAULTS_V2.accent);
    expect(d.coloring.mode).toBe('single');
    // Sorted, clipped to the text (8 characters), no overlap, no empty part.
    expect(d.colorRanges).toEqual([
      { start: 0, end: 2, color: 0 },
      { start: 2, end: 3, color: 2 },
      { start: 4, end: 8, color: 1 },
    ]);
    expect(sanitizeDoc({ v: 2, palette: [] }).palette).toEqual(DEFAULTS_V2.palette);
  });

  it('migrates a document of version 1', () => {
    const v1 = { ...structuredClone(DEFAULTS_V1), text: 'Hi', threads: ['310', '321'] };
    expect(migrateV1(v1)).toMatchObject({ v: 2, text: 'Hi', palette: ['310'], accent: '321' });
    expect(sanitizeDoc(v1)).toEqual(migrateV1(v1));
  });
});
