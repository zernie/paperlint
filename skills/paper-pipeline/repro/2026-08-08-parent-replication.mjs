/**
 * 2026-08-08-parent-replication.mjs — DID THE PARENT'S 12% HOLD, OR WAS IT TIME-BOUND?
 *
 * Run:  node .claude/skills/paper-pipeline/repro/2026-08-08-parent-replication.mjs
 *
 * WHY THIS EXISTS. `grade-paper-writing-ablation.eval.mjs`'s CONTROL ARM (A0 — the verbatim
 * description, the parent's own eight AH+SH prompts, the parent's fixture, the same 37 skills)
 * returned 13/24 = 54%. The parent (`framing-vs-vocabulary.eval.mjs`, same day) measured those same
 * eight prompts at AH 3/12 and SH 2/12 = 5/24 = 21%, and that 21%/12% is the entire premise of the
 * ablation — and of two SKILL.md edits made earlier the same day that cite it as measured fact.
 *
 * A control that contradicts the experiment it was built to explain outranks every arm, so this
 * settles which number is real, and it does it through the PARENT'S OWN CODE, not a reimplementation:
 *
 *   - It reads `framing-vs-vocabulary.eval.mjs` and applies exactly TWO textual patches, each of
 *     which must match exactly once or this script aborts:
 *       1. the MAIN LOOP is filtered to `grade-paper-writing` and to cells AH + SH;
 *       2. the output JSON path is changed so the parent's own result file is never overwritten.
 *     Everything else — fixture, roster, guards, allowedTools, trials, concurrency, spacing, timeout,
 *     the `fired` predicate, the skillsDir (the REAL `.claude/skills`) — is the parent's, unmodified.
 *     Note patch 1 deliberately filters the LOOP and not `CELLS`/`CASES` themselves: the parent's
 *     preflight guards compute overlap contrasts across all four cells and all three skills, and
 *     narrowing the constants would disable the guards instead of the runs.
 *   - The patched copy is written to the session scratchpad with a `node_modules` symlink, so
 *     `.claude/skills/` is not touched and the parent file is read-only throughout.
 *
 * READING IT
 *   ~54%  the parent's 21% for this skill was time-bound or otherwise unstable, and the "dead skill"
 *         premise is about MEASUREMENT STABILITY, not about the description. The two SKILL.md
 *         paragraphs citing 12% need correcting.
 *   ~21%  the difference lives in the ablation's harness setup (a copied skills dir, per-arm
 *         packaging) and NO ablation arm is comparable to the parent's numbers — the arms remain
 *         internally comparable to each other and to A0, and nothing else.
 *
 * 24 runs, ~$3.4 API-equivalent at the measured rate. n = 24 resolves a factor of two; that is
 * exactly the size of the disagreement (21% vs 54%), which is why 24 is enough here.
 */

import { readFileSync, writeFileSync, mkdirSync, symlinkSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.env.CLAUDE_PROJECT_DIR ?? "/home/user/mine";
const PARENT = join(ROOT, ".claude", "skills", "paper-pipeline", "framing-vs-vocabulary.eval.mjs");
const SCRATCH =
  process.env.ABLATION_SCRATCH ??
  "/tmp/claude-0/-home-user-mine/8268acb1-66a2-55ac-858e-2b9e3c81f84e/scratchpad/parent-repl";

const src = readFileSync(PARENT, "utf-8");

const PATCHES = [
  {
    what: "filter the MAIN LOOP to grade-paper-writing, cells AH+SH (guards untouched)",
    from: "const results = [];\nfor (const c of CASES) {\n  for (const k of CELLS) {",
    to:
      "const results = [];\n" +
      'for (const c of CASES.filter((c) => c.skill === "grade-paper-writing")) {\n' +
      '  for (const k of CELLS.filter((k) => k === "AH" || k === "SH")) {',
  },
  {
    what: "redirect the JSON output so the parent's own result file survives",
    from: '"2026-08-08-framing-vs-vocabulary.json"',
    to: '"2026-08-08-parent-replication-gpw.json"',
  },
];

let patched = src;
for (const p of PATCHES) {
  const n = patched.split(p.from).length - 1;
  if (n !== 1)
    throw new Error(`PATCH MATCHED ${n} TIMES (must be exactly 1): ${p.what}\n---\n${p.from}\n---`);
  patched = patched.replace(p.from, p.to);
  console.log(`patched: ${p.what}`);
}

rmSync(SCRATCH, { recursive: true, force: true });
mkdirSync(SCRATCH, { recursive: true });
const target = join(SCRATCH, "replication.mjs");
writeFileSync(target, patched);
if (!existsSync(join(SCRATCH, "node_modules")))
  symlinkSync(join(ROOT, "node_modules"), join(SCRATCH, "node_modules"), "dir");

console.log(`\nrunning the PARENT'S code, grade-paper-writing AH+SH only, 3 trials = 24 runs`);
console.log(`  parent : ${PARENT}`);
console.log(`  patched: ${target}\n`);

const r = spawnSync(process.execPath, [target, "--mode", "main"], {
  stdio: "inherit",
  env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
  cwd: ROOT,
});
process.exit(r.status ?? 1);
