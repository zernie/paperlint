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

assert.deepEqual(Object.keys(stages.rules).sort(), ["stages"], "rule set changed");

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
