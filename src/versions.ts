/**
 * A PAPER'S FROZEN VERSIONS, read from the disk: the folder `versions/`, its lock, and the draft
 * measured against the frozen source it left (`src/domain/versions.ts` holds the convention and every
 * decision; this file reads and writes through the ports).
 *
 *   readVersions    the cycles, the lock and the files of `versions/`, as the rules and the table read them
 *   draftDrift      paper.tex, assembled as the build read it, against the frozen source of the attempt
 *   versionLines    the version → state table (`paperlint versions`, `paperlint submission show`)
 *   freezePlan      before a `submission --save` sends: what it will freeze, or why it cannot
 *   freezeSent      after the portal took it: the PDF sent and its source, written and locked
 */
import { join } from "node:path";
import { callerPath } from "./caller-path.ts";
import { venueCycleOf, type CycleId, type Cycles } from "./domain/cycle.ts";
import { sha256Hex } from "./domain/sha256.ts";
import { messageOf } from "./domain/text.ts";
import { err, ok, type Result } from "./domain/result.ts";
import {
  driftBase,
  frozenKey,
  lineDrift,
  lockText,
  LOCK_FILE,
  parseLock,
  versionRows,
  versionTable,
  VERSIONS_DIR,
  type DraftDrift,
  type Entry,
  type FileFacts,
  type Lock,
  type LockEntry,
} from "./domain/versions.ts";
import type { Files } from "./ports/files.ts";
import type { ListDir } from "./ports/talk-media.ts";
import { readCycles } from "./cycle-rules.ts";
import { readPaper, decoded, type ProseDeps } from "./tex-paper.ts";
import { MAIN } from "./build.ts";
import { paperRecord } from "./paper-record.ts";

/** The paper's `versions/` folder. */
export const versionsDir = (paperDir: string): string =>
  join(paperDir, VERSIONS_DIR);

/** A frozen file's path, by its key. */
export const frozenPath = (paperDir: string, key: string): string =>
  join(paperDir, VERSIONS_DIR, key);

/** Whether a frozen file is on disk, by its key. */
export const hasFrozen =
  (paperDir: string, files: Files) =>
  (key: string): boolean =>
    files.isFile(callerPath(frozenPath(paperDir, key)));

/** A frozen file's text, by its key; null when it is not there. */
export const frozenText = (
  paperDir: string,
  key: string,
  files: Files,
): string | null =>
  decoded(files.readBytes(callerPath(frozenPath(paperDir, key))));

/** The size and digest of a frozen file on disk, by its key: zero bytes of nothing when it is gone. */
export const factsOfFrozen =
  (paperDir: string, files: Files) =>
  (key: string): FileFacts => {
    const b =
      files.readBytes(callerPath(frozenPath(paperDir, key))) ??
      new Uint8Array();
    return { bytes: b.length, sha256: sha256Hex(b) };
  };

/** `versions/lock.json`: null when there is none; else parsed, or why it does not parse. */
export function readLock(
  paperDir: string,
  files: Files,
): Result<Lock, string> | null {
  const b = files.readBytes(callerPath(join(versionsDir(paperDir), LOCK_FILE)));
  if (b === null) return null;
  try {
    return parseLock(JSON.parse(new TextDecoder().decode(b)));
  } catch (e) {
    return err(`not JSON: ${messageOf(e)}`);
  }
}

/** What reading the folder needs: the disk and its listings. */
export interface VersionsDeps {
  readonly files: Files;
  readonly listDir: ListDir;
}

/** The entries of a folder, each a file or a folder, by name. */
export const entriesIn = (dir: string, deps: VersionsDeps): readonly Entry[] =>
  [...deps.listDir(callerPath(dir))].sort().map((name) => ({
    name,
    kind: deps.files.isFile(callerPath(join(dir, name))) ? "file" : "dir",
  }));

/** The paper's cycles, when it keeps them and they read; null for the flat form or a broken record. */
export function cyclesIn(paperDir: string, files: Files): Cycles | null {
  const r = readCycles(paperDir, { files });
  return r.ok ? r.value : null;
}

/** paper.tex, assembled as the last build read it (its includes spliced in); null without one. */
export function draftText(paperDir: string, deps: ProseDeps): string | null {
  const main = join(paperDir, MAIN);
  const src = decoded(deps.files.readBytes(callerPath(main)));
  return src === null ? null : readPaper(main, src, deps).text;
}

/** The draft against the frozen source of the paper's attempt: none, nothing frozen, the same, or drifted. */
export function draftDrift(
  paperDir: string,
  cycles: Cycles,
  draft: string,
  files: Files,
): DraftDrift {
  const base = driftBase(cycles.current, hasFrozen(paperDir, files));
  if (base === null) return { kind: "none" };
  const frozen = frozenText(paperDir, base.key, files);
  if (frozen === null) return { kind: "no-base", key: base.key };
  const drift = lineDrift(frozen, draft);
  return drift.added === 0 && drift.removed === 0
    ? { kind: "same", key: base.key }
    : { kind: "drift", key: base.key, drift };
}

/**
 * The version → state table of the paper in `paperDir`: each attempt's frozen files and what they
 * are, then the draft. Or why there is none: the paper keeps no `cycles`.
 */
export function versionLines(
  paperDir: string,
  deps: ProseDeps,
): Result<readonly string[], string> {
  const cycles = cyclesIn(paperDir, deps.files);
  if (cycles === null)
    return err(
      'the paper keeps no "cycles" in paperlint.json (or they do not read — `paperlint lint` says why): versions are kept per attempt, versions/<cycle>/<stage>.pdf',
    );
  const lock = readLock(paperDir, deps.files);
  const draft = draftText(paperDir, deps);
  return ok(
    versionTable(
      versionRows({
        cycles: cycles.list,
        has: hasFrozen(paperDir, deps.files),
        lock: lock?.ok === true ? lock.value : {},
        draft:
          draft === null
            ? { kind: "none" }
            : draftDrift(paperDir, cycles, draft, deps.files),
      }),
    ),
  );
}

// ── freezing what a submission sends ────────────────────────────────────────────────────

/** What a `--save` will freeze once the portal takes the PDF: nothing for the flat form, else where. */
export type FreezePlan =
  | { readonly kind: "flat" }
  | {
      readonly kind: "freeze";
      readonly cycle: CycleId;
      readonly stage: "submitted" | "camera-ready";
      /** paper.tex as the build read it, includes spliced in: the source the PDF was built from. */
      readonly source: string;
    };

const refusal = (why: string, cycle: string): string =>
  `refused: ${why}, and the two could not be frozen together in versions/${cycle}/ — rebuild (\`paperlint build\`), run the dry run again, then --save; nothing was sent`;

/** Why the source on disk cannot be frozen as the PDF's; null when the build's record says it can. */
function sourceProblem(
  paperDir: string,
  deps: ProseDeps,
): Result<string, string> {
  const record = paperRecord(paperDir, deps);
  if (record.kind === "none")
    return err(
      "no record of the build (_build/sources.json), so which source the PDF was built from is not known",
    );
  if (record.kind === "stale")
    return err(
      `${record.changed.map((x) => x.path).join(", ")} changed since the build, so the PDF is not what the source builds now`,
    );
  const source = draftText(paperDir, deps);
  return source === null
    ? err(`no ${MAIN} to freeze beside the PDF`)
    : ok(source);
}

/**
 * Before a `--save` sends: what it will freeze — the open cycle's `submitted`, or the accepted one's
 * `camera-ready` — and the source to freeze beside the PDF. Refused when the build's record does not
 * say the source on disk is the one the PDF was built from: a PDF frozen with another source is a
 * pair that lies.
 */
export function freezePlan(
  paperDir: string,
  cycles: Cycles | null,
  deps: ProseDeps,
): Result<FreezePlan, string> {
  const c = cycles === null ? null : venueCycleOf(cycles.current);
  if (cycles === null || c === null) return ok({ kind: "flat" });
  const source = sourceProblem(paperDir, deps);
  return source.ok
    ? ok({
        kind: "freeze",
        cycle: c.id,
        stage:
          cycles.current.kind === "accepted" ? "camera-ready" : "submitted",
        source: source.value,
      })
    : err(refusal(source.error, c.id));
}

/** What freezing writes with: the disk, and the instant the lock records (ISO 8601). */
export interface FreezeDeps {
  readonly files: Files;
  readonly now: () => string;
}

const lockEntry = (bytes: Uint8Array, frozen: string): LockEntry => ({
  kind: "file",
  bytes: bytes.length,
  sha256: sha256Hex(bytes),
  frozen,
});

/** What was sent: the paper, its plan, the PDF's bytes, and the paper as the command names it. */
export interface Sent {
  readonly paperDir: string;
  readonly plan: Extract<FreezePlan, { readonly kind: "freeze" }>;
  readonly pdf: Uint8Array;
  readonly shownPaper: string;
}

/** The lock with the two frozen files recorded, written; or why the lock on disk does not read. */
function lockSent(
  s: Sent,
  entries: Lock,
  deps: FreezeDeps,
): Result<null, string> {
  const lock = readLock(s.paperDir, deps.files) ?? ok({});
  if (!lock.ok) return lock;
  deps.files.writeAtomic(
    callerPath(join(versionsDir(s.paperDir), LOCK_FILE)),
    new TextEncoder().encode(lockText({ ...lock.value, ...entries })),
  );
  return ok(null);
}

/**
 * After the portal took the PDF: the PDF and its source written to `versions/<cycle>/<stage>.*`,
 * replacing an earlier upload's, and recorded in the lock. The line to print; an error line when the
 * lock does not read (the files are frozen, the lock left as it is).
 */
export function freezeSent(s: Sent, deps: FreezeDeps): Result<string, string> {
  const { cycle, stage } = s.plan;
  const source = new TextEncoder().encode(s.plan.source);
  const pdfKey = frozenKey(cycle, stage, "pdf");
  const texKey = frozenKey(cycle, stage, "tex");
  deps.files.writeAtomic(callerPath(frozenPath(s.paperDir, pdfKey)), s.pdf);
  deps.files.writeAtomic(callerPath(frozenPath(s.paperDir, texKey)), source);
  const frozen = deps.now();
  const locked = lockSent(
    s,
    { [pdfKey]: lockEntry(s.pdf, frozen), [texKey]: lockEntry(source, frozen) },
    deps,
  );
  return locked.ok
    ? ok(
        `frozen        versions/${pdfKey} (${String(s.pdf.length)} bytes) and ${stage}.tex (${String(source.length)} bytes), recorded in versions/lock.json`,
      )
    : err(
        `versions/lock.json does not read (${locked.error}): versions/${pdfKey} and ${stage}.tex are frozen, not recorded — \`npx paperlint versions lock ${s.shownPaper}\` records them`,
      );
}

/** What a send in the flat form says instead of a freeze. */
export const NOT_FROZEN =
  'not frozen    the paper keeps no "cycles" in paperlint.json: versions are frozen per attempt, in versions/<cycle>/ (docs/configuration.md, "The paper\'s cycles")';
