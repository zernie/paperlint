// expect: boundaries/no-unknown
import { answer } from "./lib/unclassified.ts";

/** An import of a file that belongs to no layer. */
export const doubled = answer * 2;
