// expect: clean
import { z } from "zod";
import type { Measure } from "../../ports/measure.ts";
import { size } from "./pure.ts";
import { readDisk } from "./disk.io.ts";

/** An adapter composes its pure and its effectful halves; its tool's libraries are its own. */
export const adapterOne: Measure & { readonly name: string } = {
  name: z.string().parse("one"),
  measure: (d) => size(readDisk(d)),
};
