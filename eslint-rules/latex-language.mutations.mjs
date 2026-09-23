/**
 * Mutation battery for the LaTeX language `eslint-rules/latex-language.mjs`.
 * Run: `node eslint-rules/latex-language.mutations.mjs` (not `vigiles test` — not a harness).
 *
 * 🔴 EVERY MUTATION CARRIES A "THE PATCH LANDED" ASSERTION: the file is re-read from disk, the
 * mutant must be in it, the original text must be GONE (otherwise the target was not unique),
 * and after the rollback the contents must return byte for byte. In the repository this came
 * from, a green mutation has three times meant not "the defence holds" but "the patch never
 * applied".
 *
 * A GREEN HARNESS UNDER A MUTATION is a finding about the TEST, not a conclusion about the
 * defence. Rank the causes:
 *   1. the wrong test — it pins a side effect rather than the property itself;
 *   2. the patch did not land — removed by the assertion above;
 *   3. the set is too narrow — the property is observable in no fixture;
 *   4. 🔴 THE RUN WAS ALREADY RED BEFORE THE MUTATION — then "killed" and "was failing anyway"
 *      are indistinguishable.
 * Cause 4 is why the baseline run comes FIRST and why its failure stops the battery.
 *
 * ⚠️ WHAT IS NOT HERE ANY MORE. The original battery had a second group of three mutations
 * against the `case "html"` patch in three consumer rule modules — the patch that taught them to
 * recognise a `%` comment, not only an `<!--` one. Those modules were not extracted, so the
 * mutations have no target. The property itself did NOT disappear with them: the language still
 * trims both edges of a comment node, and the two mutations named
 * `comment/RIGHT edge` and `comment/LEFT edge` below cover the language's half of it. What is
 * genuinely gone is the evidence that a CONSUMER acts on it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const HARNESS = "eslint-rules/latex-language.harness.mjs";

// Coverage mode — see `scripts/run-mutations.mjs` guard 2 and the block in
// `lib/mutation-driver.mjs`. Says what this battery can kill, without touching a file.
if (process.env.MUTATIONS_REPORT_COVERAGE) {
  console.log(`MUTATION-COVERS\t${HARNESS}`);
  process.exit(0);
}

const LANG = "eslint-rules/latex-language.mjs";
const PRISTINE = readFileSync(LANG, "utf8");

const M = [
  [
    "synthesis of `## References` from `\\bibliography{}`",
    "stop declaring the bibliography a heading",
    '      if (node.content === "bibliography" && pos) {',
    "      if (false && pos) { /* MUT */",
  ],
  [
    "synthesis of `## Abstract` from the environment",
    "stop declaring the abstract a heading",
    '      if (env === "abstract" && pos) {',
    "      if (false && pos) { /* MUT */",
  ],
  [
    "preamble cut-off during synthesis",
    "treat preamble constructs (e.g. `\\AtBeginDocument{\\bibliography{}}`) as nodes of the document",
    '    if (pos && pos.start.offset < preEnd) {\n      for (const k of ["content", "args"]) if (node[k]) walk(node[k]);\n      return;\n    }',
    "    if (false) { return; } /* MUT */",
  ],
  [
    "preamble blanking",
    "leave the preamble (package list, author macros) visible as prose",
    "  if (preEnd) {\n    blank(0, preEnd);",
    "  if (preEnd) {\n    void 0; /* MUT */",
  ],
  [
    "comment/RIGHT edge trim",
    "leave the trailing `\\n` inside the comment node",
    '      while (\n        ce > pos.start.offset &&\n        (src[ce - 1] === "\\n" || src[ce - 1] === "\\r")\n      )\n        ce--;',
    "      /* MUT */",
  ],
  [
    "comment/LEFT edge trim",
    "leave the preceding `\\n` inside the comment node",
    '      while (cs < ce && src[cs] !== "%") cs++;',
    "      /* MUT */",
  ],
  [
    "`**` written in place of `\\te`",
    "write the `**` before the content, leaving the line to start with spaces",
    '      while (pendingStrong.length) {\n        const o = pendingStrong.pop();\n        chars[o] = "*";\n        chars[o + 1] = "*";\n      }',
    "      while (pendingStrong.length) { pendingStrong.pop(); } /* MUT */",
  ],
  [
    "`\\texttt{X}` → `` `X` ``",
    "stop reproducing the one markdown markup the projection can express",
    '      if (node.content === "texttt" || node.content === "lstinline") {',
    "      if (false) { /* MUT */",
  ],
  [
    "heading projected to ATX",
    "stop writing `#` where `\\section` was",
    '        for (let i = 0; i < depth; i++) chars[pos.start.offset + i] = "#";',
    '        for (let i = 0; i < 0; i++) chars[pos.start.offset + i] = "#"; /* MUT */',
  ],
  [
    "OPAQUE macro blanking",
    "leave `\\cite` / `\\label` / `\\input` as prose",
    "      if (OPAQUE.test(node.content)) {\n        blank(pos.start.offset, argEnd(node).offset + 1);\n        return;\n      }",
    "      if (false) { return; } /* MUT */",
  ],
  [
    "math blanking",
    "leave formulas as prose",
    '    if (\n      (node.type === "inlinemath" ||\n        node.type === "displaymath" ||\n        node.type === "verbatim") &&\n      pos\n    ) {',
    "    if (false) { /* MUT */",
  ],
  [
    "float prose kept (caption / footnote)",
    "swallow the caption together with the float again — the double lock returns",
    "const FLOAT_PROSE = /^(caption|footnote)$/;",
    "const FLOAT_PROSE = /^(?!)$/; /* MUT */",
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

// 🔴 A BASELINE RUN BEFORE ANY MUTATION — see cause 4 in the header.
{
  const base = runHarness();
  if (base.failed) {
    console.log(
      "❌ THE HARNESS IS RED BEFORE ANY MUTATION — the battery cannot tell a killed mutation " +
        "from that:\n" +
        base.out.slice(-1500),
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
  writeFileSync(LANG, PRISTINE.replace(from, to));
  const on = readFileSync(LANG, "utf8");
  if (!on.includes(to) || on.includes(from)) {
    console.log(
      `❌ ${label}: THE MUTATION DID NOT LAND (checked by re-reading the file)`,
    );
    bad++;
    writeFileSync(LANG, PRISTINE);
    continue;
  }
  const { failed, out } = runHarness();
  writeFileSync(LANG, PRISTINE);
  if (readFileSync(LANG, "utf8") !== PRISTINE) {
    console.log(`❌ ${label}: THE ROLLBACK FAILED`);
    bad++;
    continue;
  }
  const at = (out.match(/latex-language\.harness\.mjs:(\d+)/) ?? [])[1];
  const msg =
    (out.match(/AssertionError[^:]*: ([^\n]+)/) ?? [])[1] ??
    (out.match(/((?:Error|ENOENT)[^\n]*)/) ?? [])[1] ??
    (out.match(
      /([^\n]*(?:must|drifted|was lost|is stale|leaked|swallowed)[^\n]*)/,
    ) ?? [])[1] ??
    "";
  const where = (at ? `harness:${at} · ` : "") + msg;
  if (failed) {
    ok++;
    rows.push([label, what, where.trim().slice(0, 130)]);
  } else {
    console.log(
      `🔴 ${label}: THE HARNESS IS GREEN UNDER THE MUTATION — a finding about the TEST, not a conclusion about the defence`,
    );
    bad++;
  }
}
console.log("\n| property | mutation | what the harness died on |");
console.log("|---|---|---|");
for (const [a, b, c] of rows)
  console.log(`| \`${a}\` | ${b} | ${c.replace(/\|/g, "\\|")} |`);
console.log(`\n${ok} mutation(s) killed, ${bad} problem(s)`);
process.exit(bad ? 1 : 0);
