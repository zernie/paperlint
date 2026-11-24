/**
 * `corpus/record` — every copy a venue corpus stores in `pdf/` and `text/` is accounted for by its
 * `papers.json` (docs/design/venue-corpus.md, decision 4; docs/rules/corpus/record.md). What is
 * judged is `src/domain/corpus-record.ts`; this file reads the record through the codec, lists the
 * corpus, and reports.
 *
 * ── WHERE IT REPORTS ─────────────────────────────────────────────────────────────
 * On `<papers-root>/venues/<venue>/papers.json`, which `buildConfig` lints with ESLint's JSON
 * language (`@eslint/json`): each finding at the field its path names, walked down the file's JSON
 * tree; where the path stops being in the file (a required field left out), at the deepest part
 * that is. A file that is not JSON never reaches the rule: ESLint reports its parse error. A corpus
 * folder without `papers.json` has no file to report on, and this rule says nothing about it:
 * `corpus/allowed-files-only` reports it on the root `paperlint.json` (src/corpus-layout-rule.ts).
 */
import { basename, dirname, join } from "node:path";
import { callerPath } from "./caller-path.ts";
import {
  corpusMessage,
  judgeCorpus,
  type CorpusFinding,
} from "./domain/corpus-record.ts";
import type { RecordPath } from "./domain/venue-corpus.ts";
import type { FolderRuleModule } from "./folder-venue-rule.ts";
import type { ListEntries } from "./ports/list-entries.ts";
import type { VenueCorpusCodec } from "./ports/venue-corpus-codec.ts";
import { rulePageUrl } from "./venue-rules.ts";

/** What the rule reads with. */
export interface CorpusRecordDeps {
  readonly entries: ListEntries;
  readonly codec: VenueCorpusCodec;
}

interface Position {
  readonly line: number;
  readonly column: number;
}

/** A span of the file, as ESLint's JSON language gives it. */
interface Span {
  readonly start: Position;
  readonly end: Position;
}

/** A node of ESLint's JSON tree, as far as walking a path needs: an object's members, an array's elements. */
interface JsonNode {
  readonly loc: Span;
  readonly members?: readonly {
    readonly loc: Span;
    readonly name: { readonly value: string };
    readonly value: JsonNode;
  }[];
  readonly elements?: readonly {
    readonly loc: Span;
    readonly value: JsonNode;
  }[];
}

/** The tree of the whole file. */
interface JsonDocument {
  readonly loc: Span;
  readonly body: JsonNode;
}

/** What the rule uses of ESLint's context on a JSON file. */
export interface JsonRuleContext {
  readonly filename: string;
  readonly sourceCode: { readonly text: string; readonly ast: JsonDocument };
  report(d: {
    readonly loc: Span;
    readonly messageId: string;
    readonly data: Readonly<Record<string, string>>;
  }): void;
}

export interface JsonRuleModule {
  readonly meta: FolderRuleModule["meta"];
  create(context: JsonRuleContext): { Document?: () => void };
}

/** Where the walk is: the node reached and the span to report, or only the span once the path left the file. */
interface Walk {
  readonly node: JsonNode | null;
  readonly loc: Span;
}

/**
 * One step of a path: a key to the member of that name (the last of them, as `JSON.parse` keeps it),
 * whose whole `"key": value` is reported; an index to that element.
 */
const step = (at: Walk, segment: string | number): Walk => {
  const next =
    typeof segment === "number"
      ? at.node?.elements?.[segment]
      : at.node?.members?.findLast((m) => m.name.value === segment);
  return next === undefined
    ? { node: null, loc: at.loc }
    : { node: next.value, loc: next.loc };
};

/** The span of the field `path` names; the whole file for an empty path. */
export const spanAt = (doc: JsonDocument, path: RecordPath): Span =>
  path.reduce<Walk>(step, { node: doc.body, loc: doc.loc }).loc;

/** The entries of `dir` a person put there: hidden ones (`.DS_Store`, `.gitkeep`) are not copies. */
const visible = (dir: string, deps: CorpusRecordDeps): readonly string[] =>
  deps
    .entries(callerPath(dir))
    .filter((e) => !e.name.startsWith("."))
    .map((e) => e.name)
    .toSorted((a, b) => a.localeCompare(b));

/** The findings about the corpus whose `papers.json` is `file`, holding `text`. */
const findingsFor = (
  file: string,
  text: string,
  deps: CorpusRecordDeps,
): readonly CorpusFinding[] =>
  judgeCorpus({
    folder: basename(dirname(file)),
    record: deps.codec.parse(text),
    stored: {
      pdf: visible(join(dirname(file), "pdf"), deps),
      text: visible(join(dirname(file), "text"), deps),
    },
  });

const META: FolderRuleModule["meta"] = {
  type: "suggestion",
  docs: {
    description:
      "a venue corpus's papers.json is a record that names its own folder as its venue, every copy stored in pdf/ and text/ is claimed by one copy in it, and every claimed file is there",
    url: rulePageUrl("corpus/record"),
  },
  schema: [],
  // One id per finding, each with the whole text of `corpusMessage`.
  messages: Object.fromEntries(
    (
      [
        "unparsed",
        "venue",
        "unclaimed",
        "missing",
        "twice",
      ] satisfies readonly CorpusFinding["kind"][]
    ).map((id) => [id, "{{text}}"]),
  ),
};

/** The rule, reading the corpus through `deps`. */
export function corpusRecordRules(
  deps: CorpusRecordDeps,
): Readonly<Record<"record", JsonRuleModule>> {
  return {
    record: {
      meta: META,
      create(context) {
        return {
          Document() {
            const { text, ast } = context.sourceCode;
            findingsFor(context.filename, text, deps).forEach((f) => {
              context.report({
                loc: spanAt(ast, f.at),
                messageId: f.kind,
                data: { text: corpusMessage(f) },
              });
            });
          },
        };
      },
    },
  };
}

/** On by default, on every corpus's `papers.json`. */
export const CORPUS_RECORD_RULE_LEVELS: Readonly<
  Record<"corpus/record", "error">
> = { "corpus/record": "error" };
