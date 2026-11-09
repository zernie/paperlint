/**
 * WHAT `paperlint lint` SAYS ABOUT ITS TIME. A run that takes a minute is invisible without it: the
 * slow rule is one of ~100 and nothing named it. The numbers are ESLint's own (`stats: true` on the
 * instance: per file, per pass, per rule), summed here per rule; the clock is read by the caller.
 */
import { map, pipe, sortBy, take } from "remeda";

/** The part of ESLint's per-file `stats` this reads. */
export interface TimedResult {
  readonly stats?:
    | {
        readonly times: {
          readonly passes: readonly {
            readonly rules?:
              Readonly<Record<string, { readonly total: number }>> | undefined;
          }[];
        };
      }
    | undefined;
}

export interface RuleTime {
  readonly rule: string;
  readonly ms: number;
}

/** Above this many milliseconds the slowest rules are named too. */
const NAME_RULES_OVER_MS = 10_000;
const HOW_MANY = 3;

/** Every rule's milliseconds summed over files and passes, slowest first (ties by name). */
export const ruleTimes = (
  results: readonly TimedResult[],
): readonly RuleTime[] => {
  const samples = results.flatMap((r) =>
    (r.stats?.times.passes ?? []).flatMap((p) =>
      Object.entries(p.rules ?? {}).map(
        ([rule, t]) => [rule, t.total] as const,
      ),
    ),
  );
  const totals = samples.reduce(
    (m, [rule, ms]) => new Map(m).set(rule, (m.get(rule) ?? 0) + ms),
    new Map<string, number>(),
  );
  return sortBy(
    [...totals].map(([rule, ms]) => ({ rule, ms })),
    [(t) => t.ms, "desc"],
    (t) => t.rule,
  );
};

/** The lines printed after the report: the total, and over 10 s the three slowest rules. */
export const timingLines = ({
  files,
  ms,
  rules,
}: {
  readonly files: number;
  readonly ms: number;
  readonly rules: readonly RuleTime[];
}): readonly string[] => [
  `linted ${String(files)} file(s) in ${(ms / 1000).toFixed(1)} s`,
  ...(ms > NAME_RULES_OVER_MS && rules.length > 0
    ? [
        `slowest rules: ${pipe(
          rules,
          take(HOW_MANY),
          map((t) => `${t.rule} ${String(Math.round(t.ms))} ms`),
        ).join(" · ")}`,
      ]
    : []),
];
