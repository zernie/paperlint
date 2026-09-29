/** What a page says, read from pdf.js's shapes: text, links, metadata. */
import { describe, expect, it } from "vitest";
import { linkTargetsOf, metadataOf, pageTextOf, xmpOf } from "./pdf-content.ts";

describe("pageTextOf", () => {
  it("joins items without a space, and breaks the line where pdf.js marks one", () => {
    expect(
      pageTextOf([
        { str: "Ada Ex", hasEOL: false },
        { str: "ample", hasEOL: true },
        { type: "beginMarkedContent" },
        { str: "", hasEOL: true },
        { str: "Intro" },
      ]),
    ).toBe("Ada Example\n\nIntro");
  });
});

describe("linkTargetsOf", () => {
  it("each link's target once: url, else unsafeUrl; not other annotations, not empty ones", () => {
    expect(
      linkTargetsOf([
        { subtype: "Link", url: "https://a.example" },
        { subtype: "Link", url: "https://a.example" },
        { subtype: "Link", unsafeUrl: "mailto:x@example.org" },
        { subtype: "Link", dest: "sec:1" },
        { subtype: "Link", url: "" },
        { subtype: "Widget", url: "https://b.example" },
      ]),
    ).toEqual(["https://a.example", "mailto:x@example.org"]);
  });
});

describe("metadataOf and xmpOf", () => {
  it("every string of the Info dictionary, its custom entries and the XMP packet, flat", () => {
    const xmp = xmpOf(
      new Map<unknown, unknown>([
        ["dc:creator", ["Ada Example", "Bob Other"]],
        ["dc:title", "A Title"],
        ["xmp:rating", 3],
        [7, "not a name"],
      ]),
    );
    expect(xmp).toEqual({
      "dc:creator": ["Ada Example", "Bob Other"],
      "dc:title": "A Title",
      "xmp:rating": 3,
    });
    expect(
      metadataOf(
        {
          Author: "Ada Example",
          Subject: "",
          Trapped: { name: "False" },
          Custom: { "PTEX.Fullbanner": "This is pdfTeX" },
        },
        xmp,
      ),
    ).toEqual({
      Author: "Ada Example",
      "PTEX.Fullbanner": "This is pdfTeX",
      "dc:creator": "Ada Example; Bob Other",
      "dc:title": "A Title",
    });
  });

  it("no Info and no packet: nothing", () => {
    expect(xmpOf(null)).toBeNull();
    expect(metadataOf(null, null)).toEqual({});
  });
});
