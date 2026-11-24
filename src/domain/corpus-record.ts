/**
 * `corpus/record`'s judgement of one venue corpus (docs/design/venue-corpus.md, decisions 4–6;
 * docs/rules/corpus/record.md): whether every copy stored in `pdf/` and `text/` is accounted for by
 * `papers.json`. Pure: the folder's listing and the record, already parsed by the codec, in; the
 * findings out. What the record's fields mean is `venue-corpus.ts`; this file never re-checks them.
 *
 * A stored file's path follows from its paper's `key` (decision 5): `pdf/<key>.pdf`,
 * `text/<key>.txt` and `text/<key>.<variant>.txt`. The folder is named after the kind it holds.
 */
import { STORED_KINDS, type StoredKind } from "./licence.ts";
import {
  CORPUS_RECORD,
  KEY_PATTERN,
  pathText,
  type Paper,
  type ParsedCorpus,
  type RecordPath,
  type VenueCorpus,
} from "./venue-corpus.ts";

/** The folder in a papers root that holds one corpus per venue. */
export const CORPORA_DIR = "venues";

/** What the rule reads of one corpus folder. */
export interface CorpusFolder {
  /** `papers.json`, as the codec parsed it. */
  readonly record: ParsedCorpus;
  /** The names in `pdf/` and in `text/`, hidden ones left out; none when the folder is absent. */
  readonly stored: Readonly<Record<StoredKind, readonly string[]>>;
}

/**
 * One finding, with `at`, the path in `papers.json` it is reported at (empty: the whole file);
 * `file` is relative to the corpus folder.
 */
export type CorpusFinding = { readonly at: RecordPath } & (
  | { readonly kind: "unparsed"; readonly message: string }
  | {
      readonly kind: "unclaimed";
      readonly file: string;
      readonly key: string | null;
    }
  | {
      readonly kind: "missing";
      readonly key: string;
      readonly stored: StoredKind;
      readonly file: string;
    }
  | {
      readonly kind: "twice";
      readonly key: string;
      readonly stored: StoredKind;
      readonly copies: readonly number[];
    }
);

const keyOrNull = (key: string): string | null =>
  KEY_PATTERN.test(key) ? key : null;

/** The key a stored file's name belongs to, or null when the name is not one a copy can store. */
export function storedKey(kind: StoredKind, name: string): string | null {
  switch (kind) {
    case "pdf":
      return name.endsWith(".pdf") ? keyOrNull(name.slice(0, -4)) : null;
    case "text": {
      if (!name.endsWith(".txt")) return null;
      const [key = "", ...variant] = name.slice(0, -4).split(".");
      return variant.length > 0 && variant.join(".") === ""
        ? null
        : keyOrNull(key);
    }
  }
}

/** The extension of a stored kind's file. */
const EXTENSION: Readonly<Record<StoredKind, string>> = {
  pdf: "pdf",
  text: "txt",
};

/** The name the record expects a paper's stored kind under, for a message. */
const expectedFile = (kind: StoredKind, key: string): string =>
  `${kind}/${key}.${EXTENSION[kind]}`;

/** The indexes of `p`'s copies that store `kind`. */
const storing = (p: Paper, kind: StoredKind): readonly number[] =>
  p.copies.flatMap((c, i) => (c.stored.includes(kind) ? [i] : []));

/** Which copies of one paper (the `paper`-th of the record) store one kind. */
interface Claim {
  readonly kind: StoredKind;
  readonly key: string;
  readonly paper: number;
  readonly copies: readonly number[];
}

/** The `stored` of a paper's copy (`copy` holds its index), as a path. */
const storedAt = (paper: number, copy: readonly number[]): RecordPath => [
  "papers",
  paper,
  "copies",
  ...copy,
  "stored",
];

/** A paper's kind stored by more than one of its copies, reported at the second one. */
const twice = (claims: readonly Claim[]): readonly CorpusFinding[] =>
  claims
    .filter((c) => c.copies.length > 1)
    .map((c) => ({
      kind: "twice",
      at: storedAt(c.paper, c.copies.slice(1, 2)),
      key: c.key,
      stored: c.kind,
      copies: c.copies,
    }));

/** A stored file no copy claims: at its paper's copies when the record lists the paper, else on the file. */
const unclaimed = (
  claims: readonly Claim[],
  stored: CorpusFolder["stored"],
): readonly CorpusFinding[] =>
  STORED_KINDS.flatMap((kind) =>
    stored[kind]
      .map((name) => ({ name, key: storedKey(kind, name) }))
      .filter(
        (f) =>
          !claims.some(
            (c) => c.kind === kind && c.key === f.key && c.copies.length > 0,
          ),
      )
      .map((f) => ({
        kind: "unclaimed",
        at: atPaper(claims, f.key),
        file: `${kind}/${f.name}`,
        key: f.key,
      })),
  );

/** The copies of the paper `key` names, as a path; the whole file when no paper has that key. */
const atPaper = (claims: readonly Claim[], key: string | null): RecordPath => {
  const claim = claims.find((c) => c.key === key);
  return claim === undefined ? [] : ["papers", claim.paper, "copies"];
};

/** A claimed kind with no file of its paper's key. */
const missing = (
  claims: readonly Claim[],
  stored: CorpusFolder["stored"],
): readonly CorpusFinding[] =>
  claims
    .filter(
      (c) =>
        c.copies.length > 0 &&
        !stored[c.kind].some((name) => storedKey(c.kind, name) === c.key),
    )
    .map((c) => ({
      kind: "missing",
      at: storedAt(c.paper, c.copies.slice(0, 1)),
      key: c.key,
      stored: c.kind,
      file: expectedFile(c.kind, c.key),
    }));

/** What a read record says about the folder. */
function judgeRecord(
  corpus: VenueCorpus,
  stored: CorpusFolder["stored"],
): readonly CorpusFinding[] {
  const claims = STORED_KINDS.flatMap((kind) =>
    corpus.papers.map((p, paper) => ({
      kind,
      key: p.key,
      paper,
      copies: storing(p, kind),
    })),
  );
  return [
    ...twice(claims),
    ...unclaimed(claims, stored),
    ...missing(claims, stored),
  ];
}

/** Every finding about one corpus folder; none for a corpus whose record accounts for each copy. */
export const judgeCorpus = (folder: CorpusFolder): readonly CorpusFinding[] =>
  folder.record.ok
    ? judgeRecord(folder.record.corpus, folder.stored)
    : folder.record.problems.map((p) => ({
        kind: "unparsed",
        at: p.path,
        message: p.message,
      }));

const KEEP_IDS =
  "or remove the file and keep the paper's ids in `papers.json`, which is all a corpus needs to measure against it";

/** The text of a finding: what is wrong, then what to do. */
export function corpusMessage(f: CorpusFinding): string {
  switch (f.kind) {
    case "unparsed":
      return `\`${pathText(f.at)}\`: ${f.message}. What to do: correct the field; the fields are in the JSON Schema \`papers.schema.json\` that \`study-accepted-papers\` ships`;
    case "unclaimed":
      return `\`${f.file}\` is stored, and no copy in \`${CORPUS_RECORD}\` claims it${f.key === null ? `: its name is not \`pdf/<key>.pdf\`, \`text/<key>.txt\` or \`text/<key>.<variant>.txt\`` : ` (no copy of the paper \`${f.key}\` lists it in \`stored\`)`}. What to do: record it under the copy it was fetched from, with \`fetched_from\`, its licence and where the licence was read; ${KEEP_IDS}`;
    case "missing":
      return `a copy of \`${f.key}\` stores \`${f.stored}\` in \`${CORPUS_RECORD}\`, and \`${f.file}\` is not there. What to do: put the file back, or remove \`"${f.stored}"\` from that copy's \`stored\``;
    case "twice":
      return `copies ${f.copies.join(" and ")} of \`${f.key}\` both store \`${f.stored}\`, and one stored file is a copy of one version. What to do: keep \`"${f.stored}"\` in the \`stored\` of the copy the file was fetched from, and remove it from the other`;
  }
}
