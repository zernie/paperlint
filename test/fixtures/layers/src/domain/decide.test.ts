// expect: clean
import { adapterOne } from "../adapters/one/index.ts";
import { readFileSync } from "node:fs";

/** A test may import anything: adapters, fakes, the disk. */
export const seen = [adapterOne, readFileSync];
