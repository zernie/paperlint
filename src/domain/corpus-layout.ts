/**
 * THE LAYOUT OF A VENUE CORPUS — what may stand at the top of `<papers-root>/venues/<venue>/`
 * (docs/design/venue-corpus.md, decision 5; docs/rules/corpus/allowed-files-only.md): the record,
 * its caveats, the codes, the stored copies, the deep reads and the pages as they were read. Every
 * other name is reported with where it goes; what the operating system and interpreters leave (the
 * lists `paper-layout.ts` and `repro-layout.ts` never report) is never reported. Only the top is
 * judged: `pdf/` and `text/` are `corpus/record`'s. Pure: the caller lists the folder.
 */
import { extname } from "node:path";
import { leaf, renderTree } from "./layout-tree.ts";
import {
  IMAGE_EXTENSIONS,
  OS_FILES,
  type LayoutEntry,
} from "./paper-layout.ts";
import {
  DATA_EXTENSIONS,
  NOTE_EXTENSIONS,
  REPRO_BYPRODUCTS,
  SCRIPT_EXTENSIONS,
  TOOL_FILES,
} from "./repro-layout.ts";
import { CORPUS_RECORD } from "./venue-corpus.ts";

/** The names a corpus may hold at its top, files then folders, each with what it holds. */
const FILE_NOTES: readonly (readonly [string, string])[] = [
  [CORPUS_RECORD, "the record: every paper, each copy of it and its licence"],
  ["MANIFEST.md", "optional: caveats only, the prose no field holds"],
  ["measurements.json", "the codes of L0 and L1, one row per paper, by key"],
];
const DIR_NOTES: readonly (readonly [string, string])[] = [
  ["pdf", "pdf/<key>.pdf, when a copy's licence permits it"],
  ["text", "text/<key>.txt and text/<key>.<variant>.txt"],
  ["deep-reads", "deep-reads/<key>.md, one per paper read in full"],
  ["sources", "the listing and call pages as they were read"],
];

/** The drawing of a corpus's layout: the rule's message and its page. */
export const CORPUS_LAYOUT_TREE: string = renderTree(
  "<papers-root>/venues/<venue>/",
  [
    ...FILE_NOTES.map(([name, note]) => leaf(name, note)),
    ...DIR_NOTES.map(([name, note]) => leaf(`${name}/`, note)),
  ],
);

/** Where a folder goes, and a file of a kind no other cure names. */
export const DIR_CURE =
  "copies of papers into pdf/ or text/, each claimed in papers.json; saved pages into sources/; notes on one paper into deep-reads/<key>.md";
export const FILE_CURE = `decide by what it is — ${DIR_CURE}; caveats into MANIFEST.md`;

/** For a stray file, the place its name or extension says, the first match winning. */
export const FILE_CURES: readonly {
  readonly names: readonly string[];
  readonly extensions: readonly string[];
  readonly cure: string;
}[] = [
  {
    names: [],
    extensions: [".pdf"],
    cure: "pdf/<key>.pdf, claimed by its copy in papers.json",
  },
  {
    names: [],
    extensions: [".txt"],
    cure: "text/<key>.txt, claimed by its copy in papers.json",
  },
  {
    names: [],
    extensions: NOTE_EXTENSIONS,
    cure: "MANIFEST.md when it is a caveat about the whole corpus; deep-reads/<key>.md when it is about one paper",
  },
  {
    names: TOOL_FILES,
    extensions: SCRIPT_EXTENSIONS,
    cure: "out of the corpus: the paper's repro/tools/, and the command that runs it into papers.json's `rebuild`",
  },
  {
    names: [],
    extensions: DATA_EXTENSIONS,
    cure: "its rows into papers.json (the papers) or measurements.json (their codes); the list as it was downloaded into sources/",
  },
  {
    names: [],
    extensions: [".html", ".htm", ".mhtml", ...IMAGE_EXTENSIONS],
    cure: "sources/, beside the other pages as they were read",
  },
];

/** An entry at the top of a corpus that is not one of its names (a folder's ends in a slash), with where it goes. */
export interface CorpusStray {
  readonly name: string;
  readonly cure: string;
}

const isAllowed = (e: LayoutEntry): boolean =>
  OS_FILES.includes(e.name) ||
  REPRO_BYPRODUCTS.includes(e.name) ||
  (e.kind === "dir" ? DIR_NOTES : FILE_NOTES).some(([n]) => n === e.name);

const fileCure = (name: string): string =>
  FILE_CURES.find(
    (c) =>
      c.names.includes(name) ||
      c.extensions.includes(extname(name).toLowerCase()),
  )?.cure ?? FILE_CURE;

/** The entries at the top of a corpus that are not part of its layout, in the order given. Pure. */
export const judgeCorpusLayout = (
  entries: readonly LayoutEntry[],
): readonly CorpusStray[] =>
  entries
    .filter((e) => !isAllowed(e))
    .map((e) =>
      e.kind === "dir"
        ? { name: `${e.name}/`, cure: DIR_CURE }
        : { name: e.name, cure: fileCure(e.name) },
    );

/** Whether a corpus stores copies (`pdf/` or `text/`) and has no `papers.json` to record them. Pure. */
export const storesWithoutRecord = (entries: readonly LayoutEntry[]): boolean =>
  entries.some((e) => e.kind === "dir" && ["pdf", "text"].includes(e.name)) &&
  !entries.some((e) => e.kind === "file" && e.name === CORPUS_RECORD);

const RULE_LINE =
  "Rule corpus/allowed-files-only: https://github.com/zernie/paperlint/blob/main/docs/rules/corpus/allowed-files-only.md";

/** The text a stray is reported with; `corpus` is the corpus folder as the reader sees it. */
export const corpusStrayMessage = (corpus: string, s: CorpusStray): string =>
  [
    `\`${corpus}/${s.name}\` is not one of the names a venue corpus holds. Where it goes: ${s.cure}.`,
    "What a corpus holds (.DS_Store and what interpreters leave, like __pycache__/, are never reported):",
    CORPUS_LAYOUT_TREE,
    RULE_LINE,
  ].join("\n");

/** The text a corpus that stores copies without its record is reported with. */
export const unrecordedMessage = (corpus: string): string =>
  `\`${corpus}/\` stores copies in pdf/ or text/ and has no ${CORPUS_RECORD}, so nothing records which paper each file is a copy of, or under which licence it is kept. What to do: write ${corpus}/${CORPUS_RECORD} (study-accepted-papers writes it; its fields are in papers.schema.json), or remove pdf/ and text/ and keep the papers' ids. ${RULE_LINE}`;
