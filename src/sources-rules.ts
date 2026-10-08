/**
 * `paper/sources-fresh` — the one finding for a paper whose build record cannot be used
 * (docs/design/paper-sources.md §1, docs/rules/paper/sources-fresh.md). Every rule that needs to know
 * which files make up the paper, or which bibliography TeX reads, reads `_build/sources.json`
 * (`paperRecord`, `src/paper-record.ts`); when there is none, or the paper has changed since, they
 * are silent and this rule speaks once instead:
 *
 *   no record                      "not built" — run `npx paperlint build`
 *   a record this paperlint cannot read   the reason, and the same command
 *   a file changed since the build  which files, and the same command
 *
 * A warning, not an error, for the reason `pdf/measured` is one: lint often runs where nothing is
 * built (the CI action only lints). Each message says what stays unchecked until a build: the files
 * `paper.tex` includes are not linted, and the rules over the bibliography say nothing.
 */
import { basename, dirname } from "node:path";
import { callerPath } from "./caller-path.ts";
import { describeChanges } from "./domain/sources-record.ts";
import { MAIN_FILE } from "./domain/paper-sources.ts";
import { paperRecord, type RecordReadDeps } from "./paper-record.ts";

/** One finding: its message, and the values the message names. */
interface Finding {
  readonly messageId: string;
  readonly data?: Readonly<Record<string, string>>;
}

interface Loc {
  readonly line: number;
  readonly column: number;
}
interface RuleContext {
  readonly filename: string;
  readonly sourceCode: { getLocFromIndex(i: number): Loc };
  report(
    d: Finding & { readonly loc: Readonly<{ start: Loc; end: Loc }> },
  ): void;
}
export interface SourcesRuleModule {
  readonly meta: {
    readonly type: "problem" | "suggestion";
    readonly docs: {
      readonly description: string;
      readonly url: string;
    };
    readonly schema: readonly object[];
    readonly messages: Readonly<Record<string, string>>;
  };
  create(context: RuleContext): { "root:exit"?: () => void };
}

const BUILD = "`npx paperlint build`";
const UNTIL =
  "until then the files `paper.tex` includes are not linted, and the rules that read the bibliography say nothing";

const META: SourcesRuleModule["meta"] = {
  type: "problem",
  docs: {
    description:
      "the build recorded which files TeX read, and the paper has not changed since (_build/sources.json)",
    url: "https://github.com/zernie/paperlint/blob/main/docs/rules/paper/sources-fresh.md",
  },
  schema: [],
  messages: {
    notBuilt: `the paper has not been built — run ${BUILD}, which records the files TeX reads. Until it has, the files \`paper.tex\` includes are not linted, and the rules that read the bibliography say nothing`,
    unreadable: `the last build's record cannot be used ({{why}}) — run ${BUILD}; ${UNTIL}`,
    stale: `the paper changed since the last build ({{changed}}) — run ${BUILD}; ${UNTIL}`,
  },
};

/** The finding for a paper's record, or none when it is current. */
function findingFor(dir: string, deps: RecordReadDeps): Finding | null {
  const r = paperRecord(dir, deps);
  switch (r.kind) {
    case "none":
      return r.unreadable === null
        ? { messageId: "notBuilt" }
        : { messageId: "unreadable", data: { why: r.unreadable } };
    case "stale":
      return {
        messageId: "stale",
        data: { changed: describeChanges(r.changed) },
      };
    case "fresh":
      return null;
  }
}

/** `paper/sources-fresh`, reading the paper through `deps`. It acts on `paper.tex` only. */
export function sourcesRules(
  deps: RecordReadDeps,
): Readonly<Record<"sources-fresh", SourcesRuleModule>> {
  return {
    "sources-fresh": {
      meta: META,
      create: (context) =>
        basename(context.filename) !== MAIN_FILE
          ? {}
          : {
              "root:exit": () => {
                const f = findingFor(
                  dirname(callerPath(context.filename)),
                  deps,
                );
                if (f === null) return;
                const at = context.sourceCode.getLocFromIndex(0);
                context.report({ loc: { start: at, end: at }, ...f });
              },
            },
    },
  };
}

/** The level it is on at for every `paper.tex` in paperlint's own config. */
export const SOURCES_RULE_LEVELS = {
  "paper/sources-fresh": "warn",
} as const;
