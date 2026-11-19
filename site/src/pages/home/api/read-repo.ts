import { readFileSync } from "node:fs";
import path from "node:path";

/** A file of the repository this site describes. `next build` runs in site/, one level below it. */
export const readRepo = (rel: string): string =>
  readFileSync(path.join(process.cwd(), "..", rel), "utf8");
