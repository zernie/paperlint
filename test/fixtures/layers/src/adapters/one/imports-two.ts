// expect: boundaries/dependencies
import { twoName } from "../two/index.ts";

/** One adapter importing another: a second tool's knowledge leaking into the first. */
export const borrowed = twoName;
