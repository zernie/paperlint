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
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

// The package an ESLint rule id needs, by ESLint's naming convention.
export function pluginOf(rule) {
  if (!rule.includes("/")) return null;
  const prefix = rule.slice(0, rule.lastIndexOf("/"));
  if (prefix.startsWith("@")) return prefix.includes("/") ? `${prefix.split("/")[0]}/eslint-plugin-${prefix.split("/")[1]}` : `${prefix}/eslint-plugin`;
  return `eslint-plugin-${prefix}`;
}

// pnpm keeps transitive packages out of the top of node_modules; it keeps them in node_modules/.pnpm/node_modules.
// A package the repository's own install has there is linked to the top, unchanged. Returns true when it linked.
export function expose(dir, pkg) {
  const top = path.join(dir, "node_modules", pkg);
  if (existsSync(path.join(top, "package.json"))) return false;
  const hidden = path.join(dir, "node_modules", ".pnpm", "node_modules", pkg);
  if (!existsSync(path.join(hidden, "package.json"))) return false;
  mkdirSync(path.dirname(top), { recursive: true });
  symlinkSync(realpathSync(hidden), top, "dir");
  return true;
}

// Ordered pairs (i, j), i != j, of proved readings that both carry a planted pair: who runs on whose violation.
export function crossPlan(readings) {
  const ok = readings.map((r, i) => (r.proved && r.pair ? i : -1)).filter((i) => i >= 0);
  return ok.flatMap((i) => ok.filter((j) => j !== i).map((j) => [i, j]));
}

export function finish(reading, pinned, adjustments) {
  if (reading.linter === "ruff") return { ...reading, settings: ruffSettings(reading.settings, pinned.version) };
  const plugin = pluginOf(reading.rule);
  if (plugin && expose(pinned.dir, plugin)) adjustments.add("pnpm-exposed");
  const ts = reading.rule.startsWith("@typescript-eslint/") || existsSync(path.join(pinned.dir, "tsconfig.json"));
  if (ts && expose(pinned.dir, "@typescript-eslint/parser")) adjustments.add("pnpm-exposed");
  return existsSync(path.join(pinned.dir, "node_modules", "@typescript-eslint/parser", "package.json"))
    ? { ...reading, parser: "@typescript-eslint/parser" } : reading;
}

// Ruff with no pin: the latest release uploaded to PyPI before the commit (DESIGN.md §9.8), not a pre-release.
export function dateMatched(releases, commitIso) {
  const at = Date.parse(commitIso);
  const ok = Object.entries(releases)
    .filter(([v, files]) => /^\d+\.\d+\.\d+$/.test(v) && files.length > 0 && Math.min(...files.map((f) => Date.parse(f.upload_time_iso_8601))) <= at)
    .map(([v]) => v.split(".").map(Number));
  ok.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  return ok.length ? ok.at(-1).join(".") : null;
}

async function ruffReleases() {
  const r = await fetch("https://pypi.org/pypi/ruff/json");
  return (await r.json()).releases;
}

async function runOne(item) {
  const dir = path.join(work, "repo");
  const t0 = Date.now();
  const adjustments = new Set();
  const result = { id: item.id, repo: item.repo, sha: item.sha, linter: item.linter, rule: item.rule };
  try {
    result.checked_out = clone(item.repo, item.sha, dir);
  } catch (e) {
    return { ...result, clone: { kind: "failed", reason: String(e.stderr ?? e.message).slice(0, 500) } };
  }
  let installed = rp.install(item.linter, dir, { cacheDir });
  if (installed.kind !== "installed" && item.linter === "ruff" && installed.stage === "no-pin") {
    const commitIso = git(dir, "log", "-1", "--format=%cI").trim();
    const version = dateMatched(await ruffReleases(), commitIso);
    result.as_designed_install = installed;
    if (version) {
      writeFileSync(path.join(dir, "requirements-date-matched-ruff.txt"), `ruff==${version}\n`);
      adjustments.add("date-matched-version");
      result.date_matched = { commit: commitIso, ruff: version };
      installed = rp.install(item.linter, dir, { cacheDir });
    }
  }
  if (installed.kind !== "installed") return { ...result, install: installed, adjustments: [...adjustments], seconds: (Date.now() - t0) / 1000 };
  const pinned = installed.linter;
  result.install = { kind: "installed", version: pinned.version };
  const fulls = [];
  result.readings = item.readings.map(({ key, reading, pair }) => {
    const full = finish(reading, pinned, adjustments);
    fulls.push(full);
    const proof = rp.prove(pinned, full, pair);
    if (proof.kind !== "proved") return { key, reading: full, proof };
    const flagged = rp.flagged(proof.reading);
    return { key, reading: full, proof: { kind: "proved" }, flagged };
  });
  if (item.cross) {
    // Cross-example check: each proved reading A on every other proved reading B's planted violation, judged with
    // A's own quiet twin, so `proved` = A flags B's violation; `not-proved` with badHits 0 = A passes it; a not-run
    // stage (e.g. pair-outside-scope: B's file lies outside A's scope) is kept as it is.
    result.cross = crossPlan(result.readings.map((r, i) => ({ proved: r.proof.kind === "proved", pair: item.readings[i].pair })))
      .map(([i, j]) => {
        const p = rp.prove(pinned, fulls[i], { bad: item.readings[j].pair.bad, good: item.readings[i].pair.good });
        return { a: item.readings[i].key, b: item.readings[j].key, kind: p.kind, badHits: p.badHits, goodHits: p.goodHits,
          stage: p.stage, reason: p.reason?.slice(0, 300) };
      });
  }
  result.adjustments = [...adjustments];
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
    const r = await runOne(item);
    writeFileSync(out, JSON.stringify(r, null, 1) + "\n");
    const proved = (r.readings ?? []).filter((x) => x.proof.kind === "proved").length;
    console.log(`${item.id} ${item.repo}: install ${r.install?.kind ?? r.clone?.kind} ${r.install?.version ?? ""}, ` +
      `proved ${proved}/${item.readings.length}, ${r.seconds ?? "-"} s`);
  }
}
