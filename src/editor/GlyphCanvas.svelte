<script lang="ts">
  import type { FontFile, GlyphDef } from '../lib/font/schema.ts';
  import { cellMap, segmentsOf, setCell, toggleKnot, toggleSegment } from '../lib/font/edit.ts';
  import type { EditorState, Tool } from './editor-state.svelte.ts';

  let { state: ed, file, glyph }: { state: EditorState; file: FontFile; glyph: GlyphDef } = $props();

  const CS = 26;
  const m = $derived(file.metrics);

  const cells = $derived(cellMap(glyph));
  const segs = $derived(segmentsOf(glyph));

  const neighbor = $derived(ed.neighbors ? (file.glyphs[ed.neighbors] ?? null) : null);
  const ls = $derived(m.letterSpacing);

  // The visible range: the advance box, the neighbors, any overhang and a margin of 1 cell.
  const leftW = $derived(neighbor ? neighbor.width + ls : 0);
  const minCellX = $derived(
    Math.min(-1 - leftW, ...[...cells.keys()].map((k) => Number(k.split(',')[0]) - 1)),
  );
  const maxCellX = $derived(
    Math.max(
      glyph.width + (neighbor ? ls + neighbor.width : 0),
      ...[...cells.keys()].map((k) => Number(k.split(',')[0]) + 1),
    ),
  );
  const minCellY = $derived(
    Math.min(-m.ascent - 1, ...[...cells.keys()].map((k) => Number(k.split(',')[1]) - 1)),
  );
  const maxCellY = $derived(
    Math.max(m.descent, ...[...cells.keys()].map((k) => Number(k.split(',')[1]) + 1)),
  );
  const cols = $derived(maxCellX - minCellX + 1);
  const rows = $derived(maxCellY - minCellY + 1);
  const W = $derived(cols * CS);
  const H = $derived(rows * CS);

  const px = (x: number) => (x - minCellX) * CS;
  const py = (y: number) => (y - minCellY) * CS;

  const color = (sym: string) => (file.symbols[sym]?.thread === 1 ? '#e05a7a' : '#384c5e');

  function ghostCells(def: GlyphDef | null, dx: number) {
    if (!def) return [];
    return [...cellMap(def)].map(([k]) => {
      const [x, y] = k.split(',').map(Number) as [number, number];
      return { x: x + dx, y };
    });
  }
  const ghosts = $derived([...ghostCells(neighbor, -leftW), ...ghostCells(neighbor, glyph.width + ls)]);

  let svg: SVGSVGElement | undefined = $state();
  let strokeMode: 'paint' | 'erase' | null = null;
  let last: { x: number; y: number } | null = null;
  let lineStart = $state<{ x: number; y: number } | null>(null);
  let lineEnd = $state<{ x: number; y: number } | null>(null);
  let cursor = $state({ x: 0, y: -1 });

  function local(e: PointerEvent) {
    const r = svg!.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * W;
    const sy = ((e.clientY - r.top) / r.height) * H;
    return { lx: sx / CS + minCellX, ly: sy / CS + minCellY };
  }

  const cellOf = (e: PointerEvent) => {
    const { lx, ly } = local(e);
    return { x: Math.floor(lx), y: Math.floor(ly) };
  };

  const latticeOf = (e: PointerEvent, half = e.shiftKey) => {
    const { lx, ly } = local(e);
    const step = half ? 0.5 : 1;
    return { x: Math.round(lx / step) * step, y: Math.round(ly / step) * step };
  };

  const isCellTool = (t: Tool) => t !== 'line' && t !== 'knot';

  function paintCell(x: number, y: number) {
    const tool = ed.tool;
    ed.edit((d) => setCell(d, x, y, strokeMode === 'erase' || tool === 'erase' ? null : tool));
  }

  function paintLine(a: { x: number; y: number }, b: { x: number; y: number }) {
    // Bresenham between the last cell and this one, so that a fast drag leaves no gaps.
    let { x, y } = a;
    const dx = Math.abs(b.x - x);
    const dy = -Math.abs(b.y - y);
    const sx = x < b.x ? 1 : -1;
    const sy = y < b.y ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      paintCell(x, y);
      if (x === b.x && y === b.y) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  function onpointerdown(e: PointerEvent) {
    if (e.button !== 0) return;
    svg!.setPointerCapture(e.pointerId);
    const tool = ed.tool;
    if (isCellTool(tool)) {
      const c = cellOf(e);
      cursor = c;
      ed.beginStroke();
      strokeMode = tool === 'erase' || cells.get(`${c.x},${c.y}`) === tool ? 'erase' : 'paint';
      paintCell(c.x, c.y);
      last = c;
    } else if (tool === 'line') {
      lineStart = latticeOf(e);
      lineEnd = lineStart;
    } else if (tool === 'knot') {
      const p = latticeOf(e, true);
      ed.edit((d) => toggleKnot(d, p.x, p.y));
    }
  }

  function onpointermove(e: PointerEvent) {
    if (strokeMode && last) {
      const c = cellOf(e);
      if (c.x !== last.x || c.y !== last.y) {
        paintLine(last, c);
        last = c;
      }
    } else if (lineStart) {
      lineEnd = latticeOf(e);
    }
  }

  function onpointerup() {
    if (strokeMode) {
      strokeMode = null;
      last = null;
      ed.endStroke();
    }
    if (lineStart && lineEnd) {
      const a = lineStart;
      const b = lineEnd;
      ed.edit((d) => toggleSegment(d, { x1: a.x, y1: a.y, x2: b.x, y2: b.y }));
    }
    lineStart = null;
    lineEnd = null;
  }

  function onkeydown(e: KeyboardEvent) {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const mv = moves[e.key];
    if (mv) {
      e.preventDefault();
      cursor = { x: cursor.x + mv[0], y: cursor.y + mv[1] };
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!isCellTool(ed.tool)) return;
      const cur = cells.get(`${cursor.x},${cursor.y}`);
      const tool = ed.tool;
      ed.edit((d) => setCell(d, cursor.x, cursor.y, tool === 'erase' || cur === tool ? null : tool));
    }
  }

  const shape = (sym: string, x: number, y: number) => {
    const s = file.symbols[sym];
    const x0 = px(x);
    const y0 = py(y);
    if (!s) return '';
    if (s.type === 'half') {
      const b = CS * 0.32;
      return s.dir === '/'
        ? `M${x0} ${y0 + CS - b}L${x0 + CS - b} ${y0}L${x0 + CS} ${y0}L${x0 + CS} ${y0 + b}L${x0 + b} ${y0 + CS}L${x0} ${y0 + CS}z`
        : `M${x0} ${y0}L${x0 + b} ${y0}L${x0 + CS} ${y0 + CS - b}L${x0 + CS} ${y0 + CS}L${x0 + CS - b} ${y0 + CS}L${x0} ${y0 + b}z`;
    }
    return '';
  };
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<svg
  bind:this={svg}
  class="canvas tool-{ed.tool}"
  viewBox="0 0 {W} {H}"
  width={W}
  height={H}
  role="application"
  aria-label="Glyph canvas. Arrow keys move the cursor, Space paints."
  tabindex="0"
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  {onkeydown}
>
  <rect width={W} height={H} fill="#fff" />
  <!-- The advance box. -->
  <rect x={px(0)} y={0} width={glyph.width * CS} height={H} fill="#f7f1fa" />
  {#each ghosts as g, i (i)}
    <rect x={px(g.x) + 2} y={py(g.y) + 2} width={CS - 4} height={CS - 4} fill="#cfd6dc" rx="2" />
  {/each}
  {#each Array.from({ length: cols + 1 }, (_, i) => i) as i (i)}
    <line x1={i * CS} y1="0" x2={i * CS} y2={H} class="grid" />
  {/each}
  {#each Array.from({ length: rows + 1 }, (_, i) => i) as i (i)}
    <line x1="0" y1={i * CS} x2={W} y2={i * CS} class="grid" />
  {/each}
  <line x1="0" y1={py(0)} x2={W} y2={py(0)} class="baseline" />
  <line x1="0" y1={py(-m.xHeight)} x2={W} y2={py(-m.xHeight)} class="xheight" />
  <line x1="0" y1={py(-m.ascent)} x2={W} y2={py(-m.ascent)} class="frame" />
  <line x1="0" y1={py(m.descent)} x2={W} y2={py(m.descent)} class="frame" />
  <line x1={px(0)} y1="0" x2={px(0)} y2={H} class="advance" />
  <line x1={px(glyph.width)} y1="0" x2={px(glyph.width)} y2={H} class="advance" />

  {#each [...cells] as [k, sym] (k)}
    {@const [x, y] = k.split(',').map(Number) as [number, number]}
    {@const s = file.symbols[sym]}
    {#if s?.type === 'half'}
      <path d={shape(sym, x, y)} fill={color(sym)} />
    {:else if s?.type === 'full' && s.optional}
      <circle
        cx={px(x) + CS / 2}
        cy={py(y) + CS / 2}
        r={CS * 0.22}
        fill="none"
        stroke={color(sym)}
        stroke-width="3"
      />
    {:else}
      <rect x={px(x) + 1} y={py(y) + 1} width={CS - 2} height={CS - 2} fill={color(sym)} rx="2" />
      <path
        d="M{px(x) + 7} {py(y) + 7}L{px(x) + CS - 7} {py(y) + CS - 7}M{px(x) + CS - 7} {py(y) + 7}L{px(x) +
          7} {py(y) + CS - 7}"
        stroke="#fff"
        stroke-width="2"
        stroke-linecap="round"
        opacity="0.8"
      />
    {/if}
  {/each}

  {#each segs as s, i (i)}
    <line x1={px(s.x1)} y1={py(s.y1)} x2={px(s.x2)} y2={py(s.y2)} class="back" />
  {/each}
  {#each glyph.knots ?? [] as k, i (i)}
    <circle cx={px(k.x)} cy={py(k.y)} r={CS * 0.3} fill="#384c5e" />
  {/each}
  {#if lineStart && lineEnd}
    <line x1={px(lineStart.x)} y1={py(lineStart.y)} x2={px(lineEnd.x)} y2={py(lineEnd.y)} class="rubber" />
  {/if}
  <rect x={px(cursor.x)} y={py(cursor.y)} width={CS} height={CS} class="cursor" />
</svg>

<style>
  .canvas {
    max-width: 100%;
    height: auto;
    touch-action: none;
    cursor: crosshair;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-sm);
  }

  .grid {
    stroke: #e3e3e3;
    stroke-width: 1;
  }

  .baseline {
    stroke: #c0392b;
    stroke-width: 2;
  }

  .xheight {
    stroke: #2e86de;
    stroke-width: 1.5;
    stroke-dasharray: 6 4;
  }

  .frame {
    stroke: #999;
    stroke-width: 1;
    stroke-dasharray: 2 3;
  }

  .advance {
    stroke: #a3335f;
    stroke-width: 1.5;
    stroke-dasharray: 5 3;
  }

  .back {
    stroke: #384c5e;
    stroke-width: 5;
    stroke-linecap: round;
  }

  .rubber {
    stroke: #a3335f;
    stroke-width: 3;
    stroke-dasharray: 4 3;
  }

  .cursor {
    fill: none;
    stroke: var(--focus);
    stroke-width: 2;
    display: none;
  }

  .canvas:focus-visible .cursor {
    display: block;
  }
</style>
