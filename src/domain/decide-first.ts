/**
 * DECIDE FIRST — the default mode of a measurement study (src/domain/study-mode.ts): the author's
 * decisions on the inputs are committed before any output exists, and git's history is the proof of
 * order. `repro/outputs-before-decision` judges it here, from facts git gave (src/adapters/git/):
 *
 *   - each output in the tree or ever committed while the decision file was never committed;
 *   - each output whose FIRST commit is not a strict descendant of the decision file's FIRST commit —
 *     earlier, on a line of history the decision is not on, or in the very same commit (which says
 *     nothing about which came first);
 *   - a decision file the outputs match (it would be "produced" by the run it gates);
 *   - a decision file committed and since deleted: it is not in HEAD, so there is no decision;
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

/** What a decision path names on disk when it is no file git can vouch for. */
export type NotAFile = "directory" | "symbolic link" | "special file";

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
 * every file ever committed under the study's folder did — or, when the decision names a directory,
 * that history was not asked (git answers for a directory with the commits of anything under it).
 */
export type OrderFacts =
  | { readonly kind: "not-a-file"; readonly what: NotAFile }
  /** The decision's path passes through a symbolic link above the file (`link`: the first, relative to the paper). */
  | { readonly kind: "linked"; readonly link: string }
  | { readonly kind: "unknown"; readonly why: string }
  /** A shallow clone: every file's first commit is the clone's first, so no order can be read. */
  | { readonly kind: "shallow" }
  | {
      readonly kind: "read";
      /** null: the decision file was never committed. */
      readonly decision: CommitAt | null;
      /** The decision was committed, then deleted: it is not in HEAD. */
      readonly decisionDeleted: boolean;
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
      readonly problem: "decision-deleted";
      readonly id: string;
      readonly file: string;
    }
  | {
      readonly problem: "decision-not-file";
      readonly id: string;
      readonly file: string;
      readonly what: NotAFile;
    }
  | {
      readonly problem: "decision-linked";
      readonly id: string;
      readonly file: string;
      readonly link: string;
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

/** The files of a read history that are outputs of the study, oldest first commit first. */
export const outputCommits = (
  s: DecideFirstStudy,
  files: readonly FirstCommit[],
): readonly FirstCommit[] => files.filter((f) => outputOf(s)(f.path));

/** The findings of a history that was read. */
const ordered = (
  s: DecideFirstStudy,
  decision: CommitAt | null,
  files: readonly FirstCommit[],
): readonly OrderFinding[] => {
  const isOut = outputOf(s);
  const at = { id: s.id, folder: s.folder };
  if (decision === null)
    // The tree's outputs, then those only history holds: deleting an output does not erase it.
    return [...new Set([...s.tree, ...files.map((f) => f.path)])]
      .filter(isOut)
      .map((path) => ({
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
  return [...clash, ...historyFindings(s)];
};

/** The findings of a decide-first study's history, whatever git could say of it. */
const historyFindings = (s: DecideFirstStudy): readonly OrderFinding[] => {
  const file = s.mode.decision.file;
  switch (s.facts.kind) {
    case "not-a-file":
      return [
        { problem: "decision-not-file", id: s.id, file, what: s.facts.what },
      ];
    case "linked":
      return [
        { problem: "decision-linked", id: s.id, file, link: s.facts.link },
      ];
    case "unknown":
      return [{ problem: "no-history", id: s.id, why: s.facts.why }];
    case "shallow":
      return [{ problem: "shallow", id: s.id }];
    case "read":
      // A decision deleted since is no decision: the order is not judged against it.
      return s.facts.decisionDeleted
        ? [{ problem: "decision-deleted", id: s.id, file }]
        : ordered(s, s.facts.decision, s.facts.files);
  }
};

const RULE = "repro/outputs-before-decision";

/** Each finding by its problem. */
type FindingOf = {
  readonly [F in OrderFinding as F["problem"]]: F;
};

/** Why git's history says nothing of a decision that is not a file. */
const NOT_A_FILE: Readonly<Record<NotAFile, string>> = {
  directory:
    "git answers for a directory with the commits of anything under it",
  "symbolic link": "git records the link, not the file it points to",
  "special file": "git tracks only regular files",
};

const short = (c: CommitAt): string => `${c.commit.slice(0, 12)} (${c.date})`;

const HEADS: {
  readonly [P in keyof FindingOf]: (f: FindingOf[P]) => string;
} = {
  "decision-is-output": (f) =>
    `The decision of \`${f.id}\`, \`${f.file}\`, is matched by its output \`${f.glob}\`: the decision would be one of the files its own run produces. What to do: keep the decision out of the outputs — a file the globs do not match, or one elsewhere in the paper — and set \`mode.decision.file\`.`,
  "decision-deleted": (f) =>
    `The decision of \`${f.id}\`, \`${f.file}\`, was committed and then deleted: it is not in HEAD, so the study has no decision its outputs could follow. What to do: restore the decision file as it was decided and commit it — never write a new one after the outputs; if the decision no longer holds, declare the study \`exploratory\` with the reason.`,
  "decision-not-file": (f) =>
    `The decision of \`${f.id}\`, \`${f.file}\`, is a ${f.what}, not a file: ${NOT_A_FILE[f.what]}, so no order can be read from it. What to do: name the decision file itself in \`mode.decision.file\`.`,
  "decision-linked": (f) =>
    `The decision of \`${f.id}\`, \`${f.file}\`, passes through the symbolic link \`${f.link}\`: git records the link, not the files behind it, so no order can be read from it. What to do: name a decision file that lies in real directories in \`mode.decision.file\`.`,
  "no-history": (f) =>
    `\`${f.id}\` is decided before its run, and git's history is the proof of that order, but git could not answer: ${f.why}. What to do: lint the paper inside its git repository, with git installed.`,
  shallow: (f) =>
    `\`${f.id}\` is decided before its run, and this clone is shallow: every file's first commit is the clone's first, so the order of decision and outputs cannot be read. What to do: fetch the whole history (\`git fetch --unshallow\`; in GitHub Actions, \`actions/checkout\` with \`fetch-depth: 0\`).`,
  "undecided-output": (f) =>
    `\`repro/${f.folder}/${f.path}\` is an output of \`${f.id}\` — in the tree, or in its history — and the study is decided before its run, but its decision \`${f.decision}\` was never committed. What to do: write and commit the decision, check it with \`npx paperlint studies gate <paper-dir> ${f.id}\`, then run the study again; if the output was made before any decision, declare the study \`exploratory\` with the reason. Deleting the output does not undo it: history keeps it.`,
  "output-before-decision": (f) =>
    `\`repro/${f.folder}/${f.path}\`, an output of \`${f.id}\`, entered history in ${short(f.output)}, ${f.same ? "the very commit" : "not after the commit"} that first recorded its decision, ${short(f.decision)}. The study is declared decided before its run, and its history does not show that order. What to do: if the decision really came first, nothing in this history can prove it — declare the study \`exploratory\` with the reason, or run it again after the decision; never rewrite the history to make it pass.`,
};

const headOf = <P extends keyof FindingOf>(p: P, f: FindingOf[P]): string =>
  HEADS[p](f);

/** The one text a finding is reported with: what is wrong, what to do, and the rule's page. */
export const orderMessage = (f: OrderFinding): string =>
  `${headOf(f.problem, f)}\nRule ${RULE}: https://github.com/zernie/paperlint/blob/main/docs/rules/${RULE}.md`;
