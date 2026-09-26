/**
 * `review/frontmatter` — a review report's frontmatter is a RECORD, validated by a JSON Schema.
 *
 * ── WHAT IT CHECKS ───────────────────────────────────────────────────────────────
 * A review under `reviews/` declares what it found in its YAML frontmatter:
 *
 *   findings:
 *     - id: 1
 *       status: open            # open | fixed | wontfix
 *       cause: missing-skill    # skill-defect | missing-skill | hook | rule — required when open
 *
 * The pipeline convention behind it: a review does not end with a list of findings, it ends with
 * what in the PIPELINE let each one through. Otherwise the text gets fixed while the tool that
 * missed it stays the same. The schema is `review-frontmatter.schema.json` beside this file, and
 * "an open finding names its cause" is its `if`/`then`, not code here.
 *
 * The same mechanism, with a schema of its own, is `sibling/frontmatter`
 * (`sibling-frontmatter.mjs`): `frontmatterRule` below is the one implementation.
 *
 * ── WHY THIS REPLACED TWO RULES IN 3.0.0 ────────────────────────────────────────────
 * `review/findings-cause` GUESSED the findings from the prose: it counted numbered table rows and
 * list items starting in bold, looked for a magic word (`causeMarker`, "Cause:") anywhere in the
 * text, spoke only above a threshold (`minFindings`), and skipped reports older than a date
 * (`sinceCreated`) — a date ratchet its own header said belonged in `ignores`. Every one of
 * those was a convention in prose standing in for a field nobody had declared.
 * `doc/fields` was a hand-rolled schema language in the config (`{ field: { values: [...] } }`),
 * and its one real use was the `read:` field of sibling cards — which this package's own
 * `analyze-sibling-paper` skill writes, so the package now ships that schema too. The record is
 * data, the schema is JSON Schema, the validator is ajv.
 *
 * A review with no `findings` key is not a findings record and is not checked for findings — so
 * there is no date to compare: old reports simply have no records. A file with no frontmatter is
 * validated as `{}`, so a field a schema requires is still reported on it: a missing header must
 * not be a way around the check.
 *
 * YAML is read with js-yaml's CORE schema, which leaves `2026-09-20` a string. The default schema
 * turns it into a Date, and a schema asking for `"type": "string"` would then reject a date the
 * author wrote correctly.
 */
import Ajv from "ajv";
import { CORE_SCHEMA, load } from "js-yaml";
import { readFileSync } from "node:fs";

/** One ajv error as a line a person can act on. `if` errors only repeat their `then`. */
function describe(e) {
  const where = e.dataPath
    ? `\`${e.dataPath.replace(/^\./, "")}\``
    : "the frontmatter";
  if (e.keyword === "enum")
    return `${where} must be one of: ${e.params.allowedValues.join(", ")}`;
  if (e.keyword === "additionalProperties")
    return `${where} has an unknown field \`${e.params.additionalProperty}\``;
  return `${where} ${e.message}`;
}

const errorsOf = (validate, data) =>
  validate(data)
    ? []
    : (validate.errors ?? []).filter((e) => e.keyword !== "if").map(describe);

/**
 * A rule that validates a markdown file's YAML frontmatter against the JSON Schema in `schemaUrl`
 * (a file shipped beside the rule). A file with no frontmatter is validated as `{}`.
 */
export function frontmatterRule(schemaUrl, description) {
  const validate = new Ajv({ allErrors: true }).compile(
    JSON.parse(readFileSync(schemaUrl, "utf8")),
  );
  return {
    meta: {
      type: "problem",
      docs: { description },
      schema: [],
      messages: {
        malformed:
          "the frontmatter does not parse as YAML ({{why}}) — there is no record to read",
        invalid: "{{problem}}",
      },
    },
    create(context) {
      let frontmatter = null;
      let data = {};
      return {
        yaml(node) {
          frontmatter = node;
          try {
            data = load(node.value ?? "", { schema: CORE_SCHEMA }) ?? {};
          } catch (e) {
            data = null;
            context.report({
              node,
              messageId: "malformed",
              data: { why: e.reason ?? e.message ?? "unparseable" },
            });
          }
        },
        "root:exit"(root) {
          if (data === null) return;
          for (const problem of errorsOf(validate, data))
            context.report({
              node: frontmatter ?? root,
              messageId: "invalid",
              data: { problem },
            });
        },
      };
    },
  };
}

export default {
  rules: {
    frontmatter: frontmatterRule(
      new URL("./review-frontmatter.schema.json", import.meta.url),
      "a review's frontmatter is a record: its findings, each with a status and, when open, the pipeline cause — validated by JSON Schema",
    ),
  },
};
