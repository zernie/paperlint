/**
 * novelty_reader_brief.ts prints the one brief a neighbour reader gets, for both routes of assess-novelty step 4
 * (the sibling-read workflow and one Agent-tool launch per neighbour), for a Read/Write-only reader
 * (the `sibling-reader` agent); it refuses a text that is not ready, and `check` runs the coverage check.
 * Execution tier: the novelty fixture on disk, no model, no network.
 * Run: npx vitest run skills/assess-novelty/scripts/novelty_reader_brief.test.ts
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  symlinkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { chunks, glue, lineCount } from "./novelty_reader_brief.ts";
import { test } from "vitest";

test("novelty_reader_brief", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const ROOT = join(here, "..", "..", "..");
  const FIXTURE = relative(ROOT, join(here, "fixtures", "novelty"));
  const SCRIPT = join(here, "novelty_reader_brief.ts");
  const run = (...args: string[]) => {
    const r = spawnSync("node", [SCRIPT, ...args], {
      cwd: ROOT,
      encoding: "utf8",
    });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };

  let n = 0;
  const check = (label: string, cond: boolean) => {
    assert.ok(cond, label);
    n++;
  };

  const table = JSON.parse(
    readFileSync(join(ROOT, FIXTURE, "siblings", "novelty.json"), "utf8"),
  );
  const nb = table.neighbours[0];
  const textLines = lineCount(
    readFileSync(join(ROOT, FIXTURE, nb.text), "utf8"),
  );

  // ── pure helpers ─────────────────────────────────────────────────────────────
  // Guards: lines are counted as the coverage checker counts them — a missing final newline is still a line
  // (31.10: `wc -l` said 1415, the checker wanted 1416, and the reader had to stretch its last chunk).
  check("lineCount: trailing newline", lineCount("a\nb\n") === 2);
  check("lineCount: no trailing newline", lineCount("a\nb") === 2);
  // Guards: chunks tile the text exactly, 400 lines each, the last one short.
  check(
    "chunks(1416) balanced",
    JSON.stringify(chunks(1416)) ===
      "[[1,354],[355,708],[709,1062],[1063,1416]]",
  );
  // Guards: a text just past a 400-line boundary has no stub last chunk — a lone page-break line holds no 8-word quote,
  // so a fixed 400-line cut made a complete read impossible to prove.
  check(
    "chunks(401): no one-line last chunk",
    JSON.stringify(chunks(401)) === "[[1,201],[202,401]]",
  );
  check("chunks(400): one chunk", JSON.stringify(chunks(400)) === "[[1,400]]");
  check(
    "chunks never exceed 400 lines and tile the text",
    [1, 399, 400, 401, 799, 800, 801, 2501].every((n) => {
      const c = chunks(n);
      return (
        c[0]?.[0] === 1 &&
        c[c.length - 1]?.[1] === n &&
        c.every(
          ([a, b], i) =>
            b - a + 1 <= 400 && (i === 0 || a === (c[i - 1]?.[1] ?? -2) + 1),
        )
      );
    }),
  );
  check("chunks(63)", JSON.stringify(chunks(63)) === "[[1,63]]");
  check("glue: clean text 0", glue("one line\nanother line\n") === 0);
  check(
    "glue: two columns 1",
    glue("left col        right col\nmore      text here\n") === 1,
  );

  // ── the brief ────────────────────────────────────────────────────────────────
  {
    const r = run(FIXTURE, nb.id);
    // Guards: a known neighbour with a ready text gets a brief and exit 0.
    check("known neighbour → exit 0", r.code === 0);
    check(
      "brief names the cells file",
      r.out.includes(`${FIXTURE}/siblings/cells/${nb.id}.json`),
    );
    check(
      "brief names the saved text and its line count",
      r.out.includes(`${FIXTURE}/${nb.text} (${textLines} lines`),
    );
    // Guards: every claim and every piece reaches the reader, or its cells cannot cover them.
    for (const c of table.claims) {
      check(`claim ${c.id} is in the brief`, r.out.includes(`- ${c.id}: `));
      for (const p of Object.keys(c.pieces))
        check(
          `piece ${c.id}.${p} is in the brief`,
          r.out.includes(`    ${p}: `),
        );
    }
    // Guards: the chunks are spelled out, so a reader does not decide where reading stops.
    check(
      "brief lists the exact chunks",
      r.out.includes(`[1, ${Math.min(400, textLines)}]`),
    );
    // Guards: the brief asks for nothing a Read/Write-only reader cannot do.
    for (const w of ["pdftotext", "curl", "wc -l", "python3", "mktemp"])
      check(`brief does not ask the reader for ${w}`, !r.out.includes(w));
    // Guards: the hook novelty-brief-nudge stays silent on this brief (it names siblings/cells/).
    check(
      "brief carries the skill's own machinery marker",
      r.out.includes("siblings/cells/"),
    );
    check(
      "first read has no repair block",
      !r.out.includes("failed the checker"),
    );
  }
  {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "reader-brief-")));
    try {
      const errs = join(dir, "errors.txt");
      writeFileSync(errs, `${nb.id}: quote not found: "abc"\n\n`);
      const r = run(FIXTURE, nb.id, "--repair", errs);
      // Guards: a repair read carries exactly the checker's errors for this neighbour.
      check(
        "repair → errors in the brief",
        r.code === 0 && r.out.includes(`${nb.id}: quote not found: "abc"`),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // ── text not ready → exit 2, with the re-extract command for the caller ─────
  {
    const dir = mkdtempSync(join(ROOT, ".tmp-reader-brief-"));
    try {
      const paper = relative(ROOT, join(dir, "p"));
      cpSync(join(ROOT, FIXTURE), join(ROOT, paper), { recursive: true });
      rmSync(join(ROOT, paper, nb.text));
      const missing = run(paper, nb.id);
      // Guards: a missing text is refused, never briefed into a reader that has no shell to fetch it.
      check(
        "missing text → exit 2",
        missing.code === 2 &&
          missing.err.includes("pdftotext") &&
          missing.out === "",
      );
      writeFileSync(
        join(ROOT, paper, nb.text),
        "left column words        right column words\n".repeat(20),
      );
      const glued = run(paper, nb.id);
      // Guards: a column-glued text is refused with its glue number.
      check(
        "glued text → exit 2",
        glued.code === 2 && glued.err.includes("glue 1.00"),
      );

      // ── check: the coverage check the reader cannot run itself ───────────────
      cpSync(join(ROOT, FIXTURE, nb.text), join(ROOT, paper, nb.text));
      const text = readFileSync(join(ROOT, paper, nb.text), "utf8").split("\n");
      const quote = text
        .find((l) => l.trim().split(/\s+/).length >= 10)!
        .trim();
      mkdirSync(join(ROOT, paper, "siblings", "cells"), { recursive: true });
      const cells = join(ROOT, paper, "siblings", "cells", `${nb.id}.json`);
      writeFileSync(
        cells,
        JSON.stringify({
          id: nb.id,
          read: "full",
          coverage: [{ lines: [1, textLines], quote }],
        }),
      );
      const ok = run("check", paper, nb.id);
      // Guards: a cells file whose coverage tiles the text passes.
      check(
        "check: good coverage → exit 0",
        ok.code === 0 && ok.out.includes("coverage ok"),
      );
      writeFileSync(
        cells,
        JSON.stringify({
          id: nb.id,
          read: "full",
          coverage: [
            {
              lines: [1, textLines],
              quote: "words that are not in the paper at all here",
            },
          ],
        }),
      );
      const bad = run("check", paper, nb.id);
      // Guards: an invented coverage quote fails with the checker's own message.
      check(
        "check: invented quote → exit 1",
        bad.code === 1 && !bad.out.includes("coverage ok"),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // ── usage errors ─────────────────────────────────────────────────────────────
  {
    const r = run(FIXTURE, "no-such-id");
    check(
      "unknown neighbour → exit 1 with the ids",
      r.code === 1 && r.err.includes(nb.id),
    );
    check("missing paper → exit 1", run("no/such/paper", nb.id).code === 1);
    check("no args → exit 1", run().code === 1);
    check("check without id → exit 1", run("check", FIXTURE).code === 1);
  }

  console.log(`✓ novelty_reader_brief.harness — ${n} checks`);
}, 300_000);

// Consumers reach package scripts through a symlinked skill folder. Node resolves import.meta.url to the real file
// but leaves argv[1] as the link, so a guard comparing the two never runs main(): exit 0, no output, read as success.
test("novelty_reader_brief runs when started through a symlink", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "brief-link-")));
  const link = join(dir, "novelty_reader_brief.ts");
  symlinkSync(join(here, "novelty_reader_brief.ts"), link);
  const r = spawnSync("node", [link], { encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(
    {
      code: r.status,
      usage: r.stderr.startsWith("usage: novelty_reader_brief.ts"),
    },
    { code: 1, usage: true },
  );
}, 120_000);
