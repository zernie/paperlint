/**
 * `revision-plan/record` — a paper's `revision-plan.json` is a plan: every field the shape names, no
 * other, each of the right kind, each row's id its own (docs/rules/revision-plan/record.md). What a
 * plan is lives in `src/domain/revision-plan.ts`; this file parses the text through the codec and
 * reports each problem at its field, walked down ESLint's JSON tree as `corpus/record` does.
 *
 * Off by default and in the set `paperlint:revision-plan` (src/rule-sets.ts), which turns it on at
 * `warn`: a plan is a way of working an author chooses, not a fact of the venue. A paper without the
 * file has nothing for it to read, and it says nothing.
 */
import { spanAt, type JsonRuleModule } from "./corpus-record-rule.ts";
import { planProblemText } from "./domain/revision-plan.ts";
import type { FolderRuleModule } from "./folder-venue-rule.ts";
import type { RevisionPlanCodec } from "./ports/revision-plan-codec.ts";
import { rulePageUrl } from "./venue-rules.ts";

const META: FolderRuleModule["meta"] = {
  type: "suggestion",
  docs: {
    description:
      "a paper's revision-plan.json holds the fields of a revision plan and no other, each of the right kind, each row with its own id",
    url: rulePageUrl("revision-plan/record"),
  },
  schema: [],
  messages: { unparsed: "{{text}}" },
};

/** The rule, parsing the plan through `codec`. */
export function revisionPlanRules(
  codec: RevisionPlanCodec,
): Readonly<Record<"record", JsonRuleModule>> {
  return {
    record: {
      meta: META,
      create(context) {
        return {
          Document() {
            const { text, ast } = context.sourceCode;
            const parsed = codec.parse(text);
            if (parsed.ok) return;
            parsed.problems.forEach((p) => {
              context.report({
                loc: spanAt(ast, p.path),
                messageId: "unparsed",
                data: { text: planProblemText(p) },
              });
            });
          },
        };
      },
    },
  };
}
