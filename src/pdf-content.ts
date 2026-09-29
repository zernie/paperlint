/**
 * What a page SAYS, as pdf.js exports it — PURE. The anonymity and page-limit rules judge text, so
 * the facts carry each page's text, the targets of its links, whether it paints a raster image
 * (whose text no extraction can see), and the document's metadata. `pdf-facts.ts` reads the PDF and
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

/** pdf.js's operators that paint a raster image, by their names in `OPS`. */
const IMAGE_OPS = [
  "paintImageXObject",
  "paintImageXObjectRepeat",
  "paintInlineImageXObject",
  "paintInlineImageXObjectGroup",
  "paintImageMaskXObject",
  "paintImageMaskXObjectGroup",
  "paintImageMaskXObjectRepeat",
] as const;

/** Whether an operator list paints a raster image, given pdf.js's `OPS` table. */
export function paintsImage(
  ops: Readonly<Record<string, number>>,
  fnArray: readonly number[],
): boolean {
  const codes = new Set(IMAGE_OPS.map((name) => ops[name]));
  return fnArray.some((f) => codes.has(f));
}

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
