/**
 * Yarn Berry (Plug'n'Play): builds a PnP consumer from this repository's tarball and asks the ONE
 * question that decides whether a resolution-based rewrite would make PnP supportable.
 *
 * It is not "does resolution work under PnP" — it does, inside a process that loaded the PnP
 * runtime. It is whether the path resolution HANDS BACK can be read by the outside process that
 * asked. Under PnP that path points inside a zip, and only PnP's patched `fs` can open it.
 *
 * Needs the network (corepack downloads yarn, yarn downloads the transitive tree).
 *
 * Usage:  node docs/prior-art/repro/claim4-yarn-pnp.mjs [workdir]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const work = process.argv[2] ?? mkdtempSync(join(tmpdir(), "rpp-pnp-"));
mkdirSync(work, { recursive: true });
const env = { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" };

const packed = execFileSync("npm", ["pack", "--silent", "--pack-destination", work], {
  cwd: ROOT,
  encoding: "utf8",
}).trim().split("\n").pop();

const consumer = join(work, "consumer-yarn-pnp");
mkdirSync(consumer, { recursive: true });
writeFileSync(
  join(consumer, "package.json"),
  '{"name":"c-yarn","version":"1.0.0","private":true,"packageManager":"yarn@4.9.2"}',
);
copyFileSync(join(work, packed), join(consumer, "rpp.tgz"));

const yarn = (args) => spawnSync("corepack", ["yarn", ...args], { cwd: consumer, encoding: "utf8", env });
const add = yarn(["add", "./rpp.tgz"]);
if (add.status !== 0) throw new Error(`yarn add failed:\n${add.stdout}${add.stderr}`);
console.log("yarn add: ok");
console.log("node_modules present?", existsSync(join(consumer, "node_modules")) ? "YES" : "NO");

const probe = `
import { createRequire } from "node:module";
const req = createRequire(import.meta.url);
try { console.log("  resolve(pkg/package.json) ->", req.resolve("research-paper-pipeline/package.json")); }
catch (e) { console.log("  resolve FAILS:", e.code, String(e.message).split("\\n")[0]); }
`;
writeFileSync(join(consumer, "probe.mjs"), probe);

console.log("1) plain node, inside the PnP project (no PnP runtime):");
process.stdout.write(spawnSync(process.execPath, ["probe.mjs"], { cwd: consumer, encoding: "utf8" }).stdout ?? "");

console.log("2) yarn node (PnP runtime loaded):");
const withRuntime = yarn(["node", "probe.mjs"]);
process.stdout.write(withRuntime.stdout ?? "");

const resolved = (withRuntime.stdout ?? "").split("->")[1]?.trim();
if (resolved) {
  console.log("3) can the OUTSIDE process read the path PnP handed back?");
  const outside = spawnSync(process.execPath, ["-e", "console.log('   plain node existsSync:', require('node:fs').existsSync(process.argv[1]))", resolved], { encoding: "utf8" });
  process.stdout.write(outside.stdout ?? "");
  const inside = yarn(["node", "-e", "console.log('   yarn node  existsSync:', require('node:fs').existsSync(process.argv[1]))", resolved]);
  process.stdout.write(inside.stdout ?? "");
}
console.log("4) `yarn bin rpp` (the supported way to ask for the bin path):");
process.stdout.write("   " + (yarn(["bin", "rpp"]).stdout ?? ""));
console.log("5) does the CLI itself run under PnP?");
process.stdout.write("   " + ((yarn(["rpp", "--help"]).stdout ?? "").split("\n")[0]) + "\n");
console.log(`(tree kept at ${consumer})`);
