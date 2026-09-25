// expect: clean
import type { PaperDir } from "../domain/value.ts";

/** A port: an interface in the domain's vocabulary. */
export interface Measure {
  measure(d: PaperDir): number;
}
