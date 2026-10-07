/**
 * A planted paper of `fixtures/paper-sources/` as it stands after a build: its files, and the record
 * TeX wrote for it (`tex-truth.json`, snapshotted by `test/e2e/tex/paper-sources.e2e.ts`) laid at
 * `_build/sources.json`. The consumers of the record are tested on TeX's own answer for the paper,
 * not on one written by hand beside the test. Held in memory: the paper is at `dir`, nothing on disk.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Hex } from "../src/domain/sha256.ts";
import type { Files } from "../src/ports/files.ts";

const FIXTURES = join(
  dirname(dirname(fileURLToPath(import.meta.url))),
  "fixtures",
  "paper-sources",
);

/** Every file under `dir`, relative to it, in a stable order. */
const walk = (dir: string, base: string = dir): readonly string[] =>
  readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? walk(join(dir, e.name), base)
        : [relative(base, join(dir, e.name))],
    )
    .sort();

/** The fixture's files by path under `dir`, without its `tex-truth.json`. */
export function fixtureFiles(
  name: string,
  dir: string,
): Record<string, string> {
  const root = join(FIXTURES, name);
  return Object.fromEntries(
    walk(root)
      .filter((f) => f !== "tex-truth.json")
      .map((f) => [`${dir}/${f}`, readFileSync(join(root, f), "utf8")]),
  );
}

/** The fixture as a build left it: its files, and `_build/sources.json` — TeX's record. */
export function builtFixture(
  name: string,
  dir: string,
): Record<string, string> {
  return {
    ...fixtureFiles(name, dir),
    [`${dir}/_build/sources.json`]: readFileSync(
      join(FIXTURES, name, "tex-truth.json"),
      "utf8",
    ),
  };
}

/**
 * A paper as a build would have left it, written by hand: `files` (paths relative to `dir`) and a
 * record that lists `inputs` — in this order, with these roles — and hashes each as it is. For a
 * consumer's test whose paper no planted fixture has the shape of (prose in an included file).
 * Where a planted fixture has the shape, `builtFixture` is TeX's own answer and is used instead.
 */
export function builtPaper(
  dir: string,
  files: Readonly<Record<string, string>>,
  inputs: readonly {
    readonly path: string;
    readonly role: "preamble" | "body";
  }[],
): Record<string, string> {
  const record = {
    schema: 1,
    inputs,
    written: [],
    bibdata: [],
    bibtex: { ran: false },
    sha256: Object.fromEntries(
      inputs.map((i) => [
        i.path,
        sha256Hex(new TextEncoder().encode(files[i.path] ?? "")),
      ]),
    ),
  };
  return {
    ...Object.fromEntries(
      Object.entries(files).map(([p, t]) => [`${dir}/${p}`, t]),
    ),
    [`${dir}/_build/sources.json`]: `${JSON.stringify(record, null, 2)}\n`,
  };
}

/**
 * The snapshot beside a paper on disk (`fixtures/accepted-papers/<name>/`): `tex-truth.json`, TeX's
 * record of a build — or, for a paper that does not compile in paperlint's TeX tree,
 * `record-by-hand.json`: the same shape, the files its `\\input`s name, which is not TeX's answer
 * (fixtures/accepted-papers/README.md).
 */
export const truthOf = (paperDir: string): string =>
  [
    join(paperDir, "tex-truth.json"),
    join(paperDir, "record-by-hand.json"),
  ].find((f) => existsSync(f)) ?? join(paperDir, "tex-truth.json");

/**
 * A paper's files as a build left them, for a paper that sits on disk with its snapshot beside it:
 * `base`, and `_build/sources.json` answered from the snapshot. The paper's own bytes are hashed
 * against the record as they are on disk.
 */
export function withRecord(
  base: Files,
  paperDir: string,
  truth: string = truthOf(paperDir),
): Files {
  const at = join(paperDir, "_build", "sources.json");
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

/**
 * A project's files (paths relative to its root) with the record a build of the paper in `paperDir`
 * would have left, written by hand like `builtPaper`: for the tests that lint a project through the
 * CLI, whose paper has no planted fixture to take TeX's record from.
 */
export function recordedTree(
  tree: Readonly<Record<string, string>>,
  paperDir: string,
  inputs: readonly {
    readonly path: string;
    readonly role: "preamble" | "body";
  }[],
): Record<string, string> {
  const prefix = `${paperDir}/`;
  const own = Object.fromEntries(
    Object.entries(tree)
      .filter(([p]) => p.startsWith(prefix))
      .map(([p, text]) => [p.slice(prefix.length), text]),
  );
  return { ...tree, ...builtPaper(paperDir, own, inputs) };
}
