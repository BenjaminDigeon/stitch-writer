/** A pull request that a preview build shows. */
export interface PreviewInfo {
  number: number;
  url: string;
}

const PULL_REQUEST_URL = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/(\d+)$/;

/** Reads the pull request from its GitHub URL. A missing or unknown URL gives null. */
export function parsePreview(url: string | undefined): PreviewInfo | null {
  if (!url) return null;
  const match = PULL_REQUEST_URL.exec(url);
  return match ? { number: Number(match[1]), url } : null;
}

/**
 * The pull request of this build. The preview workflow sets `VITE_PULL_REQUEST_URL`.
 * The build of the main site has no pull request, so the value is null.
 */
export const PREVIEW = parsePreview(import.meta.env.VITE_PULL_REQUEST_URL);

/**
 * Gives the name of a browser storage area (localStorage key, IndexedDB database, channel).
 * A preview has the same origin as the main site. Thus each preview adds its pull request number,
 * and its work stays apart from the main site and from the other previews.
 */
export function storageName(name: string, preview: PreviewInfo | null = PREVIEW): string {
  return preview ? `${name}:pr-${preview.number}` : name;
}
