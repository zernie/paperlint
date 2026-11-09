/**
 * Who is an ancestor of whom, among the commits git lists for a paper, answered in memory.
 *
 * `repro/outputs-before-decision` asks "is any commit that touched the decision a strict ancestor of
 * this output's first commit?" for every output commit of every study. One `git rev-list` per pair
 * walked the whole history each time (docs/rules/repro/outputs-before-decision.md, "Cost"). git
 * is asked once instead: `git log --full-history --parents` over the paper's `repro/` and its
 * decision files prints every commit that touches them, each with its parents REWRITTEN to the nearest
 * listed ancestors. With `--full-history` no path of the real history is dropped, so among the listed
 * commits "A is an ancestor of B" is the same question in the real graph and in this one (checked
 * against `git merge-base --is-ancestor` on random histories with merges while this was written).
 *
 * Each commit gets a bit; the bits of a commit and everything below it are one mask, built oldest first
 * from its parents' masks. The cost is quadratic in the number of listed commits (a map copy per commit): a few thousand
 * touch one paper's `repro/`.
 */
import type { Order } from "../../ports/git-history.ts";

/** One listed commit and its rewritten parents. */
interface Listed {
  readonly commit: string;
  readonly parents: readonly string[];
}

/** A listed commit's own bit (its place in the list) and the bits of it and everything below it. */
interface Marks {
  readonly bit: bigint;
  readonly upto: bigint;
}

/** The listed commits, oldest first (parents before children), by sha. */
export type Ancestry = ReadonlyMap<string, Marks>;

/** `<sha> <parent sha>…` lines, as `--format="%H %P"` prints them. */
const listedOf = (log: string): readonly Listed[] =>
  log
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [commit = "", ...parents] = line.split(" ");
      return { commit, parents: parents.filter((p) => p !== "") };
    });

/** The ancestry of the commits in `log`: `git log --topo-order --reverse --parents --format="%H %P"`. */
export const ancestryOf = (log: string): Ancestry =>
  listedOf(log).reduce((seen, l, i) => {
    const bit = 1n << BigInt(i);
    const below = l.parents.flatMap((p) => seen.get(p)?.upto ?? []);
    return new Map([
      ...seen,
      [l.commit, { bit, upto: below.reduce((m, u) => m | u, bit) }],
    ]);
  }, new Map<string, Marks>());

/**
 * The order of `commit` against the commits `touching` the decision: after when one of them is its
 * strict ancestor, the same when it is one of them, not after otherwise. undefined: git did not list
 * `commit` or one of `touching`, so ancestry cannot be read.
 */
export const orderAmong = (
  a: Ancestry,
  commit: string,
  touching: readonly string[],
): Order | undefined => {
  const at = a.get(commit);
  const marks = touching.flatMap((t) => a.get(t) ?? []);
  if (at === undefined || marks.length !== touching.length) return undefined;
  const mask = marks.reduce((m, x) => m | x.bit, 0n);
  if ((at.upto & ~at.bit & mask) !== 0n) return "after";
  return touching.includes(commit) ? "same" : "not-after";
};
