/**
 * provenance.harness.mjs — what remains from `check-provenance.mjs` after the move, verified from
 * both sides. `npx vigiles test .claude/skills/paper-pipeline/scripts/provenance.harness.mjs`.
 *
 * 🔴 SCOPE NARROWED 2026-08-26. Three findings out of five moved to ESLint rules:
 *   arm-mismatch    → `paper/number-arm-mismatch`
 *   untraced-number → `paper/number-untraced`
 *   arm-unlabelled  → `paper/number-arm-unlabelled`
 * Their cases (including the literal defect from 2026-08-05 and "prediction named its own arm — stay quiet")
 * moved to `eslint-rules/paper-registry.harness.mjs`, where they stand alongside runs on real
 * papers. Two checks remain here, which do NOT READ the paper BODY AT ALL — they are given only
 * a directory, and so cannot be lint rules:
 *
 *   no-numbers-gate   missing `repro/paper_numbers.py`;
 *   numbers-coverage  how many quantities are sourced against the ratchet `numbers-grandfathered.txt`.
 *                     This is NOT a finding, but a coverage measurement — and it must always print.
 *
 * 🔴 WHY GUARDS ARE CHECKED SEPARATELY. Both remaining checks have two exit conditions,
 * inherited from the deleted half: no `paper.md` ⇒ silent, no non-empty
 * provenance file ⇒ silent. After the move they look unmotivated ("what does prose have to do with it
 * if we look at a directory?") — and the first person to "remove redundancy" will change behavior. Assertions
 * below pin them as contract.
 *
 * 🔴 Assertions run at MODULE TOP LEVEL. `vigiles test` imports the file and treats "did not throw"
 * as a pass, so a `tests` export or a describe block would report ✓ having run nothing — verified in
 * this repo on a file containing only `assert.equal(1, 2)` inside an exported function.
 *
 * Every fixture is a throwaway in a temp dir. Nothing here reads or writes a real paper.
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
const SCRIPT = join(HERE, "check-provenance.mjs");
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "prov-harness-")));

/** Run the gate over a fixture and return the set of finding kinds it reported. */
function kinds(dir) {
  let out;
  try {
    out = execFileSync("node", [SCRIPT, dir], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    out = (e.stdout || "") + (e.stderr || "");
  }
  return {
    set: new Set([...out.matchAll(/^\s*\[([a-z-]+)\]/gm)].map((m) => m[1])),
    out,
  };
}

/**
 * A paper dir with a body, a provenance file, and (unless `gate: false`) the per-paper numbers gate.
 * The gate file must exist or `no-numbers-gate` fires on every fixture and drowns the signal — which
 * is itself a finding worth having, and is asserted on its own below.
 */
function paper(
  name,
  { body, notes, gate = true, numbers, grandfathered, noPaper = false },
) {
  const d = join(tmp, name);
  mkdirSync(join(d, "repro"), { recursive: true });
  if (!noPaper)
    writeFileSync(
      join(d, "paper.md"),
      `## Abstract\n\n${body}\n\n## References\n\n[1] x.\n`,
    );
  if (notes !== undefined) writeFileSync(join(d, "NOTES.md"), notes);
  if (gate)
    writeFileSync(
      join(d, "repro", "paper_numbers.py"),
      "# the per-paper numbers gate\n",
    );
  if (numbers !== undefined)
    writeFileSync(join(d, "repro", "numbers.tsv"), numbers);
  if (grandfathered !== undefined)
    writeFileSync(join(d, "repro", "numbers-grandfathered.txt"), grandfathered);
  return d;
}

// The provenance rows of the real 2026-08-05 defect: the count of failures is recorded against the
// ANNOTATED arm, in which the extractor's guesses were written in as if an author had authored them.
const NOTES = [
  "# where each number comes from",
  "- `.all.strict.compiled` = 147 — rules files that compiled",
  "- `.all.annotated.failedContradicted` = 22 — files failing admission in the annotated arm",
].join("\n");

// ── 1. QUIET ON CORRECT: paper has gate and registry — only coverage measurement, zero findings ──
// First this half: a check that cries on correct input is worse than no check.
{
  const d = paper("covered", {
    body: "The headline rate is **15.0%** across the corpus.",
    notes: NOTES,
    numbers: "# id\tvalue\n a\t1\n b\t2\n",
    grandfathered: "# still raw\n42\n",
  });
  const { set, out } = kinds(d);
  assert.ok(
    !set.has("no-numbers-gate"),
    "paper with gate got `no-numbers-gate`:\n" + out,
  );
  assert.ok(
    set.has("numbers-coverage"),
    "coverage measurement must always print:\n" + out,
  );
  assert.match(
    out,
    /2 quantities are sourced and guarded, 1 are still raw/,
    "numbers in coverage measurement do not match — counted registry lines and ratchet lines:\n" +
      out,
  );
  assert.equal(
    set.size,
    1,
    "after three checks moved, this input must give EXACTLY the coverage measurement:\n" +
      out,
  );
}

// ── 2. a paper with no numbers gate at all is told so ──────────────────────────────────
// The coverage question, not a defect in the prose: without `repro/paper_numbers.py` every printed
// figure is a hand-typed digit whose only link to its data file is somebody's memory.
{
  const d = paper("no-gate", {
    body: "Nothing bolded here.",
    notes: NOTES,
    gate: false,
  });
  const { set, out } = kinds(d);
  assert.ok(
    set.has("no-numbers-gate"),
    "a paper with no repro/paper_numbers.py was not told:\n" + out,
  );
  assert.ok(
    !set.has("numbers-coverage"),
    "no gate — nothing to cover, measurement must not print:\n" + out,
  );
}

// ── 3. gate exists, no `numbers.tsv` registry — silence, not zero coverage ─────────────────
// The distinction is semantic: «gate was copied but no quantity has been registered in it yet» is NOT the same
// as «0 of 0 sourced», and printing the latter would mean reporting coverage that nobody measured.
{
  const d = paper("gate-no-registry", {
    body: "Nothing bolded here.",
    notes: NOTES,
  });
  const { set, out } = kinds(d);
  assert.equal(set.size, 0, "gate without registry must stay silent:\n" + out);
}

// ── 4. GUARDS inherited from the deleted half — contract, not a leftover ──────────────────
// 🔴 After the move both look unmotivated: the check looks at a directory, what has prose to do with it?
// But removing them means changing behaviour on papers that have no provenance file at all (most of them)
// — and `no-numbers-gate` will start firing on each one.
{
  const d = paper("no-prov", {
    body: "Nothing bolded here.",
    notes: undefined,
    gate: false,
  });
  const { set, out } = kinds(d);
  assert.equal(
    set.size,
    0,
    "no provenance file at all — script must stay completely silent:\n" + out,
  );
  // 🔴 Stay silent — yes, but NOT with the voice of success. Before 2026-08-26 both guards printed `clean`, and on
  // the real corpus that gave confident green on three papers out of four (all three in .tex).
  assert.match(
    out,
    /SKIPPED/,
    "skip must name itself as skip, not as a clean run:\n" + out,
  );
  assert.doesNotMatch(
    out,
    /clean/,
    "skip must not print the word `clean`:\n" + out,
  );
}
{
  const d = paper("no-paper", {
    body: "",
    notes: NOTES,
    gate: false,
    noPaper: true,
  });
  const { set, out } = kinds(d);
  assert.equal(
    set.size,
    0,
    "no paper.md/draft.md — script must stay completely silent:\n" + out,
  );
  assert.match(out, /SKIPPED/, "skip must name itself as skip:\n" + out);
  assert.match(
    out,
    /\.tex/,
    "the reason must name WHAT exactly is not covered — otherwise the reader\n" +
      "will think it is a breakage:\n" +
      out,
  );
  assert.doesNotMatch(
    out,
    /clean/,
    "skip must not print the word `clean`:\n" + out,
  );
}

// ── 5. clean run SPEAKS that it is clean ──────────────────────────────────────────────────
// Silence and success must not look the same — this is the same class as «0 checks» vs
// «checks passed» in the PR interface.
{
  const d = paper("clean-voice", {
    body: "Nothing bolded here.",
    notes: NOTES,
  });
  const { out } = kinds(d);
  assert.match(out, /clean/, "clean run did not print a verdict:\n" + out);
}

rmSync(tmp, { recursive: true, force: true });
console.log(
  "✓ check-provenance: no-numbers-gate fires, coverage is measured, both guards are pinned, clean run speaks",
);
