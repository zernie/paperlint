/** The abstract out of the PDF's page text: the classes' headings, hyphenation, and the refusals. */
import assert from "node:assert/strict";
import { test } from "vitest";
import { latexReader } from "./index.ts";

const abstractOfPages = latexReader.abstractInPdf;

test("IEEEtran: «Abstract—» to «Index Terms—», a hyphenated word rejoined, a compound kept", () => {
  const page = [
    "Agents That Lie About Tests",
    "Anonymous Author(s)",
    "Abstract—Coding agents report green builds that never ran. We mea-",
    "sure how often across 1,200 runs, and find that agent-",
    "based pipelines hide it in 31% of them.",
    "Index Terms—agents, testing",
    "I. INTRODUCTION",
    "Coding agents …",
  ].join("\n");
  assert.deepEqual(
    abstractOfPages([page], "\\begin{abstract}… agent-based pipelines …"),
    {
      ok: true,
      value:
        "Coding agents report green builds that never ran. We measure how often across 1,200 runs, and find that agent-based pipelines hide it in 31% of them.",
    },
  );
});

test("acmart: «ABSTRACT» on its own line, ended by «CCS CONCEPTS»", () => {
  const page = [
    "Title",
    "ABSTRACT",
    "One line.",
    "Another line.",
    "CCS CONCEPTS",
    "• Software and its engineering",
  ].join("\n");
  assert.deepEqual(abstractOfPages([page], ""), {
    ok: true,
    value: "One line. Another line.",
  });
});

test("the end may be on the second page; no keywords block ends it at the first section", () => {
  assert.deepEqual(
    abstractOfPages(
      ["T\nAbstract. Starts here", "and ends here.\n1 Introduction\nx"],
      "",
    ),
    { ok: true, value: "Starts here and ends here." },
  );
});

test("🔴 no «Abstract» line, no end, or nothing between: refused by what was looked for", () => {
  assert.deepEqual(abstractOfPages(["Title\nBody"], ""), {
    ok: false,
    error: "the PDF's first two pages have no line beginning with «Abstract»",
  });
  const noEnd = abstractOfPages(["Abstract\ntext only"], "");
  assert.ok(!noEnd.ok);
  assert.match(noEnd.error, /^the PDF's abstract has no end paperlint knows/);
  assert.deepEqual(abstractOfPages(["ABSTRACT\nKEYWORDS\nx"], ""), {
    ok: false,
    error: "the PDF's abstract is empty between its heading and the next block",
  });
});

test("a glued hyphen before a non-lower-case start is kept unspaced; a spaced dash is a space; a soft hyphen always breaks", () => {
  assert.deepEqual(
    abstractOfPages(
      [
        "Abstract\nwe compare GPT-\n4 and X -\nNot this, and veri\u00ad\nfied\nKeywords",
      ],
      "",
    ),
    { ok: true, value: "we compare GPT-4 and X - Not this, and verified" },
  );
});
