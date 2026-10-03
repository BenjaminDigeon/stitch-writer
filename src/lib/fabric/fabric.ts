import type { LatticeRect } from '../layout/types.ts';

export interface FabricPreset {
  id: string;
  label: string;
  count: number;
  /** Evenweave or linen: one stitch covers two threads. */
  overTwo: boolean;
}

export const FABRIC_PRESETS: readonly FabricPreset[] = [
  { id: 'aida-11', label: 'Aida 11', count: 11, overTwo: false },
  { id: 'aida-14', label: 'Aida 14', count: 14, overTwo: false },
  { id: 'aida-16', label: 'Aida 16', count: 16, overTwo: false },
  { id: 'aida-18', label: 'Aida 18', count: 18, overTwo: false },
  { id: 'evenweave-28', label: 'Evenweave 28 (over two)', count: 28, overTwo: true },
  { id: 'evenweave-32', label: 'Evenweave 32 (over two)', count: 32, overTwo: true },
  { id: 'linen-36', label: 'Linen 36 (over two)', count: 36, overTwo: true },
];

export interface FabricSettings {
  count: number;
  overTwo: boolean;
  /** Fabric around the design, on each side. */
  marginMm: number;
  units: 'cm' | 'in';
}

export const DEFAULT_FABRIC: Readonly<FabricSettings> = Object.freeze({
  count: 14,
  overTwo: false,
  marginMm: 75,
  units: 'cm',
});

export const stitchesPerInch = (f: Pick<FabricSettings, 'count' | 'overTwo'>) =>
  f.overTwo ? f.count / 2 : f.count;

export interface FabricSize {
  stitches: { w: number; h: number };
  designMm: { w: number; h: number };
  cutMm: { w: number; h: number };
}

/** The finished size of the design and the size of the fabric to cut (rounded up to 0.5 cm or 1/4 in). */
export function fabricSize(design: LatticeRect, f: FabricSettings): FabricSize {
  const w = Math.max(0, Math.ceil(design.x1) - Math.floor(design.x0));
  const h = Math.max(0, Math.ceil(design.y1) - Math.floor(design.y0));
  const mmPerStitch = 25.4 / stitchesPerInch(f);
  const designMm = { w: w * mmPerStitch, h: h * mmPerStitch };
  const step = f.units === 'cm' ? 5 : 25.4 / 4;
  const up = (v: number) => Math.ceil(v / step - 1e-9) * step;
  const cutMm = { w: up(designMm.w + 2 * f.marginMm), h: up(designMm.h + 2 * f.marginMm) };
  return { stitches: { w, h }, designMm, cutMm };
}

export const backstitchLengthMm = (cells: number, f: Pick<FabricSettings, 'count' | 'overTwo'>) =>
  (cells * 25.4) / stitchesPerInch(f);

/** "15.2 × 2.5 cm" or "6 × 1 in". */
export function formatSize(mm: { w: number; h: number }, units: 'cm' | 'in'): string {
  if (units === 'in') {
    const f = (v: number) => (Math.round((v / 25.4) * 100) / 100).toString();
    return `${f(mm.w)} × ${f(mm.h)} in`;
  }
  const f = (v: number) => (Math.round(v) / 10).toFixed(1);
  return `${f(mm.w)} × ${f(mm.h)} cm`;
}
