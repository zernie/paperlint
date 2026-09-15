/**
 * artifact-coverage.mutations.mjs — proof that every check in `artifact-coverage.mjs` is watched
 * FAILING, with the reverse (DISK_UNREPORTED) leg and its ignore set as the reason this file exists.
 * Run: `node .claude/skills/paper-pipeline/scripts/artifact-coverage.mutations.mjs`
 *
 * This is not a test. It is the evidence behind the claim that the tests test something.
 *
 * WHY THIS LEG IN PARTICULAR. The reverse leg is the only thing in the pipeline that looks for a
 * result nobody reported, and it is guarded by an ignore set. Both halves fail silently in the same
 * direction: a broken detector finds nothing, and an over-wide ignore set also finds nothing, and
 * from outside those are the same output. A green harness proves the CHECKER fires on planted
 * defects; it does not prove the HARNESS would notice if a check were deleted. Every mutations file
 * written in this repository has found something on its first run, and this one is no exception —
 * see the notes in the table.
 *
 * WHAT IT DOES. For each check, it neuters exactly that check in the source, runs the harness, and
 * requires the harness to go RED with the named assertion. Then it restores the file. A mutation
 * the harness survives is a check nobody is watching, and it is reported as SURVIVED.
 *
 * The source is restored in a `finally`, and the run refuses to start on a dirty working tree, so
 * an interrupted run cannot leave a neutered checker behind.
 */
import { runMutations } from "../../../lib/mutation-driver.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { consumerRoot } from "./consumer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = consumerRoot();
const SRC = join(HERE, "artifact-coverage.mjs");
const HARNESS = join(HERE, "artifact-coverage.harness.mjs");

/** [name, what it disables, exact source substring, replacement, harness case expected to go red] */
const MUTATIONS = [
  // ── the two forward legs, which had a harness and no mutation proof until today ──
  ["fwd/section-indexed", "the rule that a number-reporting section must be named in the index",
    "    if (!named)\n", "    if (false)\n",
    "is named NOWHERE"],
  ["fwd/index-path-exists", "the rule that a path the index names must exist",
    "  if (!existsSync(join(bundle, head)) && !readdirSync(bundle).includes(head))",
    "  if (false)",
    "is not in the bundle"],
  ["fwd/no-index", "the refusal to accept a bundle that maps nothing to anything",
    "if (!indexPath) {", "if (false) {",
    "a bundle that maps nothing to anything was accepted"],
  ["fwd/repo-not-path", "the guard that `owner/repo` is not a path (extension required)",
    "  if (!/\\.[a-z0-9]{1,5}$/i.test(p)) continue;", "  if (false) continue;",
    "a complete bundle was failed"],

  // ── the reverse leg: the detector itself ──
  ["rev/finding", "the DISK_UNREPORTED finding",
    "  for (const c of unreported)\n    findings.push(", "  for (const c of [])\n    findings.push(",
    "cherry-picking case this leg was ported for"],
  ["rev/headline-results", "RESULTS.md as a headline write-up",
    "/^(RESULTS|SUMMARY|FINDINGS|METRICS)\\.", "/^(SUMMARY|FINDINGS|METRICS)\\.",
    "cherry-picking case this leg was ported for"],
  ["rev/paper-mention", "crediting a mention in the paper",
    "if (named(paper)) {", "if (false) {",
    "an experiment the paper discusses by name was reported as unmentioned"],
  ["rev/index-mention", "crediting a mention in the index",
    "if (named(indexAll)) {", "if (false) {",
    "named in the bundle's README.md and nowhere else"],
  ["rev/all-index-files", "reading BOTH index files (reverts to check 1's single indexPath)",
    "    if (named(indexAll)) {", "    if (named(index)) {",
    "named in the bundle's README.md and nowhere else"],
  ["rev/date-slug", "stripping the -YYYY-MM-DD suffix before matching",
    "const slug = c.name.replace(/-\\d{4}-\\d{2}-\\d{2}$/, '');", "const slug = c.name;",
    "names without its date suffix"],
  ["rev/whole-token", "whole-token matching (reverts to substring `includes`)",
    "const mentions = (t, s) => s.length >= 4 && new RegExp(`(?<![\\\\w-])${esc(s)}(?![\\\\w-])`).test(t);",
    "const mentions = (t, s) => t.includes(s);",
    "the header does not state the real finding count"],
  ["rev/bundle-skipped", "the structural ignore that skips the released bundle",
    "    if (name === bundleName) { swallowed.get([...swallowed.keys()][0]).push(name); continue; }",
    "    if (false) { swallowed.get([...swallowed.keys()][0]).push(name); continue; }",
    "the bundle's own RESULTS.md was counted"],

  // ── the ignore set, which can neuter the detector without changing a line of it ──
  ["ign/applied", "applying an allow row at all",
    "if (allowed.has(c.name)) {", "if (false) {",
    "an allowed row still counted as a finding"],
  ["ign/rows-parsed", "parsing the allow file",
    "      if (name) allowed.set(name,", "      if (false) allowed.set(name,",
    "an allowed row still counted as a finding"],
  ["ign/ships-as-verified", "re-verifying a `ships-as:` claim against the bundle",
    "if (m && !existsSync(join(bundle, m[1])))", "if (false)",
    "the allowance has rotted"],
  ["ign/stale-rows", "reporting a row that names no directory",
    "    if (!candidates.some((c) => c.name === name))", "    if (false)",
    "sat in the ignore file unreported"],
  ["ign/printed-on-clean", "printing the ledger when there are no findings",
    "  console.log('   every number-reporting section is indexed, every named path exists');\n  ledger.forEach((l) => console.log(l));",
    "  console.log('   every number-reporting section is indexed, every named path exists');",
    // Killed by case 9 rather than case 12: case 9 is also a 0-finding report-mode run and asserts
    // the same line, and it runs first. Both cases assert the property; the row records WHICH one
    // catches it so a future reader does not mistake this for an off-target kill.
    "was applied and NOT printed"],
  ["ign/reasons-printed", "printing each allow row's reason",
    "  for (const [name, reason] of ignored) ledger.push(`       ${name}  →  ${reason}`);",
    "  for (const [name, reason] of ignored) ledger.push(`       ${name}`);",
    "was applied and NOT printed"],
  ["ign/empty-file-said", "saying so when nothing is being waved through",
    "  if (!ignored.length) ledger.push('       (the file is empty — nothing is being waved through)');",
    "  if (false) ledger.push('       (the file is empty — nothing is being waved through)');",
    "an empty allow file printed nothing at all"],
  ["ign/ratio", "the ratio line that says whether this check still does anything",
    "    `   Ratio: ${unreported.length} reported as unreported, ${ignored.length} deliberately ignored, ` +",
    "    `   Ratio: ` +",
    "printed no ratio"],

  // ── the machine-readable contract with run-mechanical.mjs ──
  ["out/stated-count", "the stated finding count in the header",
    "const header = `📦 artifact coverage — ${findings.length} finding(s) in ${dir}`;",
    "const header = `📦 artifact coverage — ${dir}`;",
    "does not state `— 0 finding(s)`"],
  ["out/flags-quiet", "the silence of --flags-only on a clean tree",
    "if (!flagsOnly) {\n  console.log(header);", "if (true) {\n  console.log(header);",
    "--flags-only printed something about a complete bundle"],
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
