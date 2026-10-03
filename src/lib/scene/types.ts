/**
 * A device-independent drawing. The SVG back end (preview, SVG download) and the PDF back end draw
 * the same scene, so the preview and the PDF are the same. Units are free: cells for the preview,
 * millimetres for the export. The origin is top-left, and y goes down.
 */

export type Rgb = readonly [number, number, number];

export interface Stroke {
  color: Rgb;
  width: number;
  cap?: 'butt' | 'round' | 'square';
  join?: 'miter' | 'round';
  dash?: number[];
  /** SVG preview only: the width is in screen pixels and does not change with the zoom. */
  nonScaling?: boolean;
}

export type PathOp =
  | ['M', number, number]
  | ['L', number, number]
  | ['C', number, number, number, number, number, number]
  /** A closed rectangle sub-path: x, y, width, height. */
  | ['R', number, number, number, number]
  | ['Z'];

export type SceneNode =
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: Rgb; stroke?: Stroke }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: Stroke }
  | {
      t: 'path';
      ops: PathOp[];
      fill?: Rgb;
      stroke?: Stroke;
      fillRule?: 'nonzero' | 'evenodd';
      className?: string;
    }
  | { t: 'circles'; r: number; centres: number[]; fill: Rgb; className?: string }
  | {
      t: 'text';
      x: number;
      /** The alphabetic baseline. */
      y: number;
      text: string;
      size: number;
      weight?: 'regular' | 'bold';
      anchor?: 'start' | 'middle' | 'end';
      fill?: Rgb;
    }
  | {
      t: 'group';
      tx?: number;
      ty?: number;
      scale?: number;
      clip?: { x: number; y: number; w: number; h: number };
      className?: string;
      children: SceneNode[];
    };

export interface ScenePage {
  w: number;
  h: number;
  children: SceneNode[];
}

export interface SceneDoc {
  title: string;
  pages: ScenePage[];
}

/** Measures text widths for layout. The PDF uses the real font metrics. */
export interface TextMeasure {
  width(text: string, size: number, weight?: 'regular' | 'bold'): number;
}

/** An approximation for tests and for the SVG export: 0.55 em per character. */
export const approxMeasure: TextMeasure = {
  width: (text, size, weight) => [...text].length * size * (weight === 'bold' ? 0.6 : 0.55),
};

export const BLACK: Rgb = [0, 0, 0];
export const WHITE: Rgb = [255, 255, 255];

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? [...h].map((c) => c + c).join('') : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** WCAG relative luminance, 0..1. */
export function luminance([r, g, b]: Rgb): number {
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** Black or white, whichever is easier to read on the colour. */
export const contrastOn = (c: Rgb): Rgb => (luminance(c) > 0.179 ? BLACK : WHITE);
