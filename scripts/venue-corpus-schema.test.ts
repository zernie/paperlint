/**
 * `npm run schema:venue-corpus`: the script writes the schema the parser generates, where it is told.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { venueCorpusSchemaText } from "../src/adapters/venue-corpus/index.ts";
import { runNode, useTempDir } from "../test/support.ts";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "venue-corpus-schema.ts",
);

describe("venue-corpus-schema.ts", () => {
  const dir = useTempDir();

  it("🔴 writes the generated schema to the file it is given", () => {
    const out = join(dir, "papers.schema.json");
    expect(
      runNode(SCRIPT, [out], { nodeArgs: ["--conditions=paperlint-source"] }),
    ).toEqual({ status: 0, stdout: "", stderr: "" });
    expect(readFileSync(out, "utf8")).toBe(venueCorpusSchemaText());
  });

  it("no output file, or more than one: the usage, exit 2, nothing written", () => {
    const usage = {
      status: 2,
      stdout: "",
      stderr: "usage: node venue-corpus-schema.ts <output-file>\n",
    };
    const opts = { nodeArgs: ["--conditions=paperlint-source"] };
    expect(runNode(SCRIPT, [], opts)).toEqual(usage);
    expect(runNode(SCRIPT, [join(dir, "a"), join(dir, "b")], opts)).toEqual(
      usage,
    );
  });
});
