/**
 * `doc/fields` — a document must declare its FIELDS, not hint at them through markup.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────
 * A convention like "a card must carry the mark `**Read:**`" describes not data
 * but PRESENTATION. Bold text in markdown means "bold text"; that the author meant
 * a field is our guess. The rule requires a real frontmatter field and checks its
 * value against a list of allowed ones.
 *
 * ── WHAT THIS FILE IS ────────────────────────────────────────────────────────────
 * Unit 3 of step 9 of the extraction, and the first one that is NOT a port of the
 * predecessor. The previous two (`review/findings-cause`, `review/cold-read-cause`)
 * carried the mechanism over as-is; here the mechanism is replaced, because the
 * predecessor searched for the substring `**Read:**` in the raw text, and a
 * measurement showed misses in both directions:
 *
 *   | input                                        | substring |
 *   |-----------------------------------------------|-----------|
 *   | `**Read**: everything` (colon outside)         | ❌ rejected|
 *   | `__Read:__ everything` (underscores)            | ❌ rejected|
 *   | a ```-fence with an example inside              | ✅ counted |
 *   | `missing **Read:** — I have not read it`        | ✅ counted |
 *
 * The last row is the heart of the matter: a completeness check counted a direct
 * admission of incompleteness, because it looked at characters, not at the claim.
 *
 * 🔴 AND THE OBVIOUS FIX WOULD HAVE MADE IT WORSE. A naive port to the AST — "there
 * is a `strong` node whose text starts with 'Read'" — would have counted a live
 * card reading `**Read only at the abstract level.** Full text required before
 * submission`, i.e. it would have accepted known debt as completed work. The regex
 * rejected that card BY ACCIDENT — it required a colon right after the word. A
 * field removes the argument entirely: `read: abstract` is a legitimate value, not
 * a bad spelling.
 *
 * ── WHAT THIS RULE DOES NOT DO, AND THIS IS A DECISION ──────────────────────────
 * It does not replace CONTENT checks. A field is the author's claim about
 * themselves, and it cannot be verified: `refs_diffed: true` gets ticked without
 * the work being done. So the requirement "the card has a section analyzing the
 * bibliography" stays a separate heading-level check at the consumer. Only what
 * is already a claim (exactly what was read) becomes a field — not an artefact.
 *
 * ── BOUNDARIES ────────────────────────────────────────────────────────────────────
 * · A missing frontmatter is a FINDING, not an exemption. Otherwise the gate is
 *   bypassed by deleting the header; this family's predecessor already had that
 *   hole (a file with no `created` fell out of the check entirely).
 * · `sinceCreated` compares ISO strings — this is legitimate because the format is
 *   fixed and lexicographic order matches chronological order.
 */
import { load } from "js-yaml";

/**
 * `created` from YAML arrives either as a string or as a DATE — js-yaml recognizes
 * YAML 1.1 timestamps by default, and `created: 2026-07-29` without quotes becomes
 * a `Date` object. Comparing `Date < "2026-07-29"` silently gives `false`, meaning
 * the date gate would stop working and nobody would notice. Normalize to `YYYY-MM-DD`.
 */
function isoDate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}/.exec(v)?.[0] ?? "";
  return "";
}

export default {
  rules: {
    fields: {
      meta: {
        type: "problem",
        docs: {
          description:
            "a document declares its required frontmatter fields and their allowed values, instead of hinting at them with markup",
        },
        schema: [
          {
            type: "object",
            properties: {
              fields: {
                type: "object",
                additionalProperties: {
                  type: "object",
                  properties: {
                    values: { type: "array", items: { type: "string" }, minItems: 1 },
                    hint: { type: "string" },
                  },
                  additionalProperties: false,
                },
                minProperties: 1,
              },
              sinceCreated: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
            },
            required: ["fields"],
            additionalProperties: false,
          },
        ],
        messages: {
          noFrontmatter:
            "no frontmatter — a document of this class must declare the fields {{names}}. A missing header is not an exemption: otherwise the check is bypassed by deleting it.",
          malformed: "the frontmatter does not parse as YAML ({{why}}) — there is nothing to read the fields {{names}} from.",
          missing:
            "the frontmatter has no `{{name}}` field{{hint}}. Allowed values: {{values}}. A note in the body is not a field: markup describes presentation, not data.",
          badValue:
            "`{{name}}: {{actual}}` — value is not in the list. Allowed: {{values}}.",
        },
      },
      create(context) {
        const { fields, sinceCreated } = context.options[0] ?? {};
        const names = Object.keys(fields);
        let seenFrontmatter = false;

        return {
          yaml(node) {
            seenFrontmatter = true;
            let data;
            try {
              data = load(node.value ?? "");
            } catch (e) {
              context.report({
                node,
                messageId: "malformed",
                data: { why: e.reason ?? e.message ?? "unparseable", names: names.join(", ") },
              });
              return;
            }
            if (data === null || typeof data !== "object" || Array.isArray(data)) {
              context.report({
                node,
                messageId: "malformed",
                data: { why: "the header is not a key-value mapping", names: names.join(", ") },
              });
              return;
            }
            // The date gate stands HERE, not in `root:exit`: a document with no header has no
            // `created`, so it does not fall under the gate and must be a finding (see BOUNDARIES).
            const created = isoDate(data.created);
            if (sinceCreated && (!created || created < sinceCreated)) return;

            for (const [name, spec] of Object.entries(fields)) {
              const values = spec.values;
              const hint = spec.hint ? ` (${spec.hint})` : "";
              if (!(name in data) || data[name] === null || data[name] === "") {
                context.report({
                  node,
                  messageId: "missing",
                  data: { name, hint, values: values.join(" · ") },
                });
                continue;
              }
              const actual = String(data[name]);
              if (!values.includes(actual))
                context.report({
                  node,
                  messageId: "badValue",
                  data: { name, actual, values: values.join(" · ") },
                });
            }
          },
          "root:exit"(node) {
            if (seenFrontmatter) return;
            context.report({ node, messageId: "noFrontmatter", data: { names: names.join(", ") } });
          },
        };
      },
    },
  },
};
