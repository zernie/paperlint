/**
 * The `lint-edited` hook — `paperlint lint` on the file an agent just wrote, while it writes, and only
 * the errors THIS edit introduced. PostToolUse on `Edit|Write|MultiEdit` (`plugin/hooks/hooks.json`):
 * when the edit left an error that was not there before, the hook answers `{"decision":"block"}` with
 * the findings as `paperlint lint` prints them. Claude Code puts that reason next to the tool's result;
 * the edit is NOT undone (PostToolUse runs after it), and the agent fixes the error in the same turn
 * instead of at the next lint, or in CI.
 *
 * ── WHAT IT LINTS ────────────────────────────────────────────────────────────────
 * The edited file and the paper's `paper.tex`, with the ESLint `paperlint lint` builds for that paper
 * (`paperEslint`, src/cli.ts — one function for both, so the two cannot drift): the same config, the
 * same rules, the same body files from `_build/sources.json`. Whether the edited file is one paperlint
 * lints is ESLint's own answer (`isPathIgnored` on that config), not a second list of patterns: a
 * file it does not lint gets no output. Only errors count; a warning never blocks.
 *
 * ── WHAT "INTRODUCED BY THIS EDIT" MEANS: A SNAPSHOT ─────────────────────────────
 * `<paper>/_build/edit-lint.json` holds, per file, the errors of the last run, each keyed by its file
 * (relative to the paper), rule, message, and the trimmed text of the line it points at — not the
 * line number, so a line inserted above an old error does not make it new. The keys are counted as a
 * multiset: an error is new when its key occurs more often now than in the snapshot. Then the snapshot
 * is overwritten with the files just linted (the others are kept). A file the snapshot has not seen
 * yet (the first edit in a paper) has no "before": only the errors on the lines this edit wrote are
 * reported — the lines Claude Code's `structuredPatch` says the edit added, every line of a Write, and
 * with no patch the place of each `new_string` that stands once in the file (see `writtenLines`).
 * `_build/` is gitignored and allowed by the layout.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────────
 * - A file written by a shell command (`sed -i`, a script, `mv`): no Edit or Write, no hook. The
 *   guarantee stays `paperlint lint` in CI.
 * - The body files of a paper whose build record is stale: `_build/sources.json` hashes every file TeX
 *   read, so the first edit to any of them makes the record stale, and from then until the next
 *   `paperlint build` the paper is `paper.tex` alone — to the hook exactly as to `paperlint lint`. A
 *   paper never built has no body files at all.
 * - An error an edit introduced in a file it did not write, other than `paper.tex`.
 *
 * ── NEVER IN THE WAY ─────────────────────────────────────────────────────────────
 * Whatever goes wrong — a payload that is not JSON, a config that does not read, ESLint throwing —
 * the hook writes ONE line to stderr, `paperlint: the lint-edited hook did not run: <why>`, and exits
 * 0 with no block. The edit has happened either way; a broken lint must not read as a broken edit.
 *
 * ── THE CHEAP FIRST STEP ─────────────────────────────────────────────────────────
 * An edit outside every paper never reaches this module: the bin asks `fileHookGate`
 * (`src/domain/paper-folder.ts`) first, and exits before the CLI loads.
 */
import { join, relative, sep } from "node:path";
import { unique } from "remeda";
import { z } from "zod";
import { callerPath } from "./caller-path.ts";
import { paperFolderOf, writtenPath } from "./domain/paper-folder.ts";
import { SOURCES_DIR } from "./domain/sources-record.ts";
import { fieldOf } from "./domain/record.ts";
import { messageOf } from "./domain/text.ts";
import type { Files } from "./ports/files.ts";

/** The snapshot, relative to the paper folder. */
export const SNAPSHOT_FILE = `${SOURCES_DIR}/edit-lint.json`;

/** The paper's main file, the one every paper-level rule reports on. */
const MAIN = "paper.tex";

/** One finding, as ESLint reports it: the fields this hook reads. */
export interface LintMessage {
  readonly ruleId: string | null;
  readonly severity: number;
  readonly message: string;
  readonly line: number;
  readonly column: number;
  readonly endLine?: number | undefined;
}

/** One file's findings, as ESLint reports them. */
export interface LintResult {
  readonly filePath: string;
  readonly messages: readonly LintMessage[];
}

/** `paperlint lint`'s engine, set up for one paper. */
export interface PaperLinter {
  /** Whether paperlint lints `file` — ESLint's answer on the config `paperlint lint` builds. */
  isLinted(file: string): Promise<boolean>;
  lint(files: readonly string[]): Promise<readonly LintResult[]>;
  /** The findings as `paperlint lint` prints them. */
  format(results: readonly LintResult[]): Promise<string>;
}

export interface LintEditedDeps {
  readonly files: Files;
  /** The engine for the paper in `paperDir`; it throws when the paper's config does not read. */
  readonly linter: (paperDir: string) => Promise<PaperLinter>;
}

/** What Claude Code reads from a PostToolUse hook's stdout: the reason goes next to the tool result. */
export interface BlockOutput {
  readonly decision: "block";
  readonly reason: string;
}

/** The line after the findings: what happened to the edit, and what the findings are. */
const KEPT =
  "paperlint lint-edited: the edit was kept; the errors above are the ones it introduced.";

/** One error as the snapshot holds it: no line number, the text of its line instead. */
const Entry = z.object({
  rule: z.string().nullable(),
  message: z.string(),
  text: z.string(),
});
type Entry = Readonly<z.infer<typeof Entry>>;

/** The snapshot: each file linted, relative to the paper, with its errors. */
const Snapshot = z.object({ files: z.record(z.string(), z.array(Entry)) });
interface Snapshot {
  readonly files: Readonly<Record<string, readonly Entry[]>>;
}

/** A line range, both ends included. */
interface Lines {
  readonly from: number;
  readonly to: number;
}

const textOf = (files: Files, file: string): string | null => {
  const bytes = files.readBytes(callerPath(file));
  return bytes === null ? null : new TextDecoder().decode(bytes);
};

/** The snapshot on disk; an empty one when there is none, or it does not parse. */
function readSnapshot(files: Files, path: string): Snapshot {
  const text = textOf(files, path);
  const parsed = Snapshot.safeParse(
    ((): unknown => {
      try {
        const value: unknown = JSON.parse(text ?? "null");
        return value;
      } catch {
        return null;
      }
    })(),
  );
  return parsed.success ? parsed.data : { files: {} };
}

/** 1-based line of offset `at` in `text`. */
const lineAt = (text: string, at: number): number =>
  text.slice(0, at).split("\n").length;

/** Every place `piece` stands in `text`, as lines. */
const placesOf = (text: string, piece: string): readonly Lines[] => {
  if (piece === "") return [];
  const from = (start: number): readonly number[] => {
    const at = text.indexOf(piece, start);
    return at === -1 ? [] : [at, ...from(at + piece.length)];
  };
  const extra = piece.split("\n").length - 1;
  return from(0).map((at) => {
    const first = lineAt(text, at);
    return { from: first, to: first + extra };
  });
};

/**
 * What Claude Code 2.1.319 puts in an Edit's `tool_response` (measured, replace_all included): the
 * hunks of the edit as `structuredPatch`, each with `newStart` (the 1-based line in the file AFTER the
 * edit where the hunk begins, context included) and `lines`, every one prefixed by a space (context),
 * `-` (removed) or `+` (added). Only these two fields are read.
 */
const Patch = z.array(
  z.object({ newStart: z.number().int(), lines: z.array(z.string()) }),
);

/** The lines a hunk added, in the file after the edit, as one-line ranges. */
interface Hunk {
  readonly newStart: number;
  readonly lines: readonly string[];
}
const addedBy = (hunk: Hunk): readonly Lines[] =>
  hunk.lines.reduce<{ at: number; added: readonly Lines[] }>(
    (acc, l) =>
      l.startsWith("-")
        ? acc
        : {
            at: acc.at + 1,
            added: l.startsWith("+")
              ? [...acc.added, { from: acc.at, to: acc.at }]
              : acc.added,
          },
    { at: hunk.newStart, added: [] },
  ).added;

/**
 * The lines of `text` (the edited file now) that the payload's tool wrote.
 *
 * Write: every line. Edit, and MultiEdit if a build still sends one: the hunks of
 * `tool_response.structuredPatch` give the added lines exactly, however short or common the new text.
 * A `tool_response` without a well-formed `structuredPatch` falls back to searching the file for each
 * `new_string`, and there a piece is placed only when it stands ONCE: a short `new_string` (`&`, a
 * command, a common word) that stands on several lines does not say which one the edit wrote, and
 * reporting all of them would blame the edit for errors it never touched. An unplaceable piece
 * writes no line: a missed report on a first edit costs less than a false one, and the snapshot is
 * written either way, so the next edit is judged exactly.
 */
function writtenLines(payload: unknown, text: string): readonly Lines[] {
  const tool = fieldOf(payload, "tool_name");
  const input = fieldOf(payload, "tool_input");
  if (tool === "Write") return [{ from: 1, to: Number.POSITIVE_INFINITY }];
  const patch = Patch.safeParse(
    fieldOf(fieldOf(payload, "tool_response"), "structuredPatch"),
  );
  if (patch.success) return patch.data.flatMap(addedBy);
  const edits = tool === "MultiEdit" ? fieldOf(input, "edits") : [input];
  const pieces = (Array.isArray(edits) ? edits : [])
    .map((e: unknown) => fieldOf(e, "new_string"))
    .filter((s): s is string => typeof s === "string");
  return pieces.flatMap((p) => {
    const places = placesOf(text, p);
    return places.length === 1 ? places : [];
  });
}

/** Does finding `m` stand on any of `lines`? */
const touches = (m: LintMessage, lines: readonly Lines[]): boolean =>
  lines.some((l) => m.line <= l.to && (m.endLine ?? m.line) >= l.from);

/** One file's errors, each with its snapshot entry. */
interface FileErrors {
  readonly file: string;
  readonly rel: string;
  readonly errors: readonly {
    readonly message: LintMessage;
    readonly entry: Entry;
  }[];
}

function errorsOf(r: LintResult, dir: string, files: Files): FileErrors {
  const lines = (textOf(files, r.filePath) ?? "").split("\n");
  return {
    file: r.filePath,
    rel: relative(dir, r.filePath).split(sep).join("/"),
    errors: r.messages
      .filter((m) => m.severity === 2)
      .map((message) => ({
        message,
        entry: {
          rule: message.ruleId,
          message: message.message,
          text: (lines[message.line - 1] ?? "").trim(),
        },
      })),
  };
}

const keyOf = (e: Entry): string => JSON.stringify([e.rule, e.message, e.text]);

/** The errors of `now` whose key occurs more often than in `before`: the later occurrences. */
function newAgainst(
  now: FileErrors["errors"],
  before: readonly Entry[],
): readonly LintMessage[] {
  const counted = (key: string, es: readonly Entry[]): number =>
    es.filter((e) => keyOf(e) === key).length;
  return now
    .filter(
      (e, i) =>
        counted(
          keyOf(e.entry),
          now.slice(0, i).map((x) => x.entry),
        ) >= counted(keyOf(e.entry), before),
    )
    .map((e) => e.message);
}

/** The errors in `now` this edit introduced, per file: against the snapshot, or the lines it wrote. */
function introducedBy(
  now: readonly FileErrors[],
  before: Snapshot,
  edited: { readonly file: string; readonly lines: readonly Lines[] },
): readonly LintResult[] {
  return now
    .map((f) => {
      const seen = before.files[f.rel];
      return {
        filePath: f.file,
        messages:
          seen === undefined
            ? f.errors
                .map((e) => e.message)
                .filter(
                  (m) => f.file === edited.file && touches(m, edited.lines),
                )
            : newAgainst(f.errors, seen),
      };
    })
    .filter((r) => r.messages.length > 0);
}

/** The snapshot after this run: the files just linted replaced, the others kept. */
const nextSnapshot = (
  before: Snapshot,
  now: readonly FileErrors[],
): Snapshot => ({
  files: {
    ...before.files,
    ...Object.fromEntries(
      now.map((f) => [f.rel, f.errors.map((e) => e.entry)]),
    ),
  },
});

/** The hook: the payload of an Edit or a Write in, Claude Code's block out, or null to say nothing. */
export async function lintEdited(
  payload: unknown,
  deps: LintEditedDeps,
): Promise<BlockOutput | null> {
  const file = writtenPath(payload);
  const dir = file === null ? null : paperFolderOf(file, deps.files);
  if (file === null || dir === null) return null;
  const linter = await deps.linter(dir);
  if (!(await linter.isLinted(file))) return null;
  const main = join(dir, MAIN);
  const has = deps.files.isFile(callerPath(main));
  const results = await linter.lint(unique([file, ...(has ? [main] : [])]));
  const snapshot = callerPath(join(dir, SNAPSHOT_FILE));
  const before = readSnapshot(deps.files, snapshot);
  const now = results.map((r) => errorsOf(r, dir, deps.files));
  const lines = writtenLines(payload, textOf(deps.files, file) ?? "");
  const shown = introducedBy(now, before, { file, lines });
  const next = JSON.stringify(nextSnapshot(before, now), null, 1);
  deps.files.writeAtomic(snapshot, new TextEncoder().encode(`${next}\n`));
  if (shown.length === 0) return null;
  const report = (await linter.format(shown)).trim();
  return { decision: "block", reason: `${report}\n${KEPT}` };
}

/**
 * `paperlint hook lint-edited`: stdin in, a block on `out` — or, whatever throws, one line on `err`.
 * Always 0: PostToolUse runs after the edit, and a broken lint must not read as a broken edit.
 */
export async function lintEditedHook(
  stdin: () => string,
  deps: LintEditedDeps,
  io: {
    readonly out: (text: string) => void;
    readonly err: (line: string) => void;
  },
): Promise<number> {
  try {
    const payload: unknown = JSON.parse(stdin());
    const said = await lintEdited(payload, deps);
    if (said !== null) io.out(`${JSON.stringify(said)}\n`);
  } catch (e) {
    const [why = ""] = messageOf(e).split("\n");
    io.err(`paperlint: the lint-edited hook did not run: ${why}`);
  }
  return 0;
}
