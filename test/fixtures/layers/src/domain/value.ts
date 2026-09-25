// expect: clean
import { join } from "node:path";
import type { Opaque } from "ts-essentials";

/** The domain's allowlist: types, pure path arithmetic. */
export type PaperDir = Opaque<string, "PaperDir">;
export const facts = (d: PaperDir): string => join(d, "_build");
