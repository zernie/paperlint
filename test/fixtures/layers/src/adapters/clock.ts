// expect: clean
import { hrtime } from "node:process";
import type { Clock } from "../core/port.ts";

/** An adapter implements a core port, and may touch the outside world. */
export const systemClock: Clock = {
  now: () => Number(hrtime.bigint() / 1_000_000n),
};
