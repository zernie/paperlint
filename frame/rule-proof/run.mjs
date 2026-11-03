// Run linter readings on real repositories with vigiles' experimental_ruleProof: for each repository of
// inputs.json, clone it at its recorded commit, install its own pinned linter (lockfile, no install scripts),
// prove each reading on its planted pair, and list the repository files each proved reading flags.
//
//   node frame/rule-proof/run.mjs <inputs.json> <out-dir> [--only <index>]
//
// inputs.json: [{ id, repo, sha, linter, rule, readings: [{ key, reading, pair }] }]
//   reading: an EslintReading or RuffReading without the version-dependent parts, which are filled here:
//            ESLint `parser` (the repository's own TypeScript parser, when installed); Ruff plugin settings
//            under `lint` from Ruff 0.2 on, at the top level before.
// One JSON file per repository in <out-dir>; nothing from the repository is executed except its linter and the
// plugins its own lockfile installs. Every outcome is written, including "not installed" and "not run".
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { experimental_ruleProof as rp } from "vigiles/rule-proof";

const [inputsPath, outDir, ...rest] = process.argv.slice(2);
const only = rest[0] === "--only" ? Number(rest[1]) : null;
const work = path.resolve(process.env.RUNNER_TEMP ?? "/tmp", "rule-proof-work");
const cacheDir = path.join(work, "cache");

const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], timeout: 300_000 }).toString();

export function clone(repo, sha, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  git(dir, "remote", "add", "origin", `https://github.com/${repo}.git`);
  git(dir, "fetch", "-q", "--depth", "1", "origin", sha);
  git(dir, "checkout", "-q", "FETCH_HEAD");
  return git(dir, "rev-parse", "HEAD").trim();
}

const versionAtLeast = (v, [maj, min]) => {
  const [a, b] = v.split(".").map(Number);
  return a > maj || (a === maj && b >= min);
};

// Ruff: `line-length` style keys stay at the top; a dotted plugin key ("flake8-tidy-imports.banned-api") becomes a
// nested table, under `lint` when the pinned Ruff reads it there (0.2 and later).
export function ruffSettings(flat, version) {
  const out = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split(".");
    if (parts.length === 1 && !/^(flake8-|pycodestyle|pyflakes|isort|pydocstyle|pylint)/.test(key)) { out[key] = value; continue; }
    const target = versionAtLeast(version, [0, 2]) ? ((out.lint ??= {})) : out;
    let node = target;
    for (const p of parts.slice(0, -1)) node = node[p] ??= {};
    node[parts.at(-1)] = value;
  }
  return out;
}

export function finish(reading, pinned) {
  if (reading.linter === "ruff") return { ...reading, settings: ruffSettings(reading.settings, pinned.version) };
  const ts = ["@typescript-eslint/parser", "typescript-eslint"].find((p) => existsSync(path.join(pinned.dir, "node_modules", p, "package.json")));
  return ts ? { ...reading, parser: ts === "typescript-eslint" ? "typescript-eslint/parser" : ts } : reading;
}

function runOne(item) {
  const dir = path.join(work, "repo");
  const t0 = Date.now();
  const result = { id: item.id, repo: item.repo, sha: item.sha, linter: item.linter, rule: item.rule };
  try {
    result.checked_out = clone(item.repo, item.sha, dir);
  } catch (e) {
    return { ...result, clone: { kind: "failed", reason: String(e.stderr ?? e.message).slice(0, 500) } };
  }
  const installed = rp.install(item.linter, dir, { cacheDir });
  if (installed.kind !== "installed") return { ...result, install: installed, seconds: (Date.now() - t0) / 1000 };
  const pinned = installed.linter;
  result.install = { kind: "installed", version: pinned.version };
  result.readings = item.readings.map(({ key, reading, pair }) => {
    const full = finish(reading, pinned);
    const proof = rp.prove(pinned, full, pair);
    if (proof.kind !== "proved") return { key, reading: full, proof };
    const flagged = rp.flagged(proof.reading);
    return { key, reading: full, proof: { kind: "proved" }, flagged };
  });
  result.seconds = (Date.now() - t0) / 1000;
  rmSync(dir, { recursive: true, force: true });
  return result;
}

if (inputsPath) {
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  const items = JSON.parse(readFileSync(inputsPath, "utf8"));
  for (const [i, item] of items.entries()) {
    if (only !== null && i !== only) continue;
    const out = path.join(outDir, `${item.id}.json`);
    if (existsSync(out)) { console.log(`skip ${item.id} (done)`); continue; }
    const r = runOne(item);
    writeFileSync(out, JSON.stringify(r, null, 1) + "\n");
    const proved = (r.readings ?? []).filter((x) => x.proof.kind === "proved").length;
    console.log(`${item.id} ${item.repo}: install ${r.install?.kind ?? r.clone?.kind} ${r.install?.version ?? ""}, ` +
      `proved ${proved}/${item.readings.length}, ${r.seconds ?? "-"} s`);
  }
}
