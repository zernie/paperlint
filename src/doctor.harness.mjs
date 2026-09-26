/**
 * Both halves for `paperlint doctor` — a command whose subject is the STATE OF THE INSTALL, not a
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
import { PAPERS_DIR_FIELD } from "../lib/paper-config.mjs";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const { doctor, detectPapers, PROGRAMS, found } = await import(
  join(HERE, "doctor.ts")
);
const { papersRoot } = await import(
  join(HERE, "..", "hooks", "paper-edit-guard.hook.mjs")
);

let n = 0;
const check = (label, cond) => {
  n++;
  assert.ok(cond, label);
};

/** A consumer on disk: a papers directory, and maybe a declaration in package.json. */
function consumer({ papersDir, pkgKey, makeDir = true }) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-doctor-")));
  if (makeDir && papersDir) {
    mkdirSync(join(dir, papersDir, "some-paper"), { recursive: true });
    writeFileSync(
      join(dir, papersDir, "some-paper", "PIPELINE-STATUS.md"),
      "# s\n",
    );
  }
  const pkg = { name: "consumer", version: "1.0.0" };
  if (pkgKey !== undefined) pkg["paperlint"] = { [PAPERS_DIR_FIELD]: pkgKey };
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  return dir;
}

/** Runs doctor in memory: all output is collected, external programs are faked so it does not depend on the machine. */
const runDoctor = (
  dir,
  { cliPapers = null, have = () => 0, skillLinks } = {},
) => {
  const lines = [];
  const code = doctor({
    log: (...a) => lines.push(a.join(" ")),
    cwd: dir,
    projectDir: dir,
    cliPapers,
    run: (_bin, _args) => ({ status: have(_args?.[1]) }),
    ...(skillLinks ? { skillLinks } : {}),
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
// The old `init` wrote its own config file and did not touch package.json; the hook reads package.json.
// Measured 09-18.
{
  const dir = consumer({ papersDir: "writing/drafts" });
  const r = runDoctor(dir, { cliPapers: "writing/drafts" });
  check(
    "an install that follows the docs — a FAILURE, not a cheerful report",
    r.code === 2,
  );
  check(
    "and BOTH directories are named, so the mismatch is visible rather than inferred",
    /will lint\s+writing\/drafts/.test(r.out) &&
      /will guard\s+papers/.test(r.out),
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
  const dir = consumer({ papersDir: "papers" });
  const r = runDoctor(dir, { cliPapers: "papers" });
  check("an install that works by coincidence does NOT crash", r.code === 0);
  check(
    "but the missing declaration is NAMED, not skipped",
    /⚠ package\.json has no "paperlint"/.test(r.out),
  );
  check(
    "and it says exactly why that is risky — it works only until the directory moves",
    /works only while your papers happen to live there/.test(r.out),
  );
  rmSync(dir, { recursive: true, force: true });
}

// ── II-ter. A FRESH PROJECT WITH NO PAPERS YET IS NOT BROKEN ───────────────────────────────
// `init --yes` declares the default and creates no paper. The declared directory does not exist,
// and no papers live anywhere else: the guard has nothing to protect yet. A warning with the next
// step, not a failure. (A missing directory while papers DO live elsewhere stays ✗ — case II.)
{
  const dir = consumer({
    papersDir: "papers",
    pkgKey: "papers",
    makeDir: false,
  });
  const r = runDoctor(dir, { cliPapers: "papers" });
  check("no papers anywhere yet — NOT a failure", r.code === 0);
  check(
    "but it is named, with the command that creates the first paper",
    /⚠ papers does not exist yet — no papers yet/.test(r.out) &&
      /new <name>/.test(r.out) &&
      !/watching nothing/.test(r.out),
  );
  rmSync(dir, { recursive: true, force: true });
}

// ── III. TWO DECLARATIONS HAVE DRIFTED APART ────────────────────────────────────────────────
{
  const dir = consumer({ papersDir: "writing/drafts", pkgKey: "papers" });
  mkdirSync(join(dir, "papers"), { recursive: true });
  const r = runDoctor(dir, { cliPapers: "writing/drafts" });
  check("both declarations exist, but differ — a FAILURE", r.code === 2);
  rmSync(dir, { recursive: true, force: true });
}

// ── IV. THE ROOT IS ASKED FOR FROM THE HOOK ITSELF, NOT RETOLD ─────────────────────────────
// This is load-bearing: a copy of the logic would drift silently and print a confident wrong
// answer.
{
  const dir = consumer({ papersDir: "docs/papers", pkgKey: "docs/papers/" });
  const r = runDoctor(dir, { cliPapers: "docs/papers" });
  const fromHook = papersRoot(
    JSON.stringify({
      paperlint: { [PAPERS_DIR_FIELD]: "docs/papers/" },
    }),
  );
  check("the hook itself trims the trailing slash", fromHook === "docs/papers");
  check(
    "and doctor prints EXACTLY what the hook returned, not its own reading",
    new RegExp(`will guard\\s+${fromHook}$`, "m").test(r.out),
  );
  check(
    "a trailing slash does not make the install look inconsistent",
    r.code === 0,
  );
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
    /npx paperlint toolchain/.test(none.out),
  );
  check(
    "and the consequence: which checks silently don't run without it",
    /nothing else spell-checks the text/.test(none.out),
  );
  check(
    "the program list is DECLARED, not baked into the printing",
    PROGRAMS.length >= 5,
  );
  check(
    "no poppler row: paperlint reads PDFs with pdf.js, which it installs itself",
    !PROGRAMS.some((p) => /^pdf(info|fonts|totext|tohtml)$/.test(p.bin)) &&
      !/poppler/.test(none.out),
  );
  // Guards: banal's one system requirement is named — a missing perl reads as null geometry, silently.
  check(
    "a perl row, naming what goes missing and how banal gets installed",
    /✗ perl/.test(none.out) &&
      /paperlint toolchain \(it fetches banal\)/.test(none.out),
    none.out,
  );
  rmSync(dir, { recursive: true, force: true });
}

// ── VII. DETECTING THE PAPERS DIRECTORY ─────────────────────────────────────────────────────
{
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-detect-")));
  mkdirSync(join(dir, "writing", "drafts", "p1"), { recursive: true });
  writeFileSync(join(dir, "writing", "drafts", "p1", "paper.tex"), "x");
  mkdirSync(join(dir, "node_modules", "pkg", "papers", "p"), {
    recursive: true,
  });
  writeFileSync(
    join(dir, "node_modules", "pkg", "papers", "p", "paper.tex"),
    "x",
  );
  const hits = detectPapers(dir);
  check(
    "finds the root by a marker inside a subdirectory",
    hits.includes("writing/drafts"),
  );
  check(
    "🔴 and it is the ROOT, not the paper itself — otherwise the config would point at one document",
    !hits.includes("writing/drafts/p1"),
  );
  check(
    "node_modules is not searched — someone else's papers are not ours",
    !hits.some((h) => h.startsWith("node_modules")),
  );
  // A folder holding only the project's paper TEMPLATE (`paperlint new` reads `<papers>/.template/`)
  // carries every marker, and is still not a papers root: discovery skips dot-directories.
  mkdirSync(join(dir, "only-template", ".template"), { recursive: true });
  writeFileSync(join(dir, "only-template", ".template", "paper.tex"), "x");
  check(
    "🔴 a directory whose only marked child is .template/ is NOT a papers root",
    !detectPapers(dir).includes("only-template"),
  );
  rmSync(dir, { recursive: true, force: true });
}

// ── VII-bis. SKILLS THAT ARE NOT LINKED ARE NAMED — AND DO NOT FAIL THE RUN ─────────────────
// Before this section a consumer without `.claude/skills/` links had no `/paper-pipeline`, and
// nothing anywhere said so. The link state itself is `link-skills.harness.mjs`'s subject; here
// only doctor's REPORTING of it is judged, so the state is handed in rather than built on disk.
{
  const dir = consumer({ papersDir: "papers", pkgKey: "papers" });
  const state = {
    ok: true,
    home: join(dir, ".claude", "skills"),
    example: "../../node_modules/paperlint/skills/a",
    links: [
      { name: "a", status: "present" },
      { name: "b", status: "missing" },
      { name: "c", status: "foreign", reason: "a directory" },
    ],
  };
  const r = runDoctor(dir, { cliPapers: "papers", skillLinks: () => state });
  check(
    "an unlinked skill is NAMED, not summed into a checkmark",
    /2 of 3 shipped skills are NOT reachable/.test(r.out) &&
      /\bb — not linked/.test(r.out),
  );
  check(
    "a name taken by something else says WHAT is there",
    /\bc — a directory, not the shipped skill/.test(r.out),
  );
  check(
    "🔴 an unlinked skill does NOT fail the run — lint, hooks and CI work without it",
    r.code === 0,
  );
  const all = runDoctor(dir, {
    cliPapers: "papers",
    skillLinks: () => ({ ...state, links: [{ name: "a", status: "present" }] }),
  });
  check(
    "every skill linked — one line says so",
    /✓ all 1 shipped skills are reachable/.test(all.out),
  );
  rmSync(dir, { recursive: true, force: true });
}

// ── VIII. `found` ASKS THE SYSTEM, IT DOES NOT GUESS BY NAME ────────────────────────────────
{
  check("a program that really exists is found", found("node") === true);
  check(
    "a made-up one is not (otherwise the check answers the form, not the subject)",
    found("paperlint-definitely-not-a-real-binary-xyz") === false,
  );
}

console.log(
  `✓ ${n} assertions passed — paperlint doctor: an install can vouch for itself`,
);
