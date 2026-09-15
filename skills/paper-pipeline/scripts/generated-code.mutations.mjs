/**
 * generated-code.mutations.mjs — proof that every rule and every guard in `generated-code.mjs` is
 * watched FAILING. Run: `node .claude/skills/paper-pipeline/scripts/generated-code.mutations.mjs`
 *
 * This is not a test. It is the evidence behind the claim that the tests test something.
 *
 * WHY IT MATTERS MORE HERE THAN FOR A NORMAL CHECKER. Half of what this file asserts is that the
 * checker STAYS QUIET — on a seeded script, on a lowercase route, on a reused variable name. A quiet
 * assertion is the easiest kind to write vacuously: delete the rule it is guarding and the fixture
 * still passes, because a checker that does nothing is quiet about everything. Only a mutation can
 * tell those apart, and the ignore set has the same shape: an over-wide allow rule and a working one
 * produce identical output.
 *
 * WHAT IT DOES. For each rule, it neuters exactly that rule in the source, runs the harness, and
 * requires the harness to go RED at the named assertion. Then it restores the file.
 *
 * 🔴 The quiet cases need INVERTED mutations. Disabling a rule cannot make a "stays quiet" case go
 * red — it makes it quieter. So those rows LOOSEN the guard instead (drop the anchor, add the `i`
 * flag, accept any file mode), which is the mistake a future editor would actually make.
 *
 * The source is restored in a `finally`, and the run refuses to start on a dirty working tree.
 */
import { runMutations } from "../../../lib/mutation-driver.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { consumerRoot } from "./consumer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = consumerRoot();
const SRC = join(HERE, "generated-code.mjs");
const HARNESS = join(HERE, "generated-code.harness.mjs");

/** [name, what it disables or loosens, exact source substring, replacement, expected red assertion] */
const MUTATIONS = [
  // ── the three rules fire ──
  ["no-seed/rule", "the unseeded-randomness rule",
    "  if (DRAWS.test(code) && !SEEDS.test(src))", "  if (false)",
    "a sampling script with no seed passed"],
  ["no-seed/python-draws", "recognising `random.sample` as a draw",
    "\\brandom\\.(?:random|sample|", "\\brandom\\.(?:random|nope|",
    "a sampling script with no seed passed"],
  ["abs/rule", "the hard-coded-absolute-path rule",
    "  const abs = code.match(new RegExp(ABS.source", "  const abs = false && code.match(new RegExp(ABS.source",
    "a script that only runs on its author's laptop"],
  ["abs/home", "recognising /home/ as an absolute path",
    "(?:\\/home\\/|\\/Users\\/", "(?:\\/nope\\/|\\/Users\\/",
    "a script that only runs on its author's laptop"],
  ["inplace/rule", "the in-place-overwrite rule",
    "  const both = [...operands(code, READS)].filter((p) => operands(code, WRITES).has(p));",
    "  const both = [];",
    "a script that clobbers its own input passed"],
  ["inplace/argv", "the argv form of an in-place rewrite",
    "  /open\\(\\s*((?:sys\\.argv|process\\.argv)\\[\\d\\])\\s*\\)/g,", "  /never-matches-anything-x/g,",
    "argv form of an in-place rewrite was not caught"],

  // ── the guards that keep it quiet on correct code (LOOSENED, not disabled) ──
  ["quiet/seed-recognised", "recognising that a seed was set at all",
    "  if (DRAWS.test(code) && !SEEDS.test(src))", "  if (DRAWS.test(code))",
    "a properly seeded script (explicit) was reported as unseeded"],
  // Disables BOTH alternations that could credit a seed threaded through argparse. Naming only
  // `--seed` left the row alive on `\bSEED\b`, and a partial disable that another alternation
  // covers is the same as no disable at all.
  ["quiet/seed-argparse", "recognising a seed threaded through argparse (the leading-\\b regression)",
    "--seed|\\bSEED\\b|Random", "\\b--seed|\\bNOSUCHSEED\\b|Random",
    "a properly seeded script (argparse) was reported as unseeded"],
  ["quiet/abs-anchor", "the left anchor that keeps a RELATIVE third-party path out",
    "const ABS = /(?<![\\w./-])(?:", "const ABS = /(?:",
    "reported as absolute local paths"],
  ["quiet/abs-case", "case sensitivity, so an Express route /users/ stops matching /Users/",
    "|[A-Z]:\\\\\\\\?[A-Za-z])/;", "|[A-Z]:\\\\\\\\?[A-Za-z])/i;",  // ← only bites since ABS.flags is threaded through
    "reported as absolute local paths"],
  ["quiet/read-mode", "requiring a READ to not be a write (the prototype's vacuity bug)",
    "  /open\\(\\s*(['\"])([^'\"]+)\\1\\s*(?:,\\s*(['\"])r[b+]*\\3\\s*)?\\)/g,",
    "  /open\\(\\s*(['\"])([^'\"]+)\\1\\s*(?:,[^)]*)?\\)/g,",
    "was reported as clobbering its input"],
  // 🔴 SPANS BOTH ARRAYS ON PURPOSE. Loosening only the READ side survived: the WRITE side still
  // demanded a quoted literal, so no operand could ever pair and the verdict did not move. A
  // mutation that cannot change the answer is not a mutation, and this is the second one this file
  // caught in itself.
  ["quiet/literal-only", "matching literals rather than operand expressions (17 false positives)",
    "  /readFileSync\\(\\s*(['\"])([^'\"]+)\\1/g,\n  /Path\\(\\s*(['\"])([^'\"]+)\\1\\s*\\)\\s*\\.read/g,\n  /open\\(\\s*((?:sys\\.argv|process\\.argv)\\[\\d\\])\\s*\\)/g,\n];\nconst WRITES = [\n  /open\\(\\s*(['\"])([^'\"]+)\\1\\s*,\\s*['\"][wa]/g,\n  /writeFileSync\\(\\s*(['\"])([^'\"]+)\\1/g,",
    "  /readFileSync\\(\\s*([^,)]+?)\\s*[,)]/g,\n  /Path\\(\\s*(['\"])([^'\"]+)\\1\\s*\\)\\s*\\.read/g,\n  /open\\(\\s*((?:sys\\.argv|process\\.argv)\\[\\d\\])\\s*\\)/g,\n];\nconst WRITES = [\n  /open\\(\\s*(['\"])([^'\"]+)\\1\\s*,\\s*['\"][wa]/g,\n  /writeFileSync\\(\\s*([^,)]+?)\\s*,/g,",
    "reused across two loops was mistaken for dataflow"],

  // ── the boundary with check-anon.sh ──
  ["bundle/excluded", "excluding the released bundle, which check-anon.sh cat. 5 owns",
    "      if (depth === 1 && name === bundleName) { swallowed.get(RULE[0]).push(name); continue; }",
    "      if (false) { swallowed.get(RULE[0]).push(name); continue; }",
    "reported an absolute path inside the RELEASED bundle"],  // case 8, its own assertion
  ["bundle/named-in-ledger", "naming that exclusion in the ledger",
    "  ['the released bundle — `check-anon.sh` cat. 5 owns it, and it asks a different question there ' +\n   '(does it leak an identity, not will it run elsewhere)', []],",
    "  ['a tree we do not enter', []],",
    "the boundary invisible"],

  // ── the ignore set ──
  ["allow/applied", "applying an allow row at all",
    "    if (reason !== undefined) { ignored.push(", "    if (false) { ignored.push(",
    "the allowed kind still fired"],
  ["allow/per-kind", "scoping an allowance to ONE KIND rather than to the whole file",
    "    const reason = allowed.get(key) ?? allowed.get(`${relative(repro, f)}\\t*`);",
    "    const reason = allowed.get(key) ?? [...allowed.entries()].find(([k]) => k.startsWith(relative(repro, f)))?.[1];",
    "also silenced its unseeded sampling"],
  ["allow/reason-printed", "printing each allowance's reason",
    "for (const [key, reason] of ignored) ledger.push(`       ${key}  →  ${reason}`);",
    "for (const [key, reason] of ignored) ledger.push(`       ${key}`);",
    "its reason was not printed"],
  ["allow/stale", "reporting a row that names no script",
    "  if (!live.has(key))", "  if (false)",
    "sat unreported, so the list never shrinks"],
  ["allow/empty-said", "saying so when nothing is being waved through",
    "if (!ignored.length) ledger.push('       (nothing is being waved through)');",
    "if (false) ledger.push('       (nothing is being waved through)');",
    "an empty allow file printed nothing"],

  // ── WHERE repro/ IS, and what silence is allowed to mean ──
  // 🔴 These three guard a defect that was LIVE until 2026-08-26 and produced no symptom: pointed
  // at `<paper-e>`, the check exited 0 with no output while 18 findings sat in
  // `typed-shell/repro/`. A missed directory is worse than a missed finding, because it is
  // reported in exactly the words of a clean paper.
  ["scope/nested-root", "looking for repro/ one level below the paper directory",
    "      .map((e) => join(dir, e.name, 'repro'))", "      .map((e) => join(dir, e.name, 'nope'))",
    "a repro/ one level below the paper directory was not scanned"],
  ["scope/loud-empty", "saying so when there is no repro/ to scan (silence would read as clean)",
    "  if (!flagsOnly)\n    console.log(`🧪 generated-code — 0 finding(s) in ${dir}\\n   NOTHING WAS SCANNED:",
    "  if (false)\n    console.log(`🧪 generated-code — 0 finding(s) in ${dir}\\n   NOTHING WAS SCANNED:",
    "produced no output at all"],
  ["scope/second-root-named", "naming a SECOND repro/ root in the ledger instead of dropping it",
    "for (const other of roots.slice(1)) swallowed.get(RULE[3]).push(relative(dir, other));",
    "for (const other of []) swallowed.get(RULE[3]).push(relative(dir, other));",
    "was dropped without being named"],

  // ── the machine-readable contract with run-mechanical.mjs ──
  ["out/stated-count", "the stated finding count in the header",
    "const header = `🧪 generated-code — ${findings.length} finding(s) in ${dir}`;",
    "const header = `🧪 generated-code — ${dir}`;",
    "does not state `— 0 finding(s)`"],
  ["out/ledger-on-clean", "printing the ignore ledger when there are no findings",
    "  console.log('   every analysis script seeds its randomness, names only relative paths, and does not clobber its input');\n  ledger.forEach((l) => console.log(l));",
    "  console.log('   every analysis script seeds its randomness, names only relative paths, and does not clobber its input');",
    // Killed by case 8's ledger assertion rather than case 11's: case 8 is also a 0-finding
    // report-mode run and it runs first. Both assert the property; the row records WHICH one caught
    // it so this is not misread as an off-target kill.
    "the boundary invisible"],
  ["out/flags-quiet", "the silence of --flags-only on a clean tree",
    "if (!flagsOnly) {\n  console.log(header);", "if (true) {\n  console.log(header);",
    "--flags-only printed something about a clean tree"],
];

// The table above is DATA about this checker; the engine below is shared with the other mutation
// files (`mutation-driver.mjs`). The split gave this file two protections it never had: the no-op
// guard (a replacement equal to the original leaves a green harness proving nothing) and one retry
// on a non-kill (a flake reported as a survivor sends the next reader to rewrite a working
// assertion). It also refuses to start when a named harness does not exist — the defect that made
// three files report SURVIVED for every case after the 2026-08-11 colocation.
process.exit(
  runMutations({
    root: ROOT,
    cases: MUTATIONS.map(([name, disables, find, replace, expect]) => ({
      name,
      disables,
      edits: [[SRC, find, replace]],
      harness: HARNESS,
      expect,
    })),
  }),
);
