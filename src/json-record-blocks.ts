/**
 * THE CONFIG BLOCKS OF THE JSON RECORDS — the files paperlint lints with ESLint's JSON language
 * (`@eslint/json`), so each finding lands at its field: a venue corpus's `papers.json`, the root
 * `paperlint.json` where a corpus without one is reported, and a paper's `revision-plan.json`. The JSON
 * language reaches no other file: these blocks alone name it. Each registers only the rules it turns
 * on, so a rule a consumer turns on reaches only the files its block claims (`narrowToOwners`).
 *
 * The JSON plugin comes in through `deps`: it is one tool's package, which only `src/cli.ts` imports.
 */
import { CORPUS_RECORD } from "./domain/venue-corpus.ts";
import { REVISION_PLAN } from "./domain/revision-plan.ts";
import { corpusJsonRules } from "./corpus-json-rules.ts";
import {
  CORPUS_LAYOUT_RULE_LEVELS,
  corpusLayoutRules,
  type CorpusLayoutDeps,
} from "./corpus-layout-rule.ts";
import {
  CORPUS_RECORD_RULE_LEVELS,
  type CorpusRecordDeps,
} from "./corpus-record-rule.ts";
import { revisionPlanRules } from "./revision-plan-rule.ts";
import {
  corpusFiles,
  paperFiles,
  rootSettingsFile,
  type PaperScope,
} from "./paper-files.ts";
import type { RevisionPlanCodec } from "./ports/revision-plan-codec.ts";
import type { ConfigBlock, ConfigPlugin, RuleBlock } from "./rules-config.ts";
import { basename } from "node:path";

/** What the blocks are built from. */
export interface JsonRecordDeps {
  /** ESLint's JSON language plugin. */
  readonly json: ConfigPlugin;
  readonly layout: Omit<CorpusLayoutDeps, "roots">;
  readonly corpus: CorpusRecordDeps;
  readonly plan: RevisionPlanCodec;
}

/** The rule that judges a paper's revision plan, off by default (`paperlint:revision-plan` turns it on). */
export const PLAN_RULE = "revision-plan/record";

/** Whether a rule entry (`"error"`, `2`, `["warn", {…}]`) turns the rule on. */
export const isOn = (entry: unknown): boolean => {
  const sev: unknown = Array.isArray(entry) ? entry[0] : entry;
  return sev !== undefined && sev !== "off" && sev !== 0;
};

/**
 * A venue corpus, `<papers-root>/venues/<venue>/`, reached through its `papers.json` (`corpus/record`
 * reports at the field, docs/design/venue-corpus.md decision 4); and the root `paperlint.json`, where
 * `corpus/allowed-files-only` reports a corpus that has no `papers.json`. `corpus/licence` is
 * registered with them and on for no corpus: `"warn"` in the root `paperlint.json` turns it on.
 */
const corpusBlocks = (
  papers: PaperScope,
  deps: JsonRecordDeps,
): readonly ConfigBlock[] => {
  const layout = corpusLayoutRules({
    ...deps.layout,
    roots: papers.kind === "papers" ? papers.roots : [],
  });
  const record = corpusJsonRules(deps.corpus);
  return [
    {
      files: corpusFiles(papers, CORPUS_RECORD),
      plugins: { json: deps.json, corpus: { rules: { ...record, ...layout } } },
      language: "json/json",
      rules: { ...CORPUS_RECORD_RULE_LEVELS, ...CORPUS_LAYOUT_RULE_LEVELS },
    },
    {
      files: rootSettingsFile(papers),
      plugins: { json: deps.json, corpus: { rules: layout } },
      language: "json/json",
      rules: CORPUS_LAYOUT_RULE_LEVELS,
    },
  ];
};

/**
 * A paper's `revision-plan.json`, with `revision-plan/record` registered and on for no paper. While no
 * block of `rules` turns the rule on, the file is not linted at all: a plan that is not even JSON would
 * otherwise get ESLint's parse error from a rule nobody turned on.
 */
const planBlocks = (
  papers: PaperScope,
  rules: readonly RuleBlock[],
  deps: JsonRecordDeps,
): readonly ConfigBlock[] => {
  const files = paperFiles(papers, REVISION_PLAN);
  return [
    {
      files,
      plugins: {
        json: deps.json,
        "revision-plan": { rules: revisionPlanRules(deps.plan) },
      },
      language: "json/json",
    },
    ...(files.length === 0 || rules.some((b) => isOn(b.rules[PLAN_RULE]))
      ? []
      : [{ ignores: [...files] }]),
  ];
};

/** Every JSON record's blocks, for the papers of `papers` and the consumer's `rules`. */
export const jsonRecordBlocks = (
  papers: PaperScope,
  rules: readonly RuleBlock[],
  deps: JsonRecordDeps,
): readonly ConfigBlock[] => [
  ...corpusBlocks(papers, deps),
  ...planBlocks(papers, rules, deps),
];

/** The JSON records among `files`, each once: the files a rule of these blocks is reached through. */
export const jsonRecords = (files: readonly string[]): readonly string[] => [
  ...new Set(
    files.filter((f) => [CORPUS_RECORD, REVISION_PLAN].includes(basename(f))),
  ),
];
