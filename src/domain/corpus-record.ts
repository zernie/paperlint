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
  type Paper,
  type VenueCorpus,
} from "./venue-corpus.ts";

/** The folder in a papers root that holds one corpus per venue. */
export const CORPORA_DIR = "venues";

/** The file paperlint reaches a corpus by: a rule runs only for a file that exists. */
export const CORPUS_MANIFEST = "MANIFEST.md";

/** `papers.json` as the rule read it. */
export type RecordState =
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable"; readonly why: string }
  | { readonly kind: "read"; readonly corpus: VenueCorpus };

/** What the rule reads of one corpus folder. */
export interface CorpusFolder {
  readonly record: RecordState;
  /** The names in `pdf/` and in `text/`, hidden ones left out; none when the folder is absent. */
  readonly stored: Readonly<Record<StoredKind, readonly string[]>>;
}

/** One finding; `file` is relative to the corpus folder, `folder` to the papers root. */
export type CorpusFinding =
  | { readonly kind: "no-record"; readonly files: readonly string[] }
  | { readonly kind: "unparsed"; readonly why: string }
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
  | {
      readonly kind: "no-manifest";
      readonly folder: string;
      readonly markers: readonly string[];
    };

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

/** Which copies of one paper store one kind. */
interface Claim {
  readonly kind: StoredKind;
  readonly key: string;
  readonly copies: readonly number[];
}

/** A paper's kind stored by more than one of its copies. */
const twice = (claims: readonly Claim[]): readonly CorpusFinding[] =>
  claims
    .filter((c) => c.copies.length > 1)
    .map((c) => ({
      kind: "twice",
      key: c.key,
      stored: c.kind,
      copies: c.copies,
    }));

/** A stored file no copy claims. */
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
        file: `${kind}/${f.name}`,
        key: f.key,
      })),
  );

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
    corpus.papers.map((p) => ({ kind, key: p.key, copies: storing(p, kind) })),
  );
  return [
    ...twice(claims),
    ...unclaimed(claims, stored),
    ...missing(claims, stored),
  ];
}

/** Every finding about one corpus folder; none for a corpus whose record accounts for each copy. */
export function judgeCorpus(folder: CorpusFolder): readonly CorpusFinding[] {
  const files = STORED_KINDS.flatMap((kind) =>
    folder.stored[kind].map((name) => `${kind}/${name}`),
  );
  switch (folder.record.kind) {
    case "absent":
      return files.length === 0 ? [] : [{ kind: "no-record", files }];
    case "unreadable":
      return [{ kind: "unparsed", why: folder.record.why }];
    case "read":
      return judgeRecord(folder.record.corpus, folder.stored);
  }
}

/** An entry of a folder, as far as telling a corpus apart needs. */
export interface CorpusEntry {
  readonly name: string;
  readonly kind: string;
}

/** What makes a folder under `venues/` a corpus: `papers.json`, `pdf/`, `text/`; the ones present. */
export const corpusMarkers = (
  entries: readonly CorpusEntry[],
): readonly string[] => [
  ...(entries.some((e) => e.name === CORPUS_RECORD && e.kind === "file")
    ? [CORPUS_RECORD]
    : []),
  ...STORED_KINDS.filter((k) =>
    entries.some((e) => e.name === k && e.kind === "dir"),
  ).map((k) => `${k}/`),
];

const list = (names: readonly string[]): string =>
  names.map((n) => `\`${n}\``).join(", ");

const KEEP_IDS =
  "or remove the file and keep the paper's ids in `papers.json`, which is all a corpus needs to measure against it";

/** The text of a finding: what is wrong, then what to do. */
export function corpusMessage(f: CorpusFinding): string {
  switch (f.kind) {
    case "no-record":
      return `the corpus stores ${list(f.files)} and has no \`${CORPUS_RECORD}\`, so nothing records what each file is a copy of or under which licence. What to do: write \`${CORPUS_RECORD}\` (\`study-accepted-papers\` writes it): a row per paper, and for each stored file the copy it was fetched from, with \`fetched_from\`, its licence and where the licence was read; ${KEEP_IDS}`;
    case "unparsed":
      return `${f.why}. What to do: correct each field the path names; the fields are in the JSON Schema \`papers.schema.json\` that \`study-accepted-papers\` ships`;
    case "unclaimed":
      return `\`${f.file}\` is stored, and no copy in \`${CORPUS_RECORD}\` claims it${f.key === null ? `: its name is not \`pdf/<key>.pdf\`, \`text/<key>.txt\` or \`text/<key>.<variant>.txt\`` : ` (no copy of the paper \`${f.key}\` lists it in \`stored\`)`}. What to do: record it under the copy it was fetched from, with \`fetched_from\`, its licence and where the licence was read; ${KEEP_IDS}`;
    case "missing":
      return `a copy of \`${f.key}\` stores \`${f.stored}\` in \`${CORPUS_RECORD}\`, and \`${f.file}\` is not there. What to do: put the file back, or remove \`"${f.stored}"\` from that copy's \`stored\``;
    case "twice":
      return `copies ${f.copies.join(" and ")} of \`${f.key}\` both store \`${f.stored}\`, and one stored file is a copy of one version. What to do: keep \`"${f.stored}"\` in the \`stored\` of the copy the file was fetched from, and remove it from the other`;
    case "no-manifest":
      return `\`${f.folder}/\` holds ${list(f.markers)} and no \`${CORPUS_MANIFEST}\`, and paperlint reaches a corpus through its \`${CORPUS_MANIFEST}\`, so nothing in it is checked. What to do: write \`${f.folder}/${CORPUS_MANIFEST}\` with the corpus's sources and years (\`study-accepted-papers\` writes it), or move the folder out of \`${CORPORA_DIR}/\``;
  }
}
