#!/usr/bin/env node
/**
 * labels — the checks of the label-agent-runs skill.
 *
 *   validate <labels.tsv> --codebook <codebook.json> [--ledger <attempts.jsonl>]
 *            [--analysed-at <git rev> --notes <notes.md>]
 *       The label file is well formed, uses only codebook labels, names each cell once, and —
 *       with a ledger — covers exactly the completed runs. The codebook is committed, unchanged,
 *       and was committed no later than the label file. With --analysed-at: every cell whose
 *       label differs from that revision is explained in a dated section of the notes, with a
 *       verbatim quote.
 *   agree <a.tsv> <b.tsv>
 *       Agreement between two label files over the same cells: n, percent agreement with a 95%
 *       Wilson interval, Cohen's kappa, and every disagreement. Use it for the automatic pre-sort
 *       against the hand labels, and for one rater against another.
 *
 * A label file is TSV with exactly this header: agent, model, cell, label. `cell` is
 * `<unit>/<arm>/<seed>`, the cell of the run-agent-grid ledger.
 *
 * TypeScript, compiled beside itself to `labels.js` by `npm run build`: a consumer runs the skill
 * from `node_modules`, where Node does not strip types. The skill names the `.js`.
 *
 * EXIT CODES: 0 valid / reported · 1 a finding · 2 usage.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { COMMANDS } from "./labels-commands.ts";

class Refusal extends Error {
  readonly exitCode: number;
  constructor(exitCode: number, message: string) {
    super(message);
    this.exitCode = exitCode;
  }
}
const refuse = (exitCode: number, message: string): never => {
  throw new Refusal(exitCode, message);
};
const say = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
const prop = (e: unknown, key: string): unknown => Reflect.get(Object(e), key);

const HEADER = ["agent", "model", "cell", "label"];
interface Row {
  readonly agent: string;
  readonly model: string;
  readonly cell: string;
  readonly label: string;
  readonly n: number;
}
type CellId = Pick<Row, "agent" | "model" | "cell">;
const keyOf = (r: CellId): string => `${r.agent}\t${r.model}\t${r.cell}`;
const show = (r: CellId): string => `${r.agent} ${r.model} ${r.cell}`;

interface Line {
  readonly fields: readonly string[];
  readonly n: number;
}

/** A line with exactly four fields as a row; anything else is not one. */
const asRow = ({ fields, n }: Line): Row[] => {
  const [agent, model, cell, label] = fields;
  return fields.length === 4
    ? [
        {
          agent: String(agent),
          model: String(model),
          cell: String(cell),
          label: String(label),
          n,
        },
      ]
    : [];
};

/** Rows of a label file, and the problems that stop a line being one. */
function readLabels(file: string): { rows: Row[]; problems: string[] } {
  const [first, ...body] = readFileSync(file, "utf8").split("\n");
  const lines: Line[] = body
    .map((line, i) => ({ line, fields: line.split("\t"), n: i + 2 }))
    .filter(({ line }) => line.trim() !== "");
  const headerOk = String(first).replace(/\r$/, "") === HEADER.join("\t");
  return {
    rows: lines.flatMap(asRow),
    problems: [
      ...(headerOk
        ? []
        : [`${file}:1: the header must be "${HEADER.join("\\t")}"`]),
      ...lines
        .filter(({ fields }) => fields.length !== 4)
        .map(({ n }) => `${file}:${String(n)}: not four tab-separated fields`),
    ],
  };
}

const git = (cwd: string, ...args: string[]) =>
  spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
/** Where `abs` sits in its git repository, or null outside one. */
const repoPath = (abs: string): { top: string; rel: string } | null => {
  const top = git(dirname(abs), "rev-parse", "--show-toplevel");
  return top.status === 0
    ? {
        top: top.stdout.trim(),
        rel: relative(top.stdout.trim(), abs).split(sep).join("/"),
      }
    : null;
};
/** Unix times of the commits that touched `abs` — only the ones that ADDED it, with `added`. */
const commitTimes = (abs: string, added: boolean): number[] => {
  const at = repoPath(abs);
  const filter = added ? ["--diff-filter=A"] : [];
  return at
    ? git(at.top, "log", ...filter, "--format=%ct", "--", at.rel)
        .stdout.trim()
        .split("\n")
        .filter(Boolean)
        .map(Number)
    : [];
};

const Codebook = z.looseObject({
  labels: z
    .array(
      z.looseObject({
        id: z.unknown().optional(),
        definition: z.unknown().optional(),
        borderline: z.unknown().optional(),
      }),
    )
    .default([]),
});
const filled = (v: unknown): boolean =>
  typeof v === "string" && v.trim() !== "";

/** Is the committed copy of `abs` the one on disk? A message when it is not. */
function committedProblem(file: string, abs: string, text: string): string[] {
  const at = repoPath(abs);
  const head = at ? git(at.top, "show", `HEAD:${at.rel}`) : null;
  if (!head || head.status !== 0)
    return [
      `${file} is not committed: commit the codebook before the first label`,
    ];
  return head.stdout === text
    ? []
    : [
        `${file} differs from its committed version: the codebook is fixed before labelling`,
      ];
}

type CodebookLabel = z.infer<typeof Codebook>["labels"][number];

/** Labels that lack an id, a definition or a borderline example. */
const incomplete = (file: string, labels: readonly CodebookLabel[]): string[] =>
  labels
    .filter(
      (l) => !(filled(l.id) && filled(l.definition) && filled(l.borderline)),
    )
    .map(
      (l) =>
        `${file}: label "${String(l.id)}" needs an id, a definition and a borderline example`,
    );

function codebookProblems(
  file: string,
  labelsFile: string,
): { known: Set<unknown>; problems: string[] } {
  const abs = resolve(file);
  const text = readFileSync(abs, "utf8");
  const { labels } = Codebook.parse(JSON.parse(text));
  // EVERY commit of the codebook, not only the one that added it: an edit after labelling began
  // changes what the labels already given mean.
  const bookLast = Math.max(-Infinity, ...commitTimes(abs, false));
  const labelsFirst = Math.min(
    Infinity,
    ...commitTimes(resolve(labelsFile), true),
  );
  const late = bookLast > labelsFirst;
  return {
    known: new Set(labels.map((l) => l.id)),
    problems: [
      ...committedProblem(file, abs, text),
      ...(labels.length ? [] : [`${file} defines no labels`]),
      ...incomplete(file, labels),
      ...(late
        ? [
            `${file} was committed after ${labelsFile} was first committed: the codebook is fixed before labelling; a changed codebook needs a new label file`,
          ]
        : []),
    ],
  };
}

const Attempt = z.looseObject({
  attempt: z.string(),
  agent: z.string().optional(),
  model: z.string().optional(),
  unit: z.string().optional(),
  arm: z.string().optional(),
  seed: z.union([z.string(), z.number()]).optional(),
  status: z.string().optional(),
});
type Attempt = z.infer<typeof Attempt>;

/** The cells of the completed attempts in a run-agent-grid ledger. */
function ledgerCells(file: string): CellId[] {
  const byId = new Map<string, Attempt>();
  readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => Attempt.parse(JSON.parse(l)))
    .forEach((r) => {
      byId.set(r.attempt, { ...byId.get(r.attempt), ...r });
    });
  return [...byId.values()]
    .filter((r) => r.status === "complete")
    .map((r) => ({
      agent: String(r.agent),
      model: String(r.model),
      cell: `${String(r.unit)}/${String(r.arm)}/${String(r.seed)}`,
    }));
}

/** The labels a revision of the label file held, by cell; null when it did not exist there. */
function labelsAt(labelsFile: string, rev: string): Map<string, string> | null {
  const at = repoPath(resolve(labelsFile));
  const then = at ? git(at.top, "show", `${rev}:${at.rel}`) : null;
  if (!then || then.status !== 0) return null;
  return new Map(
    then.stdout
      .split("\n")
      .slice(1)
      .filter((l) => l.trim())
      .map((l) => l.split("\t"))
      .map(([agent, model, cell, label]) => [
        keyOf({
          agent: String(agent),
          model: String(model),
          cell: String(cell),
        }),
        String(label),
      ]),
  );
}

/** The sections of the notes under a "## YYYY-MM-DD" heading, each up to the next "## ". */
const datedSections = (notesFile: string): string[] =>
  readFileSync(notesFile, "utf8")
    .split(/^(?=## )/m)
    .filter((s) => /^## \d{4}-\d{2}-\d{2}\b/.test(s));

/** A cell key back as the three fields `show` prints. */
const fromKey = (key: string): CellId => {
  const [agent, model, cell] = key.split("\t");
  return { agent: String(agent), model: String(model), cell: String(cell) };
};

const WHY = " with no dated note quoting the run";

/** Rows whose label is new or different since the analysis, and not explained. */
const touchedSince = (
  rows: readonly Row[],
  before: ReadonlyMap<string, string>,
  noted: (cell: string) => boolean,
): string[] =>
  rows
    .filter((r) => before.get(keyOf(r)) !== r.label && !noted(r.cell))
    .map((r) => {
      const was = before.get(keyOf(r));
      return was === undefined
        ? `${show(r)}: added after the analysis (${r.label}),${WHY}`
        : `${show(r)}: relabelled ${was} → ${r.label} after the analysis,${WHY}`;
    });

/** Cells the analysis read that are gone now, and not explained. */
const removedSince = (
  rows: readonly Row[],
  before: ReadonlyMap<string, string>,
  noted: (cell: string) => boolean,
): string[] => {
  const now = new Set(rows.map(keyOf));
  return [...before]
    .filter(([key]) => !now.has(key) && !noted(fromKey(key).cell))
    .map(
      ([key, was]) =>
        `${show(fromKey(key))}: removed after the analysis (was ${was}),${WHY}`,
    );
};

/**
 * Every cell whose label differs from what the analysis read at `rev` — changed, ADDED after it,
 * or REMOVED since — and is not explained in a dated, quoted note naming the cell.
 */
function relabelProblems(
  labelsFile: string,
  rev: string,
  notesFile: string,
  rows: readonly Row[],
): string[] {
  const before = labelsAt(labelsFile, rev);
  if (!before)
    return [
      `${labelsFile} does not exist at ${rev}: name the revision the analysis read`,
    ];
  const sections = datedSections(notesFile);
  const noted = (cell: string): boolean =>
    sections.some((s) => s.includes(cell) && /^> \S/m.test(s));
  return [
    ...touchedSince(rows, before, noted),
    ...removedSince(rows, before, noted),
  ];
}

/** Cells a file labels more than once, with the lines. */
function duplicates(file: string, rows: readonly Row[]): string[] {
  const seen = new Map<string, number[]>();
  rows.forEach((r) => seen.set(keyOf(r), [...(seen.get(keyOf(r)) ?? []), r.n]));
  return [...seen]
    .filter(([, ns]) => ns.length > 1)
    .map(
      ([k, ns]) =>
        `${file}: ${show(fromKey(k))} is labelled ${String(ns.length)} times (lines ${ns.join(", ")})`,
    );
}

/** Rows naming a cell twice, and coverage against the ledger. */
function rowProblems(file: string, rows: readonly Row[], ledger?: string) {
  const runs = ledger === undefined ? null : ledgerCells(ledger);
  const ran = new Set((runs ?? []).map(keyOf));
  const labelled = new Set(rows.map(keyOf));
  return [
    ...duplicates(file, rows),
    ...(runs
      ? [
          ...rows
            .filter((r) => !ran.has(keyOf(r)))
            .map(
              (r) =>
                `${file}:${String(r.n)}: ${show(r)} has no completed run in the ledger`,
            ),
          ...runs
            .filter((r) => !labelled.has(keyOf(r)))
            .map((r) => `${show(r)}: a completed run with no label`),
        ]
      : []),
  ];
}

function validate(file: string, o: Values): void {
  const { rows, problems } = readLabels(file);
  const book = codebookProblems(String(o.codebook), file);
  const all = [
    ...problems,
    ...book.problems,
    ...rows
      .filter((r) => !book.known.has(r.label))
      .map(
        (r) => `${file}:${String(r.n)}: "${r.label}" is not a codebook label`,
      ),
    ...rowProblems(file, rows, o.ledger),
    ...(o["analysed-at"] === undefined
      ? []
      : relabelProblems(file, o["analysed-at"], String(o.notes), rows)),
  ];
  if (all.length) refuse(1, all.join("\n"));
  say(`${file}: ${String(rows.length)} labels, valid`);
}

// ── agreement ───────────────────────────────────────────────────────────────────────────────
const Z = 1.959963984540054;
/** 95% Wilson score interval for k successes in n. */
const wilson = (k: number, n: number): readonly [number, number] => {
  const p = k / n;
  const denom = 1 + (Z * Z) / n;
  const centre = (p + (Z * Z) / (2 * n)) / denom;
  const half =
    (Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n))) / denom;
  return [centre - half, centre + half];
};

/** Cohen's kappa over paired labels; null when chance agreement is 1 (one label only). */
function cohenKappa(
  pairs: readonly (readonly [string, string])[],
): number | null {
  const n = pairs.length;
  const po = pairs.filter(([a, b]) => a === b).length / n;
  const labels = [...new Set(pairs.flat())];
  const share = (i: 0 | 1, l: string): number =>
    pairs.filter((p) => p[i] === l).length / n;
  const pe = labels.reduce((s, l) => s + share(0, l) * share(1, l), 0);
  return pe === 1 ? null : (po - pe) / (1 - pe);
}

/** Cells of either file that the other does not label. */
const onlyIn = (
  fileA: string,
  a: readonly Row[],
  b: readonly Row[],
  fileB: string,
): string[] => {
  const inA = new Set(a.map(keyOf));
  const inB = new Set(b.map(keyOf));
  return [
    ...a
      .filter((r) => !inB.has(keyOf(r)))
      .map((r) => `${show(r)}: only in ${fileA}`),
    ...b
      .filter((r) => !inA.has(keyOf(r)))
      .map((r) => `${show(r)}: only in ${fileB}`),
  ];
};

/** The second file's label for each cell of the first; a refusal when the cells differ. */
function matched(
  fileA: string,
  fileB: string,
): readonly (readonly [Row, string])[] {
  const a = readLabels(fileA);
  const b = readLabels(fileB);
  // A cell labelled twice has no single label to compare: refused before any statistic.
  const bad = [
    ...a.problems,
    ...b.problems,
    ...duplicates(fileA, a.rows),
    ...duplicates(fileB, b.rows),
  ];
  if (bad.length) refuse(1, bad.join("\n"));
  const inB = new Map(b.rows.map((r) => [keyOf(r), r.label]));
  const unmatched = onlyIn(fileA, a.rows, b.rows, fileB);
  if (unmatched.length)
    refuse(
      1,
      `the two files label different cells — rate the same runs:\n${unmatched.join("\n")}`,
    );
  if (a.rows.length === 0) refuse(1, "no labels to compare");
  return a.rows.map((r) => [r, String(inB.get(keyOf(r)))] as const);
}

function agree(fileA: string, fileB: string): void {
  const rows = matched(fileA, fileB);
  const pairs = rows.map(([r, other]) => [r.label, other] as const);
  const n = pairs.length;
  const k = pairs.filter(([x, y]) => x === y).length;
  const [lo, hi] = wilson(k, n);
  const kappa = cohenKappa(pairs);
  const f = (x: number): string => x.toFixed(3);
  say(
    [
      `n ${String(n)}`,
      `agreement ${String(k)}/${String(n)} = ${f(k / n)} (95% Wilson ${f(lo)}–${f(hi)})`,
      `cohen kappa ${kappa === null ? "undefined (one label only)" : f(kappa)}`,
      ...rows
        .filter(([r, other]) => r.label !== other)
        .map(([r, other]) => `disagree ${show(r)}: ${r.label} | ${other}`),
    ].join("\n"),
  );
}

// ── command line ────────────────────────────────────────────────────────────────────────────
const OPTIONS = {
  codebook: { type: "string" },
  ledger: { type: "string" },
  "analysed-at": { type: "string" },
  notes: { type: "string" },
} as const;
type Values = ReturnType<
  typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>
>["values"];

const USAGE =
  "usage: labels.js validate <labels.tsv> --codebook <f> [--ledger <f>] [--analysed-at <rev> --notes <f>] | agree <a.tsv> <b.tsv>";

function main(): void {
  const { values, positionals } = (() => {
    try {
      return parseArgs({ options: OPTIONS, allowPositionals: true });
    } catch (e) {
      return refuse(2, `${String(prop(e, "message"))}\n${USAGE}`);
    }
  })();
  const [cmd, ...paths] = positionals;
  const validateOk =
    cmd === COMMANDS.validate &&
    paths.length === 1 &&
    values.codebook !== undefined &&
    (values["analysed-at"] === undefined || values.notes !== undefined);
  if (validateOk) validate(String(paths[0]), values);
  else if (cmd === COMMANDS.agree && paths.length === 2)
    agree(String(paths[0]), String(paths[1]));
  else refuse(2, USAGE);
}

try {
  main();
} catch (e) {
  process.stderr.write(`labels: ${String(prop(e, "message"))}\n`);
  process.exitCode = e instanceof Refusal ? e.exitCode : 1;
}
