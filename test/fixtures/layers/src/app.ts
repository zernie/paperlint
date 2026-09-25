// expect: clean
import { systemClock } from "./adapters/clock.ts";
import { isLate } from "./core/decide.ts";

/** The app composes core and adapters. */
export const late = (deadline: number): boolean =>
  isLate(systemClock, deadline);
