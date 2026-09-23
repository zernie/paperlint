// Drop-in replacement for the three hardcodes, exercised against a real consumer.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const consumer = process.argv[2];
const NAME = "research-paper-pipeline";

// ONE anchor, ESLint's __placeholder__.js trick: a file that need not exist.
const from = createRequire(pathToFileURL(join(consumer, "__placeholder__.js")).href);
const manifestPath = from.resolve(`${NAME}/package.json`);
const installed = dirname(manifestPath);                      // replaces line 172
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const binRel = typeof manifest.bin === "string" ? manifest.bin : manifest.bin.rpp;
const bin = join(installed, binRel);                          // replaces line 276

console.log("installed :", installed);
console.log("bin       :", bin, existsSync(bin) ? "" : "MISSING");

// (a) hooks.json from the resolved tree (replaces line 135)
const hj = join(installed, "plugin", "hooks", "hooks.json");
console.log("hooks.json:", existsSync(hj) ? "found" : "ABSENT");

// (b) the bin runs — via node <resolved real file>, no .bin shim
const r = spawnSync(process.execPath, [bin, "--help"], { cwd: consumer, encoding: "utf8" });
console.log("node <bin> --help  ->", r.status, (r.stdout||"").split("\n")[0]);

// (c) and via the .bin shim, which is what npm/pnpm actually create
const shim = join(consumer, "node_modules", ".bin", "rpp");
const r2 = spawnSync(shim, ["--help"], { cwd: consumer, encoding: "utf8" });
console.log(".bin shim --help   ->", r2.status ?? `ERR ${r2.error?.code}`);
