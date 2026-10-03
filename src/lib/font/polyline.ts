/** A straight segment between two lattice points, in cells. */
export interface LatticeSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Joins segments into polylines. Chains pass through vertices of degree 2; collinear inner
 * vertices are removed. The output order is stable.
 */
export function segmentsToPolylines(segments: readonly LatticeSegment[]): number[][] {
  const key = (x: number, y: number) => `${x},${y}`;
  const adj = new Map<string, Set<number>>();
  segments.forEach((s, i) => {
    for (const k of [key(s.x1, s.y1), key(s.x2, s.y2)]) {
      if (!adj.has(k)) adj.set(k, new Set());
      adj.get(k)!.add(i);
    }
  });
  const used = new Set<number>();
  const other = (s: LatticeSegment, x: number, y: number): [number, number] =>
    s.x1 === x && s.y1 === y ? [s.x2, s.y2] : [s.x1, s.y1];
  const walk = (startX: number, startY: number, first: number): number[] => {
    const pts = [startX, startY];
    let x = startX;
    let y = startY;
    let seg: number | undefined = first;
    while (seg !== undefined) {
      used.add(seg);
      [x, y] = other(segments[seg]!, x, y);
      pts.push(x, y);
      const next: number[] = [...adj.get(key(x, y))!].filter((i) => !used.has(i));
      seg = adj.get(key(x, y))!.size === 2 && next.length === 1 ? next[0] : undefined;
    }
    return pts;
  };
  const lines: number[][] = [];
  const vertices = [...adj.keys()].sort((a, b) => {
    const [ax, ay] = a.split(',').map(Number) as [number, number];
    const [bx, by] = b.split(',').map(Number) as [number, number];
    return ay - by || ax - bx;
  });
  // Start at the ends and at the junctions first, then close the remaining loops.
  for (const pass of [true, false]) {
    for (const v of vertices) {
      const edges = adj.get(v)!;
      if (pass && edges.size === 2) continue;
      const [x, y] = v.split(',').map(Number) as [number, number];
      for (const e of [...edges].sort((a, b) => a - b)) {
        if (!used.has(e)) lines.push(walk(x, y, e));
      }
    }
  }
  return lines.map(simplifyPolyline);
}

/** Removes the inner points where the polyline goes straight on. */
export function simplifyPolyline(pts: number[]): number[] {
  if (pts.length <= 4) return pts;
  const out = [pts[0]!, pts[1]!];
  for (let i = 2; i < pts.length - 2; i += 2) {
    const ax = out[out.length - 2]!;
    const ay = out[out.length - 1]!;
    const bx = pts[i]!;
    const by = pts[i + 1]!;
    const cx = pts[i + 2]!;
    const cy = pts[i + 3]!;
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    const dot = (bx - ax) * (cx - bx) + (by - ay) * (cy - by);
    if (cross !== 0 || dot < 0) out.push(bx, by);
  }
  out.push(pts[pts.length - 2]!, pts[pts.length - 1]!);
  return out;
}
