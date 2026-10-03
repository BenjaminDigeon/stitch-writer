import { describe, expect, it } from 'vitest';
import sample from '../../fonts/samples/sampler.font.json' with { type: 'json' };
import { parseFontFile, upgradeFontFile } from './validate.ts';

describe('older font files', () => {
  it('reads the field "licence" as "license"', () => {
    const { license, ...source } = sample.source;
    const old = { ...sample, source: { ...source, licence: license } };
    expect(parseFontFile(old).source).toEqual(sample.source);
  });

  it('keeps a file that has the field "license"', () => {
    expect(upgradeFontFile(sample)).toBe(sample);
  });
});
