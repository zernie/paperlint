// expect: boundaries/dependencies
import type { Measure } from "../ports/measure.ts";

/** The domain is innermost: it names no port. */
export type Wrapped = { readonly m: Measure };
