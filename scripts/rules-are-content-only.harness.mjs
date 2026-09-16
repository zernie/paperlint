/**
 * Colocated test for `scripts/rules-are-content-only.mjs` — a rule may not ask git.
 * Run: `npx vigiles test scripts/rules-are-content-only.harness.mjs`
 *
 * 🔴 BOTH HALVES. Like its sibling, this guard's success state is silence, so silence alone is
 * no evidence it works:
 *   I.   QUIET on this repository's real `eslint-rules/`, and the count is asserted non-zero —
 *        a guard that scanned nothing is also quiet, and that is the reading to rule out first.
 *   II.  FIRES on each form the defect takes: static `import`, `require()`, dynamic `import()`,
 *        and the `node:` prefix — the prefix matters because a set membership test that lists
 *        only the bare specifier passes a file that writes the modern spelling.
 *   III. QUIET on sources that merely TALK about the banned module — a comment and a string
 *        literal. This is the half a grep cannot have, and the reason the check parses.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const { rulesAreContentOnly, processImports } = await import(join(HERE, "rules-are-content-only.mjs"));

let n = 0;
const check = (label, ok) => { n++; assert.equal(ok, true, label); };

// ── I. quiet on the real corpus, and it actually looked ───────────────────────
{
  const { checked, findings } = rulesAreContentOnly({ cwd: join(HERE, "..") });
  check(`scanned something (${checked.length} rule sources)`, checked.length > 0);
  check(`quiet on the real corpus (${findings.length} findings)`, findings.length === 0);
  check("mutation files are not scanned as rules", !checked.some((f) => f.endsWith(".mutations.mjs")));
}

// ── II. fires on every form the defect has taken ────────────────────────────
for (const [label, src] of [
  ["execFileSync with a git argv", `import { execFileSync } from "node:child_process";
     execFileSync("git", ["cat-file", "-e", sha]);`],
  ["a namespaced call", `import cp from "node:child_process";
     cp.spawnSync("git", ["rev-parse", ref]);`],
  ["execSync with a git shell line", `import { execSync } from "child_process";
     execSync("git log --oneline -1");`],
  ["exec, async form", `exec("git rev-list --all", cb);`],
]) {
  check(`FIRES on ${label}`, processImports(src).length === 1);
}

// ── III. the FALSE POSITIVE that forced the narrowing, asserted so it cannot return ──
// 🔴 `paper-texcount.mjs` in the consumer shells out to `texcount` to count words in a .tex.
// The first version of this check keyed on importing `child_process` at all, so it claimed that
// rule on its first run — a false positive on an `error` gate, which is worse than a miss
// because the gate that cannot be cleared gets switched off rather than fixed.
for (const [label, src] of [
  ["a rule spawning texcount", `import { execFileSync } from "node:child_process";
     execFileSync("texcount", ["-brief", file]);`],
  ["a rule spawning pdflatex", `import { spawnSync } from "node:child_process";
     spawnSync("pdflatex", [tex]);`],
  ["importing child_process without running git", `import { execFileSync } from "node:child_process";
     export default {};`],
]) {
  check(`quiet on ${label}`, processImports(src).length === 0);
}

// ── IV. quiet on sources that only MENTION it — what a grep cannot do ───────
for (const [label, src] of [
  ["a comment naming git", `// never reach for git cat-file here\nexport default {};`],
  ["a string literal", `export const why = "git cat-file is banned in rules";`],
  ["a reported message", `export default { meta: { messages: { m: "run git cat-file? no" } } };`],
  ["a program merely NAMED git-something", `execFileSync("git-lfs-helper", []);`],
]) {
  check(`quiet on ${label}`, processImports(src).length === 0);
}

console.log(`rules-are-content-only.harness: ${n} assertions passed`);
