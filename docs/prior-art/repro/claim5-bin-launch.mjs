/**
 * How the installed bin can be launched, and what each way costs. Four ways against one consumer:
 * the `.bin` shim the manager wrote, `node <shim>`, `node <the real file named by `bin` in the
 * resolved manifest>`, and `npx --no-install`.
 *
 * The point of the third row is that the manifest's `bin` value is the REAL file under every
 * manager, so `node <it>` works where `node <shim>` does not.
 *
 * Usage:  node docs/prior-art/repro/claim5-bin-launch.mjs <consumer-dir>
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const consumer = process.argv[2];
const from = createRequire(pathToFileURL(join(consumer, "__placeholder__.js")).href);
const manifestPath = from.resolve("research-paper-pipeline/package.json");
const installed = dirname(manifestPath);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const realBin = join(installed, typeof manifest.bin === "string" ? manifest.bin : manifest.bin.rpp);
const shim = join(consumer, "node_modules", ".bin", "rpp");

const time = (label, cmd, args) => {
  const t = Date.now();
  const r = spawnSync(cmd, args, { cwd: consumer, encoding: "utf8" });
  const ms = Date.now() - t;
  const status = r.error ? `ERR ${r.error.code}` : String(r.status);
  const first = ((r.stdout ?? "") + (r.stderr ?? "")).split("\n").find((l) => l.trim()) ?? "";
  console.log(`  ${label.padEnd(34)} rc=${status.padEnd(4)} ${String(ms).padStart(5)}ms  ${first.slice(0, 70)}`);
};

console.log("installed:", installed);
console.log("real bin :", realBin);
time("<.bin shim> --help", shim, ["--help"]);
time("node <.bin shim> --help", process.execPath, [shim, "--help"]);
time("node <manifest bin> --help", process.execPath, [realBin, "--help"]);
time("npx --no-install rpp --help", "npx", ["--no-install", "rpp", "--help"]);
