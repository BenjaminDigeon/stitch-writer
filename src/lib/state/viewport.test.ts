import { describe, expect, it } from 'vitest';
import { fitViewport, zoomAt } from './viewport.ts';

describe('viewport', () => {
  it('keeps the point under the pointer when it zooms', () => {
    const v = { scale: 10, tx: 5, ty: 7 };
    const z = zoomAt(v, 2, 105, 57);
    // Chart point under (105, 57): ((105-5)/10, (57-7)/10) = (10, 5). It must stay there.
    expect((105 - z.tx) / z.scale).toBeCloseTo(10);
    expect((57 - z.ty) / z.scale).toBeCloseTo(5);
  });

  it('fits and centers the content', () => {
    const v = fitViewport({ w: 100, h: 20 }, { w: 1048, h: 600 }, 24, 28);
    expect(v.scale).toBe(10);
    expect(v.tx).toBe(24);
    expect(v.ty).toBe(200);
  });
});
