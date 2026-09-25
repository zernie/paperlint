// expect: clean
import type { PaperDir } from "../../domain/value.ts";

/** Pure code inside an adapter: no I/O, and still the adapter's. */
export const size = (s: string): number => s.length;
export type Dir = PaperDir;
