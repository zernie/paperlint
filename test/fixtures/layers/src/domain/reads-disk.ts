// expect: boundaries/dependencies
import { existsSync } from "node:fs";

/** I/O in the domain: axis B. */
export const present = (p: string): boolean => existsSync(p);
