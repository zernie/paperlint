/**
 * `corpus/record` — every copy a venue corpus stores in `pdf/` and `text/` is accounted for by its
 * `papers.json` (docs/design/venue-corpus.md, decision 4; docs/rules/corpus/record.md). What is
 * judged is `src/domain/corpus-record.ts`; this file lists the corpus, reads the record through the
 * codec, and reports.
 *
 * ── WHERE IT REPORTS ─────────────────────────────────────────────────────────────
 * A rule runs only for a file ESLint lints, and a corpus folder is not one. Two anchors:
 *   - `<papers-root>/venues/<venue>/MANIFEST.md`, which `buildConfig` lints for this rule alone:
 *     the findings about that corpus, on its first line.
 *   - the `PIPELINE-STATUS.md` of the first paper (by name) in a papers root: a folder under that
 *     root's `venues/` that holds a corpus (`papers.json`, `pdf/`, `text/`) and no `MANIFEST.md`,
 *     which no block can reach. Once per root, not once per paper; the listing is the one the
 *     layout rule (`src/folder-layout-rule.ts`) uses for a paper folder's strays.
 */
import { basename, dirname, join, resolve } from "node:path";
import { callerPath } from "./caller-path.ts";
import {
  CORPORA_DIR,
  CORPUS_MANIFEST,
  corpusMarkers,
  corpusMessage,
  judgeCorpus,
  type CorpusFinding,
  type RecordState,
} from "./domain/corpus-record.ts";
import { STATUS_FILE } from "./domain/paper-folder.ts";
import { CORPUS_RECORD } from "./domain/venue-corpus.ts";
import type {
  FolderRuleContext,
  FolderRuleModule,
} from "./folder-venue-rule.ts";
import type { Files } from "./ports/files.ts";
import type { DirEntry, ListEntries } from "./ports/list-entries.ts";
import type { VenueCorpusCodec } from "./ports/venue-corpus-codec.ts";
import { rulePageUrl } from "./venue-rules.ts";

/** What the rule reads with, and the papers roots whose `venues/` it looks in (absolute). */
export interface CorpusRecordDeps {
  readonly files: Files;
  readonly entries: ListEntries;
  readonly codec: VenueCorpusCodec;
  readonly roots: readonly string[];
}

/** The entries of `dir` a person put there: hidden ones (`.DS_Store`, `.gitkeep`) are not copies. */
const visible = (dir: string, deps: CorpusRecordDeps): readonly DirEntry[] =>
  deps
    .entries(callerPath(dir))
    .filter((e) => !e.name.startsWith("."))
    .toSorted((a, b) => a.name.localeCompare(b.name));

/** `papers.json` of the corpus in `dir`, parsed once by the codec. */
function recordOf(dir: string, deps: CorpusRecordDeps): RecordState {
  const at = callerPath(join(dir, CORPUS_RECORD));
  const bytes = deps.files.isFile(at) ? deps.files.readBytes(at) : null;
  if (bytes === null) return { kind: "absent" };
  const parsed = deps.codec.parse(new TextDecoder().decode(bytes));
  return parsed.ok
    ? { kind: "read", corpus: parsed.corpus }
    : { kind: "unreadable", why: parsed.why };
}

/** The findings about the corpus whose `MANIFEST.md` is in `dir`. */
const corpusFindings = (
  dir: string,
  deps: CorpusRecordDeps,
): readonly CorpusFinding[] =>
  judgeCorpus({
    record: recordOf(dir, deps),
    stored: {
      pdf: visible(join(dir, "pdf"), deps).map((e) => e.name),
      text: visible(join(dir, "text"), deps).map((e) => e.name),
    },
  });

/** The folders of a papers root that are papers, as the anchor counts them: those with a scorecard. */
const papersOf = (root: string, deps: CorpusRecordDeps): readonly string[] =>
  visible(root, deps)
    .filter(
      (e) =>
        e.kind === "dir" &&
        deps.files.isFile(callerPath(join(root, e.name, STATUS_FILE))),
    )
    .map((e) => e.name);

/** The corpora of the root holding the paper in `dir` that have no `MANIFEST.md`, when `dir` is its first paper. */
function unanchored(
  dir: string,
  deps: CorpusRecordDeps,
): readonly CorpusFinding[] {
  const root = dirname(dir);
  if (!deps.roots.some((r) => resolve(r) === root)) return [];
  if (papersOf(root, deps)[0] !== basename(dir)) return [];
  const corpora = join(root, CORPORA_DIR);
  return visible(corpora, deps)
    .filter((e) => e.kind === "dir")
    .map((e) => ({
      folder: `${CORPORA_DIR}/${e.name}`,
      entries: visible(join(corpora, e.name), deps),
    }))
    .filter((c) => !c.entries.some((e) => e.name === CORPUS_MANIFEST))
    .map((c) => ({ ...c, markers: corpusMarkers(c.entries) }))
    .filter((c) => c.markers.length > 0)
    .map((c) => ({
      kind: "no-manifest",
      folder: c.folder,
      markers: c.markers,
    }));
}

/**
 * The findings for the file ESLint handed the rule: a corpus's `MANIFEST.md`, or a paper's
 * `PIPELINE-STATUS.md` (the only two files the config registers the rule for).
 */
const findingsFor = (
  file: string,
  deps: CorpusRecordDeps,
): readonly CorpusFinding[] =>
  basename(file) === CORPUS_MANIFEST
    ? corpusFindings(dirname(file), deps)
    : unanchored(dirname(file), deps);

const META: FolderRuleModule["meta"] = {
  type: "suggestion",
  docs: {
    description:
      "every copy a venue corpus stores in pdf/ and text/ is claimed by one copy in its papers.json, and every claimed file is there",
    url: rulePageUrl("corpus/record"),
  },
  schema: [],
  // One id per finding, each with the whole text of `corpusMessage`.
  messages: Object.fromEntries(
    (
      [
        "no-record",
        "unparsed",
        "unclaimed",
        "missing",
        "twice",
        "no-manifest",
      ] satisfies readonly CorpusFinding["kind"][]
    ).map((id) => [id, "{{text}}"]),
  ),
};

/** The rule, reading the corpus through `deps`. */
export function corpusRecordRules(
  deps: CorpusRecordDeps,
): Readonly<Record<"record", FolderRuleModule>> {
  return {
    record: {
      meta: META,
      create(context: FolderRuleContext) {
        return {
          root() {
            const at = context.sourceCode.getLocFromIndex(0);
            findingsFor(context.filename, deps).forEach((f) => {
              context.report({
                loc: { start: at, end: at },
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

/** On by default, on every corpus's `MANIFEST.md` and every paper's `PIPELINE-STATUS.md`. */
export const CORPUS_RECORD_RULE_LEVELS: Readonly<
  Record<"corpus/record", "error">
> = { "corpus/record": "error" };
