// expect: boundaries/dependencies
import type { PaperDir } from "./domain/value.ts";
import { adapterOne } from "./adapters/one/index.ts";

/** The app naming a tool instead of taking the port. */
export const measured = (d: PaperDir): number => adapterOne.measure(d);
