// expect: boundaries/no-unknown-dependencies
import { answer } from "./lib/unclassified.ts";

/** An import of a file that belongs to no layer. */
export const doubled = answer * 2;
