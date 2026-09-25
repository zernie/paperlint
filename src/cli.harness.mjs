/**
 * Both halves for the `research-paper-pipeline lint` utility, and separately — failures, each
 * of which must be EXPLAINABLE, not just nonzero.
 *
 * 🔴 Two of the defects checked here the utility already had, and both were found by the
 * FIRST run, not by reading:
 *   1. `rpp --help` used to answer "unknown command `--help`" — argv[0] unconditionally became
 *      the command;
 *   2. on an empty set ESLint THROWS `NoFilesFoundError`, and the guard against a false green
 *      zero never lived long enough to reach its own check: instead of a message, a stack trace
 *      leaked out of the depths of eslint-helpers.
 * Both are pinned down by the assertions below so there is no going back.
 */
import assert from "node:assert/strict";
import { recordCheck } from "vigiles";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  realpathSync,
  symlinkSync,
  readdirSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  OLD_PAPERS_DIR_FIELD,
  PAPERS_DIR_FIELD,
} from "../lib/paper-config.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const {
  run,
  parseArgs,
  buildConfig,
  nextSteps,
  findConfig,
  findDeclaration,
  toPaths,
  runHook,
} = await import(join(HERE, "cli.ts"));
const {
  init,
  choosePapers,
  offerWorkflow,
  syncRppJson,
  missingPrograms,
  WORKFLOW_PATH,
} = await import(join(HERE, "init.ts"));
const { PROGRAMS } = await import(join(HERE, "doctor.ts"));

let n = 0;
// Counted by vigiles too: `init` now loads `vigiles/claude-code` for its merge, and a harness that
// loads vigiles without recording a check is reported as having verified nothing.
const check = (label, cond) => {
  assert.ok(cond, label);
  recordCheck(label);
  n++;
};

/** Runs the utility with output captured — quieter and faster than spawning a process. */
async function cli(args, cwd) {
  // 🔴 THE STREAMS ARE SPLIT, AND THAT IS LOAD-BEARING. As long as the harness dumped log and
  // err into one array, it physically could not see that the `config: …` line was leaking into
  // stdout BEFORE the JSON and breaking any consumer's parser. The defect was not found by a
  // test but by trying to hook a real action to this output — i.e. the test was blind to
  // exactly what it was supposed to catch.
  // `out` stays a merged string for text assertions; `stdout` is what actually goes down a pipe.
  const stdout = [];
  const stderr = [];
  const prev = process.cwd();
  if (cwd) process.chdir(cwd);
  try {
    const code = await run(args, {
      log: (...a) => stdout.push(a.join(" ")),
      err: (...a) => stderr.push(a.join(" ")),
    });
    return {
      code,
      out: [...stdout, ...stderr].join("\n"),
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
    };
  } catch (e) {
    // 🔴 A LEAKED EXCEPTION IS A PROPERTY THAT MUST BE ASSERTED, NOT CAUGHT BY LETTING THE
    // HARNESS CRASH. The mutation that removes the catch around ESLint used to bring the
    // harness down with a stack trace, and the driver — under its own strict rule "killed only
    // by ITS OWN assertion" — refused to count that as a kill and printed "survived". I.e. the
    // real defect looked like a weak test.
    return {
      code: 99,
      out: `THREW: ${e?.message ?? e}`,
      stdout: "",
      stderr: `THREW: ${e?.message ?? e}`,
    };
  } finally {
    process.chdir(prev);
  }
}

// ── argument parsing ───────────────────────────────────────────────────────────────────
check(
  "`--help` as the first argument — is a FLAG, not a command",
  parseArgs(["--help"]).help === true,
);
check(
  "and a command is not invented in the process",
  parseArgs(["--help"]).cmd === null,
);
check(
  "the path and config are parsed",
  (() => {
    const a = parseArgs(["lint", "papers", "--config", "o.json", "--json"]);
    return (
      a.cmd === "lint" &&
      a.paths[0] === "papers" &&
      a.config === "o.json" &&
      a.json === true
    );
  })(),
);
check(
  "the default warning threshold is NEGATIVE — advice does not fail the run",
  parseArgs(["lint"]).maxWarnings === -1,
);
check(
  "and it is parsed when named explicitly",
  parseArgs(["lint", "--max-warnings", "0"]).maxWarnings === 0,
);
check(
  "the old `--options` spelling keeps working — a flag in someone else's CI is not ours to break",
  parseArgs(["lint", "--options", "o.json"]).config === "o.json",
);
check(
  "the papers directory as a string and as a list normalize the same way",
  toPaths("papers")[0] === "papers" &&
    toPaths(["a", "b"]).length === 2 &&
    toPaths(undefined).length === 0 &&
    toPaths("  ").length === 0,
);

// ── config is assembled, and consumer data gets through ────────────────────────────────────
{
  const cfg = buildConfig(
    { typographyDebt: { x: { sectionSign: 3 } }, authorListCommand: "run-me" },
    null,
  );
  // Blocks with `files` — the global `ignores` block below is not a rule block.
  const ruleBlocks = (c) => c.filter((b) => Array.isArray(b.files));
  check(
    "without a LaTeX language the config still gets built — a corpus with no .tex is not a reason to refuse",
    Array.isArray(cfg) && ruleBlocks(cfg).length === 3,
  );
  check(
    "with a LaTeX language a fourth block is added",
    ruleBlocks(buildConfig({}, {})).length === 4,
  );
  check(
    "🔴 the project's paper TEMPLATE directory is ignored — flat config does not skip dot-directories",
    cfg.some(
      (b) =>
        Object.keys(b).length === 1 &&
        Array.isArray(b.ignores) &&
        b.ignores.includes("**/.template/"),
    ),
  );
  const status = ruleBlocks(cfg).find((c) =>
    c.files.some((f) => f.includes("PIPELINE-STATUS")),
  );
  check(
    "the command from options gets through to the rule",
    status.rules["paper/author-list"][1].command === "run-me",
  );
}

// ── failures must be EXPLAINABLE ─────────────────────────────────────────────────────────
{
  const r = await cli(["--help"]);
  check(
    "`--help` prints usage and exits zero",
    r.code === 0 && /npx rpp lint/.test(r.out),
  );
}
// ── ONE DECLARATION, READ BY THE SAME THING THAT WRITES IT ─────────────────────────────
//
// 🔴 WITHOUT THIS BLOCK THE REWRITTEN `init` WOULD PRODUCE A BROKEN INSTALL. It writes one
// declaration — into `package.json`, the file the hooks know how to read (a hook does not
// import code and cannot walk up the tree; it can only read a path it is able to name). The
// utility, though, read ONLY `rpp.json`, so right after `rpp init` its `lint` would say
// "nothing to lint". I.e. the install command and the check command would be looking at
// different files — exactly the defect it exists to close, just from the other side.
{
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-carrier-")));
  try {
    const paper = join(root, "papers", "p1");
    mkdirSync(join(paper, "versions"), { recursive: true });
    writeFileSync(join(paper, "versions", "s.tex"), "abcd");
    writeFileSync(
      join(paper, "versions", "2026-07-22-submitted.pdf"),
      "x".repeat(100),
    );
    writeFileSync(join(paper, "paper.md"), "# Intro\n\nRQ1: does it hold?\n");
    writeFileSync(
      join(paper, "PIPELINE-STATUS.md"),
      `---\nstages:\n  - stage: submitted\n    date: 2026-07-22\n    pdf: versions/2026-07-22-submitted.pdf\n    bytes: 100\n    source: versions/s.tex\n    sourceBytes: 4\nresearchQuestion: "does it hold?"\n---\n# S\n\n| id | note |\n|---|---|\n| cites | bib-authors run |\n`,
    );
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify(
        {
          name: "c",
          version: "1.0.0",
          "research-paper-pipeline": { [PAPERS_DIR_FIELD]: "papers" },
        },
        null,
        2,
      ),
    );

    const r = await cli(["lint"], root);
    check(
      "🔴 THE UTILITY READS THE DECLARATION FROM package.json — otherwise `rpp init` sets up something `rpp lint` cannot see",
      r.code === 0 && /no findings/.test(r.out),
    );
    check(
      "and NAMES the carrier out loud — swapping settings is never silent",
      /config: package\.json/.test(r.out),
    );
    check(
      "package.json carries no deprecation notice — it is not the one that is deprecated",
      !/is deprecated/.test(r.out),
    );

    // The key is present, the papers-directory field inside it is not: this is not an "empty config" but an
    // unfinished one, and the failure must name the EXACT shape that needs adding.
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify(
        { name: "c", version: "1.0.0", "research-paper-pipeline": {} },
        null,
        2,
      ),
    );
    const noPapers = await cli(["lint"], root);
    check(
      `a key with no \`${PAPERS_DIR_FIELD}\` — a failure, and the shape is shown INSIDE package.json`,
      noPapers.code === 2 &&
        noPapers.out.includes(`must declare \`${PAPERS_DIR_FIELD}\``) &&
        noPapers.out.includes(
          `"research-paper-pipeline": { "${PAPERS_DIR_FIELD}": "papers" }`,
        ),
    );

    // The field's OLD name is refused with one clear sentence, not read as a fallback. The
    // new name sits beside it here on purpose: even then the leftover old name is an error.
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "c",
        version: "1.0.0",
        "research-paper-pipeline": {
          [OLD_PAPERS_DIR_FIELD]: "papers",
          [PAPERS_DIR_FIELD]: "papers",
        },
      }),
    );
    const oldName = await cli(["lint"], root);
    check(
      `the old field name "${OLD_PAPERS_DIR_FIELD}" fails with a message that names the new one`,
      oldName.code === 2 &&
        oldName.out.includes(
          `"${OLD_PAPERS_DIR_FIELD}" was renamed to "${PAPERS_DIR_FIELD}" in package.json → "research-paper-pipeline"`,
        ),
    );
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "c",
        version: "1.0.0",
        "research-paper-pipeline": { [OLD_PAPERS_DIR_FIELD]: "papers" },
      }),
    );
    check(
      "the old field name alone fails the same way — it is never used as the papers directory",
      (await cli(["lint"], root)).code === 2,
    );

    // 🔴 A package.json WITHOUT the key does not stop the walk upward. Otherwise the search
    // would end at the first project going up the tree — and every project has a package.json —
    // and would never find anything, ever.
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "c", version: "1.0.0" }),
    );
    writeFileSync(
      join(root, "rpp.json"),
      JSON.stringify({ [PAPERS_DIR_FIELD]: "papers" }),
    );
    const viaRpp = await cli(["lint"], root);
    check(
      "a keyless package.json does not intercept the search — rpp.json is still found",
      viaRpp.code === 0 && /config: rpp\.json/.test(viaRpp.out),
    );
    check(
      "🔴 but a deprecated carrier is NAMED, not just silently read",
      /rpp\.json is deprecated/.test(viaRpp.out) &&
        /the hooks read only that file/.test(viaRpp.out),
    );

    // Both carriers side by side: the one everything ELSE reads wins.
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "c",
        version: "1.0.0",
        "research-paper-pipeline": { [PAPERS_DIR_FIELD]: "papers" },
      }),
    );
    check(
      'with both carriers present package.json is chosen — that is what "one declaration" means',
      findDeclaration(root)?.kind === "package.json" &&
        findDeclaration(root)?.path === join(root, "package.json"),
    );
    check(
      'and findConfig still answers the question "which file holds the settings"',
      findConfig(root) === join(root, "package.json"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── `init` — THREE ACTIONS INSTEAD OF NINE ────────────────────────────────────────────────
//
// 🔴 THE DEFECT THIS COMMAND WAS REWRITTEN FOR (issue #33, measured 09-18): init wrote
// `rpp.json` with a GUESSED `"papers": "papers"` and never touched `package.json` — while the
// three hooks read the papers directory from exactly there. A consumer who did everything by
// the book got a `paper-edit-guard` guarding a directory that did not exist; from outside that
// is indistinguishable from a working guard, because silence is its success state.
//
// ⚠️ Questions here are NOT ASKED blind: `interactive` is passed explicitly, never read from
// stdin. A harness stuck at an input prompt is not a red test, it is the absence of any answer
// at all.
{
  const workRoot = realpathSync(mkdtempSync(join(tmpdir(), "rpp-init-")));
  const project = (
    name,
    { pkg = { name: "consumer", version: "1.0.0" }, papers = [] } = {},
  ) => {
    const dir = join(workRoot, name);
    mkdirSync(dir, { recursive: true });
    for (const rel of papers) {
      mkdirSync(join(dir, rel, "p1"), { recursive: true });
      writeFileSync(
        join(dir, rel, "p1", "paper.tex"),
        "\\documentclass{article}\n",
      );
    }
    if (pkg)
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify(pkg, null, 2) + "\n",
      );
    return dir;
  };
  const say = () => {
    const lines = [];
    return {
      lines,
      log: (...a) => lines.push(a.join(" ")),
      text: () => lines.join("\n"),
    };
  };
  const declared = (dir) =>
    JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))[
      "research-paper-pipeline"
    ];
  // No check should depend on what is installed ON THIS MACHINE: `command -v` is faked,
  // otherwise "no external programs" would read as a finding about init.
  const haveAll = () => ({ status: 0 });
  const haveNone = () => ({ status: 1 });

  try {
    // ── 1. THE PAPERS DIRECTORY IS MEASURED, NOT GUESSED ────────────────────────────
    {
      const dir = project("detect", { papers: ["writing/drafts"] });
      const out = say();
      const code = await init(dir, {
        log: out.log,
        err: out.log,
        interactive: false,
        run: haveAll,
      });
      check(
        "🔴 THE DECLARATION SHOWS UP IN package.json — the file the hooks read",
        declared(dir) !== undefined &&
          typeof declared(dir)[PAPERS_DIR_FIELD] === "string",
      );
      check(
        "🔴 and its value is MEASURED, not taken from the `papers` default",
        declared(dir)[PAPERS_DIR_FIELD] === "writing/drafts",
      );
      check(
        "and it says HOW it was measured — otherwise a guess reads as a fact",
        /measured: its subdirectories carry/.test(out.text()),
      );
      check(
        "🔴 `rpp.json` IS NO LONGER CREATED — a second declaration is what doctor exists to catch",
        !existsSync(join(dir, "rpp.json")),
      );
      check(
        "init ends with doctor's report: the install vouches for its OWN state",
        /rpp doctor — what is wired/.test(out.text()),
      );
      check(
        "and exits zero on a consistent install",
        code === 0 && /the same directory/.test(out.text()),
      );
    }

    // ── 2. A GUESS IS CALLED A GUESS ───────────────────────────────────────────────
    {
      const dir = project("empty");
      const out = say();
      const code = await init(dir, {
        log: out.log,
        err: out.log,
        interactive: false,
        run: haveAll,
      });
      check(
        "nothing to measure — the documented default is taken",
        declared(dir)[PAPERS_DIR_FIELD] === "papers",
      );
      check(
        "🔴 and it is MARKED as a guess, not presented as a measurement",
        /A GUESS/.test(out.text()) &&
          /Nothing here looks like a papers directory/.test(out.text()),
      );
      check(
        "🔴 no directory ⇒ doctor goes red, and init returns ITS verdict, not its own success",
        code === 2 && /the install is NOT finished/.test(out.text()),
      );
    }

    // ── 3. SOMEONE ELSE'S VALUE DOES NOT GET OVERWRITTEN ─────────────────────────────
    {
      const dir = project("mine", {
        pkg: {
          name: "c",
          version: "1.0.0",
          "research-paper-pipeline": { [PAPERS_DIR_FIELD]: "mine" },
        },
        papers: ["writing"],
      });
      const before = readFileSync(join(dir, "package.json"), "utf8");
      const out = say();
      await init(dir, {
        log: out.log,
        err: out.log,
        interactive: false,
        run: haveAll,
      });
      check(
        "🔴 an already-declared value stays intact byte for byte — silently replacing a setting is worse than doing nothing",
        readFileSync(join(dir, "package.json"), "utf8") === before,
      );
      check(
        "and it says so out loud, rather than skipping it",
        new RegExp(
          `already declares ${PAPERS_DIR_FIELD} = "mine" — kept, nothing overwritten`,
        ).test(out.text()),
      );
    }

    // ── 4. NOWHERE TO WRITE — A FAILURE WITH A REMEDY ─────────────────────────────
    {
      const dir = project("nopkg", { pkg: null, papers: ["writing"] });
      const out = say();
      const code = await init(dir, {
        log: out.log,
        err: out.log,
        interactive: false,
        run: haveAll,
      });
      check(
        "without package.json init FAILS and carries a remedy, not just a diagnosis",
        code === 2 &&
          /npm init -y/.test(out.text()) &&
          /nowhere to put the declaration/.test(out.text()),
      );
      check(
        "and creates nothing in its place",
        !existsSync(join(dir, "package.json")),
      );
    }

    // ── 5. ONLY WHAT CANNOT BE GUESSED IS ASKED, AND ONLY OF A HUMAN ─────────────────
    {
      const dir = project("ci", { papers: ["writing"] });
      const out = say();
      await init(dir, {
        log: out.log,
        err: out.log,
        interactive: false,
        run: haveAll,
      });
      check(
        "🔴 not a terminal — the question is NOT asked, and the default taken is NAMED",
        /stdin is not a terminal, so nothing was asked. Default taken: NO file written/.test(
          out.text(),
        ),
      );
      check(
        "and the safe default is the absence of a file",
        !existsSync(join(dir, WORKFLOW_PATH)),
      );
      check(
        "and the CI step is still printed — it just gets pasted in by hand",
        /uses: zernie\/research-paper-pipeline@/.test(out.text()) &&
          /paths: writing/.test(out.text()),
      );
    }
    {
      const dir = project("ci-yes", { papers: ["writing"] });
      const asked = [];
      const wf = await offerWorkflow(dir, "writing", {
        interactive: true,
        ask: async (q) => {
          asked.push(q);
          return "y";
        },
      });
      check(
        "saying yes WRITES the workflow",
        wf === "written" && existsSync(join(dir, WORKFLOW_PATH)),
      );
      check(
        "and the workflow carries THE directory that was actually discussed",
        /paths: writing/.test(readFileSync(join(dir, WORKFLOW_PATH), "utf8")),
      );
      check("the question is asked exactly once", asked.length === 1);
      const again = await offerWorkflow(dir, "writing", {
        interactive: true,
        ask: async () => "y",
      });
      check(
        "an existing workflow is neither overwritten nor asked about again",
        again === "kept",
      );
    }
    {
      const dir = project("ci-no", { papers: ["writing"] });
      const no = await offerWorkflow(dir, "writing", {
        interactive: true,
        ask: async () => "",
      });
      check(
        "an empty answer is a NO, and no file appears",
        no === "declined" && !existsSync(join(dir, WORKFLOW_PATH)),
      );
      // 🔴 Measured 09-18 on a real pseudo-terminal: `readline.question()` REJECTS with
      // `AbortError: Aborted with Ctrl+D`, and this exception used to escape AFTER the
      // declaration had already been written — i.e. the install both succeeded and looked like
      // a crash.
      // 🔴 THE `.catch` HERE IS LOAD-BEARING, NOT CAUTION. A leaked exception is a PROPERTY that
      // gets asserted; caught by letting the harness crash it reads to the battery's driver as
      // "the mutation survived", i.e. the real defect would look like a hole in the test.
      const aborted = await offerWorkflow(dir, "writing", {
        interactive: true,
        ask: async () => {
          throw new Error("Aborted with Ctrl+D");
        },
      }).catch((e) => `THREW: ${e?.message ?? e}`);
      check(
        "🔴 an interrupted question does NOT crash the command — it means the default",
        aborted === "declined",
      );
    }

    // ── 6. SEVERAL CANDIDATES — THE ONLY CASE WHERE A QUESTION IS ASKED ───────────────
    {
      const dir = project("many", { papers: ["alpha", "beta"] });
      const picked = await choosePapers(dir, {
        interactive: true,
        ask: async () => "2",
      });
      check(
        "🔴 the human's answer DECIDES, it does not just decorate the output",
        picked.how === "chosen" && picked.papers === picked.candidates[1],
      );
      const quiet = await choosePapers(dir, { interactive: false });
      check(
        "outside a terminal the first one is taken, and this is NAMED, not passed off as a choice",
        quiet.how === "not-asked" && quiet.papers === quiet.candidates[0],
      );
      const aborted = await choosePapers(dir, {
        interactive: true,
        ask: async () => {
          throw new Error("Aborted with Ctrl+D");
        },
      }).catch((e) => ({
        how: `THREW: ${e?.message ?? e}`,
        papers: null,
        candidates: [],
      }));
      check(
        "an interrupted choice is also a default, not a crash",
        aborted.how === "no-answer" && aborted.papers === aborted.candidates[0],
      );
    }

    // ── 7. EXTERNAL TOOLING IS REPORTED, NOT INSTALLED ───────────────────────────────
    //
    // npm's own rule, quoted in the analysis of husky: "The only valid use of install or
    // preinstall scripts is for compilation". An install that can silently fail to happen is
    // worse than an explicit step.
    {
      const dir = project("tools", { papers: ["writing"] });
      const out = say();
      await init(dir, {
        log: out.log,
        err: out.log,
        interactive: false,
        run: haveNone,
      });
      // 🔴 JUDGE ONLY init's OWN REPORT, BEFORE doctor's banner. The first version of these
      // three assertions looked at the WHOLE output — and doctor also prints `✗ pdflatex` and
      // the same install command. The mutation that stripped the remedy OUT of init stayed
      // green: the assertion found a line printed by a different command and reported coverage
      // that did not exist.
      const own = out.text().split("── rpp doctor")[0];
      check(
        "every absence is NAMED, and the count matches the names",
        /✗ 6 of 6 missing: pdflatex, bibtex/.test(own),
      );
      check(
        "🔴 and it carries the INSTALL COMMAND — a remedy, not just a diagnosis",
        /npx rpp toolchain/.test(own),
      );
      check(
        "and it says outright that nothing is installed on the user's behalf",
        /Nothing is installed for you/.test(own),
      );
      // One fact, one author: the consequence of each absence is printed by doctor, and printed
      // ONCE.
      check(
        "and init does NOT repeat doctor's table twenty lines above it",
        !/no PDF is produced/.test(own) &&
          /no PDF is produced/.test(out.text().split("── rpp doctor")[1] ?? ""),
      );
      check(
        "and asking a system that has everything gives zero absences",
        missingPrograms(haveAll).length === 0,
      );
      check(
        "and an empty system gives all of them — the counter counts the same thing it prints",
        missingPrograms(haveNone).length === PROGRAMS.length,
      );
    }

    // ── 7-bis. THE SKILLS: WHAT WAS LINKED, AND WHAT WAS LEFT ALONE, BY NAME ────────────
    //
    // The links themselves are `link-skills.harness.mjs`'s subject. Here: init REPORTS them, and
    // a name it refused to take does not turn a working install red. The state is handed in so
    // this block does not depend on a package being installed next to the temp project.
    {
      const dir = project("skills", { papers: ["writing"] });
      const out = say();
      const code = await init(dir, {
        log: out.log,
        err: out.log,
        interactive: false,
        run: haveAll,
        link: (root) => ({
          ok: true,
          home: join(root, ".claude", "skills"),
          example: "../../node_modules/research-paper-pipeline/skills/alpha",
          links: [
            { name: "alpha", status: "created" },
            { name: "beta", status: "present" },
            { name: "gamma", status: "foreign", reason: "a directory" },
          ],
        }),
      });
      const own = out.text().split("── rpp doctor")[0];
      check(
        "init counts what it did with the skills: created, already there, skipped",
        /3 shipped: 1 linked now, 1 already linked, 1 skipped/.test(own),
      );
      check(
        "🔴 a skipped skill is NAMED with what occupies it — not folded into a count",
        /gamma — a directory/.test(own) &&
          /NOT available in Claude Code/.test(own),
      );
      check(
        "and a name init refused to take does not fail the install",
        code === 0,
      );
    }

    // ── 8. `rpp.json` FOR THOSE WHO ALREADY HAVE ONE ──────────────────────────────────
    {
      const dir = project("legacy", { papers: ["writing"] });
      writeFileSync(
        join(dir, "rpp.json"),
        JSON.stringify({ minFindings: 5 }, null, 2) + "\n",
      );
      const out = say();
      await init(dir, {
        log: out.log,
        err: out.log,
        interactive: false,
        run: haveAll,
      });
      check(
        "an existing rpp.json gets the SAME value, rather than drifting silently",
        JSON.parse(readFileSync(join(dir, "rpp.json"), "utf8"))[
          PAPERS_DIR_FIELD
        ] === "writing",
      );
      check(
        "and is named deprecated",
        /rpp\.json was already here/.test(out.text()),
      );

      const own = join(workRoot, "legacy-own");
      mkdirSync(own, { recursive: true });
      writeFileSync(
        join(own, "package.json"),
        '{"name":"c","version":"1.0.0"}',
      );
      writeFileSync(join(own, "rpp.json"), `{"${PAPERS_DIR_FIELD}":"mine"}`);
      check(
        "and the papers-directory value it already declares stays byte for byte — this too is someone else's value",
        syncRppJson(own, "writing") === "kept" &&
          readFileSync(join(own, "rpp.json"), "utf8") ===
            `{"${PAPERS_DIR_FIELD}":"mine"}`,
      );
    }

    // ── 9. THE COMMAND IS WIRED TO `run`, NOT MERELY EXPORTED ────────────────────────
    {
      const dir = project("wired", { papers: ["writing"] });
      const r = await cli(["init", dir]);
      check(
        "`rpp init` reaches the implementation and declares the measured directory",
        declared(dir)[PAPERS_DIR_FIELD] === "writing" &&
          /rpp init — each decision/.test(r.out),
      );
    }
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
}
{
  const r = await cli(["frobnicate"]);
  check(
    "an unknown command is NAMED",
    r.code === 2 && /unknown command `frobnicate`/.test(r.out),
  );
}
{
  // A flag with no value. The defect was found by the compiler while porting to TypeScript:
  // `rest[++i]` past the last argument gives undefined, and `--config` with no value silently
  // meant "no config was set" — i.e. an autodiscovered file instead of the named one.
  const r = await cli(["lint", "--config"]);
  check(
    "a flag with no value — a FAILURE, not a silent default",
    r.code === 2 && /--config needs a value/.test(r.out),
  );
}
{
  // A "." default would give a green run over whatever happens to be lying around — the same
  // contract as the action, and the same reason. An empty directory with no config is exactly
  // that case.
  const bare = realpathSync(mkdtempSync(join(tmpdir(), "rpp-bare-")));
  try {
    const r = await cli(["lint"], bare);
    check(
      "`lint` with NO path AND no config refuses and names BOTH ways out",
      r.code === 2 &&
        /nothing to lint/.test(r.out) &&
        /rpp init/.test(r.out) &&
        /rpp lint papers/.test(r.out),
    );
  } finally {
    rmSync(bare, { recursive: true, force: true });
  }
}

// ── on live files: both halves ───────────────────────────────────────────────────────
{
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-cli-")));
  try {
    const paper = join(root, "papers", "p1");
    mkdirSync(join(paper, "versions"), { recursive: true });
    writeFileSync(
      join(paper, "versions", "2026-07-22-submitted.pdf"),
      "x".repeat(100),
    );
    const status = (bytes) =>
      `---\nstages:\n  - stage: submitted\n    date: 2026-07-22\n    pdf: versions/2026-07-22-submitted.pdf\n    bytes: ${bytes}\n    source: versions/s.tex\n    sourceBytes: 4\nresearchQuestion: "does it hold?"\n---\n# S\n\n| id | note |\n|---|---|\n| cites | bib-authors run |\n`;
    writeFileSync(join(paper, "versions", "s.tex"), "abcd");
    writeFileSync(join(paper, "paper.md"), "# Intro\n\nRQ1: does it hold?\n");

    writeFileSync(join(paper, "PIPELINE-STATUS.md"), status(100));
    const clean = await cli(["lint", "papers"], root);
    check(
      "on a clean corpus — zero and a legible report",
      clean.code === 0 && /no findings/.test(clean.out),
    );

    writeFileSync(join(paper, "PIPELINE-STATUS.md"), status(999));
    const dirty = await cli(["lint", "papers"], root);
    check("a planted byte mismatch — a finding and code 1", dirty.code === 1);
    check(
      "and the finding names BOTH numbers",
      /999/.test(dirty.out) && /100/.test(dirty.out),
    );

    const json = await cli(["lint", "papers", "--json"], root);
    check(
      "`--json` gives back parseable JSON",
      (() => {
        try {
          return Array.isArray(JSON.parse(json.stdout));
        } catch {
          return false;
        }
      })(),
    );

    // 🔴 The guard against a false green zero: ESLint throws on an empty set, and before the
    // fix a stack trace flew out here instead of an explanation.
    mkdirSync(join(root, "nothing"), { recursive: true });
    const empty = await cli(["lint", "nothing"], root);
    check(
      "the utility does NOT let an exception escape — a failure is declared by the exit code",
      empty.code !== 99,
    );
    check("an empty set — a FAILURE, not a green zero", empty.code === 1);
    check(
      "and the failure explains exactly what was not found",
      /nothing was linted/.test(empty.out) &&
        /not a clean report/.test(empty.out),
    );

    writeFileSync(join(root, "bad.json"), "{ not json");
    const bad = await cli(["lint", "papers", "--config", "bad.json"], root);
    check(
      "a broken config is NAMED, not a dropped stack trace",
      bad.code === 2 && /not valid JSON/.test(bad.out),
    );

    const noFile = await cli(["lint", "papers", "--config", "nope.json"], root);
    check(
      "a missing config is also named",
      noFile.code === 2 && /config file not found/.test(noFile.out),
    );

    // `check` stays an alias: someone else's workflow is not broken, but they are told what it
    // was replaced by.
    const alias = await cli(["check", "papers"], root);
    check(
      "`check` still works and prints what replaced it",
      alias.code === 1 && /`check` is now `lint`/.test(alias.out),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── THE CONFIG FINDS ITSELF, AND THE PAPERS DIRECTORY IS DECLARED IN IT ──────────────────
//
// 🔴 THE DEFECT THIS BLOCK EXISTS FOR: `rpp init` wrote `rpp.json`, and `rpp check` only read
// it via an explicit `--options`. I.e. the file the utility itself created had no effect on the
// run — and there was no way to find that out: zero typography debt looks exactly like a
// config that was never found.
{
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-cfg-")));
  try {
    const paper = join(root, "papers", "p1");
    mkdirSync(join(paper, "versions"), { recursive: true });
    writeFileSync(join(paper, "versions", "s.tex"), "abcd");
    writeFileSync(
      join(paper, "versions", "2026-07-22-submitted.pdf"),
      "x".repeat(100),
    );
    writeFileSync(join(paper, "paper.md"), "# Intro\n\nRQ1: does it hold?\n");
    const status = (bytes) =>
      `---\nstages:\n  - stage: submitted\n    date: 2026-07-22\n    pdf: versions/2026-07-22-submitted.pdf\n    bytes: ${bytes}\n    source: versions/s.tex\n    sourceBytes: 4\nresearchQuestion: "does it hold?"\n---\n# S\n\n| id | note |\n|---|---|\n| cites | bib-authors run |\n`;
    writeFileSync(join(paper, "PIPELINE-STATUS.md"), status(100));

    // findConfig — kept separate from the run so the failure is distinguishable
    writeFileSync(
      join(root, "rpp.json"),
      JSON.stringify({ [PAPERS_DIR_FIELD]: "papers" }),
    );
    check(
      "findConfig walks up from a subdirectory and finds the file at the root",
      findConfig(paper) === join(root, "rpp.json"),
    );
    // There can be no tautology here: a neighboring tree must NOT pick up our file. Asserting
    // `=== null` against a live filesystem is not safe — someone else's rpp.json may sit further
    // up the chain — so what is asserted is what is actually checkable: our config is not
    // visible from there.
    const sibling = realpathSync(mkdtempSync(join(tmpdir(), "rpp-other-")));
    check(
      "the config does NOT leak into a neighboring tree — the search goes up, not sideways",
      findConfig(sibling) !== join(root, "rpp.json"),
    );
    rmSync(sibling, { recursive: true, force: true });

    const found = await cli(["lint"], root);
    check(
      "the config is FOUND on its own: `lint` with no argument at all runs",
      found.code === 0 && /no findings/.test(found.out),
    );
    check(
      "and the found file is NAMED out loud — swapping settings silently is not acceptable",
      /config: rpp\.json/.test(found.out),
    );

    // 🔴 THE RESOLUTION DISCRIMINATOR. Run FROM the paper's directory: same config, and
    // `"papers": "papers"` resolved relative to the CURRENT directory would point at
    // `papers/p1/papers` — which does not exist, and the run would fail with "nothing was
    // linted" right where the whole corpus is present.
    const fromSub = await cli(["lint"], paper);
    check(
      "the path from the config resolves relative to the CONFIG'S DIRECTORY, not the current one",
      fromSub.code === 0 && /no findings/.test(fromSub.out),
    );

    // Consumer data from the found config actually reaches the rules, not just gets read.
    writeFileSync(join(paper, "PIPELINE-STATUS.md"), status(999));
    const dirty = await cli(["lint"], root);
    check(
      "a found config does not cancel findings — the mismatch is still caught",
      dirty.code === 1 && /999/.test(dirty.out),
    );
    writeFileSync(join(paper, "PIPELINE-STATUS.md"), status(100));

    // An argument OVERRIDES the config: one paper instead of the corpus, with no file edit.
    mkdirSync(join(root, "elsewhere"), { recursive: true });
    const override = await cli(["lint", "elsewhere"], root);
    check(
      "a command-line argument OVERRIDES the papers directory from the config",
      override.code === 1 &&
        /nothing was linted under elsewhere/.test(override.out),
    );

    // 🔴 THE PAPERS DIRECTORY — A REQUIRED FIELD. A config without it is not an "empty config" but an
    // unfinished one: silently falling back to "." means running the rules over the whole checkout.
    writeFileSync(join(root, "rpp.json"), JSON.stringify({ minFindings: 3 }));
    const noPapers = await cli(["lint"], root);
    check(
      "a config WITHOUT the papers-directory field — a failure, and the field is named by name",
      noPapers.code === 2 &&
        noPapers.out.includes(`must declare \`${PAPERS_DIR_FIELD}\``) &&
        /cannot guess/.test(noPapers.out),
    );
    check(
      'an empty string as the papers directory counts as absent, not as the directory ""',
      (
        await (async () => {
          writeFileSync(
            join(root, "rpp.json"),
            JSON.stringify({ [PAPERS_DIR_FIELD]: "" }),
          );
          return await cli(["lint"], root);
        })()
      ).code === 2,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── THE WARNING THRESHOLD ───────────────────────────────────────────────────────────────
//
// The action has a `max-warnings` input, and once the action stopped calling eslint directly,
// the threshold had to show up here too — otherwise it would have been lost SILENTLY: the run
// would stay green, and the consumer's setting would stop meaning anything.
{
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-warn-")));
  try {
    const paper = join(root, "papers", "p1");
    mkdirSync(join(paper, "versions"), { recursive: true });
    writeFileSync(join(paper, "versions", "s.tex"), "abcd");
    writeFileSync(
      join(paper, "versions", "2026-07-22-submitted.pdf"),
      "x".repeat(100),
    );
    // Three § signs — the `paper/typography` rule, warn level and only warn.
    writeFileSync(
      join(paper, "paper.md"),
      "# Intro\n\nRQ1: does it hold?\n\nSee \u00a7 5 and \u00a7 6 and \u00a7 7.\n",
    );
    writeFileSync(
      join(paper, "PIPELINE-STATUS.md"),
      `---\nstages:\n  - stage: submitted\n    date: 2026-07-22\n    pdf: versions/2026-07-22-submitted.pdf\n    bytes: 100\n    source: versions/s.tex\n    sourceBytes: 4\nresearchQuestion: "does it hold?"\n---\n# S\n\n| id | note |\n|---|---|\n| cites | bib-authors run |\n`,
    );
    writeFileSync(
      join(root, "rpp.json"),
      JSON.stringify({ [PAPERS_DIR_FIELD]: "papers" }),
    );

    const lax = await cli(["lint"], root);
    check(
      "a warning WITH NO threshold does not fail the run — otherwise a gate on advice would be muted entirely",
      lax.code === 0,
    );
    const strict = await cli(["lint", "--max-warnings", "0"], root);
    check(
      "and with a threshold of 0 it fails, and it's the very same warning",
      strict.code === 1,
    );
    check(
      'and the failure names the NUMBER and the THRESHOLD, not just "too many"',
      /1 warning\(s\) exceed the --max-warnings limit of 0/.test(strict.out),
    );
    const generous = await cli(["lint", "--max-warnings", "5"], root);
    check(
      "a threshold ABOVE the finding count stays quiet — the check is about the threshold, not about a warning existing",
      generous.code === 0,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── STRUCTURE GETS THROUGH TO THE COMMAND ──────────────────────────────────────────────
//
// `structure.mjs` is checked separately and in full (`structure.harness.mjs`). Here — exactly
// one fact that harness cannot know: that the module is WIRED IN. A correct module forgotten in
// `run()` gives zero findings and looks like a clean corpus.
{
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-wired-")));
  try {
    const paper = join(root, "papers", "orphan");
    mkdirSync(paper, { recursive: true });
    // The marker is present, the scorecard is not: NOT ONE pipeline rule runs over this directory.
    writeFileSync(join(paper, "paper.tex"), "\\documentclass{article}\n");
    writeFileSync(
      join(root, "rpp.json"),
      JSON.stringify({ [PAPERS_DIR_FIELD]: "papers" }),
    );

    const r = await cli(["lint"], root);
    check(
      "a directory with no scorecard is NOT a green zero: the command exits one",
      r.code === 1,
    );
    check(
      "and the finding is printed before the ESLint report, with its consequence",
      /missing `PIPELINE-STATUS\.md`/.test(r.out) && /is checked/.test(r.out),
    );
    check(
      'and it does NOT print "no findings" over something that was found',
      !/no findings/.test(r.out),
    );

    const j = await cli(["lint", "--json"], root);
    // 🔴 The defect the streams were split for: a `config: …` line in stdout before the array
    // breaks `| jq` for a consumer. Both halves — stdout is clean, and the line is NOT LOST.
    check(
      "`--json`: stdout is clean JSON, not one incidental line before it",
      (() => {
        try {
          JSON.parse(j.stdout);
          return true;
        } catch {
          return false;
        }
      })(),
    );
    check(
      "and the line about the found config is not lost — it went to stderr",
      /config: rpp\.json/.test(j.stderr) && !/config:/.test(j.stdout),
    );
    check(
      "`--json` gives back ONE array, where the missing-file finding sits next to the rule findings",
      (() => {
        try {
          const parsed = JSON.parse(j.stdout);
          return parsed.some((x) =>
            x.messages?.some((m) => m.ruleId === "structure/required-file"),
          );
        } catch {
          return false;
        }
      })(),
    );

    // The paired half RIGHT HERE: the scorecard is added — the check falls silent.
    writeFileSync(
      join(paper, "PIPELINE-STATUS.md"),
      "---\nstages: []\n---\n# S\n",
    );
    const after = await cli(["lint"], root);
    check(
      "the scorecard was added — the structural complaint is gone",
      !/missing `PIPELINE-STATUS\.md`/.test(after.out),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── THE PAPERS DO NOT HAVE TO LIVE UNDER THE CURRENT DIRECTORY (#48) ─────────────────────
//
// 🔴 ESLint IGNORES EVERY FILE OUTSIDE ITS `cwd`. With `cwd` left at the default, `rpp lint
// /some/other/papers` threw `all-matched-files-ignored` and leaked a raw stack trace, while the
// same tree linted fine from inside. The property is not "does not crash" — a catch would give
// that — but "the SAME findings wherever the command is typed", so the assertion compares the
// two runs finding by finding, ignoring only the path each run prints.
//
// Second half: the typography debt is keyed by the paper's path FROM THE CONFIG'S DIRECTORY
// (`"papers/p"`). Keys are computed against ESLint's `cwd`, so a run started from a
// subdirectory, or with `--config` from elsewhere, silently stopped honouring the debt.
{
  const findings = (r) => {
    try {
      return JSON.parse(r.stdout)
        .flatMap((x) => x.messages.map((m) => `${m.ruleId}: ${m.message}`))
        .sort();
    } catch {
      return [`UNPARSABLE: ${r.out}`];
    }
  };
  const tree = realpathSync(mkdtempSync(join(tmpdir(), "rpp-outside-")));
  const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), "rpp-elsewhere-")));
  try {
    const paper = join(tree, "papers", "p");
    mkdirSync(paper, { recursive: true });
    // Two findings of different kinds: a structural one (no scorecard) and a rule one (`§`).
    writeFileSync(join(paper, "paper.md"), "# T\n\nSee § 3 and §4.\n");

    const inside = await cli(["lint", "--json", "papers"], tree);
    const outside = await cli(
      ["lint", "--json", join(tree, "papers")],
      elsewhere,
    );
    check(
      "linting a tree OUTSIDE the current directory does not throw",
      outside.code !== 99 &&
        !/all-matched-files-ignored|THREW/.test(outside.out),
    );
    check(
      "the inside run is the reference: it has both a structure and a rule finding",
      findings(inside).some((f) => f.startsWith("structure/required-file")) &&
        findings(inside).some((f) => f.startsWith("paper/typography")),
    );
    check(
      "and from outside it reports the SAME findings with the SAME exit code",
      JSON.stringify(findings(outside)) === JSON.stringify(findings(inside)) &&
        outside.code === inside.code,
    );

    // The debt, keyed from the config's directory, covers the two `§`.
    writeFileSync(
      join(tree, "package.json"),
      JSON.stringify({
        name: "x",
        "research-paper-pipeline": {
          [PAPERS_DIR_FIELD]: "papers",
          typographyDebt: { "papers/p": { sectionSign: 2 } },
        },
      }),
    );
    const debtHonoured = (r) =>
      r.code !== 99 &&
      !findings(r).some((f) => f.startsWith("paper/typography"));
    check(
      "from the config's own directory the declared debt silences the `§` finding",
      debtHonoured(await cli(["lint", "--json"], tree)),
    );
    check(
      "from a SUBDIRECTORY (config found by walking up) the same debt still applies",
      debtHonoured(await cli(["lint", "--json"], join(tree, "papers"))),
    );
    check(
      "and with `--config` from an unrelated directory it applies too",
      debtHonoured(
        await cli(
          ["lint", "--json", "--config", join(tree, "package.json")],
          elsewhere,
        ),
      ),
    );
    // A RELATIVE `--config` stays relative in `configPath`, while every paper path is absolute:
    // without resolving it first, the common root of `.` and `/tmp/…` is `/`, the debt keys
    // no longer match, and the declared debt comes back as new warnings (Codex on #45).
    check(
      "and with a RELATIVE `--config package.json` it applies too",
      debtHonoured(
        await cli(["lint", "--json", "--config", "package.json"], tree),
      ),
    );
  } finally {
    rmSync(tree, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  }
}

// ── `rpp hook` — THE RUNTIME RESOLVES FROM THE PACKAGE, NOT FROM THE PROJECT ROOT ────────
//
// 🔴 The measurement that gave rise to this command: one tarball, two package managers.
//     npm:  node_modules/vigiles/dist/cli.js  EXISTS
//     pnpm: node_modules/vigiles/dist/cli.js  DOES NOT
// The old wiring addressed the runtime from the project root and did not resolve under pnpm,
// and `|| exit 2` on PreToolUse(Bash) turned that into a block on ANY command. The end-to-end
// half (both installs, real processes) lives in `test/e2e/install.mjs`; here — the verdicts.
{
  const calls = [];
  const fake = (code) => (bin, args, opts) => {
    calls.push({ bin, args, opts });
    return { status: code };
  };
  let said = "";
  const err = (...a) => {
    said += a.join(" ") + "\n";
  };

  said = "";
  check(
    "no name — a failure, and the right invocation is suggested",
    runHook(undefined, { err }) === 2 && /rpp hook paper-edit-guard/.test(said),
  );

  said = "";
  check(
    "an unknown hook is NAMED together with the path it was looked for at",
    runHook("no-such-hook", { err }) === 2 &&
      /unknown hook `no-such-hook`/.test(said) &&
      /no-such-hook\.hook\.mjs/.test(said),
  );

  // 🔴 THE MAIN ASSERTION. A runtime that cannot be found HAS NO RIGHT to return 2: on
  // PreToolUse that blocks any Bash command, including the one that would fix it. It must say
  // so LOUDLY and let it through. Silent degradation is worse than an explicit one, but blocking
  // everything is worse than both.
  said = "";
  calls.length = 0;
  const brokenResolve = () => {
    throw new Error("Cannot find module 'vigiles/dist/cli.js'");
  };
  const code = runHook("paper-edit-guard", {
    err,
    run: fake(0),
    resolve: brokenResolve,
  });
  check(
    "the runtime does not resolve — work is NOT blocked (code 0, not 2)",
    code === 0,
  );
  check(
    "and the complaint is LOUD: the hook is named, the effect is named, the remedy is named",
    /paper-edit-guard/.test(said) &&
      /is NOT running/.test(said) &&
      /Reinstall this package/.test(said),
  );
  check("and the runtime was NOT started in the process", calls.length === 0);

  // The hook's real verdict passes through — otherwise the guard stops being a guard.
  calls.length = 0;
  check(
    "the hook's verdict passes STRAIGHT THROUGH: 2 stays 2",
    runHook("paper-edit-guard", { err, run: fake(2) }) === 2,
  );
  check(
    "and EXACTLY the runtime with this hook's program is run",
    calls.length === 1 &&
      calls[0].args[1] === "hook-runtime" &&
      calls[0].args[2] === "run-program" &&
      /paper-edit-guard\.hook\.mjs$/.test(calls[0].args[3]),
  );
  check(
    "zero stays zero",
    runHook("paper-skills-nudge", { err, run: fake(0) }) === 0,
  );
}

// ── RUNNING THROUGH A SYMLINK — the only way a consumer ever calls the utility ───────
//
// 🔴 npm puts a SYMLINK in `node_modules/.bin/`. The first version compared `import.meta.url`
// against `file://${process.argv[1]}`: for a symlink those two paths are DIFFERENT, the
// condition is false, and the utility silently exited zero. A direct `node bin/rpp.mjs` worked
// fine, meanwhile — i.e. the defect was invisible in exactly the way it is normally checked.
{
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-link-")));
  try {
    const link = join(root, "rpp-shim");
    symlinkSync(join(HERE, "..", "bin", "rpp.mjs"), link);
    const paper = join(root, "papers", "p");
    mkdirSync(join(paper, "versions"), { recursive: true });
    writeFileSync(
      join(paper, "PIPELINE-STATUS.md"),
      "---\nstages:\n  - stage: submitted\n    date: 2026-07-22\n    pdf: versions/a.pdf\n    bytes: 1\n---\n# S\n",
    );
    const r = spawnSync(process.execPath, [link, "lint", "papers"], {
      cwd: root,
      encoding: "utf8",
    });
    const out = (r.stdout ?? "") + (r.stderr ?? "");
    check(
      "through a SYMLINK the utility works, rather than silently exiting zero",
      r.status === 1,
    );
    check("and prints findings", /paper\/stages/.test(out));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log(
  `✓ ${String(n)} assertions passed — rpp lint, one command instead of hand-rolled config`,
);

// ─────────────────────────────────────────────────────────────────────────────
// What is left after init is typed in THE SAME TERMINAL. The two `/plugin` lines are gone: the
// hooks are written into `.claude/settings.json` by init itself (hooks-settings.harness.mjs).

{
  const steps = nextSteps("papers");
  check(
    "🔴 no /plugin line is left — nothing is typed into another program any more",
    !steps.includes("/plugin"),
  );
  check("and asks for NO manual install", !/npm i -D vigiles/.test(steps));
  check(
    "it names the two commands that ARE left: new and lint",
    /npx rpp new <name>/.test(steps) && /npx rpp lint/.test(steps),
  );
}

// ── the mode decision: a human is at the other end only when EVERY signal says so ──────────
{
  const { interactivity } = await import(join(HERE, "init.ts"));
  const tty = { stdinTTY: true, stdoutTTY: true, env: {}, yes: false };
  check(
    "a terminal on stdin AND stdout, no CI, no --yes → interactive",
    interactivity(tty).interactive === true,
  );
  for (const [label, over, why] of [
    ["--yes", { yes: true }, "--yes was given"],
    ["CI set", { env: { CI: "true" } }, "CI is set"],
    ["stdin piped", { stdinTTY: false }, "stdin is not a terminal"],
    [
      "🔴 stdout piped — an agent reading the output would never see the question",
      { stdoutTTY: false },
      "stdout is not a terminal",
    ],
  ]) {
    const m = interactivity({ ...tty, ...over });
    check(
      `${label} → NOT interactive, and the reason is named`,
      m.interactive === false && m.why === why,
    );
  }
  check(
    "an empty CI variable is not CI",
    interactivity({ ...tty, env: { CI: "" } }).interactive === true,
  );
}

// ── the new flags parse, and none of them becomes the directory argument ─────────────────
{
  const a = parseArgs([
    "init",
    "--yes",
    "--no-hooks",
    "--paper",
    "demo",
    "--format",
    "md",
  ]);
  check(
    "init flags parse into fields, not into paths",
    a.yes &&
      a.noHooks &&
      a.paper === "demo" &&
      a.format === "md" &&
      a.paths.length === 0,
  );
  check("-y is --yes", parseArgs(["init", "-y"]).yes === true);
  check(
    "`--paper` with its value taken away is a refusal, not a default",
    parseArgs(["init", "--paper"]).missingValue === "--paper",
  );
  const r = await cli(["init", "--hooks=local"]);
  check(
    "🔴 --hooks=local is NOT implemented, and it is refused by name rather than read as a path",
    r.code === 2 && /--hooks=local is not implemented/.test(r.out),
  );
  const f = await cli(["init", "--format", "pdf"]);
  check(
    "an unknown --format is refused before anything is written",
    f.code === 2 && /--format must be one of tex, md/.test(f.out),
  );
}

// ── init wires the hooks, and a human can say no ─────────────────────────────────────────
{
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-init-hooks-")));
  const mk = (name) => {
    const dir = join(root, name);
    mkdirSync(join(dir, "papers", "p1"), { recursive: true });
    writeFileSync(join(dir, "papers", "p1", "paper.md"), "# P\n");
    writeFileSync(
      join(dir, "papers", "p1", "PIPELINE-STATUS.md"),
      "---\n---\n",
    );
    writeFileSync(
      join(dir, "package.json"),
      '{"name":"c","version":"1.0.0"}\n',
    );
    return dir;
  };
  const settings = (dir) => join(dir, ".claude", "settings.json");
  const quiet = { log: () => {}, err: () => {}, run: () => ({ status: 0 }) };
  try {
    {
      const dir = mk("default-yes");
      const lines = [];
      await init(dir, {
        ...quiet,
        log: (...a) => lines.push(a.join(" ")),
        interactive: false,
      });
      const text = lines.join("\n");
      check(
        "🔴 without a human the hooks default to YES — settings.json is written",
        existsSync(settings(dir)) &&
          /hook paper-edit-guard/.test(readFileSync(settings(dir), "utf8")),
      );
      check(
        "and the default names the flag that changes it",
        /default taken: YES — stdin is not a terminal, so nothing was asked\. `--no-hooks` skips this/.test(
          text,
        ),
      );
      check(
        "🔴 and says that the commands cannot run in a fresh clone before `npm install`",
        /in a fresh clone they cannot run until `npm install` has run there/.test(
          text,
        ),
      );
      check(
        "the /plugin lines are gone from init's output too",
        !/\/plugin (marketplace|install)/.test(text),
      );
    }
    {
      const dir = mk("no-hooks");
      await init(dir, { ...quiet, interactive: false, hooks: false });
      check("--no-hooks writes nothing", !existsSync(settings(dir)));
    }
    {
      const dir = mk("asked-no");
      const asked = [];
      await init(dir, {
        ...quiet,
        interactive: true,
        ask: async (q) => {
          asked.push(q);
          return /\[Y\/n\]/.test(q) ? "n" : "";
        },
      });
      check(
        "a human is asked [Y/n] for the hooks",
        asked.some((q) => /wire the paper hooks .*\[Y\/n\]/.test(q)),
      );
      check("and a no is respected", !existsSync(settings(dir)));
    }
    {
      const dir = mk("asked-enter");
      await init(dir, {
        ...quiet,
        interactive: true,
        ask: async () => "",
      });
      check(
        "an empty answer is the stated default, YES",
        existsSync(settings(dir)),
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── init offers a first paper only where there is none, and only to a human ─────────────
{
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-init-paper-")));
  const bare = (name) => {
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "package.json"),
      '{"name":"c","version":"1.0.0"}\n',
    );
    return dir;
  };
  const base = { err: () => {}, run: () => ({ status: 0 }), hooks: false };
  try {
    {
      const dir = bare("human");
      const asked = [];
      const made = [];
      await init(dir, {
        ...base,
        log: () => {},
        interactive: true,
        ask: async (q) => {
          asked.push(q);
          if (/create a first paper/.test(q)) return "first";
          if (/format:/.test(q)) return "md";
          return "";
        },
        createPaper: async (papersRoot, name, format) => {
          made.push({ papersRoot, name, format });
          return 0;
        },
      });
      check(
        "a human with no paper is offered one, and the answer and format reach `rpp new`'s routine",
        made.length === 1 &&
          made[0].name === "first" &&
          made[0].format === "md" &&
          made[0].papersRoot === join(dir, "papers"),
      );
    }
    {
      const dir = bare("agent");
      const made = [];
      const lines = [];
      await init(dir, {
        ...base,
        log: (...a) => lines.push(a.join(" ")),
        interactive: false,
        createPaper: async (...a) => (made.push(a), 0),
      });
      check(
        "🔴 without a human nothing is created, and the flag that would is named",
        made.length === 0 &&
          /`--paper <name>` creates one/.test(lines.join("\n")),
      );
    }
    {
      const dir = bare("flag");
      const made = [];
      await init(dir, {
        ...base,
        log: () => {},
        interactive: false,
        paper: "given",
        createPaper: async (papersRoot, name, format) => (
          made.push({ name, format }),
          0
        ),
      });
      check(
        "--paper creates it without a human, in the default format",
        made.length === 1 &&
          made[0].name === "given" &&
          made[0].format === "tex",
      );
    }
    {
      const dir = bare("has-one");
      mkdirSync(join(dir, "papers", "p1"), { recursive: true });
      writeFileSync(join(dir, "papers", "p1", "paper.md"), "# P\n");
      const asked = [];
      await init(dir, {
        ...base,
        log: () => {},
        interactive: true,
        ask: async (q) => (asked.push(q), ""),
        createPaper: async () => 0,
      });
      check(
        "a papers directory that already holds a paper is not offered another",
        !asked.some((q) => /create a first paper/.test(q)),
      );
    }
    {
      // Codex on #55: a DECLARED papersDir with no paper in it yet is kept by the declaration
      // step, and every later step must use the kept value, not the directory init guessed.
      const dir = bare("declared");
      writeFileSync(
        join(dir, "package.json"),
        `{"name":"c","version":"1.0.0","research-paper-pipeline":{"${PAPERS_DIR_FIELD}":"writing"}}\n`,
      );
      const made = [];
      await init(dir, {
        ...base,
        log: () => {},
        interactive: false,
        paper: "first",
        createPaper: async (papersRoot, name) => (
          made.push({ papersRoot, name }),
          0
        ),
      });
      check(
        "🔴 with papersDir already declared, --paper creates the paper IN the declared directory, not the guess",
        made.length === 1 && made[0].papersRoot === join(dir, "writing"),
      );
    }
    {
      // Codex on #55: an explicit --paper that is refused or whose lint fails must not end in
      // the doctor's exit code, which can be 0 — automation would read "done".
      // The doctor's own exit code is not injectable and is non-zero in a bare temp project, so
      // "non-zero" would pass on the old code too. The lint failure therefore returns a code the
      // doctor never produces (7), and the invalid name is compared against a baseline run.
      const baseline = await init(bare("baseline"), {
        ...base,
        log: () => {},
        interactive: false,
        paper: "fine",
        createPaper: async () => 0,
      });
      const failed = await init(bare("lint-fails"), {
        ...base,
        log: () => {},
        interactive: false,
        paper: "ok",
        createPaper: async () => 7,
      });
      check(
        "🔴 `init --paper <name>` whose lint fails exits with THAT code, not the doctor's",
        failed === 7,
      );
      const refused = await init(bare("refused"), {
        ...base,
        log: () => {},
        interactive: false,
        paper: "Bad",
        createPaper: async () => 0,
      });
      check(
        `🔴 \`init --paper <invalid name>\` exits 2 (the same project with a valid name exits ${String(baseline)})`,
        refused === 2,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── `rpp lint` does not sweep the project's paper TEMPLATE as a paper ────────────────────
{
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-template-")));
  try {
    writeFileSync(
      join(root, "package.json"),
      `{"research-paper-pipeline":{"${PAPERS_DIR_FIELD}":"papers"}}\n`,
    );
    mkdirSync(join(root, "papers", "p1"), { recursive: true });
    writeFileSync(join(root, "papers", "p1", "paper.md"), "# P\n");
    writeFileSync(
      join(root, "papers", "p1", "PIPELINE-STATUS.md"),
      "---\n---\n",
    );
    // A template that WOULD fail if linted: a stage whose pdf does not exist.
    mkdirSync(join(root, "papers", ".template"), { recursive: true });
    writeFileSync(
      join(root, "papers", ".template", "PIPELINE-STATUS.md"),
      "---\nstages:\n  - stage: submitted\n    date: 2026-07-22\n    pdf: versions/none.pdf\n    bytes: 1\n---\n",
    );
    const r = await cli(["lint"], root);
    check(
      "🔴 a defective <papers>/.template/ does not fail the run — it is not a paper",
      r.code === 0 && !/\.template/.test(r.out),
    );
    // The other half: the same file in a real paper folder IS linted and fails.
    mkdirSync(join(root, "papers", "p2"), { recursive: true });
    writeFileSync(
      join(root, "papers", "p2", "PIPELINE-STATUS.md"),
      readFileSync(join(root, "papers", ".template", "PIPELINE-STATUS.md")),
    );
    writeFileSync(join(root, "papers", "p2", "paper.md"), "# P\n");
    const r2 = await cli(["lint"], root);
    check(
      "and the same scorecard in a real paper folder fails — the ignore is scoped, not a blind spot",
      r2.code === 1 && /paper\/stages/.test(r2.out),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── `rpp new` through the CLI: the papers directory comes from the one declaration ────────
{
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-new-cli-")));
  try {
    const none = await cli(["new", "demo"], root);
    check(
      "without a declaration there is nowhere to put a paper — refused, with the remedy",
      none.code === 2 && /Run `npx rpp init` first/.test(none.out),
    );
    writeFileSync(
      join(root, "package.json"),
      `{"research-paper-pipeline":{"${PAPERS_DIR_FIELD}":"writing"}}\n`,
    );
    const r = await cli(["new", "demo"], root);
    check(
      "🔴 `rpp new demo` creates writing/demo/ and its lint is the verdict — exit 0, no findings",
      r.code === 0 &&
        existsSync(join(root, "writing", "demo", "PIPELINE-STATUS.md")) &&
        existsSync(join(root, "writing", "demo", "paper.tex")) &&
        /no findings/.test(r.out),
    );
    const again = await cli(["new", "demo", "--format", "md"], root);
    check(
      "a second run on the same folder adds nothing — the tex source already stands",
      again.code === 0 &&
        !existsSync(join(root, "writing", "demo", "paper.md")) &&
        /kept — never overwritten/.test(again.out),
    );
    const bad = await cli(["new", "Demo"], root);
    check("an invalid name is refused with exit 2", bad.code === 2);
    // Compared by exact name, not existsSync: on a case-insensitive filesystem (macOS default)
    // `writing/Demo` "exists" because `writing/demo` does, so existsSync cannot tell them apart.
    check(
      "a refused name creates nothing — writing/ still holds only demo",
      JSON.stringify(readdirSync(join(root, "writing")).sort()) ===
        JSON.stringify(["demo"]),
    );
    const two = await cli(["new", "a", "b"], root);
    check("one paper at a time", two.code === 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── the settings are parsed at the boundary: unknown keys, `rules` blocks ─────────────────
{
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-settings-")));
  try {
    const dir = join(root, "papers", "p");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "PIPELINE-STATUS.md"),
      "# Status\n\nStage: draft\n",
    );
    writeFileSync(
      join(dir, "paper.tex"),
      "\\documentclass{article}\n\\begin{document}x\\end{document}\n",
    );
    const settings = (rpp) =>
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          name: "c",
          version: "1.0.0",
          "research-paper-pipeline": { [PAPERS_DIR_FIELD]: "papers", ...rpp },
        }),
      );
    const balanceOn = (files) => ({
      rules: [{ files, rules: { "pdf/last-page-balance": "error" } }],
    });

    settings({ typographyDept: {} });
    const typo = await cli(["lint"], root);
    check(
      "🔴 an unknown key is REFUSED by name — a typo must not read as 'not set'",
      typo.code === 2 &&
        typo.out.includes(
          'package.json → "research-paper-pipeline": unknown key "typographyDept"',
        ),
    );
    settings({
      ledger: "x.jsonl",
      citeChecks: "c",
      timezone: "UTC",
      contactEmail: "a@b.c",
      triggerCases: "t.mjs",
      scripts: "s",
    });
    check(
      "the keys the skill scripts read are known keys, not typos",
      (await cli(["lint"], root)).code !== 2,
    );
    settings({ rules: { "pdf/last-page-balance": "error" } });
    check(
      "`rules` that is not a list is refused, naming the key",
      /\.rules must be a list of blocks/.test((await cli(["lint"], root)).out),
    );
    settings({
      rules: [{ files: ["papers/**"], rules: { "pdf/nope": "error" } }],
    });
    const unknownRule = await cli(["lint"], root);
    check(
      "a rule rpp does not ship is refused, naming the block and the rule",
      unknownRule.code === 2 &&
        unknownRule.out.includes(
          '.rules[0].rules: "pdf/nope" is not a rule rpp ships',
        ),
    );
    settings({
      rules: [
        { files: ["papers/**"], rules: { "pdf/last-page-balance": "fatal" } },
      ],
    });
    check(
      "a bad severity is refused, naming the rule",
      /rules\["pdf\/last-page-balance"\]: "fatal" is not a severity/.test(
        (await cli(["lint"], root)).out,
      ),
    );
    settings({
      rules: [{ files: ["papers/**"], plugins: {}, rules: {} }],
    });
    check(
      "a block key other than files/ignores/rules is refused",
      /rules\[0\]: unknown key "plugins"/.test((await cli(["lint"], root)).out),
    );

    settings(balanceOn(["papers/p/**"]));
    const on = await cli(["lint"], root);
    check(
      "🔴 an optional rule turned on by a `rules` block RUNS — here it asks for the build's facts",
      on.code === 1 &&
        /pdf\/last-page-balance/.test(on.out) &&
        /rpp build/.test(on.out),
    );
    const fromInside = await cli(["lint"], dir);
    check(
      "`files` is relative to the file holding the settings, not to where lint runs",
      fromInside.code === 1 && /pdf\/last-page-balance/.test(fromInside.out),
    );
    settings(balanceOn(["paperz/**"]));
    const silent = await cli(["lint"], root);
    check(
      "🔴 an optional rule turned on for a glob that reaches no paper.tex FAILS the run — not a green zero",
      silent.code === 1 &&
        silent.out.includes(
          'pdf/last-page-balance is turned on in "rules", but no linted paper.tex gets it',
        ),
    );
    settings({
      rules: [{ files: ["papers/**"], rules: { "paper/typography": "off" } }],
    });
    check(
      "a built-in rule's severity can be changed the same way",
      (await cli(["lint"], root)).code === 0,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log(
  `✓ ${String(n)} assertions in total, including init's hooks and rpp new`,
);
