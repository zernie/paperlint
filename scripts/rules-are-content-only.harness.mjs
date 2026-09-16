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

// ── II. fires on every form the defect takes ─────────────────────────────────
for (const [label, src] of [
  ["a static import", `import { execFileSync } from "child_process";\nexport default {};`],
  ["the node: prefix", `import cp from "node:child_process";\nexport default {};`],
  ["a require call", `const cp = require("child_process");\nmodule.exports = {};`],
  ["a dynamic import", `const cp = await import("node:child_process");\nexport default {};`],
]) {
  check(`FIRES on ${label}`, processImports(src).length === 1);
}

// ── III. quiet on sources that only MENTION it — what a grep cannot do ───────
for (const [label, src] of [
  ["a comment naming the module", `// never reach for child_process here\nexport default {};`],
  ["a string literal", `export const why = "child_process is banned in rules";`],
  ["a message a rule reports", `export default { meta: { messages: { m: "use node:child_process? no" } } };`],
]) {
  check(`quiet on ${label}`, processImports(src).length === 0);
}

// An unrelated import is not a finding — otherwise "fires" would mean "fires at everything".
check("quiet on an unrelated import", processImports(`import { statSync } from "node:fs";`).length === 0);

console.log(`rules-are-content-only.harness: ${n} assertions passed`);
