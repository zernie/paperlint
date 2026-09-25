/**
 * BANAL — the page-geometry script HotCRP's format checker runs — fetched, verified and run.
 *
 * banal (Eddie Kohler, Geoffrey M. Voelker; https://github.com/kohler/hotcrp/blob/master/src/banal)
 * measures a paper's page size, column count, body and reference font sizes and page types. paperlint
 * runs the REAL banal, unmodified, so the numbers in the facts file are the numbers HotCRP shows a
 * reviewer at upload — a reimplementation would drift from them.
 *
 * ── THE LICENCE BOUNDARY ────────────────────────────────────────────────────────
 * banal is GPL-2.0-or-later; paperlint is MIT. paperlint therefore never contains banal: `paperlint toolchain`
 * DOWNLOADS it from HotCRP at a pinned commit, checks its sha256, and stores it in paperlint's cache, and
 * paperlint EXECUTES it as a separate program (`perl banal …`), reading its JSON output. Nothing of banal
 * is copied, vendored, linked or translated into this package.
 *
 * ── WITHOUT POPPLER ──────────────────────────────────────────────────────────────
 * banal reads a PDF by running poppler's `pdftohtml -xml` — but it also accepts that XML directly:
 * `banal_open_input` (banal 1.2, line 1815) takes a file ending in `.xml` and opens it as is. paperlint
 * writes that XML itself from the page layout pdf.js read (`./xml.ts`) and hands banal the `.xml` file,
 * beside a stub that answers banal's one question to poppler (`./invocation.ts`).
 *
 * ── THIS FILE ───────────────────────────────────────────────────────────────────
 * Running and installing banal, over the generic ports (`src/ports/`) and this folder's pure
 * modules; it imports nothing from `node:*` that touches the outside world. Failures stay banal's
 * own union here, so the tests can branch on them; `./index.ts` turns them into the ports the app
 * sees (`MeasureGeometry`, `ToolInstaller`).
 */
import type { AbsolutePath } from "../../domain/paths.ts";
import type { PageGeometry } from "../../domain/geometry.ts";
import type { Download } from "../../ports/download.ts";
import type { Files } from "../../ports/files.ts";
import type { RunProcess } from "../../ports/process.ts";
import type { Workspace } from "../../ports/workspace.ts";
import { andThen, err, ok, type Result } from "../../domain/result.ts";
import type { BanalFailure } from "./failure.ts";
import {
  banalCommand,
  BANAL_RUN_MS,
  stage,
  stageBanalInput,
} from "./invocation.ts";
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

/** The ports banal runs with. */
export interface BanalDeps {
  readonly run: RunProcess;
  readonly files: Files;
  readonly workspace: Workspace;
}

/** The ports installing banal needs besides: it downloads. */
export interface InstallDeps extends BanalDeps {
  readonly download: Download;
}

/**
 * What measuring came to, in banal's own terms: the banal found and its geometry, or banal's
 * failure and the banal that was tried. `./index.ts` projects it onto the domain's `Geometry`.
 */
export type BanalOutcome =
  | {
      readonly source: "banal";
      readonly by: BanalCandidate;
      readonly geometry: PageGeometry;
    }
  | {
      readonly source: "none";
      readonly why: BanalFailure;
      /** The banal that was run and failed; null when none was found. */
      readonly tried: BanalCandidate | null;
    };

/** Run `banal` on `pages` in a scratch directory that is gone when this returns. */
function runBanal(
  d: BanalDeps,
  s: BanalSettings,
  banal: LocatedBanal,
  pages: readonly PageLayout[],
): Result<BanalMeasurement, BanalFailure> {
  return d.workspace.within("paperlint-banal-", (scratch) =>
    parseBanalOutput(
      d.run.run(
        banalCommand(
          banal,
          stage(scratch, stageBanalInput(pages)),
          s.processEnv,
        ),
      ),
    ),
  );
}

/**
 * The page geometry banal measures for `pages` — the banal found by `$BANAL`, the project's
 * `vendor/banal`, or `paperlint toolchain`'s — or why there is none.
 */
export function measureGeometry(
  d: BanalDeps,
  s: BanalSettings,
  projectRoot: AbsolutePath,
  pages: readonly PageLayout[],
): BanalOutcome {
  const located = pickBanal(lookupOrder(s, projectRoot), (p) =>
    d.files.isFile(p),
  );
  if (!located.ok)
    return {
      source: "none",
      why: { kind: "banal-missing", missing: located.error },
      tried: null,
    };
  const by: BanalCandidate = located.value;
  const r = runBanal(d, s, located.value, pages);
  return r.ok
    ? { source: "banal", by, geometry: geometryOf(r.value) }
    : { source: "none", why: r.error, tried: by };
}

// ── installing it (`paperlint toolchain`) ──────────────────────────────────────────────────

/** Does perl start? banal is a Perl program; without perl nothing below can succeed. */
function perlRuns(d: BanalDeps, s: BanalSettings): boolean {
  const r = d.run.run({
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
  d: BanalDeps,
  s: BanalSettings,
  path: AbsolutePath,
): Result<PinnedBanal, BanalFailure> {
  const at: BanalCandidate = { path, provenance: { kind: "cache" } };
  const r = andThen(
    runBanal(d, s, at as LocatedBanal, [PROBE_PAGE]),
    acceptProbe,
  );
  return r.ok
    ? ok(at as PinnedBanal)
    : err({ kind: "does-not-run", path, why: r.error });
}

/** Download `source` into `dest`, keeping the bytes only when they hash to the pin. */
function install(
  d: InstallDeps,
  source: BanalSource,
  dest: AbsolutePath,
): Result<null, BanalFailure> {
  const got = d.download.fetch(source.url, BANAL_DOWNLOAD_SECONDS * 1000);
  if (!got.ok)
    return err({
      kind: "download-failed",
      url: source.url,
      detail: got.error.detail,
    });
  const pinned = verifyPin(got.value, source);
  if (!pinned.ok)
    return err({ kind: "sha-mismatch", url: source.url, ...pinned.error });
  d.files.writeAtomic(dest, pinned.value);
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
 * Make `paperlint toolchain`'s banal present, byte-identical to the pin, and RUNNING: perl is checked
 * first, a file with the wrong sha256 is replaced, and acceptance is a probe run that has to measure
 * a page — not the download's exit code.
 */
export function ensureBanal(
  d: InstallDeps,
  s: BanalSettings,
  o: EnsureOptions = {},
): Result<Installed, BanalFailure> {
  if (!perlRuns(d, s)) return err({ kind: "perl-missing" });
  const source = o.source ?? BANAL_PIN;
  const dest = installedBanal(s);
  const present =
    installedState(d.files.readBytes(dest), source).kind === "pinned";
  if (!present) {
    o.onDownload?.(`  downloading ${pinLabel()}…`);
    const done = install(d, source, dest);
    if (!done.ok) return done;
  }
  const ran = probe(d, s, dest);
  return ran.ok ? ok({ banal: ran.value, fresh: !present }) : ran;
}

/** `--check`: is the pinned banal installed and running? The same predicate as `ensureBanal`, no download. */
export function checkBanal(
  d: BanalDeps,
  s: BanalSettings,
  source: BanalSource = BANAL_PIN,
): Result<PinnedBanal, BanalFailure> {
  if (!perlRuns(d, s)) return err({ kind: "perl-missing" });
  const dest = installedBanal(s);
  const state = installedState(d.files.readBytes(dest), source);
  if (state.kind === "absent")
    return err({
      kind: "banal-missing",
      missing: { kind: "not-installed", installed: dest },
    });
  if (state.kind === "other-bytes")
    return err({ kind: "not-pinned", path: dest });
  return probe(d, s, dest);
}
