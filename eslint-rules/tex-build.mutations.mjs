/**
 * Mutation battery for `eslint-rules/tex-build.mjs`.
 * Run: `node eslint-rules/tex-build.mutations.mjs` (not `vigiles test` — this is not a harness).
 *
 * 🔴 EVERY MUTATION CARRIES A "THE PATCH LANDED" ASSERTION: the file is re-read FROM DISK, the
 * mutant must be in it, and after the rollback the contents must return byte for byte. In the
 * repository this came from, a green mutation has FOUR TIMES meant not "the defence holds" but
 * "the patch never landed" / "the test is looking somewhere else".
 *
 * WHAT A GREEN HARNESS UNDER A MUTATION MEANS: it is a finding about the TEST, not a conclusion
 * about the defence. Rank the causes in this order — the test greps PROSE ABOUT a value instead
 * of the value · the test looks in the wrong place · the test is the wrong test · the patch did
 * not land · the set is too narrow · the run was already red BEFORE the mutation. The last one
 * is closed by the baseline run below.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const RULES = "eslint-rules/tex-build.mjs";
const HARNESS = "eslint-rules/tex-build.harness.mjs";
const PRISTINE = readFileSync(RULES, "utf8");

const M = [
  [
    "vocabulary/camera-ready",
    "remove the «at camera-ready» branch — the very one the check was added for on 2026-08-24",
    "  /\\b(?:at (?:the )?camera[-\\s]?ready|upon acceptance|on acceptance|will be (?:released|published|made (?:publicly )?available|public|open[-\\s]?sourced))\\b/i;",
    "  /\\b(?:upon acceptance|on acceptance|will be (?:released|published|made (?:publicly )?available|public|open[-\\s]?sourced))\\b/i; /* MUT */",
  ],
  [
    "vocabulary/will be …",
    "keep only camera-ready — the «will be released/published/public» family dies",
    "  /\\b(?:at (?:the )?camera[-\\s]?ready|upon acceptance|on acceptance|will be (?:released|published|made (?:publicly )?available|public|open[-\\s]?sourced))\\b/i;",
    "  /\\b(?:at (?:the )?camera[-\\s]?ready)\\b/i; /* MUT */",
  ],
  [
    "review/exemption",
    "stop exempting a review build — a promise made during peer review becomes a finding",
    "        if (REVIEW_MODE_RE.test(text)) return;",
    "        if (false) return; /* MUT */",
  ],
  [
    "review/anchor against comments",
    "drop `^[^%\\n]*` — a COMMENTED-OUT `\\documentclass[review]` starts exempting the build " +
      "(a live case in the source corpus: a paper carrying its previous class a few lines above the real one)",
    "  /^[^%\\n]*(?:\\\\documentclass\\[[^\\]]*\\breview\\b|printacmref=false)/m;",
    "  /(?:\\\\documentclass\\[[^\\]]*\\breview\\b|printacmref=false)/m; /* MUT */",
  ],
  [
    "review/printacmref",
    "remove the second sign of the mode — a build with `printacmref=false` stops being exempt",
    "  /^[^%\\n]*(?:\\\\documentclass\\[[^\\]]*\\breview\\b|printacmref=false)/m;",
    "  /^[^%\\n]*(?:\\\\documentclass\\[[^\\]]*\\breview\\b)/m; /* MUT */",
  ],
  [
    "comments/blanking",
    "stop cutting LaTeX comments — an author note `% camera-ready blocker` becomes a finding",
    "          .map((l) => l.replace(/(^|[^\\\\])%.*$/, \"$1\"));",
    "          .map((l) => l); /* MUT */",
  ],
  [
    "comments/escaped percent",
    "treat `\\%` as the start of a comment — the rest of the line behind the percent goes invisible",
    "          .map((l) => l.replace(/(^|[^\\\\])%.*$/, \"$1\"));",
    "          .map((l) => l.replace(/%.*$/, \"\")); /* MUT */",
  ],
  [
    "address/line",
    "report every finding on line 1 — the address, which is what the move to a lint rule bought, is lost",
    "              start: { line: i + 1, column },",
    "              start: { line: 1, column: 1 }, /* MUT */",
  ],
  [
    "address/column",
    "report the start of the line instead of the start of the match",
    "          const column = m.index + 1;",
    "          const column = 1; /* MUT */",
  ],
  [
    "capture/finding text",
    "print the whole line in the message instead of the captured substring — «how many» would still match, «what» would not",
    "            data: { text: m[0] },",
    "            data: { text: line.trim() }, /* MUT */",
  ],
  [
    "disk read/quiet instead of throwing",
    "remove the `try/catch` around the read — the rule THROWS on a stdin run where there is no file",
    "        try {\n          text = readFileSync(context.filename, \"utf8\");\n        } catch {\n          return;\n        }",
    "        text = readFileSync(context.filename, \"utf8\"); /* MUT */",
  ],
];

const runHarness = () => {
  try {
    execFileSync("npx", ["vigiles", "test", HARNESS], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { failed: false, out: "" };
  } catch (e) {
    return { failed: true, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
};

// 🔴 A BASELINE RUN BEFORE ANY MUTATION. A red harness makes EVERY mutation look "killed", and
// the battery would print a confident green verdict about a defence that is not there.
{
  const base = runHarness();
  if (base.failed) {
    console.log(
      "❌ THE HARNESS IS RED BEFORE ANY MUTATION — the battery cannot tell a killed mutation " +
        "from that:\n" + base.out.slice(-1500),
    );
    process.exit(1);
  }
}

let ok = 0;
let bad = 0;
const rows = [];
for (const [label, what, from, to] of M) {
  const hits = PRISTINE.split(from).length - 1;
  if (hits !== 1) {
    console.log(
      `❌ ${label}: TARGET ${hits === 0 ? "NOT FOUND" : `NOT UNIQUE (${hits})`} — ${from.slice(0, 70)}`,
    );
    bad++;
    continue;
  }
  writeFileSync(RULES, PRISTINE.replace(from, to));
  const on = readFileSync(RULES, "utf8");
  if (!on.includes(to) || on.includes(from)) {
    console.log(`❌ ${label}: THE MUTATION DID NOT LAND (checked by re-reading the file)`);
    bad++;
    writeFileSync(RULES, PRISTINE);
    continue;
  }
  const { failed, out } = runHarness();
  writeFileSync(RULES, PRISTINE);
  if (readFileSync(RULES, "utf8") !== PRISTINE) {
    console.log(`❌ ${label}: THE ROLLBACK FAILED`);
    bad++;
    continue;
  }
  // The verdict carries the HARNESS LINE and the assertion text: "killed" without saying by
  // what is half an answer. The battery must show that each mutation died on ITS OWN assertion.
  const at = (out.match(/tex-build\.harness\.mjs:(\d+)/) ?? [])[1];
  const msg =
    (out.match(/AssertionError[^:]*: ([^\n]+)/) ?? [])[1] ??
    // Not every mutation dies on an assertion: removing the `try/catch` crashes the linter
    // itself, and then "what it died on" is a thrown error. Without this branch the column
    // would come out EMPTY — "killed by something unknown", which is the half-answer this
    // battery forbids.
    (out.match(/((?:Error|ENOENT)[^\n]*)/) ?? [])[1] ??
    (out.match(/([^\n]*(?:must|the wrong|drifted|was lost|did not fire)[^\n]*)/) ?? [])[1] ??
    "";
  const where = (at ? `harness:${at} · ` : "") + msg;
  if (failed) {
    ok++;
    rows.push([label, what, where.trim().slice(0, 130)]);
  } else {
    console.log(`🔴 ${label}: THE HARNESS IS GREEN UNDER THE MUTATION — a finding about the TEST, not a conclusion about the defence`);
    bad++;
  }
}
console.log("\n| property | mutation | what the harness died on |");
console.log("|---|---|---|");
for (const [a, b, c] of rows) console.log(`| \`${a}\` | ${b} | ${c.replace(/\|/g, "\\|")} |`);
console.log(`\n${ok} mutation(s) killed, ${bad} problem(s)`);
process.exit(bad ? 1 : 0);
