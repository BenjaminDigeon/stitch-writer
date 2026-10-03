# Stitch Writer

Stitch Writer makes a cross-stitch chart from a text. You type the text, and the chart changes at
each key. You can export the chart as a vector PDF to print, as SVG, as PNG, or as OXS (Open Cross
Stitch) for other cross-stitch programs.

Use it online: **https://benjamindigeon.github.io/stitch-writer/**

## Features

- Real keyboard input, with undo, paste and selection. A missing character has a red underline.
  A replaced character (for example "ŏ" stitched as "o") has a dotted underline.
- 9 cursive fonts (ACSF) with joined letters, and 2 sample fonts.
- Motifs (hearts and other shapes). Type `:heart` or use the Insert palette (⌘K / Ctrl+K).
- A live preview: zoom with Ctrl+wheel or a pinch, move with the wheel or a drag, rulers, and centre arrows.
- A vector PDF:
  - A4 or Letter, portrait, landscape or automatic;
  - the cell size in mm, or "Fit on one page";
  - a large chart is cut into pages, with overlap rows and columns;
  - grid numbers that continue across the pages;
  - a cover page with the sizes, a 50 mm calibration ruler, the thread legend and a page map.
- DMC threads: one main colour and one accent colour. The chart shows colour, symbols (black and
  white printing), or both.
- A fabric calculator: Aida 11–18, evenweave or linen over two, the finished size and the size of
  the fabric to cut.
- A share link: the URL keeps the text and all the settings. The app also saves your work in the browser.
- A font editor (`editor.html`):
  - full, half and accent stitches, connector dots, backstitch lines and French knots;
  - undo and redo;
  - import of `.font.json`, `.bdf` (bitmap fonts) and grid-aligned `.ttf`/`.otf` cross-stitch fonts;
  - export as `.font.json`.

## Development

You need Node.js 24 or later.

```sh
npm install
npm run dev          # http://localhost:5173
npm run test         # unit tests (Vitest)
npm run e2e          # browser tests (Playwright; run "npx playwright install chromium" once)
npm run verify       # format check, lint, type check, unit tests, build, browser tests
npm run build        # static site in dist/
```

The build output (`dist/`) is a static site. You can host it on any static web server.
Relative paths are used, so a sub-folder also works.

## Deployment

The GitHub Actions workflow `.github/workflows/deploy.yml` runs the same checks as
`npm run verify` on each pull request and on each push to `main`. After a push to `main`, it
deploys `dist/` to GitHub Pages. The Pages source of the repository must be "GitHub Actions".

## How it works

| Folder               | Content                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/font/`      | The font format (`schema.ts`), validation, the TTF reader (OpenType shaping with fontkit), the BDF reader, the font registry, and the storage of your own fonts (IndexedDB) |
| `src/lib/layout/`    | Text → chart: tokens, placement, alignment, connector dots, stitch counts. Pure functions.                                                                                  |
| `src/lib/scene/`     | A drawing model in mm or cells. It has two back ends: SVG (preview, SVG export) and PDF (pdf-lib).                                                                          |
| `src/lib/export/`    | Page tiling, the PDF document (cover and chart pages), poster (SVG/PNG), OXS                                                                                                |
| `src/lib/state/`     | The document, the share link codec (deflate + base64url, versioned) and the autosave                                                                                        |
| `src/ui/`            | The writer page (Svelte 5)                                                                                                                                                  |
| `src/editor/`        | The font editor page                                                                                                                                                        |
| `src/fonts/samples/` | The sample fonts. `scripts/make-sample-fonts.ts` makes them.                                                                                                                |
| `public/fonts/acsf/` | The ACSF fonts, unchanged, with their licence files                                                                                                                         |

### The font format

A font is a JSON file (`*.font.json`, schema `stitch-writer/font`, version 1):

- Each glyph has an advance width in cells and a list of rows of symbols. For example, `X` is a full
  stitch in the main thread, `O` is in the accent thread, `o` is a connector dot, and `/` and `N`
  are half stitches.
- A glyph can also have backstitch lines (polylines between cell corners) and French knots.
- The coordinates are relative to the baseline: y = 0 is the baseline, and a negative y is above it.

`src/lib/font/schema.ts` and `src/lib/font/validate.ts` give the full definition.

## Licences

The code of this project has no licence file yet. The third-party data and fonts have their own
licences: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
