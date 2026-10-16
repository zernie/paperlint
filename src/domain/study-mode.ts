/**
 * A STUDY'S MODE — how its outcomes are kept from the decisions about its inputs. A measurement study
 * declares exactly one (docs/design/sealed-studies.md):
 *
 *   decide_before_run   the default: the author's decisions on the inputs (exclusions, veto, the
 *                       sample's approval) are committed BEFORE any output exists. No key, no
 *                       encryption: git's history is the proof of order, and `repro/outputs-before-
 *                       decision` re-checks it on every lint.
 *   blind               the outputs must exist before the decision: they are sealed with age to public
 *                       recipients, and unsealed only once the decision is committed.
 *   exploratory         no gate: the study is exploratory and is reported as such.
 *
 * "None" and "two at once" cannot be written: the plan holds one `mode`, a union on its `kind`, and a
 * measurement study's plan is not ready without it (the parser, `src/adapters/study-registry/`).
 *
 * Paths: `outputs` are globs relative to the study's folder (the study's results live there); a
 * decision's `file` is relative to the PAPER's folder, so a decision may live beside the study or
 * anywhere in the paper (`research/decisions.md`). Pure.
 */
import { posix } from "node:path";
import { REPRO_DIR } from "./repro-layout.ts";
import type { StudyKind } from "./study-registry.ts";

/** A decision recorded in a file: where, and what it decides. */
export interface Decision {
  /** Relative to the paper's folder. */
  readonly file: string;
  readonly note: string;
}

/** Decide first: the decision on the inputs is committed before any output exists. */
export interface DecideFirst {
  readonly kind: "decide_before_run";
  /** Globs relative to the study's folder: the files the run produces. */
  readonly outputs: readonly string[];
  readonly decision: Decision;
}

/** Blind: the outputs exist first, sealed to `recipients`, unsealed after `unseal_after` is committed. */
export interface Blind {
  readonly kind: "blind";
  readonly outputs: readonly string[];
  readonly recipients: readonly string[];
  readonly unseal_after: Decision;
}

/** Exploratory: no gate, and reported as exploratory. */
export interface Exploratory {
  readonly kind: "exploratory";
  readonly reason: string;
}

export type StudyMode = DecideFirst | Blind | Exploratory;

/** The modes, by their `kind`. */
export const MODE_KINDS = [
  "decide_before_run",
  "blind",
  "exploratory",
] as const;

/**
 * The kinds of study whose plan must declare a mode: the ones that measure. A spike, a tool, a data
 * set, an artifact or a salvage may omit it.
 */
export const MODE_REQUIRED: readonly StudyKind[] = ["measurement"];

/** Whether a study of `kind` must declare its mode. */
export const needsMode = (kind: StudyKind): boolean =>
  MODE_REQUIRED.includes(kind);

/** A gated mode: one with outputs and the decision that gates them. */
export type Gated = DecideFirst | Blind;

/** The decision a gated mode waits on. */
export const gateOf = (m: Gated): Decision =>
  m.kind === "blind" ? m.unseal_after : m.decision;

/** `paperPath` relative to the study folder `folder`, when it lies inside it; else null. */
export const inStudy = (folder: string, paperPath: string): string | null => {
  const prefix = `${REPRO_DIR}/${folder}/`;
  const n = posix.normalize(paperPath);
  return n.startsWith(prefix) ? n.slice(prefix.length) : null;
};

/** Whether the file at `path` (relative to the study's folder) is one of `outputs`. */
export const isOutput = (outputs: readonly string[], path: string): boolean =>
  outputs.some((g) => posix.matchesGlob(path, g));

/**
 * The output glob that matches the mode's own decision file, when the file lies in the study's
 * folder: the decision would be an output — sealed with the results, or "produced" by the run it gates.
 */
export const decisionAsOutput = (folder: string, m: Gated): string | null => {
  const rel = inStudy(folder, gateOf(m).file);
  return rel === null
    ? null
    : (m.outputs.find((g) => posix.matchesGlob(rel, g)) ?? null);
};
