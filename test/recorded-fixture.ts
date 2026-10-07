/**
 * A paper as the build leaves it, for the tests of the consumers of the build's record
 * (`_build/sources.json`, docs/design/paper-sources.md §1): a planted paper of
 * `fixtures/paper-sources/` beside the record TeX wrote for it (`tex-truth.json`, snapshotted by
 * `test/e2e/tex/paper-sources.e2e.ts`), what TeX leaves behind for a `filecontents` block (the `.bib`
 * it wrote), and a record written by hand for a paper made up in a test — used only where no planted
 * paper has the shape: TeX's own answer is used wherever there is one.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { sourcesCodec } from "../src/adapters/sources-record/index.ts";
import { sha256Hex } from "../src/domain/sha256.ts";
import {
  serializeSourcesRecord,
  type InputRole,
} from "../src/domain/sources-record.ts";
import type { Files } from "../src/ports/files.ts";
import { writeTree } from "./support.ts";

const PLANTED = join(
  dirname(dirname(fileURLToPath(import.meta.url))),
  "fixtures",
  "paper-sources",
);

/** `files` (paths relative to a paper) under `dir`. */
const under = (
  dir: string,
  files: Readonly<Record<string, string>>,
): Record<string, string> =>
  Object.fromEntries(Object.entries(files).map(([p, t]) => [`${dir}/${p}`, t]));

// ── a planted paper, with the record TeX wrote for it ───────────────────────────────────────

/** A planted paper: every file of its folder by relative path, and the record TeX wrote for it. */
export interface Planted {
  readonly files: Readonly<Record<string, string>>;
  readonly record: string;
}

export function planted(name: string): Planted {
  const dir = join(PLANTED, name);
  const all = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)))
    .sort();
  return {
    files: Object.fromEntries(
      all
        .filter((f) => f !== "tex-truth.json")
        .map((f) => [f, readFileSync(join(dir, f), "utf8")]),
    ),
    record: readFileSync(join(dir, "tex-truth.json"), "utf8"),
  };
}

/** The planted paper's files under `dir`, without its record. */
export const fixtureFiles = (
  name: string,
  dir: string,
): Record<string, string> => under(dir, planted(name).files);

/** The planted paper under `dir` as a build left it: its files, and `_build/sources.json` — TeX's record. */
export function builtFixture(
  name: string,
  dir: string,
): Record<string, string> {
  const p = planted(name);
  return under(dir, { ...p.files, "_build/sources.json": p.record });
}

/** The text of the `.bib` a `filecontents` block writes: its lines between `\begin{…}` and `\end{…}`. */
function blockBody(tex: string): string {
  const lines = tex.split("\n");
  const from = lines.findIndex((l) => l.startsWith("\\begin{filecontents"));
  const to = lines.findIndex((l) => l.startsWith("\\end{filecontents"));
  return `${lines.slice(from + 1, to).join("\n")}\n`;
}

/**
 * The planted paper's files as a build leaves its folder: the `.bib` TeX wrote from a `filecontents`
 * block is on disk, holding the lines of the block (TeX writes them as they stand).
 */
export function leftByTeX(p: Planted): Readonly<Record<string, string>> {
  const parsed = sourcesCodec.parse(p.record);
  const body = blockBody(p.files["paper.tex"] ?? "");
  return parsed.ok
    ? {
        ...p.files,
        ...Object.fromEntries(parsed.record.written.map((w) => [w, body])),
      }
    : p.files;
}

/** A planted paper laid out in `dir` on disk as a build leaves it: its files, and TeX's record. */
export function plantedOnDisk(dir: string, name: string): void {
  const p = planted(name);
  writeTree(dir, { ...leftByTeX(p), "_build/sources.json": p.record });
}

// ── a record written by hand, for a paper no planted one has the shape of ───────────────────

/** What a made-up paper's build recorded. `databases` are the `.bib` files bibtex opened. */
export interface Shape {
  readonly inputs: readonly (readonly [string, InputRole])[];
  readonly written?: readonly string[];
  readonly databases?: readonly string[];
}

/**
 * The record of a made-up paper, hashed over `files` (relative path → text): what `paperlint build`
 * would write. A file the record names that is not in `files` was not there: its digest is null.
 */
export function recordText(
  files: Readonly<Record<string, string>>,
  shape: Shape,
): string {
  const written = shape.written ?? [];
  const databases = shape.databases;
  const hashed = [
    ...shape.inputs.map(([p]) => p),
    ...(databases ?? []).filter((d) => !written.includes(d)),
  ];
  return serializeSourcesRecord({
    schema: 1,
    inputs: shape.inputs.map(([path, role]) => ({ path, role })),
    written,
    bibdata: (databases ?? []).map((d) => d.replace(/\.bib$/, "")),
    bibtex:
      databases === undefined
        ? { ran: false }
        : { ran: true, databases, keys: [], exit: 0, errors: [] },
    sha256: Object.fromEntries(
      hashed.map((p) => {
        const text = files[p];
        return [
          p,
          text === undefined ? null : sha256Hex(new TextEncoder().encode(text)),
        ];
      }),
    ),
  });
}

/** A recorded input as the record spells it. */
interface Input {
  readonly path: string;
  readonly role: InputRole;
}

/**
 * A made-up paper under `dir` as a build would have left it: `files` (paths relative to `dir`) and a
 * record that lists `inputs` — in this order, with these roles — hashed over `files` (`recordText`).
 */
export function builtPaper(
  dir: string,
  files: Readonly<Record<string, string>>,
  inputs: readonly Input[],
): Record<string, string> {
  return under(dir, {
    ...files,
    "_build/sources.json": recordText(files, {
      inputs: inputs.map((i) => [i.path, i.role] as const),
    }),
  });
}

/**
 * A project's files (paths relative to its root) with the record a build of the paper in `paperDir`
 * would have left, written by hand like `builtPaper`: for the tests that lint a project through the
 * CLI, whose paper has no planted fixture to take TeX's record from.
 */
export function recordedTree(
  tree: Readonly<Record<string, string>>,
  paperDir: string,
  inputs: readonly Input[],
): Record<string, string> {
  const prefix = `${paperDir}/`;
  const own = Object.fromEntries(
    Object.entries(tree)
      .filter(([p]) => p.startsWith(prefix))
      .map(([p, text]) => [p.slice(prefix.length), text]),
  );
  return { ...tree, ...builtPaper(paperDir, own, inputs) };
}

/**
 * Write `<dir>/_build/sources.json` for the paper in `dir` on disk — the record `paperlint build`
 * leaves — hashed over the files of `shape` as they are there now (a file that is not there: null).
 */
export function recordOnDisk(dir: string, shape: Shape): void {
  const names = [...shape.inputs.map(([p]) => p), ...(shape.databases ?? [])];
  const files = Object.fromEntries(
    names.flatMap((n): readonly (readonly [string, string])[] =>
      existsSync(join(dir, n)) ? [[n, readFileSync(join(dir, n), "utf8")]] : [],
    ),
  );
  mkdirSync(join(dir, "_build"), { recursive: true });
  writeFileSync(join(dir, "_build", "sources.json"), recordText(files, shape));
}

// ── an accepted paper on disk, with its snapshot beside it ──────────────────────────────────

/**
 * The snapshot beside a paper on disk (`fixtures/accepted-papers/<name>/`): `tex-truth.json`, TeX's
 * record of a build — or, for a paper that does not compile in paperlint's TeX tree,
 * `record-by-hand.json`: the same shape, the files its `\\input`s name, which is not TeX's answer
 * (fixtures/accepted-papers/README.md).
 */
const truthOf = (paperDir: string): string =>
  [
    join(paperDir, "tex-truth.json"),
    join(paperDir, "record-by-hand.json"),
  ].find((f) => existsSync(f)) ?? join(paperDir, "tex-truth.json");

/**
 * A paper's files as a build left them, for a paper that sits on disk with its snapshot beside it:
 * `base`, and `_build/sources.json` answered from the snapshot. The paper's own bytes are hashed
 * against the record as they are on disk.
 */
export function withRecord(base: Files, paperDir: string): Files {
  const at = join(paperDir, "_build", "sources.json");
  const truth = truthOf(paperDir);
  return {
    isFile: (p) => p === at || base.isFile(p),
    readBytes: (p) =>
      p === at ? new Uint8Array(readFileSync(truth)) : base.readBytes(p),
    writeAtomic: (p, b) => {
      base.writeAtomic(p, b);
    },
  };
}

/** The snapshot laid on disk as the build writes it: `<paperDir>/_build/sources.json`. */
export function layRecord(
  paperDir: string,
  truth: string = truthOf(paperDir),
): void {
  mkdirSync(join(paperDir, "_build"), { recursive: true });
  copyFileSync(truth, join(paperDir, "_build", "sources.json"));
}
