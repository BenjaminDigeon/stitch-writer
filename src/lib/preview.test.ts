import { describe, expect, it } from 'vitest';
import { parsePreview, storageName } from './preview.ts';

describe('parsePreview', () => {
  it('reads the number of a pull request URL', () => {
    const url = 'https://github.com/BenjaminDigeon/stitch-writer/pull/12';
    expect(parsePreview(url)).toEqual({ number: 12, url });
  });

  it('gives null for the main site and for other URLs', () => {
    expect(parsePreview(undefined)).toBeNull();
    expect(parsePreview('')).toBeNull();
    expect(parsePreview('https://github.com/BenjaminDigeon/stitch-writer/issues/12')).toBeNull();
    expect(parsePreview('https://example.com/a/b/pull/12')).toBeNull();
    expect(parsePreview('https://github.com/a/b/pull/12"><script>')).toBeNull();
  });
});

describe('storageName', () => {
  it('keeps the name on the main site', () => {
    expect(storageName('stitch-writer:autosave', null)).toBe('stitch-writer:autosave');
  });

  it('adds the pull request number in a preview', () => {
    const preview = { number: 7, url: 'https://github.com/a/b/pull/7' };
    expect(storageName('stitch-writer:autosave', preview)).toBe('stitch-writer:autosave:pr-7');
  });
});
