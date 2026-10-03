/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The GitHub URL of the pull request that a preview build shows. The main site has no value. */
  readonly VITE_PULL_REQUEST_URL?: string;
}
