#!/usr/bin/env node
/**
 * labels.mjs — the checks of the label-agent-runs skill. Node's standard library only.
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
 * EXIT CODES: 0 valid / reported · 1 a finding · 2 usage.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

class Refusal extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const refuse = (code, message) => {
  throw new Refusal(code, message);
};
const say = (line) => process.stdout.write(`${line}\n`);

const HEADER = ["agent", "model", "cell", "label"];
const keyOf = (r) => `${r.agent}\t${r.model}\t${r.cell}`;
const show = (r) => `${r.agent} ${r.model} ${r.cell}`;

/** Rows of a label file, or the problems that stop it being one. */
function readLabels(file) {
  const lines = readFileSync(file, "utf8").split("\n");
  const [head, ...body] = lines;
  const rows = body
    .map((line, i) => ({ line, n: i + 2 }))
    .filter(({ line }) => line.trim() !== "")
    .map(({ line, n }) => {
      const [agent, model, cell, label, ...extra] = line.split("\t");
      return {
        agent,
        model,
        cell,
        label,
        n,
        ok: label !== undefined && extra.length === 0,
      };
    });
  const problems = [
    ...(head.replace(/\r$/, "") === HEADER.join("\t")
      ? []
      : [`${file}:1: the header must be "${HEADER.join("\\t")}"`]),
    ...rows
      .filter((r) => !r.ok)
      .map((r) => `${file}:${r.n}: not four tab-separated fields`),
  ];
  return { rows: rows.filter((r) => r.ok), problems };
}

const git = (cwd, ...args) =>
  spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
const repoPath = (abs) => {
  const top = git(dirname(abs), "rev-parse", "--show-toplevel");
  return top.status === 0
    ? {
        top: top.stdout.trim(),
        rel: relative(top.stdout.trim(), abs).split(sep).join("/"),
      }
    : null;
};
/** Unix time of the commit that first added `abs`, or null when it was never committed. */
const firstCommit = (abs) => {
  const at = repoPath(abs);
  const log = at
    ? git(at.top, "log", "--diff-filter=A", "--format=%ct", "--", at.rel)
    : null;
  const times = log
    ? log.stdout.trim().split("\n").filter(Boolean).map(Number)
    : [];
  return times.length ? Math.min(...times) : null;
};

function codebookProblems(file, labelsFile) {
  const abs = resolve(file);
  const at = repoPath(abs);
  const head = at ? git(at.top, "show", `HEAD:${at.rel}`) : null;
  const text = readFileSync(abs, "utf8");
  const book = JSON.parse(text);
  const labels = Array.isArray(book.labels) ? book.labels : [];
  const filled = (v) => typeof v === "string" && v.trim() !== "";
  const bookAt = firstCommit(abs);
  const labelsAt = firstCommit(resolve(labelsFile));
  return {
    known: new Set(labels.map((l) => l.id)),
    problems: [
      ...(head && head.status === 0
        ? head.stdout === text
          ? []
          : [
              `${file} differs from its committed version: the codebook is fixed before labelling`,
            ]
        : [
            `${file} is not committed: commit the codebook before the first label`,
          ]),
      ...(labels.length ? [] : [`${file} defines no labels`]),
      ...labels
        .filter(
          (l) =>
            !(filled(l.id) && filled(l.definition) && filled(l.borderline)),
        )
        .map(
          (l) =>
            `${file}: label "${l.id}" needs an id, a definition and a borderline example`,
        ),
      ...(bookAt !== null && labelsAt !== null && bookAt > labelsAt
        ? [
            `${file} was committed after ${labelsFile}: the codebook comes first`,
          ]
        : []),
    ],
  };
}

function ledgerCells(file) {
  const byId = new Map();
  readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .forEach((l) => {
      const r = JSON.parse(l);
      byId.set(r.attempt, { ...byId.get(r.attempt), ...r });
    });
  return [...byId.values()]
    .filter((r) => r.status === "complete")
    .map((r) => ({
      agent: r.agent,
      model: r.model,
      cell: `${r.unit}/${r.arm}/${r.seed}`,
    }));
}

/** Cells whose label changed since `rev` and are not explained in a dated, quoted note. */
function relabelProblems(labelsFile, rev, notesFile, rows) {
  const at = repoPath(resolve(labelsFile));
  const then = at ? git(at.top, "show", `${rev}:${at.rel}`) : null;
  if (!then || then.status !== 0)
    return [
      `${labelsFile} does not exist at ${rev}: name the revision the analysis read`,
    ];
  const before = new Map(
    then.stdout
      .split("\n")
      .slice(1)
      .filter((l) => l.trim())
      .map((l) => l.split("\t"))
      .map(([agent, model, cell, label]) => [
        keyOf({ agent, model, cell }),
        label,
      ]),
  );
  const changed = rows.filter(
    (r) => before.has(keyOf(r)) && before.get(keyOf(r)) !== r.label,
  );
  // A dated section: from a "## YYYY-MM-DD" heading to the next "## ".
  const sections = readFileSync(notesFile, "utf8")
    .split(/^(?=## )/m)
    .filter((s) => /^## \d{4}-\d{2}-\d{2}\b/.test(s));
  return changed
    .filter(
      (r) => !sections.some((s) => s.includes(r.cell) && /^> \S/m.test(s)),
    )
    .map(
      (r) =>
        `${show(r)}: relabelled ${before.get(keyOf(r))} → ${r.label} after the analysis, with no dated note quoting the run`,
    );
}

function validate(file, opts) {
  const { rows, problems } = readLabels(file);
  const book = codebookProblems(opts.codebook, file);
  const seen = new Map();
  rows.forEach((r) => seen.set(keyOf(r), [...(seen.get(keyOf(r)) ?? []), r.n]));
  const runs = opts.ledger ? ledgerCells(opts.ledger) : null;
  const ran = new Set((runs ?? []).map(keyOf));
  const labelled = new Set(rows.map(keyOf));
  const all = [
    ...problems,
    ...book.problems,
    ...rows
      .filter((r) => !book.known.has(r.label))
      .map((r) => `${file}:${r.n}: "${r.label}" is not a codebook label`),
    ...[...seen]
      .filter(([, ns]) => ns.length > 1)
      .map(
        ([k, ns]) =>
          `${file}: ${k.split("\t").join(" ")} is labelled ${ns.length} times (lines ${ns.join(", ")})`,
      ),
    ...(runs
      ? [
          ...rows
            .filter((r) => !ran.has(keyOf(r)))
            .map(
              (r) =>
                `${file}:${r.n}: ${show(r)} has no completed run in the ledger`,
            ),
          ...runs
            .filter((r) => !labelled.has(keyOf(r)))
            .map((r) => `${show(r)}: a completed run with no label`),
        ]
      : []),
    ...(opts["analysed-at"]
      ? relabelProblems(file, opts["analysed-at"], opts.notes, rows)
      : []),
  ];
  if (all.length) refuse(1, all.join("\n"));
  say(`${file}: ${rows.length} labels, valid`);
}

// ── agreement ───────────────────────────────────────────────────────────────────────────────
const Z = 1.959963984540054;
/** 95% Wilson score interval for k successes in n. */
const wilson = (k, n) => {
  const p = k / n;
  const denom = 1 + (Z * Z) / n;
  const centre = (p + (Z * Z) / (2 * n)) / denom;
  const half =
    (Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n))) / denom;
  return [centre - half, centre + half];
};

/** Cohen's kappa over paired labels; null when chance agreement is 1 (one label only). */
function cohenKappa(pairs) {
  const n = pairs.length;
  const po = pairs.filter(([a, b]) => a === b).length / n;
  const labels = [...new Set(pairs.flat())];
  const share = (i, l) => pairs.filter((p) => p[i] === l).length / n;
  const pe = labels.reduce((s, l) => s + share(0, l) * share(1, l), 0);
  return pe === 1 ? null : (po - pe) / (1 - pe);
}

function agree(fileA, fileB) {
  const [a, b] = [fileA, fileB].map(readLabels);
  const bad = [...a.problems, ...b.problems];
  if (bad.length) refuse(1, bad.join("\n"));
  const inB = new Map(b.rows.map((r) => [keyOf(r), r]));
  const inA = new Set(a.rows.map(keyOf));
  const unmatched = [
    ...a.rows
      .filter((r) => !inB.has(keyOf(r)))
      .map((r) => `${show(r)}: only in ${fileA}`),
    ...b.rows
      .filter((r) => !inA.has(keyOf(r)))
      .map((r) => `${show(r)}: only in ${fileB}`),
  ];
  if (unmatched.length)
    refuse(
      1,
      `the two files label different cells — rate the same runs:\n${unmatched.join("\n")}`,
    );
  if (a.rows.length === 0) refuse(1, "no labels to compare");
  const pairs = a.rows.map((r) => [r.label, inB.get(keyOf(r)).label]);
  const k = pairs.filter(([x, y]) => x === y).length;
  const [lo, hi] = wilson(k, pairs.length);
  const kappa = cohenKappa(pairs);
  const f = (x) => x.toFixed(3);
  say(
    [
      `n ${pairs.length}`,
      `agreement ${k}/${pairs.length} = ${f(k / pairs.length)} (95% Wilson ${f(lo)}–${f(hi)})`,
      `cohen kappa ${kappa === null ? "undefined (one label only)" : f(kappa)}`,
      ...a.rows
        .filter((r) => r.label !== inB.get(keyOf(r)).label)
        .map(
          (r) => `disagree ${show(r)}: ${r.label} | ${inB.get(keyOf(r)).label}`,
        ),
    ].join("\n"),
  );
}

// ── command line ────────────────────────────────────────────────────────────────────────────
const USAGE =
  "usage: labels.mjs validate <labels.tsv> --codebook <f> [--ledger <f>] [--analysed-at <rev> --notes <f>] | agree <a.tsv> <b.tsv>";

try {
  const { values, positionals } = (() => {
    try {
      return parseArgs({
        options: {
          codebook: { type: "string" },
          ledger: { type: "string" },
          "analysed-at": { type: "string" },
          notes: { type: "string" },
        },
        allowPositionals: true,
      });
    } catch (e) {
      return refuse(2, `${e.message}\n${USAGE}`);
    }
  })();
  const [cmd, ...paths] = positionals;
  if (
    cmd === "validate" &&
    paths.length === 1 &&
    values.codebook &&
    (!values["analysed-at"] || values.notes)
  )
    validate(paths[0], values);
  else if (cmd === "agree" && paths.length === 2) agree(paths[0], paths[1]);
  else refuse(2, USAGE);
} catch (e) {
  process.stderr.write(`labels: ${e.message}\n`);
  process.exitCode = e instanceof Refusal ? e.code : 1;
}
