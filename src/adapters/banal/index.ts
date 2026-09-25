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
 * writes that XML itself from the page layout pdf.js read (`./xml.ts`) and hands banal the `.xml` file,
 * beside a stub that answers banal's one question to poppler (`./invocation.ts`).
 *
 * ── THIS FILE ───────────────────────────────────────────────────────────────────
 * banal's adapter, and its entry point (`src/adapters/banal/`): everything here exists because banal
 * does. It is a composite over the ports (`domain/ports.ts`) and this folder's pure modules, and
 * imports nothing from `node:*` that touches the outside world. The composition root hands it an
 * `Io` and the parsed `BanalSettings`.
 */
import type { AbsolutePath, Io } from "../../domain/ports.ts";
import { andThen, err, ok, type Result } from "../../domain/result.ts";
import type { BanalFailure } from "./failure.ts";
import type { Geometry } from "./geometry.ts";
import { banalCommand, BANAL_RUN_MS, stageBanalInput } from "./invocation.ts";
import { installedState, verifyPin } from "./install.ts";
import {
  installedBanal,
  lookupOrder,
  pickBanal,
  type BanalCandidate,
  type LocatedBanal,
  type PinnedBanal,
} from "./locate.ts";
import {
  geometryOf,
  parseBanalOutput,
  type BanalMeasurement,
} from "./output.ts";
import { BANAL_PIN, pinLabel, type BanalSource } from "./pin.ts";
import { acceptProbe, PROBE_PAGE } from "./probe.ts";
import type { BanalSettings } from "./settings.ts";
import type { PageLayout } from "../../domain/page-layout.ts";

/** Seconds: banal is ~90 KB. */
export const BANAL_DOWNLOAD_SECONDS = 60;

/** Run `banal` on `pages` in a scratch directory that is gone when this returns. */
function runBanal(
  io: Io,
  s: BanalSettings,
  banal: LocatedBanal,
  pages: readonly PageLayout[],
): Result<BanalMeasurement, BanalFailure> {
  return io.workspace.within("rpp-banal-", (scratch) =>
    parseBanalOutput(
      io.run.run(
        banalCommand(
          banal,
          scratch.stage(stageBanalInput(pages)),
          s.processEnv,
        ),
      ),
    ),
  );
}

/**
 * The page geometry banal measures for `pages` — the banal found by `$BANAL`, the project's
 * `vendor/banal`, or `rpp toolchain`'s — or why there is none.
 */
export function measureGeometry(
  io: Io,
  s: BanalSettings,
  projectRoot: AbsolutePath,
  pages: readonly PageLayout[],
): Geometry {
  const located = pickBanal(lookupOrder(s, projectRoot), (p) =>
    io.files.isFile(p),
  );
  if (!located.ok)
    return {
      source: "none",
      why: { kind: "banal-missing", missing: located.error },
      tried: null,
    };
  const by: BanalCandidate = located.value;
  const r = runBanal(io, s, located.value, pages);
  return r.ok
    ? { source: "banal", by, geometry: geometryOf(r.value) }
    : { source: "none", why: r.error, tried: by };
}

// ── installing it (`rpp toolchain`) ──────────────────────────────────────────────────

/** Does perl start? banal is a Perl program; without perl nothing below can succeed. */
function perlRuns(io: Io, s: BanalSettings): boolean {
  const r = io.run.run({
    file: "perl",
    args: ["-e", "exit 0"],
    env: s.processEnv,
    timeoutMs: BANAL_RUN_MS,
  });
  return r.kind === "exited" && r.status === 0;
}

/**
 * Does the installed, pin-verified banal RUN — accepted by measuring the probe page, not by a
 * download's exit code. The one place a `PinnedBanal` is minted; callers verified the bytes first.
 */
function probe(
  io: Io,
  s: BanalSettings,
  path: AbsolutePath,
): Result<PinnedBanal, BanalFailure> {
  const at: BanalCandidate = { path, provenance: { kind: "cache" } };
  const r = andThen(
    runBanal(io, s, at as LocatedBanal, [PROBE_PAGE]),
    acceptProbe,
  );
  return r.ok
    ? ok(at as PinnedBanal)
    : err({ kind: "does-not-run", path, why: r.error });
}

/** Download `source` into `dest`, keeping the bytes only when they hash to the pin. */
function install(
  io: Io,
  source: BanalSource,
  dest: AbsolutePath,
): Result<null, BanalFailure> {
  const got = io.download.fetch(source.url, BANAL_DOWNLOAD_SECONDS * 1000);
  if (!got.ok)
    return err({
      kind: "download-failed",
      url: source.url,
      detail: got.error.detail,
    });
  const pinned = verifyPin(got.value, source);
  if (!pinned.ok)
    return err({ kind: "sha-mismatch", url: source.url, ...pinned.error });
  io.files.writeAtomic(dest, pinned.value);
  return ok(null);
}

export interface Installed {
  readonly banal: PinnedBanal;
  /** True when this run downloaded it. */
  readonly fresh: boolean;
}

export interface EnsureOptions {
  /** What to download — the pin by default; a test passes a local file. */
  readonly source?: BanalSource;
  /** Told before a download starts (it can take a while). */
  readonly onDownload?: (line: string) => void;
}

/**
 * Make `rpp toolchain`'s banal present, byte-identical to the pin, and RUNNING: perl is checked
 * first, a file with the wrong sha256 is replaced, and acceptance is a probe run that has to measure
 * a page — not the download's exit code.
 */
export function ensureBanal(
  io: Io,
  s: BanalSettings,
  o: EnsureOptions = {},
): Result<Installed, BanalFailure> {
  if (!perlRuns(io, s)) return err({ kind: "perl-missing" });
  const source = o.source ?? BANAL_PIN;
  const dest = installedBanal(s);
  const present =
    installedState(io.files.readBytes(dest), source).kind === "pinned";
  if (!present) {
    o.onDownload?.(`  downloading ${pinLabel()}…`);
    const done = install(io, source, dest);
    if (!done.ok) return done;
  }
  const ran = probe(io, s, dest);
  return ran.ok ? ok({ banal: ran.value, fresh: !present }) : ran;
}

/** `--check`: is the pinned banal installed and running? The same predicate as `ensureBanal`, no download. */
export function checkBanal(
  io: Io,
  s: BanalSettings,
  source: BanalSource = BANAL_PIN,
): Result<PinnedBanal, BanalFailure> {
  if (!perlRuns(io, s)) return err({ kind: "perl-missing" });
  const dest = installedBanal(s);
  const state = installedState(io.files.readBytes(dest), source);
  if (state.kind === "absent")
    return err({
      kind: "banal-missing",
      missing: { kind: "not-installed", installed: dest },
    });
  if (state.kind === "other-bytes")
    return err({ kind: "not-pinned", path: dest });
  return probe(io, s, dest);
}
