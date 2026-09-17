/**
 * pipeline-check.harness.mjs — one planted defect at a time, on an otherwise-clean scorecard.
 *
 * 🔴 С 2026-08-26 ЗДЕСЬ ШЕСТЬ ПРОВЕРОК, А НЕ ДВАДЦАТЬ ДВЕ. Шестнадцать, чей вход — сам документ,
 * уехали в `eslint-rules/pipeline-status.mjs`, и их случаи — в `eslint-rules/pipeline-status.harness.mjs`.
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
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
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
  const r = (id, status = "☑", date = TODAY) => ({ id, status, date, ...(over[id] ?? {}) });
  const row = (o, ...mid) => `| ${o.id} | work | ${o.skill ?? "skill"} | ${mid.length ? mid.join(" | ") + " | " : ""}${o.status} | ${o.date} | ${o.result ?? "result"} | — |`;
  // The GATES `Requires` cell, canonical by default so the baseline is silent — `{ structure: {
  // requires: "render" } }` plants a dropped edge. `harden` deliberately declares four of its five
  // canonical inputs: the fifth (`priordelta`) has no row in this fixture, and the clean case asserts that the checker stays
  // quiet about an edge there is nowhere to point at.
  const req = (id, dflt) => over[id]?.requires ?? dflt;
  const verdict = over.verdict ?? "Submit-ready — every gate green, artifact reproduces clean, nothing blocking.";
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
    cwd: ROOT, encoding: "utf8", env: ENV, stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out);
}

/** …and just the kinds, sorted. */
const kinds = (name, over = {}, today = TODAY) => findings(name, over, today).map((f) => f.kind).sort();

/** A SETUP-shaped (7-column) table head. */
const PLAIN_HEAD = [
  "| id | Work | Skill | Status | Date | Result | Open |",
  "|----|------|-------|--------|------|--------|------|",
];

/** Assert the EXACT set of kinds, so a check firing for the wrong reason cannot hide. */
const expect = (name, over, want, today = TODAY) =>
  assert.deepEqual(kinds(name, over, today), [...want].sort(), `${name}: wrong finding set`);

// ═══════════════════════════════════════════════════════════════════════════════════════
// 🔴 2026-08-26 — ШЕСТНАДЦАТЬ СЛУЧАЕВ ОТСЮДА УЕХАЛИ ВМЕСТЕ СО СВОИМИ ПРОВЕРКАМИ.
//
// Проверки, чей вход — ОДИН markdown-документ, переехали в `eslint-rules/pipeline-status.mjs`,
// и их случаи — в колоцированный `eslint-rules/pipeline-status.harness.mjs`. Здесь их НЕ
// оставили даже «на всякий случай»: тест, гоняющий проверку, которой в файле нет, зелен всегда
// и потому врёт сильнее, чем его отсутствие.
//
//   undated-continuous · gate-missing-input · gate-stale-input · unknown-input ·
//   unattributed-verdict · single-family-jury (+ mixed-family / non-judging / widened) ·
//   scalar-verdict (+ owned) · study-before-frame · undeclared-input (+ superset) ·
//   unrun-gate · no-verdict · weak-accept-unowned · ceiling-unplanned ·
//   unattributed-row · unreadable-row · duplicate-id
//
// Осталось шесть проверок, и все шесть читают вход ИЗВНЕ файла: git, часы, `reviews/`,
// `process.env`. Ровно они и проверяются ниже.
//
// ⚠️ ДВА СЛУЧАЯ ПРО РАЗБОР ПЕРЕПИСАНЫ, А НЕ УДАЛЕНЫ, и это важнее самого их сохранения.
// «Заголовок с хвостовым текстом» и «строка `| Id |`» — регрессии парсера, найденные живыми
// 2026-08-09, и раньше они наблюдались через `unrun-gate`, которого здесь больше нет. Если бы
// их просто оставили с ожиданием `[]`, они стали бы зелёными ПО ПОСТРОЕНИЮ: пустой набор
// находок получается и когда парсер прав, и когда он молча съел таблицу. Поэтому обе
// переписаны так, чтобы наблюдаться через `stale-continuous` — проверку, которая тут осталась:
// парсер не увидел секцию ⇒ строки нет ⇒ находки нет ⇒ ассерт красный.
// ═══════════════════════════════════════════════════════════════════════════════════════

// ── 0. the baseline says nothing ───────────────────────────────────────────────────────
// Asserted first and asserted hard. Every case below is "the baseline plus one thing", so a noisy
// baseline would make all of them meaningless — and a checker that fires on a clean scorecard is
// muted within a day, which is worse than one that misses.
expect("clean", {}, []);

// ── 1. stale-continuous — a ☑ about text that has since been rewritten ─────────────────
// verify-citations was numbered like a one-shot step, so a citation added after the last run counted
// as verified. The project rule "we checked last cycle does not count" was already written down.
// ВХОД ИЗВНЕ ФАЙЛА: дата последнего коммита, тронувшего текст статьи — поэтому проверка осталась.
expect("stale-continuous", { cites: { date: "2020-01-01" } }, ["stale-continuous"]);

// ── 2. submit-access — no portal account inside somebody else's moderation window ──────
// Found at T−4 days on a finished paper, as the sole item on the critical path: OpenReview profiles
// are moderated for up to two weeks and there is no expedite route without an institutional email.
// ВХОД ИЗВНЕ ФАЙЛА: часы.
expect("submit-access", { access: { status: "☐" }, deadline: "2026-09-01" }, ["submit-access"], "2026-08-20");

// ── 3. …and a far deadline with the same blank row is NOT urgent ───────────────────────
expect("submit-access-not-yet", { access: { status: "☐" } }, []);

// ── 4. a history section is evidence, not status ──────────────────────────────────────
// A superseded 2026-08-02 row saying the artifact was unhosted re-triggered the credential check on
// 2026-08-05, hours after the artifact went up. This project appends rather than rewrites, so every
// scorecard accumulates old rows, and parsing them makes every past state live again.
// Наблюдается через `stale-continuous`: строка в истории датирована 2020 годом, и если бы срез
// «истории» не работал, она бы её и дала.
expect(
  "history-is-not-status",
  { tail: ["<!-- HISTORY -->", "", "### CONTINUOUS", ...PLAIN_HEAD, "| cites | any cite | verify-citations | ☑ | 2020-01-01 | old | — |"].join("\n") },
  [],
);

// ── 5. a heading may carry trailing text — the RELAXATION, still observable ────────────
// The old pattern was `/^###\s+([A-Z]+)\s*$/`: an all-caps Latin word and NOTHING after it. Papers
// annotate their headings (`### GATES (re-run 06.08)`), so the pattern failed on the real document
// and the section simply stayed unset — SILENTLY. Planted here as a CONTINUOUS row with an old date:
// the finding exists only if the annotated heading was recognised as a section.
expect("heading-with-trailing-text", {
  tail: [
    "### CONTINUOUS (re-run 2026-08-09, after the cut)",
    ...PLAIN_HEAD,
    "| refs | any ref moved | verify-refs | ☑ | 2020-01-01 | ok | — |",
  ].join("\n"),
}, ["stale-continuous"]);

// ── 6. the row `| Id |` is a ROW, and the header is whatever `thead` says it is ────────
// The old parser guessed the header with `/^\|\s*id\s*\|/i`, so the DATA row `| Id | …` — the
// research-ideate row, before the words-not-codes rename — matched the guess and was eaten on every
// scorecard in the repo, for as long as the template had existed. A row that parses as nothing, on
// every paper, forever. Planted as a stale CONTINUOUS row so its absence is visible: if the row were
// still being swallowed, the finding set would be EMPTY.
{
  const f = findings("header-lookalike-row", {
    tail: ["### CONTINUOUS", ...PLAIN_HEAD, "| Id | Header-lookalike | research-ideate | ☑ | 2020-01-01 | — | — |"].join("\n"),
  });
  assert.deepEqual(f.map((x) => x.kind), ["stale-continuous"], "header-lookalike-row: wrong finding set");
  assert.match(f[0].msg, /\bId\b/, "header-lookalike-row: the swallowed row is not named in the finding");
}


// ── 17. the cold-read report's filename: BOTH live spellings must count ───────────────────────────
// 2026-08-24: this gate announced "nobody without context has read this text" about a paper that had
// been cold-read TWICE that day. The report was filed as `…-coldread-worksheet.md`; the pattern knew
// only `cold-read`. Neither spelling is a typo — the skill is `cold-read-diff` while the scorecard
// row id, in the very file this checker parses, is `coldread` — so a gate keyed to one of two live
// spellings is guaranteed to miss. Its failure mode is the expensive one: a hole announced where
// none exists is how a gate stops being read, and then a real hole walks past it.
for (const fname of ["2026-08-24-cold-read-report.md", "2026-08-24-coldread-worksheet.md"]) {
  const name = "coldread-" + fname.replace(/[^a-z]/gi, "");
  const d = join(tmp, name);
  mkdirSync(join(d, "reviews"), { recursive: true });
  writeFileSync(join(d, "PIPELINE-STATUS.md"), scorecard());
  writeFileSync(join(d, "paper.md"), "## 1. Heading\n\nProse.\n");
  writeFileSync(join(d, "reviews", fname), "# a reader with no context\n");
  const out = execFileSync("node", [SCRIPT, d, "--json", `--today=${TODAY}`], {
    cwd: ROOT, encoding: "utf8", env: ENV, stdio: ["ignore", "pipe", "pipe"],
  });
  const ks = JSON.parse(out).map((f) => f.kind);
  assert.ok(!ks.includes("no-cold-read"),
    `a real cold-read report named ${fname} was reported as missing — the pattern does not know this spelling`);
}
// …and the half that proves the check still works: reviews/ exists and holds nothing cold-read.
{
  const d = join(tmp, "coldread-absent");
  mkdirSync(join(d, "reviews"), { recursive: true });
  writeFileSync(join(d, "PIPELINE-STATUS.md"), scorecard());
  writeFileSync(join(d, "paper.md"), "## 1. Heading\n\nProse.\n");
  writeFileSync(join(d, "reviews", "2026-08-24-hotcrp-reviews.md"), "# not a cold read\n");
  const out = execFileSync("node", [SCRIPT, d, "--json", `--today=${TODAY}`], {
    cwd: ROOT, encoding: "utf8", env: ENV, stdio: ["ignore", "pipe", "pipe"],
  });
  assert.ok(JSON.parse(out).map((f) => f.kind).includes("no-cold-read"),
    "reviews/ with no cold-read report was NOT reported — widening the pattern silenced the gate");
}

rmSync(tmp, { recursive: true, force: true });
console.log("✓ pipeline-check: 6 случаев + два спеллинга отчёта холодного чтения — по одному подложенному дефекту за раз, на шесть проверок, чей вход ВНЕ файла (git · часы · reviews/ · env). Остальные шестнадцать уехали в eslint-rules/pipeline-status.harness.mjs");
