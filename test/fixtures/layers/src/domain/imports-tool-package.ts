// expect: boundaries/dependencies
import { load } from "js-yaml";

/** A package that exists because of one external format, in the domain: it belongs to that tool's adapter. */
export const read = (text: string): unknown => load(text);
