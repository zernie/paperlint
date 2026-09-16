/**
 * A RULE MAY NOT ASK GIT.
 *
 * 🔴 The defect it exists for, measured 2026-09-16. `paper/source` bound a paper's stage to a
 * commit sha and verified it with `git cat-file -e`. Of four shas recorded in the consumer's
 * front matter, ONE still resolved ninety minutes later: a squash-merge had orphaned the branch
 * commits and `gc` collected them. A recorded sha is a pointer to a pointer, and both hops are
 * removed by ROUTINE maintenance — squash, rebase, gc, force-push, filter-repo. Nobody is at
 * fault, so nobody is on the hook to fix it; the rule simply turns red and gets switched off.
 *
 * ── THE STRONGER LEG, AND THE REASON THIS IS A FLOOR CHECK ──────────────────
 * `actions/checkout` defaults to `fetch-depth: 1` — exactly one commit. Measured in the
 * consumer the same day: six checkouts, not one override. So a git-reading rule does not
 * resolve even a LIVE sha under CI, which is the one place it has to hold. Locally it stays
 * green, so the failure is one-directional and in the flattering direction.
 *
 * ── WHAT IT CHECKS, AND WHY NOT A GREP ──────────────────────────────────────
 * A `child_process` spawner called with `git` as the program, read from the AST. Parsed, not
 * grepped, so the words `git cat-file` in this very comment are not a finding — a text guard
 * would have to exempt itself, which is the failure mode that makes text guards unmaintainable.
 *
 * ⚠️ THE BOUND, stated so the check is not mistaken for more than it is. Two things pass: a
 * rule that opens `.git/` with `fs` (indistinguishable at this level from reading a data file),
 * and a rule that assembles the program name at runtime. Both accepted deliberately — see the
 * note on `SPAWNERS` for the false positive that forced the predicate this narrow.
 *
 * Run: `node scripts/rules-are-content-only.mjs`  (exit 1 and a named rule on a finding)
 * Tested by: `scripts/rules-are-content-only.harness.mjs` — quiet on the real corpus, firing on
 * a planted rule.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "espree";
import { isMain } from "../skills/paper-pipeline/scripts/consumer.mjs";

/**
 * 🔴 THE PREDICATE IS "RUNS GIT", NOT "SPAWNS A PROCESS", and the narrowing was forced by a
 * FALSE POSITIVE on the consumer's corpus the hour this check shipped: `paper-texcount.mjs`
 * shells out to `texcount` to count words in a .tex, which is a measuring tool, not history.
 * A false positive on an `error` gate is worse than a miss — the gate that cannot be cleared
 * gets switched off, and this one would have been switched off on its first run.
 *
 * ⚠️ THE COST OF NARROWING, stated rather than hidden: a rule that builds the program name at
 * runtime (`const g = "gi" + "t"`) passes. That is accepted. The defect has taken exactly one
 * form — a literal `git` handed to a `child_process` function — and a check that also caught
 * the contrived form would have to claim every spawn, which is the false positive above.
 */
const SPAWNERS = new Set([
  "exec", "execSync", "execFile", "execFileSync", "spawn", "spawnSync", "fork",
]);

/** `"git"` as the program, or `"git …"` as the head of a shell line handed to `exec`. */
const isGit = (v) => typeof v === "string" && (v === "git" || v.startsWith("git "));

/** Rule sources only: a mutation file plants defects on purpose, a harness asserts about them. */
const isRuleSource = (f) =>
  f.endsWith(".mjs") && !f.endsWith(".mutations.mjs") && !f.endsWith(".harness.mjs");

/** @param {string} src @returns {string[]} the git invocations this source makes */
export function processImports(src) {
  const ast = parse(src, { ecmaVersion: "latest", sourceType: "module", range: false });
  const found = [];
  const walk = (n) => {
    if (n === null || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    // Both spellings of the callee: `execFileSync(…)` after a named import, and
    // `cp.execFileSync(…)` after a namespace import. Listed, not described — the node types a
    // check walks are the only honest statement of its coverage.
    if (n.type === "CallExpression") {
      const name = n.callee?.type === "MemberExpression" ? n.callee.property?.name : n.callee?.name;
      if (SPAWNERS.has(String(name)) && isGit(n.arguments?.[0]?.value))
        found.push(String(n.arguments[0].value));
    }
    for (const k of Object.keys(n)) if (k !== "parent") walk(n[k]);
  };
  walk(ast);
  return found;
}

/** @param {{cwd: string}} options */
export function rulesAreContentOnly({ cwd }) {
  const dir = join(cwd, "eslint-rules");
  const checked = [];
  const findings = [];
  for (const f of readdirSync(dir).filter(isRuleSource)) {
    const hits = processImports(readFileSync(join(dir, f), "utf8"));
    // 🔴 The counter increments WITH the verdict, not before it: a `checked` that keeps
    // counting while the verdict stops being reached is the failure recorded in the consumer's
    // rules as "a counter that counts what it ignores".
    checked.push(f);
    for (const h of hits) findings.push({ file: f, specifier: h });
  }
  return { checked, findings };
}

if (isMain(import.meta.url)) {
  // 🔴 `process.cwd()`, NOT the package root. A consumer installs this package and runs the
  // script from its own repository, where the rules that matter are ITS `eslint-rules/` — the
  // package's own are already checked by the package's own gate. Anchored to the package root
  // the consumer's gate would re-check the same eight files and report a confident zero about
  // rules it never opened: a counter that counts what it ignores.
  const cwd = process.cwd();
  const { checked, findings } = rulesAreContentOnly({ cwd });
  if (checked.length === 0) {
    console.error(
      `${join(cwd, "eslint-rules")}: no rule sources. Either this is not a repository with ` +
        `ESLint rules, or the directory moved — a silent zero here would read as a clean run.`,
    );
    process.exit(1);
  }
  for (const { file, specifier } of findings) {
    console.error(
      `${file}: imports \`${specifier}\`. A rule may not ask git: history is rewritten by ` +
        `routine maintenance and CI clones one commit deep, so the fact does not survive where ` +
        `the rule has to hold. Put the fact on disk and check it by bytes.`,
    );
  }
  console.log(
    `rules-are-content-only: ${checked.length} rule sources under ${cwd}, ${findings.length} findings`,
  );
  process.exit(findings.length === 0 ? 0 : 1);
}
