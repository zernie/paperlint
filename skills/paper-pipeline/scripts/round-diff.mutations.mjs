/**
 * round-diff.mutations.mjs — proof that every check in `round-diff.mjs` is watched FAILING.
 * Run: `node .claude/skills/paper-pipeline/scripts/round-diff.mutations.mjs`  (~40 s; not in CI, it rewrites the source)
 *
 * This is not a test. It is the evidence behind the claim that the tests test something.
 *
 * WHY IT EXISTS. The house rule is «чекер, который ни разу не падал, не считается работающим», and
 * it has been broken repeatedly here: three hooks dead on arrival, a statistics script that printed
 * "All recomputed values match paper.md" without opening paper.md. A green harness proves the
 * CHECKER fires on planted defects. It does not prove the HARNESS would notice if a check were
 * DELETED — an assertion can be vacuous, and a vacuous assertion is indistinguishable from a real
 * one in a passing run. Two were found in this repository in one week:
 *
 *   - one where removing a check left the test green because a LATER BRANCH produced the same
 *     finding KIND. The harness asserts on messages as well as kinds for that reason, and this file
 *     is what proves the message assertions are load-bearing;
 *   - one where the mutation DID NOT MUTATE — the `find` string was absent or matched twice, the
 *     rewrite was a no-op, and the run reported a killed mutant. Hence the arity check below:
 *     anything other than exactly one occurrence is reported as NOT FOUND / AMBIGUOUS and never
 *     as a pass.
 *
 * WHAT IT DOES. For each check: neuter exactly that check in the source, run the harness, and
 * require the harness to go RED **at the named assertion**. Restore. A mutation the harness survives
 * is a check nobody is watching, and it is reported as SURVIVED.
 *
 * The source is restored in a `finally`, and the run refuses to start on a dirty working tree, so an
 * interrupted run cannot leave a neutered checker behind.
 */
import { runMutations } from "../../../lib/mutation-driver.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { consumerRoot } from "./consumer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = consumerRoot();
const SRC = join(HERE, "round-diff.mjs");
const HARNESS = join(HERE, "round-diff.harness.mjs");

/**
 * [name, what it disables, exact source substring, replacement, harness assertion expected to fire]
 *
 * `false && add(...)` is the standard neuter for a finding: it keeps the statement, the control flow
 * and any `return` beside it, and removes only the report. Guards and thresholds are neutered at the
 * condition instead, because for those the question is whether the THRESHOLD is watched, not whether
 * the push is.
 */
const MUTATIONS = [
  // ── the findings ──
  ["no-round-ledger", "reporting a paper with no round manifests",
    "if (!since && manifests.length === 0) {", "if (false) {",
    "must say so rather than pass"],
  ["two-open-rounds", "reporting two manifests with no `closed:`",
    "if (open.length > 1) {", "if (false) {",
    "silently pick one base"],
  ["no-open-round", "reporting edits made with every round closed",
    "if (dirty) {", "if (false) {",
    "authorised by nothing"],
  ["unresolvable-base", "reporting a base revision that does not resolve",
    'add("unresolvable-base", `cannot read paper.md at',
    "a round whose base does not resolve is a round with no gate"],
  ["ratchet/push", "reporting growth past the declared budget",
    "if (grew > budget) {", "if (false) {",
    "growth past the declared budget is the finding this gate exists for"],
  // 🔴 Killed by the CLEAN CASE, not by the block that names the budget, and that is the honest
  // record. Any mutation that makes the gate noisier trips block 1 before it reaches its own block,
  // because block 1's fixture is a legal round and block 1 demands total silence. Block 1 is
  // therefore the strongest assertion in the harness, and the three rows marked this way are its
  // proof — see the note under the table at the bottom of this file.
  ["ratchet/budget", "honouring the declared budget (every round is charged against 0)",
    "const budget = num(active?.budget, 0);", "const budget = 0;",
    "a round that changed only its declared section, inside budget"],
  ["ratchet-cumulative", "the compounding check across all rounds",
    "if (cum > total) {", "if (false) {",
    "compounding to +66 must be caught"],
  ["hedge/push", "reporting hedge density growth",
    "if (dh > hb + 1e-9) {", "if (false) {",
    "hedges deposited by a review round, inside the word budget, must still be caught"],
  ["hedge/budget", "honouring the declared hedge budget",
    'const hb = num(active?.["hedge-budget"], 0);', "const hb = 0;",
    "declared its hedge budget in advance has paid for it"],
  ["overbroad-scope", "reporting a `touches:` list that covers the paper",
    "if (all.length && covered.length * 2 > all.length) {", "if (false) {",
    "declaring most of the document defeats the declaration"],
  ["undeclared/changed", "reporting a changed section nobody declared",
    'add("undeclared-section", `"${s.heading}" ${how}',
    'false && add("undeclared-section", `"${s.heading}" ${how}',
    "a change to Limitations under a manifest declaring only §3"],
  ["undeclared/removed", "reporting a REMOVED section nobody declared",
    'add("undeclared-section", `"${h}" was removed',
    'false && add("undeclared-section", `"${h}" was removed',
    "a REMOVED section must be caught"],
  ["cite/push", "reporting a citation added mid-round",
    'add("unauthorised-citation",', 'false && add("unauthorised-citation",',
    "a cite added mid-round is ARIS's `new_cite`"],
  ["cite/allows", "honouring `allows: new-citation`",
    'if (!allows.has("new-citation")) {', "if (true) {",
    "a declared `new-citation` is authorised"],
  ["cite/bibitem", "scanning the References list (prose markers only)",
    ".map((m) => m[1]));", ".map(() => null)).filter(Boolean);",
    "a bibliography entry with NO inline marker"],
  ["number/push", "reporting a numeric literal added mid-round",
    'add("unauthorised-number",', 'false && add("unauthorised-number",',
    "a figure that appears during a revision round"],
  ["number/allows", "honouring `allows: new-number`",
    'if (!allows.has("new-number")) {', "if (true) {",
    "a declared `new-number` is authorised"],
  // Also killed by block 1 rather than by block 11b — the clean fixture's body already carries
  // numbers, so a gate that stops filtering out numbers already present fires on a legal round.
  ["number/novelty", "the rule that a number already in the paper is free to restate",
    "const added = [...numbers(now)].filter((n) => !wasNums.has(n));",
    "const added = [...numbers(now)];",
    "a round that changed only its declared section, inside budget"],
  ["number/direction", "comparing against the BASE (the 'already present' set becomes the current one)",
    "const wasNums = numbers(base);", "const wasNums = numbers(now);",
    "a figure that appears during a revision round has no provenance row"],
  ["unknown-op", "reporting an `allows:` entry this gate does not implement",
    'add("unknown-op",', 'false && add("unknown-op",',
    "must be reported. ARIS carries `new_theorem_env`"],
  ["manifest/base", "rejecting a manifest with no `base:`",
    "if (!out.base) return { error:", "if (false) return { error:",
    "a manifest with no base must be reported, not skipped"],
  ["manifest/touches", "rejecting a manifest with no `touches:`",
    "if (!Array.isArray(out.touches) || out.touches.length === 0) {", "if (false) {",
    "authorises nothing and must say so"],

  // ── the shared machinery every finding above is computed from ──
  ["covers/nesting", "number-prefix nesting in `touches:` (4 no longer covers 4.1)",
    'num.startsWith(e + ".")', "false",
    "must cover §2.1"],
  ["covers/text", "the substring rule for NON-numeric entries (`Appendix` covers nothing)",
    "return h.includes(e);", "return false;",
    "moving a passage into an appendix must not read as growth"],
  ["split/appendix", "the body↔appendix boundary (everything counts as body)",
    "const i = secs.findIndex((s) => /^references\\b/i.test(s.heading));", "const i = -1;",
    "the appendix delta is still reported as a fact"],
  ["census/appendix", "keeping appendix words out of the body count",
    "    bodyWords: bw,", "    bodyWords: bw + words(appendix.map((s) => s.text).join(\"\\n\")),",
    "appendix growth under a zero body budget must be free"],
  ["strip/comments", "stripping HTML comments before every measurement",
    'const stripComments = (s) => s.replace(/<!--[\\s\\S]*?-->/g, " ");',
    "const stripComments = (s) => s;",
    "rewriting a section's own TIGHTEN note must change nothing"],
  ["since/mode", "`--since` running without a manifest",
    'const since = (args.find((a) => a.startsWith("--since=")) ?? "").split("=")[1] || undefined;',
    "const since = undefined;",
    "`--since` must still measure"],
];

// Two case shapes, and BOTH are preserved: the long `[name, disables, find, replace, expect]` and
// the `false &&` shorthand `[name, disables, find, expect]`, where the replacement is the find with
// `false && ` in front. The shorthand is the standard neuter for a finding — it keeps the statement,
// the control flow and any `return` beside it, and removes only the report — so it earns its place
// as data, and expanding it here keeps the engine ignorant of what a "finding" is.
process.exit(
  runMutations({
    root: ROOT,
    cases: MUTATIONS.map((m) => {
      const [name, disables, find] = m;
      const [replace, expect] = m.length === 4 ? [`false && ${find}`, m[3]] : [m[3], m[4]];
      return { name, disables, edits: [[SRC, find, replace]], harness: HARNESS, expect };
    }),
  }),
);
