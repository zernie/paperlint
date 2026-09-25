// expect: clean
import { run } from "../app/use-case.ts";

/** The primary adapter calls a use case. */
export const args = (): string => typeof run;
