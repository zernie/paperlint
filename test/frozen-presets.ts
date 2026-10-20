/**
 * Venue presets frozen at a recorded day, for the tests of LOGIC. The shipped `presets/*.jsonc`
 * carry deadlines the scheduled refresh (`.github/workflows/deadlines.yml`) rewrites whenever a
 * portal moves them, so a test that asserts those dates turns red on the bot's own pull request.
 * A test about merging, cycles, `submission show` or the refresh itself reads these copies; a test
 * about the SHIPPED preset asserts its shape (kinds, portal, sources), never the moving dates.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const FROZEN_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "frozen-presets",
);
/** The text of the frozen preset `name` (`msr.jsonc`). */
export const frozenText = (name: string): string =>
  readFileSync(join(FROZEN_DIR, name), "utf8");
