/**
 * How the e2e runs read a finished PDF: with the package's OWN reader, from `dist/`, plus a check
 * that does not trust it.
 *
 * 🔴 WHY `dist/` AND NOT A FAKE. The shipped path meeting a real PDF is exactly what a harness
 * cannot show: pdf.js on Node 20 opens the same files and reports zero fonts without an error. So
 * the e2e reads each PDF the way `paperlint build` does.
 *
 * 🔴 AND WHY A SECOND SOURCE. A reader checked only against itself proves nothing about the PDF.
 * pdfTeX lists, at the end of `paper.log`, every font program it embedded (`<…/LinLibertineT.pfb>`).
 * That list comes from the PRODUCER, the pdf.js one from the ARTIFACT; when they disagree, one of
 * them is wrong, and the run says so. Poppler used to be this oracle, installed by CI alone — the
 * very system dependency the switch to pdf.js removed.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const { readPdf } = await import(join(ROOT, "dist", "pdf-facts.js"));

/** The PDF read by `dist/pdf-facts.js`, or a thrown error naming why it could not be. */
export async function readBuilt(pdf) {
  const r = await readPdf(pdf);
  if (!r.ok) throw new Error(`${pdf}: ${r.reason}: ${r.detail}`);
  return r.facts;
}

/** Names of every font the PDF draws text with (subset tags already dropped). */
export const fontNames = (facts) =>
  facts.fonts.kind === "drawn" ? facts.fonts.list.map((f) => f.name) : [];

/** Names of the fonts with an embedded program — what pdfTeX's log should list too. */
export const embeddedNames = (facts) =>
  facts.fonts.kind === "drawn"
    ? facts.fonts.list.filter((f) => f.kind === "embedded").map((f) => f.name)
    : [];

/** The last page's text, words joined by spaces. */
export const lastPageText = (facts) =>
  facts.last.words.map((w) => w.text).join(" ");

/**
 * The Type 1 programs pdfTeX says it embedded, by file name without `.pfb`. The log wraps at 79
 * columns, so the lines are joined before matching.
 */
export function logEmbedded(logPath) {
  const log = readFileSync(logPath, "latin1").replace(/\r?\n/g, "");
  return [...log.matchAll(/<([^<>]*?)\.pfb>/g)].map(
    (m) => m[1].split("/").pop() ?? "",
  );
}

/** The same set, case-folded: pdfTeX names `cmr10.pfb`, the PDF says `CMR10`. */
export const sameFonts = (a, b) => {
  const norm = (xs) =>
    [...new Set(xs.map((x) => x.toLowerCase()))].sort().join();
  return norm(a) === norm(b);
};
