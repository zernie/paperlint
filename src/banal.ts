/**
 * BANAL — the page-geometry script HotCRP's format checker runs — fetched, verified and run.
 *
 * banal (Eddie Kohler, Geoffrey M. Voelker; https://github.com/kohler/hotcrp/blob/master/src/banal)
 * measures a paper's page size, column count, body and reference font sizes and page types. rpp
 * runs the REAL banal, unmodified, so the numbers in the facts file are the numbers HotCRP shows a
 * reviewer at upload — a reimplementation would drift from them.
 *
 * ── THE LICENCE BOUNDARY ────────────────────────────────────────────────────────
 * banal is GPL-2.0-or-later; rpp is MIT. rpp therefore never contains banal: `rpp toolchain`
 * DOWNLOADS it from HotCRP at a pinned commit, checks its sha256, and stores it in rpp's cache, and
 * rpp EXECUTES it as a separate program (`perl banal …`), reading its JSON output. Nothing of banal
 * is copied, vendored, linked or translated into this package.
 *
 * ── WITHOUT POPPLER ──────────────────────────────────────────────────────────────
 * banal reads a PDF by running poppler's `pdftohtml -xml` — but it also accepts that XML directly:
 * `banal_open_input` (banal 1.2, line 1815) takes a file ending in `.xml` and opens it as is. rpp
 * writes that XML itself from pdf.js text (`pdf-layout.ts`) and hands banal the `.xml` file.
 *
 * One question banal still asks poppler: `$pdftohtml -v`, once, before it reads any input — the XML
 * included — to pick the zoom and a font-size correction (lines 1828-1868). With no pdftohtml it
 * stops (`Error: Failed to run pdftohtml`, measured); told a version below 0.85 it applies a larger
 * correction and every font size moves. So rpp points `$PDFTOHTML` (banal's own override, line 166)
 * at a stub that answers `-v` with `XML_DIALECT.version` — the pdftohtml whose XML `pdf-layout.ts`
 * writes — and refuses anything else. `test/e2e/banal.mjs` shows both failures with the real banal.
 */
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Command, ProcessExit, RunProcess } from "./core/ports.ts";
import { andThen, type Result } from "./core/result.ts";
import {
  describeLine,
  PERL_MISSING,
  type BanalFailure,
} from "./core/banal/failure.ts";
import {
  firstLine,
  parseBanalOutput,
  type BanalMeasurement,
} from "./core/banal/output.ts";
import { acceptProbe, PROBE_PAGE } from "./core/banal/probe.ts";
import { pdf2xml, XML_DIALECT, type PageLayout } from "./pdf-layout.ts";

/** The banal rpp runs: HotCRP at this commit, this file, these bytes. */
export const BANAL_PIN = {
  version: "1.2",
  commit: "f3e4352133f3184c7c42b0d5e6501124bead18e6",
  url: "https://raw.githubusercontent.com/kohler/hotcrp/f3e4352133f3184c7c42b0d5e6501124bead18e6/src/banal",
  sha256: "fd8cc4ae189b9da02460ae442a34f14434e5784210489fb668313ac671006911",
} as const;

/** What to download: the pin by default; a harness passes a local file. */
export interface BanalSource {
  readonly url: string;
  readonly sha256: string;
}

/** An explicit banal to use instead of rpp's (a path to the script). */
export const BANAL_ENV = "BANAL";
/** Where `rpp toolchain` stores banal. Default: `$XDG_CACHE_HOME/rpp/banal`, else `~/.cache/rpp/banal`. */
export const BANAL_DIR_ENV = "RPP_BANAL_DIR";

/** Seconds: banal is ~90 KB. */
export const BANAL_DOWNLOAD_SECONDS = 60;
/** banal takes well under a second on a paper; a hang still has to end. */
const BANAL_RUN_MS = 120_000;

export { PERL_MISSING } from "./core/banal/failure.ts";
export { PROBE_PAGE } from "./core/banal/probe.ts";

/** An environment as a child process gets it: every value a string, none undefined. */
export const childEnv = (
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(env).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  );

// ── where ────────────────────────────────────────────────────────────────────────────

export function banalHome(
  env: NodeJS.ProcessEnv,
  home: string = homedir(),
): string {
  if (env[BANAL_DIR_ENV]) return env[BANAL_DIR_ENV];
  return join(env["XDG_CACHE_HOME"] || join(home, ".cache"), "rpp", "banal");
}

/** Where `rpp toolchain` puts the pinned banal: one directory per HotCRP commit. */
export const installedBanal = (env: NodeJS.ProcessEnv, home?: string): string =>
  join(banalHome(env, home), BANAL_PIN.commit.slice(0, 12), "banal");

/** A banal found on disk, and which rule found it. */
export interface BanalLocation {
  readonly path: string;
  readonly from: "$BANAL" | "vendor/banal" | "rpp toolchain";
}

/**
 * The banal to run, in order: `$BANAL` (an explicit choice), `<project>/vendor/banal` (a project
 * that vendors its own copy), then the one `rpp toolchain` installed. Null when there is none —
 * `missingBanal` says what to do about it.
 */
export function findBanal(
  env: NodeJS.ProcessEnv,
  projectRoot: string,
  home?: string,
): BanalLocation | null {
  const own = env[BANAL_ENV];
  if (own) return existsSync(own) ? { path: own, from: "$BANAL" } : null;
  const vendored = join(projectRoot, "vendor", "banal");
  if (existsSync(vendored)) return { path: vendored, from: "vendor/banal" };
  const cached = installedBanal(env, home);
  return existsSync(cached) ? { path: cached, from: "rpp toolchain" } : null;
}

/** Why there is no banal, and the fix — the one wording every caller prints. */
export function missingBanal(env: NodeJS.ProcessEnv, home?: string): string {
  const own = env[BANAL_ENV];
  return own
    ? `banal not found: $BANAL names ${own}, which does not exist`
    : `banal not found: ${installedBanal(env, home)} — \`npx rpp toolchain\` installs it`;
}

// ── running it ───────────────────────────────────────────────────────────────────────

/** The stub standing in for `pdftohtml`: it answers `-v` and refuses to convert anything. */
export const PDFTOHTML_STUB = [
  "#!/bin/sh",
  "# research-paper-pipeline: banal reads the banal input XML rpp writes, never a PDF. banal still",
  "# asks `pdftohtml -v` which dialect to expect; this answers with the one rpp writes.",
  'if [ "$1" = "-v" ]; then',
  `  echo "pdftohtml version ${XML_DIALECT.version}"`,
  "  exit 0",
  "fi",
  'echo "rpp: this pdftohtml only answers -v; banal was given a PDF instead of the banal input XML" >&2',
  "exit 1",
  "",
].join("\n");

/** A path quoted for `/bin/sh` — banal interpolates `$PDFTOHTML` into a shell command unquoted. */
export const shellQuote = (s: string): string =>
  `'${s.replace(/'/g, `'"'"'`)}'`;

/**
 * Run banal on pages rpp read with pdf.js: write them as the banal input XML beside the `-v` stub in
 * a temporary directory, run `perl banal -no-time -json <file>.xml`, and parse what it prints. The
 * directory is removed either way.
 */
export function measureLayout(
  banal: string,
  pages: readonly PageLayout[],
  o: { run: RunProcess; env: NodeJS.ProcessEnv },
): Result<BanalMeasurement, BanalFailure> {
  const work = realpathSync(mkdtempSync(join(tmpdir(), "rpp-banal-")));
  try {
    const xml = join(work, "paper.xml");
    const stub = join(work, "pdftohtml");
    writeFileSync(xml, pdf2xml(pages));
    writeFileSync(stub, PDFTOHTML_STUB);
    chmodSync(stub, 0o755);
    const r = o.run.run({
      file: "perl",
      args: [banal, "-no-time", "-json", xml],
      env: { ...childEnv(o.env), PDFTOHTML: shellQuote(stub) },
      timeoutMs: BANAL_RUN_MS,
      maxOutputBytes: 64 * 1024 * 1024,
    });
    return parseBanalOutput(r);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// ── installing it (`rpp toolchain`) ──────────────────────────────────────────────────

/** Does this banal run and measure? `null` when it does, else why not. */
export function probeBanal(
  banal: string,
  o: { run: RunProcess; env: NodeJS.ProcessEnv },
): string | null {
  const r = andThen(measureLayout(banal, [PROBE_PAGE], o), acceptProbe);
  return r.ok ? null : describeLine(r.error);
}

export const sha256Of = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

export type BanalStep =
  | { readonly ok: true; readonly path: string; readonly fresh: boolean }
  | { readonly ok: false; readonly lines: readonly string[] };

/** The IO `ensureBanal` needs. */
export interface BanalIO {
  readonly run: RunProcess;
  readonly env: NodeJS.ProcessEnv;
  readonly log: (line: string) => void;
  readonly home?: string;
  readonly source?: BanalSource;
}

const perlRuns = (io: BanalIO): boolean => {
  const r = io.run.run({
    file: "perl",
    args: ["-e", "exit 0"],
    env: childEnv(io.env),
    timeoutMs: BANAL_RUN_MS,
  });
  return r.kind === "exited" && r.status === 0;
};

/** Why a curl run did not download, in its own words; null when it exited 0. */
function curlFailure(r: ProcessExit): string | null {
  if (r.kind === "exited" && r.status === 0) return null;
  if (r.kind === "not-found") return "curl is not installed";
  if (r.kind === "spawn-failed") return r.message;
  if (r.kind === "timed-out") return `no answer after ${String(r.afterMs)} ms`;
  const what =
    r.kind === "exited" ? `curl exited ${String(r.status)}` : r.signal;
  return firstLine(r.stderr) || what;
}

/** Download `source` to `dest` and accept it only by its sha256. */
function download(io: BanalIO, source: BanalSource, dest: string): string[] {
  const part = `${dest}.part`;
  const curl: Command = {
    file: "curl",
    args: [
      "-fsSL",
      "--retry",
      "2",
      "--max-time",
      String(BANAL_DOWNLOAD_SECONDS),
      "-o",
      part,
      source.url,
    ],
    env: childEnv(io.env),
    timeoutMs: (BANAL_DOWNLOAD_SECONDS + 30) * 1000,
  };
  const failed = curlFailure(io.run.run(curl));
  if (failed || !existsSync(part)) {
    rmSync(part, { force: true });
    return [
      `could not download banal from ${source.url}: ${failed ?? "curl wrote no file"}`,
    ];
  }
  const got = sha256Of(part);
  if (got !== source.sha256) {
    rmSync(part, { force: true });
    return [
      `banal from ${source.url} does not have the pinned sha256 — refusing to install it`,
      `expected ${source.sha256}`,
      `got      ${got}`,
    ];
  }
  renameSync(part, dest);
  return [];
}

/**
 * Make `rpp toolchain`'s banal present, byte-identical to the pin, and RUNNING: perl is checked
 * first, a file with the wrong sha256 is replaced, and acceptance is a probe run that has to measure
 * a page — not the download's exit code.
 */
export function ensureBanal(io: BanalIO): BanalStep {
  if (!perlRuns(io)) return { ok: false, lines: [PERL_MISSING] };
  const source = io.source ?? BANAL_PIN;
  const dest = installedBanal(io.env, io.home);
  const present = existsSync(dest) && sha256Of(dest) === source.sha256;
  if (!present) {
    mkdirSync(dirname(dest), { recursive: true });
    io.log(
      `  downloading banal ${BANAL_PIN.version} (HotCRP ${BANAL_PIN.commit.slice(0, 7)})…`,
    );
    const failed = download(io, source, dest);
    if (failed.length) return { ok: false, lines: failed };
  }
  const why = probeBanal(dest, io);
  if (why)
    return { ok: false, lines: [`banal in ${dest} does not run: ${why}`] };
  return { ok: true, path: dest, fresh: !present };
}

/** `--check`: is the pinned banal installed and running? `null` when it is, else why not. */
export function checkBanal(io: BanalIO): string | null {
  if (!perlRuns(io)) return PERL_MISSING;
  const source = io.source ?? BANAL_PIN;
  const dest = installedBanal(io.env, io.home);
  if (!existsSync(dest)) return `no banal in ${dest}`;
  if (sha256Of(dest) !== source.sha256)
    return `banal in ${dest} is not the pinned one (sha256 differs)`;
  return probeBanal(dest, io);
}
