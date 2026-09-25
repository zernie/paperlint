// expect: no-restricted-imports
import { existsSync } from "node:fs";

/** I/O in core: the IO_BAN finding. */
export const present = (p: string): boolean => existsSync(p);
