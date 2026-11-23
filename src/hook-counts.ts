/**
 * The arithmetic of `paperlint doctor`'s hook section (`src/hooks-settings.ts`): in how many places
 * (an event and a matcher) each shipped hook runs, against how many the shipped wiring has. One hook
 * may hang off two places (`lint-edited` after an Edit and after a Bash command), so it is wired whole
 * only when it runs in as many distinct places as it ships: two commands in one place stand in for
 * none of the others. It is wired twice when one place runs it more than once, or when it has more
 * commands than it ships.
 */

/** How many commands run one shipped hook, split by spelling, and in how many distinct places. */
export interface HookCount {
  readonly name: string;
  readonly ours: number;
  readonly other: number;
  /** The distinct event and matcher pairs its commands hang off. */
  readonly places: number;
}

/** How many commands, each in a place of its own, of the shipped wiring run each hook name. */
export type Shipped = Readonly<Record<string, number>>;

export const total = (c: HookCount): number => c.ours + c.other;

/** In how many places the shipped wiring runs `name`; a name it does not ship, once. */
const times = (shipped: Shipped, name: string): number => shipped[name] ?? 1;

/**
 * The hooks short of their shipped places in a set that is partly wired; empty when it is whole or
 * when nothing is wired. A hook in some of its places is short too: `lint-edited` wired by an older
 * `init` after an Edit only, however many commands run it there.
 */
export function partlyMissing(
  counts: readonly HookCount[],
  shipped: Shipped,
): readonly string[] {
  if (counts.every((c) => total(c) === 0)) return [];
  return counts
    .filter((c) => c.places < times(shipped, c.name))
    .map((c) => c.name);
}

/** The hooks that one place runs more than once, or that have more commands than the wiring ships. */
export const overWired = (
  counts: readonly HookCount[],
  shipped: Shipped,
): readonly HookCount[] =>
  counts.filter(
    (c) => total(c) > c.places || total(c) > times(shipped, c.name),
  );

/** Each short hook as the doctor names it: `lint-edited (in 1 of its 2 places)`, or the bare name. */
export const shortLabels = (
  counts: readonly HookCount[],
  shipped: Shipped,
): readonly string[] => {
  const short = partlyMissing(counts, shipped);
  return counts
    .filter((c) => short.includes(c.name))
    .map((c) =>
      total(c) === 0
        ? c.name
        : `${c.name} (in ${String(c.places)} of its ${String(times(shipped, c.name))} places)`,
    );
};
