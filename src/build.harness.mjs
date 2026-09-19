/**
 * Both halves for `build.mjs` — the module that decides WHAT a paper is built with.
 *
 * 🔴 THE MAIN THING PINNED DOWN HERE: "there is no script" is a FAILURE, not a skip. Exactly
 * this confusion cost the corpus a silent hole: the CI loop looked for
 * `repro/build-submission.sh`, the accepted paper had `build.sh`, and "couldn't find what to
 * build with" looked like "nothing to build" — a green run over a paper nobody checked.
 */
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  realpathSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const {
  BUILD_SCRIPTS,
  findBuildScript,
  interpreterFor,
  buildPaper,
  papersIn,
  formatResults,
  anyFailed,
  remedyFor,
} = await import(join(HERE, "build.ts"));

let n = 0;
const check = (label, cond) => {
  assert.ok(cond, label);
  n++;
};

const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-build-")));
const paper = (name, files) => {
  const dir = join(root, "papers", name);
  mkdirSync(dir, { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
};

try {
  const top = paper("top", {
    "PIPELINE-STATUS.md": "x",
    // 🔴 The trace is written NEXT TO THE SCRIPT, not into the current directory. The first
    // version did `touch RAN`, i.e. wrote into the harness's cwd — and the assertion "no trace
    // in the paper's directory" passed EVEN WHEN the script ran. The check was looking in the
    // wrong place; caught by an uncommitted `RAN` showing up at the repo root after a mutation run.
    "build.sh": '#!/usr/bin/env bash\ntouch "$(dirname "$0")/RAN"\n',
  });
  const nested = paper("nested", {
    "paper.tex": "x",
    "repro/build-submission.sh": "#!/usr/bin/env bash\nexit 0\n",
  });
  const both = paper("both", {
    "venue.json": "{}",
    "build.sh": "#!/usr/bin/env bash\nexit 0\n",
    "repro/build-submission.sh": "#!/usr/bin/env bash\nexit 0\n",
  });
  const bare = paper("bare", { "paper.md": "# x" });
  paper("not-a-paper", { "NOTES.md": "x" });
  // A hidden directory with a real marker: without it the mutation "treat hidden directories as
  // papers" survives, i.e. the check is absent exactly where it looks present.
  paper(".hidden-paper", { "PIPELINE-STATUS.md": "x" });

  // ── finding the script ────────────────────────────────────────────────────────────────
  check(
    "finds build.sh at the paper's root",
    findBuildScript(top)?.rel === "build.sh",
  );
  check(
    "finds repro/build-submission.sh — the SECOND convention, whose divergence started all this",
    findBuildScript(nested)?.rel === "repro/build-submission.sh",
  );
  check(
    "order matters: with both present, build.sh wins — it's what the author sees on opening the directory",
    findBuildScript(both)?.rel === "build.sh",
  );
  check("none at all — an honest null", findBuildScript(bare) === null);
  check(
    "the candidate list is DECLARED, not baked into one line",
    Array.isArray(BUILD_SCRIPTS) && BUILD_SCRIPTS.length >= 2,
  );

  // ── interpreter by extension, not by the executable bit ─────────────────────────────
  check("shell", interpreterFor("/x/build.sh")[0] === "bash");
  check("node", interpreterFor("/x/build.mjs")[0] === process.execPath);
  check("python", interpreterFor("/x/build.py")[0] === "python3");
  check(
    "an unknown extension — bash, not a failure: build scripts often have no extension at all",
    interpreterFor("/x/build")[0] === "bash",
  );

  // ── A FAILURE, NOT A SKIP ──────────────────────────────────────────────────────────────
  const noScript = buildPaper(bare, { cwd: root });
  check(
    "a paper with no script — status no-script",
    noScript.status === "no-script",
  );
  check(
    "🔴 and this COUNTS AS A FAILURE on equal footing with a failed build",
    anyFailed([noScript]) === true,
  );
  check(
    "the remedy names BOTH paths that were searched",
    /build\.sh/.test(remedyFor([noScript])) &&
      /repro\/build-submission\.sh/.test(remedyFor([noScript])),
  );
  check(
    "and says this is NOT \"nothing to build\" — otherwise it reads as normal",
    /NOT "nothing to build"/.test(remedyFor([noScript])),
  );
  check(
    "on full success there is NO remedy — an empty string, not a cheerful paragraph",
    remedyFor([{ dir: "d", status: "built", script: "build.sh" }]) === "",
  );

  // ── the script's exit code passes through ───────────────────────────────────────────
  const calls = [];
  const fake = (code) => (bin, args, opts) => {
    calls.push({ bin, args, opts });
    return { status: code };
  };
  check(
    "zero — built",
    buildPaper(top, { cwd: root, run: fake(0) }).status === "built",
  );
  check(
    "nonzero — failed, and the code is NAMED",
    (() => {
      const r = buildPaper(top, { cwd: root, run: fake(7) });
      return r.status === "failed" && r.code === 7;
    })(),
  );
  check(
    "and EXACTLY the script that was found is run, with the right interpreter",
    calls.at(-1).bin === "bash" &&
      /\/build\.sh$/.test(calls.at(-1).args.at(-1)),
  );
  check(
    "the script's output goes STRAIGHT THROUGH to the human (stdio inherit), not buffered",
    calls.at(-1).opts.stdio === "inherit",
  );

  // ── 🔴 --dry-run DOES NOT RUN ANYTHING. Checked by its EFFECT on disk, not the returned object
  //
  // The first version of this flag was parsed in the CLI and passed down here, where it DID NOT
  // EXIST: destructuring the options silently swallowed the unknown key, the build ran to
  // completion and overwrote the PDF in the working tree. An assertion over the returned object
  // would not have caught this — only the absence of the file the real script creates does.
  const dry = buildPaper(top, { cwd: root, dryRun: true });
  check(
    "--dry-run: status built and the dry flag",
    dry.status === "built" && dry.dry === true,
  );
  check(
    "--dry-run: the script is NAMED, otherwise an audit is useless",
    dry.script === "build.sh",
  );
  check(
    "🔴 --dry-run: the script was NOT RUN — no trace on disk of what it leaves behind",
    !existsSync(join(top, "RAN")),
  );
  check(
    "and the report shows it in words, not silently",
    /--dry-run/.test(formatResults([dry])),
  );

  // ── walking the corpus ────────────────────────────────────────────────────────────────
  const found = papersIn(join(root, "papers"))
    .map((d) => d.split("/").pop())
    .sort();
  check(
    "a directory with no markers does not count as a paper",
    !found.includes("not-a-paper"),
  );
  check(
    "and all four real ones do count",
    ["bare", "both", "nested", "top"].every((x) => found.includes(x)),
  );
  check(
    "a hidden directory does not count as a paper, even with a real marker inside",
    !found.includes(".hidden-paper"),
  );
  check(
    "a nonexistent root does not crash it",
    papersIn(join(root, "nope")).length === 0,
  );

  // ── report format ────────────────────────────────────────────────────────────────────
  const mixed = [
    { dir: "a", status: "built", script: "build.sh" },
    { dir: "b", status: "failed", script: "build.sh", code: 3 },
    { dir: "c", status: "no-script" },
  ];
  const out = formatResults(mixed);
  check(
    "success, failure and no-script are DISTINGUISHABLE in the report",
    /✓ a/.test(out) && /✗ b/.test(out) && /✗ c/.test(out),
  );
  check("a failure names the code", /code 3/.test(out));
  check(
    "a no-script says exactly what is missing",
    /NO build script/.test(out),
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(
  `✓ ${String(n)} assertions passed — build: "no script" is a FAILURE, not a skip`,
);
