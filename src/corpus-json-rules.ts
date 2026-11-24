/** The rules that judge a venue corpus's `papers.json` (`corpus/record`, `corpus/licence`), as one plugin's rules. */
import { corpusLicenceRules } from "./corpus-licence-rule.ts";
import { basename } from "node:path";
import { CORPUS_RECORD } from "./domain/venue-corpus.ts";
import {
  corpusRecordRules,
  type CorpusRecordDeps,
  type JsonRuleModule,
} from "./corpus-record-rule.ts";

/** Both rules, reading the corpus through `deps`; which of them is on is the config's, not theirs. */
export const corpusJsonRules = (
  deps: CorpusRecordDeps,
): Readonly<Record<"record" | "licence", JsonRuleModule>> => ({
  ...corpusRecordRules(deps),
  ...corpusLicenceRules(deps),
});

/** The venue corpora's `papers.json` among `files`, each once: the files a corpus rule is reached through. */
export const corpusRecords = (files: readonly string[]): readonly string[] => [
  ...new Set(files.filter((f) => basename(f) === CORPUS_RECORD)),
];
