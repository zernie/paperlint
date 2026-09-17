/**
 * population-map.harness.mjs — the population gate, made visible to the metric, plus the layer
 * its own self-test cannot reach. `npx vigiles test .claude/skills/paper-pipeline/scripts/population-map.harness.mjs`.
 *
 * 🔴 ОБЛАСТЬ СУЖЕНА 2026-08-26. Две находки из четырёх (`untied`, `undeclared`) уехали в правила
 * ESLint — `paper/population-untied` и `paper/population-undeclared`, тесты к ним в
 * `eslint-rules/paper-registry.harness.mjs`. Здесь остались `stale` и `badref`: обе говорят про
 * САМ РЕЕСТР (`repro/populations.tsv`), у обеих нет адреса в статье, и потому правилом ESLint,
 * который репортит только в линтуемый файл, они невыразимы.
 *
 * WHY THIS FILE AND NOT MORE CASES IN THE SELF-TEST. `population-map.selftest.mjs` is thorough —
 * 7 planted cases, both directions. Nothing here duplicates it. Two things were wrong with it
 * anyway:
 *
 *   1. IT IS INVISIBLE TO THE MEASUREMENT. `vigiles audit` scores this repo `Tested: 0`, and the
 *      metric counts `*.harness.mjs` / `*.eval.mjs`. Verified 2026-08-07: bare `npx vigiles test`
 *      reports no harness files found — its glob does not descend into dot-dirs AND the self-test
 *      does not carry a name the collector looks for. Given an explicit path it runs
 *      fine, which is the trap: it is green, correct, and uncounted, so the repo reads
 *      as having no test for its own registry hygiene.
 *
 *   2. IT ONLY EXERCISES `findings()`. Everything between the command line and that function —
 *      finding paper.md, finding repro/populations.tsv, `--flags-only` staying silent on a clean
 *      paper — is what the CI step and `run-mechanical.mjs` actually invoke, and none of it was
 *      under test. This repository's three dead hooks all had correct logic; what was broken was
 *      the wiring around it.
 *
 * 🔴 THE SELF-TEST IS RUN AS A SUBPROCESS, NEVER IMPORTED. It ends in `process.exit(fail ? 1 : 0)`.
 * Import it and a PASSING self-test terminates this process at that line — every assertion below it
 * never runs, and `vigiles test` reports ✓ because nothing threw. That is trap #1 from
 * hooks.harness.mjs wearing a different hat, and it would have been undetectable from the output.
 *
 * Every fixture is a throwaway in a temp dir; nothing here reads or writes a real paper.
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
const SCRIPT = join(HERE, "population-map.mjs");
const SELFTEST = join(HERE, "population-map.selftest.mjs");
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "popmap-harness-")));

/** Run a node script; never throws on a non-zero exit. */
function run(argv) {
  try {
    return { code: 0, out: execFileSync("node", argv, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}

/** A paper dir carrying `body`, and optionally a population registry. */
function paper(name, body, tsv) {
  const d = join(tmp, name);
  mkdirSync(join(d, "repro"), { recursive: true });
  writeFileSync(join(d, "paper.md"), `## Abstract\n\n${body}\n\n## References\n\n[1] x.\n`);
  if (tsv !== undefined) writeFileSync(join(d, "repro", "populations.tsv"), tsv);
  return d;
}

const REG = [
  "id\tprinted\trelation\trelated_to\tgloss",
  "broad\t1,921\troot\t\tthe corpus",
  "census\t134\tdisjoint\tbroad\ta separate sample",
].join("\n");

// ── 1. the self-test still kills every mutant it claims to ─────────────────────────────
// Owning it from a *.harness.mjs is the whole point: the metric now counts it, and a regression in
// the self-test itself fails this file rather than passing unnoticed in a step nobody reads.
{
  const r = run([SELFTEST]);
  assert.equal(r.code, 0, "population-map.selftest.mjs failed:\n" + r.out);
  const m = r.out.match(/(\d+) passed, (\d+) failed/);
  assert.ok(m, "the self-test printed no result line — it may have exited before running:\n" + r.out);
  // A self-test that runs ZERO cases also prints "0 failed" and exits 0. That shape is exactly how
  // this repo's earlier harness reported ✓ on `assert.equal(1, 2)`, so the count is asserted too.
  // Порог опущен 13 → 7 вместе с переносом двух находок в ESLint. Ассерт на ЧИСЛО оставлен:
  // самотест, прогнавший ноль случаев, тоже печатает «0 failed» и выходит нулём.
  assert.ok(Number(m[1]) >= 7, `the self-test ran only ${m[1]} case(s) — cases have gone missing`);
  assert.equal(Number(m[2]), 0, "the self-test reported failures:\n" + r.out);
}

// ── 2. the CLI finds the paper and the registry, and fires on a stale registry row ─────
// 🔴 ФИКСТУРА ПЕРЕПИСАНА 2026-08-26. До этого она подкладывала НЕСВЯЗАННУЮ ПОПУЛЯЦИЮ, а эта
// находка уехала в `paper/population-untied` — то есть прежний «грязный» вход стал чистым, и
// блок молча перестал бы проверять проводку argv → findings(), оставаясь зелёным. Ровно тот
// класс отказа, ради которого этот файл и написан.
{
  const dirty = paper(
    "cli-stale",
    "The resolver ran over all 1,921 repositories at pinned commits.",
    REG,
  );
  const r = run([SCRIPT, dirty, "--flags-only"]);
  assert.match(
    r.out,
    /134 \(census\) is declared and the body no longer prints it/,
    "the CLI did not report a stale registry row — the self-test proves findings() sees it, so what " +
      "is broken is the path from argv to findings():\n" + r.out,
  );
}

// ── 3. …and says NOTHING when every declared population is printed ──────────────────────
// The direction that matters more. A gate that fires on a paper which already obeys the rule gets
// muted the same week, and a muted gate is indistinguishable from an absent one.
{
  const clean = paper(
    "cli-clean",
    "The resolver ran over all 1,921 repositories at pinned commits, and a census of 134\nrepositories is a separate sample from those 1,921, overlapping in seven.",
    REG,
  );
  const r = run([SCRIPT, clean, "--flags-only"]);
  assert.equal(r.out.trim(), "", "--flags-only printed something about a paper whose registry matches its body:\n" + r.out);
}

// ── 4. KNOWN GAP, asserted so it stays visible ─────────────────────────────────────────
// 🔴 A paper with NO repro/populations.tsv exits 0 in silence, and `run-mechanical.mjs` records
// that silence as PASS for draft-paper. So a paper that never declared its populations scores
// identically to one that declared them and tied every one. Absence is invisible again — the same
// shape artifact-coverage.mjs was written to close for the released bundle.
//
// This asserts the CURRENT behaviour. When population-map learns to say "this paper has no
// registry", this assertion flips and must be updated; writing the gap down is how it stops being
// mistaken for coverage.
{
  const bare = paper("cli-no-registry", "We measured 1,921 repositories and a census of 134 repositories.", undefined);
  const r = run([SCRIPT, bare, "--flags-only"]);
  assert.equal(
    r.out.trim(),
    "",
    "population-map now says something about a paper with no registry — good; update this assertion",
  );
}

rmSync(tmp, { recursive: true, force: true });
console.log("✓ population-map: self-test owned (7 cases), CLI wiring fires on a stale row and stays quiet, 1 known gap recorded");
