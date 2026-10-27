/**
 * `paperlint versions [show|lock|migrate] [paper]` — a paper's frozen versions, one folder per
 * attempt (src/domain/versions.ts):
 *
 *   show      (the default) each attempt's frozen versions and what they are, newest first, then the
 *             draft and how far it has moved from the version it is measured against
 *   lock      record the files of versions/ in versions/lock.json: what `submission --save` did not
 *             freeze — a file put there by hand, an arXiv copy, a recovered upload
 *   migrate   from the `stages:` list and dated files to folders per attempt, once
 *
 * ── WHY ONE NOUN, THREE VERBS ───────────────────────────────────────────────────────────────
 * docs/prior-art/multi-mode-tools.md: tools that stay small add verbs to a noun the project already
 * has, not nouns. The table is also printed by `paperlint submission show`, beside the portal's copy;
 * `versions` prints it without a token or a network call. `lock` is the `npm install` slot — make the
 * generated file match the disk — and `migrate` runs once per paper.
 */
import { join, relative, resolve } from "node:path";
import * as R from "remeda";
import { callerPath } from "./caller-path.ts";
import type { Cycles } from "./domain/cycle.ts";
import { fieldOf, isRecord } from "./domain/record.ts";
import { err, ok, type Result } from "./domain/result.ts";
import { sha256Hex } from "./domain/sha256.ts";
import {
  frontmatterOf,
  planMigration,
  withoutStages,
  type MigrationPlan,
} from "./domain/versions-migration.ts";
import {
  frozenKey,
  frozenName,
  LOCK_FILE,
  lockText,
  relock,
  type Lock,
  type OnDisk,
} from "./domain/versions.ts";
import type { CopyFile, MoveFile } from "./ports/move-file.ts";
import type { ParseYaml } from "./ports/yaml.ts";
import type { ProseDeps } from "./tex-paper.ts";
import {
  cyclesIn,
  entriesIn,
  factsOfFrozen,
  readLock,
  versionLines,
  versionsDir,
  type VersionsDeps,
} from "./versions.ts";

const SUBS = ["show", "lock", "migrate"] as const;
type Sub = (typeof SUBS)[number];
const isSub = (s: unknown): s is Sub => SUBS.some((x) => x === s);

const STATUS_FILE = "PIPELINE-STATUS.md";

export interface VersionsCommandDeps extends ProseDeps, VersionsDeps {
  readonly move: MoveFile;
  readonly copy: CopyFile;
  readonly yaml: ParseYaml;
  /** The instant a lock entry records, ISO 8601. */
  readonly now: () => string;
  readonly cwd: string;
  readonly log: (line: string) => void;
  readonly err: (line: string) => void;
}

/** The words after `versions` → the subcommand, the paper folder, and what is left over. Pure. */
export function versionsArgs(words: readonly string[]): {
  readonly sub: Sub;
  readonly paper: string;
  readonly extra: readonly string[];
} {
  const [first, ...rest] = words;
  const named = isSub(first);
  const after = named ? rest : words;
  return {
    sub: named ? first : "show",
    paper: after[0] ?? ".",
    extra: after.slice(1),
  };
}

/** The paper as a command line names it, from where the command runs. */
const shown = (cwd: string, p: string): string => relative(cwd, p) || ".";

const logAll = (lines: readonly string[], deps: VersionsCommandDeps): void => {
  lines.forEach((l) => {
    deps.log(l);
  });
};

// ── lock ────────────────────────────────────────────────────────────────────────────────

/** Every frozen file in the cycles' folders, with what it holds. */
function onDisk(
  paperDir: string,
  cycles: Cycles,
  deps: VersionsCommandDeps,
): readonly OnDisk[] {
  const root = versionsDir(paperDir);
  const facts = factsOfFrozen(paperDir, deps.files);
  return cycles.list.flatMap((c) =>
    entriesIn(join(root, c.id), deps).flatMap((e) => {
      const n = e.kind === "file" ? frozenName(e.name) : null;
      return n === null
        ? []
        : [
            {
              key: frozenKey(c.id, n.stage, n.ext),
              facts: facts(frozenKey(c.id, n.stage, n.ext)),
            },
          ];
    }),
  );
}

const writeLock = (
  paperDir: string,
  lock: Lock,
  deps: VersionsCommandDeps,
): void => {
  deps.files.writeAtomic(
    callerPath(join(versionsDir(paperDir), LOCK_FILE)),
    new TextEncoder().encode(lockText(lock)),
  );
};

function runLock(
  paperDir: string,
  cycles: Cycles,
  deps: VersionsCommandDeps,
): number {
  const found = onDisk(paperDir, cycles, deps);
  const old = readLock(paperDir, deps.files);
  if (found.length === 0 && old === null)
    return (deps.log("nothing frozen in versions/ — no lock to write"), 0);
  const r = relock(found, old?.ok === true ? old.value : {}, deps.now());
  writeLock(paperDir, r.lock, deps);
  logAll(
    [
      ...(old?.ok === false
        ? [
            `versions/lock.json did not read (${old.error}): written anew from the files`,
          ]
        : []),
      ...r.lines,
    ],
    deps,
  );
  if (old?.ok !== false && r.lines.length === 0)
    deps.log("versions/lock.json records every frozen file as it stands");
  return 0;
}

// ── migrate ─────────────────────────────────────────────────────────────────────────────

/** What the scorecard holds for the migration: its `stages:` list, and its text without it (null: none to take out). */
interface Scorecard {
  readonly stages: readonly unknown[];
  readonly without: string | null;
}

/** The scorecard's text, "" when there is none. */
const statusText = (paperDir: string, deps: VersionsCommandDeps): string =>
  new TextDecoder().decode(
    deps.files.readBytes(callerPath(join(paperDir, STATUS_FILE))) ??
      new Uint8Array(),
  );

/** Whether the scorecard without its list says everything else it said: parsed, both, and compared. */
function keepsTheRest(
  before: Readonly<Record<string, unknown>>,
  without: string,
  yaml: ParseYaml,
): boolean {
  const after = yaml(frontmatterOf(without) ?? "");
  return (
    after.ok && R.isDeepEqual(R.omit(before, ["stages"]), after.value ?? {})
  );
}

/** The scorecard read and its list taken out — checked by parsing both, so a cut that misreads is refused. */
function scorecard(
  paperDir: string,
  deps: VersionsCommandDeps,
): Result<Scorecard, string> {
  const text = statusText(paperDir, deps);
  const before = deps.yaml(frontmatterOf(text) ?? "");
  if (!before.ok)
    return err(
      `${STATUS_FILE}: the frontmatter does not parse (${before.error}) — fix it, then migrate`,
    );
  // A frontmatter that is no mapping (none, or a bare value) has no `stages:` key to take out.
  const fields = isRecord(before.value) ? before.value : {};
  const list = fieldOf(fields, "stages");
  const stages: readonly unknown[] = Array.isArray(list) ? list : [];
  const without = withoutStages(text);
  return without === null || keepsTheRest(fields, without, deps.yaml)
    ? ok({ stages, without })
    : err(
        `${STATUS_FILE}: taking the stages: list out would change the rest of its frontmatter — take it out by hand, then migrate`,
      );
}

/** A file of the paper, by its path relative to the paper: its size and digest, or null. */
const paperFacts =
  (paperDir: string, deps: VersionsCommandDeps) => (rel: string) => {
    const b = deps.files.readBytes(callerPath(resolve(paperDir, rel)));
    return b === null ? null : { bytes: b.length, sha256: sha256Hex(b) };
  };

/** Each copy, then each move: a shared source is copied before the move takes it away. */
function carry(
  paperDir: string,
  plan: MigrationPlan,
  deps: VersionsCommandDeps,
): void {
  const at = (rel: string) => callerPath(resolve(paperDir, rel));
  plan.copies.forEach((m) => {
    deps.copy(at(m.from), at(m.to));
    deps.log(`copied        ${m.from} → ${m.to}`);
  });
  plan.moves.forEach((m) => {
    deps.move(at(m.from), at(m.to));
    deps.log(`moved         ${m.from} → ${m.to}`);
  });
}

/** The plan carried out: the files, the lock, the scorecard without its list. */
function migrate(
  paperDir: string,
  plan: MigrationPlan,
  card: Scorecard,
  deps: VersionsCommandDeps,
): number {
  carry(paperDir, plan, deps);
  const entries = Object.keys(plan.lock).length;
  if (entries > 0) {
    writeLock(paperDir, plan.lock, deps);
    deps.log(`recorded      versions/lock.json, ${String(entries)} entries`);
  }
  if (card.without !== null) {
    deps.files.writeAtomic(
      callerPath(join(paperDir, STATUS_FILE)),
      new TextEncoder().encode(card.without),
    );
    deps.log(
      `removed       the stages: list from ${STATUS_FILE} — the folders and the lock are the record now`,
    );
  }
  return 0;
}

/** The lock already there, or the line saying it must be written first. */
function lockBefore(
  paperDir: string,
  deps: VersionsCommandDeps,
): Result<Lock, string> {
  const lock = readLock(paperDir, deps.files) ?? ok({});
  return lock.ok
    ? lock
    : err(
        `versions/lock.json: ${lock.error} — \`npx paperlint versions lock ${shown(deps.cwd, paperDir)}\` writes it anew; then migrate`,
      );
}

function runMigrate(
  paperDir: string,
  cycles: Cycles,
  deps: VersionsCommandDeps,
): number {
  const card = scorecard(paperDir, deps);
  if (!card.ok) return (deps.err(card.error), 2);
  const lock = lockBefore(paperDir, deps);
  if (!lock.ok) return (deps.err(lock.error), 2);
  const plan = planMigration({
    cycleIds: cycles.list.map((c) => c.id),
    stages: card.value.stages,
    root: entriesIn(versionsDir(paperDir), deps),
    factsOf: paperFacts(paperDir, deps),
    lock: lock.value,
    exists: (rel) => deps.files.isFile(callerPath(resolve(paperDir, rel))),
  });
  if (!plan.ok) return refused([...plan.error, "nothing was moved"], deps);
  // A copy always has its move: the last destination of a shared source is moved, not copied.
  if (plan.value.moves.length === 0 && card.value.without === null)
    return (
      deps.log(
        `nothing to migrate: ${STATUS_FILE} has no stages: list, and no file of the old layout is left in versions/`,
      ),
      0
    );
  return migrate(paperDir, plan.value, card.value, deps);
}

const refused = (
  lines: readonly string[],
  deps: VersionsCommandDeps,
): number => {
  lines.forEach((l) => {
    deps.err(l);
  });
  return 2;
};

// ── the command ─────────────────────────────────────────────────────────────────────────

const NO_CYCLES_LOCK =
  'the paper keeps no "cycles" in paperlint.json: there is no versions/<cycle>/ to lock (docs/configuration.md, "The paper\'s cycles")';

const NO_CYCLES_MIGRATE =
  'the paper keeps no "cycles" in paperlint.json: its stages: list stays its record — folders per attempt are named by cycle ids (docs/configuration.md, "The paper\'s cycles")';

/** `paperlint versions …`: exit 0, or 2 for a command line or a paper it cannot run on. */
export function runVersions(
  words: readonly string[],
  deps: VersionsCommandDeps,
): number {
  const a = versionsArgs(words);
  if (a.extra.length > 0)
    return (
      deps.err(
        `\`versions ${a.sub}\` takes one paper folder — got also \`${a.extra.join(" ")}\``,
      ),
      2
    );
  const paperDir = resolve(deps.cwd, a.paper);
  if (a.sub === "show") {
    const lines = versionLines(paperDir, deps);
    if (!lines.ok) return (deps.err(lines.error), 2);
    return (logAll(lines.value, deps), 0);
  }
  const cycles = cyclesIn(paperDir, deps.files);
  if (cycles === null)
    return (deps.err(a.sub === "lock" ? NO_CYCLES_LOCK : NO_CYCLES_MIGRATE), 2);
  return a.sub === "lock"
    ? runLock(paperDir, cycles, deps)
    : runMigrate(paperDir, cycles, deps);
}
