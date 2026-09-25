// expect: boundaries/dependencies
import { readDisk } from "../adapters/one/disk.io.ts";

/** Even a test goes through an adapter's index.ts: its other files are its own business. */
export const leaked = readDisk;
