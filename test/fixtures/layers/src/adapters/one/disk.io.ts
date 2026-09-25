// expect: clean
import { readFileSync } from "node:fs";

/** Effects where they are declared: an *.io.ts file inside an adapter. */
export const readDisk = (p: string): string => readFileSync(p, "utf8");
