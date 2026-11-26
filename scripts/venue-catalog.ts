// Writes catalog.json, the venue catalog paperlint.dev reads (src/venue-catalog.ts builds it), into
// the directory named by its one argument: `npm run catalog` names presets/ after a preset changes,
// and src/venue-catalog.test.ts fails while the committed file is stale. A test names a temporary
// directory, so it runs the script without touching the committed file.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { nodeFiles } from "../src/adapters/node/index.ts";
import { presetsDir } from "../src/package-dirs.ts";
import { resolveShipped } from "../src/presets.ts";
import { catalogText, CATALOG_FILE } from "../src/venue-catalog.ts";

const [outDir] = z.tuple([z.string().min(1)]).parse(process.argv.slice(2));
const venuesDir = presetsDir();
writeFileSync(
  join(outDir, CATALOG_FILE),
  catalogText(resolveShipped({ files: nodeFiles, venuesDir })),
);
