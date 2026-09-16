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
 * `child_process` in the AST: `import`, and `require()` for the CommonJS case. Parsed, not
 * grepped, so the string in this very comment is not a finding — a text guard would have to
 * exempt itself, which is the failure mode that makes text guards unmaintainable.
 *
 * ⚠️ THE BOUND, stated so the check is not mistaken for more than it is. It answers "does a
 * rule spawn a process", which is a PROXY for "does a rule read history". A rule could open
 * `.git/` with `fs` and pass. That is not covered, and the honest reason is that a rule reading
 * any path under `.git` is indistinguishable at this level from a rule reading a data file.
 * What IS covered is every form the defect has actually taken.
 *
 * Run: `node scripts/rules-are-content-only.mjs`  (exit 1 and a named rule on a finding)
 * Tested by: `scripts/rules-are-content-only.harness.mjs` — quiet on the real corpus, firing on
 * a planted rule.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "espree";
import { isMain } from "../skills/paper-pipeline/scripts/consumer.mjs";

const BANNED = new Set(["child_process", "node:child_process"]);

/** Rule sources only: a mutation file plants defects on purpose, a harness asserts about them. */
const isRuleSource = (f) =>
  f.endsWith(".mjs") && !f.endsWith(".mutations.mjs") && !f.endsWith(".harness.mjs");

/** @param {string} src @returns {string[]} the banned specifiers this source pulls in */
export function processImports(src) {
  const ast = parse(src, { ecmaVersion: "latest", sourceType: "module", range: false });
  const found = [];
  const walk = (n) => {
    if (n === null || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (
      (n.type === "ImportDeclaration" || n.type === "ExportNamedDeclaration" ||
       n.type === "ExportAllDeclaration") &&
      n.source?.value !== undefined && BANNED.has(String(n.source.value))
    ) found.push(String(n.source.value));
    if (
      n.type === "CallExpression" && n.callee?.name === "require" &&
      n.arguments?.[0]?.value !== undefined && BANNED.has(String(n.arguments[0].value))
    ) found.push(String(n.arguments[0].value));
    // 🔴 A dynamic `import()` is an `ImportExpression`, NOT a `CallExpression` with an `Import`
    // callee — that spelling is the legacy one and espree does not produce it. Caught by the
    // harness on the first run, which is the whole argument for listing the node types a check
    // walks instead of describing its coverage in prose.
    if (
      n.type === "ImportExpression" &&
      n.source?.value !== undefined && BANNED.has(String(n.source.value))
    ) found.push(String(n.source.value));
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
