import { ACSF_FONTS, ACSF_LICENSE, ACSF_URL } from './acsf.ts';
import { loadFont, type Font, type Glyph } from './font.ts';
import type { FontFile } from './schema.ts';
import { parseFontFile } from './validate.ts';

export type FontGroup = 'built-in' | 'custom';

export interface FontEntry {
  id: string;
  name: string;
  group: FontGroup;
  load: () => Promise<Font>;
}

const sampleLoaders = import.meta.glob<FontFile>('/src/fonts/samples/*.font.json', { import: 'default' });

const cache = new Map<string, Promise<Font>>();

function cached(id: string, make: () => Promise<Font>): () => Promise<Font> {
  return () => {
    let p = cache.get(id);
    if (!p) {
      p = make();
      p.catch(() => cache.delete(id));
      cache.set(id, p);
    }
    return p;
  };
}

const SAMPLE_NAMES: Record<string, string> = { sampler: 'Sampler', 'sampler-line': 'Sampler Line' };

const sampleEntries: FontEntry[] = Object.entries(sampleLoaders).map(([path, loader]) => {
  const id = path
    .split('/')
    .pop()!
    .replace(/\.font\.json$/, '');
  return {
    id,
    name: SAMPLE_NAMES[id] ?? id,
    group: 'built-in',
    load: cached(id, async () => loadFont(parseFontFile(await loader()))),
  };
});

const acsfEntries: FontEntry[] = ACSF_FONTS.map((f) => ({
  id: f.id,
  name: f.name,
  group: 'built-in',
  load: cached(f.id, async () => {
    const [{ loadTtfFont }, bytes] = await Promise.all([
      import('./ttf.ts'),
      fetch(new URL(f.file, document.baseURI)).then((r) => {
        if (!r.ok) throw new Error(`Cannot load ${f.file}: HTTP ${r.status}`);
        return r.arrayBuffer();
      }),
    ]);
    return loadTtfFont(new Uint8Array(bytes), {
      id: f.id,
      name: f.name,
      license: ACSF_LICENSE,
      url: ACSF_URL,
    });
  }),
}));

/** The fonts that come with the app: the ACSF fonts first, then the samples. */
export const BUILTIN_FONTS: readonly FontEntry[] = [...acsfEntries, ...sampleEntries];

export const DEFAULT_FONT_ID = 'acsf-brave';

/** Registers a font that is already in memory (a custom font from the editor or a shared link). */
export function registerFont(font: Font): void {
  cache.set(font.id, Promise.resolve(font));
}

export function forgetFont(id: string): void {
  cache.delete(id);
}

export async function loadFontById(id: string, extra: readonly FontEntry[] = []): Promise<Font | null> {
  const hit = cache.get(id);
  if (hit) return hit;
  const e = BUILTIN_FONTS.find((f) => f.id === id) ?? extra.find((f) => f.id === id);
  return e ? e.load() : null;
}

/** The shared motif library: the motifs of the Sampler font, usable with every font. */
export async function loadMotifLibrary(): Promise<ReadonlyMap<string, Glyph>> {
  const sampler = sampleEntries.find((e) => e.id === 'sampler');
  if (!sampler) return new Map();
  const font = await sampler.load();
  return new Map(font.motifs.map((k) => [k, font.glyphs.get(k)!]));
}
