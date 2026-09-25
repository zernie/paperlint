// expect: boundaries/dependencies boundaries/entry-point
import { readDisk } from "../adapters/one/disk.io.ts";

/** Past an adapter's index.ts, and the cli may not know adapters at all. */
export const leaked = readDisk;
