/**
 * `corpus/licence` — the licence of each copy a venue corpus stores permits keeping it
 * (docs/design/venue-corpus.md, decisions 3 and 4; docs/rules/corpus/licence.md). OFF by default and
 * in no rule set: the same files are legal in a private repository and illegal in a public one, and
 * the rule cannot tell which it is in. What is judged is `src/domain/corpus-licence.ts`, which asks
 * the table in `src/domain/licence.ts`; this file reads the record through the codec, reads the
 * rule's one option, and reports.
 *
 * ── WHERE IT REPORTS ─────────────────────────────────────────────────────────────
 * On `<papers-root>/venues/<venue>/papers.json`, at the `stored` of the copy each finding is about
 * (the same location technique as `corpus/record`, `spanAt`). A record that does not parse has
 * findings of `corpus/record`'s and none of this rule's.
 *
 * ── THE OPTION ───────────────────────────────────────────────────────────────────
 * `"corpus/licence": ["warn", { "nonCommercial": true }]` in the root `paperlint.json`: the project
 * declares itself non-commercial, which makes a non-commercial licence permit storing. The
 * default is false: paperlint does not assume it.
 */
import { spanAt, type JsonRuleModule } from "./corpus-record-rule.ts";
import {
  judgeLicences,
  licenceMessage,
  type Refusal,
} from "./domain/corpus-licence.ts";
import type { VenueCorpusCodec } from "./ports/venue-corpus-codec.ts";
import { rulePageUrl } from "./venue-rules.ts";

/** What the rule reads with. */
export interface CorpusLicenceDeps {
  readonly codec: VenueCorpusCodec;
}

/** The option, as ESLint's schema validated it: `nonCommercial` is a boolean or absent. */
const nonCommercial = (options: readonly unknown[]): boolean => {
  const [first] = options;
  return (
    typeof first === "object" &&
    first !== null &&
    "nonCommercial" in first &&
    first.nonCommercial === true
  );
};

const META: JsonRuleModule["meta"] = {
  type: "suggestion",
  docs: {
    description:
      "each copy a venue corpus stores has a licence that permits keeping that file (opt-in: the same files are legal in a private repository and illegal in a public one)",
    url: rulePageUrl("corpus/licence"),
  },
  schema: [
    {
      type: "object",
      properties: { nonCommercial: { type: "boolean" } },
      additionalProperties: false,
    },
  ],
  // One id per kind of refusal, each with the whole text of `licenceMessage`.
  messages: {
    "not-read": "{{text}}",
    unlisted: "{{text}}",
    forbidden: "{{text}}",
    "non-commercial-only": "{{text}}",
  } satisfies Record<Refusal["kind"], string>,
};

/** The rule, reading each record through `deps.codec`. */
export function corpusLicenceRules(
  deps: CorpusLicenceDeps,
): Readonly<Record<"licence", JsonRuleModule>> {
  return {
    licence: {
      meta: META,
      create(context) {
        return {
          Document() {
            const { text, ast } = context.sourceCode;
            const record = deps.codec.parse(text);
            if (!record.ok) return;
            judgeLicences(record.corpus, {
              nonCommercial: nonCommercial(context.options),
            }).forEach((f) => {
              context.report({
                loc: spanAt(ast, f.at),
                messageId: f.refusal.kind,
                data: { text: licenceMessage(f) },
              });
            });
          },
        };
      },
    },
  };
}
