#!/usr/bin/env node
/**
 * check-provenance — does the paper have a build-time numbers gate, and what does it still NOT
 * cover.
 *
 * 🔴 THREE OF THE FIVE CHECKS MOVED INTO ESLint RULES ON 2026-08-26
 * (`eslint-rules/paper-registry.mjs`):
 *
 *   arm-mismatch     → `paper/number-arm-mismatch`
 *   untraced-number  → `paper/number-untraced`
 *   arm-unlabelled   → `paper/number-arm-unlabelled`
 *
 * All three spoke about a SENTENCE IN THE PAPER, while the provenance files (`NOTES.md`,
 * `CLAIMS.md`, `repro/artifact-anon/NUMBERS.md`, `NUMBER-ARMS.tsv`) were CONFIGURATION for them —
 * what sets which sentence counts as defective. Exactly like a venue profile for `pdf/profile`.
 * Parity was proved BEFORE the deletion: the real paper (5 `arm-mismatch` + 5 `untraced` numbers,
 * the sets matched) plus 17 fixtures. The write-up is in
 * `the author's private research notes`.
 *
 * WHAT IS LEFT HERE, AND WHY THAT IS NOT LAZINESS. The two remaining checks **do not read the body
 * of the paper at all** — all they are given is the directory:
 *
 *   no-numbers-gate   the paper has no `repro/paper_numbers.py`, that is, every printed quantity
 *                     here is a hand-typed digit whose only link to its data file is somebody's
 *                     memory.
 *   numbers-coverage  how many quantities are sourced and how many are still raw (the
 *                     `numbers-grandfathered.txt` ratchet). This is NOT A FINDING AT ALL, it is a
 *                     coverage measurement — ESLint has no "for information" severity, and throwing
 *                     it away would mean losing the only line that answers "does the gate cover what
 *                     a reviewer will check?".
 *
 * A check that does not read the file being linted cannot be a rule about it — that discriminator
 * decided both.
 *
 * ═══ THE FAILURE STORY that made this file exist at all (kept verbatim) ═══
 * 2026-08-05, 29 hours before the deadline. The paper's headline read "147 real rules files exactly
 * as their projects committed them, 22 fail admission". In the artifact's aggregate
 * `.all.annotated.failedContradicted = 22` — on the files AS COMMITTED nothing fails. 22 is the
 * counterfactual arm, where the extractor's guesses are written in as if the author had written
 * them.
 *
 * Not one check in the pipeline saw this, and the reason is structural: each looks at ONE side.
 * verify-citations checks that a reference is real. The claims-preservation diff checks that a
 * claim did not grow (and it did not grow, 22 was always 22). The artifact reviewer recomputes the
 * number from the data, and it agrees, because the number is CORRECT. The panel reads the prose and
 * takes "unmodified" as a fact. The defect lives only in the JOINT between the sentence and the
 * path to the field, and nobody held both sides at once. `paper/number-arm-mismatch` holds them
 * now.
 *
 * Advisory. Exit 0 always; findings on stdout.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { isMain } from "./consumer.mjs";

// 🔴 THERE IS NO `markdown.mjs` IMPORT ANY MORE, AND THAT IS A CONSEQUENCE OF THE MOVE, NOT A
// SIMPLIFICATION. There is nothing left here to parse markup with and no reason to: both remaining
// checks look at the DIRECTORY, not at the text. The bibliography boundaries (`## References`) that
// `requireMarkdown()` stood for are now needed by the rules in `eslint-rules/paper-registry.mjs`,
// and there ESLint itself provides them.

/**
 * Has this paper adopted the build-time numbers gate, and how far?
 *
 * SUPERSEDED, 2026-08-05, same day it was written. The registry below (`NUMBER-ARMS.tsv`) keyed its
 * rules on the NUMBER — "wherever 22 appears, one of these phrases must be near it". That is wrong
 * in a way that shows up immediately in a real paper: `<paper-a>` prints two unrelated 22s
 * (22 files that fail admission in the counterfactual arm, and 8 of 22 abstentions in a paired
 * sample), and a number-keyed rule cannot tell them apart. It fires on the innocent one and, worse,
 * would go on passing if the guilty one were reworded.
 *
 * The replacement keys on the OCCURRENCE: the paper writes `{{annotated.failedContradicted}}`, not
 * `22`, so each printed quantity carries its own identity and its own guard, and the build refuses
 * a PDF where the value has gone stale or the surrounding prose claims the wrong arm. See
 * `<paper>/repro/paper_numbers.py`. That gate is per-paper because the data layout is per-paper;
 * what belongs HERE is the generic question: does this paper have one, and what does it still leave
 * uncovered?
 *
 * ⚠️ Reading `NUMBER-ARMS.tsv` (the `arm-unlabelled` finding) moved on 2026-08-26 into the rule
 * `paper/number-arm-unlabelled`; the registry still works for a paper that has one.
 */
function checkNumbersGate(dir) {
  const out = [];
  const gate = join(dir, "repro", "paper_numbers.py");
  const registry = join(dir, "repro", "numbers.tsv");
  if (!existsSync(gate)) {
    out.push({
      kind: "no-numbers-gate",
      msg:
        "no repro/paper_numbers.py — every printed figure here is a hand-typed digit whose only " +
        "link to its data file is somebody's memory. Copy the gate from a paper that already has one; the " +
        "defect it catches (right number, wrong experimental arm) is invisible to every other check",
    });
    return out;
  }
  if (!existsSync(registry)) return out;
  const rows = readFileSync(registry, "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#")).length;
  const allow = join(dir, "repro", "numbers-grandfathered.txt");
  const raw = existsSync(allow)
    ? readFileSync(allow, "utf8")
        .split("\n")
        .filter((l) => l.split("#")[0].trim()).length
    : 0;
  // Not a finding — a fact the scorecard should carry, because "we have a gate" and "the gate
  // covers the numbers a reviewer will check" are different claims and only the second matters.
  out.push({
    kind: "numbers-coverage",
    msg:
      `${rows} quantities are sourced and guarded, ${raw} are still raw and grandfathered — ` +
      `the grandfathered ones are an admission, not a clearance`,
  });
  return out;
}

/**
 * Why the guards were pulled out INTO A SEPARATE function instead of being left as early
 * `return`s inside `checkProvenance` — measured 2026-08-26.
 *
 * 🔴 The script printed `🔢 check-provenance — clean` for `<paper-b>` and `<paper-c>` without
 * checking anything at all: both papers are in LaTeX, they have no `paper.md`, `find(existsSync)`
 * returned `undefined`, and the function exited with an empty array. That is, **"you have no
 * numbers gate" was muted on exactly those papers that do not have one** — `repro/paper_numbers.py`
 * exists only in `<paper-a>`. A confident green on three papers out of four.
 *
 * A skip indistinguishable from a pass is the same failure as "0 checks" versus "checks passed" in
 * the PR interface. The neighbours in this directory (`artifact-coverage.mjs`,
 * `population-map.mjs`) have long printed `⏭️ SKIPPED … absence of findings here is absence of
 * checking, not a clean bill`; this file was the only one that stayed silent.
 *
 * The guard is ONE for both consumers (the findings list and the CLI output), so that the reason
 * for the skip cannot drift apart from the skip itself.
 */
export function provenanceScope(dir) {
  const paper = ["paper.md", "draft.md"]
    .map((f) => join(dir, f))
    .find(existsSync);
  if (!paper) {
    return {
      covered: false,
      reason:
        "no paper.md/draft.md — this checker reads markdown only, a .tex paper is NOT covered",
    };
  }
  const prov = [
    "NOTES.md",
    "CLAIMS.md",
    join("repro", "artifact-anon", "NUMBERS.md"),
  ]
    .map((f) => join(dir, f))
    .filter(existsSync)
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  if (!prov) {
    return {
      covered: false,
      reason:
        "no non-empty NOTES.md / CLAIMS.md / repro/artifact-anon/NUMBERS.md",
    };
  }
  return { covered: true, reason: null };
}

export function checkProvenance(dir) {
  if (!provenanceScope(dir).covered) return [];
  return [...checkNumbersGate(dir)];
}

if (isMain(import.meta.url)) {
  const dir = resolve(process.argv[2] ?? ".");
  const f = checkProvenance(dir);
  if (f.length) {
    console.log(`🔢 check-provenance — ${f.length} finding(s):`);
    for (const x of f) console.log(`   [${x.kind}] ${x.msg}`);
  } else {
    // A skip and a pass print as DIFFERENT lines — see the comment on `provenanceScope`.
    const scope = provenanceScope(dir);
    if (scope.covered) console.log("🔢 check-provenance — clean");
    else
      console.log(`⏭️  check-provenance SKIPPED for ${dir} — ${scope.reason}`);
  }
  process.exit(0);
}
