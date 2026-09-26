/**
 * render-paper — the free, deterministic tier. No model, no network.
 *
 * COLOCATED ON PURPOSE. vigiles decides coverage by PLACEMENT as of 2026-08-11:
 * a test that merely names a surface no longer counts, because that tier was
 * crediting surfaces nothing touched. So each skill needs a file inside its own
 * directory — this one.
 *
 * The assertions live in `.claude/lib/skill-checks.mjs` and are CALLED here with
 * this skill's name. They are not copied: 22 copies of the same checks is the drift that
 * module exists to avoid. (Until 2026-08-11 this was an env-var side channel into a
 * 614-line file named after no surface; it is a function call now.)
 *
 * What this proves: this skill's frontmatter parses as strict YAML, its declared
 * tool contract is sane, its pipeline wiring points at scripts that exist, and it
 * announces/records under ITS OWN identity rather than a sibling's.
 *
 * What it does NOT prove: that the skill fires, or that its guidance produces a
 * good result. Those need a real model — see `render-paper.eval.mjs`.
 */
import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { checkSkill } from "../../lib/skill-checks.mjs";
import { papersRoot } from "../../eslint-rules/papers.mjs";
import {
  consumerRoot,
  settingsOf,
} from "../paper-pipeline/scripts/consumer.mjs";

await checkSkill("render-paper");

// The TeX package pins that stood here (texlive-fonts-extra, texlive-plain-generic in
// ensure-toolchain.sh) moved with the list itself: the venue profiles declare the packages, and
// src/tex-requirements.harness.mjs asserts that every acmart venue declares libertine, inconsolata,
// newtx, kastrup (binhex.tex) and fancyhdr — each proved by the file whose absence broke a build.

// ── TEXINPUTS: WHERE THE SCRIPTS LOOK FOR `paper-guards.tex` ─────────────────
//
// Why this is guarded by a test and not by proofreading. The reference guard is included via
// `\input{paper-guards}` WITHOUT a path — the file is found through `TEXINPUTS`, which the caller
// sets. An unresolved `\input` does NOT crash pdflatex: it writes a line to the log and continues,
// meaning the PDF builds GREEN and simply stops checking for dangling `\ref`/`\cite`. So a miss in
// this wiring is indistinguishable from success right up until the day someone finds a `??` in the
// submitted paper.
//
// What's checked is the RESOLUTION, not the build: that's what `check-render.sh`'s
// `--print-venues` mode is for — it prints the chosen directory and compiles nothing.
//
// What these assertions do NOT prove: that the found file is correct, that pdflatex read it, and
// that the guard fired. That's caught by `paper-guards.tex` itself (it fails with
// `\PackageError`) — here it's only "a directory was found, and found in the right order."
{
  const HERE = dirname(fileURLToPath(import.meta.url));
  const CHECK = join(HERE, "check-render.sh");
  const run = (args, opts = {}) =>
    spawnSync("bash", [CHECK, ...args], { encoding: "utf8", ...opts });

  // First half — on TODAY's tree, resolution must succeed IF THERE IS ANYTHING TO
  // resolve.
  //
  // 🔴 THERE USED TO BE AN UNCONDITIONAL `assert.equal(status, 0)` HERE, AND THE MOVE BROKE IT —
  // for a real reason, not by accident. It relied on the SURROUNDING tree: while the skill lived
  // at the consumer, the second rung of the ladder won
  // (`.claude/skills/submit-paper/references/venues/`). The package checkout has neither that nor
  // the first rung — `venues/` arrives together with `submit-paper`, which hasn't moved yet. So
  // the assertion wasn't checking resolution, it was checking for the presence of an unrelated
  // directory nearby.
  //
  // The form now is: resolution must succeed IF AND ONLY IF at least one candidate exists on
  // disk. This is still a real assertion — it fails if a candidate exists and the script didn't
  // find it — but it stops requiring the existence of something this repository doesn't have yet.
  // The absence of both candidates gets PRINTED, not swallowed: "the check found nothing to
  // check" and "the check passed" have to look different.
  const candidates = [
    // rung 1 — the package
    join(HERE, "..", "..", "venues", "paper-guards.tex"),
    // rung 2 — the skill directory at the consumer
    join(
      HERE,
      "..",
      "submit-paper",
      "references",
      "venues",
      "paper-guards.tex",
    ),
  ].filter((c) => existsSync(c));

  const ok = run(["--print-venues"]);
  if (candidates.length === 0) {
    assert.notEqual(
      ok.status,
      0,
      `there is NO paper-guards.tex on disk at all, but --print-venues returned 0 and printed ` +
        `${JSON.stringify(ok.stdout.trim())}. Resolution succeeding out of nothing is exactly the ` +
        `silent success this whole block was written to catch.`,
    );
    console.log(
      `  --print-venues: NOT VERIFIED on the live tree — paper-guards.tex is absent from both ` +
        `the package (venues/) and next to it (submit-paper/references/venues/). It arrives with ` +
        `\`submit-paper\`; until then only the fixtures below hold this half.`,
    );
  } else {
    assert.equal(
      ok.status,
      0,
      `a candidate exists on disk (${candidates[0]}), so --print-venues must resolve:\n${ok.stderr}`,
    );
    assert.ok(
      existsSync(join(ok.stdout.trim(), "paper-guards.tex")),
      `--print-venues printed ${ok.stdout.trim()}, but paper-guards.tex isn't there`,
    );
  }

  // First half, part two — RESOLUTION DOES NOT DEPEND ON THE CURRENT DIRECTORY, and this case is
  // written against a real regression from 09-12, not invented. `check-render.sh` itself `cd`s
  // into the paper's directory BEFORE it looks for venues, and `gates.harness.mjs` calls it
  // against a temporary fixture with a trimmed environment. So `git rev-parse --show-toplevel`
  // runs in a temp directory, and `CLAUDE_PROJECT_DIR` isn't set — so the ladder found nothing,
  // stopping a build on a test that had passed the day before. The anchor became the SCRIPT'S OWN
  // directory: it depends on neither the cwd nor whether the caller sits inside a git tree.
  //
  // ⚠️ Like the first half, this case requires that at least one `paper-guards.tex` exists on
  // disk: it checks that resolution doesn't depend on cwd, not that the file exists. With no
  // candidate there's nothing to check, and that gets printed, not swallowed.
  if (candidates.length > 0) {
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "venues-cwd-")));
    const env = { ...process.env };
    delete env.CLAUDE_PROJECT_DIR;
    const r = run(["--print-venues"], { cwd: outside, env });
    assert.equal(
      r.status,
      0,
      `resolution must work outside a git tree and without CLAUDE_PROJECT_DIR:\n${r.stderr}`,
    );
    assert.ok(
      existsSync(join(r.stdout.trim(), "paper-guards.tex")),
      `outside the repository, printed ${r.stdout.trim()}, but paper-guards.tex isn't there`,
    );
  } else {
    console.log(
      `  --print-venues (outside a git tree): NOT VERIFIED — no candidate on disk, see above.`,
    );
  }

  // Second half — and it's the load-bearing one, because the silent failure lives right here.
  // When the file is NOWHERE, the script must exit with code 2 and say why. A silent success here
  // is exactly the defect the whole ladder was written for.
  //
  // 🔴 RUN AGAINST A COPY OF THE SCRIPT, AND THIS IS NOT A TEST WORKAROUND, IT'S A CONSEQUENCE OF
  // THE MOVE (09-12, wave ③). Before `submit-paper` moved, "nowhere" was reproduced by an empty
  // consumer root: both former rungs looked outward (the package name from cwd · `.claude/` under
  // the root), and an empty directory found nothing at either. Now the script has a rung anchored
  // to ITS OWN directory (`$SELF_DIR/../submit-paper/references/venues`) — added for
  // cwd-independence — so as long as the script sits inside the package, venues next to it exist
  // ALWAYS, and "nowhere" can no longer be reached through the environment. The only honest way to
  // demonstrate that state is to move the script itself out of the package. The property being
  // checked is otherwise identical, word for word: nothing resolved ⇒ exit 2 + the name of the
  // missing file. ⚠️ What this form no longer checks: that an empty consumer root won't make the
  // script lie — and it shouldn't, because such a root is now legitimately shadowed by the copy in
  // the package.
  const empty = realpathSync(mkdtempSync(join(tmpdir(), "venues-none-")));
  const lonely = join(empty, "check-render.sh");
  copyFileSync(CHECK, lonely);
  const none = spawnSync("bash", [lonely, "--print-venues"], {
    encoding: "utf8",
    cwd: empty, // outside a git tree ⇒ the package doesn't resolve
    env: { ...process.env, CLAUDE_PROJECT_DIR: empty },
  });
  assert.equal(
    none.status,
    2,
    "no venues anywhere ⇒ exit 2, not a silent success",
  );
  assert.match(
    none.stderr,
    /paper-guards\.tex/,
    "the failure message must name the missing file",
  );

  // Third half — the ORDER of the rungs. Not cosmetic: on the day of the move, both rungs will be
  // true at once, and the package has to win, otherwise the consumer silently keeps building with
  // their old copy. Plant BOTH candidates and see which one is chosen.
  const both = realpathSync(mkdtempSync(join(tmpdir(), "venues-both-")));
  const pkgVenues = join(both, "node_modules", "paperlint", "venues");
  const skillVenues = join(
    both,
    ".claude",
    "skills",
    "submit-paper",
    "references",
    "venues",
  );
  for (const d of [pkgVenues, skillVenues]) mkdirSync(d, { recursive: true });
  writeFileSync(
    join(both, "node_modules", "paperlint", "package.json"),
    JSON.stringify({
      name: "paperlint",
      version: "0.0.0",
      exports: { "./venues/*": "./venues/*" },
    }),
  );
  writeFileSync(join(pkgVenues, "paper-guards.tex"), "% from package\n");
  writeFileSync(join(skillVenues, "paper-guards.tex"), "% from skill dir\n");
  const race = run(["--print-venues"], {
    cwd: both,
    env: { ...process.env, CLAUDE_PROJECT_DIR: both },
  });
  assert.equal(
    race.status,
    0,
    `both candidates are in place ⇒ resolution must succeed:\n${race.stderr}`,
  );
  assert.equal(
    race.stdout.trim(),
    pkgVenues,
    "with both candidates present, the PACKAGE wins, not the skill directory",
  );
}

// ── THE SAME LADDER IN THE PAPER's build.sh, AND WHY THE ASSERTION DIFFERS ───
//
// Before 2026-09-12 the paper's build script held a HARDCODED
// `export TEXINPUTS="$ROOT/.claude/skills/submit-paper/references/venues:"` — an address inside
// the skills directory that, after their move into the package, points into a void, and again
// SILENTLY: LaTeX's reaction to a missing \input is silence, not an error.
//
// The `--print-venues` trick can't be repeated here: build.sh has no mode that prints the
// decision without running pdflatex, and adding one just for the test means reshaping the
// paper's build script around the test. So the assertion is STRUCTURAL, and it deliberately
// anchors on the EXECUTABLE line, not on a substring anywhere: the file quotes the old path in a
// comment explaining the fix, and a search for "is this string present" would have caught the
// explanation instead of the defect.
//
// 🔴 THE SUBJECT OF THIS CHECK IS SOMEONE ELSE'S FILE, AND THAT SHAPES ITS WHOLE FORM. Before the
// move into the package, this block read ONE hardcoded path into the first consumer's private
// corpus. In the package no such path exists or can exist, so the property was pulled out into a
// pure function and is proven TWICE, per the "both halves" rule:
//
//   1. on FIXTURES — `build-clean.sh` must pass, `build-defect.sh` must fail. This is the only
//      half that works in a checkout of the package itself, where there are no papers at all.
//      Without it, the check in the package would be vacuous and would print a green zero;
//   2. on the consumer's REAL papers — via the `papers` carrier, not a path in code. There can be
//      many consumers, each names the directory differently, and that carrier exists exactly for
//      this.
//
// The counter below is printed ALWAYS and grows together with the verdict, not before it: "0
// consumer scripts" is an honest result (in a checkout of the package itself it should be zero),
// whereas a silently-produced "0" would be indistinguishable from a verified corpus.
{
  const HERE = dirname(fileURLToPath(import.meta.url));

  /** The property of a paper's build script. A pure function — so it can also be BROKEN. */
  const assertLadder = (build, where) => {
    assert.doesNotMatch(
      build,
      /^\s*export\s+TEXINPUTS="\$ROOT\/\.claude\//m,
      `${where}: is assigning TEXINPUTS the hardcoded skills-directory path again`,
    );
    assert.match(
      build,
      /^\s*export\s+TEXINPUTS="\$VENUES_DIR:"/m,
      `${where}: must set TEXINPUTS from the resolved VENUES_DIR`,
    );
    assert.match(
      build,
      /require\.resolve\("paperlint\/venues\/paper-guards\.tex"\)/,
      `${where}: the ladder's first rung (the package) must remain`,
    );
    assert.match(
      build,
      /^\s*kpsewhich paper-guards\.tex/m,
      `${where}: after setting TEXINPUTS, must CONFIRM that LaTeX can see the file`,
    );
  };

  // ── First half: fixtures. Both sides, otherwise "silent" is indistinguishable from "dead."
  const fx = join(HERE, "..", "..", "fixtures", "render-paper");
  assertLadder(
    readFileSync(join(fx, "build-clean.sh"), "utf8"),
    "fixture build-clean.sh",
  );
  assert.throws(
    () =>
      assertLadder(
        readFileSync(join(fx, "build-defect.sh"), "utf8"),
        "fixture build-defect.sh",
      ),
    /TEXINPUTS/,
    "the defective fixture must fail the check — otherwise the check isn't checking anything",
  );

  // ── Second half: the consumer's real papers, addressed via the `papers` carrier.
  // `papersRoot()` THROWS when the directory doesn't exist; in a checkout of the package itself
  // it doesn't, and that's not an error, it's the absence of a consumer. Catch exactly that case
  // and say so out loud.
  const root = (() => {
    try {
      return papersRoot(settingsOf(consumerRoot()), consumerRoot());
    } catch {
      return null;
    }
  })();

  let checked = 0;
  if (root) {
    const base = join(consumerRoot(), root);
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const script = join(base, entry.name, "build.sh");
      if (!existsSync(script)) continue;
      // The count grows TOGETHER WITH the verdict, not ahead of it.
      assertLadder(
        readFileSync(script, "utf8"),
        `${root}/${entry.name}/build.sh`,
      );
      checked += 1;
    }
  }

  console.log(
    `  build.sh ladder: 2 fixture(s) + ${checked} consumer script(s)` +
      (root === null
        ? " (no papers root on disk — package checkout)"
        : ` under ${root}/`),
  );
}
