import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cellForOnePage, planTiles, type TilePlan } from './tiling.ts';

const base = {
  paper: 'a4',
  orientation: 'portrait',
  cellMm: 3,
  overlap: 2,
  marginMm: 10,
  snapTo10: false,
} as const;

describe('page tiling', () => {
  it('puts a small chart on one page', () => {
    const plan = planTiles({ width: 40, height: 20 }, base) as TilePlan;
    expect(plan.tiles).toHaveLength(1);
    expect(plan.tiles[0]).toMatchObject({ x0: 0, y0: 0, x1: 40, y1: 20, page: 1 });
  });

  it('cuts a wide chart into columns with the overlap', () => {
    const plan = planTiles({ width: 150, height: 20 }, base) as TilePlan;
    expect(plan.nx).toBeGreaterThan(1);
    const [a, b] = plan.tiles;
    expect(b!.x0).toBe(a!.x1 - 2);
    expect(b!.overlapLeft).toBe(2);
    expect(plan.tiles.at(-1)!.x1).toBe(150);
  });

  it('chooses the orientation with fewer pages in auto mode', () => {
    const plan = planTiles({ width: 150, height: 30 }, { ...base, orientation: 'auto' }) as TilePlan;
    expect(plan.orientation).toBe('landscape');
  });

  it('reports a cell that is too large', () => {
    expect(planTiles({ width: 10, height: 10 }, { ...base, cellMm: 200 })).toEqual({
      error: 'cell-too-large',
    });
  });

  it('finds the cell size for one page', () => {
    const c = cellForOnePage({ width: 300, height: 40 }, { ...base, orientation: 'auto' });
    const plan = planTiles(
      { width: 300, height: 40 },
      { ...base, orientation: 'auto', cellMm: c },
    ) as TilePlan;
    expect(plan.tiles).toHaveLength(1);
    expect(c).toBeLessThan(1);
  });

  it('covers every cell, and neighbor pages share exactly the overlap', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 400 }),
        fc.integer({ min: 1, max: 400 }),
        fc.integer({ min: 20, max: 60 }),
        fc.integer({ min: 0, max: 5 }),
        fc.boolean(),
        (w, h, cellTenths, overlap, snap) => {
          const plan = planTiles(
            { width: w, height: h },
            { ...base, cellMm: cellTenths / 10, overlap, snapTo10: snap },
          );
          if ('error' in plan) return true;
          const covered = new Set<number>();
          for (const t of plan.tiles) {
            for (let y = t.y0; y < t.y1; y++) for (let x = t.x0; x < t.x1; x++) covered.add(y * w + x);
            expect(t.x1 - t.x0).toBeLessThanOrEqual(plan.colsPerPage);
            expect(t.y1 - t.y0).toBeLessThanOrEqual(plan.rowsPerPage);
          }
          expect(covered.size).toBe(w * h);
          for (const t of plan.tiles) {
            const right = plan.tiles.find((u) => u.row === t.row && u.col === t.col + 1);
            if (right) expect(t.x1 - right.x0).toBe(overlap);
          }
          return true;
        },
      ),
      { numRuns: 300 },
    );
  });
});
