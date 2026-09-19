/**
 * Builds the consumer trees the CLAIM 4/5 probes measure: `npm pack` this repository once, then
 * install the SAME tarball into a clean project with npm and with pnpm.
 *
 * Kept separate from the probes on purpose. The probes are the files that produced the numbers in
 * `../package-location.md` and must stay byte-identical to what was run; this one only makes a
 * tree for them to look at, so it may be re-run freely.
 *
 * Usage:  node docs/prior-art/repro/claim4-setup-consumers.mjs [workdir]
 * Prints the two consumer directories, one per line, in the order npm, pnpm.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const work = process.argv[2] ?? mkdtempSync(join(tmpdir(), "rpp-location-"));
mkdirSync(work, { recursive: true });

const packed = execFileSync("npm", ["pack", "--silent", "--pack-destination", work], {
  cwd: ROOT,
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .pop();
const tgz = join(work, packed);
if (!existsSync(tgz)) throw new Error(`npm pack left no tarball: ${tgz}`);

const out = [];
for (const [manager, args] of [
  ["npm", ["install", "--silent", tgz]],
  ["pnpm", ["install", "--silent", tgz]],
]) {
  const consumer = join(work, `consumer-${manager}`);
  rmSync(consumer, { recursive: true, force: true });
  mkdirSync(consumer, { recursive: true });
  writeFileSync(join(consumer, "package.json"), '{"name":"c","version":"1.0.0","private":true}');
  const r = spawnSync(manager, args, { cwd: consumer, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${manager} install failed:\n${r.stderr ?? ""}${r.stdout ?? ""}`);
  out.push(consumer);
}
console.log(out.join("\n"));
