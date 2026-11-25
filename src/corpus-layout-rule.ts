/**
 * `corpus/allowed-files-only` — the top of a venue corpus holds its seven fixed names, and a corpus
 * that stores copies has the record that names them (docs/design/venue-corpus.md, decisions 4 and 5;
 * docs/rules/corpus/allowed-files-only.md). What may stand there is `src/domain/corpus-layout.ts`;
 * this file lists the folders and reports.
 *
 * ── WHERE IT REPORTS ─────────────────────────────────────────────────────────────
 * A stray name: on the corpus's `papers.json`, first line, the file `corpus/record` is linted on. A
 * corpus that keeps `pdf/` or `text/` and has no `papers.json` has no file of its own: it is reported
 * on the project's root `paperlint.json`, which `paperlint lint` lints only when a papers root holds
 * `venues/` (src/cli.ts). Both are linted with ESLint's JSON language; no other file reaches the rule.
 */
import { basename, dirname, join, relative, sep } from "node:path";
import { callerPath } from "./caller-path.ts";
import type { JsonRuleContext, JsonRuleModule } from "./corpus-record-rule.ts";
import {
  corpusStrayMessage,
  judgeCorpusLayout,
  judgeVenues,
  looseMessage,
  storesWithoutRecord,
  unrecordedMessage,
} from "./domain/corpus-layout.ts";
import { CORPORA_DIR } from "./domain/corpus-record.ts";
import type { LayoutEntry } from "./domain/paper-layout.ts";
import { CORPUS_RECORD } from "./domain/venue-corpus.ts";
import type { FolderLayoutDeps } from "./folder-layout-rule.ts";
import { rulePageUrl } from "./venue-rules.ts";

/** What the rule reads with: the disk, and the papers roots whose `venues/` hold the corpora. */
export interface CorpusLayoutDeps extends FolderLayoutDeps {
  readonly roots: readonly string[];
}

/** The entries of `dir`, sorted, each a file or a folder; none when it does not exist. */
const entriesOf = (
  dir: string,
  deps: FolderLayoutDeps,
): readonly LayoutEntry[] =>
  [...deps.listDir(callerPath(dir))].sort().map((name) => ({
    name,
    kind: deps.files.isFile(callerPath(join(dir, name))) ? "file" : "dir",
  }));

/** The text of each stray at the top of the corpus whose `papers.json` is `file`. */
const strayTexts = (
  file: string,
  deps: FolderLayoutDeps,
): readonly string[] => {
  const dir = dirname(file);
  const shown = `${CORPORA_DIR}/${basename(dir)}`;
  return judgeCorpusLayout(entriesOf(dir, deps)).map((s) =>
    corpusStrayMessage(shown, s),
  );
};

/** The text of each corpus under `deps.roots` that stores copies with no record, shown from `home`. */
const unrecordedTexts = (
  home: string,
  deps: CorpusLayoutDeps,
): readonly string[] =>
  deps.roots
    .map((r) => join(r, CORPORA_DIR))
    .flatMap((venues) =>
      entriesOf(venues, deps)
        .filter((e) => e.kind === "dir")
        .map((e) => join(venues, e.name)),
    )
    .filter((corpus) => storesWithoutRecord(entriesOf(corpus, deps)))
    .map((corpus) =>
      unrecordedMessage(relative(home, corpus).split(sep).join("/")),
    );

/** The text of each file loose in a `venues/` under `deps.roots`, shown from `home`. */
const looseTexts = (home: string, deps: CorpusLayoutDeps): readonly string[] =>
  deps.roots
    .map((r) => join(r, CORPORA_DIR))
    .flatMap((venues) =>
      judgeVenues(entriesOf(venues, deps)).map((name) =>
        looseMessage(relative(home, venues).split(sep).join("/"), name),
      ),
    );

/**
 * Each finding about the file being linted, by its message id. The config hands the rule two files
 * only (src/cli.ts): a corpus's `papers.json`, and the root settings file.
 */
const findingsFor = (
  file: string,
  deps: CorpusLayoutDeps,
): readonly { readonly id: string; readonly text: string }[] =>
  basename(file) === CORPUS_RECORD
    ? strayTexts(file, deps).map((text) => ({ id: "stray", text }))
    : [
        ...unrecordedTexts(dirname(file), deps).map((text) => ({
          id: "unrecorded",
          text,
        })),
        ...looseTexts(dirname(file), deps).map((text) => ({
          id: "loose",
          text,
        })),
      ];

const META: JsonRuleModule["meta"] = {
  type: "suggestion",
  docs: {
    description:
      "the top of a venue corpus holds papers.json, MANIFEST.md, measurements.json, pdf/, text/, deep-reads/ and sources/, a corpus that stores copies has its papers.json, and venues/ holds only corpus folders and its index",
    url: rulePageUrl("corpus/allowed-files-only"),
  },
  schema: [],
  // The whole text is the domain's message (src/domain/corpus-layout.ts).
  messages: { stray: "{{text}}", unrecorded: "{{text}}", loose: "{{text}}" },
};

/** The rule, reading the corpora through `deps`. */
export function corpusLayoutRules(
  deps: CorpusLayoutDeps,
): Readonly<Record<"allowed-files-only", JsonRuleModule>> {
  return {
    "allowed-files-only": {
      meta: META,
      create(context: JsonRuleContext) {
        return {
          Document() {
            const at = context.sourceCode.ast.loc.start;
            findingsFor(context.filename, deps).forEach(({ id, text }) => {
              context.report({
                loc: { start: at, end: at },
                messageId: id,
                data: { text },
              });
            });
          },
        };
      },
    },
  };
}

/**
 * On by default, on every corpus's `papers.json` and the root `paperlint.json`, at `warn`: a corpus
 * folder made before `papers.json` existed is a migration to do, not a broken build. Raising it to
 * `error` is a major release.
 */
export const CORPUS_LAYOUT_RULE_LEVELS: Readonly<
  Record<"corpus/allowed-files-only", "warn">
> = { "corpus/allowed-files-only": "warn" };
