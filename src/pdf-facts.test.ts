/**
 * pdf-facts.ts on document shapes real test PDFs do not carry, through a fake pdf.js document
 * (the real pdf.js library for its transforms and operator codes): a font object that is not one,
 * a font without a name or metrics, an item whose font never resolved, zero-scale transforms, a
 * document with no pages, text with no font, and a failure that is not an Error.
 */
import assert from "node:assert/strict";
import { getResolvedPDFJS } from "unpdf";
import { fieldOf } from "./domain/record.ts";
import { test } from "vitest";
import { factsOf, failureOf, rawFontOf } from "./pdf-facts.ts";
import { present } from "../test/support.ts";

const lib = await getResolvedPDFJS();
const H = 792;

interface FakeItem {
  str: string;
  fontName: string;
  transform: number[];
  width: number;
  height: number;
}
/** A page whose text items and loaded fonts are given; its viewport flips y like pdf.js's. */
function page(
  items: FakeItem[],
  fonts: Record<string, unknown>,
  said: { annotations?: unknown[] } = {},
) {
  const objs = new Map(Object.entries(fonts));
  return {
    getOperatorList: () => Promise.resolve({ fnArray: [], argsArray: [] }),
    getTextContent: () => Promise.resolve({ items }),
    // Iterable like pdf.js's `commonObjs`, with its `has`/`get`.
    commonObjs: {
      has: (id: string) => objs.has(id),
      get: (id: string) => objs.get(id),
      [Symbol.iterator]: () => objs[Symbol.iterator](),
    },
    getAnnotations: () => Promise.resolve(said.annotations ?? []),
    getViewport: () => ({
      width: 612,
      height: H,
      transform: [1, 0, 0, -1, 0, H],
      convertToViewportPoint: (x: number, y: number) => [x, H - y],
    }),
  };
}
const doc = (
  pages: ReturnType<typeof page>[],
  info: unknown = {},
  destinations: unknown = {},
  outline: unknown = null,
) => ({
  numPages: pages.length,
  getMetadata: () => Promise.resolve({ info, metadata: null }),
  getDestinations: () => Promise.resolve(destinations),
  getDestination: (id: string) =>
    Promise.resolve(fieldOf(destinations, id) ?? null),
  getOutline: () => Promise.resolve(outline),
  // A reference is `{ page }` here; one without a page is one pdf.js cannot place.
  getPageIndex: (ref: object) =>
    "page" in ref && typeof ref.page === "number"
      ? Promise.resolve(ref.page - 1)
      : Promise.reject(new Error("Invalid page reference")),
  getPage: (i: number) =>
    Promise.resolve(present(pages[i - 1], `page ${String(i)}`)),
});
const item = (
  fontName: string,
  transform: number[],
  height = 10,
): FakeItem => ({
  str: "word",
  fontName,
  transform,
  width: 20,
  height,
});

test("rawFontOf: not an object, not a font, and a font without a name", () => {
  assert.deepEqual(
    [
      rawFontOf("a", null),
      rawFontOf("b", { x: 1 }),
      rawFontOf("c", { loadedName: "L" }),
    ],
    [
      null,
      null,
      {
        id: "c",
        name: "",
        type: undefined,
        subtype: undefined,
        isType3Font: false,
        missingFile: false,
      },
    ],
  );
});

test("a document with no pages is `empty`; text drawn with no font is refused", async () => {
  assert.deepEqual(await factsOf(doc([]), lib), {
    ok: false,
    reason: "empty",
    detail: "the PDF has no pages",
  });
  const r = await factsOf(
    doc([page([item("f0", [10, 0, 0, 10, 50, 700])], {})]),
    lib,
  );
  assert.equal(r.ok, false);
  assert.equal(r.reason, "zero-fonts-on-text");
});

test("metrics, sizes and names fall back when pdf.js gives none", async () => {
  const fonts = {
    // a font with a name and an ascent but no descent
    f1: { loadedName: "f1", name: "Named", ascent: 0.8 },
    // a font with no name and no metrics at all
    f2: { loadedName: "f2" },
  };
  const r = await factsOf(
    doc([
      page(
        [
          item("f1", [10, 0, 0, 10, 50, 700]),
          // zero horizontal scale: the size comes from the item's height…
          item("f2", [0, 0, 0, 0, 100, 700], 12),
          // …or, with no height either, from the vertical scale
          item("f2", [0, 0, 0, 9, 150, 700], 0),
          // an item whose font pdf.js never resolved
          item("gone", [10, 0, 0, 10, 200, 700]),
        ],
        fonts,
      ),
    ]),
    lib,
  );
  assert.equal(r.ok, true);
  const boxes = present(r.facts.layout[0], "a first page").boxes;
  assert.deepEqual(
    boxes.map((b) => [b.font, b.size, b.fill]),
    [
      ["Named", 10, { kind: "unknown" }],
      ["f2", 12, { kind: "unknown" }],
      ["f2", 9, { kind: "unknown" }],
      ["gone", 10, { kind: "unknown" }],
    ],
  );
  assert.deepEqual(
    r.facts.last.words.map((w) => w.text),
    ["word", "word", "word", "word"],
  );
});

test("a failure that is not an Error is named `Error` with its text", () => {
  assert.deepEqual(failureOf("boom"), {
    ok: false,
    reason: "unreadable",
    detail: "Error: boom",
  });
});

test("🔴 a rejection with no value at all is a failure too, not a TypeError out of `readPdf`", () => {
  // Guards: `readPdf` ends in `.catch(failureOf)`, and reading `.name` off `null` threw from inside it.
  assert.deepEqual(
    [failureOf(null), failureOf(undefined)],
    [
      { ok: false, reason: "unreadable", detail: "Error: null" },
      { ok: false, reason: "unreadable", detail: "Error: undefined" },
    ],
  );
});

test("what the pages say: text, links with their page, metadata", async () => {
  const fonts = { f1: { loadedName: "f1", name: "Named", ascent: 0.8 } };
  const plain = page([item("f1", [10, 0, 0, 10, 50, 700])], fonts);
  const linked = page([item("f1", [10, 0, 0, 10, 50, 700])], fonts, {
    annotations: [{ subtype: "Link", url: "https://github.com/adaexample" }],
  });
  const r = await factsOf(doc([plain, linked], { Author: "Ada Example" }), lib);
  assert.ok(r.ok);
  assert.deepEqual(
    [r.facts.pageTexts, r.facts.links, r.facts.metadata],
    [
      ["word", "word"],
      [{ page: 2, uri: "https://github.com/adaexample" }],
      { Author: "Ada Example" },
    ],
  );
});

test("the bibliography anchor: the lowest page of any cite.<key> destination", async () => {
  const fonts = { f1: { loadedName: "f1", name: "Named", ascent: 0.8 } };
  const pages = [1, 2, 3].map(() =>
    page([item("f1", [10, 0, 0, 10, 50, 700])], fonts),
  );
  const facts = async (destinations: unknown) => {
    const r = await factsOf(doc(pages, {}, destinations), lib);
    assert.ok(r.ok);
    return r.facts.bibAnchorPage;
  };
  assert.equal(
    await facts({
      "cite.b": [{ page: 3 }, { name: "XYZ" }],
      "cite.a": [{ page: 2 }, { name: "XYZ" }],
      "section.1": [{ page: 1 }, { name: "XYZ" }],
      // A reference pdf.js cannot place is skipped, not fatal.
      "cite.c": [{ num: 99 }, { name: "XYZ" }],
    }),
    2,
  );
  // No hyperref: no cite destinations, and the value says so.
  assert.equal(await facts({ "section.1": [{ page: 1 }] }), null);
  assert.equal(await facts(null), null);
  // A destination that is not an explicit array is not an anchor.
  assert.equal(await facts({ "cite.a": "named-elsewhere" }), null);
});

test("the appendix anchor: an appendix.<letter> destination, or a bookmark titled «Appendix…»", async () => {
  const fonts = { f1: { loadedName: "f1", name: "Named", ascent: 0.8 } };
  const pages = [1, 2, 3, 4].map(() =>
    page([item("f1", [10, 0, 0, 10, 50, 700])], fonts),
  );
  const facts = async (destinations: unknown, outline: unknown) => {
    const r = await factsOf(doc(pages, {}, destinations, outline), lib);
    assert.ok(r.ok);
    return r.facts.appendixAnchorPage;
  };
  const XYZ = { name: "XYZ" };
  // The standard classes: hyperref names the appendix's sections `appendix.<letter>`.
  assert.equal(
    await facts(
      { "appendix.B": [{ page: 4 }, XYZ], "appendix.A": [{ page: 3 }, XYZ] },
      null,
    ),
    3,
  );
  // IEEEtran's \appendices: the sections are `section*.<n>`; the bookmark's title says appendix,
  // its destination is a name to look up, or an explicit one.
  const named = {
    "section*.5": [{ page: 2 }, XYZ],
    "section*.4": [{ page: 1 }, XYZ],
  };
  assert.equal(
    await facts(named, [
      { title: "Conclusion", dest: "section*.4", items: [] },
      { title: "Appendix A: Details", dest: "section*.5", items: [] },
      { title: "APPENDIX", dest: [{ page: 4 }, XYZ], items: [] },
    ]),
    2,
  );
  // No appendix anywhere, a bookmark whose name resolves to nothing, and no outline at all.
  assert.equal(
    await facts(named, [{ title: "Conclusion", dest: "section*.4" }]),
    null,
  );
  assert.equal(await facts({}, [{ title: "Appendices", dest: "gone" }]), null);
  assert.equal(await facts({}, { not: "a list" }), null);
});
