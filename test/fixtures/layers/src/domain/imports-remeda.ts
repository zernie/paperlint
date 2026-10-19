// expect: clean
import { filter, pipe } from "remeda";

/** The domain may use Remeda: a pure collection library, no effects (root CLAUDE.md: collections through Remeda). */
export const evens = (xs: readonly number[]): readonly number[] =>
  pipe(
    xs,
    filter((x) => x % 2 === 0),
  );
