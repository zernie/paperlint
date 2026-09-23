/**
 * Harness for `doc/fields`. Both halves for every case: fires on a planted defect AND
 * stays silent on a correct neighbor — otherwise "silent" is indistinguishable from "dead".
 *
 * The mutation battery sits alongside it: `doc-fields.mutations.mjs`.
 */
import assert from "node:assert/strict";
import { Linter } from "eslint";
import markdown from "@eslint/markdown";
import docFields from "./doc-fields.mjs";
import { recordCheck } from "vigiles";

const linter = new Linter();

const OPTS = {
  fields: {
    read: {
      values: ["full", "abstract", "none"],
      hint: "what exactly was read",
    },
  },
  sinceCreated: "2026-07-29",
};

/** Run the rule against one document. Returns the findings. */
function run(src, options = OPTS) {
  return linter.verify(src, {
    plugins: { markdown, doc: docFields },
    language: "markdown/gfm",
    languageOptions: { frontmatter: "yaml" },
    rules: { "doc/fields": ["error", options] },
  });
}

const fm = (body, extra = "") =>
  ["---", "title: neighbor", 'created: "2026-08-01"', extra, "---", "", body]
    .filter(Boolean)
    .join("\n");

// ── 1. STAYS SILENT when the field is declared and the value is allowed ────────────────
{
  for (const v of ["full", "abstract", "none"]) {
    const m = run(fm("Analysis.", `read: ${v}`));
    assert.deepEqual(
      m,
      [],
      `read: ${v} — an allowed value, silence was expected: ${JSON.stringify(m)}`,
    );
  }
  recordCheck("the three allowed field values produce no findings");
}

// ── 2. FIRES when the field is missing ──────────────────────────────────────────
{
  const m = run(fm("Analysis with no field declared."));
  assert.equal(
    m.length,
    1,
    `case 2: a missing field must produce EXACTLY one finding, got ${m.length}`,
  );
  assert.match(
    m[0].message,
    /no `read` field/,
    `case 2: the finding must name "no field", got: ${m[0].message}`,
  );
  assert.match(
    m[0].message,
    /what exactly was read/,
    "the hint from the option must reach the text",
  );
  recordCheck("a missing field is a finding, with the hint from the option");
}

// ── 3. FIRES on a value outside the list ─────────────────────────────────────
{
  const m = run(fm("Analysis.", "read: fully"));
  assert.equal(
    m.length,
    1,
    `case 3: a value outside the vocabulary must produce one finding, got ${m.length}`,
  );
  assert.match(
    m[0].message,
    /`read: fully` — value is not in the list/,
    `a value outside the vocabulary must be NAMED as the value outside the vocabulary — got: ${m[0].message}`,
  );
  recordCheck(
    "a value outside the vocabulary is a finding, and it names the value that arrived",
  );
}

// ── 4. 🔴 THE MAIN CASE: PROSE WITH THE SAME WORD IS NOT A FIELD ───────────────
// The predecessor searched for the substring `**Read:**` and counted ANY occurrence of
// it — including an admission of incompleteness. Here the text has no effect on the verdict at all.
{
  const confession = fm(
    "⚠️ **Read only at the abstract level.** The full text is required before submission.",
  );
  const m = run(confession);
  assert.equal(
    m.length,
    1,
    "bold prose containing the word 'Read' does not declare a field — a finding was expected",
  );
  assert.match(
    m[0].message,
    /no `read` field/,
    `a missing field must be NAMED (case 1) — got: ${m[0].message}`,
  );

  // and the reverse half: the same admission, declared as a FIELD, is legitimate and silent
  const declared = fm(
    "The full text is required before submission.",
    "read: abstract",
  );
  assert.deepEqual(
    run(declared),
    [],
    "read: abstract — a legitimate state, not a failure",
  );
  recordCheck(
    "prose with the word 'Read' does not count; the same state as a field does",
  );
}

// ── 5. A MARKER INSIDE A CODE FENCE AND IN A QUOTE — has no effect ─────────────────
// A substring search counted both. To the rule this is just document text.
{
  const fenced = fm(
    ["```", "**Read:** an example from someone else's card", "```"].join("\n"),
  );
  assert.equal(
    run(fenced).length,
    1,
    "a marker inside a ``` fence does not declare a field",
  );
  const quoted = fm("> **Read:** a quote from someone else's card");
  assert.equal(
    run(quoted).length,
    1,
    "a marker in a quote does not declare a field",
  );
  recordCheck("a code fence and a quote do not create a field");
}

// ── 6. "Rule from a date" — consumer data ───────────────────────────────────
{
  // Dates are quoted HERE on purpose: this case is about the GATE, not about type parsing.
  // Unquoted dates live only in case 8, otherwise the "don't normalize Date" mutation would
  // kill this case first.
  const old = [
    "---",
    "title: an old card",
    'created: "2026-07-01"',
    "---",
    "",
    "Analysis with no field.",
  ].join("\n");
  assert.deepEqual(
    run(old),
    [],
    "a card older than the rule's date — known debt, not a finding",
  );

  const onTheDay = [
    "---",
    "title: on the rule's day",
    'created: "2026-07-29"',
    "---",
    "",
    "Analysis with no field.",
  ].join("\n");
  assert.equal(
    run(onTheDay).length,
    1,
    "the boundary is inclusive: `created == sinceCreated` is checked",
  );
  recordCheck("the rule's date exempts the past and includes its own day");
}

// ── 7. 🔴 A MISSING FRONTMATTER IS A FINDING, NOT AN EXEMPTION ──────────────────
// This family's predecessor let a file with no `created` fall out of the check entirely,
// meaning the gate was bypassed by deleting the header. Here that hole is closed.
{
  const bare = "# Neighbor\n\nAnalysis with no header at all.\n";
  const m = run(bare);
  assert.equal(
    m.length,
    1,
    `case 7: a document with no frontmatter must produce a finding, got ${m.length}`,
  );
  assert.match(
    m[0].message,
    /no frontmatter/,
    `a missing header must have ITS OWN verdict — got: ${m[0].message}`,
  );
  recordCheck(
    "a document with no frontmatter is not exempted — otherwise the gate is bypassed by deleting the header",
  );
}

// ── 8. 🔴 AN UNQUOTED `created` ARRIVES AS A Date OBJECT ─────────────────────────
// js-yaml recognizes YAML 1.1 timestamps. Comparing `Date < "2026-07-29"` SILENTLY gives
// false, meaning the date gate would stop working and it would look like silence.
// This case checks both sides of the boundary on an unquoted date.
{
  const oldUnquoted = [
    "---",
    "created: 2026-07-01",
    "---",
    "",
    "No field.",
  ].join("\n");
  assert.deepEqual(
    run(oldUnquoted),
    [],
    "case 8: an unquoted OLD date must exempt",
  );

  const newUnquoted = [
    "---",
    "created: 2026-08-01",
    "---",
    "",
    "No field.",
  ].join("\n");
  assert.equal(
    run(newUnquoted).length,
    1,
    "case 8: an unquoted NEW date must TURN ON the check",
  );

  const quoted = ["---", 'created: "2026-08-01"', "---", "", "No field."].join(
    "\n",
  );
  assert.equal(
    run(quoted).length,
    1,
    "a quoted date behaves the same as an unquoted one",
  );
  recordCheck(
    "a date as a Date and a date as a string give the same verdict on both sides of the boundary",
  );
}

// ── 9. Broken YAML — its own separate verdict, not silence ─────────────────────
{
  const broken = [
    "---",
    "title: [no closing",
    "created: 2026-08-01",
    "---",
    "",
    "Body.",
  ].join("\n");
  const m = run(broken);
  assert.equal(
    m.length,
    1,
    `case 9: broken YAML must produce one finding, got ${m.length}`,
  );
  assert.match(
    m[0].message,
    /does not parse as YAML/,
    `a broken header must have ITS OWN verdict — got: ${m[0].message}`,
  );
  recordCheck(
    "an unparseable header is its own message, not silence and not 'no field'",
  );
}

// ── 10. An empty value counts as missing ────────────────────────────────
// The consumer's `frontmatterField` returned the CLOSING FENCE `---` on an empty value, and
// that would pass as a value. Here empty means absent.
{
  const empty = [
    "---",
    "created: 2026-08-01",
    "read:",
    "---",
    "",
    "Body.",
  ].join("\n");
  const m = run(empty);
  assert.equal(
    m.length,
    1,
    `case 10: an empty value must read as absent, got ${m.length}`,
  );
  assert.match(
    m[0].message,
    /no `read` field/,
    `a missing field must be NAMED (case 2) — got: ${m[0].message}`,
  );
  recordCheck("an empty field value = absent, not 'the value ---'");
}

// ── 11. The finding sits ON THE FRONTMATTER, not on the first line of the body ──────────
{
  const m = run(fm("The body starts here."));
  assert.equal(
    m[0].line,
    1,
    `the finding must point at the header, got line ${m[0].line}`,
  );
  recordCheck("the finding's address is the frontmatter");
}

// ── 12. Two fields at once — one finding per field, not one per document ───────────
{
  const two = {
    fields: {
      read: { values: ["full", "abstract", "none"] },
      venue_checked: { values: ["yes", "no"] },
    },
    sinceCreated: "2026-07-29",
  };
  const m = run(fm("Body."), two);
  assert.equal(
    m.length,
    2,
    `two missing fields — two findings, got ${m.length}`,
  );
  assert.deepEqual(
    m.map((x) => /no `(\w+)` field/.exec(x.message)?.[1]).sort(),
    ["read", "venue_checked"],
    "both findings must name THEIR OWN field",
  );
  recordCheck("each missing field gets its own finding");
}

console.log(
  "✓ doc/fields: a declared field is silent, a missing or bad one is a finding; prose with the " +
    "same word does not count; the date gate, a missing header, broken YAML, a js-yaml Date, and " +
    "an empty value — each with its own verdict",
);
