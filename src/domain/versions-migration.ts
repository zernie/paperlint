/**
 * FROM `stages:` TO FOLDERS PER ATTEMPT — what `paperlint versions migrate` decides before it touches
 * anything: each entry of the scorecard's `stages:` list becomes a move of its PDF and source into
 * `versions/<cycle>/<stage>.{pdf,tex}` and an entry of `versions/lock.json`, and the list is dropped.
 *
 * The entry's `cycle:` names the folder, its `date:` becomes the day the lock says it was frozen, and
 * its `bytes:` / `sourceBytes:` are checked against the files once more: a file that is no longer the
 * one declared is not moved under a lock that would vouch for it. `sourceLost: true` becomes a lock
 * entry that records the loss. A frozen file of the old layout that no entry names, and an entry that
 * names no cycle, stop the whole migration with what to do — nothing is half-moved.
 *
 * Pure: the caller reads the disk and hands in what it found.
 */
import * as R from "remeda";
import type { CycleId } from "./cycle.ts";
import { asPaperPath, paperPath, type PaperPath } from "./paths.ts";
import { isRecord } from "./record.ts";
import { err, ok, type Result } from "./result.ts";
import {
  DATED_NAME,
  frozenKey,
  LOCK_FILE,
  VERSION_STAGES,
  VERSIONS_DIR,
  type Entry,
  type FileFacts,
  type Lock,
  type LockEntry,
  type VersionExt,
  type VersionStage,
} from "./versions.ts";

/** A file moved (or copied), both paths parsed: one spelling per file, inside the paper folder. */
export interface Move {
  readonly from: PaperPath;
  readonly to: PaperPath;
}

export interface MigrationPlan {
  /**
   * A source two stages were built from, copied to every destination but its last, which the move
   * takes: done before the moves, so each copy reads the file before it leaves.
   */
  readonly copies: readonly Move[];
  readonly moves: readonly Move[];
  /** The lock after the migration: what was there, and an entry per file moved or source lost. */
  readonly lock: Lock;
}

export interface MigrationInput {
  readonly cycleIds: readonly CycleId[];
  /** The scorecard's `stages:` list, as its YAML parsed. */
  readonly stages: readonly unknown[];
  /** The entries directly in `versions/`. */
  readonly root: readonly Entry[];
  /** The size and digest of a file of the paper, by its path relative to the paper; null when absent. */
  readonly factsOf: (rel: PaperPath) => FileFacts | null;
  /** The lock already there (versions frozen on send since), or none. */
  readonly lock: Lock;
  /** Whether a file of the paper is there, by its path relative to the paper: a destination taken. */
  readonly exists: (rel: PaperPath) => boolean;
}

/** One entry's part of the plan: moves and lock entries, or what stops it. */
interface Part {
  readonly moves: readonly Move[];
  readonly lock: Lock;
  readonly problems: readonly string[];
}

const NONE: Part = { moves: [], lock: {}, problems: [] };
const problem = (why: string): Part => ({ ...NONE, problems: [why] });

const isStage = (s: unknown): s is VersionStage =>
  VERSION_STAGES.some((v) => v === s);

const text = (v: unknown): string =>
  typeof v === "string" ? v : v === undefined ? "" : JSON.stringify(v);

/** A YAML date without quotes is a `Date`; either way, the day it names, or "" when it names none. */
function isoDate(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return typeof v === "string"
    ? (/^\d{4}-\d{2}-\d{2}$/.exec(v)?.[0] ?? "")
    : "";
}

/** Where an entry's file goes, checked against what the entry declares of it. */
interface Target {
  readonly at: string;
  readonly cycle: CycleId;
  readonly stage: VersionStage;
  readonly date: string;
}

/**
 * A path a stage declares, parsed once where the plan reads the list: absent (not a string), or the
 * file it names in one spelling, or why it names no file of the paper.
 */
type DeclaredPath = Result<PaperPath, string> | null;

/** One `stages:` entry as the plan reads it: the record, and its two paths parsed. */
interface Declaration {
  readonly rec: Readonly<Record<string, unknown>>;
  readonly pdf: DeclaredPath;
  readonly source: DeclaredPath;
}

const declaredPath = (v: unknown): DeclaredPath =>
  typeof v === "string" ? paperPath(v) : null;

const declaration = (e: unknown): Declaration => {
  const rec = isRecord(e) ? e : {};
  return {
    rec,
    pdf: declaredPath(rec["pdf"]),
    source: declaredPath(rec["source"]),
  };
};

/** A declared path that names no file of the paper: what stops the entry. */
const outside = (t: Target, error: string): Part =>
  problem(
    `${t.at}: ${error} — a stage names a file of this paper, relative to it`,
  );

/** One declared file → its move and lock entry, or why it cannot move. */
function filePart(
  t: Target,
  f: {
    readonly path: PaperPath;
    readonly declared: unknown;
    readonly ext: VersionExt;
  },
  factsOf: MigrationInput["factsOf"],
): Part {
  const { path, declared, ext } = f;
  const facts = factsOf(path);
  if (facts === null) return problem(`${t.at}: \`${path}\` is not on disk`);
  if (typeof declared === "number" && declared !== facts.bytes)
    return problem(
      `${t.at}: \`${path}\` has ${String(facts.bytes)} bytes, the stage declares ${String(declared)} — it is not the file that was frozen: restore it from git first`,
    );
  const key = frozenKey(t.cycle, t.stage, ext);
  const entry: LockEntry = { kind: "file", ...facts, frozen: t.date };
  return {
    moves: [{ from: path, to: asPaperPath(`${VERSIONS_DIR}/${key}`) }],
    lock: { [key]: entry },
    problems: [],
  };
}

const merge = (parts: readonly Part[]): Part => ({
  moves: parts.flatMap((p) => p.moves),
  lock: parts.reduce<Lock>((acc, p) => ({ ...acc, ...p.lock }), {}),
  problems: parts.flatMap((p) => p.problems),
});

/** The source of an entry: lost, a file, or none (versions/layout then says the PDF has none). */
function sourcePart(
  t: Target,
  d: Declaration,
  factsOf: MigrationInput["factsOf"],
): Part {
  if (d.rec["sourceLost"] === true)
    return {
      ...NONE,
      lock: {
        [frozenKey(t.cycle, t.stage, "tex")]: { kind: "lost", frozen: t.date },
      },
    };
  if (d.source === null) return NONE;
  return d.source.ok
    ? filePart(
        t,
        { path: d.source.value, declared: d.rec["sourceBytes"], ext: "tex" },
        factsOf,
      )
    : outside(t, d.source.error);
}

/** Where one `stages:` entry goes, or why it has no place. */
function targetOf(
  rec: Readonly<Record<string, unknown>>,
  i: number,
  ids: readonly CycleId[],
): Result<Target, string> {
  const at = `stages[${String(i)}]`;
  const stage = rec["stage"];
  if (!isStage(stage))
    return err(
      `${at}: the stage «${text(stage)}» has no place in versions/<cycle>/ — the stages are ${VERSION_STAGES.join(", ")}`,
    );
  const cycle = ids.find((id) => id === rec["cycle"]);
  if (cycle === undefined)
    return err(
      `${at} («${stage}»): names no cycle of paperlint.json — add \`cycle: <id>\` (${ids.join(" · ") || "none declared"}), the attempt the PDF was sent in, then migrate`,
    );
  const date = isoDate(rec["date"]);
  return date === ""
    ? err(`${at} («${stage}»): "date" is not YYYY-MM-DD`)
    : ok({ at, cycle, stage, date });
}

/** One `stages:` entry → its moves and lock entries. */
function entryPart(d: Declaration, i: number, input: MigrationInput): Part {
  const t = targetOf(d.rec, i, input.cycleIds);
  if (!t.ok) return problem(t.error);
  return merge([
    pdfPart(t.value, d, input.factsOf),
    sourcePart(t.value, d, input.factsOf),
  ]);
}

/** The PDF of an entry: a move, or why there is none. */
function pdfPart(
  t: Target,
  d: Declaration,
  factsOf: MigrationInput["factsOf"],
): Part {
  if (d.pdf === null) return problem(`${t.at} («${t.stage}»): no "pdf"`);
  return d.pdf.ok
    ? filePart(
        t,
        { path: d.pdf.value, declared: d.rec["bytes"], ext: "pdf" },
        factsOf,
      )
    : outside(t, d.pdf.error);
}

/** Every file the entries name, moved or not, in its one spelling. */
const named = (decls: readonly Declaration[]): readonly PaperPath[] =>
  decls
    .flatMap((d) => [d.pdf, d.source])
    .flatMap((p) => (p?.ok === true ? [p.value] : []));

/**
 * Files no entry names, at the top of versions/: a dated one of the old layout stops it — it may be a
 * stage nobody declared — and any other (a withdrawn `STALE` copy, a note on the old convention) goes to
 * extra/versions/, since versions/layout allows nothing loose beside lock.json.
 */
function leftovers(input: MigrationInput, moved: readonly PaperPath[]): Part {
  const left = input.root.filter(
    (e) => e.kind === "file" && !e.name.startsWith(".") && e.name !== LOCK_FILE,
  );
  return merge(
    left.map((e): Part => {
      const from = paperPath(`${VERSIONS_DIR}/${e.name}`);
      if (!from.ok)
        return problem(
          `versions/${e.name}: not a file name migrate can move — rename it, then migrate`,
        );
      if (moved.includes(from.value)) return NONE;
      return DATED_NAME.test(e.name)
        ? problem(
            `versions/${e.name}: no stage in \`stages:\` names it — declare it with its cycle, or move it to extra/, then migrate`,
          )
        : {
            ...NONE,
            moves: [
              { from: from.value, to: asPaperPath(`extra/versions/${e.name}`) },
            ],
          };
    }),
  );
}

/** Two entries frozen into one place: an attempt keeps one upload per stage. */
const collisions = (moves: readonly Move[]): readonly string[] =>
  Object.entries(R.groupBy(moves, (m) => m.to))
    .filter(([, ms]) => ms.length > 1)
    .map(
      ([to, ms]) =>
        `${to}: ${ms.map((m) => `\`${m.from}\``).join(" and ")} would both go there — an attempt keeps its last upload per stage: move the older to extra/, drop its entry from \`stages:\`, then migrate`,
    );

/**
 * One source named by several stages (the old layout let a `submitted` and an `arxiv` share the
 * source they were built from): copied to each destination but the last, and moved to that one.
 * Renaming it twice would fail on the second rename, after the first files had moved.
 */
function shared(moves: readonly Move[]): {
  readonly copies: readonly Move[];
  readonly moves: readonly Move[];
} {
  const last = (m: Move, i: number) =>
    !moves.slice(i + 1).some((n) => n.from === m.from);
  return {
    copies: moves.filter((m, i) => !last(m, i)),
    moves: moves.filter(last),
  };
}

/** Destinations a file is already at — a version frozen on send since, or an earlier copy in extra/. */
const taken = (
  moves: readonly Move[],
  exists: MigrationInput["exists"],
): readonly string[] =>
  moves
    .filter((m) => exists(m.to))
    .map(
      (m) =>
        `${m.to} is already there, and \`${m.from}\` would replace it — compare the two, keep one, move the other out of versions/, then migrate`,
    );

/** The whole migration, or every reason it cannot run: nothing is planned that could stop half-way. Pure. */
export function planMigration(
  input: MigrationInput,
): Result<MigrationPlan, readonly string[]> {
  // Every declared path parsed once, here: everything below compares one spelling per file.
  const decls = input.stages.map(declaration);
  const entries = merge(decls.map((d, i) => entryPart(d, i, input)));
  const rest = leftovers(input, named(decls));
  const all = [...entries.moves, ...rest.moves].filter((m) => m.from !== m.to);
  const problems = [
    ...entries.problems,
    ...rest.problems,
    ...collisions(all),
    ...taken(all, input.exists),
  ];
  return problems.length > 0
    ? err(problems)
    : ok({ ...shared(all), lock: { ...input.lock, ...entries.lock } });
}

// ── the rehearsal ────────────────────────────────────────────────────────────────────────

/** One step of a plan, as the rehearsal replays it. */
interface Step {
  readonly verb: "copy" | "move";
  readonly from: PaperPath;
  readonly to: PaperPath;
}

/** The files there after one step, and what stopped it. */
interface Stage {
  readonly there: readonly PaperPath[];
  readonly problems: readonly string[];
}

/** One step on the files there: it needs its source and a free destination. */
function replay(state: Stage, s: Step): Stage {
  const at = `${s.verb} ${s.from} → ${s.to}`;
  if (!state.there.includes(s.from))
    return {
      ...state,
      problems: [
        ...state.problems,
        `${at}: ${s.from} is not there at that step`,
      ],
    };
  if (state.there.includes(s.to))
    return {
      ...state,
      problems: [
        ...state.problems,
        `${at}: ${s.to} is already there at that step`,
      ],
    };
  const kept =
    s.verb === "move" ? state.there.filter((p) => p !== s.from) : state.there;
  return { ...state, there: [...kept, s.to] };
}

/**
 * The plan replayed on the paths it touches, before the disk is: each copy and each move needs its
 * source and a free destination at its step, and every file the new lock vouches for is there at the
 * end. The planner's own checks give the reasons a person can act on; this is the backstop that turns
 * any plan they let through by mistake into a refusal, never a paper moved half-way. Pure.
 */
export function rehearse(
  plan: MigrationPlan,
  exists: (p: PaperPath) => boolean,
): Result<null, readonly string[]> {
  const steps: readonly Step[] = [
    ...plan.copies.map((m) => ({ verb: "copy" as const, ...m })),
    ...plan.moves.map((m) => ({ verb: "move" as const, ...m })),
  ];
  const vouched = Object.entries(plan.lock)
    .filter(([, e]) => e.kind === "file")
    .map(([key]) => asPaperPath(`${VERSIONS_DIR}/${key}`));
  const touched = R.unique([
    ...steps.flatMap((s) => [s.from, s.to]),
    ...vouched,
  ]);
  const end = steps.reduce(replay, {
    there: touched.filter(exists),
    problems: [],
  });
  const missing = vouched
    .filter((p) => !end.there.includes(p))
    .map(
      (p) =>
        `versions/lock.json would vouch for ${p}, which would not be there after the migration`,
    );
  const problems = [...end.problems, ...missing];
  return problems.length > 0 ? err(problems) : ok(null);
}

// ── the scorecard's frontmatter ──────────────────────────────────────────────────────────

const FRONTMATTER = /^---\n([\s\S]*?\n)?---(?:\n|$)/;

/** The YAML between the scorecard's `---` lines; null when it has none. Pure. */
export function frontmatterOf(markdown: string): string | null {
  const m = FRONTMATTER.exec(markdown);
  return m === null ? null : (m[1] ?? "");
}

/**
 * The scorecard with its `stages:` key — the line and every indented or list line under it — taken
 * out of the frontmatter; the frontmatter itself dropped when nothing is left in it. Null when there
 * is no `stages:` key at the top of a frontmatter. Pure: the caller checks the result with a YAML
 * parser, so a layout this misreads is refused, not written.
 */
export function withoutStages(markdown: string): string | null {
  const m = FRONTMATTER.exec(markdown);
  const lines = (m?.[1] ?? "").split("\n");
  const start = lines.findIndex((l) => /^stages\s*:/.test(l));
  if (m === null || start < 0) return null;
  const after = lines.slice(start + 1);
  const length = after.findIndex((l) => /^[^\s#-]/.test(l));
  const kept = [
    ...lines.slice(0, start),
    ...(length < 0 ? [] : after.slice(length)),
  ].join("\n");
  const body = markdown.slice(m[0].length);
  return kept.trim() === "" ? body : `---\n${kept.trimEnd()}\n---\n${body}`;
}
