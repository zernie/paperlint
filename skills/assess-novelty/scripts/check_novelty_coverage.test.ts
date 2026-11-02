/**
 * check_novelty.py, coverage: a neighbour marked read "full" proves it with one verbatim sentence per chunk of
 * its saved text. Execution tier: the novelty fixture on disk, no model, no network.
 * Run: npx vitest run skills/assess-novelty/scripts/check_novelty_coverage.test.ts
 *
 * Why: one Read returns at most 25,000 tokens — a 1,790-line text came back as lines 1-627 — yet
 * the neighbour was marked read "full", and a 'no' cell (the one that grants novelty) rests on that mark.
 * Each case copies the fixture, makes ONE change; every failing class has a clean twin that passes.
 */
import {
  cpSync,
  mkdtempSync,
  readFileSync,
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

test("check_novelty_coverage", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const FIXTURE = join(here, "fixtures", "novelty");
  const CHECKER = join(here, "check_novelty.py");
  const TEXT = join("siblings", "data", "doe-preprint.txt");

  // Copy the fixture, let `change` edit the novelty table and the saved text, run the checker.
  const run = (change: (f: { json: any; text: string }) => void) => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "novelty-cov-")));
    try {
      cpSync(FIXTURE, dir, { recursive: true });
      const jsonPath = join(dir, "siblings", "novelty.json");
      const files = {
        json: JSON.parse(readFileSync(jsonPath, "utf8")),
        text: readFileSync(join(dir, TEXT), "utf8"),
      };
      change(files);
      writeFileSync(jsonPath, JSON.stringify(files.json, null, 2));
      writeFileSync(join(dir, TEXT), files.text);
      const r = spawnSync("python3", ["-I", CHECKER, dir], {
        encoding: "utf8",
      });
      return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const passes = (change: Parameters<typeof run>[0], what: string) => {
    const r = run(change);
    assert.equal(r.code, 0, `must pass: ${what}\n${r.out}`);
  };
  const fails = (
    change: Parameters<typeof run>[0],
    re: RegExp,
    what: string,
  ) => {
    const r = run(change);
    assert.equal(r.code, 1, `must fail: ${what}\n${r.out}`);
    assert.match(r.out, re, `wrong reason for: ${what}\n${r.out}`);
  };
  const doe = (j: any) => j.neighbours.find((n: any) => n.id === "doe26");
  const lines = (t: string) =>
    t.split("\n").length - (t.endsWith("\n") ? 1 : 0);
  // A sentence that sits on line 9 of the fixture text, and one from its last lines.
  const EARLY = "instruction that the model interprets. The agent’s block is";
  const LATE = "the denominator of the main estimate; it means the estimate";

  // ── clean: the committed fixture covers its one chunk ───────────────────────────
  passes(
    () => {},
    "fixture as committed: one chunk, lines 1-63, quote inside it",
  );

  // ── 1. read "full" with no coverage at all ─────────────────────────────────────
  fails(
    (f) => {
      delete doe(f.json).coverage;
    },
    /doe26: read 'full' not proven: no coverage/,
    "full without coverage",
  );
  {
    // An abstract read turns P5-1 ⚪ against its 🟢 ledger row, so this twin cannot exit 0; it must only be silent
    // about coverage.
    const r = run((f) => {
      delete doe(f.json).coverage;
      doe(f.json).read = "abstract";
      for (const c of f.json.claims)
        for (const cell of Object.values<any>(c.cells?.doe26 ?? {}))
          if (cell.has === "no") cell.has = "unknown";
    });
    assert.doesNotMatch(
      r.out,
      /coverage|not proven/,
      `an abstract-only neighbour needs no coverage\n${r.out}`,
    );
  }

  // ── 2. the chunks must tile the text: start at 1, no gap, end at the last line ──
  fails(
    (f) => {
      doe(f.json).coverage = [
        { lines: [1, 30], quote: EARLY },
        { lines: [40, lines(f.text)], quote: LATE },
      ];
    },
    /doe26: read 'full' not proven: lines 31-39 have no coverage quote/,
    "a gap between chunks",
  );
  fails(
    (f) => {
      doe(f.json).coverage = [{ lines: [1, 50], quote: EARLY }];
    },
    /doe26: read 'full' not proven: lines 51-63 have no coverage quote/,
    "stops before the last line",
  );
  passes((f) => {
    doe(f.json).coverage = [
      { lines: [1, 30], quote: EARLY },
      { lines: [31, lines(f.text)], quote: LATE },
    ];
  }, "two chunks that tile the text");

  // ── 3. a chunk longer than one careful read ────────────────────────────────────
  fails(
    (f) => {
      f.text =
        f.text +
        Array.from(
          { length: 400 },
          (_, i) => `padding line ${i} so the text runs past one chunk`,
        ).join("\n") +
        "\n";
      doe(f.json).coverage = [{ lines: [1, lines(f.text)], quote: EARLY }];
    },
    /doe26: coverage chunk 1-463 is 463 lines; at most 400/,
    "one chunk over 400 lines",
  );

  // ── 4. the quote must be inside ITS chunk, not anywhere in the text ────────────
  fails(
    (f) => {
      doe(f.json).coverage = [
        { lines: [1, 30], quote: LATE },
        { lines: [31, lines(f.text)], quote: EARLY },
      ];
    },
    /doe26: coverage quote for lines 1-30 not found in those lines/,
    "quotes swapped between chunks",
  );

  // ── 5. a coverage quote is a sentence, not a word ──────────────────────────────
  fails(
    (f) => {
      doe(f.json).coverage = [
        { lines: [1, lines(f.text)], quote: "the model" },
      ];
    },
    /doe26: coverage quote for lines 1-63 has 2 words; at least 8/,
    "a two-word quote",
  );

  // ── 6. lines are counted the way Read and wc -l count them: by \n only ─────────
  // pdftotext writes a form feed at every page break; Python's splitlines() splits on it, so a 1,825-line text
  // counted 1,850 and readers (sibling-read) had to stretch their last range past the file's real end.
  passes((f) => {
    f.text = f.text
      .replace("\n\nAbstract", "\n\f\nAbstract")
      .replace("Pat Doe", "Pat\fDoe");
    doe(f.json).coverage = [{ lines: [1, lines(f.text)], quote: EARLY }];
  }, "a text with form feeds is covered by its \\n line count");
}, 300_000);
