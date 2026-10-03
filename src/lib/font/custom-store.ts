import { createStore, del, entries, get, set } from 'idb-keyval';
import { loadFont } from './font.ts';
import type { FontEntry } from './registry.ts';
import type { FontFile } from './schema.ts';
import { parseFontFile } from './validate.ts';

/** A font that the user made or imported. It is kept in IndexedDB, in this browser only. */
export type CustomFontRecord =
  | { type: 'json'; id: string; name: string; file: FontFile; updatedAt: number }
  | { type: 'ttf'; id: string; name: string; bytes: Uint8Array; licence: string; updatedAt: number };

const store = typeof indexedDB === 'undefined' ? undefined : createStore('stitch-writer', 'fonts');

export const FONT_CHANNEL = 'stitch-writer-fonts';

export async function listCustomFonts(): Promise<CustomFontRecord[]> {
  if (!store) return [];
  const all = await entries<string, CustomFontRecord>(store);
  return all.map(([, v]) => v).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCustomFont(id: string): Promise<CustomFontRecord | undefined> {
  return store ? get<CustomFontRecord>(id, store) : undefined;
}

export async function putCustomFont(rec: CustomFontRecord): Promise<void> {
  if (!store) throw new Error('This browser cannot keep fonts (no IndexedDB).');
  await set(rec.id, { ...rec, updatedAt: Date.now() }, store);
  notifyFontsChanged(rec.id);
}

export async function deleteCustomFont(id: string): Promise<void> {
  if (!store) return;
  await del(id, store);
  notifyFontsChanged(id);
}

export function notifyFontsChanged(id: string): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const ch = new BroadcastChannel(FONT_CHANNEL);
  ch.postMessage({ type: 'fonts-changed', id });
  ch.close();
}

export const newCustomId = () => `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** The registry entry of a custom font. A TTF font loads the font converter on demand. */
export function customFontEntry(rec: CustomFontRecord): FontEntry {
  return {
    id: rec.id,
    name: rec.name,
    group: 'custom',
    load: async () => {
      if (rec.type === 'json') return loadFont(parseFontFile({ ...rec.file, id: rec.id, name: rec.name }));
      const { loadTtfFont } = await import('./ttf.ts');
      return loadTtfFont(rec.bytes, { id: rec.id, name: rec.name, licence: rec.licence });
    },
  };
}

/** Asks the browser to keep the stored fonts when it is short of space. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
