/**
 * `review/findings-cause` — both halves on real ESLint, plus a case where the old
 * implementation LIED.
 *
 * The rule came over from the consumer (`checkReviewFindingsCause` in `paper-lint.mjs`),
 * where findings were counted by regexes over the text. The third fixture here is not
 * decoration: a table inside a ``` fence is an EXAMPLE of the format, not a report, and
 * the text-based counter recorded it as a finding. In the AST it's a `code` node, and
 * `tableRow` does not exist inside it. That is, the move removed a whole class of bugs,
 * and this fixture pins it down.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import markdown from "@eslint/markdown";
import { recordCheck } from "vigiles";
import reviewRules from "./review-findings-cause.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "..", "fixtures", "review-findings-cause");

/** Same language as the consumer: the rule judges markdown, not lines of text. */
const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ["**/*.md"],
      plugins: { markdown, review: reviewRules },
      language: "markdown/gfm",
      languageOptions: { frontmatter: "yaml" },
      rules: { "review/findings-cause": "error" },
    },
  ],
});

const on = async (file) =>
  (await eslint.lintFiles([join(FIX, file)]))[0].messages;
const cases = [];

// ── 1. FIRES: three findings, no cause analysis.
{
  const m = await on("defect.md");
  assert.equal(
    m.length,
    1,
    `one finding was expected, got ${m.length}: ${JSON.stringify(m)}`,
  );
  assert.equal(m[0].ruleId, "review/findings-cause");
  assert.match(
    m[0].message,
    /3 findings/,
    "the message must name the NUMBER of findings",
  );
  assert.match(
    m[0].message,
    /PIPELINE/,
    "and say the tool needs fixing, not the paragraph",
  );
  assert.equal(
    m[0].line,
    1,
    "the finding is about the FILE, so the position is the start of the document",
  );
  cases.push(
    "a report with findings and no cause analysis → a finding, the count is named",
  );
}

// ── 2. STAYS SILENT on a report with an analysis. Without this half the rule is
//      indistinguishable from one that always screams.
{
  const m = await on("clean.md");
  assert.deepEqual(
    m,
    [],
    `on a report with "Cause:" the rule must stay silent, got: ${JSON.stringify(m)}`,
  );
  cases.push("the same report with a cause analysis → silence");
}

// ── 3. 🔴 STAYS SILENT on a TABLE INSIDE A FENCE — the case the old text-based version
//      counted as findings. This is the move's payoff, shown as a test.
{
  const m = await on("quiet-in-fence.md");
  assert.deepEqual(
    m,
    [],
    `a table inside a \`\`\` fence is an EXAMPLE of the format, not a report; the text-based ` +
      `counter counted it, the AST must not. Got: ${JSON.stringify(m)}`,
  );
  cases.push(
    "a table inside a fence → silence (the text-based version got this wrong)",
  );
}

// ── 4. THRESHOLD — a consumer option, not a mechanism constant.
{
  const strict = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.md"],
        plugins: { markdown, review: reviewRules },
        language: "markdown/gfm",
        languageOptions: { frontmatter: "yaml" },
        rules: { "review/findings-cause": ["error", { minFindings: 99 }] },
      },
    ],
  });
  const m = (await strict.lintFiles([join(FIX, "defect.md")]))[0].messages;
  assert.deepEqual(
    m,
    [],
    "with a threshold above the finding count the rule must stay silent — the threshold is data",
  );
  cases.push(
    "the threshold is passed as an option → with minFindings: 99, silence on the same file",
  );
}

// ── 5. 🔴 "RULE FROM A DATE": an old report is known debt, not a finding. Without this
//      option the rule would have opened at the first consumer with FORTY-NINE findings
//      (measured: 84 reports, 0 new, 49 old), and a check that opens with a wall gets muted.
{
  const dated = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.md"],
        plugins: { markdown, review: reviewRules },
        language: "markdown/gfm",
        languageOptions: { frontmatter: "yaml" },
        rules: {
          "review/findings-cause": ["error", { sinceCreated: "2026-08-23" }],
        },
      },
    ],
  });
  const old = (await dated.lintFiles([join(FIX, "old-debt.md")]))[0].messages;
  assert.deepEqual(
    old,
    [],
    `a report older than the rule's date — debt, not a finding; got: ${JSON.stringify(old)}`,
  );

  // AND THE SECOND HALF OF THE OPTION: on a fresh report it must NOT exempt anything, or
  // "rule from a date" turns into an off switch.
  const fresh = (await dated.lintFiles([join(FIX, "defect.md")]))[0].messages;
  assert.equal(
    fresh.length,
    1,
    `a report AFTER the rule's date must be caught; got: ${JSON.stringify(fresh)}`,
  );
  cases.push(
    "a report older than the rule's date → silence; a fresh one of the same shape → a finding",
  );
}

recordCheck(cases.length);
console.log(`review/findings-cause: ${cases.length} cases:`);
for (const c of cases) console.log(`  ok  ${c}`);

// ── THE MARKER COMES FROM AN OPTION, IT IS NOT HARDCODED ──────────────────────────────────────
//
// The default has been English since 2026-09-17. Before that it was the Russian word
// "Причина:", and there was no way to change it: `causeMarker` was not threaded through the
// CLI, so an English-speaking user could not satisfy an `error`-level rule at all. Both halves:
//   a) with a foreign marker in the options, a report using IT passes;
//   b) the same report without the option — a finding. Otherwise "option accepted" is
//      indistinguishable from "the rule stays silent".
//
// ⚠️ The fixture's shape is load-bearing: findings are counted by NUMBERED table rows (and
// bold list items), not by any list. The first draft of this block used a plain `- finding
// one`, the rule never fired, and BOTH halves passed vacuously.
{
  const body = [
    "---",
    "created: 2026-09-01",
    "---",
    "",
    "| # | what | where |",
    "|---|---|---|",
    "| 1 | a | §1 |",
    "| 2 | b | §2 |",
    "| 3 | c | §3 |",
    "",
    "Причина: the pipeline step that let them through.",
    "",
  ].join("\n");

  const lintWith = async (options) => {
    const e = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ["**/*.md"],
          plugins: { markdown, review: reviewRules },
          language: "markdown/gfm",
          languageOptions: { frontmatter: "yaml" },
          rules: { "review/findings-cause": ["error", options] },
        },
      ],
    });
    return (
      await e.lintText(body, { filePath: join(FIX, "option-probe.md") })
    )[0].messages;
  };

  const withOpt = await lintWith({ minFindings: 3, causeMarker: "Причина:" });
  assert.deepEqual(
    withOpt,
    [],
    `the marker from the options must be accepted, got: ${JSON.stringify(withOpt)}`,
  );

  const withoutOpt = await lintWith({ minFindings: 3 });
  assert.equal(
    withoutOpt.length,
    1,
    "without the option the same marker is NOT counted as a cause — otherwise the option decides nothing",
  );
  assert.match(
    withoutOpt[0].message,
    /Cause:/,
    "and the finding's text carries the ENGLISH default, not something absent from the file",
  );
}
