// expect: boundaries/dependencies
import { readDisk } from "./adapters/one/disk.io.ts";

/** Past an adapter's index.ts: its internals are its own. */
export const leaked = readDisk;
