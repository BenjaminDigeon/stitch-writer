import { decodeDoc, encodeDoc } from './codec.ts';
import { newDoc, sanitizeDoc, type Doc } from './doc.ts';
import type { AppState } from './app.svelte.ts';

export const AUTOSAVE_KEY = 'stitch-writer:autosave';

function readAutosave(): Doc | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? sanitizeDoc(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeAutosave(doc: Doc): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(doc));
  } catch {
    // Private mode or full storage: the share link in the URL still keeps the work.
  }
}

export interface StartupResult {
  doc: Doc;
  /** The draft that a shared link replaced, if it was different. */
  replacedDraft: Doc | null;
  linkError: 'corrupt' | 'newer-version' | null;
}

/** The start-up order: the share link in the URL, then the autosave, then the defaults. */
export async function readStartupDoc(): Promise<StartupResult> {
  const draft = readAutosave();
  const hash = location.hash.slice(1);
  if (hash) {
    const r = await decodeDoc(hash);
    if (r.ok) {
      const different = draft && JSON.stringify(draft) !== JSON.stringify(r.doc) && draft.text.trim() !== '';
      return { doc: r.doc, replacedDraft: different ? draft : null, linkError: null };
    }
    return { doc: draft ?? newDoc(), replacedDraft: null, linkError: r.reason };
  }
  return { doc: draft ?? newDoc(), replacedDraft: null, linkError: null };
}

/** The current share link. */
export async function shareUrl(doc: Doc): Promise<string> {
  const url = new URL(location.href);
  url.hash = await encodeDoc(doc);
  return url.href;
}

/**
 * Keeps the URL hash and the autosave up to date with the document. Returns a function that stops it.
 * The hash uses history.replaceState, so it does not add history entries.
 */
export function startPersistence(app: AppState): () => void {
  let hashTimer: ReturnType<typeof setTimeout> | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;
  let latest: Doc | null = null;

  const writeHash = async (doc: Doc) => {
    const mine = ++seq;
    const encoded = await encodeDoc(doc);
    if (mine !== seq) return;
    const empty = !doc.text.trim();
    history.replaceState(null, '', empty ? location.pathname + location.search : `#${encoded}`);
  };

  const flush = () => {
    if (!latest) return;
    clearTimeout(hashTimer);
    clearTimeout(saveTimer);
    writeAutosave(latest);
    void writeHash(latest);
  };

  const stopEffect = $effect.root(() => {
    $effect(() => {
      const snap = $state.snapshot(app.doc) as Doc;
      latest = snap;
      clearTimeout(hashTimer);
      clearTimeout(saveTimer);
      hashTimer = setTimeout(() => void writeHash(snap), 300);
      saveTimer = setTimeout(() => writeAutosave(snap), 500);
    });
  });

  const onHide = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  const onHashChange = async () => {
    const hash = location.hash.slice(1);
    if (!hash) return;
    const r = await decodeDoc(hash);
    if (r.ok && JSON.stringify(r.doc) !== JSON.stringify(latest)) {
      app.replaceDoc(r.doc);
      void app.loadFont(r.doc.fontId);
    }
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', flush);
  window.addEventListener('hashchange', onHashChange);
  return () => {
    stopEffect();
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', flush);
    window.removeEventListener('hashchange', onHashChange);
  };
}
