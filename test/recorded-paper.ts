/**
 * A paper as the build leaves it, for the tests of rules that read the build's record
 * (`_build/sources.json`, docs/design/paper-sources.md §1): the files of a planted paper beside the
 * record TeX wrote for it (`tex-truth.json`), what TeX leaves behind for a `filecontents` block (the
 * `.bib` it wrote), and a record for a paper made up in a test.
 */
import {
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
import { writeTree } from "./support.ts";

const PLANTED = join(
  dirname(dirname(fileURLToPath(import.meta.url))),
  "fixtures",
  "paper-sources",
);

/** The text of the `.bib` a `filecontents` block writes: its lines between `\begin{…}` and `\end{…}`. */
export function blockBody(tex: string): string {
  const lines = tex.split("\n");
  const from = lines.findIndex((l) => l.startsWith("\\begin{filecontents"));
  const to = lines.findIndex((l) => l.startsWith("\\end{filecontents"));
  return `${lines.slice(from + 1, to).join("\n")}\n`;
}

/** A planted paper: every file of its folder by relative path, and the record TeX wrote for it. */
export interface Planted {
  readonly files: Readonly<Record<string, string>>;
  readonly record: string;
}

export function planted(name: string): Planted {
  const dir = join(PLANTED, name);
  const all = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)));
  return {
    files: Object.fromEntries(
      all
        .filter((f) => f !== "tex-truth.json")
        .map((f) => [f, readFileSync(join(dir, f), "utf8")]),
    ),
    record: readFileSync(join(dir, "tex-truth.json"), "utf8"),
  };
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

/** A planted paper laid out in `dir` on disk as a build leaves it: its files, and TeX's record. */
export function plantedOnDisk(dir: string, name: string): void {
  const p = planted(name);
  writeTree(dir, {
    ...leftByTeX(p),
    "_build/sources.json": p.record,
  });
}
