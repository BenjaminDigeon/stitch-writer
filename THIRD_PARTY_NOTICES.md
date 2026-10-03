# Third-party notices

## Fonts

### Advanced Cross-Stitch Fonts (ACSF)

- Files: `public/fonts/acsf/ACSF-*/` (unchanged, from release `acsf-v1.3`)
- Author: P. Baudin, https://github.com/pbaudin/ACSF
- Licence: SIL Open Font License 1.1. A `LICENSE` file is in the folder of each font.
- The fonts have reserved font names. The font editor gives another name to a changed copy.

### Noto Sans

- Files: `src/assets/pdf-fonts/NotoSans-Regular.ttf`, `NotoSans-Bold.ttf`. The PDF export uses
  them for its text.
- Copyright 2022 The Noto Project Authors, https://github.com/notofonts/latin-greek-cyrillic
- Licence: SIL Open Font License 1.1 (`src/assets/pdf-fonts/OFL.txt`)

## Data

### DMC thread colours

- File: `src/data/dmc.json`
- Source: craft-color-codes by MakeBead, https://makebead.com (`data/csv/dmc-floss.csv`)
- Licence: Creative Commons Attribution 4.0 International (CC BY 4.0)
- Credit: "Color data: craft-color-codes by MakeBead (https://makebead.com)". The app shows this
  credit on the PDF cover page.
- DMC is a trademark of its owner. This project is not affiliated with DMC. The colours are approximations.

## Libraries

These libraries are in the build: Svelte (MIT), pdf-lib (MIT), @pdf-lib/fontkit (MIT) and
idb-keyval (Apache-2.0). `package.json` lists all the dependencies.
