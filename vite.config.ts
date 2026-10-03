import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: './',
  plugins: [svelte()],
  // Pre-bundle the export libraries, so that the first export does not reload the dev page.
  optimizeDeps: { include: ['pdf-lib', '@pdf-lib/fontkit'] },
  build: {
    // fontkit (OpenType shaping) is a large chunk, but it loads only when a TTF font is in use.
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      input: {
        main: resolve(root, 'index.html'),
        editor: resolve(root, 'editor.html'),
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
});
