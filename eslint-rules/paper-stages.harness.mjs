/**
 * Both halves for `paper/stages`, and the halves are not symmetric — which is the point.
 *
 * The rule has TWO directions and each has its own way of being silently useless:
 *   declared -> bytes   passes trivially if nobody declares anything
 *   bytes -> declared   passes trivially if the versions folder is never read
 * So every fixture below exists to kill one specific way of being green and wrong, and the
 * two that matter most are `noheader` (no frontmatter at all, bytes on disk — the rule must
 * NOT be switchable off by deleting a line) and `nothing` (no frontmatter, no bytes — it must
 * stay silent, because a draft owes nothing).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Linter } from "eslint";
import markdown from "@eslint/markdown";
import stages from "./paper-stages.mjs";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "paper-stages");
const linter = new Linter();

let n = 0;
const check = (label, cond) => {
  assert.ok(cond, label);
  n++;
};

assert.deepEqual(Object.keys(stages.rules).sort(), ["source", "stages"], "rule set changed");

/** Findings for one fixture paper, as plain message strings. */
function lint(name) {
  const file = join(FIX, name, "PIPELINE-STATUS.md");
  const msgs = linter.verify(readFileSync(file, "utf-8"), [{
    // `files` is required here rather than cosmetic: without it flat config falls back to the
    // JS extensions and every fixture comes back as "No matching configuration found" — a
    // message that reads exactly like a clean run.
    files: ["**/*.md"],
    plugins: { markdown, paper: stages },
    language: "markdown/gfm",
    languageOptions: { frontmatter: "yaml" },
    rules: { "paper/stages": "error" },
  }], file);
  assert.deepEqual(msgs.filter((m) => m.fatal), [], `${name}: the rule threw`);
  return msgs.map((m) => m.message);
}

// ── silent where it must be silent ──────────────────────────────────────────────────────
check("declared and frozen correctly — silent", lint("ok").length === 0);
check("nothing shipped, nothing declared — silent, a draft owes nothing",
      lint("nothing").length === 0);
// A withdrawn version is a deliberate RECORD of a mistake; demanding a declaration for it
// would turn that record into a finding.
check("a STALE version needs no declaration", lint("stale").length === 0);

// ── direction one: a claim owes its bytes ───────────────────────────────────────────────
const wrong = lint("wrongsize");
check("wrong byte count is reported", wrong.length === 1);
check("and it names BOTH numbers, not just 'mismatch'",
      /352357/.test(wrong[0]) && /100/.test(wrong[0]));

const missing = lint("nofile");
check("a declared stage with no file on disk is reported",
      missing.length === 1 && /на диске нет/.test(missing[0]));

// ── direction two: bytes owe their declaration ──────────────────────────────────────────
// 🔴 The live case this rule was written for: a camera-ready pdf sat frozen for 16 days while
// the predecessor's pattern for that stage matched zero times anywhere in the file.
const undeclared = lint("undeclared");
check("a frozen version nobody declared is reported", undeclared.length === 1);
check("and it names the file and the stage",
      /2026-08-29-camera-ready\.pdf/.test(undeclared[0]) && /camera-ready/.test(undeclared[0]));

// 🔴 THE ESCAPE HATCH. Without this half the whole rule is switched off by deleting the
// frontmatter — which is the cheapest edit in the file.
const noheader = lint("noheader");
check("deleting the frontmatter does NOT silence the rule when bytes exist",
      noheader.length === 1 && /не объявлена/.test(noheader[0]));

// ── a LIST, not a map: the same stage twice ─────────────────────────────────────────────
// One paper in the source corpus was submitted to one venue, rejected, and resubmitted to
// another. A map keyed by stage name holds one of those; the filenames already hold both.
check("the same stage declared twice with different dates is accepted",
      lint("twice").length === 0);

console.log(`✓ ${String(n)} assertions passed — paper/stages, both directions`);

// ── `paper/source`: the tie to a commit must RESOLVE, not merely look like a hash ────────
// 🔴 This is the half the predecessor did not have. It tested `/commit\s+[0-9a-f]{7,40}/`
// against the file text, which is a question about SPELLING. Measured on the live corpus the
// day this rule was written: one paper's scorecard said `Final PDF = commit f0ea066` and git
// does not resolve that object at all — the old check was green on a dead reference.
{
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = await import("node:fs");

  // 🔴 INSIDE the package, not in `tmpdir()`. Flat-config `files` patterns are matched
  // against paths RELATIVE TO CWD, so a fixture under /tmp matches nothing and every lint
  // comes back as "No matching configuration found" — a message that reads exactly like a
  // clean run. Cost of learning that the second time: one debug session.
  const repo = mkdtempSync(join(FIX, "..", ".tmp-stages-git-"));
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  const paper = join(repo, "papers", "one");
  mkdirSync(join(paper, "versions"), { recursive: true });
  writeFileSync(join(paper, "paper.tex"), "x\n");
  git("add", "-A");
  git("commit", "-qm", "seed");
  const real = git("rev-parse", "--short", "HEAD");

  const lintIn = (body) => {
    const file = join(paper, "PIPELINE-STATUS.md");
    writeFileSync(file, body);
    const msgs = linter.verify(body, [{
      files: ["**/*.md"],
      plugins: { markdown, paper: stages },
      language: "markdown/gfm",
      languageOptions: { frontmatter: "yaml" },
      rules: { "paper/source": "error" },
    }], file);
    assert.deepEqual(msgs.filter((m) => m.fatal), [], "the rule threw");
    return msgs.map((m) => m.message);
  };

  const rec = (extra) =>
    `---\nstages:\n  - stage: submitted\n    date: 2026-07-22\n    pdf: versions/x.pdf\n    bytes: 1\n${extra}---\n# S\n`;

  check("a resolving commit is accepted", lintIn(rec(`    commit: ${real}\n`)).length === 0);

  const dead = lintIn(rec("    commit: f0ea066\n"));
  check("a commit that does not resolve is reported", dead.length === 1);
  check("and the finding names the dead sha", /f0ea066/.test(dead[0]));

  const none = lintIn(rec(""));
  check("a stage tied to nothing at all is reported",
        none.length === 1 && /не привязана/.test(none[0]));

  // Exemption, not a hole: the build may have come from OUTSIDE this repository, and then the
  // evidence is the frozen source sitting next to the pdf.
  writeFileSync(join(paper, "versions", "2026-07-22-submitted.tex"), "frozen\n");
  check("a frozen source file stands in for a commit", lintIn(rec("")).length === 0);

  rmSync(repo, { recursive: true, force: true });
}

console.log(`✓ ${String(n)} assertions passed — paper/source, commit resolution`);
