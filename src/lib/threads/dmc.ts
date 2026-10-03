import data from '../../data/dmc.json' with { type: 'json' };
import { hexToRgb, type Rgb } from '../scene/types.ts';

export interface Thread {
  /** DMC number, for example "310" or "B5200". */
  id: string;
  name: string;
  hex: string;
  rgb: Rgb;
}

export const DMC_CREDIT: string = data.credit;
export const DMC_LICENCE: string = data.licence;

export const DMC_THREADS: readonly Thread[] = (data.threads as [string, string, string][]).map(
  ([id, name, hex]) => ({
    id,
    name,
    hex: `#${hex}`,
    rgb: hexToRgb(hex),
  }),
);

const byId = new Map(DMC_THREADS.map((t) => [t.id.toLowerCase(), t]));

export function threadById(id: string): Thread | undefined {
  return byId.get(id.trim().toLowerCase());
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Finds threads by number prefix or by name, case and accent insensitive. The number matches come first. */
export function searchThreads(query: string, limit = 50): Thread[] {
  const q = fold(query.trim());
  if (!q) return DMC_THREADS.slice(0, limit);
  const byNumber = DMC_THREADS.filter((t) => fold(t.id).startsWith(q));
  const byName = DMC_THREADS.filter((t) => !fold(t.id).startsWith(q) && fold(t.name).includes(q));
  return [...byNumber, ...byName].slice(0, limit);
}

export const DEFAULT_THREAD_IDS = { main: '3750', accent: '899' } as const;
