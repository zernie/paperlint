/**
 * The arithmetic of `paperlint doctor`'s hook section (`src/hooks-settings.ts`): how many commands
 * run each shipped hook, against how many the shipped wiring has. One hook may hang off two events or
 * matchers (`lint-edited` after an Edit and after a Bash command), so it is wired whole only when every
 * one of its commands is there, and wired twice only when it runs more often than it ships.
 */

/** How many commands run one shipped hook, split by spelling. */
export interface HookCount {
  readonly name: string;
  readonly ours: number;
  readonly other: number;
}

/** How many commands of the shipped wiring run each hook name. */
export type Shipped = Readonly<Record<string, number>>;

export const total = (c: HookCount): number => c.ours + c.other;

/** How many commands the shipped wiring runs `name` with; a name it does not ship, once. */
const times = (shipped: Shipped, name: string): number => shipped[name] ?? 1;

/**
 * The hooks short of their shipped commands in a set that is partly wired; empty when it is whole or
 * when nothing is wired. A hook with some of its commands is short too: `lint-edited` wired by an
 * older `init` after an Edit only.
 */
export function partlyMissing(
  counts: readonly HookCount[],
  shipped: Shipped,
): readonly string[] {
  if (counts.every((c) => total(c) === 0)) return [];
  return counts
    .filter((c) => total(c) < times(shipped, c.name))
    .map((c) => c.name);
}

/** The hooks that run more often than the wiring ships them. */
export const overWired = (
  counts: readonly HookCount[],
  shipped: Shipped,
): readonly HookCount[] =>
  counts.filter((c) => total(c) > times(shipped, c.name));

/** Each short hook as the doctor names it: `lint-edited (1 of its 2 commands)`, or the bare name. */
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
        : `${c.name} (${String(total(c))} of its ${String(times(shipped, c.name))} commands)`,
    );
};
