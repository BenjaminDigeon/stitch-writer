import { DEFAULTS_V1, DEFAULTS_V2, sanitizeDoc, type Doc } from './doc.ts';

/**
 * The share link format: `2.` + base64url(deflate-raw(JSON of the fields that differ from DEFAULTS_V2)).
 * A link of version 1 stores the differences from DEFAULTS_V1. It opens as a document of version 2.
 */
export const CODEC_VERSION = 2;

const DEFAULTS_BY_VERSION: Record<number, object> = { 1: DEFAULTS_V1, 2: DEFAULTS_V2 };

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** The fields of `doc` that differ from `base`, one level deep inside the sections. */
export function diffDoc(doc: Doc, base: Doc = DEFAULTS_V2): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc) as [keyof Doc, unknown][]) {
    if (k === 'v') continue;
    const b = base[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' && !Array.isArray(b)) {
      const sub: Record<string, unknown> = {};
      for (const [sk, sv] of Object.entries(v)) {
        if (JSON.stringify(sv) !== JSON.stringify((b as Record<string, unknown>)[sk])) sub[sk] = sv;
      }
      if (Object.keys(sub).length) out[k] = sub;
    } else if (JSON.stringify(v) !== JSON.stringify(b)) {
      out[k] = v;
    }
  }
  return out;
}

function mergeOnto(base: object, diff: Record<string, unknown>): unknown {
  const out: Record<string, unknown> = structuredClone(base) as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(diff)) {
    if (k === 'v') continue;
    const b = out[k];
    if (
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      b &&
      typeof b === 'object' &&
      !Array.isArray(b) &&
      k !== 'dotOverrides'
    ) {
      out[k] = { ...(b as object), ...(v as object) };
    } else out[k] = v;
  }
  return out;
}

export async function encodeDoc(doc: Doc): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(diffDoc(doc)));
  return `${CODEC_VERSION}.${toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))}`;
}

export type DecodeResult = { ok: true; doc: Doc } | { ok: false; reason: 'corrupt' | 'newer-version' };

export async function decodeDoc(s: string): Promise<DecodeResult> {
  const m = /^(\d+)\.([A-Za-z0-9_-]*)$/.exec(s.trim());
  if (!m) return { ok: false, reason: 'corrupt' };
  const version = Number(m[1]);
  if (version > CODEC_VERSION) return { ok: false, reason: 'newer-version' };
  const defaults = DEFAULTS_BY_VERSION[version];
  if (!defaults) return { ok: false, reason: 'corrupt' };
  try {
    const bytes = await pipe(fromBase64Url(m[2]!), new DecompressionStream('deflate-raw'));
    const diff = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!diff || typeof diff !== 'object' || Array.isArray(diff)) return { ok: false, reason: 'corrupt' };
    return { ok: true, doc: sanitizeDoc(mergeOnto(defaults, diff as Record<string, unknown>)) };
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
}
