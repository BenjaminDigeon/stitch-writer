/**
 * The Advanced Cross-Stitch Fonts (ACSF) by P. Baudin, https://github.com/pbaudin/ACSF, release
 * acsf-v1.3. They are distributed unmodified in public/fonts/acsf/ with their licence files
 * (SIL Open Font License 1.1). The app reads them at run time.
 */
export interface AcsfFont {
  id: string;
  name: string;
  /** Path relative to the app base URL. */
  file: string;
}

const make = (name: string, pt: number): AcsfFont => {
  const lower = name.toLowerCase();
  return {
    id: `acsf-${lower}`,
    name: `ACSF ${name}`,
    file: `fonts/acsf/ACSF-${name}/acsf-${lower}-${pt}pt-light.ttf`,
  };
};

export const ACSF_FONTS: readonly AcsfFont[] = [
  make('Adorable', 4),
  make('Brave', 4),
  make('Chic', 5),
  make('Divine', 5),
  make('Expressive', 5),
  make('Festive', 5),
  make('Gallant', 5),
  make('Honorable', 6),
  make('Irresistible', 5),
];

export const ACSF_LICENCE =
  'SIL Open Font License 1.1. © 2017–2024 P. Baudin (ACSF, github.com/pbaudin/ACSF).';
export const ACSF_URL = 'https://github.com/pbaudin/ACSF';
