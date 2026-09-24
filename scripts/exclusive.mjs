#!/usr/bin/env node
/**
 * MUTUAL EXCLUSION FOR RUNS THAT TOUCH THE SAME FILES.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * The mutation batteries (`scripts/run-mutations.mjs`) edit the sources IN PLACE — a deliberate strategy, explained in the header of
 * `lib/mutation-driver.mjs`: nine cases rewrite the real file, and copying the whole repository
 * per mutation would mean minutes instead of seconds.
 *
 * The strategy has one cost: while the battery runs, ANY parallel `npm test` reads a file in its
 * mutilated state and fails — with a message about an assertion, not about a mutation. The
 * failure is FALSE, NON-DETERMINISTIC (it depends on which second you caught) and reads as "the
 * tests are flaky", i.e. it leads in exactly the direction where there is nothing to fix. This
 * has already cost an investigation: two runs in a row gave DIFFERENT error messages, and the
 * conclusion "I broke round-diff" was wrong.
 *
 * ── WHY A LOCK AND NOT AN INSTRUCTION "DON'T RUN THEM AT THE SAME TIME" ───────────────────────
 * The instruction already existed — as prose, in the consumer's CLAUDE.md. Prose does not
 * execute, so it is not checked and does not apply to anyone who has not read it: the person in
 * the other terminal, the agent, the editor with tests on save. A lock refuses LOUDLY and names
 * the reason at the moment it matters.
 *
 * ── HOW ─────────────────────────────────────────────────────────────────────────────────────
 * `mkdirSync` is atomic: either we created the directory or it already existed — there is no
 * race, unlike "check existsSync, then write". Inside it lie the holder's pid and command; if the
 * process with that pid is dead, the lock is taken over with an explicit message, otherwise an
 * interrupted run would block the repository forever, and the first cure would be "delete the
 * lock by hand", i.e. switching the mechanism off.
 *
 * The lock is released in `finally` AND on signals — for exactly the same reason the mutation
 * driver restores the sources on SIGINT/SIGTERM.
 */
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LOCK = join(ROOT, ".vigiles", "exclusive.lock");
const INFO = join(LOCK, "holder.json");

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error("usage: node scripts/exclusive.mjs <command> [args…]");
  process.exit(2);
}

// The PARENT is created recursively; only the lock itself must be a non-recursive mkdir, because
// that is the atomic step. Nothing else guarantees `.vigiles/` exists: once
// `.vigiles/coverage.json` stopped being tracked, a fresh checkout has no such directory, and the
// lock's mkdir failed with ENOENT before any gate ran (CI on e389916).
mkdirSync(dirname(LOCK), { recursive: true });

/** Is the process alive. `kill(pid, 0)` sends nothing — it only checks existence and rights. */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM"; // exists but belongs to someone else — counted as alive
  }
}

function readHolder() {
  try {
    return JSON.parse(readFileSync(INFO, "utf8"));
  } catch {
    return null; // the lock exists, its description is unreadable — resolved below as "dead"
  }
}

function acquire() {
  try {
    mkdirSync(LOCK, { recursive: false });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    const holder = readHolder();
    if (holder && alive(holder.pid)) {
      console.error(
        `🔴 refused: this repository is busy with a run that EDITS FILES IN PLACE.\n` +
          `   held by: pid ${holder.pid}, "${holder.cmd}", since ${holder.at}\n` +
          `   A parallel run would produce FALSE failures — a test would read the source in its\n` +
          `   mutilated state and complain about an assertion, not a mutation. Wait for it to finish.`,
      );
      process.exit(3);
    }
    console.error(
      `⚠️  the lock was left behind by a run that no longer exists` +
        (holder
          ? ` (pid ${holder.pid}, "${holder.cmd}")`
          : " (description unreadable)") +
        ` — taking it over.`,
    );
    rmSync(LOCK, { recursive: true, force: true });
    mkdirSync(LOCK, { recursive: false });
  }
  writeFileSync(
    INFO,
    JSON.stringify(
      { pid: process.pid, cmd: argv.join(" "), at: new Date().toISOString() },
      null,
      2,
    ),
  );
}

const release = () => {
  if (existsSync(LOCK)) rmSync(LOCK, { recursive: true, force: true });
};

acquire();
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    release();
    process.exit(sig === "SIGINT" ? 130 : 143);
  });
}

// 🔴 `process.on("exit")`, NOT `finally`, AND THIS IS NOT STYLE. The first edition released the
// lock in `finally` — and it STAYED ON DISK: `process.exit()` terminates the process immediately,
// the stack is not unwound, `finally` does not run. Caught by a run (the lock outlived a
// successful launch), not by reading. The cost of the defect would have been exactly the inverse
// of the intent: every run would leave the repository "busy", and the first cure would be "delete
// the lock by hand", i.e. switching the mechanism off.
process.on("exit", release);

const r = spawnSync(argv[0], argv.slice(1), { stdio: "inherit", shell: false });
if (r.error) {
  console.error(`🔴 failed to launch "${argv.join(" ")}": ${r.error.message}`);
  process.exit(127);
}
process.exit(r.status ?? 1);
