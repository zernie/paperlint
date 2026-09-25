/**
 * `xml.ts` — the pure half of feeding banal: which text a layout tool counts, the fill each item was
 * drawn in, and the banal input XML (pdftohtml's dialect) those boxes become.
 *
 * Every page here is written by hand. The real-PDF half — pdf.js boxes of a committed fixture,
 * written as XML, measured by the real banal and compared with banal on real pdftohtml — is
 * `test/e2e/banal.mjs`, which runs where `rpp toolchain` has installed banal.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { isDeepStrictEqual } from "node:util";
import * as L from "./xml.ts";
import type { OperatorList, PageLayout, TextBox } from "./xml.ts";

/** One vitest case per assertion, named by its label. */
const check = (label: string, cond: unknown, detail = "") => {
  test(label, () => {
    assert.ok(cond, detail ? `${label} — ${detail}` : label);
  });
};

const box = (over: Partial<TextBox> = {}): TextBox => ({
  top: 10,
  left: 20,
  width: 30,
  height: 12,
  size: 10,
  font: "LinLibertineT",
  text: "Hello",
  upright: true,
  fill: { kind: "unknown" },
  ...over,
});
const page = (boxes: TextBox[], widthPt = 612, heightPt = 792): PageLayout => ({
  widthPt,
  heightPt,
  boxes,
});

// ── the XML ─────────────────────────────────────────────────────────────────────────────
{
  const xml = L.pdf2xml([
    page([box(), box({ top: 22.0417, text: 'a < b & c > "d"' })]),
    page([box({ text: "again" }), box({ size: 9, text: "smaller" })]),
  ]);
  // Guards: the exact dialect banal reads — header, zoom-3 integer page size, a font declared on the
  // first page that uses it and before its text, sizes as round(size × 3), coordinates × 3 unrounded.
  const expected = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE pdf2xml SYSTEM "pdf2xml.dtd">',
    '<pdf2xml producer="research-paper-pipeline (pdf.js)" version="24.02.0">',
    '<page number="1" position="absolute" top="0" left="0" height="2376" width="1836">',
    '\t<fontspec id="0" size="30" family="LinLibertineT" color="#000000"/>',
    '<text top="30.000000" left="60.000000" width="90.000000" height="36.000000" font="0">Hello</text>',
    '<text top="66.125100" left="60.000000" width="90.000000" height="36.000000" font="0">a &lt; b &amp; c &gt; &#34;d&#34;</text>',
    "</page>",
    '<page number="2" position="absolute" top="0" left="0" height="2376" width="1836">',
    '\t<fontspec id="1" size="27" family="LinLibertineT" color="#000000"/>',
    '<text top="30.000000" left="60.000000" width="90.000000" height="36.000000" font="0">again</text>',
    '<text top="30.000000" left="60.000000" width="90.000000" height="36.000000" font="1">smaller</text>',
    "</page>",
    "</pdf2xml>",
    "",
  ].join("\n");
  check(
    "pdf2xml: the exact pdftohtml dialect, on two pages",
    xml === expected,
    `\n${xml}`,
  );
}
{
  const xml = L.pdf2xml([
    page([
      box({ text: "rotated", upright: false }),
      box({ text: "ocr layer", fill: { kind: "invisible" } }),
      box({ text: "   " }),
      box({ text: "watermark", fill: { kind: "rgb", hex: "#f5f5f5" } }),
      box({ text: "body" }),
    ]),
  ]);
  // Guards: condition 1 — pdftohtml writes rotated text with width 0 and banal drops it; writing it
  // would count a rotated margin note as body text.
  check("pdf2xml: rotated text is not written", !xml.includes("rotated"), xml);
  // Guards: condition 2 — pdftohtml does not write render-mode-3 text (an OCR layer).
  check(
    "pdf2xml: invisible text is not written",
    !xml.includes("ocr layer"),
    xml,
  );
  // Guards: condition 3 — light text IS written, with its colour, because what counts as light is
  // banal's decision (its own threshold), not a copy of it here.
  check(
    "pdf2xml: light text is written, with its colour in its own fontspec",
    xml.includes('color="#f5f5f5"/>') &&
      xml.includes(">watermark</text>") &&
      xml.includes('color="#000000"/>'),
    xml,
  );
  check(
    "pdf2xml: a blank item is not written",
    (xml.match(/<text /g) ?? []).length === 2,
    xml,
  );
}
check(
  "xmlEscape: a newline becomes a space, as pdftohtml writes it",
  L.xmlEscape("a\nb\r\nc") === "a b  c",
);
check(
  "pdf2xml: no pages is a well-formed empty document",
  L.pdf2xml([]).endsWith("</pdf2xml>\n") && !L.pdf2xml([]).includes("<page"),
);

// ── upright ─────────────────────────────────────────────────────────────────────────────
check("isUpright: the identity scaled", L.isUpright([10, 0, 0, 10, 5, 5]));
check(
  "isUpright: mirrored vertically is still upright",
  L.isUpright([10, 0, 0, -10, 5, 5]),
);
check("isUpright: rotated 90° is not", !L.isUpright([0, 10, -10, 0, 5, 5]));
check("isUpright: skewed is not", !L.isUpright([10, 0, 3, 10, 5, 5]));

// ── the fill walk ───────────────────────────────────────────────────────────────────────
const OPS = {
  save: 1,
  restore: 2,
  setFillRGBColor: 3,
  setTextRenderingMode: 4,
  showText: 5,
  showSpacedText: 6,
};
const glyphs = (s: string) => [[...s].map((unicode) => ({ unicode }))];
const ops = (...pairs: [number, unknown?][]): OperatorList => ({
  fnArray: pairs.map((p) => p[0]),
  argsArray: pairs.map((p) => p[1] ?? null),
});

check(
  "hexOf: current pdf.js passes a hex string",
  L.hexOf(["#E5E5E5"]) === "#e5e5e5",
);
check(
  "hexOf: older pdf.js passes three numbers",
  L.hexOf([229, 229, 229]) === "#e5e5e5",
);
{
  const list = ops(
    [OPS.save],
    [OPS.setFillRGBColor, ["#f5f5f5"]],
    [OPS.showText, glyphs("Light text")],
    [OPS.restore],
    [OPS.showText, glyphs("Dark")],
    [OPS.setTextRenderingMode, [3]],
    [OPS.showSpacedText, [[{ unicode: "O" }, -250, { unicode: "CR" }]]],
    [OPS.setTextRenderingMode, [0]],
    [OPS.showText, glyphs("After")],
  );
  const fills = L.fillsOf(OPS, list, ["Light text", "Dark", "OCR", "After"]);
  // Guards: save/restore — the colour set inside a group ends with it; the next item is not light.
  check(
    "fillsOf: a colour set inside save/restore ends at restore",
    isDeepStrictEqual(fills.slice(0, 2), [
      { kind: "rgb", hex: "#f5f5f5" },
      { kind: "unknown" },
    ]),
    JSON.stringify(fills),
  );
  // Guards: render mode 3 is invisible, and the mode is state, not a property of one operator.
  check(
    "fillsOf: render mode 3 is invisible, and mode 0 ends it",
    fills[2]?.kind === "invisible" && fills[3]?.kind === "unknown",
    JSON.stringify(fills),
  );
}
{
  const list = ops(
    [OPS.setFillRGBColor, ["#ff0000"]],
    [OPS.showText, glyphs("Hel")],
    [OPS.showText, glyphs("lo world")],
  );
  check(
    "fillsOf: an item drawn by two operators, and spaces that items and glyphs split differently",
    L.fillsOf(OPS, list, ["Hello", "world"]).every(
      (f) => f.kind === "rgb" && f.hex === "#ff0000",
    ),
  );
}
{
  const list = ops(
    [OPS.setFillRGBColor, ["#eeeeee"]],
    [OPS.showText, glyphs("first")],
    [OPS.showText, glyphs("second")],
  );
  const fills = L.fillsOf(OPS, list, ["nowhere", "second"]);
  // Guards: the direction of a miss — an item that cannot be found is drawn as black (kept), and
  // the walk does not lose its place for the items after it.
  check(
    "fillsOf: an unmatched item is `unknown` (kept, never dropped), and the next one still matches",
    fills[0]?.kind === "unknown" && fills[1]?.kind === "rgb",
    JSON.stringify(fills),
  );
}
check(
  "fillsOf: an empty item is `unknown`",
  L.fillsOf(OPS, ops(), [" "])[0]?.kind === "unknown",
);
