/**
 * check_novelty.py, candidates: a work a refutation surfaced waits for the author's add / cite / skip, and an
 * "add" is not settled until sibling-read has read it in full. Execution tier: the novelty fixture, no model.
 * Run: npx vitest run skills/assess-novelty/scripts/novelty_candidates.test.ts
 *
 * Why: the refutation pass found four works and the agent added all four as neighbours itself; the author wants each
 * one put to them first, with the passages in front of them. The gate is that an undecided work fails the check.
 * Each case copies the fixture and writes ONE candidate; every failing class has a clean twin that passes.
 */
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "vitest";

test("novelty_candidates", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const FIXTURE = join(here, "fixtures", "novelty");
  const CHECKER = join(here, "check_novelty.py");
  const SENTENCE =
    "We ran Checkstyle before and after applying the initial patch and the final patch.";
  const ABSTRACT =
    "We study whether code review removes the coding convention violations a linter reports.";
  const CONCLUSION =
    "Review removes some violations, and most of the rest stay in the code after the merge.";

  const candidate = (over: Record<string, unknown> = {}) => ({
    id: "roe20",
    title: "Does code review really remove style violations?",
    url: "https://example.org/roe20",
    text: "siblings/data/roe20.txt",
    found_by: [{ claim: "P5-1", file: "siblings/refutation.md" }],
    summary: "Runs a linter on review patches before and after review.",
    abstract: { page: 1, text: ABSTRACT },
    conclusion: { page: 9, text: CONCLUSION },
    passages: [
      {
        claim: "P5-1",
        page: 4,
        quote: SENTENCE,
        crop: "siblings/data/crops/roe20-1.png",
        meaning: "The before/after linter run is an established instrument.",
      },
    ],
    suggestion: "cite",
    suggestion_why: "Same instrument, not the same object.",
    ...over,
  });
  const decided = (choice: string, reason = "the instrument only") => ({
    decision: {
      choice,
      reason,
      at: "2026-10-29T16:00:00+05:00",
      source: "page",
    },
  });

  // Copy the fixture, write one candidate (or none) plus its text and crop, run the checker.
  const run = (
    c: Record<string, unknown> | null,
    { crop = true, text = `${ABSTRACT}\n${SENTENCE}\n${CONCLUSION}` } = {},
  ) => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "novelty-cand-")));
    try {
      cpSync(FIXTURE, dir, { recursive: true });
      if (c) {
        mkdirSync(join(dir, "siblings", "candidates"), { recursive: true });
        mkdirSync(join(dir, "siblings", "data", "crops"), { recursive: true });
        writeFileSync(
          join(dir, "siblings", "candidates", `${c.id}.json`),
          JSON.stringify(c, null, 2),
        );
        writeFileSync(
          join(dir, "siblings", "data", "roe20.txt"),
          `Section 3.\n${text}\n`,
        );
        if (crop)
          writeFileSync(
            join(dir, "siblings", "data", "crops", "roe20-1.png"),
            "png",
          );
      }
      const r = spawnSync("python3", ["-I", CHECKER, dir], {
        encoding: "utf8",
      });
      return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const passes = (
    c: Record<string, unknown> | null,
    what: string,
    opts = {},
  ) => {
    const r = run(c, opts);
    assert.equal(r.code, 0, `must pass: ${what}\n${r.out}`);
    assert.doesNotMatch(
      r.out,
      /candidate/,
      `silent about candidates: ${what}\n${r.out}`,
    );
  };
  const fails = (
    c: Record<string, unknown>,
    re: RegExp,
    what: string,
    opts = {},
  ) => {
    const r = run(c, opts);
    assert.equal(r.code, 1, `must fail: ${what}\n${r.out}`);
    assert.match(r.out, re, `wrong reason for: ${what}\n${r.out}`);
  };

  // ── clean: no candidates folder at all; a decided "cite" with its passage in the text ──
  passes(null, "no candidates");
  passes(
    candidate(decided("cite")),
    "a cite decision, quote in the text, crop on disk",
  );

  // ── 1. undecided: the author has not answered ──
  fails(
    candidate(),
    /roe20: candidate waiting for the author's decision/,
    "no decision",
  );

  // ── 2. "add" is only settled once the work is a neighbour read in full ──
  fails(
    candidate(decided("add")),
    /roe20: approved as a neighbour but not read in full yet/,
    "add, not read",
  );
  passes(
    candidate({ id: "doe26", ...decided("add") }),
    "add of a work that is now a neighbour read in full",
  );

  // ── 3. a neighbour the author did not approve ──
  fails(
    candidate({ id: "doe26", ...decided("skip") }),
    /doe26: is a neighbour in novelty.json, but the author's decision was 'skip'/,
    "skipped yet a neighbour",
  );

  // ── 4. skip needs its reason ──
  fails(
    candidate(decided("skip", " ")),
    /skip without a reason/,
    "skip with a blank reason",
  );
  passes(
    candidate(
      decided("skip", "different object: code review, not rules files"),
    ),
    "skip with a reason",
  );

  // ── 5. what the page shows must be real: the quote in the saved text, the crop on disk ──
  fails(
    candidate(decided("cite")),
    /passages\[0\] quote not found in siblings\/data\/roe20.txt/,
    "quote missing from the text",
    { text: "Something else entirely, said in nine whole words here." },
  );
  fails(
    candidate(decided("cite")),
    /passages\[0\] crop siblings\/data\/crops\/roe20-1.png does not exist/,
    "crop not rendered",
    { crop: false },
  );

  // ── 6. shape: a field the page needs, a short quote, a choice outside the three ──
  fails(
    candidate({ summary: "", ...decided("cite") }),
    /roe20.json: missing summary/,
    "no summary",
  );

  // ── 7. the authors' own words open every tab: abstract and conclusion, each with its page, each in the text ──
  fails(
    candidate({ abstract: undefined, ...decided("cite") }),
    /roe20.json: missing abstract/,
    "no abstract",
  );
  fails(
    candidate({ conclusion: { text: CONCLUSION }, ...decided("cite") }),
    /conclusion needs page and text/,
    "a conclusion without its page",
  );
  fails(
    candidate(decided("cite")),
    /roe20.json: abstract not found in siblings\/data\/roe20.txt/,
    "an abstract the saved text does not hold",
    { text: `${SENTENCE}\n${CONCLUSION}` },
  );
  fails(
    candidate({
      passages: [{ ...candidate().passages[0], quote: "before and after" }],
      ...decided("cite"),
    }),
    /passages\[0\] quote has 3 words; at least 8/,
    "a three-word quote",
  );
  fails(
    candidate({
      decision: { choice: "maybe", at: "2026-10-29", source: "page" },
    }),
    /decision.choice 'maybe' is not one of add, cite, skip/,
    "an unknown choice",
  );
}, 300_000);
