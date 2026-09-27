/**
 * population-map.mjs — the registry's own findings (`stale`, `badref`), planted in both directions,
 * and the command around them. Until #52 the seven cases below were `population-map.selftest.mjs`,
 * a script the harness spawned and whose "N passed" line it parsed; they are vitest cases now.
 *
 * 🔴 ONE CASE WAS DELETED BEFORE THE MOVE, NOT MOVED, and that is worth remembering: it ran a
 * HAND-COPIED COPY of the checker's regex over a string. A change to the real `printed()` cannot
 * touch such a test by construction. The property is pinned by behaviour instead (case 6).
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { runNode, useTempDir, writeTree } from "../../../test/support.ts";
import { bodyOf, findings } from "./population-map.mjs";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "population-map.mjs",
);
const doc = (bodyLines) =>
  `## Abstract\n\n${bodyLines}\n\n## References\n\n[1] x.\n`;
const kinds = (md, reg) =>
  findings(md, reg).map((f) => `${f.kind}:${f.row.print}`);
const REG = [
  "id\tprinted\trelation\trelated_to\tgloss",
  "broad\t1,921\troot\t\tthe corpus",
  "sub\t1,836\tsubset\tbroad\tthose it could read",
].join("\n");
const HEAD = "id\tprinted\trelation\trelated_to\tgloss\n";

// 1. The direction that matters more: a checker firing on a paper that already obeys gets muted.
test("a registry that matches the body is silent", () => {
  assert.deepEqual(
    kinds(
      doc(
        "The resolver ran over all 1,921 repositories, and read 1,836 of them.",
      ),
      REG,
    ),
    [],
  );
});

// 2. A row for a quantity the paper no longer prints is a claim nobody can check.
test("a stale registry row fires", () => {
  assert.deepEqual(
    kinds(doc("The resolver ran over all 1,921 repositories."), REG),
    ["stale:1,836"],
  );
});

// 3. `retired` is what keeps a set declared after it was cut from the paper.
test("a retired row does not fire", () => {
  assert.deepEqual(
    kinds(
      doc("The resolver ran over all 1,921 repositories, and read 1,836."),
      `${REG}\ngold\t7,310\tretired\t\ta public gold set`,
    ),
    [],
  );
});

// 4. A relation pointing at an id that is not a row — a defect of the TSV alone.
test("a dangling related_to fires", () => {
  assert.deepEqual(
    kinds(
      doc("We read 1,836 repositories."),
      `${HEAD}sub\t1,836\tsubset\tnosuch\tx`,
    ),
    ["badref:1,836"],
  );
});

// 5. A row whose number is absent is `stale`, never also `badref`.
test("a row that is absent is stale, not badref", () => {
  assert.deepEqual(
    kinds(doc("Nothing numeric here."), `${HEAD}sub\t1,836\tsubset\tnosuch\tx`),
    ["stale:1,836"],
  );
});

// 6. `printed()` boundaries through behaviour: 189 is not printed inside 1,189.
test('189 is not "printed" inside 1,189', () => {
  assert.deepEqual(
    kinds(
      doc("A follow-up read covered 1,189 records, of all 1,921."),
      `${HEAD}broad\t1,921\troot\t\tthe corpus\nspread\t189\tsubset\tbroad\tenumerable`,
    ),
    ["stale:189"],
  );
});

// 7. The body stops at the bibliography; with no Abstract it starts at the top, with no
//    References it runs to the end.
test("bodyOf: from Abstract to References, or the whole text when either is missing", () => {
  assert.deepEqual(
    [
      bodyOf(doc("nothing here")).includes("[1] x."),
      bodyOf("pre\n\n## References\n\n[1] x.\n"),
      bodyOf("## Abstract\n\nall of it\n"),
    ],
    [false, "pre\n\n", "## Abstract\n\nall of it\n"],
  );
});

test("a registry row with no printed quantity is reported, not a crash", () => {
  assert.deepEqual(
    findings(doc("x"), `${HEAD}short\n`).map((f) => [f.kind, f.row.id]),
    [["incomplete", "short"]],
  );
});

// ── the command ─────────────────────────────────────────────────────────────────────────
const root = useTempDir("population-map-");
const paper = (name, body, tsv) =>
  writeTree(join(root, name), {
    "paper.md": doc(body),
    ...(tsv === undefined ? {} : { "repro/populations.tsv": tsv }),
  });

test("the command: usage, a paper without markdown, a clean registry, and every finding kind", () => {
  assert.deepEqual(runNode(SCRIPT, []), {
    status: 0,
    stdout: "",
    stderr: "usage: node population-map.mjs <paper-dir> [--flags-only]\n",
  });
  const tex = writeTree(join(root, "tex"), { "paper.tex": "x" });
  assert.match(
    runNode(SCRIPT, [tex]).stderr,
    /population map SKIPPED for .* — no paper\.md\/draft\.md — this checker reads markdown only/,
  );
  const clean = paper(
    "clean",
    "All 1,921 of them.",
    `${HEAD}broad\t1,921\troot\t\tx`,
  );
  assert.equal(
    runNode(SCRIPT, [clean]).stdout,
    "population map: the registry matches the body — no stale rows, no dangling related_to.\n",
  );
  assert.equal(runNode(SCRIPT, [clean, "--flags-only"]).stdout, "");
  const bad = paper(
    "bad",
    "We read 1,836.",
    `${HEAD}sub\t1,836\tsubset\tnosuch\tx\nold\t7,310\tsubset\tsub\tx\nshort\n`,
  );
  assert.deepEqual(runNode(SCRIPT, [bad]).stdout.split("\n").slice(1), [
    '  🔴 sub says it relates to "nosuch", which is not a row in populations.tsv',
    "  ·  7,310 (old) is declared and the body no longer prints it — drop the row or mark it retired",
    "  🔴 short has no printed quantity — the row cannot be checked against the body",
    "",
  ]);
});
