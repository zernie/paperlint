/**
 * DECIDE FIRST — the default mode of a measurement study (src/domain/study-mode.ts): the author's
 * decisions on the inputs are committed before any output exists, and git's history is the proof of
 * order. `repro/outputs-before-decision` judges it here, from facts git gave (src/adapters/git/):
 *
 *   - each output in the tree while the decision file was never committed;
 *   - each output whose FIRST commit is not a strict descendant of the decision file's FIRST commit —
 *     earlier, on a line of history the decision is not on, or in the very same commit (which says
 *     nothing about which came first);
 *   - a decision file the outputs match (it would be "produced" by the run it gates);
 *   - a history that cannot be read: no git, or a shallow clone, whose every file starts at the clone.
 *
 * Outputs that were committed and later deleted count: an output that existed before the decision is
 * evidence after it is gone. Pure.
 */
import { README } from "./repro-layout.ts";
import {
  decisionAsOutput,
  inStudy,
  isOutput,
  type DecideFirst,
} from "./study-mode.ts";

/** A commit, and its committer date (ISO 8601 with its offset). */
export interface CommitAt {
  readonly commit: string;
  readonly date: string;
}

/** Where a file's first commit stands against the decision's first commit. */
export type Order =
  /** A strict descendant: the file entered history after the decision. */
  | "after"
  /** The same commit: nothing in history says which came first. */
  | "same"
  /** Not a descendant: earlier, or on a line of history the decision is not on — or no decision. */
  | "not-after";

/** The first commit of a file under the study's folder, and its order against the decision. */
export interface FirstCommit extends CommitAt {
  /** Relative to the study's folder. */
  readonly path: string;
  readonly order: Order;
}

/**
 * What git's history says of a decide-first study: when its decision file entered history, and when
 * every file ever committed under the study's folder did.
 */
export type OrderFacts =
  | { readonly kind: "unknown"; readonly why: string }
  /** A shallow clone: every file's first commit is the clone's first, so no order can be read. */
  | { readonly kind: "shallow" }
  | {
      readonly kind: "read";
      /** null: the decision file was never committed. */
      readonly decision: CommitAt | null;
      readonly files: readonly FirstCommit[];
    };

/** What the judge reads of one decide-first study. */
export interface DecideFirstStudy {
  readonly id: string;
  readonly folder: string;
  /** The plan's path in the folder. */
  readonly plan: string;
  readonly mode: DecideFirst;
  /** Every file under the study's folder now, relative to it. */
  readonly tree: readonly string[];
  readonly facts: OrderFacts;
}

/** One defect `repro/outputs-before-decision` reports. */
export type OrderFinding =
  | {
      readonly problem: "decision-is-output";
      readonly id: string;
      readonly file: string;
      readonly glob: string;
    }
  | {
      readonly problem: "no-history";
      readonly id: string;
      readonly why: string;
    }
  | { readonly problem: "shallow"; readonly id: string }
  | {
      readonly problem: "undecided-output";
      readonly id: string;
      readonly folder: string;
      readonly path: string;
      readonly decision: string;
    }
  | {
      readonly problem: "output-before-decision";
      readonly id: string;
      readonly folder: string;
      readonly path: string;
      readonly output: CommitAt;
      readonly decision: CommitAt;
      readonly same: boolean;
    };

/** Whether `path` (relative to the study's folder) is an output and none of the study's own files. */
const outputOf =
  (s: DecideFirstStudy) =>
  (path: string): boolean =>
    ![README, s.plan, inStudy(s.folder, s.mode.decision.file)].includes(path) &&
    isOutput(s.mode.outputs, path);

/** The findings of a history that was read. */
const ordered = (
  s: DecideFirstStudy,
  decision: CommitAt | null,
  files: readonly FirstCommit[],
): readonly OrderFinding[] => {
  const isOut = outputOf(s);
  const at = { id: s.id, folder: s.folder };
  if (decision === null)
    return s.tree.filter(isOut).map((path) => ({
      problem: "undecided-output",
      ...at,
      path,
      decision: s.mode.decision.file,
    }));
  return files
    .filter((f) => isOut(f.path) && f.order !== "after")
    .map((f) => ({
      problem: "output-before-decision",
      ...at,
      path: f.path,
      output: { commit: f.commit, date: f.date },
      decision,
      same: f.order === "same",
    }));
};

/** Every defect of a decide-first study, in a fixed order: the plan's, then the history's. */
export const judgeOrder = (s: DecideFirstStudy): readonly OrderFinding[] => {
  const glob = decisionAsOutput(s.folder, s.mode);
  const clash: readonly OrderFinding[] =
    glob === null
      ? []
      : [
          {
            problem: "decision-is-output",
            id: s.id,
            file: s.mode.decision.file,
            glob,
          },
        ];
  switch (s.facts.kind) {
    case "unknown":
      return [...clash, { problem: "no-history", id: s.id, why: s.facts.why }];
    case "shallow":
      return [...clash, { problem: "shallow", id: s.id }];
    case "read":
      return [...clash, ...ordered(s, s.facts.decision, s.facts.files)];
  }
};

const RULE = "repro/outputs-before-decision";

/** Each finding by its problem. */
type FindingOf = {
  readonly [F in OrderFinding as F["problem"]]: F;
};

const short = (c: CommitAt): string => `${c.commit.slice(0, 12)} (${c.date})`;

const HEADS: {
  readonly [P in keyof FindingOf]: (f: FindingOf[P]) => string;
} = {
  "decision-is-output": (f) =>
    `The decision of \`${f.id}\`, \`${f.file}\`, is matched by its output \`${f.glob}\`: the decision would be one of the files its own run produces. What to do: keep the decision out of the outputs — a file the globs do not match, or one elsewhere in the paper — and set \`mode.decision.file\`.`,
  "no-history": (f) =>
    `\`${f.id}\` is decided before its run, and git's history is the proof of that order, but git could not answer: ${f.why}. What to do: lint the paper inside its git repository, with git installed.`,
  shallow: (f) =>
    `\`${f.id}\` is decided before its run, and this clone is shallow: every file's first commit is the clone's first, so the order of decision and outputs cannot be read. What to do: fetch the whole history (\`git fetch --unshallow\`; in GitHub Actions, \`actions/checkout\` with \`fetch-depth: 0\`).`,
  "undecided-output": (f) =>
    `\`repro/${f.folder}/${f.path}\` is an output of \`${f.id}\`, which is decided before its run, and its decision \`${f.decision}\` was never committed. What to do: remove the output, write and commit the decision, check it with \`npx paperlint studies gate <paper-dir> ${f.id}\`, then run the study again.`,
  "output-before-decision": (f) =>
    `\`repro/${f.folder}/${f.path}\`, an output of \`${f.id}\`, entered history in ${short(f.output)}, ${f.same ? "the very commit" : "not after the commit"} that first recorded its decision, ${short(f.decision)}. The study is declared decided before its run, and its history does not show that order. What to do: if the decision really came first, nothing in this history can prove it — declare the study \`exploratory\` with the reason, or run it again after the decision; never rewrite the history to make it pass.`,
};

const headOf = <P extends keyof FindingOf>(p: P, f: FindingOf[P]): string =>
  HEADS[p](f);

/** The one text a finding is reported with: what is wrong, what to do, and the rule's page. */
export const orderMessage = (f: OrderFinding): string =>
  `${headOf(f.problem, f)}\nRule ${RULE}: https://github.com/zernie/paperlint/blob/main/docs/rules/${RULE}.md`;
