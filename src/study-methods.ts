/**
 * `paperlint studies methods <paper-dir> [--format md|tex]` — what the Methods section and the
 * artifact's README say of each study the paper reports, derived from the registry, the plans, the
 * manifests and git's history; never a copy kept by hand. Read-only. The text is
 * `src/domain/study-methods.ts`'s.
 */
import { blindStudies, modeStudies } from "./blind-plaintext-rule.ts";
import { outputCommits } from "./domain/decide-first.ts";
import type { SealManifest } from "./domain/sealed-study.ts";
import {
  methodsTable,
  methodsTex,
  type MethodsRow,
} from "./domain/study-methods.ts";
import {
  decideFirstStudies,
  type OrderDeps,
} from "./outputs-before-decision-rule.ts";
import { refusal, refused, type SealRun } from "./sealed-studies.ts";
import { registryOf } from "./study-registry-rule.ts";

/** The forms the text comes in. */
export const METHODS_FORMATS = ["md", "tex"] as const;
export type MethodsFormat = (typeof METHODS_FORMATS)[number];

/** Whether `s` names a form. */
export const isMethodsFormat = (s: string): s is MethodsFormat =>
  METHODS_FORMATS.some((f) => f === s);

/** A row without its id and title: what the study's mode and evidence say. */
type Standing = MethodsRow extends infer R
  ? R extends MethodsRow
    ? Omit<R, "id" | "title">
    : never
  : never;

/** The earliest time a file of `m` was sealed; null when none was. */
const sealedFrom = (m: SealManifest): string | null =>
  m.files.map((f) => f.sealed_at).sort()[0] ?? null;

/** Each decide-first study's standing: its history's decision and first output. */
const decided = (
  paper: string,
  deps: OrderDeps,
): readonly (readonly [string, Standing])[] =>
  decideFirstStudies(paper, deps).map((d) => [
    d.id,
    {
      kind: "decided",
      history:
        d.facts.kind === "read"
          ? {
              decision: d.facts.decision,
              firstOutput: outputCommits(d, d.facts.files)[0] ?? null,
            }
          : null,
    },
  ]);

/** Each blind study's standing: when it was sealed, and the gate it was unsealed on. */
const blind = (
  paper: string,
  deps: OrderDeps,
): readonly (readonly [string, Standing])[] =>
  blindStudies(paper, deps).map((b) => {
    const m = b.manifest.kind === "read" ? b.manifest.manifest : null;
    return [
      b.id,
      {
        kind: "blind",
        sealedFrom: m === null ? null : sealedFrom(m),
        gate: m?.unsealed?.gate ?? null,
      },
    ];
  });

/** What each study with a mode says, by id. */
const standingsOf = (
  paper: string,
  deps: OrderDeps,
): ReadonlyMap<string, Standing> =>
  new Map<string, Standing>([
    ...decided(paper, deps),
    ...blind(paper, deps),
    ...modeStudies(paper, deps).flatMap(
      ({ row, mode }): readonly (readonly [string, Standing])[] =>
        mode.kind === "exploratory"
          ? [[row.id, { kind: "exploratory", reason: mode.reason }]]
          : [],
    ),
  ]);

/** `studies methods`: the text of every study the paper reports, in the asked form. */
export function runMethods(
  paper: string,
  shown: string,
  format: MethodsFormat,
  deps: OrderDeps,
): SealRun {
  const r = registryOf(paper, deps);
  const reported = (r.kind === "read" ? r.registry.studies : []).filter(
    (s) => s.in_paper === "yes",
  );
  if (reported.length === 0)
    return refused(
      refusal(
        `${shown} reports no study: no row of ${shown}/repro/studies.json has \`"in_paper": "yes"\`.`,
      ),
    );
  const standings = standingsOf(paper, deps);
  const rows = reported.map((s): MethodsRow => ({
    id: s.id,
    title: s.title,
    ...(standings.get(s.id) ?? { kind: "none" }),
  }));
  return {
    ok: true,
    lines: [
      format === "md" ? methodsTable(rows, shown) : methodsTex(rows, shown),
    ],
  };
}
