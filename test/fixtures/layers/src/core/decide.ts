// expect: clean
import type { Clock } from "./port.ts";

/** Core may import core. */
export const isLate = (c: Clock, deadline: number): boolean =>
  c.now() > deadline;
