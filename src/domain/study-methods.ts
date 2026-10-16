/**
 * THE METHODS TEXT OF A PAPER'S STUDIES — derived, never kept by hand: per study the paper reports
 * (`in_paper: "yes"`), its mode, the commit and date of its decision, the first commit of any output,
 * and the command that re-checks it. Two forms: a Markdown table for the artifact's README, and one
 * LaTeX sentence per study the author adapts for the Methods section. `paperlint studies methods`
 * prints them (src/study-methods.ts). Pure.
 */
import type { CommitAt } from "./decide-first.ts";
import type { GateCommit } from "./sealed-study.ts";

/** What the methods text says of one study. */
export type MethodsRow = { readonly id: string; readonly title: string } & (
  | {
      readonly kind: "decided";
      /** null: the history could not be read; else the decision's and the first output's commits. */
      readonly history: {
        readonly decision: CommitAt | null;
        readonly firstOutput: CommitAt | null;
      } | null;
    }
  | {
      readonly kind: "blind";
      /** The earliest `sealed_at`; null when nothing is sealed. */
      readonly sealedFrom: string | null;
      /** The unsealing's gate; null while sealed. */
      readonly gate: GateCommit | null;
    }
  | { readonly kind: "exploratory"; readonly reason: string }
  | { readonly kind: "none" }
);

/** A commit as the text names it: its first 12 hex digits. */
const short = (c: string): string => c.slice(0, 12);

/** A date as the text gives it: the day. */
const day = (iso: string): string => iso.slice(0, 10);

/** The command that re-checks a study, for a paper shown as `paper`; null when none does. */
export const checkCommand = (row: MethodsRow, paper: string): string | null => {
  switch (row.kind) {
    case "decided":
      return `npx paperlint lint ${paper}`;
    case "blind":
      return `npx paperlint studies verify ${paper} ${row.id}`;
    case "exploratory":
    case "none":
      return null;
  }
};

const MODE_NAME: Readonly<Record<MethodsRow["kind"], string>> = {
  decided: "decided before its run",
  blind: "blind (sealed)",
  exploratory: "exploratory",
  none: "no mode declared",
};

/** A Markdown cell: one line, `|` escaped. */
const cell = (s: string): string =>
  s.replace(/\r?\n/gu, " ").replace(/\|/gu, "\\|");

const at = (c: CommitAt): string => `\`${short(c.commit)}\` (${day(c.date)})`;

type Decided = Extract<MethodsRow, { readonly kind: "decided" }>;
type BlindRow = Extract<MethodsRow, { readonly kind: "blind" }>;

/** A decide-first study's decision and first-output cells. */
const decidedCells = (h: Decided["history"]): readonly [string, string] => {
  if (h === null) return ["history not read", "history not read"];
  return [
    h.decision === null ? "not committed" : at(h.decision),
    h.firstOutput === null ? "none committed" : at(h.firstOutput),
  ];
};

/** A blind study's gate and sealing cells. */
const blindCells = (r: BlindRow): readonly [string, string] => [
  r.gate === null ? "sealed, not unsealed" : at(r.gate),
  r.sealedFrom === null ? "nothing sealed" : `sealed from ${day(r.sealedFrom)}`,
];

/** The decision and the first-output cells of a row. */
const commitCells = (row: MethodsRow): readonly [string, string] => {
  switch (row.kind) {
    case "decided":
      return decidedCells(row.history);
    case "blind":
      return blindCells(row);
    case "exploratory":
    case "none":
      return ["—", "—"];
  }
};

/** The table for the artifact's README: one row per study. */
export const methodsTable = (
  rows: readonly MethodsRow[],
  paper: string,
): string =>
  [
    "| study | title | mode | decision | first output | check |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map((r) => {
      const [decision, first] = commitCells(r);
      const mode =
        r.kind === "exploratory"
          ? `exploratory: ${cell(r.reason)}`
          : MODE_NAME[r.kind];
      const check = checkCommand(r, paper);
      return `| ${r.id} | ${cell(r.title)} | ${mode} | ${decision} | ${first} | ${check === null ? "—" : `\`${check}\``} |`;
    }),
  ].join("\n");

/** `s` with TeX's special characters escaped. */
export const texEscape = (s: string): string =>
  s.replace(/[\\{}$&#%_~^]/gu, (c) =>
    c === "\\"
      ? "\\textbackslash{}"
      : c === "~"
        ? "\\textasciitilde{}"
        : c === "^"
          ? "\\textasciicircum{}"
          : `\\${c}`,
  );

const texAt = (c: CommitAt): string =>
  `\\texttt{${short(c.commit)}} on ${day(c.date)}`;

/** The sentence of a decide-first study. */
const decidedSentence = (
  head: string,
  history: Decided["history"],
  check: string,
): string => {
  if (history === null)
    return `${head} was decided before its run; its history could not be read here, and \\texttt{${check}} re-checks the order on a full clone.`;
  if (history.decision === null)
    return `${head} is declared decided before its run, but its decision is not committed yet.`;
  const output =
    history.firstOutput === null
      ? "no output is committed yet"
      : `its first output in ${texAt(history.firstOutput)}`;
  return `${head} was decided before its run: its decision was committed in ${texAt(history.decision)}, and ${output}; \\texttt{${check}} re-checks this order from the repository's history.`;
};

/** The sentence of a blind study. */
const blindSentence = (head: string, r: BlindRow, check: string): string => {
  const since = r.sealedFrom === null ? "" : ` from ${day(r.sealedFrom)}`;
  return r.gate === null
    ? `${head} is run blind: its outputs are sealed with age${since} and are not unsealed yet.`
    : `${head} was run blind: its outputs were sealed with age${since} and unsealed only after its decision was committed in ${texAt(r.gate)}; \\texttt{${check}} checks every file against the hashes recorded before unsealing.`;
};

/** One sentence per study, LaTeX-ready, for the author to adapt. */
export const methodsTex = (
  rows: readonly MethodsRow[],
  paper: string,
): string =>
  rows
    .map((r) => {
      const head = `Study ${r.id} (${texEscape(r.title)})`;
      const check = texEscape(checkCommand(r, paper) ?? "");
      switch (r.kind) {
        case "decided":
          return decidedSentence(head, r.history, check);
        case "blind":
          return blindSentence(head, r, check);
        case "exploratory":
          return `${head} is exploratory: ${texEscape(r.reason)}. Its results are reported as exploratory.`;
        case "none":
          return `${head} declares no mode.`;
      }
    })
    .join("\n\n");
