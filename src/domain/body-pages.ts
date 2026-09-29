/**
 * HOW MANY PAGES THE BODY TAKES, counted from what the PDF says rather than from how banal
 * classifies its pages. A venue that limits the body «excluding references and appendices» (AIDC)
 * cannot be judged on banal's body count: banal calls any page holding non-bibliography text body,
 * so an LLM Usage Statement or an appendix placed after the bibliography is counted as body, and a
 * correct paper fails (measured, `presets/aidc.jsonc`).
 *
 * The count here: the body is every page BEFORE the page on which the references heading first
 * appears. What stands after it — the bibliography, an appendix, a statement — is not counted. The
 * page holding the heading is not counted either, even when the body ends on it: the count errs
 * towards passing, because an error-level rule that fails a correct paper gets switched off.
 */

/** Where the references begin, or that no page holds their heading. */
export type ReferencesStart =
  | {
      readonly kind: "found";
      /** 1-based page holding the heading. */
      readonly page: number;
      /** Pages before it: the body, as the venue counts it. */
      readonly bodyPages: number;
    }
  | { readonly kind: "missing" };

/**
 * A line that is a references heading: `References` or `Bibliography`, in any case (IEEEtran sets
 * `REFERENCES` in small caps, which pdf.js may split as `R EFERENCES`), optionally numbered
 * (`7 References`, `VII. REFERENCES`). The line is compared with every space removed.
 */
const HEADING = /^(?:(?:\d+|[ivxlcdm]+)\.?)?(?:references|bibliography)$/iu;

/** Whether one line of a page's text is the references heading. */
export const isReferencesHeading = (line: string): boolean =>
  HEADING.test(line.normalize("NFKC").replace(/\s+/gu, ""));

/** The first page whose text holds a references heading line, from each page's text. Pure. */
export function referencesStart(pages: readonly string[]): ReferencesStart {
  const i = pages.findIndex((text) =>
    text.split("\n").some(isReferencesHeading),
  );
  return i < 0
    ? { kind: "missing" }
    : { kind: "found", page: i + 1, bodyPages: i };
}
