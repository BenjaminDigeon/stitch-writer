<script lang="ts">
  import type { Chart } from '../lib/layout/types.ts';
  import { buildChartLayer } from '../lib/scene/chart-layer.ts';
  import { renderSvgFragment } from '../lib/scene/svg-backend.ts';
  import type { Rgb, SceneNode } from '../lib/scene/types.ts';

  let {
    chart,
    colour,
    height = 40,
    maxWidth = 260,
  }: { chart: Chart; colour: (t: number) => Rgb; height?: number; maxWidth?: number } = $props();

  const none = { color: [0, 0, 0] as Rgb, width: 0 };
  const markup = $derived.by(() => {
    if (!chart.width) return '';
    const nodes = buildChartLayer(chart, {
      cell: 1,
      mode: 'colour',
      threadColour: colour,
      minor: none,
      major: none,
      border: none,
      backWidth: 0.22,
      symbolWidth: 0.1,
    });
    // Keep the stitches only: the grid paths and the border have no width here.
    return renderSvgFragment(
      nodes.filter((n: SceneNode) => !(n.t === 'path' && n.className?.startsWith('grid')) && n.t !== 'rect'),
    );
  });
  const scale = $derived(chart.height ? Math.min(height / chart.height, maxWidth / chart.width) : 1);
</script>

{#if chart.width}
  <svg
    width={Math.round(chart.width * scale)}
    height={Math.round(chart.height * scale)}
    viewBox="0 0 {chart.width} {chart.height}"
    aria-hidden="true"
    shape-rendering="crispEdges"
  >
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- the markup comes from our SVG back end, which escapes all text -->
    {@html markup}
  </svg>
{/if}
