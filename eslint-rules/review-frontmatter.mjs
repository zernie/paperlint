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
 * A project that needs more — its own required fields, allowed values — writes a JSON Schema file
 * and names it in the `reviewSchema` setting. Both schemas apply (the `allOf` of the two), so a
 * project can add requirements but never lift paperlint's.
 *
 * ── WHY THIS REPLACED TWO RULES IN 3.0.0 ────────────────────────────────────────────
 * `review/findings-cause` GUESSED the findings from the prose: it counted numbered table rows and
 * list items starting in bold, looked for a magic word (`causeMarker`, "Cause:") anywhere in the
 * text, spoke only above a threshold (`minFindings`), and skipped reports older than a date
 * (`sinceCreated`) — a date ratchet its own header said belonged in `ignores`. Every one of
 * those was a convention in prose standing in for a field nobody had declared.
 * `doc/fields` was a hand-rolled schema language in the config (`{ field: { values: [...] } }`).
 * Both are this rule now: the record is data, the schema is JSON Schema, the validator is ajv.
 *
 * A review with no `findings` key is not a findings record and is not checked for findings — so
 * there is no date to compare: old reports simply have no records. A file with no frontmatter is
 * validated as `{}`, so a field the project's schema requires is still reported on it: a missing
 * header must not be a way around the check.
 *
 * YAML is read with js-yaml's CORE schema, which leaves `2026-09-20` a string. The default schema
 * turns it into a Date, and a schema asking for `"type": "string"` would then reject a date the
 * author wrote correctly.
 */
import Ajv from "ajv";
import { CORE_SCHEMA, load } from "js-yaml";
import { readFileSync } from "node:fs";

const PACKAGE_SCHEMA = JSON.parse(
  readFileSync(
    new URL("./review-frontmatter.schema.json", import.meta.url),
    "utf8",
  ),
);

const ajv = () => new Ajv({ allErrors: true });
const packageValidator = ajv().compile(PACKAGE_SCHEMA);

/** Why `schema` cannot be used as a JSON Schema, or null. For the config boundary. */
export function schemaProblem(schema) {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema))
    return "a schema is a JSON object";
  try {
    ajv().compile(schema);
    return null;
  } catch (e) {
    return e.message;
  }
}

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

export default {
  rules: {
    frontmatter: {
      meta: {
        type: "problem",
        docs: {
          description:
            "a review's frontmatter is a record: its findings, each with a status and, when open, the pipeline cause — validated by JSON Schema",
        },
        schema: [
          {
            type: "object",
            properties: {
              // The project's JSON Schema, already read and compiled by the CLI (`reviewSchema`).
              extend: { type: "object" },
            },
            additionalProperties: false,
          },
        ],
        messages: {
          malformed:
            "the frontmatter does not parse as YAML ({{why}}) — there is no record to read",
          invalid: "{{problem}}",
        },
      },
      create(context) {
        const extend = context.options[0]?.extend;
        const validators = [
          packageValidator,
          ...(extend ? [ajv().compile(extend)] : []),
        ];
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
            for (const problem of validators.flatMap((v) => errorsOf(v, data)))
              context.report({
                node: frontmatter ?? root,
                messageId: "invalid",
                data: { problem },
              });
          },
        };
      },
    },
  },
};
