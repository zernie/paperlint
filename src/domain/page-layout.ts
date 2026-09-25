/**
 * A page as text boxes: the page size in points and every text item with its position, size, font,
 * fill and orientation. The domain's picture of a laid-out page — what a page-geometry measurer
 * takes, with no tool named: pdf.js produces it (`adapters/pdfjs/fill.ts`, `pdf-facts.ts`), and
 * banal's adapter writes it as the XML banal reads (`adapters/banal/xml.ts`).
 */

/** The fill a text item was drawn with. `unknown` is drawn as black, as pdftohtml's default is. */
export type Fill =
  | { readonly kind: "rgb"; readonly hex: string }
  | { readonly kind: "invisible" }
  | { readonly kind: "unknown" };

/** One text item, in points, top-down. `size` is the font size in points. */
export interface TextBox {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
  readonly size: number;
  readonly font: string;
  readonly text: string;
  readonly upright: boolean;
  readonly fill: Fill;
}

/** A page's size in points and every text item on it, in content order. */
export interface PageLayout {
  readonly widthPt: number;
  readonly heightPt: number;
  readonly boxes: readonly TextBox[];
}
