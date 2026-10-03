import * as fontkitModule from '@pdf-lib/fontkit';

/** The parts of the fontkit API that the app uses. */
export interface FkPathCommand {
  command: 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'bezierCurveTo' | 'closePath';
  args: number[];
}

export interface FkGlyph {
  id: number;
  name: string;
  codePoints: number[];
  advanceWidth: number;
  path: { commands: FkPathCommand[]; bbox: { minX: number; minY: number; maxX: number; maxY: number } };
}

export interface FkPosition {
  xAdvance: number;
  yAdvance: number;
  xOffset: number;
  yOffset: number;
}

export interface FkFont {
  unitsPerEm: number;
  numGlyphs: number;
  familyName: string;
  postscriptName: string;
  copyright?: string;
  characterSet: number[];
  availableFeatures: string[];
  hasGlyphForCodePoint(cp: number): boolean;
  glyphForCodePoint(cp: number): FkGlyph;
  getGlyph(id: number): FkGlyph;
  layout(text: string, features?: string[]): { glyphs: FkGlyph[]; positions: FkPosition[] };
}

interface FontkitApi {
  create(bytes: Uint8Array): FkFont;
}

// The package is UMD for Node and an ES module with a default export for bundlers.
const ns = fontkitModule as unknown as { default?: FontkitApi } & Partial<FontkitApi>;
const api: FontkitApi = ns.default ?? (ns as FontkitApi);

export function openFont(bytes: Uint8Array): FkFont {
  return api.create(bytes);
}
