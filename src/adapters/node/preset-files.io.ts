/** The presets of a directory on disk, as the `PresetFiles` port. */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PresetFiles } from "../../ports/preset-files.ts";

/** The `*.jsonc` presets in `dir`. */
export const presetFilesIn = (dir: string): PresetFiles => ({
  list: () =>
    readdirSync(dir)
      .filter((f) => f.endsWith(".jsonc"))
      .toSorted(),
  read: (name) => readFileSync(join(dir, name), "utf8"),
  write: (name, text) => {
    writeFileSync(join(dir, name), text);
  },
  path: (name) => join(dir, name),
});
