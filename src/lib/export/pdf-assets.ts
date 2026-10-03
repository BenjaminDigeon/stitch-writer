import regularUrl from '../../assets/pdf-fonts/NotoSans-Regular.ttf?url';
import boldUrl from '../../assets/pdf-fonts/NotoSans-Bold.ttf?url';
import type { PdfFonts } from '../scene/pdf-backend.ts';

let cache: Promise<PdfFonts> | null = null;

/** The PDF text fonts (Noto Sans, SIL Open Font License 1.1). They load only for an export. */
export function loadPdfFonts(): Promise<PdfFonts> {
  cache ??= Promise.all([regularUrl, boldUrl].map((u) => fetch(u).then((r) => r.arrayBuffer()))).then(
    ([r, b]) => ({
      regular: new Uint8Array(r!),
      bold: new Uint8Array(b!),
    }),
  );
  cache.catch(() => (cache = null));
  return cache;
}
