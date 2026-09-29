/**
 * What a page SAYS, as pdf.js exports it — PURE. The anonymity and page-limit rules judge text, so
 * the facts carry each page's text, the targets of its links, where the bibliography's first entry
 * and the appendix are anchored, and the document's metadata. `pdf-facts.ts` reads the PDF and
 * calls these; nothing here knows what a rule does with the result.
 */
import { fieldOf, isRecord } from "./domain/record.ts";

/**
 * A page's text: its items in content order, joined WITHOUT a separator — pdf.js emits a space as
 * an item of its own where the glyphs leave a gap, so a word split into two items by kerning comes
 * back whole — with a line break after every item pdf.js marks as ending a line.
 */
export const pageTextOf = (items: readonly unknown[]): string =>
  items
    .map((it) => {
      const s = fieldOf(it, "str");
      return `${typeof s === "string" ? s : ""}${fieldOf(it, "hasEOL") === true ? "\n" : ""}`;
    })
    .join("");

/**
 * The target of every link annotation on a page, once each: its `url`, else its `unsafeUrl`. A link
 * whose text breaks across lines is one annotation per line (measured: hyperref's `\\href` gave two
 * for one target), and one target is one fact.
 */
export const linkTargetsOf = (
  annotations: readonly unknown[],
): readonly string[] => {
  const urls = annotations.flatMap((a) => {
    if (fieldOf(a, "subtype") !== "Link") return [];
    const url = fieldOf(a, "url") ?? fieldOf(a, "unsafeUrl");
    return typeof url === "string" && url !== "" ? [url] : [];
  });
  return urls.filter((u, i) => urls.indexOf(u) === i);
};

/** The page reference an explicit destination starts with, or null for anything else. */
export const refOf = (dest: unknown): object | null => {
  const ref: unknown = Array.isArray(dest) ? dest[0] : undefined;
  return typeof ref === "object" && ref !== null ? ref : null;
};

/**
 * The page references of the named destinations whose name starts with `prefix`, from pdf.js's
 * `getDestinations()` (name → explicit destination). hyperref names one `cite.<key>` per
 * `\bibitem`, and, after `\appendix` in the standard classes, the appendix's sections
 * `appendix.<letter>`.
 */
export const namedRefs = (
  destinations: unknown,
  prefix: string,
): readonly object[] =>
  isRecord(destinations)
    ? Object.entries(destinations).flatMap(([name, dest]) => {
        const ref = refOf(dest);
        return name.startsWith(prefix) && ref !== null ? [ref] : [];
      })
    : [];

/** A bookmark title that opens an appendix: «Appendix A: …», «APPENDIX», «Appendices». */
const APPENDIX_TITLE = /^\s*appendi(?:x|ces)\b/iu;

/**
 * The destinations of the top-level bookmarks that open an appendix, from pdf.js's `getOutline()`:
 * each a name to look up, or an explicit destination. IEEEtran's `\appendices` names its sections
 * `section*.<n>`, so the bookmark's title is what says it is an appendix.
 */
export const appendixOutlineDests = (outline: unknown): readonly unknown[] =>
  Array.isArray(outline)
    ? outline.flatMap((item: unknown) => {
        const title = fieldOf(item, "title");
        return typeof title === "string" && APPENDIX_TITLE.test(title)
          ? [fieldOf(item, "dest")]
          : [];
      })
    : [];

/** A value of a metadata field as text: a string, or the strings of a list; nothing else. */
const textsOf = (v: unknown): readonly string[] =>
  typeof v === "string"
    ? [v]
    : Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : [];

const entries = (rec: unknown): readonly (readonly [string, string])[] =>
  isRecord(rec)
    ? Object.entries(rec).flatMap(([k, v]) => {
        const text = textsOf(v).join("; ");
        return text === "" ? [] : [[k, text] as const];
      })
    : [];

/**
 * The XMP packet pdf.js parsed, as `name → value`: its `Metadata` iterates `[name, value]` pairs.
 * Null when the PDF carries no packet.
 */
export const xmpOf = (
  packet: Iterable<unknown> | null,
): Readonly<Record<string, unknown>> | null =>
  packet === null
    ? null
    : Object.fromEntries(
        [...packet].flatMap((e) =>
          Array.isArray(e) && typeof e[0] === "string" ? [[e[0], e[1]]] : [],
        ),
      );

/**
 * The document's metadata as flat `field → text`: every string of the Info dictionary (`Author`,
 * `Title`, …), of its custom entries (`PTEX.Fullbanner`), and of the XMP packet, whose names carry
 * their namespace (`dc:creator`), as pdf.js's `getMetadata` returns them. `xmp` is the packet's
 * `xmpOf`, or null when the PDF has none.
 */
export function metadataOf(
  info: unknown,
  xmp: unknown,
): Readonly<Record<string, string>> {
  return Object.fromEntries([
    ...entries(info),
    ...entries(fieldOf(info, "Custom")),
    ...entries(xmp),
  ]);
}
