import type { PathOp, Rgb, SceneNode, ScenePage, Stroke } from './types.ts';

export interface SvgOptions {
  /** Decimals for coordinates. */
  precision?: number;
  fontFamily?: string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rgb = (c: Rgb) => `rgb(${c[0]},${c[1]},${c[2]})`;

function num(v: number, p: number): string {
  const r = Number(v.toFixed(p));
  return Object.is(r, -0) ? '0' : String(r);
}

export function pathData(ops: readonly PathOp[], p = 3): string {
  let d = '';
  for (const op of ops) {
    switch (op[0]) {
      case 'M':
      case 'L':
        d += `${op[0]}${num(op[1], p)} ${num(op[2], p)}`;
        break;
      case 'C':
        d += `C${op
          .slice(1)
          .map((v) => num(v as number, p))
          .join(' ')}`;
        break;
      case 'R':
        d += `M${num(op[1], p)} ${num(op[2], p)}h${num(op[3], p)}v${num(op[4], p)}h${num(-op[3], p)}z`;
        break;
      case 'Z':
        d += 'z';
        break;
    }
  }
  return d;
}

function strokeAttrs(s: Stroke | undefined, p: number): string {
  if (!s) return '';
  let a = ` stroke="${rgb(s.color)}" stroke-width="${num(s.width, p)}"`;
  if (s.cap) a += ` stroke-linecap="${s.cap}"`;
  if (s.join) a += ` stroke-linejoin="${s.join}"`;
  if (s.dash?.length) a += ` stroke-dasharray="${s.dash.map((v) => num(v, p)).join(' ')}"`;
  if (s.nonScaling) a += ' vector-effect="non-scaling-stroke"';
  return a;
}

let clipId = 0;

function node(n: SceneNode, o: Required<SvgOptions>): string {
  const p = o.precision;
  const cls = (c?: string) => (c ? ` class="${esc(c)}"` : '');
  switch (n.t) {
    case 'rect':
      return `<rect x="${num(n.x, p)}" y="${num(n.y, p)}" width="${num(n.w, p)}" height="${num(n.h, p)}" fill="${n.fill ? rgb(n.fill) : 'none'}"${n.stroke ? strokeAttrs(n.stroke, p) : ''}/>`;
    case 'line':
      return `<line x1="${num(n.x1, p)}" y1="${num(n.y1, p)}" x2="${num(n.x2, p)}" y2="${num(n.y2, p)}"${strokeAttrs(n.stroke, p)}/>`;
    case 'path': {
      if (!n.ops.length) return '';
      const fill = n.fill ? rgb(n.fill) : 'none';
      const rule = n.fillRule === 'evenodd' ? ' fill-rule="evenodd"' : '';
      return `<path${cls(n.className)} d="${pathData(n.ops, p)}" fill="${fill}"${rule}${n.stroke ? strokeAttrs(n.stroke, p) : ''}/>`;
    }
    case 'circles': {
      if (!n.centers.length) return '';
      // One path of circles: two arcs per circle.
      let d = '';
      const r = num(n.r, p);
      for (let i = 0; i < n.centers.length; i += 2) {
        const x = n.centers[i]!;
        const y = n.centers[i + 1]!;
        d += `M${num(x - n.r, p)} ${num(y, p)}a${r} ${r} 0 1 0 ${num(2 * n.r, p)} 0a${r} ${r} 0 1 0 ${num(-2 * n.r, p)} 0z`;
      }
      return `<path${cls(n.className)} d="${d}" fill="${rgb(n.fill)}"/>`;
    }
    case 'text': {
      const anchor = n.anchor && n.anchor !== 'start' ? ` text-anchor="${n.anchor}"` : '';
      const weight = n.weight === 'bold' ? ' font-weight="700"' : '';
      return `<text x="${num(n.x, p)}" y="${num(n.y, p)}" font-size="${num(n.size, p)}" font-family="${esc(o.fontFamily)}"${weight}${anchor} fill="${rgb(n.fill ?? [0, 0, 0])}">${esc(n.text)}</text>`;
    }
    case 'group': {
      const parts: string[] = [];
      if (n.tx || n.ty || (n.scale && n.scale !== 1)) {
        parts.push(`translate(${num(n.tx ?? 0, p)} ${num(n.ty ?? 0, p)})`);
        if (n.scale && n.scale !== 1) parts.push(`scale(${num(n.scale, 6)})`);
      }
      const transform = parts.length ? ` transform="${parts.join(' ')}"` : '';
      let defs = '';
      let clip = '';
      if (n.clip) {
        const id = `c${++clipId}`;
        defs = `<clipPath id="${id}"><rect x="${num(n.clip.x, p)}" y="${num(n.clip.y, p)}" width="${num(n.clip.w, p)}" height="${num(n.clip.h, p)}"/></clipPath>`;
        clip = ` clip-path="url(#${id})"`;
      }
      const inner = n.children.map((c) => node(c, o)).join('');
      return `${defs}<g${cls(n.className)}${transform}${clip}>${inner}</g>`;
    }
  }
}

/** SVG markup of the nodes, for an existing <svg> element. */
export function renderSvgFragment(nodes: readonly SceneNode[], options: SvgOptions = {}): string {
  const o = {
    precision: options.precision ?? 3,
    fontFamily: options.fontFamily ?? 'Helvetica, Arial, sans-serif',
  };
  return nodes.map((n) => node(n, o)).join('');
}

/** A complete SVG document. The size is in millimeters, so that it prints at the correct size. */
export function renderSvgDocument(
  page: ScenePage,
  options: SvgOptions & { unit?: 'mm' | 'px' } = {},
): string {
  const unit = options.unit ?? 'mm';
  const body = renderSvgFragment(page.children, options);
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(page.w, 3)}${unit}" height="${num(page.h, 3)}${unit}" viewBox="0 0 ${num(page.w, 3)} ${num(page.h, 3)}">` +
    `<rect width="100%" height="100%" fill="#fff"/>${body}</svg>\n`
  );
}
