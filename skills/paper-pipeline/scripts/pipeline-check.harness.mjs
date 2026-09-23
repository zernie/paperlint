/**
 * pipeline-check.harness.mjs — one planted defect at a time, on an otherwise-clean scorecard.
 *
 * 🔴 Since 2026-08-26 HERE ARE SIX CHECKS, NOT TWENTY-TWO. Sixteen, whose input is the document itself,
 * moved to `eslint-rules/pipeline-status.mjs`, and their cases — to `eslint-rules/pipeline-status.harness.mjs`.
 * `npx vigiles test .claude/skills/paper-pipeline/scripts/pipeline-check.harness.mjs`.
 *
 * WHY THIS EXISTS ALONGSIDE THE FIXTURE TEST IN hooks.harness.mjs. That one runs the checker over
 * `scripts/fixtures/dirty/`, a scorecard carrying every defect at once, and asserts each kind
 * appears somewhere in the output. It cannot answer the question that matters when a check breaks:
 * WHICH defect produced WHICH finding. A checker that reports `stale-continuous` for the wrong
 * reason — say, because the date parser returns null and every row looks undated — passes that test
 * forever. So each case below plants exactly ONE defect on a scorecard that is otherwise silent, and
 * asserts the FULL SET of kinds, not merely that the expected one is present. Collateral findings
 * are written into the expectation on purpose: they are part of the contract, and an unlisted one is
 * a change in behaviour nobody asked for.
 *
 * 🔴 Assertions run at MODULE TOP LEVEL. `vigiles test` imports the file and treats "did not throw"
 * as a pass — an earlier harness here exported a `tests` object, nothing ran, and the runner printed
 * ✓ on a file whose only assertion was `assert.equal(1, 2)`.
 *
 * 🔴 The subprocess environment is SCRUBBED of OSF_TOKEN and GITHUB_TOKEN. The `credential-available`
 * check fires when the session holds a credential that could clear a parked blocker, so with either
 * token exported this suite would pass on a laptop and fail in CI, or the reverse. A test whose
 * verdict depends on who is running it is not a test.
 *
 * Fixtures are throwaways in a temp dir; no real scorecard is read or written.
 */
import assert from "node:assert/strict";
import { parseStatus } from "./pipeline-check.mjs";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { consumerRoot } from "./consumer.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = consumerRoot();
const SCRIPT = join(HERE, "pipeline-check.mjs");
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "pipecheck-harness-")));

// The paper source is written NOW, so `newestSourceDate` returns today and the staleness comparison
// has something real to compare against. Every clean row therefore carries today's date: hard-coding
// a date would make this suite start failing on its own the following morning.
const TODAY = new Date().toISOString().slice(0, 10);
const FAR = "2027-12-31";

const ENV = { ...process.env };
delete ENV.OSF_TOKEN;
delete ENV.GITHUB_TOKEN;

/**
 * A scorecard with the four sections the template requires, all green. `over` replaces individual
 * cells: `{ cites: { date: "2020-01-01" } }`, `{ verdict: "…" }`, `{ deadline: "2026-08-18" }`,
 * `{ tail: "…" }` for anything appended after the last section, `{ preamble: "…" }` for anything
 * inserted BEFORE the first heading (the only way to plant a row under no heading at all).
 */
function scorecard(over = {}) {
  const r = (id, status = "☑", date = TODAY) => ({
    id,
    status,
    date,
    ...(over[id] ?? {}),
  });
  const row = (o, ...mid) =>
    `| ${o.id} | work | ${o.skill ?? "skill"} | ${mid.length ? mid.join(" | ") + " | " : ""}${o.status} | ${o.date} | ${o.result ?? "result"} | — |`;
  // The GATES `Requires` cell, canonical by default so the baseline is silent — `{ structure: {
  // requires: "render" } }` plants a dropped edge. `harden` deliberately declares four of its five
  // canonical inputs: the fifth (`priordelta`) has no row in this fixture, and the clean case asserts that the checker stays
  // quiet about an edge there is nowhere to point at.
  const req = (id, dflt) => over[id]?.requires ?? dflt;
  const verdict =
    over.verdict ??
    "Submit-ready — every gate green, artifact reproduces clean, nothing blocking.";
  return [
    "# PIPELINE-STATUS — harness fixture",
    `Venue: Fixture Workshop · Deadline: ${over.deadline ?? FAR} · Blind: double · State: drafting`,
    "",
    `**Readiness verdict:** ${verdict}`,
    "",
    over.preamble ?? "",
    "",
    "### SETUP",
    "| id | Work | Skill | Status | Date | Result | Open |",
    "|----|------|-------|--------|------|--------|------|",
    row(r("idea")),
    row(r("access")),
    row(r("frame")),
    "",
    "### LOOP",
    "| id | Work | Skill | Status | Date | Result | Open |",
    "|----|------|-------|--------|------|--------|------|",
    row(r("study")),
    row(r("draft")),
    row(r("arc")),
    "",
    "### CONTINUOUS",
    "| id | Trigger | Skill | Status | Date | Result | Open |",
    "|----|---------|-------|--------|------|--------|------|",
    row(r("cites")),
    row(r("render")),
    "",
    "### GATES",
    "| id | Gate | Skill | Requires | Status | Date | Result | Open |",
    "|----|------|-------|----------|--------|------|--------|------|",
    row(r("structure"), req("structure", "render, arc")),
    row(r("writing"), req("writing", "draft, arc, structure")),
    row(r("panel"), req("panel", "structure, writing")),
    row(r("harden"), req("harden", "panel, structure, writing, cites")),
    "",
    over.tail ?? "",
  ].join("\n");
}

/** Write a fixture and return the findings pipeline-check reports, verbatim. */
function findings(name, over = {}, today = TODAY) {
  const d = join(tmp, name);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "PIPELINE-STATUS.md"), scorecard(over));
  writeFileSync(join(d, "paper.md"), "## 1. Heading\n\nProse.\n");
  const out = execFileSync("node", [SCRIPT, d, "--json", `--today=${today}`], {
    cwd: ROOT,
    encoding: "utf8",
    env: ENV,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out);
}

/** …and just the kinds, sorted. */
const kinds = (name, over = {}, today = TODAY) =>
  findings(name, over, today)
    .map((f) => f.kind)
    .sort();

/** A SETUP-shaped (7-column) table head. */
const PLAIN_HEAD = [
  "| id | Work | Skill | Status | Date | Result | Open |",
  "|----|------|-------|--------|------|--------|------|",
];

/** Assert the EXACT set of kinds, so a check firing for the wrong reason cannot hide. */
const expect = (name, over, want, today = TODAY) =>
  assert.deepEqual(
    kinds(name, over, today),
    [...want].sort(),
    `${name}: wrong finding set`,
  );

// ═══════════════════════════════════════════════════════════════════════════════════════
// 🔴 2026-08-26 — SIXTEEN CASES MOVED OUT ALONG WITH THEIR CHECKS.
//
// Checks whose input is ONE markdown document moved to `eslint-rules/pipeline-status.mjs`,
// and their cases — to the colocated `eslint-rules/pipeline-status.harness.mjs`. They were NOT
// left behind even "just in case": a test running a check that is not in the file is always green
// and therefore lies worse than its absence.
//
//   undated-continuous · gate-missing-input · gate-stale-input · unknown-input ·
//   unattributed-verdict · single-family-jury (+ mixed-family / non-judging / widened) ·
//   scalar-verdict (+ owned) · study-before-frame · undeclared-input (+ superset) ·
//   unrun-gate · no-verdict · weak-accept-unowned · ceiling-unplanned ·
//   unattributed-row · unreadable-row · duplicate-id
//
// Six checks remain, and all six read input FROM OUTSIDE the file: git, clock, `reviews/`,
// `process.env`. Exactly those are checked below.
//
// ⚠️ TWO CASES ABOUT PARSING WERE REWRITTEN, NOT DELETED, and this is more important than keeping them.
// "Heading with trailing text" and "line `| Id |`" — parser regressions, found live
// on 2026-08-09, and before they were observed through `unrun-gate`, which no longer exists here. If they
// had simply been left expecting `[]`, they would have turned green BY CONSTRUCTION: empty set
// of findings appears both when the parser is right and when it silently ate the table. So both
// were rewritten to be observed through `stale-continuous` — the check that stayed here:
// parser did not see section ⇒ no line ⇒ no finding ⇒ assertion is red.
// ═══════════════════════════════════════════════════════════════════════════════════════

// ── 0. the baseline says nothing ───────────────────────────────────────────────────────
// Asserted first and asserted hard. Every case below is "the baseline plus one thing", so a noisy
// baseline would make all of them meaningless — and a checker that fires on a clean scorecard is
// muted within a day, which is worse than one that misses.
expect("clean", {}, []);

// ── 1. stale-continuous — a ☑ about text that has since been rewritten ─────────────────
// verify-citations was numbered like a one-shot step, so a citation added after the last run counted
// as verified. The project rule "we checked last cycle does not count" was already written down.
// INPUT FROM OUTSIDE THE FILE: the date of the last commit that touched the paper's text — that is why the check stayed.
expect("stale-continuous", { cites: { date: "2020-01-01" } }, [
  "stale-continuous",
]);

// ── 2. submit-access — no portal account inside somebody else's moderation window ──────
// Found at T−4 days on a finished paper, as the sole item on the critical path: OpenReview profiles
// are moderated for up to two weeks and there is no expedite route without an institutional email.
// INPUT FROM OUTSIDE THE FILE: the clock.
expect(
  "submit-access",
  { access: { status: "☐" }, deadline: "2026-09-01" },
  ["submit-access"],
  "2026-08-20",
);

// ── 3. …and a far deadline with the same blank row is NOT urgent ───────────────────────
expect("submit-access-not-yet", { access: { status: "☐" } }, []);

// ── 4. a history section is evidence, not status ──────────────────────────────────────
// A superseded 2026-08-02 row saying the artifact was unhosted re-triggered the credential check on
// 2026-08-05, hours after the artifact went up. This project appends rather than rewrites, so every
// scorecard accumulates old rows, and parsing them makes every past state live again.
// Observed through `stale-continuous`: a row in history is dated 2020, and if the history
// slice did not work, it would have given it.
expect(
  "history-is-not-status",
  {
    tail: [
      "## History",
      "",
      "### CONTINUOUS",
      ...PLAIN_HEAD,
      "| cites | any cite | verify-citations | ☑ | 2020-01-01 | old | — |",
    ].join("\n"),
  },
  [],
);

// ── 5. a heading may carry trailing text — the RELAXATION, still observable ────────────
// The old pattern was `/^###\s+([A-Z]+)\s*$/`: an all-caps Latin word and NOTHING after it. Papers
// annotate their headings (`### GATES (re-run 06.08)`), so the pattern failed on the real document
// and the section simply stayed unset — SILENTLY. Planted here as a CONTINUOUS row with an old date:
// the finding exists only if the annotated heading was recognised as a section.
expect(
  "heading-with-trailing-text",
  {
    tail: [
      "### CONTINUOUS (re-run 2026-08-09, after the cut)",
      ...PLAIN_HEAD,
      "| refs | any ref moved | verify-refs | ☑ | 2020-01-01 | ok | — |",
    ].join("\n"),
  },
  ["stale-continuous"],
);

// ── 6. the row `| Id |` is a ROW, and the header is whatever `thead` says it is ────────
// The old parser guessed the header with `/^\|\s*id\s*\|/i`, so the DATA row `| Id | …` — the
// research-ideate row, before the words-not-codes rename — matched the guess and was eaten on every
// scorecard in the repo, for as long as the template had existed. A row that parses as nothing, on
// every paper, forever. Planted as a stale CONTINUOUS row so its absence is visible: if the row were
// still being swallowed, the finding set would be EMPTY.
{
  const f = findings("header-lookalike-row", {
    tail: [
      "### CONTINUOUS",
      ...PLAIN_HEAD,
      "| Id | Header-lookalike | research-ideate | ☑ | 2020-01-01 | — | — |",
    ].join("\n"),
  });
  assert.deepEqual(
    f.map((x) => x.kind),
    ["stale-continuous"],
    "header-lookalike-row: wrong finding set",
  );
  assert.match(
    f[0].msg,
    /\bId\b/,
    "header-lookalike-row: the swallowed row is not named in the finding",
  );
}

// ── 17. the cold-read report's filename: BOTH live spellings must count ───────────────────────────
// 2026-08-24: this gate announced "nobody without context has read this text" about a paper that had
// been cold-read TWICE that day. The report was filed as `…-coldread-worksheet.md`; the pattern knew
// only `cold-read`. Neither spelling is a typo — the skill is `cold-read-diff` while the scorecard
// row id, in the very file this checker parses, is `coldread` — so a gate keyed to one of two live
// spellings is guaranteed to miss. Its failure mode is the expensive one: a hole announced where
// none exists is how a gate stops being read, and then a real hole walks past it.
for (const fname of [
  "2026-08-24-cold-read-report.md",
  "2026-08-24-coldread-worksheet.md",
]) {
  const name = "coldread-" + fname.replace(/[^a-z]/gi, "");
  const d = join(tmp, name);
  mkdirSync(join(d, "reviews"), { recursive: true });
  writeFileSync(join(d, "PIPELINE-STATUS.md"), scorecard());
  writeFileSync(join(d, "paper.md"), "## 1. Heading\n\nProse.\n");
  writeFileSync(join(d, "reviews", fname), "# a reader with no context\n");
  const out = execFileSync("node", [SCRIPT, d, "--json", `--today=${TODAY}`], {
    cwd: ROOT,
    encoding: "utf8",
    env: ENV,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ks = JSON.parse(out).map((f) => f.kind);
  assert.ok(
    !ks.includes("no-cold-read"),
    `a real cold-read report named ${fname} was reported as missing — the pattern does not know this spelling`,
  );
}
// …and the half that proves the check still works: reviews/ exists and holds nothing cold-read.
{
  const d = join(tmp, "coldread-absent");
  mkdirSync(join(d, "reviews"), { recursive: true });
  writeFileSync(join(d, "PIPELINE-STATUS.md"), scorecard());
  writeFileSync(join(d, "paper.md"), "## 1. Heading\n\nProse.\n");
  writeFileSync(
    join(d, "reviews", "2026-08-24-hotcrp-reviews.md"),
    "# not a cold read\n",
  );
  const out = execFileSync("node", [SCRIPT, d, "--json", `--today=${TODAY}`], {
    cwd: ROOT,
    encoding: "utf8",
    env: ENV,
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.ok(
    JSON.parse(out)
      .map((f) => f.kind)
      .includes("no-cold-read"),
    "reviews/ with no cold-read report was NOT reported — widening the pattern silenced the gate",
  );
}

rmSync(tmp, { recursive: true, force: true });
console.log(
  "✓ pipeline-check: 6 cases + two spellings of the cold-read report — one planted defect at a time, on six checks whose input is OUTSIDE the file (git · clock · reviews/ · env). The other sixteen moved to eslint-rules/pipeline-status.harness.mjs",
);

// ── THE HISTORY CUT ──────────────────────────────────────────────────────────
// Added 2026-09-19, and the reason it was added is the finding: `currentPart` had NO test at
// all. The word "History" appeared nowhere in this file, so the function that decides which
// half of a scorecard counts as current was running unwatched.
//
// 🔴 That is also why the cleanup it guards was unsafe until now. `HISTORY_MARK_RE` — a regex
// over the raw sentence «Всё, что ниже, — история» — was deleted in favour of the heading path
// alone, and neither the old branch nor the new one could be shown to work. Two attempts at a
// discriminator through the CLI returned the same answer for both inputs, which says nothing
// about the subject: same answer for different inputs means the probe is measuring itself.
// Going through the exported parser instead separates them in one call.
//
// Both halves: the buried row is gone under a marker heading, and PRESENT under one that is not
// a marker. Without the second, a parser that dropped every second section would pass.
{
  const body = (heading) => `# Scorecard

### CONTINUOUS
| id | Trigger | Skill | Status | Date | Result | Open |
|----|---------|-------|--------|------|--------|------|
| live | x | s | ☑ | 2026-09-01 | current | — |

## ${heading}

### CONTINUOUS
| id | Trigger | Skill | Status | Date | Result | Open |
|----|---------|-------|--------|------|--------|------|
| buried | x | s | ☑ | 2001-01-01 | superseded snapshot | — |
`;
  const ids = (t) =>
    Object.values(parseStatus(t).sections)
      .flat()
      .map((r) => r.id);

  for (const marker of [
    "History",
    "Archive",
    "history",
    "Archive of superseded rows",
  ]) {
    const got = ids(body(marker));
    assert.deepEqual(
      got,
      ["live"],
      `a row under the «${marker}» marker is still counted as current — a superseded snapshot ` +
        `reads as today's status, which is the exact failure the cut exists to prevent: ${JSON.stringify(got)}`,
    );
  }

  // The other half. A heading that merely mentions neither word must NOT cut, or the check
  // silently stops seeing whole sections and reports a clean scorecard it never read.
  const kept = ids(body("Notes"));
  assert.deepEqual(
    kept,
    ["live", "buried"],
    `an ordinary heading cut the document — sections after it vanish unnoticed: ${JSON.stringify(kept)}`,
  );
}
