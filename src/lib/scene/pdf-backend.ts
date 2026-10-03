import fontkit from '@pdf-lib/fontkit';
import {
  LineCapStyle,
  LineJoinStyle,
  PDFDocument,
  PDFOperator,
  PDFOperatorNames,
  appendBezierCurve,
  beginText,
  clip,
  closePath,
  concatTransformationMatrix,
  endPath,
  endText,
  fill,
  fillAndStroke,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  setDashPattern,
  setFillingRgbColor,
  setFontAndSize,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  showText,
  stroke,
  type PDFFont,
  type PDFName,
  type PDFPage,
} from 'pdf-lib';
import type { PathOp, Rgb, SceneDoc, SceneNode, Stroke, TextMeasure } from './types.ts';

/** Millimeters to PDF points. */
export const MM_TO_PT = 72 / 25.4;

export interface PdfFonts {
  regular: Uint8Array;
  bold: Uint8Array;
}

export interface PdfMeta {
  subject?: string;
  creator?: string;
}

const c = (v: number) => v / 255;
const fillEvenOdd = () => PDFOperator.of(PDFOperatorNames.FillEvenOdd);

interface PageFont {
  font: PDFFont;
  key: PDFName;
  chars: Set<number>;
}

interface Ctx {
  page: PDFPage;
  ops: PDFOperator[];
  fonts: { regular: PageFont; bold: PageFont };
}

function strokeOps(s: Stroke): PDFOperator[] {
  const out = [
    setStrokingRgbColor(c(s.color[0]), c(s.color[1]), c(s.color[2])),
    setLineWidth(Math.max(0.01, s.width)),
  ];
  out.push(
    setLineCap(
      s.cap === 'round'
        ? LineCapStyle.Round
        : s.cap === 'square'
          ? LineCapStyle.Projecting
          : LineCapStyle.Butt,
    ),
  );
  out.push(setLineJoin(s.join === 'round' ? LineJoinStyle.Round : LineJoinStyle.Miter));
  out.push(setDashPattern(s.dash ?? [], 0));
  return out;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

function pathOps(ops: readonly PathOp[]): PDFOperator[] {
  const out: PDFOperator[] = [];
  for (const op of ops) {
    switch (op[0]) {
      case 'M':
        out.push(moveTo(round(op[1]), round(op[2])));
        break;
      case 'L':
        out.push(lineTo(round(op[1]), round(op[2])));
        break;
      case 'C':
        out.push(
          appendBezierCurve(
            round(op[1]),
            round(op[2]),
            round(op[3]),
            round(op[4]),
            round(op[5]),
            round(op[6]),
          ),
        );
        break;
      case 'R':
        out.push(rectangle(round(op[1]), round(op[2]), round(op[3]), round(op[4])));
        break;
      case 'Z':
        out.push(closePath());
        break;
    }
  }
  return out;
}

function paint(
  ctx: Ctx,
  path: PDFOperator[],
  fillColor: Rgb | undefined,
  s: Stroke | undefined,
  evenOdd = false,
): void {
  if (!path.length || (!fillColor && !s)) return;
  ctx.ops.push(pushGraphicsState());
  if (fillColor) ctx.ops.push(setFillingRgbColor(c(fillColor[0]), c(fillColor[1]), c(fillColor[2])));
  if (s) ctx.ops.push(...strokeOps(s));
  ctx.ops.push(...path);
  ctx.ops.push(fillColor && s ? fillAndStroke() : fillColor ? (evenOdd ? fillEvenOdd() : fill()) : stroke());
  ctx.ops.push(popGraphicsState());
}

function circlePath(cx: number, cy: number, r: number): PathOp[] {
  const k = 0.5523 * r;
  return [
    ['M', cx + r, cy],
    ['C', cx + r, cy + k, cx + k, cy + r, cx, cy + r],
    ['C', cx - k, cy + r, cx - r, cy + k, cx - r, cy],
    ['C', cx - r, cy - k, cx - k, cy - r, cx, cy - r],
    ['C', cx + k, cy - r, cx + r, cy - k, cx + r, cy],
    ['Z'],
  ];
}

function drawNode(ctx: Ctx, n: SceneNode): void {
  switch (n.t) {
    case 'rect':
      paint(ctx, [rectangle(round(n.x), round(n.y), round(n.w), round(n.h))], n.fill, n.stroke);
      return;
    case 'line':
      paint(ctx, [moveTo(round(n.x1), round(n.y1)), lineTo(round(n.x2), round(n.y2))], undefined, n.stroke);
      return;
    case 'path':
      paint(ctx, pathOps(n.ops), n.fill, n.stroke, n.fillRule === 'evenodd');
      return;
    case 'circles': {
      const ops: PathOp[] = [];
      for (let i = 0; i < n.centers.length; i += 2)
        ops.push(...circlePath(n.centers[i]!, n.centers[i + 1]!, n.r));
      paint(ctx, pathOps(ops), n.fill, undefined);
      return;
    }
    case 'text': {
      const f = n.weight === 'bold' ? ctx.fonts.bold : ctx.fonts.regular;
      // A character that the PDF font does not have would draw a blank box: leave it out.
      const text = [...n.text].filter((ch) => ch === ' ' || f.chars.has(ch.codePointAt(0)!)).join('');
      const width = f.font.widthOfTextAtSize(text, n.size);
      const x = n.anchor === 'middle' ? n.x - width / 2 : n.anchor === 'end' ? n.x - width : n.x;
      const color = n.fill ?? [0, 0, 0];
      ctx.ops.push(
        pushGraphicsState(),
        // The page transform flips y. Flip it back for the text, at the baseline point.
        concatTransformationMatrix(1, 0, 0, -1, round(x), round(n.y)),
        setFillingRgbColor(c(color[0]), c(color[1]), c(color[2])),
        beginText(),
        setFontAndSize(f.key, n.size),
        showText(f.font.encodeText(text)),
        endText(),
        popGraphicsState(),
      );
      return;
    }
    case 'group': {
      ctx.ops.push(pushGraphicsState());
      if (n.tx || n.ty || (n.scale && n.scale !== 1)) {
        const s = n.scale ?? 1;
        ctx.ops.push(concatTransformationMatrix(s, 0, 0, s, round(n.tx ?? 0), round(n.ty ?? 0)));
      }
      if (n.clip)
        ctx.ops.push(
          rectangle(round(n.clip.x), round(n.clip.y), round(n.clip.w), round(n.clip.h)),
          clip(),
          endPath(),
        );
      for (const child of n.children) drawNode(ctx, child);
      ctx.ops.push(popGraphicsState());
      return;
    }
  }
}

/** Opens the PDF fonts once, for text measures. */
export async function pdfTextMeasure(fonts: PdfFonts): Promise<TextMeasure> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts.regular, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });
  return {
    width: (text, size, weight) => (weight === 'bold' ? bold : regular).widthOfTextAtSize(text, size),
  };
}

/** Draws the scene document as a vector PDF. Units of the scene are millimeters. */
export async function renderPdf(scene: SceneDoc, fonts: PdfFonts, meta: PdfMeta = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts.regular, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });
  doc.setTitle(scene.title);
  doc.setCreator(meta.creator ?? 'Stitch Writer');
  doc.setProducer('Stitch Writer (pdf-lib)');
  if (meta.subject) doc.setSubject(meta.subject);

  const regularChars = new Set(regular.getCharacterSet());
  const boldChars = new Set(bold.getCharacterSet());
  for (const p of scene.pages) {
    const page = doc.addPage([p.w * MM_TO_PT, p.h * MM_TO_PT]);
    const ctx: Ctx = {
      page,
      ops: [],
      fonts: {
        regular: {
          font: regular,
          key: page.node.newFontDictionary(regular.name, regular.ref),
          chars: regularChars,
        },
        bold: { font: bold, key: page.node.newFontDictionary(bold.name, bold.ref), chars: boldChars },
      },
    };
    // Scene coordinates: millimeters, origin top-left, y down.
    ctx.ops.push(
      pushGraphicsState(),
      concatTransformationMatrix(MM_TO_PT, 0, 0, -MM_TO_PT, 0, p.h * MM_TO_PT),
    );
    for (const n of p.children) drawNode(ctx, n);
    ctx.ops.push(popGraphicsState());
    page.pushOperators(...ctx.ops);
  }
  return doc.save({ useObjectStreams: true });
}
