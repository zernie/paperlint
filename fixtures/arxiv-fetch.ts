/**
 * Maintenance helper, not run by any test and not an npm script: re-download the exact arXiv
 * sources named in `arxiv-manifest.json` (the papers of `arxiv-papers/` and `arxiv-papers-extra/`)
 * and check each against its recorded sha256 — the provenance of the fixtures.
 *
 *   node --experimental-strip-types fixtures/arxiv-fetch.ts [outDir]
 *
 * Writes `<outDir>/<id>.bin` (default `./arxiv-sources`), 3 s apart, as arXiv asks. Exits 1 if any
 * download fails or its hash differs from the manifest.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const Manifest = z.array(
  z.object({
    arxiv_id: z.string(),
    source_sha256: z.string(),
  }),
);

const HERE = dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] ?? "arxiv-sources";
const manifest = Manifest.parse(
  JSON.parse(readFileSync(join(HERE, "arxiv-manifest.json"), "utf8")),
);
const sleep = (ms: number): Promise<void> =>
  new Promise((done) => setTimeout(done, ms));

mkdirSync(outDir, { recursive: true });
const failures: string[] = [];
for (const { arxiv_id, source_sha256 } of manifest) {
  const res = await fetch(`https://arxiv.org/src/${arxiv_id}`, {
    headers: {
      "user-agent": "paperlint-fixtures/1.0 (+https://github.com/zernie/paperlint)",
    },
  });
  const bytes = new Uint8Array(await res.arrayBuffer());
  const got = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(join(outDir, `${arxiv_id}.bin`), bytes);
  if (!res.ok || got !== source_sha256) failures.push(arxiv_id);
  console.log(`${arxiv_id} ${got === source_sha256 ? "ok" : "MISMATCH"}`);
  await sleep(3000);
}
if (failures.length > 0) {
  console.error(`failed: ${failures.join(" ")}`);
  process.exit(1);
}
