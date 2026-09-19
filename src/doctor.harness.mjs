/**
 * Both halves for `rpp doctor` — a command whose subject is the STATE OF THE INSTALL, not a
 * file.
 *
 * 🔴 WHY A TEST MATTERS ESPECIALLY MUCH HERE. Doctor exists precisely because
 * `paper-edit-guard` cannot say "I am guarding nothing": silence is its success state. A broken
 * doctor has exactly the same property — it will print a cheerful list of checkmarks and never
 * notice a mismatch. That is, the check for a silent failure can itself fail silently, and only
 * this file can tell the two apart.
 *
 * Run:    npx vigiles test src/doctor.harness.mjs
 * Killed by: src/doctor.mutations.mjs
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const { doctor, detectPapers, PROGRAMS, found } = await import(join(HERE, "doctor.ts"));
const { papersRoot } = await import(
  join(HERE, "..", "hooks", "paper-edit-guard.hook.mjs")
);

let n = 0;
const check = (label, cond) => {
  n++;
  assert.ok(cond, label);
};

/** A consumer on disk: a papers directory, declarations in one or both places. */
function consumer({ papersDir, pkgKey, rppJson, makeDir = true }) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "rpp-doctor-")));
  if (makeDir && papersDir) {
    mkdirSync(join(dir, papersDir, "some-paper"), { recursive: true });
    writeFileSync(join(dir, papersDir, "some-paper", "PIPELINE-STATUS.md"), "# s\n");
  }
  const pkg = { name: "consumer", version: "1.0.0" };
  if (pkgKey !== undefined) pkg["research-paper-pipeline"] = { papers: pkgKey };
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  if (rppJson !== undefined)
    writeFileSync(join(dir, "rpp.json"), JSON.stringify({ papers: rppJson }, null, 2));
  return dir;
}

/** Runs doctor in memory: all output is collected, external programs are faked so it does not depend on the machine. */
const runDoctor = (dir, { cliPapers = null, have = () => 0 } = {}) => {
  const lines = [];
  const code = doctor({
    log: (...a) => lines.push(a.join(" ")),
    cwd: dir,
    projectDir: dir,
    cliPapers,
    run: (_bin, _args) => ({ status: have(_args?.[1]) }),
  });
  return { code, out: lines.join("\n") };
};

// ── I. A CONSISTENT INSTALL IS SILENT ───────────────────────────────────────────────────────
{
  const dir = consumer({ papersDir: "papers", pkgKey: "papers" });
  const r = runDoctor(dir, { cliPapers: "papers" });
  check("a consistent install — exit ZERO", r.code === 0);
  check(
    "and it says outright that the guarded directory is the linted one",
    /the same directory/.test(r.out),
  );
  rmSync(dir, { recursive: true, force: true });
}

// ── II. THE VERY DEFECT: AN INSTALL FOLLOWING THE DOCS ─────────────────────────────────────
// `rpp init` writes rpp.json and does not touch package.json; the hook reads package.json.
// Measured 09-18.
{
  const dir = consumer({ papersDir: "writing/drafts", rppJson: "writing/drafts" });
  const r = runDoctor(dir, { cliPapers: "writing/drafts" });
  check("an install that follows the docs — a FAILURE, not a cheerful report", r.code === 2);
  check(
    "and BOTH directories are named, so the mismatch is visible rather than inferred",
    /will lint\s+writing\/drafts/.test(r.out) && /will guard\s+papers/.test(r.out),
  );
  check(
    "🔴 and the CONSEQUENCE is stated: writes pass the guard unseen",
    /passes the guard unseen/.test(r.out),
  );
  check(
    "the directory that does not exist is named as a guard watching nothing",
    /watching nothing/.test(r.out),
  );
  check(
    "and it hints where the papers ACTUALLY live — measured, not guessed",
    /papers look like they live in: writing\/drafts/.test(r.out),
  );
  rmSync(dir, { recursive: true, force: true });
}

// ── II-bis. A MISSING DECLARATION THAT DOES NO HARM YET ────────────────────────────────────
// The papers live exactly where the hook's default points. The install WORKS — by coincidence.
// It must not fail here (an error-level false positive costs more than a miss), but it must
// not stay silent either.
{
  const dir = consumer({ papersDir: "papers", rppJson: "papers" });
  const r = runDoctor(dir, { cliPapers: "papers" });
  check("an install that works by coincidence does NOT crash", r.code === 0);
  check(
    "but the missing declaration is NAMED, not skipped",
    /⚠ package\.json has no "research-paper-pipeline"/.test(r.out),
  );
  check(
    "and it says exactly why that is risky — it works only until the directory moves",
    /works only while your papers happen to live there/.test(r.out),
  );
  rmSync(dir, { recursive: true, force: true });
}

// ── III. TWO DECLARATIONS HAVE DRIFTED APART ────────────────────────────────────────────────
{
  const dir = consumer({ papersDir: "writing/drafts", pkgKey: "papers", rppJson: "writing/drafts" });
  mkdirSync(join(dir, "papers"), { recursive: true });
  const r = runDoctor(dir, { cliPapers: "writing/drafts" });
  check("both declarations exist, but differ — a FAILURE", r.code === 2);
  check("the stale rpp.json is called out ⚠", /rpp\.json is present/.test(r.out));
  rmSync(dir, { recursive: true, force: true });
}

// ── IV. THE ROOT IS ASKED FOR FROM THE HOOK ITSELF, NOT RETOLD ─────────────────────────────
// This is load-bearing: a copy of the logic would drift silently and print a confident wrong
// answer.
{
  const dir = consumer({ papersDir: "docs/papers", pkgKey: "docs/papers/" });
  const r = runDoctor(dir, { cliPapers: "docs/papers" });
  const fromHook = papersRoot(
    JSON.stringify({ "research-paper-pipeline": { papers: "docs/papers/" } }),
  );
  check("the hook itself trims the trailing slash", fromHook === "docs/papers");
  check(
    "and doctor prints EXACTLY what the hook returned, not its own reading",
    new RegExp(`will guard\\s+${fromHook}$`, "m").test(r.out),
  );
  check("a trailing slash does not make the install look inconsistent", r.code === 0);
  rmSync(dir, { recursive: true, force: true });
}

// ── V. THE HOOK'S REFUSAL IS PASSED ALONG, NOT TURNED INTO A DIRECTORY ─────────────────────
{
  const dir = consumer({ papersDir: "papers", pkgKey: "" });
  const r = runDoctor(dir, { cliPapers: "papers" });
  check(
    "an empty string in the declaration — the hook refuses, and doctor NAMES it",
    /the guard refuses/.test(r.out),
  );
  rmSync(dir, { recursive: true, force: true });
}

// ── VI. EXTERNAL PROGRAMS ARE A FACT, NOT A VERDICT ─────────────────────────────────────────
{
  const dir = consumer({ papersDir: "papers", pkgKey: "papers" });
  const none = runDoctor(dir, { cliPapers: "papers", have: () => 1 });
  check(
    "🔴 a missing tex install does NOT fail the run — a gate on advice would mute the whole thing",
    none.code === 0,
  );
  check("but every absence is NAMED", /✗ pdflatex/.test(none.out));
  check(
    "and it carries a REMEDY, not just a diagnosis",
    /apt-get install -y texlive-latex-recommended/.test(none.out),
  );
  check(
    "and the consequence: which checks silently don't run without it",
    /nothing else spell-checks the text/.test(none.out),
  );
  check("the program list is DECLARED, not baked into the printing", PROGRAMS.length >= 7);
  rmSync(dir, { recursive: true, force: true });
}

// ── VII. DETECTING THE PAPERS DIRECTORY ─────────────────────────────────────────────────────
{
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "rpp-detect-")));
  mkdirSync(join(dir, "writing", "drafts", "p1"), { recursive: true });
  writeFileSync(join(dir, "writing", "drafts", "p1", "paper.tex"), "x");
  mkdirSync(join(dir, "node_modules", "pkg", "papers", "p"), { recursive: true });
  writeFileSync(join(dir, "node_modules", "pkg", "papers", "p", "paper.tex"), "x");
  const hits = detectPapers(dir);
  check("finds the root by a marker inside a subdirectory", hits.includes("writing/drafts"));
  check(
    "🔴 and it is the ROOT, not the paper itself — otherwise the config would point at one document",
    !hits.includes("writing/drafts/p1"),
  );
  check(
    "node_modules is not searched — someone else's papers are not ours",
    !hits.some((h) => h.startsWith("node_modules")),
  );
  rmSync(dir, { recursive: true, force: true });
}

// ── VIII. `found` ASKS THE SYSTEM, IT DOES NOT GUESS BY NAME ────────────────────────────────
{
  check("a program that really exists is found", found("node") === true);
  check(
    "a made-up one is not (otherwise the check answers the form, not the subject)",
    found("rpp-definitely-not-a-real-binary-xyz") === false,
  );
}

console.log(`✓ ${n} assertions passed — rpp doctor: an install can vouch for itself`);
