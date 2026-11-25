/**
 * A PAPER'S REVISION PLAN — `<paper>/revision-plan.json` (#502): for the current cycle, which accepted
 * papers the paper is held against, whether new evidence is still being gathered, and the closed list
 * of what remains before it is submitted. "Done" is the list, not a reader's or a skill's bar: a
 * review finding outside it is a proposal until the author adds a row.
 *
 * The text is checked once, where it enters: `RevisionPlanCodec` (`src/ports/revision-plan-codec.ts`),
 * whose adapter holds the zod schema of this shape. Only the codec mints a `RevisionPlan`, so a value
 * built by hand can hold what the schema refuses (a `done` row with no evidence, two rows with one id).
 * Every object is strict: a misspelt key is a finding, not a field nobody reads.
 *
 * What the shape cannot hold, by construction:
 * - a `done` row without `evidence`, a `dropped` row without `reason` and `kind`;
 * - a bar that claims to be measured without naming the corpus and at least one edition;
 * - "no bar" without saying why; a `proxy` without what it stands in for;
 * - `enough` measured without a date and the file that decided it;
 * - a row with no origin, or no date it was added.
 * What needs the disk or the settings (the cycle is the current one, the corpus and each named file
 * exist, a finding exists in its review, a rule id is shipped) is a rule's, not this type's.
 */
import type { CycleId } from "./cycle.ts";

export const REVISION_PLAN = "revision-plan.json";

/** A row's id, `R1`, `R2`, …: unique in the file, so a review finding can name it. */
export const ROW_ID_PATTERN = /^R[1-9][0-9]*$/u;

/** A rule's id as `paperlint lint` reports it: `<plugin>/<rule>`. */
export const RULE_ID_PATTERN = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/u;

/** Which accepted papers the paper is held against. A measured bar IS a corpus: there is no `measured: true`. */
export type Bar =
  | {
      readonly kind: "corpus";
      /** The venue corpus's series: its folder under `<papers-root>/venues/`. */
      readonly series: string;
      readonly editions: readonly [number, ...number[]];
    }
  | {
      /** Another venue's corpus, labelled as a stand-in. */
      readonly kind: "proxy";
      readonly series: string;
      readonly stands_in_for: string;
    }
  | { readonly kind: "none"; readonly why: string };

/** Whether new evidence is still being gathered. `enough` closes the evidence, not the text (#504). */
export type Measurement =
  | { readonly kind: "open" }
  | {
      readonly kind: "enough";
      readonly since: string;
      /** The paper's file, relative to the paper folder, whose reading decided it. */
      readonly evidence: string;
    };

/** Where a row came from: one closed set, so a row cannot arrive from nowhere. */
export type RowSource =
  | { readonly kind: "author" }
  /** A fact of the venue's preset: its template, a required section. */
  | { readonly kind: "venue" }
  /** A finding of a review file, relative to the paper folder (`reviews/*.md`), by its id. */
  | {
      readonly kind: "finding";
      readonly file: string;
      readonly finding: string | number;
    }
  /** The points of a reviewed rejection, from that cycle. */
  | { readonly kind: "prior-reviews"; readonly cycle: CycleId };

/** Why a dropped row is not done: decided against, or a known cost the paper is submitted with. */
export const DROP_KINDS = ["not-doing", "accepted-cap"] as const;
export type DropKind = (typeof DROP_KINDS)[number];

/** What every row carries. */
interface RowBase {
  readonly id: string;
  readonly what: string;
  readonly from: RowSource;
  /** The day the row was added: a row added after `written` is growth the plan's reader sees. */
  readonly added: string;
}

/** How a row stands: open, closed with evidence, dropped with a reason, or closed when a rule falls silent. */
export type Row = RowBase &
  (
    | { readonly state: "todo" | "doing" }
    | { readonly state: "done"; readonly evidence: string }
    | {
        readonly state: "dropped";
        readonly reason: string;
        readonly kind: DropKind;
      }
    | { readonly state: "by-rule"; readonly rule: string }
  );

export const ROW_STATES = [
  "todo",
  "doing",
  "done",
  "dropped",
  "by-rule",
] as const satisfies readonly Row["state"][];

export interface RevisionPlan {
  /** The cycle the plan is for (`cycles[].id` in the paper's `paperlint.json`). */
  readonly cycle: CycleId;
  /** The day the plan was written. */
  readonly written: string;
  readonly bar: Bar;
  readonly measurement: Measurement;
  /** The closed list: a row is added only by an edit to this file. */
  readonly remaining: readonly Row[];
}

/** A field of the plan, as the path of keys and indexes from its top. */
export type PlanPath = readonly (string | number)[];

/** Why the text is not a plan, at the field the reason is about. */
export interface PlanProblem {
  readonly path: PlanPath;
  readonly message: string;
}

export type ParsedPlan =
  | { readonly ok: true; readonly plan: RevisionPlan }
  | { readonly ok: false; readonly problems: readonly PlanProblem[] };
