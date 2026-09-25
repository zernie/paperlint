// expect: boundaries/dependencies
import { readFileSync } from "node:fs";

/** I/O in an adapter file that does not say so in its name: axis B inside an adapter. */
export const readDisk = (p: string): string => readFileSync(p, "utf8");
