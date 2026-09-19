/**
 * The mutation that decides whether replacing the `node_modules/<name>` hardcode with resolution
 * buys anything MEASURABLE, rather than only looking tidier.
 *
 * It copies an installed consumer, adds a CLOSED `exports` map to the installed package's manifest
 * — one that omits `./bin/rpp.mjs` and `./package.json` — and then asks four questions of the same
 * broken tree. The hardcode's answers do not change; the documented public import breaks.
 *
 * Usage:  node docs/prior-art/repro/claim5-exports-mutation.mjs <consumer-dir>
 */
import { cpSync, rmSync, readFileSync, writeFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import module from "node:module";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const src = process.argv[2];
const mut = mkdtempSync(join(tmpdir(), "rpp-mutation-"));
rmSync(mut, { recursive: true, force: true });
cpSync(src, mut, { recursive: true, verbatimSymlinks: true });

const manifest = join(mut, "node_modules", "research-paper-pipeline", "package.json");
const json = JSON.parse(readFileSync(manifest, "utf8"));
json.exports = { ".": "./bin/rpp.mjs" };
writeFileSync(manifest, JSON.stringify(json, null, 2));
console.log(`MUTATION applied: exports = ${JSON.stringify(json.exports)} (no ./package.json, no ./bin/rpp.mjs)`);

const dir = join(mut, "node_modules", "research-paper-pipeline");
console.log("1) the HARDCODE still sees everything:");
console.log("   dir exists          :", existsSync(dir));
console.log("   plugin/hooks/h.json :", existsSync(join(dir, "plugin", "hooks", "hooks.json")));
console.log("   skills/             :", existsSync(join(dir, "skills")));

console.log("2) the documented public import is BROKEN:");
const r = spawnSync(
  process.execPath,
  ["--input-type=module", "-e", 'import("research-paper-pipeline/bin/rpp.mjs").then(()=>console.log("   import OK")).catch(e=>console.log("   import FAILS:",e.code,String(e.message).split("\\n")[0]))'],
  { cwd: mut, encoding: "utf8" },
);
process.stdout.write(r.stdout ?? "");

console.log("3) resolution-based location reports it:");
try {
  console.log("   resolve pkg/package.json ->", createRequire(pathToFileURL(join(mut, "__placeholder__.js")).href).resolve("research-paper-pipeline/package.json"));
} catch (e) {
  console.log("   resolve FAILS:", e.code, String(e.message).split("\n")[0]);
}

console.log("4) node:module.findPackageJSON, same mutation:");
try {
  console.log("   findPackageJSON ->", module.findPackageJSON("research-paper-pipeline", join(mut, "__placeholder__.js")));
} catch (e) {
  console.log("   FAILS:", e.code);
}
console.log(`(tree kept at ${mut})`);
