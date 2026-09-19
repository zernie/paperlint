/**
 * `review/findings-cause` — a review report with findings and no analysis of the ROOT CAUSE.
 *
 * ── WHAT THIS RULE IS ──────────────────────────────────────────────────────────
 * Pipeline convention: a paper review does not end with a list of findings, it ends
 * with an answer to "what in the PIPELINE let this through" — a defective skill, a
 * missing skill, a hook, a rule. Otherwise the paper text gets fixed while the tool
 * that missed it stays the same, and the next paper arrives with the same defect.
 *
 * ── WHY THIS IS A MOVE, NOT A NEW RULE ──────────────────────────────────────────
 * First unit of step 9 of the extraction: until 2026-09-15 the check lived in the
 * consumer as `checkReviewFindingsCause` in `.claude/hooks/paper-lint.mjs` — a
 * directory walk plus three regexes over the text.
 *
 * 🔴 AND THE MOVE HERE IS NOT A COPY, IT REMOVES A WHOLE CLASS OF BUGS. The old
 * version counted findings like this:
 *
 *     tableRows  ←  ^\|\s*\d+\s*\|            a line starting with "| <number> |"
 *     boldItems  ←  ^\s*[-*]\s+\*\*             a list item starting bold
 *
 * (the regexes are given WITHOUT trailing slashes and flags on purpose: an
 * "asterisk-slash" sequence inside a block comment closes it — I tripped on this
 * twice in one hour, the second time right here.)
 *
 * That is, a "table row" was recognized by how it's written, not by its markup: the
 * same line inside a ``` fence counted as a finding, a leading space in the cell
 * broke the count, and `*` and `-` had to be listed by hand. In the AST a table row
 * is a `tableRow` node, and all three misses become inexpressible. This is exactly
 * the base rule "parse markdown with a PARSER".
 *
 * ── WHAT STAYS AS CONSUMER DATA ───────────────────────────────────────────────
 * The findings threshold is an option. The "rule from a date" (reports older than a
 * given date are known debt, not a finding) DOES NOT MOVE HERE AT ALL: it's a fact
 * about one consumer's corpus, and its home is that consumer's config via `ignores`,
 * not the mechanism. The mechanism goes in the package, the data stays with the consumer.
 */

/** Numbered cell: the first column of a table row holding a single number. */
const isNumbered = (row) => {
  const first = row.children?.[0];
  const text = (first?.children ?? []).map((c) => c.value ?? "").join("").trim();
  return /^\d+$/.test(text);
};

/** Finding item: a list element starting with bold text — the finding's heading. */
const isBoldItem = (item) => {
  const para = item.children?.find((c) => c.type === "paragraph");
  return para?.children?.[0]?.type === "strong";
};

export default {
  rules: {
    "findings-cause": {
      meta: {
        type: "suggestion",
        docs: {
          description:
            "a review report with findings names what in the pipeline let them through",
        },
        schema: [
          {
            type: "object",
            properties: {
              minFindings: { type: "integer", minimum: 1 },
              causeMarker: { type: "string" },
              sinceCreated: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
            },
            additionalProperties: false,
          },
        ],
        messages: {
          noCause:
            "{{count}} findings and not one «{{marker}}» note. First name what in the PIPELINE let them through (a defective skill · a missing skill · a hook · a rule) and fix THAT: the text edit falls out of running the fixed tool, not instead of it.",
        },
      },
      create(context) {
        const { minFindings = 3, causeMarker = "Cause:", sinceCreated } = context.options[0] ?? {};
        let findings = 0;
        let hasCause = false;
        let created = "";

        return {
          // 🔴 "RULE FROM A DATE" — MECHANISM, DATE — DATA. A new check that opens with a
          // wall of findings on a historical corpus gets muted the same day; so the
          // consumer needs a way to say "before such-and-such date this is known debt,
          // not a finding". Measured on the first consumer: 84 reports, 0 new would fire
          // and 49 old — without this option the rule would have opened with forty-nine
          // findings. The date is NOT hardcoded: it comes in as an option, read from
          // `created` in the frontmatter, and a document with no date is treated as OLD
          // only when the option is set — otherwise a missing frontmatter would become a
          // way to dodge the rule.
          yaml(node) {
            created = /^created:\s*(\d{4}-\d{2}-\d{2})/m.exec(node.value ?? "")?.[1] ?? "";
          },
          tableRow(node) {
            if (isNumbered(node)) findings++;
          },
          listItem(node) {
            if (isBoldItem(node)) findings++;
          },
          text(node) {
            if (node.value.includes(causeMarker)) hasCause = true;
          },
          "root:exit"(node) {
            if (hasCause || findings < minFindings) return;
            if (sinceCreated && (!created || created < sinceCreated)) return;
            // A finding about the FILE, not a line: what's missing isn't anywhere. So the
            // position is the start of the document, the only honest place for "this is missing".
            context.report({
              loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } },
              messageId: "noCause",
              data: { count: String(findings), marker: causeMarker },
              node,
            });
          },
        };
      },
    },
  },
};
