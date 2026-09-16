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
 * 2. A HARNESS WITHOUT A BATTERY IS AN ERROR. A green harness proves nothing on its own: silence
 *    is the success state of every check here, so "it passed" and "it cannot fail" look the
 *    same. The battery is what separates them, and pairing is checked by NAME (`x.harness.mjs`
 *    ↔ `x.mutations.mjs`) so a new rule cannot arrive with a test that nothing can kill.
 *
 * ⚠️ Batteries WRITE to the file under test and roll it back. They are safe to run on a clean
 * tree and NOT safe to run with uncommitted edits to a rule: a crash between the write and the
 * rollback leaves the mutant on disk. Each battery re-reads the file and verifies the rollback
 * byte for byte, so the window is small, but it is not zero.
 *
 * Run: `npm run test:sabotage`
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
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

/** Every `*.harness.mjs` and `*.mutations.mjs` on disk, as repo-relative paths. */
function collect(dir, found = { harness: [], mutations: [] }) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      collect(p, found);
      continue;
    }
    if (entry.endsWith(".harness.mjs")) found.harness.push(relative(ROOT, p));
    else if (entry.endsWith(".mutations.mjs")) found.mutations.push(relative(ROOT, p));
  }
  return found;
}

const { harness, mutations } = collect(ROOT);
harness.sort();
mutations.sort();

// Guard 1 — the green zero, applied to this script itself.
if (mutations.length === 0) {
  console.error(
    "❌ NO mutation batteries found under " + ROOT + ".\n" +
      "   This is an error rather than an empty success: a run that discovers nothing and exits " +
      "0\n   is indistinguishable from a run where every battery passed.",
  );
  process.exit(1);
}

// Guard 2 — a harness nothing can kill is a harness that proves nothing.
//
// Coverage is ASKED FOR, not inferred from filenames: each battery is run in report mode, where
// `runMutations` prints the harnesses its own cases name and returns without editing anything.
// The filename rule it replaces was a proxy that this repo's own corpus breaks —
// `ledger.mutations.mjs` kills `gates.harness.mjs`, and no naming convention says so.
const covered = new Set();
for (const m of mutations) {
  const r = spawnSync(process.execPath, [m], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, MUTATIONS_REPORT_COVERAGE: "1" },
  });
  if (r.status !== 0) {
    console.error(
      `❌ ${m} could not report its coverage (exit ${r.status}).\n` +
        `   A battery that cannot say what it kills is not evidence of anything.\n` +
        (r.stderr ?? ""),
    );
    process.exit(1);
  }
  for (const line of (r.stdout ?? "").split("\n")) {
    const [tag, path] = line.split("\t");
    if (tag === "MUTATION-COVERS" && path) covered.add(relative(ROOT, resolve(ROOT, path.trim())));
  }
}
// A battery that reports nothing is itself the green zero, one level down.
if (covered.size === 0) {
  console.error(
    "❌ the batteries reported ZERO harnesses between them.\n" +
      "   Either none of them calls runMutations at import time, or report mode is broken. " +
      "Both\n   make the guard below vacuous, so it refuses to pass.",
  );
  process.exit(1);
}
const orphans = harness.filter((h) => !covered.has(h));
if (orphans.length > 0) {
  console.error(
    `❌ ${orphans.length} harness(es) no mutation battery can kill:\n` +
      orphans.map((o) => `   ${o}`).join("\n") +
      "\n   A green harness is not evidence on its own — silence is the success state of every " +
      "check\n   here, so «it passed» and «it cannot fail» look the same from outside. The " +
      "battery is\n   what tells them apart.\n" +
      "   Fix by adding a case whose `harness` names the file, in a new battery or an existing " +
      "one.",
  );
  process.exit(1);
}

console.log(`Running ${mutations.length} mutation batter${mutations.length === 1 ? "y" : "ies"}:\n`);
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
