// Writes presets/catalog.json, the venue catalog paperlint.dev reads (src/venue-catalog.ts builds it).
// `npm run catalog` after a preset changes; src/venue-catalog.test.ts fails while the file is stale.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { nodeFiles } from "../src/adapters/node/index.ts";
import { presetsDir } from "../src/package-dirs.ts";
import { resolveShipped } from "../src/presets.ts";
import { catalogText, CATALOG_FILE } from "../src/venue-catalog.ts";

const venuesDir = presetsDir();
writeFileSync(
  join(venuesDir, CATALOG_FILE),
  catalogText(resolveShipped({ files: nodeFiles, venuesDir })),
);
