/**
 * An arXiv source archive, read in memory and never executed: `unpack` turns the e-print's bytes
 * into files, `stagingPlan` decides which files a paper keeps and where, `recordOf` writes the
 * `record-by-hand.json` of what was staged. arXiv compiles from the archive's ROOT (its
 * `00README.json` names the top-level file, e.g. `ACL2026/main.tex`), so every kept file keeps its
 * path from the root and only the main file moves, to `paper.tex`. No I/O.
 */
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { stripComments, TEXT_EXT, type Verdict } from "./rules.ts";

export type ArchiveFile = Readonly<{ path: string; bytes: Uint8Array }>;

const latin1 = (b: Uint8Array): string => Buffer.from(b).toString("latin1");
const cString = (b: Uint8Array, at: number, len: number): string =>
  latin1(b.subarray(at, at + len)).replace(/\0.*$/s, "");

/** A path inside the archive, or null for one that would leave it (absolute, or `..`). */
const safePath = (p: string): string | null => {
  const parts = p
    .replace(/^(\.\/)+/, "")
    .split("/")
    .filter((s) => s !== "" && s !== ".");
  return p.startsWith("/") || parts.includes("..") || parts.length === 0
    ? null
    : parts.join("/");
};

type TarEntry = Readonly<{
  name: string;
  type: string;
  body: Uint8Array;
  next: number;
}>;

/** The tar entry whose header starts at `at`, or null at the end of the archive. */
const entryAt = (tar: Uint8Array, at: number): TarEntry | null => {
  if (at + 512 > tar.length || tar[at] === 0) return null;
  const head = tar.subarray(at, at + 512);
  const size = parseInt(cString(head, 124, 12).trim(), 8);
  const prefix = cString(head, 345, 155);
  return {
    name: (prefix === "" ? "" : `${prefix}/`) + cString(head, 0, 100),
    type: latin1(head.subarray(156, 157)),
    body: tar.subarray(at + 512, at + 512 + size),
    next: at + 512 + Math.ceil(size / 512) * 512,
  };
};

/** The name a GNU long-name (`L`) or pax (`x`) entry gives the entry after it. */
const nameForNext = (e: TarEntry): string | null =>
  e.type === "L"
    ? cString(e.body, 0, e.body.length)
    : e.type === "x"
      ? (/(?:^|\n)\d+ path=([^\n]*)\n/.exec(latin1(e.body))?.[1] ?? null)
      : null;

/** The regular files of a tar stream; links, directories and unsafe paths are left out. */
export function untar(
  tar: Uint8Array,
  at = 0,
  longName: string | null = null,
): readonly ArchiveFile[] {
  const e = entryAt(tar, at);
  if (e === null) return [];
  const regular = e.type === "0" || e.type === "\0";
  const path = regular ? safePath(longName ?? e.name) : null;
  return [
    ...(path === null ? [] : [{ path, bytes: e.body }]),
    ...untar(tar, e.next, nameForNext(e)),
  ];
}

/** The e-print's files: a gzipped tar, or one gzipped `.tex` (named `main.tex`). */
export function unpack(
  bytes: Uint8Array,
): Verdict<{ files: readonly ArchiveFile[] }> {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b)
    return { ok: false, reason: "no source: not gzip (PDF-only submission)" };
  try {
    const raw = gunzipSync(bytes);
    if (latin1(raw.subarray(257, 262)) === "ustar")
      return { ok: true, files: untar(raw) };
    // A NUL byte is no TeX: an older tar with no ustar mark, which this reader does not take.
    return raw.includes(0)
      ? { ok: false, reason: "unreadable source: binary data, not a ustar tar" }
      : { ok: true, files: [{ path: "main.tex", bytes: raw }] };
  } catch (e) {
    return {
      ok: false,
      reason: `unreadable source: ${String(e).slice(0, 80)}`,
    };
  }
}

const ext = (p: string): string => {
  const m = /\.([^./]+)$/.exec(p);
  return m === null ? "" : String(m[1]).toLowerCase();
};

const ReadmeSchema = z.object({
  sources: z.array(
    z.object({ usage: z.string().optional(), filename: z.string() }),
  ),
});

/** JSON text as a value, or undefined when it is not JSON. */
export const jsonOf = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** The top-level file the archive's `00README.json` (or legacy `00README.XXX`) names, if any. */
export function toplevelOf(files: readonly ArchiveFile[]): string | null {
  const json = files.find((f) => f.path === "00README.json");
  if (json !== undefined) {
    const readme = ReadmeSchema.safeParse(jsonOf(latin1(json.bytes)));
    return readme.success
      ? (readme.data.sources.find((s) => s.usage === "toplevel")?.filename ??
          null)
      : null;
  }
  const legacy = files.find((f) => /^00README/i.test(f.path));
  return legacy === undefined
    ? null
    : (/(\S+\.tex)\s+toplevelfile/i.exec(latin1(legacy.bytes))?.[1] ?? null);
}

/** What a paper keeps of its archive, and every change made on the way. */
export type StagingPlan = Readonly<{
  /** The main file's path in the archive. */
  main: string;
  mainText: string;
  /** How many files could be the main one (a `\documentclass` and a `\begin{document}`). */
  mainCandidates: number;
  /** Every kept file at its staged path: the main one at `paper.tex`, the rest where they were. */
  staged: readonly ArchiveFile[];
  /** «a to b», for each renamed file. */
  renames: readonly string[];
  /** «a to b», for each `\input` of the main file that was rewritten to `paper`. */
  edits: readonly string[];
  /** Bytes of the staged text sources. */
  size: number;
}>;

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isMain = (f: ArchiveFile): boolean => {
  const t = stripComments(latin1(f.bytes));
  return (
    ext(f.path) === "tex" &&
    t.includes("\\documentclass") &&
    t.includes("\\begin{document}")
  );
};

/** The one `00README` names, else one called main, paper or ms, else the largest candidate. */
const pickMain = (
  mains: readonly ArchiveFile[],
  named: string | null,
): ArchiveFile | undefined =>
  mains.find((f) => f.path === named) ??
  mains.find((f) => /(^|\/)(main|paper|ms)\.tex$/.test(f.path)) ??
  mains.toSorted((a, b) => b.bytes.length - a.bytes.length)[0];

/** Rewrites an `\input`/`\include` of the main file to `paper`, noting each «from to to». */
const pointAtPaper = (
  f: ArchiveFile,
  stem: string,
): Readonly<{ bytes: Uint8Array; edits: readonly string[] }> => {
  if (ext(f.path) !== "tex" || stem === "paper")
    return { bytes: f.bytes, edits: [] };
  const re = new RegExp(
    `\\\\(input|include)\\{${escape(stem)}(\\.tex|\\.bbl)?\\}`,
    "g",
  );
  const text = latin1(f.bytes);
  const edits = [...text.matchAll(re)].map(
    (m) => `${m[0]} to \\${String(m[1])}{paper${m[2] ?? ""}}`,
  );
  return {
    bytes: Buffer.from(text.replace(re, "\\$1{paper$2}"), "latin1"),
    edits,
  };
};

/** A rename target the archive already holds: staging both would drop one of the two files. */
const takenTwice = (staged: readonly { path: string }[]): string | undefined =>
  ["paper.tex", "paper.bbl"].find(
    (p) => staged.filter((f) => f.path === p).length > 1,
  );

/**
 * Every text source of the archive, kept at its path from the root; the main file becomes
 * `paper.tex`, the `.bbl` beside it with its stem `paper.bbl`, and an `\input` of the main file
 * (rare: a wrapper) is rewritten to `paper`.
 */
export function stagingPlan(
  files: readonly ArchiveFile[],
): Verdict<StagingPlan> {
  const mains = files.filter(isMain);
  const pick = pickMain(mains, toplevelOf(files));
  if (pick === undefined) return { ok: false, reason: "no main .tex found" };
  const stem = pick.path.replace(/\.tex$/, "");
  const target = (p: string): string =>
    p === pick.path ? "paper.tex" : p === `${stem}.bbl` ? "paper.bbl" : p;
  const kept = files.filter((f) => TEXT_EXT.has(ext(f.path)));
  const staged = kept.map((f) => ({
    path: target(f.path),
    ...pointAtPaper(f, stem),
  }));
  const taken = takenTwice(staged);
  if (taken !== undefined)
    return { ok: false, reason: `two files would be staged as ${taken}` };
  return {
    ok: true,
    main: pick.path,
    mainText: latin1(pick.bytes),
    mainCandidates: mains.length,
    staged: staged.map((f) => ({ path: f.path, bytes: f.bytes })),
    renames: kept
      .filter((f) => target(f.path) !== f.path)
      .map((f) => `${f.path} to ${target(f.path)}`),
    edits: staged.flatMap((x) => x.edits),
    size: staged.reduce((n, f) => n + f.bytes.length, 0),
  };
}

export const sha256 = (b: Uint8Array): string =>
  createHash("sha256").update(b).digest("hex");

const INPUT = /\\(?:input|include)\s*\{([^}]+)\}/g;

/** The `.tex` files reached from `file`, depth first in source order, after those in `seen`. */
const reached = (
  byPath: ReadonlyMap<string, Uint8Array>,
  file: string,
  seen: readonly string[],
): readonly string[] =>
  [
    ...stripComments(latin1(byPath.get(file) ?? new Uint8Array())).matchAll(
      INPUT,
    ),
  ].reduce<readonly string[]>((acc, m) => {
    const n = String(m[1]).trim().replace(/^\.\//, "");
    const hit = [n, `${n}.tex`].find((x) => ext(x) === "tex" && byPath.has(x));
    return hit === undefined || acc.includes(hit)
      ? acc
      : reached(byPath, hit, [...acc, hit]);
  }, seen);

/**
 * `record-by-hand.json`, NOT TeX's answer: `paper.tex`, the class and style files at the root in
 * name order, then each `\input`/`\include` reached from `paper.tex`, depth first in source order,
 * every one hashed over the staged bytes. A staging without `paper.tex` records it as empty.
 */
export function recordOf(staged: readonly ArchiveFile[]) {
  const byPath = new Map(staged.map((f) => [f.path, f.bytes]));
  const preamble = staged
    .map((f) => f.path)
    .filter((p) => !p.includes("/") && ["cls", "sty"].includes(ext(p)))
    .toSorted();
  const inputs = [
    { path: "paper.tex", role: "body" },
    ...preamble.map((path) => ({ path, role: "preamble" })),
    ...reached(byPath, "paper.tex", ["paper.tex"])
      .slice(1)
      .map((path) => ({ path, role: "body" })),
  ];
  return {
    schema: 1,
    inputs,
    written: [],
    bibdata: [],
    bibtex: { ran: false },
    sha256: Object.fromEntries(
      inputs.map((i) => [
        i.path,
        sha256(byPath.get(i.path) ?? new Uint8Array()),
      ]),
    ),
  };
}
