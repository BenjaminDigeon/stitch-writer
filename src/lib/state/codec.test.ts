import { describe, expect, it } from 'vitest';
import { decodeDoc, diffDoc, encodeDoc } from './codec.ts';
import { DEFAULTS_V1, sanitizeDoc, type Doc } from './doc.ts';

const doc = (patch: (d: Doc) => void): Doc => {
  const d = structuredClone(DEFAULTS_V1) as Doc;
  patch(d);
  return d;
};

describe('share link codec', () => {
  it('stores only the fields that differ from the defaults', () => {
    const d = doc((x) => {
      x.text = 'Hello';
      x.layout.align = 'left';
    });
    expect(diffDoc(d)).toEqual({ text: 'Hello', layout: { align: 'left' } });
  });

  it('round-trips a document', async () => {
    const d = doc((x) => {
      x.text = 'Bonne fête ♥\nEmma :heart-01:';
      x.fontId = 'acsf-gallant';
      x.threads = ['310', '321'];
      x.dotOverrides = { '3:0:-2': false };
      x.pdf.paper = 'letter';
    });
    const s = await encodeDoc(d);
    expect(s).toMatch(/^1\.[A-Za-z0-9_-]+$/);
    const r = await decodeDoc(s);
    expect(r).toEqual({ ok: true, doc: d });
  });

  it('rejects a newer version and corrupt data', async () => {
    expect(await decodeDoc('2.abc')).toEqual({ ok: false, reason: 'newer-version' });
    expect(await decodeDoc('1.@@@')).toEqual({ ok: false, reason: 'corrupt' });
    expect(await decodeDoc('1.AAAA')).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('decodes a link made with version 1 (fixed fixture)', async () => {
    const r = await decodeDoc('1.q1YqSa0oUbJS8kjNyclXKM8vyklRqgUA');
    expect(r.ok && r.doc.text).toBe('Hello world');
  });

  it('clamps invalid fields', () => {
    const d = sanitizeDoc({ text: 42, layout: { wordSpace: 9, align: 'up' }, pdf: { cellMm: -1 } });
    expect(d.text).toBe('');
    expect(d.layout.wordSpace).toBe(4);
    expect(d.layout.align).toBe(DEFAULTS_V1.layout.align);
    expect(d.pdf.cellMm).toBe(0.5);
  });
});
