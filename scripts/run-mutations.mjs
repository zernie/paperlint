/**
 * run-mutations.mjs — run EVERY mutation battery in the repository, found rather than listed.
 *
 * ── WHY THIS EXISTS, AND IT IS NOT TIDINESS ─────────────────────────────────
 * 🔴 It replaces a hand-written list in `package.json` that had ALREADY ROTTED. On 2026-09-11
 * the `mutations` script read:
 *
 *     node eslint-rules/tex-build.mutations.mjs &&
 *     node eslint-rules/latex-language.mutations.mjs &&
 *     node scripts/rules-see-files.mutations.mjs
 *
 * — three of the four batteries on disk. `papers.mutations.mjs`, added the same day, was not in
 * it, and nothing said so: the command exited 0 and printed three confident green tables. A
 * list of paths maintained by hand is the thing that goes stale, and it goes stale SILENTLY,
 * which is the same failure class the batteries themselves exist to catch.
 *
 * ── THE TWO GUARDS ──────────────────────────────────────────────────────────
 * 1. FINDING ZERO BATTERIES IS AN ERROR, not an empty success. A run that discovers nothing and
 *    exits 0 is byte-identical to a run where every battery passed — the exact green zero this
 *    repository has a dedicated script for (`rules-see-files.mjs`), applied here to itself.
 * 2. (REMOVED 2026-09-24) A harness without a battery used to be an error. It no longer is —
 *    see the note above the run loop.
 *
 * ⚠️ Batteries WRITE to the file under test and roll it back. They are safe to run on a clean
 * tree and NOT safe to run with uncommitted edits to a rule: a crash between the write and the
 * rollback leaves the mutant on disk. Each battery re-reads the file and verifies the rollback
 * byte for byte, so the window is small, but it is not zero.
 *
 * Run: `node scripts/run-mutations.mjs` (also part of `npm run check`)
 */
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// 🔴 `.claude` IS A VIEW OF `skills/`, NOT A SECOND COPY OF IT. This repository is its own first
// consumer: `.claude/skills/<name>` are symlinks back to `skills/<name>` so that the path every
// SKILL.md's prose names resolves here too (see `skills/skill-contract.mutations.mjs`). Walking
// into it counts each harness TWICE under two spellings of one file, and the second spelling is
// never what a battery names — so every skill harness read as an orphan while being perfectly
// covered. Measured 2026-09-12: 11 phantom orphans, all of them the same files seen through the
// symlink. Skipping the view is not an exemption: the real files are still walked under `skills/`.
const SKIP = new Set(["node_modules", ".git", "fixtures", ".claude"]);

/** Every `*.mutations.mjs` on disk, as repo-relative paths. */
function collect(dir, found = { mutations: [] }) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      collect(p, found);
      continue;
    }
    if (entry.endsWith(".mutations.mjs"))
      found.mutations.push(relative(ROOT, p));
  }
  return found;
}

const { mutations } = collect(ROOT);
mutations.sort();

// Guard 1 — the green zero, applied to this script itself.
if (mutations.length === 0) {
  console.error(
    "❌ NO mutation batteries found under " +
      ROOT +
      ".\n" +
      "   This is an error rather than an empty success: a run that discovers nothing and exits " +
      "0\n   is indistinguishable from a run where every battery passed.",
  );
  process.exit(1);
}

// 🔴 NO ORPHAN GUARD ANY MORE (2026-09-24). Until then this script refused every `*.harness.mjs`
// that no battery named — so a new harness could not land without a new hand-written battery of
// string replacements over source lines. Those batteries are the pattern issue #52 is replacing:
// they break on every reformat, rerun a whole harness per case, and are slow. Forcing more of them
// into existence was the wrong direction, so the requirement is gone. Existing batteries still run
// below, and one that fails to kill its mutant still fails the run.

console.log(
  `Running ${mutations.length} mutation batter${mutations.length === 1 ? "y" : "ies"}:\n`,
);
const failed = [];
for (const m of mutations) {
  console.log(`──────── ${m}`);
  try {
    execFileSync(process.execPath, [m], { cwd: ROOT, stdio: "inherit" });
  } catch {
    failed.push(m);
  }
}

console.log(
  `\n${mutations.length - failed.length}/${mutations.length} batter${mutations.length === 1 ? "y" : "ies"} clean` +
    (failed.length ? `, FAILED: ${failed.join(", ")}` : ""),
);
process.exit(failed.length ? 1 : 0);
