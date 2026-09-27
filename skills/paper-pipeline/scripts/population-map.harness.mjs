/**
 * population-map.harness.mjs — the population gate, made visible to the metric, plus the layer
 * its own self-test cannot reach. `npx vigiles test .claude/skills/paper-pipeline/scripts/population-map.harness.mjs`.
 *
 * 🔴 SCOPE NARROWED 2026-08-26. Two findings out of four (`untied`, `undeclared`) moved to ESLint
 * rules — `paper/population-untied` and `paper/population-undeclared`, tests for them in
 * `eslint-rules/paper-registry.harness.mjs`. Two remain here: `stale` and `badref`, both are about
 * THE REGISTRY ITSELF (`repro/populations.tsv`), both have no address in the paper, and so cannot be expressed by ESLint,
 * which reports only to the linted file.
 *
 * The findings themselves are planted in `population-map.test.mjs` (vitest; until #52 a
 * self-test script this harness spawned). This file keeps what only the command shows: finding
 * paper.md and repro/populations.tsv, and `--flags-only` staying silent on a clean paper — the
 * wiring the CI step and `run-mechanical.mjs` actually invoke.
 */
import assert from "node:assert/strict";
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
const SCRIPT = join(HERE, "population-map.mjs");
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "popmap-harness-")));

/** Run a node script; never throws on a non-zero exit. */
function run(argv) {
  try {
    return {
      code: 0,
      out: execFileSync("node", argv, {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}

/** A paper dir carrying `body`, and optionally a population registry. */
function paper(name, body, tsv) {
  const d = join(tmp, name);
  mkdirSync(join(d, "repro"), { recursive: true });
  writeFileSync(
    join(d, "paper.md"),
    `## Abstract\n\n${body}\n\n## References\n\n[1] x.\n`,
  );
  if (tsv !== undefined)
    writeFileSync(join(d, "repro", "populations.tsv"), tsv);
  return d;
}

const REG = [
  "id\tprinted\trelation\trelated_to\tgloss",
  "broad\t1,921\troot\t\tthe corpus",
  "census\t134\tdisjoint\tbroad\ta separate sample",
].join("\n");

// ── 2. the CLI finds the paper and the registry, and fires on a stale registry row ─────
// 🔴 FIXTURE REWRITTEN 2026-08-26. Before that it planted an UNLINKED POPULATION, and that
// finding moved to `paper/population-untied` — meaning the old «dirty» input became clean, and
// the block would silently stop checking the argv → findings() wiring while staying green. Exactly that
// class of failure this file was written for.
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
      "is broken is the path from argv to findings():\n" +
      r.out,
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
  assert.equal(
    r.out.trim(),
    "",
    "--flags-only printed something about a paper whose registry matches its body:\n" +
      r.out,
  );
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
  const bare = paper(
    "cli-no-registry",
    "We measured 1,921 repositories and a census of 134 repositories.",
    undefined,
  );
  const r = run([SCRIPT, bare, "--flags-only"]);
  assert.equal(
    r.out.trim(),
    "",
    "population-map now says something about a paper with no registry — good; update this assertion",
  );
}

rmSync(tmp, { recursive: true, force: true });
console.log(
  "✓ population-map: self-test owned (7 cases), CLI wiring fires on a stale row and stays quiet, 1 known gap recorded",
);
