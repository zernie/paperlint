/**
 * THE MODE COLUMNS OF THE INDEX — three columns of `repro/README.md`'s study index beyond the row:
 * the study's mode, as its plan declares it, and for a study decided before its run the commit that
 * first recorded its decision and the commit that first recorded an output (docs/design/study-modes.md).
 *
 * The mode comes from the plan, which is in the tree, so `repro/study-registered` compares it. The
 * two commits come from git's history as `paperlint studies index` read it when it ran: a squash merge
 * or a rebase gives the same files new commits, and a shallow CI clone has none to read, so the lint
 * never compares those two columns. `repro/outputs-before-decision` judges the order itself. Pure.
 */
import {
  outputCommits,
  type CommitAt,
  type DecideFirstStudy,
} from "./decide-first.ts";
import type { StudyMode } from "./study-mode.ts";

/** What git's history says of a decide-first study's decision and outputs. */
export type IndexHistory =
  /** No order could be read: why, in a few words (`shallow clone`). */
  | { readonly kind: "unread"; readonly why: string }
  | {
      readonly kind: "read";
      /** The decision file's first commit; null: never committed. */
      readonly decision: CommitAt | null;
      /** The decision was committed, then deleted: it is not in HEAD. */
      readonly decisionDeleted: boolean;
      /** The first commit of the oldest output; null: no output was ever committed. */
      readonly firstOutput: CommitAt | null;
    };

/** What the index shows of a study beyond its row. */
export interface IndexFacts {
  /** The mode its plan declares; null when its plan declares none, or there is no plan to read. */
  readonly mode: StudyMode | null;
  /** For a decide-first study, its history; null when it was not asked (the lint does not ask). */
  readonly history: IndexHistory | null;
}

/** The cell of a column that does not apply to a study. */
export const NOT_APPLICABLE = "—";

/** A commit as a cell: its first twelve characters, and its date. */
const commitCell = (c: CommitAt): string =>
  `${c.commit.slice(0, 12)} ${c.date.slice(0, 10)}`;

/** The mode cell: `decide_before_run`, `exploratory: <reason>`, or `—`. */
export const modeCell = (f: IndexFacts): string => {
  if (f.mode === null) return NOT_APPLICABLE;
  return f.mode.kind === "exploratory"
    ? `exploratory: ${f.mode.reason}`
    : f.mode.kind;
};

/** A history cell of a decide-first study: the text `pick` makes of it, `absent` when it makes none. */
const historyCell =
  (
    pick: (h: IndexHistory & { readonly kind: "read" }) => string | null,
    absent: string,
  ) =>
  (f: IndexFacts): string => {
    if (f.mode?.kind !== "decide_before_run") return NOT_APPLICABLE;
    if (f.history === null) return "not read";
    if (f.history.kind === "unread") return `unknown (${f.history.why})`;
    return pick(f.history) ?? absent;
  };

/** The decision cell: its first commit and date (`, deleted since` when it is not in HEAD), or `not committed`. */
export const decisionCell = historyCell(
  (h) =>
    h.decision === null
      ? null
      : `${commitCell(h.decision)}${h.decisionDeleted ? ", deleted since" : ""}`,
  "not committed",
);

/** The first-output cell: the commit and date of the first output, or `none`. */
export const firstOutputCell = historyCell(
  (h) => (h.firstOutput === null ? null : commitCell(h.firstOutput)),
  "none",
);

/** The history the index shows of a decide-first study, from the facts git gave. */
export const indexHistory = (s: DecideFirstStudy): IndexHistory => {
  switch (s.facts.kind) {
    case "directory":
      return { kind: "unread", why: "the decision is a directory" };
    case "unknown":
      return { kind: "unread", why: "git could not answer" };
    case "shallow":
      return { kind: "unread", why: "shallow clone" };
    case "read": {
      const [first] = outputCommits(s, s.facts.files);
      return {
        kind: "read",
        decision: s.facts.decision,
        decisionDeleted: s.facts.decisionDeleted,
        firstOutput:
          first === undefined
            ? null
            : { commit: first.commit, date: first.date },
      };
    }
  }
};
