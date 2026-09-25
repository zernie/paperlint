// expect: clean
import { facts, type PaperDir } from "../domain/value.ts";
import type { Measure } from "../ports/measure.ts";

/** A use case: domain values over a port. */
export const run = (m: Measure, d: PaperDir): string => `${facts(d)} ${m.measure(d)}`;
