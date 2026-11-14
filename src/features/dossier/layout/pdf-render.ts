/**
 * Server-only: paints a prepared free layout to PDF bytes. Used for the artist's PDF and, before a proposal is
 * ever shown, as a render check (a proposal that cannot be painted is discarded).
 */
import type { CropSuggestion } from "@/contracts";
import { pdfFontsFor } from "./fonts-server";
import type { PreparedLayout } from "./schema";

export interface RenderWork {
  id: string;
  imageUrl: string;
  crop?: CropSuggestion;
}

export async function renderPreparedLayoutPdf(prepared: PreparedLayout, works: RenderWork[]): Promise<Buffer> {
  const [{ renderToBuffer }, { FreeLayoutPdf }, { loadPdfImage }, { framePdfImage }, { createElement }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./pdf"),
    import("../pdf/images"),
    import("../pdf/crop"),
    import("react"),
  ]);
  const used = new Set(prepared.pages.flatMap((p) => p.elements.flatMap((e) => (e.type === "image" ? [e.workId] : []))));
  const images = Object.fromEntries(
    await Promise.all(
      works
        .filter((w) => used.has(w.id))
        .map(async (w) => {
          const img = loadPdfImage(w.imageUrl);
          return [w.id, img ? await framePdfImage(img, w.crop) : undefined] as const;
        }),
    ),
  );
  const fonts = await pdfFontsFor(prepared);
  const el = createElement(FreeLayoutPdf, { layout: prepared, images, fonts }) as unknown as Parameters<typeof renderToBuffer>[0];
  return renderToBuffer(el);
}
