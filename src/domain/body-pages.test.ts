import { describe, expect, it } from "vitest";
import {
  bodyEnd,
  isAppendixHeading,
  isReferencesHeading,
  pageSplit,
  type Anchors,
} from "./body-pages.ts";

describe("isReferencesHeading", () => {
  it.each([
    "References",
    "REFERENCES",
    "R EFERENCES",
    "Bibliography",
    "7 References",
    "VII. REFERENCES",
    "  References  ",
  ])("%j is a heading", (line) => {
    expect(isReferencesHeading(line)).toBe(true);
  });

  it.each(["See the references below", "References to prior work", "Refs", ""])(
    "%j is not",
    (line) => {
      expect(isReferencesHeading(line)).toBe(false);
    },
  );
});

describe("bodyEnd", () => {
  it("a heading below body text on its page: that page is a body page", () => {
    expect(
      bodyEnd([
        "Intro\nbody",
        "more body",
        "end of the body\nReferences\n[1] A.",
        "Appendix",
      ]),
    ).toEqual({ kind: "found", by: "references", page: 3, bodyPages: 3 });
  });

  it("a heading that is the first text of its page: the body ends on the page before", () => {
    expect(bodyEnd(["Intro\nbody", "more body", "References\n[1] A."])).toEqual(
      { kind: "found", by: "references", page: 3, bodyPages: 2 },
    );
  });

  it("empty lines and a bare page number above the heading are not body", () => {
    expect(bodyEnd(["body", "\n  \n7\nR EFERENCES\n[1] x"])).toEqual({
      kind: "found",
      by: "references",
      page: 2,
      bodyPages: 1,
    });
  });

  it("a statement or appendix after the references is not counted", () => {
    expect(
      bodyEnd([
        "body",
        "R EFERENCES\n[1] x\nLLM Usage Statement",
        "Appendix A",
      ]),
    ).toEqual({ kind: "found", by: "references", page: 2, bodyPages: 1 });
  });

  it("no heading on any page is said, not guessed", () => {
    expect(bodyEnd(["body", "more"])).toEqual({ kind: "missing" });
    expect(bodyEnd([])).toEqual({ kind: "missing" });
  });
});

describe("bodyEnd: a «References» line that is not the heading", () => {
  const BODY = [
    "Intro\nbody",
    "Related work\nReferences\nto prior work are many.",
  ];

  it("🔴 a bare «References» line in the body loses to a heading followed by [1]", () => {
    expect(
      bodyEnd([...BODY, "more body", "last body line\nReferences\n[1] A."]),
    ).toEqual({ kind: "found", by: "references", page: 4, bodyPages: 4 });
  });

  it("🔴 with hyperref's anchor, a bare «References» on an earlier page is ignored", () => {
    expect(
      bodyEnd([...BODY, "References\n[1] A.", "Appendix"], {
        bib: 3,
        appendix: null,
      }),
    ).toEqual({ kind: "found", by: "references", page: 3, bodyPages: 2 });
  });

  it("🔴 a table header «References» above the heading on the anchor's page: the heading is the confirmed one", () => {
    expect(
      bodyEnd(["body", "TABLE 2\nTool\nReferences\nx\nReferences\n[1] A."], {
        bib: 2,
        appendix: null,
      }),
    ).toEqual({ kind: "found", by: "references", page: 2, bodyPages: 2 });
  });

  it("with an anchor and no [1] after the heading, the last heading line on the anchor's page is taken", () => {
    expect(
      bodyEnd(["body", "Tool\nReferences\nx\nReferences\nAbel, A."], {
        bib: 2,
        appendix: null,
      }),
    ).toEqual({ kind: "found", by: "references", page: 2, bodyPages: 2 });
    expect(
      bodyEnd(["body", "References\nAbel, A. (2020)."], {
        bib: 2,
        appendix: null,
      }),
    ).toEqual({ kind: "found", by: "references", page: 2, bodyPages: 1 });
  });

  it("without an anchor or a confirmed heading, the first bare heading is the fallback", () => {
    expect(bodyEnd(["body", "References\nAbel, A. (2020)."])).toEqual({
      kind: "found",
      by: "references",
      page: 2,
      bodyPages: 1,
    });
  });
});

describe("bodyEnd: the two signals disagree", () => {
  it("the anchor's page has no heading line: said, with the anchor", () => {
    expect(
      bodyEnd(["body", "References\n[1] A.", "[2] B."], {
        bib: 3,
        appendix: null,
      }),
    ).toEqual({
      kind: "disagree",
      what: "references",
      heading: null,
      anchor: 3,
    });
  });

  it("a confirmed heading on another page than the anchor's: said, with both", () => {
    expect(
      bodyEnd(["body\nReferences\n[1] quoted", "References\n[1] A."], {
        bib: 2,
        appendix: null,
      }),
    ).toEqual({ kind: "disagree", what: "references", heading: 1, anchor: 2 });
  });

  it("an anchor past the last page is a disagreement, not a crash", () => {
    expect(bodyEnd(["References\n[1] A."], { bib: 5, appendix: null })).toEqual(
      {
        kind: "disagree",
        what: "references",
        heading: null,
        anchor: 5,
      },
    );
  });
});

describe("bodyEnd: running headers and footers are not body", () => {
  /** A page of an ACM-style paper: a running header, then `text`. */
  const page = (n: number, text: string) =>
    `Conf '26, June ${String(n)}, Place\nAuthors\n${text}`;

  it("🔴 a heading at the top of its page, under a running header: the page is not body", () => {
    const pages = [1, 2, 3].map((n) => page(n, `body ${String(n)}`));
    expect(bodyEnd([...pages, page(4, "References\n[1] A.")])).toEqual({
      kind: "found",
      by: "references",
      page: 4,
      bodyPages: 3,
    });
  });

  it("body text under the header and above the heading still makes the page body", () => {
    const pages = [1, 2, 3].map((n) => page(n, `body ${String(n)}`));
    expect(
      bodyEnd([...pages, page(4, "the end of the body\nReferences\n[1] A.")]),
    ).toEqual({ kind: "found", by: "references", page: 4, bodyPages: 4 });
  });

  it("a line on only two pages is not a running header: it counts as body", () => {
    expect(bodyEnd(["Setup\nbody", "x", "Setup\nReferences\n[1] A."])).toEqual({
      kind: "found",
      by: "references",
      page: 3,
      bodyPages: 3,
    });
  });
});

describe("isAppendixHeading", () => {
  it.each([
    "Appendix A.",
    "APPENDIX",
    "A PPENDIX B",
    "Appendices",
    "Appendix 1:",
  ])("%j is a heading", (line) => {
    expect(isAppendixHeading(line)).toBe(true);
  });
  it.each([
    "Appendix A shows the rest.",
    "See the appendix",
    "Appendix A Proofs",
    "",
  ])("%j is not", (line) => {
    expect(isAppendixHeading(line)).toBe(false);
  });
});

describe("bodyEnd: an appendix before the references ends the body", () => {
  const PAGES = [
    "body",
    "more body",
    "the conclusion ends here",
    "Appendix A.\nDetailed results\nTABLE 3",
    "References\n[1] A.",
  ];

  it("🔴 the appendix at the top of its page, the references after it: the body ends on the page before", () => {
    expect(bodyEnd(PAGES, { bib: 5, appendix: 4 })).toEqual({
      kind: "found",
      by: "appendix",
      page: 4,
      bodyPages: 3,
    });
  });

  it("an appendix that starts below the conclusion on its page: that page is body", () => {
    const pages = [...PAGES];
    pages[3] = "the conclusion ends here\nAppendix A.\nDetails";
    expect(bodyEnd(pages, { bib: 5, appendix: 4 })).toEqual({
      kind: "found",
      by: "appendix",
      page: 4,
      bodyPages: 4,
    });
  });

  it("an appendix after the references changes nothing", () => {
    expect(
      bodyEnd(["body", "end\nReferences\n[1] A.", "Appendix A.\nx"], {
        bib: 2,
        appendix: 3,
      }),
    ).toEqual({ kind: "found", by: "references", page: 2, bodyPages: 2 });
  });

  it("the appendix and the references on one page: the heading that comes first ends the body", () => {
    expect(
      bodyEnd(["body", "end\nAppendix A.\nx\nReferences\n[1] A."], {
        bib: 2,
        appendix: 2,
      }),
    ).toEqual({ kind: "found", by: "appendix", page: 2, bodyPages: 2 });
  });

  it("an appendix and no references heading at all: the appendix ends the body", () => {
    expect(
      bodyEnd(["body", "Appendix\nx"], { bib: null, appendix: 2 }),
    ).toEqual({
      kind: "found",
      by: "appendix",
      page: 2,
      bodyPages: 1,
    });
  });
});

describe("bodyEnd: where the appendix is not taken, or not found", () => {
  it("without hyperref's anchor the appendix is not looked for: a sentence can end on «Appendix A.»", () => {
    expect(
      bodyEnd(["body, detailed in\nAppendix A.", "end\nReferences\n[1] A."]),
    ).toEqual({ kind: "found", by: "references", page: 2, bodyPages: 2 });
  });

  it("hyperref anchors the appendix on a page with no line reading «Appendix»: said", () => {
    expect(
      bodyEnd(["body", "A Proofs\nx"], { bib: null, appendix: 2 }),
    ).toEqual({
      kind: "disagree",
      what: "appendix",
      heading: null,
      anchor: 2,
    });
  });

  it("an appendix anchor past the last page is a disagreement, not a crash", () => {
    expect(bodyEnd(["body"], { bib: null, appendix: 4 })).toEqual({
      kind: "disagree",
      what: "appendix",
      heading: null,
      anchor: 4,
    });
  });
});

describe("pageSplit: the appendix counts as body, the reference pages are the ones holding only references", () => {
  it("no appendix: the body up to the references, the rest references", () => {
    expect(
      pageSplit(["body", "end\nReferences\n[1] A.", "[2] B.", "[3] C."], {
        bib: 2,
        appendix: null,
      }),
    ).toEqual({
      kind: "found",
      page: 2,
      bodyPages: 2,
      refPages: 2,
      appendixFrom: null,
    });
  });

  it("🔴 an appendix before the references is body: it does not end the body", () => {
    expect(
      pageSplit(
        [
          "body",
          "Appendix A.\nDetails",
          "more details\nReferences\n[1] A.",
          "[2] B.",
        ],
        { bib: 3, appendix: 2 },
      ),
    ).toEqual({
      kind: "found",
      page: 3,
      bodyPages: 3,
      refPages: 1,
      appendixFrom: null,
    });
  });

  it("🔴 an appendix after the references is body: the pages from it to the end", () => {
    expect(
      pageSplit(
        [
          "body",
          "end\nReferences\n[1] A.",
          "[2] B.",
          "[3] C.\nAppendix A.\nx",
          "y",
        ],
        { bib: 2, appendix: 4 },
      ),
    ).toEqual({
      kind: "found",
      page: 2,
      bodyPages: 4,
      refPages: 1,
      appendixFrom: 4,
    });
  });
});

describe("pageSplit: the appendix and the references on one page", () => {
  it("an appendix after the references on their own page: that page is counted once", () => {
    expect(
      pageSplit(["body", "end\nReferences\n[1] A.\nAppendix A.\nx"], {
        bib: 2,
        appendix: 2,
      }),
    ).toEqual({
      kind: "found",
      page: 2,
      bodyPages: 2,
      refPages: 0,
      appendixFrom: 2,
    });
  });

  it("an appendix above the references on their page is body before them, like any text", () => {
    expect(
      pageSplit(["body", "end\nAppendix A.\nx\nReferences\n[1] A.", "[2] B."], {
        bib: 2,
        appendix: 2,
      }),
    ).toEqual({
      kind: "found",
      page: 2,
      bodyPages: 2,
      refPages: 1,
      appendixFrom: null,
    });
  });

  it("the references at the top of their page: that page holds only references", () => {
    expect(
      pageSplit(["body", "References\n[1] A.", "Appendix A.\nx"], {
        bib: 2,
        appendix: 3,
      }),
    ).toEqual({
      kind: "found",
      page: 2,
      bodyPages: 2,
      refPages: 1,
      appendixFrom: 3,
    });
  });
});

describe("pageSplit: what is said rather than counted, and what is not looked for", () => {
  it.each<[string, readonly string[], Anchors, string]>([
    [
      "no references heading",
      ["body", "Appendix\nx"],
      { bib: null, appendix: 2 },
      "missing",
    ],
    [
      "an appendix anchor with no heading",
      ["body", "References\n[1] A.", "x"],
      { bib: 2, appendix: 3 },
      "disagree",
    ],
    [
      "a references anchor with no heading",
      ["body", "x"],
      { bib: 2, appendix: null },
      "disagree",
    ],
  ])("%s: said, not counted", (_, pages, anchors, kind) => {
    expect(pageSplit(pages, anchors).kind).toBe(kind);
  });

  it("without anchors the references heading is found in the text, and no appendix is looked for", () => {
    expect(
      pageSplit(["body", "end\nReferences\n[1] A.", "Appendix A.\nx"]),
    ).toEqual({
      kind: "found",
      page: 2,
      bodyPages: 2,
      refPages: 1,
      appendixFrom: null,
    });
  });
});
