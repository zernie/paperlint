import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { presetsDir } from "../src/package-dirs.ts";
import { CATALOG_FILE } from "../src/venue-catalog.ts";
import { useTempDir } from "../test/support.ts";

const dir = useTempDir("paperlint-venue-catalog-");
const SCRIPT = fileURLToPath(new URL("venue-catalog.ts", import.meta.url));

describe("npm run catalog", () => {
  it("writes the committed presets/catalog.json byte for byte, into the directory it is given", () => {
    const r = spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });
    // Guards: the command the add-venue skill tells an author to run produces the file the site reads.
    expect([r.status, r.stderr]).toEqual([0, ""]);
    expect(readFileSync(join(dir, CATALOG_FILE), "utf8")).toBe(
      readFileSync(join(presetsDir(), CATALOG_FILE), "utf8"),
    );
  });

  it("🔴 without a directory it writes nothing and fails", () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
    // Guards: a missing argument cannot fall back to some directory the caller did not name.
    expect(r.status).toBe(1);
  });
});
